import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

/**
 * Resolve the module at collection time. If the Foundry runtime is unavailable
 * the import fails and `MOD` stays `undefined`; the test below is then skipped
 * via `it.skipIf(!HAVE)` instead of an in-test early-return conditional. The
 * `describe`/`it` bodies never deref `MOD` until the skip guard has passed.
 */
const MOD = await importModelOrSkip(import('./identifier-field.ts'));
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
