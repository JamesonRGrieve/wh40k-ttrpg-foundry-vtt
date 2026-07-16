import { DHBasicActionManager } from '../actions/basic-action-manager.ts';
import { SYSTEM_ID } from '../constants.ts';
import { refundAmmo, useAmmo } from '../rules/ammo.ts';
import { getHitLocationForRoll } from '../rules/hit-locations.ts';
import type { RerollOption } from '../rules/reroll.ts';
import { applyFirstAidOutcome, type FirstAidPatient, getSkillUse, resolveFirstAid, type SkillUseKind } from '../rules/skill-uses.ts';
import { getJamFloor, shouldJamRoll } from '../rules/weapon-jam.ts';
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
            if (rollCheck.success) {
                if (this.rollData.opposedDos >= this.rollData.dos) {
                    this.rollData.success = false;
                }
            }
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

        const parts = [game.i18n.format('WH40K.SkillUse.Applied', { medic: this.rollData.sourceActor?.name ?? '', use: useLabel, patient: target.name })];
        if (outcome.woundsRestored > 0) parts.push(game.i18n.format('WH40K.SkillUse.HealedWounds', { wounds: String(outcome.woundsRestored) }));
        if (outcome.criticalResolved > 0) parts.push(game.i18n.format('WH40K.SkillUse.ResolvedCritical', { tiers: String(outcome.criticalResolved) }));
        if (outcome.bloodLossStopped) parts.push(game.i18n.localize('WH40K.SkillUse.BloodLossStopped'));
        this.addEffect('Medicae', parts.join(' '));
    }
}
