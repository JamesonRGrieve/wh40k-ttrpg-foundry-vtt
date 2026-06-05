import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('BaseGrantData', () => {
    it('has a default BaseGrantData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./base-grant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema field defaults (type discriminator, label, description)
    //   - migrateData() handles legacy grant payloads
    //   - subclass dispatch via the `type` field
});
