// Modified for cross-platform Windows support in 2026; see MODIFICATIONS.md.
/**
 * Help overlay, redesigned for a filmmaker skimming (not reading):
 *   • Quick start — six visual cards, the whole app at a glance.
 *   • How do I…? — a live-searchable task list distilled from the reference.
 *   • Shortcuts — the keyboard reference as a tidy kbd grid.
 * Opened from the titlebar ?, the welcome screen, or the ? key. Esc closes
 * (wired outside via the helpOpen store flag).
 */

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { useT, type TxKey } from '../../i18n'

const MOD = window.blockout.platform.primaryModifier
const ALT = window.blockout.platform.alternateModifier

function Kbd({ children }: { children: string }): JSX.Element {
  return <kbd className="help-kbd">{children}</kbd>
}

/** Render locale strings that mix **bold** and {kbd:…} / {mod} / {alt}. */
function HelpRich({ text }: { text: string }): JSX.Element {
  const resolved = text.replaceAll('{mod}', MOD).replaceAll('{alt}', ALT)
  const parts = resolved.split(/(\*\*[^*]+\*\*|\{kbd:[^}]+\})/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>
        const kbd = /^\{kbd:(.+)\}$/.exec(p)
        if (kbd) return <Kbd key={i}>{kbd[1]!}</Kbd>
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

const CARDS: { emoji: string; title: TxKey; body: TxKey; then: TxKey }[] = [
  { emoji: '🏗', title: 'help.cardStageTitle', body: 'help.cardStageBody', then: 'help.cardStageThen' },
  { emoji: '🎬', title: 'help.cardSeqTitle', body: 'help.cardSeqBody', then: 'help.cardSeqThen' },
  { emoji: '🚶', title: 'help.cardMoveTitle', body: 'help.cardMoveBody', then: 'help.cardMoveThen' },
  { emoji: '✨', title: 'help.cardAnimateTitle', body: 'help.cardAnimateBody', then: 'help.cardAnimateThen' },
  { emoji: '🎥', title: 'help.cardCamTitle', body: 'help.cardCamBody', then: 'help.cardCamThen' },
  { emoji: '📦', title: 'help.cardDeliverTitle', body: 'help.cardDeliverBody', then: 'help.cardDeliverThen' }
]

const TASK_GROUPS: { area: TxKey; items: { q: TxKey; a: TxKey }[] }[] = [
  {
    area: 'help.areaStage',
    items: [
      { q: 'help.qPlaceSet', a: 'help.aPlaceSet' },
      { q: 'help.qMove', a: 'help.aMove' },
      { q: 'help.qLabel', a: 'help.aLabel' },
      { q: 'help.qPose', a: 'help.aPose' },
      { q: 'help.qMarry', a: 'help.aMarry' },
      { q: 'help.qCrowd', a: 'help.aCrowd' },
      { q: 'help.qLighting', a: 'help.aLighting' },
      { q: 'help.qSky', a: 'help.aSky' },
      { q: 'help.qPopulate', a: 'help.aPopulate' },
      { q: 'help.qImportModel', a: 'help.aImportModel' },
      { q: 'help.qScan', a: 'help.aScan' },
      { q: 'help.qHide', a: 'help.aHide' }
    ]
  },
  {
    area: 'help.areaShoot',
    items: [
      { q: 'help.qWalk', a: 'help.aWalk' },
      { q: 'help.qPuppet', a: 'help.aPuppet' },
      { q: 'help.qTake', a: 'help.aTake' },
      { q: 'help.qMarksHud', a: 'help.aMarksHud' },
      { q: 'help.qCoach', a: 'help.aCoach' },
      { q: 'help.qFight', a: 'help.aFight' },
      { q: 'help.qDance', a: 'help.aDance' },
      { q: 'help.qFly', a: 'help.aFly' },
      { q: 'help.qAction', a: 'help.aAction' },
      { q: 'help.qBoard', a: 'help.aBoard' },
      { q: 'help.qRetime', a: 'help.aRetime' },
      { q: 'help.qSequence', a: 'help.aSequence' },
      { q: 'help.qChoreo', a: 'help.aChoreo' }
    ]
  },
  {
    area: 'help.areaCamera',
    items: [
      { q: 'help.qFrame', a: 'help.aFrame' },
      { q: 'help.qCamMove', a: 'help.aCamMove' },
      { q: 'help.qCamPresets', a: 'help.aCamPresets' },
      { q: 'help.qTrack', a: 'help.aTrack' },
      { q: 'help.qFlyCam', a: 'help.aFlyCam' },
      { q: 'help.qSecondCam', a: 'help.aSecondCam' },
      { q: 'help.qPreview', a: 'help.aPreview' },
      { q: 'help.qRef', a: 'help.aRef' },
      { q: 'help.qDraft', a: 'help.aDraft' }
    ]
  },
  {
    area: 'help.areaDeliver',
    items: [
      { q: 'help.qExport', a: 'help.aExport' },
      { q: 'help.q720', a: 'help.a720' },
      { q: 'help.qFrameExport', a: 'help.aFrameExport' },
      { q: 'help.qLabels', a: 'help.aLabels' },
      { q: 'help.qAnimatic', a: 'help.aAnimatic' },
      { q: 'help.qBlender', a: 'help.aBlender' }
    ]
  },
  {
    area: 'help.areaProjects',
    items: [
      { q: 'help.qPreset', a: 'help.aPreset' },
      { q: 'help.qAngle', a: 'help.aAngle' },
      { q: 'help.qCrash', a: 'help.aCrash' },
      { q: 'help.qAgent', a: 'help.aAgent' }
    ]
  }
]

const SHORTCUTS: [string, TxKey][] = [
  ['Space', 'help.scSpace'],
  ['M', 'help.scM'],
  ['C', 'help.scC'],
  ['G / R', 'help.scGR'],
  ['⇧-click', 'help.scShift'],
  [`${MOD}A / ⇧${MOD}A`, 'help.scSelectAll'],
  [`${MOD}D`, 'help.scDup'],
  ['⌫', 'help.scDel'],
  [`${MOD}Z / ⇧${MOD}Z`, 'help.scUndo'],
  [`${MOD}S`, 'help.scSave'],
  ['1–9', 'help.scJump'],
  [`${ALT}-click`, 'help.scAlt'],
  ['Esc', 'help.scEsc'],
  ['?', 'help.scHelp']
]

const COACH_STEPS: { key: string; label: TxKey; hint: TxKey }[] = [
  { key: 'select', label: 'coach.select', hint: 'coach.selectHint' },
  { key: 'mark1', label: 'coach.mark1', hint: 'coach.mark1Hint' },
  { key: 'mark2', label: 'coach.mark2', hint: 'coach.mark2Hint' },
  { key: 'play', label: 'coach.play', hint: 'coach.playHint' },
  { key: 'record', label: 'coach.record', hint: 'coach.recordHint' },
  { key: 'export', label: 'coach.export', hint: 'coach.exportHint' }
]

export function BlockingCoach(): JSX.Element | null {
  const t = useT()
  const open = useStore((s) => s.coachOpen)
  const setOpen = useStore((s) => s.setCoachOpen)
  const [done, setDone] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open) return
    const check = (): void => {
      const s = useStore.getState()
      setDone((prev) => {
        const next = { ...prev }
        if (s.selection?.kind === 'entity' || s.selection?.kind === 'entities') next.select = true
        const scene = s.scene()
        const shot = s.shot()
        const take = scene?.blocking.find((b) => b.id === shot?.blockingTakeId)
        const maxMarks = take ? Math.max(0, ...take.tracks.map((tr) => tr.marks.length)) : 0
        if (maxMarks >= 1) next.mark1 = true
        if (maxMarks >= 2) next.mark2 = true
        if (s.playing) next.play = true
        if (s.recording) next.record = true
        if (s.mode === 'deliver') next.export = true
        return next
      })
    }
    check()
    const unsub = useStore.subscribe(check)
    return unsub
  }, [open])

  if (!open) return null
  const currentIdx = COACH_STEPS.findIndex((st) => !done[st.key])
  const allDone = currentIdx === -1

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        width: 300,
        zIndex: 30,
        background: 'var(--panel, #16181d)',
        border: '1px solid var(--border-strong, #33343a)',
        borderRadius: 10,
        padding: '14px 16px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.45)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 15 }}>🎯</span>
        <b style={{ fontSize: 13 }}>{t('coach.title')}</b>
        <span style={{ flex: 1 }} />
        <button className="btn small" style={{ padding: '2px 8px' }} onClick={() => setOpen(false)} title={t('coach.dismiss')}>
          ✕
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {COACH_STEPS.map((st, i) => {
          const isDone = !!done[st.key]
          const isCurrent = i === currentIdx
          return (
            <div key={st.key} style={{ display: 'flex', gap: 8, opacity: isDone ? 0.7 : isCurrent ? 1 : 0.5 }}>
              <span style={{ fontSize: 13 }}>{isDone ? '✅' : isCurrent ? '▶' : '○'}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, textDecoration: isDone ? 'line-through' : 'none' }}>
                  {t(st.label)}
                </div>
                {isCurrent && <div style={{ fontSize: 11, color: 'var(--text-faint, #8a8d96)', marginTop: 2 }}>{t(st.hint)}</div>}
              </div>
            </div>
          )
        })}
      </div>
      {allDone && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--success, #46a758)' }}>{t('coach.done')}</div>
      )}
    </div>
  )
}

type Tab = 'quickstart' | 'tasks' | 'shortcuts'

export function HelpOverlay(): JSX.Element | null {
  const t = useT()
  const helpOpen = useStore((s) => s.helpOpen)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  const setCoachOpen = useStore((s) => s.setCoachOpen)
  const [tab, setTab] = useState<Tab>('quickstart')
  const [query, setQuery] = useState('')

  const groups = useMemo(
    () =>
      TASK_GROUPS.map((g) => ({
        area: t(g.area),
        items: g.items.map((item) => ({ q: t(item.q), a: t(item.a) }))
      })),
    [t]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        area: g.area,
        items: g.items.filter((item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q))
      }))
      .filter((g) => g.items.length > 0)
  }, [query, groups])

  if (!helpOpen) return null

  return (
    <div className="help-backdrop" onClick={() => setHelpOpen(false)}>
      <div className="help-modal help-v4" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <div className="seg help-tabs">
            <button className={tab === 'quickstart' ? 'active' : ''} onClick={() => setTab('quickstart')}>
              {t('help.quickstart')}
            </button>
            <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
              {t('help.howDoI')}
            </button>
            <button className={tab === 'shortcuts' ? 'active' : ''} onClick={() => setTab('shortcuts')}>
              {t('help.shortcuts')}
            </button>
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn small" onClick={() => setHelpOpen(false)}>
            {t('help.done')}
          </button>
        </div>

        <div className="help-body help-v4-body">
          {tab === 'quickstart' && (
            <div className="help-v4-inner">
              <p className="help-intro">
                <HelpRich text={t('help.intro')} />
              </p>
              <div className="help-cards">
                {CARDS.map((c) => (
                  <div key={c.title} className="help-card">
                    <div className="help-card-emoji">{c.emoji}</div>
                    <div className="help-card-title">{t(c.title)}</div>
                    <div className="help-card-body">{t(c.body)}</div>
                    <div className="help-card-then">{t(c.then)}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  className="btn"
                  onClick={() => {
                    setCoachOpen(true)
                    setHelpOpen(false)
                  }}
                  title={t('help.startCoachTitle')}
                >
                  {t('help.startCoach')}
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('help.coachHint')}</span>
              </div>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="help-v4-inner">
              <input
                className="help-search"
                type="text"
                placeholder={t('help.search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {filtered.length === 0 ? (
                <p className="help-empty">{t('help.empty', { query })}</p>
              ) : (
                filtered.map((group) => (
                  <div key={group.area} className="help-task-group">
                    <div className="help-task-area">{group.area}</div>
                    {group.items.map((item) => (
                      <div key={item.q} className="help-task">
                        <div className="help-task-q">{item.q}</div>
                        <div className="help-task-a">
                          <HelpRich text={item.a} />
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'shortcuts' && (
            <div className="help-v4-inner">
              <p className="help-intro">{t('help.shortcutsIntro')}</p>
              <div className="help-kbd-grid">
                {SHORTCUTS.map(([key, desc]) => (
                  <div key={key} className="help-kbd-row">
                    <div className="help-kbd-keys">
                      {key.split(' / ').map((k, i, arr) => (
                        <span key={k}>
                          <Kbd>{k}</Kbd>
                          {i < arr.length - 1 ? <span className="help-kbd-sep"> / </span> : null}
                        </span>
                      ))}
                    </div>
                    <div className="help-kbd-desc">{t(desc)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
