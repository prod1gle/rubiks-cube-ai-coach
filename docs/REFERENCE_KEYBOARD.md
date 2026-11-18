# Cube Explorer reference keyboard delivery

Default keyboard layout matches the user's supplied image: all 36 move bindings and four layer selectors are implemented. A visible four-row key grid can also be clicked. Reference mode uses physical QWERTY `KeyboardEvent.code` with a character fallback for missing codes; Shift and button variants do not rewrite the pictured algorithms. The alternative Face-letter layout preserves the previous shortcuts. Live Solve's timer controls are unchanged.

`3` reduces left width, `4` increases it; `7` increases right width and `8` reduces it. Widths are bounded to one or two side layers for a 3×3. Space or Reset layer widths restores one. A width change is not a cube move, HTM event, camera orbit or playback step. Side key labels update with their exact notation. Selecting widths and entering moves in the same event batch reads synchronous input configuration, then uses the existing serialized engine-plan queue.

Wide and slice actions are now public in the sole Python engine (`cube-v2`). They retain schema-1 states and hashes; animation remains one atomic action. All six wide turns and M/E/S support primes/doubles and lowercase wide aliases. Each animation uses one simultaneous layer descriptor (17 cubies wide, 8 slice); a completed animation adopts the supplied state exactly once. Outer-equivalent HTM remains 1 for outer/wide, 2 for slices, 0 for whole rotations, including double variants. Center-frame changes caused by slices are distinct from explicit whole-cube rotations. Solver and CFOP output boundaries still require outer-turn algorithms.

Guards: no shortcuts in input/textarea/select/contenteditable or ARIA editing fields; no held-key repeats, IME composition or browser modifier interception. Keyboard can be disabled without losing clickable move controls. Loading and solver requests disable input, while rapid valid moves remain queued. Native form undo and Space activation on buttons/links are retained.

Verification:
- Full backend: **2,199 passed**. New extended suite: **866 passed**, including every wide/slice variant in all 24 grips, fourth powers/inverses, independent sticker-matrix endpoints and inverse descriptors, parser/HTM, random mixed words and API atomicity.
- Full frontend: **192 passed**. Reference input tests independently transcribe all image bindings, physical-code/Shift handling, selectors/rapid remapping/reset, ignored contexts/modifiers, opt-out, native Space, disabled states and legacy mode. Explorer integration queues M then Rw and verifies the second request starts at the exact accepted M state, with no duplicate completion commits and 2+1 HTM.
- After deduplicating registry expansion data, **909 extended/catalog/registry tests passed**. ESLint, TypeScript/Vite build, Ruff check/format, source/wheel packaging and whitespace checks passed.
- Browser production preview: actual I/K/5/X keyboard input queued R/R′/M/M′ as four actions, 6 HTM, returning to solved. Wide-turn keys U/M also exercised through real animation and API paths. No runtime solve/performance fixtures were saved.

The key data is supplied by the user image. `<`/`>` selector semantics were checked against the upstream csTimer key-map implementation (linked in CUBE_CONVENTIONS.md); no upstream implementation code is bundled. See the root README for the complete table and run commands.
