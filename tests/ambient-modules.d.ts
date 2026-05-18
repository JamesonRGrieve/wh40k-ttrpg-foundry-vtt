// Ambient module shims for test-only dependencies that ship no type
// declarations (and have no @types package installed). Kept intentionally
// minimal — only the surface the integration boot harness consumes.

declare module 'jsdom' {
    export class JSDOM {
        constructor(html?: string, options?: Record<string, unknown>);
        readonly window: unknown;
    }
}

declare module 'fake-indexeddb/lib/FDBFactory' {
    export default class FDBFactory {}
}
