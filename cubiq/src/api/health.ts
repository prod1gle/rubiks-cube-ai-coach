export interface HealthResponse {
  status: 'ok'
  service: 'cubiq-api'
  version: string
  milestone: string
}

export async function fetchHealth(signal: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`API returned HTTP ${response.status}.`)
  const data: unknown = await response.json()
  if (
    typeof data !== 'object' || data === null ||
    !('status' in data) || data.status !== 'ok' ||
    !('service' in data) || data.service !== 'cubiq-api' ||
    !('version' in data) || typeof data.version !== 'string' ||
    !('milestone' in data) || typeof data.milestone !== 'string'
  ) throw new Error('The API returned an unexpected health response.')
  return data as HealthResponse
}
