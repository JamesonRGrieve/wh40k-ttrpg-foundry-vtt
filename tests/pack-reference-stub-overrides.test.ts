/**
 * Guard for reference-stub overrides (`scripts/lib/pack-reference.cjs`, used by
 * the gulp build and `src/packs/validate-schema.cjs`). A stub may carry `name` /
 * `_id` / `img` to ride a SHARED canonical body under a local identity, a
 * name-over-body reference (ratified in #499, where rejecting the override form
 * silently dropped 25 RT items). It may also carry a `system` overlay that is
 * deep-merged onto the body, so a Reinforcement Character stub adds its RC terms
 * over the bestiary profile without copying it (#77). The validator must accept
 * exactly that set and still warn on any other extra key or an empty override.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { applyReferenceOverrides, deepMergeOverlay, isReferenceStub } from '../scripts/lib/pack-reference.cjs';

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
    system?: Record<string, number | boolean | Record<string, number>> | number[];
    flags?: Record<string, number>;
    addItems?: Array<Record<string, string>>;
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
            reference: '../dh2-weapons/_source/frag-grenade_XXXX.json',
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

    it('accepts a system overlay (deep-merged onto the body, #77)', () => {
        const rules = rulesFor({ reference: '../x.json', name: 'Ork Freeboota', system: { isReinforcement: true, fate: { value: 2, max: 2 } } });
        expect(rules).toHaveLength(0);
    });

    it('warns on a non-override extra key', () => {
        expect(rulesFor({ reference: '../x.json', flags: { foo: 1 } })).toContain('stub-extra-keys');
    });

    it('warns on an empty or non-object system overlay', () => {
        expect(rulesFor({ reference: '../x.json', system: {} })).toContain('stub-override-system');
        expect(rulesFor({ reference: '../x.json', system: [1] })).toContain('stub-override-system');
    });

    it('accepts addItems of identified items and warns on an empty or unidentified list', () => {
        expect(rulesFor({ reference: '../x.json', addItems: [{ _id: 'RCwtKroot0000001', name: 'Weapon Training', type: 'talent' }] })).toHaveLength(0);
        expect(rulesFor({ reference: '../x.json', addItems: [] })).toContain('stub-add-items');
        expect(rulesFor({ reference: '../x.json', addItems: [{ name: 'Weapon Training', type: 'talent' }] })).toContain('stub-add-items');
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

describe('reference-stub resolution (#77)', () => {
    // A bestiary profile, trimmed to what the overlay touches.
    const freeboota = {
        _id: '6yWxfSDIlZw3nklV',
        name: 'Freeboota',
        type: 'dh2-npc',
        system: {
            tier: 'elite',
            characteristics: { ws: 40, bs: 35 },
            isReinforcement: false,
            fate: { value: 0, max: 0 },
            reinforcement: { influenceMinimum: null, influenceCost: null, peerDiscount: { peer: '', amount: '' } },
            tags: ['ork', 'xenos'],
        },
    };

    it('recognises a stub by its string reference', () => {
        expect(isReferenceStub({ reference: '../x.json', system: { fate: { value: 2 } } })).toBe(true);
        expect(isReferenceStub({ reference: 3 })).toBe(false);
        expect(isReferenceStub([])).toBe(false);
    });

    it('keeps the body and deep-merges only the RC terms', () => {
        const stub = {
            reference: '../../dh2-bestiary/_source/freeboota_6yWxfSDIlZw3nklV.json',
            name: 'Ork Freeboota',
            system: {
                isReinforcement: true,
                fate: { value: 2, max: 2 },
                reinforcement: { influenceMinimum: 45, influenceCost: 5, peerDiscount: { peer: 'Orks', amount: '2' } },
            },
        };
        const out = applyReferenceOverrides(freeboota, stub);
        expect(out['name']).toBe('Ork Freeboota');
        expect(out['_id']).toBe('6yWxfSDIlZw3nklV');
        expect(out['reference']).toBeUndefined();
        expect(out['system']).toEqual({
            tier: 'elite',
            characteristics: { ws: 40, bs: 35 },
            isReinforcement: true,
            fate: { value: 2, max: 2 },
            reinforcement: { influenceMinimum: 45, influenceCost: 5, peerDiscount: { peer: 'Orks', amount: '2' } },
            tags: ['ork', 'xenos'],
        });
        // The canonical body is not mutated.
        expect(freeboota.system.isReinforcement).toBe(false);
    });

    it("appends addItems after the body's own items (an RC's Weapon Training)", () => {
        const body = { ...freeboota, items: [{ _id: 'bodyItem00000001', name: 'Crushing Blow', type: 'talent' }] };
        const training = {
            _id: 'RCwtKroot0000001',
            name: 'Weapon Training',
            type: 'talent',
            _stats: { compendiumSource: 'Compendium.wh40k-rpg.dh2-talents.Item.DH2aTlnt00000026' },
            system: { specialization: 'Exotic [Kroot Rifle]' },
        };
        const out = applyReferenceOverrides(body, { reference: '../x.json', addItems: [training] });
        expect(out['items']).toEqual([body.items[0], training]);
        expect(body.items).toHaveLength(1);
        // A body with no items still takes the added ones.
        expect(applyReferenceOverrides(freeboota, { reference: '../x.json', addItems: [training] })['items']).toEqual([training]);
    });

    it('leaves the body system untouched for an identity-only stub', () => {
        const out = applyReferenceOverrides(freeboota, { reference: '../x.json', img: 'a.webp' });
        expect(out['system']).toBe(freeboota.system);
        expect(out['img']).toBe('a.webp');
    });

    it('replaces arrays and scalars outright and merges nested objects', () => {
        expect(deepMergeOverlay({ a: [1, 2], b: { c: 1, d: 2 } }, { a: [3], b: { d: 4 } })).toEqual({ a: [3], b: { c: 1, d: 4 } });
        expect(deepMergeOverlay({ a: 1 }, { a: { b: 2 } })).toEqual({ a: { b: 2 } });
    });
});
