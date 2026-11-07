# Contributing to pixi-silk

Thanks for helping! The repo is a pnpm workspace:

| path | what |
|---|---|
| `packages/pixi-silk` | the library (published to npm): TypeScript built by tsdown into ESM, one file per module |
| `apps/site` | docs site: Astro + React islands, MDX guides with live demos and lab experiments, TypeDoc API pages |
| `scripts` | release helpers and the screenshot / measurement tools |

## Setup

```bash
pnpm install
pnpm site:dev          # docs site at http://localhost:5178
pnpm --filter pixi-silk test
```

## Before you open a PR

```bash
pnpm lint && pnpm typecheck && pnpm --filter pixi-silk test && pnpm site:build
```

- [Biome](https://biomejs.dev) does all linting and formatting (config in `biome.json`). `pnpm lint` checks lint
  rules, formatting and import order. `pnpm lint:fix` applies the safe fixes and formats. A pre-commit hook checks
  the staged files and CI runs `biome ci`. Biome lints `.astro` files but does not format their templates.
  Install the Biome editor extension (recommended in `.vscode/extensions.json`) to format on save.
- Text follows the writing style below. `pnpm lint:prose` checks it.
- The library build (`pnpm build`, tsdown) also runs publint and Are the Types Wrong, and `pnpm size` bundles
  typical imports of it to check what an app pays and that unused modules tree-shake away.
- Rendering changes: check Safari too. `node scripts/check-pages.mjs http://127.0.0.1:5178 1280 800 --webkit`
  loads every page in WebKit and reports WebGL and console errors.
- Library changes need a changeset: `pnpm changeset` (patch = fix, minor = feature, major = breaking).
- Commit messages follow Conventional Commits, for example `feat(gradient): add stop easing` or
  `fix(shader): clamp coverage`. commitlint checks them.
- Public API changes: update the JSDoc (the API reference is generated from it) and the matching guide in
  `apps/site/src/content/docs`. Every public export needs JSDoc, or the docs build fails.
- Code samples in the docs are type-checked against the library source by `pnpm typecheck`. Mark a
  deliberate sketch with ` ```ts nocheck `.
- New visual behaviour: add or extend a demo in `apps/site/src/demos` so the docs show it live.

## Where docs go

The docs are grouped into areas: Get started, Drawing, Paint, UI widgets, Editor UI, Examples,
Rendering and Reference. `apps/site/src/content/nav.mjs` lists them and is the only file that says
where a page belongs.

- Each area is a module with an overview at `/docs/<area>/`. The overview tours the area feature by
  feature: a short pitch, the page's first live demo, a link to the guide and the experiments that go
  deeper. It ends with the area's links out and its FAQ answers. The docs sidebar shows one area at a
  time, with a switcher above it.
- A new page: add `<page>.mdx` to `apps/site/src/content/docs` and list its id under one area. Its URL is
  `/docs/<page>/`, whichever area it is in, so moving a page between areas keeps its URL. Its first
  `<Demo />` becomes its demo on the overview.
- A lab experiment (`apps/site/src/lab/catalog.mjs`) belongs to the page it deepens: list its slug as
  `{ page, lab: [...] }`. The page then ends with it, the sidebar nests it under the page, and the
  experiment's back link and breadcrumbs lead to that page. There is no separate lab index.
- An FAQ answer (`apps/site/src/content/faq.mjs`) names its area. The area overview shows it, and `/faq/`
  groups the answers by area.
- A new area: add an entry to `DOCS_AREAS` with an id, title, summary, intro and items. The overview,
  the docs index, the footer, the sitemap, the Open Graph card and llms.txt pick it up. An area with no
  pages and no links stays hidden until it has some.
- The build fails when a page or an experiment is in no place or in two, or when a slug does not exist.
- Moved URLs keep working through `redirects` in `apps/site/astro.config.mjs` (`/lab/` and `/showcase/`).

## Writing style

Docs, FAQ answers, UI text, JSDoc and changesets use plain, short English.

- Short sentences with one idea each. Aim for 8 to 20 words. `lint:prose` fails at 33.
- Lead with the fact or the answer, then the reason. Use "you" and the active voice.
- No hype or filler: seamless, robust, powerful, simply, just, easily, very, of course. <!-- prose-ignore -->
- ASCII punctuation only. No em or en dashes, ellipsis characters, middle dots, bullets, curly quotes,
  arrows or the multiplication sign. Write a period, a comma, "to" or `1200x900` instead.
- No semicolons in docs prose, and at most one colon per sentence.
- Bold only the one term a reader scans for. Keep numbers, API names and code exact.

`scripts/check-prose.mjs` enforces the mechanical rules. The lab's reference-sheet widgets
(`apps/site/src/lab/_sheets`, `_widgets`) reproduce design text as it is and are not checked.
Add `prose-ignore` to a line that must keep a symbol.

## Releasing

Releases run from `.github/workflows/npm-publish.yml` with changesets and npm trusted publishing. The
job stays off until the repository variable `NPM_RELEASE` is `true`. To turn it on:

1. Publish the first version by hand: `pnpm build`, then `npm publish --access public` in `packages/pixi-silk`.
2. On npmjs.com, add a trusted publisher for the package: GitHub Actions, `schmooky/pixi-silk`, workflow
   `npm-publish.yml`, environment `npm-publish`.
3. Set the repository variable `NPM_RELEASE` to `true`.

After that, merged changesets open a "Version Packages" PR, and merging it publishes to npm.

## Deploying the docs site

The site is static. Timeweb Cloud App Platform serves it at https://pixi-silk.schmooky.dev as a
frontend app in Frankfurt (`de-1`), in the "Schmooky Games" project. Every push to `main` deploys.

- Type: frontend. Framework: `another`. Node 24.
- Build command: `pnpm run site:build`. Index directory: `/apps/site/dist/`.
- Domain: `pixi-silk.schmooky.dev`, attached in the app's settings. The `schmooky.dev` zone is on
  Timeweb DNS, so the record and the certificate are created there.
- Environment: none. `SITE_URL` defaults to the production origin. To add search console meta tags,
  set `GOOGLE_SITE_VERIFICATION`, `YANDEX_VERIFICATION` or `BING_SITE_VERIFICATION` in the app's
  environment, or verify with a DNS TXT record.

Frontend apps run on Timeweb's own web server. It serves the files as they are, with three limits.
It does not compress (a docs page is 71 kB instead of 13 kB gzipped). It sends no long cache headers.
It answers unknown URLs with the home page and status 200, and a script on the home page sends
those visitors to `/404.html`.

For full control, deploy the root `Dockerfile` as a backend app instead. Its nginx config
(`deploy/nginx.conf`) serves the precompressed files and caches hashed assets for a year. It also
returns real 404s and redirects `/docs/x` and `/docs/x/index.html` to `/docs/x/`. The container listens on port
8080, with the health check at `/healthz`. Build settings are Docker build arguments in the
`Dockerfile` (`SITE_URL`, the verification codes, `NODE_IMAGE`, `NGINX_IMAGE`). If the builder cannot
pull from Docker Hub, use Timeweb's mirror, `dockerhub.timeweb.cloud/library/...`. For Apache hosting,
use `apps/site/public/.htaccess`.

Try the production image locally:

```bash
docker build -t pixi-silk-site . && docker run --rm -p 8080:8080 pixi-silk-site
```

### After a deploy

- Verify ownership in Google Search Console, Yandex Webmaster and Bing Webmaster Tools. A DNS TXT
  record needs no deploy. The meta tag build arguments above work too, and so does a verification
  file in `apps/site/public/`. Bing can import the site from Google Search Console. Then submit
  `https://pixi-silk.schmooky.dev/sitemap.xml` in each.
- Submit changed URLs to IndexNow (Bing, Yandex, Seznam, Naver). `pnpm --filter @pixi-silk/site indexnow`
  sends the whole sitemap. To send some pages, pass their paths:
  `pnpm --filter @pixi-silk/site indexnow /docs/shapes/`.

### SEO checks

`pnpm --filter @pixi-silk/site check:seo` audits the built site. It checks for one `<h1>` per page,
title and description length and uniqueness, canonical URLs and Open Graph images. It also checks
JSON-LD, image alt text and sizes, internal links, and sitemap and `llms.txt` coverage. CI runs it on
every PR.
