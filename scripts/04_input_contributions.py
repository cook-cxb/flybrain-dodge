"""Which looming-detector types feed each descending neuron directly?  Reads only flybrain_circuit.json (fast).
Usage:  python 04_input_contributions.py [path/to/flybrain_circuit.json] [number_of_DN_nodes]
Useful for checking claims about individual cell types, e.g. how much of DNp01's direct input comes from LC6."""
import json, sys
from collections import defaultdict
path = sys.argv[1] if len(sys.argv) > 1 else 'flybrain_circuit.json'
top = int(sys.argv[2]) if len(sys.argv) > 2 else 12
c = json.load(open(path))
layer = {n['id']: n['layer'] for n in c['nodes']}
typ = {n['id']: n['type'] for n in c['nodes']}
by_dn = defaultdict(lambda: defaultdict(int))
for e in c['edges']:
    if layer.get(e['pre']) == 'input' and layer.get(e['post']) == 'dn':
        by_dn[e['post']][typ[e['pre']]] += e['total']
types = sorted({t for d in by_dn.values() for t in d})
print('direct input->DN synapses (edges below min_edge were dropped by the export)')
print('DN node'.ljust(14), *[t.rjust(8) for t in types], 'total'.rjust(8))
for dn, d in sorted(by_dn.items(), key=lambda kv: -sum(kv[1].values()))[:top]:
    tot = sum(d.values())
    print(dn.ljust(14), *[str(d.get(t, 0)).rjust(8) for t in types], str(tot).rjust(8))
