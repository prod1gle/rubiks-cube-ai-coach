import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { coachingFixtures as fixtures } from '../../test/cube-data'
import type { ActiveTurn } from './CubeController'
import { CubeExplorer } from './CubeExplorer'

vi.mock('./CubeViewport', () => ({ default: ({ active, onFinish, highlighted = [] }: { active?: ActiveTurn; onFinish: (id: string) => void; highlighted?: string[] }) => <div><output data-testid="highlighted">{highlighted.join('|')}</output><button disabled={!active} onClick={() => { if (active) { onFinish(active.id); onFinish(active.id) } }}>Finish animation</button></div> }))
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const panel = () => within(screen.getByRole('region', { name: 'Next Best Move' }))
async function start(partial = false, ...results: Response[]) {
  const data = partial ? fixtures.partial : fixtures.back
  const request = vi.fn().mockResolvedValueOnce(response(data.snapshot)).mockResolvedValueOnce(response(data.hint))
  results.forEach(result => request.mockResolvedValueOnce(result))
  vi.stubGlobal('fetch', request)
  const user = userEvent.setup()
  const mounted = render(<CubeExplorer />)
  await screen.findByText('Legal scrambled state')
  expect(request).toHaveBeenCalledTimes(1)
  await user.click(panel().getByRole('button', { name: 'Get a hint' }))
  await panel().findByText('Hint synchronized with your cube.')
  return { request, user, ...mounted }
}
async function land(user: ReturnType<typeof userEvent.setup>) {
  const finish = screen.getByRole('button', { name: 'Finish animation' })
  await waitFor(() => expect(finish).toBeEnabled())
  await user.click(finish)
}

it('uses the exact canonical partial state, shows actual progress, and initially hides notation', async () => {
  const { request } = await start(true)
  expect(request.mock.calls[1][0]).toBe('/api/cube/next')
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ state: fixtures.partial.snapshot.state, mode: 'cfop', ranking: 'ergonomic', allow_rotations: true })
  expect(panel().getByText('Cross ✓')).toBeVisible()
  expect(panel().getByText('F2L 1/4')).toBeVisible()
  expect(panel().queryByLabelText('Suggested notation')).not.toBeInTheDocument()
  expect(screen.getByTestId('highlighted')).toHaveTextContent(fixtures.partial.hint.candidates[0].highlight_ids.join('|'))
  expect(screen.getByLabelText('Current facelets')).toHaveValue(fixtures.partial.snapshot.facelets)
})

it('offers three accessible hint levels without another computation or applying moves', async () => {
  const { user, request } = await start()
  const subtle = panel().getByRole('tab', { name: 'Subtle Hint' })
  subtle.focus()
  await user.keyboard('{ArrowRight}')
  expect(panel().getByRole('tab', { name: 'Guided Hint' })).toHaveAttribute('aria-selected', 'true')
  expect(panel().queryByLabelText('Suggested notation')).not.toBeInTheDocument()
  await user.click(panel().getByRole('tab', { name: 'Full Solution' }))
  expect(panel().getByLabelText('Suggested notation')).toHaveTextContent('y R U R\'')
  expect(screen.getByTestId('move-count')).toHaveTextContent('0HTM')
  expect(request).toHaveBeenCalledTimes(2)
})

it('selects another remaining pair and updates engine-provided target highlights', async () => {
  const { user, request } = await start(true)
  const other = fixtures.partial.hint.candidates.find(c => c.slot !== fixtures.partial.hint.candidates[0].slot)!
  const index = fixtures.partial.hint.candidates.indexOf(other) + 1
  await user.click(panel().getByRole('button', { name: `Choose ${other.title} alternative ${index}` }))
  expect(screen.getByTestId('highlighted')).toHaveTextContent(other.highlight_ids.join('|'))
  expect(screen.getByLabelText('Current facelets')).toHaveValue(fixtures.partial.snapshot.facelets)
  expect(request).toHaveBeenCalledTimes(2)
})

it('applies one suggested rotation once and immediately recomputes for the new grip', async () => {
  const { user, request } = await start(false, response(fixtures.back.firstPlan), response(fixtures.back.afterFirstHint))
  await user.click(panel().getByRole('tab', { name: 'Full Solution' }))
  await user.click(panel().getByRole('button', { name: /Apply next move/ }))
  expect(screen.getByTestId('highlighted')).toHaveTextContent('')
  expect(screen.getByLabelText('Current facelets')).toHaveValue(fixtures.back.snapshot.facelets)
  await land(user)
  await panel().findByText('Hint synchronized with your cube.')
  expect(request).toHaveBeenCalledTimes(4)
  expect(JSON.parse(request.mock.calls[2][1].body).sequence).toBe('y')
  const after = fixtures.back.firstPlan.steps[0].snapshot
  expect(JSON.parse(request.mock.calls[3][1].body).state).toEqual(after.state)
  expect(JSON.parse(request.mock.calls[3][1].body).continuation.consumed).toBe(1)
  expect(screen.getByLabelText('Current facelets')).toHaveValue(after.facelets)
  expect(screen.getByTestId('move-count')).toHaveTextContent('0HTM')
})

it('finishes an insertion after a face turn temporarily disturbs the Cross instead of suggesting its undo', async () => {
  const { user } = await start(false, response(fixtures.back.firstPlan), response(fixtures.back.afterFirstHint), response(fixtures.back.secondPlan), response(fixtures.back.afterSecondHint))
  await user.click(panel().getByRole('tab', { name: 'Full Solution' }))
  await user.click(panel().getByRole('button', { name: /Apply next move/ })); await land(user)
  await panel().findByText('Hint synchronized with your cube.')
  await user.click(panel().getByRole('button', { name: /Apply next move/ })); await land(user)
  await panel().findByText('Hint synchronized with your cube.')
  expect(panel().getByText('Cross pending')).toBeVisible()
  expect(panel().getByLabelText('Suggested notation')).toHaveTextContent("U R'")
  expect(panel().getByRole('button', { name: /Replan from current state/ })).toBeEnabled()
})

it('accepts a different manual move, discards the old intent, and recalculates its exact state', async () => {
  const { user, request } = await start(false, response(fixtures.back.manualPlan), response(fixtures.back.afterManualHint))
  await user.click(screen.getByRole('button', { name: 'Apply U' })); await land(user)
  await panel().findByText('Hint synchronized with your cube.')
  const body = JSON.parse(request.mock.calls[3][1].body)
  expect(body.state).toEqual(fixtures.back.manualPlan.steps[0].snapshot.state)
  expect(body.continuation).toBeUndefined()
})

it('plays and applies the full verified goal sequence and refreshes to a solved empty state', async () => {
  const { user } = await start(false, response(fixtures.back.fullPlan), response(fixtures.back.afterFullHint))
  await user.click(panel().getByRole('tab', { name: 'Full Solution' }))
  await user.click(panel().getByRole('button', { name: 'Play & apply sequence' }))
  for (let i = 0; i < fixtures.back.fullPlan.steps.length; i++) await land(user)
  expect(await panel().findByText('This cube is solved. No next move is needed.')).toBeVisible()
  expect(screen.getByTestId('move-count')).toHaveTextContent('3HTM')
  expect(screen.getByTestId('highlighted')).toHaveTextContent('')
})

it('switches ranking and mode with explicit transport settings and no fake personalization', async () => {
  const { user, request } = await start(false, response(fixtures.back.htmHint), response(fixtures.back.shortHint))
  await user.selectOptions(panel().getByLabelText('Candidate ranking'), 'htm')
  await panel().findByText('Hint synchronized with your cube.')
  expect(JSON.parse(request.mock.calls[2][1].body).ranking).toBe('htm')
  await user.selectOptions(panel().getByLabelText('Coaching mode'), 'short')
  await panel().findByText('Hint synchronized with your cube.')
  expect(JSON.parse(request.mock.calls[3][1].body).mode).toBe('short')
  await user.click(panel().getByText('How candidates are ranked'))
  expect(panel().getByText(/Real practice capture and personalized training are future work/)).toBeVisible()
})

it('retains the cube and exposes a retry after a failed hint request', async () => {
  const request = vi.fn().mockResolvedValueOnce(response(fixtures.back.snapshot)).mockResolvedValueOnce(response({ detail: { message: 'Hint unavailable.' } }, 503))
  vi.stubGlobal('fetch', request)
  const user = userEvent.setup(); render(<CubeExplorer />)
  await screen.findByText('Legal scrambled state')
  await user.click(panel().getByRole('button', { name: 'Get a hint' }))
  expect(await panel().findByRole('alert')).toHaveTextContent('Hint unavailable')
  expect(screen.getByLabelText('Current facelets')).toHaveValue(fixtures.back.snapshot.facelets)
  expect(panel().getByRole('button', { name: 'Recalculate hint' })).toBeEnabled()
  expect(panel().getByRole('button', { name: 'Replan from current state' })).toBeEnabled()
})
