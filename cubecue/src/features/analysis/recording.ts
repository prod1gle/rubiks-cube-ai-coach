import type { AnalysisRecord } from '../../api/cube'
const key = 'cubecue.analysis.record.v1'
/** Session-local transfer only; no persistent solve database or invented records. */
export function saveRecording(record: AnalysisRecord) { sessionStorage.setItem(key, JSON.stringify(record)) }
export function readRecording(): AnalysisRecord | undefined {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (value && typeof value === 'object' && 'facelets' in value && typeof value.facelets === 'string' && 'sequence' in value && typeof value.sequence === 'string') {
      return { facelets: value.facelets, sequence: value.sequence, ...('expected_end_hash' in value && typeof value.expected_end_hash === 'string' ? { expected_end_hash: value.expected_end_hash } : {}) }
    }
  } catch { /* Corrupt transfer is ignored; engine validates any actual input. */ }
}
