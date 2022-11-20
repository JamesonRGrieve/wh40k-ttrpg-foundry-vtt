import { PsychicRollData, RollData, WeaponRollData } from './roll-data.mjs';
import { Hit, PsychicDamageData, WeaponDamageData } from './damage-data.mjs';
import { getDegree, roll1d100, sendActionDataToChat, uuid } from './roll-helpers.mjs';
import { useAmmo } from '../rules/ammo.mjs';
import { DHBasicActionManager } from '../actions/basic-action-manager.mjs';

export class ActionData {
    id = uuid();
    template = '';
    hasDamage = false;
    rollData;
    damageData;
    effects = [];
    effectOutput = [];

    async _calculateHit() {
        this.rollData.roll = await roll1d100();
        let rollTotal = this.rollData.roll.total;
        const target = this.rollData.modifiedTarget;
        this.rollData.success = rollTotal === 1 || (rollTotal <= target && rollTotal !== 100);
    }

    async calculateSuccessOrFailure() {
        await this._calculateHit();
        let actionItem = this.rollData.weapon ?? this.rollData.power;

        // Action Item
        if (actionItem) {
            if (actionItem.isMelee) {
                if (!this.rollData.success) {
                    // Re-Roll Attack for Blademaster
                    if (this.rollData.sourceActor.hasTalent('Blademaster')) {
                        this.effects.push('blademaster');
                        this.rollData.previousRolls.push(this.rollData.roll);
                        await this._calculateHit();
                    }
                }
            } else if (actionItem.isRanged) {
                const rollTotal = this.rollData.roll.total;
                if (rollTotal > 91 && this.rollData.hasAttackSpecial('Overheats')) {
                    this.effects.push('overheat');
                }
                if ((!this.rollData.hasAttackSpecial('Reliable') && rollTotal > 96) || rollTotal === 100) {
                    this.effects.push('jam');
                    this.rollData.success = false;
                }
            }
        }


        if (this.rollData.success) {
            this.rollData.dof = 0;
            this.rollData.dos = 1 + getDegree(this.rollData.modifiedTarget, this.rollData.roll.total);

            if (actionItem) {
                if (this.rollData.action === 'Semi-Auto Burst' || this.rollData.action === 'Swift Attack' || actionItem.isPsychicBarrage) {
                    // Possible Semi Rate
                    this.damageData.additionalHits += Math.floor((this.rollData.dos - 1) / 2);

                    // Storm
                    if (this.rollData.hasAttackSpecial('Storm')) {
                        this.damageData.additionalHits *= 2;
                    }

                    // But Max at fire rate (Ammo available / ammo per shot || rate of fire - whichever is lower)
                    if (actionItem.isRanged && this.damageData.additionalHits > this.rollData.fireRate - 1) {
                        this.damageData.additionalHits = this.rollData.fireRate - 1;
                    }
                } else if (this.rollData.action === 'Full Auto Burst' || this.rollData.action === 'Lightning Attack' || actionItem.isPsychicStorm) {
                    // Possible Full Rate
                    this.damageData.additionalHits += Math.floor(this.rollData.dos - 1);

                    // Storm
                    if (this.rollData.hasAttackSpecial('Storm')) {
                        this.damageData.additionalHits *= 2;
                    }

                    // But Max at weapon rate
                    if (actionItem.isRanged && this.damageData.additionalHits > this.rollData.fireRate - 1) {
                        this.damageData.additionalHits = this.rollData.fireRate - 1;
                    }
                }
            }

            if (this.rollData.dos > 1 && this.rollData.hasAttackSpecial('Twin-Linked')) {
                this.damageData.additionalHits++;
            }
        } else {
            this.rollData.dos = 0;
            this.rollData.dof = 1 + getDegree(this.rollData.roll.total, this.rollData.modifiedTarget);

            if (this.rollData.roll.total === 100) {
                this.effects.push('auto-failure');
            }
        }
    }

    async calculateHits() {
        let lastLocation = '';
        if (this.rollData.success) {
            let hit = await Hit.createHit(this);
            lastLocation = hit.location;
            this.damageData.hits.push(hit);

            for (let i = 0; i < this.damageData.additionalHits; i++) {
                hit = await Hit.createHit(this, lastLocation);
                lastLocation = hit.location;
                this.damageData.hits.push(hit);
            }
        }
    }

    addEffect(name, effect) {
        this.effectOutput.push({
            name: name,
            effect: effect
        })
    }

    async createEffectData() {
        for (const effect of this.effects) {
            switch(effect){
                case 'auto-failure':
                    this.addEffect('Auto Failure', `The roll resulted in an automatic failure!`);
                    break;
                case 'blademaster':
                    this.addEffect('Blademaster', `Original roll of ${this.rollData.previousRolls[0].total} rerolled.`);
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

    async performAttackAndSendToChat() {
        // Store Roll Information
        DHBasicActionManager.storeActionData(this);

        // Finalize Modifiers
        await this.rollData.calculateTotalModifiers();

        // Determine Success/Hits
        await this.calculateSuccessOrFailure();

        // Calculate Hits
        await this.calculateHits();

        // Create Specials
        await this.createEffectData();

        game.dh.log('Perform Attack', this);

        // Expend Ammo
        await useAmmo(this);

        // Render Attack Roll
        this.rollData.render = await this.rollData.roll.render();
        this.template = this.rollData.template;

        // Send to Chat
        await sendActionDataToChat(this);
    }
}

export class WeaponAttackData extends ActionData {
    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/action-roll-chat.hbs';
        this.hasDamage = true;
        this.rollData = new WeaponRollData();
        this.damageData = new WeaponDamageData();
    }
}

export class PsychicAttackData extends ActionData {
    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/action-roll-chat.hbs';
        this.hasDamage = true;
        this.rollData = new PsychicRollData();
        this.damageData = new PsychicDamageData();
    }
}

export class PsychicSkillData extends ActionData {
    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/action-roll-chat.hbs';
        this.hasDamage = false;
        this.rollData = new PsychicRollData();
    }
}

export class SimpleSkillData extends ActionData {
    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/simple-roll-chat.hbs';
        this.hasDamage = false;
        this.rollData = new RollData();
    }
}
