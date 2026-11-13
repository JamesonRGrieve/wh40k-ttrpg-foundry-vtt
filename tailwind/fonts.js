/**
 * The system's fonts, served from `dist/fonts/` instead of Google (#709).
 *
 * `entry.css` used to `@import` Google Fonts and Material Icons: a stylesheet
 * request that blocked the sheet's CSS, then font files from a third host, so
 * every client needed Google reachable and sent its IP there on each load.
 * The files now ship in `src/fonts/` (copied to `dist/fonts/`), credited in
 * `src/fonts/ATTRIBUTION.md` with their licences beside them:
 *   - Cinzel, IM Fell DW Pica, Roboto: the latin and latin-ext WOFF2 subsets
 *     Google served the old `@import`, byte for byte, with the `unicode-range`
 *     they were served under. Roboto is a variable font, one file declared
 *     at 400, 500 and 700 as Google declared it: a range would render a 600
 *     label at a true 600 instead of the 700 it has always snapped to.
 *   - Lusitana: the original regular TTF, unmodified. Its licence reserves the
 *     name "Lusitana", and the OFL treats a subset or format conversion as a
 *     modified version, which could not keep that name.
 *   - Cinzel and Lusitana at 400 only, as before: the old import asked for
 *     `Cinzel:400:700` and `Lusitana:400:700`, which Google reads as 400 alone,
 *     so their bold has always been the browser's synthetic bold. Shipping the
 *     real bold weights would change how every bold heading and label looks.
 *   - Material Icons: the complete font, because templates pass icon names from
 *     data (tab strips, toggles), so a subset could silently miss one.
 *
 * Also the one definition of the font stacks (`fontStacks`): the Tailwind theme
 * (`tw-font-*`) and the `--wh40k-font-*` tokens (design-tokens.js) both read it.
 */

/** Font stacks by role. Tokens that put Foundry's own Modesto Condensed first build on these. */
const fontStacks = {
    display: ['Cinzel', 'serif'],
    heading: ["'IM Fell DW Pica'", 'serif'],
    body: ['Lusitana', 'serif'],
    ui: ['Roboto', 'sans-serif'],
    alt: ["'Modesto Condensed'", "'Palatino Linotype'", 'serif'],
    header: ["'Caslon Antique'", "'Trajan Pro'", 'serif'],
};

/** A stack as a CSS `font-family` value. */
function stack(families) {
    return families.join(', ');
}

/** `@font-face` rules for the vendored files; the URLs are relative to `dist/css/`. */
const fontFaces = [
    {
        'font-family': "'Cinzel'",
        'font-style': 'normal',
        'font-weight': '400',
        'font-display': 'swap',
        src: "url('../fonts/cinzel-400-latin-ext.woff2') format('woff2')",
        'unicode-range': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
    {
        'font-family': "'Cinzel'",
        'font-style': 'normal',
        'font-weight': '400',
        'font-display': 'swap',
        src: "url('../fonts/cinzel-400-latin.woff2') format('woff2')",
        'unicode-range': 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
    {
        'font-family': "'IM Fell DW Pica'",
        'font-style': 'normal',
        'font-weight': '400',
        'font-display': 'swap',
        src: "url('../fonts/im-fell-dw-pica-400-latin.woff2') format('woff2')",
        'unicode-range': 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
    {
        'font-family': "'Lusitana'",
        'font-style': 'normal',
        'font-weight': '400',
        'font-display': 'swap',
        src: "url('../fonts/Lusitana-Regular.ttf') format('truetype')",
    },
    {
        'font-family': "'Roboto'",
        'font-style': 'normal',
        'font-weight': '400',
        'font-display': 'swap',
        src: "url('../fonts/roboto-latin-ext.woff2') format('woff2')",
        'unicode-range': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
    {
        'font-family': "'Roboto'",
        'font-style': 'normal',
        'font-weight': '500',
        'font-display': 'swap',
        src: "url('../fonts/roboto-latin-ext.woff2') format('woff2')",
        'unicode-range': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
    {
        'font-family': "'Roboto'",
        'font-style': 'normal',
        'font-weight': '700',
        'font-display': 'swap',
        src: "url('../fonts/roboto-latin-ext.woff2') format('woff2')",
        'unicode-range': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
    {
        'font-family': "'Roboto'",
        'font-style': 'normal',
        'font-weight': '400',
        'font-display': 'swap',
        src: "url('../fonts/roboto-latin.woff2') format('woff2')",
        'unicode-range': 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
    {
        'font-family': "'Roboto'",
        'font-style': 'normal',
        'font-weight': '500',
        'font-display': 'swap',
        src: "url('../fonts/roboto-latin.woff2') format('woff2')",
        'unicode-range': 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
    {
        'font-family': "'Roboto'",
        'font-style': 'normal',
        'font-weight': '700',
        'font-display': 'swap',
        src: "url('../fonts/roboto-latin.woff2') format('woff2')",
        'unicode-range': 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
    {
        'font-family': "'Material Icons'",
        'font-style': 'normal',
        'font-weight': '400',
        'font-display': 'swap',
        src: "url('../fonts/material-icons.woff2') format('woff2')",
    },
];

/** Google's `.material-icons` rule, which came with its stylesheet. */
const materialIcons = {
    '.material-icons': {
        'font-family': "'Material Icons'",
        'font-weight': 'normal',
        'font-style': 'normal',
        'font-size': '24px',
        'line-height': '1',
        'letter-spacing': 'normal',
        'text-transform': 'none',
        display: 'inline-block',
        'white-space': 'nowrap',
        'word-wrap': 'normal',
        direction: 'ltr',
        'font-feature-settings': "'liga'",
        '-webkit-font-feature-settings': "'liga'",
        '-webkit-font-smoothing': 'antialiased',
    },
};

module.exports = { fontStacks, stack, fontFaces, materialIcons };
