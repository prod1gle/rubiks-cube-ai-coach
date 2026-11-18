// Engine-derived synthetic case; not a measured practice record.
import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import fixture from '../../test/training-case.json'
import { AlgorithmTrainer } from './AlgorithmTrainer'
vi.mock('../cube/CubeViewport', () => ({ default: function TestViewport({ snapshot, active, onFinish }: { snapshot: { state_hash: string }; active?: { id: string }; onFinish: (id: string) => void }) {
  useEffect(() => { if (active) queueMicrotask(() => onFinish(active.id)) }, [active, onFinish])
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
