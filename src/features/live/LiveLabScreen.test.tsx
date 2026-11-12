import { ReactFlowProvider } from '@xyflow/react'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceViewProps } from '../workspace/WorkspaceView'

// AppLink subscribes to the router with useSyncExternalStore (no server snapshot): a plain link here.
vi.mock('../shared/AppLink', () => ({
  default: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <a href="#app" className={className}>
      {children}
    </a>
  ),
}))

// The real workspace (canvas, simulation) does not render on the server; a stand-in shows what the
// live screen hands it: header parts, banner, footer and the lock policy.
vi.mock('../workspace/WorkspaceView', () => ({
  default: (props: WorkspaceViewProps) => (
    <div data-workspace="" data-topology-locked={String(props.policy.topologyLocked)} data-notes-locked={String(props.policy.annotationsLocked)}>
      <header>
        {props.headerStart}
        {props.headerEnd}
      </header>
      {props.banner}
      <p>{props.lockedNote}</p>
      <ul>
        {props.lab.doc.state.devices.map((device) => (
          <li key={device.id} data-device={device.id} data-access={props.policy.deviceAccess(device.id)}>
            {device.name}
          </li>
        ))}
      </ul>
      {props.footer}
    </div>
  ),
}))
import { FakeClock, liveEvent, liveLab } from '../../live/testLiveFakes'
import type { LiveLabSignal } from '../../live'
import { PreferencesProvider, PreferencesStore } from '../../preferences'
import { memoryStorage } from '../../preferences/testStorage'
import { AppRouter, AppRouterContext } from '../../routing'
import LiveLabScreen from './LiveLabScreen'
import LiveLabWorkspace from './LiveLabWorkspace'
import { LiveLabStore } from './model/LiveLabStore'
import type { LiveConnectionFactory } from './useLiveLab'

const LAB_ID = 'AbCdEfGhIjKlMnOpQrStUv'

function providers(children: ReactNode): string {
  const router = new AppRouter({
    location: () => ({ pathname: `/live/${LAB_ID}`, search: '', hash: '' }),
    push: () => undefined,
    replace: () => undefined,
    onPopState: () => () => undefined,
  })
  return renderToString(
    <AppRouterContext.Provider value={router}>
      <PreferencesProvider store={new PreferencesStore(memoryStorage())}>{children}</PreferencesProvider>
    </AppRouterContext.Provider>,
  )
}

/** A fake connection: the store receives the signals the server would cause. */
function storeAfter(signals: readonly LiveLabSignal[]): LiveLabStore {
  const store = new LiveLabStore(new FakeClock())
  for (const signal of signals) store.receive(signal)
  return store
}

function renderWorkspace(store: LiveLabStore): string {
  const state = store.getSnapshot()
  if (state.doc === null) throw new Error('no document')
  return providers(
    <ReactFlowProvider>
      <LiveLabWorkspace labId={LAB_ID} state={{ ...state, doc: state.doc }} onCopy={() => Promise.resolve()} />
    </ReactFlowProvider>,
  )
}

const snapshot: LiveLabSignal[] = [
  { type: 'document', doc: liveLab(['router']), version: 2 },
  { type: 'events', events: [liveEvent({ version: 2, tool: 'create_lab', summary: 'Created lab.', deviceIds: [] })], fresh: false },
  { type: 'status', status: 'live' },
]

describe('LiveLabScreen', () => {
  it('waits for the first snapshot with a connecting message (the fake connection is started on mount)', () => {
    const connect: LiveConnectionFactory = () => ({ start: () => undefined, stop: () => undefined })
    const html = providers(<LiveLabScreen labId={LAB_ID} connect={connect} />)
    expect(html).toContain('data-live-status="connecting"')
    expect(html).toContain('waiting')
  })

  it('renders the snapshot read-only: title, live pill, devices, copy button, latest action', () => {
    const html = renderWorkspace(storeAfter(snapshot))
    expect(html).toContain('Ofis ağı')
    expect(html).toContain('data-live-status="live"')
    expect(html).toContain('data-device="pc"')
    expect(html).not.toContain('data-device="router"')
    expect(html).toContain('data-access="readOnly"')
    expect(html).toContain('data-topology-locked="true"')
    expect(html).toContain('data-notes-locked="true"')
    expect(html).toContain('copy.action')
    expect(html).toContain('Created lab.')
    expect(html).toContain('readOnly')
    expect(html).not.toContain('<style')
  })

  it('highlights the devices and cables of an update', () => {
    const store = storeAfter([
      ...snapshot,
      { type: 'document', doc: liveLab(), version: 3 },
      { type: 'events', events: [liveEvent({ version: 3, deviceIds: ['router'], linkIds: ['link2'] })], fresh: true },
    ])
    const html = renderWorkspace(store)
    expect(html).toContain('data-live-lab=""')
    expect(html).toContain('[data-live-lab] .react-flow__node[data-id="router"]')
    expect(html).toContain('[data-live-lab] .react-flow__edge[data-id="link2"]')
    expect(html).toContain('Added Office Router (router3Port).')
  })

  it('keeps the lab on screen with an ended banner when the room expires', () => {
    const html = renderWorkspace(storeAfter([...snapshot, { type: 'status', status: 'ended' }]))
    expect(html).toContain('data-live-status="ended"')
    expect(html).toContain('ended.banner')
    expect(html).toContain('copy.action')
  })
})
