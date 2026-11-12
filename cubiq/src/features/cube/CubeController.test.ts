import { describe, expect, it, vi } from 'vitest'
import { plans, snapshots, solutions } from '../../test/cube-data'
import { CubeController } from './CubeController'
import type { CubeTransport } from './CubeController'
import type { CubePlan, CubeSolution } from '../../api/cube'

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
async function setup() {
  const api = { load: vi.fn().mockResolvedValue(snapshots.solved), plan: vi.fn(), scramble: vi.fn().mockResolvedValue(plans.scramble), import: vi.fn(), solve: vi.fn() } satisfies CubeTransport
  const controller = new CubeController(api)
  controller.connect(); await flush()
  return { controller, api }
}
async function finish(controller: CubeController) {
  const id = controller.getSnapshot().active?.id
  expect(id).toBeTruthy()
  controller.finish(id!); controller.finish(id!)
  await flush()
}

describe('ordered engine/animation commits', () => {
  it('queues rapid inputs and uses the previous accepted state, committing each turn once', async () => {
    const { controller: c, api } = await setup()
    api.plan.mockResolvedValueOnce(plans.r).mockResolvedValueOnce(plans.uAfterR)
    c.enqueue('R'); c.enqueue('U'); await flush()
    expect(api.plan).toHaveBeenCalledTimes(1)
    expect(c.getSnapshot().snapshot).toBe(snapshots.solved)
    const oldId = c.getSnapshot().active!.id
    await finish(c)
    expect(c.getSnapshot().history).toHaveLength(1)
    expect(api.plan.mock.calls[1][0]).toEqual(plans.r.steps[0].snapshot.state)
    c.finish(oldId)
    expect(c.getSnapshot().history).toHaveLength(1)
    await finish(c)
    expect(c.getSnapshot().history.map(step => step.token)).toEqual(['R', 'U'])
    expect(c.getSnapshot().snapshot?.state_hash).toBe(plans.uAfterR.steps[0].snapshot.state_hash)
    expect(c.getSnapshot().pending).toBe(0)
    c.disconnect()
  })

  it('reset invalidates an active animation and clears rapid queued inputs', async () => {
    const { controller: c, api } = await setup()
    api.plan.mockResolvedValue(plans.r)
    c.enqueue('R'); c.enqueue('U'); await flush()
    const id = c.getSnapshot().active!.id
    await c.reset(); c.finish(id); await flush()
    expect(c.getSnapshot().history).toHaveLength(0)
    expect(c.getSnapshot().snapshot).toBe(snapshots.solved)
    expect(api.plan).toHaveBeenCalledTimes(1)
  })

  it('ignores late API responses from before reset, even if transport ignores abort', async () => {
    const { controller: c, api } = await setup()
    let resolve!: (plan: CubePlan) => void
    api.plan.mockReturnValue(new Promise<CubePlan>(done => { resolve = done }))
    c.enqueue('R'); await flush(); await c.reset()
    resolve(plans.r); await flush()
    expect(c.getSnapshot().snapshot).toBe(snapshots.solved)
    expect(c.getSnapshot().active).toBeUndefined()
    expect(c.getSnapshot().history).toHaveLength(0)
  })

  it('validates the entire plan chain and rejects stale or discontinuous plans', async () => {
    for (const bad of [
      { ...plans.r, input_hash: 'wrong' },
      { ...plans.algorithm, steps: plans.algorithm.steps.map((step, i) => i === 2 ? { ...step, before_hash: 'wrong' } : step) },
    ]) {
      const { controller: c, api } = await setup()
      api.plan.mockResolvedValue(bad)
      c.enqueue('R'); c.enqueue('U'); await flush()
      expect(c.getSnapshot().error).toContain('No moves were applied')
      expect(c.getSnapshot().snapshot).toBe(snapshots.solved)
      expect(c.getSnapshot().history).toHaveLength(0)
      expect(c.getSnapshot().pending).toBe(0)
    }
  })

  it('retains accepted state and clears remaining requests on API failure', async () => {
    const { controller: c, api } = await setup()
    api.plan.mockResolvedValueOnce(plans.r).mockRejectedValueOnce(new Error('Invalid notation'))
    c.enqueue('R'); c.enqueue('Q'); c.enqueue('U'); await flush(); await finish(c)
    expect(c.getSnapshot().history).toHaveLength(1)
    expect(c.getSnapshot().error).toContain('Invalid notation')
    expect(c.getSnapshot().pending).toBe(0)
    expect(api.plan).toHaveBeenCalledTimes(2)
  })

  it('bounds rapid-input queues instead of dropping or reordering silently', async () => {
    const { controller: c, api } = await setup()
    api.plan.mockResolvedValue(plans.r)
    c.enqueue('R'); await flush()
    for (let i = 0; i < 64; i++) expect(c.enqueue('U')).toBe(true)
    expect(c.enqueue('U')).toBe(false)
    expect(c.getSnapshot().error).toContain('queue is full')
    c.disconnect()
  })

  it('disconnect aborts work and a StrictMode reconnect creates a clean epoch', async () => {
    const { controller: c, api } = await setup()
    api.plan.mockResolvedValue(plans.r)
    c.enqueue('R'); await flush()
    const id = c.getSnapshot().active!.id
    c.disconnect(); c.connect(); await flush(); c.finish(id)
    expect(c.getSnapshot().history).toHaveLength(0)
    expect(c.getSnapshot().snapshot).toBe(snapshots.solved)
  })
})

describe('history and playback', () => {
  it('undo/redo restore verified states without another engine application or new history', async () => {
    const { controller: c, api } = await setup()
    api.plan.mockResolvedValueOnce(plans.r).mockResolvedValueOnce(plans.uAfterR)
    c.enqueue('R'); c.enqueue('U'); await flush(); await finish(c); await finish(c)
    c.back(); expect(c.getSnapshot().active?.token).toBe("U'"); await finish(c)
    expect(c.getSnapshot().snapshot?.state_hash).toBe(plans.r.steps[0].snapshot.state_hash)
    expect(c.getSnapshot().cursor).toBe(1)
    c.forward(); await finish(c)
    expect(c.getSnapshot().cursor).toBe(2)
    expect(c.getSnapshot().history).toHaveLength(2)
    expect(api.plan).toHaveBeenCalledTimes(2)
  })

  it('new input after undo branches only on a successful animation commit', async () => {
    const { controller: c, api } = await setup()
    api.plan.mockResolvedValueOnce(plans.r).mockResolvedValueOnce(plans.uAfterR).mockResolvedValueOnce(plans.fAfterR)
    c.enqueue('R'); c.enqueue('U'); await flush(); await finish(c); await finish(c)
    c.back(); await finish(c); c.enqueue('F'); await flush()
    expect(c.getSnapshot().history[1].token).toBe('U')
    await finish(c)
    expect(c.getSnapshot().history.map(step => step.token)).toEqual(['R', 'F'])
    expect(c.getSnapshot().cursor).toBe(2)
  })

  it('rejected input after undo preserves the redo branch', async () => {
    const { controller: c, api } = await setup()
    api.plan.mockResolvedValueOnce(plans.r).mockResolvedValueOnce(plans.uAfterR).mockRejectedValueOnce(new Error('Bad algorithm'))
    c.enqueue('R'); c.enqueue('U'); await flush(); await finish(c); await finish(c)
    c.back(); await finish(c); c.enqueue('Q'); await flush()
    expect(c.getSnapshot().history[1].token).toBe('U')
    c.forward(); await finish(c)
    expect(c.getSnapshot().cursor).toBe(2)
  })

  it('pauses a batch after the active turn and resumes without skipping moves', async () => {
    const { controller: c, api } = await setup()
    api.plan.mockResolvedValue(plans.algorithm)
    c.enqueue("R U R' U'"); await flush(); c.pause(); await finish(c)
    expect(c.getSnapshot().cursor).toBe(1)
    expect(c.getSnapshot().active).toBeUndefined()
    expect(c.getSnapshot().pending).toBe(3)
    c.resume(); await flush(); await finish(c); await finish(c); await finish(c)
    expect(c.getSnapshot().history).toHaveLength(4)
  })

  it('replays, scrubs, and pauses historical transitions with no new API calls', async () => {
    const { controller: c, api } = await setup()
    api.plan.mockResolvedValue(plans.algorithm)
    c.enqueue('algorithm'); await flush()
    for (let i = 0; i < 4; i++) await finish(c)
    c.play(); expect(c.getSnapshot().cursor).toBe(0)
    c.pause(); await finish(c)
    expect(c.getSnapshot().cursor).toBe(1)
    expect(c.getSnapshot().active).toBeUndefined()
    c.resume(); await flush()
    for (let i = 0; i < 3; i++) await finish(c)
    expect(c.getSnapshot().history).toHaveLength(4)
    expect(api.plan).toHaveBeenCalledTimes(1)
    c.seek(0); expect(c.getSnapshot().snapshot).toBe(snapshots.solved)
    c.seek(3); expect(c.getSnapshot().snapshot).toBe(plans.algorithm.steps[2].snapshot)
  })

  it('rotation-only history costs zero HTM and scramble uses the engine endpoint', async () => {
    const { controller: c, api } = await setup()
    api.plan.mockResolvedValue(plans.rotation)
    c.enqueue('x'); await flush(); await finish(c)
    expect(c.getSnapshot().history.reduce((sum, step) => sum + step.htm, 0)).toBe(0)
    await c.reset(); c.scramble(); await flush()
    expect(api.scramble).toHaveBeenCalledWith(snapshots.solved.state, expect.any(AbortSignal))
    for (let i = 0; i < 20; i++) await finish(c)
    expect(c.getSnapshot().history).toHaveLength(20)
  })

  it('failed import/reset retains the last accepted snapshot and timeline', async () => {
    const { controller: c, api } = await setup()
    api.plan.mockResolvedValue(plans.r); c.enqueue('R'); await flush(); await finish(c)
    api.import.mockRejectedValue(new Error('Invalid state'))
    await c.importFacelets('bad')
    expect(c.getSnapshot().history).toHaveLength(1)
    expect(c.getSnapshot().snapshot).toBe(plans.r.steps[0].snapshot)
  })
})

describe('verified full-cube solving', () => {
  async function scrambled() {
    const context = await setup()
    context.api.plan.mockResolvedValue(plans.r)
    context.controller.enqueue('R'); await flush(); await finish(context.controller)
    context.api.solve.mockResolvedValue(solutions.r)
    return context
  }
  it('previews a state-bound solution without committing moves, then steps with duplicate-callback protection', async () => {
    const { controller: c, api } = await scrambled()
    const before = c.getSnapshot().snapshot
    await c.solve()
    expect(api.solve).toHaveBeenCalledWith(before!.state, expect.any(AbortSignal))
    expect(c.getSnapshot().snapshot).toBe(before)
    expect(c.getSnapshot().cursor).toBe(1)
    expect(c.getSnapshot().solutionStart).toBe(1)
    expect(c.getSnapshot().history).toHaveLength(1 + solutions.r.plan.steps.length)
    c.forward(); expect(c.getSnapshot().snapshot).toBe(before)
    await finish(c)
    expect(c.getSnapshot().snapshot).toBe(solutions.r.plan.steps[0].snapshot)
    expect(c.getSnapshot().cursor).toBe(2)
    c.back(); await finish(c)
    expect(c.getSnapshot().snapshot).toBe(before)
    expect(api.plan).toHaveBeenCalledTimes(1)
  })
  it('plays and restarts only the solution, retaining its exact scrambled starting state', async () => {
    const { controller: c, api } = await scrambled()
    await c.solve(); c.playSolution()
    expect(c.getSnapshot().active?.token).toBe(solutions.r.plan.steps[0].token)
    c.pause(); await finish(c)
    expect(c.getSnapshot().cursor).toBe(2)
    expect(c.getSnapshot().active).toBeUndefined()
    c.playSolution()
    for (let i = 1; i < solutions.r.plan.steps.length; i++) await finish(c)
    expect(c.getSnapshot().snapshot?.is_solved).toBe(true)
    expect(c.getSnapshot().history).toHaveLength(1 + solutions.r.plan.steps.length)
    c.playSolution()
    expect(c.getSnapshot().cursor).toBe(1)
    expect(c.getSnapshot().snapshot).toBe(plans.r.steps[0].snapshot)
    expect(api.solve).toHaveBeenCalledTimes(1)
    c.disconnect()
  })
  it('blocks edits, seeks, and duplicate solves during a search', async () => {
    const { controller: c, api } = await scrambled()
    let resolve!: (value: CubeSolution) => void
    api.solve.mockReturnValue(new Promise<CubeSolution>(done => { resolve = done }))
    const search = c.solve(); void c.solve()
    expect(c.enqueue('U')).toBe(false)
    c.seek(0); c.back(); c.play()
    expect(c.getSnapshot().cursor).toBe(1)
    expect(c.getSnapshot().active).toBeUndefined()
    expect(api.solve).toHaveBeenCalledTimes(1)
    resolve(solutions.r); await search
  })
  it('can solve from a paused replay intermediate state without advancing it', async () => {
    const { controller: c, api } = await scrambled()
    await c.solve(); c.playSolution(); c.pause(); await finish(c)
    const intermediate = c.getSnapshot().snapshot
    expect(c.getSnapshot().paused).toBe(true)
    api.solve.mockRejectedValue(new Error('No result within budget'))
    await c.solve()
    expect(api.solve).toHaveBeenLastCalledWith(intermediate!.state, expect.any(AbortSignal))
    expect(api.solve).toHaveBeenCalledTimes(2)
    expect(c.getSnapshot().snapshot).toBe(intermediate)
    expect(c.getSnapshot().playing).toBe(false)
    expect(c.getSnapshot().error).toBe('No result within budget')
  })
  it('reset aborts search and ignores a late response from a transport that disregards abort', async () => {
    const { controller: c, api } = await scrambled()
    let resolve!: (value: CubeSolution) => void
    api.solve.mockReturnValue(new Promise<CubeSolution>(done => { resolve = done }))
    const search = c.solve(), signal = api.solve.mock.calls[0][1]
    await c.reset(); resolve(solutions.r); await search
    expect(signal.aborted).toBe(true)
    expect(c.getSnapshot().snapshot).toBe(snapshots.solved)
    expect(c.getSnapshot().solution).toBeUndefined()
    expect(c.getSnapshot().history).toHaveLength(0)
    expect(c.getSnapshot().solving).toBe(false)
  })
  it('cancellation retains accepted state and ignores late results', async () => {
    const { controller: c, api } = await scrambled()
    let resolve!: (value: CubeSolution) => void
    api.solve.mockReturnValue(new Promise<CubeSolution>(done => { resolve = done }))
    const search = c.solve(); c.cancelSolve()
    expect(api.solve.mock.calls[0][1].aborted).toBe(true)
    resolve(solutions.r); await search
    expect(c.getSnapshot().snapshot).toBe(plans.r.steps[0].snapshot)
    expect(c.getSnapshot().solution).toBeUndefined()
    expect(c.getSnapshot().history).toHaveLength(1)
  })
  it.each([
    { ...solutions.r, input_hash: 'stale' },
    { ...solutions.r, result_hash: 'wrong endpoint' },
    { ...solutions.r, move_count: 999 },
    { ...solutions.r, notation: 'Q' },
    { ...solutions.r, plan: { ...solutions.r.plan, steps: [] } },
    { ...solutions.r, plan: { ...solutions.r.plan, steps: solutions.r.plan.steps.map((s, i) => i === 2 ? { ...s, before_hash: 'gap' } : s) } },
  ])('rejects stale or inconsistent solution metadata and plans', async result => {
    const { controller: c, api } = await scrambled()
    api.solve.mockResolvedValue(result)
    await c.solve()
    expect(c.getSnapshot().error).toContain('No moves were applied')
    expect(c.getSnapshot().snapshot).toBe(plans.r.steps[0].snapshot)
    expect(c.getSnapshot().history).toHaveLength(1)
    expect(c.getSnapshot().solution).toBeUndefined()
  })
  it('keeps a previous valid preview on solver failure and clears it only when a manual branch commits', async () => {
    const { controller: c, api } = await scrambled()
    await c.solve()
    const history = c.getSnapshot().history
    api.solve.mockRejectedValue(new Error('Search budget reached'))
    await c.solve()
    expect(c.getSnapshot().error).toBe('Search budget reached')
    expect(c.getSnapshot().history).toBe(history)
    api.plan.mockResolvedValue(plans.uAfterR)
    c.enqueue('U'); await flush()
    expect(c.getSnapshot().solution).toBe(solutions.r)
    await finish(c)
    expect(c.getSnapshot().solution).toBeUndefined()
    expect(c.getSnapshot().history).toHaveLength(2)
  })
  it('handles an already-solved result without fabricating animation or history', async () => {
    const { controller: c, api } = await setup()
    api.solve.mockResolvedValue(solutions.solved)
    await c.solve(); c.playSolution()
    expect(c.getSnapshot().snapshot).toBe(snapshots.solved)
    expect(c.getSnapshot().active).toBeUndefined()
    expect(c.getSnapshot().history).toHaveLength(0)
    expect(c.getSnapshot().solution?.move_count).toBe(0)
  })
})
