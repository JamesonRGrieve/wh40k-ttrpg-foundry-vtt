import { DHBasicActionManager } from '../actions/basic-action-manager.ts';
import { SYSTEM_ID } from '../constants.ts';
import { refundAmmo, useAmmo } from '../rules/ammo.ts';
import { clampDisposition, labelForDisposition } from '../rules/disposition.ts';
import { getHitLocationForRoll } from '../rules/hit-locations.ts';
import { type OpposedSide, resolveOpposed } from '../rules/opposed.ts';
import type { RerollOption } from '../rules/reroll.ts';
import {
    applyFirstAidOutcome,
    blatherRounds,
    type FirstAidPatient,
    getSkillUse,
    type ReadoutFamily,
    resolveDosReadout,
    resolveFirstAid,
    resolveInterrogation,
    resolveSocialInfluence,
    type SkillUseDef,
    type SkillUseKind,
} from '../rules/skill-uses.ts';
import { getJamFloor, shouldJamRoll } from '../rules/weapon-jam.ts';
import { DAY_SECONDS } from '../rules/world-time.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import { RollTableUtils } from '../utils/roll-table-utils.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { type AttackDataLike, Hit, PsychicDamageData, scatterDirection, WeaponDamageData } from './damage-data.ts';
import { PsychicRollData, RollData, WeaponRollData } from './roll-data.ts';
import { getDegreeForMode, getOpposedDegrees, isD100Success, resolveDegreesMethod, roll1d100, sendActionDataToChat, uuid } from './roll-helpers.ts';

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
        return actor.getRerollOptions({
            success: this.rollData.success,
            type: this.rollData.type,
            rollKey: this.rollData.rollKey,
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

    async checkForPerils(): Promise<void> {
        if (this.rollData.power === undefined) return;

        const sourceActor = this.rollData.sourceActor;
        if (sourceActor === null) return;

        const sourceSystem = sourceActor.system as { psy?: { rating: number } };
        const psyRating = sourceSystem.psy?.rating ?? 0;
        const rollTotal = this.rollData.roll?.total;
        if (rollTotal === undefined) return;

        const isDoubles = /^(.)\1+$/.test(rollTotal.toString());
        const overchannelling = psyRating < (this.rollData as PsychicRollData).pr;
        // RAW DH2e: overchannelling triggers phenomena on any non-double; normal
        // casts trigger phenomena only on doubles.
        const phenomenaTriggered = overchannelling ? !isDoubles : isDoubles;
        if (!phenomenaTriggered) return;

        this.addEffect('Psychic Phenomena', 'The warp convulses with energy!');

        let autoRoll = true;
        try {
            autoRoll = game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.autoPsychicPhenomena) === true;
        } catch {
            // Setting may not be registered yet during early-boot rolls; default to on.
        }
        if (!autoRoll) return;

        const power = this.rollData.power;
        const powerSystem = power.system as { phenomenaModifier?: number };
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- `.system ??` defaults are banned by repo policy; explicit undefined handling is intentional here
        const phenomenaModifier = powerSystem.phenomenaModifier === undefined ? 0 : powerSystem.phenomenaModifier;
        await RollTableUtils.rollPsychicPhenomena(sourceActor, phenomenaModifier);
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

    async checkForOpposed(): Promise<void> {
        if (this.rollData.isOpposed && this.rollData.targetActor !== null) {
            const targetActor = this.rollData.targetActor;
            const rollCheck = (await targetActor.rollCharacteristicCheck(this.rollData.opposedChar)) as {
                roll: Roll;
                dos: number;
                dof: number;
                success: boolean;
            };
            this.rollData.opposedRoll = rollCheck.roll;
            this.rollData.opposedDos = rollCheck.dos;
            this.rollData.opposedDof = rollCheck.dof;
            this.applyOpposedResult({ success: rollCheck.success, dos: rollCheck.dos, dof: rollCheck.dof, roll: rollCheck.roll.total });
        }

        const weaponRollData = this.rollData as WeaponRollData;
        if (weaponRollData.isFeint) {
            if (!this.rollData.success) {
                this.addEffect('Feint', `The character fails to feint against the target!`);
            } else if (this.rollData.targetActor !== null) {
                this.addEffect('Feint', `The next melee Standard Attack action against that same target during this turn cannot be Evaded!`);
            } else {
                this.addEffect(
                    'Feint',
                    `Compare to targets Weapon Skill check. If the character wins, his next melee Standard Attack action against that same target during this turn cannot be Evaded.`,
                );
            }
        }

        if (weaponRollData.isKnockDown) {
            if (this.rollData.targetActor !== null) {
                const opposedDegrees = getOpposedDegrees(this.rollData.dos, this.rollData.dof, this.rollData.opposedDos, this.rollData.opposedDof);
                if (opposedDegrees >= 2) {
                    const sourceActor = this.rollData.sourceActor;
                    const sourceCharacteristics =
                        sourceActor !== null ? (sourceActor.system as { characteristics?: { strength?: { bonus: number } } }).characteristics : undefined;
                    const strengthBonus = sourceCharacteristics?.strength?.bonus ?? 0;
                    this.addEffect(
                        'Knock Down',
                        `The target is knocked Prone and must use a Stand action in his turn to regain his feet! The impact deals [[1d5-3+${strengthBonus}]] (min 0) damage and one level of fatigue to the target!`,
                    );
                } else if (opposedDegrees > 0) {
                    this.addEffect('Knock Down', `The target is knocked Prone and must use a Stand action in his turn to regain his feet!`);
                } else if (opposedDegrees > -2) {
                    this.addEffect('Knock Down', `The character fails to knock down the target!`);
                } else {
                    this.addEffect('Knock Down', `The character fails to knock down the target and in the failure knocks themselves prone instead!`);
                }
            } else if (this.rollData.success) {
                this.addEffect(
                    'Knock Down',
                    `Compare to targets Strength check. If the attacker wins, the target is knocked Prone and must use a Stand action in his turn to regain his feet. If the attacker succeeds by two or more degrees of success, he can choose to inflict 1d5–3+SB Impact damage and one level of Fatigue on the target. If the target wins the test, he keeps his footing. If the target wins by two or more degrees of success, the attacker is knocked Prone instead.`,
                );
            } else {
                this.addEffect('Knock Down', `The character fails to knock down the target!`);
            }
        }
    }

    async _calculateHit(): Promise<void> {
        const weaponRollData = this.rollData as WeaponRollData;
        if ((weaponRollData as { isManualRoll?: boolean }).isManualRoll !== true) {
            this.rollData.roll = await roll1d100();
        }
        const rollTotal = this.rollData.roll?.total ?? 0;
        const target = this.rollData.modifiedTarget;
        this.rollData.success = isD100Success(rollTotal, target);
    }

    // eslint-disable-next-line complexity -- this method is a deliberate central dispatcher for action resolution branches
    async calculateSuccessOrFailure(): Promise<void> {
        await this._calculateHit();
        const actionItem = this.rollData.weapon ?? this.rollData.power;
        const weaponRollData = this.rollData as WeaponRollData;

        if (actionItem !== undefined) {
            if (this.rollData.action === 'All Out Attack') {
                this.addEffect('All Out Attack', 'The character cannot attempt Evasion reactions until the beginning of his next turn.');
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
                            'Stun Attack',
                            `Stun roll of ${stunTotal} vs ${defense}. Target is stunned for ${stunTotal - defense} rounds and gains 1 level of fatigue.`,
                        );
                    } else {
                        this.rollData.success = false;
                        this.addEffect('Stun Attack', `Stun roll of ${stunTotal} vs ${defense}. The attack fails to stun the target!`);
                    }
                } else {
                    this.rollData.success = true;
                    this.addEffect(
                        'Stun Attack',
                        `Stun roll of ${stunTotal}. Compare to the target's total of his Toughness bonus +1 per Armour point protecting his head. If the attacker's roll is equal to or higher than this value, the target is Stunned for a number of rounds equal to the difference between the two values and gains one level of Fatigue.`,
                    );
                }
                return;
            }

            if (this.rollData.hasAttackSpecial('Spray')) {
                this.rollData.success = true;
                this.rollData.dos = 1;
                this.rollData.dof = 0;
                this.addEffect('Spray', 'Everyone in 30 degree arc must pass an agility test or be hit.');
            }

            const itemSystem = actionItem.system as {
                isMelee?: boolean;
                isRanged?: boolean;
                craftsmanship?: string;
                isPsychicBarrage?: boolean;
                isPsychicStorm?: boolean;
                usesAmmo?: boolean;
            };
            if (itemSystem.isMelee === true) {
                if (!this.rollData.success) {
                    type ActorWithHasTalent = WH40KBaseActorDocument & { hasTalent: (name: string) => boolean };
                    const sourceActor = this.rollData.sourceActor as ActorWithHasTalent | null;
                    if (sourceActor?.hasTalent('Blademaster') === true) {
                        this.effects.push('blademaster');
                        if (this.rollData.roll !== null) this.rollData.previousRolls.push(this.rollData.roll);
                        await this._calculateHit();
                    }
                }
            } else if (itemSystem.isRanged === true) {
                if (this.rollData.action === 'Suppressing Fire - Semi') {
                    this.addEffect('Suppressing', 'All targets within a 30 degree arc must pass a Difficult (-10) Pinning test for become Pinned.');
                } else if (this.rollData.action === 'Suppressing Fire - Full') {
                    this.addEffect('Suppressing', 'All targets within a 45 degree arc must pass a Hard (-20) Pinning test for become Pinned.');
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
                        this.addEffect('Near Overheat', 'The weapon nearly overheats, but its superior craftsmanship prevents it. Attack misses.');
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
                        this.addEffect(
                            'Catastrophic Jam',
                            'The weapon is of such poor quality with its unreliable mechanism that it jams on this failed shot!',
                        );
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
                    this.addEffect('Near Jam', 'The weapon nearly jams, but its superior craftsmanship prevents it. Attack misses.');
                }
            }
        }

        // Degrees method resolves from the `degreesMode` setting + the source
        // actor's game system (Gen 1 margin/10 vs Gen 2 tens-digit).
        const degreesMethod = resolveDegreesMethod((this.rollData.sourceActor?.system as { gameSystem?: string } | undefined)?.gameSystem);

        if (this.rollData.success) {
            this.rollData.dof = 0;
            this.rollData.dos = 1 + getDegreeForMode(degreesMethod, this.rollData.modifiedTarget, this.rollData.roll?.total ?? 0);

            const damageData = this.damageData;
            if (actionItem !== undefined && damageData !== undefined) {
                const itemSystem = actionItem.system as { isRanged?: boolean; isPsychicBarrage?: boolean; isPsychicStorm?: boolean; usesAmmo?: boolean };
                if (
                    this.rollData.action === 'Semi-Auto Burst' ||
                    this.rollData.action === 'Swift Attack' ||
                    itemSystem.isPsychicBarrage === true ||
                    this.rollData.action === 'Suppressing Fire - Semi' ||
                    this.rollData.action === 'Suppressing Fire - Full'
                ) {
                    if (itemSystem.isRanged === true && weaponRollData.hasWeaponModification('Fluid Action')) {
                        this.rollData.dos += 1;
                    }

                    damageData.additionalHits += Math.floor((this.rollData.dos - 1) / 2);

                    if (this.rollData.hasAttackSpecial('Storm')) {
                        damageData.additionalHits *= 2;
                    }

                    if (itemSystem.isRanged === true && damageData.additionalHits > weaponRollData.fireRate - 1) {
                        damageData.additionalHits = weaponRollData.fireRate - 1;
                    }
                } else if (this.rollData.action === 'Full Auto Burst' || this.rollData.action === 'Lightning Attack' || itemSystem.isPsychicStorm === true) {
                    damageData.additionalHits += Math.floor(this.rollData.dos - 1);

                    if (this.rollData.hasAttackSpecial('Storm')) {
                        damageData.additionalHits *= 2;
                    }

                    if (itemSystem.usesAmmo === true && damageData.additionalHits > weaponRollData.fireRate - 1) {
                        damageData.additionalHits = weaponRollData.fireRate - 1;
                    }
                }
            }

            if (this.rollData.dos > 1 && this.rollData.hasAttackSpecial('Twin-Linked') && damageData !== undefined) {
                damageData.additionalHits++;
            }
        } else {
            this.rollData.dos = 0;
            this.rollData.dof = 1 + getDegreeForMode(degreesMethod, this.rollData.roll?.total ?? 0, this.rollData.modifiedTarget);

            if (weaponRollData.isThrown) {
                this.addEffect('Deviation', `The attack deviates [[ 1d5 ]]m off course to the ${scatterDirection()}!`);
            }

            if (this.rollData.roll?.total === 100) {
                this.effects.push('auto-failure');
            }
        }
    }

    async calculateHits(): Promise<void> {
        const weaponRollData = this.rollData as WeaponRollData;
        if ((this.rollData.success || weaponRollData.isThrown) && this.damageData !== undefined) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: ActionData↔AttackDataLike are duck-typed siblings
            const attackData = this as unknown as AttackDataLike;
            let hit = await Hit.createHit(attackData, 0);
            this.damageData.hits.push(hit);

            for (let i = 0; i < this.damageData.additionalHits; i++) {
                // eslint-disable-next-line no-await-in-loop -- sequential roll generation; each createHit advances dice state
                hit = await Hit.createHit(attackData, i + 1);
                this.damageData.hits.push(hit);
            }
        }
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
                this.addEffect('Auto Failure', `The roll resulted in an automatic failure!`);
            } else if (effect === 'blademaster') {
                this.addEffect('Blademaster', `Original roll of ${this.rollData.previousRolls[0]?.total ?? 0} rerolled.`);
            } else if (effect === 'overheat') {
                this.addEffect('Overheats', `The weapon overheats forcing it to be dropped on the ground!`);
            } else if (effect === 'jam') {
                this.addEffect('Jam', `The weapon jams!`);
            }
        }
    }

    async useResources(): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: ActionData↔useAmmo's expected parameter type are duck-typed siblings
        await useAmmo(this as unknown as Parameters<typeof useAmmo>[0]);

        // A jam still cycles/wastes the round(s) fired, so the ammo spend above
        // runs unconditionally first (#410 playtest note: the jam path must NOT
        // skip the spend). Then persist the jam onto the weapon item so it is
        // per-weapon and survives across turns (#411).
        await this._persistWeaponJam(true);

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

    async performActionAndSendToChat(): Promise<void> {
        DHBasicActionManager.storeActionData(this);

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
        if (!this.hasDamage || this.damageData === undefined) return;
        // `isTargetOnly` is set on a "post target, await physical roll" submit;
        // there is no resolved success/DoS to roll damage from.
        if ((this.rollData as { isTargetOnly?: boolean }).isTargetOnly === true) return;

        // `isThrown` is optional on the base RollData (only WeaponRollData sets
        // it); a thrown weapon always rolls damage (scatter on a miss) so it
        // counts as a "hit" for auto-damage purposes.
        const isHit = this.rollData.success || this.rollData.isThrown === true;
        if (!isHit) return;

        if (!WH40KSettings.isAutoRollDamageEnabled()) return;

        // Hits may already be present if a prior step populated them; only
        // calculate when empty so we don't double-roll.
        if (this.damageData.hits.length === 0) {
            await this.calculateHits();
        }

        // Propagate attack DoS to each hit so the damage card can still offer the
        // "replace damage die with DoS" action (#129 — DH2 core L10398-10414),
        // matching the manual `_rollDamage` path.
        const attackDoS = this.rollData.dos;
        for (const hit of this.damageData.hits) {
            hit.dos = attackDoS;
        }

        await DHBasicActionManager._postDamageCard(this);
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
        if (!this.rollData.hasDamage) {
            this.rollData.template = 'systems/wh40k-rpg/templates/chat/psychic-action-chat.hbs';
            this.template = 'systems/wh40k-rpg/templates/chat/psychic-action-chat.hbs';
        }
        await super.performActionAndSendToChat();
    }

    override async descriptionText(): Promise<void> {
        const powerSystem = this.rollData.power.system as { description?: string };
        this.psychicEffect = await foundry.applications.ux.TextEditor.implementation.enrichHTML(powerSystem.description ?? '', {
            // eslint-disable-next-line no-restricted-syntax -- boundary: TextEditor.enrichHTML expects a record-shaped rollData payload
            rollData: this.rollData as unknown as Record<string, unknown>,
        });
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

        // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KBaseActor.wounds is the loosely-typed system wounds block
        const wounds = target.wounds as { value?: number; max?: number; critical?: number } | undefined;
        const woundsValue = wounds?.value ?? 0;
        const woundsMax = wounds?.max ?? 0;
        const criticalDamage = wounds?.critical ?? 0;
        // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics[key] is the runtime characteristic record; effectiveBonus is the bonus-only channel
        const toughness = target.characteristics['toughness'] as { effectiveBonus?: number } | undefined;
        const toughnessBonus = toughness?.effectiveBonus ?? 0;

        const useLabel = game.i18n.localize(getSkillUse('medicae', this.useKind)?.labelKey ?? '');
        const outcome = resolveFirstAid(this.useKind, { woundsValue, woundsMax, criticalDamage, toughnessBonus }, this.rollData.success ? 1 : 0);

        if (!outcome.success) {
            this.addEffect('Medicae', game.i18n.format('WH40K.SkillUse.Failed', { use: useLabel }));
            return;
        }

        const patient: FirstAidPatient = {
            woundsValue,
            woundsMax,
            criticalDamage,
            update: async (patch): Promise<void> => {
                const upd: Record<string, number> = {};
                if (patch.woundsValue !== undefined) upd['system.wounds.value'] = patch.woundsValue;
                if (patch.criticalDamage !== undefined) upd['system.wounds.critical'] = patch.criticalDamage;
                await target.update(upd);
            },
        };
        await applyFirstAidOutcome(patient, outcome);

        // RAW cooldown (#458): close the patient's gate so the same use cannot be
        // repeated on them until the in-universe window elapses (First Aid: 24h).
        const gate = getSkillUse('medicae', this.useKind)?.timeGate;
        if (gate?.windowSeconds !== undefined) {
            await target.setTimeGate(gate.key, Number(game.time.worldTime) + gate.windowSeconds);
        }

        const parts = [game.i18n.format('WH40K.SkillUse.Applied', { medic: this.rollData.sourceActor?.name ?? '', use: useLabel, patient: target.name })];
        if (outcome.woundsRestored > 0) parts.push(game.i18n.format('WH40K.SkillUse.HealedWounds', { wounds: String(outcome.woundsRestored) }));
        if (outcome.criticalResolved > 0) parts.push(game.i18n.format('WH40K.SkillUse.ResolvedCritical', { tiers: String(outcome.criticalResolved) }));
        if (outcome.bloodLossStopped) parts.push(game.i18n.localize('WH40K.SkillUse.BloodLossStopped'));
        this.addEffect('Medicae', parts.join(' '));
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
        const degrees = this.rollData.success ? Math.max(1, this.rollData.dos) : 0;
        const outcome = resolveInterrogation(degrees);
        if (outcome.fatigue > 0) await target.applyFatigue(outcome.fatigue);
        if (outcome.success) {
            this.addEffect(
                'Interrogation',
                game.i18n.format('WH40K.SkillUse.Interrogation.Extracted', {
                    tier: String(outcome.infoTier),
                    subject: target.name,
                    fatigue: String(outcome.fatigue),
                }),
            );
        } else {
            this.addEffect(
                'Interrogation',
                game.i18n.format('WH40K.SkillUse.Interrogation.Resisted', { subject: target.name, fatigue: String(outcome.fatigue) }),
            );
            // RAW (#458): a badly botched session (2+ degrees of failure) leaves the
            // subject unable to be interrogated again for 1d5 days.
            if (this.rollData.dof >= 2) {
                const lockout = new Roll('1d5');
                await lockout.evaluate();
                const days = lockout.total ?? 1;
                await target.setTimeGate('interrogate', Number(game.time.worldTime) + days * DAY_SECONDS);
                this.addEffect('Interrogation', game.i18n.format('WH40K.SkillUse.Interrogation.Lockout', { subject: target.name, days: String(days) }));
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
        this.addEffect('Readout', game.i18n.format(readout.labelKey, { tier: String(readout.tier) }));
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
        this.addEffect('Detection', text);
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
        const rollCheck = (await target.rollSkillCheck(opposedSkill)) as { roll: Roll; dos: number; dof: number; success: boolean } | null;
        if (rollCheck === null) return;
        this.rollData.opposedRoll = rollCheck.roll;
        this.rollData.opposedDos = rollCheck.dos;
        this.rollData.opposedDof = rollCheck.dof;
        this.applyOpposedResult({ success: rollCheck.success, dos: rollCheck.dos, dof: rollCheck.dof, roll: rollCheck.roll.total });
    }

    override async descriptionText(): Promise<void> {
        const target = this.rollData.targetActor;
        const useLabel = game.i18n.localize(this.def.labelKey);
        const targetName = target?.name ?? '';

        if (!this.rollData.success) {
            this.addEffect('Social', game.i18n.format('WH40K.SkillUse.Social.Lost', { use: useLabel, target: targetName }));
            return;
        }

        const degrees = Math.max(1, this.rollData.dos);
        const outcome = resolveSocialInfluence(this.def, degrees, true);
        if (target === null || outcome.dispositionDelta === 0) {
            this.addEffect('Social', game.i18n.format('WH40K.SkillUse.Social.Won', { use: useLabel, target: targetName }));
            return;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: disposition lives on npc.ts only; loosely typed here
        const disposition = (target.system as { disposition?: { value: number } }).disposition;
        const before = disposition?.value ?? 0;
        await target.adjustDisposition(outcome.dispositionDelta);
        const band = game.i18n.localize(`WH40K.Disposition.${labelForDisposition(clampDisposition(before + outcome.dispositionDelta))}`);
        this.addEffect(
            'Social',
            game.i18n.format('WH40K.SkillUse.Social.Shift', {
                use: useLabel,
                target: targetName,
                bands: String(Math.abs(outcome.dispositionDelta)),
                band,
            }),
        );
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
                this.addEffect('Demolition', game.i18n.format('WH40K.SkillUse.Demo.PlaceFailed', { item: name }));
                return;
            }
            if (this.rollData.dof >= 4) {
                this.addEffect('Demolition', game.i18n.format('WH40K.SkillUse.Demo.Premature', { item: name }));
                return;
            }
            await this.explosive.update({ 'system.state.armed': { active: true, trigger: this.trigger, setterDegrees: Math.max(1, this.rollData.dos) } });
            this.addEffect('Demolition', game.i18n.format('WH40K.SkillUse.Demo.Placed', { item: name, trigger: this.trigger }));
            return;
        }

        // Defuse: opposed vs the setter's recorded degrees.
        const setterDegrees = this.explosive.system.state.armed.setterDegrees;
        this.applyOpposedResult({ success: true, dos: setterDegrees, dof: 0 });
        if (this.rollData.dof >= 4) {
            this.addEffect('Demolition', game.i18n.format('WH40K.SkillUse.Demo.DefuseSetOff', { item: name }));
            return;
        }
        if (!this.rollData.success) {
            this.addEffect('Demolition', game.i18n.format('WH40K.SkillUse.Demo.DefuseFailed', { item: name }));
            return;
        }
        await this.explosive.update({ 'system.state.armed': { active: false, trigger: '', setterDegrees: 0 } });
        this.addEffect('Demolition', game.i18n.format('WH40K.SkillUse.Demo.Defused', { item: name }));
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
    readonly mode: 'repair' | 'bypassLock';
    readonly item: StatefulItem;

    constructor(mode: 'repair' | 'bypassLock', item: StatefulItem) {
        super();
        this.mode = mode;
        this.item = item;
    }

    override async descriptionText(): Promise<void> {
        const itemName = this.item.name;
        if (!this.rollData.success) {
            const failKey = this.mode === 'repair' ? 'WH40K.SkillUse.Object.RepairFailed' : 'WH40K.SkillUse.Object.BypassFailed';
            this.addEffect('Tech-Use', game.i18n.format(failKey, { item: itemName }));
            return;
        }

        if (this.mode === 'repair') {
            await this.item.update({ 'system.state.broken': false, 'system.jammed': false });
            this.addEffect('Tech-Use', game.i18n.format('WH40K.SkillUse.Object.Repaired', { item: itemName }));
            return;
        }
        await this.item.update({ 'system.state.locked': false });
        this.addEffect('Security', game.i18n.format('WH40K.SkillUse.Object.Unlocked', { item: itemName }));
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
            this.addEffect('Sleight of Hand', game.i18n.format('WH40K.SkillUse.Palm.Caught', { target: target.name }));
            return;
        }

        const [from, to] = this.mode === 'steal' ? [target, actor] : [actor, target];
        const moved = await from.transferItemTo(this.itemId, to);
        if (moved === null) return;
        const key = this.mode === 'steal' ? 'WH40K.SkillUse.Palm.Stole' : 'WH40K.SkillUse.Palm.Planted';
        this.addEffect('Sleight of Hand', game.i18n.format(key, { item: moved, target: target.name }));
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
                this.addEffect('Chem-Use', game.i18n.format('WH40K.SkillUse.Chem.Botched', { chem: chemName, actor: user.name }));
                return;
            }
            this.addEffect('Chem-Use', game.i18n.format('WH40K.SkillUse.Chem.Failed', { chem: chemName }));
            return;
        }

        if (this.mode === 'coatWeapon') {
            const weapon = this.weapon;
            if (weapon === null) return;
            const charges = Math.max(1, this.chem.system.uses.max);
            await weapon.update({ 'system.state.coating': { name: chemName, charges } });
            this.addEffect('Chem-Use', game.i18n.format('WH40K.SkillUse.Chem.Coated', { chem: chemName, weapon: weapon.name, charges: String(charges) }));
            return;
        }

        const target = this.rollData.targetActor;
        if (target === null) return;
        await applyChemDose(this.chem, target);
        this.addEffect('Chem-Use', game.i18n.format('WH40K.SkillUse.Chem.Applied', { chem: chemName, target: target.name }));
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
            this.addEffect('Blather', game.i18n.format(key, { target: targetName, rounds: String(rounds) }));
            return;
        }

        if (!this.rollData.success) {
            this.addEffect('Social', game.i18n.format('WH40K.SkillUse.Buff.Failed', { target: targetName }));
            return;
        }

        if (this.buff === 'warCry' && target !== null) {
            // Real debuff: −10 to the target's defence (Dodge/Parry) for one round,
            // applied through the actor's own effect helper (no rules↔rolls import cycle).
            await target.applyCombatModifier('defense', -10, { name: game.i18n.localize('WH40K.SkillUse.Buff.WarCry'), rounds: 1 });
            this.addEffect('War Cry', game.i18n.format('WH40K.SkillUse.Buff.WarCryApplied', { target: targetName }));
            return;
        }

        // Inspire / Terrify — GM/player-tracked (no clean per-next-test / per-encounter effect).
        const applied = this.buff === 'inspire' ? 'WH40K.SkillUse.Buff.InspireApplied' : 'WH40K.SkillUse.Buff.TerrifyApplied';
        this.addEffect('Social', game.i18n.format(applied, { target: targetName }));
    }
}
