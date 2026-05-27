import { describe, expect, it } from 'vitest';
import { SYSTEM_ID } from './constants.ts';
import {
    ORIGIN_GRANT_DELTAS_FLAG,
    deltaFromModifiers,
    type OriginIdentityItemLike,
    type OriginModifierBag,
    originDeltaFlagPath,
    originIdentityKey,
    readOriginDelta,
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

describe('origin-grant-ledger: reconcile convergence (idempotency property)', () => {
    /**
     * Mirror of the resource-reconciliation math in `WH40KItem.applyOriginToActor`:
     * reverse the prior recorded delta, add the freshly-derived one. This is the
     * exact arithmetic the boot reconcile runs against the actor's current
     * resource values. We assert the convergence invariant: once the ledger
     * records an origin's delta, re-applying it is a no-op.
     */
    function reconcileResources(
        current: { wounds: number; fate: number; characteristics: Record<string, number> },
        modifiers: OriginModifierBag,
        priorDelta: { wounds?: number; fate?: number; characteristics?: Record<string, number> },
    ): { next: { wounds: number; fate: number; characteristics: Record<string, number> }; recorded: ReturnType<typeof deltaFromModifiers> } {
        const newDelta = deltaFromModifiers(modifiers);
        const next = {
            wounds: current.wounds,
            fate: current.fate,
            characteristics: { ...current.characteristics },
        };

        const priorWounds = Number(priorDelta.wounds ?? 0);
        if (newDelta.wounds !== priorWounds) next.wounds = current.wounds - priorWounds + newDelta.wounds;

        const priorFate = Number(priorDelta.fate ?? 0);
        if (newDelta.fate !== priorFate) next.fate = current.fate - priorFate + newDelta.fate;

        const priorChars = priorDelta.characteristics ?? {};
        const charKeys = new Set<string>([...Object.keys(newDelta.characteristics), ...Object.keys(priorChars)]);
        for (const k of charKeys) {
            const value = Number(newDelta.characteristics[k] ?? 0);
            const prior = Number(priorChars[k] ?? 0);
            if (value === prior) continue;
            next.characteristics[k] = (current.characteristics[k] ?? 0) - prior + value;
        }

        return { next, recorded: newDelta };
    }

    const grantMods: OriginModifierBag = { characteristics: { weaponSkill: 5, toughness: 3 }, wounds: 2, fate: 1 };

    it('first apply (no prior delta) is purely additive', () => {
        const current = { wounds: 10, fate: 3, characteristics: { weaponSkill: 30, toughness: 30 } };
        const { next, recorded } = reconcileResources(current, grantMods, {});
        expect(next).toEqual({ wounds: 12, fate: 4, characteristics: { weaponSkill: 35, toughness: 33 } });
        expect(recorded).toEqual({ characteristics: { weaponSkill: 5, toughness: 3 }, wounds: 2, fate: 1 });
    });

    it('second apply with the recorded delta is a no-op (N applies == 1 apply)', () => {
        const start = { wounds: 10, fate: 3, characteristics: { weaponSkill: 30, toughness: 30 } };
        const first = reconcileResources(start, grantMods, {});
        // Re-apply using the delta the first apply recorded — this is what the
        // builder stamps and what the next reconcile reads back.
        const second = reconcileResources(first.next, grantMods, first.recorded);
        expect(second.next).toEqual(first.next);
        // And a third, for good measure.
        const third = reconcileResources(second.next, grantMods, second.recorded);
        expect(third.next).toEqual(first.next);
    });

    it('builder stamp makes the boot reconcile a no-op (prior === newDelta)', () => {
        // The builder writes resources absolutely, then stamps the ledger with
        // deltaFromModifiers(...). The next boot reconcile reads that delta back
        // as `priorDelta`, derives the identical `newDelta`, and must change
        // nothing — no double-counting on top of the absolute writes.
        const afterAbsoluteWrite = { wounds: 12, fate: 4, characteristics: { weaponSkill: 35, toughness: 33 } };
        const stamped = deltaFromModifiers(grantMods);
        const reconciled = reconcileResources(afterAbsoluteWrite, grantMods, stamped);
        expect(reconciled.next).toEqual(afterAbsoluteWrite);
    });

    it('changing selections re-bases off the recorded delta instead of stacking', () => {
        // Commit A grants +2 wounds; the player then re-commits with an origin
        // granting +5 wounds. The recorded prior (+2) is reversed before the new
        // (+5) lands, so the net is +5 over baseline, not +7.
        const baseline = { wounds: 10, fate: 3, characteristics: {} };
        const a = reconcileResources(baseline, { wounds: 2 }, {});
        expect(a.next.wounds).toBe(12);
        const b = reconcileResources(a.next, { wounds: 5 }, a.recorded);
        expect(b.next.wounds).toBe(15);
    });
});
