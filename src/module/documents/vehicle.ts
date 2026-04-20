import { DHTargetedActionManager } from '../actions/targeted-action-manager.ts';
import { WH40KBaseActor } from './base-actor.ts';

export class WH40KVehicle extends WH40KBaseActor {
    async _preCreate(data, options, user): Promise<unknown> {
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

    prepareData(): void {
        super.prepareData();
    }

    get faction(): string {
        return this.system.faction;
    }
    get subfaction(): string {
        return this.system.subfaction;
    }
    get subtype(): string {
        return this.system.type;
    }
    get threatLevel(): string {
        return this.system.threatLevel;
    }
    get armour(): Record<string, { value: number; total: number }> {
        return this.system.armour;
    }
    get front(): number {
        return this.system.armour.front.value;
    }
    get side(): number {
        return this.system.armour.side.value;
    }
    get rear(): number {
        return this.system.armour.rear.value;
    }
    get availability(): string {
        return this.system.availability;
    }
    get manoeuverability(): number {
        return this.system.manoeuverability;
    }
    get carryingCapacity(): number {
        return this.system.carryingCapacity;
    }
    get integrity(): { value: number; max: number } {
        return this.system.integrity;
    }
    get speed(): number {
        return this.system.speed;
    }
    get crew(): Record<string, unknown> {
        return this.system.crew;
    }
    get vehicleClass(): string {
        return this.system.vehicleClass;
    }
    get size(): number {
        return this.system.size;
    }

    async rollItem(itemId): Promise<void> {
        const item = this.items.get(itemId);
        const character = game.user.character;
        if (!character) {
            ui.notifications.warn("Vehicle items are rolled using the current users' character. However, no character found.");
            return;
        }

        game.wh40k.log(`Vehicle ${this.name as string} is rolling ${item.name as string} for character ${character.name as string}`);
        switch (item.type) {
            // @ts-expect-error - TS2678
            case 'weapon':
                await DHTargetedActionManager.performWeaponAttack(character, null, item);
                return;
            default:
                ui.notifications.warn(`No actions implemented for item type: ${item.type}`);
                return;
        }
    }
}
