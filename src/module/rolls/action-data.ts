import { DHBasicActionManager } from '../actions/basic-action-manager.ts';
import { refundAmmo, useAmmo } from '../rules/ammo.ts';
import { getHitLocationForRoll } from '../rules/hit-locations.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import { RollTableUtils } from '../utils/roll-table-utils.ts';
import { SYSTEM_ID } from '../constants.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { type AttackDataLike, Hit, PsychicDamageData, scatterDirection, WeaponDamageData } from './damage-data.ts';
import { PsychicRollData, RollData, WeaponRollData } from './roll-data.ts';
import { getDegree, getOpposedDegrees, roll1d100, sendActionDataToChat, uuid } from './roll-helpers.ts';

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
        const phenomenaModifier = (power.system as { phenomenaModifier?: number }).phenomenaModifier ?? 0;
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
        this.rollData.success = rollTotal === 1 || (rollTotal <= target && rollTotal !== 100);
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
                    type ActorWithHasTalent = WH40KBaseActorDocument & { hasTalent(name: string): boolean };
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

                if (craftsmanship === 'poor' && hasUnreliable && !this.rollData.success) {
                    if (!bestNeverJamsOrOverheats) {
                        this.effects.push('jam');
                        this.addEffect(
                            'Catastrophic Jam',
                            'The weapon is of such poor quality with its unreliable mechanism that it jams on this failed shot!',
                        );
                    }
                } else {
                    const shouldJam = (!hasReliable && rollTotal > 96) || rollTotal === 100;
                    if (shouldJam) {
                        if (bestNeverJamsOrOverheats) {
                            this.rollData.success = false;
                            this.addEffect('Near Jam', 'The weapon nearly jams, but its superior craftsmanship prevents it. Attack misses.');
                        } else {
                            this.effects.push('jam');
                            this.rollData.success = false;
                        }
                    }
                }
            }
        }

        if (this.rollData.success) {
            this.rollData.dof = 0;
            this.rollData.dos = 1 + getDegree(this.rollData.modifiedTarget, this.rollData.roll?.total ?? 0);

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
            this.rollData.dof = 1 + getDegree(this.rollData.roll?.total ?? 0, this.rollData.modifiedTarget);

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
            switch (effect) {
                case 'auto-failure':
                    this.addEffect('Auto Failure', `The roll resulted in an automatic failure!`);
                    break;
                case 'blademaster':
                    this.addEffect('Blademaster', `Original roll of ${this.rollData.previousRolls[0]?.total ?? 0} rerolled.`);
                    break;
                case 'overheat':
                    this.addEffect('Overheats', `The weapon overheats forcing it to be dropped on the ground!`);
                    break;
                case 'jam':
                    this.addEffect('Jam', `The weapon jams!`);
                    break;
            }
        }
    }

    async useResources(): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: ActionData↔useAmmo's expected parameter type are duck-typed siblings
        await useAmmo(this as unknown as Parameters<typeof useAmmo>[0]);

        if (this.rollData.eyeOfVengeance) {
            const sourceActor = this.rollData.sourceActor;
            await sourceActor?.spendFate();
        }
    }

    async refundResources(): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: ActionData↔refundAmmo's expected parameter type are duck-typed siblings
        await refundAmmo(this as unknown as Parameters<typeof refundAmmo>[0]);

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
