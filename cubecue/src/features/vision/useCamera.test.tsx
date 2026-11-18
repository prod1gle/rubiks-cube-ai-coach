import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { cameraError, cameraSupport, useCamera } from './useCamera'
function CameraTest() { const { video, status, error, start, stop } = useCamera(); return <><video ref={video} /><p>{status}</p><p role="alert">{error}</p><button onClick={() => void start()}>Start</button><button onClick={stop}>Stop</button></> }
it('checks secure context and missing browser capture without requesting permission', () => {
  vi.stubGlobal('isSecureContext', false)
  expect(cameraSupport()).toMatch('HTTPS or localhost')
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('navigator', {})
  expect(cameraSupport()).toMatch('does not provide webcam')
})
it.each([['NotAllowedError', 'permission denied'], ['NotFoundError', 'No camera found'], ['NotReadableError', 'busy or unavailable']])('explains %s honestly', (name, text) => { expect(cameraError(new DOMException('', name))).toContain(text) })
it('does not open automatically and stops a late permission grant after unmount', async () => {
  vi.stubGlobal('isSecureContext', true)
  let resolve!: (v: MediaStream) => void
  const getUserMedia = vi.fn(() => new Promise<MediaStream>(r => { resolve = r }))
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  const stop = vi.fn(), user = userEvent.setup()
  const view = render(<CameraTest />)
  await screen.findByText(/Browser supports capture/)
  expect(getUserMedia).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Start' }))
  expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }))
  view.unmount()
  resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream)
  await waitFor(() => expect(stop).toHaveBeenCalledTimes(1))
})
