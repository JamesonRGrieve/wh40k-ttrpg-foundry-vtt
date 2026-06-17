import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawSubtletyAdjuster } from '../data/shared/subtlety-adjuster.ts';
import type { CollectedAdjuster } from '../rules/subtlety-adjusters.ts';
import { importModelOrSkip } from '../testing/model-import.ts';
import type * as BaseActorModuleType from './base-actor.ts';

type WH40KBaseActor = BaseActorModuleType.WH40KBaseActor;

/**
 * Unit coverage for the DH2 Warband Subtlety surface on `WH40KBaseActor`
 * (issue #64). Subtlety is a single warband-wide, world-scoped pool: the
 * canonical value lives in the `warband-subtlety` world setting and each DH2
 * character mirrors it onto `system.subtlety.value` at prep time. So
 * `applySubtlety(±N, source)` computes the clamped next value using the acting
 * actor's carried adjusters and then writes the **world setting** (not the
 * actor), with attribution recorded on the actor's `lastSubtletySource` flag.
 *
 * The DH2 character sheet (`subtlety-panel.hbs`) reads `system.subtlety` and the
 * `subtletyAdjusters[]` context derived from `actor.collectSubtletyAdjusters()`,
 * and writes deltas through `applySubtlety` / `applySubtletyFromSource`. Those
 * methods are the integration seam this suite covers, using the same
 * `Object.create(prototype)` fake-actor pattern as `base-actor.test.ts` with a
 * stubbed `game.settings` capturing the world write (no Foundry runtime).
 */

type BaseActorModule = typeof BaseActorModuleType;

/**
 * Resolve the module once, at top level. `base-actor.ts` can fail to import
 * under jsdom (it pulls in Foundry-bound side effects); when it does, `MOD` is
 * `undefined` and every test below is skipped via `it.skipIf(!HAVE)`.
 *
 * The critical invariant: `MOD` is NEVER dereferenced at suite-body scope. A
 * `describe` callback always runs during vitest collection, so a deref there
 * would throw and break collection (this bit two prior fixes). An `it.skipIf`
 * callback, by contrast, does NOT execute when skipped — so `requireModule()`
 * inside an `it` body only runs when `HAVE` is true and the deref is safe.
 */
const MOD: BaseActorModule | undefined = await importModelOrSkip(import('./base-actor.ts'));
const HAVE = MOD !== undefined;

/**
 * Non-throwing-at-collection accessor. Only ever called inside an unskipped
 * `it.skipIf(!HAVE)` callback, where `HAVE` is true and `MOD` is defined.
 */
function requireModule(): BaseActorModule {
    if (MOD === undefined) throw new Error('base-actor module unavailable; test should have been skipped');
    return MOD;
}

interface SubtletySlot {
    value: number;
    max: number;
}

interface FakeItem {
    name: string;
    system: { subtletyAdjuster?: RawSubtletyAdjuster; state?: { equipped?: boolean } };
    _stats?: { compendiumSource?: string | null };
}

/** The subset of an `Actor#update` payload these tests assert against. */
interface SubtletyUpdatePayload {
    'flags.wh40k-rpg.lastSubtletySource'?: string;
}

/**
 * Build a `WH40KBaseActor`-shaped fake whose `system.subtlety` (+ DH2
 * `gameSystem` gate), owned `items`, and `update` are all in-memory. The world
 * Subtlety setting is stubbed via {@link stubWorldSubtlety}; `applySubtlety`
 * writes the new pool value there, so tests assert against `settingWrites`
 * rather than the actor. `update` still receives the `lastSubtletySource` flag.
 */
function makeActor(
    Ctor: BaseActorModule['WH40KBaseActor'],
    opts: { subtlety?: SubtletySlot; items?: FakeItem[]; gameSystem?: string } = {},
): {
    actor: WH40KBaseActor;
    updates: SubtletyUpdatePayload[];
    slot: SubtletySlot | undefined;
} {
    const actor = Object.create(Ctor.prototype) as WH40KBaseActor;
    const slot = opts.subtlety;
    const updates: SubtletyUpdatePayload[] = [];
    const gameSystem = opts.gameSystem ?? (slot ? 'dh2' : undefined);
    Object.defineProperty(actor, 'system', {
        value: slot ? { subtlety: slot, gameSystem } : gameSystem !== undefined ? { gameSystem } : {},
        writable: true,
        configurable: true,
    });
    Object.defineProperty(actor, 'items', {
        value: opts.items ?? [],
        writable: true,
        configurable: true,
    });
    Object.defineProperty(actor, 'update', {
        value: async (data: SubtletyUpdatePayload) => {
            updates.push(data);
            return Promise.resolve(actor);
        },
        writable: true,
        configurable: true,
    });
    return { actor, updates, slot };
}

function adjusterItem(name: string, raw: RawSubtletyAdjuster, extra: { equipped?: boolean; compendiumSource?: string | null } = {}): FakeItem {
    const item: FakeItem = {
        name,
        system: { subtletyAdjuster: raw },
    };
    if (extra.equipped !== undefined) item.system.state = { equipped: extra.equipped };
    if (extra.compendiumSource !== undefined) item._stats = { compendiumSource: extra.compendiumSource };
    return item;
}

/**
 * Read the sole collected adjuster row, asserting (outside any `it` body, so no
 * `@vitest/no-conditional-in-test`) that exactly one was produced. Returns the
 * narrowed `CollectedAdjuster` so call sites need neither a non-null assertion
 * (flagged unnecessary under the test tsconfig) nor an inline guard.
 */
function onlyRow(rows: CollectedAdjuster[]): CollectedAdjuster {
    expect(rows).toHaveLength(1);
    const [row] = rows;
    // Narrowing throw (not a conditional assertion): under the main tsconfig
    // (`noUncheckedIndexedAccess` on) `row` is `CollectedAdjuster | undefined`,
    // so the guard is required for tsc; tsconfig.test.json has the flag off,
    // hence ESLint sees the check as "unnecessary" — keep it, suppress here.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- index access is `T | undefined` under the main tsconfig; guard is required there
    if (row === undefined) throw new Error('expected exactly one collected adjuster row');
    return row;
}

/** Captured world-setting writes from `WH40KSettings.setWarbandSubtlety` (the pool value). */
let settingWrites: number[];

/**
 * Stub `game.settings` so `setWarbandSubtlety` captures the written value and
 * `getWarbandSubtlety` resolves (returns the default). Also stubs `i18n` so any
 * label resolution inside the methods under test does not throw.
 */
function stubWorldSubtlety(): void {
    settingWrites = [];
    vi.stubGlobal('game', {
        settings: {
            get: () => 60,
            set: (_ns: string, _key: string, value: number) => {
                // Void return — `setWarbandSubtlety` awaits this; `await undefined` is fine.
                settingWrites.push(value);
            },
        },
        i18n: { localize: (k: string) => k, format: (k: string) => k },
    });
}

describe('WH40KBaseActor — Subtlety surface (DH2 world-pool read/write path)', () => {
    describe('applySubtlety (writes the shared world pool)', () => {
        beforeEach(stubWorldSubtlety);
        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it.skipIf(!HAVE)('lowers the pool by a negative delta and writes through the world setting', async () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 60, max: 100 } });
            await actor.applySubtlety(-7, 'manual');
            expect(settingWrites).toEqual([53]);
        });

        it.skipIf(!HAVE)('attributes the source via the lastSubtletySource flag', async () => {
            const mod = requireModule();
            const { actor, updates } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 60, max: 100 } });
            await actor.applySubtlety(-3, 'inquest');
            expect(updates[0]?.['flags.wh40k-rpg.lastSubtletySource']).toBe('inquest');
        });

        it.skipIf(!HAVE)('omits the source flag (issues no actor update) when no attribution is supplied', async () => {
            const mod = requireModule();
            const { actor, updates } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 60, max: 100 } });
            await actor.applySubtlety(-5);
            expect(settingWrites).toEqual([55]);
            expect(updates).toHaveLength(0);
        });

        it.skipIf(!HAVE)('clamps at the 0 floor (never negative)', async () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 4, max: 100 } });
            await actor.applySubtlety(-50, 'manual');
            expect(settingWrites).toEqual([0]);
        });

        it.skipIf(!HAVE)('clamps at the max ceiling on gains', async () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 95, max: 100 } });
            await actor.applySubtlety(20, 'manual');
            expect(settingWrites).toEqual([100]);
        });

        it.skipIf(!HAVE)('truncates a fractional amount before applying', async () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 60, max: 100 } });
            await actor.applySubtlety(-2.9, 'manual');
            expect(settingWrites).toEqual([58]);
        });

        it.skipIf(!HAVE)('no-ops on a zero / non-finite amount (no world write)', async () => {
            const mod = requireModule();
            const { actor, updates } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 60, max: 100 } });
            await actor.applySubtlety(0, 'manual');
            await actor.applySubtlety(Number.NaN, 'manual');
            expect(settingWrites).toHaveLength(0);
            expect(updates).toHaveLength(0);
        });

        it.skipIf(!HAVE)('no-ops when the actor carries no subtlety slot (NPCs / non-character actors)', async () => {
            const mod = requireModule();
            // No `subtlety` on system — mirrors an NPC / vehicle whose schema does
            // not carry the DH2 character pool.
            const { actor } = makeActor(mod.WH40KBaseActor, {});
            await actor.applySubtlety(-7, 'manual');
            expect(settingWrites).toHaveLength(0);
        });

        it.skipIf(!HAVE)('no-ops for a non-DH2 character (the warband pool is DH2-only)', async () => {
            const mod = requireModule();
            // A character on another system carries `subtlety` in the shared schema
            // but must not touch the DH2 warband pool.
            const { actor } = makeActor(mod.WH40KBaseActor, { subtlety: { value: 60, max: 100 }, gameSystem: 'bc' });
            await actor.applySubtlety(-7, 'manual');
            expect(settingWrites).toHaveLength(0);
        });

        it.skipIf(!HAVE)('applies a carried clamp adjuster to losses (Quarantine World floors -5 to -1)', async () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, {
                subtlety: { value: 60, max: 100 },
                items: [adjusterItem('Quarantine World', { kind: 'clamp', delta: 0, minAbsoluteDelta: 1, requiresEquipped: false })],
            });
            await actor.applySubtlety(-5, 'manual');
            expect(settingWrites).toEqual([59]);
        });

        it.skipIf(!HAVE)('does not clamp gains even with a clamp adjuster present', async () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, {
                subtlety: { value: 60, max: 100 },
                items: [adjusterItem('Quarantine World', { kind: 'clamp', delta: 0, minAbsoluteDelta: 1, requiresEquipped: false })],
            });
            await actor.applySubtlety(5, 'manual');
            expect(settingWrites).toEqual([65]);
        });
    });

    describe('collectSubtletyAdjusters (sheet `subtletyAdjusters` context source)', () => {
        it.skipIf(!HAVE)('returns an empty array when no owned item carries an adjuster', () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, {
                items: [adjusterItem('Plain Talent', { kind: 'none', delta: 0, minAbsoluteDelta: 0, requiresEquipped: false })],
            });
            expect(actor.collectSubtletyAdjusters()).toEqual([]);
        });

        it.skipIf(!HAVE)('surfaces a passive adjuster with its delta + compendium source uuid + label', () => {
            const mod = requireModule();
            const uuid = 'Compendium.wh40k-rpg.dh2-beyond-items-talents.Item.abc123';
            const { actor } = makeActor(mod.WH40KBaseActor, {
                items: [
                    adjusterItem(
                        'Hunger for Knowledge',
                        { kind: 'passive', delta: -5, minAbsoluteDelta: 0, requiresEquipped: false },
                        { compendiumSource: uuid },
                    ),
                ],
            });
            const row = onlyRow(actor.collectSubtletyAdjusters());
            expect(row.kind).toBe('passive');
            expect(row.delta).toBe(-5);
            expect(row.label).toBe('Hunger for Knowledge');
            expect(row.sourceUuid).toBe(uuid);
            expect(row.primitive).toBeNull();
        });

        it.skipIf(!HAVE)('drops a requiresEquipped passive while the carrier is unequipped', () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, {
                items: [adjusterItem('Daemon Blade', { kind: 'passive', delta: -3, minAbsoluteDelta: 0, requiresEquipped: true }, { equipped: false })],
            });
            expect(actor.collectSubtletyAdjusters()).toEqual([]);
        });

        it.skipIf(!HAVE)('surfaces a requiresEquipped passive once the carrier is equipped', () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, {
                items: [adjusterItem('Daemon Blade', { kind: 'passive', delta: -3, minAbsoluteDelta: 0, requiresEquipped: true }, { equipped: true })],
            });
            const row = onlyRow(actor.collectSubtletyAdjusters());
            expect(row.delta).toBe(-3);
        });

        it.skipIf(!HAVE)('reports a null source uuid for a non-compendium owned item', () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, {
                items: [adjusterItem('Homebrew Talent', { kind: 'event', delta: -2, minAbsoluteDelta: 0, requiresEquipped: false })],
            });
            const row = onlyRow(actor.collectSubtletyAdjusters());
            expect(row.sourceUuid).toBeNull();
        });
    });

    describe('applySubtletyFromSource (#87 adjuster write hook)', () => {
        beforeEach(stubWorldSubtlety);
        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it.skipIf(!HAVE)('applies the event-kind delta read from the governing owned item', async () => {
            const mod = requireModule();
            const uuid = 'Compendium.wh40k-rpg.dh2-pacts.Item.pact1';
            const { actor } = makeActor(mod.WH40KBaseActor, {
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
            expect(settingWrites).toEqual([52]);
        });

        it.skipIf(!HAVE)('scales the event delta by the scale argument', async () => {
            const mod = requireModule();
            const uuid = 'Compendium.wh40k-rpg.dh2-pacts.Item.pact2';
            const { actor } = makeActor(mod.WH40KBaseActor, {
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
            expect(settingWrites).toEqual([52]);
        });

        it.skipIf(!HAVE)('does NOT apply a passive adjuster as a one-shot (would double-count)', async () => {
            const mod = requireModule();
            const uuid = 'Compendium.wh40k-rpg.dh2-weapons.Item.daemon';
            const { actor } = makeActor(mod.WH40KBaseActor, {
                subtlety: { value: 60, max: 100 },
                items: [
                    adjusterItem('Daemon Weapon', { kind: 'passive', delta: -3, minAbsoluteDelta: 0, requiresEquipped: false }, { compendiumSource: uuid }),
                ],
            });
            await actor.applySubtletyFromSource(uuid);
            expect(settingWrites).toHaveLength(0);
        });

        it.skipIf(!HAVE)('no-ops for an unknown source uuid', async () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, {
                subtlety: { value: 60, max: 100 },
                items: [],
            });
            await actor.applySubtletyFromSource('Compendium.wh40k-rpg.dh2-pacts.Item.missing');
            expect(settingWrites).toHaveLength(0);
        });
    });

    describe('subtletySourceLabel (panel + breakdown label resolution)', () => {
        beforeEach(() => {
            vi.stubGlobal('game', {
                i18n: {
                    localize: (k: string) => k,
                    format: (k: string) => k,
                },
            });
        });

        afterEach(() => {
            vi.unstubAllGlobals();
            vi.restoreAllMocks();
        });

        it.skipIf(!HAVE)('resolves the manual primitive to its non-content i18n key', () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, { items: [] });
            expect(actor.subtletySourceLabel('manual')).toBe('WH40K.Subtlety.ManualAdjustment');
        });

        it.skipIf(!HAVE)('resolves the inquest primitive to its non-content i18n key', () => {
            const mod = requireModule();
            const { actor } = makeActor(mod.WH40KBaseActor, { items: [] });
            expect(actor.subtletySourceLabel('inquest')).toBe('WH40K.Subtlety.Inquest');
        });

        it.skipIf(!HAVE)('resolves a compendium source to the owned item display name (single source of truth)', () => {
            const mod = requireModule();
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
