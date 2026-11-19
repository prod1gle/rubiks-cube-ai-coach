export interface PhysicalRecording {
  id: string; source: 'physical-stopwatch'; elapsed_ms: number; inspection_ms: number; started_mono_ms: number
  status: 'stopped' | 'interrupted'; timing_integrity: 'valid' | 'uncertain'; integrity_notes: string[]; scramble: string
}
interface State { phase: 'ready' | 'inspection' | 'running' | 'stopped' | 'interrupted'; elapsed_ms: number; inspection_ms: number; started_mono_ms?: number; uncertain: boolean; record?: PhysicalRecording }
/** Physical elapsed time only. No cube moves, stage times or solvedness are inferred. */
export class PhysicalTimer {
  private state: State = { phase: 'ready', elapsed_ms: 0, inspection_ms: 0, uncertain: false }
  private listeners = new Set<() => void>()
  private origin = 0
  private wallOrigin = 0
  private inspectionStart = 0
  private inspectionWall = 0
  private last = -Infinity
  private notes: string[] = []
  private scramble = ''
  constructor(private clock = () => performance.now(), private wall = () => Date.now()) {}
  getSnapshot = () => this.state
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private publish(patch: Partial<State>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()) }
  private stamp() { const n = this.clock(); if (!Number.isFinite(n) || n < this.last) throw Error('Clock continuity lost'); this.last = n; return n }
  start = (inspection: boolean, scramble = '') => {
    if (['running', 'inspection'].includes(this.state.phase)) return
    try {
      const n = this.stamp(); this.notes = []; this.scramble = scramble
      if (inspection) { this.inspectionStart = n; this.inspectionWall = this.wall(); this.publish({ phase: 'inspection', elapsed_ms: 0, inspection_ms: 0, record: undefined, started_mono_ms: undefined, uncertain: false }) }
      else this.begin(n, 0)
    } catch { this.publish({ uncertain: true }) }
  }
  private begin(n: number, inspection: number) { this.origin = n; this.wallOrigin = this.wall(); this.publish({ phase: 'running', elapsed_ms: 0, inspection_ms: inspection, record: undefined, started_mono_ms: n, uncertain: this.notes.length > 0 }) }
  beginSolve = () => { if (this.state.phase !== 'inspection') return; try { const n = this.stamp(); this.check(n, true); if (n - this.inspectionStart > 86400000) { this.interrupt('Inspection exceeded the 24-hour limit.'); return }; this.begin(n, n - this.inspectionStart) } catch { this.interrupt('Inspection clock continuity lost.') } }
  private check(n: number, inspection = false) { if (Math.abs(this.wall() - (inspection ? this.inspectionWall : this.wallOrigin) - (n - (inspection ? this.inspectionStart : this.origin))) > 2000) this.markUncertain('Wall and monotonic clocks diverged; possible sleep or clock change.') }
  pulse = () => {
    if (!['inspection', 'running'].includes(this.state.phase)) return
    try { const n = this.stamp(); const inspection = this.state.phase === 'inspection'; this.check(n, inspection); const elapsed = n - (inspection ? this.inspectionStart : this.origin); if (elapsed > 86400000) { this.interrupt('Practice exceeded the 24-hour limit.'); return }; this.publish(inspection ? { inspection_ms: elapsed } : { elapsed_ms: elapsed }) } catch { this.interrupt('Monotonic clock continuity lost.') }
  }
  markUncertain = (note: string) => { if (!['inspection', 'running'].includes(this.state.phase)) return; if (!this.notes.includes(note) && this.notes.length < 64) this.notes.push(note); this.publish({ uncertain: true }) }
  stop = () => {
    if (this.state.phase === 'inspection') { this.publish({ phase: 'ready', inspection_ms: 0 }); return }
    if (this.state.phase !== 'running') return
    try { const n = this.stamp(); this.check(n); if (n - this.origin > 86400000) { this.interrupt('Practice exceeded the 24-hour limit.'); return }; this.finish('stopped', n - this.origin) } catch { this.interrupt('Stop timestamp could not be verified.') }
  }
  interrupt = (note: string) => { if (!['running', 'inspection'].includes(this.state.phase)) return; this.markUncertain(note); if (this.state.phase === 'inspection') { this.publish({ phase: 'interrupted' }); return }; this.finish('interrupted', this.state.elapsed_ms) }
  private finish(status: PhysicalRecording['status'], elapsed_ms: number) { const record: PhysicalRecording = { id: crypto.randomUUID(), source: 'physical-stopwatch', elapsed_ms, inspection_ms: this.state.inspection_ms, started_mono_ms: this.origin, status, timing_integrity: this.notes.length ? 'uncertain' : 'valid', integrity_notes: [...this.notes], scramble: this.scramble }; this.publish({ phase: status, elapsed_ms, record }) }
}
