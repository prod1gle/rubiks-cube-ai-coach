import { useCallback, useEffect, useRef, useState } from 'react'

export function cameraSupport() {
  if (!window.isSecureContext) return 'Camera access needs HTTPS or localhost. Open http://127.0.0.1:5173 in a current browser.'
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser does not provide webcam capture. Try current Chrome, Edge, Firefox or Safari on localhost.'
  return ''
}
export function cameraError(error: unknown) {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission denied. Allow camera access in this site’s browser settings, then retry.'
  if (name === 'NotFoundError') return 'No camera found. Connect a webcam and retry.'
  if (name === 'NotReadableError') return 'The camera is busy or unavailable. Close other camera apps and retry.'
  return error instanceof Error ? error.message : 'Camera capture failed. Check browser permissions and retry.'
}
/** The user starts capture explicitly. Streams and late grants close on exit. */
export function useCamera() {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | undefined>(undefined), generation = useRef(0)
  const [status, setStatus] = useState('Checking browser support…'), [error, setError] = useState(''), [running, setRunning] = useState(false), [opening, setOpening] = useState(false)
  const stop = useCallback(() => { generation.current++; stream.current?.getTracks().forEach(track => track.stop()); stream.current = undefined; if (video.current) video.current.srcObject = null; setRunning(false); setOpening(false); setStatus('Camera stopped.') }, [])
  useEffect(() => {
    let live = true
    const permissionGeneration = generation.current
    const unsupported = cameraSupport()
    const check = async () => {
      if (unsupported) return unsupported
      try { const permission = await navigator.permissions.query({ name: 'camera' as PermissionName }); return `Browser supports capture · camera permission: ${permission.state}.` } catch { return 'Browser supports capture. Permission will be requested when you start.' }
    }
    void check().then(v => { if (live && generation.current === permissionGeneration) setStatus(v) })
    const cleanup = () => { generation.current++; stream.current?.getTracks().forEach(track => track.stop()) }
    const hidden = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', hidden)
    return () => { live = false; cleanup(); document.removeEventListener('visibilitychange', hidden) }
  }, [stop])
  const start = async () => {
    stop(); const id = generation.current; setError('')
    const unsupported = cameraSupport()
    if (unsupported) { setError(unsupported); return }
    setOpening(true); setStatus('Waiting for camera permission…')
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: 'environment' } }, audio: false })
      if (id !== generation.current) { next.getTracks().forEach(track => track.stop()); return }
      stream.current = next
      next.getVideoTracks().forEach(track => track.addEventListener('ended', () => { if (stream.current === next) { stop(); setError('Camera disconnected. Reconnect and start again; recapture any affected face.') } }, { once: true }))
      if (!video.current) throw new Error('Camera preview unavailable. Retry capture.')
      video.current.srcObject = next; await video.current.play()
      if (id !== generation.current) return
      setRunning(true); setStatus('Camera active · unmirrored square crop · audio disabled.')
    } catch (e) { if (id === generation.current) { stop(); setError(cameraError(e)) } }
    finally { if (id === generation.current) setOpening(false) }
  }
  const capture = () => {
    const source = video.current
    if (!source || !running || source.readyState < 2 || !source.videoWidth) throw new Error('Wait for a live, sharp camera preview before capturing.')
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 640
    const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas capture unavailable in this browser.')
    const side = Math.min(source.videoWidth, source.videoHeight)
    const at_ms = performance.now()
    context.drawImage(source, (source.videoWidth - side) / 2, (source.videoHeight - side) / 2, side, side, 0, 0, 640, 640)
    return { image: canvas.toDataURL('image/jpeg', .9), at_ms }
  }
  return { video, status, error, running, opening, start, stop, capture }
}
