import { test as base, expect } from '@playwright/test'
import { DEMO } from './mode'

export type CursorPolicy = 'local-only' | 'always' | 'never'

const ARROW =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M3 2 L3 19 L7.6 14.7 L10.8 21.4 L13.4 20.2 L10.2 13.6 L16.2 13.6 Z' fill='%23111827' stroke='white' stroke-width='1.4' stroke-linejoin='round'/%3E%3C/svg%3E"

// Demo overlays injected into every page: a corner caption (always) and an arrow cursor with a
// click ripple. Caption styles are set programmatically because strict-CSP pages (e.g. Cognito
// hosted UI) block injected <style> blocks and data-URI images — which is also why the cursor
// defaults to local-only.
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

		const caption = document.createElement('div')
		caption.id = '__e2e-caption'
		caption.setAttribute('popover', 'manual')
		caption.style.cssText =
			'position:fixed;inset:auto;left:24px;bottom:24px;margin:0;max-width:460px;' +
			'padding:9px 15px;background:rgba(17,24,39,0.42);' +
			'-webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px);' +
			'color:#fff;border:0;border-radius:10px;' +
			'font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;font-weight:600;' +
			'box-shadow:0 4px 14px rgba(0,0,0,0.18);z-index:2147483647;pointer-events:none;display:none;'
		document.body.appendChild(caption)
		window.__e2eCaption = (title) => {
			caption.textContent = title || ''
			if (title) {
				caption.style.display = 'block'
				showTopLayer(caption)
			} else if (caption.matches(':popover-open')) {
				caption.hidePopover()
			}
		}

		if (!cursorEnabled) return

		const style = document.createElement('style')
		style.textContent = \`
			#__e2e-cursor, .__e2e-ripple {
				position: fixed; inset: auto; margin: 0; padding: 0; border: 0;
				pointer-events: none; z-index: 2147483647; overflow: visible;
			}
			#__e2e-cursor {
				width: 24px; height: 24px;
				transform: translate(-3px, -2px);
				background: url("${ARROW}") no-repeat;
				filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.35));
				display: none;
			}
			#__e2e-cursor.__glide {
				transition: left 380ms cubic-bezier(0.22, 1, 0.36, 1),
					top 380ms cubic-bezier(0.22, 1, 0.36, 1);
			}
			.__e2e-ripple {
				width: 26px; height: 26px; background: transparent;
				border: 2px solid rgba(210, 120, 0, 0.9) !important; border-radius: 50%;
				transform: translate(-13px, -13px);
				animation: __e2e-ripple 500ms ease-out forwards;
			}
			@keyframes __e2e-ripple {
				from { transform: translate(-13px, -13px) scale(0.3); opacity: 0.9; }
				to { transform: translate(-13px, -13px) scale(1.6); opacity: 0; }
			}
		\`
		document.head.appendChild(style)

		const cursor = document.createElement('div')
		cursor.id = '__e2e-cursor'
		cursor.setAttribute('popover', 'manual')
		document.body.appendChild(cursor)

		let seen = false
		document.addEventListener('mousemove', (e) => {
			cursor.style.left = e.clientX + 'px'
			cursor.style.top = e.clientY + 'px'
			if (!seen) {
				seen = true
				cursor.style.display = 'block'
				showTopLayer(cursor)
				requestAnimationFrame(() => cursor.classList.add('__glide'))
			}
		}, true)
		document.addEventListener('mousedown', (e) => {
			const ripple = document.createElement('div')
			ripple.className = '__e2e-ripple'
			ripple.setAttribute('popover', 'manual')
			ripple.style.left = e.clientX + 'px'
			ripple.style.top = e.clientY + 'px'
			document.body.appendChild(ripple)
			showTopLayer(ripple)
			setTimeout(() => ripple.remove(), 550)
		}, true)

		let dialogOpen = false
		new MutationObserver(() =>
			requestAnimationFrame(() => {
				const open = !!document.querySelector('dialog[open]')
				if (open && !dialogOpen && seen) showTopLayer(cursor)
				dialogOpen = open
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

// Playwright test with the demo overlays auto-installed (no-op when DEMO=false).
export const createDemoTest = (options: DemoTestOptions = {}) =>
	base.extend<{ demoOverlay: void }>({
		demoOverlay: [
			async ({ page }, use) => {
				if (DEMO) await page.addInitScript(overlayScript(options.cursor ?? 'local-only'))
				await use()
			},
			{ auto: true },
		],
	})

export const test = createDemoTest()
export { expect }
