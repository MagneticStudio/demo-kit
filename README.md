# demo-kit

Portable Playwright layer for recording human-watchable demo videos that double as e2e tests.
The recording runtime's only peer is `@playwright/test`. Git/package installs build to
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
- **PR attachment CLI** — recordings become native GitHub video attachments while the final
  comment is posted through `gh`, avoiding repeated browser-driving for every pull request.

## Installation

Install directly from GitHub:

```bash
npm install --save-dev github:MagneticStudio/demo-kit#main
```

The consuming project's lockfile pins the resolved commit. Run the same command again when you
want to update to the latest `main`.

### Vendoring the TypeScript source

If the consuming project cannot or should not install a Git dependency, copy these five files from
the same demo-kit checkout into `e2e/demo-kit/`:

```text
config.ts
helpers.ts
index.ts
mode.ts
overlay.ts
```

The vendored layout can look like this:

```text
e2e/
  demo-kit/
    config.ts
    helpers.ts
    index.ts
    mode.ts
    overlay.ts
  walkthrough.spec.ts
playwright.config.ts
```

Use local imports instead of the package name:

```ts
// playwright.config.ts
import { demoConfigDefaults, demoProjectUse } from './e2e/demo-kit'

// e2e/walkthrough.spec.ts
import { test, expect, setCaption, hold, smoothClick } from './demo-kit'
```

Only `@playwright/test >= 1.40` is required. Do not copy `dist/`, `package.json`, the tsdown or
TypeScript build configuration, or demo-kit's tests; those support package development rather than
the vendored runtime. When updating a vendored copy, replace all five source files together from one
commit or release so they cannot drift out of sync.

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
import { test, expect, scene, smoothClick } from 'demo-kit'

test('walkthrough', async ({ page }) => {
	await page.goto('/things')
	await scene(page, 'The thing — enabled', async () => {
		await smoothClick(page, page.getByRole('button', { name: 'Do it' }))
		await expect(page.getByText('Done')).toBeVisible()
	})
})
```

`scene(page, title, body)` is the narration primitive: one `test.step` whose title is also the
on-screen caption, with the closing hold applied automatically. Outside demo mode it degrades to
a plain `test.step`. Captions are **sticky** — they survive navigations inside the scene until
replaced. (`setCaption`/`hold` remain available for manual control.)

Scripts: `"test": "playwright test"` and `"record": "DEMO=true playwright test"`.

Ship the video (Playwright records webm):

```bash
ffmpeg -i test-results/<dir>/video.webm -c:v libx264 -pix_fmt yuv420p out.mp4
```

## Attach a recording to a pull request

GitHub's public API can create a PR comment but cannot create the native `user-attachments` URL
for a video. DemoKit uses a dedicated local Chrome profile only for that upload, then uses `gh` to
post the comment. Sign in once:

```bash
npx demo-kit-attach --login
```

Chrome opens as an ordinary browser so hosted identity providers do not reject an automated login.
The window closes after DemoKit verifies the GitHub session. Then attach recordings headlessly:

```bash
npx demo-kit-attach --pr 195 --file test-results/demo.mp4 --message "Voice notes walkthrough"
```

Comments are the default. To keep the latest recording in a stable section of the PR description,
use a named body slot:

```bash
npx demo-kit-attach \
  --pr 195 \
  --file test-results/demo.mp4 \
  --placement body \
  --slot primary \
  --message "Voice notes walkthrough"
```

DemoKit wraps that section in hidden, slot-specific markers. A later upload to the same slot
replaces only the marked section with the new attachment URL; all content outside the markers is
preserved. Missing markers are appended, while partial, duplicate, invalid, or out-of-order markers
stop the command without editing the description. Each upload creates a new GitHub attachment URL;
the stable slot is what makes it appear as an in-place replacement.

The command uses the current repository and stores its ignored browser profile under
`.cache/demo-kit/github-attachment`. Use `--repo owner/name`, `--profile-dir path`, or `--headed`
to override those defaults. Slot names may contain 1-64 lowercase letters, numbers, or hyphens;
`primary` is used when `--slot` is omitted.

For a vendored install, optionally copy `pr-attachment.ts` and `attach-pr-demo.ts` from the same
DemoKit commit in addition to the five recording-runtime files. Run the entrypoint with the
project's TypeScript runtime, for example `bun e2e/demo-kit/attach-pr-demo.ts`. The optional CLI
also requires `ws`; it does not change the dependencies of the five-file recording runtime.

## Writing demo specs

- **One `scene()` per logical beat.** The title doubles as the report step and the caption —
  short and descriptive, no title+description pairs.
- **Never raw `page.waitForTimeout` in specs** — pacing lives in `scene`/`hold`/`smoothClick`.
  Keeps specs lint-clean under `eslint-plugin-playwright`'s `no-wait-for-timeout` and means CI
  mode stays fast automatically.
- **Never branch on `DEMO` in a test body.** The one-spec-two-modes contract depends on it;
  mode differences belong in the kit's helpers and fixtures.
- **Prefer role/testid selectors and web-first assertions.** Flaky selectors ruin a take —
  a retry in the middle of a recording is a re-shoot.

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
