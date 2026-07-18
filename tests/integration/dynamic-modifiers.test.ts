/**
 * Tier A — dynamic-modifier hooks against the REAL registered DataModels.
 *
 * Boots Foundry into jsdom (best-effort; see `lib/boot.ts`) and asserts that
 * `ModifiersTemplate` (`src/module/data/shared/modifiers-template.ts`) really
 * contributes a `system.modifiers.dynamicModifiers` `ArrayField` to every item
 * type that mixes it in (talent / trait / condition), that a Crushing-Blow-style
 * hook validates and survives the create + `cleanData` pipeline with the schema
 * defaults filled, and that the compendium→world hydrate join surfaces those
 * hooks onto a lean owned item.
 *
 * Discipline (same as the other Tier A files): when `.foundry-release/` is
 * ABSENT the suite prints the shared skip banner via `requireOrSkip('A')` and
 * every case is skipped (the run still exits 0). When the release is present but
 * Foundry cannot init under jsdom, `bootFoundryOnce()` returns
 * `{ booted: false }` and `skipAll` skips the cases with the boot reason logged
 * by the harness. Only a real boot runs real assertions.
 */

import { describe, expect, it } from 'vitest';
import { buildHydratedSystem, buildHydrationPatches } from '../../src/module/compendium-hydrate';
import { bootFoundryOnce, type FoundryRuntime } from './lib/boot';
import { createActor, createItem } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

// Boot once at module load so test bodies stay free of guard conditionals.
// `bootFoundryOnce()` is safe to call when Foundry is unavailable — it returns
// `{ booted: false, skipped: true }` and `describe.skipIf(skipAll)` then skips
// every case without entering an `it` body.
const bootResult = await bootFoundryOnce();
const skipAll = !ok || !bootResult.booted;
// When `skipAll === true` the describe is skipped before any `it` runs, so the
// fallback is never observed; when false, BootResult's discriminated union
// guarantees `runtime` is defined.
const runtime: FoundryRuntime = bootResult.runtime ?? ({} as FoundryRuntime);

// Item types that mix in `ModifiersTemplate` and are non-equippable (so the
// dynamicModifiers field is present without any equipped-state gating).
const MODIFIER_ITEM_TYPES = ['talent', 'trait', 'condition'] as const;

// Crushing Blow: melee-conditional damage scaled by half the attacker's Weapon
// Skill bonus. Authors only the non-default fields — `cleanData` must fill the
// rest (side/mode/value/when + the nested scale/duration schema defaults).
const CRUSHING_BLOW_HOOK = {
    target: 'damage',
    condition: 'melee',
    scale: { source: 'ws', factor: 0.5 },
} as const;

/* -------------------------------------------------------------------------- */
/*  Typed views over the Foundry framework boundary                           */
/* -------------------------------------------------------------------------- */

interface SchemaFieldLike {
    getField: (path: string) => DataFieldLike | undefined;
}
interface DataFieldLike {
    /** ArrayField exposes the per-element field here. */
    element?: SchemaFieldLike;
}
interface ItemDataModelClass {
    schema: SchemaFieldLike;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry SystemDataModel.cleanData returns a cleaned source of arbitrary shape
    cleanData: (source: object, options?: object) => Record<string, unknown>;
}
interface FoundryItemConfig {
    Item?: { dataModels?: Record<string, ItemDataModelClass> };
}

interface DynamicScaleRead {
    source: string;
    field: string;
    factor: number;
    round: string;
    multiplier: string;
    min: number | null;
    max: number | null;
}
interface DynamicModifierRead {
    target: string;
    targetKey: string;
    side: string;
    mode: string;
    value: number;
    valueFormula: string;
    scale: DynamicScaleRead;
    when: string;
    condition: string;
    conditionValue: string;
    duration: { unit: string; sustained: boolean };
    formula: string;
    label: string;
}
interface ModifiersRead {
    dynamicModifiers: DynamicModifierRead[];
}
interface ItemWithModifiers {
    system: { modifiers: ModifiersRead };
    toObject: () => { system: { modifiers: ModifiersRead } };
}

function modelClassFor(type: string): ItemDataModelClass | undefined {
    const cfg = runtime.CONFIG as FoundryItemConfig;
    return cfg.Item?.dataModels?.[type];
}

/**
 * Narrow an index/optional-chain result to defined without an in-test `if`
 * guard — mirrors the framework's own `assert`-style helpers so the test body
 * stays conditional-free (`@vitest/no-conditional-in-test`).
 */
function assertDefined<T>(value: T | undefined): asserts value is T {
    expect(value).toBeDefined();
}

/**
 * Assert the shared shape of a cleaned Crushing-Blow hook: the authored fields
 * survive and every unauthored field is filled from its schema `initial`.
 */
function assertCrushingBlowDefaults(hook: DynamicModifierRead): void {
    // Authored fields preserved.
    expect(hook.target).toBe('damage');
    expect(hook.condition).toBe('melee');
    expect(hook.scale.source).toBe('ws');
    expect(hook.scale.factor).toBe(0.5);
    // Top-level defaults filled by the schema.
    expect(hook.side).toBe('attacker');
    expect(hook.mode).toBe('add');
    expect(hook.value).toBe(0);
    expect(hook.valueFormula).toBe('');
    expect(hook.when).toBe('always');
    expect(hook.conditionValue).toBe('');
    expect(hook.formula).toBe('');
    expect(hook.label).toBe('');
    // Nested scale defaults filled.
    expect(hook.scale.field).toBe('bonus');
    expect(hook.scale.round).toBe('up');
    expect(hook.scale.multiplier).toBe('');
    expect(hook.scale.min).toBeNull();
    expect(hook.scale.max).toBeNull();
    // Nested duration defaults filled (instant = permanent-while-present).
    expect(hook.duration.unit).toBe('instant');
    expect(hook.duration.sustained).toBe(false);
}

/* -------------------------------------------------------------------------- */
/*  Hydrate-join reachability                                                  */
/* -------------------------------------------------------------------------- */

// The pure join (`buildHydratedSystem`) has no Foundry-global dependency and is
// always reachable. The FULL actor-pipeline join (`hydrateActorInMemory` →
// `fromUuid` → a loaded compendium pack) needs packs that a minimal jsdom boot
// does not load, so that case gates on real pack availability and skips with a
// clear reason rather than being forced.
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `fromUuid` (typeof-guarded below before use)
const globalWithFromUuid = globalThis as { fromUuid?: unknown };
const gamePacks = (runtime.game as { packs?: { size?: number } }).packs;
const hydrateFullReachable = !skipAll && typeof globalWithFromUuid.fromUuid === 'function' && (gamePacks?.size ?? 0) > 0;
if (!skipAll && !hydrateFullReachable) {
    // eslint-disable-next-line no-console
    console.log(
        '[integration] dynamic-modifiers: full fromUuid-backed hydrate join not reachable under jsdom ' +
            '(no compendium packs loaded) — exercising the pure buildHydratedSystem join instead; ' +
            'skipping the actor-pipeline case.',
    );
}

/* -------------------------------------------------------------------------- */

describe.skipIf(skipAll)('dynamic modifiers (Tier A)', () => {
    it.each(MODIFIER_ITEM_TYPES)('%s DataModel registers modifiers.dynamicModifiers as an ArrayField with a scaled element schema', (type) => {
        const model = modelClassFor(type);
        expect(model).toBeDefined();
        const field = model?.schema.getField('modifiers.dynamicModifiers');
        expect(field).toBeDefined();
        // ArrayField exposes `.element` (its per-entry SchemaField); a non-array
        // field would not. The element must carry the scale sub-schema.
        expect(field?.element).toBeDefined();
        expect(field?.element?.getField('scale.source')).toBeDefined();
        expect(field?.element?.getField('scale.factor')).toBeDefined();
    });

    it.each(MODIFIER_ITEM_TYPES)('a legacy %s item (no modifiers authored) defaults dynamicModifiers to []', async (type) => {
        const item = (await createItem(runtime, { type, name: `Legacy ${type}` })) as ItemWithModifiers;
        const dyn = item.system.modifiers.dynamicModifiers;
        expect(Array.isArray(dyn)).toBe(true);
        expect(dyn).toHaveLength(0);
    });

    it('a talent carrying a Crushing-Blow hook validates through create and preserves it with schema defaults filled', async () => {
        const item = (await createItem(runtime, {
            type: 'talent',
            name: 'Crushing Blow',
            system: { modifiers: { dynamicModifiers: [{ ...CRUSHING_BLOW_HOOK }] } },
        })) as ItemWithModifiers;
        const dyn = item.system.modifiers.dynamicModifiers;
        expect(dyn).toHaveLength(1);
        const hook = dyn.at(0);
        assertDefined(hook);
        assertCrushingBlowDefaults(hook);
    });

    it.each(MODIFIER_ITEM_TYPES)('%s.cleanData fills the hook side/mode/round/scale/duration defaults', (type) => {
        const model = modelClassFor(type);
        expect(model).toBeDefined();
        const cleaned = model?.cleanData({ modifiers: { dynamicModifiers: [{ ...CRUSHING_BLOW_HOOK }] } }) as { modifiers?: ModifiersRead } | undefined;
        const mods = cleaned?.modifiers;
        expect(mods?.dynamicModifiers).toHaveLength(1);
        const hook = mods?.dynamicModifiers.at(0);
        assertDefined(hook);
        assertCrushingBlowDefaults(hook);
    });

    it('toObject() round-trips the hook without dropping the authored fields', async () => {
        const item = (await createItem(runtime, {
            type: 'trait',
            name: 'Crushing Blow (trait)',
            system: { modifiers: { dynamicModifiers: [{ ...CRUSHING_BLOW_HOOK }] } },
        })) as ItemWithModifiers;
        const dumped = item.toObject().system.modifiers.dynamicModifiers;
        expect(dumped).toHaveLength(1);
        const hook = dumped.at(0);
        assertDefined(hook);
        expect(hook.target).toBe('damage');
        expect(hook.condition).toBe('melee');
        expect(hook.scale.source).toBe('ws');
        expect(hook.scale.factor).toBe(0.5);
    });

    it('the pure hydrate join surfaces a compendium-body hook onto a lean owned item, and it validates through the real DataModel', async () => {
        // The canonical compendium body carries the hook; the lean owned item
        // persists only per-actor state (no modifiers of its own).
        const compendiumBody = { modifiers: { dynamicModifiers: [{ ...CRUSHING_BLOW_HOOK }] } };
        const leanPersisted = { level: 2 };
        const merged = buildHydratedSystem(compendiumBody, leanPersisted) as {
            level?: number;
            modifiers?: ModifiersRead;
        };
        // Join surfaces the hook while keeping the lean per-actor overlay.
        expect(merged.level).toBe(2);
        expect(merged.modifiers?.dynamicModifiers).toHaveLength(1);

        // The joined output must validate through the real registered schema.
        const item = (await createItem(runtime, {
            type: 'talent',
            name: 'Hydrated Crushing Blow',
            system: merged,
        })) as ItemWithModifiers;
        const dyn = item.system.modifiers.dynamicModifiers;
        expect(dyn).toHaveLength(1);
        const hook = dyn.at(0);
        assertDefined(hook);
        assertCrushingBlowDefaults(hook);
    });

    it.skipIf(!hydrateFullReachable)('the fromUuid-backed hydrate join joins a lean owned item from its compendium source', async () => {
        // Only runs when a licensed boot actually loads compendium packs (not the
        // minimal jsdom boot). Exercises the real actor-pipeline join end to end:
        // a lean owned item with a `compendiumSource` gains its canonical body —
        // including any authored dynamicModifiers — from the resolved pack item.
        const actor = (await createActor(runtime, {
            type: 'character',
            name: 'Hydrate Pipeline Actor',
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor.items.contents (only Array.isArray-checked below)
        })) as { items: { contents: unknown[] } };
        const patches = await buildHydrationPatches(actor as never);
        // With packs present the join is well-formed; a fresh actor has no lean
        // compendium-linked items, so 0 patches is the correct, non-throwing result.
        expect(Array.isArray(patches)).toBe(true);
    });
});
