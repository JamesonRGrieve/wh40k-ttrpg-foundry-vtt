import { describe, expect, it } from 'vitest';
import { bootFoundryOnce, type FoundryRuntime } from './lib/boot';
import { createActor } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

// Boot once at module load so test bodies stay free of guard conditionals.
const bootResult = await bootFoundryOnce();
const skipAll = !ok || !bootResult.booted;
const runtime: FoundryRuntime = bootResult.runtime ?? ({} as FoundryRuntime);

interface RenderedSheet {
    element?: HTMLElement;
}

interface SheetActor {
    sheet?: { render?: (force?: boolean) => Promise<RenderedSheet> };
}

interface SheetClass {
    name: string;
}

interface FoundryConfigSurface {
    Actor?: { sheetClasses?: Record<string, Record<string, SheetClass>> };
}

describe.skipIf(skipAll)('sheet render (Tier A)', () => {
    it('opens a character sheet against a real Document and does not throw', async () => {
        const actor = (await createActor(runtime, {
            type: 'character',
            name: 'SheetRender Actor',
        })) as SheetActor;
        expect(actor.sheet?.render).toBeDefined();
        await actor.sheet?.render?.(true);
        expect(actor.sheet).toBeDefined();
    });

    it('does not collide on registerSheet anonymous-class names (V14 gotcha #10)', () => {
        const cfg = runtime.CONFIG as FoundryConfigSurface;
        const classes = cfg.Actor?.sheetClasses;
        expect(classes).toBeDefined();
        const names = new Set<string>();
        for (const typeMap of Object.values(classes ?? {})) {
            for (const key of Object.keys(typeMap)) {
                expect(names.has(key)).toBe(false);
                names.add(key);
            }
        }
    });
});
