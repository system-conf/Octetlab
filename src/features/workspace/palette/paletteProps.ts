import type { CableTool, DeviceModel } from '../../../domain'

/** What every device palette layout (sidebar, bottom bar, phone drawer) takes from the workspace. */
export interface PaletteProps {
  models: readonly DeviceModel[]
  /** Click / Enter on a model: add it in the middle of the canvas. */
  onAdd: (modelId: string) => void
  /** A cable picked in the palette's Cables view (same tools as the canvas toolbar). */
  onChooseCable: (tool: CableTool) => void
  /** The active cable tool, null with the select tool. */
  activeCable: CableTool | null
  /** Design (D2): price text of a model (design brief with a budget); absent = no prices. */
  priceLabelOf?: (modelId: string) => string | undefined
}
