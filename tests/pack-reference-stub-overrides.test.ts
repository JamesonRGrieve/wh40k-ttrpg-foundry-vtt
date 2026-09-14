/**
 * Guard for the reference-stub OVERRIDE whitelist (`STUB_OVERRIDE_KEYS` in
 * `src/packs/validate-schema.cjs`). The pack build resolves a stub as
 * `{ ...resolvedTargetBody, ...stubKeysMinusReference }` (`resolvePackSourceDocument`,
 * gulpfile.js), so a stub may carry `name` / `_id` / `img` to ride a SHARED
 * canonical body under a local identity — a name-over-body reference (ratified
 * in #499, where rejecting the override form silently dropped 25 RT items). The
 * validator must accept exactly that set and still warn on any other extra key
 * or an empty override value.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface Warning {
    rule: string;
    file: string;
    detail: string;
}
/** The reference-stub shapes this test feeds the validator (not the full document surface). */
interface StubUnderTest {
    reference?: string | number;
    name?: string;
    _id?: string;
    img?: string;
    system?: Record<string, number>;
}
interface SchemaValidator {
    validateDocument: (doc: StubUnderTest, relFile: string, warnings: Warning[]) => void;
}

const nodeRequire = createRequire(import.meta.url);
const validator: SchemaValidator = nodeRequire('../src/packs/validate-schema.cjs') as SchemaValidator;

function rulesFor(doc: StubUnderTest): string[] {
    const warnings: Warning[] = [];
    validator.validateDocument(doc, 'test.json', warnings);
    return warnings.map((w) => w.rule);
}

describe('reference-stub override whitelist', () => {
    it('accepts a name/_id/img override over a shared body reference', () => {
        const rules = rulesFor({
            reference: '../dh2-core-items-weapons/_source/frag-grenade_XXXX.json',
            _id: 'AstFragGrenade001',
            name: 'Astartes Frag Grenade',
            img: 'systems/wh40k-rpg/icons/frag.png',
        });
        expect(rules).not.toContain('stub-extra-keys');
        expect(rules).toHaveLength(0);
    });

    it('accepts a bare reference stub (byte-identical alias)', () => {
        expect(rulesFor({ reference: '../x/_source/y.json' })).toHaveLength(0);
    });

    it('warns on a non-override extra key (system cannot be deep-patched by a shallow spread)', () => {
        expect(rulesFor({ reference: '../x.json', system: { foo: 1 } })).toContain('stub-extra-keys');
    });

    it('warns on an empty override value', () => {
        expect(rulesFor({ reference: '../x.json', name: '' })).toContain('stub-override-name');
        expect(rulesFor({ reference: '../x.json', _id: '' })).toContain('stub-override-id');
        expect(rulesFor({ reference: '../x.json', img: '' })).toContain('stub-override-img');
    });

    it('warns on a non-string reference', () => {
        expect(rulesFor({ reference: 123 })).toContain('stub-bad-reference');
    });
});
