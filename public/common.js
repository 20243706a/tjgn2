const PL={view:'화면 보기',control:'버튼 조작',pointer:'레이저 포인터',chat:'채팅',draw:'그리기',file:'파일 전송'};
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
function paint(cv,strokes){const g=cv.getContext('2d'),W=cv.width,H=cv.height;g.clearRect(0,0,W,H);g.lineWidth=3;g.lineCap='round';
 for(const s of strokes){g.strokeStyle=s.c;g.beginPath();s.p.forEach((q,i)=>i?g.lineTo(q[0]*W,q[1]*H):g.moveTo(q[0]*W,q[1]*H));g.stroke();}}
// 무대(슬라이드+그림판+레이저). o: {mode(),color(),stroke(s),ptr(p),can()} 있으면 보조/메인이 직접 입력 가능
function mountStage(el,o){
 el.innerHTML='<div class="stg"><div class="sl"></div><canvas width="640" height="360"></canvas><div class="dots"></div></div>';
 const cv=el.querySelector('canvas'),sl=el.querySelector('.sl'),dots=el.querySelector('.dots'),dt={};let strokes=[],cur=null,lp=0;
 const pos=e=>{const b=cv.getBoundingClientRect();return [Math.min(1,Math.max(0,(e.clientX-b.left)/b.width)),Math.min(1,Math.max(0,(e.clientY-b.top)/b.height))]};
 if(o){cv.style.touchAction='none';
  cv.onpointerdown=e=>{if(o.mode()==='draw'&&o.can('draw')){cur={c:o.color(),p:[pos(e)]};cv.setPointerCapture(e.pointerId)}};
  cv.onpointermove=e=>{const p=pos(e);
   if(cur){cur.p.push(p);paint(cv,strokes.concat([cur]))}
   else if(o.mode()==='ptr'&&o.can('pointer')&&Date.now()-lp>60){lp=Date.now();o.ptr({x:p[0],y:p[1]})}};
  cv.onpointerup=()=>{if(cur&&cur.p.length>1)o.stroke(cur);cur=null;paint(cv,strokes)}}
 return{set(st){sl.textContent=st.slide;strokes=st.strokes||[];paint(cv,strokes)},
  add(s){strokes.push(s);paint(cv,strokes)},
  ptr(p){let d=dt[p.id];if(!d){d=dt[p.id]=document.createElement('div');d.className='dot';d.innerHTML='<span></span>';dots.appendChild(d)}
   d.firstChild.textContent=p.n;d.style.left=p.x*100+'%';d.style.top=p.y*100+'%';clearTimeout(d.t);d.t=setTimeout(()=>{d.remove();delete dt[p.id]},1500)}};
}
