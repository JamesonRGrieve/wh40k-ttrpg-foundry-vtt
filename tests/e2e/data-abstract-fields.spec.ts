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
            // Probe-side shapes. Metadata/_defaults property types are
            // intentionally a touch wider than the runtime literal (e.g.
            // `systemFlagsModel: null` rather than `null` literal) so the
            // runtime equality guards below still carry meaning under
            // type-checked ESLint instead of collapsing to no-overlap.
            type FrozenObject = Readonly<Record<string, never>>;
            interface SystemMetadata {
                systemFlagsModel: object | null;
            }
            interface ItemMetadata {
                enchantable: boolean;
                hasEffects: boolean;
                singleton: boolean;
                systemFlagsModel: object | null;
            }
            interface ActorMetadata {
                supportsAdvancement: boolean;
                systemFlagsModel: object | null;
            }
            type ClassCtor = new (...args: never[]) => object;
            interface MixinResult {
                syntheticMarker?: string;
                _schemaTemplates?: ClassCtor[];
            }
            interface SchemaDict {
                [key: string]: number;
            }
            // `_initializationOrder` yields `[fieldName, field]` schema entries
            // in dependency order. We only drain it (never inspect entries), so
            // the element shape just needs to be iterable.
            interface IterableResult {
                [Symbol.iterator]: () => Iterator<readonly [string, object]>;
            }
            interface SystemDataModelCtor extends ClassCtor {
                metadata: SystemMetadata & FrozenObject;
                mergeSchema: (a: SchemaDict, b: SchemaDict) => SchemaDict;
                _migrateData: (source: Record<string, never>) => void;
                _cleanData: (source: Record<string, never> | undefined) => void;
                mixin: (template: ClassCtor) => MixinResult;
                _initializationOrder: () => IterableResult;
                _schemaTemplates: ClassCtor[];
                defineSchema: () => SchemaDict;
            }
            // `_migrateData` rewrites the string forms of `description` /
            // `source` into their object forms in place, and `coverage` /
            // `properties` arrays into Sets, so each field is the union of
            // its pre- and post-migration shapes.
            interface ItemMigrateSource {
                description?: string | { value?: string; chat?: string; summary?: string };
                source?: string | { provenance?: string; book?: string; page?: string };
                coverage?: string[] | Set<string>;
                properties?: string[] | Set<string>;
                img?: string;
                type?: string;
            }
            interface ItemDataModelCtor {
                metadata: ItemMetadata & FrozenObject;
                _migrateData: (source: ItemMigrateSource) => void;
            }
            // The flat-string → object description/source migration lives in the
            // DescriptionTemplate mixin, not bare ItemDataModel (whose _schemaTemplates
            // is empty, so it only migrates img/coverage/lineVariants).
            interface DescriptionTemplateCtor {
                _migrateData: (source: ItemMigrateSource) => void;
            }
            interface ActorDataModelCtor {
                metadata: ActorMetadata & FrozenObject;
                _migrateData: (source: { name?: string; type?: string }) => void;
            }
            interface FieldInstance {
                _validateType: (value: string) => void;
            }
            interface FormulaFieldCtor {
                _defaults: { deterministic: boolean };
                new (options: { deterministic: boolean }): FieldInstance;
            }
            interface IdentifierFieldCtor {
                _defaults: { nullable: boolean; blank: boolean; textSearch: boolean };
                fromName: (name: string) => string;
                new (options: Record<string, never>): FieldInstance;
            }
            interface LoadedModule<T> {
                default: T;
                __importError?: string;
            }

            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/data`;
            const loadModule = async <T>(path: string): Promise<LoadedModule<T>> => {
                try {
                    return (await import(`${base}/${path}.js`)) as LoadedModule<T>;
                } catch (err) {
                    return { __importError: String(err instanceof Error ? err.message : err) } as LoadedModule<T>;
                }
            };
            const guarded = (name: FlowName, fn: () => boolean | string): void => {
                try {
                    const r = fn();
                    if (typeof r === 'string') record(name, false, r);
                    else record(name, r, null);
                } catch (err) {
                    record(name, false, String(err instanceof Error ? err.message : err));
                }
            };

            // ---------- abstract/system-data-model ----------
            const sdmMod = await loadModule<SystemDataModelCtor>('abstract/system-data-model');
            const systemFlowKeys = [
                'system-data-model-metadata-default',
                'system-data-model-mergeSchema',
                'system-data-model-migrateData-empty',
                'system-data-model-cleanData-empty',
                'system-data-model-mixin-both-branches',
                'system-data-model-initializationOrder-generator',
            ] as const;
            if (sdmMod.__importError !== undefined) {
                for (const k of systemFlowKeys) record(k, false, sdmMod.__importError);
            } else {
                const SystemDataModel = sdmMod.default;
                guarded('system-data-model-metadata-default', () => {
                    const meta = SystemDataModel.metadata;
                    return meta.systemFlagsModel === null && Object.isFrozen(meta);
                });
                guarded('system-data-model-mergeSchema', () => {
                    const a: SchemaDict = { foo: 1 };
                    const b: SchemaDict = { bar: 2, foo: 3 };
                    const merged = SystemDataModel.mergeSchema(a, b);
                    return merged === a && merged['foo'] === 3 && merged['bar'] === 2;
                });
                guarded('system-data-model-migrateData-empty', () => {
                    const source: Record<string, never> = {};
                    SystemDataModel._migrateData(source);
                    return Object.keys(source).length === 0;
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
                        SystemDataModel.mixin(NotASDM);
                    } catch (err) {
                        rejected = String(err instanceof Error ? err.message : err).includes('not a subclass of SystemDataModel');
                    }
                    // Branch 2: synthetic SystemDataModel subclass is accepted and produces a new Base class.
                    class SyntheticTemplate extends SystemDataModel {
                        static override defineSchema(): SchemaDict {
                            return {};
                        }
                        static syntheticMarker = 'mixed-in';
                    }
                    const Mixed = SystemDataModel.mixin(SyntheticTemplate);
                    const templates = Mixed._schemaTemplates;
                    const happyOk = Mixed.syntheticMarker === 'mixed-in' && Array.isArray(templates) && templates.includes(SyntheticTemplate);
                    return rejected && happyOk;
                });
                guarded('system-data-model-initializationOrder-generator', () => {
                    // The generator yields schema-template entries first, then
                    // top-level entries; on the bare class with no templates,
                    // the iteration body of the inner loop is skipped, and we
                    // simply verify a generator is returned and is iterable.
                    const gen = SystemDataModel._initializationOrder();
                    // Drain the iterator: on the bare class with no templates it
                    // yields nothing, but it must be iterable without throwing,
                    // which exercises the generator's setup path. Reaching the
                    // return at all means iteration completed successfully.
                    void [...gen];
                    return true;
                });
            }

            // ---------- abstract/item-data-model ----------
            const idmMod = await loadModule<ItemDataModelCtor>('abstract/item-data-model');
            const itemFlowKeys = [
                'item-data-model-metadata-merged',
                'item-data-model-migrate-description-promotion',
                'item-data-model-migrate-source-promotion',
                'item-data-model-migrate-coverage-array-to-set',
                'item-data-model-migrate-img-default-icon',
            ] as const;
            if (idmMod.__importError !== undefined) {
                for (const k of itemFlowKeys) record(k, false, idmMod.__importError);
            } else {
                const ItemDataModel = idmMod.default;
                // DescriptionTemplate owns the flat-string → object migration for
                // description/source; load it so those two flows test the real owner.
                const descTmplMod = await loadModule<DescriptionTemplateCtor>('shared/description-template');
                const DescriptionTemplate =
                    descTmplMod.__importError === undefined ? descTmplMod.default : (ItemDataModel as unknown as DescriptionTemplateCtor);
                guarded('item-data-model-metadata-merged', () => {
                    const meta = ItemDataModel.metadata;
                    return !meta.enchantable && !meta.hasEffects && !meta.singleton && meta.systemFlagsModel === null && Object.isFrozen(meta);
                });
                guarded('item-data-model-migrate-description-promotion', () => {
                    // Flat-string → {value, chat, summary} migration lives in DescriptionTemplate.
                    const source: ItemMigrateSource = { description: 'A plain string description.' };
                    DescriptionTemplate._migrateData(source);
                    const desc = source.description;
                    return typeof desc === 'object' && desc.value === 'A plain string description.' && desc.chat === '' && desc.summary === '';
                });
                guarded('item-data-model-migrate-source-promotion', () => {
                    // The source schema is now { provenance, book, page, url, derivedFrom,
                    // errata } (the legacy `custom` field was removed); a flat non-homebrew
                    // string migrates into `book` under provenance 'raw'. Owned by
                    // DescriptionTemplate, not bare ItemDataModel.
                    const source: ItemMigrateSource = { source: 'Dark Heresy 2e, p.123' };
                    DescriptionTemplate._migrateData(source);
                    const src = source.source;
                    return typeof src === 'object' && src.provenance === 'raw' && src.book === 'Dark Heresy 2e, p.123' && src.page === '';
                });
                guarded('item-data-model-migrate-coverage-array-to-set', () => {
                    const source: ItemMigrateSource = { coverage: ['head', 'body'], properties: ['reliable', 'tearing'] };
                    ItemDataModel._migrateData(source);
                    const coverage = source.coverage;
                    const properties = source.properties;
                    return coverage instanceof Set && properties instanceof Set && coverage.has('head') && coverage.has('body') && properties.has('reliable');
                });
                guarded('item-data-model-migrate-img-default-icon', () => {
                    const invalid: ItemMigrateSource = { img: 'some-image.tiff', type: 'weapon' };
                    ItemDataModel._migrateData(invalid);
                    const valid: ItemMigrateSource = { img: 'systems/wh40k-rpg/assets/weapon.webp', type: 'weapon' };
                    ItemDataModel._migrateData(valid);
                    const unknownType: ItemMigrateSource = { img: 'nope.tiff', type: 'this-type-has-no-default' };
                    ItemDataModel._migrateData(unknownType);
                    return (
                        invalid.img === 'icons/svg/sword.svg' &&
                        valid.img === 'systems/wh40k-rpg/assets/weapon.webp' &&
                        unknownType.img === 'icons/svg/mystery-man.svg'
                    );
                });
            }

            // ---------- abstract/actor-data-model ----------
            const admMod = await loadModule<ActorDataModelCtor>('abstract/actor-data-model');
            const actorFlowKeys = ['actor-data-model-metadata-supportsAdvancement', 'actor-data-model-migrate-noop'] as const;
            if (admMod.__importError !== undefined) {
                for (const k of actorFlowKeys) record(k, false, admMod.__importError);
            } else {
                const ActorDataModel = admMod.default;
                guarded('actor-data-model-metadata-supportsAdvancement', () => {
                    const meta = ActorDataModel.metadata;
                    return !meta.supportsAdvancement && meta.systemFlagsModel === null && Object.isFrozen(meta);
                });
                guarded('actor-data-model-migrate-noop', () => {
                    const source: { name?: string; type?: string } = { name: 'Inquisitor Tharn', type: 'npc' };
                    ActorDataModel._migrateData(source);
                    return source.name === 'Inquisitor Tharn' && source.type === 'npc';
                });
            }

            // ---------- fields/formula-field ----------
            const ffMod = await loadModule<FormulaFieldCtor>('fields/formula-field');
            const formulaFlowKeys = ['formula-field-defaults-deterministic', 'formula-field-validateType-branches'] as const;
            if (ffMod.__importError !== undefined) {
                for (const k of formulaFlowKeys) record(k, false, ffMod.__importError);
            } else {
                const FormulaField = ffMod.default;
                guarded('formula-field-defaults-deterministic', () => {
                    const defaults = FormulaField._defaults;
                    return !defaults.deterministic;
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
                    // Branch 3: a formula that throws in the Roll constructor is wrapped
                    // as "Invalid formula: ...". Foundry's parser is lenient (bare words
                    // become string terms), so try several genuinely-malformed formulas
                    // and accept if any trips the wrapper.
                    let invalidThrew = false;
                    let invalidProbed = '';
                    for (const bad of ['1d10 + (2 *', ')(', '1d10 ++ 5', '1d', '/2', '* 5', '1d10 )']) {
                        try {
                            field._validateType(bad);
                        } catch (err) {
                            if (String(err instanceof Error ? err.message : err).includes('Invalid formula')) {
                                invalidThrew = true;
                                invalidProbed = bad;
                                break;
                            }
                        }
                    }
                    // Branch 4: deterministic=true rejects dice expressions.
                    let detRejected = false;
                    const detField = new FormulaField({ deterministic: true });
                    try {
                        detField._validateType('1d10');
                    } catch (err) {
                        // Either "must be deterministic" or "Invalid formula" wrapper — both
                        // exercise the deterministic branch of _validateType.
                        const msg = String(err instanceof Error ? err.message : err);
                        detRejected = msg.includes('deterministic') || msg.includes('Invalid formula');
                    }
                    if (!validOk) return 'branch2: valid formula 1d10+5 threw unexpectedly';
                    if (!invalidThrew) return 'branch3: no malformed formula tripped the Invalid-formula wrapper';
                    if (!detRejected) {
                        const detFlag = (detField as unknown as { deterministic?: boolean }).deterministic;
                        let rollDet = 'n/a';
                        try {
                            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Roll global is injected by the licensed app; no shipped type in the page context
                            const RollCls = (globalThis as unknown as { Roll?: new (f: string) => { isDeterministic: boolean } }).Roll;
                            if (RollCls !== undefined) rollDet = String(new RollCls('1d10').isDeterministic);
                        } catch {
                            rollDet = 'roll-threw';
                        }
                        return `branch4: deterministic field did not reject 1d10 (field.deterministic=${String(detFlag)} roll.isDeterministic=${rollDet})`;
                    }
                    void invalidProbed;
                    return true;
                });
            }

            // ---------- fields/identifier-field ----------
            const ifMod = await loadModule<IdentifierFieldCtor>('fields/identifier-field');
            const identifierFlowKeys = [
                'identifier-field-defaults-blank',
                'identifier-field-validateType-branches',
                'identifier-field-fromName-kebab',
            ] as const;
            if (ifMod.__importError !== undefined) {
                for (const k of identifierFlowKeys) record(k, false, ifMod.__importError);
            } else {
                const IdentifierField = ifMod.default;
                guarded('identifier-field-defaults-blank', () => {
                    const defaults = IdentifierField._defaults;
                    return !defaults.nullable && defaults.blank && defaults.textSearch;
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
                        invalidThrew = String(err instanceof Error ? err.message : err).includes('must contain only');
                    }
                    return validOk && legacyOk && invalidThrew;
                });
                guarded('identifier-field-fromName-kebab', () => {
                    const kebab = IdentifierField.fromName('Rogue Trader (Voidmaster)');
                    const trimmed = IdentifierField.fromName('  --Foo!! Bar?? --');
                    const collapsed = IdentifierField.fromName('multi   space');
                    return kebab === 'rogue-trader-voidmaster' && trimmed === 'foo-bar' && collapsed === 'multi-space';
                });
            }

            return out;
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

        expect(failures, `${failures.length}/${DATA_ABSTRACT_FIELDS_FLOWS.length} data-abstract-fields flows failed:\n  - ${failures.join('\n  - ')}`).toEqual(
            [],
        );
    });
});
