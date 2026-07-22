// Default is plain Playwright behavior (fast, headless, video only on failure).
// DEMO=true opts into recording mode: slowMo, paced holds, cursor overlay, always-on video.
export const DEMO = process.env.DEMO === 'true' || process.env.DEMO === '1'

const readDelay = (name: string, fallback: number) => {
	const raw = process.env[name]
	if (raw === undefined) return fallback

	const value = Number(raw)
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`${name} must be a finite, non-negative number; received ${JSON.stringify(raw)}`)
	}
	return value
}

export const PAUSE = DEMO ? readDelay('DEMO_PAUSE', 2200) : 0
export const SETTLE = DEMO ? readDelay('DEMO_SETTLE', 550) : 0
export const SLOWMO = DEMO ? readDelay('DEMO_SLOWMO', 450) : 0
