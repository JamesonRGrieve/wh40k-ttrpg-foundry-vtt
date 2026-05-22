import { describe, expect, it } from 'vitest';

/**
 * Resolve the module at collection time. If the Foundry runtime is unavailable
 * the import fails and `MOD` stays `undefined`; the test below is then skipped
 * via `it.skipIf(!HAVE)` instead of an in-test early-return conditional. The
 * `describe`/`it` bodies never deref `MOD` until the skip guard has passed.
 */
const MOD = await import('./identifier-field').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`identifier-field could not be imported in this environment: ${msg}`);
    return undefined;
});
const HAVE = MOD !== undefined;

describe('IdentifierField', () => {
    it.skipIf(!HAVE)('has a default IdentifierField symbol exported', () => {
        expect(MOD).toBeTruthy();
        expect(MOD?.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - validates accepted identifier patterns (lowercase-hyphenated)
    //   - rejects strings with disallowed characters
    //   - default value behaviour matches StringField semantics
});
