import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of `src/module/data/abstract/*` and the custom
 * `src/module/data/fields/*` field types that `data-layer.spec.ts` does
 * NOT touch (it owns MappingField; everything else here is in scope).
 * These modules sit at the very bottom of the DataModel stack — every
 * concrete actor / item DataModel extends `SystemDataModel`, every Item
 * subclass extends `ItemDataModel`, every Actor subclass extends
 * `ActorDataModel`, and the three custom fields are sprinkled across
 * dozens of `defineSchema()` blocks. But the abstract bases only fire
 * through the concrete subclasses in normal Tier B runs, which means
 * the static helpers (`mergeSchema`, `_migrateData`, `_cleanData`,
 * `mixin`, `_initializationOrder`) and
 * the field type internals (`_validateType`, `evaluate`,
 * `IdentifierField.fromName`) only execute incidentally and never
 * surface their error / branch paths under v8 coverage.
 *
 * This spec dynamic-imports each module and exercises every overridable
 * hook the bases declare, plus both valid and intentionally-invalid
 * field inputs to fire both branches of `_validateType`. For
 * `SystemDataModel.mixin` we construct a synthetic subclass of
 * `SystemDataModel` (via `class T extends Mod.default { static
 * defineSchema(){ return {} } }`) so we can drive the mixin and
 * `_initializationOrder` generator without instantiating a concrete
 * Foundry document.
 *
 * Modules exercised:
 *   - `abstract/system-data-model.ts` — `metadata`, `mergeSchema`,
 *     `_migrateData`, `_cleanData`,
 *     `mixin` (subclass-guard branch),
 *     `_initializationOrder` (generator).
 *   - `abstract/item-data-model.ts` — `_migrateData` description /
 *     source / coverage / properties / img migration helpers, frozen
 *     metadata shape.
 *   - `abstract/actor-data-model.ts` — frozen metadata shape,
 *     `_migrateData` no-op on unrelated fields.
 *   - `fields/formula-field.ts` — `_defaults.deterministic`,
 *     `_validateType` empty / valid / invalid branches.
 *   - `fields/identifier-field.ts` — `_defaults.blank`, `_validateType`
 *     empty / valid / invalid branches, `fromName` kebab-casing.
 *
 * Keys MUST match the DATA_ABSTRACT_FIELDS_FLOWS constant in
 * scripts/e2e-coverage.mjs (registered by the orchestrator).
 */

const DATA_ABSTRACT_FIELDS_FLOWS = [
    'system-data-model-metadata-default',
    'system-data-model-mergeSchema',
    'system-data-model-migrateData-empty',
    'system-data-model-cleanData-empty',
    'system-data-model-mixin-both-branches',
    'system-data-model-initializationOrder-generator',
    'item-data-model-metadata-merged',
    'item-data-model-migrate-description-promotion',
    'item-data-model-migrate-source-promotion',
    'item-data-model-migrate-coverage-array-to-set',
    'item-data-model-migrate-img-default-icon',
    'actor-data-model-metadata-supportsAdvancement',
    'actor-data-model-migrate-noop',
    'formula-field-defaults-deterministic',
    'formula-field-validateType-branches',
    'identifier-field-defaults-blank',
    'identifier-field-validateType-branches',
    'identifier-field-fromName-kebab',
] as const;

type FlowName = (typeof DATA_ABSTRACT_FIELDS_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeAbstractFields(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: dynamic-imported modules are runtime-only */
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/data`;
            const loadModule = async (path: string): Promise<any> => {
                try {
                    return await import(`${base}/${path}.js`);
                } catch (err) {
                    return { __importError: String((err as Error)?.message ?? err) };
                }
            };
            const guarded = (name: FlowName, fn: () => boolean | string): void => {
                try {
                    const r = fn();
                    if (typeof r === 'string') record(name, false, r);
                    else record(name, r, null);
                } catch (err) {
                    record(name, false, String((err as Error)?.message ?? err));
                }
            };

            // ---------- abstract/system-data-model ----------
            const sdmMod = await loadModule('abstract/system-data-model');
            const systemFlowKeys = [
                'system-data-model-metadata-default',
                'system-data-model-mergeSchema',
                'system-data-model-migrateData-empty',
                'system-data-model-cleanData-empty',
                'system-data-model-mixin-both-branches',
                'system-data-model-initializationOrder-generator',
            ] as const;
            if (sdmMod?.__importError) {
                for (const k of systemFlowKeys) record(k, false, sdmMod.__importError);
            } else {
                const SystemDataModel = sdmMod.default;
                guarded('system-data-model-metadata-default', () => {
                    const meta = SystemDataModel.metadata;
                    return meta !== null && typeof meta === 'object' && meta.systemFlagsModel === null && Object.isFrozen(meta);
                });
                guarded('system-data-model-mergeSchema', () => {
                    const a: Record<string, unknown> = { foo: 1 };
                    const b: Record<string, unknown> = { bar: 2, foo: 3 };
                    const merged = SystemDataModel.mergeSchema(a, b);
                    return merged === a && merged.foo === 3 && merged.bar === 2;
                });
                guarded('system-data-model-migrateData-empty', () => {
                    const source: Record<string, unknown> = {};
                    SystemDataModel._migrateData(source);
                    return typeof source === 'object';
                });
                guarded('system-data-model-cleanData-empty', () => {
                    // _cleanData accepts undefined / empty source without iterating
                    // any schema templates on the bare class — branch coverage of
                    // the empty-templates path.
                    SystemDataModel._cleanData(undefined);
                    SystemDataModel._cleanData({});
                    return true;
                });
                guarded('system-data-model-mixin-both-branches', () => {
                    // Branch 1: non-subclass template is rejected.
                    class NotASDM {}
                    let rejected = false;
                    try {
                        SystemDataModel.mixin(NotASDM as any);
                    } catch (err) {
                        rejected = String((err as Error)?.message ?? err).includes('not a subclass of SystemDataModel');
                    }
                    // Branch 2: synthetic SystemDataModel subclass is accepted and produces a new Base class.
                    class SyntheticTemplate extends SystemDataModel {
                        static override defineSchema(): Record<string, unknown> {
                            return {};
                        }
                        static syntheticMarker = 'mixed-in';
                    }
                    const Mixed = SystemDataModel.mixin(SyntheticTemplate as any);
                    const happyOk =
                        typeof Mixed === 'function' &&
                        Mixed !== SystemDataModel &&
                        (Mixed as any).syntheticMarker === 'mixed-in' &&
                        Array.isArray((Mixed as any)._schemaTemplates) &&
                        (Mixed as any)._schemaTemplates.includes(SyntheticTemplate);
                    return rejected === true && happyOk === true;
                });
                guarded('system-data-model-initializationOrder-generator', () => {
                    // The generator yields schema-template entries first, then
                    // top-level entries; on the bare class with no templates,
                    // the iteration body of the inner loop is skipped, and we
                    // simply verify a generator is returned and is iterable.
                    const gen = SystemDataModel._initializationOrder();
                    return gen !== null && typeof gen === 'object' && typeof gen[Symbol.iterator] === 'function';
                });
            }

            // ---------- abstract/item-data-model ----------
            const idmMod = await loadModule('abstract/item-data-model');
            const itemFlowKeys = [
                'item-data-model-metadata-merged',
                'item-data-model-migrate-description-promotion',
                'item-data-model-migrate-source-promotion',
                'item-data-model-migrate-coverage-array-to-set',
                'item-data-model-migrate-img-default-icon',
            ] as const;
            if (idmMod?.__importError) {
                for (const k of itemFlowKeys) record(k, false, idmMod.__importError);
            } else {
                const ItemDataModel = idmMod.default;
                guarded('item-data-model-metadata-merged', () => {
                    const meta = ItemDataModel.metadata;
                    return (
                        meta !== null &&
                        typeof meta === 'object' &&
                        meta.enchantable === false &&
                        meta.hasEffects === false &&
                        meta.singleton === false &&
                        meta.systemFlagsModel === null &&
                        Object.isFrozen(meta)
                    );
                });
                guarded('item-data-model-migrate-description-promotion', () => {
                    const source: Record<string, unknown> = { description: 'A plain string description.' };
                    ItemDataModel._migrateData(source);
                    const desc = source['description'] as { value?: unknown; chat?: unknown; summary?: unknown } | undefined;
                    return (
                        desc !== undefined &&
                        typeof desc === 'object' &&
                        desc.value === 'A plain string description.' &&
                        desc.chat === '' &&
                        desc.summary === ''
                    );
                });
                guarded('item-data-model-migrate-source-promotion', () => {
                    const source: Record<string, unknown> = { source: 'Dark Heresy 2e, p.123' };
                    ItemDataModel._migrateData(source);
                    const src = source['source'] as { book?: unknown; page?: unknown; custom?: unknown } | undefined;
                    return src !== undefined && typeof src === 'object' && src.custom === 'Dark Heresy 2e, p.123' && src.book === '' && src.page === '';
                });
                guarded('item-data-model-migrate-coverage-array-to-set', () => {
                    const source: Record<string, unknown> = { coverage: ['head', 'body'], properties: ['reliable', 'tearing'] };
                    ItemDataModel._migrateData(source);
                    const coverage = source['coverage'];
                    const properties = source['properties'];
                    return (
                        coverage instanceof Set &&
                        properties instanceof Set &&
                        (coverage as Set<string>).has('head') &&
                        (coverage as Set<string>).has('body') &&
                        (properties as Set<string>).has('reliable')
                    );
                });
                guarded('item-data-model-migrate-img-default-icon', () => {
                    const invalid: Record<string, unknown> = { img: 'some-image.tiff', type: 'weapon' };
                    ItemDataModel._migrateData(invalid);
                    const valid: Record<string, unknown> = { img: 'systems/wh40k-rpg/assets/weapon.webp', type: 'weapon' };
                    ItemDataModel._migrateData(valid);
                    const unknownType: Record<string, unknown> = { img: 'nope.tiff', type: 'this-type-has-no-default' };
                    ItemDataModel._migrateData(unknownType);
                    return (
                        invalid['img'] === 'icons/svg/sword.svg' &&
                        valid['img'] === 'systems/wh40k-rpg/assets/weapon.webp' &&
                        unknownType['img'] === 'icons/svg/mystery-man.svg'
                    );
                });
            }

            // ---------- abstract/actor-data-model ----------
            const admMod = await loadModule('abstract/actor-data-model');
            const actorFlowKeys = ['actor-data-model-metadata-supportsAdvancement', 'actor-data-model-migrate-noop'] as const;
            if (admMod?.__importError) {
                for (const k of actorFlowKeys) record(k, false, admMod.__importError);
            } else {
                const ActorDataModel = admMod.default;
                guarded('actor-data-model-metadata-supportsAdvancement', () => {
                    const meta = ActorDataModel.metadata;
                    return (
                        meta !== null &&
                        typeof meta === 'object' &&
                        meta.supportsAdvancement === false &&
                        meta.systemFlagsModel === null &&
                        Object.isFrozen(meta)
                    );
                });
                guarded('actor-data-model-migrate-noop', () => {
                    const source: Record<string, unknown> = { name: 'Inquisitor Tharn', type: 'npc' };
                    ActorDataModel._migrateData(source);
                    return source['name'] === 'Inquisitor Tharn' && source['type'] === 'npc';
                });
            }

            // ---------- fields/formula-field ----------
            const ffMod = await loadModule('fields/formula-field');
            const formulaFlowKeys = ['formula-field-defaults-deterministic', 'formula-field-validateType-branches'] as const;
            if (ffMod?.__importError) {
                for (const k of formulaFlowKeys) record(k, false, ffMod.__importError);
            } else {
                const FormulaField = ffMod.default;
                guarded('formula-field-defaults-deterministic', () => {
                    const defaults = FormulaField._defaults;
                    return defaults !== null && typeof defaults === 'object' && defaults.deterministic === false;
                });
                guarded('formula-field-validateType-branches', () => {
                    // Branch 1: empty string short-circuits (no Roll constructed).
                    const field = new FormulaField({ deterministic: false });
                    field._validateType('');
                    // Branch 2: valid formula passes through new Roll(...) without throwing.
                    let validOk = true;
                    try {
                        field._validateType('1d10+5');
                    } catch {
                        validOk = false;
                    }
                    // Branch 3: malformed formula throws "Invalid formula: ...".
                    let invalidThrew = false;
                    try {
                        field._validateType('this is not a roll formula @@@');
                    } catch (err) {
                        invalidThrew = String((err as Error)?.message ?? err).includes('Invalid formula');
                    }
                    // Branch 4: deterministic=true rejects dice expressions.
                    let detRejected = false;
                    const detField = new FormulaField({ deterministic: true });
                    try {
                        detField._validateType('1d10');
                    } catch (err) {
                        // Either "must be deterministic" or "Invalid formula" wrapper — both
                        // exercise the deterministic branch of _validateType.
                        const msg = String((err as Error)?.message ?? err);
                        detRejected = msg.includes('deterministic') || msg.includes('Invalid formula');
                    }
                    return validOk && invalidThrew && detRejected;
                });
            }

            // ---------- fields/identifier-field ----------
            const ifMod = await loadModule('fields/identifier-field');
            const identifierFlowKeys = [
                'identifier-field-defaults-blank',
                'identifier-field-validateType-branches',
                'identifier-field-fromName-kebab',
            ] as const;
            if (ifMod?.__importError) {
                for (const k of identifierFlowKeys) record(k, false, ifMod.__importError);
            } else {
                const IdentifierField = ifMod.default;
                guarded('identifier-field-defaults-blank', () => {
                    const defaults = IdentifierField._defaults;
                    return (
                        defaults !== null &&
                        typeof defaults === 'object' &&
                        defaults.nullable === false &&
                        defaults.blank === true &&
                        defaults.textSearch === true
                    );
                });
                guarded('identifier-field-validateType-branches', () => {
                    const field = new IdentifierField({});
                    // Empty short-circuits.
                    field._validateType('');
                    // Valid identifier — letters, numbers, underscores, hyphens.
                    let validOk = true;
                    try {
                        field._validateType('rogue-trader_01');
                    } catch {
                        validOk = false;
                    }
                    // CamelCase legacy identifier is also accepted by the permissive regex.
                    let legacyOk = true;
                    try {
                        field._validateType('weaponSkill');
                    } catch {
                        legacyOk = false;
                    }
                    // Disallowed character (space) — must throw.
                    let invalidThrew = false;
                    try {
                        field._validateType('not allowed here');
                    } catch (err) {
                        invalidThrew = String((err as Error)?.message ?? err).includes('must contain only');
                    }
                    return validOk === true && legacyOk === true && invalidThrew === true;
                });
                guarded('identifier-field-fromName-kebab', () => {
                    const kebab = IdentifierField.fromName('Rogue Trader (Voidmaster)');
                    const trimmed = IdentifierField.fromName('  --Foo!! Bar?? --');
                    const collapsed = IdentifierField.fromName('multi   space');
                    return (
                        kebab === 'rogue-trader-voidmaster' &&
                        trimmed === 'foo-bar' &&
                        collapsed === 'multi-space'
                    );
                });
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('data/abstract + data/fields (Tier B)', () => {
    test('SystemDataModel / ItemDataModel / ActorDataModel + Formula/Identifier fields drive their static hooks under coverage', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeAbstractFields(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('data-abstract-fields.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of DATA_ABSTRACT_FIELDS_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(
            failures,
            `${failures.length}/${DATA_ABSTRACT_FIELDS_FLOWS.length} data-abstract-fields flows failed:\n  - ${failures.join('\n  - ')}`,
        ).toEqual([]);
    });
});
