import { DHTargetedActionManager } from '../actions/targeted-action-manager.ts';
import { occupantCandidateActors } from '../rules/vehicle-embark.ts';
import { occupantsOf } from '../rules/vehicle-occupancy.ts';
import { hasAuthoredFootprint, prototypeTokenFootprintUpdate } from '../utils/token-footprint.ts';
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
        // eslint-disable-next-line no-restricted-syntax -- boundary: `_preCreate` data is typed `never` by the framework; `system.size` stays unknown until `tokenFootprintForSize` narrows it
        const dataWithName = data as { name?: string; img?: string; system?: { size?: unknown }; prototypeToken?: { texture?: { src?: string } } } | undefined;
        // eslint-disable-next-line no-restricted-syntax -- boundary: updateSource expects typed token delta; Record<string,unknown> is the only viable shape for dot-notation token update paths
        const initData: Record<string, unknown> = {
            'prototypeToken.bar1': { attribute: 'integrity' },
            'prototypeToken.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'prototypeToken.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'prototypeToken.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'prototypeToken.name': dataWithName?.name,
            // Footprint from the shared size ladder — an Enormous vehicle drops
            // 2x2, not as a 1x1 glyph (#500). Authored dimensions win.
            ...(hasAuthoredFootprint(data) ? {} : prototypeTokenFootprintUpdate(dataWithName?.system?.size)),
        };

        // Mirror the portrait onto the token texture when the actor does not
        // author one, so a dropped vehicle shows its art rather than the
        // system's default token image (#500). Vehicles are `img`-only — no
        // token frame — per the physical-object image convention.
        const authoredTokenSrc = dataWithName?.prototypeToken?.texture?.src;
        const portrait = dataWithName?.img;
        if ((authoredTokenSrc === undefined || authoredTokenSrc === '') && portrait !== undefined && portrait !== '') {
            initData['prototypeToken.texture.src'] = portrait;
        }

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
        await Promise.resolve();
        const item = this.items.get(itemId);
        if (item === undefined) {
            // eslint-disable-next-line no-restricted-syntax -- string is a localization key passed via { localize: true }
            ui.notifications.warn('WH40K.Vehicle.Errors.ItemNotFound', { localize: true });
            return;
        }
        if (item.type !== 'weapon') {
            ui.notifications.warn(game.i18n.format('WH40K.Vehicle.Errors.NoActionForItemType', { type: item.type }));
            return;
        }

        // RAW: a vehicle has no inherent combat skill — its weapon is fired by the
        // OPERATOR crewing it, using THEIR Ballistic/Weapon Skill (this is why the
        // vehicle's own characteristics are authored `source: "pilot"` at 0). Resolve
        // the operator from the crew and attack as them; do NOT roll against the
        // vehicle's zeroed pilot-sourced stats.
        const operator = this.resolveWeaponOperator();
        if (operator === null) {
            // eslint-disable-next-line no-restricted-syntax -- string is a localization key passed via { localize: true }
            ui.notifications.warn('WH40K.Vehicle.Errors.NoOperator', { localize: true });
            return;
        }

        game.wh40k.log(`Vehicle ${this.name} weapon ${item.name} fired by operator ${operator.name}`);
        DHTargetedActionManager.performWeaponAttack(operator, null, item);
    }

    /**
     * The character operating this vehicle's weapons, whose Ballistic/Weapon Skill
     * the attack uses. Prefers an embarked gunner, then driver, then any crew member;
     * falls back to the controlling player's character. `null` when nobody is crewing
     * it and no character is assigned — the attack cannot resolve a skill to roll.
     * @returns {WH40KBaseActor | null}  The operating character, or null.
     */
    resolveWeaponOperator(): WH40KBaseActor | null {
        if (this.uuid !== null) {
            const crew = occupantsOf(this.uuid, occupantCandidateActors());
            const inSeat = (role: string): WH40KBaseActor | undefined => crew.find((o) => o.role === role)?.actor;
            const operator = inSeat('gunner') ?? inSeat('driver') ?? inSeat('crew');
            if (operator !== undefined) return operator;
        }
        return game.user.character;
    }
}
