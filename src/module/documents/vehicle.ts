import { SystemConfigRegistry } from '../config/game-systems/index.ts';
import type { AggregatedVehicleTraitEffects } from '../data/shared/vehicle-trait-effects-template.ts';
import type { SkillRollOptions } from '../rolls/action-data.ts';
import { occupantCandidateActors } from '../rules/vehicle-embark.ts';
import { occupantsOf } from '../rules/vehicle-occupancy.ts';
import {
    VEHICLE_TRAIT_TEST_BUCKET,
    type VehicleTestCategory,
    vehicleTester,
    vehicleTestSkill,
    vehicleTraitTestComponents,
} from '../rules/vehicle-trait-tests.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';
import { hasAuthoredFootprint, prototypeTokenFootprintUpdate } from '../utils/token-footprint.ts';
import { WH40KBaseActor } from './base-actor.ts';
import { documentActions } from './document-actions.ts';

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
    /** The traits' structured effects, aggregated by the craft DataModel on every prepare. */
    traitEffects: AggregatedVehicleTraitEffects;
};

/** One specialisation entry of a specialist skill, as the tester's sheet carries it. */
interface TesterSkillEntry {
    current?: number | undefined;
}

/**
 * The slice of a character the vehicle asks to make a test: PCs and NPCs both
 * roll a skill with a caller's sourced modifiers; a PC's specialist skill carries
 * its specialisations as entries.
 */
interface VehicleTesterActor {
    readonly skills?: Readonly<Record<string, { entries?: readonly TesterSkillEntry[] | undefined }>> | undefined;
    rollSkill: (skillName: string, speciality?: number, options?: SkillRollOptions) => Promise<void> | void;
}

/** Whether a document exposes the tester surface (both PC and NPC documents do). */
function isVehicleTester(actor: WH40KBaseActor): actor is WH40KBaseActor & VehicleTesterActor {
    return typeof (actor as Partial<VehicleTesterActor>).rollSkill === 'function';
}

/**
 * The tester's specialisation to roll for a specialist skill: the one with the
 * highest target, so a driver trained in one form of Operate tests with it.
 * `undefined` for a plain skill.
 */
function bestSpecialisation(entries: readonly TesterSkillEntry[] | undefined): number | undefined {
    if (entries === undefined || entries.length === 0) return undefined;
    let best = 0;
    entries.forEach((entry, index) => {
        if ((entry.current ?? 0) > (entries[best]?.current ?? 0)) best = index;
    });
    return best;
}

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
        documentActions().performWeaponAttack(operator, item);
    }

    /**
     * The character operating this vehicle's weapons, whose Ballistic/Weapon Skill
     * the attack uses. Prefers an embarked gunner, then driver, then any crew member;
     * falls back to the controlling player's character. `null` when nobody is crewing
     * it and no character is assigned — the attack cannot resolve a skill to roll.
     * @returns {WH40KBaseActor | null}  The operating character, or null.
     */
    /**
     * Have the crew make a vehicle test (content#28): a repair, an Operate test in
     * difficult terrain or to Floor It!, or a Command test. The character in the
     * seat the test belongs to rolls the category's skill, and each of this
     * vehicle's traits that modifies that test adds a named row to the roll, so the
     * card shows which trait gave what. Warns when nobody aboard can make it.
     * @param category  The test category.
     */
    async rollVehicleTest(category: VehicleTestCategory): Promise<void> {
        const tester = this.resolveVehicleTester(category);
        if (tester === null || !isVehicleTester(tester)) {
            ui.notifications.warn(game.i18n.localize('WH40K.Vehicle.TraitTests.NoTester'));
            return;
        }
        const visible = SystemConfigRegistry.getOrNull(firstSystemId(tester) ?? '')?.getVisibleSkills();
        const skill = vehicleTestSkill(category, (key) => visible?.has(key) ?? tester.skills?.[key] !== undefined);
        const components = vehicleTraitTestComponents(this.system.traitEffects.testModifiers, category, (trait) =>
            game.i18n.format('WH40K.Vehicle.TraitTests.Source', { trait }),
        );
        await tester.rollSkill(skill, bestSpecialisation(tester.skills?.[skill]?.entries), {
            sourcedModifiers: { bucket: VEHICLE_TRAIT_TEST_BUCKET, components },
        });
    }

    /**
     * The character who makes a vehicle test of `category`: the occupant in the
     * category's seat (the driver drives and commands, crew repair), falling back to
     * the controlling player's character. `null` when nobody can.
     * @param category  The test category.
     */
    resolveVehicleTester(category: VehicleTestCategory): WH40KBaseActor | null {
        if (this.uuid !== null) {
            const aboard = vehicleTester(category, occupantsOf(this.uuid, occupantCandidateActors()));
            if (aboard !== undefined) return aboard;
        }
        return game.user.character;
    }

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
