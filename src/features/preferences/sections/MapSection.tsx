import { useTranslation } from 'react-i18next'
import { DEVICE_LABEL_MODES, DEVICE_STYLES, PORT_LABEL_MODES, usePreference } from '../../../preferences'
import ChoiceGroup from '../controls/ChoiceGroup'
import DeviceStylePreview from '../controls/DeviceStylePreview'
import { FIELD_LIST } from '../controls/fieldList'
import SwitchField from '../controls/SwitchField'

/** Map: device style, device and port labels, link lights, grid, snap, minimap (read by the workspace canvas). */
function MapSection() {
  const { t } = useTranslation('preferences')
  const [deviceStyle, setDeviceStyle] = usePreference('map.deviceStyle')
  const [deviceLabels, setDeviceLabels] = usePreference('map.deviceLabels')
  const [portLabels, setPortLabels] = usePreference('map.portLabels')
  const [linkLights, setLinkLights] = usePreference('map.linkLights')
  const [grid, setGrid] = usePreference('map.grid')
  const [snap, setSnap] = usePreference('map.snap')
  const [minimap, setMinimap] = usePreference('map.minimap')

  return (
    <div className={FIELD_LIST}>
      <ChoiceGroup
        label={t('map.deviceStyle.label')}
        hint={t('map.deviceStyle.hint')}
        choices={DEVICE_STYLES.map((value) => ({
          value,
          label: t(`map.deviceStyle.${value}`),
          preview: <DeviceStylePreview deviceStyle={value} />,
        }))}
        value={deviceStyle}
        onChange={setDeviceStyle}
      />
      <ChoiceGroup
        label={t('map.deviceLabels.label')}
        choices={DEVICE_LABEL_MODES.map((value) => ({ value, label: t(`map.deviceLabels.${value}`) }))}
        value={deviceLabels}
        onChange={setDeviceLabels}
      />
      <ChoiceGroup
        label={t('map.portLabels.label')}
        choices={PORT_LABEL_MODES.map((value) => ({ value, label: t(`map.portLabels.${value}`) }))}
        value={portLabels}
        onChange={setPortLabels}
      />
      <SwitchField label={t('map.linkLights.label')} hint={t('map.linkLights.hint')} checked={linkLights} onChange={setLinkLights} />
      <SwitchField label={t('map.grid.label')} checked={grid} onChange={setGrid} />
      <SwitchField label={t('map.snap.label')} hint={t('map.snap.hint')} checked={snap} onChange={setSnap} />
      <SwitchField label={t('map.minimap.label')} hint={t('map.minimap.hint')} checked={minimap} onChange={setMinimap} />
    </div>
  )
}

export default MapSection
