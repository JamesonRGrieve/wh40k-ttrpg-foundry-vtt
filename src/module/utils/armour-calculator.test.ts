import { describe, expect, it } from 'vitest';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { asBaseActor } from '../testing/actor-stub.ts';
import { type ArmourSystemLike, computeArmour, getArmourAPForLocation } from './armour-calculator';

/**
 * Regression tests for the DH2 errata stacking rules (errata.md L69-73):
 *
 *   "Machine Trait: This armour stacks with worn armour, but not with
 *    the Natural Armour trait..."
 *
 * `computeArmour()` already implements this — Machine and Natural Armour
 * are taken as the higher of the two for `traitBonus`, and equipped
 * armour AP is summed on top. These tests pin both pathways so a refactor
 * of the trait-bonus accumulator cannot silently regress the errata fix.
 */

interface ItemSystemLike {
    level?: number;
    specialization?: string;
    state?: { equipped?: boolean };
    craftsmanship?: string;
    armourPoints?: Record<string, number>;
}
interface ItemLike {
    type: string;
    name: string;
    system: ItemSystemLike;
}

interface MockActorOpts {
    toughnessBonus?: number;
    items?: ItemLike[];
}

function makeTraitItem(name: string, level: number): ItemLike {
    return { type: 'trait', name, system: { level } };
}

function makeWornArmourItem(name: string, ap: number): ItemLike {
    // Match the path computeArmour uses: equipped armour with an
    // `armourPoints` map keyed by location.
    return {
        type: 'armour',
        name,
        system: {
            state: { equipped: true },
            craftsmanship: 'common',
            armourPoints: {
                body: ap,
                head: ap,
                leftArm: ap,
                rightArm: ap,
                leftLeg: ap,
                rightLeg: ap,
            },
        },
    };
}

/**
 * Pull the body armour entry out of computeArmour()'s result.
 * computeArmour returns Record<string, ArmourLocationData>; under
 * noUncheckedIndexedAccess the lookup is `... | undefined`. We assert presence
 * once here (every test populates body) so test bodies can read `body.total`
 * etc. as a narrowed value — keeping the assertion noise (`?.` everywhere)
 * out of the actual expectations.
 */
function bodyOf(armour: ReturnType<typeof computeArmour>): NonNullable<ReturnType<typeof computeArmour>[string]> {
    const body = armour['body'];
    expect(body, 'computeArmour returned no body entry').toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json has the flag off so ESLint sees `body` as ArmourLocationData; tsconfig.json has the flag on so tsc sees `ArmourLocationData | undefined` and requires this guard.
    if (body === undefined) throw new Error('unreachable — expect.toBeDefined would have thrown');
    return body;
}

function mockActor(opts: MockActorOpts): WH40KBaseActor {
    const items = opts.items ?? [];
    // Minimal actor surface that computeArmour reaches into:
    //  - characteristics.toughness.bonus
    //  - items (iterable + .filter)
    //  - getFlag('wh40k-rpg', 'hitThisRound')
    const actor = {
        characteristics: {
            toughness: { bonus: opts.toughnessBonus ?? 0 },
        },
        items: Object.assign([...items], {
            filter: (predicate: (i: ItemLike) => boolean) => items.filter(predicate),
        }),
        getFlag: (_scope: string, _key: string) => false,
    };
    return asBaseActor(actor);
}

describe('computeArmour (#144 errata: Machine + worn-armour stacking)', () => {
    it('Machine 4 + flak armour (AP 4) STACKS — body total = TB 3 + Machine 4 + AP 4 = 11', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [makeTraitItem('Machine', 4), makeWornArmourItem('Flak Cloak', 4)],
        });
        const body = bodyOf(computeArmour(actor));
        expect(body.total).toBe(11);
        expect(body.traitBonus).toBe(4);
        expect(body.value).toBe(4); // worn armour AP at body
        expect(body.toughnessBonus).toBe(3);
    });

    it('Natural Armour 5 alone — body total = TB 3 + Natural 5 = 8', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [makeTraitItem('Natural Armour', 5)],
        });
        const body = bodyOf(computeArmour(actor));
        expect(body.total).toBe(8);
        expect(body.traitBonus).toBe(5);
        expect(body.value).toBe(0);
    });

    it('Machine 4 + Natural Armour 5 DOES NOT STACK — picks higher (5), body total = TB 3 + 5 = 8', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [makeTraitItem('Machine', 4), makeTraitItem('Natural Armour', 5)],
        });
        const body = bodyOf(computeArmour(actor));
        expect(body.total).toBe(8);
        expect(body.traitBonus).toBe(5);
    });

    it('Machine 6 + Natural Armour 3 — picks higher Machine (6), body total = TB 3 + 6 = 9', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [makeTraitItem('Machine', 6), makeTraitItem('Natural Armour', 3)],
        });
        const body = bodyOf(computeArmour(actor));
        expect(body.total).toBe(9);
        expect(body.traitBonus).toBe(6);
    });

    it('Machine 4 + Natural Armour 5 + worn flak 4 — Natural wins trait slot, worn stacks: TB 3 + Natural 5 + AP 4 = 12', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [makeTraitItem('Machine', 4), makeTraitItem('Natural Armour', 5), makeWornArmourItem('Flak', 4)],
        });
        const body = bodyOf(computeArmour(actor));
        expect(body.total).toBe(12);
        expect(body.traitBonus).toBe(5);
        expect(body.value).toBe(4);
    });

    it('no traits, no armour — body total = TB only', () => {
        const actor = mockActor({ toughnessBonus: 4 });
        const body = bodyOf(computeArmour(actor));
        expect(body.total).toBe(4);
        expect(body.traitBonus).toBe(0);
    });

    it('both `Natural Armor` (US spelling) and `Natural Armour` are recognised', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [makeTraitItem('Natural Armor', 4)],
        });
        const body = bodyOf(computeArmour(actor));
        expect(body.traitBonus).toBe(4);
    });
});

/**
 * The Natural Armour / Machine rating is authored via the SPEC pattern (#261),
 * which parks the rating in `system.specialization` (e.g. "Natural Armour" with
 * `specialization: "3"`), not `system.level`. Reading only `level` silently
 * returned 0 for that content — under-protecting every creature (and PC) whose
 * natural armour is SPEC-authored. These pin the specialization fallback.
 */
describe('computeArmour — SPEC-carried natural-armour rating', () => {
    it('reads the rating from `specialization` when `level` is absent', () => {
        const actor = mockActor({
            toughnessBonus: 3,
            items: [{ type: 'trait', name: 'Natural Armour', system: { specialization: '3' } }],
        });
        const body = bodyOf(computeArmour(actor));
        expect(body.traitBonus).toBe(3);
        expect(body.total).toBe(6); // TB 3 + natural 3
    });

    it('parses the leading integer of a composed specialization string', () => {
        const actor = mockActor({
            toughnessBonus: 0,
            items: [{ type: 'trait', name: 'Machine', system: { specialization: '6 (adamantium)' } }],
        });
        expect(bodyOf(computeArmour(actor)).traitBonus).toBe(6);
    });

    it('prefers a positive `level` over `specialization`', () => {
        const actor = mockActor({
            toughnessBonus: 0,
            items: [{ type: 'trait', name: 'Natural Armour', system: { level: 5, specialization: '3' } }],
        });
        expect(bodyOf(computeArmour(actor)).traitBonus).toBe(5);
    });
});

/**
 * `equippedOnly` distinguishes the PC model (armour is worn only when its
 * `state.equipped` flag is set) from the NPC model (a stat-block's listed armour
 * items ARE worn — the lean items carry no equip toggle). NPC armour derivation
 * calls with `equippedOnly: false`.
 */
describe('computeArmour — equippedOnly option', () => {
    function makeUnequippedArmour(name: string, ap: number): ItemLike {
        return {
            type: 'armour',
            name,
            system: { armourPoints: { body: ap, head: ap, leftArm: ap, rightArm: ap, leftLeg: ap, rightLeg: ap } },
        };
    }

    it('default (equippedOnly) ignores armour with no equipped flag — body total = TB only', () => {
        const actor = mockActor({ toughnessBonus: 3, items: [makeUnequippedArmour('Flak', 4)] });
        const body = bodyOf(computeArmour(actor));
        expect(body.value).toBe(0);
        expect(body.total).toBe(3);
    });

    it('equippedOnly:false counts the listed armour — body value = AP 4, total = TB 3 + AP 4 = 7', () => {
        const actor = mockActor({ toughnessBonus: 3, items: [makeUnequippedArmour('Flak', 4)] });
        const body = bodyOf(computeArmour(actor, { equippedOnly: false }));
        expect(body.value).toBe(4);
        expect(body.total).toBe(7);
    });
});

/**
 * Regression tests for #486 — the AP helpers are DataModel *methods* and must be
 * invoked with their receiver. Reading one off the model and calling it detached
 * (`const f = sys.getEffectiveAPForLocation; f(loc)`) leaves `this` undefined, so
 * the method's own `this.getAPForLocation(...)` threw
 * "Cannot read properties of undefined" and took the character-sheet render down.
 *
 * These stubs mimic the real DataModel shape: the helper is a prototype method
 * whose body dereferences `this`. Any future refactor that detaches the call
 * fails here instead of at render time in a live world.
 */
describe('getArmourAPForLocation (#486: helpers must be called bound to their model)', () => {
    class ArmourModelStub {
        constructor(private readonly points: Record<string, number>) {}

        getAPForLocation(location: string): number {
            return this.points[location] ?? 0;
        }

        getEffectiveAPForLocation(location: string): number {
            // Mirrors armour.ts: delegates through `this`, so an unbound call throws.
            return this.getAPForLocation(location) + 1;
        }
    }

    it('invokes getEffectiveAPForLocation bound to the model (does not throw on `this`)', () => {
        const model: ArmourSystemLike = new ArmourModelStub({ body: 4 });
        expect(() => getArmourAPForLocation(model, 'body')).not.toThrow();
        expect(getArmourAPForLocation(model, 'body')).toBe(5);
    });

    it('falls back to getAPForLocation, also bound, when no effective-AP helper exists', () => {
        class ApOnlyStub {
            constructor(private readonly points: Record<string, number>) {}
            getAPForLocation(location: string): number {
                return this.points[location] ?? 0;
            }
        }
        const model: ArmourSystemLike = new ApOnlyStub({ head: 3 });
        expect(() => getArmourAPForLocation(model, 'head')).not.toThrow();
        expect(getArmourAPForLocation(model, 'head')).toBe(3);
    });

    it('falls back to the plain armourPoints map when the model exposes no helpers', () => {
        expect(getArmourAPForLocation({ armourPoints: { leftArm: 2 } }, 'leftArm')).toBe(2);
    });

    it('returns 0 for an uncovered location rather than NaN', () => {
        const model: ArmourSystemLike = new ArmourModelStub({ body: 4 });
        expect(getArmourAPForLocation(model, 'leftLeg')).toBe(1);
        expect(getArmourAPForLocation({ armourPoints: {} }, 'leftLeg')).toBe(0);
    });
});
