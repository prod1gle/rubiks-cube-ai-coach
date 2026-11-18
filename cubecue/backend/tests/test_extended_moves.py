"""Wide/slice physics and animation checked against independent sticker matrices."""

import random

import pytest
from fastapi.testclient import TestClient
from test_cube_animation import rotate, stickers

from coach.cube import (
    VALID_FRAMES,
    CubeState,
    format_sequence,
    htm_count,
    inverse_sequence,
    parse_sequence,
    plan_sequence,
    sequence_info,
)
from coach.main import create_app

BASES = ("Rw", "Lw", "Uw", "Dw", "Fw", "Bw", "M", "E", "S")
TOKENS = tuple(f + s for f in BASES for s in ("", "'", "2"))


@pytest.mark.parametrize("base", BASES)
@pytest.mark.parametrize("frame", VALID_FRAMES)
def test_all_extended_actions_in_every_grip_are_reversible(base, frame):
    start = CubeState(frame=frame).apply("F R U2 B L D'")
    assert start.apply(" ".join([base] * 4)) == start
    for suffix in ("", "'", "2"):
        token = base + suffix
        assert start.apply(token).apply(inverse_sequence(token)) == start
        assert CubeState.from_facelets(start.apply(token).to_facelets()) == start.apply(token)


@pytest.mark.parametrize("token", TOKENS)
@pytest.mark.parametrize("frame", VALID_FRAMES)
def test_simultaneous_layer_stickers_and_animation_match(token, frame):
    state = CubeState(frame=frame).apply("R F2 U B D'")
    base = next(b for b in BASES if token.startswith(b))
    axis_face = {"M": "L", "E": "D", "S": "F"}.get(base, base[0])
    axes = {
        "U": (0, 1, 0),
        "R": (1, 0, 0),
        "F": (0, 0, 1),
        "D": (0, -1, 0),
        "L": (-1, 0, 0),
        "B": (0, 0, -1),
    }
    axis = axes[axis_face]
    quarters = 1 if token.endswith("'") else -2 if token.endswith("2") else -1
    before = state.snapshot()
    expected = {}
    for (position, normal), color in stickers(before).items():
        projection = sum(a * b for a, b in zip(position, axis, strict=True))
        affected = projection >= 0 if base.endswith("w") else projection == 0
        if affected:
            position, normal = rotate(position, axis, quarters), rotate(normal, axis, quarters)
        expected[position, normal] = color
    step = plan_sequence(state, token)["steps"][0]
    assert len(step["animation"]["affected"]) == (17 if base.endswith("w") else 8)
    assert step["animation"]["axis"] == list(axis)
    assert step["animation"]["quarter_turns"] == quarters
    assert stickers(step["snapshot"]) == expected
    assert step["htm"] == (1 if base.endswith("w") else 2)
    assert not step["rotation"]
    restored = {}
    descriptor = step["inverse_animation"]
    for cubie in step["snapshot"]["cubies"]:
        for sticker in cubie["stickers"]:
            position, normal = tuple(cubie["position"]), tuple(sticker["normal"])
            if cubie["id"] in descriptor["affected"]:
                position = rotate(position, descriptor["axis"], descriptor["quarter_turns"])
                normal = rotate(normal, descriptor["axis"], descriptor["quarter_turns"])
            restored[position, normal] = sticker["color"]
    assert restored == stickers(before)


def test_extended_parser_counting_and_mixed_sequences():
    assert format_sequence("r l' u2 d f b' M E2' S′") == "Rw Lw' Uw2 Dw Fw Bw' M E2 S'"
    assert htm_count("Rw Rw2 M M2 S' E2 x y'") == 10
    info = sequence_info("M2 Rw x")
    assert info["htm"] == 3 and info["rotations"] == 1 and info["face_turns"] == 2
    rng = random.Random(1847)
    for _ in range(20):
        word = " ".join(rng.choice((*TOKENS, "R", "U2", "x", "y'")) for _ in range(40))
        state = CubeState().apply("R U F2")
        assert state.apply(word).apply(inverse_sequence(word)) == state


def test_extended_plan_api_remains_one_action_and_invalid_suffix_atomic(tmp_path):
    with TestClient(create_app(tmp_path / "keys.sqlite3")) as client:
        response = client.post(
            "/api/cube/plan", json={"state": CubeState().to_dict(), "sequence": "M' Rw Uw2"}
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert len(data["steps"]) == 3 and data["sequence"]["htm"] == 4
        assert [s["token"] for s in data["steps"]] == ["M'", "Rw", "Uw2"]
        for invalid in ("Rww", "Mw", "rw", "M3", "Rw2xq"):
            assert (
                client.post(
                    "/api/cube/plan", json={"state": CubeState().to_dict(), "sequence": invalid}
                ).status_code
                == 422
            )
        assert len(parse_sequence("Rw2'")) == 1
