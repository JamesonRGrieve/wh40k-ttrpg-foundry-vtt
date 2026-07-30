// Ambient module shim for Vite's `?raw` import suffix, which Storybook stories use
// to pull a Handlebars template in as a string.
//
// Has no importers BY DESIGN — TypeScript picks it up through `include`, not
// through an import — so knip reports it as an unused file. It is listed in
// knip.json's `ignore` for that reason, which is the only justification that
// entry accepts: a file that genuinely CANNOT have an importer. An ignore entry
// is never a substitute for wiring, merging or deleting a file that could.
declare module '*.hbs?raw' {
    const src: string;
    export default src;
}
