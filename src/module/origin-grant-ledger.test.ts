import { describe, expect, it } from 'vitest';
import { SYSTEM_ID } from './constants.ts';
import {
    ORIGIN_GRANT_DELTAS_FLAG,
    type OriginAppliedDelta,
    deltaFromModifiers,
    type OriginIdentityItemLike,
    type OriginModifierBag,
    originDeltaFlagPath,
    originIdentityKey,
    readOriginDelta,
    reconcileResourceDeltas,
} from './origin-grant-ledger.ts';

/**
 * The origin-grant ledger is the single source of truth shared by the two
 * grant-application mechanisms — the origin-path builder's `#commit` (absolute
 * resource writes + ledger stamp) and the boot-time reconcile pass
 * (`WH40KItem.applyOriginToActor`, delta-tracked). Both derive the same
 * identity key and the same canonical delta from an origin's modifier bag, so
 * applying the same selections N times converges to the result of applying them
 * once. These unit tests pin that convergence at the primitive level (the
 * builder/reconcile DataModels do not load under happy-dom).
 */
describe('origin-grant-ledger: deltaFromModifiers', () => {
    it('reduces a modifier bag to the canonical delta both mechanisms record', () => {
        const modifiers: OriginModifierBag = {
            characteristics: { weaponSkill: 5, toughness: 3 },
            wounds: 2,
            fate: 1,
        };
        expect(deltaFromModifiers(modifiers)).toEqual({
            characteristics: { weaponSkill: 5, toughness: 3 },
            wounds: 2,
            fate: 1,
        });
    });

    it('drops zero-valued characteristic entries (matching applyOriginToActor)', () => {
        const modifiers: OriginModifierBag = {
            characteristics: { weaponSkill: 5, ballisticSkill: 0 },
            wounds: 0,
            fate: 0,
        };
        const delta = deltaFromModifiers(modifiers);
        expect(delta.characteristics).toEqual({ weaponSkill: 5 });
        expect('ballisticSkill' in delta.characteristics).toBe(false);
        expect(delta.wounds).toBe(0);
        expect(delta.fate).toBe(0);
    });

    it('treats undefined / empty modifiers as a zero delta', () => {
        expect(deltaFromModifiers(undefined)).toEqual({ characteristics: {}, wounds: 0, fate: 0 });
        expect(deltaFromModifiers({})).toEqual({ characteristics: {}, wounds: 0, fate: 0 });
    });

    it('coerces sparse / undefined stored values rather than propagating NaN', () => {
        // Legacy / partially-authored origins may store undefined entries; the
        // applier compares the recorded delta to a freshly-derived one, so both
        // must coerce identically to a defined number.
        const modifiers: OriginModifierBag = { characteristics: { weaponSkill: 5, ballisticSkill: undefined }, wounds: undefined, fate: undefined };
        const delta = deltaFromModifiers(modifiers);
        expect(delta.characteristics).toEqual({ weaponSkill: 5 });
        expect(delta.wounds).toBe(0);
        expect(delta.fate).toBe(0);
    });

    it('is idempotent under repeated derivation (re-deriving never drifts)', () => {
        const modifiers: OriginModifierBag = { characteristics: { intelligence: 5 }, wounds: 8, fate: 2 };
        const first = deltaFromModifiers(modifiers);
        const second = deltaFromModifiers(modifiers);
        expect(second).toEqual(first);
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

describe('origin-grant-ledger: reconcileResourceDeltas convergence (idempotency property)', () => {
    /**
     * Drive the real shared helper with the boot reconcile's
     * (`WH40KItem.applyOriginToActor`) resource→path map: `wounds.max` /
     * `fate.total` only, contribution derived from `deltaFromModifiers`. We assert
     * the convergence invariant: once the ledger records an origin's delta,
     * re-applying it is a no-op.
     */
    const ITEM_PATHS = { wounds: ['wounds.max'], fate: ['fate.total'] } as const;

    interface ResourceState {
        wounds: number;
        fate: number;
        characteristics: Record<string, number>;
    }

    /** Build the `system` snapshot the helper reads (wounds.max / fate.total / characteristics.*.advance). */
    function toSystem(state: ResourceState): { wounds: { max: number }; fate: { total: number }; characteristics: Record<string, { advance: number }> } {
        const characteristics: Record<string, { advance: number }> = {};
        for (const [k, advance] of Object.entries(state.characteristics)) characteristics[k] = { advance };
        return { wounds: { max: state.wounds }, fate: { total: state.fate }, characteristics };
    }

    /** Apply the helper's `system.*` update bag back onto a state snapshot (the actor.update() Foundry does for real). */
    // eslint-disable-next-line no-restricted-syntax -- boundary: `updates` is the helper's actor.update() payload (ResourceReconcileResult.updates: Record<string, unknown>); this test replays it
    function applyUpdates(state: ResourceState, updates: Record<string, unknown>): ResourceState {
        const next: ResourceState = { wounds: state.wounds, fate: state.fate, characteristics: { ...state.characteristics } };
        if (typeof updates['system.wounds.max'] === 'number') next.wounds = updates['system.wounds.max'];
        if (typeof updates['system.fate.total'] === 'number') next.fate = updates['system.fate.total'];
        // Every characteristic in these convergence cases is pre-seeded on the state, so replaying by known key covers all writes.
        for (const key of Object.keys(next.characteristics)) {
            const value = updates[`system.characteristics.${key}.advance`];
            if (typeof value === 'number') next.characteristics[key] = value;
        }
        return next;
    }

    function reconcile(
        state: ResourceState,
        modifiers: OriginModifierBag,
        priorDelta: OriginAppliedDelta,
    ): { next: ResourceState; recorded: OriginAppliedDelta } {
        const md = deltaFromModifiers(modifiers);
        const { updates, newDelta } = reconcileResourceDeltas(
            toSystem(state),
            { characteristics: md.characteristics, resources: { wounds: md.wounds, fate: md.fate } },
            priorDelta,
            ITEM_PATHS,
        );
        return { next: applyUpdates(state, updates), recorded: newDelta };
    }

    const grantMods: OriginModifierBag = { characteristics: { weaponSkill: 5, toughness: 3 }, wounds: 2, fate: 1 };

    it('first apply (no prior delta) is purely additive', () => {
        const current = { wounds: 10, fate: 3, characteristics: { weaponSkill: 30, toughness: 30 } };
        const { next, recorded } = reconcile(current, grantMods, {});
        expect(next).toEqual({ wounds: 12, fate: 4, characteristics: { weaponSkill: 35, toughness: 33 } });
        expect(recorded).toEqual({ characteristics: { weaponSkill: 5, toughness: 3 }, wounds: 2, fate: 1 });
    });

    it('second apply with the recorded delta is a no-op (N applies == 1 apply)', () => {
        const start = { wounds: 10, fate: 3, characteristics: { weaponSkill: 30, toughness: 30 } };
        const first = reconcile(start, grantMods, {});
        // Re-apply using the delta the first apply recorded — this is what the
        // builder stamps and what the next reconcile reads back.
        const second = reconcile(first.next, grantMods, first.recorded);
        expect(second.next).toEqual(first.next);
        // And a third, for good measure.
        const third = reconcile(second.next, grantMods, second.recorded);
        expect(third.next).toEqual(first.next);
    });

    it('builder stamp makes the boot reconcile a no-op (prior === newDelta)', () => {
        // The builder writes resources absolutely, then stamps the ledger with
        // deltaFromModifiers(...). The next boot reconcile reads that delta back
        // as `priorDelta`, derives the identical `newDelta`, and must change
        // nothing — no double-counting on top of the absolute writes.
        const afterAbsoluteWrite = { wounds: 12, fate: 4, characteristics: { weaponSkill: 35, toughness: 33 } };
        const stamped = deltaFromModifiers(grantMods);
        const reconciled = reconcile(afterAbsoluteWrite, grantMods, stamped);
        expect(reconciled.next).toEqual(afterAbsoluteWrite);
    });

    it('changing selections re-bases off the recorded delta instead of stacking', () => {
        // Commit A grants +2 wounds; the player then re-commits with an origin
        // granting +5 wounds. The recorded prior (+2) is reversed before the new
        // (+5) lands, so the net is +5 over baseline, not +7.
        const baseline = { wounds: 10, fate: 3, characteristics: {} };
        const a = reconcile(baseline, { wounds: 2 }, {});
        expect(a.next.wounds).toBe(12);
        const b = reconcile(a.next, { wounds: 5 }, a.recorded);
        expect(b.next.wounds).toBe(15);
    });
});

describe('origin-grant-ledger: reconcileResourceDeltas path-map parameterization', () => {
    /**
     * `GrantsProcessor.applyGrants` reconciles five resources and writes both
     * `value` and `max` for wounds/fate — its resource→path map differs from the
     * boot reconcile's. These pin that the shared helper honours an arbitrary map
     * without collapsing the per-applier divergence (the load-bearing point of
     * parameterizing it).
     */
    const PROCESSOR_PATHS = {
        wounds: ['wounds.value', 'wounds.max'],
        fate: ['fate.value', 'fate.max'],
        fateThreshold: ['fate.threshold'],
        corruption: ['corruption.value'],
        insanity: ['insanity.value'],
    } as const;

    it("fans a resource's single prior across all its configured sub-paths", () => {
        const system = {
            wounds: { value: 10, max: 10 },
            fate: { value: 3, max: 3, threshold: 0 },
            corruption: { value: 0 },
            insanity: { value: 0 },
            characteristics: {},
        };
        const { updates, newDelta } = reconcileResourceDeltas(system, { characteristics: {}, resources: { wounds: 4 } }, {}, PROCESSOR_PATHS);
        expect(updates['system.wounds.value']).toBe(14);
        expect(updates['system.wounds.max']).toBe(14);
        expect(newDelta.wounds).toBe(4);
        // A zero contribution against a zero prior writes nothing but is still recorded.
        expect(updates['system.fate.value']).toBeUndefined();
        expect(newDelta.fate).toBe(0);
        expect(newDelta.fateThreshold).toBe(0);
        expect(newDelta.corruption).toBe(0);
        expect(newDelta.insanity).toBe(0);
    });

    it('reverses each resource against its own prior delta (no cross-talk between resources)', () => {
        const system = {
            wounds: { value: 14, max: 14 },
            fate: { value: 5, max: 5, threshold: 2 },
            corruption: { value: 3 },
            insanity: { value: 1 },
            characteristics: {},
        };
        const prior: OriginAppliedDelta = { wounds: 4, fate: 2, fateThreshold: 2, corruption: 3, insanity: 1 };
        const { updates } = reconcileResourceDeltas(
            system,
            { characteristics: {}, resources: { wounds: 1, fate: 0, fateThreshold: 0, corruption: 0, insanity: 0 } },
            prior,
            PROCESSOR_PATHS,
        );
        // wounds re-bases 4→1 across both paths: 14 − 4 + 1 = 11.
        expect(updates['system.wounds.value']).toBe(11);
        expect(updates['system.wounds.max']).toBe(11);
        // The rest reverse to baseline independently.
        expect(updates['system.fate.value']).toBe(3);
        expect(updates['system.fate.max']).toBe(3);
        expect(updates['system.fate.threshold']).toBe(0);
        expect(updates['system.corruption.value']).toBe(0);
        expect(updates['system.insanity.value']).toBe(0);
    });

    it('skips characteristics the actor does not carry but still records them in the delta', () => {
        const system = { characteristics: { weaponSkill: { advance: 30 } } };
        const { updates, newDelta } = reconcileResourceDeltas(system, { characteristics: { weaponSkill: 5, ballisticSkill: 4 }, resources: {} }, {}, {});
        expect(updates['system.characteristics.weaponSkill.advance']).toBe(35);
        // ballisticSkill is absent on the actor → no advance slot to write…
        expect(updates['system.characteristics.ballisticSkill.advance']).toBeUndefined();
        // …but it is still recorded as a contributed delta (matching deltaFromModifiers).
        expect(newDelta.characteristics).toEqual({ weaponSkill: 5, ballisticSkill: 4 });
    });
});
