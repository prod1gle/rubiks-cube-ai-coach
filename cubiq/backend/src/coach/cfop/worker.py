"""Bounded-process CFOP candidate generation. No two-phase solver dependency."""

import json
import sys

from coach.cfop.pipeline import build_candidate
from coach.cube import CubeState


def main():
    request = json.load(sys.stdin)
    print(json.dumps({"stages": build_candidate(CubeState.from_dict(request["state"]))}))


if __name__ == "__main__":
    main()
