import { DHBasicActionManager } from '../actions/basic-action-manager.ts';
import { SYSTEM_ID } from '../constants.ts';
import type D100Roll from '../dice/d100-roll.ts';
import { t } from '../i18n/t.ts';
import { refundAmmo, useAmmo } from '../rules/ammo.ts';
import { hitsForDegrees, isBurstAction } from '../rules/auto-fire.ts';
import { autoFailingConditions, helplessAutoHitConditions, rolledCharacteristic } from '../rules/condition-mechanics.ts';
import { activeConditionMechanics } from '../rules/condition-registry.ts';
import { clampDisposition, labelForDisposition } from '../rules/disposition.ts';
import { ARMED_TEST_HOOKS_FLAG, consumeArmedTestHooks, readArmedTestHooks } from '../rules/dynamic-modifiers.ts';
import { type EffectRecipientLike, gmProxyActorUpdate, gmProxyCreateActorEffects } from '../rules/gm-proxy.ts';
import { DAMAGE_TIER_LABEL_KEYS, firstAidTierPenalty, getDamageTier } from '../rules/healing.ts';
import { type AllocationTarget, allocateHits } from '../rules/hit-allocation.ts';
import { getHitLocationForRoll } from '../rules/hit-locations.ts';
import { type OpposedSide, opposedDegrees, resolveOpposed } from '../rules/opposed.ts';
import { resolvePhenomenaTrigger } from '../rules/phenomena-modifier.ts';
import { type CastRecipient, castEffectsFor, type PowerEffectSource } from '../rules/psychic-cast-effects.ts';
import type { RerollOption } from '../rules/reroll.ts';
import { scatterDirection } from '../rules/scatter.ts';
import {
    applyFirstAidOutcome,
    blatherRounds,
    evaluateSkillUseGate,
    type FirstAidPatient,
    getSkillUse,
    getSkillUses,
    type ReadoutFamily,
    resolveDosReadout,
    resolveFirstAid,
    resolveInterrogation,
    resolveSocialInfluence,
    type SkillUseDef,
    type SkillUseKind,
    useNeedsItemChoice,
} from '../rules/skill-uses.ts';
import { shouldSkipSelfTargetDefenderMods } from '../rules/target-situationals.ts';
import { isWarpWeak, type WarpWeaknessScene } from '../rules/warp-weakness.ts';
import { shouldDestroyOnCriticalFail, weaponDestroysOnCriticalFail } from '../rules/weapon-destroy.ts';
import { getJamFloor, shouldJamRoll } from '../rules/weapon-jam.ts';
import { attackTriggersRecharge } from '../rules/weapon-recharge.ts';
import { playWeaponAttackSoundsForRoll } from '../rules/weapon-sounds.ts';
import { DAY_SECONDS } from '../rules/world-time.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import { RollTableUtils } from '../utils/roll-table-utils.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { type AttackDataLike, Hit, PsychicDamageData, WeaponDamageData } from './damage-data.ts';
import type { ExtendedTestChatContext } from './extended-test-data.ts';
import { PsychicRollData, RollData, WeaponRollData } from './roll-data.ts';
import { getDegreeForMode, isD100Success, resolveDegreesMethod, roll1d100, sendActionDataToChat, uuid } from './roll-helpers.ts';
import { keepModeCardNote } from './roll-keep.ts';

/** Langpack keys of the headings the effect rows on an action card are filed under. */
const EFFECT_TITLE = {
    psychicPhenomena: 'WH40K.ActionEffect.Title.PsychicPhenomena',
    psychic: 'WH40K.ActionEffect.Title.Psychic',
    feint: 'WH40K.ActionEffect.Title.Feint',
    knockDown: 'WH40K.ActionEffect.Title.KnockDown',
    manoeuvre: 'WH40K.ActionEffect.Title.Manoeuvre',
    disarm: 'WH40K.ActionEffect.Title.Disarm',
    allOutAttack: 'WH40K.ActionEffect.Title.AllOutAttack',
    stunAttack: 'WH40K.ActionEffect.Title.StunAttack',
    spray: 'WH40K.ActionEffect.Title.Spray',
    suppressing: 'WH40K.ActionEffect.Title.Suppressing',
    nearOverheat: 'WH40K.ActionEffect.Title.NearOverheat',
    catastrophicJam: 'WH40K.ActionEffect.Title.CatastrophicJam',
    nearJam: 'WH40K.ActionEffect.Title.NearJam',
    deviation: 'WH40K.ActionEffect.Title.Deviation',
    autoFailure: 'WH40K.ActionEffect.Title.AutoFailure',
    overheats: 'WH40K.ActionEffect.Title.Overheats',
    jam: 'WH40K.ActionEffect.Title.Jam',
    medicae: 'WH40K.ActionEffect.Title.Medicae',
    interrogation: 'WH40K.ActionEffect.Title.Interrogation',
    readout: 'WH40K.ActionEffect.Title.Readout',
    detection: 'WH40K.ActionEffect.Title.Detection',
    social: 'WH40K.ActionEffect.Title.Social',
    contest: 'WH40K.ActionEffect.Title.Contest',
    demolition: 'WH40K.ActionEffect.Title.Demolition',
    object: 'WH40K.ActionEffect.Title.Object',
    techUse: 'WH40K.ActionEffect.Title.TechUse',
    athletics: 'WH40K.ActionEffect.Title.Athletics',
    security: 'WH40K.ActionEffect.Title.Security',
    sleightOfHand: 'WH40K.ActionEffect.Title.SleightOfHand',
    chemUse: 'WH40K.ActionEffect.Title.ChemUse',
    blather: 'WH40K.ActionEffect.Title.Blather',
    warCry: 'WH40K.ActionEffect.Title.WarCry',
} as const;

export class ActionData {
    id: string = uuid();
    template: string = '';
    hasDamage: boolean = false;
    rollData: RollData;
    damageData: { hits: Hit[]; additionalHits: number; reset: () => void } | undefined;
    effects: string[] = [];
    effectOutput: { name: string; effect: string }[] = [];
    // Tracks Fate Point spends across the lifetime of this roll-chain. Survives reset()
    // so that re-rolling does not also reset the single-spend lockout (unless the homebrew
    // `multipleFateBurnPerRoll` setting is enabled, in which case the handlers ignore these).
    fateUses: { reroll: boolean; addDoS: boolean } = { reroll: false, addDoS: false };
    /**
     * Extended Test ladder for this attempt (#59), or undefined when the roll is not
     * part of one. `postFlattenedInstanceToChat` flattens this instance, so the field
     * lands at TOP level — which is where `simple-roll-chat.hbs` reads `extendedTest`
     * before handing it to `chat/partial/extended-test-progress.hbs`.
     */
    extendedTest: ExtendedTestChatContext | undefined;

    constructor() {
        this.rollData = new RollData();
    }

    /**
     * Fate Points currently available on the source actor (0 when the actor has
     * no fate pool — e.g. non-fate game systems — or has spent out). Surfaced to
     * chat templates via {@link resolveGettersForTemplate} so the Fate reroll /
     * +DoS controls only render when there is actually a point to spend.
     */
    get sourceFatePoints(): number {
        const fate = (this.rollData.sourceActor?.system as { fate?: { value?: number } } | undefined)?.fate;
        return fate?.value ?? 0;
    }

    /**
     * Re-roll options for THIS resolved roll — each applicable talent/trait
     * re-roll variant (e.g. Keen Intuition), any `wh40k.collectRerollOptions`
     * hook contributions, and the global Spend-Fate re-roll. Surfaced to chat
     * templates via {@link resolveGettersForTemplate} so the card renders one
     * button per source. Empty when there is no source actor.
     */
    get rerollOptions(): RerollOption[] {
        const actor = this.rollData.sourceActor;
        if (actor === null) return [];
        // eslint-disable-next-line no-restricted-syntax -- boundary: rollData.weapon is a WH40KItem; isMelee/isRanged are DataModel getters not surfaced on that union at this layer
        const weapon = this.rollData.weapon as { isMelee?: boolean; isRanged?: boolean } | undefined;
        return actor.getRerollOptions({
            success: this.rollData.success,
            type: this.rollData.type,
            rollKey: this.rollData.rollKey,
            isMelee: weapon?.isMelee === true,
            isRanged: weapon?.isRanged === true,
        });
    }

    reset(): void {
        this.effects = [];
        this.effectOutput = [];
        this.damageData?.reset();
        this.rollData.reset();
    }

    async descriptionText(): Promise<void> {
        // No-op default — subclasses (e.g. PsychicActionData) can override
    }

    /**
     * Warp weakness of the scene the roll happens in (#137). Guarded because rolls
     * can resolve before the canvas exists (early-boot, headless test runs), where
     * `game.scenes` is not yet populated — an absent scene is simply not Warp-weak.
     */
    #activeSceneWarpWeakness(): boolean {
        try {
            // eslint-disable-next-line no-restricted-syntax -- boundary: game.scenes.active is a Foundry Scene document projected onto the local read-surface
            return isWarpWeak(game.scenes.active as unknown as WarpWeaknessScene | null | undefined);
        } catch {
            return false;
        }
    }

    async checkForPerils(): Promise<void> {
        if (this.rollData.power === undefined) return;

        const sourceActor = this.rollData.sourceActor;
        if (sourceActor === null) return;

        const sourceSystem = sourceActor.system as { psy?: { rating: number } };
        const psyRating = sourceSystem.psy?.rating ?? 0;
        const rollTotal = this.rollData.roll?.total;
        if (rollTotal === undefined) return;

        const power = this.rollData.power;
        const powerSystem = power.system as { phenomenaModifier?: number };
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- `.system ??` defaults are banned by repo policy; explicit undefined handling is intentional here
        const powerPhenomenaModifier = powerSystem.phenomenaModifier === undefined ? 0 : powerSystem.phenomenaModifier;

        // Push's phenomena consequences are computed by `resolvePsyMode` in the roll
        // dialog and written here; until #514 nothing read them, so pushing a power
        // neither forced the draw nor escalated it.
        const rd = this.rollData as PsychicRollData & { psyForcePhenomena?: boolean; psyPhenomenaModifier?: number };

        const outcome = resolvePhenomenaTrigger({
            rollTotal: rollTotal,
            isDoubles: /^(.)\1+$/.test(rollTotal.toString()),
            overchannelling: psyRating < (this.rollData as PsychicRollData).pr,
            psyForcePhenomena: rd.psyForcePhenomena === true && this.rollData.success,
            psyPhenomenaModifier: rd.psyPhenomenaModifier ?? 0,
            powerPhenomenaModifier,
            warpWeakness: this.#activeSceneWarpWeakness(),
            // RAW (within.md p. 58) adds +5 per Corruption Point the psyker gained
            // FROM THIS PUSH. That award does not exist anywhere in the system yet —
            // nothing grants CP on a push — and deciding which talent gates it would
            // hardcode content in `src/`, which Direction #7 forbids. The rider is
            // therefore wired but contributes 0 until a Tainted Psyker CP award is
            // authored on the compendium talent and read from the actor; the
            // arithmetic for it is already covered by `composePhenomenaModifier`.
            taintedPsykerPushCP: 0,
        });

        if (!outcome.triggered) return;

        this.addEffect(t(EFFECT_TITLE.psychicPhenomena), t('WH40K.ActionEffect.PsychicPhenomena'));

        let autoRoll = true;
        try {
            autoRoll = game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.autoPsychicPhenomena) === true;
        } catch {
            // Setting may not be registered yet during early-boot rolls; default to on.
        }
        if (!autoRoll) return;

        await RollTableUtils.rollPsychicPhenomena(sourceActor, outcome.modifier, outcome.ladderStep);
    }

    /**
     * Resolve the opposed contest (#449) once the target's roll is known: build both
     * sides, run the RAW victor ladder (`resolveOpposed`), and write the outcome —
     * the initiator's `success` becomes whether it won, and `opposedMargin` carries
     * the winner's degrees of victory for consumers to scale on. Shared by the
     * characteristic path (below) and the skill path (SocialInfluenceActionData).
     */
    applyOpposedResult(target: { success: boolean; dos: number; dof: number; roll?: number | undefined }): void {
        const initiatorRoll = this.rollData.roll?.total;
        const initiator: OpposedSide = {
            success: this.rollData.success,
            dos: this.rollData.dos,
            dof: this.rollData.dof,
            ...(initiatorRoll !== undefined ? { roll: initiatorRoll } : {}),
        };
        const targetSide: OpposedSide = {
            success: target.success,
            dos: target.dos,
            dof: target.dof,
            ...(target.roll !== undefined ? { roll: target.roll } : {}),
        };
        const result = resolveOpposed(initiator, targetSide);
        this.rollData.opposedSuccess = target.success;
        this.rollData.success = result.winner === 'initiator';
        this.rollData.opposedMargin = result.margin;
    }

    /**
     * Record the target's side of an opposed contest from its quick d100 test and
     * resolve the contest. A target that cannot make the test (null) leaves the
     * initiator's result standing.
     */
    applyOpposedCheck(check: D100Roll | null): void {
        if (check === null) return;
        this.rollData.opposedRoll = check;
        this.rollData.opposedTarget = check.target;
        this.rollData.opposedDos = check.degreesOfSuccess;
        this.rollData.opposedDof = check.degreesOfFailure;
        this.applyOpposedResult({ success: check.isSuccess, dos: check.degreesOfSuccess, dof: check.degreesOfFailure, roll: check.evaluatedTotal });
    }

    async checkForOpposed(): Promise<void> {
        if (this.rollData.isOpposed && this.rollData.targetActor !== null) {
            this.applyOpposedCheck(await this.rollData.targetActor.rollCharacteristicCheck(this.rollData.opposedChar));
        }

        const weaponRollData = this.rollData as WeaponRollData;
        if (weaponRollData.isFeint) {
            if (!this.rollData.success) {
                this.addEffect(t(EFFECT_TITLE.feint), t('WH40K.ActionEffect.Feint.Failed'));
            } else if (this.rollData.targetActor !== null) {
                this.addEffect(t(EFFECT_TITLE.feint), t('WH40K.ActionEffect.Feint.Succeeded'));
            } else {
                this.addEffect(t(EFFECT_TITLE.feint), t('WH40K.ActionEffect.Feint.Compare'));
            }
        }

        if (weaponRollData.isKnockDown) {
            if (this.rollData.targetActor !== null) {
                const oppDegrees = opposedDegrees(
                    { dos: this.rollData.dos, dof: this.rollData.dof },
                    { dos: this.rollData.opposedDos, dof: this.rollData.opposedDof },
                );
                if (oppDegrees >= 2) {
                    const sourceActor = this.rollData.sourceActor;
                    const sourceCharacteristics =
                        sourceActor !== null ? (sourceActor.system as { characteristics?: { strength?: { bonus: number } } }).characteristics : undefined;
                    const strengthBonus = sourceCharacteristics?.strength?.bonus ?? 0;
                    this.addEffect(t(EFFECT_TITLE.knockDown), t('WH40K.ActionEffect.KnockDown.Impact', { strengthBonus }));
                } else if (oppDegrees > 0) {
                    this.addEffect(t(EFFECT_TITLE.knockDown), t('WH40K.ActionEffect.KnockDown.Prone'));
                } else if (oppDegrees > -2) {
                    this.addEffect(t(EFFECT_TITLE.knockDown), t('WH40K.ActionEffect.KnockDown.Failed'));
                } else {
                    this.addEffect(t(EFFECT_TITLE.knockDown), t('WH40K.ActionEffect.KnockDown.Backfired'));
                }
            } else if (this.rollData.success) {
                this.addEffect(t(EFFECT_TITLE.knockDown), t('WH40K.ActionEffect.KnockDown.Compare'));
            } else {
                this.addEffect(t(EFFECT_TITLE.knockDown), t('WH40K.ActionEffect.KnockDown.Failed'));
            }
        }

        // #450: Manoeuvre — opposed WS; a win shoves the target 1 metre.
        if (weaponRollData.isManoeuvre) {
            this.addEffect(t(EFFECT_TITLE.manoeuvre), this.rollData.success ? t('WH40K.Combat.ManoeuvrePush') : t('WH40K.Combat.ManoeuvreFail'));
        }

        // #450: Disarm — opposed WS; a win drops the target's weapon, 3+ degrees of
        // victory lets the attacker take it (uses the #449 margin).
        if (weaponRollData.isDisarm) {
            if (!this.rollData.success) {
                this.addEffect(t(EFFECT_TITLE.disarm), t('WH40K.Combat.DisarmFail'));
            } else if (this.rollData.opposedMargin >= 3) {
                this.addEffect(t(EFFECT_TITLE.disarm), t('WH40K.Combat.DisarmTake'));
            } else {
                this.addEffect(t(EFFECT_TITLE.disarm), t('WH40K.Combat.DisarmDrop'));
            }
        }
    }

    async _calculateHit(): Promise<void> {
        const weaponRollData = this.rollData as WeaponRollData;
        if ((weaponRollData as { isManualRoll?: boolean }).isManualRoll !== true) {
            // Advantage / Disadvantage / Emphasis roll the d100 twice and keep one —
            // only while the homebrew setting is on (RAW: one d100).
            const keepMode = WH40KSettings.isRollKeepModes() ? this.rollData.keepMode : 'normal';
            this.rollData.roll = await roll1d100(keepMode);
            this.rollData.keepModeNote = keepModeCardNote(keepMode, this.rollData.roll);
        }
        const rollTotal = this.rollData.roll?.total ?? 0;
        const target = this.rollData.modifiedTarget;
        this.rollData.success = isD100Success(rollTotal, target);
        this.applyConditionOutcomeRules();
    }

    /**
     * Condition-driven outcome overrides, read from the condition documents
     * (Direction #7), each surfaced as a card note naming the condition:
     *  - a melee attack against a bearer of a `helplessTarget` condition hits
     *    automatically and marks the roll so damage is rolled twice and added;
     *  - a test the roller's `autoFail` conditions name (its characteristic, or the
     *    selected test variant) fails automatically. Applied last, so it wins over
     *    an automatic hit.
     */
    applyConditionOutcomeRules(): void {
        const rd = this.rollData;
        rd.targetHelpless = false;

        // The automatic hit is printed for Weapon Skill tests only — a MELEE attack —
        // in every line (DH2 p229, RT/DW p248, OW p253, BC p245, DH1 p199).
        // eslint-disable-next-line no-restricted-syntax -- boundary: rollData.weapon is a WH40KItem; isMelee is a DataModel getter not surfaced on that union at this layer
        const weapon = rd.weapon as { isMelee?: boolean } | undefined;
        const isMeleeAttack = weapon?.isMelee === true;
        const selfTarget = shouldSkipSelfTargetDefenderMods(WH40KSettings.isHomebrewSelfTargeting(), rd.targetActor?.id ?? null, rd.sourceActor?.id ?? null);
        if (!selfTarget) {
            const helpless = helplessAutoHitConditions(activeConditionMechanics(rd.targetActor), isMeleeAttack);
            if (helpless.length > 0) {
                rd.success = true;
                rd.targetHelpless = true;
                this.addEffect(
                    game.i18n.localize('WH40K.Condition.HelplessTarget.Label'),
                    game.i18n.format('WH40K.Condition.HelplessTarget.Text', { conditions: helpless.map((c) => c.name).join(', ') }),
                );
            }
        }

        const failing = autoFailingConditions(activeConditionMechanics(rd.sourceActor), {
            characteristic: rolledCharacteristic(rd),
            variant: rd.testVariant === '' ? null : rd.testVariant,
        });
        if (failing.length > 0) {
            rd.success = false;
            rd.targetHelpless = false;
            this.addEffect(
                game.i18n.localize('WH40K.Condition.AutoFail.Label'),
                game.i18n.format('WH40K.Condition.AutoFail.Text', { conditions: failing.map((c) => c.name).join(', ') }),
            );
        }
    }

    // eslint-disable-next-line complexity -- this method is a deliberate central dispatcher for action resolution branches
    async calculateSuccessOrFailure(): Promise<void> {
        await this._calculateHit();
        const actionItem = this.rollData.weapon ?? this.rollData.power;
        const weaponRollData = this.rollData as WeaponRollData;

        if (actionItem !== undefined) {
            if (this.rollData.action === 'All Out Attack') {
                this.addEffect(t(EFFECT_TITLE.allOutAttack), t('WH40K.ActionEffect.AllOutAttack'));
            }

            if (weaponRollData.isStun) {
                const sourceActor = this.rollData.sourceActor;
                const sourceSystem =
                    sourceActor !== null ? (sourceActor.system as { getCharacteristicFuzzy?: (char: string) => { bonus: number } | undefined }) : undefined;
                const bonus = sourceSystem?.getCharacteristicFuzzy?.('Strength')?.bonus ?? 0;
                const stunRoll = new Roll(`1d10+${bonus}`, {});
                await stunRoll.evaluate();
                this.rollData.roll = stunRoll;
                const stunTotal = stunRoll.total ?? 0;

                if (this.rollData.targetActor !== null) {
                    const defense = (this.rollData.targetActor.system as { armour?: { head?: { total: number } } }).armour?.head?.total ?? 0;
                    if (stunTotal >= defense) {
                        this.rollData.success = true;
                        this.addEffect(
                            t(EFFECT_TITLE.stunAttack),
                            t('WH40K.ActionEffect.Stun.Stunned', { roll: stunTotal, defense, rounds: stunTotal - defense }),
                        );
                    } else {
                        this.rollData.success = false;
                        this.addEffect(t(EFFECT_TITLE.stunAttack), t('WH40K.ActionEffect.Stun.Resisted', { roll: stunTotal, defense }));
                    }
                } else {
                    this.rollData.success = true;
                    this.addEffect(t(EFFECT_TITLE.stunAttack), t('WH40K.ActionEffect.Stun.Compare', { roll: stunTotal }));
                }
                return;
            }

            if (this.rollData.hasAttackSpecial('Spray')) {
                this.rollData.success = true;
                this.rollData.dos = 1;
                this.rollData.dof = 0;
                this.addEffect(t(EFFECT_TITLE.spray), t('WH40K.ActionEffect.Spray'));
            }

            const itemSystem = actionItem.system as {
                isMelee?: boolean;
                isRanged?: boolean;
                craftsmanship?: string;
                isPsychicBarrage?: boolean;
                isPsychicStorm?: boolean;
                usesAmmo?: boolean;
            };
            // Blademaster's "re-roll a failed melee attack once per round" is now a
            // data-driven, player-chosen re-roll option (its talent's `reroll` block,
            // frequency 'per-round', combatMode 'melee'), surfaced on the roll card
            // via getRerollOptions — no longer an automatic re-roll here (Direction #7
            // + RAW: the talent says the character *may* re-roll).
            if (itemSystem.isRanged === true) {
                if (this.rollData.action === 'Suppressing Fire - Semi') {
                    this.addEffect(t(EFFECT_TITLE.suppressing), t('WH40K.ActionEffect.Suppressing.Semi'));
                } else if (this.rollData.action === 'Suppressing Fire - Full') {
                    this.addEffect(t(EFFECT_TITLE.suppressing), t('WH40K.ActionEffect.Suppressing.Full'));
                }

                const rollTotal = this.rollData.roll?.total ?? 0;
                const craftsmanship = itemSystem.craftsmanship;
                const hasReliable = this.rollData.hasAttackSpecial('Reliable');
                const hasUnreliable = this.rollData.hasAttackSpecial('Unreliable');
                const hasOverheats = this.rollData.hasAttackSpecial('Overheats');

                const bestNeverJamsOrOverheats = craftsmanship === 'best';

                if (rollTotal > 91 && hasOverheats) {
                    if (bestNeverJamsOrOverheats) {
                        this.rollData.success = false;
                        this.addEffect(t(EFFECT_TITLE.nearOverheat), t('WH40K.ActionEffect.NearOverheat'));
                    } else {
                        this.effects.push('overheat');
                    }
                }

                // Jam threshold check per core.md §"Weapon Jams" lives in
                // `rules/weapon-jam.ts` so it can be unit-tested without
                // standing up a full roll/actor graph.
                if (craftsmanship === 'poor' && hasUnreliable && !this.rollData.success) {
                    if (!bestNeverJamsOrOverheats) {
                        this.effects.push('jam');
                        this.addEffect(t(EFFECT_TITLE.catastrophicJam), t('WH40K.ActionEffect.CatastrophicJam'));
                    }
                } else if (!bestNeverJamsOrOverheats) {
                    const jams = shouldJamRoll({
                        action: this.rollData.action,
                        rollTotal,
                        success: this.rollData.success,
                        hasReliable,
                        hasUnreliable,
                    });
                    if (jams) {
                        this.effects.push('jam');
                        this.rollData.success = false;
                    }
                } else if (rollTotal === 100 || (!hasReliable && rollTotal >= getJamFloor(this.rollData.action))) {
                    // "best" craftsmanship still announces a near-jam for cosmetic purposes
                    // but never actually jams.
                    this.rollData.success = false;
                    this.addEffect(t(EFFECT_TITLE.nearJam), t('WH40K.ActionEffect.NearJam'));
                }
            }

            // A weapon carrying a `destroyOnCriticalFail` quality (Scavenged) falls
            // apart on an unmodified 00 — for melee AND ranged alike, so this sits
            // outside the ranged-only jam block above. Data-driven per Direction #7:
            // the trigger reads the quality's mechanic off the weapon's own
            // qualities (rules/weapon-destroy.ts is the pure roll gate, mirroring
            // rules/weapon-jam.ts). The break is persisted in useResources().
            const destroyRollTotal = this.rollData.roll?.total ?? 0;
            const destroySystemId = this.rollData.gameSystemId;
            // eslint-disable-next-line no-restricted-syntax -- boundary: rollData.weapon is a typed WH40KItemDocument; weaponDestroysOnCriticalFail accepts a duck-typed QualityItem
            const destroyWeapon = this.rollData.weapon as Parameters<typeof weaponDestroysOnCriticalFail>[0];
            if (
                shouldDestroyOnCriticalFail({
                    rollTotal: destroyRollTotal,
                    hasDestroyQuality: weaponDestroysOnCriticalFail(destroyWeapon, destroySystemId),
                })
            ) {
                this.effects.push('weapon-broken');
                this.rollData.success = false;
            }
        }

        // Degrees method resolves from the `degreesMode` setting + the source
        // actor's game system (Gen 1 margin/10 vs Gen 2 tens-digit).
        const degreesMethod = resolveDegreesMethod(this.rollData.gameSystemId);

        if (this.rollData.success) {
            this.rollData.dof = 0;
            // Floored at 1: a FORCED success (a helpless target, Spray) can have a
            // roll above the target, whose negative margin is not a degree count.
            this.rollData.dos = Math.max(1, 1 + getDegreeForMode(degreesMethod, this.rollData.modifiedTarget, this.rollData.roll?.total ?? 0));

            const damageData = this.damageData;
            if (actionItem !== undefined && damageData !== undefined) {
                const itemSystem = actionItem.system as { isRanged?: boolean; isPsychicBarrage?: boolean; isPsychicStorm?: boolean; usesAmmo?: boolean };
                // Which hit PROGRESSION the action uses. Suppressing Fire always
                // uses the two-DoS one ("every extra two degrees of success"),
                // whichever mode it fired — so it groups with Semi here even when
                // its ceiling comes from the full rate of fire.
                const usesSemiProgression =
                    this.rollData.action === 'Semi-Auto Burst' ||
                    this.rollData.action === 'Swift Attack' ||
                    itemSystem.isPsychicBarrage === true ||
                    this.rollData.action === 'Suppressing Fire - Semi' ||
                    this.rollData.action === 'Suppressing Fire - Full';
                const usesFullProgression =
                    this.rollData.action === 'Full Auto Burst' || this.rollData.action === 'Lightning Attack' || itemSystem.isPsychicStorm === true;

                if (usesSemiProgression || usesFullProgression) {
                    if (usesSemiProgression && itemSystem.isRanged === true && weaponRollData.hasWeaponModification('Fluid Action')) {
                        this.rollData.dos += 1;
                    }

                    const progression = usesFullProgression ? 'full' : 'semi';
                    let hits = hitsForDegrees(progression, this.rollData.dos);

                    if (this.rollData.hasAttackSpecial('Storm')) {
                        hits *= 2;
                    }

                    // The rate-of-fire ceiling applies to BURST ACTIONS — a property
                    // of the weapon's RoF, not of whether it burns ammunition (#512).
                    // Melee multi-attacks and psychic barrage/storm have no RoF and
                    // stay uncapped, exactly as before. `fireRate` is the ceiling and
                    // is never Storm-doubled (#511).
                    if (isBurstAction(this.rollData.action)) {
                        hits = Math.min(hits, weaponRollData.fireRate);
                    }

                    damageData.additionalHits += Math.max(0, hits - 1);
                }
            }

            if (this.rollData.dos > 1 && this.rollData.hasAttackSpecial('Twin-Linked') && damageData !== undefined) {
                damageData.additionalHits++;
            }
        } else {
            this.rollData.dos = 0;
            // Floored at 1 for the same reason: a FORCED failure (a condition
            // auto-fail, a jam) can have a roll at or under the target.
            this.rollData.dof = Math.max(1, 1 + getDegreeForMode(degreesMethod, this.rollData.roll?.total ?? 0, this.rollData.modifiedTarget));

            if (weaponRollData.isThrown) {
                this.addEffect(t(EFFECT_TITLE.deviation), t('WH40K.ActionEffect.Deviation', { direction: scatterDirection() }));
            }

            if (this.rollData.roll?.total === 100) {
                this.effects.push('auto-failure');
            }
        }

        // Transparency readout: derive the result formula from the final degrees
        // and the roll vs target, for the chat card (#…). Method-agnostic phrasing
        // (`1 + degree`) — the exact degrees method is explained in the card's
        // hover. Skipped for automatic / degree-less resolutions.
        if (!this.rollData.ignoreDegrees) {
            const rollTotalForFormula = this.rollData.roll?.total ?? 0;
            const target = this.rollData.modifiedTarget;
            this.rollData.resultFormula = this.rollData.success
                ? game.i18n.format('WH40K.Roll.ResultFormula.Success', {
                      dos: String(this.rollData.dos),
                      degree: String(this.rollData.dos - 1),
                      roll: String(rollTotalForFormula),
                      target: String(target),
                  })
                : game.i18n.format('WH40K.Roll.ResultFormula.Failure', {
                      dof: String(this.rollData.dof),
                      degree: String(this.rollData.dof - 1),
                      roll: String(rollTotalForFormula),
                      target: String(target),
                  });
        }
    }

    async calculateHits(): Promise<void> {
        const weaponRollData = this.rollData as WeaponRollData;
        if ((this.rollData.success || weaponRollData.isThrown) && this.damageData !== undefined) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: ActionData↔AttackDataLike are duck-typed siblings
            const attackData = this as unknown as AttackDataLike;

            // Spread the burst across the eligible targets (#513). Each hit carries
            // its index WITHIN ITS OWN TARGET, so Table 7-2 restarts per enemy
            // instead of walking one sequence across all of them.
            const allocation = allocateHits({
                hitCount: 1 + Math.max(0, this.damageData.additionalHits),
                originalTarget: this.#declaredTarget(),
                extraTargets: this.#spreadTargets(weaponRollData),
                strategy: weaponRollData.hitAllocation,
            });

            for (const allocated of allocation) {
                // eslint-disable-next-line no-await-in-loop -- sequential roll generation; each createHit advances dice state
                const hit = await Hit.createHit(attackData, allocated.hitIndexForTarget);
                hit.targetName = allocated.target.name;
                this.damageData.hits.push(hit);
            }
        }
    }

    /** The declared target, as an allocation entry. Falls back to an unnamed placeholder. */
    #declaredTarget(): AllocationTarget {
        // eslint-disable-next-line no-restricted-syntax -- boundary: targetActor is an opaque Foundry Actor kept untyped to avoid a circular import
        const target = this.rollData.targetActor as { id?: string; name?: string } | undefined;
        return { id: target?.id ?? 'original', name: target?.name ?? '' };
    }

    /**
     * Further targets a burst's extra hits may land on. RAW gates these on being
     * within two metres of the original target and no harder to hit; the caller
     * that populates `rollData.spreadTargets` owns that filtering, so this layer
     * stays free of positional data.
     */
    #spreadTargets(weaponRollData: WeaponRollData): AllocationTarget[] {
        return weaponRollData.spreadTargets;
    }

    addEffect(name: string, effect: string): void {
        this.effectOutput.push({
            name: name,
            effect: effect,
        });
    }

    createEffectData(): void {
        for (const effect of this.effects) {
            if (effect === 'auto-failure') {
                this.addEffect(t(EFFECT_TITLE.autoFailure), t('WH40K.ActionEffect.AutoFailure'));
            } else if (effect === 'overheat') {
                this.addEffect(t(EFFECT_TITLE.overheats), t('WH40K.ActionEffect.Overheats'));
            } else if (effect === 'jam') {
                this.addEffect(t(EFFECT_TITLE.jam), t('WH40K.ActionEffect.Jam'));
            } else if (effect === 'weapon-broken') {
                this.addEffect(t('WH40K.Weapon.Destroyed'), t('WH40K.Weapon.DestroyedOnCritFail'));
            }
        }
    }

    async useResources(): Promise<void> {
        // Only a weapon attack spends ammo; a psychic power or skill roll has no
        // weapon, and useAmmo reads rollData.weapon unconditionally.
        if (this.rollData instanceof WeaponRollData) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: ActionData↔useAmmo's expected parameter type are duck-typed siblings
            await useAmmo(this as unknown as Parameters<typeof useAmmo>[0]);
        }

        // A jam still cycles/wastes the round(s) fired, so the ammo spend above
        // runs unconditionally first (#410 playtest note: the jam path must NOT
        // skip the spend). Then persist the jam onto the weapon item so it is
        // per-weapon and survives across turns (#411).
        await this._persistWeaponJam(true);

        // Persist a destroy-on-crit-fail break onto the weapon (Scavenged on an
        // unmodified 00) alongside the jam, so both per-weapon states land in the
        // same resolution step and survive across turns.
        await this._persistWeaponBroken();

        // A recharging shot (Recharge quality, or a chosen Maximal) keeps the weapon
        // from firing next combat round (rules/weapon-recharge.ts).
        await this._persistWeaponRecharge();

        if (this.rollData.eyeOfVengeance) {
            const sourceActor = this.rollData.sourceActor;
            await sourceActor?.spendFate();
        }
    }

    /**
     * Persist (or clear) the resolved attack's jam state onto the weapon item.
     * Keeps the ammo spend and the jam flag atomic on the jamming shot (#410/#411)
     * and lets a Fate re-roll / manual refund undo the jam alongside the ammo.
     * No-op for non-weapon rolls or when the roll did not jam.
     */
    /**
     * Mark the weapon as recharging when this attack triggers a recharge and is
     * made in a running combat (recharge counts combat rounds; outside combat it
     * has nothing to block). No-op for non-weapon rolls.
     */
    private async _persistWeaponRecharge(): Promise<void> {
        if (!(this.rollData instanceof WeaponRollData)) return;
        const combat = game.combat;
        if (combat?.started !== true) return;
        if (!attackTriggersRecharge(this.rollData.weapon.system.effectiveSpecial, this.rollData.chosenQualities, this.rollData.gameSystemId)) return;
        const weaponSystem = this.rollData.weapon.system as { markRecharging?: (combatId: string, round: number) => Promise<object | undefined> };
        await weaponSystem.markRecharging?.(combat.id, combat.round);
    }

    private async _persistWeaponJam(jammed: boolean): Promise<void> {
        if (!this.effects.includes('jam')) return;
        if (!(this.rollData instanceof WeaponRollData)) return;
        // Route through the WeaponData jam/clearJam API so the persisted mutation
        // has a single source. On a refund the ammo is already restored by
        // refundAmmo, so only the flag is cleared (loseAmmo: false).
        const weaponSystem = this.rollData.weapon.system as {
            jam?: () => Promise<void>;
            clearJam?: (opts?: { loseAmmo?: boolean }) => Promise<void>;
        };
        if (jammed) {
            await weaponSystem.jam?.();
        } else {
            await weaponSystem.clearJam?.({ loseAmmo: false });
        }
    }

    /**
     * Persist a destroy-on-crit-fail break onto the weapon item (Scavenged fires
     * on an unmodified 00). Routes through the WeaponData `markBroken` API so the
     * mutation has a single source, mirroring {@link _persistWeaponJam}. The break
     * sets `system.state.broken`, which the Repair action clears (reversible).
     * No-op for non-weapon rolls or when the roll did not destroy the weapon.
     */
    private async _persistWeaponBroken(): Promise<void> {
        if (!this.effects.includes('weapon-broken')) return;
        if (!(this.rollData instanceof WeaponRollData)) return;
        const weaponSystem = this.rollData.weapon.system as { markBroken?: () => Promise<void> };
        await weaponSystem.markBroken?.();
    }

    async refundResources(): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: ActionData↔refundAmmo's expected parameter type are duck-typed siblings
        await refundAmmo(this as unknown as Parameters<typeof refundAmmo>[0]);

        // Undo a persisted jam alongside the refunded ammo (re-roll / manual refund).
        await this._persistWeaponJam(false);

        if (this.rollData.eyeOfVengeance) {
            const sourceActor = this.rollData.sourceActor as WH40KBaseActorDocument;
            const fateSystem = sourceActor.system as { fate?: { value: number } };
            const currentFate = fateSystem.fate?.value ?? 0;
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update accepts arbitrary path-keyed payloads
            await (sourceActor.update as (data: Record<string, unknown>) => Promise<unknown>)({
                'system.fate.value': currentFate + 1,
            });
        }
    }

    /**
     * Spend the acting actor's armed `onDamaged` test hooks (e.g. Penitent's
     * Cleansing Pain) on this test: each live hook lands on the roll as its own
     * named modifier (so the card shows its source), loses a use, and the hooks
     * left are written back. Expired hooks are dropped unapplied. Runs once per
     * committed test, before the modifier total is summed.
     */
    async spendArmedTestHooks(): Promise<void> {
        const actor = this.rollData.sourceActor;
        if (actor === null) return;
        const armed = readArmedTestHooks(actor.getFlag(SYSTEM_ID, ARMED_TEST_HOOKS_FLAG));
        if (armed.length === 0) return;
        const combat = game.combat;
        const round = combat?.started === true ? combat.round : null;
        const { modifiers, remaining } = consumeArmedTestHooks(armed, round);
        for (const [label, value] of Object.entries(modifiers)) {
            if (value !== 0) this.rollData.modifiers[label] = value;
        }
        await actor.update({ [`flags.${SYSTEM_ID}.${ARMED_TEST_HOOKS_FLAG}`]: remaining });
    }

    async performActionAndSendToChat(): Promise<void> {
        DHBasicActionManager.storeActionData(this);

        await this.spendArmedTestHooks();
        await this.rollData.calculateTotalModifiers();

        await this.calculateSuccessOrFailure();

        if (this.rollData.action !== 'Stun') {
            await this.checkForOpposed();
            await this.checkForPerils();

            if (this.rollData.success) {
                (this.rollData as { hitLocation?: string }).hitLocation = getHitLocationForRoll(this.rollData.roll?.total ?? 0) ?? '';
            }

            this.createEffectData();

            game.wh40k.log('Perform Action', this);

            await this.descriptionText();

            await this.useResources();
        }

        this.rollData.render = (await this.rollData.roll?.render()) ?? null;
        if (this.rollData.template !== undefined) {
            this.template = this.rollData.template;
        }

        await sendActionDataToChat(this);

        // Play the weapon's authored attack sound(s): one per shot, so a burst
        // plays several times and full-auto in rapid succession, broadcast to all
        // clients. A non-weapon roll carries no `weapon`, so this is a no-op there.
        playWeaponAttackSoundsForRoll(this.rollData);

        await this.maybeAutoRollDamage();
    }

    /**
     * After a damaging attack resolves as a hit, roll its damage automatically
     * and post the damage card — so the table no longer has to click the chat
     * "Roll Damage" button as a separate manual step.
     *
     * Gated by the `autoRollDamage` world setting (default on); when disabled,
     * the attack card's manual "Roll Damage" button remains the path. The
     * card's assign-damage flow (the `chat-roll-cards--damage-with-assignable-hit`
     * story) is preserved either way — auto-rolling only front-runs the same
     * `calculateHits` + damage-card render the manual button performs, so the
     * assign-damage button still appears on the posted damage card.
     *
     * A target-only post (no roll entered — the GM is waiting on physical dice)
     * never auto-rolls; there is no degrees-of-success result to drive hits yet.
     */
    async maybeAutoRollDamage(): Promise<void> {
        const skip = this.#autoRollSkipReason();
        if (skip !== null) {
            // Which gate fired is the diagnostic #506 asks for. Debug-level: a
            // deliberate skip (miss, setting off, target-only post) is normal.
            game.wh40k.log(`auto-damage: skipped — ${skip}`);
            return;
        }

        try {
            // Hits may already be present if a prior step populated them; only
            // calculate when empty so we don't double-roll.
            if (this.damageData?.hits.length === 0) {
                await this.calculateHits();
            }

            // Propagate attack DoS to each hit so the damage card can still offer the
            // "replace damage die with DoS" action (#129 — DH2 core L10398-10414),
            // matching the manual `_rollDamage` path.
            const attackDoS = this.rollData.dos;
            for (const hit of this.damageData?.hits ?? []) {
                hit.dos = attackDoS;
            }

            await DHBasicActionManager._postDamageCard(this);
        } catch (error) {
            // A silent abort here is the worst possible failure mode (#506): the
            // attack card has ALREADY posted, so the table sees the attack land
            // and then nothing, and assumes the system is waiting on them. The
            // call site awaits this without a catch, so a rejection also became
            // an unhandled promise rejection rather than anything actionable.
            //
            // Report with the actors named and stop — the attack card's manual
            // "Roll Damage" button is still there and still works.
            this.#reportAutoRollFailure(error);
        }
    }

    /**
     * Why auto-damage will not run, or null when it will.
     *
     * Split out so the reason is nameable in the log — "no damage card appeared"
     * previously gave no way to tell an intentional skip from a failure (#506).
     * @returns {string | null}  A short reason, or null to proceed.
     */
    #autoRollSkipReason(): string | null {
        if (!this.hasDamage || this.damageData === undefined) return 'action has no damage data';
        // `isTargetOnly` is set on a "post target, await physical roll" submit;
        // there is no resolved success/DoS to roll damage from.
        if ((this.rollData as { isTargetOnly?: boolean }).isTargetOnly === true) return 'target-only post (awaiting a physical roll)';
        // `isThrown` is optional on the base RollData (only WeaponRollData sets
        // it); a thrown weapon always rolls damage (scatter on a miss) so it
        // counts as a "hit" for auto-damage purposes.
        if (!(this.rollData.success || this.rollData.isThrown === true)) return 'attack missed';
        if (!WH40KSettings.isAutoRollDamageEnabled()) return 'auto-roll-damage setting is off';
        return null;
    }

    /**
     * Log and surface an auto-damage failure, naming attacker/weapon/target.
     * @param {unknown} error  The caught rejection reason.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: a caught Promise rejection reason is untyped by the language; it is logged, never inspected
    #reportAutoRollFailure(error: unknown): void {
        const attacker = this.rollData.sourceActor?.name ?? 'Unknown attacker';
        const weapon = (this.rollData as { weapon?: { name?: string | null } | null }).weapon?.name ?? 'Unknown weapon';
        const target = (this.rollData as { targetActor?: { name?: string | null } | null }).targetActor?.name ?? 'no target';
        console.error(`${SYSTEM_ID} | auto-damage failed: ${attacker} / ${weapon} → ${target}. The manual Roll Damage button still works.`, error);
        // The notification is best-effort: a reporter that throws would defeat
        // its own purpose and re-create the silent abort it exists to prevent.
        // `game`/`ui` are partially stubbed under vitest and only fully present
        // after Foundry's `setup`, so every hop is guarded and the whole thing
        // is wrapped.
        try {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: `ui`/`game` and their members are absent outside a booted client
            const notify = typeof ui === 'undefined' ? undefined : ui.notifications;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: `game.i18n` is undefined until Foundry's `i18nInit`
            const i18n = typeof game === 'undefined' ? undefined : game.i18n;
            if (notify === undefined || i18n === undefined) return;
            notify.error(i18n.format('WH40K.Warning.AutoDamageFailed', { attacker, weapon, target }));
        } catch {
            // Already logged above; nothing further to do.
        }
    }
}

export class WeaponActionData extends ActionData {
    declare rollData: WeaponRollData;
    declare damageData: WeaponDamageData;

    constructor() {
        super();
        this.template = 'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs';
        this.hasDamage = true;
        this.rollData = new WeaponRollData();
        this.damageData = new WeaponDamageData();
    }
}

export class PsychicActionData extends ActionData {
    declare rollData: PsychicRollData;
    declare damageData: PsychicDamageData;
    psychicEffect: string = '';

    constructor() {
        super();
        this.template = 'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs';
        this.hasDamage = true;
        this.rollData = new PsychicRollData();
        this.damageData = new PsychicDamageData();
    }

    override async performActionAndSendToChat(): Promise<void> {
        // Only an attack power (isAttack) rolls damage; the rest resolve as an effect.
        this.hasDamage = this.rollData.hasDamage;
        if (!this.rollData.hasDamage) {
            this.rollData.template = 'systems/wh40k-rpg/templates/chat/psychic-action-chat.hbs';
            this.template = 'systems/wh40k-rpg/templates/chat/psychic-action-chat.hbs';
        }
        await super.performActionAndSendToChat();
        // Success is final here (after any opposed contest): land the power's effects.
        if (this.rollData.success) await this.applyCastEffects();
    }

    /**
     * Land the manifested power's own effects on their recipients, the psyker or
     * the target (rules/psychic-cast-effects.ts). A target the caster does not
     * own receives them through the GM proxy.
     */
    private async applyCastEffects(): Promise<void> {
        const power = this.rollData.power;
        const target = this.rollData.targetActor;
        const sources = power.effects.contents.map((effect) => effect.toObject() as PowerEffectSource & { _id?: string | null });
        const targetType = (power.system as { target?: { type?: string } }).target?.type ?? '';
        const cast = castEffectsFor(sources, targetType, power.uuid ?? '', target !== null);
        const deliveries: [CastRecipient, EffectRecipientLike | null][] = [
            ['self', this.rollData.sourceActor as EffectRecipientLike | null],
            ['target', target as EffectRecipientLike | null],
        ];
        await Promise.all(
            deliveries.map(async ([recipient, actor]) => {
                if (actor === null) return;
                await gmProxyCreateActorEffects(
                    actor,
                    cast.filter((c) => c.recipient === recipient).map((c) => c.data),
                );
            }),
        );
    }

    override async descriptionText(): Promise<void> {
        const powerSystem = this.rollData.power.system as { description?: { value?: string } };
        this.psychicEffect = await foundry.applications.ux.TextEditor.implementation.enrichHTML(powerSystem.description?.value ?? '', {
            // eslint-disable-next-line no-restricted-syntax -- boundary: TextEditor.enrichHTML expects a record-shaped rollData payload
            rollData: this.rollData as unknown as Record<string, unknown>,
        });

        // #451: for an opposed power, surface whether the target resisted and by how
        // much (the #449 margin) — a resisted power is already marked unsuccessful by
        // checkForOpposed, and the margin scales its magnitude where the content reads it.
        if (this.rollData.isOpposed && this.rollData.targetActor !== null) {
            const key = this.rollData.success ? 'WH40K.Psychic.OpposedOvercome' : 'WH40K.Psychic.OpposedResisted';
            this.addEffect(
                t(EFFECT_TITLE.psychic),
                game.i18n.format(key, { target: this.rollData.targetActor.name, margin: String(this.rollData.opposedMargin) }),
            );
        }
    }
}

export class PsychicSkillData extends ActionData {
    declare rollData: PsychicRollData;

    constructor() {
        super();
        this.template = 'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs';
        this.hasDamage = false;
        this.rollData = new PsychicRollData();
    }
}

export class SimpleSkillData extends ActionData {
    constructor() {
        super();
        this.template = 'systems/wh40k-rpg/templates/chat/simple-roll-chat.hbs';
        this.hasDamage = false;
        this.rollData = new RollData();
    }
}

/** A chem/drug item as the Chem-Use flow reads it (#441) — its dose payload + uses. */
export interface ChemLike {
    readonly id: string;
    readonly name: string;
    readonly system: {
        readonly uses: { value: number; max: number };
        readonly grants: { activeEffects: ReadonlyArray<{ key: string; mode: number; value: number; durationRounds: number; durationSeconds?: number }> };
        readonly addictive: number;
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update accepts an untyped path-keyed payload
    update: (data: Record<string, unknown>) => Promise<unknown>;
}

/** A weapon the Chem-Use flow can coat (#441). */
export interface CoatableWeapon {
    readonly id: string;
    readonly name: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update accepts an untyped path-keyed payload
    update: (data: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Apply one dose of `chem` to `subject` (#441) — the same timed-effect application a
 * self-consumed dose uses (#457), but aimed at an arbitrary actor, plus the dose
 * decrement and the addiction check. Shared by the apply and botch paths.
 */
async function applyChemDose(chem: ChemLike, subject: WH40KBaseActorDocument): Promise<void> {
    const grants = chem.system.grants.activeEffects;
    if (grants.length > 0) {
        const seconds = Math.max(...grants.map((g) => g.durationSeconds ?? 0));
        const rounds = Math.max(...grants.map((g) => g.durationRounds));
        await subject.applyDoseEffect(
            chem.name,
            grants.map((g) => ({ key: g.key, mode: g.mode, value: g.value })),
            { ...(seconds > 0 ? { seconds } : {}), ...(rounds > 0 ? { rounds } : {}) },
        );
    }
    if (chem.system.addictive > 0) await subject.resolveDoseAddiction(chem.name, chem.system.addictive);
    await chem.update({ 'system.uses.value': Math.max(0, chem.system.uses.value - 1) });
}

/**
 * Enforce a use's RAW per-target time gate at RESOLUTION time (#458/#432).
 *
 * This check deliberately runs here — where the roll's FINAL target is known —
 * rather than before the dialog opens. The dialog lets the player retarget
 * in-flight, so a pre-dialog check could be satisfied against one actor and the
 * effect then applied to a cooldown-locked one; enforcing at resolution closes
 * that bypass. It sits next to the setter half (which stamps the gate a few lines
 * below) so both halves of the mechanic live together.
 *
 * Returns true when the gate is CLOSED — the caller must abort WITHOUT applying
 * any effect. The reason and the time remaining are both warned to the user and
 * written onto the chat card, so the abort is never silent.
 */
function blockedByTimeGate(action: ActionData, cardLabel: string, use: SkillUseDef | null, target: WH40KBaseActorDocument): boolean {
    if (use === null) return false;
    const block = evaluateSkillUseGate(use, (key) => target.getTimeGate(key), Number(game.time.worldTime));
    if (block === null) return false;

    const message = game.i18n.format(block.messageKey, {
        use: game.i18n.localize(use.labelKey),
        target: target.name,
        remaining: block.remainingLabel,
    });
    ui.notifications.warn(message);
    action.addEffect(cardLabel, message);
    return true;
}

/**
 * A targeted Medicae skill-use roll (#432). Built like a {@link SimpleSkillData}
 * but carries the chosen use kind and a pre-selected patient on
 * `rollData.targetActor`. On resolution it reads the patient's vitals, resolves
 * the RAW outcome (`resolveFirstAid`), and **auto-applies the healing** to the
 * patient — the skill analogue of a weapon auto-applying damage — then summarizes
 * what it did on the chat card. Talent/effect modifiers (e.g. Superior Chirurgeon)
 * are already folded into the roll's target via the shared modifier pipeline.
 */
export class MedicaeActionData extends SimpleSkillData {
    readonly useKind: SkillUseKind;

    constructor(useKind: SkillUseKind) {
        super();
        this.useKind = useKind;
    }

    override async descriptionText(): Promise<void> {
        const target = this.rollData.targetActor;
        if (target === null || this.useKind === 'general') return;

        // RAW per-target cooldown (#458), enforced against the FINAL target: First Aid
        // is once every 24 in-universe hours per patient, and may not be given through
        // Extended Care at all (DH2 p109). A closed gate applies nothing.
        if (blockedByTimeGate(this, 'Medicae', getSkillUse('medicae', this.useKind), target)) return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KBaseActor.wounds is the loosely-typed system wounds block
        const wounds = target.wounds as { value?: number; max?: number; critical?: number } | undefined;
        const woundsValue = wounds?.value ?? 0;
        const woundsMax = wounds?.max ?? 0;
        const criticalDamage = wounds?.critical ?? 0;
        // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics[key] is the runtime characteristic record; effectiveBonus is the bonus-only channel
        const toughness = target.characteristics['toughness'] as { effectiveBonus?: number } | undefined;
        const toughnessBonus = toughness?.effectiveBonus ?? 0;
        // RAW First Aid removes the MEDIC's Intelligence bonus (+ degrees), so read
        // it from the source actor, not the patient.
        // eslint-disable-next-line no-restricted-syntax -- boundary: sourceActor is an opaque Foundry Actor; narrow to the characteristics surface
        const medicChars = (this.rollData.sourceActor as unknown as { characteristics?: Record<string, { effectiveBonus?: number } | undefined> } | null)
            ?.characteristics;
        const intelligenceBonus = medicChars?.['intelligence']?.effectiveBonus ?? 0;

        // Determine the patient's damage tier (incl. Critical) so it can be surfaced
        // on the card and drive tier-specific effects (#432).
        const tier = getDamageTier(woundsValue, woundsMax, criticalDamage);

        const useLabel = game.i18n.localize(getSkillUse('medicae', this.useKind)?.labelKey ?? '');
        // Pass the real degrees of success (0 on failure) so the outcome scales
        // rather than treating every success as a single degree.
        const outcome = resolveFirstAid(this.useKind, { woundsValue, woundsMax, criticalDamage, toughnessBonus, intelligenceBonus }, this.rollData.dos);

        if (!outcome.success) {
            this.addEffect(t(EFFECT_TITLE.medicae), game.i18n.format('WH40K.SkillUse.Failed', { use: useLabel }));
            return;
        }

        const targetId = target.id;
        // eslint-disable-next-line no-restricted-syntax -- boundary: targetActor is an opaque Foundry Actor; narrow to the ownership + update surface used here
        const patientActor = target as unknown as { isOwner?: boolean; update?: (data: Record<string, unknown>) => Promise<unknown> };
        const patient: FirstAidPatient = {
            woundsValue,
            woundsMax,
            criticalDamage,
            update: async (patch): Promise<void> => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update payload is an untyped Record
                const upd: Record<string, unknown> = {};
                if (patch.woundsValue !== undefined) upd['system.wounds.value'] = patch.woundsValue;
                if (patch.criticalDamage !== undefined) upd['system.wounds.critical'] = patch.criticalDamage;
                if (Object.keys(upd).length === 0) return;
                // Prefer a direct update when we own the target: this reaches an
                // UNLINKED token patient (whose actor `id` is null and so cannot be
                // reached through the id-keyed GM proxy). Otherwise route through the
                // proxy so a player can heal a target they do not own.
                if (patientActor.isOwner === true && typeof patientActor.update === 'function') {
                    await patientActor.update(upd);
                } else if (targetId !== null) {
                    await gmProxyActorUpdate(targetId, upd);
                }
            },
        };
        await applyFirstAidOutcome(patient, outcome);

        // RAW cooldown (#458): close the patient's gate so the same use cannot be
        // repeated on them until the in-universe window elapses (First Aid: 24h).
        const gate = getSkillUse('medicae', this.useKind)?.timeGate;
        if (gate?.windowSeconds !== undefined && targetId !== null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry flag path is a string key
            const flagPath = `flags.wh40k-rpg.timeGates.${gate.key}`;
            await gmProxyActorUpdate(targetId, { [flagPath]: Number(game.time.worldTime) + gate.windowSeconds });
        }

        const parts = [game.i18n.format('WH40K.SkillUse.Applied', { medic: this.rollData.sourceActor?.name ?? '', use: useLabel, patient: target.name })];
        parts.push(game.i18n.format('WH40K.SkillUse.PatientTier', { tier: game.i18n.localize(DAMAGE_TIER_LABEL_KEYS[tier]) }));
        if (outcome.woundsRestored > 0) parts.push(game.i18n.format('WH40K.SkillUse.HealedWounds', { wounds: String(outcome.woundsRestored) }));
        if (outcome.criticalResolved > 0) parts.push(game.i18n.format('WH40K.SkillUse.ResolvedCritical', { tiers: String(outcome.criticalResolved) }));
        if (outcome.bloodLossStopped) parts.push(game.i18n.localize('WH40K.SkillUse.BloodLossStopped'));
        this.addEffect(t(EFFECT_TITLE.medicae), parts.join(' '));
    }
}

/**
 * A targeted Interrogation roll (#435). Opposed by the subject's Willpower
 * (`rollData.isOpposed` + `opposedChar` set by the caller, resolved by
 * `checkForOpposed`). On resolution it inflicts the RAW fatigue on the subject
 * and surfaces the degrees-of-success information tier on the chat card.
 */
export class InterrogationActionData extends SimpleSkillData {
    override async descriptionText(): Promise<void> {
        const target = this.rollData.targetActor;
        if (target === null) return;

        // RAW lockout (#458), enforced against the FINAL subject: a previously botched
        // session leaves them un-interrogable for the rolled window. A closed gate
        // inflicts no fatigue and extracts nothing.
        if (blockedByTimeGate(this, 'Interrogation', getSkillUse('interrogation', 'interrogate'), target)) return;

        const degrees = this.rollData.success ? Math.max(1, this.rollData.dos) : 0;
        const outcome = resolveInterrogation(degrees);
        const interrogateTargetId = target.id;
        if (outcome.fatigue > 0 && interrogateTargetId !== null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system shape varies by subclass
            const fatigue = (target.system as { fatigue?: { value: number; max: number } }).fatigue;
            if (fatigue !== undefined) {
                const next = Math.max(0, fatigue.value + Math.trunc(outcome.fatigue));
                await gmProxyActorUpdate(interrogateTargetId, { 'system.fatigue.value': next });
            }
        }
        if (outcome.success) {
            this.addEffect(
                t(EFFECT_TITLE.interrogation),
                game.i18n.format('WH40K.SkillUse.Interrogation.Extracted', {
                    tier: String(outcome.infoTier),
                    subject: target.name,
                    fatigue: String(outcome.fatigue),
                }),
            );
        } else {
            this.addEffect(
                t(EFFECT_TITLE.interrogation),
                game.i18n.format('WH40K.SkillUse.Interrogation.Resisted', { subject: target.name, fatigue: String(outcome.fatigue) }),
            );
            if (this.rollData.dof >= 2 && interrogateTargetId !== null) {
                const lockout = new Roll('1d5');
                await lockout.evaluate();
                const days = lockout.total ?? 1;
                const expiry = Math.trunc(Number(game.time.worldTime) + days * DAY_SECONDS);
                await gmProxyActorUpdate(interrogateTargetId, {
                    'flags.wh40k-rpg.timeGates.interrogate': expiry,
                });
                this.addEffect(
                    t(EFFECT_TITLE.interrogation),
                    game.i18n.format('WH40K.SkillUse.Interrogation.Lockout', { subject: target.name, days: String(days) }),
                );
            }
        }
    }
}

/**
 * A skill roll that surfaces a degrees-of-success readout on the chat card
 * (#437 knowledge/investigation; extended by #438/#436) — no target, no apply,
 * just a DoS-gated interpretation (how much is recalled/learned).
 */
export class DosReadoutActionData extends SimpleSkillData {
    readonly family: ReadoutFamily;

    constructor(family: ReadoutFamily) {
        super();
        this.family = family;
    }

    override async descriptionText(): Promise<void> {
        const readout = resolveDosReadout(this.family, this.rollData.dos, this.rollData.success);
        this.addEffect(t(EFFECT_TITLE.readout), game.i18n.format(readout.labelKey, { tier: String(readout.tier) }));
        return Promise.resolve();
    }
}

/**
 * A targeted opposed detection roll (#434) — Stealth/Awareness/Scrutiny/Sleight
 * of Hand vs the target's opposing characteristic (`isOpposed`/`opposedChar` set
 * by the caller, resolved by `checkForOpposed`). Reports win/lose on the card;
 * there is no state change to apply.
 */
export class DetectionActionData extends SimpleSkillData {
    override async descriptionText(): Promise<void> {
        const base = game.i18n.localize(this.rollData.success ? 'WH40K.SkillUse.Detection.Win' : 'WH40K.SkillUse.Detection.Lose');
        const margin = this.rollData.opposedMargin;
        // #449: surface the winner's degrees of victory when the contest was decided by a margin.
        const text = margin > 0 ? `${base} ${game.i18n.format('WH40K.Opposed.Margin', { margin: String(margin) })}` : base;
        this.addEffect(t(EFFECT_TITLE.detection), text);
        return Promise.resolve();
    }
}

/**
 * A targeted social-influence roll (#433) — Charm / Command / Intimidate / Deceive
 * against a chosen target. The contest is opposed by the target's Willpower
 * (`opposedChar`, resolved by the inherited `checkForOpposed`) or, for Deceive,
 * by the target's Scrutiny *skill* (`opposedSkill`, resolved here). On a win, a
 * directional use (Charm/Intimidate) auto-adjusts the target NPC's disposition;
 * the shift and the resulting band are summarized on the chat card. Social
 * talents/traits are already folded into the roll target via the shared modifier
 * pipeline, so no special-casing is needed here.
 */
export class SocialInfluenceActionData extends SimpleSkillData {
    readonly def: SkillUseDef;

    constructor(def: SkillUseDef) {
        super();
        this.def = def;
    }

    override async checkForOpposed(): Promise<void> {
        const target = this.rollData.targetActor;
        const opposedSkill = this.def.opposedSkill;
        if (opposedSkill === undefined || target === null) {
            await super.checkForOpposed();
            return;
        }
        // Opposed by a SKILL (Deceive vs Scrutiny) rather than a characteristic.
        this.applyOpposedCheck(await target.rollSkillCheck(opposedSkill));
    }

    override async descriptionText(): Promise<void> {
        const target = this.rollData.targetActor;
        const useLabel = game.i18n.localize(this.def.labelKey);
        const targetName = target?.name ?? '';

        if (!this.rollData.success) {
            this.addEffect(t(EFFECT_TITLE.social), game.i18n.format('WH40K.SkillUse.Social.Lost', { use: useLabel, target: targetName }));
            return;
        }

        const degrees = Math.max(1, this.rollData.dos);
        const outcome = resolveSocialInfluence(this.def, degrees, true);
        if (target === null || outcome.dispositionDelta === 0) {
            this.addEffect(t(EFFECT_TITLE.social), game.i18n.format('WH40K.SkillUse.Social.Won', { use: useLabel, target: targetName }));
            return;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: disposition lives on npc.ts only; loosely typed here
        const disposition = (target.system as { disposition?: { value: number } }).disposition;
        const before = disposition?.value ?? 0;
        await target.adjustDisposition(outcome.dispositionDelta);
        const band = game.i18n.localize(`WH40K.Disposition.${labelForDisposition(clampDisposition(before + outcome.dispositionDelta))}`);
        this.addEffect(
            t(EFFECT_TITLE.social),
            game.i18n.format('WH40K.SkillUse.Social.Shift', {
                use: useLabel,
                target: targetName,
                bands: String(Math.abs(outcome.dispositionDelta)),
                band,
            }),
        );
    }
}

/**
 * An opposed utility contest (#453) — Barter/Commerce/Gamble resolved by out-rolling a
 * rival at the SAME skill (opposedSkill), through the #449 engine. Reports the winner
 * and degrees of victory; the degree-scaled reward (price %, the pot) is GM-adjudicated.
 */
export class ContestActionData extends SimpleSkillData {
    readonly opposedSkill: string;

    constructor(opposedSkill: string) {
        super();
        this.opposedSkill = opposedSkill;
    }

    override async checkForOpposed(): Promise<void> {
        const target = this.rollData.targetActor;
        if (target === null) return;
        this.applyOpposedCheck(await target.rollSkillCheck(this.opposedSkill));
    }

    override async descriptionText(): Promise<void> {
        const base = game.i18n.localize(this.rollData.success ? 'WH40K.SkillUse.Contest.Won' : 'WH40K.SkillUse.Contest.Lost');
        const margin = this.rollData.opposedMargin;
        const text = margin > 0 ? `${base} ${game.i18n.format('WH40K.Opposed.Margin', { margin: String(margin) })}` : base;
        this.addEffect(t(EFFECT_TITLE.contest), text);
        return Promise.resolve();
    }
}

/** An item whose runtime state a skill use writes (#443/#444). */
export interface StatefulItem {
    readonly id: string;
    readonly name: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item#update accepts an untyped path-keyed payload
    update: (data: Record<string, unknown>) => Promise<unknown>;
}

/** An explosive item as the Demolition flow reads/writes it (#445). */
export interface ExplosiveItem extends StatefulItem {
    readonly system: { readonly state: { readonly armed: { active: boolean; setterDegrees: number } } };
}

/**
 * A Demolition roll (#445) — place an explosive charge, or defuse one. Placing arms
 * the chosen explosive and records the setter's degrees of success (a 4+ DoF plant
 * detonates prematurely, RAW). Defusing is opposed against those recorded degrees via
 * the #449 engine (RAW: defuse vs the setter's Demolition result); a win disarms it,
 * a 4+ DoF sets it off.
 */
export class DemolitionActionData extends SimpleSkillData {
    readonly mode: 'placeCharge' | 'defuse';
    readonly explosive: ExplosiveItem;
    readonly trigger: string;

    constructor(mode: 'placeCharge' | 'defuse', explosive: ExplosiveItem, trigger = '') {
        super();
        this.mode = mode;
        this.explosive = explosive;
        this.trigger = trigger;
    }

    override async descriptionText(): Promise<void> {
        const name = this.explosive.name;

        if (this.mode === 'placeCharge') {
            if (!this.rollData.success) {
                this.addEffect(t(EFFECT_TITLE.demolition), game.i18n.format('WH40K.SkillUse.Demo.PlaceFailed', { item: name }));
                return;
            }
            if (this.rollData.dof >= 4) {
                this.addEffect(t(EFFECT_TITLE.demolition), game.i18n.format('WH40K.SkillUse.Demo.Premature', { item: name }));
                return;
            }
            await this.explosive.update({ 'system.state.armed': { active: true, trigger: this.trigger, setterDegrees: Math.max(1, this.rollData.dos) } });
            this.addEffect(t(EFFECT_TITLE.demolition), game.i18n.format('WH40K.SkillUse.Demo.Placed', { item: name, trigger: this.trigger }));
            return;
        }

        // Defuse: opposed vs the setter's recorded degrees.
        const setterDegrees = this.explosive.system.state.armed.setterDegrees;
        this.applyOpposedResult({ success: true, dos: setterDegrees, dof: 0 });
        if (this.rollData.dof >= 4) {
            this.addEffect(t(EFFECT_TITLE.demolition), game.i18n.format('WH40K.SkillUse.Demo.DefuseSetOff', { item: name }));
            return;
        }
        if (!this.rollData.success) {
            this.addEffect(t(EFFECT_TITLE.demolition), game.i18n.format('WH40K.SkillUse.Demo.DefuseFailed', { item: name }));
            return;
        }
        await this.explosive.update({ 'system.state.armed': { active: false, trigger: '', setterDegrees: 0 } });
        this.addEffect(t(EFFECT_TITLE.demolition), game.i18n.format('WH40K.SkillUse.Demo.Defused', { item: name }));
    }
}

/**
 * An object-interaction applier (#443 Security bypass / #444 Tech-Use repair) — the
 * state-writing half of the #436 DoS readout. On success it clears the chosen item's
 * state: `repair` clears `system.state.broken` (and a weapon's `jammed`), `bypassLock`
 * clears `system.state.locked`. On failure the item stays as it was (the #436 readout
 * still conveys the time/retry cost).
 */
export class ObjectStateActionData extends SimpleSkillData {
    readonly mode: 'repair' | 'bypassLock' | 'breakObject';
    readonly item: StatefulItem;

    constructor(mode: 'repair' | 'bypassLock' | 'breakObject', item: StatefulItem) {
        super();
        this.mode = mode;
        this.item = item;
    }

    override async descriptionText(): Promise<void> {
        const itemName = this.item.name;
        if (!this.rollData.success) {
            const failKey =
                this.mode === 'repair'
                    ? 'WH40K.SkillUse.Object.RepairFailed'
                    : this.mode === 'breakObject'
                    ? 'WH40K.SkillUse.Object.BreakFailed'
                    : 'WH40K.SkillUse.Object.BypassFailed';
            this.addEffect(t(EFFECT_TITLE.object), game.i18n.format(failKey, { item: itemName }));
            return;
        }

        if (this.mode === 'repair') {
            await this.item.update({ 'system.state.broken': false, 'system.jammed': false });
            this.addEffect(t(EFFECT_TITLE.techUse), game.i18n.format('WH40K.SkillUse.Object.Repaired', { item: itemName }));
            return;
        }
        if (this.mode === 'breakObject') {
            await this.item.update({ 'system.state.broken': true });
            this.addEffect(t(EFFECT_TITLE.athletics), game.i18n.format('WH40K.SkillUse.Object.Broke', { item: itemName }));
            return;
        }
        await this.item.update({ 'system.state.locked': false });
        this.addEffect(t(EFFECT_TITLE.security), game.i18n.format('WH40K.SkillUse.Object.Unlocked', { item: itemName }));
    }
}

/**
 * A Sleight of Hand plant/steal roll (#442) — an opposed contest (vs the mark's
 * Perception, resolved by the #449 engine) that, on a win, actually MOVES the chosen
 * item between inventories. Steal pulls it from the target to the actor; plant pushes
 * it the other way. On a loss the mark notices and no transfer happens.
 */
export class PalmActionData extends SimpleSkillData {
    readonly mode: 'steal' | 'plant';
    readonly itemId: string;

    constructor(mode: 'steal' | 'plant', itemId: string) {
        super();
        this.mode = mode;
        this.itemId = itemId;
    }

    override async descriptionText(): Promise<void> {
        const actor = this.rollData.sourceActor;
        const target = this.rollData.targetActor;
        if (actor === null || target === null) return;

        if (!this.rollData.success) {
            this.addEffect(t(EFFECT_TITLE.sleightOfHand), game.i18n.format('WH40K.SkillUse.Palm.Caught', { target: target.name }));
            return;
        }

        const [from, to] = this.mode === 'steal' ? [target, actor] : [actor, target];
        const moved = await from.transferItemTo(this.itemId, to);
        if (moved === null) return;
        const key = this.mode === 'steal' ? 'WH40K.SkillUse.Palm.Stole' : 'WH40K.SkillUse.Palm.Planted';
        this.addEffect(t(EFFECT_TITLE.sleightOfHand), game.i18n.format(key, { item: moved, target: target.name }));
    }
}

/**
 * A Chem-Use roll (#441) — administer a chem to a subject, or coat a weapon with it.
 * RAW: "administers a drug/poison/toxin to a patient, or applies it to a weapon"
 * (DH2 p109). The chosen chem's `grants.activeEffects` are applied to the TARGET
 * (rather than the bearer, as a self-consumed dose would be, #457), so a toxin lands
 * on the victim and wears off on the clock. A dose is consumed either way. OW/BC RAW:
 * a botch afflicts the applicant instead — modelled by applying the dose to the user.
 */
export class ChemUseActionData extends SimpleSkillData {
    readonly mode: 'applyChem' | 'coatWeapon';
    /** The chem item chosen by the caller (its `system` carries the dose payload). */
    readonly chem: ChemLike;
    /** The weapon chosen for a coating (`coatWeapon` only). */
    readonly weapon: CoatableWeapon | null;

    constructor(mode: 'applyChem' | 'coatWeapon', chem: ChemLike, weapon: CoatableWeapon | null = null) {
        super();
        this.mode = mode;
        this.chem = chem;
        this.weapon = weapon;
    }

    override async descriptionText(): Promise<void> {
        const chemName = this.chem.name;

        if (!this.rollData.success) {
            // RAW (OW p126 / BC p104): a botched application afflicts the applicant.
            const user = this.rollData.sourceActor;
            if (this.mode === 'applyChem' && user !== null) {
                await applyChemDose(this.chem, user);
                this.addEffect(t(EFFECT_TITLE.chemUse), game.i18n.format('WH40K.SkillUse.Chem.Botched', { chem: chemName, actor: user.name }));
                return;
            }
            this.addEffect(t(EFFECT_TITLE.chemUse), game.i18n.format('WH40K.SkillUse.Chem.Failed', { chem: chemName }));
            return;
        }

        if (this.mode === 'coatWeapon') {
            const weapon = this.weapon;
            if (weapon === null) return;
            const charges = Math.max(1, this.chem.system.uses.max);
            await weapon.update({ 'system.state.coating': { name: chemName, charges } });
            this.addEffect(
                t(EFFECT_TITLE.chemUse),
                game.i18n.format('WH40K.SkillUse.Chem.Coated', { chem: chemName, weapon: weapon.name, charges: String(charges) }),
            );
            return;
        }

        const target = this.rollData.targetActor;
        if (target === null) return;
        await applyChemDose(this.chem, target);
        this.addEffect(t(EFFECT_TITLE.chemUse), game.i18n.format('WH40K.SkillUse.Chem.Applied', { chem: chemName, target: target.name }));
    }
}

/**
 * A targeted social buff/debuff roll (#447). Applies a temporary effect to the
 * target actor on success: an ally buff (Inspire +10 next test, Terrify ignore
 * Fear) or an enemy debuff (War Cry −10 defence, applied as a real 1-round
 * ActiveEffect; Blather holds the target inactive for 1 + degrees-of-victory
 * rounds, opposed vs Willpower via the #449 engine). Buffs that have no clean
 * "next-test / for-the-encounter" ActiveEffect are surfaced on the card for the
 * table to track.
 */
export class SocialBuffActionData extends SimpleSkillData {
    readonly buff: 'inspire' | 'terrify' | 'warCry' | 'blather';

    constructor(buff: 'inspire' | 'terrify' | 'warCry' | 'blather') {
        super();
        this.buff = buff;
    }

    override async descriptionText(): Promise<void> {
        const target = this.rollData.targetActor;
        const targetName = target?.name ?? '';

        if (this.buff === 'blather') {
            const rounds = blatherRounds(this.rollData.success, this.rollData.opposedMargin);
            const key = rounds > 0 ? 'WH40K.SkillUse.Buff.BlatherHeld' : 'WH40K.SkillUse.Buff.BlatherResist';
            this.addEffect(t(EFFECT_TITLE.blather), game.i18n.format(key, { target: targetName, rounds: String(rounds) }));
            return;
        }

        if (!this.rollData.success) {
            this.addEffect(t(EFFECT_TITLE.social), game.i18n.format('WH40K.SkillUse.Buff.Failed', { target: targetName }));
            return;
        }

        if (this.buff === 'warCry' && target !== null) {
            // Real debuff: −10 to the target's defence (Dodge/Parry) for one round,
            // applied through the actor's own effect helper (no rules↔rolls import cycle).
            await target.applyCombatModifier('defense', -10, { name: game.i18n.localize('WH40K.SkillUse.Buff.WarCry'), rounds: 1 });
            this.addEffect(t(EFFECT_TITLE.warCry), game.i18n.format('WH40K.SkillUse.Buff.WarCryApplied', { target: targetName }));
            return;
        }

        // Inspire / Terrify — GM/player-tracked (no clean per-next-test / per-encounter effect).
        const applied = this.buff === 'inspire' ? 'WH40K.SkillUse.Buff.InspireApplied' : 'WH40K.SkillUse.Buff.TerrifyApplied';
        this.addEffect(t(EFFECT_TITLE.social), game.i18n.format(applied, { target: targetName }));
    }
}

/* -------------------------------------------------------------------------- */
/*  Inline skill-use flow (#432)                                               */
/* -------------------------------------------------------------------------- */

/** Named modifier slot the chosen use's RAW difficulty occupies on the roll. */
const USE_DIFFICULTY_MODIFIER_KEY = 'useDifficulty';

function skillUseDifficulty(use: SkillUseDef, target: WH40KBaseActorDocument | null): number {
    let difficulty = use.difficultyMod;
    // First Aid's RAW difficulty scales with the PATIENT's condition (DH2 Core
    // p.110): −10 Heavily Damaged, −10 per point of Critical damage. Recomputed
    // whenever the player retargets (via applySkillUseToRollData / syncSkillUse).
    if (use.kind === 'firstAid' && target !== null) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: target is an opaque Foundry Actor; narrow to the wounds surface firstAidTierPenalty needs
        const wounds = (target as unknown as { wounds?: { value?: number; max?: number; critical?: number } }).wounds;
        const wv = wounds?.value ?? 0;
        const wm = wounds?.max ?? 0;
        const crit = wounds?.critical ?? 0;
        difficulty += firstAidTierPenalty(getDamageTier(wv, wm, crit), crit);
    }
    return difficulty;
}

/**
 * Shape a roll for a chosen skill use (#432) — its display label, its RAW difficulty
 * modifier, and its opposition. The SINGLE place that mapping lives, so the inline
 * dialog picker and the pre-roll picker (kept for the item-choice families) cannot
 * drift apart. Idempotent: re-running it for the same use is a no-op, and re-running
 * it for a different one replaces rather than accumulates.
 *
 * Opposition by CHARACTERISTIC is resolved by the shared `checkForOpposed`; opposition
 * by SKILL (Deceive vs Scrutiny, the Barter/Gamble contests) is resolved inside that
 * use's own action override, so it must not ALSO raise the characteristic flag.
 */
export function applySkillUseToRollData(rollData: RollData, use: SkillUseDef, skillLabel: string): void {
    rollData.nameOverride = use.kind === 'general' ? `${skillLabel} Test` : `${skillLabel}: ${game.i18n.localize(use.labelKey)}`;

    const opposedChar = use.opposedSkill === undefined ? use.opposedChar : undefined;
    rollData.isOpposed = opposedChar !== undefined;
    if (opposedChar !== undefined) rollData.opposedChar = opposedChar;

    const difficulty = skillUseDifficulty(use, rollData.targetActor);
    if (difficulty === 0) delete rollData.modifiers[USE_DIFFICULTY_MODIFIER_KEY];
    else rollData.modifiers[USE_DIFFICULTY_MODIFIER_KEY] = difficulty;
}

/**
 * The one roll-dialog-facing action for a skill whose uses are all resolvable
 * inline (`skillUsesAreInline`). It carries the skill's use list and the player's
 * current pick, and **defers constructing the concrete ActionData subclass until
 * the roll resolves** — at which point both the use AND the target are final.
 *
 * That deferral is the point: the use used to be chosen in a pre-dialog picker and
 * the subclass built immediately, which forced a second pop-up before the Roll Test
 * dialog and froze the target before the dialog could offer one. Here the dialog
 * mutates `selectedSkillUseId` / `rollData.targetActor` freely, and the subclass is
 * built from whatever they finally are.
 *
 * The shell delegates the two resolution hooks that the use families specialise —
 * `checkForOpposed()` (Deceive/Barter oppose by SKILL, others by characteristic) and
 * `descriptionText()` (the apply-and-report step) — onto the built instance, sharing
 * its own `rollData` so every dialog-applied modifier carries through, then folds the
 * delegate's chat-card effects back onto itself.
 */
export class SkillUseActionData extends SimpleSkillData {
    readonly skillKey: string;
    readonly skillLabel: string;
    private _selectedUseId: string;
    private _delegate: SimpleSkillData | null = null;

    constructor(skillKey: string, skillLabel: string, initialUseId?: string) {
        super();
        this.skillKey = skillKey;
        this.skillLabel = skillLabel;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json (flag on) types [0] as possibly-undefined and requires the fallback; the lint parser (flag off) does not
        this._selectedUseId = initialUseId ?? getSkillUses(skillKey)[0]?.id ?? 'general';
    }

    /** Every use this skill offers — the dialog's inline picker reads this. */
    get skillUseOptions(): readonly SkillUseDef[] {
        return getSkillUses(this.skillKey);
    }

    /** The player's current pick. */
    get selectedSkillUseId(): string {
        return this._selectedUseId;
    }

    /** The resolved definition of the current pick (falls back to the skill's first use). */
    get selectedSkillUse(): SkillUseDef | null {
        const uses = this.skillUseOptions;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json (flag on) types uses[0] as possibly-undefined and requires the `?? null`; the lint parser (flag off) does not
        return uses.find((u) => u.id === this._selectedUseId) ?? uses[0] ?? null;
    }

    /**
     * Change the selected use from the dialog. Drops any delegate built for the old
     * pick and re-shapes the roll (label, RAW difficulty, opposition) for the new one.
     */
    selectSkillUse(useId: string): void {
        if (this.skillUseOptions.every((u) => u.id !== useId)) return;
        this._selectedUseId = useId;
        this._delegate = null;
        this.syncSkillUse();
    }

    /**
     * Re-apply the selected use's roll shaping onto `rollData`. Idempotent, and safe
     * to call on every dialog render: the RAW First-Aid difficulty scales with the
     * patient's wounds, so it must be recomputed whenever the player retargets, not
     * only when they change use.
     */
    syncSkillUse(): void {
        const use = this.selectedSkillUse;
        if (use === null) return;
        applySkillUseToRollData(this.rollData, use, this.skillLabel);
    }

    /**
     * Build (once, lazily) the ActionData subclass that resolves the selected use.
     * Returns null when the pick needs nothing applied (the plain test) or when a
     * target-directed use reached resolution with no target chosen — the latter is
     * reported to the player rather than silently resolving as a bare skill test.
     */
    #resolveDelegate(): SimpleSkillData | null {
        if (this._delegate !== null) return this._delegate;
        const use = this.selectedSkillUse;
        if (use === null || use.kind === 'general') return null;

        if (use.needsTarget && this.rollData.targetActor === null) {
            const message = game.i18n.format('WH40K.SkillUse.NoTarget', { use: game.i18n.localize(use.labelKey) });
            ui.notifications.warn(message);
            this.addEffect(game.i18n.localize('WH40K.SkillUse.EffectLabel'), message);
            return null;
        }

        const delegate = buildSkillUseDelegate(use);
        if (delegate === null) return null;
        delegate.rollData = this.rollData;
        this._delegate = delegate;
        return delegate;
    }

    override async checkForOpposed(): Promise<void> {
        const delegate = this.#resolveDelegate();
        if (delegate === null) {
            await super.checkForOpposed();
            return;
        }
        await delegate.checkForOpposed();
    }

    override async descriptionText(): Promise<void> {
        const delegate = this.#resolveDelegate();
        if (delegate === null) return;
        await delegate.descriptionText();
        // Fold the delegate's chat-card rows onto the shell — it is the action that
        // was stored for, and rendered by, the chat pipeline.
        for (const effect of delegate.effectOutput) this.addEffect(effect.name, effect.effect);
    }
}

/**
 * Per-use-family action constructors. Keyed by the use's declared `kind` — never by a
 * skill name — so a new skill that reuses an existing family needs no entry here. A
 * `null` return means "nothing to apply": the plain test, or a malformed definition
 * missing the field its action requires.
 */
const SKILL_USE_DELEGATE_FACTORIES: Partial<Record<SkillUseKind, (use: SkillUseDef) => SimpleSkillData | null>> = {
    general: () => null,
    interrogate: () => new InterrogationActionData(),
    detect: () => new DetectionActionData(),
    social: (use) => new SocialInfluenceActionData(use),
    socialBuff: (use) =>
        use.id === 'inspire' || use.id === 'terrify' || use.id === 'warCry' || use.id === 'blather' ? new SocialBuffActionData(use.id) : null,
    contest: (use) => (use.opposedSkill !== undefined ? new ContestActionData(use.opposedSkill) : null),
};

/**
 * Map an inline-resolvable use to the ActionData subclass that applies it (#432).
 * Deliberately keyed on the use's declared `kind` / `id` — never on a skill name —
 * so a new skill that reuses an existing use family needs no code change here.
 * Returns null for the plain test and for the item-choice families, which are built
 * by their own pre-roll flows (they need the chosen item as a constructor argument).
 */
export function buildSkillUseDelegate(use: SkillUseDef): SimpleSkillData | null {
    if (useNeedsItemChoice(use)) return null;
    const factory = SKILL_USE_DELEGATE_FACTORIES[use.kind];
    // The Medicae family (firstAid / extendedCare / surgery / diagnose / extractBullet)
    // has no dedicated entry — every member resolves through the one action, keyed by kind.
    return factory !== undefined ? factory(use) : new MedicaeActionData(use.kind);
}
