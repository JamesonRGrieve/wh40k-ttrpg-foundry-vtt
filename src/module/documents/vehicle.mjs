import { DarkHeresyBaseActor } from './base-actor.mjs';
import { DHTargetedActionManager } from '../actions/targeted-action-manager.mjs';

export class DarkHeresyVehicle extends DarkHeresyBaseActor {

    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);
        let initData = {
            "token.bar1": { "attribute": "integrity" },
            "token.displayName": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            "token.displayBars": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            "token.disposition": CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            "token.name": data.name
        }
        this.updateSource(initData)
    }

    async prepareData() {
        await super.prepareData();
    }

    get faction() {
        return this.system.faction;
    }
    get subfaction() {
        return this.system.subfaction;
    }
    get subtype() {
        return this.system.type;
    }
    get threatLevel() {
        return this.system.threatLevel;
    }
    get front() {
        return this.system.front;
    }
    get side() {
        return this.system.side;
    }
    get rear() {
        return this.system.rear;
    }
    get availability() {
        return this.system.availability;
    }
    get manoeuverability() {
        return this.system.manoeuverability;
    }
    get carryingCapacity() {
        return this.system.carryingCapacity;
    }
    get integrity() {
        return this.system.integrity;
    }
    get speed() {
        return this.system.speed;
    }
    get crew() {
        return this.system.crew;
    }

    async rollItem(itemId) {
        const item = this.items.get(itemId);
        const character = game.user.character;
        if(!character) {
            ui.notifications.warn('Vehicle items are rolled using the current users\' character. However, no character found.');
            return;
        }

        game.dh.log(`Vehicle ${this.name} is rolling ${item.name} for character ${character.name}`);
        switch (item.type) {
            case 'weapon':
                await DHTargetedActionManager.performWeaponAttack(character, null, item);
                return;
            default:
                return ui.notifications.warn(`No actions implemented for item type: ${item.type}`);
        }
    }

}
