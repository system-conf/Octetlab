import { expect, test } from './support/fixtures'

test.describe('routing', { tag: '@mobile' }, () => {
  // `/` opens the lab with the Start dialog (the former landing text lives at /about).
  test('an unknown path redirects to the start of the app', async ({ page }) => {
    await page.goto('/no/such/page?lang=en')
    await expect(page).toHaveURL(/^[^?#]+\/(\?|$)/)
    await expect(page.getByRole('dialog', { name: 'Start' })).toBeVisible({ timeout: 15_000 })
  })

  test('an unknown exercise redirects to the exercise list', async ({ page }) => {
    await page.goto('/exercises/noSuchExercise?lang=en')
    await expect(page).toHaveURL(/\/exercises(\?|$)/)
    await expect(page.getByRole('heading', { level: 1, name: 'Troubleshooting exercises' })).toBeVisible()
  })

  test('a report without a verified attempt redirects to the exercise', async ({ page }) => {
    await page.goto('/exercises/posGateway/report?lang=en')
    await expect(page).toHaveURL(/\/exercises\/posGateway(\?|$)/)
    await expect(page.getByRole('button', { name: 'Verify', exact: true })).toBeVisible()
  })
})
