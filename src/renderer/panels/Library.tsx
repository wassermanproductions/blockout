/**
 * Stage-mode asset palette. Browse the built-in catalog grouped by category,
 * filter by name, and arm click-to-place (the Viewport does the drop).
 * Also imports custom 3D models into the project.
 */

import { useEffect, useMemo, useState } from 'react'
import { ASSET_CATALOG, type AssetSpec } from '@engine/assets'
import type { EntityCategory } from '@engine/types'
import { useStore } from '../store'
import { populateFromReference } from '../ai/populate'

interface PresetInfo {
  id: string
  name: string
  savedAt: string
  entityCount: number
}

/**
 * Globally persistent stage presets ("Dinner scene", "Driving scene"):
 * save the current staging once, reuse it as a starting point in any
 * project — applying stages a fresh copy, never touching the original.
 */
function StagePresets(): JSX.Element {
  const [presets, setPresets] = useState<PresetInfo[]>([])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const saveStagePreset = useStore((s) => s.saveStagePreset)
  const applyStagePreset = useStore((s) => s.applyStagePreset)
  const scene = useStore((s) => s.doc?.scenes.find((sc) => sc.id === s.sceneId))
  const toast = useStore((s) => s.toast)

  const refresh = async (): Promise<void> => {
    try {
      setPresets(await window.blockout.presetsList())
    } catch {
      /* first run: presets dir may not exist yet */
    }
  }
  useEffect(() => {
    void refresh()
  }, [])

  const onSave = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    await saveStagePreset(trimmed)
    setNaming(false)
    setName('')
    await refresh()
  }

  const onDelete = async (p: PresetInfo): Promise<void> => {
    await window.blockout.presetDelete(p.id)
    toast(`Preset "${p.name}" deleted.`, 'info')
    await refresh()
  }

  return (
    <div className="panel-section">
      <div className="panel-title">Stage Presets</div>
      {presets.length === 0 && !naming && (
        <div className="empty-hint" style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
          Save a staging you'll reuse — a dinner scene, a driving setup — and
          start from it in any project.
        </div>
      )}
      {presets.map((p) => (
        <div
          key={p.id}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}
        >
          <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${p.entityCount} items · saved ${new Date(p.savedAt).toLocaleDateString()}`}>
            {p.name}
          </span>
          <button
            className="btn small"
            onClick={() => void applyStagePreset(p.id)}
            title="Stage this preset as a NEW scene — the preset itself stays untouched"
          >
            Stage
          </button>
          <button className="btn small" onClick={() => void onDelete(p)} title="Delete this preset">
            ✕
          </button>
        </div>
      ))}
      {naming ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            type="text"
            autoFocus
            placeholder="Preset name… e.g. Dinner scene"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onSave()
              if (e.key === 'Escape') setNaming(false)
            }}
            style={{ flex: 1 }}
          />
          <button className="btn small primary" onClick={() => void onSave()}>
            Save
          </button>
        </div>
      ) : (
        <button
          className="btn"
          style={{ width: '100%', marginTop: 6 }}
          disabled={(scene?.entities.length ?? 0) === 0}
          onClick={() => setNaming(true)}
          title="Save this scene's staging (set, characters, blocking) as a reusable preset available in every project"
        >
          ＋ Save current staging as preset
        </button>
      )}
    </div>
  )
}

/** Emoji thumb per catalog id. '📦' is the fallback for anything unmapped. */
const THUMBS: Record<string, string> = {
  // People
  'person.man': '🚶',
  'person.woman': '👩',
  'person.child': '🧒',
  'person.elderly': '🧓',
  // Animals
  'animal.dog': '🐕',
  'animal.cat': '🐈',
  'animal.horse': '🐎',
  'animal.bird': '🐦',
  // Vehicles
  'vehicle.sedan': '🚗',
  'vehicle.suv': '🚙',
  'vehicle.pickup': '🛻',
  'vehicle.van': '🚐',
  'vehicle.bus': '🚌',
  'vehicle.truck': '🚚',
  'vehicle.tank': '🪖',
  'vehicle.train': '🚆',
  'vehicle.motorcycle': '🏍',
  'vehicle.bicycle': '🚲',
  'vehicle.plane': '✈️',
  'vehicle.boat': '🛥',
  // Furniture & props
  'furniture.bed': '🛏',
  'furniture.couch': '🛋',
  'furniture.armchair': '🛋',
  'furniture.diningTable': '🍽',
  'furniture.kitchenTable': '🍽',
  'furniture.desk': '🖥',
  'furniture.sideTable': '🪵',
  'furniture.lamp': '💡',
  'furniture.chair': '🪑',
  'furniture.stool': '🪑',
  'furniture.bar': '🍸',
  'furniture.counter': '🍳',
  'furniture.shelf': '🗄',
  'furniture.tv': '📺',
  'furniture.tableSetting': '🍽',
  'furniture.door': '🚪',
  'furniture.window': '🪟',
  'furniture.fridge': '🧊',
  'furniture.stove': '🍳',
  'furniture.sinkCounter': '🚰',
  'furniture.toilet': '🚽',
  'furniture.bathtub': '🛁',
  'furniture.showerStall': '🚿',
  'furniture.officeChair': '🪑',
  'furniture.filingCabinet': '🗄',
  'furniture.whiteboard': '📋',
  'furniture.podium': '🎤',
  'furniture.monitor': '🖥',
  'furniture.pianoUpright': '🎹',
  'furniture.poolTable': '🎱',
  'furniture.hospitalBed': '🛏',
  'furniture.wheelchair': '🦽',
  'furniture.crib': '🍼',
  'furniture.fireplace': '🔥',
  'furniture.chandelier': '💡',
  'furniture.rug': '🟫',
  'furniture.curtain': '🪟',
  'furniture.bookshelfFull': '📚',
  'furniture.doorOpen': '🚪',
  // Props
  'prop.phone': '📱',
  'prop.laptop': '💻',
  'prop.cup': '🥤',
  'prop.mug': '☕',
  'prop.bowl': '🥣',
  'prop.plate': '🍽',
  'prop.bottle': '🍾',
  'prop.wineglass': '🍷',
  'prop.book': '📕',
  'prop.newspaper': '📰',
  'prop.briefcase': '💼',
  'prop.suitcase': '🧳',
  'prop.backpack': '🎒',
  'prop.umbrella': '🌂',
  'prop.hat': '🎩',
  'prop.baseballBat': '🏏',
  'prop.sword': '🗡',
  'prop.torch': '🔦',
  'prop.candle': '🕯',
  'prop.lantern': '🏮',
  'prop.pictureFrame': '🖼',
  'prop.poster': '📃',
  'prop.mirror': '🪞',
  'prop.clock': '🕐',
  'prop.ball': '⚽',
  'prop.balloon': '🎈',
  'prop.microphone': '🎤',
  'prop.guitar': '🎸',
  'prop.camera': '🎥',
  'prop.tripod': '📷',
  'prop.tree': '🌳',
  'prop.bush': '🌿',
  'prop.rock': '🪨',
  'prop.streetlightSingle': '🏮',
  'prop.trafficLight': '🚦',
  'prop.stopSign': '🛑',
  'prop.fireHydrant': '🧯',
  'prop.mailbox': '📮',
  'prop.trashcan': '🗑',
  'prop.dumpster': '🗑',
  'prop.trafficCone': '🚧',
  'prop.barrier': '🚧',
  'prop.fence': '🚧',
  'prop.bench': '🪑',
  'prop.phoneBooth': '☎️',
  'prop.atm': '🏧',
  'prop.vendingMachine': '🥤',
  'prop.shoppingCart': '🛒',
  'prop.ladder': '🪜',
  'prop.scaffold': '🏗',
  'prop.crate': '📦',
  'prop.barrel': '🛢',
  'prop.pallet': '🪵',
  'prop.tent': '⛺',
  'prop.campfire': '🔥',
  'prop.poolWater': '💧',
  'prop.fountain': '⛲',
  'prop.flagpole': '🚩',
  'prop.helicopter': '🚁',
  // Props — backyard / recreation
  'prop.hotTub': '🛁',
  'prop.bbqGrill': '🍖',
  'prop.firepit': '🔥',
  'prop.poolLounger': '🏖',
  'prop.patioUmbrellaTable': '⛱',
  'prop.picnicTable': '🧺',
  'prop.swingSet': '🎠',
  'prop.slide': '🛝',
  'prop.seesaw': '🪅',
  'prop.sandbox': '🏖',
  'prop.trampoline': '🤸',
  'prop.kiddiePool': '💧',
  'prop.basketballHoop': '🏀',
  'prop.soccerGoal': '🥅',
  'prop.doghouse': '🐕',
  'prop.shed': '🛖',
  'prop.gazebo': '⛺',
  'prop.hammock': '🌴',
  'prop.lawnmower': '🚜',
  // Props — commercial / street
  'prop.cashRegister': '🧾',
  'prop.kiosk': '🏪',
  'prop.gasPump': '⛽',
  'prop.parkingMeter': '🅿️',
  'prop.busShelter': '🚏',
  'prop.slotMachine': '🎰',
  'prop.cloud': '☁️',
  'prop.squirtGun': '🔫',
  // Environments
  'env.houseInterior': '🏠',
  'env.houseExterior': '🏡',
  'env.cityStreet': '🏙',
  'env.store': '🏪',
  'env.nightclub': '🪩',
  'env.office': '🏢',
  'env.warehouse': '🏭',
  'env.carInterior': '💺',
  'env.busInterior': '💺',
  'env.planeCabin': '✈️',
  'env.field': '🌾',
  'env.desert': '🏜',
  'env.parkingLot': '🅿️',
  'env.alley': '🌃',
  'env.rooftop': '🏙',
  'env.restaurant': '🍽',
  'env.hospitalRoom': '🏥',
  'env.classroom': '🏫',
  'env.gym': '🏋',
  'env.courtroom': '⚖️',
  'env.subwayPlatform': '🚇',
  'env.beach': '🏖',
  'env.forest': '🌲',
  'env.bar': '🍺',
  'env.stage': '🎭',
  // Environments — round 5 interiors
  'env.trainInterior': '🚃',
  'env.boatInterior': '⛵',
  'env.postOffice': '📮',
  'env.supermarket': '🛒',
  'env.movieTheater': '🎬',
  'env.indoorMall': '🛍',
  'env.hotelLobby': '🏨',
  'env.hotelRoom': '🛎',
  'env.diner': '🍔',
  'env.coffeeShop': '☕',
  'env.policeStation': '🚓',
  'env.church': '⛪',
  'env.schoolHallway': '🏫',
  'env.airportTerminal': '🛫',
  'env.casino': '🎰',
  'env.parkingGarage': '🅿️',
  // Environments — round 5 exteriors
  'env.stripMall': '🏬',
  'env.outdoorMall': '🛍',
  'env.residentialStreet': '🏘',
  'env.downtown': '🌆',
  'env.trainStation': '🚉',
  'env.gasStation': '⛽',
  'env.park': '🏞',
  'env.playgroundPark': '🛝',
  'env.backyard': '🏡',
  'env.constructionSite': '🏗',
  'env.cemetery': '🪦',
  'env.stadium': '🏟',
  'env.sky': '☁️',
  'env.houseFull': '🏠',
  // Primitives
  'prim.cube': '⬜',
  'prim.cylinder': '⚪',
  'prim.ramp': '📐',
  'prim.wall': '🧱',
  'prim.stairs': '🪜'
}

function thumbFor(id: string): string {
  return THUMBS[id] ?? '📦'
}

/** Fixed display order of categories with human-readable titles. */
const CATEGORY_ORDER: { key: EntityCategory; title: string }[] = [
  { key: 'people', title: 'People' },
  { key: 'animals', title: 'Animals' },
  { key: 'vehicles', title: 'Vehicles' },
  { key: 'furniture', title: 'Furniture' },
  { key: 'props', title: 'Props' },
  { key: 'environment', title: 'Environments' },
  { key: 'primitives', title: 'Primitives' }
]

export function Library(): JSX.Element {
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<EntityCategory | 'all'>('all')
  const [collapsed, setCollapsed] = useState<Partial<Record<EntityCategory, boolean>>>({})
  const placingAssetId = useStore((s) => s.placingAssetId)
  const setPlacingAsset = useStore((s) => s.setPlacingAsset)
  const addEntity = useStore((s) => s.addEntity)
  const mutate = useStore((s) => s.mutate)
  const projectFolder = useStore((s) => s.projectFolder)
  const toast = useStore((s) => s.toast)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (a: AssetSpec): boolean =>
      q === '' ||
      a.name.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
    return CATEGORY_ORDER.filter(
      ({ key }) => categoryFilter === 'all' || key === categoryFilter
    ).map(({ key, title }) => ({
      key,
      title,
      items: ASSET_CATALOG.filter((a) => a.category === key && matches(a))
    })).filter((g) => g.items.length > 0)
  }, [query, categoryFilter])

  const toggleCollapsed = (key: EntityCategory): void =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }))

  const onPick = (id: string): void => {
    if (placingAssetId === id) setPlacingAsset(null)
    else setPlacingAsset(id)
  }

  const onImport = async (): Promise<void> => {
    const path = await window.blockout.pickFile([
      { name: '3D Models', extensions: ['glb', 'gltf', 'obj'] }
    ])
    if (!path) return
    if (!projectFolder) {
      toast('Open or save a project before importing models.', 'error')
      return
    }
    try {
      const result = await window.blockout.importAsset(projectFolder, path)
      const entityId = addEntity(`custom.${result.name}`, { x: 0, y: 0, z: 0 })
      mutate('import model', (doc) => {
        for (const scene of doc.scenes) {
          const entity = scene.entities.find((e) => e.id === entityId)
          if (entity) {
            entity.sourceFile = result.relativePath
            break
          }
        }
      })
      toast(`Imported ${result.name}`, 'success')
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`, 'error')
    }
  }

  return (
    <>
      <StagePresets />

      <div className="library-search">
        <input
          type="text"
          placeholder="Search assets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Browse controls: filter to one category, or place from a list. */}
      <div className="panel-section" style={{ paddingBottom: 4 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as EntityCategory | 'all')}
            title="Show one category at a time"
          >
            <option value="all">All categories</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c.key} value={c.key}>
                {c.title}
              </option>
            ))}
          </select>
          <select
            value={placingAssetId && ASSET_CATALOG.some((a) => a.id === placingAssetId) ? placingAssetId : ''}
            onChange={(e) => setPlacingAsset(e.target.value || null)}
            title="Pick from the full list — then click the floor to place it"
          >
            <option value="">Place from list…</option>
            {CATEGORY_ORDER.map((c) => (
              <optgroup key={c.key} label={c.title}>
                {ASSET_CATALOG.filter((a) => a.category === c.key).map((a) => (
                  <option key={a.id} value={a.id}>
                    {thumbFor(a.id)} {a.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {groups.map((group) => (
        <div className="panel-section" key={group.key}>
          <div
            className="panel-title"
            style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between' }}
            onClick={() => toggleCollapsed(group.key)}
            title={collapsed[group.key] ? 'Expand' : 'Collapse'}
          >
            <span>
              {group.title} <span style={{ opacity: 0.5 }}>({group.items.length})</span>
            </span>
            <span style={{ opacity: 0.6 }}>{collapsed[group.key] ? '▸' : '▾'}</span>
          </div>
          {collapsed[group.key] ? null : (
            <div className="library-grid">
              {group.items.map((asset) => (
                <div
                  key={asset.id}
                  className={`library-item${placingAssetId === asset.id ? ' placing' : ''}`}
                  onClick={() => onPick(asset.id)}
                >
                  <span className="thumb">{thumbFor(asset.id)}</span>
                  <span className="name">{asset.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="panel-section">
        <button
          className="btn primary"
          style={{ width: '100%', marginBottom: 8 }}
          onClick={() => void populateFromReference()}
          title="Give Claude a reference photo or video frame — it stages the scene to match: people, furniture, poses, lighting, and a camera to match the framing"
        >
          ✨ Populate from reference…
        </button>
        <button className="btn" style={{ width: '100%' }} onClick={() => void onImport()}>
          Import 3D Model…
        </button>
      </div>
    </>
  )
}
