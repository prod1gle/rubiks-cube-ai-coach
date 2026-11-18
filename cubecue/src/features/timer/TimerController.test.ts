// SYNTHETIC TEST CLOCKS ONLY. These timestamps are not measured user solves.
import { expect, it, vi } from 'vitest'
import type { CubePlan, CubeSnapshot, TimedRecording } from '../../api/cube'
import fixtures from '../../test/timed-recording.json'
import { TimerController } from './TimerController'
import type { TimerTransport } from './TimerController'
const data = fixtures as unknown as { initial: CubeSnapshot; r: CubeSnapshot; inverseR: CubePlan; plans: CubePlan[] }
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
async function setup(initial = data.initial) {
  let now = 0, wall = 0
  const api = { load: vi.fn().mockResolvedValue(initial), plan: vi.fn(), scramble: vi.fn(), import: vi.fn() } satisfies TimerTransport
  const save = vi.fn<(record: TimedRecording) => void>()
  const c = new TimerController(api, () => now, () => wall, save)
  c.connect(); await flush()
  return { c, api, save, at: (value: number, wallValue = value) => { now = value; wall = wallValue } }
}
it('captures input time and stops on engine solvedness, independently of delayed acknowledgement', async () => {
  const { c, api, at } = await setup(data.r)
  let resolve!: (plan: CubePlan) => void
  api.plan.mockReturnValue(new Promise<CubePlan>(done => { resolve = done }))
  c.start(false); at(500); c.move("R'")
  at(2500); c.pulse(); expect(c.getSnapshot().phase).toBe('running')
  resolve(data.inverseR); await flush()
  const s = c.getSnapshot()
  expect(s.phase).toBe('complete'); expect(s.elapsed_ms).toBe(500)
  expect(s.record?.events[0]).toMatchObject({ at_ms: 500, ack_ms: 2500, token: "R'" })
  expect(s.snapshot?.is_solved).toBe(true); expect(s.htm).toBe(1)
  expect(c.move('U')).toBe(false)
})
it('serializes rapid inputs against exact acknowledged states without retimestamping queued moves', async () => {
  const { c, api, at } = await setup()
  let first!: (plan: CubePlan) => void
  api.plan.mockReturnValueOnce(new Promise<CubePlan>(done => { first = done }))
  data.plans.slice(1).forEach(p => api.plan.mockResolvedValueOnce(p))
  c.start(false)
  for (const [i, token] of ['y', 'R', 'U', "R'"].entries()) { at((i + 1) * 10); c.move(token) }
  expect(api.plan).toHaveBeenCalledTimes(1)
  at(200); first(data.plans[0]); await flush()
  expect(c.getSnapshot().phase).toBe('complete')
  expect(c.getSnapshot().record?.events.map(e => e.at_ms)).toEqual([10, 20, 30, 40])
  expect(c.getSnapshot().record?.elapsed_ms).toBe(40)
  expect(api.plan.mock.calls[1][0]).toEqual(data.plans[0].steps[0].snapshot.state)
  expect(c.getSnapshot().rotations).toBe(1)
})
it('keeps inspection separate and records overtime without inventing a penalty', async () => {
  const { c, at } = await setup()
  at(100); c.start(true); at(16200); c.pulse()
  expect(c.getSnapshot().phase).toBe('inspection')
  c.beginSolve()
  expect(c.getSnapshot().record?.inspection_ms).toBe(16100)
  expect(c.getSnapshot().record?.started_mono_ms).toBe(16200)
  expect(c.getSnapshot().elapsed_ms).toBe(0)
})
it('records explicit pauses and rejects moves during practice pause', async () => {
  const { c, api, at } = await setup()
  data.plans.forEach(p => api.plan.mockResolvedValueOnce(p))
  c.start(false); at(100); c.move('y'); await flush(); at(500); c.move('R'); await flush()
  at(1000); c.pause(); at(1250); c.pulse(); expect(c.move('U')).toBe(false)
  at(1500); c.resume(); at(2000); c.move('U'); await flush(); at(2500); c.move("R'"); await flush()
  expect(c.getSnapshot().record?.pauses).toEqual([{ start_ms: 1000, end_ms: 1500 }])
  expect(c.getSnapshot().record?.elapsed_ms).toBe(2500)
})
it('uses the input timestamp if a solve is confirmed after an explicit pause', async () => {
  const { c, api, at } = await setup(data.r)
  let done!: (plan: CubePlan) => void
  api.plan.mockReturnValue(new Promise<CubePlan>(resolve => { done = resolve }))
  c.start(false); at(500); c.move("R'"); at(700); c.pause(); at(1000); done(data.inverseR); await flush()
  expect(c.getSnapshot().record?.elapsed_ms).toBe(500)
  expect(c.getSnapshot().record?.pauses).toEqual([])
})
it('stops at the requested time after pending inputs validate, without claiming solvedness', async () => {
  const { c, api, at } = await setup()
  let done!: (plan: CubePlan) => void
  api.plan.mockReturnValue(new Promise<CubePlan>(resolve => { done = resolve }))
  c.start(false); at(100); c.move('y'); at(500); c.stop(); at(1000); done(data.plans[0]); await flush()
  expect(c.getSnapshot().phase).toBe('stopped')
  expect(c.getSnapshot().record?.elapsed_ms).toBe(500)
  expect(c.getSnapshot().snapshot?.is_solved).toBe(false)
})
it('interrupts on failed input and rejects a stale acknowledgement after disconnect', async () => {
  const { c, api, at } = await setup()
  api.plan.mockRejectedValueOnce(new Error('Offline'))
  c.start(false); at(200); c.move('y'); await flush()
  expect(c.getSnapshot().phase).toBe('interrupted')
  expect(c.getSnapshot().record?.events).toHaveLength(0)
  expect(c.getSnapshot().record?.timing_integrity).toBe('uncertain')
  const next = await setup(); let done!: (plan: CubePlan) => void
  next.api.plan.mockReturnValue(new Promise<CubePlan>(resolve => { done = resolve }))
  next.c.start(false); next.at(100); next.c.move('y'); next.c.disconnect(); done(data.plans[0]); await flush()
  expect(next.c.getSnapshot().record?.events).toHaveLength(0)
})
it('marks background/sleep clock discontinuity uncertain and preserves a draft on exit', async () => {
  const { c, at, save } = await setup()
  c.start(false); at(100, 10000); c.pulse()
  expect(c.getSnapshot().uncertain).toBe(true)
  c.disconnect()
  expect(save.mock.lastCall?.[0].status).toBe('interrupted')
  expect(save.mock.lastCall?.[0].initial_state).toEqual(data.initial.state)
})
it('refuses invalid clock progression and a solved initial cube', async () => {
  const { c, at } = await setup()
  at(100); c.start(false); at(50); c.move('R')
  expect(c.getSnapshot().phase).toBe('interrupted')
  const solved = data.inverseR.steps[0].snapshot
  const other = await setup(solved); other.c.start(false)
  expect(other.c.getSnapshot().phase).toBe('ready')
})
it('rejects inconsistent engine responses rather than recording or adopting them', async () => {
  const { c, api, at } = await setup()
  api.plan.mockResolvedValue({ ...data.plans[0], input_hash: 'wrong' })
  c.start(false); at(100); c.move('y'); await flush()
  expect(c.getSnapshot().phase).toBe('interrupted')
  expect(c.getSnapshot().snapshot?.state_hash).toBe(data.initial.state_hash)
  expect(c.getSnapshot().record?.events).toHaveLength(0)
})
it('retains uncertainty detected during inspection instead of silently trusting the solve clock', async () => {
  const { c, at } = await setup()
  c.start(true); at(100, 5000); c.pulse(); c.beginSolve()
  expect(c.getSnapshot().record?.timing_integrity).toBe('uncertain')
  expect(c.getSnapshot().record?.integrity_notes).toContain('Inspection clock continuity is unverified.')
})
it('does not invalidate a completed recording when the page is hidden after the solve', async () => {
  const { c, api, at } = await setup(data.r)
  api.plan.mockResolvedValue(data.inverseR)
  c.start(false); at(500); c.move("R'"); await flush()
  expect(c.getSnapshot().phase).toBe('complete')
  c.markUncertain('Page hidden after completion')
  expect(c.getSnapshot().record?.timing_integrity).toBe('valid')
  expect(c.getSnapshot().uncertain).toBe(false)
})
