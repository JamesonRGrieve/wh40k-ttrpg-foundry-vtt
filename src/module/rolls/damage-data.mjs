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
        hit.location = this.determineHitLocation(lastHit ? lastHit : attackData.rollData.roll.total);
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
        const sourceActor = attackData.rollData.sourceActor;

        let righteousFuryThreshold = 10;
        if (actionItem.hasAttackSpecial('Vengeful')) {
            righteousFuryThreshold = actionItem.getAttackSpecial('Vengeful').system.level ?? 10;
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

                if (actionItem.hasAttackSpecial('Primitive')) {
                    const primitive = actionItem.getAttackSpecial('Primitive');
                    if (result.result > primitive.system.level) {
                        this.modifiers['primitive'] = primitive.system.level - result.result;
                    }
                }

                if (actionItem.hasAttackSpecial('Proven')) {
                    const proven = actionItem.getAttackSpecial('Proven');
                    if (result.result < proven.system.level) {
                        this.modifiers['proven'] = proven.system.level - result.result;
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
            if (actionItem.hasAttackSpecial('Scatter')) {
                if (attackData.rollData.rangeName === 'Point Blank') {
                    this.modifiers['scatter'] = 3;
                } else if (attackData.rollData.rangeName !== 'Short Range') {
                    this.modifiers['scatter'] = -3;
                }
            }

            // Add Accurate
            if (actionItem.hasAttackSpecial('Accurate')) {
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

            // Eye of Vengeance
            if (attackData.rollData.eyeOfVengeance) {
                this.modifiers['eye of vengeance'] = attackData.rollData.dos;
            }

            // Maximal
            if (actionItem.hasAttackSpecial('Maximal')) {
                const maximalRoll = new Roll('1d10', {});
                await maximalRoll.evaluate({ async: true });
                this.modifiers['maximal'] = maximalRoll.total;
            }
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
            if(this.penetration && actionItem.hasAttackSpecial('Lance')) {
                this.penetrationModifiers['lance'] = this.penetration * attackData.rollData.dos;
            }

            if(actionItem.hasAttackSpecial('Mono')) {
                this.penetrationModifiers['mono'] = 2;
            }

            if(attackData.rollData.dos > 2 && actionItem.hasAttackSpecial('Razer Sharp')) {
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
                if(actionItem.hasAttackSpecial('Melta')) {
                    this.penetrationModifiers['melta'] = this.penetration * 2;
                }
            }

            if(actionItem.hasAttackSpecial('Maximal')) {
                this.penetrationModifiers['maximal'] = 2;
            }
        }
    }

    static determineHitLocation(roll) {
        const rollString = roll.toString().split('');
        const reverseArray = rollString.reverse();
        const joinArray = reverseArray.join('');

        const reverseInt = parseInt(joinArray);

        if (reverseInt <= 10) {
            return 'head';
        } else if (reverseInt <= 20) {
            return 'right arm';
        } else if (reverseInt <= 30) {
            return 'left arm';
        } else if (reverseInt <= 70) {
            return 'body';
        } else if (reverseInt <= 85) {
            return 'right leg';
        } else {
            return 'left leg';
        }
    }

    static nextHitLocation(location) {
        if (location === 'head') {
            return 'right arm';
        } else if (location === 'right arm') {
            return 'left arm';
        } else if (location === 'left arm') {
            return 'body';
        } else if (location === 'body') {
            return 'right leg';
        } else if (location === 'right leg') {
            return 'left leg';
        } else {
            return 'head';
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
