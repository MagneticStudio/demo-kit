// Default is plain Playwright behavior (fast, headless, video only on failure).
// DEMO=true opts into recording mode: slowMo, paced holds, cursor overlay, always-on video.
export const DEMO = process.env.DEMO === 'true' || process.env.DEMO === '1'

export const PAUSE = DEMO ? Number(process.env.DEMO_PAUSE ?? 2200) : 0
export const SETTLE = DEMO ? Number(process.env.DEMO_SETTLE ?? 550) : 0
export const SLOWMO = DEMO ? Number(process.env.DEMO_SLOWMO ?? 450) : 0
