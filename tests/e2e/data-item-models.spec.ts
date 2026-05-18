import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the item DataModels under src/module/data/item/ that the
 * existing item sweeps (item-types.spec.ts create+render, dh-special-items.spec.ts
 * mutation/mentalDisorder/criticalInjury/malignancy/drug/peer/cybernetic, and
 * weapon-attack.spec.ts weapon usesAmmo/isEmpty/isRangedWeapon/rateOfFire) do
 * NOT drive deeply. Each flow embeds one item on a seeded dh2-character actor
 * (gameSystem 'dh2e') and asserts the DataModel's defineSchema fields round-trip
 * AND its derived getters / prepareBaseData / prepareDerivedData branches
 * compute the documented arithmetic.
 *
 * Source coverage targets (derived-data math, not just create+render):
 *   - src/module/data/item/armour.ts — averageAP / maxAP / protectionLevel,
 *     _getEffectiveCoverage / coverageLabel / locationCount, craftsmanship
 *     getEffectiveAPForLocation (+1 AP best) / effectiveWeight halving,
 *     imposesStealthPenalty / stealthPenalty (AP > 7)
 *   - src/module/data/item/gear.ts — totalWeight / effectiveWeight /
 *     effectiveTotalWeight craftsmanship multiplier, hasLimitedUses /
 *     usesExhausted / usesDisplay (non-drug gear; the drug→GearData path is
 *     covered by dh-special-items.spec.ts)
 *   - src/module/data/item/talent.ts — hasPrerequisites / prerequisitesLabel
 *     (structured characteristics + skills), hasGrants / grantsSummary,
 *     fullName (specialization + stackable rank), prepareDerivedData "(X)"
 *     name → hasSpecialization auto-infer, isRollable
 *   - src/module/data/item/ammunition.ts — hasModifiers branch, weaponTypesLabel,
 *     chatProperties damage / penetration sign prefixes, prepareBaseData merge
 *   - src/module/data/item/force-field.ts — effectiveOverloadRange /
 *     checksOverload / overloadRangeLabel / isProtecting, craftsmanshipModifiers
 *     (best → 01 only)
 *   - src/module/data/item/trait.ts — hasLevel / fullName / isVariable /
 *     categoryLabel
 *   - src/module/data/item/skill.ts — characteristicAbbr / skillTypeLabel /
 *     hasSpecializations
 *   - src/module/data/item/condition.ts — durationDisplay / isTemporary /
 *     fullName (stacks) / natureClass / appliesToLabel
 *   - src/module/data/item/weapon-modification.ts — restrictionsLabel /
 *     hasModifiers / categoryIcon, _cleanData Set→Array round-trip
 *
 * Strategy mirrors weapon-attack.spec.ts: every flow probe runs in a single
 * `page.evaluate` round-trip; awaitables are wrapped in a 5s timeout; a shared
 * cleanup registry deletes every actor / item we create in a finally block;
 * collect-failures-then-assert matches damage.spec.ts / dh-special-items.spec.ts.
 *
 * Keys MUST match the DATA_ITEM_MODEL_FLOWS constant in scripts/e2e-coverage.mjs
 * (registered by the orchestrator). Keep this list in sync with the
 * recordCoverage('data-item-model.flow', ...) calls below — it is the coverage
 * denominator.
 */

const DATA_ITEM_MODEL_FLOWS = [
    'armour-ap-aggregation',
    'armour-craftsmanship-ap',
    'armour-coverage-derivation',
    'armour-stealth-penalty',
    'gear-weight-math',
    'gear-uses-exhausted',
    'talent-prerequisites',
    'talent-grants-summary',
    'talent-specialization-fullname',
    'ammunition-modifiers',
    'force-field-overload',
    'force-field-craftsmanship',
    'trait-level-variable',
    'skill-derived-labels',
    'condition-duration',
    'weapon-modification-restrictions',
] as const;

type FlowName = (typeof DATA_ITEM_MODEL_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    pageErrors: string[];
}

async function probeDataItemModelFlows(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const Actor = g.Actor;
            const game = g.game;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            if (!Actor?.create) {
                return {
                    flowsFired: fired,
                    flowNotes: { 'armour-ap-aggregation': 'Actor.create unavailable' } as Record<string, string>,
                };
            }

            // Wrap any awaitable with a 5s timeout so a blocking operation or
            // socket-wait can't hang the spec (mirrors weapon-attack.spec.ts).
            const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                let timer: ReturnType<typeof setTimeout> | null = null;
                const timeout = new Promise<T>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                });
                try {
                    return await Promise.race([p, timeout]);
                } finally {
                    if (timer) clearTimeout(timer);
                }
            };

            // Shared cleanup registry — every actor / item we create here gets
            // registered for end-of-probe deletion (mirrors weapon-attack.spec.ts).
            const cleanups: Array<() => Promise<void>> = [];

            // ---- shared PC actor (dh2-character — has characteristics) ----
            let pc: any = null;
            try {
                pc = (await withTimeout(
                    Actor.create({
                        name: 'data-item-model-spec-pc',
                        type: 'dh2-character',
                        system: {
                            gameSystem: 'dh2e',
                            characteristics: {
                                weaponSkill: { base: 30, advance: 0, modifier: 0 },
                                toughness: { base: 30, advance: 0, modifier: 0 },
                                strength: { base: 30, advance: 0, modifier: 0 },
                                intelligence: { base: 30, advance: 0, modifier: 0 },
                            },
                        },
                    }),
                    5_000,
                    'PC Actor.create',
                )) as any;
                if (pc?.id) {
                    cleanups.push(async () => {
                        try {
                            await game?.actors?.get?.(pc.id)?.delete?.();
                        } catch {
                            /* ignore */
                        }
                    });
                }
            } catch (err) {
                for (const f of flows) notes[f] = `PC create threw: ${String((err as Error)?.message ?? err)}`;
            }

            if (!pc?.id) {
                return { flowsFired: fired, flowNotes: notes };
            }

            // Yield a tick so the server-side create flushes its database write
            // before the first createEmbeddedDocuments fires (V14 race noted in
            // weapon-attack.spec.ts).
            await new Promise((r) => setTimeout(r, 250));

            const getPc = () => game?.actors?.get?.(pc.id);

            /**
             * Create one embedded item, register it for cleanup, return the
             * live document (re-fetched off the actor so derived data is fresh).
             */
            const embed = async (flow: string, data: Record<string, unknown>): Promise<any | null> => {
                const live = getPc();
                const created = (await withTimeout(
                    live.createEmbeddedDocuments?.('Item', [data]),
                    5_000,
                    `create ${String(data['type'])} for ${flow}`,
                )) as any[];
                const itemId = created?.[0]?.id;
                if (itemId === undefined || itemId === null) return null;
                const item = live.items.get(itemId);
                if (item) {
                    cleanups.push(async () => {
                        try {
                            await item.delete?.();
                        } catch {
                            /* ignore */
                        }
                    });
                }
                return item ?? null;
            };

            try {
                /* ============================================================
                 * Flow 1: armour-ap-aggregation
                 * Per-location armourPoints → averageAP / maxAP / maxBaseAP /
                 * protectionLevel / locationCount derived math (armour.ts).
                 * head 6 body 6 arms 4 legs 4 → avg round(30/6)=5, max 6.
                 * protectionLevel: avg 5 → 'medium' (<=5 branch).
                 * ============================================================ */
                try {
                    const armour = await embed('armour-ap-aggregation', {
                        name: 'probe-armour-flak',
                        type: 'armour',
                        system: {
                            identifier: 'probe-armour-agg',
                            type: 'flak',
                            craftsmanship: 'common',
                            armourPoints: { head: 6, leftArm: 4, rightArm: 4, body: 6, leftLeg: 4, rightLeg: 4 },
                            coverage: ['head', 'leftArm', 'rightArm', 'body', 'leftLeg', 'rightLeg'],
                        },
                    });
                    if (!armour) {
                        notes['armour-ap-aggregation'] = 'failed to create armour';
                    } else {
                        const avg = armour.system?.averageAP;
                        const max = armour.system?.maxAP;
                        const maxBase = armour.system?.maxBaseAP;
                        const level = armour.system?.protectionLevel;
                        const locCount = armour.system?.locationCount;
                        if (avg === 5 && max === 6 && maxBase === 6 && level === 'medium' && locCount === 6) {
                            fired['armour-ap-aggregation'] = true;
                            notes['armour-ap-aggregation'] = `averageAP=5 maxAP=6 maxBaseAP=6 protectionLevel=medium locationCount=6`;
                        } else {
                            notes['armour-ap-aggregation'] =
                                `expected avg=5 max=6 maxBase=6 level=medium locCount=6, got avg=${avg} max=${max} maxBase=${maxBase} level=${level} locCount=${locCount}`;
                        }
                    }
                } catch (err) {
                    notes['armour-ap-aggregation'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 2: armour-craftsmanship-ap
                 * Best craftsmanship → +1 AP on every location
                 * (getEffectiveAPForLocation) and weight × 0.5
                 * (effectiveWeight). Base body AP 5, weight 10 →
                 * effective body AP 6, effectiveWeight 5.
                 * ============================================================ */
                try {
                    const armour = await embed('armour-craftsmanship-ap', {
                        name: 'probe-armour-best-carapace',
                        type: 'armour',
                        system: {
                            identifier: 'probe-armour-craft',
                            type: 'carapace',
                            craftsmanship: 'best',
                            weight: 10,
                            armourPoints: { head: 5, leftArm: 5, rightArm: 5, body: 5, leftLeg: 5, rightLeg: 5 },
                            coverage: ['head', 'leftArm', 'rightArm', 'body', 'leftLeg', 'rightLeg'],
                        },
                    });
                    if (!armour) {
                        notes['armour-craftsmanship-ap'] = 'failed to create armour';
                    } else {
                        const baseBody = armour.system?.getAPForLocation?.('body');
                        const effBody = armour.system?.getEffectiveAPForLocation?.('body');
                        const effWeight = armour.system?.effectiveWeight;
                        const hasCraft = armour.system?.hasCraftsmanshipEffects;
                        if (baseBody === 5 && effBody === 6 && effWeight === 5 && hasCraft === true) {
                            fired['armour-craftsmanship-ap'] = true;
                            notes['armour-craftsmanship-ap'] = `base body AP=5, best craft → effective body AP=6, weight 10→5, hasCraftsmanshipEffects=true`;
                        } else {
                            notes['armour-craftsmanship-ap'] =
                                `expected base=5 eff=6 effWeight=5 hasCraft=true, got base=${baseBody} eff=${effBody} effWeight=${effWeight} hasCraft=${String(hasCraft)}`;
                        }
                    }
                } catch (err) {
                    notes['armour-craftsmanship-ap'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 3: armour-coverage-derivation
                 * Only head + body have AP > 0 → _getEffectiveCoverage infers
                 * {head, body}; coversAll false; locationCount 2; getAPForLocation
                 * for an uncovered location (arm) returns 0.
                 * ============================================================ */
                try {
                    const armour = await embed('armour-coverage-derivation', {
                        name: 'probe-armour-helmet-vest',
                        type: 'armour',
                        system: {
                            identifier: 'probe-armour-cov',
                            type: 'mesh',
                            craftsmanship: 'common',
                            armourPoints: { head: 4, leftArm: 0, rightArm: 0, body: 4, leftLeg: 0, rightLeg: 0 },
                            coverage: ['head', 'body'],
                        },
                    });
                    if (!armour) {
                        notes['armour-coverage-derivation'] = 'failed to create armour';
                    } else {
                        const coversAll = armour.system?.coversAll;
                        const locCount = armour.system?.locationCount;
                        const headAP = armour.system?.getAPForLocation?.('head');
                        const armAP = armour.system?.getAPForLocation?.('leftArm');
                        const coverageLabel = armour.system?.coverageLabel;
                        if (
                            coversAll === false &&
                            locCount === 2 &&
                            headAP === 4 &&
                            armAP === 0 &&
                            typeof coverageLabel === 'string' &&
                            coverageLabel.length > 0
                        ) {
                            fired['armour-coverage-derivation'] = true;
                            notes['armour-coverage-derivation'] = `coversAll=false locationCount=2 head AP=4 arm AP=0 coverageLabel="${coverageLabel}"`;
                        } else {
                            notes['armour-coverage-derivation'] =
                                `expected coversAll=false locCount=2 headAP=4 armAP=0 label!="", got coversAll=${String(coversAll)} locCount=${locCount} headAP=${headAP} armAP=${armAP} label=${JSON.stringify(coverageLabel)}`;
                        }
                    }
                } catch (err) {
                    notes['armour-coverage-derivation'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 4: armour-stealth-penalty
                 * Power armour with AP 8 everywhere → some location > 7 →
                 * imposesStealthPenalty true, stealthPenalty -30.
                 * ============================================================ */
                try {
                    const armour = await embed('armour-stealth-penalty', {
                        name: 'probe-armour-power',
                        type: 'armour',
                        system: {
                            identifier: 'probe-armour-stealth',
                            type: 'power',
                            craftsmanship: 'common',
                            armourPoints: { head: 8, leftArm: 8, rightArm: 8, body: 8, leftLeg: 8, rightLeg: 8 },
                            coverage: ['head', 'leftArm', 'rightArm', 'body', 'leftLeg', 'rightLeg'],
                        },
                    });
                    if (!armour) {
                        notes['armour-stealth-penalty'] = 'failed to create armour';
                    } else {
                        const imposes = armour.system?.imposesStealthPenalty;
                        const penalty = armour.system?.stealthPenalty;
                        const protLevel = armour.system?.protectionLevel;
                        if (imposes === true && penalty === -30 && protLevel === 'power') {
                            fired['armour-stealth-penalty'] = true;
                            notes['armour-stealth-penalty'] = `AP 8 everywhere → imposesStealthPenalty=true stealthPenalty=-30 protectionLevel=power`;
                        } else {
                            notes['armour-stealth-penalty'] =
                                `expected imposes=true penalty=-30 level=power, got imposes=${String(imposes)} penalty=${penalty} level=${protLevel}`;
                        }
                    }
                } catch (err) {
                    notes['armour-stealth-penalty'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 5: gear-weight-math
                 * Non-drug gear, craftsmanship 'good' (-10% weight). weight 10
                 * quantity 3 → totalWeight 30, effectiveWeight 9,
                 * effectiveTotalWeight 27, hasCraftsmanshipEffects true.
                 * ============================================================ */
                try {
                    const gear = await embed('gear-weight-math', {
                        name: 'probe-gear-toolkit',
                        type: 'gear',
                        system: {
                            identifier: 'probe-gear-weight',
                            category: 'tools',
                            craftsmanship: 'good',
                            weight: 10,
                            quantity: 3,
                        },
                    });
                    if (!gear) {
                        notes['gear-weight-math'] = 'failed to create gear';
                    } else {
                        const total = gear.system?.totalWeight;
                        const effWeight = gear.system?.effectiveWeight;
                        const effTotal = gear.system?.effectiveTotalWeight;
                        const hasCraft = gear.system?.hasCraftsmanshipEffects;
                        if (total === 30 && effWeight === 9 && effTotal === 27 && hasCraft === true) {
                            fired['gear-weight-math'] = true;
                            notes['gear-weight-math'] = `totalWeight=30 effectiveWeight=9 (good -10%) effectiveTotalWeight=27 hasCraftsmanshipEffects=true`;
                        } else {
                            notes['gear-weight-math'] =
                                `expected total=30 eff=9 effTotal=27 hasCraft=true, got total=${total} eff=${effWeight} effTotal=${effTotal} hasCraft=${String(hasCraft)}`;
                        }
                    }
                } catch (err) {
                    notes['gear-weight-math'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 6: gear-uses-exhausted
                 * Consumable with uses {value:0, max:5} → hasLimitedUses true,
                 * usesExhausted true, usesDisplay "0/5".
                 * ============================================================ */
                try {
                    const gear = await embed('gear-uses-exhausted', {
                        name: 'probe-gear-medkit',
                        type: 'gear',
                        system: {
                            identifier: 'probe-gear-uses',
                            category: 'medical',
                            consumable: true,
                            uses: { value: 0, max: 5 },
                        },
                    });
                    if (!gear) {
                        notes['gear-uses-exhausted'] = 'failed to create gear';
                    } else {
                        const hasUses = gear.system?.hasLimitedUses;
                        const exhausted = gear.system?.usesExhausted;
                        const display = gear.system?.usesDisplay;
                        if (hasUses === true && exhausted === true && display === '0/5') {
                            fired['gear-uses-exhausted'] = true;
                            notes['gear-uses-exhausted'] = `hasLimitedUses=true usesExhausted=true usesDisplay="0/5"`;
                        } else {
                            notes['gear-uses-exhausted'] =
                                `expected hasUses=true exhausted=true display="0/5", got hasUses=${String(hasUses)} exhausted=${String(exhausted)} display=${JSON.stringify(display)}`;
                        }
                    }
                } catch (err) {
                    notes['gear-uses-exhausted'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 7: talent-prerequisites
                 * Structured prerequisites (characteristics + skills) →
                 * hasPrerequisites true, prerequisitesLabel joins
                 * "Strength 40+" + skill names. Text branch is empty so the
                 * structured-assembly branch (not the text short-circuit) runs.
                 * ============================================================ */
                try {
                    const talent = await embed('talent-prerequisites', {
                        name: 'probe-talent-prereqs',
                        type: 'talent',
                        system: {
                            identifier: 'probe-talent-pre',
                            tier: 2,
                            cost: 200,
                            prerequisites: {
                                text: '',
                                characteristics: { Strength: 40 },
                                skills: ['Athletics'],
                                talents: [],
                            },
                        },
                    });
                    if (!talent) {
                        notes['talent-prerequisites'] = 'failed to create talent';
                    } else {
                        const has = talent.system?.hasPrerequisites;
                        const label = talent.system?.prerequisitesLabel;
                        if (
                            has === true &&
                            typeof label === 'string' &&
                            label.includes('Strength 40+') &&
                            label.includes('Athletics')
                        ) {
                            fired['talent-prerequisites'] = true;
                            notes['talent-prerequisites'] = `hasPrerequisites=true prerequisitesLabel="${label}"`;
                        } else {
                            notes['talent-prerequisites'] = `expected has=true label⊇"Strength 40+","Athletics", got has=${String(has)} label=${JSON.stringify(label)}`;
                        }
                    }
                } catch (err) {
                    notes['talent-prerequisites'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 8: talent-grants-summary
                 * grants.skills + grants.talents + grants.traits populated →
                 * hasGrants true, grantsSummary has a "Skills:"/"Talents:"/
                 * "Traits:" entry each.
                 * ============================================================ */
                try {
                    const talent = await embed('talent-grants-summary', {
                        name: 'probe-talent-grants',
                        type: 'talent',
                        system: {
                            identifier: 'probe-talent-grant',
                            tier: 1,
                            grants: {
                                skills: [{ name: 'Awareness', specialization: '', level: 'trained' }],
                                talents: [{ name: 'Quick Draw', specialization: '', uuid: '' }],
                                traits: [{ name: 'Unnatural Strength', level: 2, uuid: '' }],
                                specialAbilities: [],
                            },
                        },
                    });
                    if (!talent) {
                        notes['talent-grants-summary'] = 'failed to create talent';
                    } else {
                        const has = talent.system?.hasGrants;
                        const summary = talent.system?.grantsSummary;
                        const arr = Array.isArray(summary) ? (summary as string[]) : [];
                        const hasSkills = arr.some((s) => s.startsWith('Skills:') && s.includes('Awareness'));
                        const hasTalents = arr.some((s) => s.startsWith('Talents:') && s.includes('Quick Draw'));
                        const hasTraits = arr.some((s) => s.startsWith('Traits:') && s.includes('Unnatural Strength'));
                        if (has === true && hasSkills && hasTalents && hasTraits) {
                            fired['talent-grants-summary'] = true;
                            notes['talent-grants-summary'] = `hasGrants=true grantsSummary covers skills+talents+traits: ${JSON.stringify(arr)}`;
                        } else {
                            notes['talent-grants-summary'] =
                                `expected has=true and skills/talents/traits entries, got has=${String(has)} summary=${JSON.stringify(arr)}`;
                        }
                    }
                } catch (err) {
                    notes['talent-grants-summary'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 9: talent-specialization-fullname
                 * Name "probe-talent (X)" with stackable + rank 3 + explicit
                 * specialization "Las". prepareDerivedData auto-infers
                 * hasSpecialization from the "(X)" name; fullName appends
                 * " (Las)" then " x3".
                 * ============================================================ */
                try {
                    const talent = await embed('talent-specialization-fullname', {
                        name: 'probe-talent (X)',
                        type: 'talent',
                        system: {
                            identifier: 'probe-talent-spec',
                            tier: 2,
                            stackable: true,
                            rank: 3,
                            specialization: 'Las',
                            isPassive: false,
                            rollConfig: { characteristic: 'ballisticSkill', skill: '', modifier: 0, description: '' },
                        },
                    });
                    if (!talent) {
                        notes['talent-specialization-fullname'] = 'failed to create talent';
                    } else {
                        const hasSpec = talent.system?.hasSpecialization;
                        const fullName = talent.system?.fullName;
                        const rollable = talent.system?.isRollable;
                        if (hasSpec === true && fullName === 'probe-talent (X) (Las) x3' && rollable === true) {
                            fired['talent-specialization-fullname'] = true;
                            notes['talent-specialization-fullname'] = `prepareDerivedData inferred hasSpecialization=true; fullName="${fullName}"; isRollable=true`;
                        } else {
                            notes['talent-specialization-fullname'] =
                                `expected hasSpec=true fullName="probe-talent (X) (Las) x3" rollable=true, got hasSpec=${String(hasSpec)} fullName=${JSON.stringify(fullName)} rollable=${String(rollable)}`;
                        }
                    }
                } catch (err) {
                    notes['talent-specialization-fullname'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 10: ammunition-modifiers
                 * Ammo with damage +2 / penetration +3 → hasModifiers true;
                 * chatProperties surfaces "Damage: +2" and "Pen: +3" (sign
                 * prefix branch). weaponTypes set → weaponTypesLabel non-empty.
                 * ============================================================ */
                try {
                    const ammo = await embed('ammunition-modifiers', {
                        name: 'probe-ammo-manstopper',
                        type: 'ammunition',
                        system: {
                            identifier: 'probe-ammo',
                            weaponTypes: ['pistol', 'basic'],
                            modifiers: { damage: 2, penetration: 3, range: 0, rateOfFire: { single: 0, semi: 0, full: 0 } },
                            addedQualities: ['tearing'],
                        },
                    });
                    if (!ammo) {
                        notes['ammunition-modifiers'] = 'failed to create ammunition';
                    } else {
                        const hasMods = ammo.system?.hasModifiers;
                        const typesLabel = ammo.system?.weaponTypesLabel;
                        const chatProps = ammo.system?.chatProperties;
                        const arr = Array.isArray(chatProps) ? (chatProps as string[]) : [];
                        const hasDmg = arr.some((p) => p === 'Damage: +2');
                        const hasPen = arr.some((p) => p === 'Pen: +3');
                        if (hasMods === true && typeof typesLabel === 'string' && typesLabel.length > 0 && hasDmg && hasPen) {
                            fired['ammunition-modifiers'] = true;
                            notes['ammunition-modifiers'] = `hasModifiers=true weaponTypesLabel="${typesLabel}" chatProperties has "Damage: +2","Pen: +3"`;
                        } else {
                            notes['ammunition-modifiers'] =
                                `expected hasMods=true label!="" Damage:+2 Pen:+3, got hasMods=${String(hasMods)} label=${JSON.stringify(typesLabel)} props=${JSON.stringify(arr)}`;
                        }
                    }
                } catch (err) {
                    notes['ammunition-modifiers'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 11: force-field-overload
                 * Explicit overloadMin 1 / overloadMax 15 (≠ default 1/10) →
                 * effectiveOverloadRange uses the explicit values;
                 * checksOverload(10)=true, checksOverload(16)=false;
                 * overloadRangeLabel "01-15"; activated+!overloaded →
                 * isProtecting true.
                 * ============================================================ */
                try {
                    const ff = await embed('force-field-overload', {
                        name: 'probe-ff-conversion',
                        type: 'forceField',
                        system: {
                            identifier: 'probe-ff',
                            protectionRating: 60,
                            craftsmanship: 'common',
                            activated: true,
                            overloaded: false,
                            overloadMin: 1,
                            overloadMax: 15,
                        },
                    });
                    if (!ff) {
                        notes['force-field-overload'] = 'failed to create force field';
                    } else {
                        const range = ff.system?.effectiveOverloadRange;
                        const checks10 = ff.system?.checksOverload?.(10);
                        const checks16 = ff.system?.checksOverload?.(16);
                        const label = ff.system?.overloadRangeLabel;
                        const protecting = ff.system?.isProtecting;
                        if (
                            range?.min === 1 &&
                            range?.max === 15 &&
                            checks10 === true &&
                            checks16 === false &&
                            label === '01-15' &&
                            protecting === true
                        ) {
                            fired['force-field-overload'] = true;
                            notes['force-field-overload'] = `effectiveOverloadRange={1,15} checksOverload(10)=true checksOverload(16)=false label="01-15" isProtecting=true`;
                        } else {
                            notes['force-field-overload'] =
                                `expected range{1,15} checks10=true checks16=false label="01-15" protecting=true, got range=${JSON.stringify(range)} c10=${String(checks10)} c16=${String(checks16)} label=${JSON.stringify(label)} protecting=${String(protecting)}`;
                        }
                    }
                } catch (err) {
                    notes['force-field-overload'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 12: force-field-craftsmanship
                 * Default overloadMin/Max (1/10) but craftsmanship 'best' →
                 * effectiveOverloadRange falls back to craftsmanshipModifiers
                 * (best → max 1), overloadRangeLabel "01", checksOverload(1)
                 * true, checksOverload(2) false.
                 * ============================================================ */
                try {
                    const ff = await embed('force-field-craftsmanship', {
                        name: 'probe-ff-best',
                        type: 'forceField',
                        system: {
                            identifier: 'probe-ff-best',
                            protectionRating: 30,
                            craftsmanship: 'best',
                            activated: false,
                            overloaded: false,
                            overloadMin: 1,
                            overloadMax: 10,
                        },
                    });
                    if (!ff) {
                        notes['force-field-craftsmanship'] = 'failed to create force field';
                    } else {
                        const range = ff.system?.effectiveOverloadRange;
                        const label = ff.system?.overloadRangeLabel;
                        const checks1 = ff.system?.checksOverload?.(1);
                        const checks2 = ff.system?.checksOverload?.(2);
                        const protecting = ff.system?.isProtecting;
                        if (range?.min === 1 && range?.max === 1 && label === '01' && checks1 === true && checks2 === false && protecting === false) {
                            fired['force-field-craftsmanship'] = true;
                            notes['force-field-craftsmanship'] = `best craft → effectiveOverloadRange={1,1} label="01" checksOverload(1)=true (2)=false; isProtecting=false (inactive)`;
                        } else {
                            notes['force-field-craftsmanship'] =
                                `expected range{1,1} label="01" c1=true c2=false protecting=false, got range=${JSON.stringify(range)} label=${JSON.stringify(label)} c1=${String(checks1)} c2=${String(checks2)} protecting=${String(protecting)}`;
                        }
                    }
                } catch (err) {
                    notes['force-field-craftsmanship'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 13: trait-level-variable
                 * Name "probe-trait (X)" with level 4 → hasLevel true,
                 * fullName "probe-trait (X) (4)", isVariable true,
                 * categoryLabel resolves (combat category).
                 * ============================================================ */
                try {
                    const trait = await embed('trait-level-variable', {
                        name: 'probe-trait (X)',
                        type: 'trait',
                        system: {
                            identifier: 'probe-trait',
                            category: 'combat',
                            level: 4,
                            fearRating: 0,
                        },
                    });
                    if (!trait) {
                        notes['trait-level-variable'] = 'failed to create trait';
                    } else {
                        const hasLevel = trait.system?.hasLevel;
                        const fullName = trait.system?.fullName;
                        const isVariable = trait.system?.isVariable;
                        const categoryLabel = trait.system?.categoryLabel;
                        if (
                            hasLevel === true &&
                            fullName === 'probe-trait (X) (4)' &&
                            isVariable === true &&
                            typeof categoryLabel === 'string' &&
                            categoryLabel.length > 0
                        ) {
                            fired['trait-level-variable'] = true;
                            notes['trait-level-variable'] = `hasLevel=true fullName="${fullName}" isVariable=true categoryLabel="${categoryLabel}"`;
                        } else {
                            notes['trait-level-variable'] =
                                `expected hasLevel=true fullName="probe-trait (X) (4)" isVariable=true label!="", got hasLevel=${String(hasLevel)} fullName=${JSON.stringify(fullName)} isVariable=${String(isVariable)} label=${JSON.stringify(categoryLabel)}`;
                        }
                    }
                } catch (err) {
                    notes['trait-level-variable'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 14: skill-derived-labels
                 * Specialist skill linked to ballisticSkill with two
                 * predefined specializations → characteristicAbbr "BS",
                 * skillTypeLabel resolves, hasSpecializations true.
                 * ============================================================ */
                try {
                    const skill = await embed('skill-derived-labels', {
                        name: 'probe-skill-trade',
                        type: 'skill',
                        system: {
                            identifier: 'probe-skill',
                            characteristic: 'ballisticSkill',
                            skillType: 'specialist',
                            specializations: ['Armourer', 'Cook'],
                        },
                    });
                    if (!skill) {
                        notes['skill-derived-labels'] = 'failed to create skill';
                    } else {
                        const abbr = skill.system?.characteristicAbbr;
                        const typeLabel = skill.system?.skillTypeLabel;
                        const hasSpecs = skill.system?.hasSpecializations;
                        if (abbr === 'BS' && typeof typeLabel === 'string' && typeLabel.length > 0 && hasSpecs === true) {
                            fired['skill-derived-labels'] = true;
                            notes['skill-derived-labels'] = `characteristicAbbr="BS" skillTypeLabel="${typeLabel}" hasSpecializations=true`;
                        } else {
                            notes['skill-derived-labels'] =
                                `expected abbr="BS" typeLabel!="" hasSpecs=true, got abbr=${JSON.stringify(abbr)} typeLabel=${JSON.stringify(typeLabel)} hasSpecs=${String(hasSpecs)}`;
                        }
                    }
                } catch (err) {
                    notes['skill-derived-labels'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 15: condition-duration
                 * Stackable harmful condition, 3 stacks, duration 4 rounds →
                 * isTemporary true, durationDisplay starts with "4 ",
                 * fullName "probe-condition (×3)", natureClass "nature-harmful".
                 * ============================================================ */
                try {
                    const condition = await embed('condition-duration', {
                        name: 'probe-condition',
                        type: 'condition',
                        system: {
                            identifier: 'probe-cond',
                            nature: 'harmful',
                            stackable: true,
                            stacks: 3,
                            appliesTo: 'self',
                            duration: { value: 4, units: 'rounds' },
                        },
                    });
                    if (!condition) {
                        notes['condition-duration'] = 'failed to create condition';
                    } else {
                        const isTemp = condition.system?.isTemporary;
                        const durDisplay = condition.system?.durationDisplay;
                        const fullName = condition.system?.fullName;
                        const natureClass = condition.system?.natureClass;
                        if (
                            isTemp === true &&
                            typeof durDisplay === 'string' &&
                            durDisplay.startsWith('4 ') &&
                            fullName === 'probe-condition (×3)' &&
                            natureClass === 'nature-harmful'
                        ) {
                            fired['condition-duration'] = true;
                            notes['condition-duration'] = `isTemporary=true durationDisplay="${durDisplay}" fullName="${fullName}" natureClass="nature-harmful"`;
                        } else {
                            notes['condition-duration'] =
                                `expected isTemp=true dur="4 ..." fullName="probe-condition (×3)" natureClass="nature-harmful", got isTemp=${String(isTemp)} dur=${JSON.stringify(durDisplay)} fullName=${JSON.stringify(fullName)} natureClass=${JSON.stringify(natureClass)}`;
                        }
                    }
                } catch (err) {
                    notes['condition-duration'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 16: weapon-modification-restrictions
                 * Modification with restrictions + non-zero modifiers. The
                 * _cleanData Set→Array round-trip must survive persistence;
                 * restrictionsLabel includes "Classes:"/"Types:", hasModifiers
                 * true, categoryIcon resolves for the 'sight' category.
                 * ============================================================ */
                try {
                    const mod = await embed('weapon-modification-restrictions', {
                        name: 'probe-weapon-mod-scope',
                        type: 'weaponModification',
                        system: {
                            identifier: 'probe-weapon-mod',
                            category: 'sight',
                            restrictions: { weaponClasses: ['basic'], weaponTypes: ['las'] },
                            modifiers: {
                                damage: 0,
                                penetration: 0,
                                range: 0,
                                rangeMultiplier: 1,
                                clip: 0,
                                toHit: 10,
                                weight: 0,
                                rateOfFire: { single: 0, semi: 0, full: 0 },
                            },
                            addedQualities: ['accurate'],
                        },
                    });
                    if (!mod) {
                        notes['weapon-modification-restrictions'] = 'failed to create weapon modification';
                    } else {
                        const restrictionsLabel = mod.system?.restrictionsLabel;
                        const hasMods = mod.system?.hasModifiers;
                        const icon = mod.system?.categoryIcon;
                        if (
                            typeof restrictionsLabel === 'string' &&
                            restrictionsLabel.includes('Classes:') &&
                            restrictionsLabel.includes('Types:') &&
                            hasMods === true &&
                            icon === 'fa-crosshairs'
                        ) {
                            fired['weapon-modification-restrictions'] = true;
                            notes['weapon-modification-restrictions'] = `restrictionsLabel="${restrictionsLabel}" hasModifiers=true categoryIcon="fa-crosshairs" (Set→Array clean round-trip ok)`;
                        } else {
                            notes['weapon-modification-restrictions'] =
                                `expected label⊇Classes:/Types: hasMods=true icon=fa-crosshairs, got label=${JSON.stringify(restrictionsLabel)} hasMods=${String(hasMods)} icon=${JSON.stringify(icon)}`;
                        }
                    }
                } catch (err) {
                    notes['weapon-modification-restrictions'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }
            } finally {
                // Best-effort cleanup of everything we created.
                for (const fn of cleanups) {
                    try {
                        await fn();
                    } catch {
                        /* ignore */
                    }
                }
            }

            return { flowsFired: fired, flowNotes: notes };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, DATA_ITEM_MODEL_FLOWS);

        return {
            flowsFired: result.flowsFired as Record<FlowName, boolean>,
            flowNotes: result.flowNotes as Partial<Record<FlowName, string>>,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('item DataModel derived-data (Tier B)', () => {
    // Cap at 3 minutes — per-call timeouts mean we should never come close.
    test.setTimeout(180_000);
    test('item DataModels round-trip schema fields and compute derived getters', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeDataItemModelFlows(page);

        const failures: string[] = [];
        for (const flow of DATA_ITEM_MODEL_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('data-item-model.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${DATA_ITEM_MODEL_FLOWS.length} data-item-model probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
