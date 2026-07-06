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
import { newId } from '@engine/ids'
import { GAITS } from '@engine/gaits'
import { frameSubject as frameSubjectMath, ASPECT_RATIOS } from '@engine/camera'
import { entityHeight } from '@engine/assets'
import { headingOf } from '@engine/path'
import type { Entity, LightingPresetId, Scene as DocScene, Shot } from '@engine/types'
import { useStore, selectedEntityIds } from '../store'
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
  /** Additional boxes for multi-selection members. */
  private extraSelectionBoxes: THREE.BoxHelper[] = []
  /** Doc transforms snapshotted when a gizmo drag starts (group moves). */
  private dragStart: Map<string, { pos: THREE.Vector3; rotY: number }> | null = null
  private dragAnchorId: string | null = null
  /** Last pointer position in NDC — drives entity performance recording. */
  private lastPointerNdc = new THREE.Vector2(0, 0)

  private sun: THREE.DirectionalLight
  private ambient: THREE.HemisphereLight
  private clubLights: THREE.PointLight[] = []

  private evaluator: ShotEvaluator | null = null
  private docScene: DocScene | null = null
  private shot: Shot | null = null

  /**
   * Depth pass material: LINEAR view-space depth normalized to the scene's
   * actual near/far range, white-near black-far (the inverted-depth
   * convention depth ControlNets expect). Three's MeshDepthMaterial packs
   * non-linear frag depth, which over a 0.05..500 camera range crushes
   * everything past arm's length into a handful of gray levels — useless
   * for conditioning. Cached; uniforms set per frame (finding of the audit).
   */
  private depthMaterial = new THREE.ShaderMaterial({
    uniforms: { uNear: { value: 0.5 }, uFar: { value: 30 } },
    vertexShader: `
      varying float vViewZ;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uNear;
      uniform float uFar;
      varying float vViewZ;
      void main() {
        float d = 1.0 - clamp((vViewZ - uNear) / (uFar - uNear), 0.0, 1.0);
        gl_FragColor = vec4(vec3(d), 1.0);
      }`
  })
  private normalMaterial = new THREE.MeshNormalMaterial()

  private raf = 0
  private lastFrameAt = 0
  private disposed = false
  private unsubscribers: (() => void)[] = []
  /** True while an export owns the scene — the live loop stands down. */
  suspendLive = false

  /** Set by Viewport for overlay layout (letterbox rect in CSS px). */
  onViewRect?: (rect: { x: number; y: number; w: number; h: number } | null) => void
  /** Set by Viewport: the PiP shot-preview rect in CSS px (null = hidden). */
  onPipRect?: (rect: { x: number; y: number; w: number; h: number } | null) => void

  /** Live performance-recording state (camera flight or entity puppeteering). */
  private recSamples: { t: number; pos: THREE.Vector3; pan: number; tilt: number; roll: number }[] = []
  private entitySamples: { t: number; x: number; z: number }[] = []
  private recStartedAt = 0
  private recLens = 35
  /** 'camera' or the entity id being puppeteered. */
  private recTarget: string = 'camera'
  /** True when recording against the playback clock (other motion replays). */
  private recPlaybackSynced = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.45

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

    // Ground: soft grid (editor chrome — lives in overlay so exports never
    // include it) + shadow-catching plane (stays: contact shadows read well)
    const grid = new THREE.GridHelper(60, 60, 0x33343a, 0x27282d)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.6
    this.overlay.add(grid)
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
      const dragging = (e as unknown as { value: boolean }).value
      this.controls.enabled = !dragging
      if (dragging) this.beginGizmoDrag()
      else this.commitGizmo()
    })
    this.scene.add(this.transform.getHelper ? this.transform.getHelper() : (this.transform as unknown as THREE.Object3D))

    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
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
        if (state.recording !== prev.recording) {
          if (state.recording) this.beginRecording()
          else this.finishRecording()
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
    // Automation/debug surface (see AGENTS.md).
    ;(window as unknown as Record<string, unknown>).__blockout_scene = this
  }

  /* ------------------------------ lifecycle ----------------------------- */

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.unsubscribers.forEach((u) => u())
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
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
        this.removeEntityVisual(visual)
        this.visuals.delete(id)
      }
    }
    for (const entity of wanted.values()) {
      const existing = this.visuals.get(entity.id)
      if (!existing || existing.entity.assetId !== entity.assetId || existing.entity.params !== entity.params) {
        if (existing) this.removeEntityVisual(existing)
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

  /** Remove a visual and free its GPU resources (long sessions must not leak). */
  private removeEntityVisual(visual: EntityVisual): void {
    this.scene.remove(visual.root)
    visual.root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose()
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) m.dispose()
      }
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose()
        o.material.dispose()
      }
    })
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
      visual.label.material.map?.dispose()
      visual.label.material.dispose()
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
    // This runs on every mutation — dispose or the mark sprites' canvas
    // textures and path geometries pile up on the GPU all session.
    for (const o of this.markObjects) {
      this.overlay.remove(o)
      o.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry.dispose()
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          for (const m of mats) m.dispose()
        }
        if (child instanceof THREE.Sprite) {
          child.material.map?.dispose()
          child.material.dispose()
        }
      })
    }
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
      day: { sky: 0xcfe0ef, sun: 3.2, sunColor: 0xfff4e0, ambient: 1.15, bg: 0x394048, club: 0 },
      goldenHour: { sky: 0xf5c396, sun: 2.8, sunColor: 0xff9a3c, ambient: 0.8, bg: 0x3a2d1e, club: 0 },
      night: { sky: 0x2c3e5a, sun: 0.7, sunColor: 0x7a9cc6, ambient: 0.4, bg: 0x11151c, club: 0 },
      interiorWarm: { sky: 0xffe0b3, sun: 1.6, sunColor: 0xffd9a0, ambient: 0.95, bg: 0x27231d, club: 0 },
      interiorCool: { sky: 0xd0e4f5, sun: 1.7, sunColor: 0xe8f2ff, ambient: 1.0, bg: 0x212528, club: 0 },
      club: { sky: 0x281a35, sun: 0.2, sunColor: 0x8844ff, ambient: 0.3, bg: 0x0b0810, club: 40 }
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

  private onPointerMove = (e: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect()
    this.lastPointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    // Pointer is on the transform gizmo (axis set on hover) — the gizmo owns
    // this interaction; running selection logic would detach it mid-grab.
    if (this.transform.dragging || this.transform.axis) return
    const s = this.currentState()
    if (s.mode === 'deliver') return
    // While recording a performance, clicks must not change the selection.
    if (s.recording) return
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
    // Label sprites float above heads — picking through them selects what
    // the user actually aimed at.
    const hit = hits.find((h) => !(h.object instanceof THREE.Sprite))
    if (hit) {
      let o: THREE.Object3D | null = hit.object
      while (o) {
        if (o.userData.entityId) {
          const id = o.userData.entityId as string
          // Shift-click: build/extend a multi-selection.
          if (e.shiftKey) s.toggleEntitySelected(id)
          else s.setSelection({ kind: 'entity', entityId: id })
          return
        }
        if (o === this.cameraBody) {
          s.setSelection({ kind: 'camera' })
          return
        }
        o = o.parent
      }
    }
    // Clicked empty space (shift-click on empty keeps the multi-selection)
    if (!this.transform.dragging && !e.shiftKey) s.setSelection(null)
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const inField =
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement
    if (inField) return
    if (e.key === 'g' || e.key === 'G') this.setGizmoMode('translate')
    if (e.key === 'r' || e.key === 'R') this.setGizmoMode('rotate')
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
    if (sel.kind === 'entities') {
      const last = sel.entityIds[sel.entityIds.length - 1]
      return last ? (this.visuals.get(last)?.root ?? null) : null
    }
    if (sel.kind === 'camera') return this.cameraBody
    return null
  }

  /** Set the gizmo mode; entities rotate around Y only (they stay upright). */
  setGizmoMode(mode: 'translate' | 'rotate'): void {
    this.transform.setMode(mode)
    this.applyGizmoAxisLimits()
  }

  private applyGizmoAxisLimits(): void {
    const sel = this.currentState().selection
    const isEntity = sel?.kind === 'entity' || sel?.kind === 'entities'
    if (this.transform.mode === 'rotate' && isEntity) {
      this.transform.showX = false
      this.transform.showZ = false
      this.transform.showY = true
    } else {
      this.transform.showX = true
      this.transform.showY = true
      this.transform.showZ = true
    }
  }

  private syncSelection(): void {
    const s = this.currentState()
    const obj = this.selectedObject()
    this.transform.detach()
    this.selectionBox.visible = false
    for (const box of this.extraSelectionBoxes) {
      this.scene.remove(box)
      box.dispose()
    }
    this.extraSelectionBoxes = []

    const isEntitySel = s.selection?.kind === 'entity' || s.selection?.kind === 'entities'
    if (obj && !s.lookThrough && s.mode !== 'deliver') {
      // Entities are transformable in BOTH Stage and Shoot (move/rotate);
      // the camera body likewise (drags commit to the active camera mark).
      if (isEntitySel) this.transform.attach(obj)
      if (s.selection?.kind === 'camera') this.transform.attach(this.cameraBody)
      this.applyGizmoAxisLimits()
    }
    if (obj) {
      this.selectionBox.setFromObject(obj)
      this.selectionBox.visible = true
    }
    // Extra boxes for the other members of a multi-selection.
    if (s.selection?.kind === 'entities') {
      for (const id of s.selection.entityIds.slice(0, -1)) {
        const visual = this.visuals.get(id)
        if (!visual) continue
        const box = new THREE.BoxHelper(visual.root, 0x7dd3fc)
        this.scene.add(box)
        this.extraSelectionBoxes.push(box)
      }
    }
  }

  /** Snapshot doc transforms of every selected entity when a drag starts. */
  private beginGizmoDrag(): void {
    const s = this.currentState()
    const ids = selectedEntityIds(s.selection)
    if (ids.length === 0) {
      this.dragStart = null
      this.dragAnchorId = null
      return
    }
    this.dragAnchorId = ids[ids.length - 1]!
    this.dragStart = new Map()
    for (const id of ids) {
      const visual = this.visuals.get(id)
      if (visual) {
        this.dragStart.set(id, {
          pos: visual.root.position.clone(),
          rotY: visual.root.rotation.y
        })
      }
    }
  }

  /** Rigid-group transform: apply the anchor's drag delta to a member. */
  private groupTransformed(
    start: { pos: THREE.Vector3; rotY: number },
    anchorStart: { pos: THREE.Vector3; rotY: number },
    anchorNow: { pos: THREE.Vector3; rotY: number }
  ): { pos: THREE.Vector3; rotY: number } {
    const dRot = anchorNow.rotY - anchorStart.rotY
    const rel = start.pos.clone().sub(anchorStart.pos)
    const cos = Math.cos(dRot)
    const sin = Math.sin(dRot)
    // Y-rotation of the offset about the anchor pivot (matches heading math)
    const rx = rel.x * cos + rel.z * sin
    const rz = -rel.x * sin + rel.z * cos
    return {
      pos: new THREE.Vector3(anchorNow.pos.x + rx, anchorNow.pos.y + rel.y, anchorNow.pos.z + rz),
      rotY: start.rotY + dRot
    }
  }

  private commitGizmo(): void {
    const s = this.currentState()
    const sel = s.selection
    if (!sel) return

    if (sel.kind === 'camera') {
      // Dragging the camera body writes the active camera mark (or creates
      // the first one). Rotation commits pan/tilt/roll too (R to rotate).
      const pos = this.cameraBody.position
      const e = new THREE.Euler().setFromQuaternion(this.cameraBody.quaternion, 'YXZ')
      const mark = this.activeCameraMark()
      if (!mark) {
        s.dropCameraMark({ x: pos.x, y: pos.y, z: pos.z }, e.y, e.x, 35)
        return
      }
      const shotId = this.shot?.id
      s.mutate('move camera', (doc) => {
        for (const scene of doc.scenes) {
          const shot = scene.shots.find((x) => x.id === shotId)
          const m = shot?.camera.marks.find((x) => x.id === mark.id)
          if (m) {
            m.position = { x: pos.x, y: pos.y, z: pos.z }
            m.pan = e.y
            m.tilt = e.x
            m.roll = e.z
          }
        }
      })
      return
    }

    const ids = selectedEntityIds(sel)
    if (ids.length === 0) return
    const anchorId = this.dragAnchorId ?? ids[ids.length - 1]!
    const anchorVisual = this.visuals.get(anchorId)
    const anchorStart = this.dragStart?.get(anchorId)
    if (!anchorVisual) return
    const anchorNow = {
      pos: anchorVisual.root.position.clone(),
      rotY: anchorVisual.root.rotation.y
    }
    const scale = anchorVisual.root.scale.x
    const dragStart = this.dragStart
    this.dragStart = null
    this.dragAnchorId = null

    s.mutate(ids.length > 1 ? 'move group' : 'move entity', (doc) => {
      for (const scene of doc.scenes) {
        for (const id of ids) {
          const entity = scene.entities.find((e) => e.id === id)
          if (!entity) continue
          let next: { pos: THREE.Vector3; rotY: number }
          if (id === anchorId || !anchorStart || !dragStart?.get(id)) {
            next = id === anchorId ? anchorNow : null!
            if (!next) continue
          } else {
            next = this.groupTransformed(dragStart.get(id)!, anchorStart, anchorNow)
          }
          if (entity.attachedTo && entity.attachedLocal) {
            // Married: a drag adjusts the local offset on the parent instead
            // of the world transform (the evaluator would snap it back).
            const parentVisual = this.visuals.get(entity.attachedTo)
            if (parentVisual) {
              const ph = parentVisual.root.rotation.y
              const dx = next.pos.x - parentVisual.root.position.x
              const dz = next.pos.z - parentVisual.root.position.z
              const cos = Math.cos(ph)
              const sin = Math.sin(ph)
              entity.attachedLocal = {
                x: dx * cos - dz * sin,
                y: next.pos.y - parentVisual.root.position.y,
                z: dx * sin + dz * cos,
                rotY: next.rotY - ph
              }
            }
          } else {
            entity.transform.position = { x: next.pos.x, y: Math.max(0, next.pos.y), z: next.pos.z }
            entity.transform.rotationY = next.rotY
            if (id === anchorId) entity.transform.scale = scale
          }
        }
      }
    })
  }

  private duplicateSelection(): void {
    const s = this.currentState()
    const ids = selectedEntityIds(s.selection)
    for (const id of ids) {
      const visual = this.visuals.get(id)
      if (!visual) continue
      const e = visual.entity
      s.addEntity(e.assetId, {
        x: e.transform.position.x + 0.8,
        y: e.transform.position.y,
        z: e.transform.position.z + 0.8
      })
    }
  }

  private deleteSelection(): void {
    const s = this.currentState()
    const ids = selectedEntityIds(s.selection)
    if (ids.length === 0) return
    const idSet = new Set(ids)
    s.mutate(ids.length > 1 ? 'delete entities' : 'delete entity', (doc) => {
      for (const scene of doc.scenes) {
        scene.entities = scene.entities.filter((e) => !idSet.has(e.id))
        for (const entity of scene.entities) {
          // Widow any marriages pointing at a deleted parent.
          if (entity.attachedTo && idSet.has(entity.attachedTo)) {
            delete entity.attachedTo
            delete entity.attachedLocal
          }
        }
        for (const take of scene.blocking) {
          take.tracks = take.tracks.filter((t) => !idSet.has(t.entityId))
        }
        // A camera mounted to a deleted entity would silently re-base its
        // local-frame marks to world space — unmount instead.
        for (const shot of [...scene.shots, ...(scene.drafts ?? [])]) {
          if (shot.camera.mountEntityId && idSet.has(shot.camera.mountEntityId)) {
            delete shot.camera.mountEntityId
          }
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

  /* ------------------------------ recording ----------------------------- */

  private beginRecording(): void {
    this.recSamples = []
    this.entitySamples = []
    this.recStartedAt = performance.now()
    this.recLens = this.currentLens()
    const s = this.currentState()

    // Target: a single selected entity means "record ITS move" (puppeteer
    // with the cursor); anything else records the camera.
    const ids = selectedEntityIds(s.selection)
    this.recTarget = ids.length === 1 ? ids[0]! : 'camera'

    // Playback-synced when there is other motion to perform against — the
    // existing choreography replays while you record, so a camera flight
    // (or a second character) lands in sync with it.
    const take = this.docScene?.blocking.find((b) => b.id === this.shot?.blockingTakeId)
    const hasOtherMotion =
      this.recTarget === 'camera'
        ? !!take?.tracks.some((t) => t.marks.length > 0)
        : !!take?.tracks.some((t) => t.entityId !== this.recTarget && t.marks.length > 0) ||
          (this.shot?.camera.marks.length ?? 0) > 0
    this.recPlaybackSynced = hasOtherMotion

    if (this.recPlaybackSynced) {
      s.setTime(0)
      s.setPlaying(true)
    } else {
      s.setPlaying(false)
    }

    if (this.recTarget === 'camera') {
      s.toast(
        this.recPlaybackSynced
          ? 'Recording camera — the blocking replays while you fly the viewport. Stops at the end of the shot.'
          : 'Recording — fly the viewport; the shot camera follows. Click ■ to stop.',
        'info'
      )
    } else {
      s.toast(
        this.recPlaybackSynced
          ? 'Recording performance — move the cursor over the floor to puppeteer while the rest replays.'
          : 'Recording performance — move the cursor over the floor; the character follows it. Click ■ to stop.',
        'info'
      )
    }
  }

  private finishRecording(): void {
    const s = this.currentState()
    s.setPlaying(false)
    if (this.recTarget !== 'camera') {
      this.finishEntityRecording()
      return
    }
    const shotId = this.shot?.id
    const samples = this.recSamples
    this.recSamples = []
    if (!shotId || samples.length < 5) {
      if (samples.length > 0) s.toast('Recording too short — nothing saved.', 'info')
      return
    }
    const length = this.recPlaybackSynced
      ? (this.shot?.duration ?? 5)
      : Math.min(60, Math.max(0.5, samples[samples.length - 1]!.t))
    // Downsample to a mark every 250ms (plus the final pose). Marks with
    // zero easing replay the move exactly; the rig still layers on top.
    const step = 0.25
    const lens = this.recLens
    const marks: import('@engine/types').CameraMark[] = []
    let cursor = 0
    for (let t = 0; t <= length + 1e-6; t += step) {
      while (cursor < samples.length - 1 && samples[cursor]!.t < t) cursor++
      const sm = samples[cursor]!
      marks.push({
        id: newId('cmark'),
        time: Math.min(t, length),
        hold: 0,
        easeIn: 0,
        easeOut: 0,
        position: { x: sm.pos.x, y: sm.pos.y, z: sm.pos.z },
        pan: sm.pan,
        tilt: sm.tilt,
        roll: sm.roll,
        focalLength: lens
      })
    }
    s.mutate('record camera move', (doc) => {
      for (const scene of doc.scenes) {
        const shot =
          scene.shots.find((x) => x.id === shotId) ?? scene.drafts?.find((x) => x.id === shotId)
        if (shot) {
          shot.camera.marks = marks
          if (!this.recPlaybackSynced) shot.duration = Math.round(length * 10) / 10
        }
      }
    })
    s.setSelection({ kind: 'camera' })
    s.toast(`Camera move recorded — ${marks.length} marks over ${length.toFixed(1)}s.`, 'success')
  }

  /** Convert a puppeteered entity performance into actor marks. */
  private finishEntityRecording(): void {
    const s = this.currentState()
    const entityId = this.recTarget
    const shotId = this.shot?.id
    const samples = this.entitySamples
    this.entitySamples = []
    if (!shotId || samples.length < 5) {
      if (samples.length > 0) s.toast('Recording too short — nothing saved.', 'info')
      return
    }
    const length = this.recPlaybackSynced
      ? (this.shot?.duration ?? 5)
      : Math.min(60, Math.max(0.5, samples[samples.length - 1]!.t))

    const step = 0.25
    const marks: import('@engine/types').ActorMark[] = []
    let cursor = 0
    let prev: { x: number; z: number } | null = null
    for (let t = 0; t <= length + 1e-6; t += step) {
      while (cursor < samples.length - 1 && samples[cursor]!.t < t) cursor++
      const sm = samples[cursor]!
      // Gait for the leg ENDING at this mark, from its implied speed.
      let gait: import('@engine/types').GaitId = 'walk'
      if (prev) {
        const speed = Math.hypot(sm.x - prev.x, sm.z - prev.z) / step
        gait = speed > 3.4 ? 'run' : speed > 2.0 ? 'jog' : 'walk'
      }
      marks.push({
        id: newId('mark'),
        time: Math.min(t, length),
        hold: 0,
        easeIn: 0,
        easeOut: 0,
        position: { x: sm.x, y: 0, z: sm.z },
        gait
      })
      prev = { x: sm.x, z: sm.z }
    }

    s.mutate('record performance', (doc) => {
      for (const scene of doc.scenes) {
        const shot =
          scene.shots.find((x) => x.id === shotId) ?? scene.drafts?.find((x) => x.id === shotId)
        if (!shot) continue
        const take = scene.blocking.find((b) => b.id === shot.blockingTakeId)
        if (!take) continue
        let track = take.tracks.find((tr) => tr.entityId === entityId)
        if (!track) {
          track = { entityId, marks: [] }
          take.tracks.push(track)
        }
        track.marks = marks
        if (!this.recPlaybackSynced) shot.duration = Math.round(length * 10) / 10
      }
    })
    s.setSelection({ kind: 'entity', entityId })
    s.toast(
      `Performance recorded — ${marks.length} marks over ${length.toFixed(1)}s. Now select the camera and ● Record to fly it while this replays.`,
      'success'
    )
  }

  /* ------------------------------- playback ----------------------------- */

  private applyTime(t: number): void {
    if (!this.evaluator || !this.shot) return
    const state = this.evaluator.evaluate(t)
    const live = this.currentState()
    const puppeteering = live.recording && this.recTarget !== 'camera' ? this.recTarget : null

    for (const es of state.entities) {
      const visual = this.visuals.get(es.entityId)
      if (!visual) continue
      // An active gizmo drag owns this object's transform — re-applying the
      // evaluator pose every frame would freeze the drag in place. Same for
      // every member of a live group drag and a puppeteered recording target.
      if (this.transform.dragging && this.dragStart?.has(es.entityId)) continue
      if (this.transform.dragging && this.transform.object === visual.root) continue
      if (puppeteering === es.entityId) continue
      visual.root.position.set(es.position.x, es.position.y, es.position.z)
      // Static entities keep their authored Y (a lamp stays on its table);
      // tracked and MARRIED entities take the evaluator's Y (a rider keeps
      // its height offset on a moving vehicle).
      if (!this.entityHasTrack(es.entityId) && !visual.entity.attachedTo) {
        visual.root.position.y = visual.entity.transform.position.y
      }
      visual.root.rotation.y = es.heading
      // Stage-level pose (params.pose: a person sits on the bus without any
      // marks) and manual joint offsets (params.joint_*: fight/dance poses).
      const params = visual.entity.params
      let gait = es.gait
      if (!this.entityHasTrack(es.entityId) && typeof params?.pose === 'string') {
        gait = params.pose as typeof es.gait
      }
      let overrides: Record<string, number> | undefined
      if (params) {
        for (const key of Object.keys(params)) {
          const v = params[key]
          if (key.startsWith('joint_') && typeof v === 'number' && v !== 0) {
            (overrides ??= {})[key.slice(6)] = v
          }
        }
      }
      // Mark-keyframed joints (pose-per-mark choreography, interpolated by
      // the evaluator) layer additively on the entity's static pose offsets.
      if (es.joints) {
        for (const [key, v] of Object.entries(es.joints)) {
          if (v === 0) continue
          ;(overrides ??= {})[key] = (overrides?.[key] ?? 0) + v
        }
      }
      const stride = GAITS[gait].strideLength * Math.max(visual.entity.transform.scale, 0.2)
      const phase = stride > 0 ? (es.distanceTravelled / stride) % 1 : 0
      visual.built.animate?.({
        gait,
        phase,
        speed: es.speed,
        distance: es.distanceTravelled,
        time: t,
        overrides
      })
    }

    // Live group drag: the other members of a multi-selection follow the
    // anchor rigidly while the gizmo moves it.
    if (this.transform.dragging && this.dragStart && this.dragAnchorId) {
      const anchorVisual = this.visuals.get(this.dragAnchorId)
      const anchorStart = this.dragStart.get(this.dragAnchorId)
      if (anchorVisual && anchorStart) {
        const anchorNow = {
          pos: anchorVisual.root.position.clone(),
          rotY: anchorVisual.root.rotation.y
        }
        for (const [id, start] of this.dragStart) {
          if (id === this.dragAnchorId) continue
          const member = this.visuals.get(id)
          if (!member) continue
          const next = this.groupTransformed(start, anchorStart, anchorNow)
          member.root.position.copy(next.pos)
          member.root.rotation.y = next.rotY
        }
      }
    }

    // Marriage live-follow: attached entities ride their parent's CURRENT
    // visual (covers gizmo drags before commit; matches the evaluator at
    // rest). Three passes settle rider-on-cart-on-truck chains.
    for (let pass = 0; pass < 3; pass++) {
      for (const visual of this.visuals.values()) {
        const e = visual.entity
        if (!e.attachedTo || !e.attachedLocal) continue
        if (this.entityHasTrack(e.id)) continue
        if (this.transform.dragging && this.dragStart?.has(e.id)) continue // being adjusted
        if (puppeteering === e.id) continue
        const parent = this.visuals.get(e.attachedTo)
        if (!parent) continue
        const h = parent.root.rotation.y
        const cos = Math.cos(h)
        const sin = Math.sin(h)
        const l = e.attachedLocal
        visual.root.position.set(
          parent.root.position.x + l.x * cos + l.z * sin,
          parent.root.position.y + l.y,
          parent.root.position.z - l.x * sin + l.z * cos
        )
        visual.root.rotation.y = h + l.rotY
      }
    }

    // Shot camera
    const c = state.camera
    this.shotCam.position.set(c.position.x, c.position.y, c.position.z)
    this.shotCam.rotation.set(c.tilt, c.pan, c.roll, 'YXZ')
    this.shotCam.fov = c.vfov * RAD2DEG
    this.shotCam.aspect = ASPECT_RATIOS[this.shot.aspect]
    this.shotCam.updateProjectionMatrix()

    // Camera body visual follows the shot camera — unless the user is
    // dragging it (the drag commits to a camera mark on release).
    if (!(this.transform.dragging && this.transform.object === this.cameraBody)) {
      this.cameraBody.position.copy(this.shotCam.position)
      this.cameraBody.rotation.copy(this.shotCam.rotation)
    }
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
    // While exporting, the export loop owns scene state; rendering the live
    // view concurrently would perturb it mid-frame.
    if (this.suspendLive) return

    const s = this.currentState()
    if (s.playing && this.shot) {
      let t = s.time + dt
      if (t >= this.shot.duration) t = 0 // loop
      s.setTime(t)
    }
    this.applyTime(s.time)
    this.controls.update()

    // Live recording. Playback-synced recordings sample against the shot
    // clock (the choreography replays underneath); free recordings run on
    // wall time and define the shot duration when stopped.
    if (s.recording) {
      const t = this.recPlaybackSynced ? s.time : (now - this.recStartedAt) / 1000
      // Playback wrapped past the end before the auto-stop fired — end now
      // rather than recording a second lap over the first.
      const lastT =
        this.recTarget === 'camera'
          ? this.recSamples[this.recSamples.length - 1]?.t
          : this.entitySamples[this.entitySamples.length - 1]?.t
      if (this.recPlaybackSynced && lastT !== undefined && t < lastT) {
        s.setRecording(false)
        return
      }
      if (this.recTarget === 'camera') {
        // The shot camera mirrors the free camera — what you see is the shot.
        this.shotCam.position.copy(this.freeCam.position)
        const e = new THREE.Euler().setFromQuaternion(this.freeCam.quaternion, 'YXZ')
        this.shotCam.rotation.set(e.x, e.y, e.z, 'YXZ')
        this.recSamples.push({
          t,
          pos: this.freeCam.position.clone(),
          pan: e.y,
          tilt: e.x,
          roll: e.z
        })
      } else {
        // Puppeteer: the selected entity chases the ground point under the
        // cursor, facing its direction of travel.
        this.raycaster.setFromCamera(this.lastPointerNdc, this.freeCam)
        const point = this.groundHit()
        const visual = this.visuals.get(this.recTarget)
        if (point && visual) {
          const dx = point.x - visual.root.position.x
          const dz = point.z - visual.root.position.z
          if (dx * dx + dz * dz > 1e-6) {
            visual.root.rotation.y = headingOf({ x: dx, y: 0, z: dz })
          }
          visual.root.position.set(point.x, 0, point.z)
          this.entitySamples.push({ t, x: point.x, z: point.z })
        }
      }
      // Auto-stop: at the end of the shot when synced, at 60s otherwise.
      const cap = this.recPlaybackSynced ? (this.shot?.duration ?? 60) - 1 / 60 : 60
      if (t >= cap) s.setRecording(false)
    }

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
    // While recording, the free camera IS the shot camera — a body visual
    // at your own eye position would fill the frame.
    this.cameraBody.visible = !s.lookThrough && s.mode !== 'deliver' && !s.recording

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

      // Picture-in-picture live shot preview (bottom-right): always shows
      // what the SHOT camera sees — chrome-free, like the export will be.
      // (mode is never 'deliver' in this branch — that renders look-through)
      if (s.pipSize !== 'off' && this.shot && !s.recording) {
        const frac = s.pipSize === 'small' ? 0.18 : s.pipSize === 'large' ? 0.42 : 0.28
        const aspect = ASPECT_RATIOS[this.shot.aspect]
        const pw = Math.max(120, Math.round(w * frac))
        const ph = Math.round(pw / aspect)
        const margin = 14
        const px = w - pw - margin
        const py = margin // GL viewport origin is bottom-left

        const overlayWas = this.overlay.visible
        const bodyWas = this.cameraBody.visible
        const selWas = this.selectionBox.visible
        const gizmo = this.transform.getHelper
          ? this.transform.getHelper()
          : (this.transform as unknown as THREE.Object3D)
        const gizmoWas = gizmo.visible
        this.overlay.visible = false
        this.cameraBody.visible = false
        this.selectionBox.visible = false
        gizmo.visible = false

        this.shotCam.aspect = aspect
        this.shotCam.updateProjectionMatrix()
        this.renderer.setScissorTest(true)
        this.renderer.setScissor(px, py, pw, ph)
        this.renderer.setViewport(px, py, pw, ph)
        this.renderer.render(this.scene, this.shotCam)
        this.renderer.setScissorTest(false)

        this.overlay.visible = overlayWas
        this.cameraBody.visible = bodyWas
        this.selectionBox.visible = selWas
        gizmo.visible = gizmoWas
        this.onPipRect?.({ x: px, y: h - py - ph, w: pw, h: ph })
      } else {
        this.onPipRect?.(null)
      }
    }

    // Keep selection box tracking its object. Hide it entirely in
    // look-through/deliver (a camera-selection helper drawn from inside the
    // camera reads as a stray line across the frame).
    if (s.lookThrough || s.mode === 'deliver') {
      this.selectionBox.visible = false
    } else if (s.selection) {
      const obj = this.selectedObject()
      if (obj) {
        this.selectionBox.setFromObject(obj)
        this.selectionBox.visible = true
      }
    }
  }

  /* -------------------------- export render hook ------------------------ */

  /** Camera-to-scene distance range at the CURRENT applied time. */
  private measureDepthRange(): { near: number; far: number } {
    const camPos = this.shotCam.position
    let minD = Infinity
    let maxD = 0
    const box = new THREE.Box3()
    for (const v of this.visuals.values()) {
      box.setFromObject(v.root)
      if (box.isEmpty()) continue
      minD = Math.min(minD, Math.max(0.1, box.distanceToPoint(camPos)))
      const center = box.getCenter(new THREE.Vector3())
      const radius = box.getSize(new THREE.Vector3()).length() / 2
      maxD = Math.max(maxD, camPos.distanceTo(center) + radius)
    }
    if (!isFinite(minD)) return { near: 0.5, far: 30 }
    return { near: minD, far: maxD }
  }

  /**
   * Shot-wide depth range: union of per-frame ranges sampled across the
   * duration, so the exported depth gradient never re-normalizes mid-shot.
   */
  computeShotDepthRange(duration: number, samples = 24): { near: number; far: number } {
    let near = Infinity
    let far = 0
    for (let i = 0; i <= samples; i++) {
      this.applyTime((i / samples) * duration)
      const r = this.measureDepthRange()
      near = Math.min(near, r.near)
      far = Math.max(far, r.far)
    }
    if (!isFinite(near)) return { near: 0.5, far: 30 }
    return { near, far }
  }

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
    opts: { showLabels: boolean; camera?: THREE.Camera; depthRange?: { near: number; far: number } } = {
      showLabels: true
    }
  ): void {
    this.applyTime(t)
    const overlayWas = this.overlay.visible
    this.overlay.visible = false
    // Entities the filmmaker excluded from exports stay editor-only.
    const excludedStates: [THREE.Object3D, boolean][] = []
    for (const v of this.visuals.values()) {
      if (v.entity.excludeFromExport) {
        excludedStates.push([v.root, v.root.visible])
        v.root.visible = false
      }
    }
    // Editor chrome must never reach an export: selection box + gizmo.
    const selectionWas = this.selectionBox.visible
    this.selectionBox.visible = false
    const gizmo = this.transform.getHelper ? this.transform.getHelper() : (this.transform as unknown as THREE.Object3D)
    const gizmoWas = gizmo.visible
    gizmo.visible = false
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
      // Use the shot-wide range when provided (exporter precomputes it so
      // the gradient is temporally stable); fall back to this frame's range.
      const range = opts.depthRange ?? this.measureDepthRange()
      this.depthMaterial.uniforms.uNear!.value = range.near
      this.depthMaterial.uniforms.uFar!.value = Math.max(range.far, range.near + 1)
      this.scene.overrideMaterial = this.depthMaterial
      this.scene.background = new THREE.Color(0x000000)
      this.scene.fog = null
    } else if (pass === 'normal') {
      this.scene.overrideMaterial = this.normalMaterial
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
    // Render twice: the first render after another GL context has touched
    // shared three.js state can differ by one warm-up frame; the second is
    // always converged. Byte-determinism is worth one extra rasterization.
    exportRenderer.render(this.scene, cam)
    exportRenderer.render(this.scene, cam)

    this.scene.overrideMaterial = null
    this.scene.background = bgWas
    this.scene.fog = fogWas
    this.overlay.visible = overlayWas
    this.selectionBox.visible = selectionWas
    gizmo.visible = gizmoWas
    for (const [sprite, was] of labelStates) sprite.visible = was
    for (const [root, was] of excludedStates) root.visible = was
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
