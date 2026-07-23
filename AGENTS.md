# Setting up demo-kit in a project (agent instructions)

Goal: this project's Playwright suite gains an opt-in recording mode. Bare `playwright test`
must behave exactly as before; `DEMO=true` produces a paced, captioned, cursor-visible video.

## 1. Install

Choose one installation method.

### Git dependency

If the project can reach the repo and its Git credentials have access:

```bash
npm install --save-dev github:MagneticStudio/demo-kit#main
```

The consuming project's lockfile pins the resolved commit. Re-run the command to update deliberately.

### Vendored source

If Git installation is unavailable or the team prefers checked-in source, copy exactly these files
from one demo-kit commit or release into `e2e/demo-kit/`:

```text
config.ts
helpers.ts
index.ts
mode.ts
overlay.ts
```

Do not copy `dist/`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsdown.config.mts`, or
demo-kit's tests. Those belong to package development, not the vendored runtime. When updating,
replace all five source files together so their internal imports and APIs stay in sync.

For this layout, use local imports in the remaining steps:

```ts
// playwright.config.ts
import { demoConfigDefaults, demoProjectUse } from './e2e/demo-kit'

// e2e/walkthrough.spec.ts
import { test, expect, setCaption, hold, smoothClick } from './demo-kit'
```

Adjust those paths if the project uses a different layout. The vendored source is self-contained;
its only dependency is `@playwright/test >= 1.40`.

### Optional PR attachment CLI

To attach recordings to GitHub PRs without manually driving the upload UI each time, copy these
two additional files from the same DemoKit commit:

```text
pr-attachment.ts
attach-pr-demo.ts
```

Run `attach-pr-demo.ts` with the consuming project's TypeScript runtime. This optional tool also
requires `ws`; the core five-file recording runtime does not. Keep the two attachment files in the
same directory because the executable imports the library relatively.

The attachment CLI posts a PR comment by default. `--placement body --slot primary` instead owns a
hidden, marker-delimited section of the PR description. Reusing a slot replaces only that section.
Never replace the whole body from a stale copy: preserve content outside the markers and abort on
partial, duplicate, invalid, or out-of-order markers.

If the project has no Playwright yet: `npm i -D @playwright/test && npx playwright install chromium`.

## 2. Wire the config

In `playwright.config.ts`, spread the factories. Order matters — `demoProjectUse()` must come
AFTER a `devices` preset or the preset's viewport/launchOptions win:

```ts
import { defineConfig, devices } from '@playwright/test'
import { demoConfigDefaults, demoProjectUse } from 'demo-kit'

export default defineConfig({
	testDir: './tests',
	...demoConfigDefaults(), // returns recording overrides only when DEMO=true
	projects: [
		{
			name: 'app',
			use: {
				...devices['Desktop Chrome'],
				...demoProjectUse(),
				baseURL: '<app url>',
			},
		},
	],
})
```

Preserve any existing config keys; the factories return no overrides outside demo mode. In demo
mode, if the project already sets `workers`, `retries`, `viewport`, `launchOptions`, or `video`,
the demo-kit values should win only if the team agrees — ask.

## 3. Scripts

```json
"test": "playwright test",
"record": "DEMO=true playwright test"
```

## 4. Specs

Import from the kit instead of `@playwright/test`:

```ts
import { test, expect, setCaption, hold, smoothClick } from 'demo-kit'
```

Demo-spec conventions:

- Structure specs as `scene(page, 'Short title', async () => { ... })` blocks — one per logical
  beat. The title is both the `test.step` name and the on-screen caption; the closing hold is
  automatic. Captions are sticky across navigations inside a scene.
- `smoothClick(page, locator)` instead of `.click()` for anything the viewer should follow.
- Never call `page.waitForTimeout` directly in a spec, and never branch on `DEMO` in a test
  body — pacing and mode differences live in the kit.
- Captions: one short title, no title+description pairs.

## 5. Auth (decide with the human)

The kit does not handle auth. Ask which strategy the project uses before writing specs:

- storageState from a real login (setup project) — works against any build.
- token injection via an app-side env-gated hook — needs app cooperation, local builds only.

## 6. Verify (both directions, in order)

1. `npx playwright test --list` — specs load, no import errors.
2. Bare run: passes, **no** video files produced on success.
3. `DEMO=true` run: passes, video exists at the configured size (default 1440×900 —
   check with `ffprobe -select_streams v:0 -show_entries stream=width,height <webm>`),
   cursor visible in a frame (`ffmpeg -ss <t> -i <webm> -frames:v 1 frame.png`).
4. Deliver mp4: `ffmpeg -i <webm> -c:v libx264 -pix_fmt yuv420p out.mp4`.

## 7. Before merge

Wait for the required `codex-review` status. It passes when Codex reacts with 👍 to the latest
revision or every Codex review thread is resolved after the latest revision. Never merge while that
status is pending or failing, even if the test suite is green. After addressing feedback, comment
`@codex review` on the pull request to trigger an immediate recheck. If Codex finishes after the
gate's polling window, use the same comment to recheck its late approval.

## Known failure modes

- Video is 800px wide → something replaced the video setting with bare `'on'`; use
  `demoConfigDefaults()` (it sets an explicit size).
- No cursor in the video → the page isn't on localhost (cursor defaults to `local-only`
  for CSP safety). Use `createDemoTest({ cursor: 'always' })` if the target allows
  injected styles.
- Cursor vanishes when a modal opens → only native `<dialog>` is auto-handled; other
  top-layer implementations may need the same Popover re-show trick.
- Caption missing on a strict-CSP page → expected for the cursor, but captions use
  programmatic styles and should still render; if not, the page likely blocks `addInitScript`.
