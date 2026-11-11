import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../../i18n'
import { DENSITIES, DEVICE_DETAILS_MODES, FONT_SCALES, PALETTE_LAYOUTS, THEMES, usePreference } from '../../../preferences'
import ChoiceGroup, { type Choice } from '../controls/ChoiceGroup'
import DeviceDetailsPreview from '../controls/DeviceDetailsPreview'
import { FIELD_LIST } from '../controls/fieldList'
import PaletteLayoutPreview from '../controls/PaletteLayoutPreview'
import SwitchField from '../controls/SwitchField'

/**
 * Appearance: theme, text size, density, high contrast (ThemeApplier writes them on <html>), and
 * where the workspace's device list sits (WorkspacePaletteSlot) and where a device's tabs open
 * (right panel or floating windows, WorkspaceView).
 */
function AppearanceSection() {
  const { t } = useTranslation('preferences')
  const { language } = useLanguage()
  const [theme, setTheme] = usePreference('appearance.theme')
  const [fontScale, setFontScale] = usePreference('appearance.fontScale')
  const [density, setDensity] = usePreference('appearance.density')
  const [highContrast, setHighContrast] = usePreference('appearance.highContrast')
  const [paletteLayout, setPaletteLayout] = usePreference('appearance.paletteLayout')
  const [deviceDetails, setDeviceDetails] = usePreference('appearance.deviceDetails')

  const scaleChoices = useMemo(() => {
    const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 })
    return FONT_SCALES.map((scale): Choice<typeof scale> => ({ value: scale, label: percent.format(scale) }))
  }, [language])

  return (
    <div className={FIELD_LIST}>
      <ChoiceGroup
        label={t('appearance.theme.label')}
        choices={THEMES.map((value) => ({ value, label: t(`appearance.theme.${value}`) }))}
        value={theme}
        onChange={setTheme}
      />
      <ChoiceGroup label={t('appearance.fontScale.label')} hint={t('appearance.fontScale.hint')} choices={scaleChoices} value={fontScale} onChange={setFontScale} />
      <ChoiceGroup
        label={t('appearance.density.label')}
        hint={t('appearance.density.hint')}
        choices={DENSITIES.map((value) => ({ value, label: t(`appearance.density.${value}`) }))}
        value={density}
        onChange={setDensity}
      />
      <SwitchField label={t('appearance.highContrast.label')} hint={t('appearance.highContrast.hint')} checked={highContrast} onChange={setHighContrast} />
      <ChoiceGroup
        label={t('appearance.paletteLayout.label')}
        hint={t('appearance.paletteLayout.hint')}
        choices={PALETTE_LAYOUTS.map((value) => ({
          value,
          label: t(`appearance.paletteLayout.${value}`),
          preview: <PaletteLayoutPreview layout={value} />,
        }))}
        value={paletteLayout}
        onChange={setPaletteLayout}
      />
      <ChoiceGroup
        label={t('appearance.deviceDetails.label')}
        hint={t('appearance.deviceDetails.hint')}
        choices={DEVICE_DETAILS_MODES.map((value) => ({
          value,
          label: t(`appearance.deviceDetails.${value}`),
          preview: <DeviceDetailsPreview mode={value} />,
        }))}
        value={deviceDetails}
        onChange={setDeviceDetails}
      />
    </div>
  )
}

export default AppearanceSection
