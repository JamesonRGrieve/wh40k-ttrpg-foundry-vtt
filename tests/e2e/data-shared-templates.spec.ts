import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the shared item/actor DataModel template mixins under
 * `src/module/data/shared/*` — every template EXCEPT `modifiers-template.ts`,
 * `subtlety-adjuster-template.ts` and `subtlety-adjuster.ts`, which are
 * exhaustively covered by `modifiers.spec.ts` and `subtlety.spec.ts`. These
 * mixins (Description / PhysicalItem / Equippable / Attack / Damage /
 * Activation) declare schemas, migration helpers, derived getters and
 * helper methods that are reached only through their consumer item
 * DataModels in normal Tier B runs — the consumers in headless mode tend to
 * take other branches, so the mixins themselves stay at 0% function
 * coverage despite being structurally important. This spec dynamic-imports
 * each module, builds a tiny synthetic subclass that extends the template
 * with a marker field, instantiates it with valid sample data, and asserts
 * the contributed fields round-trip + the derived getters fire correctly
 * without throwing. Pure helper modules (`body-locations.ts`,
 * `origin-steps.ts`, `stat-fields.ts`) and the `_module.ts` barrel are
 * exercised directly with synthetic inputs covering truthy / falsy /
 * boundary branches.
 *
 * Keys MUST match the DATA_SHARED_FLOWS constant in scripts/e2e-coverage.mjs
 * (registered by the orchestrator).
 */

const DATA_SHARED_FLOWS = [
    'module-barrel-exports',
    'activation-schema-roundtrip',
    'activation-derived-labels',
    'activation-uses-helpers',
    'attack-schema-roundtrip',
    'attack-derived-getters',
    'body-locations-helpers',
    'damage-schema-roundtrip',
    'damage-derived-labels',
    'description-schema-roundtrip',
    'description-source-reference',
    'equippable-schema-roundtrip',
    'origin-steps-labels',
    'physical-schema-roundtrip',
    'physical-derived-labels',
    'stat-fields-builders',
] as const;

type FlowName = (typeof DATA_SHARED_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeSharedTemplates(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: dynamic-imported modules + Foundry DataModel internals are runtime-only */
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            // Synthetic subclasses below extend dynamic-imported DataModel templates
            // whose static side is `any`. Casting through this alias lets each
            // class declare its own constructor signature and static overrides.
            // The `defineSchema` / `_migrateData` static slots reflect the shared
            // template API every dynamically-imported module exposes; this is a
            // boundary cast against untyped Foundry DataModel statics.
            type Ctor = (new (...args: any[]) => any) & {
                defineSchema: () => Record<string, any>;
                _migrateData?: (source: Record<string, any>) => void;
            };

            const base = `${'/systems/wh40k-rpg'}/module/data/shared`;
            const loadModule = async (name: string): Promise<any | null> => {
                try {
                    return await import(`${base}/${name}.js`);
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
            const fail = (keys: readonly FlowName[], detail: string): void => {
                for (const k of keys) record(k, false, detail);
            };

            // The foundry DataField builder for our marker `extra` field, used
            // to verify a subclass actually extended the template's schema
            // (the synthetic subclass adds one extra slot on top of the
            // mixin's fields and we assert that slot round-trips alongside).
            const ff: any = (globalThis as any).foundry?.data?.fields;
            if (!ff) {
                for (const k of [
                    'activation-schema-roundtrip',
                    'activation-derived-labels',
                    'activation-uses-helpers',
                    'attack-schema-roundtrip',
                    'attack-derived-getters',
                    'damage-schema-roundtrip',
                    'damage-derived-labels',
                    'description-schema-roundtrip',
                    'description-source-reference',
                    'equippable-schema-roundtrip',
                    'physical-schema-roundtrip',
                    'physical-derived-labels',
                    'stat-fields-builders',
                    'body-locations-helpers',
                ] as const) {
                    record(k, false, 'foundry.data.fields not available');
                }
            }

            // ---------- _module.ts barrel ----------
            const barrel = await loadModule('_module');
            if (barrel?.__importError) {
                record('module-barrel-exports', false, barrel.__importError);
            } else {
                guarded('module-barrel-exports', () => {
                    const wanted = [
                        'DescriptionTemplate',
                        'PhysicalItemTemplate',
                        'EquippableTemplate',
                        'AttackTemplate',
                        'DamageTemplate',
                        'ModifiersTemplate',
                        'ActivationTemplate',
                    ];
                    for (const k of wanted) {
                        if (typeof barrel[k] !== 'function') return `barrel missing class export ${k}`;
                    }
                    if (typeof barrel.bodyLocationsSchema !== 'function') return 'barrel missing bodyLocationsSchema helper';
                    return true;
                });
            }

            // ---------- body-locations.ts (pure helpers) ----------
            const bodyLoc = await loadModule('body-locations');
            if (bodyLoc?.__importError) {
                record('body-locations-helpers', false, bodyLoc.__importError);
            } else {
                guarded('body-locations-helpers', () => {
                    const list = bodyLoc.BODY_LOCATIONS;
                    if (!Array.isArray(list) || list.length !== 6) return `BODY_LOCATIONS length ${list?.length}`;
                    const expected = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
                    for (const k of expected) {
                        if (!list.includes(k)) return `BODY_LOCATIONS missing ${k}`;
                    }
                    if (typeof bodyLoc.bodyLocationsSchema !== 'function') return 'bodyLocationsSchema not a function';
                    const schema = bodyLoc.bodyLocationsSchema();
                    if (schema === null || typeof schema !== 'object') return 'bodyLocationsSchema did not return an object';
                    // The returned SchemaField exposes the sub-fields via .fields on V14.
                    const sub = schema.fields ?? {};
                    for (const k of expected) {
                        if (!(k in sub)) return `schema missing sub-field ${k}`;
                    }
                    return true;
                });
            }

            // ---------- origin-steps.ts (pure helpers) ----------
            const originSteps = await loadModule('origin-steps');
            if (originSteps?.__importError) {
                record('origin-steps-labels', false, originSteps.__importError);
            } else {
                guarded('origin-steps-labels', () => {
                    const map = originSteps.ORIGIN_STEP_LABELS;
                    if (map === null || typeof map !== 'object') return 'ORIGIN_STEP_LABELS not an object';
                    if (map.homeWorld !== 'Home World') return `homeWorld label ${map.homeWorld}`;
                    if (map.lureOfTheVoid !== 'Lure of the Void') return 'lureOfTheVoid mismatch';
                    if (map.regiment !== 'Regiment') return 'regiment mismatch';
                    if (map.elite !== 'Elite Advance' || map.eliteAdvance !== 'Elite Advance') return 'elite alias mismatch';
                    if (typeof originSteps.originStepLabel !== 'function') return 'originStepLabel not a function';
                    // Falsy / empty / unknown / known step branches.
                    const empty = originSteps.originStepLabel('');
                    const unknown = originSteps.originStepLabel('madeUpStep');
                    const known = originSteps.originStepLabel('career');
                    if (empty !== '') return `empty branch returned ${empty}`;
                    if (typeof unknown !== 'string') return 'unknown branch did not return a string';
                    if (typeof known !== 'string' || known.length === 0) return 'known branch produced empty label';
                    return true;
                });
            }

            // ---------- stat-fields.ts (pure builders) ----------
            const statFields = await loadModule('stat-fields');
            if (statFields?.__importError) {
                record('stat-fields-builders', false, statFields.__importError);
            } else if (ff) {
                guarded('stat-fields-builders', () => {
                    const pcChar = statFields.characteristicField('Weapon Skill', 'WS', { base: 0, total: 0, bonus: 0, advancement: true });
                    const npcChar = statFields.characteristicField('Weapon Skill', 'WS', { base: 30, total: 30, bonus: 3, advancement: false });
                    if (pcChar === null || typeof pcChar !== 'object') return 'characteristicField (PC) did not return a field';
                    if (npcChar === null || typeof npcChar !== 'object') return 'characteristicField (NPC) did not return a field';
                    const pcSubFields = pcChar.fields ?? {};
                    const npcSubFields = npcChar.fields ?? {};
                    // Advancement triplet is PC-only.
                    if (!('advance' in pcSubFields) || !('cost' in pcSubFields) || !('damage' in pcSubFields))
                        return 'PC characteristic missing advancement triplet';
                    if ('advance' in npcSubFields || 'cost' in npcSubFields || 'damage' in npcSubFields)
                        return 'NPC characteristic should omit advancement triplet';

                    const w = statFields.woundsField({ max: 10, value: 10, critical: 0, nullable: false });
                    if (w === null || typeof w !== 'object') return 'woundsField returned non-object';

                    const sz = statFields.sizeField({ nullable: false });
                    if (sz === null || typeof sz !== 'object') return 'sizeField returned non-object';

                    const ini = statFields.initiativeField({ nullable: false });
                    const iniSub = ini?.fields ?? {};
                    if (!('characteristic' in iniSub) || !('base' in iniSub) || !('bonus' in iniSub)) return 'initiativeField missing sub-fields';

                    const movPlain = statFields.movementField({ half: 3, full: 6, charge: 9, run: 18, withLeap: false });
                    const movLeap = statFields.movementField({ half: 3, full: 6, charge: 9, run: 18, withLeap: true });
                    const plainSub = movPlain?.fields ?? {};
                    const leapSub = movLeap?.fields ?? {};
                    if ('leapVertical' in plainSub) return 'plain movement should not include leap fields';
                    if (!('leapVertical' in leapSub) || !('leapHorizontal' in leapSub) || !('jump' in leapSub)) return 'leap movement missing leap fields';
                    return true;
                });
            }

            if (!ff) {
                return out;
            }

            // ---------- synthetic-subclass helpers ----------
            // Each template under test is a Foundry SystemDataModel subclass.
            // We extend it once with a marker `extra` field so we can confirm
            // the subclass's schema correctly composes with the template's
            // contributed fields, then call defineSchema()/getters/methods
            // directly. The instance is constructed via `new T(source)` with
            // schema-valid sample data; many of these mixins also call
            // prepareBaseData which expects a Foundry parent — we pass a
            // minimal stub via the second-arg `{ parent }` option so the
            // line-variant resolution branch finds a usable shape.
            const makeParent = (lineKey: string = 'dh2'): any => ({
                _source: { system: { gameSystem: lineKey } },
                actor: null,
            });

            // ---------- activation-template.ts ----------
            const activationMod = await loadModule('activation-template');
            if (activationMod?.__importError) {
                fail(['activation-schema-roundtrip', 'activation-derived-labels', 'activation-uses-helpers'], activationMod.__importError);
            } else {
                const ActivationTemplate = activationMod.default as Ctor;
                class T extends ActivationTemplate {
                    static defineSchema(): Record<string, any> {
                        return {
                            ...ActivationTemplate.defineSchema(),
                            extra: new ff.NumberField({ required: false, initial: 0 }),
                        };
                    }
                }
                guarded('activation-schema-roundtrip', () => {
                    const schema = T.defineSchema();
                    for (const k of ['activation', 'target', 'duration', 'uses', 'extra']) {
                        if (!(k in schema)) return `activation schema missing ${k}`;
                    }
                    const instance = new T(
                        {
                            activation: { type: 'half-action', cost: 1, condition: '' },
                            target: { type: 'enemy', value: 10, units: 'm', width: 0, length: 0 },
                            duration: { value: 3, units: 'rounds', sustained: false },
                            uses: { value: 2, max: 4, per: 'encounter', recovery: '' },
                            extra: 7,
                        },
                        { parent: makeParent() },
                    );
                    if (instance.activation.type !== 'half-action') return `activation.type ${instance.activation.type}`;
                    if (instance.target.value !== 10) return `target.value ${instance.target.value}`;
                    if (instance.duration.units !== 'rounds') return `duration.units ${instance.duration.units}`;
                    if (instance.uses.max !== 4) return `uses.max ${instance.uses.max}`;
                    return true;
                });

                guarded('activation-derived-labels', () => {
                    const selfInstance = new T(
                        {
                            activation: { type: 'action', cost: 1, condition: '' },
                            target: { type: 'self', value: 0, units: 'm', width: 0, length: 0 },
                            duration: { value: 0, units: 'instant', sustained: false },
                            uses: { value: null, max: null, per: '', recovery: '' },
                        },
                        { parent: makeParent() },
                    );
                    if (typeof selfInstance.activationLabel !== 'string') return 'activationLabel non-string';
                    if (typeof selfInstance.targetLabel !== 'string') return 'targetLabel non-string';
                    if (typeof selfInstance.durationLabel !== 'string') return 'durationLabel non-string';
                    const props = selfInstance.chatProperties;
                    if (!Array.isArray(props)) return 'chatProperties non-array';

                    const richInstance = new T(
                        {
                            activation: { type: 'reaction', cost: 0, condition: 'when struck' },
                            target: { type: 'enemy', value: 5, units: 'm', width: 0, length: 0 },
                            duration: { value: 2, units: 'rounds', sustained: false },
                            uses: { value: null, max: null, per: '', recovery: '' },
                        },
                        { parent: makeParent() },
                    );
                    const richProps = richInstance.chatProperties;
                    if (!Array.isArray(richProps) || richProps.length < 3) return `rich chatProperties length ${richProps?.length}`;

                    const sustainedInstance = new T(
                        {
                            activation: { type: 'full-action', cost: 1, condition: '' },
                            target: { type: 'self', value: 0, units: 'm', width: 0, length: 0 },
                            duration: { value: 0, units: 'sustained', sustained: true },
                            uses: { value: null, max: null, per: '', recovery: '' },
                        },
                        { parent: makeParent() },
                    );
                    if (typeof sustainedInstance.durationLabel !== 'string') return 'sustained durationLabel non-string';
                    return true;
                });

                guarded('activation-uses-helpers', () => {
                    const unlimited = new T(
                        {
                            activation: { type: 'action', cost: 1, condition: '' },
                            target: { type: 'self', value: 0, units: 'm', width: 0, length: 0 },
                            duration: { value: 0, units: 'instant', sustained: false },
                            uses: { value: null, max: null, per: '', recovery: '' },
                        },
                        { parent: makeParent() },
                    );
                    if (unlimited.hasLimitedUses !== false) return 'unlimited.hasLimitedUses true';
                    if (unlimited.usesExhausted !== false) return 'unlimited.usesExhausted true';
                    // No parent.update — these should be no-ops returning undefined or the parent.
                    unlimited.consumeUse();
                    unlimited.recoverUses(2);

                    const fresh = new T(
                        {
                            activation: { type: 'action', cost: 1, condition: '' },
                            target: { type: 'self', value: 0, units: 'm', width: 0, length: 0 },
                            duration: { value: 0, units: 'instant', sustained: false },
                            uses: { value: 3, max: 3, per: 'encounter', recovery: '' },
                        },
                        { parent: makeParent() },
                    );
                    if (fresh.hasLimitedUses !== true) return 'fresh.hasLimitedUses false';
                    if (fresh.usesExhausted !== false) return 'fresh.usesExhausted true';

                    const empty = new T(
                        {
                            activation: { type: 'action', cost: 1, condition: '' },
                            target: { type: 'self', value: 0, units: 'm', width: 0, length: 0 },
                            duration: { value: 0, units: 'instant', sustained: false },
                            uses: { value: 0, max: 3, per: 'encounter', recovery: '' },
                        },
                        { parent: makeParent() },
                    );
                    if (empty.usesExhausted !== true) return 'empty.usesExhausted false';
                    // consume/recover with a stub update parent
                    const calls: any[] = [];
                    const withParent = new T(
                        {
                            activation: { type: 'action', cost: 1, condition: '' },
                            target: { type: 'self', value: 0, units: 'm', width: 0, length: 0 },
                            duration: { value: 0, units: 'instant', sustained: false },
                            uses: { value: 2, max: 4, per: 'encounter', recovery: '' },
                        },
                        {
                            parent: {
                                _source: { system: {} },
                                actor: null,
                                update: async (data: any) => {
                                    calls.push(data);
                                    return Promise.resolve({});
                                },
                            },
                        },
                    );
                    withParent.consumeUse();
                    withParent.recoverUses(5);
                    if (calls.length !== 2) return `expected 2 update calls, got ${calls.length}`;
                    if (calls[0]['system.uses.value'] !== 1) return `consume update value ${calls[0]['system.uses.value']}`;
                    // recoverUses caps at max (4)
                    if (calls[1]['system.uses.value'] !== 4) return `recover update value ${calls[1]['system.uses.value']}`;
                    return true;
                });
            }

            // ---------- attack-template.ts ----------
            const attackMod = await loadModule('attack-template');
            if (attackMod?.__importError) {
                fail(['attack-schema-roundtrip', 'attack-derived-getters'], attackMod.__importError);
            } else {
                const AttackTemplate = attackMod.default as Ctor;
                class T extends AttackTemplate {
                    static defineSchema(): Record<string, any> {
                        return {
                            ...AttackTemplate.defineSchema(),
                            extra: new ff.NumberField({ required: false, initial: 0 }),
                        };
                    }
                }
                guarded('attack-schema-roundtrip', () => {
                    const schema = T.defineSchema();
                    if (!('attack' in schema)) return 'schema missing attack';
                    if (!('extra' in schema)) return 'schema missing extra';
                    const instance = new T(
                        {
                            attack: {
                                type: 'ranged',
                                characteristic: 'ballisticSkill',
                                modifier: 5,
                                range: { value: 30, units: 'm', special: '' },
                                rateOfFire: { single: true, semi: 3, full: 10 },
                            },
                            extra: 1,
                        },
                        { parent: makeParent() },
                    );
                    if (instance.attack.type !== 'ranged') return `attack.type ${instance.attack.type}`;
                    if (instance.attack.range.value !== 30) return `range.value ${instance.attack.range.value}`;
                    if (instance.attack.rateOfFire.full !== 10) return `rof.full ${instance.attack.rateOfFire.full}`;
                    instance.prepareBaseData();
                    if (instance.attack.type !== 'ranged') return 'prepareBaseData mutated attack.type';
                    return true;
                });

                guarded('attack-derived-getters', () => {
                    const melee = new T(
                        {
                            attack: {
                                type: 'melee',
                                characteristic: 'weaponSkill',
                                modifier: 0,
                                range: { value: 0, units: 'm', special: '' },
                                rateOfFire: { single: true, semi: 0, full: 0 },
                            },
                        },
                        { parent: makeParent() },
                    );
                    if (melee.isMelee !== true || melee.isRanged !== false || melee.isPsychic !== false) return 'melee flags wrong';
                    if (melee.rangeLabel !== '-') return `melee rangeLabel ${melee.rangeLabel}`;
                    if (melee.rateOfFireLabel !== 'S/-/-') return `melee rofLabel ${melee.rateOfFireLabel}`;
                    const meleeProps = melee.chatProperties;
                    if (!Array.isArray(meleeProps) || meleeProps.length !== 0) return `melee chatProperties length ${meleeProps?.length}`;

                    const thrown = new T(
                        {
                            attack: {
                                type: 'thrown',
                                characteristic: 'ballisticSkill',
                                modifier: 0,
                                range: { value: 15, units: 'm', special: '' },
                                rateOfFire: { single: true, semi: 0, full: 0 },
                            },
                        },
                        { parent: makeParent() },
                    );
                    if (thrown.isRanged !== true) return 'thrown.isRanged should be true';
                    if (thrown.rangeLabel !== '15m') return `thrown rangeLabel ${thrown.rangeLabel}`;

                    const specialRange = new T(
                        {
                            attack: {
                                type: 'ranged',
                                characteristic: 'ballisticSkill',
                                modifier: 0,
                                range: { value: 0, units: 'm', special: 'line-of-sight' },
                                rateOfFire: { single: false, semi: 2, full: 4 },
                            },
                        },
                        { parent: makeParent() },
                    );
                    if (specialRange.rangeLabel !== 'line-of-sight') return `special rangeLabel ${specialRange.rangeLabel}`;
                    if (specialRange.rateOfFireLabel !== '-/2/4') return `mixed rofLabel ${specialRange.rateOfFireLabel}`;
                    const props = specialRange.chatProperties;
                    if (!Array.isArray(props) || props.length !== 2) return `ranged chatProperties length ${props?.length}`;

                    const psychic = new T(
                        {
                            attack: {
                                type: 'psychic',
                                characteristic: 'willpower',
                                modifier: 0,
                                range: { value: 0, units: 'm', special: '' },
                                rateOfFire: { single: true, semi: 0, full: 0 },
                            },
                        },
                        { parent: makeParent() },
                    );
                    if (psychic.isPsychic !== true) return 'psychic.isPsychic should be true';
                    return true;
                });
            }

            // ---------- damage-template.ts ----------
            const damageMod = await loadModule('damage-template');
            if (damageMod?.__importError) {
                fail(['damage-schema-roundtrip', 'damage-derived-labels'], damageMod.__importError);
            } else {
                const DamageTemplate = damageMod.default as Ctor;
                class T extends DamageTemplate {
                    static defineSchema(): Record<string, any> {
                        return {
                            ...DamageTemplate.defineSchema(),
                            extra: new ff.NumberField({ required: false, initial: 0 }),
                        };
                    }
                }
                guarded('damage-schema-roundtrip', () => {
                    const schema = T.defineSchema();
                    if (!('damage' in schema) || !('special' in schema)) return 'damage schema missing fields';
                    if (!('extra' in schema)) return 'damage schema missing extra';
                    const instance = new T(
                        {
                            damage: { formula: '1d10', type: 'rending', bonus: 4, penetration: 2 },
                            special: ['tearing', 'razorsharp'],
                            extra: 0,
                        },
                        { parent: makeParent() },
                    );
                    if (instance.damage.formula !== '1d10') return `damage.formula ${instance.damage.formula}`;
                    if (instance.damage.penetration !== 2) return `damage.pen ${instance.damage.penetration}`;
                    // special migrates Array -> Set during _migrateData.
                    if (!(instance.special instanceof Set)) return 'special not a Set after migration';
                    if (!instance.special.has('tearing')) return 'special missing tearing';
                    // _migrateData should also handle an already-Set value.
                    DamageTemplate._migrateData({ special: new Set(['flame']) });
                    return true;
                });

                guarded('damage-derived-labels', () => {
                    const blank = new T(
                        {
                            damage: { formula: '', type: 'impact', bonus: 0, penetration: 0 },
                            special: [],
                        },
                        { parent: makeParent() },
                    );
                    if (blank.damageLabel !== '-') return `blank damageLabel ${blank.damageLabel}`;
                    if (blank.hasSpecial('tearing') !== false) return 'blank hasSpecial wrongly true';
                    const blankProps = blank.chatProperties;
                    if (!Array.isArray(blankProps) || blankProps.length !== 0) return `blank chatProperties length ${blankProps?.length}`;

                    const positive = new T(
                        {
                            damage: { formula: '1d10', type: 'rending', bonus: 3, penetration: 4 },
                            special: ['tearing'],
                        },
                        { parent: makeParent() },
                    );
                    if (!positive.damageLabel.startsWith('1d10+3')) return `positive damageLabel ${positive.damageLabel}`;
                    if (positive.damageTypeAbbr !== 'R') return `positive abbr ${positive.damageTypeAbbr}`;
                    if (typeof positive.damageTypeLabel !== 'string') return 'damageTypeLabel non-string';
                    if (positive.hasSpecial('Tearing') !== true) return 'positive hasSpecial case-insensitive failed';
                    const posProps = positive.chatProperties;
                    if (!Array.isArray(posProps) || posProps.length !== 3) return `positive chatProperties length ${posProps?.length}`;

                    const negative = new T(
                        {
                            damage: { formula: '2d10', type: 'shock', bonus: -2, penetration: 0 },
                            special: [],
                        },
                        { parent: makeParent() },
                    );
                    if (!negative.damageLabel.startsWith('2d10-2')) return `negative damageLabel ${negative.damageLabel}`;
                    if (negative.damageTypeAbbr !== 'S') return `negative abbr ${negative.damageTypeAbbr}`;

                    // Unknown damage type falls back to first-letter uppercase.
                    const odd = new T(
                        {
                            damage: { formula: '1d5', type: 'impact', bonus: 0, penetration: 0 },
                            special: [],
                        },
                        { parent: makeParent() },
                    );
                    // Mutate type to a value not in the known abbr map to exercise fallback.
                    odd.damage = { ...odd.damage, type: 'plasma' };
                    if (odd.damageTypeAbbr !== 'P') return `unknown abbr ${odd.damageTypeAbbr}`;
                    return true;
                });
            }

            // ---------- description-template.ts ----------
            const descMod = await loadModule('description-template');
            if (descMod?.__importError) {
                fail(['description-schema-roundtrip', 'description-source-reference'], descMod.__importError);
            } else {
                const DescriptionTemplate = descMod.default as Ctor;
                class T extends DescriptionTemplate {
                    static defineSchema(): Record<string, any> {
                        return {
                            ...DescriptionTemplate.defineSchema(),
                            extra: new ff.NumberField({ required: false, initial: 0 }),
                        };
                    }
                }
                guarded('description-schema-roundtrip', () => {
                    const schema = T.defineSchema();
                    if (!('description' in schema) || !('source' in schema)) return 'description schema missing fields';
                    if (!('extra' in schema)) return 'description schema missing extra';
                    const instance = new T(
                        {
                            description: { value: '<p>Rich text</p>', chat: 'chat-blurb', summary: 'summary line' },
                            source: { book: 'Core Rulebook', page: '12', custom: '' },
                            extra: 42,
                        },
                        { parent: makeParent() },
                    );
                    if (instance.description.value !== '<p>Rich text</p>') return `desc.value ${instance.description.value}`;
                    if (instance.source.book !== 'Core Rulebook') return `source.book ${instance.source.book}`;

                    // _migrateData branches: flat string -> object form.
                    const legacy: Record<string, unknown> = { description: 'flat legacy desc', source: 'flat legacy source' };
                    DescriptionTemplate._migrateData(legacy);
                    const migratedDesc = legacy.description as { value: string; chat: string; summary: string };
                    const migratedSrc = legacy.source as { book: string; page: string; custom: string };
                    if (migratedDesc.value !== 'flat legacy desc') return 'desc string-form migration failed';
                    if (migratedSrc.custom !== 'flat legacy source') return 'source string-form migration failed';

                    // _migrateData branches: object with missing chat/summary, custom defaults filled.
                    const partial: Record<string, unknown> = { description: { value: 'half' }, source: { book: 'b' } };
                    DescriptionTemplate._migrateData(partial);
                    const partialDesc = partial.description as { value: string; chat: string; summary: string };
                    if (partialDesc.chat !== '' || partialDesc.summary !== '') return 'partial description defaults not filled';
                    return true;
                });

                guarded('description-source-reference', () => {
                    const custom = new T(
                        {
                            description: { value: '', chat: '', summary: '' },
                            source: { book: '', page: '', custom: 'unpublished home brew' },
                        },
                        { parent: makeParent() },
                    );
                    if (custom.sourceReference !== 'unpublished home brew') return `custom sourceReference ${custom.sourceReference}`;

                    const bookPage = new T(
                        {
                            description: { value: '', chat: '', summary: '' },
                            source: { book: 'Core', page: '42', custom: '' },
                        },
                        { parent: makeParent() },
                    );
                    if (bookPage.sourceReference !== 'Core, p.42') return `bookPage sourceReference ${bookPage.sourceReference}`;

                    const bookOnly = new T(
                        {
                            description: { value: '', chat: '', summary: '' },
                            source: { book: 'CoreOnly', page: '', custom: '' },
                        },
                        { parent: makeParent() },
                    );
                    if (bookOnly.sourceReference !== 'CoreOnly') return `bookOnly sourceReference ${bookOnly.sourceReference}`;

                    const empty = new T(
                        {
                            description: { value: '', chat: '', summary: '' },
                            source: { book: '', page: '', custom: '' },
                        },
                        { parent: makeParent() },
                    );
                    if (empty.sourceReference !== '') return `empty sourceReference ${empty.sourceReference}`;
                    return true;
                });
            }

            // ---------- equippable-template.ts ----------
            const equipMod = await loadModule('equippable-template');
            if (equipMod?.__importError) {
                record('equippable-schema-roundtrip', false, equipMod.__importError);
            } else {
                const EquippableTemplate = equipMod.default as Ctor;
                class T extends EquippableTemplate {
                    static defineSchema(): Record<string, any> {
                        return {
                            ...EquippableTemplate.defineSchema(),
                            extra: new ff.NumberField({ required: false, initial: 0 }),
                        };
                    }
                }
                guarded('equippable-schema-roundtrip', () => {
                    const schema = T.defineSchema();
                    for (const k of ['equipped', 'inBackpack', 'inShipStorage', 'container', 'extra']) {
                        if (!(k in schema)) return `equippable schema missing ${k}`;
                    }
                    const carried = new T({ equipped: true, inBackpack: false, inShipStorage: false, container: '' });
                    if (carried.isCarried !== true) return 'carried.isCarried false';
                    if (carried.isInShipStorage !== false) return 'carried.isInShipStorage true';

                    const stowed = new T({ equipped: false, inBackpack: true, inShipStorage: false, container: '' });
                    if (stowed.isCarried !== false) return 'stowed.isCarried true';

                    const shipStored = new T({ equipped: false, inBackpack: false, inShipStorage: true, container: '' });
                    if (shipStored.isInShipStorage !== true) return 'shipStored.isInShipStorage false';
                    if (shipStored.isCarried !== false) return 'shipStored.isCarried true';

                    const contained = new T({ equipped: false, inBackpack: false, inShipStorage: false, container: 'pouch' });
                    if (contained.isCarried !== false) return 'contained.isCarried true';

                    // _migrateData: non-boolean equipped coerced to boolean.
                    const legacy: Record<string, unknown> = { equipped: 1, inBackpack: 'yes', inShipStorage: 0 };
                    EquippableTemplate._migrateData(legacy);
                    if (legacy.equipped !== true) return 'equipped not coerced to true';
                    if (legacy.inBackpack !== true) return 'inBackpack not coerced to true';
                    if (legacy.inShipStorage !== false) return 'inShipStorage not coerced to false';

                    // Mutation helpers should be safe to call with no parent (returns undefined).
                    const noParent = new T({ equipped: false, inBackpack: false, inShipStorage: false, container: '' });
                    const r1 = noParent.toggleEquipped();
                    const r2 = noParent.stowInBackpack();
                    const r3 = noParent.removeFromBackpack();
                    const r4 = noParent.stowInShipStorage();
                    const r5 = noParent.removeFromShipStorage();
                    // All five must complete without throwing; return value is implementation-defined.
                    void [r1, r2, r3, r4, r5];
                    return true;
                });
            }

            // ---------- physical-item-template.ts ----------
            const physMod = await loadModule('physical-item-template');
            if (physMod?.__importError) {
                fail(['physical-schema-roundtrip', 'physical-derived-labels'], physMod.__importError);
            } else {
                const PhysicalItemTemplate = physMod.default as Ctor;
                class T extends PhysicalItemTemplate {
                    static defineSchema(): Record<string, any> {
                        return {
                            ...PhysicalItemTemplate.defineSchema(),
                            extra: new ff.NumberField({ required: false, initial: 0 }),
                        };
                    }
                }
                guarded('physical-schema-roundtrip', () => {
                    const schema = T.defineSchema();
                    for (const k of ['weight', 'availability', 'craftsmanship', 'quantity', 'homebrew', 'cost', 'extra']) {
                        if (!(k in schema)) return `physical schema missing ${k}`;
                    }
                    const instance = new T(
                        {
                            weight: 2.5,
                            availability: 'rare',
                            craftsmanship: 'good',
                            quantity: 3,
                            homebrew: { inventory: { profiles: ['vendor-a', 'vendor-b'], weight: 5 } },
                            cost: {
                                dh1: { throneGelt: 100 },
                                dh2: { influence: 1, homebrew: { requisition: 5, throneGelt: 0 } },
                                rt: { profitFactor: 10 },
                                dw: { requisition: 0 },
                                bc: { infamy: 4 },
                                ow: { logistics: 3 },
                            },
                        },
                        { parent: makeParent() },
                    );
                    if (instance.weight !== 2.5) return `weight ${instance.weight}`;
                    if (instance.quantity !== 3) return `quantity ${instance.quantity}`;
                    if (!(instance.homebrew.inventory.profiles instanceof Set)) return 'inventory.profiles not a Set';
                    if (!instance.homebrew.inventory.profiles.has('vendor-a')) return 'inventory.profiles missing vendor-a';
                    if (instance.cost.dh2.influence !== 1) return `cost.dh2.influence ${instance.cost.dh2.influence}`;

                    // _migrateData branches for cost normalisation: empty / non-object / string-number.
                    const empty: Record<string, unknown> = {};
                    PhysicalItemTemplate._migrateData(empty);
                    const emptyCost = empty.cost as { dh1: { throneGelt: number | null } };
                    if (emptyCost?.dh1?.throneGelt !== null) return 'empty cost normalisation failed';

                    const stringy: Record<string, unknown> = {
                        cost: { dh1: { throneGelt: '50' }, dh2: { influence: '', homebrew: { requisition: 'nope', throneGelt: '7' } } },
                    };
                    PhysicalItemTemplate._migrateData(stringy);
                    const sc = stringy.cost as any;
                    if (sc.dh1.throneGelt !== 50) return `string-number throneGelt ${sc.dh1.throneGelt}`;
                    if (sc.dh2.influence !== null) return `empty-string influence ${sc.dh2.influence}`;
                    if (sc.dh2.homebrew.requisition !== null) return `non-numeric requisition ${sc.dh2.homebrew.requisition}`;
                    if (sc.dh2.homebrew.throneGelt !== 7) return `coerced throneGelt ${sc.dh2.homebrew.throneGelt}`;

                    // _migrateData branches for homebrew inventory normalisation.
                    const hbLegacy: Record<string, unknown> = { homebrew: { inventory: { profiles: ['ok', '  ', '', 12, 'x'], weight: '4' } } };
                    PhysicalItemTemplate._migrateData(hbLegacy);
                    const hb = hbLegacy.homebrew as any;
                    if (!Array.isArray(hb.inventory.profiles)) return 'profiles not normalised to array';
                    if (hb.inventory.profiles.includes(12)) return 'profiles failed to drop non-string entry';
                    if (hb.inventory.weight !== 4) return `weight not coerced ${hb.inventory.weight}`;
                    return true;
                });

                guarded('physical-derived-labels', () => {
                    const heavy = new T(
                        {
                            weight: 5,
                            availability: 'rare',
                            craftsmanship: 'good',
                            quantity: 2,
                            homebrew: { inventory: { profiles: [], weight: null } },
                            cost: {
                                dh1: { throneGelt: null },
                                dh2: { influence: null, homebrew: { requisition: null, throneGelt: null } },
                                rt: { profitFactor: null },
                                dw: { requisition: null },
                                bc: { infamy: null },
                                ow: { logistics: null },
                            },
                        },
                        { parent: makeParent() },
                    );
                    if (heavy.totalWeight !== 10) return `totalWeight ${heavy.totalWeight}`;
                    if (typeof heavy.availabilityLabel !== 'string') return 'availabilityLabel non-string';
                    if (typeof heavy.craftsmanshipLabel !== 'string') return 'craftsmanshipLabel non-string';
                    const heavyProps = heavy.chatProperties;
                    if (!Array.isArray(heavyProps) || heavyProps.length < 3) return `heavy chatProperties length ${heavyProps?.length}`;

                    // Quantity 0 -> totalWeight falls back to weight * 1.
                    const zeroQty = new T(
                        {
                            weight: 2,
                            availability: 'common',
                            craftsmanship: 'common',
                            quantity: 0,
                            homebrew: { inventory: { profiles: [], weight: null } },
                            cost: {
                                dh1: { throneGelt: null },
                                dh2: { influence: null, homebrew: { requisition: null, throneGelt: null } },
                                rt: { profitFactor: null },
                                dw: { requisition: null },
                                bc: { infamy: null },
                                ow: { logistics: null },
                            },
                        },
                        { parent: makeParent() },
                    );
                    if (zeroQty.totalWeight !== 2) return `zero-qty totalWeight ${zeroQty.totalWeight}`;
                    const commonProps = zeroQty.chatProperties;
                    if (!Array.isArray(commonProps)) return 'common chatProperties non-array';
                    // craftsmanship 'common' should not be listed in chatProperties.
                    for (const p of commonProps) {
                        if (typeof p === 'string' && p.includes('Common') && p !== zeroQty.availabilityLabel) {
                            return `common craftsmanship leaked into chatProperties: ${p}`;
                        }
                    }
                    return true;
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

test.describe.serial('data/shared/* template depth coverage (Tier B)', () => {
    test('every shared template mixin and helper exposes its schema and derived surface without throwing', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeSharedTemplates(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('data-shared.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of DATA_SHARED_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${DATA_SHARED_FLOWS.length} data/shared template flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
