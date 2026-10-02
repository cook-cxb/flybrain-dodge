#!/usr/bin/env bash
# Downloads the three tables the project needs (about 1.1 GB in total). -C - resumes an interrupted download.
set -e
BASE=https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome
curl -C - -O $BASE/body-annotations-male-cns-v1.0-minconf-0.5.feather
curl -C - -O $BASE/body-neurotransmitters-male-cns-v1.0.feather
curl -C - -O $BASE/connectome-weights-male-cns-v1.0-minconf-0.5.feather
