# Setting up demo-kit in a project (agent instructions)

Goal: this project's Playwright suite gains an opt-in recording mode. Bare `playwright test`
must behave exactly as before; `DEMO=true` produces a paced, captioned, cursor-visible video.

## 1. Install

If the project can reach the repo:

```bash
npm install --save-dev github:MagneticStudio/demo-kit
```

Otherwise vendor it: copy the kit's `*.ts` files into `e2e/demo-kit/` (it is self-contained;
only peer-dep is `@playwright/test >= 1.40`). Adjust import paths below accordingly.

If the project has no Playwright yet: `npm i -D @playwright/test && npx playwright install chromium`.

## 2. Wire the config

In `playwright.config.ts`, spread the factories. Order matters — `demoProjectUse()` must come
AFTER a `devices` preset or the preset's viewport/launchOptions win:

```ts
import { defineConfig, devices } from '@playwright/test'
import { demoConfigDefaults, demoProjectUse } from 'demo-kit'

export default defineConfig({
	testDir: './tests',
	...demoConfigDefaults(), // workers: 1, retries/video switch on DEMO
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

Preserve any existing config keys; only merge these in. If the project already sets `workers`,
`retries`, or `video`, the demo-kit values should win only if the team agrees — ask.

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

- `setCaption(page, 'Short title')` immediately after each scene's page is ready — not after
  the interactions, or the label appears late.
- `smoothClick(page, locator)` instead of `.click()` for anything the viewer should follow.
- `hold(page)` at the end of each scene.
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
