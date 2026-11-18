#!/usr/bin/env python3
"""Evaluate annotated real captures; never seeds performance records in the app."""
import argparse
import json
from pathlib import Path

from coach.vision.evaluation import evaluate

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('manifest', type=Path)
parser.add_argument('--allow-controlled-test', action='store_true')
args = parser.parse_args()
manifest = json.loads(args.manifest.read_text())
if manifest.get('dataset_kind') != 'physical-webcam' and not args.allow_controlled_test:
    parser.error('Physical evidence required; --allow-controlled-test is only for synthetic testing.')
print(json.dumps(evaluate(manifest, args.manifest.parent), indent=2, allow_nan=False))
