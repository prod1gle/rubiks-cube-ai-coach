// Engine-derived synthetic case; not a measured practice record.
import { useEffect } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import fixture from '../../test/training-case.json'
import moveFixture from '../../test/trainer-move-plans.json'
import { AlgorithmTrainer } from './AlgorithmTrainer'
vi.mock('../cube/CubeViewport', () => ({ default: function TestViewport({ snapshot, active, onFinish }: { snapshot: { state_hash: string }; active?: { id: string }; onFinish: (id: string) => void }) {
  useEffect(() => { if (active) queueMicrotask(() => { onFinish(active.id); onFinish(active.id) }) }, [active, onFinish])
  return <output data-testid="trainer-state">{snapshot.state_hash}</output>
} }))
it('repeats exact cases, records real retries, and excludes algorithm playback', async () => {
  const item = fixture.case
  const request = vi.fn().mockImplementation((path: string) => Promise.resolve(new Response(JSON.stringify(path === '/api/training' ? { cases: [item] } : path.startsWith('/api/training/') ? item : path === '/api/cube/plan' ? item.plan : { id: 'attempt', success: true, metrics: { htm: 3 } }))))
  vi.stubGlobal('fetch', request)
  const user = userEvent.setup(); render(<AlgorithmTrainer />)
  await screen.findByTestId('trainer-state')
  await user.click(screen.getByRole('button', { name: 'Play verified algorithm' }))
  await waitFor(() => expect(screen.getByTestId('trainer-state')).toHaveTextContent(item.plan.steps.at(-1)!.snapshot.state_hash))
  expect(screen.getByRole('button', { name: 'Verify and save attempt' })).toBeDisabled()
  expect(request.mock.calls.filter(c => c[0] === '/api/practice')).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Repeat same case' }))
  await waitFor(() => expect(screen.getByTestId('trainer-state')).toHaveTextContent(item.start.state_hash))
  await user.type(screen.getByLabelText('Your practice notation'), item.algorithm)
  await user.click(screen.getByRole('button', { name: 'Apply practice moves' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Verify and save attempt' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Verify and save attempt' }))
  expect(await screen.findByText(/Objective achieved.*Attempt saved/)).toBeVisible()
  const saved = request.mock.calls.find(c => c[0] === '/api/practice')!
  expect(JSON.parse(saved[1].body).notation).toBe(item.algorithm)
})

it('applies direct prime, double and rotation controls from accepted states, replays and repeats the exact case', async () => {
  const item = fixture.case
  let planIndex = 0
  const request = vi.fn().mockImplementation((path: string) => Promise.resolve(new Response(JSON.stringify(
    path === '/api/training' ? { cases: [item] } : path.startsWith('/api/training/') ? item : moveFixture.plans[planIndex++]
  ))))
  vi.stubGlobal('fetch', request)
  const user = userEvent.setup(); render(<AlgorithmTrainer />)
  await screen.findByTestId('trainer-state')
  const faces = within(screen.getByRole('group', { name: 'Face turns' }))
  expect(faces.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual([
    'Apply U', 'Apply R', 'Apply F', 'Apply D', 'Apply L', 'Apply B',
    "Apply U'", "Apply R'", "Apply F'", "Apply D'", "Apply L'", "Apply B'",
    'Apply U2', 'Apply R2', 'Apply F2', 'Apply D2', 'Apply L2', 'Apply B2',
  ])
  for (const [i, name] of ["Apply R'", 'Apply R2', 'Rotate x2'].entries()) {
    await user.click(screen.getByRole('button', { name }))
    await waitFor(() => expect(screen.getByTestId('trainer-state')).toHaveTextContent(moveFixture.plans[i].steps[0].snapshot.state_hash))
  }
  const plans = request.mock.calls.filter(c => c[0] === '/api/cube/plan').map(c => JSON.parse(c[1].body))
  expect(plans.map(p => p.sequence)).toEqual(["R'", 'R2', 'x2'])
  expect(plans.map(p => p.state)).toEqual([item.start.state, moveFixture.plans[0].steps[0].snapshot.state, moveFixture.plans[1].steps[0].snapshot.state])
  expect(screen.getByTestId('trainer-move-count')).toHaveTextContent('2HTM')
  expect(screen.getByText('1 grip rotations')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Step back' }))
  await waitFor(() => expect(screen.getByTestId('trainer-state')).toHaveTextContent(moveFixture.plans[1].steps[0].snapshot.state_hash))
  await user.click(screen.getByRole('button', { name: 'Step forward' }))
  await waitFor(() => expect(screen.getByTestId('trainer-state')).toHaveTextContent(moveFixture.plans[2].steps[0].snapshot.state_hash))
  expect(request.mock.calls.filter(c => c[0] === '/api/cube/plan')).toHaveLength(3)
  await user.click(screen.getByRole('button', { name: 'Repeat same case' }))
  await waitFor(() => expect(screen.getByTestId('trainer-state')).toHaveTextContent(item.start.state_hash))
  expect(screen.getByTestId('trainer-move-count')).toHaveTextContent('0HTM')
  expect(screen.getByRole('button', { name: 'Verify and save attempt' })).toBeDisabled()
})
