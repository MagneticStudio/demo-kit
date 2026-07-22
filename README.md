# demo-kit

Portable Playwright layer for recording human-watchable demo videos that double as e2e tests.
Self-contained — its only runtime peer is `@playwright/test`. Git/package installs build to
JavaScript with declarations; a checkout can also be vendored as TypeScript source.

What it gives you:

- **Two modes from one spec.** Default is the consumer's Playwright behavior, unchanged.
  `DEMO=true` opts into recording: one worker, no retries, slowMo, paced holds, cursor overlay,
  and always-on video. Conventional usage stays conventional — recording is the add-on.
- **Visible cursor** — SVG arrow that glides between targets (Playwright's pointer teleports;
  a CSS transition smooths it), click ripple, kept above native `<dialog>` modals via the
  Popover API. Defaults to localhost-only because strict-CSP pages (e.g. hosted auth UIs) block
  the injected style; captions still work there (programmatic styles survive CSP).
- **Corner captions** — one short label, bottom-left, blurred translucent pill. Set it when a
  scene's page loads, not after the interactions, or it shows up late.
- **Config factories** encoding the sharp edges: explicit `video.size` (bare `'on'` downscales
  to 800px), slowMo wiring, spread-order vs `devices` presets.

## Setup

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'
import { demoConfigDefaults, demoProjectUse } from 'demo-kit'

export default defineConfig({
	testDir: './tests',
	...demoConfigDefaults(), // recording overrides only when DEMO=true
	projects: [
		{
			name: 'myapp',
			use: {
				...devices['Desktop Chrome'],
				...demoProjectUse(), // after the preset — presets carry their own viewport
				baseURL: 'http://localhost:3000',
			},
		},
	],
})
```

```ts
// tests/walkthrough.spec.ts
import { test, expect, setCaption, hold, smoothClick } from 'demo-kit'

test('walkthrough', async ({ page }) => {
	await page.goto('/thing')
	await setCaption(page, 'The thing — enabled')
	await smoothClick(page, page.getByRole('button', { name: 'Do it' }))
	await expect(page.getByText('Done')).toBeVisible()
	await hold(page)
})
```

Scripts: `"test": "playwright test"` and `"record": "DEMO=true playwright test"`.

Ship the video (Playwright records webm):

```bash
ffmpeg -i test-results/<dir>/video.webm -c:v libx264 -pix_fmt yuv420p out.mp4
```

## Auth is yours to bring

Deliberately out of scope — it's app-specific. Two proven strategies:

- **Real UI login + `storageState` cache**: log in through the app once (a setup project),
  save `context.storageState()`, reuse it via the project's `storageState` option. Zero app
  changes; works against deployed builds; exercises the login path.
- **Token injection via an app hook**: mint a token programmatically and seed it into
  storage that a dormant, env-gated hook in the app promotes into its auth state on boot.
  Fast and skips login entirely, but only works on builds you control.

The kit composes with either — `createDemoTest()` returns Playwright's unchanged base `test`
outside demo mode and a context-instrumented `test` in demo mode. You can extend either with
your own fixtures; popups and new tabs created in demo mode inherit the overlay.

## Already have a custom `test`?

Importing our `test` is only needed because Playwright fixtures live on a `test` instance
(the standard pattern for shipping fixtures). If you already extend your own, compose instead:

```ts
import { mergeTests } from '@playwright/test'
import { test as demoTest } from 'demo-kit'
import { test as authTest } from './auth.fixture'

export const test = mergeTests(authTest, demoTest)
```

or `authTest.extend(demoFixtures())`. And `expect` is an unmodified re-export — importing it
from `@playwright/test` works identically.

## Knobs

| Env var | Default | Meaning |
| --- | --- | --- |
| `DEMO` | `false` | `true` (or `1`) = recording mode |
| `DEMO_PAUSE` | 2200 | ms hold per scene |
| `DEMO_SETTLE` | 550 | ms cursor-glide settle before clicks |
| `DEMO_SLOWMO` | 450 | Playwright slowMo ms |

`createDemoTest({ cursor: 'always' | 'local-only' | 'never' })` controls the cursor overlay.
Timing overrides must be finite, non-negative numbers. Video width and height must be positive
integers.

## Development

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` builds and type-checks the distributable, verifies the packed artifact, confirms plain
mode stays browser-free for API-only tests, and exercises overlays, popups, and modal stacking in
Chromium. `tsdown` produces the ESM, CommonJS, source-map, and declaration outputs; `tsc --noEmit`
remains the independent type-check, while `publint` and Are the Types Wrong validate the packed
package.
