// Single-drop dodge test: 4 obstacle sizes x 7 horizontal offsets x 4 seeds = 112 drops per condition.
const { Brain, World, CFG, mulberry, makeCircuit } = require('./harness.js');
function trial(opts, dx, r, seed) {
  const rand = mulberry(seed);
  const b = new Brain(makeCircuit(7), { rand }); b.calibrate();
  if (opts.shuffle) b.setShuffled(true);
  (opts.silence || []).forEach(t => b.silenced.add(t));
  const w = new World(b, { rand }); w.brainOn = opts.brain !== false;
  for (let i = 0; i < 60; i++) w.step(CFG.dt);           // let the network settle
  w.spawn(w.fly.x + dx, r);
  for (let i = 0; i < 360; i++) { w.step(CFG.dt); if (!w.obs.length) break; }
  return w.hits > 0;
}
function sweep(label, opts) {
  let hits = 0, n = 0; const byR = {};
  for (const r of [12, 25, 40, 55]) for (const dx of [-60, -30, -10, 0, 10, 30, 60]) for (let s = 1; s <= 4; s++) {
    n++; if (trial(opts, dx, r, s * 13 + r + dx + 100)) { hits++; byR[r] = (byR[r] || 0) + 1; }
  }
  console.log(label.padEnd(30), 'hit', (hits + '/' + n).padEnd(8), (Math.round(100 * hits / n) + '%').padEnd(5), 'by radius', JSON.stringify(byR));
}
console.log('calibration on the stand-in circuit:', new Brain(makeCircuit(7)).calibrate());
sweep('intact wiring', {});
sweep('brain cut (drift home only)', { brain: false });
sweep('rewired at random', { shuffle: true });
sweep('all four input types silenced', { silence: ['LPLC2', 'LC4', 'LC6', 'LPLC1'] });
sweep('LPLC2 silenced only', { silence: ['LPLC2'] });

console.log('\nDirection check (r=30): obstacle offset dx from the fly -> fly x shift, peak left/right descending-neuron activity');
for (const [label, shuffle] of [['intact', false], ['rewired', true]]) {
  console.log(label);
  for (const dx of [-60, -30, -10, 0, 10, 30, 60]) {
    const rand = mulberry(5); const b = new Brain(makeCircuit(7), { rand }); b.calibrate(); if (shuffle) b.setShuffled(true);
    const w = new World(b, { rand }); for (let i = 0; i < 60; i++) w.step(CFG.dt);
    w.spawn(w.fly.x + dx, 30); let maxShift = 0, pk = { SL: 0, SR: 0 };
    for (let i = 0; i < 360; i++) { w.step(CFG.dt); if (Math.abs(w.fly.x - 450) > Math.abs(maxShift)) maxShift = w.fly.x - 450; if (w.SL + w.SR > pk.SL + pk.SR) pk = { SL: w.SL, SR: w.SR }; }
    console.log('  dx', String(dx).padStart(4), '| hit', w.hits, '| x shift', maxShift.toFixed(0).padStart(5), '| SL', pk.SL.toFixed(2), 'SR', pk.SR.toFixed(2));
  }
}
