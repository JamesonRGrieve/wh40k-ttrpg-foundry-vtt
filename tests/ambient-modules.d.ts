// Ambient module shims for test-only dependencies that ship no type
// declarations (and have no @types package installed). Kept intentionally
// minimal — only the surface the integration boot harness consumes.

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
