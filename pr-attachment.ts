import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { basename, delimiter, extname, resolve } from 'node:path'
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import WebSocket from 'ws'

const USER_ATTACHMENT_URL =
	/https:\/\/github\.com\/user-attachments\/(?:assets|files)\/[A-Za-z0-9._/-]+/

export const prDemoAttachmentUsage = `Attach a DemoKit recording to a GitHub pull request.

One-time browser login:
  demo-kit-attach --login

Upload and comment:
  demo-kit-attach --pr 195 --file e2e/adhoc/demo.mp4

Upload into a stable PR description slot:
  demo-kit-attach --pr 195 --file e2e/adhoc/demo.mp4 --placement body --slot primary

Options:
  --login                Sign in to the dedicated local GitHub browser profile
  --pr <number|url>      Pull request number, URL, or branch accepted by gh
  --file <path>          .mp4, .mov, or .webm recording to attach
  --message <text>       Comment text or body caption before the recording
  --placement <target>   comment (default) or body
  --slot <name>          Stable body slot name; defaults to primary
  --repo <owner/name>    Repository override; defaults to the current repository
  --profile-dir <path>   Browser profile override
  --headed               Show the browser during upload for debugging
  --help                 Show this help
`

export interface PrDemoAttachmentOptions {
	file?: string
	headed: boolean
	help: boolean
	login: boolean
	message?: string
	placement?: 'body' | 'comment'
	pr?: string
	profileDir?: string
	repo?: string
	slot?: string
}

export interface RunPrDemoAttachmentOptions {
	cwd?: string
	env?: NodeJS.ProcessEnv
	log?: (message: string) => void
}

export function parsePrDemoAttachmentArgs(args: string[]): PrDemoAttachmentOptions {
	const options: PrDemoAttachmentOptions = { headed: false, help: false, login: false }

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index]
		if (argument === '--headed') {
			options.headed = true
			continue
		}
		if (argument === '--help' || argument === '-h') {
			options.help = true
			continue
		}
		if (argument === '--login') {
			options.login = true
			continue
		}

		const name = argument?.startsWith('--') ? argument.slice(2) : undefined
		if (
			!name ||
			!['file', 'message', 'placement', 'pr', 'profile-dir', 'repo', 'slot'].includes(name)
		) {
			throw new Error(`Unknown argument: ${argument ?? ''}`)
		}
		const value = args[index + 1]
		if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`)
		index += 1

		if (name === 'file') options.file = value
		else if (name === 'message') options.message = value
		else if (name === 'placement') {
			if (value !== 'body' && value !== 'comment') {
				throw new Error('--placement must be body or comment')
			}
			options.placement = value
		} else if (name === 'pr') options.pr = value
		else if (name === 'profile-dir') options.profileDir = value
		else if (name === 'slot') options.slot = value
		else options.repo = value
	}

	return options
}

export function extractGitHubUserAttachmentUrl(markdown: string): string | undefined {
	return markdown.match(USER_ATTACHMENT_URL)?.[0]
}

export function buildPrDemoComment(file: string, url: string, message?: string): string {
	const summary = message?.trim() || `DemoKit recording: ${basename(file)}`
	return `${summary}\n\n${url}`
}

function assertValidDemoSlot(slot: string): void {
	if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slot)) {
		throw new Error('Demo slot must use 1-64 lowercase letters, numbers, or hyphens')
	}
}

export function prDemoBodySlotMarkers(slot: string): { end: string; start: string } {
	assertValidDemoSlot(slot)
	return {
		start: `<!-- demo-kit:recording:${slot}:start -->`,
		end: `<!-- demo-kit:recording:${slot}:end -->`,
	}
}

export function buildPrDemoBodyBlock(url: string, slot: string, message?: string): string {
	const markers = prDemoBodySlotMarkers(slot)
	const summary = message?.trim()
	const content = summary ? `## Demo\n\n${summary}\n\n${url}` : `## Demo\n\n${url}`
	return `${markers.start}\n${content}\n${markers.end}`
}

function occurrenceCount(value: string, search: string): number {
	let count = 0
	let offset = 0
	while (true) {
		const index = value.indexOf(search, offset)
		if (index === -1) return count
		count += 1
		offset = index + search.length
	}
}

export function upsertPrDemoBodySlot(body: string, block: string, slot: string): string {
	const markers = prDemoBodySlotMarkers(slot)
	const startCount = occurrenceCount(body, markers.start)
	const endCount = occurrenceCount(body, markers.end)
	if (startCount === 0 && endCount === 0) {
		if (!body) return block
		if (body.endsWith('\n\n')) return `${body}${block}`
		if (body.endsWith('\n')) return `${body}\n${block}`
		return `${body}\n\n${block}`
	}
	if (startCount !== 1 || endCount !== 1) {
		throw new Error(`Demo slot "${slot}" has malformed or duplicate markers`)
	}

	const startIndex = body.indexOf(markers.start)
	const endIndex = body.indexOf(markers.end)
	if (endIndex < startIndex) throw new Error(`Demo slot "${slot}" markers are out of order`)
	return `${body.slice(0, startIndex)}${block}${body.slice(endIndex + markers.end.length)}`
}

export function readPrDemoBodySlot(body: string, slot: string): string | undefined {
	const markers = prDemoBodySlotMarkers(slot)
	const startCount = occurrenceCount(body, markers.start)
	const endCount = occurrenceCount(body, markers.end)
	if (startCount === 0 && endCount === 0) return undefined
	if (startCount !== 1 || endCount !== 1) {
		throw new Error(`Demo slot "${slot}" has malformed or duplicate markers`)
	}
	const startIndex = body.indexOf(markers.start)
	const endIndex = body.indexOf(markers.end)
	if (endIndex < startIndex) throw new Error(`Demo slot "${slot}" markers are out of order`)
	return body.slice(startIndex, endIndex + markers.end.length)
}

export function assertSupportedDemoVideo(file: string, size: number): void {
	const extension = extname(file).toLowerCase()
	if (!['.mp4', '.mov', '.webm'].includes(extension)) {
		throw new Error('Demo recording must be an .mp4, .mov, or .webm file')
	}
	if (size > 100 * 1024 * 1024) {
		throw new Error("Demo recording exceeds GitHub's 100 MB video attachment limit")
	}
}

async function runCommand(command: string, args: string[], cwd: string): Promise<string> {
	return new Promise((resolveCommand, rejectCommand) => {
		const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
		let stdout = ''
		let stderr = ''
		child.stdout.setEncoding('utf8')
		child.stderr.setEncoding('utf8')
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk
		})
		child.stderr.on('data', (chunk: string) => {
			stderr += chunk
		})
		child.once('error', rejectCommand)
		child.once('close', (code) => {
			if (code === 0) resolveCommand(stdout.trim())
			else rejectCommand(new Error(stderr.trim() || `${command} exited with code ${code}`))
		})
	})
}

interface PullRequestView {
	body: string
	number: number
	state: string
	url: string
}

async function viewPullRequest(
	pr: string,
	repo: string,
	cwd: string,
): Promise<PullRequestView> {
	const result = JSON.parse(
		await runCommand(
			'gh',
			['pr', 'view', pr, '--repo', repo, '--json', 'body,number,state,url'],
			cwd,
		),
	) as { body: string | null; number: number; state: string; url: string }
	return { ...result, body: result.body ?? '' }
}

async function launchGitHubContext(profileDir: string, headless: boolean): Promise<BrowserContext> {
	return chromium.launchPersistentContext(profileDir, {
		channel: 'chrome',
		headless,
		ignoreDefaultArgs: ['--password-store=basic', '--use-mock-keychain'],
		viewport: { height: 900, width: 1440 },
	})
}

async function githubLogin(context: BrowserContext, page: Page): Promise<string | undefined> {
	const cookies = await context.cookies('https://github.com')
	const authenticated =
		cookies.some((cookie) => cookie.name === 'logged_in' && cookie.value === 'yes') &&
		cookies.some((cookie) => cookie.name === 'user_session')
	if (!authenticated) return undefined
	return (
		(await page.locator('meta[name="user-login"]').getAttribute('content')) ||
		'authenticated GitHub user'
	)
}

async function firstExecutable(names: string[], environment: NodeJS.ProcessEnv): Promise<string> {
	const directories = environment.PATH?.split(delimiter).filter(Boolean) ?? []
	for (const name of names) {
		for (const directory of directories) {
			const candidate = resolve(directory, name)
			if (await access(candidate, constants.X_OK).then(() => true).catch(() => false)) {
				return candidate
			}
		}
	}
	throw new Error('Google Chrome is required for the one-time GitHub login')
}

async function availablePort(): Promise<number> {
	const server = createServer()
	await new Promise<void>((resolveListening, reject) => {
		server.once('error', reject)
		server.listen(0, '127.0.0.1', resolveListening)
	})
	const address = server.address()
	if (!address || typeof address === 'string') throw new Error('Could not reserve a local port')
	await new Promise<void>((resolveClosed, reject) => {
		server.close((error) => (error ? reject(error) : resolveClosed()))
	})
	return address.port
}

async function loginCommand(
	profileDir: string,
	debuggingPort: number,
	environment: NodeJS.ProcessEnv,
): Promise<string[]> {
	const chromeArguments = [
		`--user-data-dir=${profileDir}`,
		'--disable-background-mode',
		'--no-default-browser-check',
		'--no-first-run',
		'--new-window',
		'--remote-allow-origins=*',
		'--remote-debugging-address=127.0.0.1',
		`--remote-debugging-port=${debuggingPort}`,
		'https://github.com/login',
	]
	if (process.platform === 'darwin') {
		return ['open', '-n', '-W', '-a', 'Google Chrome', '--args', ...chromeArguments]
	}
	return [
		await firstExecutable(['google-chrome', 'google-chrome-stable', 'chrome'], environment),
		...chromeArguments,
	]
}

function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds))
}

async function waitForDevTools(debuggingPort: number): Promise<void> {
	const deadline = Date.now() + 15_000
	while (Date.now() < deadline) {
		const ready = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`)
			.then((response) => response.ok)
			.catch(() => false)
		if (ready) return
		await sleep(100)
	}
	throw new Error('Chrome DevTools did not become ready for login verification')
}

interface CdpCookie {
	domain: string
	name: string
	value: string
}

interface CdpClient {
	close(): void
	request(method: string): Promise<unknown>
	send(method: string): void
}

async function connectDevTools(debuggingPort: number): Promise<CdpClient> {
	const version = (await fetch(`http://127.0.0.1:${debuggingPort}/json/version`).then((response) =>
		response.json(),
	)) as { webSocketDebuggerUrl?: string }
	if (!version.webSocketDebuggerUrl) throw new Error('Chrome did not expose a DevTools WebSocket')

	const socket = new WebSocket(version.webSocketDebuggerUrl)
	await new Promise<void>((resolveOpen, reject) => {
		socket.once('open', resolveOpen)
		socket.once('error', reject)
	})

	let nextId = 1
	const pending = new Map<number, { reject(error: Error): void; resolve(value: unknown): void }>()
	socket.on('message', (data) => {
		const response = JSON.parse(String(data)) as {
			error?: { message?: string }
			id?: number
			result?: unknown
		}
		if (response.id === undefined) return
		const request = pending.get(response.id)
		if (!request) return
		pending.delete(response.id)
		if (response.error) request.reject(new Error(response.error.message ?? 'DevTools request failed'))
		else request.resolve(response.result)
	})

	const send = (method: string, waitForResponse: boolean): Promise<unknown> | undefined => {
		const id = nextId
		nextId += 1
		if (!waitForResponse) {
			socket.send(JSON.stringify({ id, method }))
			return undefined
		}
		return new Promise((resolveRequest, rejectRequest) => {
			pending.set(id, { reject: rejectRequest, resolve: resolveRequest })
			socket.send(JSON.stringify({ id, method }))
		})
	}

	return {
		close: () => socket.close(),
		request: (method) => send(method, true) as Promise<unknown>,
		send: (method) => {
			send(method, false)
		},
	}
}

async function setupLogin(
	profileDir: string,
	environment: NodeJS.ProcessEnv,
	log: (message: string) => void,
): Promise<void> {
	const debuggingPort = await availablePort()
	const [command, ...args] = await loginCommand(profileDir, debuggingPort, environment)
	if (!command) throw new Error('Could not resolve a Chrome launch command')
	const chrome = spawn(command, args, { env: environment, stdio: 'ignore' })
	const chromeExit = new Promise<number | null>((resolveExit, rejectExit) => {
		chrome.once('error', rejectExit)
		chrome.once('close', resolveExit)
	})
	log('sign in to GitHub in the ordinary Chrome window; it will close after verification')
	await waitForDevTools(debuggingPort)
	const devTools = await connectDevTools(debuggingPort)
	const deadline = Date.now() + 10 * 60 * 1000
	let authenticated = false
	while (Date.now() < deadline) {
		const { cookies } = (await devTools.request('Storage.getCookies')) as {
			cookies: CdpCookie[]
		}
		authenticated =
			cookies.some(
				(cookie) =>
					cookie.domain.endsWith('github.com') &&
					cookie.name === 'logged_in' &&
					cookie.value === 'yes',
			) &&
			cookies.some(
				(cookie) => cookie.domain.endsWith('github.com') && cookie.name === 'user_session',
			)
		if (authenticated) break
		await sleep(500)
	}
	if (!authenticated) {
		devTools.close()
		throw new Error('GitHub login was not completed within ten minutes')
	}

	devTools.send('Browser.close')
	const exitCode = await chromeExit
	if (exitCode !== 0) throw new Error(`Chrome login window exited with code ${exitCode}`)

	const context = await launchGitHubContext(profileDir, true)
	try {
		const page = context.pages()[0] ?? (await context.newPage())
		await page.goto('https://github.com', { waitUntil: 'domcontentloaded' })
		const login = await githubLogin(context, page)
		if (!login) throw new Error('GitHub session was not detected; rerun --login and sign in')
		log(`saved the local GitHub session for ${login}`)
	} finally {
		await context.close()
	}
}

async function uploadRecording(
	profileDir: string,
	prUrl: string,
	file: string,
	headed: boolean,
): Promise<string> {
	const context = await launchGitHubContext(profileDir, !headed)
	try {
		const page = context.pages()[0] ?? (await context.newPage())
		await page.goto(prUrl, { waitUntil: 'domcontentloaded' })
		if (!(await githubLogin(context, page))) {
			throw new Error('GitHub browser session is missing; run with --login first')
		}

		const commentBox = page.getByRole('textbox', { name: 'Comment' }).last()
		await commentBox.waitFor({ state: 'visible', timeout: 30_000 })
		await commentBox.scrollIntoViewIfNeeded()
		const attachButton = page
			.getByRole('button', { name: 'Paste, drop, or click to add files', exact: true })
			.last()
		const chooserPromise = page.waitForEvent('filechooser', { timeout: 15_000 })
		await attachButton.click()
		const chooser = await chooserPromise
		await chooser.setFiles(file)

		const deadline = Date.now() + 2 * 60 * 1000
		while (Date.now() < deadline) {
			const url = extractGitHubUserAttachmentUrl(await commentBox.inputValue())
			if (url) return url
			await page.waitForTimeout(500)
		}
		throw new Error('GitHub did not finish uploading the recording within two minutes')
	} finally {
		await context.close()
	}
}

export async function runPrDemoAttachment(
	args: string[],
	options: RunPrDemoAttachmentOptions = {},
): Promise<void> {
	const cwd = resolve(options.cwd ?? process.cwd())
	const environment = options.env ?? process.env
	const log = options.log ?? ((message: string) => console.log(`[demo-kit-attach] ${message}`))
	const parsed = parsePrDemoAttachmentArgs(args)
	if (parsed.help) {
		console.log(prDemoAttachmentUsage)
		return
	}

	const profileDir = resolve(
		parsed.profileDir ??
			environment.GITHUB_ATTACHMENT_PROFILE_DIR ??
			resolve(cwd, '.cache/demo-kit/github-attachment'),
	)
	if (parsed.login) {
		await setupLogin(profileDir, environment, log)
		return
	}

	if (!parsed.pr) throw new Error('Missing --pr. Run with --help for usage.')
	if (!parsed.file) throw new Error('Missing --file. Run with --help for usage.')
	const placement = parsed.placement ?? 'comment'
	if (parsed.slot && placement !== 'body') {
		throw new Error('--slot requires --placement body')
	}
	const slot = parsed.slot ?? 'primary'
	if (placement === 'body') prDemoBodySlotMarkers(slot)
	const file = resolve(cwd, parsed.file)
	const fileStat = await stat(file).catch(() => undefined)
	if (!fileStat?.isFile()) throw new Error(`Recording does not exist: ${file}`)
	assertSupportedDemoVideo(file, fileStat.size)

	await runCommand('gh', ['auth', 'status'], cwd)
	const repo =
		parsed.repo ??
		(await runCommand('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], cwd))
	const pr = await viewPullRequest(parsed.pr, repo, cwd)
	if (pr.state !== 'OPEN') throw new Error(`Pull request is ${pr.state.toLowerCase()}: ${pr.url}`)

	log(`uploading ${file} to ${pr.url}`)
	const attachmentUrl = await uploadRecording(profileDir, pr.url, file, parsed.headed)
	if (placement === 'body') {
		const block = buildPrDemoBodyBlock(attachmentUrl, slot, parsed.message)
		const latestPr = await viewPullRequest(parsed.pr, repo, cwd)
		if (latestPr.state !== 'OPEN') {
			throw new Error(`Pull request is ${latestPr.state.toLowerCase()}: ${latestPr.url}`)
		}
		const updatedBody = upsertPrDemoBodySlot(latestPr.body, block, slot)
		await runCommand(
			'gh',
			[
				'api',
				'--method',
				'PATCH',
				`repos/${repo}/pulls/${latestPr.number}`,
				'-f',
				`body=${updatedBody}`,
			],
			cwd,
		)
		const verifiedPr = await viewPullRequest(parsed.pr, repo, cwd)
		if (readPrDemoBodySlot(verifiedPr.body, slot) !== block) {
			throw new Error(`Could not verify demo slot "${slot}" after updating the PR description`)
		}
		log(`updated recording slot "${slot}" in the PR description: ${pr.url}`)
		return
	}

	const comment = buildPrDemoComment(file, attachmentUrl, parsed.message)
	const commentUrl = await runCommand(
		'gh',
		['pr', 'comment', parsed.pr, '--repo', repo, '--body', comment],
		cwd,
	)
	log(`attached recording: ${commentUrl || pr.url}`)
}
