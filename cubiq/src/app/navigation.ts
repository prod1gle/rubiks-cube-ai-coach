import { Box, ChartNoAxesCombined, History, LayoutDashboard, Layers, Timer } from 'lucide-react'

export const navigation = [
  { path: '/', title: 'Dashboard', icon: LayoutDashboard },
  { path: '/cube-explorer', title: 'Cube Explorer', icon: Box },
  { path: '/live-solve', title: 'Live Solve', icon: Timer },
  { path: '/solve-analysis', title: 'Solve Analysis', icon: ChartNoAxesCombined },
  { path: '/algorithm-trainer', title: 'Algorithm Trainer', icon: Layers },
  { path: '/history', title: 'History', icon: History },
] as const

export const plannedPages = [
  {
    path: '/live-solve', title: 'Live Solve', icon: Timer, category: 'FIND YOUR FLOW',
    headline: 'Give your practice a rhythm.',
    description: 'A focused place to capture a solve, from the first turn to the last layer.',
    dependency: 'Timing and move capture are planned for milestone M2.',
    capabilities: ['Live timer with explicit practice pauses', 'Engine-backed move logging and HTM/TPS', 'Later: confidence-aware physical cube capture'],
    milestone: 'M2 capture · M7 scan · M8 tracking',
    next: '/solve-analysis', nextLabel: 'Visit Solve Analysis',
  },
  {
    path: '/solve-analysis', title: 'Solve Analysis', icon: ChartNoAxesCombined, category: 'LEARN FROM EACH SOLVE',
    headline: 'Find the turn that changes things.',
    description: 'Revisit a solve and compare what happened with verified alternatives from the same starting state.',
    dependency: 'Analysis requires a trustworthy move history and validated solvers.',
    capabilities: ['Exact CFOP stage reconstruction', 'Actual and alternative sequences side by side', 'Computed differences and repeat-case practice'],
    milestone: 'M4 CFOP · M5 review and alternatives',
    next: '/algorithm-trainer', nextLabel: 'Visit Algorithm Trainer',
  },
  {
    path: '/algorithm-trainer', title: 'Algorithm Trainer', icon: Layers, category: 'MAKE IT SECOND NATURE',
    headline: 'Build recognition. Then repetition.',
    description: 'Practice real cases with clear goals and algorithms checked against the cube engine.',
    dependency: 'Training follows the validated case catalog and CFOP planner.',
    capabilities: ['Verified F2L, OLL, and PLL case setups', 'Recognition and execution practice', 'Progress drawn from your actual attempts'],
    milestone: 'M4 case catalog · M6 algorithm training',
    next: '/history', nextLabel: 'Visit History',
  },
  {
    path: '/history', title: 'History', icon: History, category: 'KEEP THE BIGGER PICTURE',
    headline: 'Your practice, kept in perspective.',
    description: 'Return to your solves and see progress grounded in what you actually recorded.',
    dependency: 'Solve storage and capture have not been implemented.',
    capabilities: ['Local solve history and exact replays', 'Transparent averages and eligible sample counts', 'Export, import, and progress over time'],
    milestone: 'M2 persistence · M6 history and analytics',
    next: '/cube-explorer', nextLabel: 'Visit Cube Explorer',
  },
] as const
