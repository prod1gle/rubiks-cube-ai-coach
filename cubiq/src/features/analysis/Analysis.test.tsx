import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import type { ActiveTurn } from '../cube/CubeController'
import fixtures from '../../test/cube-analysis.json'
import { SolveAnalysis } from './SolveAnalysis'
import { saveRecording } from './recording'

vi.mock('../cube/CubeViewport', () => ({ default: ({ active, onFinish }: { active?: ActiveTurn; onFinish: (id: string) => void }) => <button disabled={!active} onClick={() => { if (active) { onFinish(active.id); onFinish(active.id) } }}>Finish cube animation</button> }))
afterEach(() => sessionStorage.clear())
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
async function start(...extra: Response[]) {
  saveRecording(fixtures.input)
  const request = vi.fn().mockResolvedValueOnce(response(fixtures.reply))
  extra.forEach(r => request.mockResolvedValueOnce(r))
  vi.stubGlobal('fetch', request)
  const user = userEvent.setup(); render(<MemoryRouter><SolveAnalysis /></MemoryRouter>)
  await user.selectOptions(screen.getByLabelText('Comparison objective'), 'training')
  await user.click(screen.getByRole('button', { name: 'Compare this segment' }))
  await screen.findByRole('region', { name: 'Verified segment comparison' })
  return { user, request }
}
it('submits the exact record/range and exposes verified counts without inventing execution speeds', async () => {
  const { user, request } = await start()
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual(fixtures.input)
  expect(screen.getByText('4 fewer HTM moves')).toBeVisible()
  expect(screen.getByText('1 more rotations')).toBeVisible()
  expect(screen.getByTestId('actual-hash')).toHaveTextContent(fixtures.reply.start.state_hash)
  expect(screen.getByTestId('alternative-hash')).toHaveTextContent(fixtures.reply.start.state_hash)
  await user.click(screen.getByRole('button', { name: 'Show Me Why' }))
  expect(screen.getByText(/Physical execution time and seconds saved are unknown/)).toBeVisible()
  expect(screen.getByText(/comfort-1 fixed coded ergonomics/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Show Me Why' })).toHaveAttribute('aria-expanded', 'true')
})
it('steps synchronized branches once despite duplicate callbacks and reverses exactly', async () => {
  const { user } = await start()
  await user.click(screen.getByRole('button', { name: 'Comparison next step' }))
  const actual = within(screen.getByRole('region', { name: 'Actual moves' })), alt = within(screen.getByRole('region', { name: 'Verified alternative' }))
  await user.click(actual.getByRole('button', { name: 'Finish cube animation' }))
  expect(screen.getByLabelText('Comparison replay step')).toHaveValue('0')
  await user.click(alt.getByRole('button', { name: 'Finish cube animation' }))
  expect(screen.getByLabelText('Comparison replay step')).toHaveValue('1')
  await user.click(screen.getByRole('button', { name: 'Comparison previous step' }))
  await user.click(actual.getByRole('button', { name: 'Finish cube animation' })); await user.click(alt.getByRole('button', { name: 'Finish cube animation' }))
  expect(screen.getByTestId('actual-hash')).toHaveTextContent(fixtures.reply.start.state_hash)
})
it('selects a different branch and resets both cursors without changing the record', async () => {
  const { user } = await start()
  await user.click(screen.getByRole('button', { name: 'Comparison end' }))
  await user.selectOptions(screen.getByRole('combobox', { name: 'Verified alternative' }), fixtures.reply.alternatives[1].id)
  expect(screen.getByLabelText('Comparison replay step')).toHaveValue('0')
  expect(screen.getByTestId('actual-hash')).toHaveTextContent(fixtures.reply.start.state_hash)
  expect(screen.getByLabelText('Recorded move sequence')).toHaveValue(fixtures.input.sequence)
})
it('practice starts from the original boundary, verifies retry by goal and resets exactly', async () => {
  const { user, request } = await start(response(fixtures.retryPlan), response(fixtures.practice))
  await user.click(screen.getByRole('button', { name: 'Comparison end' }))
  await user.click(screen.getByRole('button', { name: 'Practice This Case' }))
  expect(await screen.findByTestId('practice-hash')).toHaveTextContent(fixtures.reply.start.state_hash)
  await user.type(screen.getByLabelText('Your retry sequence'), fixtures.reply.alternatives[0].notation)
  await user.click(screen.getByRole('button', { name: 'Apply retry sequence' }))
  const practice = within(screen.getByRole('region', { name: 'Practice this case' }))
  for (let i = 0; i < fixtures.retryPlan.steps.length; i++) {
    await waitFor(() => expect(practice.getByRole('button', { name: 'Finish cube animation' })).toBeEnabled())
    await user.click(practice.getByRole('button', { name: 'Finish cube animation' }))
  }
  await user.click(screen.getByRole('button', { name: 'Check attempt' }))
  expect(await screen.findByText(/Objective achieved/)).toBeVisible()
  expect(JSON.parse(request.mock.calls[2][1].body).attempt).toBe(fixtures.reply.alternatives[0].notation)
  await user.click(screen.getByRole('button', { name: 'Reset original case' }))
  await waitFor(() => expect(screen.getByTestId('practice-hash')).toHaveTextContent(fixtures.reply.start.state_hash))
  expect(screen.getByLabelText('Recorded move sequence')).toHaveValue(fixtures.input.sequence)
})
it('invalidates a comparison when the selected segment or objective changes', async () => {
  const { user } = await start()
  await user.selectOptions(screen.getByLabelText('Comparison objective'), 'fewest')
  expect(screen.queryByRole('region', { name: 'Verified segment comparison' })).not.toBeInTheDocument()
})
it('shows a real backend error and retains the imported record', async () => {
  saveRecording(fixtures.input)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ detail: { code: 'record_mismatch', message: 'Record does not match.' } }, 422)))
  const user = userEvent.setup(); render(<MemoryRouter><SolveAnalysis /></MemoryRouter>)
  await user.click(screen.getByRole('button', { name: 'Compare this segment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Record does not match')
  expect(screen.getByLabelText('Recorded move sequence')).toHaveValue(fixtures.input.sequence)
})
it('rejects a late comparison after cancellation', async () => {
  saveRecording(fixtures.input)
  let resolve!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(done => { resolve = done })))
  const user = userEvent.setup(); render(<MemoryRouter><SolveAnalysis /></MemoryRouter>)
  await user.click(screen.getByRole('button', { name: 'Compare this segment' })); await user.click(screen.getByRole('button', { name: 'Cancel comparison' }))
  resolve(response(fixtures.reply))
  await screen.findByText('Comparison cancelled. Your record is unchanged.')
  expect(screen.queryByRole('region', { name: 'Verified segment comparison' })).not.toBeInTheDocument()
})

it('rejects a corrupt plan chain before attempting to mount a replay', async () => {
  saveRecording(fixtures.input)
  const broken = structuredClone(fixtures.reply); broken.actual.plan.steps[1].before_hash = 'wrong'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(broken)))
  const user = userEvent.setup(); render(<MemoryRouter><SolveAnalysis /></MemoryRouter>)
  await user.click(screen.getByRole('button', { name: 'Compare this segment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('unexpected snapshot or transition plan')
  expect(screen.queryByRole('region', { name: 'Synchronized comparison replay' })).not.toBeInTheDocument()
})
