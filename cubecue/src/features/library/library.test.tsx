import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { History } from './History'
import { Progress } from './Progress'
import { saveSolve, library } from '../../api/library'
import recording from '../../test/timed-recording.json'
import type { TimedRecording } from '../../api/cube'
const response = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status })
it('shows honest empty progress and unavailable timing', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ trends: [], total_records: 0, completed_solves: 0, timed_sample_count: 0, practice_attempts: 0, personal_best_ms: null, average_tps: null, average_htm: null, scope: 'Manual virtual input.' })))
  render(<MemoryRouter><Progress /></MemoryRouter>)
  expect(await screen.findByText(/No sample performance records/)).toBeVisible()
  expect(screen.getAllByText('—')).toHaveLength(3)
})
it('lists stored solves, links exact analysis and deletes only after confirmation', async () => {
  const request = vi.fn().mockResolvedValueOnce(response({ total: 1, items: [{ id: 'saved-id', created_at: '2026-11-16T12:00:00Z', source: 'manual-virtual', status: 'complete', summary: { htm: 23, elapsed_ms: null } }] })).mockResolvedValueOnce(response({ deleted: 'saved-id' })).mockResolvedValueOnce(response({ total: 0, items: [] }))
  vi.stubGlobal('fetch', (path: string, options: unknown) => path === '/api/tracking' ? Promise.resolve(response({ items: [] })) : request(path, options))
  const user = userEvent.setup(); render(<MemoryRouter><History /></MemoryRouter>)
  expect(await screen.findByText(/23 HTM/)).toHaveTextContent('Timing unavailable')
  expect(screen.getByRole('link', { name: /2026/ })).toHaveAttribute('href', '/solve-analysis?solve=saved-id')
  await user.click(screen.getByRole('button', { name: /^Delete$/ }))
  expect(request).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
  expect(await screen.findByText(/No saved solves yet/)).toBeVisible()
  expect(request.mock.calls[1][1].method).toBe('DELETE')
})
it('reports persistence failures without claiming success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(response({ detail: 'Disk unavailable' }, 503))))
  await expect(saveSolve(recording.recording as TimedRecording)).rejects.toThrow('Disk unavailable')
  await expect(library('/solves')).rejects.toThrow('Disk unavailable')
})
it('surfaces history errors with retry', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Backend offline')))
  render(<MemoryRouter><History /></MemoryRouter>)
  expect((await screen.findAllByRole('alert')).every(v => v.textContent?.includes('Backend offline'))).toBe(true)
  expect(screen.getByRole('button', { name: 'Retry history' })).toBeVisible()
})
