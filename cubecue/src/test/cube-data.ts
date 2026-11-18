// Captured by generate-ui-fixtures.py. These casts describe the wire format;
// this module implements no cube transforms or expected-state calculations.
import rawSnapshots from './cube-fixtures.json'
import rawPlans from './cube-plans.json'
import rawSolutions from './cube-solutions.json'
import rawCFOP from './cube-cfop.json'
import rawCoaching from './cube-coaching.json'
import type { CoachingReply, CubePlan, CubeSnapshot, CubeSolution } from '../api/cube'
export const snapshots = rawSnapshots as unknown as Record<keyof typeof rawSnapshots, CubeSnapshot>
export const plans = rawPlans as unknown as Record<keyof typeof rawPlans, CubePlan>
export const solutions = rawSolutions as unknown as Record<keyof typeof rawSolutions, CubeSolution>

export const cfopSolutions = rawCFOP as unknown as Record<keyof typeof rawCFOP, CubeSolution>
export const coachingFixtures = rawCoaching as unknown as {
  back: { snapshot: CubeSnapshot; hint: CoachingReply; firstPlan: CubePlan; afterFirstHint: CoachingReply; secondPlan: CubePlan; afterSecondHint: CoachingReply; manualPlan: CubePlan; afterManualHint: CoachingReply; fullPlan: CubePlan; afterFullHint: CoachingReply; htmHint: CoachingReply; shortHint: CoachingReply }
  partial: { snapshot: CubeSnapshot; hint: CoachingReply }
  solved: CoachingReply
}
