// Controlled capture fixtures test workflow only, not real camera accuracy.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import cube from '../../test/cube-fixtures.json'
import { GuidedScan } from './GuidedScan'
import { scanKey } from './scanTransfer'
vi.mock('./useCamera', () => ({ useCamera: () => ({ video: { current: null }, status: 'Synthetic test camera', error: '', running: true, opening: false, start: vi.fn(), stop: vi.fn(), capture: () => ({ image: 'EXPLICIT-SYNTHETIC-FRAME', at_ms: 100 }) }) }))
it('captures all six faces, requires review, preserves confidence and transfers only validated states', async () => {
  sessionStorage.clear()
  const orientations = Object.fromEntries([...'URFDLB'].map(f => [f, { top: 'B', right: 'R' }]))
  const observations = [...cube.solved.facelets].map((color, i) => ({ face: 'URFDLB'[Math.floor(i/9)], index: i%9, color, confidence: i === 0 ? .2 : .9, needs_review: i === 0 }))
  let validations = 0
  let finishValidation!: (r: Response) => void
  const request = vi.fn().mockImplementation((path: string) => {
    let body: unknown
    if (path === '/api/vision/guide') body = { orientations }
    else if (path === '/api/vision/sample') body = { samples: Array.from({ length: 9 }, () => ({ lab: [100,100,100], quality: .9 })), quality: .9, version: 'test' }
    else if (path === '/api/vision/assemble') body = { facelets: cube.solved.facelets, observations, calibration: { U: [100,100,100] }, minimum_confidence: .2, confidence_kind: 'Synthetic heuristic test fixture' }
    else { validations++; if (validations === 1) return new Promise<Response>(resolve => { finishValidation = resolve }); body = { verified: true, snapshot: cube.solved } }
    return Promise.resolve(new Response(JSON.stringify(body)))
  })
  vi.stubGlobal('fetch', request)
  const user = userEvent.setup()
  render(<MemoryRouter initialEntries={['/scan']}><Routes><Route path="/scan" element={<GuidedScan />} /><Route path="/cube-explorer" element={<p>Explorer received scan</p>} /></Routes></MemoryRouter>)
  for (const face of 'URFDLB') { const button = await screen.findByRole('button', { name: new RegExp(`^Capture ${face}$`) }); await waitFor(() => expect(button).toBeEnabled()); await user.click(button) }
  await user.click(await screen.findByRole('button', { name: 'Calibrate colors and review' }))
  expect(await screen.findByRole('heading', { name: 'Review every sticker' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Validate physical cube state' })).toBeDisabled()
  await user.click(screen.getByLabelText(/I checked all six/))
  await user.selectOptions(screen.getByLabelText('U sticker 1'), 'R')
  expect(screen.getByRole('button', { name: 'Validate physical cube state' })).toBeDisabled()
  await user.selectOptions(screen.getByLabelText('U sticker 1'), 'U')
  await user.click(screen.getByLabelText(/I checked all six/))
  await user.click(screen.getByRole('button', { name: 'Validate physical cube state' }))
  expect(screen.getByLabelText(/I checked all six/)).toBeDisabled()
  finishValidation(new Response(JSON.stringify({ detail: { message: 'Edge flips inconsistent. Review sticker colors and recapture.' } }), { status: 422 }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Edge flips inconsistent')
  expect(screen.queryByRole('button', { name: 'Load scanned state in Cube Explorer' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Validate physical cube state' }))
  await user.click(await screen.findByRole('button', { name: 'Load scanned state in Cube Explorer' }))
  expect(await screen.findByText('Explorer received scan')).toBeVisible()
  const stored = JSON.parse(sessionStorage.getItem(scanKey)!)
  expect(stored.snapshot.state_hash).toBe(cube.solved.state_hash)
  expect(stored.observations[0].confidence).toBe(.2)
  expect(stored.corrected).toEqual([0])
  expect(request.mock.calls.filter(c => c[0] === '/api/vision/sample')).toHaveLength(6)
  sessionStorage.clear()
})
it('keeps invalid scan states out of Explorer and shows actionable errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Backend offline; start local API')))
  render(<MemoryRouter><GuidedScan /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Backend offline')
  expect(screen.queryByRole('button', { name: 'Load scanned state in Cube Explorer' })).not.toBeInTheDocument()
})
it('aborts in-flight observations on exit and ignores late scan responses', async () => {
  sessionStorage.clear()
  let resolve!: (r: Response) => void
  const request = vi.fn().mockImplementation((path: string) => path === '/api/vision/guide' ? Promise.resolve(new Response(JSON.stringify({ orientations: { U: { top: 'B', right: 'R' } } }))) : new Promise<Response>(r => { resolve = r }))
  vi.stubGlobal('fetch', request)
  const user = userEvent.setup(), view = render(<MemoryRouter><GuidedScan /></MemoryRouter>)
  const button = await screen.findByRole('button', { name: /^Capture U$/ })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
  const capture = request.mock.calls.find(c => c[0] === '/api/vision/sample')!
  view.unmount()
  expect(capture[1].signal.aborted).toBe(true)
  resolve(new Response(JSON.stringify({ quality: 1, samples: [] })))
  await Promise.resolve()
  expect(sessionStorage.getItem(scanKey)).toBeNull()
  expect(request.mock.calls.some(c => c[0] === '/api/vision/assemble')).toBe(false)
})
