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
export interface CubeSolution {
  status: 'solved' | 'already_solved'
  input_hash: string; result_hash: string; notation: string; move_count: number; metric: string
  elapsed_ms: number; method: 'kociemba-two-phase' | 'cfop'; optimality: 'unproven'; label: string; verified: true
  solver: { name: string; version: string }
  search_limits: { max_depth_htm?: number; max_plan_htm?: number; timeout_ms: number }
  plan: CubePlan
  stages?: CFOPStage[]
  reference?: { frame: string; cross_color: string; front_color: string; description: string }
}

export interface CFOPStage {
  id: string; kind: 'cross' | 'f2l' | 'oll' | 'pll' | 'auf'; slot: string | null
  case_id: string; status: 'performed' | 'skipped'; notation: string; reference_notation: string
  setup: string; algorithm: string; macro_ids: string[]; move_count: number
  start_step: number; end_step: number; before_hash: string; after_hash: string
  protected_pairs: string[]; progress_after: Record<string, unknown>
}

export interface HintSettings { mode: 'short' | 'cfop'; ranking: 'htm' | 'ergonomic'; allow_rotations: boolean }
export interface HintContinuation { start_state: CanonicalCubeState; candidate_id: string; consumed: number }
export interface HintPiece { kind: 'corner' | 'edge'; name: string; colors: string[]; slot_id: string; position: Vec3 }
export interface HintCandidate {
  id: string; input_hash: string; result_hash: string; goal: 'cross' | 'f2l' | 'oll' | 'pll' | 'auf' | 'solve'
  slot: string | null; title: string; source: string; notation: string; first_move: string
  metrics: { htm: number; rotations: number; comfort_score: number; metric: string; face_turns: Record<string, number>; preserved_slots: string[]; lost_slots: string[]; cross_preserved: boolean }
  pieces: HintPiece[]; highlight_ids: string[]; hints: { subtle: string; guided: string }
  verified: true; optimality: 'unproven'; macro_ids: string[]; ending_progress: Record<string, unknown>
}
export interface CoachingReply {
  status: 'ready' | 'solved'; input_hash: string; mode: HintSettings['mode']; ranking: HintSettings['ranking']; allow_rotations: boolean
  progress: { cross: boolean; pairs: Record<string, boolean>; f2l: boolean; oll: boolean; pll: boolean; solved: boolean; auf: string | null }
  candidates: HintCandidate[]; recommended_id: string | null; evaluated_candidates: number; elapsed_ms: number
  comparison_scope: string; warnings: string[]
  ranking_policy: { version: string; base_htm: number; rotation_cost: number; face_penalties: Record<string, number>; preservation: string; units: string }
  personalization: { status: 'not_implemented'; reason: string }
  continuation?: HintContinuation
}

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

function isSolution(value: unknown): value is CubeSolution {
  return record(value) && ['solved', 'already_solved'].includes(String(value.status)) &&
    typeof value.input_hash === 'string' && typeof value.result_hash === 'string' &&
    typeof value.notation === 'string' && typeof value.metric === 'string' &&
    Number.isInteger(value.move_count) && Number(value.move_count) >= 0 &&
    typeof value.elapsed_ms === 'number' && Number.isFinite(value.elapsed_ms) && value.elapsed_ms >= 0 &&
    ['kociemba-two-phase', 'cfop'].includes(String(value.method)) && value.optimality === 'unproven' && value.verified === true &&
    typeof value.label === 'string' && record(value.solver) && typeof value.solver.name === 'string' &&
    typeof value.solver.version === 'string' && record(value.search_limits) &&
    typeof value.search_limits.timeout_ms === 'number' && isPlan(value.plan) &&
    (value.method === 'cfop' ? isCFOP(value) : typeof value.search_limits.max_depth_htm === 'number')
}

function isCFOP(value: Record<string, unknown>): boolean {
  return record(value.reference) && typeof value.reference.frame === 'string' &&
    typeof value.reference.description === 'string' && Array.isArray(value.stages) && value.stages.length === 8 &&
    value.stages.every(stage => record(stage) &&
      ['id', 'case_id', 'notation', 'reference_notation', 'setup', 'algorithm', 'before_hash', 'after_hash'].every(key => typeof stage[key] === 'string') &&
      ['cross', 'f2l', 'oll', 'pll', 'auf'].includes(String(stage.kind)) &&
      ['performed', 'skipped'].includes(String(stage.status)) && (stage.slot === null || typeof stage.slot === 'string') &&
      ['move_count', 'start_step', 'end_step'].every(key => Number.isInteger(stage[key]) && Number(stage[key]) >= 0) &&
      Array.isArray(stage.macro_ids) && stage.macro_ids.every(id => typeof id === 'string') &&
      Array.isArray(stage.protected_pairs) && stage.protected_pairs.every(id => typeof id === 'string') && record(stage.progress_after))
}

async function request<T>(path: string, signal: AbortSignal, check: (data: unknown) => data is T, body?: unknown, timeoutMs = 5000): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) controller.abort()
  const timeout = window.setTimeout(abort, timeoutMs)
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
// The backend's 30 s worker budget includes cold table generation. Leave time
// for local HTTP overhead; abort/reset still cancels adoption immediately.
export const solveCube = (state: CanonicalCubeState, signal: AbortSignal) => request('/api/cube/solve', signal, isSolution, { state }, 35000)
export const solveCFOP = (state: CanonicalCubeState, signal: AbortSignal) => request('/api/cube/cfop', signal, isSolution, { state }, 35000)

function isCoaching(value: unknown): value is CoachingReply {
  const strings = (data: unknown) => Array.isArray(data) && data.every(item => typeof item === 'string')
  const finite = (data: unknown) => typeof data === 'number' && Number.isFinite(data) && data >= 0
  return record(value) && ['ready', 'solved'].includes(String(value.status)) && typeof value.input_hash === 'string' &&
    ['short', 'cfop'].includes(String(value.mode)) && ['htm', 'ergonomic'].includes(String(value.ranking)) && typeof value.allow_rotations === 'boolean' &&
    record(value.progress) && ['cross', 'f2l', 'oll', 'pll', 'solved'].every(key => typeof (value.progress as Record<string, unknown>)[key] === 'boolean') &&
    record(value.progress.pairs) && Object.values(value.progress.pairs).every(item => typeof item === 'boolean') &&
    finite(value.elapsed_ms) && finite(value.evaluated_candidates) && typeof value.comparison_scope === 'string' && strings(value.warnings) &&
    record(value.ranking_policy) && typeof value.ranking_policy.version === 'string' && finite(value.ranking_policy.rotation_cost) && record(value.ranking_policy.face_penalties) &&
    record(value.personalization) && value.personalization.status === 'not_implemented' && typeof value.personalization.reason === 'string' &&
    Array.isArray(value.candidates) && value.candidates.length <= 16 &&
    (value.recommended_id === null || typeof value.recommended_id === 'string') && value.candidates.every(c => record(c) &&
      ['id', 'input_hash', 'result_hash', 'title', 'source', 'notation', 'first_move'].every(key => typeof c[key] === 'string') &&
      ['cross', 'f2l', 'oll', 'pll', 'auf', 'solve'].includes(String(c.goal)) && (c.slot === null || typeof c.slot === 'string') &&
      c.verified === true && c.optimality === 'unproven' && record(c.hints) && typeof c.hints.subtle === 'string' && typeof c.hints.guided === 'string' &&
      record(c.metrics) && ['htm', 'rotations', 'comfort_score'].every(key => finite((c.metrics as Record<string, unknown>)[key])) &&
      typeof c.metrics.metric === 'string' && record(c.metrics.face_turns) && Object.values(c.metrics.face_turns).every(finite) &&
      strings(c.metrics.preserved_slots) && strings(c.metrics.lost_slots) && typeof c.metrics.cross_preserved === 'boolean' &&
      strings(c.highlight_ids) && strings(c.macro_ids) && record(c.ending_progress) &&
      Array.isArray(c.pieces) && c.pieces.every(p => record(p) && typeof p.name === 'string' && typeof p.slot_id === 'string' && strings(p.colors) && ['corner', 'edge'].includes(String(p.kind)) && Array.isArray(p.position) && p.position.length === 3)) &&
    (value.continuation === undefined || (record(value.continuation) && record(value.continuation.start_state) && value.continuation.start_state.schema_version === 1 && typeof value.continuation.start_state.frame === 'string' && typeof value.continuation.candidate_id === 'string' && Number.isInteger(value.continuation.consumed) && Number(value.continuation.consumed) >= 0 && Number(value.continuation.consumed) <= 128))
}

export const getCoaching = (state: CanonicalCubeState, settings: HintSettings, signal: AbortSignal, continuation?: HintContinuation) => request('/api/cube/next', signal, isCoaching, { state, ...settings, ...(continuation ? { continuation } : {}) }, 35000)
