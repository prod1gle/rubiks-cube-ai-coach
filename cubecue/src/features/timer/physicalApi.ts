import { library } from '../../api/library'
import type { PhysicalRecording } from './PhysicalTimer'
export interface PhysicalHistoryData { items: (PhysicalRecording & { created_at: string })[]; total: number; personal_best_ms: number | null; mean_ms: number | null; sample_count: number; scope: string }
export async function loadPhysicalHistory(signal?: AbortSignal) {
  const data = await library<PhysicalHistoryData>('/physical-solves', undefined, 'GET', signal)
  if (!data || !Array.isArray(data.items) || typeof data.total !== 'number' || typeof data.scope !== 'string' || typeof data.sample_count !== 'number' || data.items.some(r => !r || typeof r.id !== 'string' || !Number.isFinite(r.elapsed_ms) || typeof r.created_at !== 'string')) throw new Error('Physical history response was invalid. Retry when the local API is available.')
  return data
}
export const savePhysicalSolve = (record: PhysicalRecording) => library<{ saved: string }>('/physical-solves', record)
export const deletePhysicalSolve = (id: string) => library(`/physical-solves/${encodeURIComponent(id)}`, undefined, 'DELETE')
export const formatPhysicalTime = (ms: number | null) => ms === null ? '—' : `${(ms / 1000).toFixed(2)}s`
