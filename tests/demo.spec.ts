import { createDemoTest, expect, scene, setCaption } from 'demo-kit'

const test = createDemoTest({ cursor: 'always' })
const documentUrl = (body: string) => `data:text/html,${encodeURIComponent(body)}`

test('installs the overlay in the default page and popups', async ({ page }) => {
	await page.goto(documentUrl(`<button onclick="window.open('about:blank', '_blank')">Open</button>`))
	await page.mouse.move(80, 80)
	await expect(page.locator('#__e2e-cursor')).toBeVisible()

	const popupPromise = page.waitForEvent('popup')
	await page.getByRole('button', { name: 'Open' }).click()
	const popup = await popupPromise
	await popup.goto(documentUrl('<h1>Popup</h1>'))
	await setCaption(popup, 'Popup caption')

	await expect(popup.locator('#__e2e-caption')).toHaveText('Popup caption')
	await expect(popup.locator('#__e2e-caption')).toBeVisible()
})

test('keeps an active caption above a modal dialog', async ({ page }) => {
	await page.goto(documentUrl('<dialog>Modal content</dialog>'))
	await setCaption(page, 'Modal caption')
	await page.locator('dialog').evaluate((dialog: HTMLDialogElement) => dialog.showModal())

	await expect
		.poll(() =>
			page.evaluate(() => {
				const caption = document.getElementById('__e2e-caption')
				return !!caption && caption.matches(':popover-open') && getComputedStyle(caption).display === 'block'
			}),
		)
		.toBe(true)
})

test('captions are sticky across navigations', async ({ page }) => {
	await page.goto(documentUrl('<h1>First</h1>'))
	await setCaption(page, 'Sticky caption')
	await page.goto(documentUrl('<h1>Second</h1>'))

	await expect(page.locator('#__e2e-caption')).toHaveText('Sticky caption')
	await expect(page.locator('#__e2e-caption')).toBeVisible()
})

test('a caption set before the document is ready still lands', async ({ page }) => {
	await page.goto(documentUrl('<h1>Start</h1>'))
	await Promise.all([page.goto(documentUrl('<h1>Late</h1>')), setCaption(page, 'Early caption')])

	await expect(page.locator('#__e2e-caption')).toHaveText('Early caption')
})

test('scene sets the caption, runs the body, and reports a step', async ({ page }) => {
	await page.goto(documentUrl('<button>Go</button>'))
	let ran = false
	await scene(page, 'Scene caption', async () => {
		ran = true
		await page.goto(documentUrl('<h1>Navigated inside scene</h1>'))
	})

	expect(ran).toBe(true)
	await expect(page.locator('#__e2e-caption')).toHaveText('Scene caption')
	await expect(page.locator('#__e2e-caption')).toBeVisible()
})
