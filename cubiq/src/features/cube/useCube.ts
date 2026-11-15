import { useEffect, useState, useSyncExternalStore } from 'react'
import { CubeController } from './CubeController'
import type { CubeSnapshot } from '../../api/cube'

export function useCube(initial?: CubeSnapshot) {
  const [controller] = useState(() => new CubeController(undefined, initial))
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  useEffect(() => { controller.connect(); return controller.disconnect }, [controller])
  return { ...state, controller }
}
