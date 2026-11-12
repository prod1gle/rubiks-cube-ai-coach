import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Group, MeshStandardMaterial, PCFShadowMap, Quaternion, Shape, ShapeGeometry, Spherical, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { CubieView, CubeSnapshot } from '../../api/cube'
import type { ActiveTurn } from './CubeController'

export interface CameraCommand { id: number; type: 'in' | 'out' | 'reset' | 'left' | 'right' | 'up' | 'down' }
const cameraKeys: Record<string, CameraCommand['type']> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'in', '=': 'in', '-': 'out' }
interface Props {
  snapshot: CubeSnapshot; active?: ActiveTurn; duration: number
  cameraCommand: CameraCommand; onFinish: (id: string) => void; onFailure: () => void
}

function OrbitRig({ command, onFailure }: { command: CameraCommand; onFailure: () => void }) {
  const { camera, gl } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  const moveCamera = useCallback((type: CameraCommand['type']) => {
    if (type === 'reset') {
      camera.position.set(5, 3.8, 6.2)
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

function stickerShape() {
  const shape = new Shape(), h = 0.412, r = 0.065
  shape.moveTo(-h + r, -h); shape.lineTo(h - r, -h)
  shape.quadraticCurveTo(h, -h, h, -h + r); shape.lineTo(h, h - r)
  shape.quadraticCurveTo(h, h, h - r, h); shape.lineTo(-h + r, h)
  shape.quadraticCurveTo(-h, h, -h, h - r); shape.lineTo(-h, -h + r)
  shape.quadraticCurveTo(-h, -h, -h + r, -h)
  return shape
}

function Cubie({ cubie, materials, body, sticker }: { cubie: CubieView; materials: Record<string, MeshStandardMaterial>; body: RoundedBoxGeometry; sticker: ShapeGeometry }) {
  return <group position={cubie.position} dispose={null}>
    <mesh geometry={body} material={materials.body} castShadow receiveShadow />
    {cubie.stickers.map(({ normal, color }, index) => <mesh key={index} geometry={sticker}
      position={[normal[0] * 0.483, normal[1] * 0.483, normal[2] * 0.483]}
      quaternion={new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...normal))}
      material={materials[color]} castShadow receiveShadow />)}
  </group>
}

function Puzzle({ snapshot, active, duration, onFinish }: Pick<Props, 'snapshot' | 'active' | 'duration' | 'onFinish'>) {
  const pivot = useRef<Group>(null)
  const clock = useRef({ id: '', elapsed: 0, duration: 0, done: false })
  const body = useMemo(() => new RoundedBoxGeometry(0.955, 0.955, 0.955, 3, 0.065), [])
  const sticker = useMemo(() => new ShapeGeometry(stickerShape(), 8), [])
  const materials = useMemo(() => ({
    body: new MeshStandardMaterial({ color: '#121813', roughness: 0.3, metalness: 0.1 }),
    ...Object.fromEntries(Object.entries(snapshot.palette).map(([color, hex]) => [color, new MeshStandardMaterial({ color: hex, roughness: 0.38, metalness: 0.015 })])),
  }), [snapshot.palette])
  useEffect(() => () => { body.dispose(); sticker.dispose() }, [body, sticker])
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
  const cubie = (item: CubieView) => <Cubie key={item.id} cubie={item} materials={materials} body={body} sticker={sticker} />
  return <group>
    {snapshot.cubies.filter(item => !affected.has(item.id)).map(cubie)}
    <group key={active?.id ?? snapshot.state_hash} ref={pivot} dispose={null}>
      {snapshot.cubies.filter(item => affected.has(item.id)).map(cubie)}
    </group>
  </group>
}

export default function CubeScene(props: Props) {
  return <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 2]} camera={{ position: [5, 3.8, 6.2], fov: 40 }} gl={{ antialias: true, alpha: true }}
    aria-label="Interactive 3D Rubik's Cube. Drag to orbit; scroll or pinch to zoom.">
    <ambientLight intensity={0.75} />
    <hemisphereLight args={['#f8ffe8', '#29372a', 1.8]} />
    <directionalLight position={[-4, 8, 5]} intensity={3.2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.001} />
    <directionalLight position={[5, 2, -4]} color="#bfd3e8" intensity={1.7} />
    <Puzzle {...props} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.35, 0]} receiveShadow><circleGeometry args={[7, 64]} /><shadowMaterial opacity={0.22} /></mesh>
    <OrbitRig command={props.cameraCommand} onFailure={props.onFailure} />
  </Canvas>
}
