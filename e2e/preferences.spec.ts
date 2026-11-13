import { expect, test } from './support/fixtures'
import { LabWorkspace } from './support/LabWorkspace'

// PU (Preferences screen, docs/PREFERENCES.md §6): a change is saved at once and survives a reload.
test.describe('preferences', { tag: '@mobile' }, () => {
  test('the Preferences screen saves a change that survives a reload', async ({ page }) => {
    await page.goto('/about?lang=en')
    await page.getByRole('link', { name: 'Preferences' }).click()
    await expect(page).toHaveURL(/\/preferences(\?|$)/)
    // The screen is a lazy chunk; the first load can take a moment on a cold server.
    await expect(page.getByRole('heading', { level: 1, name: 'Preferences' })).toBeVisible({ timeout: 15_000 })

    const tabs = page.getByRole('tablist', { name: 'Preference categories' })
    await tabs.getByRole('tab', { name: 'Appearance' }).focus()
    // Arrow keys move between the tabs (roving tabindex); the Map tab is next in either orientation.
    const orientation = await tabs.getAttribute('aria-orientation')
    await page.keyboard.press(orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight')
    const mapTab = tabs.getByRole('tab', { name: 'Map' })
    await expect(mapTab).toHaveAttribute('aria-selected', 'true')
    await expect(mapTab).toBeFocused()

    await page.getByText('Name and model', { exact: true }).click()
    const grid = page.getByRole('switch', { name: 'Show the grid' })
    await expect(grid).toHaveAttribute('aria-checked', 'true')
    await grid.click()
    await expect(grid).toHaveAttribute('aria-checked', 'false')

    await page.reload()
    await page.getByRole('tab', { name: 'Map' }).click({ timeout: 15_000 })
    await expect(page.getByRole('radio', { name: 'Name and model' })).toBeChecked()
    await expect(page.getByRole('switch', { name: 'Show the grid' })).toHaveAttribute('aria-checked', 'false')
    const stored = await page.evaluate(() => window.localStorage.getItem('agArizaLab.preferences'))
    expect(JSON.parse(stored ?? '{}')).toEqual({ version: 1, map: { deviceLabels: 'both', grid: false } })
  })

  test('the workspace opens the same preferences as a dialog and applies them', async ({ page }) => {
    const lab = new LabWorkspace(page)
    await lab.open()
    const cables = page.getByRole('group', { name: 'Cables', exact: true })
    await expect(cables.getByRole('button', { name: 'Automatic', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Preferences' }).click()
    const dialog = page.getByRole('dialog', { name: 'Preferences' })
    await expect(dialog).toBeVisible({ timeout: 15_000 })

    await dialog.getByRole('tab', { name: 'Cables' }).click()
    await dialog.getByRole('switch', { name: 'Offer the automatic cable' }).click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    // Applied at once: the toolbar lists only real cable types.
    await expect(cables.getByRole('button', { name: 'Automatic', exact: true })).toHaveCount(0)
    await expect(cables.getByRole('button', { name: 'Copper straight-through', exact: true })).toBeVisible()

    await page.reload()
    await expect(lab.canvas).toBeVisible({ timeout: 15_000 })
    const stored = await page.evaluate(() => window.localStorage.getItem('agArizaLab.preferences'))
    expect(JSON.parse(stored ?? '{}')).toEqual({ version: 1, cables: { autoCable: false } })
  })
})
