// Prepared lesson snapshots come from coach.beginner.service, never UI cube math.
import { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import type { CubeSnapshot } from '../../api/cube'
import type { ActiveTurn } from '../cube/CubeController'
import fixtures from '../../test/beginner-lessons.json'
import { BeginnerAcademy } from './BeginnerAcademy'
import { loadLesson, verifyLesson } from './api'
import type { BeginnerLesson } from './api'

vi.mock('../cube/CubeViewport', () => ({ default: function TestViewport({ snapshot, active, onFinish }: { snapshot: CubeSnapshot; active?: ActiveTurn; onFinish: (id: string) => void }) {
  useEffect(() => { if (active) onFinish(active.id) }, [active, onFinish])
  return <output data-testid="lesson-cube">{snapshot.state_hash}</output>
} }))
afterEach(() => localStorage.clear())
const response = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status })
const initial = fixtures.foundations as unknown as BeginnerLesson
const final = fixtures.alignment as unknown as BeginnerLesson

function transport() {
  const request = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.startsWith('/api/beginner/lessons/')) {
      const id = url.split('/').at(-1) as keyof typeof fixtures
      return response(fixtures[id])
    }
    if (url === '/api/cube/plan') {
      const input = JSON.parse(options!.body as string)
      return response(input.sequence === 'U' ? final.plan : initial.plan)
    }
    if (url === '/api/beginner/check') {
      const input = JSON.parse(options!.body as string)
      const item = input.lesson_id === 'alignment' ? final : initial
      return response({ lesson_id: item.id, input_hash: item.start.state_hash, end_hash: input.expected_hash, verified: true, success: true, objective_met: true, protected_preserved: true, moves: item.plan.sequence.htm })
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', request)
  return request
}

it('loads nine lessons and keeps the current lesson when selected again', async () => {
  const request = transport(); const user = userEvent.setup()
  render(<MemoryRouter><BeginnerAcademy /></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: 'Meet your cube', level: 2 })).toBeVisible()
  expect(screen.getByRole('navigation', { name: 'Beginner lessons' }).querySelectorAll('button')).toHaveLength(9)
  await user.click(screen.getByRole('button', { name: /Meet your cube/ }))
  expect(screen.getByRole('heading', { name: 'Meet your cube', level: 2 })).toBeVisible()
  expect(request).toHaveBeenCalledTimes(1)
})

it('keeps example watching separate from verified personal practice and progress', async () => {
  const request = transport(); const user = userEvent.setup()
  render(<MemoryRouter><BeginnerAcademy /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Meet your cube', level: 2 })
  await user.click(screen.getByRole('button', { name: 'Watch example' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Watch example' })).toBeEnabled())
  expect(screen.getByRole('button', { name: 'Check my objective' })).toBeDisabled()
  expect(localStorage.getItem('cubecue.beginner-v1.completed')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Reset for my practice' }))
  await waitFor(() => expect(screen.getByLabelText('Or enter your own moves')).toBeEnabled())
  await user.type(screen.getByLabelText('Or enter your own moves'), "R R'")
  await user.click(screen.getByRole('button', { name: 'Apply my moves' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check my objective' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Check my objective' }))
  expect(await screen.findByText(/Objective verified. Your own attempt passed/)).toBeVisible()
  expect(JSON.parse(localStorage.getItem('cubecue.beginner-v1.completed')!)).toEqual(['foundations'])
  const check = request.mock.calls.find(([url]) => url === '/api/beginner/check')!
  expect(JSON.parse(check[1]!.body as string)).toEqual({ lesson_id: 'foundations', attempt: "R R'", expected_hash: initial.end.state_hash })
  await user.click(screen.getByRole('button', { name: 'Continue to next lesson' }))
  expect(await screen.findByRole('heading', { name: 'Build the white cross', level: 2 })).toBeVisible()
}, 15_000)

it('shows the solved milestone only after a checked final attempt', async () => {
  transport(); const user = userEvent.setup()
  render(<MemoryRouter><BeginnerAcademy /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Meet your cube', level: 2 })
  await user.click(screen.getByRole('button', { name: /Make the final turn/ }))
  await screen.findByRole('heading', { name: 'Make the final turn', level: 2 })
  expect(screen.queryByText(/Solved cube verified/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Apply U' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Check my objective' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Check my objective' }))
  expect(await screen.findByText(/Solved cube verified. Your own attempt passed/)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Continue to next lesson' })).not.toBeInTheDocument()
}, 15_000)

it('retries a failed lesson request without inventing progress', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Engine offline')).mockResolvedValueOnce(response(initial)))
  const user = userEvent.setup(); render(<MemoryRouter><BeginnerAcademy /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Engine offline')
  await user.click(screen.getByRole('button', { name: 'Retry lesson' }))
  expect(await screen.findByRole('heading', { name: 'Meet your cube', level: 2 })).toBeVisible()
  expect(localStorage.getItem('cubecue.beginner-v1.completed')).toBeNull()
})

it('rejects disconnected lesson plans and stale practice replies', async () => {
  const bad = structuredClone(initial); bad.plan.steps[0].before_hash = 'stale'
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(bad)).mockResolvedValueOnce(response({ lesson_id: initial.id, input_hash: initial.start.state_hash, end_hash: 'stale', verified: true, success: true, objective_met: true, protected_preserved: true, moves: 2 })))
  await expect(loadLesson(initial.id, new AbortController().signal)).rejects.toThrow('discontinuous')
  await expect(verifyLesson(initial, "R R'", initial.end.state_hash, new AbortController().signal)).rejects.toThrow('stale or inconsistent')
})
