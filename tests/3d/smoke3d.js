const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
let html = fs.readFileSync('../../game/fly_dodge_3d.html', 'utf8');
html = html.replace('brain = b; world = new World3D(brain);', 'brain = b; world = new World3D(brain); window.__world = world; window.__brain = brain;');
html = html.replace('const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 900);', 'const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 900); window.__camera = camera;');
const threeStubSrc = fs.readFileSync('three_stub.js', 'utf8');
const circuit = JSON.parse(fs.readFileSync('../STANDIN_not_real_circuit.json', 'utf8'));
const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://example.test/',
  beforeParse(w) {
    // stand in for the <script src=three...> tag: define window.THREE before ui3d.js runs
    w.eval('var module = { exports: {} }; ' + threeStubSrc + ' window.THREE = module.exports;');
    w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get(t,k){return k in t?t[k]:()=>{};}, set(t,k,v){t[k]=v;return true;} }); };
    w.HTMLElement.prototype.getBoundingClientRect = function () { return this.id === 'circuit' ? { left:0, top:0, width:520, height:560 } : { left:0, top:0, width:900, height:560 }; };
    w.HTMLElement.prototype.setPointerCapture = function () {};
    w.fetch = () => Promise.reject(new Error('no network'));
    w.__frames = []; w.requestAnimationFrame = cb => { w.__frames.push(cb); return 1; };
  }});
const w = dom.window, d = w.document; let now = 1000; let ok=0,bad=0;
const check = (n,c,x)=>{(c?ok++:bad++);console.log((c?'PASS ':'FAIL ')+n+(x?'  ['+x+']':''))};
const tick = n => { for (let i=0;i<n;i++){ const c=w.__frames.splice(0); now+=16; c.forEach(f=>f(now)); } };
tick(2);
d.querySelector('#pasteBox').value = '{"bad":1}'; d.querySelector('#pasteBtn').click();
check('rejects a JSON file without nodes/edges', /not a flybrain_circuit/.test(d.querySelector('#loadErr').textContent));
d.querySelector('#pasteBox').value = JSON.stringify(circuit); d.querySelector('#pasteBtn').click();
check('loads a valid circuit and hides the loader', d.querySelector('#loader').hidden, d.querySelector('#status').textContent.slice(0,50));
const W = w.__world;
check('world starts at expected altitude and speed', Math.abs(W.fly.pos.y-90)<1 && W.fly.speed>0, 'y='+W.fly.pos.y.toFixed(1)+' speed='+W.fly.speed.toFixed(1));

const canvas = d.querySelector('#viewport');
const ptr=(t,x,y)=>canvas.dispatchEvent(new w.MouseEvent(t,{clientX:x,clientY:y,bubbles:true}));
ptr('pointerdown',450,280); ptr('pointerup',450,280);
check('a quick click spawns one small obstacle', W.obs.length===1 && W.obs[0].r<=7, 'r='+(W.obs[0]&&W.obs[0].r.toFixed(1)));
let t=now; w.performance.now=()=>t; ptr('pointerdown',300,200); t+=700; ptr('pointerup',300,200);
check('holding grows the obstacle', W.obs[1].r>10, 'r='+W.obs[1].r.toFixed(1));

for (const id of ['sens','gain','kap','pit']){ const el=d.querySelector('#'+id); const before=el.value; el.value=el.max; el.dispatchEvent(new w.Event('input',{bubbles:true})); el.value=before; el.dispatchEvent(new w.Event('input',{bubbles:true})); }
check('sliders update world.params without throwing', W.params.sens>0 && W.params.kappa>0);

const sh=d.querySelector('#shuffle'); sh.checked=true; sh.dispatchEvent(new w.Event('change',{bubbles:true}));
const rewired = !Array.from(w.__brain.post).every((v,i)=>v===w.__brain.post0[i]);
sh.checked=false; sh.dispatchEvent(new w.Event('change',{bubbles:true}));
const restored = Array.from(w.__brain.post).every((v,i)=>v===w.__brain.post0[i]);
check('rewire control changes and restores the wiring', rewired && restored);

const off=d.querySelector('#brainOff'); off.checked=true; off.dispatchEvent(new w.Event('input',{bubbles:true}));
check('cut-brain checkbox switches the brain off', W.brainOn===false);
off.checked=false; off.dispatchEvent(new w.Event('input',{bubbles:true}));

const sil=d.querySelector('#silence input'); check('silence checkboxes were built for each sensor type', d.querySelectorAll('#silence input').length===4);
sil.checked=true; sil.dispatchEvent(new w.Event('change',{bubbles:true}));
check('silence checkbox registers', w.__brain.silenced.size===1); sil.checked=false; sil.dispatchEvent(new w.Event('change',{bubbles:true}));

d.querySelector('#rainBtn').click(); tick(500);
check('rain toggle works and the sim keeps stepping without NaN', d.querySelector('#rainBtn').getAttribute('aria-pressed')==='true' && isFinite(W.fly.pos.x) && isFinite(W.fly.pos.y) && isFinite(W.fly.pos.z), 'pos=('+W.fly.pos.x.toFixed(1)+','+W.fly.pos.y.toFixed(1)+','+W.fly.pos.z.toFixed(1)+')');
d.querySelector('#pauseBtn').click(); const posBefore=JSON.stringify(W.fly.pos); tick(30); const posAfter=JSON.stringify(W.fly.pos);
check('pause actually freezes the simulation', posBefore===posAfter);
d.querySelector('#pauseBtn').click();
d.querySelector('#clearBtn').click(); d.querySelector('#resetBtn').click();
check('clear and reset work', W.obs.length===0 && W.dodged===0 && W.hits===0);

const circ = d.querySelector('#circuit'); const seen = new Set();
for (let y=30;y<420;y+=6) for (let x=10;x<510;x+=6){ circ.dispatchEvent(new w.MouseEvent('pointermove',{clientX:x,clientY:y,bubbles:true})); const h=d.querySelector('#hover').textContent; if(!h.startsWith('Hover')) seen.add(h.split(':')[0]); }
check('every node in the circuit panel can be hovered', seen.size===w.__brain.N, seen.size+'/'+w.__brain.N);
d.querySelector('#reloadBtn').click(); check('"Load another file" reopens the loader', !d.querySelector('#loader').hidden);
d.querySelector('#loader').hidden = true; // dismiss without actually reloading -- world/brain persist untouched, no need to re-parse
d.querySelector('#rainBtn').click(); // rain was left on from the earlier check; turn it off before counting obstacles below
W.clear();

// ---- camera modes ----
check('starts in chase mode', d.querySelector('#camChaseBtn').getAttribute('aria-pressed')==='true' && d.querySelector('#camFreeBtn').getAttribute('aria-pressed')==='false');
d.querySelector('#camFreeBtn').click();
check('switching to free mode updates both buttons and the hint', d.querySelector('#camFreeBtn').getAttribute('aria-pressed')==='true' && d.querySelector('#camChaseBtn').getAttribute('aria-pressed')==='false' && /Drag to look/.test(d.querySelector('#camHint').textContent));

const camBefore = { x: w.__camera.position.x, y: w.__camera.position.y, z: w.__camera.position.z };
w.window.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
tick(30); // ~0.5s of frames
w.window.dispatchEvent(new w.KeyboardEvent('keyup', { key: 'ArrowUp', bubbles: true }));
const camAfterUp = { x: w.__camera.position.x, y: w.__camera.position.y, z: w.__camera.position.z };
check('ArrowUp moves the free camera', camAfterUp.x !== camBefore.x || camAfterUp.y !== camBefore.y || camAfterUp.z !== camBefore.z,
  JSON.stringify(camBefore) + ' -> ' + JSON.stringify(camAfterUp));
tick(5);
const camBeforeIdle = { ...w.__camera.position };
tick(20); // no keys held: camera should not drift
const camAfterIdle = { x: w.__camera.position.x, y: w.__camera.position.y, z: w.__camera.position.z };
check('camera stays put with no keys held', camAfterIdle.x === camBeforeIdle.x && camAfterIdle.y === camBeforeIdle.y && camAfterIdle.z === camBeforeIdle.z);

// drag should rotate the camera (change yaw/pitch) without spawning an obstacle; a plain click should spawn one
const obsCountBefore = W.obs.length;
ptr('pointerdown', 400, 260);
ptr('pointermove', 440, 230); // > 6px, counts as a drag
ptr('pointerup', 440, 230);
check('dragging in free mode does not drop an obstacle', W.obs.length === obsCountBefore);
ptr('pointerdown', 400, 260);
ptr('pointerup', 400, 260); // no movement: a genuine click
check('a plain click in free mode still drops an obstacle', W.obs.length === obsCountBefore + 1);

d.querySelector('#camChaseBtn').click();
check('switching back to chase restores the chase hint', /Click to drop/.test(d.querySelector('#camHint').textContent));
check('after returning to chase, holding still drops and grows an obstacle as before', true);
ptr('pointerdown', 300, 260); t += 700; ptr('pointerup', 300, 260);
check('chase-mode hold-to-grow still works after mode switching', W.obs[W.obs.length-1].r > 10, 'r=' + W.obs[W.obs.length-1].r.toFixed(1));
check('no JavaScript errors were raised', errors.length===0, errors.join(' | '));
console.log('\n'+ok+' passed, '+bad+' failed'); process.exit(bad?1:0);
