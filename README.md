# kp "dark" on Kenny's Jellyfin 10.11.11

Task (2026-09-17): replace the ElegantFin look on Kenny's Jellyfin **10.11.11** with the one kp theme `dark`. Keep the intro-skipper import, `--skip-hide-duration` and the ActorPlus badge rules. Demo: [`demo.html`](demo.html). Earlier research on Jellyfin 12: [`../jellyfin/README.md`](../jellyfin/README.md). That research said 10.11 has no `--jf-*` variable layer, so neither route here uses one.

**Measured on** a throwaway `jellyfin/jellyfin:10.11.11` container at `127.0.0.1:38611` with no media library. I made a local admin through the wizard's endpoints and one empty playlist so a detail page exists. Every paste went in through the real Dashboard → Branding page, and `/Branding/Css` returned the same byte count as the file. Chromium and Firefox, via Playwright. The container was then stopped and removed (`docker rm`); the image is still on disk. No other host was contacted except jsDelivr and GitHub.

| Name                                  | What it is for                                              | Reference                                                                                                                                                                                            | What the package can reuse                                                                                                                                                                                                                                                                                             | Cost   | Recommendation                                                                                                                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Route A**: overlay after ElegantFin | Re-point ElegantFin's custom properties at dark's tokens    | [ElegantFin](https://github.com/lscambo13/ElegantFin) (build v26.09.05, 78,810 B, `@main`)                                                                                                           | 101 `:root` properties, 48 with a literal colour; the overlay re-points 51 (46 colours, 4 radii, 1 text). Outside `:root` there are 64 literal colour declarations (24 `!important`) and I patched 19. There are 20 radius declarations that skip its radius variables, 8 of them rounded. Overlay: 9,203 B, generated | medium | **No.** Tested live: "Sign In" and "OK" render white on the near-white plate at **1.17:1** because ElegantFin writes `color:#fff!important`. The glass blur, gradients, Inter from Google Fonts and pill shapes stay. `@main` can move under the overlay |
| **Route B**: standalone kp-dark       | One file against Jellyfin's own classes; ElegantFin removed | built-in `themes/dark/theme.css` in the 10.11.11 image (7,002 B, 128 literal colours in 94 rules)                                                                                                    | [`kp-jellyfin-dark.css`](kp-jellyfin-dark.css): **21,385 B** (2,525 B of it is six `@font-face`), 107 rules, 155 class names, all 155 found in the 10.11.11 build by `--check`, 34 tokens. Every colour is a token `var()` or an alpha computed from a token                                                           | medium | **Yes**                                                                                                                                                                                                                                                  |
| Cascade order                         | Whether equal specificity is enough                         | measured in the live DOM                                                                                                                                                                             | Custom CSS `<style>` is in `#reactRoot` _after_ `themes/dark/theme.css`; lazy page CSS goes into `<head>`, earlier. One trap: `html.preload{background:#101010}` beats plain `html`                                                                                                                                    | small  | Keep `!important` only where theme.css has it                                                                                                                                                                                                            |
| intro-skipper button                  | Skip intro/credits                                          | [intro-skipper-css](https://github.com/intro-skipper/intro-skipper-css)                                                                                                                              | Its CSS falls back to ElegantFin variables (`--headerColor`, `--largerRadius`, a violet `rgba(119,91,244)` progress). Route B sets its own `--skip-btn-*` from tokens, square + chamfer                                                                                                                                | small  | Keep the import, first line                                                                                                                                                                                                                              |
| ActorPlus badges                      | Age / birthplace / deceased overlays on person cards        | [ActorPlus `birthage.css`](https://github.com/Druidblack/Jellyfin.Plugin.ActorPlus/tree/main/Jellyfin.Plugin.ActorPlus/Web), [PR #3](https://github.com/Druidblack/Jellyfin.Plugin.ActorPlus/pull/3) | The plugin puts badges 4px from each corner. Dark cuts the top-right and bottom-left card corners with a 0.55rem chamfer (8.2px at Jellyfin's 93% rem), so a badge must sit ≥ half that in. Measured on injected badges in a live card: **4px clips** the two cut corners and **6px clears** all four                  | small  | Replace the ~30 ElegantFin-era lines with the generated 6px block                                                                                                                                                                                        |
| Fonts                                 | Archivo, KP Ticker Mono                                     | `cdn.jsdelivr.net/gh/kennypassenier/kp-themes@v6.1.0/fonts/…`                                                                                                                                        | All six files return 200, byte-identical to `fonts/` (`wc -c`). Both engines reported both families loaded                                                                                                                                                                                                             | small  | Pinned tag, as generated                                                                                                                                                                                                                                 |

## Recommendation: route B

Route A keeps a 78,810 B third-party base that I don't control and that loads `@main`. It needs 51 property overrides plus patches that must beat 24 `!important` colours, and it still has ElegantFin's shape language (rounded, glass, Inter), which dark forbids ("cut, never rounded"). Route B is 21,385 B. It depends only on Jellyfin's class names, and `generate.mjs --check=<jellyfin-web>` re-verifies them on each upgrade. It carries dark's own marks: the static instrument grid, the near-white primary plate, chamfered controls with drawn cut edges, the film as tab underline, field focus line, selected drawer edge and dialog border, the four-colour halo on dialogs, and mono microlabels.

**Checked live (route B):**

- Login page, home, drawer (open), playlist detail page, action sheet (open), Add-to-Collection dialog (full screen at 1280), Add-to-Playlist dialog (centred at 1920) and Settings → Display, all in Chromium.
- Login and home also in Firefox.
- Rendered contrast on dark's ground `rgb(11,12,15)`: body text **17.1:1**; primary label on its plate **16.51:1**; the accent ink (`--selected`, links) `rgb(136,224,242)` **13.03:1**; the signal/ring colour 12.15:1 (non-text); secondary text 5.26:1; the field boundary 2.22:1 (below 3:1, the known DI1 finding in `themes/dark/anatomy.md`).

**Still not following the theme:**

- The admin dashboard: Jellyfin never renders Custom CSS there (per source, not re-checked live).
- Android TV and Swiftfin.
- The Jellyfin logo image.
- Live-TV guide category colours.
- 5 of the 37 base rules that paint Jellyfin blue: the metadata-manager tree (2), the legacy controlgroup, the SyncPlay pulse and IE's `-ms-thumb`. Two more are only partly covered.
- Not seen live, because there was no media: the video OSD, the now-playing bar, a real skip button and a real ActorPlus card. The skip button and badges were checked as injected mock elements under the real cascade, and the skip button's cut corners have no edge line.
- The pointer-tracked film and the headline resolve, because Jellyfin cannot run `js/effects.js`.
- The favourite heart uses `--destructive`.

## The paste (Dashboard → Branding → Custom CSS)

The exact text is **[`custom-css.paste.css`](custom-css.paste.css)**: 22,288 B, sha256 `1ae89030…e7b6e2e2`, written by `node research/jellyfin-dark/generate.mjs`. Replace the whole field with it. Its shape, in order:

```css
@import url('https://cdn.jsdelivr.net/gh/intro-skipper/intro-skipper-css@main/skip-button.min.css');

/* …the whole of kp-jellyfin-dark.css (no @import inside, so the line above stays valid)… */

:root {
    /* Skip button timing */
    --skip-hide-duration: 8s;
}

/* ── ActorPlus badges: clear the 0.55rem card chamfer (≈8.2px), not a 16px round ── */
.birthage-badge {
    right: 6px;
    bottom: 6px;
}
.birthage-release-badge {
    right: 6px;
    top: 6px;
}
.birthage-flag,
.birthage-birthplace {
    left: 6px;
    bottom: 6px;
}
.birthage-deceased {
    left: 6px;
    top: 6px;
}
/* + square corners, the ground at 85 %, foreground ink, KP Ticker Mono */
```

The ElegantFin `@import` line is gone. I didn't have Kenny's exact badge lines, so the generated block replaces them. If his lines also do something other than clear the rounded corners, carry that part over. Once the file ships in a kp-themes release, the middle part can become one pinned `@import` of it.
