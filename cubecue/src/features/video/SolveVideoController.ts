export interface VideoAlignment {
  solve_started_mono_ms: number
  recorder_start_requested_mono_ms: number
  recorder_start_event_mono_ms: number | null
  recorder_stop_requested_mono_ms: number | null
  clock: 'performance.now'
  interpretation: string
}
interface VideoState { phase: 'off' | 'opening' | 'ready' | 'recording' | 'finalizing'; stream?: MediaStream; url?: string; mime?: string; bytes: number; error: string; alignment?: VideoAlignment }
/** Video stays in this browser's memory. Media event timing is not a decoded-frame clock. */
export class SolveVideoController {
  private state: VideoState = { phase: 'off', bytes: 0, error: '' }
  private listeners = new Set<() => void>()
  private recorder?: MediaRecorder
  private chunks: Blob[] = []
  private epoch = 0
  private deadline?: ReturnType<typeof setTimeout>
  private live = true
  private bytes = 0
  getSnapshot = () => this.state
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private publish(patch: Partial<VideoState>) { if (!this.live) return; this.state = { ...this.state, ...patch }; this.listeners.forEach(fn => fn()) }
  private release() { this.state.stream?.getTracks().forEach(t => { t.onended = null; t.stop() }); this.publish({ stream: undefined }) }
  prepare = async () => {
    if (this.state.phase !== 'off') return
    this.live = true
    if (!window.isSecureContext) { this.publish({ error: 'Video needs a secure context (HTTPS or localhost). The stopwatch remains available.' }); return }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { this.publish({ error: 'This browser does not support webcam recording. The stopwatch remains available.' }); return }
    const epoch = ++this.epoch
    this.publish({ phase: 'opening', error: '' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      if (!this.live || epoch !== this.epoch) { stream.getTracks().forEach(t => t.stop()); return }
      stream.getTracks().forEach(t => { t.onended = () => { this.publish({ error: 'Camera disconnected. Any captured video is partial; the solve timer continues.' }); this.stop() } })
      this.publish({ phase: 'ready', stream })
    } catch (e) { if (epoch === this.epoch) this.publish({ phase: 'off', error: e instanceof Error ? `Camera unavailable: ${e.message}` : 'Camera permission was denied or no camera is available.' }) }
  }
  start = (solveStart: number) => {
    if (this.state.phase !== 'ready' || !this.state.stream) return
    try {
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t))
      const recorder = new MediaRecorder(this.state.stream, mime ? { mimeType: mime, videoBitsPerSecond: 2_000_000 } : undefined)
      this.recorder = recorder; this.chunks = []; this.bytes = 0
      if (this.state.url) URL.revokeObjectURL(this.state.url)
      const alignment: VideoAlignment = { solve_started_mono_ms: solveStart, recorder_start_requested_mono_ms: performance.now(), recorder_start_event_mono_ms: null, recorder_stop_requested_mono_ms: null, clock: 'performance.now', interpretation: 'Measured browser request/event timestamps only. Video begins near timer start; encoder and first-frame latency are unmeasured. No automatic move, stage or frame alignment analysis.' }
      this.publish({ phase: 'recording', url: undefined, mime: recorder.mimeType || mime || 'video/webm', bytes: 0, alignment, error: '' })
      recorder.onstart = () => { if (this.recorder !== recorder || !this.live) return; this.publish({ alignment: { ...(this.state.alignment ?? alignment), recorder_start_event_mono_ms: performance.now() } }) }
      recorder.ondataavailable = e => { if (this.recorder !== recorder || !this.live) return; if (e.data.size) { this.chunks.push(e.data); this.bytes += e.data.size; this.publish({ bytes: this.bytes }); if (this.bytes >= 250_000_000) { this.publish({ error: 'Video reached the 250 MB memory limit and stopped. The solve timer continues.' }); this.stop() } } }
      recorder.onerror = () => { if (this.recorder !== recorder || !this.live) return; this.publish({ error: 'Recording failed. Available video may be partial; the solve timer continues.' }); this.stop() }
      recorder.onstop = () => {
        if (this.recorder !== recorder || !this.live) return
        if (this.deadline) clearTimeout(this.deadline)
        const blob = new Blob(this.chunks, { type: recorder.mimeType || mime || 'video/webm' }); this.chunks = []; this.recorder = undefined
        this.release()
        if (!this.live) return
        this.publish({ phase: 'off', url: blob.size ? URL.createObjectURL(blob) : undefined, bytes: blob.size, error: blob.size ? this.state.error : this.state.error || 'No playable video was captured.' })
      }
      recorder.start(1000)
      this.deadline = setTimeout(() => { this.publish({ error: 'Video reached its 10-minute limit and stopped. The solve timer continues.' }); this.stop() }, 600_000)
    } catch (e) { this.publish({ phase: 'off', error: `Recording could not start: ${e instanceof Error ? e.message : 'unsupported codec'}` }); this.release() }
  }
  stop = () => {
    ++this.epoch
    if (this.deadline) { clearTimeout(this.deadline); this.deadline = undefined }
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.publish({ phase: 'finalizing', alignment: this.state.alignment ? { ...this.state.alignment, recorder_stop_requested_mono_ms: performance.now() } : undefined })
      try { this.recorder.stop() } catch { this.release(); this.publish({ phase: 'off', error: 'Video could not be finalized.' }) }
    } else if (!this.recorder) { this.release(); this.publish({ phase: 'off' }) }
  }
  discard = () => { if (this.state.url) URL.revokeObjectURL(this.state.url); this.publish({ url: undefined, alignment: undefined, bytes: 0 }) }
  connect = () => { this.live = true }
  dispose = () => { this.stop(); if (this.recorder) { this.recorder.onstart = null; this.recorder.onstop = null; this.recorder.ondataavailable = null; this.recorder.onerror = null; this.recorder = undefined }; this.chunks = []; this.discard(); this.release(); this.publish({ phase: 'off' }); this.live = false }
}
