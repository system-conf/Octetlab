// Small drawing helpers shared by the realistic pictures (rows of ports, rows of LEDs).
import type { ReactNode } from 'react'

/** A grid of identical rectangular sockets (RJ45 ports, SFP cages, keypad keys). */
export interface PortGridOptions {
  x: number
  y: number
  columns: number
  rows?: number
  stepX: number
  stepY?: number
  width: number
  height: number
  fill: string
  stroke?: string
  strokeWidth?: number
  rx?: number
}

export function portGrid(options: PortGridOptions): ReactNode {
  const rows = options.rows ?? 1
  const stepY = options.stepY ?? 0
  const cells: ReactNode[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < options.columns; column += 1) {
      cells.push(
        <rect
          key={`${row}x${column}`}
          x={options.x + column * options.stepX}
          y={options.y + row * stepY}
          width={options.width}
          height={options.height}
          rx={options.rx}
        />,
      )
    }
  }
  return (
    <g fill={options.fill} stroke={options.stroke} strokeWidth={options.strokeWidth}>
      {cells}
    </g>
  )
}

/** A horizontal row of round status LEDs, one colour per LED. */
export function ledRow(x: number, y: number, step: number, radius: number, colours: readonly string[]): ReactNode {
  return (
    <g>
      {colours.map((colour, index) => (
        <circle key={index} cx={x + index * step} cy={y} r={radius} fill={colour} />
      ))}
    </g>
  )
}
