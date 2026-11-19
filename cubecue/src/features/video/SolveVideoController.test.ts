import { beforeEach, expect, it, vi } from 'vitest'
import { SolveVideoController } from './SolveVideoController'
class FakeRecorder {
  static isTypeSupported = () => true
  static instances: FakeRecorder[] = []
  state = 'inactive'
  mimeType = 'video/webm'
  onstart: (() => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  constructor() { FakeRecorder.instances.push(this) }
  start() { this.state = 'recording'; this.onstart?.() }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['actual test video bytes']) }); this.onstop?.() }
}
const track = () => ({ stop: vi.fn(), onended: null })
beforeEach(() => { FakeRecorder.instances = []; vi.stubGlobal('MediaRecorder', FakeRecorder); vi.stubGlobal('isSecureContext', true); vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:local-video'), revokeObjectURL: vi.fn() }) })
function camera(t = track()) { const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [t] }); vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } }); return { t, getUserMedia } }
it('starts off without requesting camera, records locally, aligns with measured monotonic timestamps and releases tracks', async () => {
  const { t, getUserMedia } = camera(); const c = new SolveVideoController()
  expect(c.getSnapshot().phase).toBe('off'); expect(getUserMedia).not.toHaveBeenCalled()
  await c.prepare(); expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false })); c.start(performance.now() - 12)
  expect(c.getSnapshot().phase).toBe('recording'); expect(c.getSnapshot().alignment?.recorder_start_event_mono_ms).toEqual(expect.any(Number))
  c.stop(); expect(c.getSnapshot().url).toBe('blob:local-video'); expect(t.stop).toHaveBeenCalled(); expect(c.getSnapshot().phase).toBe('off')
  c.dispose(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-video')
})
it('keeps permission denial and unsupported browser explicit', async () => {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')) } }); const c = new SolveVideoController(); await c.prepare(); expect(c.getSnapshot().error).toContain('Permission denied'); expect(c.getSnapshot().phase).toBe('off')
  vi.stubGlobal('MediaRecorder', undefined); await c.prepare(); expect(c.getSnapshot().error).toContain('does not support')
})
it('stops a camera granted after cancellation without exposing a stale preview', async () => {
  const t = track(); let grant!: (v: unknown) => void
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => new Promise(resolve => { grant = resolve }) } })
  const c = new SolveVideoController(); const pending = c.prepare(); c.stop(); grant({ getTracks: () => [t] }); await pending
  expect(t.stop).toHaveBeenCalled(); expect(c.getSnapshot().phase).toBe('off'); expect(c.getSnapshot().stream).toBeUndefined()
})
it('ignores stale recorder callbacks after disposal and a newly prepared camera', async () => {
  camera(); const c = new SolveVideoController(); await c.prepare(); c.start(0)
  const stale = FakeRecorder.instances[0].onstop!; const staleData = FakeRecorder.instances[0].ondataavailable!
  c.dispose(); c.connect(); const { t } = camera(); await c.prepare()
  staleData({ data: new Blob(['stale']) }); stale()
  expect(t.stop).not.toHaveBeenCalled(); expect(c.getSnapshot().phase).toBe('ready'); expect(c.getSnapshot().url).toBeUndefined(); c.dispose()
})
it('limits capture time and disconnects while leaving timing independent', async () => {
  vi.useFakeTimers(); const { t } = camera(); const c = new SolveVideoController(); await c.prepare(); c.start(0); vi.advanceTimersByTime(600000)
  expect(c.getSnapshot().error).toContain('10-minute'); expect(c.getSnapshot().url).toBeTruthy(); expect(t.stop).toHaveBeenCalled(); c.dispose()
})
