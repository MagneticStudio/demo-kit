import { DEMO, demoConfigDefaults, demoFixtures, demoProjectUse, expect, scene, test } from 'demo-kit'

test('plain mode remains an API-only Playwright test', () => {
	expect(DEMO).toBe(false)
	expect(demoConfigDefaults()).toEqual({})
	expect(demoProjectUse()).toEqual({})
	expect(demoFixtures()).toEqual({})
})

test('scene degrades to a plain test.step outside demo mode', async ({ page }) => {
	await page.goto('about:blank')
	let ran = false
	await scene(page, 'Plain scene', async () => {
		ran = true
	})
	expect(ran).toBe(true)
	await expect(page.locator('#__e2e-caption')).toHaveCount(0)
})
