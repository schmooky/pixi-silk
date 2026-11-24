# @pixi-silk/compiler

The build step of `pixi-silk/i18n`: localized rich text, shaped at build time. The `silk` command
reads a strings spreadsheet, your fonts and a theme, and writes `.silk` bundles, MSDF atlas pages
and `messages.d.ts`. The browser then draws the text with `pixi-silk/i18n/pixi`, with no font file
and no shaper.

```bash
npx silk compile --config silk.config.json --strings strings.xlsx --theme theme.json --out public/i18n
npx silk lint --config silk.config.json --strings strings.xlsx --theme theme.json
```

It runs in Node only: HarfBuzz, the spreadsheet reader and the atlas generator never reach an app
bundle. Guides: https://pixi-silk.schmooky.dev/docs/localized-text/
