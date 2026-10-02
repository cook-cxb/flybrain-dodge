# Fly Dodge

A browser game in which a simulated fly dodges falling obstacles. Its steering comes from a rate model wired with real
synapse counts from the male CNS connectome (release `male-cns:v1.0`). Two versions ship here: a 2D hovering-dot original
and a 3D free-flight version with a real digitized fly model. Full documentation: open `docs/index.html`.

## What is in this folder

| Folder | Contents |
|---|---|
| `docs/index.html` | The documentation site (one file, works offline, covers both versions) |
| `game/fly_dodge.html` | The 2D game (one file, no dependencies) |
| `game/fly_dodge_3d.html` | The 3D game (one file; the fly model and its textures are embedded, 459 KB) |
| `scripts/` | Download, inspect and export scripts that turn ~1.2 GB of public tables into `flybrain_circuit.json` |
| `tests/` | Headless tests for the 2D game, a made-up stand-in circuit, a synthetic-table generator |
| `tests/3d/` | The same, for the 3D game: simulation tests and a headless page test with three.js's API stubbed |
| `examples/` | Real output of the scripts on the real dataset |

## Quick start

Just try a game: open `game/fly_dodge.html` (2D) or `game/fly_dodge_3d.html` (3D) in a browser, choose
`tests/STANDIN_not_real_circuit.json` (made-up data, for trying the controls only), then click in the arena to drop
obstacles (hold to make them bigger). In the 3D game, a Camera card lets you switch between a third-person chase view and
a free camera (arrow keys to move, click-and-drag to look around).

With the real data (Arch Linux commands; see the docs for details):

```bash
bash scripts/00_setup_venv.sh && source ~/flybrain-venv/bin/activate
mkdir -p ~/malecns && cd ~/malecns
bash /path/to/flybrain-dodge/scripts/01_download.sh                      # ~1.1 GB
python /path/to/flybrain-dodge/scripts/02_inspect_schema.py | tee inspect_output.txt
python /path/to/flybrain-dodge/scripts/03_export_circuit.py | tee report.txt   # needs ~4-5 GB RAM
cp flybrain_circuit.json /path/to/flybrain-dodge/game/
cd /path/to/flybrain-dodge/game && python -m http.server 8000
# open http://localhost:8000/fly_dodge.html or http://localhost:8000/fly_dodge_3d.html
```

(Or open either game from disk and choose `flybrain_circuit.json` with the file button.)

## Running the tests

```bash
cd tests && npm install          # installs jsdom, needed for ui_smoke.js and 3d/smoke3d.js
node sweep.js && node tune.js && node rain.js && node ui_smoke.js      # 2D
cd 3d && node test3d.js && node test3d_rain.js && node smoke3d.js      # 3D
```

## Read this before drawing conclusions

- The synapse counts are real. The step from descending-neuron activity to fly movement is a modelling choice, not a
  finding — and in the 3D game, climb/dive has no connectome basis at all (see the docs).
- `flybrain_circuit.json` is not included; script 03 creates it from the real tables.
- The test results in the docs come from a made-up stand-in circuit. Running the game on your real file is the real test.
- The 3D fly model is a 1999 digitized model the user supplied, unrelated to the connectome data; see the docs for what's
  known about its provenance.

Dataset: MaleCNS connectome, CC-BY, https://male-cns.janelia.org/. Credit it if you share results.
