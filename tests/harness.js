// Shared test helpers. Loads the simulation core straight out of ../game/fly_dodge.html so tests always match the shipped game.
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'game', 'fly_dodge.html'), 'utf8');
const coreSrc = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const FlyCore = vm.runInContext(coreSrc + ';FlyCore', vm.createContext({ Math, Float32Array, Float64Array, Int32Array, Object, Number, Array, Set, Map }));
const { Brain, World, CFG } = FlyCore;

function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// STAND-IN circuit, NOT the real connectome. Interneuron in/out totals, DN direct totals and left-share percentages are copied
// from the export report; everything else (which interneuron touches which DN, the 75/25 same/other-side split, the 40/20/20/20
// split across input types) is invented so the game logic has something to run on.  It has left/right structure built in.
function makeCircuit(seed) {
  const R = mulberry(seed);
  const nodes = [], edges = [];
  const inp = [['LPLC2_L', 94], ['LPLC2_R', 91], ['LC4_L', 71], ['LC4_R', 55], ['LC6_L', 59], ['LC6_R', 65], ['LPLC1_L', 68], ['LPLC1_R', 66]];
  inp.forEach(([id, n]) => nodes.push({ id, type: id.split('_')[0], side: id.split('_')[1], layer: 'input', n, nt: 'acetylcholine', sign: 1 }));
  const inter = [['LPLC4_R', 2194, 13285, 'a'], ['LPLC4_L', 1525, 14103, 'a'], ['PVLP122_R', 2999, 3465, 'a'], ['PVLP122_L', 2685, 3495, 'a'], ['PVLP151_R', 5621, 1505, 'a'], ['PVLP151_L', 5390, 1455, 'a'], ['LLPC1_R', 1497, 3932, 'a'], ['LT51_R', 783, 5277, 'g'], ['LT51_L', 606, 5687, 'g'], ['LLPC1_L', 899, 3484, 'a'], ['LC31b_R', 2722, 970, 'a'], ['PVLP010_L', 1278, 1974, 'g'], ['PVLP011_R', 10334, 238, 'gaba'], ['PS208_L', 855, 2796, 'a'], ['LHAD1g1_R', 1305, 1792, 'gaba']];
  inter.forEach(([id, i, o, nt]) => { const s = nt === 'a' ? 1 : -1; nodes.push({ id, type: id.split('_')[0], side: id.split('_')[1], layer: 'inter', n: 8, nt: nt === 'a' ? 'acetylcholine' : nt === 'g' ? 'glutamate' : 'gaba', sign: s }); });
  const dn = [['DNp04_L', 8785, 0, 35], ['DNp01_L', 6425, 0, 63], ['DNp01_R', 0, 4800, 34], ['DNp04_R', 0, 6231, 59], ['DNp06_L', 3205, 0, 68], ['DNp103_R', 0, 4162, 36], ['DNp03_L', 3816, 0, 93], ['DNp06_R', 0, 2449, 33], ['DNp103_L', 3084, 0, 60], ['DNp03_R', 0, 2294, 1], ['DNg40_R', 0, 2272, 25], ['DNp11_L', 2622, 0, 92], ['DNp11_R', 0, 2159, 31], ['DNg40_L', 1706, 0, 69], ['DNp35_L', 2440, 0, 79], ['DNb05_R', 0, 15, 0], ['DNp35_R', 0, 2138, 11], ['DNp02_L', 2279, 0, 94], ['DNp02_R', 0, 1935, 2], ['DNp31_R', 0, 96, 0], ['DNb05_L', 15, 0, 100], ['DNp05_L', 717, 0, 85], ['DNp05_R', 0, 625, 10], ['DNpe056_R', 0, 755, 2], ['DNpe056_L', 878, 0, 99]];
  dn.forEach(([id]) => nodes.push({ id, type: id.split('_')[0], side: id.split('_')[1], layer: 'dn', n: 1, nt: 'acetylcholine', sign: 1 }));
  const types = ['LPLC2', 'LC4', 'LC6', 'LPLC1'], share = { LPLC2: .4, LC4: .2, LC6: .2, LPLC1: .2 };
  dn.forEach(([id, dl, dr]) => { const s = id.split('_')[1]; const tot = s === 'L' ? dl : dr; if (tot < 10) return; types.forEach(t => edges.push({ pre: t + '_' + s, post: id, total: Math.round(tot * share[t]), per_post_neuron: tot * share[t], n_pre: 60, n_post: 1 })); });
  inter.forEach(([id, i, o]) => { const s = id.split('_')[1];
    types.forEach(t => ['L', 'R'].forEach(es => { const f = (es === s ? 0.75 : 0.25) * share[t]; edges.push({ pre: t + '_' + es, post: id, total: Math.round(i * f), per_post_neuron: i * f / 8, n_pre: 60, n_post: 8 }); }));
    dn.forEach(([did]) => { const ds = did.split('_')[1]; const f = (ds === s ? 0.65 : 0.35) * (0.5 + R()) / dn.length * 2; const tot = o * f; if (tot >= 10) edges.push({ pre: id, post: did, total: Math.round(tot), per_post_neuron: tot, n_pre: 8, n_post: 1 }); });
  });
  return { meta: { dataset: 'STAND-IN (not real data)', input_types: types }, nodes, edges };
}

module.exports = { FlyCore, Brain, World, CFG, mulberry, makeCircuit, html };
