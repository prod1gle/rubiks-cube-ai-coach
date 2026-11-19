// Synthetic clocks; these are not saved performance data.
import { expect, it } from 'vitest'
import { PhysicalTimer } from './PhysicalTimer'
function setup() { let mono = 0, wall = 0; const timer = new PhysicalTimer(() => mono, () => wall); return { timer, at: (n: number, w = n) => { mono = n; wall = w } } }
it('separates inspection from physical elapsed time and invents no move data', () => {
  const { timer, at } = setup(); timer.start(true, "R U"); at(16000); timer.beginSolve(); at(18750); timer.stop()
  expect(timer.getSnapshot().record).toMatchObject({ source: 'physical-stopwatch', elapsed_ms: 2750, inspection_ms: 16000, status: 'stopped', timing_integrity: 'valid', scramble: 'R U' })
  expect(timer.getSnapshot().record).not.toHaveProperty('events'); expect(timer.getSnapshot().record).not.toHaveProperty('initial_state')
})
it('cancels inspection without creating a solve result', () => { const { timer } = setup(); timer.start(true); timer.stop(); expect(timer.getSnapshot().phase).toBe('ready'); expect(timer.getSnapshot().record).toBeUndefined() })
it('marks background and divergent clocks uncertain without pretending to verify solvedness', () => {
  const { timer, at } = setup(); timer.start(false); timer.markUncertain('hidden'); at(500, 5000); timer.stop()
  expect(timer.getSnapshot().record?.timing_integrity).toBe('uncertain'); expect(timer.getSnapshot().record?.integrity_notes).toHaveLength(2)
})
it('interrupts an invalid clock using the last measured elapsed value', () => {
  const { timer, at } = setup(); timer.start(false); at(500); timer.pulse(); at(400); timer.stop()
  expect(timer.getSnapshot().record).toMatchObject({ status: 'interrupted', elapsed_ms: 500, timing_integrity: 'uncertain' })
})
it('cannot silently save a valid clamped 24-hour run after throttling', () => {
  const { timer, at } = setup(); timer.start(false); at(86400001); timer.stop()
  expect(timer.getSnapshot().record).toMatchObject({ status: 'interrupted', timing_integrity: 'uncertain' })
})
