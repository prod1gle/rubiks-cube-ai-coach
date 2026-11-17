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
