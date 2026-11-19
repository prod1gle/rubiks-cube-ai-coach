// Synthetic engine fixtures test UI transport, not measured practice performance.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import fixtures from '../../test/timed-recording.json'
import type { CubeSnapshot } from '../../api/cube'
import { LiveSolve } from './LiveSolve'
vi.mock('../cube/CubeViewport', () => ({ default: ({ snapshot }: { snapshot: CubeSnapshot }) => <output data-testid="live-cube-hash">{snapshot.state_hash}</output> }))
afterEach(() => sessionStorage.clear())
const response = (v: unknown) => new Response(JSON.stringify(v))
async function start() {
  const request = vi.fn().mockResolvedValueOnce(response(fixtures.r)).mockResolvedValueOnce(response(fixtures.inverseR))
  vi.stubGlobal('fetch', (url: string, options: RequestInit) => url.includes('physical-solves') ? Promise.resolve(response({ items: [], total: 0, sample_count: 0, personal_best_ms: null, mean_ms: null, scope: 'Physical practice only.' })) : request(url, options))
  const user = userEvent.setup(); render(<MemoryRouter><LiveSolve /></MemoryRouter>)
  await user.click(screen.getByRole('button', { name: /Manual virtual solve/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start inspection' })).toBeEnabled())
  return { user, request }
}
it('captures a single inverse button input, confirms solvedness and offers real analysis', async () => {
  const { user, request } = await start()
  await user.click(screen.getByLabelText('Optional 15-second inspection'))
  await user.click(screen.getByRole('button', { name: 'Start solve' }))
  await user.click(screen.getByRole('button', { name: 'Inverse' }))
  await user.click(screen.getByRole('button', { name: "Timed move R'" }))
  expect(await screen.findByText('Solved · engine confirmed')).toBeVisible()
  expect(screen.getByTestId('live-cube-hash')).toHaveTextContent(fixtures.inverseR.steps[0].snapshot.state_hash)
  expect(screen.getByRole('link', { name: /Analyze this solve/ })).toHaveAttribute('href', '/solve-analysis?timed=latest')
  const raw = JSON.parse(sessionStorage.getItem('cubecue.manual-recording.v1')!)
  expect(raw.initial_state).toEqual(fixtures.r.state)
  expect(raw.events).toHaveLength(1); expect(raw.events[0].token).toBe("R'")
  expect(raw.elapsed_ms).toBe(raw.events[0].at_ms)
  expect(raw.events[0].ack_ms).toBeGreaterThanOrEqual(raw.events[0].at_ms)
  expect(JSON.parse(request.mock.calls[1][1].body).sequence).toBe("R'")
})
it('supports Space release, face keys and Shift-prime without animation timestamps', async () => {
  const { user } = await start()
  await user.click(screen.getByLabelText('Optional 15-second inspection'))
  await user.click(screen.getByRole('heading', { name: 'Solve Studio', level: 1 }))
  await user.keyboard(' ')
  expect(screen.getByText('running')).toBeVisible()
  await user.keyboard('{Shift>}r{/Shift}')
  expect(await screen.findByText('Solved · engine confirmed')).toBeVisible()
})
it('provides inspection cancellation and explicit practice pause/resume controls', async () => {
  const { user } = await start()
  await user.click(screen.getByRole('button', { name: 'Start inspection' }))
  expect(screen.getByLabelText('Inspection remaining')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Start solve' }))
  await user.click(screen.getByRole('button', { name: 'Pause practice' }))
  expect(screen.getByRole('button', { name: 'Timed move R' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Resume practice' }))
  expect(screen.getByRole('button', { name: 'Timed move R' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Stop solve' }))
  await screen.findByText('stopped')
  const raw = JSON.parse(sessionStorage.getItem('cubecue.manual-recording.v1')!)
  expect(raw.pauses).toHaveLength(1); expect(raw.status).toBe('stopped')
})
it('ignores keyboard shortcuts in text fields and does not accept algorithms as timed input', async () => {
  const { user, request } = await start()
  await user.click(screen.getByLabelText('Optional 15-second inspection'))
  await user.click(screen.getByRole('button', { name: 'Start solve' }))
  await user.click(screen.getByText('Exact manual recording · session-local JSON'))
  screen.getByLabelText('Timed recording JSON').focus()
  await user.keyboard("r u ")
  expect(request).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: 'Run algorithm' })).not.toBeInTheDocument()
})
it('marks background recording timing uncertain instead of presenting exact rates', async () => {
  const { user } = await start()
  await user.click(screen.getByLabelText('Optional 15-second inspection'))
  await user.click(screen.getByRole('button', { name: 'Start solve' }))
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  fireEvent(document, new Event('visibilitychange'))
  expect(await screen.findByText(/Timing integrity is uncertain/)).toBeVisible()
})
