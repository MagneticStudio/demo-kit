import type { Page } from '@playwright/test'

export const ORIGIN = 'https://console.acme.test'

// A policy a real hosted UI would send: the app's own stylesheet and script load fine, but
// nothing inline does, and data: images are refused. This is what used to cost the kit its
// cursor on any deployed target.
const POLICY = "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'"

const CSS = `
	:root { color-scheme: light }
	* { box-sizing: border-box }
	body { margin: 0; background: #eef1f6; color: #111827;
		font: 15px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif }

	/* The kind of global icon reset a design system ships. It would shrink and recolor any
	   overlay that drew its arrow with presentation attributes. */
	svg { width: 1em !important; height: 1em !important; vertical-align: -0.125em }
	path { fill: currentColor !important }

	.bar { display: flex; align-items: center; justify-content: space-between; gap: 16px;
		padding: 16px 32px; background: #111827; color: #fff }
	.brand { display: flex; align-items: center; gap: 10px; font-weight: 650; font-size: 17px }
	.pill { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
		padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.12);
		color: #cbd5e1 }
	main { max-width: 900px; margin: 0 auto; padding: 40px 32px;
		display: grid; grid-template-columns: 1.3fr 1fr; gap: 24px; align-items: start }
	.card { background: #fff; border: 1px solid #dfe4ec; border-radius: 14px; padding: 28px;
		box-shadow: 0 1px 2px rgba(16,24,40,.04) }
	h1 { margin: 0 0 6px; font-size: 24px; letter-spacing: -.01em }
	h2 { margin: 0 0 12px; font-size: 15px; text-transform: uppercase; letter-spacing: .06em;
		color: #64748b }
	p { margin: 0 0 22px; color: #475569 }
	label { display: block; font-weight: 600; font-size: 13px; color: #334155; margin-bottom: 8px }
	input { width: 100%; padding: 11px 14px; font: inherit; border: 1px solid #cbd5e1;
		border-radius: 9px; margin-bottom: 22px; background: #fff }
	.row { display: flex; gap: 12px }
	button { font: inherit; font-weight: 600; padding: 11px 20px; border-radius: 9px;
		border: 1px solid #cbd5e1; background: #fff; color: #111827; cursor: pointer }
	button.primary { background: #2563eb; border-color: #2563eb; color: #fff }
	ul { margin: 0; padding-left: 18px; color: #475569 }
	li { margin-bottom: 10px }
	code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
		background: #f1f5f9; padding: 2px 6px; border-radius: 5px }
	dialog { border: 0; border-radius: 14px; padding: 32px; max-width: 420px;
		box-shadow: 0 24px 48px rgba(16,24,40,.24) }
	dialog::backdrop { background: rgba(15,23,42,.45) }
`

const JS = `
	document.getElementById('deploy').addEventListener('click', () => {
		document.getElementById('done').showModal()
	})
	document.getElementById('close').addEventListener('click', () => {
		document.getElementById('done').close()
	})
`

const HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Acme Console</title><link rel="stylesheet" href="/app.css"></head>
<body>
	<header class="bar">
		<span class="brand">
			<svg viewBox="0 0 24 24"><path d="M12 2 L22 20 L2 20 Z"/></svg>
			Acme Console
		</span>
		<span class="pill">${POLICY}</span>
	</header>
	<main>
		<section class="card">
			<h1>Deploy a service</h1>
			<p>Ship a new revision to the production cluster.</p>
			<label for="name">Service name</label>
			<input id="name" value="checkout-api">
			<div class="row">
				<button id="deploy" class="primary">Deploy</button>
				<button id="settings">Settings</button>
			</div>
		</section>
		<section class="card">
			<h2>This page resists overlays</h2>
			<ul>
				<li>Strict CSP: no injected <code>&lt;style&gt;</code>, no <code>data:</code> images</li>
				<li>Global reset: <code>svg { width: 1em !important }</code></li>
				<li>Global reset: <code>path { fill: currentColor !important }</code></li>
			</ul>
		</section>
	</main>
	<dialog id="done">
		<h2>Deployed</h2>
		<p><strong>checkout-api</strong> is live on 3 nodes.</p>
		<button id="close" class="primary">Close</button>
	</dialog>
	<script src="/app.js"></script>
</body>
</html>`

const body = (path: string) => {
	if (path.endsWith('/app.css')) return { type: 'text/css; charset=utf-8', text: CSS }
	if (path.endsWith('/app.js')) return { type: 'text/javascript; charset=utf-8', text: JS }
	return { type: 'text/html; charset=utf-8', text: HTML }
}

export const serveConsole = async (page: Page) => {
	await page.route(`${ORIGIN}/**`, (route) => {
		const { type, text } = body(new URL(route.request().url()).pathname)
		return route.fulfill({
			status: 200,
			headers: { 'content-type': type, 'content-security-policy': POLICY },
			body: text,
		})
	})
	await page.goto(`${ORIGIN}/`)
}
