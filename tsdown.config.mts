import { defineConfig } from 'tsdown'

export default defineConfig({
	entry: 'index.ts',
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
		legacy: true,
	},
})
