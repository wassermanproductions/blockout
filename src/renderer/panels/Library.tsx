/**
 * Stage-mode asset palette. Browse the built-in catalog grouped by category,
 * filter by name, and arm click-to-place (the Viewport does the drop).
 * Also imports custom 3D models into the project.
 */

import { useMemo, useState } from 'react'
import { ASSET_CATALOG, type AssetSpec } from '@engine/assets'
import type { EntityCategory } from '@engine/types'
import { useStore } from '../store'

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
  { key: 'environment', title: 'Environments' },
  { key: 'primitives', title: 'Primitives' }
]

export function Library(): JSX.Element {
  const [query, setQuery] = useState('')
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
    return CATEGORY_ORDER.map(({ key, title }) => ({
      key,
      title,
      items: ASSET_CATALOG.filter((a) => a.category === key && matches(a))
    })).filter((g) => g.items.length > 0)
  }, [query])

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
      <div className="library-search">
        <input
          type="text"
          placeholder="Search assets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {groups.map((group) => (
        <div className="panel-section" key={group.key}>
          <div className="panel-title">{group.title}</div>
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
        </div>
      ))}

      <div className="panel-section">
        <button className="btn" style={{ width: '100%' }} onClick={() => void onImport()}>
          Import 3D Model…
        </button>
      </div>
    </>
  )
}
