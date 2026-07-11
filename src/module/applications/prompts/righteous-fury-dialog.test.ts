import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the #287 refactor of RighteousFuryDialog: it must resolve
 * its boolean outcome through the shared {@link DialogResolution} SSOT, not a
 * hand-rolled promise resolver (the `_resolve` / `new Promise(...)` pattern #287
 * consolidated).
 *
 * This is a source-text test on purpose. RighteousFuryDialog extends
 * `ApplicationV2Mixin(ApplicationV2)`, which cannot be instantiated under
 * happy-dom (no live Foundry ApplicationV2), so the resolution wiring can't be
 * driven at runtime here. The behaviour of DialogResolution itself — resolve
 * once, default-on-close, no double-resolve — is covered by
 * `dialogs/dialog-resolution.test.ts`; this test only pins that the dialog
 * *composes* that helper rather than re-accreting its own resolver.
 */
const SOURCE = readFileSync(resolve(__dirname, './righteous-fury-dialog.ts'), 'utf8');

describe('RighteousFuryDialog — resolution wiring (#287)', () => {
    it('composes the shared DialogResolution helper', () => {
        expect(SOURCE).toContain("import DialogResolution from '../dialogs/dialog-resolution.ts'");
        // Default outcome is false (a dismissal / failed roll), typed boolean.
        expect(SOURCE).toContain('new DialogResolution<boolean>(false)');
    });

    it('resolves the outcome and defaults on close through the helper', () => {
        // Confirm/cancel handler routes the boolean outcome through the resolver.
        expect(SOURCE).toMatch(/#resolution\.resolve\(rolled && this\.success\)/);
        // A dismissal resolves the default via the helper, wired once on close.
        expect(SOURCE).toContain('this.#resolution.resolveDefault()');
        expect(SOURCE).toContain('this.#resolution.track()');
    });

    it('does not re-introduce a hand-rolled promise resolver', () => {
        // The #287 anti-pattern: a stored resolve fn + a bare `new Promise` the
        // dialog resolves itself. All resolution must go through DialogResolution.
        expect(SOURCE).not.toMatch(/new Promise\s*</);
        expect(SOURCE).not.toMatch(/#?_resolve(Promise)?\b/);
    });
});
