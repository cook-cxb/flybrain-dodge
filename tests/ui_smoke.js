// Headless smoke test of game/fly_dodge.html in jsdom with a mocked canvas (no pixels are checked, only that nothing throws
// and that the controls do what they say).  Usage: node ui_smoke.js [path/to/circuit.json]   (default: the stand-in circuit)
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const circuitPath = process.argv[2] || path.join(__dirname, 'STANDIN_not_real_circuit.json');
const circuit = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));
let html = fs.readFileSync(path.join(__dirname, '..', 'game', 'fly_dodge.html'), 'utf8');
html = html.replace('brain = b; world = new World(brain);', 'brain = b; world = new World(brain); window.__world = world; window.__brain = brain;'); // test-only hook
const errors = [];
function makeDom(fetchImpl) {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  return new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://example.test/',
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get(t, k) { return k in t ? t[k] : () => {}; }, set(t, k, v) { t[k] = v; return true; } }); };
      w.HTMLElement.prototype.getBoundingClientRect = function () { return this.id === 'circuit' ? { left: 0, top: 0, width: 520, height: 620 } : { left: 0, top: 0, width: 900, height: 620 }; };
      w.HTMLElement.prototype.setPointerCapture = function () {};
      w.fetch = fetchImpl; w.__frames = []; w.requestAnimationFrame = cb => { w.__frames.push(cb); return 1; };
    } });
}
let ok = 0, bad = 0;
const check = (name, cond, extra) => { (cond ? ok++ : bad++); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  [' + extra + ']' : '')); };

// 1) manual load through the paste box, then drive the controls
{
  const dom = makeDom(() => Promise.reject(new Error('no network'))); const w = dom.window, d = w.document; let now = 1000;
  const tick = n => { for (let i = 0; i < n; i++) { const c = w.__frames.splice(0); now += 16; c.forEach(f => f(now)); } };
  tick(2);
  d.querySelector('#pasteBox').value = '{"hello":1}'; d.querySelector('#pasteBtn').click();
  check('rejects a JSON file without nodes/edges', /not a flybrain_circuit/.test(d.querySelector('#loadErr').textContent));
  d.querySelector('#pasteBox').value = 'not json'; d.querySelector('#pasteBtn').click();
  check('rejects text that is not JSON', /not valid JSON/.test(d.querySelector('#loadErr').textContent));
  d.querySelector('#pasteBox').value = JSON.stringify(circuit); d.querySelector('#pasteBtn').click();
  check('loads a valid circuit and hides the loader', d.querySelector('#loader').hidden, d.querySelector('#status').textContent.slice(0, 60));
  const W = w.__world, arena = d.querySelector('#arena');
  const ptr = (t, x) => arena.dispatchEvent(new w.MouseEvent(t, { clientX: x, clientY: 100, bubbles: true }));
  ptr('pointerdown', 300); ptr('pointerup', 300);
  check('a quick click spawns one small obstacle at the click x', W.obs.length === 1 && Math.abs(W.obs[0].x - 300) < 1 && W.obs[0].r <= 10, 'r=' + W.obs[0].r.toFixed(1));
  let t = now; w.performance.now = () => t; ptr('pointerdown', 600); t += 600; ptr('pointerup', 600);
  check('holding 600 ms makes a medium obstacle', W.obs[1].r > 25 && W.obs[1].r < 45, 'r=' + W.obs[1].r.toFixed(1));
  t += 3000; ptr('pointerdown', 700); t += 3000; ptr('pointerup', 700);
  check('hold size is capped at 60', W.obs[2].r === 60);
  const dr = d.querySelector('#drop'); dr.value = '50'; dr.dispatchEvent(new w.Event('input', { bubbles: true }));
  ptr('pointerdown', 450); ptr('pointerup', 450);
  check('drop-height slider moves the spawn height (50% of 620 = 310)', Math.abs(W.obs[W.obs.length - 1].y - 310) < 1);
  W.clear(); W.spawn(W.fly.x - 20, 30); let peak = 0; for (let i = 0; i < 300; i++) { tick(1); peak = Math.max(peak, W.SL + W.SR); }
  check('a live drop is dodged and scored', W.hits === 0 && W.dodged >= 1, 'peak SL+SR=' + peak.toFixed(2));
  const sh = d.querySelector('#shuffle'); sh.checked = true; sh.dispatchEvent(new w.Event('change', { bubbles: true })); tick(20);
  sh.checked = false; sh.dispatchEvent(new w.Event('change', { bubbles: true }));
  const same = Array.from(w.__brain.w).every((v, i) => v === w.__brain.w0[i]) && Array.from(w.__brain.post).every((v, i) => v === w.__brain.post0[i]);
  check('rewire control can be switched off and restores the original wiring', same);
  const off = d.querySelector('#brainOff'); off.checked = true; off.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('cut-brain checkbox switches the brain off', W.brainOn === false);
  off.checked = false; off.dispatchEvent(new w.Event('input', { bubbles: true }));
  const sil = d.querySelector('#silence input'); sil.checked = true; sil.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('silence checkbox registers a silenced type', w.__brain.silenced.size === 1);
  d.querySelector('#rainBtn').click(); tick(300);
  check('rain toggle works', d.querySelector('#rainBtn').getAttribute('aria-pressed') === 'true');
  d.querySelector('#pauseBtn').click(); tick(3); d.querySelector('#pauseBtn').click();
  d.querySelector('#clearBtn').click(); d.querySelector('#resetBtn').click();
  check('clear and reset work', W.obs.length === 0 && W.dodged === 0 && W.hits === 0);
  const c = d.querySelector('#circuit'); const seen = new Set();
  for (let y = 40; y < 520; y += 6) for (let x = 10; x < 510; x += 6) { c.dispatchEvent(new w.MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true })); const h = d.querySelector('#hover').textContent; if (!h.startsWith('Hover')) seen.add(h.split(':')[0]); }
  check('every node in the circuit can be hovered', seen.size === w.__brain.N, seen.size + '/' + w.__brain.N);
  d.querySelector('#reloadBtn').click(); check('"Load another file" reopens the loader', !d.querySelector('#loader').hidden);
}
// 2) automatic load when the page is served next to flybrain_circuit.json
(async () => {
  const dom = makeDom(() => Promise.resolve({ ok: true, json: () => Promise.resolve(circuit) })); const w = dom.window;
  await new Promise(r => setTimeout(r, 50));
  check('auto-loads flybrain_circuit.json when fetch succeeds', w.document.querySelector('#loader').hidden === true);
  check('no JavaScript errors were raised', errors.length === 0, errors.join(' | '));
  console.log('\n' + ok + ' passed, ' + bad + ' failed');
  process.exit(bad ? 1 : 0);
})();
