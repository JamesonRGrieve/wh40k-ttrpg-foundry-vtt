/**
 * Unit tests for the Only War Craftsmanship panel context builder (#158).
 *
 * `buildOwCraftsmanshipPanel` is a pure, foundry-free function: it walks an
 * actor's owned items, keeps equipped weapons / armour, resolves each through
 * the OW craftsmanship engine, and packs a panel hash. No RNG, no I/O, no
 * DataModel — fully unit-testable.
 */
import { describe, expect, it } from 'vitest';
import { getArmourCraftsmanshipEffect, getMeleeCraftsmanshipEffect, getRangedCraftsmanshipEffect } from '../../../rules/ow-craftsmanship.ts';
import { buildOwCraftsmanshipPanel, owCraftsmanshipSchemaFields } from './ow-craftsmanship-template.ts';

/** Minimal owned-item fixture shape accepted by `buildOwCraftsmanshipPanel`. */
interface ItemFixture {
    type: string;
    id: string;
    name: string | null;
    system: { state?: { equipped?: boolean }; class?: string | undefined; melee?: boolean | undefined; craftsmanship?: string | undefined };
}

/**
 * Return the first element of a non-empty array, narrowed to `T`. Keeps the
 * per-assertion access free of `!` non-null assertions.
 */
function first<T>(arr: readonly T[]): T {
    const head = arr[0];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) types arr[0] as T, tsconfig.json (flag on) types it T | undefined and requires this guard
    if (head === undefined) throw new Error('first(): expected a non-empty array');
    return head;
}

function weapon(opts: { id?: string; name?: string | null; equipped?: boolean; cls?: string; melee?: boolean; craftsmanship?: string }): ItemFixture {
    return {
        type: 'weapon',
        id: opts.id ?? 'w1',
        name: opts.name === undefined ? 'Lasgun' : opts.name,
        system: {
            state: { equipped: opts.equipped ?? true },
            class: opts.cls,
            melee: opts.melee,
            craftsmanship: opts.craftsmanship,
        },
    };
}

function armour(opts: { id?: string; name?: string; equipped?: boolean; craftsmanship?: string }): ItemFixture {
    return {
        type: 'armour',
        id: opts.id ?? 'a1',
        name: opts.name ?? 'Flak Armour',
        system: {
            state: { equipped: opts.equipped ?? true },
            craftsmanship: opts.craftsmanship,
        },
    };
}

describe('owCraftsmanshipSchemaFields', () => {
    it('exports no actor-level schema fields (engine is passive)', () => {
        expect(owCraftsmanshipSchemaFields()).toEqual({});
    });
});

describe('buildOwCraftsmanshipPanel', () => {
    it('returns an empty panel for no items', () => {
        expect(buildOwCraftsmanshipPanel([])).toEqual({ weapons: [], armours: [], hasEntries: false });
    });

    it('classifies an equipped basic weapon as ranged with the engine effect', () => {
        const panel = buildOwCraftsmanshipPanel([weapon({ id: 'w-las', name: 'Lasgun', cls: 'basic', craftsmanship: 'good' })]);
        expect(panel.weapons).toHaveLength(1);
        const entry = first(panel.weapons);
        expect(entry).toMatchObject({ kind: 'ranged', itemId: 'w-las', name: 'Lasgun', tier: 'good' });
        expect(entry.effect).toEqual(getRangedCraftsmanshipEffect('good'));
        expect(panel.hasEntries).toBe(true);
    });

    it('classifies a melee weapon as melee', () => {
        const panel = buildOwCraftsmanshipPanel([weapon({ id: 'w-sword', name: 'Chainsword', melee: true, craftsmanship: 'best' })]);
        const entry = first(panel.weapons);
        expect(entry).toMatchObject({ kind: 'melee', tier: 'best' });
        expect(entry.effect).toEqual(getMeleeCraftsmanshipEffect('best'));
    });

    it('skips unequipped items', () => {
        const panel = buildOwCraftsmanshipPanel([weapon({ equipped: false, cls: 'basic' }), armour({ equipped: false })]);
        expect(panel).toEqual({ weapons: [], armours: [], hasEntries: false });
    });

    it('skips weapons whose class does not classify', () => {
        const panel = buildOwCraftsmanshipPanel([weapon({ cls: 'mysterious-homebrew' })]);
        expect(panel.weapons).toHaveLength(0);
    });

    it('coerces an unknown craftsmanship tier to common', () => {
        const panel = buildOwCraftsmanshipPanel([weapon({ cls: 'pistol', craftsmanship: 'legendary' })]);
        const entry = first(panel.weapons);
        expect(entry.tier).toBe('common');
        expect(entry.effect).toEqual(getRangedCraftsmanshipEffect('common'));
    });

    it('defaults a missing craftsmanship to common', () => {
        const panel = buildOwCraftsmanshipPanel([armour({})]);
        const entry = first(panel.armours);
        expect(entry.tier).toBe('common');
        expect(entry.effect).toEqual(getArmourCraftsmanshipEffect('common'));
    });

    it('falls back to the item id when the name is empty', () => {
        const panel = buildOwCraftsmanshipPanel([weapon({ id: 'w-noname', name: '', cls: 'heavy' })]);
        expect(first(panel.weapons).name).toBe('w-noname');
    });

    it('packs weapons and armour together and sets hasEntries', () => {
        const panel = buildOwCraftsmanshipPanel([weapon({ id: 'w', cls: 'basic', craftsmanship: 'poor' }), armour({ id: 'a', craftsmanship: 'good' })]);
        expect(panel.weapons).toHaveLength(1);
        expect(panel.armours).toHaveLength(1);
        expect(panel.hasEntries).toBe(true);
    });

    it('ignores items that are neither weapon nor armour', () => {
        const panel = buildOwCraftsmanshipPanel([{ type: 'gear', id: 'g', name: 'Rations', system: {} }]);
        expect(panel).toEqual({ weapons: [], armours: [], hasEntries: false });
    });
});
