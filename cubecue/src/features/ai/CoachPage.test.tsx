import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { CoachPage } from './CoachPage'
import type { CoachContext, CoachReply } from '../../api/ai'

const solveId = '00000000-0000-4000-8000-000000000001'
const context: CoachContext = {
  schema_version: 1, configured: false, provider: null, model: null,
  disclosure: 'No raw moves, cube states, or full history are sent.', recent_limit: 20, solves: [],
}
function reply(input: { goal: CoachReply['goal']; solve_id: string | null }, status: CoachReply['provider_status'] = 'not_requested'): CoachReply {
  return {
    schema_version: 1, version: 'grounded-coach-1', mode: status === 'used' ? 'ai' : 'engine',
    provider_status: status, model: status === 'used' ? 'local-test' : null, ...input,
    disclosure: context.disclosure,
    facts: [{ id: 'baseline', text: 'No solve performance has been inferred.', source_href: null }],
    recommendations: [{ template_id: 'collect', fact_id: 'baseline', title: 'Build your baseline',
      action: 'Record a complete virtual solve.', link_label: 'Record a solve', href: '/live-solve?mode=virtual' }],
    limitations: ['Virtual manual inputs only.'],
  }
}
function setup(value: CoachContext = context, status: CoachReply['provider_status'] = 'not_requested') {
  const fetch = vi.fn().mockImplementation((path: string, options: RequestInit) => Promise.resolve(new Response(JSON.stringify(
    path === '/api/ai/context' ? value : reply(JSON.parse(String(options.body)), status)
  ))))
  vi.stubGlobal('fetch', fetch)
  render(<MemoryRouter><CoachPage /></MemoryRouter>)
  return fetch
}
it('starts with honest empty history and generates engine advice without model opt-in', async () => {
  const fetch = setup(), user = userEvent.setup()
  await screen.findByText(/No saved virtual solves yet/)
  expect(screen.getByText('Not configured')).toBeVisible()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'Build my practice plan' }))
  expect(await screen.findByText('Verified engine coaching')).toBeVisible()
  expect(screen.getByText('No solve performance has been inferred.', { selector: 'span' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Record a solve' })).toHaveAttribute('href', '/live-solve?mode=virtual')
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ solve_id: null, goal: 'balanced', use_model: false })
})
it('selects a real record and goal, clearing stale advice after a choice changes', async () => {
  const fetch = setup({ ...context, solves: [{ id: solveId, created_at: '2026-11-19T12:00:00Z', status: 'complete', source: 'manual' }] })
  const user = userEvent.setup()
  await screen.findByRole('combobox')
  expect(screen.getByRole('combobox')).toHaveValue(solveId)
  await user.click(screen.getByRole('radio', { name: /Use fewer moves/ }))
  await user.click(screen.getByRole('button', { name: 'Build my practice plan' }))
  await screen.findByText('Verified engine coaching')
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ solve_id: solveId, goal: 'efficiency', use_model: false })
  await user.selectOptions(screen.getByRole('combobox'), '')
  expect(screen.queryByText('Verified engine coaching')).not.toBeInTheDocument()
})
it.each(['used', 'unavailable', 'timeout', 'rejected', 'busy'] as const)('requires per-request model opt-in and reports %s honestly', async status => {
  const fetch = setup({ ...context, configured: true, provider: 'ollama', model: 'local-test' }, status)
  const user = userEvent.setup()
  const consent = await screen.findByRole('checkbox', { name: 'Use local-test via Ollama for this request' })
  expect(consent).not.toBeChecked()
  expect(fetch).toHaveBeenCalledTimes(1)
  await user.click(screen.getByText('Exactly what is sent to AI'))
  expect(screen.getByText(context.disclosure)).toBeVisible()
  await user.click(consent)
  await user.click(screen.getByRole('button', { name: 'Build plan with AI' }))
  expect(await screen.findByText(status === 'used' ? 'AI selected · engine grounded' : 'Verified engine coaching')).toBeVisible()
  expect(JSON.parse(fetch.mock.calls[1][1].body).use_model).toBe(true)
  if (status !== 'used') expect(screen.getByRole('status')).toHaveTextContent(/Your plan uses verified engine coaching/)
})
it('retries context errors and displays failed coaching without accepting advice', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Records unavailable.' }), { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(context)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'That record no longer exists.' }), { status: 404 }))
  vi.stubGlobal('fetch', fetch)
  const user = userEvent.setup()
  render(<MemoryRouter><CoachPage /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Records unavailable.')
  await user.click(screen.getByRole('button', { name: 'Retry records' }))
  await user.click(await screen.findByRole('button', { name: 'Build my practice plan' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('That record no longer exists.')
  expect(screen.queryByText('Verified engine coaching')).not.toBeInTheDocument()
})
it('disables changes during an in-flight request and aborts it on unmount', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(context)))
    .mockImplementationOnce(() => new Promise(() => {}))
  vi.stubGlobal('fetch', fetch)
  const view = render(<MemoryRouter><CoachPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Build my practice plan' }))
  expect(screen.getByRole('button', { name: 'Building your practice plan…' })).toBeDisabled()
  expect(within(screen.getByRole('group', { name: 'Coaching goal' })).getAllByRole('radio').every(r => r.matches(':disabled'))).toBe(true)
  const signal = fetch.mock.calls[1][1].signal as AbortSignal
  view.unmount()
  expect(signal.aborted).toBe(true)
})
