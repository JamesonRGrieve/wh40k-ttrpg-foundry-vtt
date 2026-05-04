import { DHTargetedActionManager } from '../actions/targeted-action-manager.ts';
import { WH40KBaseActor } from './base-actor.ts';

export class WH40KVehicle extends WH40KBaseActor {
    async _preCreate(data: Record<string, unknown>, options: Record<string, unknown>, user: unknown): Promise<void> {
        await super._preCreate(data, options, user);
        const initData = {
            'token.bar1': { attribute: 'integrity' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'token.name': data.name as string,
        };
        this.updateSource(initData as Record<string, unknown>);
    }

    prepareData(): void {
        super.prepareData();
    }

    get faction(): string {
        return this.system.faction as string;
    }
    get subfaction(): string {
        return this.system.subfaction as string;
    }
    get subtype(): string {
        return this.system.type as string;
    }
    get threatLevel(): string {
        return String(this.system.threatLevel);
    }
    get armour(): Record<string, { value: number; total: number }> {
        return this.system.armour as Record<string, { value: number; total: number }>;
    }
    get front(): number {
        return (this.system.armour as Record<string, { value: number; total: number }>).front.value;
    }
    get side(): number {
        return (this.system.armour as Record<string, { value: number; total: number }>).side.value;
    }
    get rear(): number {
        return (this.system.armour as Record<string, { value: number; total: number }>).rear.value;
    }
    get availability(): string {
        return this.system.availability as string;
    }
    get manoeuverability(): number {
        return this.system.manoeuverability as number;
    }
    get carryingCapacity(): number {
        return this.system.carryingCapacity as number;
    }
    get integrity(): { value: number; max: number } {
        return this.system.integrity as { value: number; max: number };
    }
    get speed(): number {
        return this.system.speed as number;
    }
    get crew(): Record<string, unknown> {
        return this.system.crew as Record<string, unknown>;
    }
    get vehicleClass(): string {
        return this.system.vehicleClass as string;
    }
    get size(): number {
        return Number(this.system.size);
    }

    async rollItem(itemId: string): Promise<void> {
        const item = this.items.get(itemId);
        if (!item) return;

        const character = game.user.character;
        if (!character) {
            ui.notifications.warn("Vehicle items are rolled using the current users' character. However, no character found.");
            return;
        }

        game.wh40k.log(`Vehicle ${this.name as string} is rolling ${item.name as string} for character ${character.name as string}`);
        switch (item.type) {
            case 'weapon':
                await DHTargetedActionManager.performWeaponAttack(character, null, item);
                return;
            default:
                ui.notifications.warn(`No actions implemented for item type: ${item.type}`);
                return;
        }
    }
}
