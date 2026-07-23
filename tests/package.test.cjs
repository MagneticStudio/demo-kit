const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

test('the packed package contains loadable JavaScript and declarations', (t) => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-kit-package-'))
	t.after(() => fs.rmSync(temporary, { force: true, recursive: true }))

	const output = execFileSync(
		'npm',
		['pack', '--json', '--ignore-scripts', '--pack-destination', temporary],
		{ cwd: root, encoding: 'utf8' },
	)
	const jsonStart = output.lastIndexOf('\n[\n')
	const [pack] = JSON.parse(output.slice(jsonStart === -1 ? 0 : jsonStart + 1))
	const archive = path.join(temporary, pack.filename)
	const installed = path.join(temporary, 'node_modules', 'demo-kit')
	fs.mkdirSync(installed, { recursive: true })
	execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', installed])

	const manifest = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'))
	assert.equal(manifest.main, './dist/index.cjs')
	assert.equal(manifest.module, './dist/index.mjs')
	assert.equal(manifest.types, './dist/index.d.mts')
	assert.equal(manifest.bin['demo-kit-attach'], './dist/attach-pr-demo.mjs')
	for (const expected of [
		'dist/index.cjs',
		'dist/index.mjs',
		'dist/index.d.cts',
		'dist/index.d.mts',
		'dist/attach-pr-demo.mjs',
		'dist/pr-attachment.mjs',
	]) {
		assert.ok(pack.files.some(({ path: file }) => file === expected), `missing ${expected}`)
	}
	assert.ok(
		pack.files.every(({ path: file }) => !/\.[cm]?ts$/.test(file) || /\.d\.[cm]?ts$/.test(file)),
	)

	fs.symlinkSync(path.join(root, 'node_modules', '@playwright'), path.join(temporary, 'node_modules', '@playwright'))

	const result = spawnSync(
		process.execPath,
		['-e', `const kit = require('./node_modules/demo-kit'); console.log(typeof kit.createDemoTest)`],
		{
			cwd: temporary,
			encoding: 'utf8',
			env: { ...process.env, NODE_PATH: path.join(root, 'node_modules') },
		},
	)
	assert.equal(result.status, 0, result.stderr)
	assert.equal(result.stdout.trim(), 'function')

	const esmResult = spawnSync(
		process.execPath,
		['--input-type=module', '-e', `import { createDemoTest } from 'demo-kit'; console.log(typeof createDemoTest)`],
		{ cwd: temporary, encoding: 'utf8' },
	)
	assert.equal(esmResult.status, 0, esmResult.stderr)
	assert.equal(esmResult.stdout.trim(), 'function')
})
