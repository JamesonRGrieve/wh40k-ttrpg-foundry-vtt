// Ambient module shims for test-only dependencies that ship no type
// declarations (and have no @types package installed). Kept intentionally
// minimal — only the surface the integration boot harness consumes.
//
// Has no importers BY DESIGN — TypeScript picks it up through `include`, not
// through an import — so knip reports it as an unused file. It is listed in
// knip.json's `ignore` for that reason, which is the only justification that
// entry accepts: a file that genuinely CANNOT have an importer. An ignore entry
// is never a substitute for wiring, merging or deleting a file that could.

declare module 'jsdom' {
    interface JSDOMOptions {
        url?: string;
        referrer?: string;
        contentType?: string;
        userAgent?: string;
        pretendToBeVisual?: boolean;
        runScripts?: 'dangerously' | 'outside-only';
        resources?: 'usable' | object;
        storageQuota?: number;
        beforeParse?: (window: Window & typeof globalThis) => void;
    }
    export class JSDOM {
        constructor(html?: string, options?: JSDOMOptions);
        readonly window: Window & typeof globalThis;
    }
}

declare module 'fake-indexeddb/lib/FDBFactory' {
    export default class FDBFactory {}
}
