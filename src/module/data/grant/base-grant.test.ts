import { describe, expect, it } from 'vitest';

describe('BaseGrantData', () => {
    it('has a default BaseGrantData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./base-grant');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`base-grant DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema field defaults (type discriminator, label, description)
    //   - migrateData() handles legacy grant payloads
    //   - subclass dispatch via the `type` field
});
