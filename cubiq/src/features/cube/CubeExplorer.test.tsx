import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { plans, snapshots, solutions } from '../../test/cube-data'
import type { ActiveTurn } from './CubeController'
import { CubeExplorer } from './CubeExplorer'

// Hold animation completion explicitly: state must not change until this callback.
vi.mock('./CubeViewport', () => ({ default: ({ active, onFinish }: { active?: ActiveTurn; onFinish: (id: string) => void }) => <div data-testid="viewport"><button disabled={!active} onClick={() => { if (active) { onFinish(active.id); onFinish(active.id) } }}>Finish animation</button></div> }))
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
async function start(...results: Response[]) {
  const request = vi.fn().mockResolvedValueOnce(response(snapshots.solved))
  results.forEach(result => request.mockResolvedValueOnce(result))
  vi.stubGlobal('fetch', request)
  const user = userEvent.setup()
  render(<CubeExplorer />)
  await screen.findByText('Solved · in any grip')
  return { request, user }
}
async function land(user: ReturnType<typeof userEvent.setup>) {
  const button = screen.getByRole('button', { name: 'Finish animation' })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
}

it('keeps the accepted snapshot until animation ends and commits duplicate callbacks only once', async () => {
  const { request, user } = await start(response(plans.r))
  await user.click(screen.getByRole('button', { name: 'Apply R' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finish animation' })).toBeEnabled())
  expect(screen.getByLabelText('Current facelets')).toHaveValue(snapshots.solved.facelets)
  expect(screen.getByTestId('move-count')).toHaveTextContent('0')
  await land(user)
  expect(screen.getByLabelText('Current facelets')).toHaveValue(plans.r.steps[0].snapshot.facelets)
  expect(screen.getByTestId('move-count')).toHaveTextContent('1HTM')
  expect(request.mock.calls[1][0]).toBe('/api/cube/plan')
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({ state: snapshots.solved.state, sequence: 'R' })
  expect(request).toHaveBeenCalledTimes(2)
})

it('queues rapid button inputs and plans the second from the first accepted state', async () => {
  const { request, user } = await start(response(plans.r), response(plans.uAfterR))
  await user.click(screen.getByRole('button', { name: 'Apply R' }))
  await user.click(screen.getByRole('button', { name: 'Apply U' }))
  expect(request).toHaveBeenCalledTimes(2)
  await land(user); await land(user)
  expect(JSON.parse(request.mock.calls[2][1].body).state).toEqual(plans.r.steps[0].snapshot.state)
  expect(screen.getByTestId('move-count')).toHaveTextContent('2HTM')
})

it('supports double turns and backend-derived zero-HTM grip rotations', async () => {
  const { request, user } = await start(response(plans.doubleR))
  await user.click(screen.getByRole('button', { name: 'Double' }))
  await user.click(screen.getByRole('button', { name: 'Apply R2' }))
  await land(user)
  expect(JSON.parse(request.mock.calls[1][1].body).sequence).toBe('R2')
  expect(screen.getByTestId('move-count')).toHaveTextContent('1HTM')
})

it('keyboard moves work, Shift inverts, and typing or held keys never turns the cube', async () => {
  const { request, user } = await start(response(plans.inverseR))
  await user.type(screen.getByLabelText('Move sequence'), 'R U')
  expect(request).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(window, { key: 'r', repeat: true })
  expect(request).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(window, { key: 'R', shiftKey: true })
  await land(user)
  expect(JSON.parse(request.mock.calls[1][1].body).sequence).toBe("R'")
})

it('undo, redo, step playback and scrubbing use saved engine states without new HTTP applications', async () => {
  const { request, user } = await start(response(plans.algorithm))
  await user.type(screen.getByLabelText('Move sequence'), "R U R' U'")
  await user.click(screen.getByRole('button', { name: 'Run algorithm' }))
  for (let i = 0; i < 4; i++) await land(user)
  expect(screen.getByTestId('move-count')).toHaveTextContent('4HTM')
  await user.click(screen.getByRole('button', { name: 'Undo move' })); await land(user)
  expect(screen.getByTestId('move-count')).toHaveTextContent('3HTM')
  await user.click(screen.getByRole('button', { name: 'Redo move' })); await land(user)
  expect(screen.getByTestId('move-count')).toHaveTextContent('4HTM')
  fireEvent.change(screen.getByLabelText('Playback position'), { target: { value: '0' } })
  expect(screen.getByLabelText('Current facelets')).toHaveValue(snapshots.solved.facelets)
  await user.click(screen.getByRole('button', { name: 'Step forward' })); await land(user)
  expect(screen.getByTestId('move-count')).toHaveTextContent('1HTM')
  expect(request).toHaveBeenCalledTimes(2)
})

it('pause lands the active turn, holds pending turns, and resumes the batch', async () => {
  const { user } = await start(response(plans.algorithm))
  await user.type(screen.getByLabelText('Move sequence'), "R U R' U'")
  await user.click(screen.getByRole('button', { name: 'Run algorithm' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finish animation' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Pause playback' })); await land(user)
  expect(screen.getByTestId('move-count')).toHaveTextContent('1HTM')
  expect(screen.getByRole('button', { name: 'Finish animation' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Resume playback' }))
  for (let i = 0; i < 3; i++) await land(user)
  expect(screen.getByTestId('move-count')).toHaveTextContent('4HTM')
})

it('reset cancels the active turn and any pending button requests', async () => {
  const { request, user } = await start(response(plans.r), response(snapshots.solved))
  await user.click(screen.getByRole('button', { name: 'Apply R' }))
  await user.click(screen.getByRole('button', { name: 'Apply U' }))
  await user.click(screen.getByRole('button', { name: 'Reset cube' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Reset cube' })).toBeEnabled())
  expect(screen.getByTestId('move-count')).toHaveTextContent('0HTM')
  expect(request).toHaveBeenCalledTimes(3)
  expect(request.mock.calls[2][0]).toBe('/api/cube')
})

it('scramble requests a legal backend plan and displays its actual committed count', async () => {
  const { request, user } = await start(response(plans.scramble))
  await user.click(screen.getByRole('button', { name: 'Scramble' }))
  for (let i = 0; i < 20; i++) await land(user)
  expect(request.mock.calls[1][0]).toBe('/api/cube/scramble')
  expect(screen.getByTestId('move-count')).toHaveTextContent('20HTM')
  expect(screen.getByLabelText('Current facelets')).toHaveValue(plans.scramble.steps[19].snapshot.facelets)
})

it('invalid algorithms retain state, report the error and do not animate a prefix', async () => {
  const { user } = await start(response({ detail: { code: 'notation_token', message: 'Unsupported notation Q.' } }, 422))
  await user.type(screen.getByLabelText('Move sequence'), 'R Q')
  await user.click(screen.getByRole('button', { name: 'Run algorithm' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported notation Q')
  expect(screen.getByLabelText('Current facelets')).toHaveValue(snapshots.solved.facelets)
  expect(screen.getByRole('button', { name: 'Finish animation' })).toBeDisabled()
})

it('unavailable or malformed initial engine responses never fabricate a cube', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(response(snapshots.solved)))
  const user = userEvent.setup()
  render(<CubeExplorer />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
  expect(screen.queryByTestId('viewport')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reconnect to engine' }))
  expect(await screen.findByText('Solved · in any grip')).toBeVisible()
})

it('shows a verified solution without moving the cube, then plays forward and backward from the exact start', async () => {
  const { request, user } = await start(response(plans.r), response(solutions.r))
  await user.click(screen.getByRole('button', { name: 'Apply R' })); await land(user)
  await user.click(screen.getByRole('button', { name: 'Solve cube' }))
  expect(await screen.findByText('Engine verified')).toBeVisible()
  expect(screen.getByText('Short solution · optimality unproven')).toBeVisible()
  expect(screen.getByText('0.123 s computation')).toBeVisible()
  expect(screen.getByTestId('move-count')).toHaveTextContent('1HTM')
  expect(screen.getByLabelText('Current facelets')).toHaveValue(plans.r.steps[0].snapshot.facelets)
  expect(request.mock.calls[2][0]).toBe('/api/cube/solve')
  expect(JSON.parse(request.mock.calls[2][1].body).state).toEqual(plans.r.steps[0].snapshot.state)
  await user.click(screen.getByRole('button', { name: 'Next solution move' })); await land(user)
  expect(screen.getByText(`Solution step 1 of ${solutions.r.move_count}`)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Previous solution move' })); await land(user)
  expect(screen.getByLabelText('Current facelets')).toHaveValue(plans.r.steps[0].snapshot.facelets)
  await user.click(screen.getByRole('button', { name: 'Play solution' }))
  for (let i = 0; i < solutions.r.plan.steps.length; i++) await land(user)
  expect(screen.getByText(`Solution step ${solutions.r.move_count} of ${solutions.r.move_count} · Solved`)).toBeVisible()
  expect(screen.getByLabelText('Current facelets')).toHaveValue(snapshots.solved.facelets)
  await user.click(screen.getByRole('button', { name: 'Go to solution start' }))
  expect(screen.getByLabelText('Current facelets')).toHaveValue(plans.r.steps[0].snapshot.facelets)
  expect(request).toHaveBeenCalledTimes(3)
})

it('uses the saved solution start after scrubbing earlier history', async () => {
  const { user } = await start(response(plans.r), response(solutions.r))
  await user.click(screen.getByRole('button', { name: 'Apply R' })); await land(user)
  await user.click(screen.getByRole('button', { name: 'Solve cube' }))
  await screen.findByText('Engine verified')
  await user.click(screen.getByRole('button', { name: 'Go to start' }))
  expect(screen.getByRole('button', { name: 'Next solution move' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Play solution' }))
  expect(screen.getByLabelText('Current facelets')).toHaveValue(plans.r.steps[0].snapshot.facelets)
  await land(user)
  expect(screen.getByText(`Solution step 1 of ${solutions.r.move_count}`)).toBeVisible()
})

it('retains the cube and displays an actionable solver timeout', async () => {
  const { user } = await start(response(plans.r), response({ detail: { code: 'solver_timeout', message: 'Search budget reached. No moves were applied.' } }, 504))
  await user.click(screen.getByRole('button', { name: 'Apply R' })); await land(user)
  await user.click(screen.getByRole('button', { name: 'Solve cube' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Search budget reached')
  expect(screen.getByLabelText('Current facelets')).toHaveValue(plans.r.steps[0].snapshot.facelets)
  expect(screen.getByRole('button', { name: 'Solve cube' })).toBeEnabled()
  expect(screen.queryByLabelText('Computed solution')).not.toBeInTheDocument()
})

it.each([{ ...solutions.r, optimality: 'proven' }, { ...solutions.r, verified: false }])('rejects unsupported proof or verification metadata from the API', async result => {
  const { user } = await start(response(plans.r), response(result))
  await user.click(screen.getByRole('button', { name: 'Apply R' })); await land(user)
  await user.click(screen.getByRole('button', { name: 'Solve cube' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('unexpected snapshot or transition plan')
  expect(screen.queryByText('Engine verified')).not.toBeInTheDocument()
})

it('offers cancellation while searching and restores controls without accepting a late result', async () => {
  const { request, user } = await start(response(plans.r))
  await user.click(screen.getByRole('button', { name: 'Apply R' })); await land(user)
  let resolve!: (value: Response) => void
  request.mockReturnValueOnce(new Promise<Response>(done => { resolve = done }))
  await user.click(screen.getByRole('button', { name: 'Solve cube' }))
  expect(screen.getByText(/Searching locally/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Apply U' })).toBeDisabled()
  fireEvent.keyDown(window, { key: 'u' })
  await user.click(screen.getByRole('button', { name: 'Cancel solve' }))
  resolve(response(solutions.r))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Solve cube' })).toBeEnabled())
  expect(screen.queryByLabelText('Computed solution')).not.toBeInTheDocument()
  expect(screen.getByTestId('move-count')).toHaveTextContent('1HTM')
  expect(request).toHaveBeenCalledTimes(3)
})

it('labels an already-solved state and offers no unnecessary playback', async () => {
  const { user } = await start(response(solutions.solved))
  await user.click(screen.getByRole('button', { name: 'Solve cube' }))
  expect(await screen.findByText('This cube is already solved. No face turns are needed.')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Next solution move' })).not.toBeInTheDocument()
  expect(screen.getByTestId('move-count')).toHaveTextContent('0HTM')
})
