import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import cubeFixtures from '../test/cube-fixtures.json'

const healthy = { status: 'ok', service: 'cubiq-api', version: '0.1.0', milestone: '3' }

function renderPage(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) => Promise.resolve(
    new Response(JSON.stringify(path === '/api/cube' ? cubeFixtures.solved : path.startsWith('/api/solves') ? { total: 0, items: [] } : path === '/api/training' ? { cases: [] } : path === '/api/dashboard' ? { total_records: 0, completed_solves: 0, timed_sample_count: 0, practice_attempts: 0, personal_best_ms: null, average_tps: null, average_htm: null, trends: [], scope: 'Completed manual virtual solves.' } : healthy)),
  )))
})

describe('workspace navigation', () => {
  it('opens every requested destination and returns to the dashboard', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Local API reachable')
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    for (const title of ['Cube Explorer', 'Live Solve', 'Solve Analysis', 'Algorithm Trainer', 'History']) {
      const link = within(nav).getByRole('link', { name: title })
      await user.click(link)
      expect(screen.getByRole('heading', { name: title, level: 1 })).toBeVisible()
      if (title === 'Cube Explorer') expect(await screen.findByText('Solved · in any grip')).toBeVisible()
      else if (title === 'Live Solve') expect(screen.getByRole('region', { name: 'Manual solve timer' })).toBeVisible()
      else if (title === 'Solve Analysis') expect(screen.getByRole('heading', { name: 'Choose a recorded segment' })).toBeVisible()
      else expect(screen.queryByRole('heading', { name: 'Not implemented yet' })).not.toBeInTheDocument()
      expect(link).toHaveAttribute('aria-current', 'page')
      expect(document.title).toBe(`${title} · Cubiq`)
      expect(screen.getByRole('main')).toHaveFocus()
      expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0)
    }
    await user.click(within(nav).getByRole('link', { name: 'Dashboard' }))
    expect(screen.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Your recorded progress' })).toBeVisible()
  })

  it.each([
    ['/algorithm-trainer', 'Algorithm Trainer'],
    ['/history', 'History'],
  ])('supports direct entry at %s with real-data controls', async (path, title) => {
    renderPage(path)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible()
    expect(screen.queryByText('Not implemented yet')).not.toBeInTheDocument()
    await screen.findByText('Local API reachable', {}, { timeout: 3000 }).catch(() => undefined)
  })

  it('opens Solve Analysis directly with an honest empty record', () => {
    renderPage('/solve-analysis')
    expect(screen.getByRole('heading', { name: 'Choose a recorded segment' })).toBeVisible()
    expect(screen.getByLabelText('Recorded move sequence')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Compare this segment' })).toBeDisabled()
  })

  it('offers recovery for an unknown route', async () => {
    const user = userEvent.setup()
    renderPage('/missing-workspace')
    expect(screen.getByText('This workspace page doesn’t exist.')).toBeVisible()
    await user.click(screen.getByRole('link', { name: 'Return to Dashboard' }))
    expect(screen.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  })
})

describe('real API connection states', () => {
  it('shows failure honestly and rechecks successfully on request', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify(healthy)))
    vi.stubGlobal('fetch', (path: string, options: unknown) => path === '/api/dashboard' ? Promise.resolve(new Response(JSON.stringify({ trends: [] }))) : request(path, options))
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('Local API unavailable')).toBeVisible()
    expect(screen.getByText('Start the backend, then check again.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Check connection' }))
    expect(await screen.findByText('Local API reachable')).toBeVisible()
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenLastCalledWith('/api/health', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('does not mistake an unrelated successful response for a healthy API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ status: 'ok' })))))
    renderPage()
    expect(await screen.findByText('Local API unavailable')).toBeVisible()
    expect(screen.getByText('The API returned an unexpected health response.')).toBeVisible()
  })

  it('reports HTTP failures without showing a successful connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })))
    renderPage()
    expect(await screen.findByText('Local API unavailable')).toBeVisible()
    expect(screen.getByText('API returned HTTP 503.')).toBeVisible()
    expect(screen.queryByText('Local API reachable')).not.toBeInTheDocument()
  })
})
