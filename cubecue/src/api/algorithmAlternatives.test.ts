// Existing engine-generated CFOP solution; synthetic wire-validation tests only.
import { expect, it, vi } from 'vitest'
import { cfopSolutions, snapshots } from '../test/cube-data'
import { solveCFOP } from './cube'

it.each([false, true])('validates a CFOP alternative against its exact stage start (stale: %s)', async stale => {
  const solution = structuredClone(cfopSolutions.scrambled)
  const stage = solution.stages![5]
  stage.alternatives = [{
    id: 'wire-test', notation: stage.notation, source: 'Test fixture',
    source_url: 'https://solvethecube.com/algorithms', verified: true,
    metrics: { htm: stage.move_count, rotations: 0 },
    input_hash: stale ? 'wrong-start-state' : stage.before_hash,
  }]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(solution))))
  const request = solveCFOP(snapshots.solved.state, new AbortController().signal)
  if (stale) await expect(request).rejects.toThrow()
  else expect((await request).stages![5].alternatives).toEqual(stage.alternatives)
})
