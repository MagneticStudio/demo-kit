# Reel

A recorded walkthrough of the overlay working on a page that resists it, used to show the kit
doing its job and to exercise `demoConfigDefaults()` / `demoProjectUse()` end to end.

`page.ts` serves a fake console through `page.route` on a non-localhost origin, hostile in two
ways at once:

- a strict CSP (`default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'`), so
  no injected `<style>` and no `data:` images, the shape a hosted auth UI sends;
- a global icon reset in the page's own stylesheet (`svg { width: 1em !important }`,
  `path { fill: currentColor !important }`).

The page's own logo is subject to that reset, so it renders at 1em in the page's text color
while the overlay's arrow keeps its full size and fill a few pixels away. That contrast is the
point of the recording.

```bash
npm run record:reel
ffmpeg -i test-results/<dir>/video.webm -c:v libx264 -pix_fmt yuv420p reel.mp4
```

This directory is not part of the published package: it is excluded from `tsconfig.json`'s
`include`, from the tsdown entries, and from `package.json`'s `files`.
