import { expect, scene, smoothClick, test } from 'demo-kit'
import { serveConsole } from './page'

test('the overlay survives a strict CSP and a hostile stylesheet', async ({ page }) => {
	await serveConsole(page)

	await scene(page, 'A hosted console, CSP locked down', async () => {
		await expect(page.getByRole('heading', { name: 'Deploy a service' })).toBeVisible()
	})

	await scene(page, 'The cursor renders here now', async () => {
		await smoothClick(page, page.getByRole('button', { name: 'Settings' }))
	})

	await scene(page, 'Its arrow ignores the page reset', async () => {
		await smoothClick(page, page.getByLabel('Service name'))
	})

	await scene(page, 'Clicks land with a ripple', async () => {
		await smoothClick(page, page.getByRole('button', { name: 'Deploy' }))
		await expect(page.getByRole('heading', { name: 'Deployed' })).toBeVisible()
	})

	await scene(page, 'Captions stay above the modal', async () => {
		await smoothClick(page, page.getByRole('button', { name: 'Close' }))
	})
})
