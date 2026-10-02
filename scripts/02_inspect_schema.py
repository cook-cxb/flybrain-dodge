"""Print the schema and first rows of the three tables, then list the cell types this project cares about.
Run from the folder that holds the .feather files.  Uses memory-mapping so the 1 GB weights file is not copied to RAM up front."""
import glob, sys
import pyarrow.feather as feather
import pandas as pd

def find(prefix):
    hits = glob.glob(prefix + '*.feather')
    if not hits:
        sys.exit(f'No file starting with "{prefix}" here. Run 01_download.sh first, and run this from that folder.')
    return hits[0]

for prefix in ['body-annotations', 'body-neurotransmitters', 'connectome-weights']:
    path = find(prefix)
    table = feather.read_table(path, memory_map=True)
    print('\n==', path, table.num_rows, 'rows')
    print(table.schema)
    print(table.slice(0, 3).to_pandas().to_string())

ann = pd.read_feather(find('body-annotations'))
# Newer pandas stores text as a "str" dtype, so select by name, not by dtype.
ann['type'] = ann['type'].fillna('').astype(str)
ann['superclass'] = ann['superclass'].fillna('').astype(str)

print('\n== superclass counts')
print(ann['superclass'].value_counts().to_string())

print('\n== visual_projection types (top 60 by count)')
print(ann[ann['superclass'] == 'visual_projection']['type'].value_counts().head(60).to_string())

dn = ann[ann['superclass'] == 'descending_neuron']
print('\n== descending_neuron types:', len(dn), 'neurons,', dn['type'].nunique(), 'types (top 80)')
print(dn['type'].value_counts().head(80).to_string())

print('\n== specific types of interest (count, superclass)')
for t in ['LPLC2', 'LC4', 'LPLC1', 'LC6', 'LC16', 'LC17', 'LPLC4',
          'DNp01', 'DNp02', 'DNp03', 'DNp04', 'DNp05', 'DNp06',
          'DNp07', 'DNp10', 'DNp11', 'DNa02', 'DNb01']:
    m = ann[ann['type'] == t]
    print(t, len(m), m['superclass'].unique().tolist())
