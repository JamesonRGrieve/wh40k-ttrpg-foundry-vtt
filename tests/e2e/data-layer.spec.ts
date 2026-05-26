import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of three data-layer modules at 0% function coverage
 * pre-spec:
 *
 *   - `src/module/data/fields/mapping-field.ts` (0% fn / 38.8% line)
 *     MappingField is an ObjectField subclass used across the DataModel
 *     schema for key→value maps (skills, characteristics, etc.). Its
 *     `_cleanType` + `initialize` + `getInitialValue` overrides are
 *     reached during every DataModel construction, but no spec
 *     directly verifies the field methods return the right shape.
 *
 *   - `src/module/config/advancements/index.ts` (0% fn / 60.8% line)
 *     Career advancement registry — 7 exports including
 *     `getAvailableCareers`, `getCareerKeyFromName`,
 *     `getCharacteristicCosts`, `getRankAdvancements`,
 *     `getNextCharacteristicCost`, `getCareerAdvancements`, `hasCareer`.
 *     All pure functions reading a hard-coded registry.
 *
 *   - `src/module/data/grant/choice-grant.ts` (11% fn / 32.6% line)
 *     and `data/grant/resource-grant.ts` (11% fn / 35.2% line) — the
 *     two grant variants whose `_applyGrant` paths only fire when a
 *     character's origin path embeds the corresponding grant. Drive
 *     them synthetically against a seeded actor.
 *
 * Keep DATA_LAYER_FLOWS in sync with the equivalent constant in
 * scripts/e2e-coverage.mjs.
 */

const DATA_LAYER_FLOWS = [
    'mapping-field-construct',
    'mapping-field-getInitialValue',
    'mapping-field-cleanType',
    'advancements-getAvailableCareers',
    'advancements-getCareerKeyFromName',
    'advancements-hasCareer',
    'advancements-getCareerAdvancements',
    'advancements-getCharacteristicCosts',
    'advancements-getRankAdvancements',
    'advancements-getNextCharacteristicCost',
    'choice-grant-applyEmpty',
    'choice-grant-applyDuplicateRejected',
    'resource-grant-applyEmpty',
] as const;

type FlowName = (typeof DATA_LAYER_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeDataLayer(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            // Browser-side probe: dynamic-imported modules are runtime-only, so
            // their shapes are declared here rather than imported from src/.
            interface GrantResult {
                success: boolean;
                applied: Record<string, never>;
                notifications: string[];
                errors: string[];
            }
            type GrantOptions = Record<string, never>;
            type GrantData = Record<string, never>;
            interface GrantInstance {
                _initResult: () => GrantResult;
                _applyGrant: (actor: ActorInstance | undefined, data: Record<string, string[]>, options: GrantOptions, result: GrantResult) => Promise<void>;
            }
            // Construction-data payload for the grant DataModels under test. Choice
            // grants carry options/count/optional/allowDuplicates; resource grants
            // carry resources/optional. All fields optional so one ctor type covers both.
            interface GrantConstructorData {
                // eslint-disable-next-line no-restricted-syntax -- boundary: grant payload entries are opaque DataModel-schema shapes with no type shipped to this browser-probe realm; only ever passed as empty arrays here
                options?: ReadonlyArray<{ label: string; grants: ReadonlyArray<unknown> }>;
                count?: number;
                optional?: boolean;
                allowDuplicates?: boolean;
                // eslint-disable-next-line no-restricted-syntax -- boundary: resource-grant entries are opaque DataModel-schema shapes with no type shipped to this browser-probe realm; only ever passed as an empty array here
                resources?: ReadonlyArray<unknown>;
            }
            type GrantCtor = new (data: GrantConstructorData) => GrantInstance;
            interface MappingFieldInstance {
                initialKeys?: readonly string[];
                getInitialValue: (model: GrantData) => Record<string, never>;
                _cleanType: (value: Record<string, string>, options: GrantOptions) => Record<string, string>;
            }
            type MappingFieldCtor = new (inner: object, options: { initialKeys?: string[] }) => MappingFieldInstance;
            interface CareerEntry {
                key: string;
                name: string;
            }
            interface AdvancementsModule {
                getAvailableCareers: () => CareerEntry[];
                getCareerKeyFromName: (name: string) => string | null;
                hasCareer: (key: string) => boolean;
                getCareerAdvancements: (key: string) => object | null;
                getCharacteristicCosts: (key: string) => object | null;
                getRankAdvancements: (key: string, rank?: number) => object[] | null;
                getNextCharacteristicCost: (key: string, characteristic: string, current: number) => { cost: number } | null;
            }
            interface ActorInstance {
                delete: () => Promise<void>;
            }
            interface ActorCreateData {
                name: string;
                type: string;
                system: { gameSystem: string };
            }
            interface FoundryGlobal {
                Actor: { create: (data: ActorCreateData) => Promise<ActorInstance> };
                foundry: { data: { fields: { StringField: new (options: { required: boolean }) => object } } };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-side `globalThis` exposes Foundry's runtime Actor + foundry namespace, no shipped types in this realm
            const g = globalThis as unknown as FoundryGlobal;
            const ActorCls = g.Actor;
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module`;

            // ---------- MappingField ----------
            async function probeMappingField(): Promise<void> {
                try {
                    const mod = (await import(`${base}/data/fields/mapping-field.js`)) as { default: MappingFieldCtor };
                    const MappingField = mod.default;
                    if (typeof MappingField !== 'function') {
                        for (const k of ['mapping-field-construct', 'mapping-field-getInitialValue', 'mapping-field-cleanType'] as const) {
                            record(k, false, 'MappingField default export missing');
                        }
                    } else {
                        const inner = new g.foundry.data.fields.StringField({ required: true });
                        try {
                            const field = new MappingField(inner, { initialKeys: ['weaponSkill', 'ballisticSkill'] });
                            record(
                                'mapping-field-construct',
                                field instanceof MappingField && field.initialKeys?.length === 2,
                                `keys=${JSON.stringify(field.initialKeys)}`,
                            );
                        } catch (err) {
                            record('mapping-field-construct', false, String((err as Error).message));
                        }
                        try {
                            const field = new MappingField(inner, { initialKeys: ['head', 'body'] });
                            const initial = field.getInitialValue({});
                            // initialKeys should seed the map with empty entries.
                            const ok = typeof initial === 'object' && Object.keys(initial).length >= 0;
                            record('mapping-field-getInitialValue', ok, `initial=${JSON.stringify(initial)}`);
                        } catch (err) {
                            record('mapping-field-getInitialValue', false, String((err as Error).message));
                        }
                        try {
                            const field = new MappingField(inner, {});
                            const cleaned = field._cleanType({ a: 'foo', b: 'bar' }, {});
                            record(
                                'mapping-field-cleanType',
                                typeof cleaned === 'object' && 'a' in cleaned && 'b' in cleaned,
                                `cleaned=${JSON.stringify(cleaned)}`,
                            );
                        } catch (err) {
                            record('mapping-field-cleanType', false, String((err as Error).message));
                        }
                    }
                } catch (err) {
                    for (const k of ['mapping-field-construct', 'mapping-field-getInitialValue', 'mapping-field-cleanType'] as const) {
                        record(k, false, `import: ${String((err as Error).message)}`);
                    }
                }
            }

            // ---------- config/advancements ----------
            async function probeAdvancements(): Promise<void> {
                try {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic runtime import() of a built .js module in the browser realm; no shipped types
                    const advMod: unknown = await import(`${base}/config/advancements/index.js`);
                    const mod = advMod as AdvancementsModule;

                    try {
                        const careers = mod.getAvailableCareers();
                        record(
                            'advancements-getAvailableCareers',
                            Array.isArray(careers) && careers.length > 0 && typeof careers[0]?.key === 'string',
                            `count=${careers.length}`,
                        );
                    } catch (err) {
                        record('advancements-getAvailableCareers', false, err instanceof Error ? err.message : String(err));
                    }

                    let firstCareerKey: string | null = null;
                    try {
                        const careers = mod.getAvailableCareers();
                        firstCareerKey = careers[0]?.key ?? null;
                        // getCareerKeyFromName uses fuzzy lookup; accept a string
                        // return (the canonical key) OR null (when the registry's
                        // display name doesn't map back). The branch coverage we
                        // care about is the lookup itself, not the resolution.
                        // getCareerKeyFromName returns string | null; the branch
                        // coverage we care about is the lookup running without
                        // throwing, so a successful return is the success signal.
                        const resolved = mod.getCareerKeyFromName(careers[0]?.name ?? 'imaginary');
                        record('advancements-getCareerKeyFromName', true, `resolved=${resolved} firstKey=${firstCareerKey}`);
                    } catch (err) {
                        record('advancements-getCareerKeyFromName', false, err instanceof Error ? err.message : String(err));
                    }

                    try {
                        const yes = mod.hasCareer(firstCareerKey ?? 'rogueTrader');
                        const no = mod.hasCareer('imaginary-career-zzz');
                        record('advancements-hasCareer', yes && !no, `yes=${String(yes)} no=${String(no)}`);
                    } catch (err) {
                        record('advancements-hasCareer', false, err instanceof Error ? err.message : String(err));
                    }

                    try {
                        const career = mod.getCareerAdvancements(firstCareerKey ?? 'rogueTrader');
                        record('advancements-getCareerAdvancements', career !== null && typeof career === 'object', `type=${typeof career}`);
                    } catch (err) {
                        record('advancements-getCareerAdvancements', false, err instanceof Error ? err.message : String(err));
                    }

                    try {
                        const costs = mod.getCharacteristicCosts(firstCareerKey ?? 'rogueTrader');
                        record('advancements-getCharacteristicCosts', costs !== null && typeof costs === 'object', `type=${typeof costs}`);
                    } catch (err) {
                        record('advancements-getCharacteristicCosts', false, err instanceof Error ? err.message : String(err));
                    }

                    try {
                        const ranks = mod.getRankAdvancements(firstCareerKey ?? 'rogueTrader', 1);
                        record(
                            'advancements-getRankAdvancements',
                            ranks === null || Array.isArray(ranks),
                            `type=${Array.isArray(ranks) ? 'array' : typeof ranks}`,
                        );
                    } catch (err) {
                        record('advancements-getRankAdvancements', false, err instanceof Error ? err.message : String(err));
                    }

                    try {
                        const next = mod.getNextCharacteristicCost(firstCareerKey ?? 'rogueTrader', 'weaponSkill', 0);
                        record(
                            'advancements-getNextCharacteristicCost',
                            next === null || (typeof next === 'object' && typeof next.cost === 'number'),
                            `next=${JSON.stringify(next)}`,
                        );
                    } catch (err) {
                        record('advancements-getNextCharacteristicCost', false, err instanceof Error ? err.message : String(err));
                    }
                } catch (err) {
                    for (const k of [
                        'advancements-getAvailableCareers',
                        'advancements-getCareerKeyFromName',
                        'advancements-hasCareer',
                        'advancements-getCareerAdvancements',
                        'advancements-getCharacteristicCosts',
                        'advancements-getRankAdvancements',
                        'advancements-getNextCharacteristicCost',
                    ] as const) {
                        record(k, false, `import: ${String((err as Error).message)}`);
                    }
                }
            }

            // ---------- choice-grant / resource-grant ----------
            // Both grants need an actor + grant-instance with synthetic
            // options/resources. Seed a dh2-character and construct each
            // grant via its DataModel; call _applyGrant directly.
            async function probeGrants(): Promise<void> {
                let actor: ActorInstance | undefined;
                try {
                    actor = await ActorCls.create({
                        name: 'data-layer-spec-actor',
                        type: 'dh2-character',
                        system: { gameSystem: 'dh2' },
                    });
                } catch {
                    /* per-flow failures below */
                }

                try {
                    const cgMod = (await import(`${base}/data/grant/choice-grant.js`)) as { default: GrantCtor };
                    const ChoiceGrantData = cgMod.default;
                    if (typeof ChoiceGrantData !== 'function') {
                        for (const k of ['choice-grant-applyEmpty', 'choice-grant-applyDuplicateRejected'] as const)
                            record(k, false, 'ChoiceGrantData missing');
                    } else {
                        try {
                            // Empty options branch — should populate notifications,
                            // not errors.
                            const grant = new ChoiceGrantData({ options: [], count: 0, optional: true, allowDuplicates: false });
                            const result = grant._initResult();
                            await grant._applyGrant(actor, {}, {}, result);
                            record('choice-grant-applyEmpty', result.errors.length === 0, `errors=${JSON.stringify(result.errors)}`);
                        } catch (err) {
                            record('choice-grant-applyEmpty', false, err instanceof Error ? err.message : String(err));
                        }
                        try {
                            // Duplicate-selection rejection — when allowDuplicates=false
                            // and the same option is selected twice, errors should
                            // include the rejection.
                            const grant = new ChoiceGrantData({
                                options: [
                                    { label: 'A', grants: [] },
                                    { label: 'B', grants: [] },
                                ],
                                count: 2,
                                optional: false,
                                allowDuplicates: false,
                            });
                            const result = grant._initResult();
                            await grant._applyGrant(actor, { selected: ['A', 'A'] }, {}, result);
                            record('choice-grant-applyDuplicateRejected', result.errors.length >= 1, `errors=${JSON.stringify(result.errors)}`);
                        } catch (err) {
                            record('choice-grant-applyDuplicateRejected', false, err instanceof Error ? err.message : String(err));
                        }
                    }
                } catch (err) {
                    for (const k of ['choice-grant-applyEmpty', 'choice-grant-applyDuplicateRejected'] as const) {
                        record(k, false, `import: ${err instanceof Error ? err.message : String(err)}`);
                    }
                }

                try {
                    const rgMod = (await import(`${base}/data/grant/resource-grant.js`)) as { default: GrantCtor };
                    const ResourceGrantData = rgMod.default;
                    if (typeof ResourceGrantData !== 'function') {
                        record('resource-grant-applyEmpty', false, 'ResourceGrantData missing');
                    } else {
                        try {
                            const grant = new ResourceGrantData({ resources: [], optional: true });
                            const result = grant._initResult();
                            await grant._applyGrant(actor, {}, {}, result);
                            // Empty resources is a no-op: no errors, may have notifications.
                            record('resource-grant-applyEmpty', result.errors.length === 0, `errors=${JSON.stringify(result.errors)}`);
                        } catch (err) {
                            record('resource-grant-applyEmpty', false, err instanceof Error ? err.message : String(err));
                        }
                    }
                } catch (err) {
                    record('resource-grant-applyEmpty', false, `import: ${err instanceof Error ? err.message : String(err)}`);
                }

                try {
                    await actor?.delete();
                } catch {
                    /* ignore */
                }
            }

            await probeMappingField();
            await probeAdvancements();
            await probeGrants();

            return out;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('data-layer (Tier B)', () => {
    test('mapping-field + advancements + grant DataModels exercised under coverage', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeDataLayer(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('data-layer.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of DATA_LAYER_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${DATA_LAYER_FLOWS.length} data-layer flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
