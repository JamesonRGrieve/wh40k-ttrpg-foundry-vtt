import { calculateAmmoDamageBonuses, calculateAmmoPenetrationBonuses, calculateAmmoSpecials } from '../rules/ammo.ts';
import { getCriticalDamage } from '../rules/critical-damage.ts';
import { additionalHitLocations, getHitLocationForRoll } from '../rules/hit-locations.ts';
import { calculateWeaponModifiersDamageBonuses, calculateWeaponModifiersPenetrationBonuses } from '../rules/weapon-modifiers.ts';
import { calculateQualityPenetrationModifiers, calculateExoticQualityDamageModifiers, getRighteousFuryThreshold } from '../rules/weapon-quality-effects.ts';

/**
 * Minimal interface for the attackData parameter passed to Hit calculation methods.
 * ActionData satisfies this interface at runtime; we can't import ActionData here
 * without creating a circular dependency (action-data imports Hit from this file).
 */
/** Shape of item.system for action items used in damage calculations. */
interface ActionItemSystem {
    effectiveDamageFormula?: string;
    effectivePenetration?: unknown;
    damage?: { formula?: string; type?: string; penetration?: number };
    damageType?: string;
    penetration?: unknown;
    [key: string]: unknown;
}

/** Minimal action item shape needed for damage calculation. */
interface ActionItemLike {
    system: ActionItemSystem;
    isMelee: boolean;
    isRanged: boolean;
}

export interface AttackDataLike {
    rollData: {
        weapon?: ActionItemLike;
        power?: ActionItemLike;
        sourceActor: {
            getCharacteristicFuzzy: (key: string) => { bonus: number };
            hasTalent: (name: string) => boolean;
            hasTalentFuzzyWords: (words: string | string[], extra?: string) => boolean;
        };
        targetActor?: unknown;
        roll: { total: number } | null;
        isCalledShot?: boolean;
        calledShotLocation?: string;
        action: string;
        rangeName: string;
        attackSpecials: { name: string; level?: number }[];
        dos: number;
        eyeOfVengeance: boolean;
        hasAttackSpecial: (name: string) => boolean;
        getAttackSpecial: (name: string) => { level: number };
    };
    damageData?: { targetActor?: unknown };
}

export class DamageData {
    template = '';
    sourceActor: unknown = undefined;
    targetActor: unknown = undefined;

    additionalHits = 0;
    hits: Hit[] = [];

    reset(): void {
        this.hits = [];
        this.additionalHits = 0;
    }
}

export class Hit {
    location = 'Body';

    totalFatigue = 0;

    damage = 0;
    damageRoll: Roll | undefined = undefined;
    damageType = 'Impact';
    modifiers: Record<string, number> = {};
    totalDamage = 0;

    dos = 0;

    penetration = 0;
    hasPenetrationRoll = false;
    penetrationRoll: Roll | undefined = undefined;
    penetrationModifiers: Record<string, number> = {};
    totalPenetration = 0;

    specials: unknown[] = [];
    effects: { name: string; effect: string }[] = [];
    righteousFury: { roll: Roll; effect: string }[] = [];
    scatter: Record<string, unknown> = {};

    /**
     * @param attackData
     * @param hitNumber
     * @returns {Promise<Hit>}
     */
    static async createHit(attackData: AttackDataLike, hitNumber: number): Promise<Hit> {
        const hit = new Hit();
        await hit._calculateDamage(attackData);
        hit._totalDamage();
        await hit._calculatePenetration(attackData);
        hit._totalPenetration();
        hit._calculateSpecials(attackData);

        if (attackData.rollData.isCalledShot) {
            hit.location = attackData.rollData.calledShotLocation ?? 'Body';
        } else {
            const roll = attackData.rollData.roll;
            const initialHit = getHitLocationForRoll(roll?.total ?? 0) ?? 'Body';
            const locationTable = additionalHitLocations() as Record<string, Record<number, string>>;
            hit.location = locationTable[initialHit]?.[hitNumber <= 5 ? hitNumber : 5] ?? 'Body';
        }

        // Determine Righteous Fury Effects
        for (const righteousFury of hit.righteousFury) {
            const rfTotal = righteousFury.roll.total ?? 0;
            righteousFury.effect = (await getCriticalDamage(hit.damageType, hit.location, rfTotal)) ?? '';
        }

        return hit;
    }

    _totalDamage(): void {
        this.totalDamage = this.damage + Object.values(this.modifiers).reduce((a, b) => a + b, 0);
    }

    _totalPenetration(): void {
        this.totalPenetration = this.penetration + Object.values(this.penetrationModifiers).reduce((a, b) => a + b, 0);
    }

    /**
     * @param attackData {AttackData}
     * @returns {Promise<void>}
     */
    async _calculateDamage(attackData: AttackDataLike): Promise<void> {
        const actionItem = attackData.rollData.weapon ?? attackData.rollData.power;
        if (!actionItem) return;
        const sourceActor = attackData.rollData.sourceActor;

        // Get RF threshold from weapon qualities (Gauss=9, Vengeful=8, standard=10)
        let righteousFuryThreshold = getRighteousFuryThreshold(actionItem as unknown as Parameters<typeof getRighteousFuryThreshold>[0]);

        // Legacy support: check for Vengeful in attackSpecials (attack-specials.mjs)
        if (attackData.rollData.hasAttackSpecial('Vengeful')) {
            const vengefulLevel = attackData.rollData.getAttackSpecial('Vengeful').level;
            if (vengefulLevel && vengefulLevel < righteousFuryThreshold) {
                righteousFuryThreshold = vengefulLevel;
            }
            game.wh40k.log('_calculateDamage has vengeful: ', righteousFuryThreshold);
        }

        let rollFormula = actionItem.system.effectiveDamageFormula ?? actionItem.system.damage?.formula ?? actionItem.system.damage;
        if (!rollFormula || typeof rollFormula !== 'string' || rollFormula === '') {
            rollFormula = '0';
        }
        const damageRoll = new Roll(rollFormula, attackData.rollData) as unknown as Roll;
        this.damageRoll = damageRoll;

        if (attackData.rollData.hasAttackSpecial('Tearing')) {
            game.wh40k.log('Modifying dice due to tearing');
            (damageRoll.terms as unknown[])
                .filter((term): term is foundry.dice.terms.Die => term instanceof foundry.dice.terms.Die)
                .forEach((die) => {
                    if (die.modifiers.includes('kh')) return;
                    die.modifiers.push(`kh${die.number ?? 0}`);
                    die.number = (die.number ?? 0) + 1;
                });
        }

        await damageRoll.evaluate();
        game.wh40k.log('Damage Roll', damageRoll);

        this.damage = damageRoll.total ?? 0;

        for (const term of damageRoll.terms as unknown[]) {
            const termAny = term as { results?: { discarded?: boolean; active?: boolean; result?: number }[] };
            if (!termAny.results) continue;
            for (const result of termAny.results) {
                game.wh40k.log('_calculateDamage result:', result);
                if (result.discarded || !result.active) continue;
                if ((result.result ?? 0) >= righteousFuryThreshold) {
                    // Righteous fury hit
                    const righteousFuryRoll = new Roll('1d5', {});
                    await righteousFuryRoll.evaluate();
                    this.righteousFury.push({ roll: righteousFuryRoll, effect: '' });

                    // DeathDealer
                    if (actionItem.isMelee) {
                        if (sourceActor.hasTalentFuzzyWords('Deathdealer', 'Melee')) {
                            this.modifiers['deathdealer'] = sourceActor.getCharacteristicFuzzy('Perception').bonus;
                        }
                    } else if (actionItem.isRanged) {
                        if (sourceActor.hasTalentFuzzyWords('Deathdealer', 'Ranged')) {
                            this.modifiers['deathdealer'] = sourceActor.getCharacteristicFuzzy('Perception').bonus;
                        }
                    }
                }

                if (attackData.rollData.hasAttackSpecial('Primitive')) {
                    const primitive = attackData.rollData.getAttackSpecial('Primitive');
                    const dieResult = result.result ?? 0;
                    if (dieResult > primitive.level) {
                        this.modifiers['primitive'] = primitive.level - dieResult;
                    }
                }

                if (attackData.rollData.hasAttackSpecial('Proven')) {
                    const proven = attackData.rollData.getAttackSpecial('Proven');
                    const dieResult = result.result ?? 0;
                    if (dieResult < proven.level) {
                        this.modifiers['proven'] = proven.level - dieResult;
                    }
                }
            }
        }

        if (actionItem.isMelee) {
            this.modifiers['strength bonus'] = sourceActor.getCharacteristicFuzzy('Strength').bonus;

            // Crushing Blow
            if (sourceActor.hasTalent('Crushing Blow')) {
                const wsBonus = sourceActor.getCharacteristicFuzzy('WeaponSkill').bonus;
                this.modifiers['crushing blow'] = Math.ceil(wsBonus / 2);
            }

            // Deathdealer
            if (sourceActor.hasTalentFuzzyWords(['Deathdealer', 'Melee'])) {
                const perBonus = sourceActor.getCharacteristicFuzzy('Perception').bonus;
                this.modifiers['deathdealer melee'] = Math.ceil(perBonus / 2);
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
                        await accurateRoll.evaluate();
                        this.modifiers['accurate'] = accurateRoll.total ?? 0;
                    }
                    if (attackData.rollData.dos >= 5) {
                        const accurateRoll = new Roll('1d10', {});
                        await accurateRoll.evaluate();
                        this.modifiers['accurate x 2'] = accurateRoll.total ?? 0;
                    }
                }
            }

            // Eye of Vengeance
            if (attackData.rollData.eyeOfVengeance) {
                this.modifiers['eye of vengeance'] = attackData.rollData.dos;
            }

            // Las Modes
            if (attackData.rollData.hasAttackSpecial('Overcharge')) {
                this.modifiers['overcharge'] = 1;
            } else if (attackData.rollData.hasAttackSpecial('Overload')) {
                this.modifiers['overload'] = 2;
            }

            // Maximal
            if (attackData.rollData.hasAttackSpecial('Maximal')) {
                const maximalRoll = new Roll('1d10', {});
                await maximalRoll.evaluate();
                this.modifiers['maximal'] = maximalRoll.total ?? 0;
            }

            // Mighty Shot
            if (sourceActor.hasTalent('Mighty Shot')) {
                const bsBonus = sourceActor.getCharacteristicFuzzy('ballisticSkill').bonus;
                this.modifiers['mighty shot'] = Math.ceil(bsBonus / 2);
            }

            // Deathdealer
            if (sourceActor.hasTalentFuzzyWords(['Deathdealer', 'Ranged'])) {
                const perBonus = sourceActor.getCharacteristicFuzzy('Perception').bonus;
                this.modifiers['deathdealer ranged'] = Math.ceil(perBonus / 2);
            }

            // Ammo
            calculateAmmoDamageBonuses(attackData as unknown as Parameters<typeof calculateAmmoDamageBonuses>[0], this);
        }

        calculateWeaponModifiersDamageBonuses(attackData as unknown as Parameters<typeof calculateWeaponModifiersDamageBonuses>[0], this);

        // Exotic quality damage bonuses (Force, Witch-Edge, Daemonbane)
        const exoticModifiers = calculateExoticQualityDamageModifiers({
            weapon: actionItem as unknown as Parameters<typeof calculateExoticQualityDamageModifiers>[0]['weapon'],
            actor: sourceActor as unknown as Parameters<typeof calculateExoticQualityDamageModifiers>[0]['actor'],
            target: attackData.damageData?.targetActor as Parameters<typeof calculateExoticQualityDamageModifiers>[0]['target'],
        });

        // Handle exotic modifiers - most are numeric, but Daemonbane is a dice formula
        for (const [key, value] of Object.entries(exoticModifiers)) {
            if (typeof value === 'string' && value.includes('d')) {
                // Daemonbane: "2d10" - roll additional dice
                const exoticRoll = new Roll(value, {});
                await exoticRoll.evaluate();
                this.modifiers[key] = exoticRoll.total ?? 0;
            } else if (typeof value === 'number') {
                // Force, Witch-Edge: numeric bonuses
                this.modifiers[key] = value;
            }
        }
    }

    async _calculatePenetration(attackData: AttackDataLike): Promise<void> {
        const actionItem = attackData.rollData.weapon ?? attackData.rollData.power;
        if (!actionItem) return;
        const sourceActor = attackData.rollData.sourceActor;

        const rollFormula = actionItem.system.effectivePenetration ?? actionItem.system.damage?.penetration ?? actionItem.system.penetration;
        if (typeof rollFormula === 'number' && Number.isInteger(rollFormula)) {
            this.penetration = rollFormula;
        } else if (rollFormula === '') {
            this.penetration = 0;
        } else {
            this.hasPenetrationRoll = true;
            try {
                const penRoll = new Roll(String(rollFormula), attackData.rollData) as unknown as Roll;
                this.penetrationRoll = penRoll;
                await penRoll.evaluate();
                this.penetration = penRoll.total ?? 0;
            } catch {
                ui.notifications.warn('Penetration formula failed - setting to 0');
                this.penetration = 0;
            }
        }

        if (actionItem.isMelee) {
            if (this.penetration && attackData.rollData.hasAttackSpecial('Lance')) {
                this.penetrationModifiers['lance'] = this.penetration * attackData.rollData.dos;
            }

            if (attackData.rollData.dos > 2 && attackData.rollData.hasAttackSpecial('Razer Sharp')) {
                this.penetrationModifiers['razer sharp'] = this.penetration;
            }

            if (attackData.rollData.action === 'All Out Attack' && sourceActor.hasTalent('Hammer Blow')) {
                const strBonus = sourceActor.getCharacteristicFuzzy('strength').bonus;
                this.penetrationModifiers['hammer blow'] = Math.ceil(strBonus / 2);
            }
        } else if (actionItem.isRanged) {
            if (attackData.rollData.hasAttackSpecial('Maximal')) {
                this.penetrationModifiers['maximal'] = 2;
            }

            // Las Modes
            if (attackData.rollData.hasAttackSpecial('Overload')) {
                this.penetrationModifiers['overload'] = 2;
            }

            // Ammo
            calculateAmmoPenetrationBonuses(attackData as unknown as Parameters<typeof calculateAmmoPenetrationBonuses>[0], this);
        }

        if (attackData.rollData.eyeOfVengeance) {
            this.penetrationModifiers['eye of vengeance'] = attackData.rollData.dos;
        }

        if (attackData.rollData.rangeName === 'Short Range' || attackData.rollData.rangeName === 'Point Blank') {
            if (attackData.rollData.hasAttackSpecial('Melta')) {
                this.penetrationModifiers['melta'] = this.penetration;
            }
        }

        // Quality-based penetration modifiers (Melta via weapon qualities)
        const qualityPenModifiers = calculateQualityPenetrationModifiers({
            weapon: actionItem as unknown as Parameters<typeof calculateQualityPenetrationModifiers>[0]['weapon'],
            rangeName: attackData.rollData.rangeName,
            basePenetration: this.penetration,
        });

        // Apply quality modifiers (merge with existing to avoid duplication)
        for (const [key, value] of Object.entries(qualityPenModifiers as Record<string, number>)) {
            const lowerKey = key.toLowerCase();
            // Only apply if not already applied via attackSpecials
            if (!this.penetrationModifiers[lowerKey]) {
                this.penetrationModifiers[key] = value;
            }
        }

        calculateWeaponModifiersPenetrationBonuses(attackData as unknown as Parameters<typeof calculateWeaponModifiersPenetrationBonuses>[0], this);
    }

    _calculateSpecials(attackData: AttackDataLike): void {
        const actionItem = attackData.rollData.weapon ?? attackData.rollData.power;
        if (!actionItem) return;
        const sourceActor = attackData.rollData.sourceActor;

        this.damageType = actionItem.system.damage?.type ?? actionItem.system.damageType ?? 'Impact';

        if (attackData.rollData.action === 'All Out Attack' && sourceActor.hasTalent('Hammer Blow')) {
            if (!attackData.rollData.attackSpecials.find((s) => s.name === 'Concussive')) {
                attackData.rollData.attackSpecials.push({
                    name: 'Concussive',
                    level: 2,
                });
            }
        }

        if (actionItem.isRanged) {
            calculateAmmoSpecials(attackData as unknown as Parameters<typeof calculateAmmoSpecials>[0], this);
        }

        for (const special of attackData.rollData.attackSpecials) {
            switch (special.name.toLowerCase()) {
                case 'blast':
                    this.addEffect(special.name, `Everyone within ${special.level ?? 0}m of the location is hit!`);
                    break;
                case 'concussive':
                    this.addEffect(
                        special.name,
                        `Target must pass Toughness test with ${
                            (special.level ?? 0) * -10
                        } or be Stunned for 1 round per DoF. If the attack did more damage than the targets Strength Bonus, it is knocked Prone!`,
                    );
                    break;
                case 'corrosive':
                    this.addEffect(
                        special.name,
                        `The targets armor melts with [[1d10]] of armour being destroyed! Additional damage is dealt as wounds and not reduced by toughness.`,
                    );
                    break;
                case 'crippling':
                    this.addEffect(
                        special.name,
                        `If the target suffers a wound it is considered crippled. If they take more than a half action on a turn, they suffer ${
                            special.level ?? 0
                        } damage not reduced by Armour or Toughness!`,
                    );
                    break;
                case 'felling':
                    this.addEffect(special.name, `The targets unnatural toughness is reduced by ${special.level ?? 0} while calculating wounds!`);
                    break;
                case 'flame':
                    this.addEffect(special.name, `The target must make an Agility test or be set on fire!`);
                    break;
                case 'graviton':
                    this.addEffect(special.name, `This attack deals additional damage equal to the targets Armour points on the struck location!`);
                    break;
                case 'hallucinogenic':
                    this.addEffect(
                        special.name,
                        `A creature stuck by this much make a toughness test with ${(special.level ?? 0) * -10} or suffer a delusion!`,
                    );
                    break;
                case 'haywire':
                    this.addEffect(special.name, `Everything within ${(special.level ?? 0) * -10}m suffers the Haywire Field at strength [[1d10]]!`);
                    break;
                case 'indirect': {
                    const bs = sourceActor.getCharacteristicFuzzy('ballisticSkill').bonus;
                    this.addEffect(special.name, `The attack deviates [[ 1d10 - ${bs}]]m (minimum of 0m) off course to the ${scatterDirection()}!`);
                    break;
                }
                case 'shocking':
                    this.addEffect(
                        special.name,
                        `Target must pass a Challenging (+0) Toughness test. If he fails, he suffers 1 level of Fatigue and is Stunned for a number of rounds equal to half of his degrees of failure (rounding up).`,
                    );
                    break;
                case 'snare':
                    this.addEffect(
                        special.name,
                        `Target must pass Agility test with ${
                            (special.level ?? 0) * -10
                        } or become immobilised. An immobilised target can attempt no actions other than trying to escape. As a Full Action, they can make a Strength or Agility test with ${
                            (special.level ?? 0) * -10
                        } to burst free or wriggle out.`,
                    );
                    break;
                case 'toxic':
                    this.addEffect(
                        special.name,
                        `Target must pass Toughness test with ${(special.level ?? 0) * -10} or suffer [[1d10]] ${
                            actionItem.system.damageType ?? 'Impact'
                        } damage.`,
                    );
                    break;
                case 'warp':
                    this.addEffect(special.name, `Ignores mundane armor and cover! Holy armor negates this.`);
                    break;
            }
        }
    }

    addEffect(name: string, effect: string): void {
        this.effects.push({
            name: name,
            effect: effect,
        });
    }
}

export class WeaponDamageData extends DamageData {
    constructor() {
        super();
        this.template = 'systems/wh40k-rpg/templates/chat/weapon-roll-chat.hbs';
    }
}

export class PsychicDamageData extends DamageData {
    constructor() {
        super();
        this.template = 'systems/wh40k-rpg/templates/chat/weapon-roll-chat.hbs';
    }
}

export function scatterDirection(): string {
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
