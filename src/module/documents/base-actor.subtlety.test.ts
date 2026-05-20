import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectedAdjuster } from '../rules/subtlety-adjusters.ts';
import type { WH40KBaseActor } from './base-actor.ts';

/**
 * Unit coverage for the DH2 Warband Subtlety surface on `WH40KBaseActor`
 * (issue #64, refreshed acceptance criteria — "test covering the sheet read
 * path" + "hook for #87 adjusters to write deltas through").
 *
 * The DH2 character sheet (`subtlety-panel.hbs`) reads `system.subtlety` and
 * the `subtletyAdjusters[]` context the sheet derives from
 * `actor.collectSubtletyAdjusters()`, and writes deltas through
 * `actor.applySubtlety(±N, source)` / `actor.applySubtletyFromSource(uuid)`.
 * Those four methods are the integration seam the reopened issue calls out as
 * untested ("completion theater" — helper exists but not exercised). The pure
 * normalizers (`clampSubtletyLoss`, `subtletyAdjusterEffectOf`,
 * `isSubtletyPrimitive`) already have co-located tests; this suite covers the
 * Document-layer wiring that joins them to `this.system` / `this.items` /
 * `this.update`, using the same `Object.create(prototype)` fake-actor pattern
 * as `base-actor.test.ts` (no Foundry runtime required).
 */

type BaseActorModule = typeof import('./base-actor.ts');

async function loadModule(): Promise<BaseActorModule | undefined> {
    return import('./base-actor.ts').catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`WH40KBaseActor could not be imported in this environment: ${msg}`);
        return undefined;
    });
}

interface SubtletySlot {
    value: number;
    max: number;
}

interface FakeItem {
    name: string;
    system: { subtletyAdjuster?: unknown; equipped?: boolean };
    _stats?: { compendiumSource?: string | null };
}

/**
 * Build a `WH40KBaseActor`-shaped fake whose `system.subtlety`, owned `items`,
 * and `update` are all in-memory. `update` mutates the in-memory slot so a
 * follow-up read observes the clamped result, exactly like a live document.
 */
function makeActor(
    Ctor: BaseActorModule['WH40KBaseActor'],
    opts: { subtlety?: SubtletySlot; items?: FakeItem[] } = {},
): {
    actor: WH40KBaseActor;
    updates: Array<Record<string, unknown>>;
    slot: SubtletySlot | undefined;
} {
    const actor = Object.create(Ctor.prototype) as WH40KBaseActor;
    const slot = opts.subtlety;
    const updates: Array<Record<string, unknown>> = [];
    Object.defineProperty(actor, 'system', {
        value: slot ? { subtlety: slot } : {},
        writable: true,
        configurable: true,
    });
    Object.defineProperty(actor, 'items', {
        value: opts.items ?? [],
        writable: true,
        configurable: true,
    });
    Object.defineProperty(actor, 'update', {
        value: async (data: Record<string, unknown>) => {
            updates.push(data);
            const next = data['system.subtlety.value'];
            if (slot && typeof next === 'number') slot.value = next;
            return Promise.resolve(actor);
        },
        writable: true,
        configurable: true,
    });
    return { actor, updates, slot };
}

function adjusterItem(
    name: string,
    raw: { kind: 'none' | 'clamp' | 'passive' | 'event'; delta: number; minAbsoluteDelta: number; requiresEquipped: boolean },
    extra: { equipped?: boolean; compendiumSource?: string | null } = {},
): FakeItem {
    const item: FakeItem = {
        name,
        system: { subtletyAdjuster: raw },
    };
    if (extra.equipped !== undefined) item.system.equipped = extra.equipped;
    if (extra.compendiumSource !== undefined) item._stats = { compendiumSource: extra.compendiumSource };
    return item;
}

describe('WH40KBaseActor — Subtlety surface (DH2 sheet read/write path)', () => {
    describe('applySubtlety', () => {
        it('lowers the pool by a negative delta and writes through update', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor, updates, slot } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 60, max: 100 } });
            await actor.applySubtlety(-7, 'manual');
            expect(slot?.value).toBe(53);
            expect(updates[0]?.['system.subtlety.value']).toBe(53);
        });

        it('attributes the source via the lastSubtletySource flag', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor, updates } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 60, max: 100 } });
            await actor.applySubtlety(-3, 'inquest');
            expect(updates[0]?.['flags.wh40k-rpg.lastSubtletySource']).toBe('inquest');
        });

        it('omits the source flag when no attribution is supplied', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor, updates } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 60, max: 100 } });
            await actor.applySubtlety(-5);
            expect(updates[0]).not.toHaveProperty('flags.wh40k-rpg.lastSubtletySource');
        });

        it('clamps at the 0 floor (never negative)', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor, slot } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 4, max: 100 } });
            await actor.applySubtlety(-50, 'manual');
            expect(slot?.value).toBe(0);
        });

        it('clamps at the max ceiling on gains', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor, slot } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 95, max: 100 } });
            await actor.applySubtlety(20, 'manual');
            expect(slot?.value).toBe(100);
        });

        it('truncates a fractional amount before applying', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor, slot } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 60, max: 100 } });
            await actor.applySubtlety(-2.9, 'manual');
            expect(slot?.value).toBe(58);
        });

        it('no-ops on a zero / non-finite amount (no update issued)', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor, updates } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 60, max: 100 } });
            await actor.applySubtlety(0, 'manual');
            await actor.applySubtlety(Number.NaN, 'manual');
            expect(updates).toHaveLength(0);
        });

        it('no-ops when the actor carries no subtlety slot (non-DH2 systems)', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            // No `subtlety` on system — mirrors a BC/DH1/DW/OW/RT/IM character
            // whose schema does not carry the DH2-only pool.
            const { actor, updates } = makeActor(mod.WH40KBaseActor, {});
            await actor.applySubtlety(-7, 'manual');
            expect(updates).toHaveLength(0);
        });

        it('applies a carried clamp adjuster to losses (Quarantine World floors -5 to -1)', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor, slot } = makeActor(mod.WH40KBaseActor, {
                subtlety: { value: 60, max: 100 },
                items: [adjusterItem('Quarantine World', { kind: 'clamp', delta: 0, minAbsoluteDelta: 1, requiresEquipped: false })],
            });
            await actor.applySubtlety(-5, 'manual');
            expect(slot?.value).toBe(59);
        });

        it('does not clamp gains even with a clamp adjuster present', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor, slot } = makeActor(mod.WH40KBaseActor, {
                subtlety: { value: 60, max: 100 },
                items: [adjusterItem('Quarantine World', { kind: 'clamp', delta: 0, minAbsoluteDelta: 1, requiresEquipped: false })],
            });
            await actor.applySubtlety(5, 'manual');
            expect(slot?.value).toBe(65);
        });
    });

    describe('collectSubtletyAdjusters (sheet `subtletyAdjusters` context source)', () => {
        it('returns an empty array when no owned item carries an adjuster', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor } = makeActor(mod.WH40KBaseActor, {
                items: [adjusterItem('Plain Talent', { kind: 'none', delta: 0, minAbsoluteDelta: 0, requiresEquipped: false })],
            });
            expect(actor.collectSubtletyAdjusters()).toEqual([]);
        });

        it('surfaces a passive adjuster with its delta + compendium source uuid + label', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const uuid = 'Compendium.wh40k-rpg.dh2-beyond-stats-talents.Item.abc123';
            const { actor } = makeActor(mod.WH40KBaseActor, {
                items: [
                    adjusterItem(
                        'Hunger for Knowledge',
                        { kind: 'passive', delta: -5, minAbsoluteDelta: 0, requiresEquipped: false },
                        { compendiumSource: uuid },
                    ),
                ],
            });
            const collected = actor.collectSubtletyAdjusters();
            expect(collected).toHaveLength(1);
            const row = collected[0];
            if (row === undefined) throw new Error('expected at least one collected adjuster row');
            expect(row.kind).toBe('passive');
            expect(row.delta).toBe(-5);
            expect(row.label).toBe('Hunger for Knowledge');
            expect(row.sourceUuid).toBe(uuid);
            expect(row.primitive).toBeNull();
        });

        it('drops a requiresEquipped passive while the carrier is unequipped', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor } = makeActor(mod.WH40KBaseActor, {
                items: [adjusterItem('Daemon Blade', { kind: 'passive', delta: -3, minAbsoluteDelta: 0, requiresEquipped: true }, { equipped: false })],
            });
            expect(actor.collectSubtletyAdjusters()).toEqual([]);
        });

        it('surfaces a requiresEquipped passive once the carrier is equipped', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor } = makeActor(mod.WH40KBaseActor, {
                items: [adjusterItem('Daemon Blade', { kind: 'passive', delta: -3, minAbsoluteDelta: 0, requiresEquipped: true }, { equipped: true })],
            });
            const collected = actor.collectSubtletyAdjusters();
            expect(collected).toHaveLength(1);
            const row = collected[0];
            if (row === undefined) throw new Error('expected at least one collected adjuster row');
            expect(row.delta).toBe(-3);
        });

        it('reports a null source uuid for a non-compendium owned item', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor } = makeActor(mod.WH40KBaseActor, {
                items: [adjusterItem('Homebrew Talent', { kind: 'event', delta: -2, minAbsoluteDelta: 0, requiresEquipped: false })],
            });
            const row = actor.collectSubtletyAdjusters()[0];
            if (row === undefined) throw new Error('expected at least one collected adjuster row');
            expect(row.sourceUuid).toBeNull();
        });
    });

    describe('applySubtletyFromSource (#87 adjuster write hook)', () => {
        it('applies the event-kind delta read from the governing owned item', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const uuid = 'Compendium.wh40k-rpg.dh2-pacts.Item.pact1';
            const { actor, slot } = makeActor(mod.WH40KBaseActor, {
                subtlety: { value: 60, max: 100 },
                items: [
                    adjusterItem(
                        'Dark Pact discovered',
                        { kind: 'event', delta: -8, minAbsoluteDelta: 0, requiresEquipped: false },
                        { compendiumSource: uuid },
                    ),
                ],
            });
            await actor.applySubtletyFromSource(uuid);
            expect(slot?.value).toBe(52);
        });

        it('scales the event delta by the scale argument', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const uuid = 'Compendium.wh40k-rpg.dh2-pacts.Item.pact2';
            const { actor, slot } = makeActor(mod.WH40KBaseActor, {
                subtlety: { value: 60, max: 100 },
                items: [
                    adjusterItem(
                        'Dark Pact discovered',
                        { kind: 'event', delta: -4, minAbsoluteDelta: 0, requiresEquipped: false },
                        { compendiumSource: uuid },
                    ),
                ],
            });
            await actor.applySubtletyFromSource(uuid, 2);
            expect(slot?.value).toBe(52);
        });

        it('does NOT apply a passive adjuster as a one-shot (would double-count)', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const uuid = 'Compendium.wh40k-rpg.dh2-weapons.Item.daemon';
            const { actor, updates } = makeActor(mod.WH40KBaseActor, {
                subtlety: { value: 60, max: 100 },
                items: [
                    adjusterItem('Daemon Weapon', { kind: 'passive', delta: -3, minAbsoluteDelta: 0, requiresEquipped: false }, { compendiumSource: uuid }),
                ],
            });
            await actor.applySubtletyFromSource(uuid);
            expect(updates).toHaveLength(0);
        });

        it('no-ops for an unknown source uuid', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor, updates } = makeActor(mod.WH40KBaseActor, {
                subtlety: { value: 60, max: 100 },
                items: [],
            });
            await actor.applySubtletyFromSource('Compendium.wh40k-rpg.dh2-pacts.Item.missing');
            expect(updates).toHaveLength(0);
        });
    });

    describe('subtletySourceLabel (panel + breakdown label resolution)', () => {
        const ORIGINAL_GAME = (globalThis as Record<string, unknown>)['game'];

        beforeEach(() => {
            (globalThis as Record<string, unknown>)['game'] = {
                i18n: {
                    localize: (k: string) => k,
                    format: (k: string) => k,
                },
            };
        });

        afterEach(() => {
            if (ORIGINAL_GAME === undefined) delete (globalThis as Record<string, unknown>)['game'];
            else (globalThis as Record<string, unknown>)['game'] = ORIGINAL_GAME;
            vi.restoreAllMocks();
        });

        it('resolves the manual primitive to its non-content i18n key', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor } = makeActor(mod.WH40KBaseActor, { items: [] });
            expect(actor.subtletySourceLabel('manual')).toBe('WH40K.Subtlety.ManualAdjustment');
        });

        it('resolves the inquest primitive to its non-content i18n key', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const { actor } = makeActor(mod.WH40KBaseActor, { items: [] });
            expect(actor.subtletySourceLabel('inquest')).toBe('WH40K.Subtlety.Inquest');
        });

        it('resolves a compendium source to the owned item display name (single source of truth)', async () => {
            const mod = await loadModule();
            if (mod === undefined) return;
            const uuid = 'Compendium.wh40k-rpg.dh2-pacts.Item.pact3';
            const { actor } = makeActor(mod.WH40KBaseActor, {
                items: [
                    adjusterItem(
                        'Pact of Forbidden Lore',
                        { kind: 'event', delta: -6, minAbsoluteDelta: 0, requiresEquipped: false },
                        { compendiumSource: uuid },
                    ),
                ],
            });
            expect(actor.subtletySourceLabel(uuid)).toBe('Pact of Forbidden Lore');
        });
    });
});
