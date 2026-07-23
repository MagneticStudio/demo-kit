const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const attachment = require('../dist/pr-attachment.cjs')
const root = path.resolve(__dirname, '..')

test('parses login and upload options', () => {
	assert.deepEqual(attachment.parsePrDemoAttachmentArgs(['--login', '--headed']), {
		headed: true,
		help: false,
		login: true,
	})
	assert.deepEqual(
		attachment.parsePrDemoAttachmentArgs([
			'--pr',
			'195',
			'--file',
			'demo.mp4',
			'--message',
			'Voice notes walkthrough',
			'--repo',
			'MagneticStudio/standard-mail-routing',
		]),
		{
			file: 'demo.mp4',
			headed: false,
			help: false,
			login: false,
			message: 'Voice notes walkthrough',
			pr: '195',
			repo: 'MagneticStudio/standard-mail-routing',
		},
	)
})

test('extracts both native attachment URL forms', () => {
	assert.equal(
		attachment.extractGitHubUserAttachmentUrl(
			'https://github.com/user-attachments/assets/12345678-abcd-1234-abcd-123456789abc',
		),
		'https://github.com/user-attachments/assets/12345678-abcd-1234-abcd-123456789abc',
	)
	assert.equal(
		attachment.extractGitHubUserAttachmentUrl(
			'[notes.wav](https://github.com/user-attachments/files/12345678/notes.wav)',
		),
		'https://github.com/user-attachments/files/12345678/notes.wav',
	)
})

test('builds a comment and validates video files', () => {
	assert.equal(
		attachment.buildPrDemoComment('/tmp/voice-notes.mp4', 'https://example.com/demo'),
		'DemoKit recording: voice-notes.mp4\n\nhttps://example.com/demo',
	)
	assert.throws(() => attachment.assertSupportedDemoVideo('demo.gif', 1), /must be an \.mp4/)
	assert.throws(
		() => attachment.assertSupportedDemoVideo('demo.mp4', 101 * 1024 * 1024),
		/100 MB/,
	)
	assert.doesNotThrow(() => attachment.assertSupportedDemoVideo('demo.mp4', 1))
})

test('published CLI exposes help without requiring a repository', () => {
	const result = spawnSync(process.execPath, ['dist/attach-pr-demo.mjs', '--help'], {
		cwd: root,
		encoding: 'utf8',
	})
	assert.equal(result.status, 0, result.stderr)
	assert.match(result.stdout, /demo-kit-attach --login/)
})
