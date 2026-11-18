import { render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { plans, snapshots } from '../../test/cube-data'
import CubeViewport from './CubeViewport'
import type { ActiveTurn } from './CubeController'

vi.mock('./CubeScene', () => ({ default: ({ active, highlighted = [] }: { active?: ActiveTurn; highlighted?: string[] }) => <div><div data-testid="scene-state">{active ? 'Animating' : 'Static'}</div><output data-testid="scene-highlights">{highlighted.join('|')}</output></div> }))

it('provides a truthful 2D fallback without WebGL and completes a verified transition once', async () => {
  const finish = vi.fn()
  const active = { id: 'test:1', token: 'R', animation: plans.r.steps[0].animation, after: plans.r.steps[0].snapshot }
  render(<CubeViewport snapshot={snapshots.solved} active={active} duration={0.28} reducedMotion={false} onFinish={finish} />)
  expect(screen.getByText(/3D graphics are unavailable/)).toBeVisible()
  expect(screen.getByLabelText('Cube facelet net returned by the backend')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled()
  await waitFor(() => expect(finish).toHaveBeenCalledExactlyOnceWith('test:1'))
})

it('honors reduced motion and adopts the verified state without a simulated turn', async () => {
  vi.stubGlobal('WebGL2RenderingContext', class {})
  const finish = vi.fn()
  const active = { id: 'reduced:1', token: 'R', animation: plans.r.steps[0].animation, after: plans.r.steps[0].snapshot }
  render(<CubeViewport snapshot={snapshots.solved} active={active} duration={0.28} reducedMotion={true} onFinish={finish} />)
  expect(await screen.findByTestId('scene-state')).toHaveTextContent('Static')
  await waitFor(() => expect(finish).toHaveBeenCalledExactlyOnceWith('reduced:1'))
})

it('passes only supplied engine cubie IDs to the scene and exposes a text equivalent', async () => {
  vi.stubGlobal('WebGL2RenderingContext', class {})
  render(<CubeViewport snapshot={snapshots.solved} duration={0.28} reducedMotion={false} onFinish={vi.fn()} highlighted={['1,1,1', '0,1,1']} />)
  expect(await screen.findByTestId('scene-highlights')).toHaveTextContent('1,1,1|0,1,1')
  expect(screen.getByText('2 target cubies outlined · orbit to inspect hidden stickers.')).toBeVisible()
})
