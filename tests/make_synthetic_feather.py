"""Write three tiny .feather files with the same column names as the real male-CNS tables, so the scripts in ../scripts can be
run end to end in seconds without the 1 GB download.  The content is random and NOT biological.
Usage:  python make_synthetic_feather.py  [output_folder]"""
import sys, os
import numpy as np, pandas as pd

out = sys.argv[1] if len(sys.argv) > 1 else 'synthetic_data'
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(0)
rows, nt_rows, bid = [], [], 10000

def add(type_, superclass, side, n, nt, subclass=''):
    global bid
    ids = []
    for _ in range(n):
        bid += 1; ids.append(bid)
        rows.append(dict(bodyId=bid, type=type_, superclass=superclass, somaSide=side, subclass=subclass, exitNerve='',
                         instance=f'{type_}_{side}'))
        nt_rows.append(dict(body=bid, cell_type=type_, consensus_nt=nt))
    return ids

groups = {}
for t in ['LPLC2', 'LC4', 'LC6', 'LPLC1']:
    for s in 'LR': groups[(t, s)] = add(t, 'visual_projection', s, 20, 'acetylcholine')
for t, nt in [('INTA', 'acetylcholine'), ('INTB', 'gaba'), ('INTC', 'glutamate'), ('INTD', 'acetylcholine')]:
    for s in 'LR': groups[(t, s)] = add(t, 'cb_intrinsic', s, 6, nt)
for t in ['DNp01', 'DNx1', 'DNx2', 'DNx3']:
    for s in 'LR': groups[(t, s)] = add(t, 'descending_neuron', s, 1 if t == 'DNp01' else 2, 'acetylcholine', 'lt')
groups[('', '?')] = add('', '', '', 30, 'unknown')        # unannotated neurons, as in the real table
groups[('', '?')] += add('', 'descending_neuron', '', 3, 'unknown')

edges = []
def connect(a, b, p, lo, hi):
    for i in a:
        for j in b:
            if rng.random() < p: edges.append((i, j, int(rng.integers(lo, hi))))
for t in ['LPLC2', 'LC4', 'LC6', 'LPLC1']:
    for s, o in [('L', 'R'), ('R', 'L')]:
        for d in ['DNp01', 'DNx1', 'DNx2']: connect(groups[(t, s)], groups[(d, s)], 0.6, 20, 300)   # direct, same side only
        for i in ['INTA', 'INTB', 'INTC', 'INTD']:
            connect(groups[(t, s)], groups[(i, s)], 0.5, 10, 120)
            connect(groups[(t, s)], groups[(i, o)], 0.2, 5, 60)
for i in ['INTA', 'INTB', 'INTC', 'INTD']:
    for s in 'LR':
        for d in ['DNp01', 'DNx1', 'DNx2', 'DNx3']:
            for ds in 'LR': connect(groups[(i, s)], groups[(d, ds)], 0.5 if ds == s else 0.25, 10, 150)
allids = [r['bodyId'] for r in rows]
for _ in range(20000): edges.append((int(rng.choice(allids)), int(rng.choice(allids)), int(rng.integers(1, 50))))  # unrelated noise
pd.DataFrame(rows).astype({'bodyId': 'int64'}).to_feather(os.path.join(out, 'body-annotations-synthetic.feather'))
pd.DataFrame(nt_rows).astype({'body': 'int64'}).to_feather(os.path.join(out, 'body-neurotransmitters-synthetic.feather'))
pd.DataFrame(edges, columns=['body_pre', 'body_post', 'weight']).astype('int64').to_feather(os.path.join(out, 'connectome-weights-synthetic.feather'))
print('wrote', len(rows), 'neurons and', len(edges), 'edges to', out)
