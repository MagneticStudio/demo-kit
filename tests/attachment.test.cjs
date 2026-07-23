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
			'--placement',
			'body',
			'--slot',
			'voice-notes',
			'--repo',
			'MagneticStudio/standard-mail-routing',
		]),
		{
			file: 'demo.mp4',
			headed: false,
			help: false,
			login: false,
			message: 'Voice notes walkthrough',
			placement: 'body',
			pr: '195',
			repo: 'MagneticStudio/standard-mail-routing',
			slot: 'voice-notes',
		},
	)
	assert.throws(
		() => attachment.parsePrDemoAttachmentArgs(['--placement', 'sidebar']),
		/placement must be body or comment/,
	)
})

test('appends a stable recording slot without changing existing PR content', () => {
	const block = attachment.buildPrDemoBodyBlock(
		'https://github.com/user-attachments/assets/new-video',
		'primary',
		'Updated walkthrough',
	)
	assert.equal(
		block,
		[
			'<!-- demo-kit:recording:primary:start -->',
			'## Demo',
			'',
			'Updated walkthrough',
			'',
			'https://github.com/user-attachments/assets/new-video',
			'<!-- demo-kit:recording:primary:end -->',
		].join('\n'),
	)
	assert.equal(
		attachment.upsertPrDemoBodySlot('## Summary\n\nHuman-authored details.', block, 'primary'),
		`## Summary\n\nHuman-authored details.\n\n${block}`,
	)
	assert.equal(attachment.upsertPrDemoBodySlot('', block, 'primary'), block)
})

test('replaces only the selected recording slot', () => {
	const oldPrimary = attachment.buildPrDemoBodyBlock('https://example.com/old', 'primary')
	const mobile = attachment.buildPrDemoBodyBlock('https://example.com/mobile', 'mobile')
	const body = `Before\n\n${oldPrimary}\n\nBetween\n\n${mobile}\n\nAfter`
	const replacement = attachment.buildPrDemoBodyBlock('https://example.com/new', 'primary')
	const updated = attachment.upsertPrDemoBodySlot(body, replacement, 'primary')

	assert.equal(updated, `Before\n\n${replacement}\n\nBetween\n\n${mobile}\n\nAfter`)
	assert.equal(attachment.readPrDemoBodySlot(updated, 'primary'), replacement)
	assert.equal(attachment.readPrDemoBodySlot(updated, 'mobile'), mobile)
})

test('fails closed for invalid slots and ambiguous markers', () => {
	const block = attachment.buildPrDemoBodyBlock('https://example.com/new', 'primary')
	assert.throws(() => attachment.prDemoBodySlotMarkers('Primary demo'), /lowercase letters/)
	assert.throws(
		() =>
			attachment.upsertPrDemoBodySlot(
				'<!-- demo-kit:recording:primary:start -->\nUnclosed',
				block,
				'primary',
			),
		/malformed or duplicate/,
	)
	assert.throws(
		() => attachment.upsertPrDemoBodySlot(`${block}\n\n${block}`, block, 'primary'),
		/malformed or duplicate/,
	)
	assert.throws(
		() =>
			attachment.upsertPrDemoBodySlot(
				'<!-- demo-kit:recording:primary:end -->\n<!-- demo-kit:recording:primary:start -->',
				block,
				'primary',
			),
		/markers are out of order/,
	)
	assert.throws(
		() =>
			attachment.upsertPrDemoBodySlot(
				'Human content\n\n<!-- demo-kit:recording:secondary:start -->\nUnclosed',
				block,
				'primary',
			),
		/Demo slot "secondary" has malformed or duplicate markers/,
	)
	assert.throws(
		() =>
			attachment.upsertPrDemoBodySlot(
				'Human content\n\n<!-- demo-kit:recording:Invalid:start -->',
				block,
				'primary',
			),
		/invalid DemoKit recording marker/,
	)
	assert.throws(
		() =>
			attachment.upsertPrDemoBodySlot(
				[
					'<!-- demo-kit:recording:primary:start -->',
					'<!-- demo-kit:recording:secondary:start -->',
					'<!-- demo-kit:recording:primary:end -->',
					'<!-- demo-kit:recording:secondary:end -->',
				].join('\n'),
				block,
				'primary',
			),
		/Demo slot "secondary" has malformed or duplicate markers/,
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
