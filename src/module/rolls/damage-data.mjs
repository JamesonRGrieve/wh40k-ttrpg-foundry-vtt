import { getHitLocationForRoll, getNextHitLocation } from '../rules/hit-locations.mjs';
import {
    calculateAmmoAttackBonuses,
    calculateAmmoDamageBonuses,
    calculateAmmoPenetrationBonuses, calculateAmmoSpecials,
} from '../rules/ammo.mjs';

export class DamageData {
    template = '';
    sourceActor;
    targetActor;

    additionalHits = 0;
    hits = [];
}

export class Hit {
    location = '';

    damage = 0;
    damageRoll;
    damageType = '';
    modifiers = {};
    totalDamage = 0;

    dos = 0;

    penetration = 0;
    penetrationRoll;
    penetrationModifiers = {}
    totalPenetration = 0;

    specials = [];
    righteousFury = [];
    scatter = {};

    /**
     * @param attackData {AttackData}
     * @param lastHit
     * @returns {Promise<void>}
     */
    static async createHit(attackData, lastHit = undefined) {
        const hit = new Hit();
        await hit._calculateDamage(attackData);
        hit._totalDamage();
        await hit._calculatePenetration(attackData);
        hit._totalPenetration();
        await hit._calculateSpecials(attackData);

        if (attackData.rollData.isCalledShot) {
            hit.location = attackData.rollData.calledShotLocation;
        } else {
            if(lastHit) {
                hit.location = getNextHitLocation(lastHit);
            } else {
                hit.location = getHitLocationForRoll(attackData.rollData.roll.total);
            }
        }

        return hit;
    }

    _totalDamage() {
        this.totalDamage = this.damage + Object.values(this.modifiers).reduce((a, b) => a+b, 0);
    }

    _totalPenetration() {
        this.totalPenetration = this.penetration + Object.values(this.penetrationModifiers).reduce((a, b) => a+b, 0);
    }

    /**
     * @param attackData {AttackData}
     * @returns {Promise<void>}
     */
    async _calculateDamage(attackData) {
        let actionItem = attackData.rollData.weapon ?? attackData.rollData.power;
        if(actionItem) return;
        const sourceActor = attackData.rollData.sourceActor;

        let righteousFuryThreshold = 10;
        if (attackData.rollData.hasAttackSpecial('Vengeful')) {
            righteousFuryThreshold = attackData.rollData.getAttackSpecial('Vengeful').level ?? 10;
            game.dh.log('_calculateDamage has vengeful: ', righteousFuryThreshold);
        }

        const rollFormula = actionItem.system.damage;
        this.damageRoll = new Roll(rollFormula, attackData.rollData);
        await this.damageRoll.evaluate({ async: true });
        this.damage = this.damageRoll.total;

        for (const term of this.damageRoll.terms) {
            if (!term.results) continue;
            for (const result of term.results) {
                game.dh.log('_calculateDamage result:', result);
                if (result.discarded || !result.active) continue;
                if (result.result >= righteousFuryThreshold) {
                    // Righteous fury hit
                    const righteousFuryRoll = new Roll('1d5', {});
                    await righteousFuryRoll.evaluate({ async: true });
                    this.righteousFury.push(righteousFuryRoll);

                    // DeathDealer
                    if (sourceActor.hasTalent('Deathdealer')) {
                        this.modifiers['deathdealer'] = sourceActor.getCharacteristicFuzzy('Perception').bonus;
                    }
                }

                if (attackData.rollData.hasAttackSpecial('Primitive')) {
                    const primitive = attackData.rollData.getAttackSpecial('Primitive');
                    if (result.result > primitive.level) {
                        this.modifiers['primitive'] = primitive.level - result.result;
                    }
                }

                if (attackData.rollData.hasAttackSpecial('Proven')) {
                    const proven = attackData.rollData.getAttackSpecial('Proven');
                    if (result.result < proven.level) {
                        this.modifiers['proven'] = proven.level - result.result;
                    }
                }
            }
        }

        if (actionItem.isMelee) {
            this.modifiers['strength bonus'] = sourceActor.getCharacteristicFuzzy('Strength').bonus;

            if (sourceActor.hasTalent('Crushing Blow')) {
                const wsBonus = sourceActor.getCharacteristicFuzzy('WeaponSkill').bonus
                this.modifiers['crushing blow'] = Math.ceil(wsBonus / 2);
            }
        } else if (actionItem.isRanged) {

            // Scatter
            if (attackData.rollData.hasAttackSpecial('Scatter')) {
                if (attackData.rollData.rangeName === 'Point Blank') {
                    this.modifiers['scatter'] = 3;
                } else if (attackData.rollData.rangeName !== 'Short Range') {
                    this.modifiers['scatter'] = -3;
                }
            }

            // Add Accurate
            if (attackData.rollData.action === 'Standard Attack' || attackData.rollData.action === 'Called Shot') {
                if (attackData.rollData.hasAttackSpecial('Accurate')) {
                    if (attackData.rollData.dos >= 3) {
                        const accurateRoll = new Roll('1d10', {});
                        await accurateRoll.evaluate({ async: true });
                        this.modifiers['accurate'] = accurateRoll.total;
                    }
                    if (attackData.rollData.dos >= 5) {
                        const accurateRoll = new Roll('1d10', {});
                        await accurateRoll.evaluate({ async: true });
                        this.modifiers['accurate x 2'] = accurateRoll.total;
                    }
                }
            }

            // Eye of Vengeance
            if (attackData.rollData.eyeOfVengeance) {
                this.modifiers['eye of vengeance'] = attackData.rollData.dos;
            }

            // Maximal
            if (attackData.rollData.hasAttackSpecial('Maximal')) {
                const maximalRoll = new Roll('1d10', {});
                await maximalRoll.evaluate({ async: true });
                this.modifiers['maximal'] = maximalRoll.total;
            }

            // Ammo
            await calculateAmmoDamageBonuses(attackData, this);
        }
    }

    async _calculatePenetration(attackData) {
        let actionItem = attackData.rollData.weapon ?? attackData.rollData.power;
        const sourceActor = attackData.rollData.sourceActor;

        const rollFormula = actionItem.system.penetration;
        if(Number.isInteger(rollFormula)) {
            this.penetration = rollFormula;
        } else {
            this.penetrationRoll = new Roll(rollFormula, attackData.rollData);
            await this.penetrationRoll.evaluate({ async: true });
            this.penetration = this.penetrationRoll.total;
        }

        if(actionItem.isMelee) {
            if(this.penetration && attackData.rollData.hasAttackSpecial('Lance')) {
                this.penetrationModifiers['lance'] = this.penetration * attackData.rollData.dos;
            }

            if(attackData.rollData.hasAttackSpecial('Mono')) {
                this.penetrationModifiers['mono'] = 2;
            }

            if(attackData.rollData.dos > 2 && attackData.rollData.hasAttackSpecial('Razer Sharp')) {
                this.penetrationModifiers['razer sharp'] = this.penetration * 2;
            }

            if(attackData.rollData.action === 'All Out Attack' && sourceActor.hasTalent('Hammer Blow')) {
                this.penetrationModifiers['hammer blow'] = sourceActor.getCharacteristicFuzzy('strength').bonus;
            }
        } else if (actionItem.isRanged) {
            if(attackData.rollData.eyeOfVengeance) {
                this.penetrationModifiers['eye of vengeance'] = attackData.rollData.dos;
            }

            if(attackData.rollData.rangeName === 'Short Range' || attackData.rollData.rangeName === 'Point Blank') {
                if(attackData.rollData.hasAttackSpecial('Melta')) {
                    this.penetrationModifiers['melta'] = this.penetration * 2;
                }
            }

            if(attackData.rollData.hasAttackSpecial('Maximal')) {
                this.penetrationModifiers['maximal'] = 2;
            }

            // Ammo
            await calculateAmmoPenetrationBonuses(attackData, this);
        }
    }

    async _calculateSpecials(attackData) {
        let actionItem = attackData.rollData.weapon ?? attackData.rollData.power;
        const sourceActor = attackData.rollData.sourceActor;

        this.damageType = actionItem.system.damageType;

        if(actionItem.isRanged) {
            await calculateAmmoSpecials(attackData, this);
        }
    }
}

export class WeaponDamageData extends DamageData {
    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/weapon-roll-chat.hbs';
    }
}

export class PsychicDamageData extends DamageData {
    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/weapon-roll-chat.hbs';
    }
}

export function scatterDirection() {
    let direction = '';
    const directionInt = Math.floor(Math.random() * 10) + 1;
    if (directionInt === 1) direction = 'north west';
    if (directionInt === 2) direction = 'north';
    if (directionInt === 3) direction = 'north east';
    if (directionInt === 4) direction = 'west';
    if (directionInt === 5) direction = 'east';
    if (directionInt === 6 || directionInt === 7) direction = 'south west';
    if (directionInt === 8) direction = 'south';
    if (directionInt === 9 || directionInt === 10) direction = 'south east';
    return direction;
}
