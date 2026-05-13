import { describe, expect, it, vi, beforeEach } from 'vitest';
import { registerIconHelper } from './helper.ts';
import { hasIcon, icon, listIcons, type IconKey } from './icon.ts';
import { ICON_REGISTRY } from './registry.generated.ts';

// Minimal Handlebars stub for the helper test. We don't need the real engine —
// the helper only consumes Handlebars.registerHelper + Handlebars.SafeString.
// eslint-disable-next-line no-restricted-syntax -- boundary: HelperFn matches Handlebars' untyped callback signature
type HelperFn = (...args: unknown[]) => unknown;

interface HandlebarsStub {
    helpers: Record<string, HelperFn>;
    registerHelper: (name: string, fn: HelperFn) => void;
    SafeString: new (s: string) => { toString(): string };
}

function makeHandlebarsStub(): HandlebarsStub {
    class SafeString {
        constructor(public value: string) {}
        toString(): string {
            return this.value;
        }
    }
    const helpers: Record<string, HelperFn> = {};
    return {
        helpers,
        registerHelper: (name: string, fn: HelperFn) => {
            helpers[name] = fn;
        },
        SafeString,
    };
}

describe('icon registry', () => {
    it('bundles the seed icons referenced by the test + storybook', () => {
        // These four are seeded by scripts/gen-icons.mjs so a fresh checkout
        // always has at least one icon per family. Keep the asserts in lockstep
        // with the seed list in the generator.
        expect(ICON_REGISTRY['fa:dice-d20']).toBeTypeOf('string');
        expect(ICON_REGISTRY['fa:cog']).toBeTypeOf('string');
        expect(ICON_REGISTRY['lucide:dice-5']).toBeTypeOf('string');
        expect(ICON_REGISTRY['lucide:settings']).toBeTypeOf('string');
    });

    it('emits inline SVG with currentColor', () => {
        const svg = ICON_REGISTRY['fa:dice-d20'];
        expect(svg).toMatch(/^<svg /);
        expect(svg).toContain('currentColor');
        expect(svg).toContain('</svg>');
    });

    it('Lucide icons render with stroke="currentColor"', () => {
        const svg = ICON_REGISTRY['lucide:settings'];
        expect(svg).toContain('stroke="currentColor"');
    });

    it('listIcons returns a sorted set of keys', () => {
        const keys = listIcons();
        const sorted = [...keys].sort();
        expect(keys).toEqual(sorted);
        expect(keys.length).toBeGreaterThanOrEqual(4);
    });

    it('hasIcon narrows the type', () => {
        expect(hasIcon('fa:dice-d20')).toBe(true);
        expect(hasIcon('fa:nonexistent-xyz')).toBe(false);
        // ensure narrowed key can be passed to icon()
        const k = 'fa:cog';
        expect(hasIcon(k)).toBe(true);
        const out: string = icon(k);
        expect(out).toContain('<svg');
    });
});

describe('icon() runtime helper', () => {
    it('returns SVG markup with the wh40k-icon class', () => {
        const out = icon('fa:dice-d20');
        expect(out).toContain('class="wh40k-icon');
        expect(out).toContain('wh40k-icon--fa-dice-d20');
    });

    it('appends user-supplied classes', () => {
        const out = icon('fa:cog', { class: 'tw-text-bronze tw-w-4' });
        expect(out).toContain('tw-text-bronze');
        expect(out).toContain('tw-w-4');
    });

    it('renders aria-hidden by default and aria-label when label is provided', () => {
        const plain = icon('lucide:settings');
        expect(plain).toContain('aria-hidden="true"');
        expect(plain).not.toContain('aria-label');

        const labelled = icon('lucide:settings', { label: 'Open settings' });
        expect(labelled).toContain('aria-label="Open settings"');
        expect(labelled).toContain('role="img"');
    });

    it('escapes label attribute values', () => {
        const out = icon('fa:cog', { label: '<x" & y>' });
        expect(out).toContain('aria-label="&lt;x&quot; &amp; y&gt;"');
    });

    it('renders inline width/height when size is given', () => {
        const numeric = icon('fa:dice-d20', { size: 16 });
        expect(numeric).toContain('width:16px');
        expect(numeric).toContain('height:16px');

        const css = icon('fa:dice-d20', { size: '1.25em' });
        expect(css).toContain('width:1.25em');
    });

    it('returns empty string for missing keys (defensive)', () => {
        // Bypass the type system to simulate a registry-vs-union drift.
        // eslint-disable-next-line no-restricted-syntax -- test: intentionally casting to IconKey to simulate drift
        const result = icon('fa:does-not-exist' as unknown as IconKey);
        expect(result).toBe('');
    });
});

describe('Handlebars {{icon}} helper', () => {
    let stub: HandlebarsStub;

    beforeEach(() => {
        stub = makeHandlebarsStub();
        // eslint-disable-next-line no-restricted-syntax -- test: injecting Handlebars mock into globalThis boundary
        (globalThis as unknown as { Handlebars: HandlebarsStub }).Handlebars = stub;
        registerIconHelper();
    });

    it('registers an "iconSvg" helper', () => {
        expect(stub.helpers['iconSvg']).toBeTypeOf('function');
    });

    it('renders SafeString-wrapped SVG markup', () => {
        const fn = stub.helpers['iconSvg'] as HelperFn | undefined;
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: throws if helper missing, not a conditional assertion
        if (fn === undefined) throw new Error('iconSvg helper not registered');
        const result = fn('fa:dice-d20', { hash: { class: 'tw-text-bronze' } });
        const out = String((result as { toString(): string }).toString());
        expect(out).toContain('<svg');
        expect(out).toContain('tw-text-bronze');
    });

    it('passes through label and size options', () => {
        const fn = stub.helpers['iconSvg'] as HelperFn | undefined;
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: throws if helper missing, not a conditional assertion
        if (fn === undefined) throw new Error('iconSvg helper not registered');
        const result = fn('lucide:settings', {
            hash: { label: 'Configure', size: 20 },
        });
        const out = String((result as { toString(): string }).toString());
        expect(out).toContain('aria-label="Configure"');
        expect(out).toContain('width:20px');
    });

    it('warns and renders empty string for unknown keys', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fn = stub.helpers['iconSvg'] as HelperFn | undefined;
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: throws if helper missing, not a conditional assertion
        if (fn === undefined) throw new Error('iconSvg helper not registered');
        const result = fn('fa:not-a-real-icon', { hash: {} });
        const out = String((result as { toString(): string }).toString());
        expect(out).toBe('');
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('warns and renders empty string for non-string keys', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fn = stub.helpers['iconSvg'] as HelperFn | undefined;
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: throws if helper missing, not a conditional assertion
        if (fn === undefined) throw new Error('iconSvg helper not registered');
        const result = fn(42, { hash: {} });
        const out = String((result as { toString(): string }).toString());
        expect(out).toBe('');
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
