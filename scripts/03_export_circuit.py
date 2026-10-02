"""Build flybrain_circuit.json from the three male-CNS tables.
Run from the folder that holds the .feather files:   python 03_export_circuit.py | tee report.txt
Reads the 151-million-row weights table in chunks and keeps only (a) edges leaving the chosen looming detectors and
(b) edges arriving at descending neurons.  Peak RAM is roughly 4-5 GB."""
import glob, json, sys
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc

INPUT_TYPES = ['LPLC2', 'LC4', 'LC6', 'LPLC1']   # looming detectors (edit freely)
N_INTER = 40        # interneuron nodes kept
N_DN = 40           # descending-neuron nodes kept
MIN_EDGE = 10       # drop type-to-type edges with fewer total synapses
CHUNK = 10_000_000
SIGN = {'acetylcholine': 1, 'gaba': -1, 'glutamate': -1}   # others -> 0 (modulatory/unknown)

def log(*a):
    print(*a, file=sys.stderr, flush=True)

def mode(s):
    s = s[s != '']
    return s.value_counts().idxmax() if len(s) else ''

# ---------- annotations + neurotransmitters ----------
ann = pd.read_feather(glob.glob('body-annotations*')[0]).drop_duplicates('bodyId')
for c in ['type', 'superclass', 'somaSide', 'subclass', 'exitNerve']:
    ann[c] = ann[c].fillna('').astype(str)
ann.loc[ann['type'] == '', 'type'] = 'unnamed'
ann.loc[ann['somaSide'] == '', 'somaSide'] = '?'
nt = pd.read_feather(glob.glob('body-neurotransmitters*')[0], columns=['body', 'consensus_nt'])
nt = nt.drop_duplicates('body').rename(columns={'body': 'bodyId'})
ann = ann.merge(nt, on='bodyId', how='left')
ann['consensus_nt'] = ann['consensus_nt'].fillna('unknown').astype(str)
ann['node'] = ann['type'] + '_' + ann['somaSide']

label = ann.set_index('bodyId')['node']
n_neurons = ann['node'].value_counts()
inp_ids = ann.loc[ann['type'].isin(INPUT_TYPES), 'bodyId'].to_numpy()
dn_ids = ann.loc[ann['superclass'] == 'descending_neuron', 'bodyId'].to_numpy()
log('input neurons:', len(inp_ids), '| descending neurons:', len(dn_ids))

print('== input nodes (type_side: neurons)')
for n, k in n_neurons[[n for n in n_neurons.index if n.rsplit('_', 1)[0] in INPUT_TYPES]].items():
    print(f'  {n}: {k}')

# ---------- one pass over the weights file ----------
path = glob.glob('connectome-weights*')[0]
try:
    reader = pa.ipc.open_file(pa.memory_map(path))
    batches = (reader.get_batch(i) for i in range(reader.num_record_batches))
except pa.ArrowInvalid:
    import pyarrow.feather as feather
    batches = iter(feather.read_table(path, memory_map=True).to_batches())

inp_set, dn_set = pa.array(inp_ids), pa.array(dn_ids)
A_parts, D_parts, done = [], [], 0
for batch in batches:
    for off in range(0, batch.num_rows, CHUNK):
        ch = batch.slice(off, CHUNK)
        m1 = pc.is_in(ch.column('body_pre'), value_set=inp_set)
        m2 = pc.is_in(ch.column('body_post'), value_set=dn_set)
        if pc.any(m1).as_py():
            A_parts.append(ch.filter(m1).to_pandas())
        if pc.any(m2).as_py():
            D_parts.append(ch.filter(m2).to_pandas())
        done += ch.num_rows
        log(f'\r{done/1e6:.0f}M rows scanned')
A = pd.concat(A_parts, ignore_index=True)   # inputs -> anything
D = pd.concat(D_parts, ignore_index=True)   # anything -> descending neurons
log('input edges:', len(A), '| DN-input edges:', len(D))

def lab(df):
    df = df.copy()
    df['pre_node'] = df['body_pre'].map(label)
    df['post_node'] = df['body_post'].map(label)
    return df.dropna(subset=['pre_node', 'post_node'])

def agg(df):
    return df.groupby(['pre_node', 'post_node'], as_index=False)['weight'].sum()

# direct paths: input -> DN
E_direct = agg(lab(A[A['body_post'].isin(dn_ids)]))

# two-step paths: input -> interneuron X -> DN
X = (set(A['body_post']) & set(D['body_pre'])) - set(inp_ids) - set(dn_ids)
E_ai = agg(lab(A[A['body_post'].isin(X)]))
E_id = agg(lab(D[D['body_pre'].isin(X)]))
E_ai = E_ai[~E_ai['post_node'].str.startswith('unnamed_')]
E_id = E_id[~E_id['pre_node'].str.startswith('unnamed_')]

in_w = E_ai.groupby('post_node')['weight'].sum()
out_w = E_id.groupby('pre_node')['weight'].sum()
score = np.sqrt(in_w * out_w).dropna().sort_values(ascending=False)
top_inter = list(score.index[:N_INTER])
E_ai = E_ai[E_ai['post_node'].isin(top_inter)]
E_id = E_id[E_id['pre_node'].isin(top_inter)]

drive = E_direct.groupby('post_node')['weight'].sum().add(
    E_id.groupby('post_node')['weight'].sum(), fill_value=0).sort_values(ascending=False)
top_dn = [d for d in drive.index if not d.startswith('unnamed_')][:N_DN]
E_direct = E_direct[E_direct['post_node'].isin(top_dn)]
E_id = E_id[E_id['post_node'].isin(top_dn)]

# ---------- JSON for the game ----------
def node_info(nid, layer):
    sub = ann[ann['node'] == nid]
    ntx = sub['consensus_nt'].value_counts().idxmax()
    info = {'id': nid, 'type': sub['type'].iloc[0], 'side': sub['somaSide'].iloc[0],
            'layer': layer, 'n': int(len(sub)), 'nt': ntx, 'sign': SIGN.get(ntx, 0)}
    if layer == 'dn':
        info['subclass'] = mode(sub['subclass'])
        info['exit_nerve'] = mode(sub['exitNerve'])
    return info

in_nodes = sorted({p for p in pd.concat([E_direct, E_ai])['pre_node']})
nodes = ([node_info(n, 'input') for n in in_nodes] +
         [node_info(n, 'inter') for n in top_inter] +
         [node_info(n, 'dn') for n in top_dn])

edges = []
for df in (E_direct, E_ai, E_id):
    for r in df[df['weight'] >= MIN_EDGE].itertuples():
        edges.append({'pre': r.pre_node, 'post': r.post_node, 'total': int(r.weight),
                      'per_post_neuron': round(r.weight / n_neurons[r.post_node], 3),
                      'n_pre': int(n_neurons[r.pre_node]), 'n_post': int(n_neurons[r.post_node])})

with open('flybrain_circuit.json', 'w') as f:
    json.dump({'meta': {'dataset': 'male-cns v1.0', 'input_types': INPUT_TYPES,
                        'sign_rule': SIGN, 'min_edge': MIN_EDGE},
               'nodes': nodes, 'edges': edges}, f, indent=1)
log('wrote flybrain_circuit.json:', len(nodes), 'nodes,', len(edges), 'edges')

# ---------- report ----------
print('\n== top interneuron nodes (in = from inputs, out = to DNs)')
r = pd.DataFrame({'in': in_w, 'out': out_w}).loc[top_inter[:15]].astype(int)
r['nt'] = [node_info(n, 'inter')['nt'] for n in r.index]
print(r.to_string())

def side(s): return s.rsplit('_', 1)[1]
dl = E_direct.assign(s=E_direct['pre_node'].map(side)).pivot_table(
    index='post_node', columns='s', values='weight', aggfunc='sum', fill_value=0)
P = E_ai.merge(E_id, left_on='post_node', right_on='pre_node', suffixes=('_a', '_d'))
P['paths'] = P['weight_a'] * P['weight_d']
P['s'] = P['pre_node_a'].map(side)
two = P.pivot_table(index='post_node_d', columns='s', values='paths', aggfunc='sum', fill_value=0)

rep = pd.DataFrame(index=top_dn)
for s in ['L', 'R']:
    rep[f'direct_{s}'] = dl[s].reindex(top_dn).fillna(0).astype(int) if s in dl else 0
    rep[f'two_{s}'] = two[s].reindex(top_dn).fillna(0) if s in two else 0.0
rep['two_L_pct'] = (100 * rep['two_L'] / (rep['two_L'] + rep['two_R']).replace(0, np.nan)).round(0)
rep['two_total'] = (rep['two_L'] + rep['two_R']).map(lambda v: f'{v:.1e}')
rep['subclass'] = [node_info(n, 'dn')['subclass'] for n in rep.index]
rep['exit'] = [node_info(n, 'dn')['exit_nerve'] for n in rep.index]
print('\n== top descending-neuron nodes: drive from LEFT-eye (L) vs RIGHT-eye (R) inputs')
print(rep.drop(columns=['two_L', 'two_R']).head(40).to_string())
