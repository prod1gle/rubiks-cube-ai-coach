import { useEffect, useState } from 'react'
import { fetchHealth } from './health'
import type { HealthResponse } from './health'

export type ConnectionState =
  | { status: 'checking' }
  | { status: 'connected'; data: HealthResponse; checkedAt: Date }
  | { status: 'unavailable'; message: string }

export function useHealth() {
  const [connection, setConnection] = useState<ConnectionState>({ status: 'checking' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 4000)
    void fetchHealth(controller.signal)
      .then((data) => {
        if (active) setConnection({ status: 'connected', data, checkedAt: new Date() })
      })
      .catch((error: unknown) => {
        if (active) setConnection({
          status: 'unavailable',
          message: controller.signal.aborted ? 'The connection check timed out.' :
            error instanceof Error ? error.message : 'Unable to reach the local API.',
        })
      })
      .finally(() => window.clearTimeout(timeout))
    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [attempt])

  function retry() {
    setConnection({ status: 'checking' })
    setAttempt((value) => value + 1)
  }

  return { connection, retry }
}
