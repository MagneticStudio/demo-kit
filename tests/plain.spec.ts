import { DEMO, demoConfigDefaults, demoFixtures, demoProjectUse, expect, test } from 'demo-kit'

test('plain mode remains an API-only Playwright test', () => {
	expect(DEMO).toBe(false)
	expect(demoConfigDefaults()).toEqual({})
	expect(demoProjectUse()).toEqual({})
	expect(demoFixtures()).toEqual({})
})
