import { test as base } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { DEMO, PAUSE, SETTLE } from './mode'

// Current caption per page, so navigations can't lose the label: the overlay is re-created on
// every new document, and the fixture re-applies the stored title after each main-frame commit.
const captionStore = new WeakMap<Page, string>()

const applyCaption = (page: Page, title: string) =>
	page
		.evaluate((t) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const w = window as any
			if (w.__e2eCaption) w.__e2eCaption(t)
			else w.__e2ePendingCaption = t
		}, title)
		.catch(() => {})

/** @internal Re-apply the stored caption (used by the fixture after navigations). */
export const reapplyCaption = (page: Page) => {
	const title = captionStore.get(page)
	return title ? applyCaption(page, title) : Promise.resolve()
}

// Set (or clear, with '') the corner caption. Sticky: survives navigations until replaced.
export const setCaption = (page: Page, title: string) => {
	if (title) captionStore.set(page, title)
	else captionStore.delete(page)
	return applyCaption(page, title)
}

// Hold the current frame so the viewer can read it. No-op outside demo mode.
export const hold = (page: Page) => page.waitForTimeout(PAUSE)

// In demo mode, hover first so the visible cursor glides to the target, then click once it has
// arrived. Outside demo mode there's no cursor, so just click.
export const smoothClick = async (page: Page, target: Locator) => {
	if (!DEMO) return target.click()
	await target.hover()
	await page.waitForTimeout(SETTLE)
	return target.click()
}

// One walkthrough scene: a test.step whose title is also the on-screen caption, with the
// closing hold applied automatically. The narration primitive — in demo mode it drives the
// video; outside demo mode it still structures the report.
export const scene = (page: Page, title: string, body?: () => Promise<unknown>) =>
	base.step(title, async () => {
		await setCaption(page, title)
		await body?.()
		await hold(page)
	})
