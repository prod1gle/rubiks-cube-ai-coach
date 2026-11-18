// SYNTHETIC clock data only; runtime never imports this fixture.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import type { CubeSnapshot, TimedRecording } from '../../api/cube'
import fixtures from '../../test/timed-recording.json'
import { TimedSolveReport } from './TimedSolveReport'
import { SolveAnalysis } from './SolveAnalysis'
import { storeTimedRecording } from '../timer/recording'
vi.mock('../cube/CubeViewport', () => ({ default: ({ snapshot }: { snapshot: CubeSnapshot }) => <span data-testid="report-cube">{snapshot.state_hash}</span> }))
const record = fixtures.recording as unknown as TimedRecording
const response = (v: unknown) => new Response(JSON.stringify(v))
afterEach(() => sessionStorage.clear())
async function start(value: unknown = fixtures.analytics) {
  const request = vi.fn().mockResolvedValueOnce(response(value)).mockResolvedValueOnce(response(fixtures.checkpoint1))
  vi.stubGlobal('fetch', request)
  const onReview = vi.fn(); render(<TimedSolveReport recording={record} onReview={onReview} />)
  await screen.findByRole('heading', { name: 'Explore the solve' })
  return { user: userEvent.setup(), request, onReview }
}
it('displays validated arithmetic, initial/skipped goals and unavailable physical moving TPS', async () => {
  await start()
  expect(screen.getByText('1.20')).toBeVisible()
  expect(screen.getByRole('heading', { name: 'F2L BR' })).toBeVisible()
  expect(screen.getByText(/Physical moving TPS is unavailable/)).toBeVisible()
  expect(screen.getByText(/OLL · skipped at prerequisite/)).toBeVisible()
  expect(screen.getByRole('group', { name: /Manual input TPS chart/ })).toBeVisible()
})
it('loads an exact engine snapshot for a selected timeline checkpoint', async () => {
  const { request } = await start()
  fireEvent.change(screen.getByLabelText('Timed solve timeline'), { target: { value: '1' } })
  await waitFor(() => expect(screen.getByTestId('timed-checkpoint-hash')).toHaveTextContent(fixtures.checkpoint1.state_hash))
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ state: fixtures.analytics.checkpoints[1].state, sequence: '' })
})
it('offers keyboard-accessible chart bins and inspects the verified final state', async () => {
  const { user } = await start()
  await user.click(screen.getByRole('button', { name: /2.0 to 2.5 seconds/ }))
  await waitFor(() => expect(screen.getByTestId('timed-checkpoint-hash')).toHaveTextContent(fixtures.analytics.final.state_hash))
})
it('connects a stage to the exact original record and segment indices', async () => {
  const { user, onReview } = await start()
  await user.click(screen.getByRole('button', { name: 'What Could I Have Done Instead?' }))
  expect(onReview).toHaveBeenCalledWith({ facelets: fixtures.analytics.initial.facelets, sequence: "y R U R'", expected_end_hash: record.expected_end_hash, start: 0, end: 4, objective: 'cfop', goal: 'auto' })
})
it('withholds timing chart and duration statistics for an uncertain clock', async () => {
  await start(fixtures.uncertain)
  expect(screen.getByText(/^Timing unavailable:/)).toBeVisible()
  expect(screen.getByText(/TPS chart unavailable/)).toBeVisible()
  expect(screen.queryByRole('group', { name: /Manual input TPS chart/ })).not.toBeInTheDocument()
  expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(3)
  expect(screen.getByTestId('report-cube')).toHaveTextContent(fixtures.analytics.initial.state_hash)
})
it('opens the latest timed record and directly runs its stage retrospective comparison', async () => {
  storeTimedRecording(record)
  const request = vi.fn<(path: string, options?: RequestInit) => Promise<Response>>().mockImplementation((path: string) => Promise.resolve(response(path === '/api/cube/recordings/analyze' ? fixtures.analytics : path === '/api/cube/analysis' ? fixtures.comparison : fixtures.initial)))
  vi.stubGlobal('fetch', request)
  const user = userEvent.setup(); render(<MemoryRouter initialEntries={['/solve-analysis?timed=latest']}><SolveAnalysis /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'F2L BR' })
  await user.click(screen.getByRole('button', { name: 'What Could I Have Done Instead?' }))
  expect(await screen.findByRole('region', { name: 'Verified segment comparison' })).toBeVisible()
  expect(screen.getByLabelText('First action')).toHaveValue(1)
  expect(screen.getByLabelText('Last action (included)')).toHaveValue(4)
  const call = request.mock.calls.find(([path]) => path === '/api/cube/analysis')!
  expect(JSON.parse(String(call[1]?.body)).sequence).toBe("y R U R'")
})

it('rejects a mismatched timed response instead of showing stale performance statistics', async () => {
  const changed = structuredClone(fixtures.analytics); changed.events[0].at_ms = 99
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(changed)))
  render(<TimedSolveReport recording={record} onReview={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('does not match the original recording')
  expect(screen.queryByRole('heading', { name: 'Explore the solve' })).not.toBeInTheDocument()
})
