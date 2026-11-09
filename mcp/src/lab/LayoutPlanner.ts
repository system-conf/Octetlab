// Canvas position for a device added without x / y: the first free cell of a grid, row by row, so
// devices added from chat do not pile up on one spot when the lab is opened in the web app.
import type { CanvasPoint, LabLayout } from '../../../src/domain'

const CELL_WIDTH = 220
const CELL_HEIGHT = 180
const COLUMNS = 5
const ORIGIN: CanvasPoint = { x: 80, y: 80 }

export class LayoutPlanner {
  nextFree(layout: LabLayout): CanvasPoint {
    const taken = Object.values(layout.devices)
    for (let cell = 0; ; cell += 1) {
      const point = { x: ORIGIN.x + (cell % COLUMNS) * CELL_WIDTH, y: ORIGIN.y + Math.floor(cell / COLUMNS) * CELL_HEIGHT }
      const occupied = taken.some((other) => Math.abs(other.x - point.x) < CELL_WIDTH / 2 && Math.abs(other.y - point.y) < CELL_HEIGHT / 2)
      if (!occupied) return point
    }
  }
}
