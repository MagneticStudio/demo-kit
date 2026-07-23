import { defineConfig } from 'tsdown'

export default defineConfig({
	entry: ['index.ts', 'pr-attachment.ts', 'attach-pr-demo.ts'],
	format: ['esm', 'cjs'],
	platform: 'node',
	target: 'node18',
	sourcemap: true,
	dts: {
		cjsReexport: true,
		resolver: 'tsc',
		sourcemap: true,
	},
	deps: {
		neverBundle: true,
	},
	exports: {
		bin: { 'demo-kit-attach': 'attach-pr-demo.ts' },
		exclude: ['attach-pr-demo', 'pr-attachment'],
		legacy: true,
	},
})
