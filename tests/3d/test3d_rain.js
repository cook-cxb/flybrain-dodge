const Fly3D = require('./core3d.js');
const { Brain, World3D, CFG, V } = Fly3D;
const circuit = require('../STANDIN_not_real_circuit.json');
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function runRain(seed, seconds, opts, spawnEvery) {
  opts = opts || {};
  const rand = mulberry(seed); const b = new Brain(circuit, { rand }); b.calibrate(); if (opts.shuffle) b.setShuffled(true);
  const w = new World3D(b, { rand }); w.brainOn = opts.brain !== false; w.rainOn = true;
  if (spawnEvery) w.rainT = spawnEvery[0];
  const n = Math.round(seconds / CFG.dt);
  for (let i = 0; i < n; i++) {
    w.step(CFG.dt);
    if (spawnEvery && w.rainT <= 0) w.rainT = spawnEvery[0] + w.rand() * spawnEvery[1];
  }
  return { dodged: w.dodged, hits: w.hits, spawned: w.dodged + w.hits + w.obs.length };
}
console.log('180s rain, default spawn rate (0.35-1.05s between drops):');
for (const [label, opts] of [['intact', {}], ['brain cut', { brain: false }], ['rewired', { shuffle: true }]]) {
  const r = runRain(21, 180, opts); console.log(' ', label.padEnd(12), 'dodged', r.dodged, 'hit', r.hits, 'total threats resolved', r.dodged + r.hits);
}
console.log('\n180s rain, denser spawn (0.12-0.3s between drops):');
for (const [label, opts] of [['intact', {}], ['brain cut', { brain: false }], ['rewired', { shuffle: true }]]) {
  const r = runRain(21, 180, opts, [0.12, 0.18]); console.log(' ', label.padEnd(12), 'dodged', r.dodged, 'hit', r.hits, 'total threats resolved', r.dodged + r.hits, 'hit%', (100*r.hits/(r.dodged+r.hits||1)).toFixed(1));
}
// average across seeds for a stabler estimate
console.log('\ndenser spawn, averaged over 6 seeds, 120s each:');
for (const [label, opts] of [['intact', {}], ['brain cut', { brain: false }], ['rewired', { shuffle: true }]]) {
  let d=0,h=0; for (let s=1;s<=6;s++){ const r=runRain(100+s, 120, opts, [0.12,0.18]); d+=r.dodged; h+=r.hits; }
  console.log(' ', label.padEnd(12), 'dodged', d, 'hit', h, 'hit%', (100*h/(d+h||1)).toFixed(1));
}
