import { describe, expect, it } from 'vitest';
import { SYSTEM_ID } from './constants.ts';
import {
    BUILDER_ORIGIN_RESOURCE_PATHS,
    ORIGIN_GRANT_DELTAS_FLAG,
    ORIGIN_RESOURCE_PATHS,
    ORIGIN_RESOURCES,
    type OriginAppliedDelta,
    deltaFromModifiers,
    type OriginIdentityItemLike,
    type OriginModifierBag,
    type OriginResource,
    originContribution,
    originDeltaFlagPath,
    originIdentityKey,
    priorAfterBuilderWrites,
    readOriginDelta,
    reconcileResourceDeltas,
} from './origin-grant-ledger.ts';

/**
 * The origin-grant ledger is the single source of truth shared by the two
 * grant-application mechanisms — the origin-path builder's `#commit` (absolute
 * resource writes, then a ledger reconcile) and the boot-time reconcile pass
 * (`WH40KItem.applyOriginToActor`, delta-tracked). Both derive the same
 * identity key and the same canonical delta from an origin's modifier bag, so
 * applying the same selections N times converges to the result of applying them
 * once. These unit tests pin that convergence at the primitive level (the
 * builder/reconcile DataModels do not load under happy-dom).
 */
describe('origin-grant-ledger: deltaFromModifiers', () => {
    it('reads resources from modifiers.resources, the shape the origin packs store (#42)', () => {
        const modifiers: OriginModifierBag = {
            characteristics: { weaponSkill: 5, toughness: 3 },
            resources: { wounds: 2, fate: 1, corruption: 10, insanity: 3 },
        };
        expect(deltaFromModifiers(modifiers)).toEqual({
            characteristics: { weaponSkill: 5, toughness: 3 },
            wounds: 2,
            fate: 1,
            corruption: 10,
            insanity: 3,
        });
    });

    it('drops zero-valued characteristic entries (matching applyOriginToActor)', () => {
        const modifiers: OriginModifierBag = {
            characteristics: { weaponSkill: 5, ballisticSkill: 0 },
            resources: { wounds: 0, fate: 0 },
        };
        const delta = deltaFromModifiers(modifiers);
        expect(delta.characteristics).toEqual({ weaponSkill: 5 });
        expect('ballisticSkill' in delta.characteristics).toBe(false);
        expect(delta.wounds).toBe(0);
        expect(delta.fate).toBe(0);
    });

    it('treats undefined / empty modifiers as a zero delta', () => {
        const zero = { characteristics: {}, wounds: 0, fate: 0, corruption: 0, insanity: 0 };
        expect(deltaFromModifiers(undefined)).toEqual(zero);
        expect(deltaFromModifiers({})).toEqual(zero);
        expect(deltaFromModifiers({ resources: {} })).toEqual(zero);
    });

    it('coerces sparse / undefined stored values rather than propagating NaN', () => {
        // Legacy / partially-authored origins may store undefined entries; the
        // applier compares the recorded delta to a freshly-derived one, so both
        // must coerce identically to a defined number.
        const modifiers: OriginModifierBag = {
            characteristics: { weaponSkill: 5, ballisticSkill: undefined },
            resources: { wounds: undefined, fate: undefined },
        };
        const delta = deltaFromModifiers(modifiers);
        expect(delta.characteristics).toEqual({ weaponSkill: 5 });
        expect(delta.wounds).toBe(0);
        expect(delta.fate).toBe(0);
    });

    it('is idempotent under repeated derivation (re-deriving never drifts)', () => {
        const modifiers: OriginModifierBag = { characteristics: { intelligence: 5 }, resources: { wounds: 8, fate: 2 } };
        expect(deltaFromModifiers(modifiers)).toEqual(deltaFromModifiers(modifiers));
    });

    it('turns a delta into a reconcile contribution carrying every resource', () => {
        const delta = deltaFromModifiers({ characteristics: { strength: -3 }, resources: { corruption: 10 } });
        expect(originContribution(delta)).toEqual({
            characteristics: { strength: -3 },
            resources: { wounds: 0, fate: 0, corruption: 10, insanity: 0 },
        });
    });
});

describe('origin-grant-ledger: originIdentityKey', () => {
    const base = (over: Partial<OriginIdentityItemLike>): OriginIdentityItemLike => ({ name: 'Imperial World', ...over });

    it('prefers the V14 compendium source UUID (survives renames)', () => {
        const item = base({
            _stats: { compendiumSource: 'Compendium.wh40k-rpg.dh2-origins.Item.abc123' },
            id: 'localid',
            flags: { core: { sourceId: 'legacy' } },
        });
        expect(originIdentityKey(item)).toBe('Compendium.wh40k-rpg.dh2-origins.Item.abc123');
    });

    it('falls back to the legacy flags.core.sourceId when no compendiumSource', () => {
        const item = base({ flags: { core: { sourceId: 'Compendium.wh40k-rpg.dh2-origins.Item.legacy' } }, id: 'localid' });
        expect(originIdentityKey(item)).toBe('Compendium.wh40k-rpg.dh2-origins.Item.legacy');
    });

    it('falls back to the item id when no source UUID is present', () => {
        expect(originIdentityKey(base({ id: 'localid' }))).toBe('localid');
    });

    it('falls back to a name-derived key as a last resort', () => {
        expect(originIdentityKey(base({ id: null }))).toBe('name:Imperial World');
    });

    it('is stable across re-derivation from the same item (key never drifts)', () => {
        const item = base({ _stats: { compendiumSource: 'Compendium.wh40k-rpg.dh2-origins.Item.abc123' } });
        expect(originIdentityKey(item)).toBe(originIdentityKey(item));
    });
});

/**
 * Apply an `actor.update()` bag the way Foundry stores it: every dotted key
 * is expanded one level per segment (`foundry.utils.expandObject`), so a
 * dotted ledger key such as a compendium UUID ends up nested.
 */
function applyUpdate(target: Stored, updates: Stored): void {
    for (const [path, value] of Object.entries(updates)) {
        const parts = path.split('.');
        const last = parts.pop() ?? '';
        let node = target;
        for (const part of parts) {
            const next = node[part];
            if (typeof next === 'object') {
                node = next;
            } else {
                const created: Stored = {};
                node[part] = created;
                node = created;
            }
        }
        node[last] = value;
    }
}

/** A document's stored data: nested objects of numbers. */
interface Stored {
    [key: string]: Stored | number;
}

/** A recorded delta as stored data. */
function toStored(delta: OriginAppliedDelta): Stored {
    const out: Stored = { characteristics: { ...delta.characteristics } };
    for (const resource of ORIGIN_RESOURCES) {
        const value = delta[resource];
        if (value !== undefined) out[resource] = value;
    }
    return out;
}

describe('origin-grant-ledger: the world-ready reconcile is idempotent through Foundry storage (#42)', () => {
    // A compendium-UUID identity key: the dots make Foundry nest the ledger entry.
    const KEY = 'Compendium.wh40k-rpg.ow-hammer-origins-homeworlds.Item.3422efadd4703be1';
    const AGRI_WORLD: OriginModifierBag = { resources: { wounds: 2 } };

    /** One boot's reconcile of the origin: read the ledger, reconcile, store the update as Foundry would. */
    function boot(actor: { system: Stored; flags: Stored }): void {
        const prior = readOriginDelta(actor.flags, KEY);
        const { updates, newDelta } = reconcileResourceDeltas(actor.system, originContribution(deltaFromModifiers(AGRI_WORLD)), prior, ORIGIN_RESOURCE_PATHS);
        const bag: Stored = { [originDeltaFlagPath(KEY)]: toStored(newDelta) };
        for (const [path, value] of Object.entries(updates)) if (typeof value === 'number') bag[path] = value;
        applyUpdate({ system: actor.system, flags: actor.flags }, bag);
    }

    it('reads back a delta Foundry stored nested under its dotted key', () => {
        const flags: Stored = {};
        applyUpdate({ flags }, { [originDeltaFlagPath(KEY)]: { wounds: 2 } });
        expect(readOriginDelta(flags, KEY)).toEqual({ wounds: 2 });
    });

    it('applies Agri-World’s +2 Wounds once however many times the world readies', () => {
        const actor: { system: Stored; flags: Stored } = { system: { wounds: { max: 10 } }, flags: {} };
        boot(actor);
        expect(actor.system['wounds']).toEqual({ max: 12 });
        boot(actor);
        boot(actor);
        expect(actor.system['wounds']).toEqual({ max: 12 });
    });
});

describe('origin-grant-ledger: flag plumbing', () => {
    it('builds a flag path both call sites write identically', () => {
        const key = 'Compendium.wh40k-rpg.dh2-origins.Item.abc123';
        expect(originDeltaFlagPath(key)).toBe(`flags.${SYSTEM_ID}.${ORIGIN_GRANT_DELTAS_FLAG}.${key}`);
    });

    it('reads back an empty delta when the actor has never committed (first apply is additive)', () => {
        expect(readOriginDelta(undefined, 'k')).toEqual({});
        expect(readOriginDelta({}, 'k')).toEqual({});
        expect(readOriginDelta({ [SYSTEM_ID]: {} }, 'k')).toEqual({});
        expect(readOriginDelta({ [SYSTEM_ID]: { [ORIGIN_GRANT_DELTAS_FLAG]: {} } }, 'missing')).toEqual({});
    });

    it('reads back the exact delta a prior commit recorded', () => {
        const key = 'Compendium.wh40k-rpg.dh2-origins.Item.abc123';
        const delta = { characteristics: { weaponSkill: 5 }, wounds: 2, fate: 1 };
        const flags = { [SYSTEM_ID]: { [ORIGIN_GRANT_DELTAS_FLAG]: { [key]: delta } } };
        expect(readOriginDelta(flags, key)).toEqual(delta);
    });
});

/** Character state the reconcile reads and writes: wounds.max, fate.{max,value}, corruption, characteristics.*.base. */
interface ResourceState {
    wounds: number;
    fate: number;
    corruption: number;
    characteristics: Record<string, number>;
}

/** Build the schema-shaped `system` snapshot the helper reads. */
function toSystem(state: ResourceState): {
    wounds: { max: number };
    fate: { max: number; value: number };
    corruption: number;
    characteristics: Record<string, { base: number; advance: number }>;
} {
    const characteristics: Record<string, { base: number; advance: number }> = {};
    for (const [k, base] of Object.entries(state.characteristics)) characteristics[k] = { base, advance: 0 };
    return { wounds: { max: state.wounds }, fate: { max: state.fate, value: state.fate }, corruption: state.corruption, characteristics };
}

/** Apply the helper's `system.*` update bag back onto a state snapshot (the actor.update() Foundry does for real). */
// eslint-disable-next-line no-restricted-syntax -- boundary: `updates` is the helper's actor.update() payload (ResourceReconcileResult.updates: Record<string, unknown>); this test replays it
function applyUpdates(state: ResourceState, updates: Record<string, unknown>): ResourceState {
    const next: ResourceState = { ...state, characteristics: { ...state.characteristics } };
    if (typeof updates['system.wounds.max'] === 'number') next.wounds = updates['system.wounds.max'];
    // Fate total and current points move together from a full pool.
    expect(updates['system.fate.value']).toBe(updates['system.fate.max']);
    if (typeof updates['system.fate.max'] === 'number') next.fate = updates['system.fate.max'];
    if (typeof updates['system.corruption'] === 'number') next.corruption = updates['system.corruption'];
    // Every characteristic in these convergence cases is pre-seeded on the state, so replaying by known key covers all writes.
    for (const key of Object.keys(next.characteristics)) {
        expect(updates[`system.characteristics.${key}.advance`]).toBeUndefined();
        const value = updates[`system.characteristics.${key}.base`];
        if (typeof value === 'number') next.characteristics[key] = value;
    }
    return next;
}

function reconcile(state: ResourceState, modifiers: OriginModifierBag, priorDelta: OriginAppliedDelta): { next: ResourceState; recorded: OriginAppliedDelta } {
    const { updates, newDelta } = reconcileResourceDeltas(
        toSystem(state),
        originContribution(deltaFromModifiers(modifiers)),
        priorDelta,
        ORIGIN_RESOURCE_PATHS,
    );
    return { next: applyUpdates(state, updates), recorded: newDelta };
}

describe('origin-grant-ledger: reconcileResourceDeltas convergence (idempotency property)', () => {
    /**
     * Drive the real shared helper with the boot reconcile's
     * (`WH40KItem.applyOriginToActor`) resource→path map, ORIGIN_RESOURCE_PATHS,
     * contribution derived from `deltaFromModifiers`. We assert the convergence
     * invariant: once the ledger records an origin's delta, re-applying it is a
     * no-op. `fate` here is the Fate total; the fixture starts each character
     * with full Fate points.
     */
    const grantMods: OriginModifierBag = { characteristics: { weaponSkill: 5, toughness: 3 }, resources: { wounds: 2, fate: 1, corruption: 10 } };
    const start: ResourceState = { wounds: 10, fate: 3, corruption: 0, characteristics: { weaponSkill: 30, toughness: 30 } };

    it('first apply (no prior delta) is purely additive', () => {
        const { next, recorded } = reconcile(start, grantMods, {});
        expect(next).toEqual({ wounds: 12, fate: 4, corruption: 10, characteristics: { weaponSkill: 35, toughness: 33 } });
        expect(recorded).toEqual({ characteristics: { weaponSkill: 5, toughness: 3 }, wounds: 2, fate: 1, corruption: 10, insanity: 0 });
    });

    it('adds a +5 characteristic change to the base value, never as five +5 advances (+25)', () => {
        const { updates } = reconcileResourceDeltas(
            toSystem(start),
            originContribution(deltaFromModifiers({ characteristics: { weaponSkill: 5 } })),
            {},
            ORIGIN_RESOURCE_PATHS,
        );
        expect(updates['system.characteristics.weaponSkill.base']).toBe(35);
        expect(updates['system.characteristics.weaponSkill.advance']).toBeUndefined();
    });

    it('second apply with the recorded delta is a no-op (N applies == 1 apply)', () => {
        const first = reconcile(start, grantMods, {});
        // Re-apply using the delta the first apply recorded — this is what the
        // builder records and what the next reconcile reads back.
        const second = reconcile(first.next, grantMods, first.recorded);
        expect(second.next).toEqual(first.next);
        const third = reconcile(second.next, grantMods, second.recorded);
        expect(third.next).toEqual(first.next);
    });

    it('lands origin Fate on the schema fields — fate.max and fate.value, never a phantom fate.total (#42)', () => {
        const { updates } = reconcileResourceDeltas(
            toSystem({ wounds: 10, fate: 2, corruption: 0, characteristics: {} }),
            { characteristics: {}, resources: { fate: 1 } },
            {},
            ORIGIN_RESOURCE_PATHS,
        );
        expect(updates).toEqual({ 'system.fate.max': 3, 'system.fate.value': 3 });
    });

    it('lands origin Corruption on the plain-number system.corruption field', () => {
        const { updates } = reconcileResourceDeltas(toSystem(start), { characteristics: {}, resources: { corruption: 10 } }, {}, ORIGIN_RESOURCE_PATHS);
        expect(updates).toEqual({ 'system.corruption': 10 });
    });

    it('skips a resource the actor does not carry (an NPC has no Corruption) but still records it', () => {
        const npcSystem = { wounds: { max: 10 }, fate: { max: 0, value: 0 }, characteristics: {} };
        const { updates, newDelta } = reconcileResourceDeltas(
            npcSystem,
            { characteristics: {}, resources: { corruption: 10, insanity: 3 } },
            {},
            ORIGIN_RESOURCE_PATHS,
        );
        expect(updates).toEqual({});
        expect(newDelta.corruption).toBe(10);
        expect(newDelta.insanity).toBe(3);
    });

    it('changing selections re-bases off the recorded delta instead of stacking', () => {
        // Commit A grants +2 wounds; the player then re-commits with an origin
        // granting +5 wounds. The recorded prior (+2) is reversed before the new
        // (+5) lands, so the net is +5 over baseline, not +7.
        const baseline: ResourceState = { wounds: 10, fate: 3, corruption: 0, characteristics: {} };
        const a = reconcile(baseline, { resources: { wounds: 2 } }, {});
        expect(a.next.wounds).toBe(12);
        const b = reconcile(a.next, { resources: { wounds: 5 } }, a.recorded);
        expect(b.next.wounds).toBe(15);
    });
});

describe('origin-grant-ledger: the builder reconcile after its absolute writes', () => {
    const grantMods: OriginModifierBag = { characteristics: { weaponSkill: 5 }, resources: { wounds: 2, corruption: 10 } };

    it('treats the baked-in characteristics as applied and adds the resource modifiers on top of the rolled Wounds', () => {
        // The builder wrote base WS 20 + roll + 5, and Wounds = the rolled 9.
        const afterAbsoluteWrite = {
            wounds: { max: 9, value: 9 },
            fate: { max: 3, value: 3 },
            corruption: 0,
            characteristics: { weaponSkill: { base: 60, advance: 0 } },
        };
        const delta = deltaFromModifiers(grantMods);
        const prior = priorAfterBuilderWrites({}, delta, new Set<OriginResource>(['wounds', 'fate']));
        const { updates, newDelta } = reconcileResourceDeltas(afterAbsoluteWrite, originContribution(delta), prior, BUILDER_ORIGIN_RESOURCE_PATHS);
        // A new character starts at full Wounds: max and value both move.
        expect(updates).toEqual({ 'system.wounds.max': 11, 'system.wounds.value': 11, 'system.corruption': 10 });
        expect(newDelta).toEqual({ characteristics: { weaponSkill: 5 }, wounds: 2, fate: 0, corruption: 10, insanity: 0 });
    });

    it('a re-commit re-rolls Wounds from scratch but never stacks Corruption it already added', () => {
        const recorded: OriginAppliedDelta = { characteristics: { weaponSkill: 5 }, wounds: 2, fate: 0, corruption: 10, insanity: 0 };
        const afterRecommit = {
            wounds: { max: 8, value: 8 },
            fate: { max: 3, value: 3 },
            corruption: 10,
            characteristics: { weaponSkill: { base: 55, advance: 0 } },
        };
        const delta = deltaFromModifiers(grantMods);
        const prior = priorAfterBuilderWrites(recorded, delta, new Set<OriginResource>(['wounds']));
        const { updates } = reconcileResourceDeltas(afterRecommit, originContribution(delta), prior, BUILDER_ORIGIN_RESOURCE_PATHS);
        expect(updates).toEqual({ 'system.wounds.max': 10, 'system.wounds.value': 10 });
    });

    it('records exactly the delta the next boot reconcile derives, so that reconcile changes nothing', () => {
        const state: ResourceState = { wounds: 11, fate: 3, corruption: 10, characteristics: { weaponSkill: 60 } };
        const delta = deltaFromModifiers(grantMods);
        const { newDelta } = reconcileResourceDeltas(
            { ...toSystem(state), wounds: { max: 9, value: 9 }, corruption: 0 },
            originContribution(delta),
            priorAfterBuilderWrites({}, delta, new Set<OriginResource>(['wounds'])),
            BUILDER_ORIGIN_RESOURCE_PATHS,
        );
        expect(reconcile(state, grantMods, newDelta).next).toEqual(state);
    });
});

describe('origin-grant-ledger: reconcileResourceDeltas path-map parameterization', () => {
    /**
     * A resource-grant applier reconciles five resources and writes both
     * `value` and `max` for wounds/fate — its resource→path map differs from the
     * boot reconcile's. These pin that the shared helper honours an arbitrary map
     * without collapsing the per-applier divergence (the load-bearing point of
     * parameterizing it). Corruption / Insanity are plain numbers on the
     * character schema, so their path has no `.value`.
     */
    const PROCESSOR_PATHS = {
        wounds: ['wounds.value', 'wounds.max'],
        fate: ['fate.value', 'fate.max'],
        corruption: ['corruption'],
        insanity: ['insanity'],
    } as const;

    it("fans a resource's single prior across all its configured sub-paths", () => {
        const system = {
            wounds: { value: 10, max: 10 },
            fate: { value: 3, max: 3 },
            corruption: 0,
            insanity: 0,
            characteristics: {},
        };
        const { updates, newDelta } = reconcileResourceDeltas(system, { characteristics: {}, resources: { wounds: 4 } }, {}, PROCESSOR_PATHS);
        expect(updates['system.wounds.value']).toBe(14);
        expect(updates['system.wounds.max']).toBe(14);
        expect(newDelta.wounds).toBe(4);
        // A zero contribution against a zero prior writes nothing but is still recorded.
        expect(updates['system.fate.value']).toBeUndefined();
        expect(newDelta.fate).toBe(0);
        expect(newDelta.corruption).toBe(0);
        expect(newDelta.insanity).toBe(0);
    });

    it('reverses each resource against its own prior delta (no cross-talk between resources)', () => {
        const system = {
            wounds: { value: 14, max: 14 },
            fate: { value: 5, max: 5 },
            corruption: 3,
            insanity: 1,
            characteristics: {},
        };
        const prior: OriginAppliedDelta = { wounds: 4, fate: 2, corruption: 3, insanity: 1 };
        const { updates } = reconcileResourceDeltas(
            system,
            { characteristics: {}, resources: { wounds: 1, fate: 0, corruption: 0, insanity: 0 } },
            prior,
            PROCESSOR_PATHS,
        );
        // wounds re-bases 4→1 across both paths: 14 − 4 + 1 = 11.
        expect(updates['system.wounds.value']).toBe(11);
        expect(updates['system.wounds.max']).toBe(11);
        // The rest reverse to baseline independently.
        expect(updates['system.fate.value']).toBe(3);
        expect(updates['system.fate.max']).toBe(3);
        expect(updates['system.corruption']).toBe(0);
        expect(updates['system.insanity']).toBe(0);
    });

    it('skips characteristics the actor does not carry but still records them in the delta', () => {
        const system = { characteristics: { weaponSkill: { base: 30 } } };
        const { updates, newDelta } = reconcileResourceDeltas(system, { characteristics: { weaponSkill: 5, ballisticSkill: 4 }, resources: {} }, {}, {});
        expect(updates['system.characteristics.weaponSkill.base']).toBe(35);
        // ballisticSkill is absent on the actor → nothing to write…
        expect(updates['system.characteristics.ballisticSkill.base']).toBeUndefined();
        // …but it is still recorded as a contributed delta (matching deltaFromModifiers).
        expect(newDelta.characteristics).toEqual({ weaponSkill: 5, ballisticSkill: 4 });
    });
});
