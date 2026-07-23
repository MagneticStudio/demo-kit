#!/usr/bin/env node

import { runPrDemoAttachment } from './pr-attachment'

void runPrDemoAttachment(process.argv.slice(2)).catch((error) => {
	console.error(`[demo-kit-attach] ${error instanceof Error ? error.message : String(error)}`)
	process.exitCode = 1
})
