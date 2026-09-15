import type { Page } from '@playwright/test'
import { createDemoTest, expect, setCaption } from 'demo-kit'

const test = createDemoTest()

// A host stylesheet that would capture the overlay's own elements if it leaned on presentation
// attributes or unweighted inline styles. Every rule here is !important, so this also pins that
// an inline important declaration outranks an important rule from a stylesheet.
const HOSTILE = `
	div { position: static !important; display: none !important; opacity: 0 !important;
		visibility: hidden !important; width: auto !important; height: auto !important }
	svg { width: 1em !important; height: 1em !important; display: none !important;
		visibility: hidden !important; overflow: hidden !important }
	path { fill: none !important; stroke: none !important; stroke-width: 0 !important;
		display: none !important; visibility: hidden !important }
`

const serveHostile = (page: Page) =>
	page.goto(
		`data:text/html,${encodeURIComponent(
			`<!doctype html><html><head><style>${HOSTILE}</style></head><body style="background:#fff"><h1>Host</h1></body></html>`,
		)}`,
	)

test('the arrow keeps its geometry and paint under a hostile host stylesheet', async ({ page }) => {
	await serveHostile(page)
	await page.mouse.move(150, 150)

	await expect(page.locator('#__e2e-cursor')).toBeVisible()
	const box = await page.locator('#__e2e-cursor svg').boundingBox()
	expect(box?.width).toBe(24)
	expect(box?.height).toBe(24)

	const paint = await page.evaluate(() => {
		const path = document.querySelector('#__e2e-cursor svg path') as SVGPathElement
		const style = getComputedStyle(path)
		return {
			fill: style.fill,
			stroke: style.stroke,
			strokeWidth: style.strokeWidth,
			display: style.display,
			visibility: style.visibility,
		}
	})
	expect(paint.fill).toBe('rgb(17, 24, 39)')
	expect(paint.stroke).toBe('rgb(255, 255, 255)')
	expect(paint.strokeWidth).toBe('1.4px')
	expect(paint.display).not.toBe('none')
	expect(paint.visibility).toBe('visible')
})

test('the caption still renders under a hostile host stylesheet', async ({ page }) => {
	await serveHostile(page)
	await setCaption(page, 'Hostile host caption')

	await expect(page.locator('#__e2e-caption')).toHaveText('Hostile host caption')
	await expect(page.locator('#__e2e-caption')).toBeVisible()
})

test('the ripple still animates under a hostile host stylesheet', async ({ page }) => {
	await serveHostile(page)

	const ripple = await page.evaluate(async () => {
		document.dispatchEvent(new MouseEvent('mousedown', { clientX: 70, clientY: 80, bubbles: true }))
		const el = document.querySelector('.__e2e-ripple')
		if (!el) return null
		const style = getComputedStyle(el)
		const before = { animations: el.getAnimations().length, display: style.display }
		// Two frames so the animation has certainly been applied.
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
		return { ...before, opacity: Number.parseFloat(getComputedStyle(el).opacity) }
	})

	expect(ripple).not.toBeNull()
	expect(ripple?.animations).toBeGreaterThan(0)
	expect(ripple?.display).not.toBe('none')
	// Guards the cascade trap: important author declarations outrank animations, so weighting
	// opacity or transform here would pin the ripple at its starting frame.
	expect(ripple?.opacity).toBeLessThan(1)
})
