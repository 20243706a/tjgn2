const express = require('express'), http = require('http'), path = require('path'), crypto = require('crypto');
const { Server } = require('socket.io');
const app = express(), srv = http.createServer(app);
const io = new Server(srv, { maxHttpBufferSize: 7e6 });
const PUB = path.join(__dirname, 'public');

// ---- 경로: / (안내) · /main (메인 기기) · /sub, /sub/1234 (보조 기기)
app.get('/', (q, r) => r.sendFile(path.join(PUB, 'index.html')));
app.get('/main', (q, r) => r.sendFile(path.join(PUB, 'main.html')));
app.get(['/sub', '/sub/:code'], (q, r) => r.sendFile(path.join(PUB, 'sub.html')));
app.get('/health', (q, r) => r.send('ok'));
app.use(express.static(PUB, { index: false }));

const P = ['view', 'control', 'pointer', 'chat', 'draw', 'file'];
const PRESET = { viewer: ['view'], operator: ['view', 'control', 'pointer', 'chat'], admin: P };
const grant = a => Object.fromEntries(a.map(k => [k, {}]));
const rooms = new Map(), now = () => Date.now();
const newCode = () => { let c; do c = String(Math.floor(1000 + Math.random() * 9000)); while (rooms.has(c)); return c; };
const mk = () => { const code = newCode(); const r = { code, key: crypto.randomBytes(12).toString('hex'), hostSid: null, devs: new Map(), locked: false, paused: false, auto: false, slide: 1, strokes: [], chat: [], files: [], log: [], last: now() }; rooms.set(code, r); return r; };
const log = (r, t) => { r.log.unshift(new Date().toLocaleTimeString('ko-KR') + ' ' + t); r.log.length = Math.min(r.log.length, 60); };

function has(r, d, k) {
  if (d.status !== 'ok' || r.locked || r.paused) return false;
  const p = d.perms[k]; if (!p) return false;
  if (p.until && p.until < now()) { delete d.perms[k]; return false; }
  return true;
}
function use(r, d, k) { if (!has(r, d, k)) return false; if (d.perms[k].once) delete d.perms[k]; return true; }

function snap(r, host, d) {
  const b = { code: r.code, locked: r.locked, paused: r.paused, auto: r.auto, t: now() };
  const fl = () => r.files.map(f => ({ id: f.id, name: f.name, size: f.size, from: f.from }));
  if (host) return { ...b, host: true, slide: r.slide, strokes: r.strokes, chat: r.chat, files: fl(), log: r.log,
    devs: [...r.devs.values()].map(x => ({ id: x.id, name: x.name, status: x.status, perms: x.perms, online: !!x.sid, ask: x.ask })) };
  const o = { ...b, me: { id: d.id, name: d.name, status: d.status, perms: d.perms, ask: d.ask } };
  if (has(r, d, 'view')) Object.assign(o, { slide: r.slide, strokes: r.strokes, chat: r.chat, files: fl() });
  return o;
}
function sync(r) {
  if (r.hostSid) io.to(r.hostSid).emit('state', snap(r, true));
  for (const d of r.devs.values()) if (d.sid) io.to(d.sid).emit('state', snap(r, false, d));
}
const viewers = r => [r.hostSid, ...[...r.devs.values()].filter(d => d.sid && has(r, d, 'view')).map(d => d.sid)].filter(Boolean);
const cast = (r, ev, data) => viewers(r).forEach(s => io.to(s).emit(ev, data));

io.on('connection', s => {
  let r = null, d = null, isHost = false;
  const guard = k => {
    if (!r || !d) return false;
    if (use(r, d, k)) return true;
    s.emit('denied', k); log(r, `${d.name}: ${k} 시도 차단`); sync(r); return false;
  };

  s.on('host:create', (_, cb) => { r = mk(); r.hostSid = s.id; isHost = true; cb({ code: r.code, key: r.key }); sync(r); });
  s.on('host:resume', ({ code, key } = {}, cb) => {
    const x = rooms.get(String(code)); if (!x || x.key !== key) return cb({ err: 1 });
    r = x; r.hostSid = s.id; isHost = true; cb({ code: r.code, key: r.key }); sync(r);
  });

  s.on('sub:join', ({ code, name, id } = {}, cb) => {
    const x = rooms.get(String(code)); if (!x) return cb({ err: '코드가 올바르지 않아요.' });
    id = String(id || ''); if (!/^[\w-]{1,20}$/.test(id)) return cb({ err: '잘못된 기기 ID' });
    let dev = x.devs.get(id);
    if (dev && dev.status === 'banned') return cb({ err: '차단된 기기예요.' });
    if (!dev) { dev = { id, name: String(name || '보조 기기').slice(0, 20), status: x.auto ? 'ok' : 'pending', perms: {}, ask: null }; if (x.auto) dev.perms = grant(PRESET.viewer); x.devs.set(id, dev); log(x, dev.name + ' 입장 요청'); }
    else if (dev.status === 'kicked') { dev.status = x.auto ? 'ok' : 'pending'; if (x.auto) dev.perms = grant(PRESET.viewer); log(x, dev.name + ' 재입장 요청'); }
    dev.sid = s.id; r = x; d = dev; cb({ ok: 1 }); sync(r);
  });

  // ---------- 메인(호스트) 명령 ----------
  s.on('h', a => {
    if (!isHost || !r || !a) return;
    const t = r.devs.get(a.id);
    switch (a.type) {
      case 'approve': if (t) { t.status = 'ok'; t.perms = grant(PRESET[a.role] || PRESET.viewer); log(r, t.name + ' 승인'); } break;
      case 'deny': case 'kick': if (t) { t.status = 'kicked'; t.perms = {}; t.ask = null; log(r, t.name + (a.type === 'kick' ? ' 강제 퇴장' : ' 거절')); } break;
      case 'ban': if (t) { t.status = 'banned'; t.perms = {}; log(r, t.name + ' 차단'); } break;
      case 'unban': if (t && t.status === 'banned') { t.status = 'kicked'; log(r, t.name + ' 차단 해제'); } break;
      case 'perm': if (t && P.includes(a.k)) {
        if (a.on) { const p = {}; if (+a.min > 0) p.until = now() + Math.min(+a.min, 1440) * 60000; if (a.once) p.once = true; t.perms[a.k] = p; if (t.ask === a.k) t.ask = null; log(r, `${t.name}: ${a.k} 허용${p.until ? ' (' + a.min + '분)' : ''}${p.once ? ' (1회)' : ''}`); }
        else { delete t.perms[a.k]; log(r, `${t.name}: ${a.k} 회수`); } } break;
      case 'denyask': if (t) t.ask = null; break;
      case 'preset': if (t && PRESET[a.role]) { t.perms = grant(PRESET[a.role]); log(r, `${t.name}: 역할 ${a.role}`); } break;
      case 'rename': if (t) t.name = String(a.name || '').slice(0, 20) || t.name; break;
      case 'lock': r.locked = !r.locked; log(r, r.locked ? '긴급 잠금' : '잠금 해제'); break;
      case 'pause': r.paused = !r.paused; log(r, r.paused ? '전체 일시정지' : '일시정지 해제'); break;
      case 'auto': r.auto = !r.auto; log(r, '자동 승인 ' + (r.auto ? 'ON' : 'OFF')); break;
      case 'newcode': { rooms.delete(r.code); r.code = newCode(); rooms.set(r.code, r); log(r, '입장 코드 재발급'); s.emit('newcode', { code: r.code, key: r.key }); break; }
      case 'slide': r.slide = Math.max(1, Math.floor(+a.n) || 1); break;
      case 'clear': r.strokes = []; break;
      case 'clearchat': r.chat = []; break;
      case 'delfile': r.files = r.files.filter(f => f.id !== a.fid); break;
      case 'close': for (const x of r.devs.values()) if (x.sid) io.to(x.sid).emit('closed'); rooms.delete(r.code); r = null; return;
    }
    sync(r);
  });
  s.on('h:chat', t => { if (!isHost || !r) return; r.chat.push({ n: '메인', t: String(t).slice(0, 200), ts: now() }); r.chat = r.chat.slice(-100); sync(r); });
  s.on('h:stroke', st => { if (!isHost || !r || !okStroke(st)) return; r.strokes.push(st); r.strokes = r.strokes.slice(-300); cast(r, 'stroke', st); });
  s.on('h:file', (fid, cb) => { const f = isHost && r && r.files.find(x => x.id === fid); cb(f ? { name: f.name, data: f.data } : null); });

  // ---------- 보조 기기 동작 (전부 서버가 권한 검사) ----------
  s.on('a:ctl', a => {
    if (!guard('control')) return;
    if (a === 'next') r.slide++; else if (a === 'prev') r.slide = Math.max(1, r.slide - 1); else if (a === 'reset') r.slide = 1;
    log(r, `${d.name} → 슬라이드 ${a}`); sync(r);
  });
  s.on('a:ptr', p => {
    if (!r || !d || !has(r, d, 'pointer') || !p) return;
    cast(r, 'ptr', { id: d.id, n: d.name, x: Math.min(1, Math.max(0, +p.x || 0)), y: Math.min(1, Math.max(0, +p.y || 0)) });
  });
  s.on('a:stroke', st => {
    if (!r || !d || !okStroke(st)) return;
    const once = d.perms.draw && d.perms.draw.once;
    if (!guard('draw')) return;
    r.strokes.push(st); r.strokes = r.strokes.slice(-300); cast(r, 'stroke', st); if (once) sync(r);
  });
  s.on('a:chat', t => { if (typeof t !== 'string' || !guard('chat')) return; r.chat.push({ n: d.name, t: t.slice(0, 200), ts: now() }); r.chat = r.chat.slice(-100); sync(r); });
  s.on('a:file', f => {
    if (!f || typeof f.data !== 'string' || f.data.length > 6.5e6 || !guard('file')) return;
    r.files.push({ id: crypto.randomBytes(5).toString('hex'), name: String(f.name || 'file').slice(0, 60), size: +f.size || 0, from: d.name, data: f.data });
    r.files = r.files.slice(-10); log(r, `${d.name} 파일 전송: ${String(f.name).slice(0, 30)}`); sync(r);
  });
  s.on('a:ask', k => { if (!r || !d || d.status !== 'ok' || !P.includes(k)) return; d.ask = k; log(r, `${d.name}: ${k} 권한 요청`); sync(r); });

  s.on('disconnect', () => { if (isHost && r) r.hostSid = null; if (d && d.sid === s.id) d.sid = null; if (r) { r.last = now(); sync(r); } });
});

function okStroke(st) {
  return st && typeof st.c === 'string' && /^#[0-9a-f]{6}$/i.test(st.c) && Array.isArray(st.p) && st.p.length > 1 && st.p.length < 800 &&
    st.p.every(q => Array.isArray(q) && q.length === 2 && q.every(n => typeof n === 'number' && n >= 0 && n <= 1));
}

// 권한 시간 만료 + 오래된 방 정리
setInterval(() => {
  for (const [c, r] of rooms) {
    let ch = false;
    for (const d of r.devs.values()) for (const [k, p] of Object.entries(d.perms)) if (p.until && p.until < now()) { delete d.perms[k]; ch = true; log(r, `${d.name}: ${k} 시간 만료`); }
    if (ch) sync(r);
    if (!r.hostSid && now() - r.last > 6 * 3600e3) rooms.delete(c);
  }
}, 1000);

srv.listen(process.env.PORT || 3000, () => console.log('listening on', process.env.PORT || 3000));
