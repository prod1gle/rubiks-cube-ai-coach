import { isSnapshot, isPlan } from './cube'
import type { CubeSnapshot, CubePlan, TimedRecording, TimedAnalytics } from './cube'

export async function library<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { method, signal: signal ?? AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const data = await response.json() as { detail?: unknown }
  if (!response.ok) {
    const detail = data.detail
    throw new Error(typeof detail === 'string' ? detail : detail && typeof detail === 'object' && 'message' in detail ? String(detail.message) : `Request failed (HTTP ${response.status}).`)
  }
  return data as T
}
export interface SavedSolve { id: string; created_at: string; recording: TimedRecording; analysis: TimedAnalytics; analysis_version: string; current_version: string; versions: string[] }
export interface SolveList { total: number; items: { id: string; created_at: string; status: string; source: string; summary: TimedAnalytics['summary'] }[] }
export interface DashboardData { total_records: number; completed_solves: number; timed_sample_count: number; practice_attempts: number; personal_best_ms: number | null; average_tps: number | null; average_htm: number | null; trends: { id: string; created_at: string; elapsed_ms: number | null; htm: number; tps: number | null }[]; scope: string }
export interface TrainingRow { id: string; stage: 'F2L' | 'OLL' | 'PLL'; algorithm: string; source: string }
export interface TrainingAlgorithm {
  id: string; notation: string; setup: string; source: string; source_url?: string
  metrics: { htm: number; rotations: number; comfort_score?: number }; verified: true
  input_hash: string; result_hash: string; catalog_version: string
}
export interface TrainingCase extends TrainingRow { start: CubeSnapshot; plan: CubePlan; version: string; verified: true; scope: string; algorithms?: TrainingAlgorithm[]; default_algorithm_id?: string; algorithm_policy?: string }
export async function loadTraining(id: string, signal: AbortSignal) {
  const v = await library<TrainingCase>(`/training/${encodeURIComponent(id)}`, undefined, 'GET', signal)
  if (!isSnapshot(v.start) || !isPlan(v.plan) || v.verified !== true || v.plan.input_hash !== v.start.state_hash) throw new Error('Training state failed verification. Reload the case.')
  if (v.algorithms !== undefined && (!Array.isArray(v.algorithms) || !v.algorithms.length || v.algorithms.length > 4 || v.algorithms.some(a => !a || typeof a.id !== 'string' || typeof a.notation !== 'string' || !a.notation.trim() || a.verified !== true || a.input_hash !== v.start.state_hash || typeof a.result_hash !== 'string' || (a.source_url !== undefined && !a.source_url.startsWith('https://')) || !a.metrics || !Number.isInteger(a.metrics.htm) || a.metrics.htm < 0 || !Number.isInteger(a.metrics.rotations) || a.metrics.rotations < 0) || new Set(v.algorithms.map(a => a.id)).size !== v.algorithms.length || !v.algorithms.some(a => a.id === v.default_algorithm_id))) throw new Error('Alternate algorithms failed state verification. Reload the case.')
  return v
}
export const saveSolve = (recording: TimedRecording, id = recording.clock_id) => library<SavedSolve>('/solves', { id, recording })
