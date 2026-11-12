import { useEffect, useState, useSyncExternalStore } from 'react'
import { CubeController } from './CubeController'

export function useCube() {
  const [controller] = useState(() => new CubeController())
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  useEffect(() => { controller.connect(); return controller.disconnect }, [controller])
  return { ...state, controller }
}
