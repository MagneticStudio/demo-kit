import type { Page } from '@playwright/test'
import { createDemoTest, expect, setCaption, smoothClick } from 'demo-kit'

const test = createDemoTest()

// A host stylesheet that would capture the overlay's own elements if it leaned on presentation
// attributes or unweighted inline styles. Every rule here is !important, so this also pins that
// an inline important declaration outranks an important rule from a stylesheet.
const HOSTILE = `
	div { position: static !important; display: none !important; opacity: 0 !important;
		visibility: hidden !important; width: auto !important; height: auto !important;
		/* Unenumerated on the host too, and clipping is invisible to boundingBox(), so only
		   the all: initial reset stops these. */
		clip-path: inset(100%) !important; filter: opacity(0) !important }
	svg { width: 1em !important; height: 1em !important; display: none !important;
		visibility: hidden !important; overflow: hidden !important;
		/* Properties the overlay's weighted declarations never enumerate: isolation, not
		   enumeration, is what has to stop these. */
		transform: scale(0) !important; clip-path: inset(100%) !important;
		padding: 40px !important; margin: 40px !important; filter: opacity(0) !important }
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
		const path = document
			.getElementById('__e2e-cursor')
			?.shadowRoot?.querySelector('path') as SVGPathElement
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

	// The fixture's transform/clip-path/filter rules are the ones no enumeration would have
	// covered. They must not have reached the arrow at all.
	const geometry = await page.evaluate(() => {
		const svg = document.getElementById('__e2e-cursor')?.shadowRoot?.querySelector('svg')
		if (!svg) return null
		const style = getComputedStyle(svg)
		return { transform: style.transform, clipPath: style.clipPath, filter: style.filter }
	})
	expect(geometry?.transform).toBe('none')
	expect(geometry?.clipPath).toBe('none')
	expect(geometry?.filter).toBe('none')

	// The host is the one element that cannot be isolated, since something has to sit in the
	// light DOM. Its `all: initial` reset is what keeps the fixture's clip-path and filter off
	// it — note a clipped host would still report a 24x24 box above, so this is not redundant.
	const hostStyle = await page.evaluate(() => {
		const style = getComputedStyle(document.getElementById('__e2e-cursor') as Element)
		return { clipPath: style.clipPath, filter: style.filter }
	})
	expect(hostStyle.clipPath).toBe('none')
	expect(hostStyle.filter).toContain('drop-shadow')
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
		const host = document.querySelector('.__e2e-ripple')
		const ring = host?.shadowRoot?.firstElementChild
		if (!host || !ring) return null
		const before = {
			animations: ring.getAnimations().length,
			hostDisplay: getComputedStyle(host).display,
			hostOpacity: Number.parseFloat(getComputedStyle(host).opacity),
		}
		// Sample several frames: the ring fades from 0.9 to 0, so a live animation shows at
		// least one frame strictly between the two.
		const opacities: number[] = []
		for (let i = 0; i < 5; i += 1) {
			await new Promise((resolve) => requestAnimationFrame(resolve))
			opacities.push(Number.parseFloat(getComputedStyle(ring).opacity))
		}
		return { ...before, opacities }
	})

	expect(ripple).not.toBeNull()
	expect(ripple?.animations).toBeGreaterThan(0)
	expect(ripple?.hostDisplay).not.toBe('none')
	// The host is weighted, so the fixture's important opacity rule on div cannot reach it.
	expect(ripple?.hostOpacity).toBe(1)
	// The ring sits in a shadow tree the fixture's selectors cannot match, so the animation
	// actually paints. Strictly above 0 is the whole point: an opacity pinned at 0 by a host
	// rule would satisfy "less than 1" while being completely invisible.
	const painted = (ripple?.opacities ?? []).filter((value) => value > 0 && value < 1)
	expect(painted.length).toBeGreaterThan(0)
})

// pointer-events is inherited, so the wrapper's value protects the arrow only until the page
// declares its own. The arrow paints under the mouse hotspot, so a hit-testable arrow would
// intercept the click smoothClick is lining up and fail actionability.
test('host pointer-events rules cannot make the arrow intercept clicks', async ({ page }) => {
	await page.goto(
		`data:text/html,${encodeURIComponent(
			`<!doctype html><html><head><style>
				svg, path { pointer-events: auto !important }
				* { pointer-events: auto !important }
			</style></head><body>
				<button id="go" onclick="window.__clicked = true">Go</button>
			</body></html>`,
		)}`,
	)

	await smoothClick(page, page.getByRole('button', { name: 'Go' }))

	await expect(page.locator('#__e2e-cursor')).toBeVisible()
	expect(await page.evaluate(() => (window as unknown as { __clicked?: boolean }).__clicked)).toBe(
		true,
	)
})
