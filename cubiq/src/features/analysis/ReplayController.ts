import type { CubePlan, CubeSnapshot } from '../../api/cube'
import type { ActiveTurn } from '../cube/CubeController'
export interface ReplayState { cursor: number; playing: boolean; left: CubeSnapshot; right: CubeSnapshot; leftTurn?: ActiveTurn; rightTurn?: ActiveTurn }
/** Two opaque plan cursors and a completion barrier; no cube mathematics. */
export class ReplayController {
  private state: ReplayState
  private listeners = new Set<() => void>()
  private serial = 0
  private pending?: { cursor: number; ids: Set<string> }
  readonly length: number
  constructor(readonly start: CubeSnapshot, readonly leftPlan: CubePlan, readonly rightPlan: CubePlan) {
    for (const plan of [leftPlan, rightPlan]) {
      let hash = start.state_hash
      if (plan.input_hash !== hash) throw new Error('Comparison plans do not share the exact starting state.')
      for (const step of plan.steps) {
        if (step.before_hash !== hash) throw new Error('Comparison replay has a broken state chain.')
        hash = step.snapshot.state_hash
      }
    }
    this.length = Math.max(leftPlan.steps.length, rightPlan.steps.length)
    this.state = { cursor: 0, playing: false, left: start, right: start }
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<ReplayState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()) }
  private at(plan: CubePlan, cursor: number) { return plan.steps[Math.min(cursor, plan.steps.length) - 1]?.snapshot ?? this.start }
  seek = (cursor: number) => {
    if (this.pending || !Number.isInteger(cursor) || cursor < 0 || cursor > this.length) return
    this.serial++
    this.publish({ cursor, playing: false, left: this.at(this.leftPlan, cursor), right: this.at(this.rightPlan, cursor), leftTurn: undefined, rightTurn: undefined })
  }
  step = (direction: 1 | -1) => {
    if (this.pending) return
    const target = this.state.cursor + direction
    if (target < 0 || target > this.length) { this.pause(); return }
    const ids = new Set<string>(), serial = ++this.serial
    const turn = (plan: CubePlan, side: string): ActiveTurn | undefined => {
      const index = direction === 1 ? this.state.cursor : target
      const step = plan.steps[index]
      if (!step) return
      const id = `${side}:${serial}`; ids.add(id)
      return { id, token: direction === 1 ? step.token : step.inverse, animation: direction === 1 ? step.animation : step.inverse_animation, after: this.at(plan, target) }
    }
    const leftTurn = turn(this.leftPlan, 'left'), rightTurn = turn(this.rightPlan, 'right')
    this.pending = { cursor: target, ids }
    this.publish({ leftTurn, rightTurn })
    if (!ids.size) this.commit()
  }
  finish = (id: string) => {
    if (!this.pending?.ids.delete(id)) return
    if (!this.pending.ids.size) this.commit()
  }
  private commit() {
    if (!this.pending) return
    const cursor = this.pending.cursor; this.pending = undefined
    this.publish({ cursor, left: this.at(this.leftPlan, cursor), right: this.at(this.rightPlan, cursor), leftTurn: undefined, rightTurn: undefined })
    if (this.state.playing) queueMicrotask(() => { if (this.state.playing) this.step(1) })
  }
  play = () => { if (this.state.cursor === this.length && !this.pending) this.seek(0); this.publish({ playing: true }); this.step(1) }
  pause = () => this.publish({ playing: false })
  dispose = () => { this.pending = undefined; this.serial++; this.publish({ playing: false, leftTurn: undefined, rightTurn: undefined }) }
}
