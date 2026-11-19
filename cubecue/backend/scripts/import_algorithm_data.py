"""Extract notation as data from the pinned MIT-licensed upstream Dart catalog.

Usage: python scripts/import_algorithm_data.py /path/alg_data.dart /path/LICENSE
No Dart or other upstream code is executed. Review and run engine tests afterward.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_bytes()
assert (
    hashlib.sha256(raw).hexdigest()
    == "672929a329ff3bad3fa893829ba47d5bf0f7d9be3eba64377e2026c526aa1e85"
), "Upstream content differs from the pinned revision"
text = raw.decode()
sets = re.split(r'  AlgSet\(id: "', text)[1:]
rows = []
for block in sets:
    set_id = block.split('"', 1)[0]
    if set_id not in ("f2l", "oll", "pll"):
        continue
    for match in re.finditer(
        r'AlgCase\(id: ("[^"\n]+"),.*?setup: ("[^"\n]*"),'
        r"\s*algs: (\[[^\n]*\]),\s*sources: (\[[^\n]*\])",
        block,
        re.S,
    ):
        case, setup, algs, sources = map(json.loads, match.groups())
        for alg, source in zip(algs, sources, strict=True):
            rows.append(
                {
                    "stage": set_id.upper(),
                    "source_case": case,
                    "original": alg,
                    "source": source,
                    "url": (
                        "https://www.cubeskills.com/uploads/pdf/tutorials/oll-algorithms.pdf"
                        if source == "CubeSkills"
                        else f"https://www.speedcubedb.com/a/3x3/{set_id.upper()}/"
                        + (case.removeprefix("PLL ") if set_id == "pll" else case.replace(" ", "_"))
                    ),
                }
            )
assert {
    s: len({r["source_case"] for r in rows if r["stage"] == s}) for s in ("F2L", "OLL", "PLL")
} == {"F2L": 41, "OLL": 57, "PLL": 21}
data = {
    "schema_version": 1,
    "version": "alternatives-1",
    "retrieved": "2026-11-19",
    "source": "https://github.com/cellonty/cube-trainer/blob/81272971cc1e212a32645badf3292ea7153d8746/lib/data/alg_data.dart",
    "source_sha256": hashlib.sha256(raw).hexdigest(),
    "license": "MIT; see CUBE_TRAINER_LICENSE.txt",
    "policy": (
        "Notation data only. Source labels do not establish recognition or correctness; "
        "every candidate is matched and verified by coach.cube. At most four efficient choices, "
        "including the original baseline, are exposed for an exact state."
    ),
    "algorithms": rows,
}
(Path(__file__).resolve().parents[1] / "src/coach/cfop/data/alternatives.json").write_text(
    json.dumps(data, indent=2) + "\n"
)
(Path(__file__).resolve().parents[1] / "src/coach/cfop/data/CUBE_TRAINER_LICENSE.txt").write_bytes(
    Path(sys.argv[2]).read_bytes()
)
print(len(rows), {s: sum(r["stage"] == s for r in rows) for s in ("F2L", "OLL", "PLL")})
