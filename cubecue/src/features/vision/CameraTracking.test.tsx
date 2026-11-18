// Controlled fixture: never a measured physical solve or accuracy record.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import fixture from '../../test/camera-session.json'
import { CameraTracking } from './CameraTracking'
import { scanKey } from './scanTransfer'
vi.mock('./useCamera', () => ({ useCamera: () => ({ video: { current: null }, status: 'Synthetic camera test', error: '', running: true, opening: false, start: vi.fn(), stop: vi.fn(), capture: () => ({ image: 'CONTROLLED TEST FRAME', at_ms: performance.now() }) }) }))
vi.mock('../cube/CubeViewport', () => ({ default: ({ snapshot }: { snapshot: { state_hash: string } }) => <output data-testid="camera-state">{snapshot.state_hash}</output> }))
afterEach(() => sessionStorage.clear())
const response = (v: unknown) => new Response(JSON.stringify(v))
async function begin(request: ReturnType<typeof vi.fn>) {
  sessionStorage.setItem(scanKey, JSON.stringify({ snapshot: fixture.start.snapshot, calibration: fixture.calibration, observations: [], corrected: [] }))
  vi.stubGlobal('fetch', request)
  const user = userEvent.setup(); render(<MemoryRouter><CameraTracking /></MemoryRouter>)
  await user.click(screen.getByLabelText(/Physical cube matches the reviewed scan/))
  await user.click(screen.getByRole('button', { name: 'Begin camera session' }))
  await screen.findByTestId('camera-state')
  return user
}
it('never commits from observations, requires explicit single-action confirmation, and commits once', async () => {
  let n = 0
  const request = vi.fn().mockImplementation((path: string) => Promise.resolve(response(path === '/api/tracking' ? fixture.start : path.endsWith('/observe') ? fixture.observed[n++] : fixture.confirmed)))
  const user = await begin(request)
  for (let i=0;i<3;i++) { await user.click(screen.getByRole('button', { name: 'Observe current face' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Observe current face' })).toBeEnabled()) }
  expect(screen.getByTestId('camera-state')).toHaveTextContent(fixture.start.snapshot.state_hash)
  expect(request.mock.calls.some(c => c[0].endsWith('/confirm'))).toBe(false)
  const confirm = screen.getByRole('button', { name: 'Confirm and log observed action' })
  expect(confirm).toBeDisabled()
  await user.selectOptions(screen.getByLabelText('Candidate action'), 'R')
  await user.click(screen.getByLabelText(/Exactly this one action occurred/))
  await user.click(confirm)
  await waitFor(() => expect(screen.getByTestId('camera-state')).toHaveTextContent(fixture.confirmed.snapshot.state_hash))
  expect(request.mock.calls.filter(c => c[0].endsWith('/confirm'))).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Confirm and log observed action' })).not.toBeInTheDocument()
})
it('persists a queued visibility gap after an in-flight observation with the new revision', async () => {
  let resolve!: (v: Response) => void
  const gap = { ...fixture.observed[0], revision: 2, needs_sync: true, events: [...fixture.observed[0].events, { index: 1, kind: 'gap', clock_id: 'TEST', at_ms: 200 }] }
  const request = vi.fn().mockImplementation((path: string) => path === '/api/tracking' ? Promise.resolve(response(fixture.start)) : path.endsWith('/observe') ? new Promise<Response>(r => { resolve = r }) : Promise.resolve(response(gap)))
  const user = await begin(request)
  await user.click(screen.getByRole('button', { name: 'Observe current face' }))
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  fireEvent(document, new Event('visibilitychange'))
  expect(request.mock.calls.filter(c => c[0].endsWith('/gap'))).toHaveLength(0)
  resolve(response(fixture.observed[0]))
  await waitFor(() => expect(request.mock.calls.filter(c => c[0].endsWith('/gap'))).toHaveLength(1))
  const sent = request.mock.calls.find(c => c[0].endsWith('/gap'))!
  expect(JSON.parse(sent[1].body).revision).toBe(1)
  expect(await screen.findByText(/Logging suspended · recovery required/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Observe current face' })).toBeDisabled()
})
it('hides old evidence after recovery and serializes reload against new actions', async () => {
  let reload!: (v: Response) => void, observations = 0
  const recovered = { ...fixture.observed[2], revision: 5, events: [...fixture.observed[2].events, { index: 3, kind: 'gap', clock_id: 'TEST', at_ms: 1200 }, { index: 4, kind: 'resync', clock_id: 'TEST', at_ms: 1200 }] }
  const request = vi.fn().mockImplementation((path: string, options: { method: string }) => {
    if (path === '/api/tracking') return Promise.resolve(response(fixture.start))
    if (options.method === 'GET') return new Promise<Response>(r => { reload = r })
    if (path.endsWith('/gap')) return Promise.resolve(response({ ...recovered, revision: 6, needs_sync: true }))
    return Promise.resolve(response(path.endsWith('/resync') ? recovered : fixture.observed[Math.min(2,observations++)]))
  })
  const user = await begin(request)
  for (let i=0;i<3;i++) { await user.click(screen.getByRole('button', { name: 'Observe current face' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Observe current face' })).toBeEnabled()) }
  await user.click(screen.getByLabelText(/I verified physical alignment/))
  await user.click(screen.getByRole('button', { name: 'Confirm manual alignment' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Confirm and log observed action' })).not.toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: 'Reload saved camera session' }))
  expect(screen.getByRole('button', { name: 'Observe current face' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Confirm manual alignment' })).toBeDisabled()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  fireEvent(document, new Event('visibilitychange'))
  reload(response(recovered))
  await waitFor(() => expect(request.mock.calls.some(c => c[0].endsWith('/gap'))).toBe(true))
  const queued = request.mock.calls.find(c => c[0].endsWith('/gap'))!
  expect(JSON.parse(queued[1].body).revision).toBe(5)
  expect(await screen.findByText(/Logging suspended · recovery required/)).toBeVisible()
})
it('preserves a new visibility gap arriving during a recovery request', async () => {
  let recover!: (v: Response) => void
  const recovered = { ...fixture.start, revision: 2, events: [{ index: 0, kind: 'gap', clock_id: 'TEST', at_ms: 100 }, { index: 1, kind: 'resync', clock_id: 'TEST', at_ms: 100 }] }
  const request = vi.fn().mockImplementation((path: string) => path === '/api/tracking' ? Promise.resolve(response(fixture.start)) : path.endsWith('/resync') ? new Promise<Response>(r => { recover = r }) : Promise.resolve(response({ ...recovered, revision: 3, needs_sync: true })))
  const user = await begin(request)
  await user.click(screen.getByLabelText(/I verified physical alignment/))
  await user.click(screen.getByRole('button', { name: 'Confirm manual alignment' }))
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  fireEvent(document, new Event('visibilitychange'))
  recover(response(recovered))
  await waitFor(() => expect(request.mock.calls.some(c => c[0].endsWith('/gap'))).toBe(true))
  const queued = request.mock.calls.find(c => c[0].endsWith('/gap'))!
  expect(JSON.parse(queued[1].body).revision).toBe(2)
  expect(await screen.findByText(/Logging suspended · recovery required/)).toBeVisible()
  expect(screen.getByRole('button', { name: 'Observe current face' })).toBeDisabled()
})
