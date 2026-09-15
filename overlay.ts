import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { reapplyCaption } from './helpers'
import { DEMO } from './mode'

export type CursorPolicy = 'local-only' | 'always' | 'never'

const SVG_NS = 'http://www.w3.org/2000/svg'

// Arrow outline, drawn as real SVG DOM rather than a data: URI background image: a strict
// img-src blocks data: images, an inline <svg> subtree is not a resource load at all.
const ARROW_PATH = 'M3 2 L3 19 L7.6 14.7 L10.8 21.4 L13.4 20.2 L10.2 13.6 L16.2 13.6 Z'

const GLIDE = 'left 380ms cubic-bezier(0.22, 1, 0.36, 1), top 380ms cubic-bezier(0.22, 1, 0.36, 1)'

// Demo overlays injected into every page: a corner caption and an arrow cursor with a click
// ripple. Every style below is applied through the CSSOM (element.style), never a <style> element
// or a markup style attribute, and animation runs through the Web Animations API rather than
// @keyframes. CSP's style-src governs the latter forms but not direct property sets, and img-src
// never sees SVG DOM — so the whole overlay renders on strict-CSP pages (e.g. hosted auth UIs).
// Playwright installs this through CDP, which is not subject to script-src.
const overlayScript = (cursorPolicy: CursorPolicy) => `(() => {
	const install = () => {
		if (document.getElementById('__e2e-caption')) return
		const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
		const cursorEnabled = ${JSON.stringify(cursorPolicy)} === 'always' ||
			(${JSON.stringify(cursorPolicy)} === 'local-only' && isLocal)

		const showTopLayer = (el) => {
			try {
				if (el.matches(':popover-open')) el.hidePopover()
				el.showPopover()
			} catch (_) {}
		}

		// Every overlay declaration goes in weighted, through the CSSOM. The overlay lives in the
		// host document, so the page's own rules could otherwise move, resize, repaint or hide
		// it, and presentation attributes (the arrow's old fill/stroke/width) are the weakest
		// author styles of all, so any rule targeting svg or path would beat them. An inline
		// important declaration outranks an important rule from a stylesheet, so this holds even
		// against a hostile reset.
		const setStyle = (el, styles) => {
			for (const name in styles) el.style.setProperty(name, styles[name], 'important')
		}

		const caption = document.createElement('div')
		caption.id = '__e2e-caption'
		caption.setAttribute('popover', 'manual')
		setStyle(caption, {
			all: 'initial',
			position: 'fixed',
			inset: 'auto',
			left: '24px',
			bottom: '24px',
			margin: '0',
			'max-width': '460px',
			padding: '9px 15px',
			background: 'rgba(17,24,39,0.42)',
			'-webkit-backdrop-filter': 'blur(9px)',
			'backdrop-filter': 'blur(9px)',
			color: '#fff',
			border: '0',
			'border-radius': '10px',
			'font-family': '-apple-system,Segoe UI,Roboto,sans-serif',
			'font-size': '15px',
			'font-weight': '600',
			'box-shadow': '0 4px 14px rgba(0,0,0,0.18)',
			'z-index': '2147483647',
			'pointer-events': 'none',
			visibility: 'visible',
			opacity: '1',
			display: 'none',
		})
		document.body.appendChild(caption)
		window.__e2eCaption = (title) => {
			caption.textContent = title || ''
			if (title) {
				setStyle(caption, { display: 'block' })
				showTopLayer(caption)
			} else if (caption.matches(':popover-open')) {
				caption.hidePopover()
			}
		}
		// A caption set before this document finished installing (e.g. right after a navigation
		// committed) is queued on the window; apply it now.
		if (window.__e2ePendingCaption) {
			window.__e2eCaption(window.__e2ePendingCaption)
			delete window.__e2ePendingCaption
		}

		if (!cursorEnabled) return

		// Shared resets. The explicit inset/margin/border/padding also override the UA
		// stylesheet's [popover] rules.
		const BASE = {
			all: 'initial',
			position: 'fixed',
			inset: 'auto',
			margin: '0',
			padding: '0',
			border: '0',
			background: 'transparent',
			'pointer-events': 'none',
			overflow: 'visible',
			visibility: 'visible',
			'z-index': '2147483647',
		}

		const cursor = document.createElement('div')
		cursor.id = '__e2e-cursor'
		cursor.setAttribute('popover', 'manual')
		setStyle(
			cursor,
			Object.assign({}, BASE, {
				width: '24px',
				height: '24px',
				opacity: '1',
				transform: 'translate(-3px, -2px)',
				filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))',
				display: 'none',
			}),
		)

		// The arrow lives in a shadow root, like the ripple's ring: weighting declarations only
		// covers the properties named here, and a page reset reaching the light DOM with
		// something unnamed (transform, clip-path, padding) still collapses the arrow. Page
		// selectors cannot match into a shadow tree at all, which closes the whole class.
		//
		// The weighted declarations below stay, because isolation alone is not enough: fill,
		// stroke, visibility and pointer-events are inherited, so their values cross the
		// boundary from the host. A direct declaration beats an inherited one, so setting them
		// here pins them. pointer-events in particular matters because the arrow paints under
		// the mouse hotspot, and a hit-testable arrow intercepts the click smoothClick lines up.
		//
		// viewBox and d have no CSS counterpart in play, so they stay attributes.
		const svg = document.createElementNS(${JSON.stringify(SVG_NS)}, 'svg')
		svg.setAttribute('viewBox', '0 0 24 24')
		setStyle(svg, {
			display: 'block',
			width: '24px',
			height: '24px',
			overflow: 'visible',
			visibility: 'visible',
			opacity: '1',
			'pointer-events': 'none',
		})
		const arrow = document.createElementNS(${JSON.stringify(SVG_NS)}, 'path')
		arrow.setAttribute('d', ${JSON.stringify(ARROW_PATH)})
		setStyle(arrow, {
			display: 'inline',
			fill: '#111827',
			stroke: '#fff',
			'stroke-width': '1.4',
			'stroke-linejoin': 'round',
			visibility: 'visible',
			opacity: '1',
			'pointer-events': 'none',
		})
		svg.appendChild(arrow)
		cursor.attachShadow({ mode: 'open' }).appendChild(svg)
		document.body.appendChild(cursor)

		let seen = false
		document.addEventListener('mousemove', (e) => {
			setStyle(cursor, { left: e.clientX + 'px', top: e.clientY + 'px' })
			if (!seen) {
				seen = true
				setStyle(cursor, { display: 'block' })
				showTopLayer(cursor)
				// Glide only once a real position has landed, so the first appearance doesn't
				// slide in from the corner. Transitions outrank important declarations in the
				// cascade, so the weighted left/top still animate.
				requestAnimationFrame(() => setStyle(cursor, { transition: ${JSON.stringify(GLIDE)} }))
			}
		}, true)
		document.addEventListener('mousedown', (e) => {
			const ripple = document.createElement('div')
			ripple.className = '__e2e-ripple'
			ripple.setAttribute('popover', 'manual')
			setStyle(
				ripple,
				Object.assign({}, BASE, {
					display: 'block',
					width: '26px',
					height: '26px',
					opacity: '1',
					transform: 'translate(-13px, -13px)',
					left: e.clientX + 'px',
					top: e.clientY + 'px',
				}),
			)
			// The animated ring lives in a shadow root. Weighting opacity on the ring itself is
			// not an option — important author declarations outrank animations, so it would pin
			// the ripple at its opening frame — but leaving it unweighted in the host document
			// lets a page rule setting an important opacity on div outrank the animation the
			// other way and suppress the ripple entirely. Page selectors cannot match into a
			// shadow tree, and neither opacity nor transform is inherited, so inside it the
			// animation owns both outright. The host carries the static, weighted placement.
			const ring = document.createElement('div')
			ring.style.cssText =
				'box-sizing:border-box;width:26px;height:26px;border-radius:50%;' +
				'border:2px solid rgba(210, 120, 0, 0.9);'
			ripple.attachShadow({ mode: 'open' }).appendChild(ring)
			document.body.appendChild(ripple)
			showTopLayer(ripple)
			const anim = ring.animate(
				[
					{ transform: 'scale(0.3)', opacity: 0.9 },
					{ transform: 'scale(1.6)', opacity: 0 },
				],
				{ duration: 500, easing: 'ease-out', fill: 'forwards' },
			)
			anim.onfinish = () => ripple.remove()
			setTimeout(() => ripple.remove(), 550)
		}, true)

		let topDialog = null
		new MutationObserver(() =>
			requestAnimationFrame(() => {
				const dialogs = document.querySelectorAll('dialog[open]')
				const open = dialogs.length ? dialogs[dialogs.length - 1] : null
				if (open && open !== topDialog) {
					// Opening a modal closes existing popovers, but the caption text still records whether
					// it should be visible. Re-open it after the dialog enters the top layer.
					if (caption.textContent) showTopLayer(caption)
					if (seen) showTopLayer(cursor)
				}
				topDialog = open
			}),
		).observe(document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['open'],
		})
	}
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', install)
	} else {
		install()
	}
})()`

export interface DemoTestOptions {
	cursor?: CursorPolicy
}

export interface DemoFixtures {
	demoOverlay: void
}

// Raw fixtures, for composing with an existing extended test via mergeTests:
//   import { mergeTests } from '@playwright/test'
//   export const test = mergeTests(myAuthTest, demoTest)
// or directly: myAuthTest.extend(demoFixtures())
export const demoFixtures = (
	options: DemoTestOptions = {},
): Parameters<typeof base.extend<DemoFixtures>>[0] => {
	if (!DEMO) return {}
	return {
		demoOverlay: [
			async ({ context }, use) => {
				await context.addInitScript(overlayScript(options.cursor ?? 'always'))
				// Captions are sticky: re-apply the stored title after every main-frame navigation,
				// since each new document boots a fresh (empty) overlay.
				const wire = (page: Page) => {
					page.on('framenavigated', (frame) => {
						if (frame === page.mainFrame()) void reapplyCaption(page)
					})
				}
				context.pages().forEach(wire)
				context.on('page', wire)
				await use()
			},
			{ auto: true },
		],
	}
}

// Return Playwright's base test unchanged outside demo mode, so importing demo-kit does not cause
// API-only tests to acquire a browser context. Context-scoped injection covers popups/new tabs.
export const createDemoTest = (options: DemoTestOptions = {}) =>
	DEMO ? base.extend<DemoFixtures>(demoFixtures(options)) : base

export const test = createDemoTest()
export { expect }
