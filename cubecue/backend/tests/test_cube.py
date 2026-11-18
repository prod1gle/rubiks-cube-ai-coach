"""Cube group laws, independent reference positions, and reachability rejection."""

import json
import random
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

from coach.cube import (
    CORNER_FACELETS,
    EDGE_FACELETS,
    FACES,
    MAX_MOVES,
    MAX_SEQUENCE_LENGTH,
    SOLVED_FACELETS,
    VALID_FRAMES,
    CubeError,
    CubeState,
    Move,
    format_sequence,
    htm_count,
    inverse_sequence,
    parse_sequence,
    sequence_info,
)

FIXTURES = json.loads((Path(__file__).parent / "fixtures/cubejs-1.3.2.json").read_text())
ALL_MOVES = [face + suffix for face in "UDLRFBxyz" for suffix in ("", "'", "2")]
SOLVED = CubeState()
STARTS = [SOLVED, SOLVED.apply("R U2 F' L D B2")]


def assert_error(code, function, *args):
    with pytest.raises(CubeError) as error:
        function(*args)
    assert error.value.code == code
    assert str(error.value)
    return error.value


def altered_facelets(changes):
    stickers = list(SOLVED_FACELETS)
    for indices in changes:
        values = [stickers[i] for i in indices]
        for i, value in zip(indices, values[1:] + values[:1], strict=True):
            stickers[i] = value
    return "".join(stickers)


@pytest.mark.parametrize("move", ALL_MOVES)
@pytest.mark.parametrize("start", STARTS)
def test_every_move_followed_by_inverse_is_identity(move, start):
    assert start.apply(move).apply(inverse_sequence(move)) == start
    assert start.apply(inverse_sequence(move)).apply(move) == start


@pytest.mark.parametrize("face", "UDLRFBxyz")
@pytest.mark.parametrize("start", STARTS)
def test_four_quarter_turns_are_identity(face, start):
    assert start.apply(" ".join([face] * 4)) == start
    assert start.apply(" ".join([face + "'"] * 4)) == start


@pytest.mark.parametrize("face", "UDLRFBxyz")
def test_double_turns_and_prime_powers(face):
    assert SOLVED.apply(f"{face}2 {face}2") == SOLVED
    assert SOLVED.apply(f"{face}2") == SOLVED.apply(f"{face} {face}")
    assert SOLVED.apply(f"{face}'") == SOLVED.apply(" ".join([face] * 3))


@pytest.mark.parametrize("case", FIXTURES["references"], ids=lambda c: c["sequence"] or "solved")
def test_named_reference_states_agree_with_cubejs(case):
    assert SOLVED.apply(case["sequence"]).to_facelets() == case["facelets"]


def test_1000_seeded_sequences_agree_with_independent_oracle():
    assert FIXTURES["oracle"] == "cubejs" and FIXTURES["version"] == "1.3.2"
    assert len(FIXTURES["random"]) == 1000
    for case in FIXTURES["random"]:
        state = SOLVED.apply(case["sequence"])
        assert state.to_facelets() == case["facelets"], case["sequence"]
        assert CubeState.from_facelets(case["facelets"]) == state


def test_1000_scrambles_and_inverses_cancel_without_input_mutation():
    for case in FIXTURES["random"]:
        sequence = case["sequence"]
        state = SOLVED.apply(sequence)
        assert state.apply(inverse_sequence(sequence)) == SOLVED, sequence
        assert inverse_sequence(inverse_sequence(sequence)) == format_sequence(sequence)
    assert SOLVED == CubeState()


def test_arbitrary_reachable_permutations_orientations_and_moves():
    # These cases were sampled directly in cubie coordinates by the independent
    # generator, rather than restricting inputs to our own generated scrambles.
    assert len(FIXTURES["arbitrary"]) == 128
    for case in FIXTURES["arbitrary"]:
        state = CubeState.from_dict(case["state"])
        assert state.to_facelets() == case["initial_facelets"]
        assert state.apply(case["sequence"]).to_facelets() == case["facelets"]
        assert state.apply(case["sequence"]).apply(inverse_sequence(case["sequence"])) == state
        assert CubeState.from_json(state.to_json()) == state


def test_published_r_turn_cubie_coordinates_and_sticker_indices():
    # Kociemba's published R coordinates; independent of geometric table generation.
    state = SOLVED.apply("R")
    assert state.cp == (4, 1, 2, 0, 7, 5, 6, 3)
    assert state.co == (2, 0, 0, 1, 1, 0, 0, 2)
    assert state.ep == (8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0)
    assert state.eo == (0,) * 12
    assert CORNER_FACELETS == (
        (8, 9, 20),
        (6, 18, 38),
        (0, 36, 47),
        (2, 45, 11),
        (29, 26, 15),
        (27, 44, 24),
        (33, 53, 42),
        (35, 17, 51),
    )
    assert EDGE_FACELETS == (
        (5, 10),
        (7, 19),
        (3, 37),
        (1, 46),
        (32, 16),
        (28, 25),
        (30, 43),
        (34, 52),
        (23, 12),
        (21, 41),
        (50, 39),
        (48, 14),
    )


def test_known_group_relations_and_non_commutativity():
    assert SOLVED.apply("R U R' U' " * 6) == SOLVED
    for a, b in (("R", "L"), ("U", "D"), ("F", "B")):
        for start in STARTS:
            assert start.apply(f"{a} {b}") == start.apply(f"{b} {a}")
    assert SOLVED.apply("R U") != SOLVED.apply("U R")


def test_rotations_only_change_the_frame_and_never_unsolve_a_solved_cube():
    for axis, frame in (("x", "FRDBLU"), ("y", "UBRDFL"), ("z", "LUFRDB")):
        for start in STARTS:
            rotated = start.apply(axis)
            assert (rotated.cp, rotated.co, rotated.ep, rotated.eo) == (
                start.cp,
                start.co,
                start.ep,
                start.eo,
            )
            assert rotated.frame == frame
            assert rotated.position_hash == start.position_hash
            assert rotated.state_hash != start.state_hash
            assert rotated.is_solved == start.is_solved
            assert htm_count(axis) == 0


@pytest.mark.parametrize("frame", sorted(VALID_FRAMES))
def test_all_24_proper_frames_roundtrip_full_nonuniform_states(frame):
    base = STARTS[1]
    state = CubeState(base.cp, base.co, base.ep, base.eo, frame)
    assert CubeState.from_facelets(state.to_facelets()) == state
    assert CubeState.from_dict(state.to_dict()) == state
    assert CubeState.from_json(state.to_json()) == state
    assert state.to_facelets(canonical=True) == base.to_facelets()
    assert set(state.to_facelets()) == set(FACES)


@pytest.mark.parametrize("axis,frame", [("x", "FRDBLU"), ("y", "UBRDFL"), ("z", "LUFRDB")])
def test_grip_changes_remap_later_face_turns(axis, frame):
    for local, physical in zip(FACES, frame, strict=True):
        for suffix in ("", "2", "'"):
            assert SOLVED.apply(f"{axis} {local}{suffix} {axis}'") == SOLVED.apply(
                physical + suffix
            )


def test_frame_geometry_is_a_group_of_exactly_24_orientations():
    pending, seen = [SOLVED], set()
    while pending:
        state = pending.pop()
        if state.frame in seen:
            continue
        seen.add(state.frame)
        pending.extend(state.apply(axis) for axis in "xyz")
    assert seen == VALID_FRAMES and len(seen) == 24


@pytest.mark.parametrize(
    "text,normalized",
    [
        ("", ""),
        (" \n\t ", ""),
        ("RUR'U'", "R U R' U'"),
        ("(R U) (R’ (U′))", "R U R' U'"),
        ("R2' x2’ y‘ z", "R2 x2 y' z"),
        ("() (())", ""),
    ],
)
def test_parser_normalizes_supported_notation(text, normalized):
    assert format_sequence(parse_sequence(text)) == normalized
    assert SOLVED.apply(text) == SOLVED.apply(normalized)


@pytest.mark.parametrize(
    "text,position,code",
    [
        ("R Q", 2, "notation_token"),
        ("R3", 1, "notation_token"),
        ("R''", 2, "notation_token"),
        ("R'2", 2, "notation_token"),
        ("R U)", 3, "notation_group"),
        ("(R U", 0, "notation_group"),
        ("(R U)3", 5, "notation_token"),
        ("Rw", 1, "notation_token"),
        ("M", 0, "notation_token"),
        ("r", 0, "notation_token"),
        ("X", 0, "notation_token"),
        ("R, U", 1, "notation_token"),
        ("[R,U]", 0, "notation_token"),
    ],
)
def test_parser_rejects_entire_invalid_sequence_with_position(text, position, code):
    before = STARTS[1].to_json()
    error = assert_error(code, STARTS[1].apply, text)
    assert error.position == position
    assert STARTS[1].to_json() == before
    assert error.as_dict()["position"] == position


def test_notation_limits_and_invalid_programmatic_moves():
    assert_error("notation_type", parse_sequence, None)
    assert_error("notation_limit", parse_sequence, " " * (MAX_SEQUENCE_LENGTH + 1))
    assert_error("notation_limit", parse_sequence, "R " * (MAX_MOVES + 1))
    assert_error("notation_limit", parse_sequence, "(" * 17 + "R" + ")" * 17)
    assert_error("notation_type", format_sequence, ["R"])
    assert_error("notation_limit", format_sequence, [Move("R")] * (MAX_MOVES + 1))
    for face, turns in (("Q", 1), ("UR", 1), ("", 1), ("R", 0), ("R", True), ("R", 4)):
        assert_error("move", Move, face, turns)


@pytest.mark.parametrize(
    "sequence,cost",
    [
        ("", 0),
        ("R R'", 2),
        ("R R", 2),
        ("R2", 1),
        ("x y2 z'", 0),
        ("x R2 y' U' F B L D", 6),
    ],
)
def test_htm_counts_executed_face_actions_not_rotations_or_simplified_words(sequence, cost):
    assert htm_count(sequence) == cost
    assert htm_count(inverse_sequence(sequence)) == cost


def test_sequence_info_keeps_rotation_and_face_action_counts_separate():
    assert sequence_info("(x R2') U’") == {
        "normalized": "x R2 U'",
        "inverse": "U R2 x'",
        "htm": 2,
        "metric": "HTM-outer-v1",
        "face_turns": 2,
        "rotations": 1,
    }


@pytest.mark.parametrize(
    "facelets,code",
    [
        ("", "facelet_length"),
        (SOLVED_FACELETS[:-1], "facelet_length"),
        ("X" + SOLVED_FACELETS[1:], "facelet_color"),
        ("u" + SOLVED_FACELETS[1:], "facelet_color"),
        ("R" + SOLVED_FACELETS[1:], "color_counts"),
        (altered_facelets([(4, 31)]), "center_orientation"),
        (altered_facelets([(5, 10)]), "edge_orientation"),
        (altered_facelets([(8, 9, 20)]), "corner_orientation"),
        (altered_facelets([(5, 7), (10, 19)]), "permutation_parity"),
        (altered_facelets([(8, 6), (9, 18), (20, 38)]), "permutation_parity"),
        (altered_facelets([(9, 20)]), "corner_identity"),
        (altered_facelets([(10, 28)]), "edge_identity"),
        (altered_facelets([(5, 28)]), "edge_permutation"),
    ],
)
def test_invalid_facelet_states_are_rejected_even_when_color_counts_match(facelets, code):
    assert_error(code, CubeState.from_facelets, facelets)


def test_whitespace_in_facelet_import_is_explicitly_accepted():
    assert CubeState.from_facelets("\n".join(face * 9 for face in FACES)) == SOLVED
    assert_error("facelet_type", CubeState.from_facelets, ["U"] * 54)
    assert_error("facelet_length", CubeState.from_facelets, " " * 10_001)


@pytest.mark.parametrize(
    "key,value,code",
    [
        ("cp", [0] * 8, "corner_permutation"),
        ("ep", [0] * 12, "edge_permutation"),
        ("co", [1] + [0] * 7, "corner_orientation"),
        ("eo", [1] + [0] * 11, "edge_orientation"),
        ("cp", [1, 0, 2, 3, 4, 5, 6, 7], "permutation_parity"),
        ("ep", [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "permutation_parity"),
        ("co", [3] + [0] * 7, "array_value"),
        ("eo", [2] + [0] * 11, "array_value"),
        ("cp", [-1] + list(range(1, 8)), "array_value"),
        ("cp", [True] + list(range(1, 8)), "array_value"),
        ("cp", [0.0] + list(range(1, 8)), "array_value"),
        ("cp", ["0"] + list(range(1, 8)), "array_value"),
        ("cp", list(range(7)), "array_shape"),
        ("ep", None, "array_shape"),
        ("co", "00000000", "array_shape"),
        ("frame", "DRFULB", "center_orientation"),
        ("frame", "UUUUUU", "center_orientation"),
        ("frame", [], "center_orientation"),
        ("schema_version", 2, "schema_version"),
        ("schema_version", True, "schema_version"),
    ],
)
def test_invalid_serialized_coordinates_are_rejected_without_coercion(key, value, code):
    data = SOLVED.to_dict()
    data[key] = value
    assert_error(code, CubeState.from_dict, data)


def test_reachability_allows_balanced_orientations_and_matched_odd_permutations():
    state = CubeState(
        (1, 0, 2, 3, 4, 5, 6, 7),
        (1, 2, 0, 0, 0, 0, 0, 0),
        (1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11),
        (1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    )
    assert CubeState.from_facelets(state.to_facelets()) == state


def test_json_schema_errors_duplicate_keys_and_non_objects():
    for text in ("{", "null", "[]", '"text"', "[1,2]", "[" * 1024 + "0" + "]" * 1024):
        with pytest.raises(CubeError):
            CubeState.from_json(text)
    assert_error("state_json", CubeState.from_json, '{"cp":[],"cp":[]}')
    assert_error("state_json", CubeState.from_json, " " * 10_001)
    assert_error("state_json", CubeState.from_json, None)
    assert_error("state_type", CubeState.from_dict, [])
    data = SOLVED.to_dict()
    del data["frame"]
    assert_error("state_fields", CubeState.from_dict, data)
    assert_error("state_fields", CubeState.from_dict, SOLVED.to_dict() | {"unknown": 0})


def test_immutable_states_and_serialization_cannot_alias_mutable_inputs():
    original = list(range(8))
    state = CubeState(cp=original)
    original[0] = 7
    assert state.cp == tuple(range(8))
    with pytest.raises(FrozenInstanceError):
        state.frame = "FRDBLU"
    serialized = state.to_dict()
    serialized["cp"][0] = 7
    assert state == SOLVED
    assert CubeState.from_json(state.to_json()).to_json() == state.to_json()


def test_snapshot_is_derived_from_canonical_state_and_has_no_mutable_aliases():
    state = STARTS[1].apply("x y")
    snapshot = state.snapshot()
    assert "".join(face["stickers"] for face in snapshot["faces"]) == state.to_facelets()
    assert snapshot["state_hash"] == state.state_hash
    assert snapshot["position_hash"] == state.position_hash
    assert snapshot["is_solved"] is False
    assert snapshot["state"] == state.to_dict()
    assert "".join(face["center"] for face in snapshot["faces"]) == state.frame
    snapshot["state"]["cp"][0] = 0
    assert state == STARTS[1].apply("x y")


def test_random_long_scramble_and_repeated_serialization():
    rng = random.Random(20261112)
    sequence = " ".join(rng.choice(ALL_MOVES) for _ in range(500))
    state = SOLVED.apply(sequence)
    assert CubeState.from_facelets(state.to_facelets()) == state
    assert state.apply(inverse_sequence(sequence)) == SOLVED
