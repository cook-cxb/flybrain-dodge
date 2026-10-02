const Fly3D = (function () {
  'use strict';

  // ---------------- Brain: identical to the 2D game, unchanged. ----------------
  const CFG = {
    // Room (units)
    halfX: 130, halfZ: 130, floorY: 0, ceilY: 165, spawnY: 152,
    g: 110,                          // gravity, units/s^2
    dt: 1 / 90,
    flyR: 5,                         // collision radius, sized to the real fly model's ~9-unit body length
    burstTime: 0.35,
    cruiseSpeed: 34, minSpeed: 14, maxSpeed: 60,
    yawMax: 2.3, pitchMax: 1.35, pitchLimit: 1.02,   // rad, ~58 deg clamp on pitch angle itself
    tauTurn: 0.18,                   // smoothing on yaw/pitch rate
    homeYaw: 0.35, homePitch: 0.35,  // gentle centering gains when idle
    tauNode: 0.03, refLoom: 0.8,
    wallMargin: 10
  };
  const DEFAULTS = { sens: 0.22, gain: 1, T0: 0.4, kappa: 9, kYaw: 1.0, kPitch: 0.6, dropAtCeiling: true };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function randn(rand) { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const V = {
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    add: (a, b, s) => ({ x: a.x + b.x * (s === undefined ? 1 : s), y: a.y + b.y * (s === undefined ? 1 : s), z: a.z + b.z * (s === undefined ? 1 : s) }),
    dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    len: a => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z),
    scale: (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s })
  };

  class Brain {
    constructor(circuit, opts) {
      opts = opts || {};
      this.rand = opts.rand || Math.random;
      const nodes = circuit.nodes;
      this.nodes = nodes; this.N = nodes.length;
      this.idx = new Map(nodes.map((n, i) => [n.id, i]));
      this.layer = nodes.map(n => n.layer); this.side = nodes.map(n => n.side || '?');
      this.type = nodes.map(n => n.type); this.sign = nodes.map(n => (Number.isFinite(n.sign) ? n.sign : 0));
      this.inputIdx = []; this.interIdx = []; this.dnIdx = [];
      this.layer.forEach((l, i) => { (l === 'input' ? this.inputIdx : l === 'inter' ? this.interIdx : this.dnIdx).push(i); });
      this.freeIdx = this.interIdx.concat(this.dnIdx);
      const pre = [], post = [], w = [], cls = [];
      for (const e of circuit.edges) {
        const i = this.idx.get(e.pre), j = this.idx.get(e.post);
        if (i === undefined || j === undefined || this.layer[j] === 'input') continue;
        const pp = Number.isFinite(e.per_post_neuron) ? e.per_post_neuron : e.total / Math.max(1, e.n_post || 1);
        pre.push(i); post.push(j); w.push(this.sign[i] * pp); cls.push(this.layer[i] + '>' + this.layer[j]);
      }
      this.E = pre.length;
      this.pre = Int32Array.from(pre); this.post = Int32Array.from(post); this.post0 = Int32Array.from(post);
      this.w0 = Float64Array.from(w); this.w = Float64Array.from(w); this.cls = cls;
      this.a = new Float32Array(this.N); this.drive = new Float32Array(this.N); this.inTarget = new Float32Array(this.N);
      this.gain = 1; this.noise = 0.04; this.tau = CFG.tauNode;
      this.scale = { inter: 1, dn: 1 }; this.motorScale = 1; this.silenced = new Set(); this.calib = null;
    }
    calibrate() {
      const a = new Float32Array(this.N), drive = new Float32Array(this.N);
      for (const i of this.inputIdx) a[i] = this.side[i] === 'L' ? CFG.refLoom : this.side[i] === 'R' ? 0 : CFG.refLoom / 2;
      for (let k = 0; k < this.E; k++) if (this.layer[this.post[k]] === 'inter') drive[this.post[k]] += this.w0[k] * a[this.pre[k]];
      const med = arr => { const p = arr.filter(v => v > 0).sort((x, y) => x - y); return p.length ? p[p.length >> 1] : 1; };
      this.scale.inter = med(this.interIdx.map(i => drive[i]));
      for (const i of this.interIdx) { const x = Math.max(0, drive[i]) / this.scale.inter; a[i] = x / (1 + x); }
      for (let k = 0; k < this.E; k++) if (this.layer[this.post[k]] === 'dn') drive[this.post[k]] += this.w0[k] * a[this.pre[k]];
      this.scale.dn = med(this.dnIdx.map(i => drive[i]));
      let SL = 0, SR = 0, active = 0;
      for (const i of this.dnIdx) { const x = Math.max(0, drive[i]) / this.scale.dn, v = x / (1 + x); if (v > 0.05) active++; if (this.side[i] === 'L') SL += v; else if (this.side[i] === 'R') SR += v; }
      this.motorScale = SL > 1e-6 ? 0.8 / SL : 1;
      this.calib = { L: SL * this.motorScale, R: SR * this.motorScale, activeDN: active };
      return this.calib;
    }
    setShuffled(on) {
      this.w.set(this.w0); this.post.set(this.post0);
      if (!on) return;
      const groups = {};
      for (let k = 0; k < this.E; k++) (groups[this.cls[k]] = groups[this.cls[k]] || []).push(k);
      for (const ks of Object.values(groups)) {
        const tg = ks.map(k => this.post0[k]);
        for (let i = tg.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); const t = tg[i]; tg[i] = tg[j]; tg[j] = t; }
        ks.forEach((k, n) => { this.post[k] = tg[n]; });
      }
    }
    setInputs(aL, aR) {
      for (const i of this.inputIdx) { let v = this.side[i] === 'L' ? aL : this.side[i] === 'R' ? aR : (aL + aR) / 2; if (this.silenced.has(this.type[i])) v = 0; this.inTarget[i] = v; }
    }
    step(dt) {
      const a = this.a, drive = this.drive;
      for (const i of this.inputIdx) a[i] += (this.inTarget[i] - a[i]) * Math.min(1, dt / 0.02);
      drive.fill(0);
      for (let k = 0; k < this.E; k++) drive[this.post[k]] += this.w[k] * a[this.pre[k]];
      const f = Math.min(1, dt / this.tau);
      for (const i of this.freeIdx) {
        const sc = this.layer[i] === 'inter' ? this.scale.inter : this.scale.dn;
        const x = this.gain * drive[i] / sc + this.noise * randn(this.rand);
        a[i] += ((x > 0 ? x / (1 + x) : 0) - a[i]) * f;
      }
    }
    readout() {
      let sl = 0, sr = 0;
      for (const i of this.dnIdx) { if (this.side[i] === 'L') sl += this.a[i]; else if (this.side[i] === 'R') sr += this.a[i]; }
      return { SL: sl * this.motorScale, SR: sr * this.motorScale };
    }
  }

  // ---------------- 3D sensing: generalizes the 2D eye math to full vectors. ----------------
  function eyeSens(deg) { while (deg > 180) deg -= 360; while (deg <= -180) deg += 360; return smoothstep(-25, 5, deg) * (1 - smoothstep(130, 170, deg)); }

  // fly = {pos, fwd, right, up, vel, r}. Returns per-eye looming and a signed vertical bias in [-1,1]
  // (positive = threats sit mostly above the fly). The vertical bias is a geometric convenience,
  // not read from any connectome data -- see docs.
  function sense3D(fly, obstacles) {
    let lL = 0, lR = 0, vNum = 0, vDen = 0;
    for (const o of obstacles) {
      const p = V.sub(o.pos, fly.pos), d = V.len(p);
      if (d < 1e-3) continue;
      const v = V.sub(o.vel, fly.vel), v2 = V.dot(v, v);
      if (v2 < 9) continue;
      const dot = V.dot(p, v);
      if (dot >= 0) continue;
      const c = -dot / d, tca = -dot / v2;
      const miss = V.len(V.add(p, v, tca));
      const R = o.r + fly.r;
      const g = Math.exp(-Math.pow(miss / (1.3 * R + 10), 2));
      const e = o.r * c / (d * d + 0.5 * o.r * o.r);
      const fx = V.dot(p, fly.right), fz = V.dot(p, fly.fwd), fy = V.dot(p, fly.up);
      const phi = Math.atan2(fx, fz) * 180 / Math.PI;              // azimuth, + = right
      const alpha = Math.asin(Math.min(1, o.r / d)) * 180 / Math.PI;
      let wl = 0, wr = 0; const K = 5;
      for (let k = 0; k < K; k++) { const ph = phi + alpha * (2 * (k + 0.5) / K - 1); wr += eyeSens(ph); wl += eyeSens(-ph); }
      const strength = g * e;
      lL += (wl / K) * strength; lR += (wr / K) * strength;
      const horiz = Math.hypot(fx, fz);
      const elev = Math.atan2(fy, Math.max(1, horiz));             // + above fly
      const w = strength * (wl + wr) / K;
      vNum += Math.sign(elev) * w; vDen += w;
    }
    return { lL, lR, vBias: vDen > 1e-6 ? clamp(vNum / vDen, -1, 1) : 0 };
  }

  function decode3D(SL, SR, vBias, p) {
    const T = SL + SR, drive = T / (T + p.T0);
    const asym = Math.tanh(p.kappa * (SL - SR) / (SL + SR + 0.05));
    return { T, drive, asym, yawCmd: p.kYaw * drive * asym, pitchCmd: -p.kPitch * drive * vBias };
  }

  // ---------------- World: fly kinematics + obstacle physics in 3D. ----------------
  class World3D {
    constructor(brain, opts) {
      opts = opts || {};
      this.brain = brain; this.rand = opts.rand || Math.random;
      this.params = Object.assign({}, DEFAULTS);
      this.brainOn = true; this.rainOn = false;
      this.reset();
    }
    reset() {
      this.fly = { pos: { x: 0, y: 90, z: 0 }, yaw: 0, pitch: 0, roll: 0, yawRate: 0, pitchRate: 0, speed: CFG.cruiseSpeed, r: CFG.flyR };
      this._updateFrame();
      this.fly.vel = V.scale(this.fly.fwd, this.fly.speed);
      this.obs = []; this.t = 0; this.rainT = 0.6;
      this.dodged = 0; this.hits = 0; this.hitFlash = 0;
      this.aL = 0; this.aR = 0; this.SL = 0; this.SR = 0;
      this.motor = { T: 0, drive: 0, asym: 0, yawCmd: 0, pitchCmd: 0 };
    }
    resetScore() { this.dodged = 0; this.hits = 0; }
    _updateFrame() {
      const f = this.fly;
      f.fwd = { x: Math.sin(f.yaw) * Math.cos(f.pitch), y: Math.sin(f.pitch), z: Math.cos(f.yaw) * Math.cos(f.pitch) };
      f.right = { x: Math.cos(f.yaw), y: 0, z: -Math.sin(f.yaw) };
      f.up = { x: f.right.y * f.fwd.z - f.right.z * f.fwd.y, y: f.right.z * f.fwd.x - f.right.x * f.fwd.z, z: f.right.x * f.fwd.y - f.right.y * f.fwd.x };
    }
    spawn(x, z, r, opts) {
      opts = opts || {};
      r = clamp(r, 3, 28);
      x = clamp(x, -CFG.halfX + r, CFG.halfX - r); z = clamp(z, -CFG.halfZ + r, CFG.halfZ - r);
      const y = opts.y !== undefined ? opts.y : CFG.spawnY;
      const driftScale = 26 / (1 + r * 0.12);
      const vx = opts.vx !== undefined ? opts.vx : (this.rand() - 0.5) * 2 * driftScale;
      const vz = opts.vz !== undefined ? opts.vz : (this.rand() - 0.5) * 2 * driftScale;
      const pos = { x, y, z };
      const threat = V.len(V.sub(pos, this.fly.pos)) < r + this.fly.r + 35;
      this.obs.push({ pos, vel: { x: vx, y: 0, z: vz }, r, hit: false, counted: false, threat, landed: false, fade: 0, age: 0 });
    }
    clear() { this.obs.length = 0; }

    step(dt) {
      const rand = this.rand, f = this.fly, p = this.params;
      this.t += dt;
      if (this.rainOn) {
        this.rainT -= dt;
        if (this.rainT <= 0) {
          const r = 3.5 + 14.5 * Math.pow(rand(), 1.5);
          this.spawn((rand() - 0.5) * 2 * (CFG.halfX - r), (rand() - 0.5) * 2 * (CFG.halfZ - r), r);
          this.rainT = 0.35 + rand() * 0.7;
        }
      }
      // obstacle physics: gravity + assigned horizontal drift, bounce off walls, burst on landing
      for (const o of this.obs) {
        o.age += dt;
        if (o.landed) { o.fade -= dt; continue; }
        o.vel.y -= CFG.g * dt;
        o.pos.x += o.vel.x * dt; o.pos.y += o.vel.y * dt; o.pos.z += o.vel.z * dt;
        if (o.pos.x < -CFG.halfX + o.r) { o.pos.x = -CFG.halfX + o.r; o.vel.x = Math.abs(o.vel.x); }
        if (o.pos.x > CFG.halfX - o.r) { o.pos.x = CFG.halfX - o.r; o.vel.x = -Math.abs(o.vel.x); }
        if (o.pos.z < -CFG.halfZ + o.r) { o.pos.z = -CFG.halfZ + o.r; o.vel.z = Math.abs(o.vel.z); }
        if (o.pos.z > CFG.halfZ - o.r) { o.pos.z = CFG.halfZ - o.r; o.vel.z = -Math.abs(o.vel.z); }
        if (o.pos.y - o.r <= CFG.floorY) {
          o.pos.y = CFG.floorY + o.r; o.landed = true; o.fade = CFG.burstTime;
          if (o.threat && !o.hit && !o.counted) { o.counted = true; this.dodged++; }
        }
      }
      // sense -> brain -> motor
      const active = this.obs.filter(o => !o.landed);
      const s = sense3D(f, active);
      const l0 = p.sens, q = l0 * l0;
      this.aL = s.lL * s.lL / (s.lL * s.lL + q); this.aR = s.lR * s.lR / (s.lR * s.lR + q);
      this.brain.gain = p.gain; this.brain.setInputs(this.aL, this.aR); this.brain.step(dt);
      const ro = this.brain.readout(); this.SL = ro.SL; this.SR = ro.SR;
      const m = this.brainOn ? decode3D(ro.SL, ro.SR, s.vBias, p) : { T: 0, drive: 0, asym: 0, yawCmd: 0, pitchCmd: 0 };
      this.motor = m;
      // idle centering: gently steer heading toward the room's vertical axis and mid-height when not threatened
      const calm = 1 - m.drive;
      const toCenterYaw = Math.atan2(-f.pos.x, -f.pos.z) - f.yaw;
      let dYaw = ((toCenterYaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      const homeYawRate = CFG.homeYaw * clamp(dYaw, -1, 1) * (f.pos.x * f.pos.x + f.pos.z * f.pos.z > (CFG.halfX * 0.6) ** 2 ? 1 : 0.2);
      const homePitchRate = CFG.homePitch * clamp(((CFG.ceilY * 0.5) - f.pos.y) / 60, -1, 1) * 0.3;
      const targetYawRate = clamp(CFG.yawMax * m.yawCmd + homeYawRate * calm, -CFG.yawMax, CFG.yawMax);
      const targetPitchRate = clamp(CFG.pitchMax * m.pitchCmd + homePitchRate * calm, -CFG.pitchMax, CFG.pitchMax);
      f.yawRate += (targetYawRate - f.yawRate) * Math.min(1, dt / CFG.tauTurn);
      f.pitchRate += (targetPitchRate - f.pitchRate) * Math.min(1, dt / CFG.tauTurn);
      f.yaw += f.yawRate * dt;
      f.pitch = clamp(f.pitch + f.pitchRate * dt, -CFG.pitchLimit, CFG.pitchLimit);
      f.roll += (clamp(-f.yawRate * 0.5, -0.9, 0.9) - f.roll) * Math.min(1, dt / 0.25);
      const targetSpeed = clamp(CFG.cruiseSpeed * (1 - 0.35 * m.drive), CFG.minSpeed, CFG.maxSpeed);
      f.speed += (targetSpeed - f.speed) * Math.min(1, dt / 0.4);
      this._updateFrame();
      f.vel = V.scale(f.fwd, f.speed);
      f.pos = V.add(f.pos, f.vel, dt);
      f.pos.x = clamp(f.pos.x, -CFG.halfX + CFG.wallMargin, CFG.halfX - CFG.wallMargin);
      f.pos.z = clamp(f.pos.z, -CFG.halfZ + CFG.wallMargin, CFG.halfZ - CFG.wallMargin);
      f.pos.y = clamp(f.pos.y, CFG.floorY + CFG.wallMargin, CFG.ceilY - CFG.wallMargin);
      // collisions
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      for (const o of this.obs) {
        if (o.landed) continue;
        const d = V.len(V.sub(f.pos, o.pos));
        if (!o.hit && d < o.r + f.r) { o.hit = true; this.hits++; this.hitFlash = 0.3; }
      }
      this.obs = this.obs.filter(o => !(o.landed && o.fade <= 0));
    }
  }

  return { CFG, DEFAULTS, Brain, World3D, sense3D, decode3D, eyeSens, V, clamp };
})();
if (typeof module !== 'undefined') module.exports = Fly3D;
