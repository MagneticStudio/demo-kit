import type { PlaywrightTestConfig } from '@playwright/test'
import { DEMO, SLOWMO } from './mode'

export interface DemoConfigOptions {
	width?: number
	height?: number
}

// Top-level config defaults for a demo-capable suite: serial workers (one continuous video),
// retries only in CI mode, video always-on in demo / retain-on-failure in CI.
export const demoConfigDefaults = (
	options: DemoConfigOptions = {},
): Pick<PlaywrightTestConfig, 'workers' | 'retries' | 'use'> => {
	const width = options.width ?? 1440
	const height = options.height ?? 900
	return {
		workers: 1,
		retries: DEMO ? 0 : 2,
		use: {
			viewport: { width, height },
			// Passing 'on' alone downscales the video to 800px — the explicit size keeps it 1:1.
			video: DEMO ? { mode: 'on', size: { width, height } } : 'retain-on-failure',
			trace: 'retain-on-failure',
		},
	}
}

// Per-project `use` additions. Spread AFTER a devices preset — presets carry their own
// viewport/launchOptions that would otherwise override these.
export const demoProjectUse = (options: DemoConfigOptions = {}) => {
	const width = options.width ?? 1440
	const height = options.height ?? 900
	return {
		viewport: { width, height },
		launchOptions: { slowMo: SLOWMO },
	}
}
