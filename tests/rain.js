// Idle stability, 90 s of random rain under three conditions, and odd-input handling.
const { Brain, World, CFG, mulberry, makeCircuit } = require('./harness.js');
{ const rand = mulberry(3); const b = new Brain(makeCircuit(7), { rand }); b.calibrate(); const w = new World(b, { rand });
  let sumT = 0, maxD = 0, n = 0;
  for (let i = 0; i < 1200; i++) { w.step(CFG.dt); sumT += w.motor.T; n++; maxD = Math.max(maxD, Math.hypot(w.fly.x - CFG.homeX, w.fly.y - CFG.homeY)); }
  console.log('idle 10 s: mean threat T', (sumT / n).toFixed(3), '| max drift from home', maxD.toFixed(1), 'px'); }
for (const [label, cfg] of [['intact', {}], ['rewired', { shuffle: true }], ['brain cut', { off: true }]]) {
  const rand = mulberry(11); const b = new Brain(makeCircuit(7), { rand }); b.calibrate(); if (cfg.shuffle) b.setShuffled(true);
  const w = new World(b, { rand }); w.brainOn = !cfg.off; w.rainOn = true; let bad = false, maxObs = 0;
  for (let i = 0; i < 120 * 90; i++) { w.step(CFG.dt); maxObs = Math.max(maxObs, w.obs.length); if (!isFinite(w.fly.x) || !isFinite(w.fly.y)) bad = true; }
  console.log(label.padEnd(10), 'rain 90 s: dodged', w.dodged, '| hit', w.hits, '| max obstacles alive', maxObs, '| NaN?', bad);
}
const tiny = new Brain({ nodes: [{ id: 'A_L', type: 'A', side: 'L', layer: 'input', n: 1, nt: 'acetylcholine', sign: 1 }, { id: 'X_?', type: 'X', side: '?', layer: 'inter', n: 1, sign: 0 }, { id: 'D_L', type: 'D', side: 'L', layer: 'dn', n: 1, sign: 1 }],
  edges: [{ pre: 'A_L', post: 'X_?', total: 50 }, { pre: 'X_?', post: 'D_L', total: 50, n_post: 1 }, { pre: 'ghost', post: 'D_L', total: 5 }] });
console.log('3-node circuit with an unknown-sign interneuron and a dangling edge:', JSON.stringify(tiny.calibrate()), '| usable edges', tiny.E, '(dangling edge ignored, no crash)');
