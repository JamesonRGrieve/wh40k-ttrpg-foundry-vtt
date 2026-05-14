/**
 * Minimal Foundry runtime stubs for Storybook.
 *
 * The current story corpus does NOT touch any Foundry runtime symbol at render
 * time — templates and stories consume plain context objects produced by the
 * other mock files (`./index.ts`, `./extended.ts`, `./sheet-contexts.ts`).
 * The Handlebars helpers Foundry would normally supply (`{{localize}}`,
 * `{{selectOptions}}`, `{{editor}}`, etc.) are reimplemented in
 * `../template-support.ts` and resolve against the langpack + icon registry
 * shipped with this repo.
 *
 * What stories DO rely on from the pulled `.foundry-release/` tree is purely
 * presentational:
 *
 *   1. The compiled `foundry2.css` (chrome, window frame, theme variables,
 *      forms, ProseMirror editor) loaded via `<link>` in `preview-head.html`.
 *   2. The compiled `mce.css` (legacy TinyMCE residue used by a few editors).
 *   3. Static icon assets (`icons/**`) and fonts under `.foundry-release/public/`
 *      served via Storybook's `staticDirs` config in `.storybook/main.ts`.
 *
 * This file exists to (a) hold runtime stubs if/when a story starts reaching
 * for `game.*` / `CONFIG.*` / `ui.notifications.*` etc., and (b) provide a
 * single audited surface to register those stubs from `preview.ts`. As of the
 * audit recorded in `stories/MOCK_COVERAGE.md` the surface is intentionally
 * tiny — extend it only when a story-level need surfaces.
 */

interface FoundryRuntimeGlobals {
    game?: GameStub;
    CONFIG?: ConfigStub;
    ui?: UiStub;
    Hooks?: HooksStub;
}

interface GameStub {
    // MOCK: game.i18n — minimal localize/format pair. Stories shouldn't call
    // this (they use the Handlebars {{localize}} helper) but a few utility
    // modules pulled in by sheet code paths may.
    i18n: {
        localize: (key: string) => string;
        format: (key: string, data?: Record<string, unknown>) => string;
        has: (key: string) => boolean;
    };
    // MOCK: game.user — read-only "is the current user a GM" probe; many
    // sheet partials check this for GM-only sections.
    user: { isGM: boolean; id: string; name: string };
    // MOCK: game.settings — every story-rendered template that reads a setting
    // will get its default; mutation is a no-op. Not a Foundry-runtime
    // substitute.
    settings: {
        get: (namespace: string, key: string) => unknown;
        set: (namespace: string, key: string, value: unknown) => Promise<unknown>;
    };
}

interface ConfigStub {
    // MOCK: CONFIG.WH40K — system config bag. Templates that reach for
    // `CONFIG.WH40K.<x>` should be passing a context-local copy instead;
    // this empty bag prevents a hard ReferenceError if one slips through.
    WH40K: Record<string, unknown>;
}

interface UiStub {
    // MOCK: ui.notifications — collect-and-discard. Stories may dispatch
    // these from action handlers; we never surface them.
    notifications: {
        info: (msg: string) => void;
        warn: (msg: string) => void;
        error: (msg: string) => void;
    };
}

interface HooksStub {
    // MOCK: Hooks — accept registration, never invoke. Stories that register
    // hooks won't see them fire; this is intentional, hook propagation is not
    // a story concern.
    on: (event: string, fn: (...args: unknown[]) => unknown) => number;
    once: (event: string, fn: (...args: unknown[]) => unknown) => number;
    off: (event: string, id: number) => void;
    call: (event: string, ...args: unknown[]) => boolean;
    callAll: (event: string, ...args: unknown[]) => boolean;
}

const game: GameStub = {
    i18n: {
        localize: (key) => key,
        format: (key, data) => {
            if (!data) return key;
            return key.replace(/\{(\w+)\}/g, (_, name) => String(data[name] ?? ''));
        },
        has: () => false,
    },
    user: { isGM: false, id: 'story-user', name: 'Storybook User' },
    settings: {
        get: () => undefined,
        set: async (_ns, _key, value) => value,
    },
};

const CONFIG: ConfigStub = {
    WH40K: {},
};

const ui: UiStub = {
    notifications: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
    },
};

const Hooks: HooksStub = {
    on: () => 0,
    once: () => 0,
    off: () => undefined,
    call: () => true,
    callAll: () => true,
};

/**
 * Install the runtime stubs onto `globalThis`. Idempotent. Call from
 * `.storybook/preview.ts` before stories load if/when a story-level dependency
 * on Foundry globals materializes. Currently NOT invoked — the corpus has no
 * such dependency, see `stories/MOCK_COVERAGE.md`.
 */
export function installFoundryRuntimeStubs(): void {
    const target = globalThis as typeof globalThis & FoundryRuntimeGlobals;
    if (!target.game) target.game = game;
    if (!target.CONFIG) target.CONFIG = CONFIG;
    if (!target.ui) target.ui = ui;
    if (!target.Hooks) target.Hooks = Hooks;
}

export { game, CONFIG, ui, Hooks };
export type { GameStub, ConfigStub, UiStub, HooksStub };
