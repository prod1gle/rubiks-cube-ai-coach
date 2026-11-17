import type { CubeSnapshot } from '../../api/cube'
import { isSnapshot } from '../../api/cube'
export const scanKey = 'cubiq.guided-scan.v1'
export interface ScanTransfer { snapshot: CubeSnapshot; calibration: Record<string, number[]>; observations: { face: string; index: number; color: string; confidence: number; needs_review: boolean }[]; corrected: number[] }
export function readScan(): ScanTransfer | undefined {
  try { const v = JSON.parse(sessionStorage.getItem(scanKey) ?? 'null') as ScanTransfer | null; if (v && isSnapshot(v.snapshot) && v.calibration && Array.isArray(v.observations)) return v } catch { /* Untrusted transfer is revalidated by the backend before adoption. */ }
}
