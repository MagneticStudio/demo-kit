import type { PlaywrightTestConfig } from '@playwright/test'
import { DEMO, SLOWMO } from './mode'

export interface DemoConfigOptions {
	width?: number
	height?: number
}

const dimensions = (options: DemoConfigOptions) => {
	const width = options.width ?? 1440
	const height = options.height ?? 900
	for (const [name, value] of Object.entries({ width, height })) {
		if (!Number.isInteger(value) || value <= 0) {
			throw new Error(`${name} must be a positive integer; received ${JSON.stringify(value)}`)
		}
	}
	return { width, height }
}

// Top-level config additions for recording mode. Returning no keys outside demo mode keeps a
// consumer's normal workers, retries, tracing, and video behavior untouched.
export const demoConfigDefaults = (
	options: DemoConfigOptions = {},
): Partial<Pick<PlaywrightTestConfig, 'workers' | 'retries' | 'use'>> => {
	if (!DEMO) return {}
	const { width, height } = dimensions(options)
	return {
		workers: 1,
		retries: 0,
		use: {
			viewport: { width, height },
			// Passing 'on' alone downscales the video to 800px — the explicit size keeps it 1:1.
			video: { mode: 'on', size: { width, height } },
			trace: 'retain-on-failure',
		},
	}
}

// Per-project `use` additions. Spread AFTER a devices preset — presets carry their own
// viewport/launchOptions that would otherwise override these.
export const demoProjectUse = (options: DemoConfigOptions = {}) => {
	if (!DEMO) return {}
	const { width, height } = dimensions(options)
	return {
		viewport: { width, height },
		launchOptions: { slowMo: SLOWMO },
	}
}
