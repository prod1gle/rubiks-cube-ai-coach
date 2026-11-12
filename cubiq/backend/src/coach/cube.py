"""The sole 3x3 rules implementation. See docs/CUBE_CONVENTIONS.md.

Immutable, center-relative cubies are canonical. A separate proper rotation frame
describes the current grip. Facelet strings and move tables are derived from this
model; the frontend and API must not implement alternative move semantics.
"""

import json
from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from functools import lru_cache
from hashlib import sha256
from random import SystemRandom
from typing import Any

FACES = "URFDLB"
ROTATIONS = "xyz"
SCHEMA_VERSION = 1
ENGINE_VERSION = "cube-v1"
METRIC = "HTM-outer-v1"
MAX_SEQUENCE_LENGTH = 10_000
MAX_MOVES = 2_048
MAX_GROUP_DEPTH = 16
SOLVED_FACELETS = "".join(face * 9 for face in FACES)
CORNER_NAMES = ("URF", "UFL", "ULB", "UBR", "DFR", "DLF", "DBL", "DRB")
EDGE_NAMES = ("UR", "UF", "UL", "UB", "DR", "DF", "DL", "DB", "FR", "FL", "BL", "BR")
PALETTE = {
    "U": "#f0eee5",
    "R": "#d86763",
    "F": "#8fc47c",
    "D": "#edce65",
    "L": "#e59a56",
    "B": "#739ece",
}

Vector = tuple[int, int, int]
Cubies = tuple[tuple[int, ...], tuple[int, ...], tuple[int, ...], tuple[int, ...]]
_NORMALS: dict[str, Vector] = {
    "U": (0, 1, 0),
    "R": (1, 0, 0),
    "F": (0, 0, 1),
    "D": (0, -1, 0),
    "L": (-1, 0, 0),
    "B": (0, 0, -1),
}


class CubeError(ValueError):
    """A user-facing validation/notation error with a stable machine code."""

    def __init__(self, code: str, message: str, position: int | None = None):
        super().__init__(message)
        self.code = code
        self.position = position

    def as_dict(self) -> dict[str, Any]:
        result = {"code": self.code, "message": str(self)}
        if self.position is not None:
            result["position"] = self.position
        return result


def _dot(a: Vector, b: Vector) -> int:
    return sum(x * y for x, y in zip(a, b, strict=True))


def _clockwise(v: Vector, axis: Vector) -> Vector:
    """Exact -90 degrees about the outward axis: no floating-point rotations."""
    x, y, z = v
    a, b, c = axis
    projection = _dot(v, axis)
    return (
        a * projection - (b * z - c * y),
        b * projection - (c * x - a * z),
        c * projection - (a * y - b * x),
    )


def _sticker_position(face: str, row: int, column: int) -> Vector:
    """Row/column are viewed directly from outside each face, not through it."""
    match face:
        case "U":
            return (column - 1, 1, row - 1)
        case "R":
            return (1, 1 - row, 1 - column)
        case "F":
            return (column - 1, 1 - row, 1)
        case "D":
            return (column - 1, -1, 1 - row)
        case "L":
            return (-1, 1 - row, column - 1)
        case "B":
            return (1 - column, 1 - row, -1)
    raise AssertionError("Unknown internal face")


_STICKERS = tuple(
    (_sticker_position(face, row, column), _NORMALS[face])
    for face in FACES
    for row in range(3)
    for column in range(3)
)
_STICKER_INDEX = {sticker: index for index, sticker in enumerate(_STICKERS)}


def _piece_indices(names: tuple[str, ...]) -> tuple[tuple[int, ...], ...]:
    result = []
    for name in names:
        position = tuple(sum(_NORMALS[face][i] for face in name) for i in range(3))
        result.append(tuple(_STICKER_INDEX[(position, _NORMALS[face])] for face in name))
    return tuple(result)


CORNER_FACELETS = _piece_indices(CORNER_NAMES)
EDGE_FACELETS = _piece_indices(EDGE_NAMES)


def _rotation_permutation(axis: str) -> tuple[int, ...]:
    # Local destination face -> previous local face. Rotations follow R, U, F.
    normal_to_face = {normal: i for i, normal in enumerate(_NORMALS.values())}
    permutation = [0] * 6
    for old, normal in enumerate(_NORMALS.values()):
        permutation[normal_to_face[_clockwise(normal, _NORMALS[axis])]] = old
    return tuple(permutation)


_ROTATION_PERMUTATIONS = {
    rotation: _rotation_permutation(axis) for rotation, axis in zip(ROTATIONS, "RUF", strict=True)
}


def _rotate_frame(frame: str, rotation: str) -> str:
    return "".join(frame[i] for i in _ROTATION_PERMUTATIONS[rotation])


def _all_frames() -> frozenset[str]:
    frames, pending = {FACES}, [FACES]
    while pending:
        current = pending.pop()
        for axis in ROTATIONS:
            frame = _rotate_frame(current, axis)
            if frame not in frames:
                frames.add(frame)
                pending.append(frame)
    assert len(frames) == 24
    return frozenset(frames)


VALID_FRAMES = _all_frames()


@lru_cache(maxsize=24)
def _frame_sticker_map(frame: str) -> tuple[int, ...]:
    # Viewer axes, expressed in the canonical frame. Inverse basis projects the
    # entire canonical cube (including sticker positions) into the current grip.
    basis = tuple(_NORMALS[frame[FACES.index(face)]] for face in "RUF")
    return tuple(
        _STICKER_INDEX[
            (
                tuple(_dot(position, axis) for axis in basis),
                tuple(_dot(normal, axis) for axis in basis),
            )
        ]
        for position, normal in _STICKERS
    )


def _permute_facelets(facelets: str, source_to_destination: tuple[int, ...]) -> str:
    result = [""] * 54
    for source, destination in enumerate(source_to_destination):
        result[destination] = facelets[source]
    return "".join(result)


def _decode_canonical(facelets: str) -> Cubies:
    """Recognize oriented, handed pieces. Never infer missing/invalid stickers."""
    permutations, orientations = [], []
    for kind, names, indices in (
        ("corner", CORNER_NAMES, CORNER_FACELETS),
        ("edge", EDGE_NAMES, EDGE_FACELETS),
    ):
        permutation, orientation = [], []
        for position, stickers in enumerate(indices):
            colors = "".join(facelets[i] for i in stickers)
            match = next(
                (
                    (piece, turn)
                    for piece, name in enumerate(names)
                    for turn in range(len(name))
                    if all(colors[(n + turn) % len(name)] == color for n, color in enumerate(name))
                ),
                None,
            )
            if match is None:
                raise CubeError(
                    f"{kind}_identity",
                    f"Invalid {kind} at {names[position]}: {colors}. "
                    "Stickers must form a real, correctly handed cubie.",
                )
            permutation.append(match[0])
            orientation.append(match[1])
        permutations.append(tuple(permutation))
        orientations.append(tuple(orientation))
    return permutations[0], orientations[0], permutations[1], orientations[1]


def _make_face_turn(face: str) -> Cubies:
    axis = _NORMALS[face]
    destinations = []
    for position, normal in _STICKERS:
        if _dot(position, axis) == 1:
            position, normal = _clockwise(position, axis), _clockwise(normal, axis)
        destinations.append(_STICKER_INDEX[(position, normal)])
    return _decode_canonical(_permute_facelets(SOLVED_FACELETS, tuple(destinations)))


# Mathematical tables derived from integer sticker geometry, not copied from an
# oracle library. Once generated, every state transition uses canonical cubies.
_FACE_TURNS = {face: _make_face_turn(face) for face in FACES}


def _parity(permutation: tuple[int, ...]) -> int:
    return sum(a > b for i, a in enumerate(permutation) for b in permutation[i + 1 :]) % 2


def _integer_tuple(value: Any, name: str, size: int, maximum: int) -> tuple[int, ...]:
    if not isinstance(value, (tuple, list)) or len(value) != size:
        raise CubeError("array_shape", f"{name} must contain exactly {size} integers.")
    if any(type(item) is not int or not 0 <= item <= maximum for item in value):
        raise CubeError("array_value", f"{name} entries must be integers from 0 to {maximum}.")
    return tuple(value)


@dataclass(frozen=True, slots=True)
class Move:
    face: str
    turns: int = 1

    def __post_init__(self):
        if not isinstance(self.face, str) or self.face not in (*FACES, *ROTATIONS):
            raise CubeError("move", "Moves must be U, D, L, R, F, B, x, y, or z.")
        if type(self.turns) is not int or self.turns not in (1, 2, 3):
            raise CubeError("move", "Quarter-turn amount must be 1, 2, or 3.")

    @property
    def is_rotation(self) -> bool:
        return self.face in ROTATIONS

    def inverse(self) -> "Move":
        return Move(self.face, 4 - self.turns)

    def __str__(self) -> str:
        return self.face + {1: "", 2: "2", 3: "'"}[self.turns]


def parse_sequence(text: str) -> tuple[Move, ...]:
    """Parse the complete input atomically. Position is a zero-based character offset."""
    if not isinstance(text, str):
        raise CubeError("notation_type", "Notation must be a string.")
    if len(text) > MAX_SEQUENCE_LENGTH:
        raise CubeError("notation_limit", f"Notation exceeds {MAX_SEQUENCE_LENGTH} characters.")
    normalized = text.translate(str.maketrans({"’": "'", "‘": "'", "′": "'"}))
    stack: list[tuple[int, list[Move]]] = [(0, [])]
    i, count = 0, 0
    while i < len(normalized):
        char = normalized[i]
        if char.isspace():
            i += 1
            continue
        if char == "(":
            if len(stack) > MAX_GROUP_DEPTH:
                raise CubeError("notation_limit", "Too many nested groups.", i)
            stack.append((i, []))
            i += 1
            continue
        if char == ")":
            if len(stack) == 1:
                raise CubeError("notation_group", "Closing parenthesis has no opening group.", i)
            _, group = stack.pop()
            stack[-1][1].extend(group)
            i += 1
            continue
        if char not in (*FACES, *ROTATIONS):
            raise CubeError(
                "notation_token",
                f"Unsupported notation {text[i]!r} at character {i + 1}. "
                "Use U D L R F B or x y z with optional prime or 2.",
                i,
            )
        i += 1
        turns = 1
        if i < len(normalized) and normalized[i] == "2":
            turns, i = 2, i + 1
            if i < len(normalized) and normalized[i] == "'":
                i += 1  # R2' and R2 have exactly the same effect.
        elif i < len(normalized) and normalized[i] == "'":
            turns, i = 3, i + 1
        stack[-1][1].append(Move(char, turns))
        count += 1
        if count > MAX_MOVES:
            raise CubeError("notation_limit", f"At most {MAX_MOVES} moves are allowed.", i)
    if len(stack) != 1:
        raise CubeError("notation_group", "Opening parenthesis has no closing group.", stack[-1][0])
    return tuple(stack[0][1])


def _moves(sequence: str | Sequence[Move]) -> tuple[Move, ...]:
    if isinstance(sequence, str):
        return parse_sequence(sequence)
    if not isinstance(sequence, (list, tuple)) or any(not isinstance(m, Move) for m in sequence):
        raise CubeError(
            "notation_type", "A sequence must be notation or a list/tuple of Move objects."
        )
    if len(sequence) > MAX_MOVES:
        raise CubeError("notation_limit", f"At most {MAX_MOVES} moves are allowed.")
    return tuple(sequence)


def format_sequence(sequence: str | Sequence[Move]) -> str:
    return " ".join(str(move) for move in _moves(sequence))


def inverse_sequence(sequence: str | Sequence[Move]) -> str:
    return format_sequence(tuple(move.inverse() for move in reversed(_moves(sequence))))


def htm_count(sequence: str | Sequence[Move]) -> int:
    """Executed HTM: each face action costs one, including a double; rotations cost zero."""
    return sum(not move.is_rotation for move in _moves(sequence))


def sequence_info(sequence: str | Sequence[Move]) -> dict[str, Any]:
    moves = _moves(sequence)
    rotations = sum(move.is_rotation for move in moves)
    return {
        "normalized": format_sequence(moves),
        "inverse": inverse_sequence(moves),
        "htm": htm_count(moves),
        "metric": METRIC,
        "face_turns": len(moves) - rotations,
        "rotations": rotations,
    }


def compile_catalog_algorithm(text: str) -> str:
    """Compile registry-only wide/slice notation to fixed-frame outer turns.

    This does not expand the public input grammar. Slice/wide turns include a
    center-frame rotation; the final grip is discarded deliberately, while the
    complete center-relative cubie transformation is preserved. Catalog moves
    are counted in their compiled HTM, not by the original token count.
    """
    import re

    expansions = {
        "r": "x L",
        "l": "x' R",
        "u": "y D",
        "d": "y' U",
        "f": "z B",
        "b": "z' F",
        "M": "x' R L'",
        "E": "y' U D'",
        "S": "z F' B",
    }
    cleaned = text.replace("(", " ").replace(")", " ").replace("’", "'").replace("′", "'")
    tokens = re.findall(r"[URFDLBMESxyzurfdlb](?:w)?(?:2'|2|')?", cleaned)
    if re.sub(r"[URFDLBMESxyzurfdlb](?:w)?(?:2'|2|')?", "", cleaned).strip():
        raise CubeError("catalog_notation", "Unsupported registry notation.")
    expanded = []
    for token in tokens:
        face, suffix = token[0], token[1:]
        if suffix.startswith("w"):
            face, suffix = face.lower(), suffix[1:]
        if face in expansions:
            macro = parse_sequence(expansions[face])
            if suffix == "'":
                macro = parse_sequence(inverse_sequence(macro))
            expanded.extend(macro * (2 if suffix.startswith("2") else 1))
        else:
            expanded.extend(parse_sequence(face + suffix))
    frame, outer = FACES, []
    for move in expanded:
        if move.is_rotation:
            for _ in range(move.turns):
                frame = _rotate_frame(frame, move.face)
        else:
            outer.append(Move(frame[FACES.index(move.face)], move.turns))
    return format_sequence(outer)


def reference_sequence(sequence: str, reference_frame: str, output_frame: str) -> str:
    """Translate outer moves between two proper grips; no new move semantics."""
    if reference_frame not in VALID_FRAMES or output_frame not in VALID_FRAMES:
        raise CubeError("center_orientation", "Invalid reference frame.")
    moves = parse_sequence(sequence)
    if any(move.is_rotation for move in moves):
        raise CubeError("reference_notation", "Reference sequences require outer turns.")
    return format_sequence(
        tuple(
            Move(FACES[output_frame.index(reference_frame[FACES.index(move.face)])], move.turns)
            for move in moves
        )
    )


@dataclass(frozen=True, slots=True)
class CubeState:
    cp: tuple[int, ...] = tuple(range(8))
    co: tuple[int, ...] = (0,) * 8
    ep: tuple[int, ...] = tuple(range(12))
    eo: tuple[int, ...] = (0,) * 12
    frame: str = FACES

    def __post_init__(self):
        for name, size, maximum in (("cp", 8, 7), ("co", 8, 2), ("ep", 12, 11), ("eo", 12, 1)):
            object.__setattr__(self, name, _integer_tuple(getattr(self, name), name, size, maximum))
        if len(set(self.cp)) != 8:
            raise CubeError("corner_permutation", "Every corner cubie must occur exactly once.")
        if len(set(self.ep)) != 12:
            raise CubeError("edge_permutation", "Every edge cubie must occur exactly once.")
        if sum(self.co) % 3:
            raise CubeError("corner_orientation", "Corner twists must sum to 0 modulo 3.")
        if sum(self.eo) % 2:
            raise CubeError("edge_orientation", "Edge flips must sum to 0 modulo 2.")
        if _parity(self.cp) != _parity(self.ep):
            raise CubeError("permutation_parity", "Corner and edge permutation parity must match.")
        if not isinstance(self.frame, str) or self.frame not in VALID_FRAMES:
            raise CubeError(
                "center_orientation", "Centers must form one of 24 proper cube rotations."
            )

    @property
    def is_solved(self) -> bool:
        return (
            self.cp == tuple(range(8))
            and self.ep == tuple(range(12))
            and not any(self.co)
            and not any(self.eo)
        )

    def apply(self, sequence: str | Sequence[Move]) -> "CubeState":
        moves = _moves(sequence)  # Parse all input before applying any part of it.
        state = self
        for move in moves:
            if move.is_rotation:
                frame = state.frame
                for _ in range(move.turns):
                    frame = _rotate_frame(frame, move.face)
                state = CubeState(state.cp, state.co, state.ep, state.eo, frame)
            else:
                physical_face = state.frame[FACES.index(move.face)]
                cp, co, ep, eo = _FACE_TURNS[physical_face]
                for _ in range(move.turns):
                    state = CubeState(
                        tuple(state.cp[src] for src in cp),
                        tuple((state.co[src] + co[i]) % 3 for i, src in enumerate(cp)),
                        tuple(state.ep[src] for src in ep),
                        tuple((state.eo[src] + eo[i]) % 2 for i, src in enumerate(ep)),
                        state.frame,
                    )
        return state

    def in_reference(self, frame: str) -> "CubeState":
        """Rebase a search view: relabel that grip's centers as URFDLB.

        The canonical object is unchanged. All subsequent search operations still
        use this same CubeState type and geometry-derived rules.
        """
        viewed = CubeState(self.cp, self.co, self.ep, self.eo, frame).to_facelets()
        return CubeState.from_facelets(viewed.translate(str.maketrans(frame, FACES)))

    def layer_progress(self) -> dict[str, Any]:
        """Precise D-Cross/FR,FL,BL,BR/OLL/PLL-up-to-AUF predicates in this reference.

        Call in_reference for a chosen cross color. PLL is separate from the
        final U alignment; a top face merely having one color is not enough.
        """
        cross = all(self.ep[i] == i and self.eo[i] == 0 for i in range(4, 8))
        pairs = {
            slot: self.cp[c] == c and self.co[c] == 0 and self.ep[e] == e and self.eo[e] == 0
            for slot, c, e in (("FR", 4, 8), ("FL", 5, 9), ("BL", 6, 10), ("BR", 7, 11))
        }
        f2l = cross and all(pairs.values())
        oll = f2l and not any(self.co[:4]) and not any(self.eo[:4])
        auf = None
        if oll:
            for word in ("", "U", "U2", "U'"):
                # These predicates describe cubies in the reference, not the viewer grip.
                flat = CubeState(self.cp, self.co, self.ep, self.eo)
                if flat.apply(word).is_solved:
                    auf = word
                    break
        return {
            "cross": cross,
            "pairs": pairs,
            "f2l": f2l,
            "oll": oll,
            "pll": auf is not None,
            "auf": auf,
            "solved": self.is_solved,
        }

    def piece_coordinate(self, kind: str, piece: int) -> int:
        """Project a tracked piece as position * orientation-base + orientation."""
        if kind == "corner":
            position = self.cp.index(piece)
            return position * 3 + self.co[position]
        if kind == "edge":
            position = self.ep.index(piece)
            return position * 2 + self.eo[position]
        raise CubeError("piece_kind", "Expected corner or edge.")

    def to_facelets(self, *, canonical: bool = False) -> str:
        result = list(SOLVED_FACELETS)
        for permutation, orientation, names, indices in (
            (self.cp, self.co, CORNER_NAMES, CORNER_FACELETS),
            (self.ep, self.eo, EDGE_NAMES, EDGE_FACELETS),
        ):
            for position, piece in enumerate(permutation):
                for sticker, color in enumerate(names[piece]):
                    destination = (sticker + orientation[position]) % len(names[piece])
                    result[indices[position][destination]] = color
        facelets = "".join(result)
        return (
            facelets if canonical else _permute_facelets(facelets, _frame_sticker_map(self.frame))
        )

    @classmethod
    def from_facelets(cls, text: str) -> "CubeState":
        if not isinstance(text, str):
            raise CubeError("facelet_type", "Facelets must be a string of URFDLB color identities.")
        if len(text) > MAX_SEQUENCE_LENGTH:
            raise CubeError("facelet_length", "Facelet input is too long.")
        facelets = "".join(text.split())
        if len(facelets) != 54:
            raise CubeError("facelet_length", "A 3x3 cube requires exactly 54 stickers.")
        if set(facelets) - set(FACES):
            raise CubeError(
                "facelet_color", "Sticker colors must be the uppercase identities URFDLB."
            )
        if Counter(facelets) != Counter(SOLVED_FACELETS):
            raise CubeError("color_counts", "Each of U, R, F, D, L, B must occur exactly 9 times.")
        frame = "".join(facelets[i * 9 + 4] for i in range(6))
        if frame not in VALID_FRAMES:
            raise CubeError(
                "center_orientation", "Centers must form one of 24 proper cube rotations."
            )
        canonical = "".join(facelets[dest] for dest in _frame_sticker_map(frame))
        return cls(*_decode_canonical(canonical), frame=frame)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "cp": list(self.cp),
            "co": list(self.co),
            "ep": list(self.ep),
            "eo": list(self.eo),
            "frame": self.frame,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "CubeState":
        if not isinstance(data, Mapping):
            raise CubeError("state_type", "Serialized state must be a JSON object.")
        expected = {"schema_version", "cp", "co", "ep", "eo", "frame"}
        if set(data) != expected:
            raise CubeError(
                "state_fields", "State requires exactly schema_version, cp, co, ep, eo, frame."
            )
        if type(data["schema_version"]) is not int or data["schema_version"] != SCHEMA_VERSION:
            raise CubeError(
                "schema_version", f"Only state schema version {SCHEMA_VERSION} is supported."
            )
        return cls(*(data[name] for name in ("cp", "co", "ep", "eo", "frame")))

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))

    @classmethod
    def from_json(cls, text: str) -> "CubeState":
        def unique_object(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise CubeError("state_json", f"Duplicate JSON key: {key}.")
                result[key] = value
            return result

        if not isinstance(text, str) or len(text) > MAX_SEQUENCE_LENGTH:
            raise CubeError(
                "state_json", "State JSON must be a string of at most 10000 characters."
            )
        try:
            data = json.loads(text, object_pairs_hook=unique_object)
        except (ValueError, RecursionError) as error:
            if isinstance(error, CubeError):
                raise
            raise CubeError("state_json", "State JSON could not be parsed.") from error
        return cls.from_dict(data)

    @property
    def state_hash(self) -> str:
        return sha256(self.to_json().encode()).hexdigest()

    @property
    def position_hash(self) -> str:
        data = self.to_dict()
        del data["frame"]
        return sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    def snapshot(self) -> dict[str, Any]:
        """Derived presentation data only; this does not introduce another state model."""
        facelets = self.to_facelets()
        return {
            "engine_version": ENGINE_VERSION,
            "state": self.to_dict(),
            "facelets": facelets,
            "canonical_facelets": self.to_facelets(canonical=True),
            "is_solved": self.is_solved,
            "state_hash": self.state_hash,
            "position_hash": self.position_hash,
            "palette": dict(PALETTE),
            "cubies": scene_cubies(facelets),
            "faces": [
                {
                    "face": face,
                    "center": facelets[i * 9 + 4],
                    "stickers": facelets[i * 9 : i * 9 + 9],
                }
                for i, face in enumerate(FACES)
            ],
        }


@lru_cache(maxsize=128)
def piece_coordinate_maps(sequence: str) -> tuple[tuple[int, ...], tuple[int, ...]]:
    """Engine-derived projected transitions used by abstract search, not a second rules engine."""
    effect = CubeState().apply(sequence)
    if effect.frame != FACES:
        raise CubeError("search_frame", "Search macros must preserve the reference frame.")
    result = []
    for permutation, orientations, base in ((effect.cp, effect.co, 3), (effect.ep, effect.eo, 2)):
        result.append(
            tuple(
                permutation.index(position) * base
                + (orientation + orientations[permutation.index(position)]) % base
                for position in range(len(permutation))
                for orientation in range(base)
            )
        )
    return result[0], result[1]


def scene_cubies(facelets: str) -> list[dict[str, Any]]:
    """26 visible slots and 54 stickers in current-view coordinates, for rendering."""
    slots = {}
    for index, (position, normal) in enumerate(_STICKERS):
        if position not in slots:
            slots[position] = {
                "id": ",".join(map(str, position)),
                "position": list(position),
                "stickers": [],
            }
        slots[position]["stickers"].append({"normal": list(normal), "color": facelets[index]})
    return list(slots.values())


def plan_sequence(state: CubeState, sequence: str) -> dict[str, Any]:
    """Validate an entire word and derive immutable, verified animation transitions.

    A scene animates a descriptor and then adopts its snapshot. It must not call
    apply again on completion. No live/global state is changed by preparing a plan.
    """
    moves = parse_sequence(sequence)
    if len(moves) > 128:
        raise CubeError("plan_limit", "Animate at most 128 moves per algorithm.")
    steps, initial_hash = [], state.state_hash
    for move in moves:
        axis = _NORMALS["RUF"[ROTATIONS.index(move.face)] if move.is_rotation else move.face]
        affected = [
            cubie["id"]
            for cubie in scene_cubies(state.to_facelets())
            if move.is_rotation or _dot(tuple(cubie["position"]), axis) == 1
        ]
        # Prime turns take the short +90-degree path, not a -270-degree spin.
        quarters = 1 if move.turns == 3 else -move.turns
        before_hash = state.state_hash
        state = state.apply((move,))
        steps.append(
            {
                "before_hash": before_hash,
                "token": str(move),
                "inverse": str(move.inverse()),
                "htm": htm_count((move,)),
                "rotation": move.is_rotation,
                "animation": {"axis": list(axis), "quarter_turns": quarters, "affected": affected},
                "inverse_animation": {
                    "axis": list(axis),
                    "quarter_turns": -quarters,
                    "affected": affected,
                },
                "snapshot": state.snapshot() | {"sequence": sequence_info((move,))},
            }
        )
    return {"input_hash": initial_hash, "sequence": sequence_info(moves), "steps": steps}


def random_scramble() -> str:
    """20 random legal outer turns; a random move walk, not a WCA random-state scramble."""
    rng, moves, previous = SystemRandom(), [], ""
    for _ in range(20):
        face = rng.choice([face for face in FACES if face != previous])
        moves.append(face + rng.choice(("", "'", "2")))
        previous = face
    return " ".join(moves)
