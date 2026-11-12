import { useReactFlow } from '@xyflow/react'
import { LayoutGrid, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { CableTool, Device, DeviceModel } from '../../domain'
import { usePreference } from '../../preferences'
import { focusRing } from '../shared/focusRing'
import { useMediaQuery } from '../shared/useMediaQuery'
import { SimplePduHint, SimulationToolbar, useSimulation } from '../simulation'
import CableHint from './cable/CableHint'
import PortPicker from './cable/PortPicker'
import SsidPicker from './cable/SsidPicker'
import { useCableTool } from './cable/useCableTool'
import { useOfferedCableTools } from './cable/useOfferedCableTools'
import { AnnotationActionsContext, type AnnotationActions } from './canvas/annotationActions'
import CanvasToolbar from './canvas/CanvasToolbar'
import { EMPTY_SELECTION, type WorkspaceNode, type WorkspaceSelection } from './canvas/canvasTypes'
import { annotationIdOf } from './canvas/flowElements'
import { SelectionModel } from './canvas/SelectionModel'
import { useSnapPreference } from './canvas/useSnapPreference'
import WorkspaceCanvas from './canvas/WorkspaceCanvas'
import type { WorkspaceCommand } from './keyboard/ShortcutResolver'
import { useWorkspaceKeyboard } from './keyboard/useWorkspaceKeyboard'
import { deviceCatalog, hasTerminal, labEditor, type ExerciseLockPolicy, type LabDocumentState } from './labServices'
import DevicePalette from './palette/DevicePalette'
import type { PaletteProps } from './palette/paletteProps'
import WorkspacePaletteSlot from './palette/WorkspacePaletteSlot'
import DeviceTabs from './panels/DeviceTabs'
import PropertiesPanel from './panels/PropertiesPanel'
// PU (Preferences): CLI as the default device tab.
import { showsConsole, type DeviceTab } from './panels/deviceTabModel'
import { useDeviceTabState } from './panels/useDeviceTabState'
import ShortcutsHelp from './panels/ShortcutsHelp'
import { useDeviceTerminals } from './terminal/useDeviceTerminals'
import ToastRegion from './ToastRegion'
import { useDeviceEditing } from './useDeviceEditing'
import type { ToastControls } from './useToasts'
import { useWorkspaceActions } from './useWorkspaceActions'
import DeviceWindowLayer from './windows/DeviceWindowLayer'
import { useDeviceWindows } from './windows/useDeviceWindows'
import WindowModeProperties, { type WindowModeSelection } from './windows/WindowModeProperties'
import WorkspaceHeader from './WorkspaceHeader'

// Simulation (U3): the panel and the packets on the map load when first needed.
const SimulationPanel = lazy(() => import('../simulation/SimulationPanel'))
const SimulationMapLayer = lazy(() => import('../simulation/SimulationMapLayer'))

export interface WorkspaceViewProps {
  lab: LabDocumentState
  /** Exercise locks; `ExerciseLockPolicy.none` in a free lab. */
  policy: ExerciseLockPolicy
  toasts: ToastControls
  /** Start of the header (home + title + File menu, or back link + exercise title). */
  headerStart: ReactNode
  headerEnd?: ReactNode
  /** Above the canvas, e.g. the exercise's complaint. */
  banner?: ReactNode
  /** Below everything, e.g. the exercise's notes and Verify button. */
  footer?: ReactNode
  /** Exercise mode: the notes live in the footer, an empty selection shows a hint. */
  exerciseMode?: boolean
  /** Explanation next to a lock icon in the toolbar (exercise with a locked topology). */
  lockedNote?: string
  /** Design (D2): models the palette offers (a brief's allowed models); default: the whole catalog. */
  paletteModels?: readonly DeviceModel[]
  /** Design (D2): price text on palette tiles (a brief with a budget); undefined = no prices. */
  priceLabelOf?: (modelId: string) => string | undefined
  /** Design (D2): a panel between the canvas and the properties panel (the brief on wide screens). */
  sidePanel?: ReactNode
  /** Live labs: hint on an empty map instead of "drag devices here". */
  emptyCanvasText?: string
}

/** The lab builder: header, device palette, canvas with tools, properties panel with device tabs. */
function WorkspaceView(props: WorkspaceViewProps) {
  const { lab, policy, toasts, headerStart, headerEnd, banner, footer, lockedNote } = props
  const exerciseMode = props.exerciseMode ?? false
  // Design (D2): brief palette filter and prices.
  const paletteModels = props.paletteModels ?? deviceCatalog
  const priceLabelOf = props.priceLabelOf
  const { t } = useTranslation('workspace')
  const flow = useReactFlow<WorkspaceNode>()
  const { doc } = lab
  const editable = !policy.topologyLocked
  // Live labs: a watched, read-only lab; map notes and lab notes cannot be selected or edited either.
  const notesLocked = policy.annotationsLocked
  const canvasRef = useRef<HTMLDivElement>(null)
  const [rawSelection, setSelection] = useState<WorkspaceSelection>(EMPTY_SELECTION)
  const selection = useMemo(() => {
    const pruned = SelectionModel.prune(rawSelection, doc)
    return notesLocked && pruned.annotationIds.length > 0 ? { ...pruned, annotationIds: [] } : pruned
  }, [doc, notesLocked, rawSelection])
  const { snapToGrid, toggle: toggleSnap } = useSnapPreference()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [deviceTab, setDeviceTab] = useDeviceTabState()
  const wide = useMediaQuery('(min-width: 1024px)')
  const cable = useCableTool({ lab, editor: labEditor, notify: toasts.show })
  const cableTools = useOfferedCableTools()
  const actions = useWorkspaceActions({ lab, editor: labEditor, selection, policy, snapToGrid, canvasRef })
  const editing = useDeviceEditing(lab, labEditor, policy)
  const selectedCount = SelectionModel.count(selection)
  const deletableCount = SelectionModel.count(policy.allowedDeletion(selection))
  const selectedDevice = selectedCount === 1 && selection.deviceIds.length === 1 ? doc.state.devices.find((device) => device.id === selection.deviceIds[0]) : undefined
  // One device with its CLI or terminal open: a wider panel, so 80-column console output does not wrap.
  // Not next to a lesson or design brief panel: the map would be squeezed too much.
  const consoleOpen = props.sidePanel === undefined && selectedDevice !== undefined && showsConsole(selectedDevice, policy, hasTerminal(selectedDevice) && policy.canUseTerminal(selectedDevice.id), deviceTab)
  // Preferences → Appearance: device tabs in floating windows instead of the right panel (wide screens only).
  const [deviceDetails] = usePreference('appearance.deviceDetails')
  const windowMode = wide && deviceDetails === 'window'
  const deviceIds = useMemo(() => doc.state.devices.map((device) => device.id), [doc.state.devices])
  const windows = useDeviceWindows(lab.labId, deviceIds)
  const nameOf = useCallback(
    (deviceId: string) => doc.state.devices.find((device) => device.id === deviceId)?.name ?? deviceId,
    [doc],
  )
  // Simulation (U3, I3): one simulator per open lab; mode switch, Simple PDU tool, map packets, panel.
  const simulation = useSimulation({ network: doc.state, labId: lab.labId, nameOf, notify: toasts.show, title: doc.meta.title })
  // Simulation (I3): the terminals run on the same simulator.
  const terminals = useDeviceTerminals(lab, simulation.terminal)

  // A different lab was opened (autosave restore, File menu, exercise): show all of it.
  useEffect(() => {
    // Two frames: React Flow measures the new nodes first, then the view fits all of them.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => void flow.fitView({ padding: 0.3, maxZoom: 1.25 }))
    })
    return () => cancelAnimationFrame(frame)
  }, [flow, lab.labId])

  const annotationActions = useMemo<AnnotationActions>(
    () => ({
      editingId,
      // A locked note is not opened for editing (live labs).
      startEditing: notesLocked ? () => undefined : setEditingId,
      commitText: (annotationId, text) => {
        // A late blur of another note's editor must not close the one just opened.
        setEditingId((current) => (current === annotationId ? null : current))
        actions.setNoteText(annotationId, text)
      },
      cancelEditing: () => setEditingId(null),
    }),
    [actions, editingId, notesLocked],
  )

  function addNote() {
    const id = actions.addNoteAtCentre()
    setSelection(SelectionModel.only('annotationIds', id))
    setEditingId(id)
  }

  function addModel(modelId: string) {
    actions.addModelAtCentre(modelId)
    setPaletteOpen(false)
  }

  function chooseCableFromPalette(tool: CableTool) {
    chooseCable(tool)
    setPaletteOpen(false)
  }

  /** Window mode: double-click or Enter on a device opens its window (not while a cable or PDU tool picks devices). */
  function openWindow(deviceId: string) {
    if (!windowMode || cable.state.active || simulation.pduTool.active) return
    windows.open(deviceId, deviceTab)
  }

  /** Simulation (U3): a cable tool and the Simple PDU tool never run together. */
  function chooseCable(tool: CableTool) {
    simulation.pduTool.cancel()
    cable.choose(tool)
  }

  function runCommand(command: WorkspaceCommand) {
    switch (command.kind) {
      case 'undo':
        return lab.undo()
      case 'redo':
        return lab.redo()
      case 'delete':
        return deletableCount > 0 ? actions.deleteSelection() : undefined
      case 'escape':
        if (shortcutsOpen) return setShortcutsOpen(false)
        if (cable.state.active) return cable.back()
        if (simulation.pduTool.active) return simulation.pduTool.back()
        return setSelection(EMPTY_SELECTION)
      case 'cableTool':
        if (!editable) return undefined
        return cable.state.active ? cable.stop() : cable.choose(cableTools[0] ?? 'auto')
      case 'selectAll':
        return setSelection(SelectionModel.all(doc))
      case 'showShortcuts':
        return setShortcutsOpen((open) => !open)
      case 'nudge':
        return selectedCount > 0 ? actions.nudge(command.dx, command.dy) : undefined
    }
  }

  useWorkspaceKeyboard(
    {
      run: runCommand,
      activateNode: (nodeId) => {
        const annotationId = annotationIdOf(nodeId)
        if (annotationId !== null) setEditingId(annotationId)
        else if (cable.state.active) cable.clickDevice(nodeId)
        else if (simulation.pduTool.active) simulation.pduTool.click(nodeId)
        else openWindow(nodeId)
      },
    },
    snapToGrid,
  )

  // Device palette: sidebar or bottom bar on wide screens (Preferences), drawer on phones.
  const paletteProps: PaletteProps = { models: paletteModels, priceLabelOf, onAdd: addModel, onChooseCable: chooseCableFromPalette, activeCable: cable.state.tool }
  const menu = cable.state.portMenu
  const menuDevice = menu ? doc.state.devices.find((device) => device.id === menu.deviceId) : undefined
  const step = cable.state.step

  /** The device's tabs on `tab`: in the properties panel (one shared tab) or in its window (its own tab). */
  const renderTabs = (device: Device, tab: DeviceTab, onTab: (tab: DeviceTab) => void) => {
    const terminalOpen = hasTerminal(device) && policy.canUseTerminal(device.id)
    return (
      <DeviceTabs
        // CI (CLI integration): the CLI keeps one console per device of the open lab.
        labId={lab.labId}
        device={device}
        state={doc.state}
        policy={policy}
        tab={tab}
        onTab={onTab}
        problems={editing.problemsOf(device.id)}
        onUpdate={editing.update}
        terminal={
          terminalOpen
            ? {
                lines: terminals.linesOf(device.id),
                hiddenCount: terminals.hiddenCountOf(device.id),
                onRun: (line) => terminals.run(device.id, line),
                onClear: () => terminals.clear(device.id),
              }
            : null
        }
      />
    )
  }

  const renderDevice = (device: Device) => (
    <div key={device.id} className="space-y-3">
      <h3 className="break-words text-base font-semibold text-fg-strong">{device.name}</h3>
      {renderTabs(device, deviceTab, setDeviceTab)}
    </div>
  )

  // Window mode: a single selected device has its window; other selections get a properties card.
  let windowSelection: WindowModeSelection = { kind: 'other' }
  if (selectedCount === 0) windowSelection = { kind: 'none' }
  else if (selectedDevice !== undefined) {
    const shown = windows.windows.some((entry) => entry.deviceId === selectedDevice.id && !entry.minimised)
    windowSelection = { kind: 'device', device: selectedDevice, shown }
  }

  const properties = (onClose?: () => void) => (
    <PropertiesPanel
      doc={doc}
      selection={selection}
      policy={policy}
      renderDevice={renderDevice}
      onDisconnect={(linkId) => lab.apply((current) => labEditor.disconnect(current, linkId))}
      onSetLinkConnected={(linkId, connected) => lab.apply((current) => labEditor.setLinkConnected(current, linkId, connected))}
      onAnnotationChange={(annotation) => lab.apply((current) => labEditor.updateAnnotation(current, annotation))}
      onNoteText={actions.setNoteText}
      onDeleteSelection={actions.deleteSelection}
      onNotes={exerciseMode || notesLocked ? undefined : actions.setNotes}
      onClose={onClose}
    />
  )

  return (
    <div className="flex h-dvh flex-col bg-surface-muted text-fg-strong">
      <WorkspaceHeader
        start={headerStart}
        end={headerEnd}
        canUndo={lab.canUndo}
        canRedo={lab.canRedo}
        historyShown={!notesLocked}
        onUndo={lab.undo}
        onRedo={lab.redo}
        shortcutsOpen={shortcutsOpen}
        onToggleShortcuts={() => setShortcutsOpen((open) => !open)}
      />
      {banner}
      <div className="relative flex min-h-0 flex-1">
        {editable && <WorkspacePaletteSlot atBottom={false} {...paletteProps} />}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Simulation (U3): the mode switch sits at the end of the canvas toolbar. */}
          <div className="flex min-w-0">
            <div className="min-w-0 flex-1">
              <CanvasToolbar
                activeTool={cable.state.tool}
                onSelectTool={() => {
                  cable.stop()
                  simulation.pduTool.cancel()
                }}
                onChooseCable={chooseCable}
                cablesEnabled={editable}
                lockedNote={lockedNote}
                onAddNote={notesLocked ? undefined : addNote}
                canDelete={deletableCount > 0}
                onDelete={actions.deleteSelection}
                snapToGrid={snapToGrid}
                onToggleSnap={toggleSnap}
                canAlign={(editable ? selection.deviceIds.length : 0) + selection.annotationIds.length > 1}
                onAlign={actions.align}
              />
            </div>
            <SimulationToolbar simulation={simulation} onToolStart={cable.stop} />
          </div>
          <div className="relative min-h-0 flex-1">
            <AnnotationActionsContext.Provider value={annotationActions}>
              <WorkspaceCanvas
                doc={doc}
                selection={selection}
                onSelectionChange={setSelection}
                onCommitMoves={actions.commitMoves}
                onDropModel={actions.addModelAt}
                onDeviceClick={(deviceId) => {
                  if (cable.state.active) cable.clickDevice(deviceId)
                  else if (simulation.pduTool.active) simulation.pduTool.click(deviceId)
                }}
                onDeviceOpen={openWindow}
                // Simulation (U3): picking Simple PDU ends works like cabling (no selection, crosshair).
                cableActive={cable.state.active || simulation.pduTool.active}
                cableHighlight={cable.highlightOf}
                snapToGrid={snapToGrid}
                devicesDraggable={editable}
                annotationsLocked={notesLocked}
                emptyText={props.emptyCanvasText}
                screenToFlow={flow.screenToFlowPosition}
                canvasRef={canvasRef}
                // Exercise on a phone: the footer grows with the failed checks; the map is fitted again.
                refitOnResize={exerciseMode}
              >
                <CableHint state={cable.state} nameOf={nameOf} />
                {/* Simulation (U3) */}
                {(simulation.mode === 'simulation' || simulation.replay !== null) && (
                  <Suspense fallback={null}>
                    <SimulationMapLayer simulation={simulation} layout={doc.layout} links={doc.state.links} nameOf={nameOf} />
                  </Suspense>
                )}
                <SimplePduHint state={simulation.pduTool.state} nameOf={nameOf} />
                {menu && menuDevice && (
                  <PortPicker
                    device={menuDevice}
                    end={menu.end}
                    options={cable.portOptions}
                    nameOf={nameOf}
                    onPick={cable.pickPort}
                    onClose={cable.back}
                  />
                )}
                {step.kind === 'ssid' && (
                  <SsidPicker nodeId={step.second.deviceId} options={step.options} onSubmit={cable.submitSsid} onCancel={cable.back} />
                )}
              </WorkspaceCanvas>
            </AnnotationActionsContext.Provider>
            {windowMode && (
              <>
                <WindowModeProperties
                  selection={windowSelection}
                  notesAvailable={!exerciseMode && !notesLocked}
                  renderProperties={properties}
                  onClearSelection={() => setSelection(EMPTY_SELECTION)}
                  onOpenDevice={openWindow}
                />
                <DeviceWindowLayer controls={windows} devices={doc.state.devices} renderTabs={renderTabs} />
              </>
            )}
            {editable && (
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className={`absolute bottom-3 start-3 z-20 flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg shadow-lg hover:bg-accent-hover md:hidden ${focusRing}`}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                {t('palette.open')}
              </button>
            )}
            <ToastRegion toasts={toasts.toasts} onDismiss={toasts.dismiss} />
          </div>
          {/* Simulation (U3) */}
          {simulation.mode === 'simulation' && (
            <Suspense fallback={null}>
              <SimulationPanel simulation={simulation} nameOf={nameOf} />
            </Suspense>
          )}
          {editable && <WorkspacePaletteSlot atBottom {...paletteProps} />}
        </main>
        {/* Design (D2): the brief panel */}
        {props.sidePanel}
        {wide && !windowMode && (
          <aside className={`shrink-0 border-s border-border bg-surface ${consoleOpen ? 'w-[32rem] xl:w-[40rem]' : 'w-80 xl:w-96'}`}>{properties()}</aside>
        )}
        {!wide && selectedCount > 0 && !paletteOpen && (
          <div className="absolute inset-x-0 bottom-0 z-30 h-[60%] overflow-hidden rounded-t-2xl border-t border-border bg-surface shadow-2xl">
            {properties(() => setSelection(EMPTY_SELECTION))}
          </div>
        )}
        {paletteOpen && editable && (
          <div
            role="dialog"
            aria-labelledby="palette-drawer-heading"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              setPaletteOpen(false)
            }}
            className="absolute inset-x-0 bottom-0 z-40 max-h-[65vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-3 shadow-2xl md:hidden"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 id="palette-drawer-heading" className="text-sm font-semibold text-fg-strong">
                {t('palette.title')}
              </h2>
              <button
                type="button"
                // The drawer was opened on purpose; its close button takes the focus.
                autoFocus
                onClick={() => setPaletteOpen(false)}
                aria-label={t('palette.close')}
                className={`rounded p-1 text-fg-subtle hover:bg-surface-muted ${focusRing}`}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <DevicePalette {...paletteProps} />
          </div>
        )}
        {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}
      </div>
      {footer}
    </div>
  )
}

export default WorkspaceView
