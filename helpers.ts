import type { Locator, Page } from '@playwright/test'
import { DEMO, PAUSE, SETTLE } from './mode'

// Update the corner caption immediately. Call as soon as a scene's page is ready so the label
// is on screen while the interactions play out.
export const setCaption = (page: Page, title: string) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	page.evaluate((t) => (window as any).__e2eCaption?.(t), title).catch(() => {})

// Hold the current frame so the viewer can read it. No-op in CI mode.
export const hold = (page: Page) => page.waitForTimeout(PAUSE)

// In demo mode, hover first so the visible cursor glides to the target, then click once it has
// arrived. In CI there's no cursor, so just click.
export const smoothClick = async (page: Page, target: Locator) => {
	if (!DEMO) return target.click()
	await target.hover()
	await page.waitForTimeout(SETTLE)
	return target.click()
}
