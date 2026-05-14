import { DHTargetedActionManager } from '../actions/targeted-action-manager.ts';
import { WH40KBaseActor } from './base-actor.ts';

type VehicleSystemData = WH40KBaseActor['system'] & {
    faction: string;
    subfaction: string;
    type: string;
    threatLevel: string;
    armour: Record<string, { value: number; total: number }> & {
        front: { value: number; total: number };
        side: { value: number; total: number };
        rear: { value: number; total: number };
    };
    availability: string;
    manoeuverability: number;
    carryingCapacity: number;
    integrity: { value: number; max: number };
    speed: number;
    vehicleClass: string;
    crew: {
        required: number;
        notes: string;
    };
    size: number;
};

export class WH40KVehicle extends WH40KBaseActor {
    declare system: VehicleSystemData;

    protected override async _preCreate(data: never, options: never, user: never): Promise<boolean | undefined> {
        await super._preCreate(data, options, user);
        const dataWithName = data as { name?: string } | undefined;
        // eslint-disable-next-line no-restricted-syntax -- boundary: updateSource expects typed token delta; Record<string,unknown> is the only viable shape for dot-notation token update paths
        const initData: Record<string, unknown> = {
            'token.bar1': { attribute: 'integrity' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'token.name': dataWithName?.name,
        };
        this.updateSource(initData);
        return undefined;
    }

    override prepareData(): void {
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
    get crew(): { required: number; notes: string } {
        return this.system.crew;
    }
    get vehicleClass(): string {
        return this.system.vehicleClass;
    }
    override get size(): number {
        return this.system.size;
    }

    override async rollItem(itemId: string): Promise<void> {
        // Foundry's base rollItem opens a roll dialog; for vehicles we delegate to the character
        await Promise.resolve();
        const item = this.items.get(itemId);
        if (item === undefined) {
            // eslint-disable-next-line no-restricted-syntax -- string is a localization key passed via { localize: true }
            ui.notifications.warn('WH40K.Vehicle.Errors.ItemNotFound', { localize: true });
            return;
        }
        const character = game.user.character;
        if (character === null) {
            // eslint-disable-next-line no-restricted-syntax -- string is a localization key passed via { localize: true }
            ui.notifications.warn('WH40K.Vehicle.Errors.NoCharacterForRoll', { localize: true });
            return;
        }

        game.wh40k.log(`Vehicle ${this.name} is rolling ${item.name} for character ${character.name}`);
        if (item.type === 'weapon') {
            DHTargetedActionManager.performWeaponAttack(character, null, item);
        } else {
            ui.notifications.warn(game.i18n.format('WH40K.Vehicle.Errors.NoActionForItemType', { type: item.type }));
        }
    }
}
