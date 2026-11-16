const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const KEY = process.env.ADMIN_KEY || '';          // 설정하면 ?role=admin&key=... 필요
const page = path.join(__dirname, 'public', 'index.html');

const srv = http.createServer((q, r) => {
  if (q.url === '/healthz') return r.end('ok');
  fs.readFile(page, (e, d) => {
    r.writeHead(e ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
    r.end(d || 'error');
  });
});
const wss = new WebSocketServer({ server: srv });

let state = { feats: { question: false, camera: false, tcam: false, chat: false }, prompt: '오늘 기분이 어떤가요?' };
const hist = [], socks = new Map();
let nid = 1;
const send = (ws, m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
const toRole = (role, m) => socks.forEach(w => w.role === role && send(w, m));
const all = m => socks.forEach(w => send(w, m));

wss.on('connection', (ws, req) => {
  const u = new URL(req.url, 'http://x');
  const role = u.searchParams.get('role') === 'admin' ? 'admin' : 'client';
  if (role === 'admin' && KEY && u.searchParams.get('key') !== KEY) return ws.close(4001, 'bad key');
  ws.id = String(nid++); ws.role = role; socks.set(ws.id, ws);
  send(ws, { t: 'hello', id: ws.id, state, hist });
  toRole('admin', { t: 'joined', id: ws.id, role });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    m.from = ws.id;
    if (m.t === 'state' && role === 'admin') {
      state = { feats: m.feats, prompt: String(m.prompt || '').slice(0, 200) };
      return toRole('client', { t: 'state', state });
    }
    if (m.t === 'popup' && role === 'admin') return toRole('client', m);
    if (m.t === 'typing' && role === 'client') return toRole('admin', m);
    if (m.t === 'clear' && role === 'admin' && ['answers', 'chat', 'all'].includes(m.what)) {
      if (m.what !== 'answers') hist.length = 0;
      return all({ t: 'clear', what: m.what });
    }
    if (m.t === 'chat') {
      m.text = String(m.text || '').slice(0, 500); m.role = role;
      hist.push(m); if (hist.length > 50) hist.shift();
      return all(m);
    }
    if (m.t === 'rtc') {                           // WebRTC 신호 중계
      if (m.to === 'admin') return toRole('admin', m);
      if (m.to === 'client') return toRole('client', m);
      const to = socks.get(m.to); if (to) send(to, m);
    }
  });
  ws.on('close', () => { socks.delete(ws.id); toRole('admin', { t: 'left', id: ws.id }); });
});
srv.listen(PORT, () => console.log('listening on', PORT));
