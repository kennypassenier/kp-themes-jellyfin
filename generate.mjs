#!/usr/bin/env node
// Research generator: the kp-themes "dark" theme as Custom CSS for Jellyfin 10.11.11.
//
// Every colour, face, radius and cut below is read from themes/dark/tokens.json
// and every @font-face from css/fonts.css; nothing is a hand-copied value. Two
// outputs, the two routes compared in README.md:
//
//   node research/jellyfin-dark/generate.mjs
//       route B (chosen): writes kp-jellyfin-dark.css, the standalone theme
//       written against Jellyfin 10.11.11's own classes, and
//       custom-css.paste.css, the exact text for Dashboard > Branding >
//       Custom CSS (intro-skipper import + the theme + skip timing + the
//       ActorPlus badge rules).
//   node research/jellyfin-dark/generate.mjs --route=a --out=<file>
//       route A (measured, not chosen): an overlay placed after ElegantFin that
//       re-points ElegantFin's custom properties and patches the literal
//       colours it hard-codes. Printed counts are what README.md quotes.
//   node research/jellyfin-dark/generate.mjs --check=<jellyfin-web dir>
//       lists every class name the route B selectors use that does not occur
//       in the given jellyfin-web build (re-run on each Jellyfin upgrade).
//
// Fonts are served from the published release, pinned to a tag, so a released
// face never changes under a running server.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { contrast, hsl, parseHsl } from '../../js/contrast.js';

const here = new URL('.', import.meta.url);
const root = new URL('../../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const RELEASE = `v${pkg.version}`;
const CDN = `https://cdn.jsdelivr.net/gh/kennypassenier/kp-themes@${RELEASE}/`;
const JELLYFIN = '10.11.11';

const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
        const [k, v = 'true'] = a.replace(/^--/, '').split('=');
        return [k, v];
    }),
);

// ── Tokens ────────────────────────────────────────────────────────────────
const tokenFile = JSON.parse(readFileSync(new URL('themes/dark/tokens.json', root), 'utf8'));
const tokens = Object.fromEntries(tokenFile.entries.filter((e) => e.token).map((e) => [e.token, e.value]));
const used = new Set();
/** var() of a token; the :root block later declares only what was used. */
const v = (name) => {
    if (!(name in tokens)) throw new Error(`dark has no token --${name}`);
    used.add(name);
    return `var(--kp-${name.replace(/^kp-/, '')})`;
};
/** A token at an alpha, computed here: relative colour syntax is missing from the
    older Chromium that Jellyfin Media Player and TV browsers ship. */
const a = (name, alpha) => {
    const { h, s, l } = parseHsl(tokens[name]);
    return `hsl(${h} ${s}% ${l}% / ${alpha})`;
};
const film = ['chart-1', 'chart-2', 'chart-3', 'chart-4'];

// ── Fonts: the @font-face blocks of the faces dark names ───────────────────
const families = [tokens['theme-font-body'], tokens['theme-font-display'], tokens['theme-font-mono']].map((f) => f.match(/'([^']+)'/)[1]);
const fontsCss = readFileSync(new URL('css/fonts.css', root), 'utf8');
const fontFaces = [...fontsCss.matchAll(/@font-face\s*\{[^}]*\}/g)]
    .map((m) => m[0])
    .filter((block) => families.some((f) => block.includes(`font-family: '${f}'`)))
    .map((block) => block.replace(/url\('\.\.\/(fonts\/[^']+)'\)/g, (_, p) => `url('${CDN}${p}')`))
    .map((block) => block.replace(/\n\s*/g, ' ').replace(/\s*}\s*$/, ' }'));
if (fontFaces.length === 0) throw new Error('no @font-face found for ' + families.join(', '));
// Latin-only faces: CJK and other scripts fall through to Jellyfin's own Noto stack.
const noto = "'Noto Sans', 'Noto Sans HK', 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC'";
const withNoto = (stack) => stack.replace(/(ui-sans-serif)/, `${noto}, $1`);

// ── Geometry ──────────────────────────────────────────────────────────────
// The control chamfer: two opposite corners cut at 45 degrees (top-right and
// bottom-left), as css/dark-register.css cuts them.
const cut = `polygon(0 0, calc(100% - ${v('fx-notch')}) 0, 100% ${v('fx-notch')}, 100% 100%, ${v('fx-notch')} 100%, 0 calc(100% - ${v('fx-notch')}))`;
const halo = `0 10px 18px ${a('chart-2', 0.3)}, -10px 4px 16px ${a('chart-1', 0.26)}, 10px 4px 16px ${a('chart-3', 0.26)}, 0 -6px 14px ${a('chart-4', 0.2)}`;
const filmLine = (deg) => `linear-gradient(${deg}deg, ${film.map(v).join(', ')})`;
const filmConic = `conic-gradient(from 0.5turn, ${film.map(v).join(', ')}, ${v('chart-1')})`;
// A two-channel focus ring drawn inside the box, because a clip-path clips an outline.
const ring = `inset 0 0 0 2px ${v('ring')}, inset 0 0 0 4px ${v('background')}`;
// An outlined, chamfered control: the inset 1px edge stops where the clip-path
// cuts, so each cut corner gets its own 1px diagonal drawn as a gradient layer.
const edged = (line, ground) => {
    const n = v('fx-notch');
    return [
        `linear-gradient(to top right, transparent calc(50% - 1px), ${line} calc(50% - 1px) 50%, transparent 50%) top right / ${n} ${n} no-repeat`,
        `linear-gradient(to top right, transparent 50%, ${line} 50% calc(50% + 1px), transparent calc(50% + 1px)) bottom left / ${n} ${n} no-repeat`,
        ground,
    ].join(', ');
};
// Jellyfin's rem is 93% of 16px; the badges must clear half the cut.
const notchPx = parseFloat(tokens['fx-notch']) * 16 * 0.93;
const badgeInset = Math.ceil(notchPx / 2) + 1;

// ── Route B: the theme against Jellyfin 10.11.11's classes ─────────────────
/** @type {Array<[string, string, string[]]>} [section, selector, declarations] */
const rulesB = [
    ['Type', 'html, html[lang]', [`font-family: ${withNoto(tokens['theme-font-body'])}`]],
    [
        'Type',
        'h1, h2, h3, .sectionTitle, .pageTitle, .itemName, .formDialogHeaderTitle',
        [`font-family: ${withNoto(tokens['theme-font-display'])}`, 'letter-spacing: -0.01em'],
    ],
    ['Type', '.sectionTitle, .itemName', ['font-weight: 700']],
    [
        'Type',
        '.mediaInfoText, .mediaInfoOfficialRating, .textarea-mono, .sidebarHeader, .osdTimeText, .endsAt, .toast',
        [`font-family: ${tokens['theme-font-mono']} !important`],
    ],

    ['Ground', 'html, .skinHeader', [`color: ${v('foreground')}`]],
    [
        'Ground',
        'html, html.preload, .backgroundContainer, .dialog, .nowPlayingContextMenu, .nowPlayingPlaylist, .ui-corner-all, .ui-shadow, .wizardStartForm, #bookPlayer, #comicsPlayer, #pdfPlayer, #dialogToc',
        [`background-color: ${v('background')}`],
    ],
    // The instrument grid of the register, static: no pointer is tracked here.
    [
        'Ground',
        '.backgroundContainer:not(.withBackdrop)',
        [
            `background-image: repeating-linear-gradient(90deg, ${a('foreground', 0.045)} 0 1px, transparent 1px 5.5rem), repeating-linear-gradient(0deg, ${a('foreground', 0.045)} 0 1px, transparent 1px 5.5rem)`,
        ],
    ],
    ['Ground', '.backgroundContainer.withBackdrop', [`background-color: ${a('background', 0.86)}`]],
    ['Ground', '*', [`scrollbar-color: ${v('border-strong')} ${v('background')}`]],
    ['Ground', '::-webkit-scrollbar-track-piece', [`background-color: ${v('background')}`]],
    [
        'Ground',
        '::-webkit-scrollbar-thumb:horizontal, ::-webkit-scrollbar-thumb:vertical',
        [`background: 50% no-repeat ${v('border-strong')}`, 'border-radius: 0'],
    ],

    ['Header', '.skinHeader-withBackground', [`background-color: ${v('card')}`, `box-shadow: inset 0 -1px 0 ${v('border')}`]],
    ['Header', '.skinHeader.semiTransparent', [`background-color: ${a('background', 0.6)}`]],
    ['Header', '.emby-tab-button', [`color: ${v('muted-foreground')}`]],
    ['Header', '.emby-tab-button-active', [`color: ${v('foreground')}`, `background: ${filmLine(90)} bottom / 100% 2px no-repeat`]],
    [
        'Header',
        '.emby-tab-button:hover, .emby-tab-button.show-focus:focus, .guide-date-tab-button.emby-tab-button-active, .guide-date-tab-button:focus',
        [`color: ${v('primary')}`],
    ],
    [
        'Header',
        '.paper-icon-button-light:hover:not(:disabled), .paper-icon-button-light:active:not(:disabled)',
        [`background-color: ${a('foreground', 0.08)}`, `color: ${v('selected')}`],
    ],
    ['Header', '.paper-icon-button-light.show-focus:focus', [`color: ${v('selected')}`]],

    ['Drawer', '.mainDrawer, .drawer-open', [`background-color: ${v('sidebar-background')}`, `box-shadow: inset -1px 0 0 ${v('sidebar-border')}`]],
    ['Drawer', '.navMenuOption', [`color: ${v('sidebar-foreground')}`]],
    ['Drawer', '.navMenuOption:hover', [`background: ${v('sidebar-accent')}`, `color: ${v('sidebar-accent-foreground')}`]],
    [
        'Drawer',
        '.navMenuOption-selected',
        [`background: ${filmLine(180)} left / 3px 100% no-repeat, ${v('sidebar-accent')} !important`, `color: ${v('foreground')}`],
    ],
    ['Drawer', '.sidebarHeader', [`color: ${v('muted-foreground')}`, 'text-transform: uppercase', 'letter-spacing: 0.08em', 'font-size: 0.75em']],

    ['Cards', '.cardScalable', [`clip-path: ${cut}`]],
    ['Cards', '.cardImageContainer, .cardContent, .cardBox, .visualCardBox', ['border-radius: 0']],
    ['Cards', '.defaultCardBackground1', [`background-color: ${v('secondary')}`]],
    ['Cards', '.defaultCardBackground2', [`background-color: ${v('muted')}`]],
    ['Cards', '.defaultCardBackground3', [`background-color: ${v('accent')}`]],
    ['Cards', '.defaultCardBackground4', [`background-color: ${v('card')}`]],
    ['Cards', '.defaultCardBackground5', [`background-color: ${v('popover')}`]],
    ['Cards', '.cardImageIcon, .cardPadder .cardImageIcon', [`color: ${v('muted-foreground')}`]],
    ['Cards', '.cardBox:not(.visualCardBox) .cardPadder', [`background-color: ${v('muted')}`, 'border-radius: 0']],
    ['Cards', '.cardOverlayContainer', [`background: ${a('background', 0.6)}`, 'border-radius: 0']],
    ['Cards', '.cardOverlayButtonIcon', [`background-color: ${a('background', 0.8)} !important`, 'border-radius: 0']],
    ['Cards', '.innerCardFooter', [`background: ${a('background', 0.8)}`, `color: ${v('foreground')}`]],
    [
        'Cards',
        '.cardText-secondary, .fieldDescription, .guide-programNameCaret, .listItem .secondary, .nowPlayingBarSecondaryText, .programSecondaryTitle, .secondaryText, .alphaPickerButton',
        [`color: ${v('muted-foreground')}`],
    ],
    ['Cards', '.alphaPickerButton-selected', [`color: ${v('foreground')}`]],
    [
        'Cards',
        '.countIndicator, .fullSyncIndicator, .mediaSourceIndicator, .playedIndicator, .filterIndicator, .filterButtonBubble, .listItemIcon:not(.listItemIcon-transparent), .lyricsFeaturePillow, .subtitleFeaturePillow, .newTvProgram',
        [`background: ${v('primary')}`, `color: ${v('primary-foreground')}`, 'border-radius: 0', 'box-shadow: none'],
    ],
    ['Cards', '.itemProgressBar', [`background: ${a('background', 0.8)}`]],
    [
        'Cards',
        '.itemProgressBarForeground, .playbackProgress > div, .sliderMarker.watched, .iconOsdProgressInner, progress[aria-valuenow]::before',
        [`background-color: ${v('ring')}`],
    ],
    ['Cards', 'progress::-webkit-progress-value', [`background-color: ${v('ring')}`]],
    ['Cards', 'progress::-moz-progress-bar', [`background-color: ${v('ring')}`]],
    [
        'Cards',
        '.missingIndicator, .unairedIndicator',
        [`background: ${v('destructive')}`, `color: ${v('destructive-foreground')}`, 'border-radius: 0'],
    ],
    ['Cards', '.itemProgressBarForeground-recording', [`background-color: ${v('destructive')}`]],
    [
        'Cards',
        '.card:focus .cardBox.visualCardBox, .card:focus .cardBox:not(.visualCardBox) .cardScalable',
        [`border-color: ${v('ring')} !important`],
    ],
    [
        'Cards',
        '.collapseContent, .formDialogFooter:not(.formDialogFooter-clear), .formDialogHeader:not(.formDialogHeader-clear), .paperList, .visualCardBox, .appfooter, .playlistSectionButton',
        [`background-color: ${v('card')}`],
    ],
    ['Cards', '.appfooter, .playlistSectionButton', [`color: ${v('secondary-foreground')}`]],

    ['Buttons', '.fab', [`background: ${v('card')}`, `color: ${v('foreground')}`, `box-shadow: inset 0 0 0 1px ${v('border-strong')}`]],
    ['Buttons', '.fab:focus', [`background: ${v('accent')}`]],
    [
        'Buttons',
        '.raised',
        [`background: ${edged(v('border-strong'), v('card'))}`, `color: ${v('foreground')}`, `box-shadow: inset 0 0 0 1px ${v('border-strong')}`],
    ],
    ['Buttons', '.raised:hover, .raised:focus', [`background: ${edged(v('border-strong'), v('accent'))}`]],
    ['Buttons', '.button-submit', [`background: ${v('primary')}`, `color: ${v('primary-foreground')}`, 'box-shadow: none']],
    ['Buttons', '.button-submit:hover, .button-submit:focus', [`background: ${v('primary-hover')}`, `color: ${v('primary-foreground')}`]],
    ['Buttons', '.button-submit:active', [`background: ${v('primary-active')}`]],
    [
        'Buttons',
        '.button-delete',
        [`background: ${edged(v('destructive'), 'transparent')}`, `color: ${v('destructive')}`, `box-shadow: inset 0 0 0 1px ${v('destructive')}`],
    ],
    ['Buttons', '.button-delete:hover, .button-delete:focus', [`background: ${v('destructive')}`, `color: ${v('destructive-foreground')}`]],
    ['Buttons', '.raised, .button-submit, .button-delete, .emby-button.detailFloatingButton', ['border-radius: 0', `clip-path: ${cut}`]],
    [
        'Buttons',
        '.raised:focus-visible, .button-submit:focus-visible, .button-delete:focus-visible, .emby-button.show-focus:focus',
        [`box-shadow: ${ring}`, 'outline: none'],
    ],
    ['Buttons', '.emby-button.show-focus:focus', [`background: ${v('ring')}`, `color: ${v('fx-signal-foreground')}`]],
    [
        'Buttons',
        '.button-flat:hover, .button-link, .button-accent-flat, .listItemImageButton:hover, .upNextDialog-countdownText, .metadataSidebarIcon, #dialogToc .bookplayerButtonIcon:hover, #dialogToc .toc li a:hover',
        [`color: ${v('selected')}`],
    ],
    ['Buttons', '.buttonActive', [`color: ${v('selected')} !important`]],
    ['Buttons', '.emby-button.detailFloatingButton', [`background-color: ${v('primary')}`, `color: ${v('primary-foreground')}`]],
    ['Buttons', '.playstatebutton-icon-played', [`color: ${v('success-foreground')}`]],
    ['Buttons', '.ratingbutton-icon-withrating', [`color: ${v('destructive')}`]],
    ['Buttons', '.progressring-spiner', [`border-color: ${v('ring')}`]],
    ['Buttons', '.selectionCommandsPanel', [`background: ${v('primary')}`, `color: ${v('primary-foreground')}`]],
    ['Buttons', '.itemSelectionPanel', [`border: 1px solid ${v('ring')}`]],

    [
        'Fields',
        '.emby-input, .emby-textarea, .emby-select-withcolor',
        [`background-color: ${v('card')}`, `border-color: ${v('input')}`, 'border-radius: 0', `color: ${v('foreground')}`],
    ],
    [
        'Fields',
        '.emby-input:focus, .emby-textarea:focus',
        [
            `border-color: ${v('primary')}`,
            `background-image: ${filmLine(90)}`,
            'background-size: 100% 2px',
            'background-position: bottom',
            'background-repeat: no-repeat',
        ],
    ],
    ['Fields', '.emby-select-withcolor:focus', [`border-color: ${v('primary')} !important`]],
    ['Fields', '.emby-select-withcolor > option', [`background: ${v('popover')}`, `color: ${v('foreground')}`]],
    [
        'Fields',
        '.checkboxListLabel, .inputLabel, .inputLabelUnfocused, .paperListLabel, .textareaLabelUnfocused',
        [`color: ${v('secondary-foreground')}`],
    ],
    ['Fields', '.inputLabelFocused, .selectLabelFocused, .textareaLabelFocused', [`color: ${v('foreground')}`]],
    ['Fields', '.checkboxOutline', ['border-radius: 0', `border-color: ${v('input')}`]],
    ['Fields', '.emby-checkbox:checked + span + .checkboxOutline', [`background-color: ${v('primary')}`, `border-color: ${v('primary')}`]],
    ['Fields', '.emby-checkbox:checked + span + .checkboxOutline .checkboxIcon-checked', [`color: ${v('primary-foreground')} !important`]],
    [
        'Fields',
        '.emby-checkbox:focus + span + .checkboxOutline, .emby-checkbox:focus:not(:checked) + span + .checkboxOutline',
        [`border-color: ${v('ring')}`],
    ],
    ['Fields', '.mdl-slider-background-lower', [`background-color: ${v('ring')}`]],
    ['Fields', '.mdl-slider', [`color: ${v('ring')}`]],
    ['Fields', '.mdl-slider::-webkit-slider-thumb', [`background: ${v('primary')}`, 'border-radius: 0']],
    ['Fields', '.mdl-slider::-moz-range-thumb', [`background: ${v('primary')}`, 'border-radius: 0']],
    ['Fields', '.mdl-switch__input:checked + .mdl-switch__label + .mdl-switch__trackContainer > .mdl-switch__thumb', [`background: ${v('primary')}`]],
    [
        'Fields',
        '.mdl-switch__input:checked + .mdl-switch__label + .mdl-switch__trackContainer > .mdl-switch__track',
        [`background: ${a('ring', 0.5)}`],
    ],
    [
        'Fields',
        '.mdl-switch__input:checked:focus + .mdl-switch__label + .mdl-switch__trackContainer .mdl-switch__focus-helper',
        [`background-color: ${a('ring', 0.26)}`],
    ],
    ['Fields', '.mdl-radio__focus-circle', [`background: ${v('ring')}`]],
    [
        'Fields',
        '.mdl-radio.show-focus .mdl-radio__button:focus + .mdl-radio__circles .mdl-radio__inner-circle, .mdl-radio.show-focus .mdl-radio__button:focus + .mdl-radio__circles .mdl-radio__outer-circle',
        [`color: ${v('ring')}`],
    ],
    ['Fields', '.mdl-spinner__layer-1, .mdl-spinner__layer-2, .mdl-spinner__layer-3, .mdl-spinner__layer-4', [`border-color: ${v('ring')}`]],
    ['Fields', '.mdl-slider-background-upper', [`background: ${a('foreground', 0.25)}`]],

    [
        'Panels',
        '.dialog',
        [
            `background: linear-gradient(${v('popover')}, ${v('popover')}) padding-box, ${filmConic} border-box`,
            'border: 1px solid transparent',
            'border-radius: 0',
            `box-shadow: ${halo}`,
        ],
    ],
    ['Panels', '.dialogBackdrop', [`background-color: ${v('background')}`]],
    ['Panels', '.formDialogHeader:not(.formDialogHeader-clear)', [`box-shadow: inset 0 -1px 0 ${v('border')}`]],
    ['Panels', '.formDialogFooter:not(.formDialogFooter-clear)', [`box-shadow: inset 0 1px 0 ${v('border')}`]],
    ['Panels', '.actionsheetDivider', [`background: ${v('border')}`]],
    ['Panels', '.listItem:hover', [`background: ${v('accent')}`]],
    ['Panels', '.listItem:focus', [`background: ${v('secondary')}`]],
    [
        'Panels',
        '.listItem-border, .emby-collapsible-button, .channelPrograms, .guide-channelHeaderCell, .programCell',
        [`border-color: ${v('border')} !important`],
    ],
    [
        'Panels',
        '.toast',
        [`background: ${v('popover')}`, `color: ${v('popover-foreground')}`, 'border-radius: 0', `box-shadow: inset 0 0 0 1px ${v('border-strong')}`],
    ],
    [
        'Panels',
        '.infoBanner',
        [`background: ${v('card')}`, `color: ${v('card-foreground')}`, 'border-radius: 0', `box-shadow: inset 0 0 0 1px ${v('border')}`],
    ],
    ['Panels', '.mediaInfoText', [`background: ${v('secondary')}`, `color: ${v('secondary-foreground')}`, 'border-radius: 0']],
    ['Panels', '.mediaInfoOfficialRating', [`border-color: ${v('border-strong')}`, 'border-radius: 0']],
    ['Panels', '.detailRibbon', [`background: ${a('card', 0.8)}`]],
    [
        'Panels',
        '.noBackdropTransparency .detailPagePrimaryContainer, .noBackdropTransparency .detailPageSecondaryContainer',
        [`background-color: ${v('background')}`],
    ],
    ['Panels', '.detailTableBodyRow-shaded:nth-child(2n)', [`background: ${a('card', 0.9)}`]],
    [
        'Panels',
        '.guide-channelHeaderCell:focus, .programCell:focus, .alphaPickerButton-tv:focus, .emby-select-tv-withcolor:focus',
        [`background-color: ${v('ring')} !important`, `color: ${v('fx-signal-foreground')} !important`],
    ],

    // intro-skipper reads ElegantFin's variables with fallbacks; without ElegantFin
    // it would fall back to a violet progress bar and 1.25em rounded corners.
    [
        'Skip button',
        '.skip-button',
        ['border-radius: 0', `clip-path: ${cut}`, 'text-shadow: none', 'box-shadow: none', '-webkit-backdrop-filter: none', 'backdrop-filter: none'],
    ],
    ['Skip button', '.skip-button:hover', ['box-shadow: none']],
    ['Skip button', '.skip-button:focus-visible', ['outline: none', `box-shadow: ${ring}`]],
];
const skipVars = [
    `--skip-btn-bg: ${a('card', 0.9)}`,
    `--skip-btn-bg-hover: ${v('primary')}`,
    `--skip-btn-border-color: ${v('border-strong')}`,
    `--skip-btn-text-color: ${v('foreground')}`,
    `--skip-btn-text-color-hover: ${v('primary-foreground')}`,
    '--skip-btn-shadow: none',
    `--skip-btn-progress-color: ${a('selected', 0.3)}`,
    `--skip-btn-progress-bg: ${a('card', 0.9)}`,
];

// ActorPlus badges (plugin birthage.css places them 4px from each corner, as
// pills). Kenny's current rules push them clear of ElegantFin's 16px rounds; on
// dark the corner is a chamfer, so they only need to clear half of it.
const badgeRules = [
    ['.birthage-badge', [`right: ${badgeInset}px`, `bottom: ${badgeInset}px`]],
    ['.birthage-release-badge', [`right: ${badgeInset}px`, `top: ${badgeInset}px`]],
    ['.birthage-flag, .birthage-birthplace', [`left: ${badgeInset}px`, `bottom: ${badgeInset}px`]],
    ['.birthage-deceased', [`left: ${badgeInset}px`, `top: ${badgeInset}px`]],
    [
        '.birthage-badge, .birthage-release-badge .birthage-line, .birthage-flag, .birthage-birthplace, .birthage-deceased',
        ['border-radius: 0', `background: ${a('background', 0.85)}`, `color: ${v('foreground')}`, `font-family: ${tokens['theme-font-mono']}`],
    ],
    ['.birthage-birthplace-text, .birthage-release-badge', [`color: ${v('foreground')}`]],
];

const block = (sel, decls) => `${sel} {\n${decls.map((d) => `    ${d};`).join('\n')}\n}`;

function rootBlock(extra = []) {
    const decls = [...used].sort().map((n) => `--kp-${n.replace(/^kp-/, '')}: ${tokens[n]}`);
    return block(':root', [...decls, `color-scheme: ${tokens['color-scheme']}`, ...extra]);
}

function routeB() {
    const sections = [];
    let last = '';
    for (const [section, sel, decls] of rulesB) {
        if (section !== last) sections.push(`\n/* ── ${section} ${'─'.repeat(Math.max(3, 70 - section.length))} */`);
        last = section;
        sections.push(block(sel, decls));
    }
    const badges = badgeRules.map(([s, d]) => block(s, d)).join('\n');
    const header = `/* kp-themes "dark" for Jellyfin ${JELLYFIN} (web client, legacy layout)
   Generated by research/jellyfin-dark/generate.mjs from themes/dark/tokens.json
   and css/fonts.css (@kp-soft/themes ${pkg.version}). Do not edit by hand.
   Fonts: ${CDN}fonts/
   Written against Jellyfin's own classes; replaces ElegantFin, not layered on it.
   Contains no @import, so it can follow the intro-skipper @import in Custom CSS. */`;
    const css = [header, '', fontFaces.join('\n'), '', rootBlock(skipVars), ...sections, ''].join('\n');
    return { css, badges };
}

// ── Route A: overlay after ElegantFin ──────────────────────────────────────
// ElegantFin v26.09.05 declares 101 custom properties on :root; 48 hold a
// literal colour. The two masks (--headerBlurMask, --itemBackdropMask) use
// colour only as opacity and stay; the other 46 are re-pointed here.
const efVars = {
    '--darkerGradientPoint': () => v('background'),
    '--darkerGradientPointAlpha': () => a('background', 0.85),
    '--lighterGradientPoint': () => v('card'),
    '--lighterGradientPointAlpha': () => a('card', 0.85),
    '--gradientPointAlpha': () => a('card', 0.3),
    '--headerColor': () => a('card', 0.8),
    '--drawerColor': () => a('sidebar-background', 0.95),
    '--borderColor': () => v('border-strong'),
    '--darkerBorderColor': () => v('border'),
    '--lighterBorderColor': () => a('foreground', 0.12),
    '--selectorBackgroundColor': () => v('secondary'),
    '--selectorBackgroundColorAlpha': () => a('secondary', 0.5),
    '--textColor': () => v('foreground'),
    '--dimTextColor': () => v('muted-foreground'),
    '--fullContrastColor': () => v('foreground'),
    '--zeroContrastColor': () => v('background'),
    '--accentColor': () => v('primary'),
    '--accentHoverColor': () => v('primary-hover'),
    '--semiTransparentAccentColor': () => a('foreground', 0.125),
    '--btnMiniPlayColor': () => v('success'),
    '--btnMiniPlayBorderColor': () => v('success-foreground'),
    '--btnDeleteColor': () => v('destructive'),
    '--btnDeleteBorderColor': () => v('destructive'),
    '--btnSubmitColor': () => v('primary'),
    '--btnSubmitBorderColor': () => v('primary-hover'),
    '--checkboxCheckedBgColor': () => v('primary'),
    '--highlightOutlineColor': () => v('ring'),
    '--hoverTabBackgroundColor': () => a('primary', 0.9),
    '--hoverTextColor': () => v('foreground'),
    '--activeTextColor': () => v('foreground'),
    '--cardHoverBorderColor': () => v('primary'),
    '--multiSelectOverlayColor': () => a('background', 0.8),
    '--dividerColor': () => v('border'),
    '--tableBodyColor': () => v('card'),
    '--osdSeekBarBufferedColorAlpha': () => a('muted-foreground', 0.5),
    '--osdSeekBarThumbColor': () => v('primary'),
    '--headerColorGradient': () => `linear-gradient(180deg, ${a('background', 0.95)} 30%, 55%, transparent 90%)`,
    '--headerColorGradientAlt': () => `linear-gradient(180deg, ${v('background')}, 70%, transparent)`,
    '--cardFooterGradient': () => `linear-gradient(0deg, ${a('background', 0.95)}, 40%, transparent)`,
    '--topOSDGradient': () => `linear-gradient(180deg, ${a('background', 0.8)}, 45%, transparent)`,
    '--bottomOSDGradient': () => `linear-gradient(0deg, ${a('background', 0.8)}, 45%, transparent)`,
    '--hoverGradientV': () => `linear-gradient(0deg, transparent, ${a('foreground', 0.35)} 45%, ${a('foreground', 0.35)} 55%, transparent)`,
    '--hoverGradientH': () => `linear-gradient(90deg, transparent, ${a('foreground', 0.35)} 45%, ${a('foreground', 0.35)} 55%, transparent)`,
    '--shadow': () => `0.1em 0.1em 0.15em ${a('background', 0.3)}`,
    '--cardShadow': () => `0 1px 6px 0 ${a('background', 0.3)}`,
    '--iconShadow': () => `0 0 2px ${a('background', 0.8)}, 1px 1px 0 ${a('background', 0.5)}`,
    '--largerRadius': () => v('radius'),
    '--largeRadius': () => v('radius'),
    '--smallRadius': () => v('radius'),
    '--smallerRadius': () => v('radius'),
    '--loginPageText': () => '"Sign in"',
};
// Literal colours ElegantFin writes outside :root that clash with dark (white
// ink on a near-white plate, pure white or black, a blue-grey login panel).
// Third-party brand colours (TMDB, IMDb, Trakt, ... 22 declarations) and media
// type chips are left as ElegantFin paints them.
const efPatches = [
    ['.countIndicator, .fullSyncIndicator, .mediaSourceIndicator', [`background: ${v('primary')}`, `color: ${v('primary-foreground')}`]],
    [
        '.cardOverlayContainer > .cardOverlayFab-primary, .cardOverlayContainer > .cardOverlayFab-primary:hover, .listItemImageButton:hover, .layout-desktop .cardOverlayButton-br > button',
        [`color: ${v('foreground')}`],
    ],
    ['.backgroundContainer.withBackdrop', [`background: ${a('background', 0.25)}`]],
    ['.layout-tv .backgroundContainer.withBackdrop', [`background: ${a('background', 0.95)}`]],
    ['.button-flat:hover, .button-flat:active', [`background-color: ${a('foreground', 0.12)}`]],
    ['.playstatebutton-icon-played', [`color: ${v('success-foreground')}`]],
    ['.playedIndicator', [`background: ${v('primary')}`]],
    ['.emby-checkbox:checked + span + .checkboxOutline', [`outline-color: ${v('ring')}`]],
    ['.checkboxOutline:not(.multiSelectCheckboxOutline)', [`background-color: ${v('card')}`]],
    ['.emby-checkbox:focus + span + .checkboxOutline', [`border-color: ${v('ring')}`]],
    ['.detailButton:active, .listItem:active, .navMenuOption:active, .Mui-selected', [`color: ${v('foreground')}`]],
    ['#btnDeleteImage, #btnShutdown, .btnRevoke, .button-delete', [`color: ${v('destructive-foreground')}`]],
    ['.MuiButton-colorPrimary, .button-submit, .upNextContainer .btnStartNow', [`color: ${v('primary-foreground')}`]],
    ['.metadataSidebarIcon', [`color: ${v('muted-foreground')}`]],
    ['.inputContainer .emby-input-iconbutton, .searchfields-icon', [`color: ${a('foreground', 0.5)}`]],
    [
        '.inputContainer .emby-input-iconbutton:hover, .searchfields-icon:hover, .inputContainer .emby-input-iconbutton:active, .searchfields-icon:active',
        [`color: ${a('foreground', 0.8)}`],
    ],
    ['#loginPage .padded-left.padded-right.padded-bottom-page', [`background: ${a('card', 0.7)}`]],
    [
        '.skinHeader-withBackground.semiTransparent .headerButton:not(:hover), .skinHeader.headroom:not(.osdHeader, .noHomeButtonHeader) .headerButton:not(:hover)',
        [`color: ${v('foreground')}`],
    ],
];
function routeA() {
    const rootDecls = Object.entries(efVars).map(([k, fn]) => `${k}: ${fn()}`);
    rootDecls.push(`font-family: ${withNoto(tokens['theme-font-body'])}`);
    const header = `/* Route A overlay (research only): kp "dark" over ElegantFin, generated by
   research/jellyfin-dark/generate.mjs --route=a. Paste after the ElegantFin @import. */`;
    const css = [header, fontFaces.join('\n'), rootBlock(), block(':root', rootDecls), ...efPatches.map(([s, d]) => block(s, d)), ''].join('\n');
    return { css, vars: Object.keys(efVars).length, patches: efPatches.reduce((n, [, d]) => n + d.length, 0) };
}

// ── Contrast on dark's ground, from the tokens ─────────────────────────────
function contrastTable() {
    const pairs = [
        ['foreground', 'background', 'body text'],
        ['muted-foreground', 'background', 'secondary text'],
        ['secondary-foreground', 'background', 'field labels'],
        ['foreground', 'card', 'text on header, paper lists'],
        ['popover-foreground', 'popover', 'text in dialogs'],
        ['selected', 'background', 'accent ink (links, active icons)'],
        ['ring', 'background', 'progress, focus ring, slider (non-text)'],
        ['primary-foreground', 'primary', 'label on the primary button'],
        ['destructive', 'background', 'delete button outline and label'],
        ['border-strong', 'background', 'field boundary (non-text)'],
    ];
    return pairs.map(([fg, bg, role]) => ({ fg, bg, role, ratio: Math.round(contrast(hsl(tokens[fg]), hsl(tokens[bg])) * 100) / 100 }));
}

// ── --check: class names used by route B against a jellyfin-web build ──────
function check(dir) {
    const haystack = [];
    const walk = (d) => {
        for (const f of readdirSync(d)) {
            const p = join(d, f);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.(js|css|html)$/.test(f)) haystack.push(readFileSync(p, 'utf8'));
        }
    };
    walk(dir);
    const all = haystack.join('\n');
    const classes = new Set(rulesB.flatMap(([, sel]) => [...sel.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1])));
    const missing = [...classes].filter((c) => !new RegExp(`(^|[^\\w-])${c.replace(/[-]/g, '\\-')}($|[^\\w-])`).test(all));
    console.log(`classes used by route B: ${classes.size}; absent from ${dir}: ${missing.length ? missing.join(', ') : 'none'}`);
}

if (args.check) {
    check(args.check);
} else if (args.route === 'a') {
    const { css, vars, patches } = routeA();
    writeFileSync(args.out, css);
    console.log(
        `route A overlay: ${Buffer.byteLength(css)} bytes, ${vars} ElegantFin properties re-pointed, ${patches} hard-coded declarations patched -> ${args.out}`,
    );
} else {
    const { css, badges } = routeB();
    const cssPath = new URL('kp-jellyfin-dark.css', here);
    writeFileSync(cssPath, css);
    const paste = [
        '@import url("https://cdn.jsdelivr.net/gh/intro-skipper/intro-skipper-css@main/skip-button.min.css");',
        '',
        css.trimEnd(),
        '',
        ':root {',
        '    /* Skip button timing */',
        '    --skip-hide-duration: 8s;',
        '}',
        '',
        `/* ── ActorPlus badges: clear the ${tokens['fx-notch']} card chamfer (≈${notchPx.toFixed(1)}px), not a 16px round ── */`,
        badges,
        '',
    ].join('\n');
    writeFileSync(new URL('custom-css.paste.css', here), paste);
    const classCount = new Set(rulesB.flatMap(([, sel]) => [...sel.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]))).size;
    console.log(
        `kp-jellyfin-dark.css: ${Buffer.byteLength(css)} bytes, ${rulesB.length} rules, ${classCount} Jellyfin class names, ${used.size} tokens, ${fontFaces.length} @font-face`,
    );
    console.log(`custom-css.paste.css: ${Buffer.byteLength(paste)} bytes; badge inset ${badgeInset}px`);
    console.table(contrastTable());
}
