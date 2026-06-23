import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Warband Subtlety system probe (CLAUDE.md Direction #7 — content-agnostic
 * adjusters live on compendium documents via `SubtletyAdjusterTemplate`; the
 * actor tree-walk reads them from `system.subtletyAdjuster`). Pushes source-
 * code coverage on:
 *   - src/module/rules/subtlety-adjusters.ts (`clampSubtletyLoss`,
 *     `isSubtletyPrimitive`, the `SubtletyPrimitive` discriminator, the
 *     `CollectedAdjuster` shape consumed by `applySubtlety` /
 *     `applySubtletyFromSource` / `subtletySourceLabel`)
 *   - src/module/data/shared/subtlety-adjuster.ts
 *     (`subtletyAdjusterEffectOf` for `none`, `clamp`, `passive`, `event`
 *     branches)
 *   - src/module/data/shared/subtlety-adjuster-template.ts
 *     (`defineSchema()` + the `subtletyAdjusterEffect` getter — exercised on
 *     embedded talent items)
 *   - src/module/documents/base-actor.ts subtlety surface
 *     (`collectSubtletyAdjusters` with the `requiresEquipped` gate,
 *     `applySubtlety` with the clamp loop, `applySubtletyFromSource`,
 *     `subtletySourceLabel` for both primitive + compendium paths)
 *
 * A `bc-character` is the carrier (the same DH2 family character-base carries
 * the `system.subtlety` field across BC/DH2 — see
 * `src/module/data/actor/character.ts:329`). One actor is created up front
 * and torn down at the end; each flow returns a `{ ok, error }` so failures
 * collect and assert at the end rather than masking each other.
 */

const FLOW_BASELINE = 'subtlety-baseline';
const FLOW_MANUAL = 'subtlety-manual-adjustment';
const FLOW_INQUEST = 'subtlety-inquest-adjustment';
const FLOW_TALENT_DELTA = 'talent-subtlety-delta-applies';
const FLOW_REQUIRES_EQUIPPED = 'talent-subtlety-requiresEquipped';
const FLOW_FLOORS = 'subtlety-minAbsoluteDelta-floors';
const FLOW_CLEARS = 'subtlety-clears-when-removed';

interface ActorRef {
    id: string;
}

interface FlowResult {
    ok: boolean;
    error: string | null;
}

/**
 * Subset of the Foundry `Actor` surface this probe exercises. All members are
 * declared optional because the probe defends against missing API at runtime
 * (the world may be mid-init), but every member that IS present has its real
 * signature so call sites stay typed.
 */
/**
 * The flag getter and the `subtletyAdjusterEffect` template getter return
 * framework-opaque values; the probe only ever reads them through `typeof` /
 * `== null` guards, so a primitive-or-object union is the precise shape.
 */
type FoundryOpaque = string | number | boolean | object | null | undefined;

interface ProbeActor {
    id?: string;
    system?: { subtlety?: { value?: number }; subtletyAdjusterEffect?: FoundryOpaque };
    update?: (data: object) => Promise<void>;
    unsetFlag?: (scope: string, key: string) => Promise<void>;
    delete?: () => Promise<void>;
    getFlag?: (scope: string, key: string) => string | undefined;
    applySubtlety?: (amount: number, source?: string) => Promise<void>;
    subtletySourceLabel?: (ref: string) => string;
    collectSubtletyAdjusters?: () => Array<{ label: string; kind: string; delta: number; minAbsoluteDelta?: number }>;
    createEmbeddedDocuments?: (type: string, data: object[]) => Promise<Array<{ id?: string }>>;
    deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<void>;
    items?: { get?: (id: string) => { system?: { subtletyAdjusterEffect?: FoundryOpaque } } | undefined };
}

interface ProbeGame {
    actors?: { get?: (id: string) => ProbeActor | undefined };
    settings?: { get?: (scope: string, key: string) => number | undefined; set?: (scope: string, key: string, value: number) => Promise<void> };
}

interface ProbeActorClass {
    create?: (data: object) => Promise<{ id?: string } | null>;
}

/**
 * Read the current Subtlety pool. Subtlety is a warband-wide world setting
 * ('warband-subtlety'); applySubtlety writes it via setWarbandSubtlety, while
 * the per-actor `system.subtlety.value` is only a mirror re-synced on the next
 * actor prep (so it is stale immediately after a setting write). Read the
 * setting — the source of truth — so post-applySubtlety assertions observe the
 * real pool. `actorId` is retained for signature compatibility.
 */
async function readSubtlety(page: Page, _actorId: string): Promise<number | null> {
    return page.evaluate((): number | null => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `game` onto the page globalThis
        const gameGlobal = (globalThis as unknown as { game?: ProbeGame }).game;
        const v = gameGlobal?.settings?.get?.('wh40k-rpg', 'warband-subtlety');
        return typeof v === 'number' ? v : null;
    });
}

/**
 * Reset the Subtlety pool back to a known baseline before the next probe.
 * Subtlety lives on the warband-subtlety world setting (the per-actor value is a
 * mirror overwritten on prep), so reset the SETTING — writing system.subtlety.value
 * would be discarded next prep. Avoids cross-probe contamination.
 */
async function resetSubtlety(page: Page, actorId: string, value: number): Promise<void> {
    await page.evaluate(
        async ({ id, v }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `game` onto the page globalThis
            const gameGlobal = (globalThis as unknown as { game?: ProbeGame }).game;
            await gameGlobal?.settings?.set?.('wh40k-rpg', 'warband-subtlety', v);
            const actor = gameGlobal?.actors?.get?.(id);
            try {
                await actor?.unsetFlag?.('wh40k-rpg', 'lastSubtletySource');
            } catch {
                /* best-effort */
            }
        },
        { id: actorId, v: value },
    );
}

async function createParentActor(page: Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async (): Promise<{ id: string | null; error: string | null }> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `Actor` onto the page globalThis
        const ActorCls = (globalThis as unknown as { Actor?: ProbeActorClass }).Actor;
        if (!ActorCls?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            // Subtlety adjustment is a DH2 warband mechanic — base-actor.applySubtlety
            // only acts when gameSystem === 'dh2', so the parent must be dh2.
            const actor = await ActorCls.create({
                name: 'probe-subtlety-parent',
                type: 'dh2-character',
                system: { gameSystem: 'dh2' },
            });
            if (!actor) return { id: null, error: 'Actor.create returned null' };
            return { id: actor.id ?? null, error: null };
        } catch (err) {
            return { id: null, error: err instanceof Error ? err.message : String(err) };
        }
    });
    if (result.id === null) return { error: result.error ?? 'unknown create error' };
    return { id: result.id };
}

async function deleteActor(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `game` onto the page globalThis
        const gameGlobal = (globalThis as unknown as { game?: ProbeGame }).game;
        const actor = gameGlobal?.actors?.get?.(id);
        await actor?.delete?.();
    }, actorId);
}

/**
 * Embed a talent on the actor with the given `subtletyAdjuster` block.
 * Returns the created item id (or an error string for the caller to surface).
 */
async function embedSubtletyTalent(
    page: Page,
    actorId: string,
    args: {
        name: string;
        kind: 'clamp' | 'passive' | 'event';
        delta: number;
        minAbsoluteDelta: number;
        requiresEquipped: boolean;
        equipped?: boolean;
        // Type of item to embed. Talent is the default. Weapon is required for
        // the requiresEquipped flow because talents have no `equipped` schema
        // slot — equip toggles are silently dropped on talent updates and the
        // gated-passive cannot surface. Weapon mixes both EquippableTemplate
        // and SubtletyAdjusterTemplate so it satisfies both branches in
        // base-actor.ts#collectSubtletyAdjusters.
        itemType?: 'talent' | 'weapon';
    },
): Promise<{ id: string | null; error: string | null }> {
    return page.evaluate(
        async ({ actorId: aId, args: embedArgs }): Promise<{ id: string | null; error: string | null }> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `game` onto the page globalThis
            const gameGlobal = (globalThis as unknown as { game?: ProbeGame }).game;
            const actor = gameGlobal?.actors?.get?.(aId);
            if (!actor?.createEmbeddedDocuments) return { id: null, error: 'actor missing createEmbeddedDocuments' };
            try {
                const created = await actor.createEmbeddedDocuments('Item', [
                    {
                        name: embedArgs.name,
                        type: embedArgs.itemType ?? 'talent',
                        system: {
                            subtletyAdjuster: {
                                kind: embedArgs.kind,
                                delta: embedArgs.delta,
                                minAbsoluteDelta: embedArgs.minAbsoluteDelta,
                                requiresEquipped: embedArgs.requiresEquipped,
                            },
                            equipped: embedArgs.equipped === true,
                        },
                    },
                ]);
                const id = created[0]?.id ?? null;
                return { id, error: id !== null ? null : 'createEmbeddedDocuments returned no id' };
            } catch (err) {
                return { id: null, error: `embed item threw: ${err instanceof Error ? err.message : String(err)}` };
            }
        },
        { actorId, args },
    );
}

async function deleteItem(page: Page, actorId: string, itemId: string): Promise<void> {
    await page.evaluate(
        async ({ actorId: aId, itemId: iId }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `game` onto the page globalThis
            const gameGlobal = (globalThis as unknown as { game?: ProbeGame }).game;
            try {
                await gameGlobal?.actors?.get?.(aId)?.deleteEmbeddedDocuments?.('Item', [iId]);
            } catch {
                /* best-effort */
            }
        },
        { actorId, itemId },
    );
}

/**
 * Baseline probe: a fresh bc-character has `system.subtlety.value === 60`
 * (the schema initial in `character.ts:330`). If the field is missing or
 * non-numeric, source coverage on the subtlety surface is moot — fail loud.
 */
async function probeBaseline(page: Page, actorId: string): Promise<FlowResult> {
    const v = await readSubtlety(page, actorId);
    if (v === null) return { ok: false, error: 'system.subtlety.value missing on bc-character' };
    if (v !== 60) return { ok: false, error: `expected baseline 60, got ${v}` };
    return { ok: true, error: null };
}

/**
 * Manual adjustment probe: call `actor.applySubtlety(-7, 'manual')` and
 * verify the pool drops by 7. Also reads back the `lastSubtletySource` flag
 * and resolves it via `subtletySourceLabel('manual')` to exercise the
 * primitive branch of `isSubtletyPrimitive`.
 */
async function probeManualAdjustment(page: Page, actorId: string): Promise<FlowResult> {
    return page.evaluate(async (id: string): Promise<FlowResult> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `game` onto the page globalThis
        const gameGlobal = (globalThis as unknown as { game?: ProbeGame }).game;
        const actor = gameGlobal?.actors?.get?.(id);
        if (!actor?.applySubtlety) return { ok: false, error: 'actor.applySubtlety unavailable' };
        const before = actor.system?.subtlety?.value ?? null;
        if (before === null) return { ok: false, error: 'subtlety missing before manual apply' };
        try {
            await actor.applySubtlety(-7, 'manual');
        } catch (err) {
            return { ok: false, error: `applySubtlety(-7, manual) threw: ${err instanceof Error ? err.message : String(err)}` };
        }
        const live = gameGlobal?.actors?.get?.(id);
        const after = live?.system?.subtlety?.value ?? null;
        if (after === null) return { ok: false, error: 'subtlety missing after manual apply' };
        if (after !== before - 7) return { ok: false, error: `expected ${before - 7}, got ${after}` };
        const source = live?.getFlag?.('wh40k-rpg', 'lastSubtletySource');
        if (source !== 'manual') return { ok: false, error: `lastSubtletySource flag wrong: ${String(source)}` };
        const label = live?.subtletySourceLabel?.('manual');
        if (typeof label !== 'string' || label.length === 0) return { ok: false, error: `manual label not resolved: ${String(label)}` };
        return { ok: true, error: null };
    }, actorId);
}

/**
 * Inquest adjustment probe: `applySubtlety(-3, 'inquest')`. Like manual but
 * exercises the second `SubtletyPrimitive` branch — both `isSubtletyPrimitive`
 * arms and the inquest leg of `subtletySourceLabel`.
 */
async function probeInquestAdjustment(page: Page, actorId: string): Promise<FlowResult> {
    return page.evaluate(async (id: string): Promise<FlowResult> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `game` onto the page globalThis
        const gameGlobal = (globalThis as unknown as { game?: ProbeGame }).game;
        const actor = gameGlobal?.actors?.get?.(id);
        if (!actor?.applySubtlety) return { ok: false, error: 'actor.applySubtlety unavailable' };
        const before = actor.system?.subtlety?.value ?? null;
        if (before === null) return { ok: false, error: 'subtlety missing before inquest apply' };
        try {
            await actor.applySubtlety(-3, 'inquest');
        } catch (err) {
            return { ok: false, error: `applySubtlety(-3, inquest) threw: ${err instanceof Error ? err.message : String(err)}` };
        }
        const live = gameGlobal?.actors?.get?.(id);
        const after = live?.system?.subtlety?.value ?? null;
        if (after === null) return { ok: false, error: 'subtlety missing after inquest apply' };
        if (after !== before - 3) return { ok: false, error: `expected ${before - 3}, got ${after}` };
        const label = live?.subtletySourceLabel?.('inquest');
        if (typeof label !== 'string' || label.length === 0) return { ok: false, error: `inquest label not resolved: ${String(label)}` };
        return { ok: true, error: null };
    }, actorId);
}

/**
 * Event-kind talent probe: embed a talent with
 * `subtletyAdjuster: { kind: 'event', delta: -5, ... }`. Verify
 * `collectSubtletyAdjusters()` surfaces it and `applySubtletyFromSource(uuid)`
 * applies -5 to the pool. The compendiumSource on a freshly-created world
 * item is null, so we look up the adjuster by name and round-trip through
 * `applySubtlety` directly — the goal is to drive the
 * `subtletyAdjusterEffect` getter + the `event` branch in
 * `subtletyAdjusterEffectOf`.
 */
async function probeTalentDeltaApplies(page: Page, actorId: string): Promise<FlowResult> {
    const created = await embedSubtletyTalent(page, actorId, {
        name: 'probe-subtlety-event-talent',
        kind: 'event',
        delta: -5,
        minAbsoluteDelta: 0,
        requiresEquipped: false,
    });
    if (created.id === null) return { ok: false, error: `embed failed: ${created.error}` };
    try {
        const result = await page.evaluate(
            async ({ actorId: aId, itemId: iId }): Promise<FlowResult> => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `game` onto the page globalThis
                const gameGlobal = (globalThis as unknown as { game?: ProbeGame }).game;
                const actor = gameGlobal?.actors?.get?.(aId);
                if (!actor?.collectSubtletyAdjusters) return { ok: false, error: 'collectSubtletyAdjusters unavailable' };
                const collected = actor.collectSubtletyAdjusters();
                const found = collected.find((a) => a.kind === 'event' && a.delta === -5);
                if (!found) return { ok: false, error: `event adjuster not collected (got ${JSON.stringify(collected)})` };
                // Drive the template getter directly.
                const itemEffect = actor.items?.get?.(iId)?.system?.subtletyAdjusterEffect;
                if (itemEffect == null) return { ok: false, error: 'item.system.subtletyAdjusterEffect getter returned null' };
                // Read the warband-subtlety setting (source of truth) — the per-actor
                // system.subtlety.value mirror is only re-synced on the next prep.
                const readPool = (): number | null => {
                    const raw = gameGlobal?.settings?.get?.('wh40k-rpg', 'warband-subtlety');
                    return typeof raw === 'number' ? raw : null;
                };
                const before = readPool();
                if (before === null) return { ok: false, error: 'subtlety missing before delta apply' };
                if (!actor.applySubtlety) return { ok: false, error: 'applySubtlety unavailable' };
                try {
                    await actor.applySubtlety(found.delta);
                } catch (err) {
                    return { ok: false, error: `applySubtlety threw: ${err instanceof Error ? err.message : String(err)}` };
                }
                const after = readPool();
                if (after === null) return { ok: false, error: 'subtlety missing after delta apply' };
                if (after !== before - 5) return { ok: false, error: `expected ${before - 5}, got ${after}` };
                return { ok: true, error: null };
            },
            { actorId, itemId: created.id },
        );
        return result;
    } finally {
        await deleteItem(page, actorId, created.id);
    }
}

/**
 * `requiresEquipped` gate probe: a `passive` weapon-shaped item with
 * `requiresEquipped: true` should still surface in
 * `collectSubtletyAdjusters()` because weapons are intrinsically equipped
 * (WeaponData.prepareDerivedData forces `this.equipped = !this.inShipStorage`).
 * Drives the `effect.kind === 'passive' && effect.requiresEquipped && sys?.equipped !== true` branch
 * in `base-actor.ts:130` along the equipped-true / continue-false path.
 *
 * Note on the inverse arm: no item DataModel in this codebase mixes
 * `SubtletyAdjusterTemplate` with a togglable `EquippableTemplate.equipped`
 * field — talents lack `equipped` entirely, weapons force `equipped=true` in
 * prepareDerivedData, and the only other adjuster carrier (origin-path)
 * also lacks `equipped`. The "gated passive NOT visible while unequipped"
 * arm can therefore not be observed against any real item type today and is
 * covered conceptually here via the positive case + the unit test in
 * `src/module/documents/base-actor.test.ts`. Source improvement candidate:
 * add `EquippableTemplate` to the talent mixin so a Daemon Talent / Daemon
 * Cyber-Familiar can be modelled as a real gated passive.
 */
async function probeRequiresEquipped(page: Page, actorId: string): Promise<FlowResult> {
    const created = await embedSubtletyTalent(page, actorId, {
        name: 'probe-subtlety-passive-gated',
        kind: 'passive',
        delta: -2,
        minAbsoluteDelta: 0,
        requiresEquipped: true,
        // Weapon forces equipped=true via prepareDerivedData (see weapon.ts:336).
        itemType: 'weapon',
    });
    if (created.id === null) return { ok: false, error: `embed failed: ${created.error}` };
    try {
        return await page.evaluate((id: string): FlowResult => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `game` onto the page globalThis
            const gameGlobal = (globalThis as unknown as { game?: ProbeGame }).game;
            const actor = gameGlobal?.actors?.get?.(id);
            if (!actor?.collectSubtletyAdjusters) return { ok: false, error: 'collectSubtletyAdjusters unavailable' };
            const present = actor.collectSubtletyAdjusters().find((a) => a.label === 'probe-subtlety-passive-gated');
            if (!present) {
                return { ok: false, error: 'gated passive did not surface on intrinsically-equipped weapon carrier' };
            }
            if (present.kind !== 'passive' || present.delta !== -2) {
                return { ok: false, error: `gated passive shape wrong: ${JSON.stringify(present)}` };
            }
            return { ok: true, error: null };
        }, actorId);
    } finally {
        await deleteItem(page, actorId, created.id);
    }
}

/**
 * `clampSubtletyLoss` floor probe: embed a `kind: 'clamp'` adjuster with
 * `minAbsoluteDelta: 1` (Quarantine World shape, Enemies Beyond p. 30). Call
 * `applySubtlety(-5)` twice — each call should clamp to -1, so the net loss
 * is 2 instead of 10. Drives the loss-clamp loop in `applySubtlety` and the
 * `delta >= 0 || cap <= 0` early-return paths in `clampSubtletyLoss`.
 */
async function probeMinAbsoluteDeltaFloors(page: Page, actorId: string): Promise<FlowResult> {
    const created = await embedSubtletyTalent(page, actorId, {
        name: 'probe-subtlety-clamp-talent',
        kind: 'clamp',
        delta: 0,
        minAbsoluteDelta: 1,
        requiresEquipped: false,
    });
    if (created.id === null) return { ok: false, error: `embed failed: ${created.error}` };
    try {
        return await page.evaluate(async (id: string): Promise<FlowResult> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `game` onto the page globalThis
            const gameGlobal = (globalThis as unknown as { game?: ProbeGame }).game;
            const actor = gameGlobal?.actors?.get?.(id);
            if (!actor?.applySubtlety) return { ok: false, error: 'applySubtlety unavailable' };
            // Read the warband-subtlety setting (source of truth), not the per-actor
            // mirror which is only re-synced on the next prep.
            const readPool = (): number | null => {
                const raw = gameGlobal?.settings?.get?.('wh40k-rpg', 'warband-subtlety');
                return typeof raw === 'number' ? raw : null;
            };
            const before = readPool();
            if (before === null) return { ok: false, error: 'subtlety missing before clamp test' };
            try {
                await actor.applySubtlety(-5);
                await gameGlobal?.actors?.get?.(id)?.applySubtlety?.(-5);
            } catch (err) {
                return { ok: false, error: `clamped applySubtlety threw: ${err instanceof Error ? err.message : String(err)}` };
            }
            const after = readPool();
            if (after === null) return { ok: false, error: 'subtlety missing after clamp test' };
            const expected = before - 2; // two -1 clamped losses
            if (after !== expected) return { ok: false, error: `expected ${expected} (two -1 clamps), got ${after}` };
            return { ok: true, error: null };
        }, actorId);
    } finally {
        await deleteItem(page, actorId, created.id);
    }
}

/**
 * Removal probe: embed a `passive` talent (always-on, no equip gate), verify
 * `collectSubtletyAdjusters()` surfaces it, delete it, verify it no longer
 * appears. Drives the descendant-document delete path and the
 * `subtletyAdjusterEffectOf(undefined)` early-return after teardown.
 */
async function probeClearsWhenRemoved(page: Page, actorId: string): Promise<FlowResult> {
    const created = await embedSubtletyTalent(page, actorId, {
        name: 'probe-subtlety-removable',
        kind: 'passive',
        delta: -3,
        minAbsoluteDelta: 0,
        requiresEquipped: false,
    });
    if (created.id === null) return { ok: false, error: `embed failed: ${created.error}` };
    const presentBefore = await page.evaluate((id: string): boolean => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `game` onto the page globalThis
        const gameGlobal = (globalThis as unknown as { game?: ProbeGame }).game;
        return (
            gameGlobal?.actors
                ?.get?.(id)
                ?.collectSubtletyAdjusters?.()
                .some((a) => a.label === 'probe-subtlety-removable') ?? false
        );
    }, actorId);
    if (!presentBefore) {
        await deleteItem(page, actorId, created.id);
        return { ok: false, error: 'passive adjuster did not surface before removal' };
    }
    await deleteItem(page, actorId, created.id);
    const presentAfter = await page.evaluate((id: string): boolean => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `game` onto the page globalThis
        const gameGlobal = (globalThis as unknown as { game?: ProbeGame }).game;
        return (
            gameGlobal?.actors
                ?.get?.(id)
                ?.collectSubtletyAdjusters?.()
                .some((a) => a.label === 'probe-subtlety-removable') ?? false
        );
    }, actorId);
    if (presentAfter) return { ok: false, error: 'adjuster still present after item delete' };
    return { ok: true, error: null };
}

test.describe.serial('subtlety / Direction #7 adjusters (Tier B)', () => {
    test('every Subtlety flow drives the adjuster surface end-to-end', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const parent = await createParentActor(page);
        expect('id' in parent, `parent actor create failed: ${'error' in parent ? parent.error : 'unknown'}`).toBe(true);
        const actorId = (parent as ActorRef).id;

        const failures: string[] = [];

        try {
            // The warband-subtlety pool is a single world-scoped setting shared
            // across the worker's world; a sibling spec (subtlety-panel) mutates it
            // and may not restore the 60 default before this spec runs. Reset it
            // explicitly so probeBaseline measures the canonical baseline rather
            // than another spec's leftover value.
            await resetSubtlety(page, actorId, 60);
            const baseline = await probeBaseline(page, actorId);
            if (baseline.ok) recordCoverage('subtlety.flow', FLOW_BASELINE);
            else failures.push(`${FLOW_BASELINE}: ${baseline.error ?? 'unknown error'}`);

            const manual = await probeManualAdjustment(page, actorId);
            if (manual.ok) recordCoverage('subtlety.flow', FLOW_MANUAL);
            else failures.push(`${FLOW_MANUAL}: ${manual.error ?? 'unknown error'}`);

            await resetSubtlety(page, actorId, 60);

            const inquest = await probeInquestAdjustment(page, actorId);
            if (inquest.ok) recordCoverage('subtlety.flow', FLOW_INQUEST);
            else failures.push(`${FLOW_INQUEST}: ${inquest.error ?? 'unknown error'}`);

            await resetSubtlety(page, actorId, 60);

            const talentDelta = await probeTalentDeltaApplies(page, actorId);
            if (talentDelta.ok) recordCoverage('subtlety.flow', FLOW_TALENT_DELTA);
            else failures.push(`${FLOW_TALENT_DELTA}: ${talentDelta.error ?? 'unknown error'}`);

            await resetSubtlety(page, actorId, 60);

            const requiresEquipped = await probeRequiresEquipped(page, actorId);
            if (requiresEquipped.ok) recordCoverage('subtlety.flow', FLOW_REQUIRES_EQUIPPED);
            else failures.push(`${FLOW_REQUIRES_EQUIPPED}: ${requiresEquipped.error ?? 'unknown error'}`);

            await resetSubtlety(page, actorId, 60);

            const floors = await probeMinAbsoluteDeltaFloors(page, actorId);
            if (floors.ok) recordCoverage('subtlety.flow', FLOW_FLOORS);
            else failures.push(`${FLOW_FLOORS}: ${floors.error ?? 'unknown error'}`);

            await resetSubtlety(page, actorId, 60);

            const clears = await probeClearsWhenRemoved(page, actorId);
            if (clears.ok) recordCoverage('subtlety.flow', FLOW_CLEARS);
            else failures.push(`${FLOW_CLEARS}: ${clears.error ?? 'unknown error'}`);
        } finally {
            await deleteActor(page, actorId).catch(() => undefined);
        }

        expect(failures, `${failures.length} subtlety flow(s) failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
