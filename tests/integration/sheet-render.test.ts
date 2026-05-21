import { describe, expect, it } from 'vitest';
import { bootFoundryOnce } from './lib/boot';
import { createActor } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

describe.skipIf(!ok)('sheet render (Tier A)', () => {
    it('opens a character sheet against a real Document and does not throw', async () => {
        const result = await bootFoundryOnce();
        if (!result.booted) return;
        const actor = (await createActor(result.runtime!, {
            type: 'character',
            name: 'SheetRender Actor',
        })) as { sheet?: { render?: (force?: boolean) => Promise<unknown> } };
        if (!actor.sheet?.render) return;
        await actor.sheet.render(true);
        expect(actor.sheet).toBeDefined();
    });

    it('does not collide on registerSheet anonymous-class names (V14 gotcha #10)', async () => {
        const result = await bootFoundryOnce();
        if (!result.booted) return;
        const cfg = result.runtime?.CONFIG as { Actor?: { sheetClasses?: Record<string, Record<string, unknown>> } } | undefined;
        const classes = cfg?.Actor?.sheetClasses;
        if (!classes) return;
        const names = new Set<string>();
        for (const typeMap of Object.values(classes)) {
            for (const key of Object.keys(typeMap)) {
                expect(names.has(key)).toBe(false);
                names.add(key);
            }
        }
    });
});
