import { WH40KBaseActor } from './base-actor.ts';
import { DHTargetedActionManager } from '../actions/targeted-action-manager.ts';

export class WH40KVehicle extends WH40KBaseActor {
    [key: string]: any;
    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);
        const initData = {
            'token.bar1': { attribute: 'integrity' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'token.name': data.name,
        };
        // @ts-expect-error - type mismatch
        this.updateSource(initData);
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
    get armour() {
        return this.system.armour;
    }
    get front() {
        return this.system.armour.front.value;
    }
    get side() {
        return this.system.armour.side.value;
    }
    get rear() {
        return this.system.armour.rear.value;
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
    get vehicleClass() {
        return this.system.vehicleClass;
    }
    get size() {
        return this.system.size;
    }

    async rollItem(itemId) {
        const item = this.items.get(itemId);
        const character = game.user.character;
        if (!character) {
            (ui.notifications as any).warn("Vehicle items are rolled using the current users' character. However, no character found.");
            return;
        }

        game.wh40k.log(`Vehicle ${this.name} is rolling ${item.name} for character ${character.name}`);
        switch (item.type) {
            // @ts-expect-error - TS2678
            case 'weapon':
                await DHTargetedActionManager.performWeaponAttack(character, null, item);
                return;
            default:
                return (ui.notifications as any).warn(`No actions implemented for item type: ${item.type}`);
        }
    }
}
