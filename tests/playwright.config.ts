import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: '.',
	fullyParallel: false,
	reporter: 'line',
	workers: 1,
	use: {
		browserName: 'chromium',
		headless: true,
	},
})
