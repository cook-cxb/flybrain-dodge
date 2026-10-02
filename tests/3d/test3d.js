const Fly3D = require('./core3d.js');
const { Brain, World3D, CFG, V } = Fly3D;
const circuit = require('../STANDIN_not_real_circuit.json');
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 1) idle stability: no obstacles, does the fly stay roughly centered and not NaN out?
{
  const rand = mulberry(1); const b = new Brain(circuit, { rand }); b.calibrate();
  const w = new World3D(b, { rand });
  let maxSpeed = 0, bad = false, maxR = 0;
  for (let i = 0; i < 90 * 20; i++) { w.step(CFG.dt); maxSpeed = Math.max(maxSpeed, V.len(w.fly.vel)); maxR = Math.max(maxR, Math.hypot(w.fly.pos.x, w.fly.pos.z));
    if (!isFinite(w.fly.pos.x) || !isFinite(w.fly.pos.y) || !isFinite(w.fly.pos.z)) bad = true; }
  console.log('idle 20s: NaN?', bad, '| max speed', maxSpeed.toFixed(1), '| max horizontal distance from center', maxR.toFixed(1), '(room half-extent', CFG.halfX, ')', '| pitch', w.fly.pitch.toFixed(2), 'stays in [-1.02,1.02]?', Math.abs(w.fly.pitch) <= CFG.pitchLimit + 1e-6);
}
// 2) does the fly turn away from a threat on its left vs right?  drop straight ahead, offset left/right in its local frame
function trial(dxLocal, seed, opts) {
  opts = opts || {};
  const rand = mulberry(seed); const b = new Brain(circuit, { rand }); b.calibrate(); if (opts.shuffle) b.setShuffled(true);
  const w = new World3D(b, { rand }); w.brainOn = opts.brain !== false;
  for (let i = 0; i < 90; i++) w.step(CFG.dt); // let it settle into cruise
  const f = w.fly;
  const spawnPos = V.add(V.add(f.pos, f.fwd, 70), f.right, dxLocal);
  w.spawn(spawnPos.x, spawnPos.z, 14, { y: spawnPos.y, vx: 0, vz: 0 });
  const yaw0 = f.yaw;
  let maxYawDelta = 0, hit = false;
  for (let i = 0; i < 90 * 4; i++) { w.step(CFG.dt); let d = f.yaw - yaw0; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; if (Math.abs(d) > Math.abs(maxYawDelta)) maxYawDelta = d; if (!w.obs.length) break; }
  hit = w.hits > 0;
  return { maxYawDelta, hit };
}
console.log('\ndirection check: obstacle placed dxLocal to the RIGHT(+)/LEFT(-) of the fly\'s current heading, 70 ahead');
for (const dx of [-40, -20, -8, 8, 20, 40]) {
  const rs = [1,2,3,4].map(s => trial(dx, s * 31 + dx + 200));
  const meanYaw = rs.reduce((a,r)=>a+r.maxYawDelta,0)/rs.length;
  console.log(' dxLocal', String(dx).padStart(4), '| mean max yaw delta (rad, + = turned right)', meanYaw.toFixed(2), '| hits', rs.filter(r=>r.hit).length, '/4');
}
// 3) sweep hit rate: intact vs brain-cut vs rewired, many random threats crossing the fly's path
function sweepHits(opts) {
  let hits = 0, n = 0;
  for (const r of [5, 10, 16, 24]) for (const dx of [-30, -15, -5, 5, 15, 30]) for (let s = 1; s <= 4; s++) {
    const t = trialGeneric(dx, r, s * 17 + dx + r + 300, opts); n++; if (t) hits++;
  }
  return { hits, n };
}
function trialGeneric(dxLocal, r, seed, opts) {
  opts = opts || {};
  const rand = mulberry(seed); const b = new Brain(circuit, { rand }); b.calibrate(); if (opts.shuffle) b.setShuffled(true);
  (opts.silence || []).forEach(t => b.silenced.add(t));
  const w = new World3D(b, { rand }); w.brainOn = opts.brain !== false;
  for (let i = 0; i < 90; i++) w.step(CFG.dt);
  const f = w.fly;
  const spawnPos = V.add(V.add(f.pos, f.fwd, 60), f.right, dxLocal);
  w.spawn(spawnPos.x, spawnPos.z, r, { y: spawnPos.y, vx: 0, vz: 0 });
  for (let i = 0; i < 90 * 4; i++) { w.step(CFG.dt); if (!w.obs.length) break; }
  return w.hits > 0;
}
console.log('\nhead-on threat sweep (72 trials each): hit rate');
for (const [label, opts] of [['intact', {}], ['brain cut', { brain: false }], ['rewired', { shuffle: true }], ['sensors silenced', { silence: ['LPLC2','LC4','LC6','LPLC1'] }]]) {
  const { hits, n } = sweepHits(opts); console.log(' ', label.padEnd(18), hits + '/' + n, Math.round(100*hits/n) + '%');
}
// 4) rain for 60s: no crashes, obstacles bounded, score sane
{
  const rand = mulberry(9); const b = new Brain(circuit, { rand }); b.calibrate();
  const w = new World3D(b, { rand }); w.rainOn = true;
  let maxObs = 0, bad = false, outOfBounds = false;
  for (let i = 0; i < 90 * 60; i++) { w.step(CFG.dt); maxObs = Math.max(maxObs, w.obs.length);
    if (!isFinite(w.fly.pos.x)) bad = true;
    if (Math.abs(w.fly.pos.x) > CFG.halfX || Math.abs(w.fly.pos.z) > CFG.halfZ || w.fly.pos.y < 0 || w.fly.pos.y > CFG.ceilY) outOfBounds = true; }
  console.log('\n60s rain: dodged', w.dodged, '| hit', w.hits, '| max obstacles alive', maxObs, '| NaN?', bad, '| fly left room bounds?', outOfBounds);
}
