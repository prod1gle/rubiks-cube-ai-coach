# Cube engine v1 conventions

Implemented in **`cubiq/backend/src/coach/cube.py`**, the only production implementation of cube rules. This document fixes the state/schema, notation, metric, and geometry for milestone 1B. HTTP adapters and React must call the engine rather than maintain another move model.

## Scope and canonical representation

The model is an ordinary 3×3 with six distinct fixed-center color identities. Center sticker artwork orientation (supercubes), wide turns, slices, custom color schemes, solver search, persistent solve logs, and partial camera observations are outside 1B. Unsupported notation is rejected, never silently ignored.

`CubeState` is an immutable, validated Python dataclass containing:

| Field | Meaning |
| --- | --- |
| `cp[8]` | Corner piece ID occupying each canonical corner position. |
| `co[8]` | Orientation of the corner occupying each position, in `{0,1,2}`. |
| `ep[12]` | Edge piece ID occupying each canonical edge position. |
| `eo[12]` | Orientation of the edge occupying each position, in `{0,1}`. |
| `frame` | Six color identities giving the center currently at viewer U, R, F, D, L, B. One of 24 proper rotations. |

Canonical cubies always refer to the original center frame; the frame never changes their identities. All arrays are immutable tuples internally, even if the constructor is given lists. Serialization returns fresh arrays. No facelet array is stored alongside cubies: facelets are derived views, and imports are immediately converted into validated cubies plus frame.

In the default grip, U is up, R right, F front, D down, L left, B back. Color identities are the uppercase characters `URFDLB`, not arbitrary sticker names. The display palette associates U with white, R red, F green, D yellow, L orange, B blue. Validation works on the identity letters, independently of display hex colors. A future scanner must explicitly map measured colors to these identities.

## Coordinates and face orientations

Use a right-handed coordinate system: `+X=R`, `+Y=U`, `+Z=F`. Every face is read by an observer **outside that face, looking toward the cube center**. Row 0 is the top and column 0 the left in that view. The orientation of a face view is fixed by its neighboring faces:

| Viewed face | Above row 0 | To the right | Below row 2 | To the left |
| --- | --- | --- | --- | --- |
| U | B | R | F | L |
| R | U | B | D | F |
| F | U | R | D | L |
| D | F | R | B | L |
| L | U | F | D | B |
| B | U | L | D | R |

This is the net used in the inspector; each face retains the orientation defined above:

```text
        U
    L   F   R   B
        D
```

For local zero-based row `r` and column `c`, sticker coordinates are:

| Face | Sticker position `(X,Y,Z)` | Outward normal |
| --- | --- | --- |
| U | `(c−1, 1, r−1)` | `(0,1,0)` |
| R | `(1, 1−r, 1−c)` | `(1,0,0)` |
| F | `(c−1, 1−r, 1)` | `(0,0,1)` |
| D | `(c−1, −1, 1−r)` | `(0,−1,0)` |
| L | `(−1, 1−r, c−1)` | `(−1,0,0)` |
| B | `(1−c, 1−r, −1)` | `(0,0,−1)` |

The geometry uniquely identifies every sticker by its position and outward normal. Clockwise quarter turns are exact −90° rotations about the outward normal. Integer vector arithmetic generates the six cubie move tables at module load; runtime face turns compose those tables with the canonical cubies. No floating-point geometry or external library determines engine transitions.

## Sticker indexing and interchange

A facelet string has exactly 54 non-whitespace characters in **U, R, F, D, L, B** face order, each face in row-major order:

```text
U                 R                 F
00 01 02          09 10 11          18 19 20
03 04 05          12 13 14          21 22 23
06 07 08          15 16 17          24 25 26

D                 L                 B
27 28 29          36 37 38          45 46 47
30 31 32          39 40 41          48 49 50
33 34 35          42 43 44          51 52 53
```

Zero-based API/Python indices and conventional one-based face labels differ: index 0 is U1, index 8 is U9, index 9 is R1. Centers are at zero-based indices `4,13,22,31,40,49`.

The solved string in the default grip is:

```text
UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
```

`state.to_facelets()` exports the complete **current grip** view, including rotated centers and sticker positions. `state.to_facelets(canonical=True)` exports the original center frame. `CubeState.from_facelets(text)` accepts whitespace separators, identifies the frame from the six centers, unprojects the complete sticker layout into the canonical frame, recognizes the cubies, and validates reachability. Importing a current-view export recovers the exact frame as well as physical position. The B and D faces are not silently mirrored.

## Cubie indices and orientations

Piece IDs and destination positions share the following order. The listed ordered sticker triples/pairs define orientation; they are not unordered sets.

| Corner ID | Position / home colors | Zero-based sticker indices |
| --- | --- | --- |
| 0 | URF | `(8,9,20)` |
| 1 | UFL | `(6,18,38)` |
| 2 | ULB | `(0,36,47)` |
| 3 | UBR | `(2,45,11)` |
| 4 | DFR | `(29,26,15)` |
| 5 | DLF | `(27,44,24)` |
| 6 | DBL | `(33,53,42)` |
| 7 | DRB | `(35,17,51)` |

| Edge ID | Position / home colors | Zero-based sticker indices |
| --- | --- | --- |
| 0 | UR | `(5,10)` |
| 1 | UF | `(7,19)` |
| 2 | UL | `(3,37)` |
| 3 | UB | `(1,46)` |
| 4 | DR | `(32,16)` |
| 5 | DF | `(28,25)` |
| 6 | DL | `(30,43)` |
| 7 | DB | `(34,52)` |
| 8 | FR | `(23,12)` |
| 9 | FL | `(21,41)` |
| 10 | BL | `(50,39)` |
| 11 | BR | `(48,14)` |

At corner position `p`, home-color sticker `n` of piece `cp[p]` goes to `CORNER_FACELETS[p][(n + co[p]) % 3]`. At an edge, the equivalent expression is `EDGE_FACELETS[p][(n + eo[p]) % 2]`. Thus orientation zero preserves the listed order, not a guessed geometric “up” direction. Corner recognition permits only cyclic orderings, so a mirrored corner is rejected. This follows the established [cubie-level convention](https://kociemba.org/math/cubielevel.htm); sticker views use the corresponding [facelet-level convention](https://kociemba.org/math/faceletlevel.htm).

For a face-turn table with source position `src` at destination `i`, permutation composition reads `new_cp[i] = old_cp[src]`. Corner orientation adds modulo 3; edge orientation adds modulo 2. Fixed centers are not face-turn permutation entries.

## Notation, frame changes, and HTM

Supported base tokens: `U D L R F B x y z`. A bare token is a clockwise quarter turn; `'` is the inverse quarter turn; `2` is a half turn. Moves apply **left to right**. Concatenation (`RUR'U'`) and whitespace-separated input are both accepted. Typographic primes `’`, `‘`, and `′` normalize to ASCII `'`; `R2'` normalizes to `R2`. Parentheses group without implicit repetition; `()` is the identity.

The parser consumes the entire input before applying anything. Examples of rejected syntax are `R3`, `R'2`, `R''`, `r`, `Rw`, `M`, uppercase `X`, commas, comments, commutators, and `(R U)3`. Wide/slice moves remain planned scope, even though future CFOP catalog imports will need them. Input is limited to 10,000 characters, 2,048 move actions, and 16 nested groups. Errors include a code, readable explanation, and zero-based character offset when applicable. Offsets refer to the original text.

Whole-cube rotations change the grip: `x` follows R, `y` follows U, and `z` follows F. Their prime/double variants behave identically to the corresponding inverse/double rotations. A rotation changes `frame` and the displayed facelets, **not canonical cubie arrays**. The default-frame mappings after one rotation are:

| Rotation | New `frame`, in viewer U R F D L B order |
| --- | --- |
| x | `FRDBLU` |
| y | `UBRDFL` |
| z | `LUFRDB` |

Subsequent face notation is relative to the new grip. For example, `x U x'` has the same canonical result as `F`, `y R y'` as `B`, and `z U z'` as `L`. A face turn leaves the grip fixed. A browser camera orbit, when introduced later, must not emit a cube rotation automatically. Solvedness ignores the grip but requires all canonical cubies to be solved.

`htm_count` and API `sequence.htm` count **executed face actions**: each outer face token costs 1, including `R2`; rotations cost 0. `R R` costs 2, while `R2` costs 1. `R R'` costs 2 despite its identity result. This is neither a shortest-solution distance nor a simplification pass. Inversion reverses token order and inverts every token, including rotations, without changing HTM cost. `sequence.rotations` separately counts rotation actions; `x2` is one rotation action, not two. Algorithm reduction and optimality proofs are not implemented here.

## Validation and legal reachability

Every public `CubeState` construction validates its complete coordinates. Serialized imports reject missing/unknown fields, unsupported schema versions, wrong array sizes, out-of-range values, floats/strings/booleans masquerading as integers, duplicate cubies, and invalid frames.

Facelet import additionally requires exactly nine of each color identity, a proper center frame, eight identifiable handed corners, and twelve identifiable edges. After normalization to fixed centers, all states must satisfy:

1. Every corner and edge identity occurs exactly once.
2. Corner orientations sum to 0 modulo 3.
3. Edge orientations sum to 0 modulo 2.
4. Corner permutation parity equals edge permutation parity.

For an ordinary fixed-center 3×3, these constraints are necessary **and sufficient** for legal reachability; an explicit solving sequence is not required to validate the state. See the state-space construction in [Rokicki’s cube group paper](https://kociemba.org/math/papers/rubik25.pdf). Equal color counts alone do not establish reachability. Examples rejected with specific errors include an isolated edge flip, isolated corner twist, two-edge or two-corner swap, duplicated cubie, mirrored corner, and reflected/incoherent center arrangement. Balanced twists/flips and matching odd permutations are accepted.

## Serialization and hashes

Schema 1 is exactly this object structure (shown solved):

```json
{
  "schema_version": 1,
  "cp": [0,1,2,3,4,5,6,7],
  "co": [0,0,0,0,0,0,0,0],
  "ep": [0,1,2,3,4,5,6,7,8,9,10,11],
  "eo": [0,0,0,0,0,0,0,0,0,0,0,0],
  "frame": "URFDLB"
}
```

`to_json()` uses sorted keys, compact separators, UTF-8-compatible text, and fresh JSON arrays; `from_json()` rejects malformed JSON, duplicate keys, invalid schema/coordinates, and oversized/deeply nested input. `state_hash` is SHA-256 of that exact serialization. `position_hash` uses the same procedure with `frame` omitted. Thus grip changes preserve position hash but change state hash. Hashes are reproducible identifiers, not authentication or evidence of a recorded move history.

## API and frontend ownership

| Endpoint | Behavior |
| --- | --- |
| `GET /api/cube` | Fresh validated solved snapshot. |
| `POST /api/cube/validate` | Import exactly one of `state` (schema object) or `facelets` (current-view string). |
| `POST /api/cube/apply` | The same state input plus `sequence`; return a new validated snapshot and normalized/inverse/count metadata. |
| `POST /api/cube/sequence` | Parse, invert, and count a sequence without assuming a cube state. |

These endpoints are **stateless** pure calculations. There is no shared global mutable cube, persistent session, move log, or WebSocket state stream in 1B. Each submitted state is revalidated. Errors return HTTP 422, with `detail.code`, `detail.message`, and optional `detail.position` for engine errors. Request-schema errors use FastAPI’s structured 422 response.

Snapshots carry the canonical state, current-view/canonical facelets, six rendered face arrays, palette, solvedness, and hashes. React stores and submits the opaque serialized snapshot, paints backend-provided stickers, and displays backend-provided counts and inverse text. It does not permute stickers, infer orientations, validate physical reachability, invert notation, or compute HTM. Pending commands do not optimistically change the cube. A rejected/failed command retains the last accepted snapshot; no state is displayed until one has actually arrived from the engine.

## M1C renderer extension

Snapshots now also derive 26 visible cubie slots and 54 sticker normals/colors from the exact current-view facelets. The canonical schema/hash format is unchanged. `/api/cube/plan` returns up to 128 individually verified transitions with signed local axes, short quarter-turn angles, affected slot IDs, inverse descriptors, and target snapshots. `/api/cube/scramble` creates a 20-turn legal random move walk through the same planner. Renderer geometry and interpolation never define a new logical cube state. History counts sum the engine-provided transition costs. See [M1C implementation and limits](MILESTONE_1C.md).

## Independent verification and fixture regeneration

Pytest runs without Node or external solver dependencies. The committed corpus `cubiq/backend/tests/fixtures/cubejs-1.3.2.json` contains outputs from pinned MIT-licensed [cubejs](https://github.com/ldez/cubejs): 32 named cases, 1,000 deterministic sequences (500 face-only and 500 allowing rotations), and 128 directly sampled legal cubie states with continuations. No solver is initialized. `cubejs` is installed only into ignored local tooling for regeneration and is not a runtime dependency.

Regenerate from the repository root:

```sh
npm install --prefix .tools/cube-oracle --no-save --ignore-scripts cubejs@1.3.2
node cubiq/scripts/generate-cube-fixtures.cjs
```

The generator uses an independent fixed-seed PRNG and imports no application engine code. Tests also freeze a published R-turn cubie state and all sticker index tuples, exercise all 27 move variants and all 24 frames, and check inverses, fourth powers, composition, parser errors, reachability rejection, immutable serialization, and API behavior. The small frontend fixture file is captured from engine snapshots and tests transport/rendering only; it is not an independent mathematical oracle.
