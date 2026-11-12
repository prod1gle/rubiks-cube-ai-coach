// Captured by generate-ui-fixtures.py. These casts describe the wire format;
// this module implements no cube transforms or expected-state calculations.
import rawSnapshots from './cube-fixtures.json'
import rawPlans from './cube-plans.json'
import rawSolutions from './cube-solutions.json'
import type { CubePlan, CubeSnapshot, CubeSolution } from '../api/cube'
export const snapshots = rawSnapshots as unknown as Record<keyof typeof rawSnapshots, CubeSnapshot>
export const plans = rawPlans as unknown as Record<keyof typeof rawPlans, CubePlan>
export const solutions = rawSolutions as unknown as Record<keyof typeof rawSolutions, CubeSolution>
