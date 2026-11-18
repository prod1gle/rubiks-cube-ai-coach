// Synthetic engine states test exact comparison handoff, not physical performance.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import fixture from '../../test/camera-session.json'
import { CameraReport } from './CameraReport'
import { CameraHistory } from './CameraHistory'
vi.mock('../cube/CubeViewport', () => ({ default: ({ snapshot }: { snapshot: { state_hash: string } }) => <output>{snapshot.state_hash}</output> }))
it('withholds physical timing and hands off the exact contiguous segment', async () => {
  const report = { id: fixture.start.id, version: 'TEST', initial: fixture.start.snapshot, final: fixture.confirmed.snapshot, confirmed_htm: 1, gap_count: 1, segments: [{ initial: fixture.start.snapshot, notation: 'R', final_hash: fixture.confirmed.snapshot.state_hash, actions: 1, metrics: { htm: 1, rotations: 0 }, stages: [] }], checkpoints: [], physical_tps: null, notes: ['Controlled test; physical timing unavailable.'], processing_ms: [] }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(report))))
  const onReview = vi.fn(), user = userEvent.setup()
  render(<CameraReport id={report.id} onReview={onReview} />)
  expect(await screen.findByText('Unavailable')).toBeVisible()
  await user.click(screen.getByRole('button', { name: /What Could I Have Done Instead/ }))
  expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ facelets: fixture.start.snapshot.facelets, sequence: 'R', expected_end_hash: fixture.confirmed.snapshot.state_hash, start: 0, end: 1 }))
})
it('lists camera evidence separately from manual solve performance', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: fixture.start.id, created_at: '2026-11-18T12:00:00Z', revision: 3, needs_sync: true, stopped: false }] }))))
  render(<MemoryRouter><CameraHistory /></MemoryRouter>)
  expect(await screen.findByRole('link')).toHaveAttribute('href', `/solve-analysis?camera=${fixture.start.id}`)
  expect(screen.getByText(/Recovery required/)).toBeVisible()
  expect(screen.getByText(/excluded from manual performance averages/)).toBeVisible()
})
