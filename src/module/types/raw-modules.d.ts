/**
 * Ambient declarations for vite/storybook `?raw` query suffix imports.
 *
 * The same declaration lives at .storybook/storybook.d.ts for the storybook
 * build pipeline, but tsconfig.json only includes `src/module/**\/*.ts` plus
 * `foundry-v14-overrides.d.ts` — so co-located `*.stories.ts` files (which
 * import their template source via `../path/to/template.hbs?raw`) need an
 * in-tree declaration to satisfy `tsc --noEmit`.
 *
 * If you ever migrate to a different asset-import convention, update both
 * declaration files in lock-step.
 */
declare module '*.hbs?raw' {
    const src: string;
    export default src;
}

declare module '*.html?raw' {
    const src: string;
    export default src;
}
