import { getCube, importCubeFacelets, planCubeSequence, scrambleCube } from '../../api/cube'
import type { CanonicalCubeState, CubePlan, CubeSnapshot, TimedRecording } from '../../api/cube'
import { storeTimedRecording } from './recording'
export interface TimerTransport {
  load: (signal: AbortSignal) => Promise<CubeSnapshot>
  import: (facelets: string, signal: AbortSignal) => Promise<CubeSnapshot>
  plan: (state: CanonicalCubeState, token: string, signal: AbortSignal) => Promise<CubePlan>
  scramble: (state: CanonicalCubeState, signal: AbortSignal) => Promise<CubePlan>
}
const transport: TimerTransport = { load: getCube, import: importCubeFacelets, plan: planCubeSequence, scramble: scrambleCube }
export type TimerPhase = 'ready' | 'inspection' | 'running' | 'paused' | 'stopping' | 'complete' | 'stopped' | 'interrupted'
interface TimerState { phase: TimerPhase; loading: boolean; pending: number; snapshot?: CubeSnapshot; error: string; elapsed_ms: number; inspection_ms: number; htm: number; rotations: number; record?: TimedRecording; uncertain: boolean }
/** Manual input capture. Engine acknowledgements confirm states, never set input times. */
export class TimerController {
  private state: TimerState = { phase: 'ready', loading: true, pending: 0, error: '', elapsed_ms: 0, inspection_ms: 0, htm: 0, rotations: 0, uncertain: false }
  private listeners = new Set<() => void>()
  private epoch = 0
  private live = false
  private queue: { token: string; at_ms: number }[] = []
  private processing = false
  private abort?: AbortController
  private record?: TimedRecording
  private origin = 0
  private wallOrigin = 0
  private lastMono = -Infinity
  private inspectionStart = 0
  private inspectionWallStart = 0
  private pendingNotes: string[] = []
  private pauseStart?: number
  private stopAt?: number
  constructor(private api: TimerTransport = transport, private clock = () => performance.now(), private wall = () => Date.now(), private save = storeTimedRecording) {}
  getSnapshot = () => this.state
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private publish(patch: Partial<TimerState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()) }
  private stamp() {
    const value = this.clock()
    if (!Number.isFinite(value) || value < this.lastMono) throw new Error('The monotonic clock changed or became invalid.')
    this.lastMono = value
    return value
  }
  private persist() {
    if (!this.record) return
    const value = structuredClone(this.record)
    if (this.pauseStart !== undefined) value.pauses.push({ start_ms: this.pauseStart, end_ms: value.elapsed_ms })
    try { this.save(value) } catch { this.publish({ error: 'Session storage is unavailable. Keep this page open; the in-memory recording remains available.' }) }
    this.publish({ record: value })
  }
  connect = () => { if (!this.live) { this.live = true; void this.prepare(signal => this.api.load(signal)) } }
  disconnect = () => { if (this.active()) this.interrupt('Recording interrupted by page navigation or reload.'); this.live = false; this.epoch++; this.abort?.abort() }
  private active() { return ['inspection', 'running', 'paused', 'stopping'].includes(this.state.phase) }
  private async prepare(load: (signal: AbortSignal) => Promise<CubeSnapshot>) {
    if (!this.live || this.active()) return
    const epoch = ++this.epoch; this.abort?.abort(); this.abort = new AbortController()
    this.publish({ loading: true, error: '' })
    try {
      const snapshot = await load(this.abort.signal)
      if (!this.live || epoch !== this.epoch) return
      this.record = undefined; this.queue = []; this.processing = false
      this.publish({ snapshot, phase: 'ready', loading: false, pending: 0, elapsed_ms: 0, inspection_ms: 0, htm: 0, rotations: 0, record: undefined, uncertain: false })
    } catch (e) { if (this.live && epoch === this.epoch) this.publish({ loading: false, error: e instanceof Error ? e.message : 'Cube preparation failed.' }) }
  }
  scramble = () => this.prepare(async signal => { const initial = await this.api.load(signal); const plan = await this.api.scramble(initial.state, signal); return this.checked(plan, initial, false) })
  importFacelets = (facelets: string) => this.prepare(signal => this.api.import(facelets, signal))
  private checked(plan: CubePlan, snapshot: CubeSnapshot, single = true) {
    if (plan.input_hash !== snapshot.state_hash || (single && plan.steps.length !== 1)) throw new Error('The engine returned an inconsistent manual move plan.')
    let hash = snapshot.state_hash
    for (const step of plan.steps) { if (step.before_hash !== hash) throw new Error('The engine move chain is discontinuous.'); hash = step.snapshot.state_hash }
    if (!plan.steps.length) throw new Error('The engine returned no accepted moves.')
    return plan.steps.at(-1)!.snapshot
  }
  start = (inspection: boolean) => {
    if (this.state.loading || !this.state.snapshot || this.state.snapshot.is_solved || this.active()) return
    try {
      const now = this.stamp()
      this.pendingNotes = []
      if (inspection) { this.record = undefined; this.inspectionStart = now; this.inspectionWallStart = this.wall(); this.publish({ phase: 'inspection', inspection_ms: 0, elapsed_ms: 0, record: undefined, htm: 0, rotations: 0, uncertain: false, error: '' }); return }
      this.begin(now, 0)
    } catch (e) { this.publish({ error: String(e) }) }
  }
  beginSolve = () => {
    if (this.state.phase !== 'inspection') return
    try { const now = this.stamp(); if (Math.abs((this.wall() - this.inspectionWallStart) - (now - this.inspectionStart)) > 2000) this.markUncertain('Inspection clock continuity is unverified.'); this.begin(now, now - this.inspectionStart) } catch { this.interrupt('The inspection clock became invalid.') }
  }
  private begin(now: number, inspection: number) {
    if (!this.state.snapshot) return
    this.origin = now; this.wallOrigin = this.wall(); this.pauseStart = undefined; this.stopAt = undefined
    this.queue = []; this.processing = false
    this.record = { schema_version: 1, source: 'manual-virtual', clock_source: 'performance.now', clock_id: crypto.randomUUID(), started_mono_ms: now, initial_state: this.state.snapshot.state, events: [], pauses: [], elapsed_ms: 0, inspection_ms: inspection, status: 'interrupted', timing_integrity: this.pendingNotes.length ? 'uncertain' : 'valid', integrity_notes: [...this.pendingNotes], expected_end_hash: this.state.snapshot.state_hash }
    this.publish({ phase: 'running', inspection_ms: inspection, elapsed_ms: 0, htm: 0, rotations: 0, pending: 0, error: '', uncertain: this.pendingNotes.length > 0 }); this.persist()
  }
  pulse = () => {
    if (!this.active()) return
    try {
      const now = this.stamp()
      if (this.state.phase === 'inspection') { if (Math.abs((this.wall() - this.inspectionWallStart) - (now - this.inspectionStart)) > 2000) this.markUncertain('Inspection clock continuity is unverified.'); this.publish({ inspection_ms: now - this.inspectionStart }); return }
      const elapsed = this.stopAt ?? now - this.origin
      if (elapsed > 86_400_000) { this.interrupt('The manual recording exceeded its 24-hour limit.'); return }
      if (Math.abs((this.wall() - this.wallOrigin) - (now - this.origin)) > 2000) this.markUncertain('Wall and monotonic clocks diverged; sleep or clock discontinuity is possible.')
      if (this.record) this.record.elapsed_ms = elapsed
      this.publish({ elapsed_ms: elapsed })
    } catch { this.interrupt('The monotonic clock became invalid.') }
  }
  markUncertain = (note: string) => {
    if (!this.active()) return
    if (!this.record) { if (this.state.phase === 'inspection') { if (!this.pendingNotes.includes(note) && this.pendingNotes.length < 64) this.pendingNotes.push(note); this.publish({ uncertain: true }) } return }
    if (this.record.timing_integrity === 'uncertain' && this.record.integrity_notes.includes(note)) return
    this.record.timing_integrity = 'uncertain'
    if (!this.record.integrity_notes.includes(note) && this.record.integrity_notes.length < 64) this.record.integrity_notes.push(note)
    this.publish({ uncertain: true }); this.persist()
  }
  move = (token: string) => {
    if (this.state.phase !== 'running' || !this.record) return false
    if (this.queue.length >= 64 || this.record.events.length + this.queue.length + Number(this.processing) >= 1024) { this.interrupt('Manual input capacity exceeded; no further moves were accepted.'); return false }
    try { this.queue.push({ token, at_ms: this.stamp() - this.origin }); this.publish({ pending: this.queue.length + Number(this.processing) }); void this.pump(); return true }
    catch { this.interrupt('Input could not be timestamped reliably.'); return false }
  }
  private async pump() {
    if (this.processing || !this.record || !this.state.snapshot || !['running', 'paused', 'stopping'].includes(this.state.phase)) return
    const next = this.queue.shift()
    if (!next) { if (this.stopAt !== undefined) this.finish('stopped', this.stopAt); return }
    this.processing = true; const epoch = this.epoch, before = this.state.snapshot; this.abort = new AbortController()
    try {
      const plan = await this.api.plan(before.state, next.token, this.abort.signal)
      if (!this.live || epoch !== this.epoch || !this.record) return
      const snapshot = this.checked(plan, before), step = plan.steps[0], ack = this.stamp() - this.origin
      if (Math.abs((this.wall() - this.wallOrigin) - ack) > 2000) this.markUncertain('Wall and monotonic clocks diverged; sleep or clock discontinuity is possible.')
      this.record.events.push({ token: step.token, at_ms: next.at_ms, ack_ms: ack, before_hash: before.state_hash, after_hash: snapshot.state_hash })
      this.record.expected_end_hash = snapshot.state_hash
      this.record.elapsed_ms = Math.max(this.record.elapsed_ms, next.at_ms)
      this.publish({ snapshot, htm: this.state.htm + step.htm, rotations: this.state.rotations + Number(step.rotation) })
      if (snapshot.is_solved) { this.finish('complete', next.at_ms); return }
      this.persist()
    } catch (e) { if (this.live && epoch === this.epoch) this.interrupt(`Unaccepted input was not applied: ${e instanceof Error ? e.message : 'engine unavailable'}`) }
    finally { if (epoch === this.epoch) { this.processing = false; this.publish({ pending: this.queue.length }); if (this.queue.length || this.stopAt !== undefined) void this.pump() } }
  }
  pause = () => {
    if (this.state.phase !== 'running') return
    try { this.pauseStart = this.stamp() - this.origin; if (this.record) this.record.elapsed_ms = this.pauseStart; this.publish({ phase: 'paused' }); this.persist() } catch { this.interrupt('Pause could not be timestamped.') }
  }
  resume = () => {
    if (this.state.phase !== 'paused' || !this.record) return
    try { const now = this.stamp() - this.origin; this.closePause(now); this.record.elapsed_ms = now; this.publish({ phase: 'running' }); this.persist() } catch { this.interrupt('Resume could not be timestamped.') }
  }
  private closePause(end: number) { if (this.record && this.pauseStart !== undefined) { this.record.pauses.push({ start_ms: this.pauseStart, end_ms: end }); this.pauseStart = undefined } }
  stop = () => {
    if (this.state.phase === 'inspection') { this.publish({ phase: 'ready', inspection_ms: 0 }); return }
    if (!['running', 'paused'].includes(this.state.phase) || !this.record) return
    try { const elapsed = this.stamp() - this.origin; this.closePause(elapsed); this.stopAt = elapsed; this.publish({ phase: 'stopping', elapsed_ms: elapsed }); if (!this.processing) void this.pump() } catch { this.interrupt('Stop could not be timestamped.') }
  }
  private finish(status: 'complete' | 'stopped', elapsed: number) {
    if (!this.record) return
    // A solution entered before Pause can be acknowledged afterwards. Its input
    // timestamp wins; trim pauses occurring after that mathematically solved input.
    this.closePause(Math.max(elapsed, this.pauseStart ?? elapsed))
    this.record.pauses = this.record.pauses.filter(p => p.start_ms < elapsed).map(p => ({ ...p, end_ms: Math.min(p.end_ms, elapsed) }))
    if (this.queue.length) this.record.integrity_notes.push(`${this.queue.length} queued inputs after the solved/stopped endpoint were not applied.`)
    this.queue = []; this.stopAt = undefined
    this.record.elapsed_ms = elapsed; this.record.status = status
    this.publish({ phase: status, elapsed_ms: elapsed, pending: 0 }); this.persist()
  }
  interrupt = (note: string) => {
    if (!this.active()) return
    this.epoch++; this.abort?.abort(); this.queue = []; this.processing = false; this.stopAt = undefined
    if (this.record) { const elapsed = Math.max(this.record.elapsed_ms, this.record.events.at(-1)?.at_ms ?? 0); this.closePause(Math.max(elapsed, this.pauseStart ?? 0)); this.record.elapsed_ms = Math.max(elapsed, this.record.pauses.at(-1)?.end_ms ?? 0); this.record.status = 'interrupted'; this.markUncertain(note) }
    this.publish({ phase: 'interrupted', pending: 0, error: note }); this.persist()
  }
}
