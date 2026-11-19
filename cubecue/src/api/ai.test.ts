import { expect, it, vi } from 'vitest'
import { loadCoachContext, requestCoaching } from './ai'
import type { CoachContext, CoachReply } from './ai'

// Synthetic wire fixtures, never saved as user history.
const solveId = '00000000-0000-4000-8000-000000000001'
const context: CoachContext = {
  schema_version: 1, configured: false, provider: null, model: null,
  disclosure: 'Only verified facts are sent.', recent_limit: 20,
  solves: [{ id: solveId, created_at: '2026-11-19T12:00:00Z', status: 'complete', source: 'manual' }],
}
const reply: CoachReply = {
  schema_version: 1, version: 'grounded-coach-1', mode: 'engine', provider_status: 'not_requested',
  model: null, goal: 'balanced', solve_id: null, disclosure: context.disclosure,
  facts: [{ id: 'baseline', text: 'No solve is selected.', source_href: null }],
  recommendations: [{ template_id: 'collect', fact_id: 'baseline', title: 'Build your baseline',
    action: 'Record a virtual solve.', link_label: 'Record a solve', href: '/live-solve?mode=virtual' }],
  limitations: ['Virtual inputs only.'],
}
const input = { solve_id: null, goal: 'balanced' as const, use_model: false }
function respond(value: unknown) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(value)))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
it('uses only the local API and forwards cancellation and explicit opt-in', async () => {
  const fetch = respond(context), controller = new AbortController()
  expect(await loadCoachContext(controller.signal)).toEqual(context)
  expect(fetch).toHaveBeenCalledWith('/api/ai/context', expect.objectContaining({ method: 'GET', signal: controller.signal }))
  respond(reply)
  expect(await requestCoaching(input, controller.signal)).toEqual(reply)
  expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith('/api/ai/coach', expect.objectContaining({
    method: 'POST', signal: controller.signal, body: JSON.stringify(input),
  }))
})
it.each([
  { ...context, solves: [{ ...context.solves[0], created_at: 'invalid' }] },
  { ...context, solves: [{ ...context.solves[0], id: 'invented' }] },
  { ...context, provider: 'remote' },
  { ...context, recent_limit: 'unlimited' },
])('rejects malformed context %#', async value => {
  respond(value)
  await expect(loadCoachContext(new AbortController().signal)).rejects.toThrow('failed validation')
})
it.each([
  { ...reply, solve_id: solveId },
  { ...reply, goal: 'efficiency' },
  { ...reply, facts: [...reply.facts, ...reply.facts] },
  { ...reply, recommendations: [{ ...reply.recommendations[0], fact_id: 'invented' }] },
  { ...reply, recommendations: [{ ...reply.recommendations[0], href: 'https://example.com' }] },
  { ...reply, recommendations: [{ ...reply.recommendations[0], href: '//example.com' }] },
  { ...reply, recommendations: [{ ...reply.recommendations[0], href: '/algorithm-trainer?case=../secret' }] },
  { ...reply, recommendations: [] },
  { ...reply, mode: 'ai', provider_status: 'used', model: 'test' },
  { ...reply, mode: 'ai', provider_status: 'timeout', model: 'test' },
  { ...reply, mode: 'engine', provider_status: 'used' },
])('rejects mismatched claims or unsafe action links %#', async value => {
  respond(value)
  await expect(requestCoaching(input, new AbortController().signal)).rejects.toThrow('No advice was accepted')
})
it('accepts a validated AI selection only when explicitly requested', async () => {
  const result = { ...reply, mode: 'ai', provider_status: 'used', model: 'local-test' }
  respond(result)
  expect(await requestCoaching({ ...input, use_model: true }, new AbortController().signal)).toEqual(result)
})
