# kp-themes-jellyfin

The kp-themes dark theme as Jellyfin custom CSS. Split out of kp-themes at 8.0.0 (2026-09-29, kp-themes scope-139).

- Everything user-facing Kenny reads in a conversation is Dutch; code,
  comments, commits and these docs are English.
- The tokens are vendored, never edited: `vendor/kp-themes/` is the unpacked
  `tokens.tar` of the kp-themes release in `vendor/PIN`. Move it with
  `npm run vendor -- <version>`, then `npm run generate`.
- Generated files are never edited by hand: change `generate.mjs` and run
  `npm run generate`. `npm run check` is the gate (and the commit hook).
- Releases: a `v*` tag with the version in `package.json`.
