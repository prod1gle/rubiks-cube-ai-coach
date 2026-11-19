import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { BoxGeometry, EdgesGeometry, Group, LineBasicMaterial, DoubleSide, MeshBasicMaterial, PlaneGeometry, Quaternion, Spherical, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { CubieView, CubeSnapshot } from '../../api/cube'
import type { ActiveTurn } from './CubeController'

export interface CameraCommand { id: number; type: 'in' | 'out' | 'reset' | 'left' | 'right' | 'up' | 'down' }
const cameraKeys: Record<string, CameraCommand['type']> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'in', '=': 'in', '-': 'out' }
// Center the green front and white top without a sideways yaw.
const frontCameraPosition: [number, number, number] = [0, 7, 7]
interface Props {
  snapshot: CubeSnapshot; active?: ActiveTurn; duration: number
  cameraCommand: CameraCommand; onFinish: (id: string) => void; onFailure: () => void
  highlighted?: string[]
}

function OrbitRig({ command, onFailure }: { command: CameraCommand; onFailure: () => void }) {
  const { camera, gl } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  const moveCamera = useCallback((type: CameraCommand['type']) => {
    if (type === 'reset') {
      // Clear any remaining drag momentum before restoring the front view.
      if (controls.current) {
        controls.current.enableDamping = false
        controls.current.update()
        controls.current.enableDamping = true
      }
      camera.position.set(...frontCameraPosition)
      camera.up.set(0, 1, 0)
      camera.lookAt(0, 0, 0)
      controls.current?.target.set(0, 0, 0)
    } else if (type === 'in' || type === 'out') camera.position.setLength(Math.min(13, Math.max(5, camera.position.length() * (type === 'in' ? 0.85 : 1.15))))
    else {
      const spherical = new Spherical().setFromVector3(camera.position)
      if (type === 'left' || type === 'right') spherical.theta += type === 'left' ? -0.25 : 0.25
      else spherical.phi = Math.max(0.15, Math.min(Math.PI * 0.88, spherical.phi + (type === 'up' ? -0.2 : 0.2)))
      camera.position.setFromSpherical(spherical)
    }
    controls.current?.update()
  }, [camera])
  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.enableDamping = true; orbit.dampingFactor = 0.08
    orbit.enablePan = false; orbit.minDistance = 5; orbit.maxDistance = 13
    orbit.rotateSpeed = 0.65; orbit.maxPolarAngle = Math.PI * 0.88
    controls.current = orbit
    gl.domElement.setAttribute('tabindex', '0')
    gl.domElement.setAttribute('aria-label', '3D cube. Arrow keys orbit the camera; plus and minus zoom. Camera movement does not turn faces.')
    const key = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const action = cameraKeys[event.key]
      if (action) { event.preventDefault(); moveCamera(action) }
    }
    gl.domElement.addEventListener('keydown', key)
    const lost = (event: Event) => { event.preventDefault(); onFailure() }
    gl.domElement.addEventListener('webglcontextlost', lost)
    return () => { orbit.dispose(); controls.current = null; gl.domElement.removeEventListener('webglcontextlost', lost); gl.domElement.removeEventListener('keydown', key) }
  }, [camera, gl, onFailure, moveCamera])
  useEffect(() => {
    moveCamera(command.type)
  }, [command, moveCamera])
  useFrame(() => controls.current?.update())
  return null
}

function Cubie({ cubie, materials, sticker, border, borderMaterial, outline, outlineMaterial, highlighted }: { cubie: CubieView; materials: Record<string, MeshBasicMaterial>; sticker: PlaneGeometry; border: EdgesGeometry; borderMaterial: LineBasicMaterial; outline: EdgesGeometry; outlineMaterial: LineBasicMaterial; highlighted: boolean }) {
  return <group position={cubie.position} dispose={null}>
    {highlighted && <lineSegments geometry={outline} material={outlineMaterial} renderOrder={2} />}
    {cubie.stickers.map(({ normal, color }, index) => <group key={index}
      position={[normal[0] * 0.5, normal[1] * 0.5, normal[2] * 0.5]}
      quaternion={new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...normal))}>
      <mesh geometry={sticker} material={materials[color]} />
      <lineSegments geometry={border} material={borderMaterial} />
    </group>)}
  </group>
}

function Puzzle({ snapshot, active, duration, onFinish, highlighted }: Pick<Props, 'snapshot' | 'active' | 'duration' | 'onFinish' | 'highlighted'>) {
  const pivot = useRef<Group>(null)
  const clock = useRef({ id: '', elapsed: 0, duration: 0, done: false })
  const sticker = useMemo(() => new PlaneGeometry(0.9, 0.9), [])
  const border = useMemo(() => new EdgesGeometry(sticker), [sticker])
  const borderMaterial = useMemo(() => new LineBasicMaterial({ color: '#000000', toneMapped: false }), [])
  const outline = useMemo(() => { const box = new BoxGeometry(1.025, 1.025, 1.025); const edges = new EdgesGeometry(box); box.dispose(); return edges }, [])
  const outlineMaterial = useMemo(() => new LineBasicMaterial({ color: '#ffb77f', depthTest: false, transparent: true, opacity: 0.9 }), [])
  const targets = useMemo(() => new Set(highlighted ?? []), [highlighted])
  // Flat, two-sided stickers reproduce the reference's open gaps: the far
  // stickers visible through them are still the engine's actual facelets.
  const materials = useMemo(() => Object.fromEntries(Object.entries(snapshot.palette).map(([color, hex]) => [color, new MeshBasicMaterial({ color: hex, side: DoubleSide, toneMapped: false })])), [snapshot.palette])
  useEffect(() => () => { sticker.dispose(); border.dispose(); borderMaterial.dispose() }, [sticker, border, borderMaterial])
  useEffect(() => () => { outline.dispose(); outlineMaterial.dispose() }, [outline, outlineMaterial])
  useEffect(() => () => Object.values(materials).forEach(material => material.dispose()), [materials])
  const affected = useMemo(() => new Set(active?.animation.affected ?? []), [active])
  const axis = useMemo(() => new Vector3(...(active?.animation.axis ?? [1, 0, 0])), [active])
  useFrame((_state, delta) => {
    if (!active || !pivot.current) return
    if (clock.current.id !== active.id) clock.current = { id: active.id, elapsed: 0, duration: duration * (Math.abs(active.animation.quarter_turns) === 2 ? 1.35 : 1), done: false }
    if (clock.current.done) return
    clock.current.elapsed += delta
    const progress = Math.min(1, clock.current.elapsed / Math.max(0.01, clock.current.duration))
    const eased = progress * progress * (3 - 2 * progress)
    pivot.current.quaternion.setFromAxisAngle(axis, active.animation.quarter_turns * Math.PI / 2 * eased)
    if (progress === 1) { clock.current.done = true; onFinish(active.id) }
  })
  const cubie = (item: CubieView) => <Cubie key={item.id} cubie={item} materials={materials} sticker={sticker} border={border} borderMaterial={borderMaterial} outline={outline} outlineMaterial={outlineMaterial} highlighted={targets.has(item.id)} />
  return <group>
    {snapshot.cubies.filter(item => !affected.has(item.id)).map(cubie)}
    <group key={active?.id ?? snapshot.state_hash} ref={pivot} dispose={null}>
      {snapshot.cubies.filter(item => affected.has(item.id)).map(cubie)}
    </group>
  </group>
}

export default function CubeScene(props: Props) {
  return <Canvas dpr={[1, 2]} camera={{ position: frontCameraPosition, fov: 35 }} gl={{ antialias: true, alpha: true }}
    aria-label="Interactive 3D Rubik's Cube. Drag to orbit; scroll or pinch to zoom.">
    <Puzzle {...props} />
    <OrbitRig command={props.cameraCommand} onFailure={props.onFailure} />
  </Canvas>
}
