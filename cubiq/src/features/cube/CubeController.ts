import { getCube, importCubeFacelets, planCubeSequence, scrambleCube } from '../../api/cube'
import type { CanonicalCubeState, CubePlan, CubeSnapshot, CubeTransition, TurnAnimation } from '../../api/cube'

export interface CubeTransport {
  load: (signal: AbortSignal) => Promise<CubeSnapshot>
  plan: (state: CanonicalCubeState, sequence: string, signal: AbortSignal) => Promise<CubePlan>
  scramble: (state: CanonicalCubeState, signal: AbortSignal) => Promise<CubePlan>
  import: (facelets: string, signal: AbortSignal) => Promise<CubeSnapshot>
}
const transport: CubeTransport = { load: getCube, plan: planCubeSequence, scramble: scrambleCube, import: importCubeFacelets }
export interface ActiveTurn { id: string; token: string; animation: TurnAnimation; after: CubeSnapshot }
export interface ExplorerState {
  snapshot?: CubeSnapshot; active?: ActiveTurn; history: readonly CubeTransition[]; cursor: number
  loading: boolean; planning: boolean; pending: number; paused: boolean; playing: boolean
  error: string; lastAlgorithm: string
}
type Command = { kind: 'moves'; sequence: string } | { kind: 'scramble' }
type Completion = { id: string; step: CubeTransition } | { id: string; cursor: number }

/** Orders opaque engine snapshots. Contains no cube transformations or notation rules. */
export class CubeController {
  private state: ExplorerState = { history: [], cursor: 0, loading: true, planning: false, pending: 0, paused: false, playing: false, error: '', lastAlgorithm: '' }
  private listeners = new Set<() => void>()
  private commands: Command[] = []
  private steps: CubeTransition[] = []
  private completion?: Completion
  private baseline?: CubeSnapshot
  private abort?: AbortController
  private epoch = 0
  private serial = 0
  private live = false
  constructor(private api: CubeTransport = transport) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<ExplorerState> = {}) {
    this.state = { ...this.state, ...patch, pending: this.commands.length + this.steps.length + ((patch.planning ?? this.state.planning) ? 1 : 0) }
    this.listeners.forEach(listener => listener())
  }
  connect = () => { if (!this.live) { this.live = true; void this.reset() } }
  disconnect = () => { this.live = false; this.epoch++; this.abort?.abort(); this.commands = []; this.steps = []; this.completion = undefined }
  private async replace(operation: (signal: AbortSignal) => Promise<CubeSnapshot>) {
    if (!this.live) return
    const epoch = ++this.epoch
    this.abort?.abort(); this.abort = new AbortController()
    this.commands = []; this.steps = []; this.completion = undefined
    this.publish({ active: undefined, loading: true, planning: false, paused: false, playing: false, error: '' })
    try {
      const snapshot = await operation(this.abort.signal)
      if (!this.live || epoch !== this.epoch) return
      this.baseline = snapshot
      this.publish({ snapshot, history: [], cursor: 0, loading: false, lastAlgorithm: '' })
    } catch (error) {
      if (this.live && epoch === this.epoch) this.publish({ loading: false, error: this.message(error) })
    }
  }
  reset = () => this.replace(this.api.load)
  importFacelets = (facelets: string) => this.replace(signal => this.api.import(facelets, signal))
  private message(error: unknown) { return error instanceof Error ? error.message : 'Unable to reach the cube engine.' }
  enqueue = (sequence: string) => this.add({ kind: 'moves', sequence })
  scramble = () => this.add({ kind: 'scramble' })
  private add(command: Command) {
    if (!this.live || !this.state.snapshot || this.state.loading) return false
    if (this.commands.length >= 64) { this.publish({ error: 'The input queue is full (64 requests). Let it finish or reset.' }); return false }
    this.commands.push(command)
    this.publish({ error: '', playing: false })
    void this.pump()
    return true
  }
  private async pump() {
    if (!this.live || this.state.loading || this.state.planning || this.state.active || this.state.paused || !this.state.snapshot) return
    const next = this.steps.shift()
    if (next) { this.activate(next.animation, next.snapshot, next.token, { step: next }); return }
    const command = this.commands.shift()
    if (command) {
      const epoch = this.epoch, snapshot = this.state.snapshot
      this.abort = new AbortController()
      this.publish({ planning: true })
      try {
        const plan = await (command.kind === 'scramble'
          ? this.api.scramble(snapshot.state, this.abort.signal)
          : this.api.plan(snapshot.state, command.sequence, this.abort.signal))
        if (!this.live || epoch !== this.epoch) return
        if (plan.input_hash !== snapshot.state_hash) throw new Error('The engine plan belongs to a different state. No moves were applied.')
        let hash = snapshot.state_hash
        for (const step of plan.steps) {
          if (step.before_hash !== hash) throw new Error('The engine returned a discontinuous plan. No moves were applied.')
          hash = step.snapshot.state_hash
        }
        if (this.state.cursor + plan.steps.length > 1024) throw new Error('Explorer history is limited to 1024 turns. Reset or import a state to start a new sequence.')
        this.steps = [...plan.steps]
        this.publish({ planning: false, lastAlgorithm: plan.sequence.normalized })
        void this.pump()
      } catch (error) {
        if (!this.live || epoch !== this.epoch) return
        this.commands = []; this.steps = []
        this.publish({ planning: false, paused: false, playing: false, error: `${this.message(error)} Remaining queued inputs were cleared; the accepted state is retained.` })
      }
      return
    }
    if (this.state.playing && this.state.cursor < this.state.history.length) this.forward()
    else this.publish({ playing: false })
  }
  private activate(animation: TurnAnimation, after: CubeSnapshot, token: string, target: { step: CubeTransition } | { cursor: number }) {
    const id = `${this.epoch}:${++this.serial}`
    this.completion = { id, ...target }
    this.publish({ active: { id, token, animation, after } })
  }
  finish = (id: string) => {
    const completion = this.completion, active = this.state.active
    if (!this.live || !active || active.id !== id || !completion || completion.id !== id) return
    this.completion = undefined
    if ('step' in completion) {
      const history = [...this.state.history.slice(0, this.state.cursor), completion.step]
      this.publish({ snapshot: active.after, active: undefined, history, cursor: history.length })
    } else this.publish({ snapshot: active.after, active: undefined, cursor: completion.cursor })
    queueMicrotask(() => void this.pump())
  }
  private canSeek() { return !this.state.loading && !this.state.planning && !this.state.active && !this.commands.length && !this.steps.length }
  back = () => {
    if (!this.canSeek() || this.state.cursor === 0) return
    this.publish({ playing: false, paused: false })
    const cursor = this.state.cursor - 1, step = this.state.history[cursor]
    const after = cursor === 0 ? this.baseline : this.state.history[cursor - 1].snapshot
    if (after) this.activate(step.inverse_animation, after, step.inverse, { cursor })
  }
  forward = () => {
    if (!this.canSeek() || this.state.cursor >= this.state.history.length) return
    const step = this.state.history[this.state.cursor]
    this.activate(step.animation, step.snapshot, step.token, { cursor: this.state.cursor + 1 })
  }
  seek = (cursor: number) => {
    if (!this.canSeek() || !Number.isInteger(cursor) || cursor < 0 || cursor > this.state.history.length) return
    const snapshot = cursor === 0 ? this.baseline : this.state.history[cursor - 1].snapshot
    if (snapshot) this.publish({ snapshot, cursor, playing: false, paused: false })
  }
  pause = () => this.publish({ paused: true })
  resume = () => { this.publish({ paused: false }); void this.pump() }
  play = () => {
    if (this.state.paused) { this.resume(); return }
    if (!this.canSeek() || !this.state.history.length) return
    if (this.state.cursor === this.state.history.length && this.baseline) this.publish({ snapshot: this.baseline, cursor: 0 })
    this.publish({ playing: true, paused: false })
    void this.pump()
  }
}
