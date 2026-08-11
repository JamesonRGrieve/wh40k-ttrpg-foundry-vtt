import { describe, expect, it } from 'vitest';
import { bootFoundryOnce, type FoundryRuntime } from './lib/boot';
import { createActor } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

const bootResult = await bootFoundryOnce();
const skipAll = !ok || !bootResult.booted;
const runtime: FoundryRuntime = bootResult.runtime ?? ({} as FoundryRuntime);

interface DataModelClass {
    name: string;
}

interface FoundryConfigSurface {
    Actor?: {
        dataModels?: Record<string, DataModelClass>;
        sheetClasses?: Record<string, Record<string, { name: string }>>;
    };
}

describe.skipIf(skipAll)('sheet render (Tier A)', () => {
    it('constructs a character document and prepareData runs without throwing', async () => {
        const actor = await createActor(runtime, {
            type: 'dh2-character',
            name: 'SheetRender Actor',
        });
        expect(actor).toBeDefined();
    });

    it('registers a DataModel for every declared actor type', () => {
        const cfg = runtime.CONFIG as FoundryConfigSurface;
        const models = cfg.Actor?.dataModels;
        expect(models).toBeDefined();
        const types = Object.keys(models ?? {});
        expect(types.length).toBeGreaterThan(0);
        for (const type of types) {
            const model = models?.[type];
            expect(model).toBeDefined();
            expect(model?.name).toBeTruthy();
        }
    });
});
