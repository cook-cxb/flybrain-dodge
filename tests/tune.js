// Sensitivity of hit rate to the three motor knobs (decisiveness kappa, retreat strength, looming threshold).
const { Brain, World, CFG, mulberry, makeCircuit } = require('./harness.js');
function run(params, shuffle) {
  let hits = 0, n = 0;
  for (const r of [12, 25, 40, 55]) for (const dx of [-60, -30, -10, 0, 10, 30, 60]) for (let s = 1; s <= 4; s++) {
    const rand = mulberry(s * 13 + r + dx + 100); const b = new Brain(makeCircuit(7), { rand }); b.calibrate(); if (shuffle) b.setShuffled(true);
    const w = new World(b, { rand }); Object.assign(w.params, params);
    for (let i = 0; i < 60; i++) w.step(CFG.dt); w.spawn(w.fly.x + dx, r);
    for (let i = 0; i < 360; i++) { w.step(CFG.dt); if (!w.obs.length) break; }
    n++; if (w.hits > 0) hits++;
  }
  return Math.round(100 * hits / n);
}
console.log('kappa retreat sens | intact%  rewired%');
for (const kappa of [4, 8, 10, 14]) for (const retreat of [0.9, 0.5, 0.2]) for (const sens of [0.25, 0.15])
  console.log(String(kappa).padStart(5), String(retreat).padStart(7), String(sens).padStart(4), '|', String(run({ kappa, retreat, sens }, false)).padStart(6), String(run({ kappa, retreat, sens }, true)).padStart(9));
