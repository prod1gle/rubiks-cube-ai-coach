import { getCube, importCubeFacelets, planCubeSequence, scrambleCube, solveCube, solveCFOP, getCoaching } from '../../api/cube'
import type { CanonicalCubeState, CoachingReply, CubePlan, CubeSnapshot, CubeSolution, CubeTransition, HintContinuation, HintSettings, TurnAnimation } from '../../api/cube'

export interface CubeTransport {
  load: (signal: AbortSignal) => Promise<CubeSnapshot>
  plan: (state: CanonicalCubeState, sequence: string, signal: AbortSignal) => Promise<CubePlan>
  scramble: (state: CanonicalCubeState, signal: AbortSignal) => Promise<CubePlan>
  import: (facelets: string, signal: AbortSignal) => Promise<CubeSnapshot>
  solve: (state: CanonicalCubeState, signal: AbortSignal) => Promise<CubeSolution>
  cfop: (state: CanonicalCubeState, signal: AbortSignal) => Promise<CubeSolution>
  hint: (state: CanonicalCubeState, settings: HintSettings, signal: AbortSignal, continuation?: HintContinuation) => Promise<CoachingReply>
}
const transport: CubeTransport = { load: getCube, plan: planCubeSequence, scramble: scrambleCube, import: importCubeFacelets, solve: solveCube, cfop: solveCFOP, hint: getCoaching }
export interface ActiveTurn { id: string; token: string; animation: TurnAnimation; after: CubeSnapshot }
export interface ExplorerState {
  snapshot?: CubeSnapshot; active?: ActiveTurn; history: readonly CubeTransition[]; cursor: number
  loading: boolean; planning: boolean; pending: number; paused: boolean; playing: boolean
  error: string; lastAlgorithm: string
  solving: boolean; solution?: CubeSolution; solutionStart?: number
  hintEnabled: boolean; hintLoading: boolean; hintError: string; coaching?: CoachingReply; hintSelectedId?: string
}
type Command = { kind: 'moves'; sequence: string } | { kind: 'scramble' }
type Completion = { id: string; step: CubeTransition } | { id: string; cursor: number }

/** Orders opaque engine snapshots. Contains no cube transformations or notation rules. */
export class CubeController {
  private state: ExplorerState = { history: [], cursor: 0, loading: true, planning: false, pending: 0, paused: false, playing: false, error: '', lastAlgorithm: '', solving: false, hintEnabled: false, hintLoading: false, hintError: '' }
  private listeners = new Set<() => void>()
  private commands: Command[] = []
  private steps: CubeTransition[] = []
  private completion?: Completion
  private baseline?: CubeSnapshot
  private abort?: AbortController
  private epoch = 0
  private serial = 0
  private live = false
  private playUntil?: number
  private hintSettings?: HintSettings
  private hintAbort?: AbortController
  private hintSerial = 0
  private lastHintKey?: string
  private hintContinuation?: HintContinuation
  constructor(private api: CubeTransport = transport) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<ExplorerState> = {}) {
    const changed = patch.snapshot && patch.snapshot.state_hash !== this.state.snapshot?.state_hash
    const next = { ...this.state, ...patch, pending: this.commands.length + this.steps.length + ((patch.planning ?? this.state.planning) ? 1 : 0) }
    const unstable = next.loading || next.solving || next.planning || !!next.active || next.pending > 0 || (next.playing && !next.paused)
    if (changed || (unstable && (next.coaching || next.hintLoading))) {
      this.invalidateHint()
      next.coaching = undefined; next.hintSelectedId = undefined; next.hintLoading = false; next.hintError = ''
    }
    this.state = next
    this.listeners.forEach(listener => listener())
    if (this.live && next.hintEnabled && !unstable && !next.hintLoading && !next.coaching && !next.hintError) queueMicrotask(() => void this.fetchHint())
  }
  connect = () => { if (!this.live) { this.live = true; void this.reset() } }
  disconnect = () => { this.live = false; this.epoch++; this.abort?.abort(); this.invalidateHint(); this.hintContinuation = undefined; this.commands = []; this.steps = []; this.completion = undefined; this.playUntil = undefined }
  private invalidateHint() { this.hintSerial++; this.hintAbort?.abort(); this.lastHintKey = undefined }
  requestHint = (settings: HintSettings) => {
    if (JSON.stringify(settings) !== JSON.stringify(this.hintSettings)) this.hintContinuation = undefined
    this.invalidateHint(); this.hintSettings = { ...settings }
    this.publish({ hintEnabled: true, coaching: undefined, hintSelectedId: undefined, hintLoading: false, hintError: '' })
  }
  disableHints = () => {
    this.invalidateHint(); this.hintContinuation = undefined
    this.publish({ hintEnabled: false, coaching: undefined, hintSelectedId: undefined, hintLoading: false, hintError: '' })
  }
  private async fetchHint() {
    if (!this.live || !this.hintSettings || !this.state.hintEnabled || !this.canSeek() || (this.state.playing && !this.state.paused) || !this.state.snapshot) return
    const snapshot = this.state.snapshot, settings = this.hintSettings
    const key = snapshot.state_hash + JSON.stringify(settings) + JSON.stringify(this.hintContinuation)
    if (this.lastHintKey === key) return
    this.lastHintKey = key
    const serial = ++this.hintSerial
    this.hintAbort?.abort(); this.hintAbort = new AbortController()
    this.publish({ hintLoading: true, hintError: '' })
    try {
      const coaching = await this.api.hint(snapshot.state, settings, this.hintAbort.signal, this.hintContinuation)
      if (!this.live || serial !== this.hintSerial || this.state.snapshot?.state_hash !== snapshot.state_hash) return
      const ids = new Set(snapshot.cubies.map(c => c.id))
      if (coaching.input_hash !== snapshot.state_hash || coaching.mode !== settings.mode ||
        coaching.ranking !== (settings.mode === 'short' ? 'htm' : settings.ranking) ||
        coaching.allow_rotations !== (settings.mode === 'cfop' && settings.allow_rotations) ||
        new Set(coaching.candidates.map(c => c.id)).size !== coaching.candidates.length ||
        coaching.candidates.some(c => c.input_hash !== snapshot.state_hash || c.first_move !== c.notation.split(/\s+/)[0] || c.highlight_ids.some(id => !ids.has(id))) ||
        (coaching.status === 'ready' && !coaching.candidates.some(c => c.id === coaching.recommended_id)) ||
        (coaching.status === 'solved' && (!snapshot.is_solved || coaching.candidates.length > 0))) {
        throw new Error('The engine returned a stale or inconsistent hint. No moves were applied.')
      }
      this.publish({ coaching, hintSelectedId: coaching.recommended_id ?? undefined, hintLoading: false })
      if (!coaching.continuation) this.hintContinuation = undefined
    } catch (error) {
      if (this.live && serial === this.hintSerial) this.publish({ hintLoading: false, hintError: this.message(error) })
    }
  }
  selectHint = (id: string) => {
    if (this.state.coaching?.input_hash === this.state.snapshot?.state_hash && this.state.coaching?.candidates.some(c => c.id === id)) this.publish({ hintSelectedId: id })
  }
  applyHint = (single: boolean) => {
    const coaching = this.state.coaching
    const candidate = coaching?.candidates.find(c => c.id === this.state.hintSelectedId)
    if (!this.canSeek() || (this.state.playing && !this.state.paused) || !candidate || coaching?.input_hash !== this.state.snapshot?.state_hash) return false
    // Stop paused history playback before branching into this exact state's hint.
    this.publish({ paused: false, playing: false })
    if (single && this.state.snapshot) {
      const context = coaching?.continuation ?? { start_state: this.state.snapshot.state, candidate_id: candidate.id, consumed: 0 }
      this.hintContinuation = { ...context, consumed: context.consumed + 1 }
    } else this.hintContinuation = undefined
    return this.add({ kind: 'moves', sequence: single ? candidate.first_move : candidate.notation }, true)
  }
  replanHint = () => {
    if (!this.hintSettings) return
    this.hintContinuation = undefined; this.requestHint(this.hintSettings)
  }
  stopQueue = () => {
    if (this.state.active || this.state.loading || this.state.solving) return
    this.epoch++; this.abort?.abort(); this.hintContinuation = undefined; this.commands = []; this.steps = []; this.completion = undefined; this.playUntil = undefined
    this.publish({ planning: false, playing: false, paused: false })
  }
  private async replace(operation: (signal: AbortSignal) => Promise<CubeSnapshot>) {
    if (!this.live) return
    const epoch = ++this.epoch
    this.hintContinuation = undefined
    this.abort?.abort(); this.abort = new AbortController()
    this.commands = []; this.steps = []; this.completion = undefined
    this.playUntil = undefined
    this.publish({ active: undefined, loading: true, planning: false, paused: false, playing: false, solving: false, error: '' })
    try {
      const snapshot = await operation(this.abort.signal)
      if (!this.live || epoch !== this.epoch) return
      this.baseline = snapshot
      this.publish({ snapshot, history: [], cursor: 0, loading: false, lastAlgorithm: '', solution: undefined, solutionStart: undefined })
    } catch (error) {
      if (this.live && epoch === this.epoch) this.publish({ loading: false, error: this.message(error) })
    }
  }
  reset = () => this.replace(this.api.load)
  importFacelets = (facelets: string) => this.replace(signal => this.api.import(facelets, signal))
  private message(error: unknown) { return error instanceof Error ? error.message : 'Unable to reach the cube engine.' }
  enqueue = (sequence: string) => this.add({ kind: 'moves', sequence })
  scramble = () => this.add({ kind: 'scramble' })
  private add(command: Command, fromHint = false) {
    if (!this.live || !this.state.snapshot || this.state.loading || this.state.solving) return false
    if (!fromHint) this.hintContinuation = undefined
    if (this.commands.length >= 64) { this.publish({ error: 'The input queue is full (64 requests). Let it finish or reset.' }); return false }
    this.commands.push(command)
    this.playUntil = undefined
    this.publish({ error: '', playing: false })
    void this.pump()
    return true
  }
  private async pump() {
    if (!this.live || this.state.loading || this.state.solving || this.state.planning || this.state.active || this.state.paused || !this.state.snapshot) return
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
        this.checkPlan(plan, snapshot)
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
    if (this.state.playing && this.state.cursor < (this.playUntil ?? this.state.history.length)) this.forward()
    else { this.playUntil = undefined; this.publish({ playing: false }) }
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
      this.publish({ snapshot: active.after, active: undefined, history, cursor: history.length, solution: undefined, solutionStart: undefined })
    } else this.publish({ snapshot: active.after, active: undefined, cursor: completion.cursor })
    queueMicrotask(() => void this.pump())
  }
  private canSeek() { return !this.state.loading && !this.state.solving && !this.state.planning && !this.state.active && !this.commands.length && !this.steps.length }
  private checkPlan(plan: CubePlan, snapshot: CubeSnapshot) {
    if (plan.input_hash !== snapshot.state_hash) throw new Error('The engine plan belongs to a different state. No moves were applied.')
    let hash = snapshot.state_hash
    for (const step of plan.steps) {
      if (step.before_hash !== hash) throw new Error('The engine returned a discontinuous plan. No moves were applied.')
      hash = step.snapshot.state_hash
    }
    if (this.state.cursor + plan.steps.length > 1024) throw new Error('Explorer history is limited to 1024 turns. Reset or import a state to start a new sequence.')
  }
  solve = async (approach: 'short' | 'cfop' = 'short') => {
    if (!this.live || !this.canSeek() || (this.state.playing && !this.state.paused) || !this.state.snapshot) return
    const epoch = this.epoch, snapshot = this.state.snapshot, start = this.state.cursor
    this.hintContinuation = undefined
    this.abort = new AbortController()
    this.playUntil = undefined
    this.publish({ solving: true, paused: false, playing: false, error: '' })
    try {
      const solution = await (approach === 'cfop' ? this.api.cfop : this.api.solve)(snapshot.state, this.abort.signal)
      if (!this.live || epoch !== this.epoch) return
      this.checkPlan(solution.plan, snapshot)
      const final = solution.plan.steps.at(-1)?.snapshot ?? snapshot
      if (solution.method !== (approach === 'cfop' ? 'cfop' : 'kociemba-two-phase') ||
        solution.input_hash !== snapshot.state_hash || !solution.verified || solution.optimality !== 'unproven' ||
        solution.notation !== solution.plan.sequence.normalized || solution.move_count !== solution.plan.sequence.htm ||
        solution.metric !== solution.plan.sequence.metric || final.state_hash !== solution.result_hash || !final.is_solved) {
        throw new Error('The engine returned an inconsistent solution. No moves were applied.')
      }
      if (approach === 'cfop') this.checkStages(solution, snapshot)
      // Future snapshots are preview data. The cursor and real accepted state
      // stay unchanged until the existing animation commit path advances them.
      this.publish({ solving: false, solution, solutionStart: start,
        history: [...this.state.history.slice(0, start), ...solution.plan.steps], playing: false })
    } catch (error) {
      if (this.live && epoch === this.epoch) this.publish({ solving: false, error: this.message(error) })
    }
  }
  private checkStages(solution: CubeSolution, snapshot: CubeSnapshot) {
    const stages = solution.stages
    let offset = 0, hash = snapshot.state_hash
    if (!stages || stages.length !== 8 || new Set(stages.map(stage => stage.id)).size !== 8) throw new Error('Invalid CFOP stage manifest. No moves were applied.')
    const kinds = ['cross', 'f2l', 'f2l', 'f2l', 'f2l', 'oll', 'pll', 'auf']
    const slots = new Set<string>()
    for (const [index, stage] of stages.entries()) {
      if (stage.kind === 'f2l') {
        if (!stage.slot || !['FR', 'FL', 'BL', 'BR'].includes(stage.slot) || slots.has(stage.slot) || stage.id !== `f2l-${stage.slot}`) throw new Error('Invalid CFOP pair manifest. No moves were applied.')
        slots.add(stage.slot)
      } else if (stage.id !== stage.kind) throw new Error('Invalid CFOP stage identifier. No moves were applied.')
      const end = stage.end_step
      const after = end === 0 ? snapshot : solution.plan.steps[end - 1]?.snapshot
      if (stage.kind !== kinds[index] || stage.start_step !== offset || end < offset ||
        stage.move_count !== end - offset || stage.before_hash !== hash || stage.after_hash !== after?.state_hash ||
        stage.notation !== solution.plan.steps.slice(offset, end).map(step => step.token).join(' ')) {
        throw new Error('The engine returned inconsistent CFOP stage boundaries. No moves were applied.')
      }
      offset = end; hash = stage.after_hash
    }
    if (offset !== solution.plan.steps.length) throw new Error('Incomplete CFOP stage manifest. No moves were applied.')
  }
  cancelSolve = () => {
    if (!this.state.solving) return
    this.epoch++; this.abort?.abort()
    this.publish({ solving: false })
  }
  solutionStart = () => {
    if (this.state.solutionStart !== undefined) this.seek(this.state.solutionStart)
  }
  playSolution = () => {
    if (!this.canSeek() || !this.state.solution?.plan.steps.length || this.state.solutionStart === undefined) return
    if (this.state.cursor < this.state.solutionStart || this.state.cursor === this.state.history.length) this.solutionStart()
    this.playUntil = undefined
    this.publish({ playing: true, paused: false }); void this.pump()
  }
  playStage = (id: string) => {
    if (!this.canSeek() || this.state.solutionStart === undefined) return
    const stage = this.state.solution?.stages?.find(row => row.id === id)
    if (!stage) return
    const start = this.state.solutionStart
    this.seek(start + stage.start_step)
    if (stage.start_step === stage.end_step) return
    this.playUntil = start + stage.end_step
    this.publish({ playing: true, paused: false }); void this.pump()
  }
  back = () => {
    if (!this.canSeek() || this.state.cursor === 0) return
    this.hintContinuation = undefined
    this.playUntil = undefined
    this.publish({ playing: false, paused: false })
    const cursor = this.state.cursor - 1, step = this.state.history[cursor]
    const after = cursor === 0 ? this.baseline : this.state.history[cursor - 1].snapshot
    if (after) this.activate(step.inverse_animation, after, step.inverse, { cursor })
  }
  forward = () => {
    if (!this.canSeek() || this.state.cursor >= this.state.history.length) return
    this.hintContinuation = undefined
    const step = this.state.history[this.state.cursor]
    this.activate(step.animation, step.snapshot, step.token, { cursor: this.state.cursor + 1 })
  }
  seek = (cursor: number) => {
    if (!this.canSeek() || !Number.isInteger(cursor) || cursor < 0 || cursor > this.state.history.length) return
    this.hintContinuation = undefined
    const snapshot = cursor === 0 ? this.baseline : this.state.history[cursor - 1].snapshot
    if (snapshot) { this.playUntil = undefined; this.publish({ snapshot, cursor, playing: false, paused: false }) }
  }
  pause = () => this.publish({ paused: true })
  resume = () => { this.publish({ paused: false }); void this.pump() }
  play = () => {
    if (this.state.paused) { this.resume(); return }
    if (!this.canSeek() || !this.state.history.length) return
    this.playUntil = undefined
    if (this.state.cursor === this.state.history.length && this.baseline) this.publish({ snapshot: this.baseline, cursor: 0 })
    this.publish({ playing: true, paused: false })
    void this.pump()
  }
}
