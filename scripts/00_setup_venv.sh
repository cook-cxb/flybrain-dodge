#!/usr/bin/env bash
# Create an isolated Python environment (Arch Linux refuses system-wide pip installs: PEP 668).
set -e
python -m venv ~/flybrain-venv
source ~/flybrain-venv/bin/activate
pip install pandas pyarrow
echo "Done. In every new terminal run:  source ~/flybrain-venv/bin/activate"
