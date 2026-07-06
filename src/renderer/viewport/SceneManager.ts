/**
 * SceneManager — the imperative three.js world behind the Viewport.
 *
 * Owns: renderer, scene graph, lighting presets, entity objects, marks &
 * path visuals, the shot camera, playback (applying ShotEvaluator state),
 * selection/placement/mark-drop interactions, and the render hooks the
 * exporter reuses (renderFrameAt with clean/depth/normal passes).
 *
 * React (Viewport.tsx) is a thin shell around this class.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ShotEvaluator } from '@engine/evaluate'
import { GAITS } from '@engine/gaits'
import { frameSubject as frameSubjectMath, ASPECT_RATIOS } from '@engine/camera'
import { entityHeight } from '@engine/assets'
import { headingOf } from '@engine/path'
import type { Entity, LightingPresetId, Scene as DocScene, Shot } from '@engine/types'
import { useStore } from '../store'
import { on } from '../bus'
import { buildAsset, markMesh, labelSprite, type BuiltAsset } from './builders'

const RAD2DEG = 180 / Math.PI

interface EntityVisual {
  entity: Entity
  built: BuiltAsset
  root: THREE.Group
  label?: THREE.Sprite
  customLoaded?: boolean
}

export type RenderPass = 'clean' | 'depth' | 'normal'

export class SceneManager {
  readonly scene = new THREE.Scene()
  readonly renderer: THREE.WebGLRenderer
  private canvas: HTMLCanvasElement

  /** Free navigation camera. */
  private freeCam: THREE.PerspectiveCamera
  private controls: OrbitControls
  /** The shot camera — what gets exported. */
  readonly shotCam: THREE.PerspectiveCamera

  private transform: TransformControls
  private raycaster = new THREE.Raycaster()
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

  private visuals = new Map<string, EntityVisual>()
  private overlay = new THREE.Group() // marks, paths, camera body — hidden in exports
  private cameraBody: THREE.Group
  private selectionBox = new THREE.BoxHelper(new THREE.Object3D(), 0xf5a524)

  private sun: THREE.DirectionalLight
  private ambient: THREE.HemisphereLight
  private clubLights: THREE.PointLight[] = []

  private evaluator: ShotEvaluator | null = null
  private docScene: DocScene | null = null
  private shot: Shot | null = null

  private raf = 0
  private lastFrameAt = 0
  private disposed = false
  private unsubscribers: (() => void)[] = []

  /** Set by Viewport for overlay layout (letterbox rect in CSS px). */
  onViewRect?: (rect: { x: number; y: number; w: number; h: number } | null) => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene.background = new THREE.Color(0x1a1c20)

    this.freeCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 500)
    this.freeCam.position.set(9, 7, 9)
    this.shotCam = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 500)
    this.shotCam.rotation.order = 'YXZ'

    this.controls = new OrbitControls(this.freeCam, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02
    this.controls.target.set(0, 1, 0)

    // Ground: soft grid + shadow-catching plane
    const grid = new THREE.GridHelper(60, 60, 0x33343a, 0x27282d)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.6
    this.scene.add(grid)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.3 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    ground.name = '__ground'
    this.scene.add(ground)

    // Lights
    this.ambient = new THREE.HemisphereLight(0xbfd4e6, 0x3a3a40, 0.7)
    this.scene.add(this.ambient)
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.left = -25
    this.sun.shadow.camera.right = 25
    this.sun.shadow.camera.top = 25
    this.sun.shadow.camera.bottom = -25
    this.sun.shadow.camera.far = 100
    this.sun.shadow.bias = -0.0004
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
    for (let i = 0; i < 4; i++) {
      const colors = [0xe5484d, 0x3b82f6, 0x46a758, 0xd6409f]
      const light = new THREE.PointLight(colors[i]!, 0, 18)
      light.position.set(Math.cos((i / 4) * Math.PI * 2) * 4, 3.4, Math.sin((i / 4) * Math.PI * 2) * 4)
      this.clubLights.push(light)
      this.scene.add(light)
    }

    // Camera body visual (selectable, draggable in shoot mode)
    this.cameraBody = this.buildCameraBody()
    this.overlay.add(this.cameraBody)
    this.scene.add(this.overlay)

    this.selectionBox.visible = false
    this.scene.add(this.selectionBox)

    // Gizmo
    this.transform = new TransformControls(this.freeCam, canvas)
    this.transform.setTranslationSnap(0.05)
    this.transform.setRotationSnap(THREE.MathUtils.degToRad(15))
    this.transform.addEventListener('dragging-changed', (e) => {
      this.controls.enabled = !(e as unknown as { value: boolean }).value
      if (!(e as unknown as { value: boolean }).value) this.commitGizmo()
    })
    this.scene.add(this.transform.getHelper ? this.transform.getHelper() : (this.transform as unknown as THREE.Object3D))

    canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('keydown', this.onKeyDown)

    // Store subscriptions: rebuild world on doc/scene/shot change.
    this.unsubscribers.push(
      useStore.subscribe((state, prev) => {
        if (
          state.doc !== prev.doc ||
          state.sceneId !== prev.sceneId ||
          state.shotId !== prev.shotId
        ) {
          this.syncFromStore()
        }
        if (state.selection !== prev.selection || state.mode !== prev.mode) {
          this.syncSelection()
        }
      })
    )

    // Bus commands
    this.unsubscribers.push(on('frameSubject', ({ size }) => this.autoFrame(size)))
    this.unsubscribers.push(on('setLens', ({ focalLength }) => this.setLens(focalLength)))
    this.unsubscribers.push(on('dropCameraMarkAtView', () => this.dropCameraMarkAtView()))
    this.unsubscribers.push(
      on('focusSelection', () => {
        const target = this.selectedObject()
        if (target) {
          const p = new THREE.Vector3()
          target.getWorldPosition(p)
          this.controls.target.copy(p)
        }
      })
    )

    this.syncFromStore()
    this.lastFrameAt = performance.now()
    this.loop()
  }

  /* ------------------------------ lifecycle ----------------------------- */

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.unsubscribers.forEach((u) => u())
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('keydown', this.onKeyDown)
    this.controls.dispose()
    this.transform.dispose()
    this.renderer.dispose()
  }

  /* ------------------------------- helpers ------------------------------ */

  private buildCameraBody(): THREE.Group {
    const g = new THREE.Group()
    const mat = new THREE.MeshBasicMaterial({ color: 0xf5f5f7, wireframe: false })
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.4), mat)
    body.name = '__camera'
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.18, 12), mat)
    lens.rotation.x = Math.PI / 2
    lens.position.z = -0.28
    lens.name = '__camera'
    g.add(body, lens)
    // Frustum direction hint
    const coneGeo = new THREE.ConeGeometry(0.5, 1.2, 4, 1, true)
    const cone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({ color: 0xf5a524, wireframe: true, transparent: true, opacity: 0.35 })
    )
    cone.rotation.x = -Math.PI / 2
    cone.rotation.y = Math.PI / 4
    cone.position.z = -1.0
    g.add(cone)
    return g
  }

  private currentState() {
    return useStore.getState()
  }

  private syncFromStore(): void {
    const s = this.currentState()
    const docScene = s.scene()
    const shot = s.shot()
    this.docScene = docScene
    this.shot = shot
    this.evaluator = docScene && shot ? new ShotEvaluator(docScene, shot) : null

    // --- diff entities
    const wanted = new Map((docScene?.entities ?? []).map((e) => [e.id, e]))
    for (const [id, visual] of this.visuals) {
      if (!wanted.has(id)) {
        this.scene.remove(visual.root)
        this.visuals.delete(id)
      }
    }
    for (const entity of wanted.values()) {
      const existing = this.visuals.get(entity.id)
      if (!existing || existing.entity.assetId !== entity.assetId || existing.entity.params !== entity.params) {
        if (existing) this.scene.remove(existing.root)
        this.addEntityVisual(entity)
      } else {
        existing.entity = entity
        this.applyEntityBase(existing)
        this.syncLabel(existing)
      }
    }

    this.rebuildOverlay()
    this.applyEnvironment()
    this.applyTime(s.time)
    this.syncSelection()
  }

  private addEntityVisual(entity: Entity): void {
    const built = buildAsset(entity.assetId, entity.params)
    const root = new THREE.Group()
    root.add(built.group)
    root.userData.entityId = entity.id
    this.scene.add(root)
    const visual: EntityVisual = { entity, built, root }
    this.visuals.set(entity.id, visual)
    this.applyEntityBase(visual)
    this.syncLabel(visual)
    if (entity.assetId.startsWith('custom.') && entity.sourceFile) {
      void this.loadCustomModel(visual)
    }
  }

  private async loadCustomModel(visual: EntityVisual): Promise<void> {
    const folder = this.currentState().projectFolder
    const rel = visual.entity.sourceFile
    if (!folder || !rel) return
    try {
      const buf = await window.blockout.readProjectFile(folder, rel)
      const loader = new GLTFLoader()
      loader.parse(buf, '', (gltf) => {
        if (this.disposed || !this.visuals.has(visual.entity.id)) return
        visual.root.remove(visual.built.group)
        gltf.scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true
            o.receiveShadow = true
          }
        })
        visual.root.add(gltf.scene)
        visual.customLoaded = true
      })
    } catch (e) {
      useStore.getState().toast(`Could not load model: ${String(e)}`, 'error')
    }
  }

  private applyEntityBase(visual: EntityVisual): void {
    const t = visual.entity.transform
    visual.root.position.set(t.position.x, t.position.y, t.position.z)
    visual.root.rotation.y = t.rotationY
    visual.root.scale.setScalar(t.scale)
    visual.built.setTint(visual.entity.label?.color ?? null)
  }

  private syncLabel(visual: EntityVisual): void {
    if (visual.label) {
      visual.root.remove(visual.label)
      visual.label = undefined
    }
    const label = visual.entity.label
    if (label && label.text) {
      const sprite = labelSprite(label.text, label.color)
      const h = entityHeight(visual.entity.assetId, 1, visual.entity.params)
      sprite.position.y = h + 0.35
      visual.root.add(sprite)
      visual.label = sprite
    }
  }

  /** Marks + paths + camera path visuals. */
  private markObjects: THREE.Object3D[] = []

  private rebuildOverlay(): void {
    for (const o of this.markObjects) this.overlay.remove(o)
    this.markObjects = []
    const scene = this.docScene
    const shot = this.shot
    if (!scene || !shot || !this.evaluator) return

    const take = scene.blocking.find((b) => b.id === shot.blockingTakeId)
    if (take) {
      for (const track of take.tracks) {
        const entity = scene.entities.find((e) => e.id === track.entityId)
        const color = entity?.label?.color ?? '#f5a524'
        const sorted = [...track.marks].sort((a, b) => a.time - b.time)
        sorted.forEach((mark, i) => {
          const m = markMesh(color, i + 1)
          m.position.set(mark.position.x, mark.position.y + 0.01, mark.position.z)
          m.userData.markId = mark.id
          m.userData.entityId = track.entityId
          this.overlay.add(m)
          this.markObjects.push(m)
        })
      }
    }
    const sortedCam = [...shot.camera.marks].sort((a, b) => a.time - b.time)
    sortedCam.forEach((mark, i) => {
      const m = markMesh('#7dd3fc', i + 1)
      m.position.set(mark.position.x, mark.position.y + 0.01, mark.position.z)
      m.userData.markId = mark.id
      m.userData.entityId = 'camera'
      this.overlay.add(m)
      this.markObjects.push(m)
    })

    // Paths
    for (const path of this.evaluator.paths()) {
      const pts = path.points.map((p) => new THREE.Vector3(p.x, p.y + 0.02, p.z))
      if (pts.length < 2) continue
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      const isCam = path.entityId === 'camera'
      const line = new THREE.Line(
        geo,
        new THREE.LineDashedMaterial({
          color: isCam ? 0x7dd3fc : new THREE.Color(path.color ?? '#f5a524'),
          dashSize: 0.15,
          gapSize: 0.1,
          transparent: true,
          opacity: 0.8
        })
      )
      line.computeLineDistances()
      this.overlay.add(line)
      this.markObjects.push(line)
    }
  }

  /* ----------------------------- environment ---------------------------- */

  private applyEnvironment(): void {
    const env = this.docScene?.environment
    if (!env) return
    const presets: Record<
      LightingPresetId,
      { sky: number; sun: number; sunColor: number; ambient: number; bg: number; club: number }
    > = {
      day: { sky: 0xbfd4e6, sun: 2.4, sunColor: 0xfff4e0, ambient: 0.75, bg: 0x23262c, club: 0 },
      goldenHour: { sky: 0xf5c396, sun: 2.0, sunColor: 0xff9a3c, ambient: 0.5, bg: 0x2a2118, club: 0 },
      night: { sky: 0x2c3e5a, sun: 0.5, sunColor: 0x7a9cc6, ambient: 0.28, bg: 0x0d1016, club: 0 },
      interiorWarm: { sky: 0xffe0b3, sun: 1.1, sunColor: 0xffd9a0, ambient: 0.6, bg: 0x1c1a17, club: 0 },
      interiorCool: { sky: 0xd0e4f5, sun: 1.2, sunColor: 0xe8f2ff, ambient: 0.65, bg: 0x171a1c, club: 0 },
      club: { sky: 0x281a35, sun: 0.15, sunColor: 0x8844ff, ambient: 0.2, bg: 0x0b0810, club: 30 }
    }
    const p = presets[env.lighting]
    this.ambient.color.set(p.sky)
    this.ambient.intensity = p.ambient
    this.sun.intensity = p.sun
    this.sun.color.set(p.sunColor)
    this.scene.background = new THREE.Color(p.bg)
    for (const l of this.clubLights) l.intensity = p.club

    // Sun direction from azimuth/elevation.
    const r = 30
    this.sun.position.set(
      Math.cos(env.sunAzimuth) * Math.cos(env.sunElevation) * r,
      Math.sin(env.sunElevation) * r,
      Math.sin(env.sunAzimuth) * Math.cos(env.sunElevation) * r
    )
    this.sun.target.position.set(0, 0, 0)

    this.scene.fog = env.fog > 0.01 ? new THREE.FogExp2(p.bg, env.fog * 0.06) : null
  }

  /* ------------------------------ interaction --------------------------- */

  private pointerNdc(e: PointerEvent): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect()
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    const s = this.currentState()
    if (s.mode === 'deliver') return
    const ndc = this.pointerNdc(e)
    this.raycaster.setFromCamera(ndc, s.lookThrough ? this.shotCam : this.freeCam)

    // 1) Placement
    if (s.placingAssetId) {
      const point = this.groundHit()
      if (point) {
        const y = this.surfaceHeightAt(point)
        s.addEntity(s.placingAssetId, { x: point.x, y, z: point.z })
        if (!e.altKey) s.setPlacingAsset(null)
      }
      return
    }

    // 2) Mark dropping
    if (s.droppingMarks && s.selection) {
      const point = this.groundHit()
      if (point) {
        if (s.selection.kind === 'entity') {
          s.dropActorMark(s.selection.entityId, { x: point.x, y: 0, z: point.z })
        } else if (s.selection.kind === 'camera') {
          // Keep the shot cam's current height/orientation/lens; move to click.
          s.dropCameraMark(
            { x: point.x, y: this.shotCam.position.y, z: point.z },
            this.shotCam.rotation.y,
            this.shotCam.rotation.x,
            this.currentLens()
          )
        }
      }
      return
    }

    // 3) Selection
    const pickables: THREE.Object3D[] = []
    for (const v of this.visuals.values()) pickables.push(v.root)
    pickables.push(this.cameraBody)
    const hits = this.raycaster.intersectObjects(pickables, true)
    const hit = hits.find((h) => !(h.object instanceof THREE.Sprite) || true)
    if (hit) {
      let o: THREE.Object3D | null = hit.object
      while (o) {
        if (o.userData.entityId) {
          s.setSelection({ kind: 'entity', entityId: o.userData.entityId as string })
          return
        }
        if (o === this.cameraBody) {
          s.setSelection({ kind: 'camera' })
          return
        }
        o = o.parent
      }
    }
    // Clicked empty space
    if (!this.transform.dragging) s.setSelection(null)
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const inField =
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement
    if (inField) return
    if (e.key === 'g' || e.key === 'G') this.transform.setMode('translate')
    if (e.key === 'r' || e.key === 'R') this.transform.setMode('rotate')
    if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      this.duplicateSelection()
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      this.deleteSelection()
    }
  }

  private groundHit(): THREE.Vector3 | null {
    const target = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(this.groundPlane, target) ? target : null
  }

  /** Gravity-aware placement: stack on whatever is under the cursor. */
  private surfaceHeightAt(point: THREE.Vector3): number {
    const down = new THREE.Raycaster(
      new THREE.Vector3(point.x, 50, point.z),
      new THREE.Vector3(0, -1, 0)
    )
    const meshes: THREE.Object3D[] = []
    for (const v of this.visuals.values()) meshes.push(v.root)
    const hits = down.intersectObjects(meshes, true).filter((h) => !(h.object instanceof THREE.Sprite))
    return hits.length > 0 ? Math.max(0, hits[0]!.point.y) : 0
  }

  private selectedObject(): THREE.Object3D | null {
    const sel = this.currentState().selection
    if (!sel) return null
    if (sel.kind === 'entity') return this.visuals.get(sel.entityId)?.root ?? null
    if (sel.kind === 'camera') return this.cameraBody
    return null
  }

  private syncSelection(): void {
    const s = this.currentState()
    const obj = this.selectedObject()
    this.transform.detach()
    this.selectionBox.visible = false
    if (obj && s.mode === 'stage' && s.selection?.kind === 'entity') {
      this.transform.attach(obj)
    }
    if (obj) {
      this.selectionBox.setFromObject(obj)
      this.selectionBox.visible = true
    }
  }

  private commitGizmo(): void {
    const s = this.currentState()
    const sel = s.selection
    if (!sel || sel.kind !== 'entity') return
    const visual = this.visuals.get(sel.entityId)
    if (!visual) return
    const pos = visual.root.position
    const rotY = visual.root.rotation.y
    const scale = visual.root.scale.x
    s.mutate('move entity', (doc) => {
      for (const scene of doc.scenes) {
        const entity = scene.entities.find((e) => e.id === sel.entityId)
        if (entity) {
          entity.transform.position = { x: pos.x, y: Math.max(0, pos.y), z: pos.z }
          entity.transform.rotationY = rotY
          entity.transform.scale = scale
        }
      }
    })
  }

  private duplicateSelection(): void {
    const s = this.currentState()
    if (s.selection?.kind !== 'entity') return
    const visual = this.visuals.get(s.selection.entityId)
    if (!visual) return
    const e = visual.entity
    s.addEntity(e.assetId, {
      x: e.transform.position.x + 0.8,
      y: e.transform.position.y,
      z: e.transform.position.z + 0.8
    })
  }

  private deleteSelection(): void {
    const s = this.currentState()
    if (s.selection?.kind !== 'entity') return
    const id = s.selection.entityId
    s.mutate('delete entity', (doc) => {
      for (const scene of doc.scenes) {
        scene.entities = scene.entities.filter((e) => e.id !== id)
        for (const take of scene.blocking) {
          take.tracks = take.tracks.filter((t) => t.entityId !== id)
        }
      }
    })
    s.setSelection(null)
  }

  /* --------------------------- camera commands -------------------------- */

  private currentLens(): number {
    if (!this.evaluator || !this.shot) return 35
    return this.evaluator.evaluate(this.currentState().time).camera.focalLength
  }

  /** Closest camera mark at/before the playhead — the one live edits write to. */
  private activeCameraMark() {
    const shot = this.shot
    if (!shot || shot.camera.marks.length === 0) return null
    const t = this.currentState().time
    const sorted = [...shot.camera.marks].sort((a, b) => a.time - b.time)
    let active = sorted[0]!
    for (const m of sorted) if (m.time <= t + 1e-6) active = m
    return active
  }

  private setLens(focalLength: number): void {
    const s = this.currentState()
    const mark = this.activeCameraMark()
    if (!mark) {
      // No marks yet: drop one at the current view with this lens.
      this.dropCameraMarkAtView(focalLength)
      return
    }
    s.mutate('set lens', (doc) => {
      for (const scene of doc.scenes) {
        for (const shot of scene.shots) {
          const m = shot.camera.marks.find((x) => x.id === mark.id)
          if (m) m.focalLength = focalLength
        }
      }
    })
  }

  private dropCameraMarkAtView(focalLength?: number): void {
    const s = this.currentState()
    const cam = s.lookThrough ? this.shotCam : this.freeCam
    const pos = cam.position
    // Extract pan/tilt from the camera's world direction.
    const dir = new THREE.Vector3()
    cam.getWorldDirection(dir)
    const pan = headingOf({ x: dir.x, y: 0, z: dir.z })
    const tilt = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))
    s.dropCameraMark({ x: pos.x, y: pos.y, z: pos.z }, pan, tilt, focalLength ?? this.currentLens())
    s.setSelection({ kind: 'camera' })
  }

  private autoFrame(size: Parameters<typeof frameSubjectMath>[0]): void {
    const s = this.currentState()
    // Frame the selected entity, or the first person in the scene.
    let subjectId: string | null = s.selection?.kind === 'entity' ? s.selection.entityId : null
    if (!subjectId) {
      const person = this.docScene?.entities.find((e) => e.assetId.startsWith('person.'))
      subjectId = person?.id ?? this.docScene?.entities[0]?.id ?? null
    }
    if (!subjectId || !this.shot || !this.evaluator) {
      s.toast('Place a subject first, then auto-frame.', 'info')
      return
    }
    const state = this.evaluator.evaluate(s.time)
    const es = state.entities.find((e) => e.entityId === subjectId)
    const entity = this.docScene!.entities.find((e) => e.id === subjectId)
    if (!es || !entity) return

    const subjectHeight = entityHeight(entity.assetId, entity.transform.scale, entity.params)
    const lens = this.currentLens()
    const { distance, targetHeight } = frameSubjectMath(
      size,
      subjectHeight,
      this.shot.camera.sensorId,
      lens,
      this.shot.aspect
    )
    // Keep the current camera→subject azimuth; step back to `distance`.
    const camState = state.camera
    let az = Math.atan2(camState.position.x - es.position.x, camState.position.z - es.position.z)
    if (!isFinite(az)) az = 0
    const px = es.position.x + Math.sin(az) * distance
    const pz = es.position.z + Math.cos(az) * distance
    const py = es.position.y + targetHeight
    const pan = headingOf({ x: es.position.x - px, y: 0, z: es.position.z - pz })
    const dy = es.position.y + targetHeight - py
    const tilt = Math.atan2(dy, distance)

    const mark = this.activeCameraMark()
    if (!mark) {
      s.dropCameraMark({ x: px, y: py, z: pz }, pan, tilt, lens)
    } else {
      s.mutate('auto-frame', (doc) => {
        for (const scene of doc.scenes) {
          for (const shot of scene.shots) {
            const m = shot.camera.marks.find((x) => x.id === mark.id)
            if (m) {
              m.position = { x: px, y: py, z: pz }
              m.pan = pan
              m.tilt = tilt
            }
          }
        }
      })
    }
    s.setSelection({ kind: 'camera' })
  }

  /* ------------------------------- playback ----------------------------- */

  private applyTime(t: number): void {
    if (!this.evaluator || !this.shot) return
    const state = this.evaluator.evaluate(t)

    for (const es of state.entities) {
      const visual = this.visuals.get(es.entityId)
      if (!visual) continue
      visual.root.position.set(es.position.x, es.position.y + visual.entity.transform.position.y * 0, es.position.z)
      // Static entities keep their authored Y (tables on floors); tracked
      // entities travel on the ground plane.
      if (es.speed === 0 && es.distanceTravelled === 0 && !this.entityHasTrack(es.entityId)) {
        visual.root.position.y = visual.entity.transform.position.y
      }
      visual.root.rotation.y = es.heading
      const stride = GAITS[es.gait].strideLength * Math.max(visual.entity.transform.scale, 0.2)
      const phase = stride > 0 ? (es.distanceTravelled / stride) % 1 : 0
      visual.built.animate?.({
        gait: es.gait,
        phase,
        speed: es.speed,
        distance: es.distanceTravelled,
        time: t
      })
    }

    // Shot camera
    const c = state.camera
    this.shotCam.position.set(c.position.x, c.position.y, c.position.z)
    this.shotCam.rotation.set(c.tilt, c.pan, c.roll, 'YXZ')
    this.shotCam.fov = c.vfov * RAD2DEG
    this.shotCam.aspect = ASPECT_RATIOS[this.shot.aspect]
    this.shotCam.updateProjectionMatrix()

    // Camera body visual follows the shot camera
    this.cameraBody.position.copy(this.shotCam.position)
    this.cameraBody.rotation.copy(this.shotCam.rotation)
  }

  private entityHasTrack(entityId: string): boolean {
    const take = this.docScene?.blocking.find((b) => b.id === this.shot?.blockingTakeId)
    return !!take?.tracks.some((tr) => tr.entityId === entityId && tr.marks.length > 0)
  }

  private loop = (): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.lastFrameAt) / 1000)
    this.lastFrameAt = now

    const s = this.currentState()
    if (s.playing && this.shot) {
      let t = s.time + dt
      if (t >= this.shot.duration) t = 0 // loop
      s.setTime(t)
    }
    this.applyTime(s.time)
    this.controls.update()

    // Resize
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    const size = this.renderer.getSize(new THREE.Vector2())
    if (size.x !== w || size.y !== h) {
      this.renderer.setSize(w, h, false)
      this.freeCam.aspect = w / h
      this.freeCam.updateProjectionMatrix()
    }

    this.overlay.visible = s.mode !== 'deliver'
    this.cameraBody.visible = !s.lookThrough && s.mode !== 'deliver'

    if (s.lookThrough || s.mode === 'deliver') {
      // Letterboxed shot-camera view.
      const aspect = this.shot ? ASPECT_RATIOS[this.shot.aspect] : 16 / 9
      let vw = w
      let vh = Math.round(w / aspect)
      if (vh > h) {
        vh = h
        vw = Math.round(h * aspect)
      }
      const vx = Math.floor((w - vw) / 2)
      const vy = Math.floor((h - vh) / 2)
      this.renderer.setScissorTest(true)
      this.renderer.setClearColor(0x000000)
      this.renderer.setScissor(0, 0, w, h)
      this.renderer.setViewport(0, 0, w, h)
      this.renderer.clear()
      this.renderer.setScissor(vx, vy, vw, vh)
      this.renderer.setViewport(vx, vy, vw, vh)
      this.renderer.render(this.scene, this.shotCam)
      this.renderer.setScissorTest(false)
      this.onViewRect?.({ x: vx, y: h - vy - vh, w: vw, h: vh })
    } else {
      this.renderer.setViewport(0, 0, w, h)
      this.renderer.render(this.scene, this.freeCam)
      this.onViewRect?.(null)
    }

    // Keep selection box tracking its object
    if (this.selectionBox.visible) {
      const obj = this.selectedObject()
      if (obj) this.selectionBox.setFromObject(obj)
    }
  }

  /* -------------------------- export render hook ------------------------ */

  /**
   * Deterministically render one frame at time t into an export renderer.
   * Used by the exporter (offscreen canvas) and stills/diagram generation.
   */
  renderFrameAt(
    exportRenderer: THREE.WebGLRenderer,
    t: number,
    width: number,
    height: number,
    pass: RenderPass,
    opts: { showLabels: boolean; camera?: THREE.Camera } = { showLabels: true }
  ): void {
    this.applyTime(t)
    const overlayWas = this.overlay.visible
    this.overlay.visible = false
    const labelStates: [THREE.Sprite, boolean][] = []
    for (const v of this.visuals.values()) {
      if (v.label) {
        labelStates.push([v.label, v.label.visible])
        v.label.visible = opts.showLabels && pass === 'clean'
      }
    }
    const bgWas = this.scene.background
    const fogWas = this.scene.fog
    if (pass === 'depth') {
      this.scene.overrideMaterial = new THREE.MeshDepthMaterial()
      this.scene.background = new THREE.Color(0x000000)
      this.scene.fog = null
    } else if (pass === 'normal') {
      this.scene.overrideMaterial = new THREE.MeshNormalMaterial()
      this.scene.background = new THREE.Color(0x000000)
      this.scene.fog = null
    }

    const cam = (opts.camera as THREE.PerspectiveCamera) ?? this.shotCam
    if (cam === this.shotCam) {
      this.shotCam.aspect = width / height
      this.shotCam.updateProjectionMatrix()
    }
    exportRenderer.setSize(width, height, false)
    exportRenderer.setViewport(0, 0, width, height)
    exportRenderer.render(this.scene, cam)

    this.scene.overrideMaterial = null
    this.scene.background = bgWas
    this.scene.fog = fogWas
    this.overlay.visible = overlayWas
    for (const [sprite, was] of labelStates) sprite.visible = was
  }

  /** Top-down blocking diagram camera + overlay paths forced visible. */
  renderTopDown(exportRenderer: THREE.WebGLRenderer, width: number, height: number): void {
    // Fit an ortho camera around everything interesting.
    const box = new THREE.Box3()
    for (const v of this.visuals.values()) box.expandByObject(v.root)
    for (const m of this.markObjects) box.expandByObject(m)
    if (box.isEmpty()) box.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 2, 5))
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const span = Math.max(size.x, size.z) * 0.65 + 2
    const cam = new THREE.OrthographicCamera(-span, span, span * (height / width), -span * (height / width), 0.1, 200)
    cam.position.set(center.x, 60, center.z)
    cam.up.set(0, 0, -1)
    cam.lookAt(center.x, 0, center.z)

    this.applyTime(0)
    const overlayWas = this.overlay.visible
    const camBodyWas = this.cameraBody.visible
    this.overlay.visible = true
    this.cameraBody.visible = true
    exportRenderer.setSize(width, height, false)
    exportRenderer.render(this.scene, cam)
    this.overlay.visible = overlayWas
    this.cameraBody.visible = camBodyWas
  }
}
