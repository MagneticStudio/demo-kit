// Demo mode (default) paces the run and records a human-watchable video.
// CI mode (DEMO=false) runs fast and headless as a plain e2e assertion pass.
export const DEMO = process.env.DEMO !== 'false'

export const PAUSE = DEMO ? Number(process.env.DEMO_PAUSE ?? 2200) : 0
export const SETTLE = DEMO ? Number(process.env.DEMO_SETTLE ?? 550) : 0
export const SLOWMO = DEMO ? Number(process.env.DEMO_SLOWMO ?? 450) : 0
