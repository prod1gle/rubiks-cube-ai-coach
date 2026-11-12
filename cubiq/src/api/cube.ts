// Wire types and transport only. Move, orientation, legality, and HTM rules live
// exclusively in the Python engine. Never update these coordinates in React.
export interface CanonicalCubeState {
  schema_version: 1
  cp: readonly number[]
  co: readonly number[]
  ep: readonly number[]
  eo: readonly number[]
  frame: string
}

export interface CubeSnapshot {
  engine_version: string
  state: CanonicalCubeState
  facelets: string
  canonical_facelets: string
  is_solved: boolean
  state_hash: string
  position_hash: string
  palette: Record<string, string>
  faces: { face: string; center: string; stickers: string }[]
  cubies: CubieView[]
  sequence: { normalized: string; inverse: string; htm: number; metric: string; face_turns: number; rotations: number }
}

export type Vec3 = [number, number, number]
export interface CubieView { id: string; position: Vec3; stickers: { normal: Vec3; color: string }[] }
export interface TurnAnimation { axis: Vec3; quarter_turns: number; affected: string[] }
export interface CubeTransition {
  before_hash: string; token: string; inverse: string; htm: number; rotation: boolean
  animation: TurnAnimation; inverse_animation: TurnAnimation; snapshot: CubeSnapshot
}
export interface CubePlan { input_hash: string; sequence: CubeSnapshot['sequence']; steps: CubeTransition[] }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSnapshot(value: unknown): value is CubeSnapshot {
  // Check the protocol shape, not cube mathematics. Legality is the API's job.
  return record(value) && typeof value.engine_version === 'string' &&
    record(value.state) && value.state.schema_version === 1 &&
    ['cp', 'co', 'ep', 'eo'].every(key => Array.isArray(value.state && (value.state as Record<string, unknown>)[key])) &&
    typeof value.state.frame === 'string' && typeof value.facelets === 'string' &&
    typeof value.canonical_facelets === 'string' && typeof value.is_solved === 'boolean' &&
    typeof value.state_hash === 'string' && typeof value.position_hash === 'string' &&
    record(value.palette) && Object.values(value.palette).every(color => typeof color === 'string') &&
    Array.isArray(value.faces) && value.faces.every(face => record(face) && typeof face.face === 'string' && typeof face.center === 'string' && typeof face.stickers === 'string') &&
    Array.isArray(value.cubies) && value.cubies.length === 26 &&
    record(value.sequence) && typeof value.sequence.normalized === 'string' &&
    typeof value.sequence.inverse === 'string' && typeof value.sequence.htm === 'number' &&
    typeof value.sequence.rotations === 'number' && typeof value.sequence.face_turns === 'number' &&
    typeof value.sequence.metric === 'string'
}

function isPlan(value: unknown): value is CubePlan {
  const vector = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n))
  const animation = (v: unknown) => record(v) && vector(v.axis) && typeof v.quarter_turns === 'number' && Array.isArray(v.affected) && v.affected.every(id => typeof id === 'string')
  return record(value) && typeof value.input_hash === 'string' && record(value.sequence) &&
    typeof value.sequence.normalized === 'string' && Array.isArray(value.steps) && value.steps.length <= 128 &&
    value.steps.every(step => record(step) && typeof step.before_hash === 'string' &&
      typeof step.token === 'string' && typeof step.inverse === 'string' && typeof step.htm === 'number' &&
      typeof step.rotation === 'boolean' && animation(step.animation) && animation(step.inverse_animation) && isSnapshot(step.snapshot))
}

async function request<T>(path: string, signal: AbortSignal, check: (data: unknown) => data is T, body?: unknown): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) controller.abort()
  const timeout = window.setTimeout(abort, 5000)
  try {
    const response = await fetch(path, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    })
    const data: unknown = await response.json()
    if (!response.ok) {
      const detail = record(data) ? data.detail : undefined
      if (record(detail) && typeof detail.message === 'string') {
        throw new Error(`${detail.message}${typeof detail.code === 'string' ? ` (${detail.code})` : ''}`)
      }
      throw new Error(`Cube API rejected the request (HTTP ${response.status}).`)
    }
    if (!check(data)) throw new Error('The cube API returned an unexpected snapshot or transition plan.')
    return data
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Cube API request cancelled or timed out. The displayed state has not changed.', { cause: error })
    throw error
  } finally {
    window.clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
  }
}

export const getCube = (signal: AbortSignal) => request('/api/cube', signal, isSnapshot)
export const applyCubeSequence = (state: CanonicalCubeState, sequence: string, signal: AbortSignal) => request('/api/cube/apply', signal, isSnapshot, { state, sequence })
export const importCubeFacelets = (facelets: string, signal: AbortSignal) => request('/api/cube/validate', signal, isSnapshot, { facelets })
export const planCubeSequence = (state: CanonicalCubeState, sequence: string, signal: AbortSignal) => request('/api/cube/plan', signal, isPlan, { state, sequence })
export const scrambleCube = (state: CanonicalCubeState, signal: AbortSignal) => request('/api/cube/scramble', signal, isPlan, { state })
