"""Isolated third-party search; stdin/stdout are a small JSON-only protocol.

No upstream cube object escapes this process. The coordinator independently
validates the returned notation using the canonical engine.
"""

import json
import sys


def main():
    from rubik_solver import Cube, solve

    request = json.load(sys.stdin)
    candidate = solve(Cube.from_string(request["facelets"]), max_depth=request["max_depth"])
    print(json.dumps({"candidate": candidate}))


if __name__ == "__main__":
    main()
