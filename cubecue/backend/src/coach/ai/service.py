"""Verified fact bundles and approved coaching templates, never model-authored facts."""

import json
from collections import Counter

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from coach.ai import provider
from coach.recordings.analytics import VERSION, analyze
from coach.training.catalog import catalog

VERSION_ID = "grounded-coach-1"
DISCLOSURE = (
    "Only your selected goal, the verified fact IDs and text shown below, and approved "
    "coaching template/fact choices are sent to Ollama at 127.0.0.1:11434. "
    "No raw moves, cube states, recordings, video, images, solve IDs, dates, or full history "
    "are sent. Ollama may use a cloud model if its administrator configured one; "
    "choose a downloaded local model for local inference."
)
TEMPLATES = {
    "collect": (
        "Build your baseline",
        "Record a complete virtual solve, then return for a practice focus based on your own "
        "inputs.",
        "Record a solve",
        "/live-solve?mode=virtual",
    ),
    "review": (
        "Replay before repeating",
        "Replay this saved solve and choose one checkpoint to compare with an engine-verified "
        "alternative.",
        "Review this solve",
        None,
    ),
    "efficiency": (
        "Remove an avoidable detour",
        "Compare the recorded sequence with its exact-endpoint simplification. Practice that "
        "segment while preserving the same verified result.",
        "Compare your moves",
        None,
    ),
    "fluency": (
        "Make the next input deliberate",
        "Replay around the largest observed input gap. Rehearse that transition slowly, then "
        "record a fresh attempt. The gap does not establish thinking time or physical turn "
        "speed.",
        "Inspect the transition",
        None,
    ),
    "rotations": (
        "Explore your grip changes",
        "Replay the grip changes and compare a verified alternative. Fewer rotations alone do "
        "not prove a faster or more comfortable execution.",
        "Review grip changes",
        None,
    ),
    "checkpoint": (
        "Give one checkpoint your attention",
        "Replay this inferred checkpoint interval and practice its exact starting state. Its "
        "duration is not a measurement of recognition time.",
        "Open checkpoint review",
        None,
    ),
    "timing": (
        "Capture a trustworthy timing sample",
        "Record a fresh uninterrupted solve with the page visible. Keep this record for its "
        "verified moves; compare time only when timing integrity is valid.",
        "Record a new solve",
        "/live-solve?mode=virtual",
    ),
    "practice": (
        "Revisit your practice case",
        "Return to this case and check the objective before revealing the demonstration. "
        "Practice accuracy here does not measure execution speed.",
        "Open Algorithm Trainer",
        "/algorithm-trainer",
    ),
}


class Selection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    template_id: str
    fact_id: str


class ModelSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    selections: list[Selection] = Field(min_length=1, max_length=3)


def context(database):
    recent = database.list(20)["items"]
    model = provider.configured_model()
    return {
        "schema_version": 1,
        "provider": "ollama" if model else None,
        "configured": bool(model),
        "model": model,
        "disclosure": DISCLOSURE,
        "solves": [{k: row[k] for k in ("id", "created_at", "status", "source")} for row in recent],
        "recent_limit": 20,
    }


def bundle(database, solve_id):
    facts, choices = [], []

    def fact(identifier, text, template=None, href=None):
        facts.append({"id": identifier, "text": text, "source_href": href})
        if template:
            choices.append({"template_id": template, "fact_id": identifier})

    # Read only real persisted data. Counts include all records; no seeded samples.
    with database.connect() as db:
        total = db.execute("SELECT count(*) FROM solves").fetchone()[0]
        count = db.execute("SELECT count(*) FROM practice_attempts").fetchone()[0]
        attempts = db.execute(
            "SELECT case_id,result_json FROM practice_attempts ORDER BY created_at DESC,id LIMIT 20"
        ).fetchall()
    fact("history", f"You have {total} saved solve records and {count} saved practice attempts.")
    selected = None
    if solve_id:
        selected = database.get(solve_id)
        # Recompute with current canonical engine; do not trust stale derived snapshots.
        analysis = analyze(selected["recording"])
        href = f"/solve-analysis?solve={solve_id}"
        summary = analysis["summary"]
        fact(
            "solve",
            f"Selected {analysis['status']} {analysis['source']} record: "
            f"{summary['htm']} HTM. Replayed and hash-verified with {VERSION}.",
            "review",
            href,
        )
        removable = summary["htm"] - summary["simplified_htm"]
        if removable > 0:
            fact(
                "efficiency",
                f"Exact-endpoint simplification uses {summary['simplified_htm']} "
                f"HTM versus {summary['htm']} executed HTM: {removable} removable HTM. "
                "This is algebraic simplification, not a proof of an optimal solution.",
                "efficiency",
                href,
            )
        if summary["rotations"] > 0:
            fact(
                "rotations",
                f"The selected record contains {summary['rotations']} "
                "recorded grip rotations; rotations cost zero in the disclosed HTM metric.",
                "rotations",
                href,
            )
        if analysis["timing_available"]:
            fact(
                "duration",
                f"Selected record: {summary['elapsed_ms'] / 1000:.2f} seconds "
                "of manual virtual input timing, not physical cube turning or competition timing.",
            )
            gaps = analysis["input_gaps"] or []
            if gaps:
                gap = max(gaps, key=lambda row: row["duration_ms"])
                fact(
                    "gap",
                    f"Largest observed no-input gap: {gap['duration_ms'] / 1000:.2f} "
                    f"seconds, from {gap['start_ms'] / 1000:.2f} to "
                    f"{gap['end_ms'] / 1000:.2f} seconds; explicit practice pauses excluded.",
                    "fluency",
                    href,
                )
            stages = [s for s in analysis["stages"] if s["duration_ms"] is not None]
            if stages:
                stage = max(stages, key=lambda row: row["duration_ms"])
                fact(
                    "checkpoint",
                    f"Longest inferred checkpoint interval: {stage['label']}, "
                    f"{stage['duration_ms'] / 1000:.2f} seconds and {stage['htm']} HTM. "
                    "Combined goals share their interval; individual attribution is unavailable.",
                    "checkpoint",
                    href,
                )
        else:
            fact(
                "timing",
                "Timing integrity is uncertain or interrupted. Duration, TPS, "
                "and input-gap coaching are unavailable for this record.",
                "timing",
                href,
            )
    else:
        fact("baseline", "No solve is selected. No solve performance has been inferred.", "collect")
    known = {row["id"] for row in catalog()}
    eligible = [row for row in attempts if row["case_id"] in known]
    if eligible:
        failures = Counter(
            row["case_id"]
            for row in eligible
            if json.loads(row["result_json"]).get("success") is not True
        )
        case_id = failures.most_common(1)[0][0] if failures else eligible[0]["case_id"]
        sample = [row for row in eligible if row["case_id"] == case_id]
        successes = sum(json.loads(row["result_json"]).get("success") is True for row in sample)
        fact(
            "practice",
            f"Case {case_id}: {successes} engine-verified objective successes "
            f"in {len(sample)} attempts within the most recent 20 saved practice attempts. "
            "This bounded sample is not a long-term accuracy estimate.",
            "practice",
            f"/algorithm-trainer?case={case_id}",
        )
    return facts, choices, selected


def coach(database, solve_id=None, goal="balanced", use_model=False):
    facts, candidates, selected = bundle(database, solve_id)
    preferred = {
        "balanced": ["efficiency", "fluency", "practice", "checkpoint", "review"],
        "efficiency": ["efficiency", "rotations", "review", "practice"],
        "fluency": ["fluency", "checkpoint", "timing", "practice", "review"],
        "consistency": ["practice", "timing", "review", "checkpoint"],
    }[goal]
    rank = {name: i for i, name in enumerate(preferred)}
    picks = sorted(candidates, key=lambda row: rank.get(row["template_id"], 99))[:3]
    mode, status = "engine", "not_requested"
    model = provider.configured_model()
    if use_model:
        status = "not_configured"
        if model:
            try:
                # The provider receives text only, no source URLs (which contain record IDs).
                result = provider.select(
                    model, goal, [{"id": f["id"], "text": f["text"]} for f in facts], candidates
                )
                validated = ModelSelection.model_validate(result)
                actual = [row.model_dump() for row in validated.selections]
                keys = {(row["template_id"], row["fact_id"]) for row in actual}
                if len(keys) != len(actual) or any(row not in candidates for row in actual):
                    raise provider.ProviderError("rejected")
                picks, mode, status = actual, "ai", "used"
            except ValidationError:
                status = "rejected"
            except provider.ProviderError as error:
                status = error.code
    by_id = {fact["id"]: fact for fact in facts}
    recommendations = []
    for pick in picks:
        title, action, label, href = TEMPLATES[pick["template_id"]]
        source_href = by_id[pick["fact_id"]]["source_href"]
        recommendations.append(
            {
                **pick,
                "title": title,
                "action": action,
                "link_label": label,
                "href": source_href if pick["template_id"] == "practice" else href or source_href,
            }
        )
    return {
        "schema_version": 1,
        "version": VERSION_ID,
        "mode": mode,
        "provider_status": status,
        "model": model if mode == "ai" else None,
        "goal": goal,
        "solve_id": selected["id"] if selected else None,
        "facts": facts,
        "recommendations": recommendations,
        "disclosure": DISCLOSURE,
        "limitations": [
            "Advice uses saved manual virtual records and a bounded practice sample.",
            "Practice suggestions are exercises, not predictions of improvement or optimality.",
            "AI only selects and orders approved coaching templates; every displayed fact and "
            "action is supplied by CubeCue.",
        ],
    }
