import type { TimedRecording } from '../../api/cube'
const key = 'cubiq.manual-recording.v1'
/** Latest session-local recording only; no permanent solve-history database. */
export const storeTimedRecording = (record: TimedRecording) => sessionStorage.setItem(key, JSON.stringify(record))
export function readTimedRecording(): TimedRecording | undefined {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) ?? 'null') as TimedRecording | null
    if (v?.schema_version === 1 && v.source === 'manual-virtual' && Array.isArray(v.events) && v.initial_state && typeof v.elapsed_ms === 'number') return v
  } catch { /* Backend validation is required before any analysis/adoption. */ }
}
