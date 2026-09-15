import type { Page } from '@playwright/test'
import { createDemoTest, expect, setCaption } from 'demo-kit'

// Not localhost, so this also pins the default cursor policy covering remote pages.
const CSP_URL = 'https://strict-csp.demo-kit.test/'

// The strictest policy a page can send: no stylesheets, no images, no scripts from anywhere.
// A hosted auth UI (e.g. Cognito) is a milder version of this.
const POLICY = "default-src 'none'; style-src 'none'; img-src 'none'; script-src 'none'"

const serveStrictCsp = async (page: Page, body: string) => {
	await page.route(CSP_URL, (route) =>
		route.fulfill({
			status: 200,
			headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': POLICY },
			body: `<!doctype html><html><body>${body}</body></html>`,
		}),
	)
	await page.goto(CSP_URL)
}

const test = createDemoTest()

test('renders the cursor and caption on a strict-CSP page off localhost', async ({ page }) => {
	await serveStrictCsp(page, '<button>Go</button>')
	expect(await page.evaluate(() => location.hostname)).not.toBe('localhost')

	await page.mouse.move(120, 140)
	await expect(page.locator('#__e2e-cursor')).toBeVisible()

	await setCaption(page, 'Strict CSP caption')
	await expect(page.locator('#__e2e-caption')).toHaveText('Strict CSP caption')
	await expect(page.locator('#__e2e-caption')).toBeVisible()
})

test('draws the arrow as SVG DOM, with no stylesheet and no background image', async ({ page }) => {
	await serveStrictCsp(page, '<h1>Arrow</h1>')
	await page.mouse.move(60, 60)

	const arrow = page.locator('#__e2e-cursor svg path')
	await expect(arrow).toHaveAttribute('d', /^M3 2 L3 19/)
	expect(
		await page.evaluate(
			() => getComputedStyle(document.querySelector('#__e2e-cursor svg path') as Element).fill,
		),
	).toBe('rgb(17, 24, 39)')

	// A zero-sized subtree would still satisfy toBeVisible() on the wrapper, so pin the geometry.
	const box = await page.locator('#__e2e-cursor svg').boundingBox()
	expect(box?.width).toBe(24)
	expect(box?.height).toBe(24)

	// The three CSP-blocked primitives are gone: no <style> element, no data: URI image, and
	// the glide is a transition property set through the CSSOM rather than a stylesheet class.
	expect(await page.locator('style').count()).toBe(0)
	expect(
		await page.evaluate(
			() => getComputedStyle(document.getElementById('__e2e-cursor') as Element).backgroundImage,
		),
	).toBe('none')
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					getComputedStyle(document.getElementById('__e2e-cursor') as Element).transitionProperty,
			),
		)
		.toContain('left')
})

test('animates the click ripple through the Web Animations API', async ({ page }) => {
	await serveStrictCsp(page, '<h1>Ripple</h1>')

	// Dispatched synchronously so the ripple can be inspected before it removes itself.
	const ripple = await page.evaluate(() => {
		document.dispatchEvent(new MouseEvent('mousedown', { clientX: 90, clientY: 110, bubbles: true }))
		const el = document.querySelector('.__e2e-ripple')
		if (!el) return null
		return {
			animations: el.getAnimations().length,
			borderColor: getComputedStyle(el).borderColor,
			left: (el as HTMLElement).style.left,
		}
	})

	expect(ripple).not.toBeNull()
	expect(ripple?.animations).toBeGreaterThan(0)
	expect(ripple?.borderColor).toBe('rgba(210, 120, 0, 0.9)')
	expect(ripple?.left).toBe('90px')
	await expect(page.locator('.__e2e-ripple')).toHaveCount(0)
})

// Keeps the tests above honest: if this fixture's policy ever stops blocking the primitives the
// overlay used to rely on, they would pass for the wrong reason.
test('the fixture policy blocks a <style> element and a data: URI image', async ({ page }) => {
	await serveStrictCsp(page, '<h1 id="probe">Probe</h1>')

	const styleApplied = await page.evaluate(() => {
		const style = document.createElement('style')
		style.textContent = '#probe { color: rgb(1, 2, 3) }'
		document.head.appendChild(style)
		const probe = document.getElementById('probe') as HTMLElement
		return getComputedStyle(probe).color === 'rgb(1, 2, 3)'
	})
	expect(styleApplied).toBe(false)

	const imgLoaded = await page.evaluate(
		() =>
			new Promise<boolean>((resolve) => {
				const img = document.createElement('img')
				img.onload = () => resolve(true)
				img.onerror = () => resolve(false)
				img.src =
					"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3C/svg%3E"
			}),
	)
	expect(imgLoaded).toBe(false)
})

const localOnlyTest = createDemoTest({ cursor: 'local-only' })

localOnlyTest('local-only still opts out of the cursor off localhost', async ({ page }) => {
	await serveStrictCsp(page, '<h1>Opted out</h1>')
	await page.mouse.move(60, 60)

	await expect(page.locator('#__e2e-caption')).toHaveCount(1)
	await expect(page.locator('#__e2e-cursor')).toHaveCount(0)
})

const neverTest = createDemoTest({ cursor: 'never' })

neverTest('never opts out of the cursor while keeping captions', async ({ page }) => {
	await page.goto(`data:text/html,${encodeURIComponent('<h1>No cursor</h1>')}`)
	await page.mouse.move(60, 60)
	await setCaption(page, 'Caption only')

	await expect(page.locator('#__e2e-caption')).toHaveText('Caption only')
	await expect(page.locator('#__e2e-cursor')).toHaveCount(0)
})
