"""Renderer descriptors must land on the engine's exact 54-sticker state."""

import pytest
from fastapi.testclient import TestClient

from coach.cube import CubeError, CubeState, plan_sequence, random_scramble
from coach.main import create_app


def stickers(snapshot):
    return {
        (tuple(cubie["position"]), tuple(sticker["normal"])): sticker["color"]
        for cubie in snapshot["cubies"]
        for sticker in cubie["stickers"]
    }


def rotate(vector, axis, quarters):
    # Independent signed-axis matrices, not the engine's _clockwise function.
    x, y, z = vector
    sign = next(value for value in axis if value)
    for _ in range((quarters * sign) % 4):
        if axis[0]:
            x, y, z = x, -z, y
        elif axis[1]:
            x, y, z = z, y, -x
        else:
            x, y, z = -y, x, z
    return x, y, z


@pytest.mark.parametrize("prefix", ["", "x y", "R U F2 x' z"])
@pytest.mark.parametrize("token", [f + s for f in "URFDLBxyz" for s in ("", "'", "2")])
def test_every_descriptor_matches_the_engine_and_its_inverse(prefix, token):
    state = CubeState().apply(prefix)
    before = state.snapshot()
    plan = plan_sequence(state, token)
    step = plan["steps"][0]
    animation = step["animation"]
    assert plan["input_hash"] == before["state_hash"] == step["before_hash"]
    assert len(before["cubies"]) == 26
    assert len(stickers(before)) == 54
    assert all(tuple(c["position"]) != (0, 0, 0) for c in before["cubies"])
    assert len(animation["affected"]) == (26 if token[0] in "xyz" else 9)
    for source, target, descriptor in (
        (before, step["snapshot"], animation),
        (step["snapshot"], before, step["inverse_animation"]),
    ):
        transformed = {}
        for cubie in source["cubies"]:
            for sticker in cubie["stickers"]:
                position, normal = tuple(cubie["position"]), tuple(sticker["normal"])
                if cubie["id"] in descriptor["affected"]:
                    position = rotate(position, descriptor["axis"], descriptor["quarter_turns"])
                    normal = rotate(normal, descriptor["axis"], descriptor["quarter_turns"])
                transformed[position, normal] = sticker["color"]
        assert transformed == stickers(target)


def test_full_sequence_validates_before_any_plan_is_returned():
    state = CubeState().apply("R U")
    with pytest.raises(CubeError, match="Unsupported"):
        plan_sequence(state, "F B Q")
    with pytest.raises(CubeError, match="128"):
        plan_sequence(state, "R " * 129)
    assert plan_sequence(state, "()")["steps"] == []


def test_plan_continuity_and_accumulated_cost():
    state = CubeState().apply("x")
    plan = plan_sequence(state, "R2 y' U F'")
    assert plan["sequence"]["htm"] == 3
    for step in plan["steps"]:
        assert step["before_hash"] == state.state_hash
        state = state.apply(step["token"])
        assert step["snapshot"]["state"] == state.to_dict()


def test_scrambles_are_real_legal_random_move_walks():
    words = {random_scramble() for _ in range(8)}
    assert len(words) > 1
    for word in words:
        tokens = word.split()
        assert len(tokens) == 20
        assert all(a[0] != b[0] for a, b in zip(tokens, tokens[1:], strict=False))
        plan = plan_sequence(CubeState(), word)
        assert plan["sequence"]["htm"] == 20
        assert CubeState.from_dict(plan["steps"][-1]["snapshot"]["state"])


def test_real_animation_endpoints_and_invalid_requests():
    with TestClient(create_app()) as client:
        state = CubeState().apply("x R").to_dict()
        plan = client.post("/api/cube/plan", json={"state": state, "sequence": "U2 F'"})
        assert plan.status_code == 200
        assert len(plan.json()["steps"]) == 2
        scramble = client.post("/api/cube/scramble", json={"state": state})
        assert scramble.status_code == 200
        assert len(scramble.json()["steps"]) == 20
        assert (
            client.post("/api/cube/plan", json={"state": state, "sequence": "R Q"}).status_code
            == 422
        )
