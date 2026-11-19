# Beginner academy

`/learn` teaches a white-down, green-front layer-by-layer path in nine lessons:
notation and pieces, white cross, white corners, middle edges, yellow cross,
yellow orientation, corner permutation, edge permutation, and final alignment.
Each lesson explains recognition, general decision rules, common mistakes, and
the checkpoint to inspect on a physical cube.

The interactive examples form one connected worked solve. They are prepared
cases, not an arbitrary-state beginner solver. The yellow-face drill uses a
prepared Sune case; its written general method separately teaches corner
twisting. A physical cube can have a different case and require repetitions,
setup turns, or another branch of the written instructions.

## Engine boundary

`coach.beginner.service` constructs each example backwards from its verified
target using the existing cube engine. The final target is solved. Every stage
asserts its objective changes from unmet to met and its earlier-layer
prerequisite holds at both endpoints. React consumes canonical snapshots and
plans through the existing cube controller; it contains no cube transformations.

- `GET /api/beginner/catalog` lists the ordered, versioned course.
- `GET /api/beginner/lessons/{id}` returns its start, end, canonical move plan,
  objective, protected stage, and engine-derived progress at both endpoints.
- `POST /api/beginner/check` replays the accepted learner sequence from the
  lesson start. The supplied expected hash must equal the replayed end hash.
  Completion requires a positive face-turn count, the objective, and the
  earlier-layer prerequisite. Equivalent solutions are accepted. Empty input
  and grip rotations alone never count. Preservation is checked at the end of
  the attempt, because algorithms can temporarily disrupt solved layers.

Watching or stepping through an example cannot complete a lesson. The learner
resets to a fresh practice attempt, enters moves, and explicitly requests a
check. Only a successful state-bound response records browser-local progress
under `cubecue.beginner-v1.completed`. Switching lessons cancels pending fetches
and verification; failed or stale replies cannot mark a lesson complete.
Progress describes virtual exercises, not physical-cube verification or mastery.

## Verification

Run backend `pytest tests/test_beginner.py` and frontend
`npm test -- src/features/learn/BeginnerAcademy.test.tsx`. The frontend fixtures
in `src/test/beginner-lessons.json` are generated from the real beginner service
(foundations, cross, and alignment); frontend tests stub rendering animations,
but exercise real canonical plans, accepted history, and state-bound requests.
