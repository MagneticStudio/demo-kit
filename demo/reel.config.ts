import { defineConfig, devices } from '@playwright/test'
import { SLOWMO, demoConfigDefaults, demoProjectUse } from 'demo-kit'

// Point at a Chromium outside Playwright's registry, for environments where
// `playwright install` cannot reach the download host. Unset in normal use.
const chromium = process.env.DEMO_CHROMIUM

export default defineConfig({
	testDir: '.',
	reporter: 'line',
	...demoConfigDefaults(),
	projects: [
		{
			name: 'reel',
			use: {
				...devices['Desktop Chrome'],
				...demoProjectUse(),
				...(chromium ? { launchOptions: { slowMo: SLOWMO, executablePath: chromium } } : {}),
			},
		},
	],
})
