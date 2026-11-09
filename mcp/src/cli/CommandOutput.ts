// What run_command returns: the terminal transcript and the lab after the command.
import type { LabDocument } from '../../../src/domain'

export interface CommandOutput {
  /** Prompt + command, then the output lines. */
  lines: string[]
  /** The lab changed (DHCP lease, `write memory`, …) and must be saved. */
  changed: boolean
  doc: LabDocument
  /** The simulator could not settle the lab's start-up traffic within its budget. */
  settleTruncated: boolean
}
