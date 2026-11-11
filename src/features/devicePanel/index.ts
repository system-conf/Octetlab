// Device front panel ("Physical" device tab): a front panel generated from the device's ports
// (FrontPanelLayout), live port state from the lab (PortPanelStatus) and the SVG view in the
// classic or realistic look of the map's device style.
//
//   <PhysicalTab device state policy onUpdate />
//     onUpdate receives the device with `powered` toggled when the panel's power switch is pressed
//     (unless the exercise locks the 'power' section).
export { default as PhysicalTab, type PhysicalTabProps } from './PhysicalTab'
export { FrontPanelLayout } from './model/FrontPanelLayout'
export { PortPanelStatus, type PortCondition, type PortPanelState } from './model/PortPanelStatus'
export type { ChassisKind, FrontPanelPlan } from './model/panelTypes'
