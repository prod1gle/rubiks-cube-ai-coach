import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { LiveSolve } from './LiveSolve'
const history = { items: [], total: 0, sample_count: 0, personal_best_ms: null, mean_ms: null, scope: 'Valid physical practice only; solvedness unverified.' }
const response = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status })
it('defaults to a backend-independent physical timer with camera off and explicitly saves honest timing only', async () => {
  const request = vi.fn().mockImplementation((_url: string, options: RequestInit) => Promise.resolve(response(options.method === 'POST' ? { saved: 'ok' } : history)))
  vi.stubGlobal('fetch', request); const getUserMedia = vi.fn(); vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  const user = userEvent.setup(); render(<MemoryRouter><LiveSolve /></MemoryRouter>)
  await user.click(screen.getByLabelText('Optional 15-second inspection')); await user.click(screen.getByRole('button', { name: 'Start solve' }))
  expect(screen.getByRole('button', { name: /Manual virtual solve/ })).toBeDisabled()
  expect(getUserMedia).not.toHaveBeenCalled(); expect(screen.getByLabelText('Record video with my next solve')).not.toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Finish solve' }))
  expect(screen.getByText('Finished · self-timed')).toBeVisible()
  expect(request.mock.calls.filter(c => c[1].method === 'POST')).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Save physical result' }))
  await screen.findByRole('button', { name: 'Saved locally' })
  const save = request.mock.calls.find(c => c[1].method === 'POST')!
  expect(save[0]).toBe('/api/physical-solves'); expect(JSON.parse(save[1].body)).toMatchObject({ source: 'physical-stopwatch', status: 'stopped', timing_integrity: 'valid' })
  expect(JSON.parse(save[1].body)).not.toHaveProperty('events'); expect(request.mock.calls.every(c => c[0].includes('physical-solves'))).toBe(true)
})
it('keeps the stopwatch usable after camera permission denial and marks hidden timing uncertain', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(response(history))))
  vi.stubGlobal('isSecureContext', true); vi.stubGlobal('MediaRecorder', class {})
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')) } })
  const user = userEvent.setup(); render(<MemoryRouter><LiveSolve /></MemoryRouter>)
  await user.click(screen.getByLabelText('Record video with my next solve'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
  await user.click(screen.getByLabelText('Optional 15-second inspection')); await user.click(screen.getByRole('button', { name: 'Start solve' }))
  expect(screen.getByRole('button', { name: 'Finish solve' })).toBeEnabled()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); fireEvent(document, new Event('visibilitychange'))
  expect(screen.getByText(/Timing is uncertain/)).toBeVisible(); await user.click(screen.getByRole('button', { name: 'Finish solve' }))
})
it('preserves a failed physical result for save retry and protects it while a request is pending', async () => {
  let resolveSave!: (r: Response) => void
  const request = vi.fn().mockImplementation((_url: string, options: RequestInit) => options.method === 'POST' ? new Promise<Response>(resolve => { resolveSave = resolve }) : Promise.resolve(response(history)))
  vi.stubGlobal('fetch', request); const user = userEvent.setup(); render(<MemoryRouter><LiveSolve /></MemoryRouter>)
  await user.click(screen.getByLabelText('Optional 15-second inspection')); await user.click(screen.getByRole('button', { name: 'Start solve' })); await user.click(screen.getByRole('button', { name: 'Finish solve' })); await user.click(screen.getByRole('button', { name: 'Save physical result' }))
  await user.click(screen.getByRole('heading', { name: 'Solve Studio' })); await user.keyboard(' ')
  expect(screen.getByText('Finished · self-timed')).toBeVisible(); expect(screen.getByRole('button', { name: 'Start solve' })).toBeDisabled()
  resolveSave(response({ detail: 'Local database unavailable' }, 503))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Local database unavailable'))
  expect(screen.getByRole('button', { name: 'Save physical result' })).toBeEnabled()
})
