"""Actual engine-derived responses for UI transport tests only; never runtime demos."""
import json
from pathlib import Path

from coach.analysis.service import compare, practice
from coach.cube import CubeState, plan_sequence

initial = CubeState().apply("z2 B U' B'")
word = "B U U U U U B'"
result = compare(initial, word, 0, 7, "training")
result["elapsed_ms"] = 12.0
request = {"facelets": initial.to_facelets(), "sequence": word, "start": 0, "end": 7, "objective": "training", "goal": "auto"}
candidate = result["alternatives"][0]
fixture = {"input": request, "reply": result, "practice": practice(initial, word, 0, 7, candidate["notation"]), "retryPlan": plan_sequence(initial, candidate["notation"])}
Path("cubecue/src/test/cube-analysis.json").write_text(json.dumps(fixture, separators=(",", ":")) + "\n")
