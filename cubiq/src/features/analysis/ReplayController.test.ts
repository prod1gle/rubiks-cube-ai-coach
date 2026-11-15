import { expect, it } from 'vitest'
import type { ComparisonReply } from '../../api/cube'
import fixtures from '../../test/cube-analysis.json'
import { ReplayController } from './ReplayController'
const reply = fixtures.reply as unknown as ComparisonReply
const create = () => new ReplayController(reply.start, reply.actual.plan, reply.alternatives[0].plan)
const land = (c: ReplayController) => { const s = c.getSnapshot(); if (s.leftTurn) c.finish(s.leftTurn.id); if (s.rightTurn) c.finish(s.rightTurn.id) }

it('starts both cubes at the identical exact state and waits for both animation callbacks', () => {
  const c = create(); expect(c.getSnapshot().left).toBe(reply.start); expect(c.getSnapshot().right).toBe(reply.start)
  c.step(1); const { leftTurn, rightTurn } = c.getSnapshot()
  c.step(1); c.finish(leftTurn!.id); c.finish(leftTurn!.id)
  expect(c.getSnapshot().cursor).toBe(0)
  expect(c.getSnapshot().left).toBe(reply.start)
  c.finish(rightTurn!.id)
  expect(c.getSnapshot().cursor).toBe(1)
  c.finish(rightTurn!.id); expect(c.getSnapshot().cursor).toBe(1)
})
it('reverses exact engine descriptors and holds the shorter branch endpoint', () => {
  const c = create(); c.seek(c.length)
  expect(c.getSnapshot().right.state_hash).toBe(reply.alternatives[0].end.state_hash)
  c.step(-1); expect(c.getSnapshot().rightTurn).toBeUndefined(); land(c)
  expect(c.getSnapshot().cursor).toBe(c.length - 1)
  c.seek(1); c.step(-1)
  expect(c.getSnapshot().leftTurn?.animation).toEqual(reply.actual.plan.steps[0].inverse_animation)
  land(c); expect(c.getSnapshot().left).toBe(reply.start); expect(c.getSnapshot().right).toBe(reply.start)
})
it('pauses at the shared barrier and rejects callbacks after disposal', () => {
  const c = create(); c.play(); const old = c.getSnapshot().leftTurn!.id
  c.pause(); land(c); expect(c.getSnapshot().cursor).toBe(1); expect(c.getSnapshot().playing).toBe(false)
  c.step(1); c.dispose(); c.finish(old); expect(c.getSnapshot().cursor).toBe(1)
})
it('plays both plans to their independently verified endpoints', async () => {
  const c = create(); c.play()
  for (let i = 0; i < c.length; i++) { land(c); await Promise.resolve() }
  expect(c.getSnapshot().cursor).toBe(c.length)
  expect(c.getSnapshot().left.state_hash).toBe(reply.actual.end.state_hash)
  expect(c.getSnapshot().right.state_hash).toBe(reply.alternatives[0].end.state_hash)
  expect(c.getSnapshot().playing).toBe(false)
})
it('rejects mismatched starts and broken plan chains', () => {
  expect(() => new ReplayController(reply.start, { ...reply.actual.plan, input_hash: 'wrong' }, reply.alternatives[0].plan)).toThrow('starting state')
  const broken = structuredClone(reply.actual.plan); broken.steps[1].before_hash = 'wrong'
  expect(() => new ReplayController(reply.start, broken, reply.alternatives[0].plan)).toThrow('broken state chain')
})
