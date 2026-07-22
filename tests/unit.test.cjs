const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

const run = (environment, source) =>
	spawnSync(process.execPath, ['-e', source], {
		cwd: root,
		encoding: 'utf8',
		env: { ...process.env, DEMO: 'false', ...environment },
	})

test('plain mode leaves Playwright and its config untouched', () => {
	const result = run(
		{ DEMO: 'false' },
		`const kit = require('.')
		const playwright = require('@playwright/test')
		console.log(JSON.stringify({
			config: kit.demoConfigDefaults(),
			project: kit.demoProjectUse(),
			fixtures: kit.demoFixtures(),
			sameTest: kit.test === playwright.test,
		}))`,
	)

	assert.equal(result.status, 0, result.stderr)
	assert.deepEqual(JSON.parse(result.stdout), {
		config: {},
		project: {},
		fixtures: {},
		sameTest: true,
	})
})

test('demo mode supplies recording configuration', () => {
	const result = run(
		{ DEMO: 'true', DEMO_SLOWMO: '125' },
		`const kit = require('.')
		console.log(JSON.stringify({
			config: kit.demoConfigDefaults({ width: 1280, height: 720 }),
			project: kit.demoProjectUse({ width: 1280, height: 720 }),
			fixtureNames: Object.keys(kit.demoFixtures()),
		}))`,
	)

	assert.equal(result.status, 0, result.stderr)
	assert.deepEqual(JSON.parse(result.stdout), {
		config: {
			workers: 1,
			retries: 0,
			use: {
				viewport: { width: 1280, height: 720 },
				video: { mode: 'on', size: { width: 1280, height: 720 } },
				trace: 'retain-on-failure',
			},
		},
		project: {
			viewport: { width: 1280, height: 720 },
			launchOptions: { slowMo: 125 },
		},
		fixtureNames: ['demoOverlay'],
	})
})

test('invalid demo timing values fail with a useful error', () => {
	const result = run({ DEMO: 'true', DEMO_PAUSE: 'later' }, `require('.')`)

	assert.notEqual(result.status, 0)
	assert.match(result.stderr, /DEMO_PAUSE must be a finite, non-negative number/)
})

test('invalid video dimensions fail with a useful error', () => {
	const result = run(
		{ DEMO: 'true' },
		`require('.').demoConfigDefaults({ width: 0, height: 900 })`,
	)

	assert.notEqual(result.status, 0)
	assert.match(result.stderr, /width must be a positive integer/)
})
