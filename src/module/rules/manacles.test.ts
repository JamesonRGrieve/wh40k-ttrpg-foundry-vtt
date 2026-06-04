import { describe, expect, it, vi } from 'vitest';
import { asBaseActor } from '../testing/actor-stub.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import { createConditionEffect } from './active-effects.ts';
import {
    MANACLES_BS_PENALTY,
    MANACLES_CONDITION_KEY,
    MANACLES_EFFECT_NAME,
    MANACLES_FLAG_KEY,
    MANACLES_FLAG_SCOPE,
    MANACLES_IDENTIFIER,
    MANACLES_WS_PENALTY,
    actorHasManaclesEquipped,
    actorIsManacled,
    applyManaclesCondition,
    effectIsManacled,
    findEquippedManacles,
    findManaclesEffect,
    isManaclesItem,
    isManaclesItemEquipped,
    liftManaclesCondition,
    syncManaclesConditionForActor,
} from './manacles.ts';

interface MockedConditionEffectOptions {
    flags?: Record<string, Record<string, boolean>>;
    origin?: string;
}

vi.mock('./active-effects.ts', () => ({
    createConditionEffect: vi.fn((_actor: object | null, condition: string, options: MockedConditionEffectOptions) => ({
        id: `ae-${condition}`,
        name: 'Manacled',
        flags: options.flags,
        origin: options.origin,
    })),
}));

/* -------------------------------------------- */
/*  Constants (errata p. 176)                   */
/* -------------------------------------------- */

describe('Manacles constants (errata p. 176)', () => {
    it('applies −40 to BS and WS while the restraints are worn', () => {
        expect(MANACLES_BS_PENALTY).toBe(-40);
        expect(MANACLES_WS_PENALTY).toBe(-40);
    });

    it('uses the manacled key from the active-effects condition registry', () => {
        expect(MANACLES_CONDITION_KEY).toBe('manacled');
        expect(MANACLES_EFFECT_NAME).toBe('Manacled');
    });

    it('identifies the canonical manacles gear by its compendium slug', () => {
        expect(MANACLES_IDENTIFIER).toBe('manacles');
    });
});

/* -------------------------------------------- */
/*  Item detection                              */
/* -------------------------------------------- */

describe('isManaclesItem', () => {
    it('matches a gear item with identifier=manacles', () => {
        expect(isManaclesItem({ type: 'gear', name: 'Restraints', system: { identifier: 'manacles' } })).toBe(true);
    });

    it('matches a gear item by name substring fallback when identifier is missing', () => {
        expect(isManaclesItem({ type: 'gear', name: 'Iron Manacles', system: { identifier: '' } })).toBe(true);
        expect(isManaclesItem({ type: 'gear', name: 'manacle set' })).toBe(true);
    });

    it('rejects non-gear items even when the name matches', () => {
        expect(isManaclesItem({ type: 'weapon', name: 'Manacle Flail', system: { identifier: 'manacles' } })).toBe(false);
    });

    it('rejects unrelated gear', () => {
        expect(isManaclesItem({ type: 'gear', name: 'Rope', system: { identifier: 'rope' } })).toBe(false);
    });

    it('rejects null / undefined safely', () => {
        expect(isManaclesItem(null)).toBe(false);
        expect(isManaclesItem(undefined)).toBe(false);
    });
});

interface ManaclesItemSystem {
    identifier?: string;
    equipped?: boolean;
    inBackpack?: boolean;
    inShipStorage?: boolean;
}

interface ManaclesItemShape {
    type: string;
    name: string;
    system: {
        identifier?: string;
        state?: {
            equipped?: boolean;
            inBackpack?: boolean;
            inShipStorage?: boolean;
        };
    };
}

describe('isManaclesItemEquipped', () => {
    const make = (overrides: ManaclesItemSystem): ManaclesItemShape => {
        const { identifier, ...stateOverrides } = overrides;
        return {
            type: 'gear',
            name: 'Manacles',
            system: {
                identifier: identifier ?? 'manacles',
                state: { equipped: true, inBackpack: false, inShipStorage: false, ...stateOverrides },
            },
        };
    };

    it('is true when equipped and carried', () => {
        expect(isManaclesItemEquipped(make({}))).toBe(true);
    });

    it('is false when equipped=false', () => {
        expect(isManaclesItemEquipped(make({ equipped: false }))).toBe(false);
    });

    it('is false when stowed in backpack', () => {
        expect(isManaclesItemEquipped(make({ inBackpack: true }))).toBe(false);
    });

    it('is false when stowed in ship storage', () => {
        expect(isManaclesItemEquipped(make({ inShipStorage: true }))).toBe(false);
    });
});

/* -------------------------------------------- */
/*  Actor introspection                         */
/* -------------------------------------------- */

interface FakeEffect {
    id: string;
    name: string;
    flags?: Record<string, Record<string, boolean>>;
    getFlag?: (scope: string, key: string) => boolean;
}

interface FakeActor {
    items: Iterable<ManaclesItemShape>;
    effects: Iterable<FakeEffect>;
    deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<void>;
}

type DeleteEmbeddedDocumentsFn = (type: string, ids: string[]) => Promise<void>;

function makeActor(
    items: ManaclesItemShape[],
    effects: FakeEffect[] = [],
    deleteEmbeddedDocuments: DeleteEmbeddedDocumentsFn = vi.fn(async (_type: string, _ids: string[]) => Promise.resolve()),
): WH40KBaseActorDocument {
    const actor: FakeActor = { items, effects, deleteEmbeddedDocuments };
    return asBaseActor(actor);
}

describe('findEquippedManacles / actorHasManaclesEquipped', () => {
    it('returns the first equipped manacle item', () => {
        const equipped = { type: 'gear', name: 'Manacles', system: { identifier: 'manacles', state: { equipped: true } } };
        const stowed = { type: 'gear', name: 'Manacles', system: { identifier: 'manacles', state: { equipped: false } } };
        const actor = makeActor([stowed, equipped]);
        expect(findEquippedManacles(actor)).toBe(equipped);
        expect(actorHasManaclesEquipped(actor)).toBe(true);
    });

    it('returns null when no manacles are equipped', () => {
        const actor = makeActor([{ type: 'gear', name: 'Rope', system: { identifier: 'rope', state: { equipped: true } } }]);
        expect(findEquippedManacles(actor)).toBeNull();
        expect(actorHasManaclesEquipped(actor)).toBe(false);
    });

    it('returns null on an actor with no items', () => {
        const actor = makeActor([]);
        expect(actorHasManaclesEquipped(actor)).toBe(false);
    });
});

describe('effectIsManacled / findManaclesEffect / actorIsManacled', () => {
    it('matches by the wh40k-rpg.manacles flag', () => {
        const effect: FakeEffect = { id: 'a', name: 'Whatever', flags: { [MANACLES_FLAG_SCOPE]: { [MANACLES_FLAG_KEY]: true } } };
        expect(effectIsManacled(effect)).toBe(true);
    });

    it('matches by the getFlag accessor when present', () => {
        const effect: FakeEffect = { id: 'a', name: 'Whatever', getFlag: (s, k) => s === MANACLES_FLAG_SCOPE && k === MANACLES_FLAG_KEY };
        expect(effectIsManacled(effect)).toBe(true);
    });

    it('falls back to matching by AE name', () => {
        expect(effectIsManacled({ id: 'a', name: MANACLES_EFFECT_NAME })).toBe(true);
    });

    it('does not match unrelated AEs', () => {
        expect(effectIsManacled({ id: 'a', name: 'Blessed' })).toBe(false);
        expect(effectIsManacled(null)).toBe(false);
        expect(effectIsManacled(undefined)).toBe(false);
    });

    it('finds the AE on an actor and exposes actorIsManacled', () => {
        const ae: FakeEffect = { id: 'ae-manacled', name: MANACLES_EFFECT_NAME };
        const actor = makeActor([], [ae]);
        expect(findManaclesEffect(actor)).toBe(ae);
        expect(actorIsManacled(actor)).toBe(true);
    });
});

/* -------------------------------------------- */
/*  Apply / Lift                                */
/* -------------------------------------------- */

describe('applyManaclesCondition', () => {
    it('creates a Manacled AE flagged with wh40k-rpg.manacles=true', async () => {
        const actor = makeActor([], []);
        const result = await applyManaclesCondition(actor, { origin: 'Item.abc' });
        expect(createConditionEffect).toHaveBeenCalledWith(
            actor,
            MANACLES_CONDITION_KEY,
            expect.objectContaining({
                origin: 'Item.abc',
                flags: { [MANACLES_FLAG_SCOPE]: { [MANACLES_FLAG_KEY]: true } },
            }),
        );
        expect(result).not.toBeNull();
        expect(result?.name).toBe(MANACLES_EFFECT_NAME);
    });

    it('is idempotent: returns the existing AE without re-creating it', async () => {
        const existing: FakeEffect = { id: 'ae-existing', name: MANACLES_EFFECT_NAME };
        const actor = makeActor([], [existing]);
        vi.mocked(createConditionEffect).mockClear();
        const result = await applyManaclesCondition(actor);
        expect(result).toBe(existing);
        expect(createConditionEffect).not.toHaveBeenCalled();
    });
});

describe('liftManaclesCondition', () => {
    it('returns 0 and does not call delete when no Manacled AE is present', async () => {
        const actor = makeActor([], [{ id: 'x', name: 'Blessed' }]);
        const removed = await liftManaclesCondition(actor);
        expect(removed).toBe(0);
    });

    it('deletes all flagged Manacled AEs and returns the count', async () => {
        const a: FakeEffect = { id: 'a1', name: 'something', flags: { [MANACLES_FLAG_SCOPE]: { [MANACLES_FLAG_KEY]: true } } };
        const b: FakeEffect = { id: 'b2', name: MANACLES_EFFECT_NAME };
        const c: FakeEffect = { id: 'c3', name: 'Blessed' };
        const deleted = vi.fn(async (_type: string, _ids: string[]) => Promise.resolve());
        const actor = makeActor([], [a, b, c], deleted);
        const removed = await liftManaclesCondition(actor);
        expect(removed).toBe(2);
        expect(deleted).toHaveBeenCalledWith('ActiveEffect', ['a1', 'b2']);
    });
});

describe('syncManaclesConditionForActor', () => {
    it('applies the AE when manacles are equipped and none is present', async () => {
        vi.mocked(createConditionEffect).mockClear();
        const actor = makeActor([{ type: 'gear', name: 'Manacles', system: { identifier: 'manacles', state: { equipped: true } } }], []);
        await syncManaclesConditionForActor(actor, 'Item.uuid');
        expect(createConditionEffect).toHaveBeenCalledTimes(1);
    });

    it('lifts the AE when no manacles are equipped but the AE is present', async () => {
        vi.mocked(createConditionEffect).mockClear();
        const deleted = vi.fn(async (_type: string, _ids: string[]) => Promise.resolve());
        const actor = makeActor(
            [{ type: 'gear', name: 'Manacles', system: { identifier: 'manacles', state: { equipped: false } } }],
            [{ id: 'm', name: MANACLES_EFFECT_NAME }],
            deleted,
        );
        await syncManaclesConditionForActor(actor);
        expect(deleted).toHaveBeenCalledWith('ActiveEffect', ['m']);
        expect(createConditionEffect).not.toHaveBeenCalled();
    });

    it('is a no-op when equipped state and AE presence already agree', async () => {
        vi.mocked(createConditionEffect).mockClear();
        const deleted = vi.fn(async (_type: string, _ids: string[]) => Promise.resolve());
        const actor = makeActor(
            [{ type: 'gear', name: 'Manacles', system: { identifier: 'manacles', state: { equipped: true } } }],
            [{ id: 'm', name: MANACLES_EFFECT_NAME }],
            deleted,
        );
        await syncManaclesConditionForActor(actor);
        expect(createConditionEffect).not.toHaveBeenCalled();
        expect(deleted).not.toHaveBeenCalled();
    });
});
