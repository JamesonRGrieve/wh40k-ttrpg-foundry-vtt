import { aimModifiers } from '../rules/aim.ts';
import { calculateAmmoAttackBonuses, calculateAmmoInformation } from '../rules/ammo.ts';
import { calculateAttackSpecialAttackBonuses, updateAttackSpecials } from '../rules/attack-specials.ts';
import { calculateCombatActionModifier, updateAvailableCombatActions } from '../rules/combat-actions.ts';
import { WH40K } from '../rules/config.ts';
import { rollDifficulties } from '../rules/difficulties.ts';
import { hitDropdown } from '../rules/hit-locations.ts';
import { calculatePsychicPowerRange, calculateWeaponRange } from '../rules/range.ts';
import { calculateWeaponModifiersAttackBonuses, updateWeaponModifiers } from '../rules/weapon-modifiers.ts';
import { getWeaponTrainingModifier } from '../rules/weapon-training.ts';
import { WH40KBaseActor } from '../documents/base-actor.ts';
import { WH40KItem } from '../documents/item.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';

/**
 * Base class for all roll-related data
 */
export class RollData {
    difficulties: Record<string, string> = rollDifficulties();
    aims: Record<string, string> = aimModifiers();
    locations: Record<string, string> = hitDropdown();
    lasModes: string[] = (WH40K.combat as any).las_fire_modes;

    // Chat Controls
    ignoreModifiers: boolean = false;
    ignoreDegrees: boolean = false;
    ignoreSuccess: boolean = false;
    ignoreControls: boolean = false;
    ignoreDamage: boolean = false;

    sourceActor: WH40KBaseActor | null = null;
    targetActor: WH40KBaseActor | null = null;

    maxRange: number = 0;
    distance: number = 0;
    rangeName: string = '';
    rangeBonus: number = 0;

    combatActionInformation: Record<string, any> = {};
    actions: Record<string, any> = {};
    action: string = '';

    baseTarget: number = 0;
    baseChar: string = '';

    isOpposed: boolean = false;
    opposedTarget: number = 0;
    opposedChar: string = '';
    opposedSuccess: boolean = false;
    opposedDof: number = 0;
    opposedDos: number = 0;
    opposedRoll: Roll | null = null;

    baseAim: number = 0;
    modifiers: Record<string, number> = {
        difficulty: 0,
        modifier: 0,
        aim: 0,
    };
    specialModifiers: Record<string, number> = {};
    modifierTotal: number = 0;
    hasEyeOfVengeanceAvailable: boolean = false;
    eyeOfVengeance: boolean = false;

    attackSpecials: any[] = [];
    roll: Roll | null = null;
    render: string | null = null;
    previousRolls: Roll[] = [];
    automatic: boolean = false;
    success: boolean = false;
    dos: number = 0;
    dof: number = 0;

    // For name getter compatibility
    weapon?: WH40KItem;
    power?: WH40KItem;

    get showDamage(): boolean {
        // @ts-expect-error - isThrown on WeaponRollData
        return this.success || this.isThrown;
    }

    reset(): void {
        this.automatic = false;
        this.success = false;
        this.opposedSuccess = false;
    }

    nameOverride?: string;
    get name(): string {
        if (this.nameOverride) return this.nameOverride;

        const actionItem = this.weapon ?? this.power;
        if (actionItem) return actionItem.name ?? '';

        return '';
    }

    get effectString(): string {
        const actionItem = this.weapon ?? this.power;
        if (!actionItem) return '';

        const str: string[] = [];

        const ammoName = (actionItem.system as { loadedAmmo?: { name: string } })?.loadedAmmo?.name;
        if (ammoName) {
            str.push(ammoName);
        }

        const specials = this.attackSpecials.map((s: { name: string }) => s.name).join(',');
        if (specials) {
            str.push(specials);
        }

        const weaponRollData = this as unknown as WeaponRollData;
        if (typeof weaponRollData.hasWeaponModification === 'function') {
            const mods = weaponRollData.weaponModifications?.map((m: { name: string }) => m.name).join(',');
            if (mods) {
                str.push(mods);
            }
        }
        return str.join(' | ');
    }

    get modifiedTarget(): number {
        return this.baseTarget + this.modifierTotal;
    }

    get activeModifiers(): Record<string, number> {
        const modifiers: Record<string, number> = {};
        for (const m of Object.keys(this.modifiers)) {
            try {
                const value = typeof this.modifiers[m] === 'string' ? Number.parseInt(this.modifiers[m]) : this.modifiers[m];
                if (value !== 0) {
                    modifiers[m.toUpperCase()] = value;
                }
            } catch (err) {
                (game as any).wh40k.error('Error while calculate roll data modifiers:', err);
            }
        }
        return modifiers;
    }

    hasAttackSpecial(special: string): boolean {
        return !!this.attackSpecials.find((s) => s.name === special);
    }

    getAttackSpecial(special: string): any {
        return this.attackSpecials.find((s) => s.name === special);
    }

    modifiersToRollData(): { formula: string; params: Record<string, number> } {
        let formula = '0 ';
        const rollParams: Record<string, number> = {};
        for (const modifier of Object.keys(this.modifiers)) {
            if (this.modifiers[modifier] !== 0) {
                if (this.modifiers[modifier] >= 0) {
                    formula += ` + @${modifier}`;
                } else {
                    formula += ` - @${modifier}`;
                }
                rollParams[modifier] = Math.abs(this.modifiers[modifier]);
            }
        }
        return {
            formula: formula,
            params: rollParams,
        };
    }

    async calculateTotalModifiers(): Promise<void> {
        const rollDetails = this.modifiersToRollData();
        try {
            const roll = new Roll(rollDetails.formula, rollDetails.params);
            await roll.evaluate();
            if (roll.total > 60) {
                this.modifierTotal = 60;
            } else if (roll.total < -60) {
                this.modifierTotal = -60;
            } else {
                this.modifierTotal = roll.total;
            }
        } catch {
            this.modifierTotal = 0;
        }
    }
}

export class WeaponRollData extends RollData {
    weapons: WH40KItem[] = [];
    declare weapon: WH40KItem;
    weaponSelect: boolean = false;

    weaponModifications: any[] = [];
    isCalledShot: boolean = false;
    calledShotLocation: string | undefined;
    usesAmmo: boolean = false;
    ammoText: string = '';
    ammoPerShot: number = 1;
    fireRate: number = 1;
    ammoUsed: number = 0;
    weaponModifiers: Record<string, number> = {};

    canAim: boolean = true;
    isKnockDown: boolean = false;
    isFeint: boolean = false;
    isStun: boolean = false;
    isThrown: boolean = false;
    isSpray: boolean = false;
    isLasWeapon: boolean = false;
    lasMode: string = 'Standard';

    template: string;

    constructor() {
        super();
        this.template = 'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs';
    }

    hasWeaponModification(special: string): boolean {
        return !!this.weaponModifications.find((s) => s.name === special);
    }

    getWeaponModification(special: string): any {
        return this.weaponModifications.find((s) => s.name === special);
    }

    async update(): Promise<void> {
        const weaponSystem = this.weapon.system as { attackBonus?: number; type?: string; usesAmmo?: boolean };
        if (weaponSystem.attackBonus) {
            this.modifiers['attack'] = weaponSystem.attackBonus;
        }

        // Check weapon training
        if (this.sourceActor) {
            const trainingModifier = getWeaponTrainingModifier(this.sourceActor, this.weapon);
            if (trainingModifier !== 0) {
                this.modifiers['weapon-training'] = trainingModifier;
            }
        }

        this.canAim = this.action !== 'All Out Attack';
        this.isLasWeapon = weaponSystem.type === 'Las';
        this.isSpray = this.hasAttackSpecial('Spray');
        this.isStun = this.action === 'Stun';
        this.isFeint = this.action === 'Feint';
        this.isKnockDown = this.action === 'Knock Down';

        this.ignoreModifiers = this.isSpray || this.isStun;
        this.ignoreDegrees = this.isSpray || this.isStun;
        this.ignoreSuccess = this.isSpray;
        this.ignoreControls = this.isFeint || this.isStun || this.isKnockDown;
        this.ignoreDamage = this.isStun || this.isFeint || this.isKnockDown;
        this.isThrown = (this.weapon as { isThrown?: boolean }).isThrown ?? false;

        this.isOpposed = this.isKnockDown || this.isFeint;
        if (this.isOpposed && this.targetActor) {
            const targetActor = this.targetActor as WH40KBaseActorDocument;
            if (this.isFeint) {
                this.opposedTarget = targetActor.characteristics?.weaponSkill?.total ?? 0;
                this.opposedChar = 'WS';
            } else if (this.isKnockDown) {
                this.opposedTarget = targetActor.characteristics?.strength?.total ?? 0;
                this.opposedChar = 'S';
            }
        }

        await updateWeaponModifiers(this);
        await updateAttackSpecials(this);
        updateAvailableCombatActions(this);
        calculateCombatActionModifier(this);
        if (weaponSystem.usesAmmo) {
            this.usesAmmo = true;
            calculateAmmoInformation(this);
        } else {
            this.usesAmmo = false;
        }
        await calculateWeaponRange(this);
        this.updateBaseTarget();
    }

    initialize(): void {
        this.baseTarget = 0;
        this.modifiers['attack'] = 0;
        this.modifiers['difficulty'] = 0;
        this.modifiers['aim'] = 0;
        this.modifiers['modifier'] = 0;

        // Size Bonus should not change after initial targeting
        const targetActorSystem = this.targetActor?.system as { size?: string | number };
        if (this.targetActor && targetActorSystem.size) {
            try {
                const size = Number.parseInt(targetActorSystem.size.toString());
                this.modifiers['target-size'] = (size - 4) * 10;
            } catch {
                ui.notifications?.warn('Target size is not a number. Unexpected error.');
            }
        }

        // Talents
        const sourceActor = this.sourceActor as WH40KBaseActorDocument;
        const sourceActorSystem = sourceActor?.system as { fate?: { value: number } };
        if (sourceActor && sourceActor.hasTalent('Eye of Vengeance') && sourceActorSystem.fate && sourceActorSystem.fate.value > 0) {
            this.hasEyeOfVengeanceAvailable = true;
        }

        this.weaponSelect = this.weapons.length > 1;
        this.weapon = this.weapons[0];
        (this.weapon as { isSelected?: boolean }).isSelected = true;
    }

    selectWeapon(weaponName: string): void {
        // Unselect All
        this.weapons.filter((weapon) => weapon.id !== weaponName).forEach((weapon) => ((weapon as any).isSelected = false));
        const found = this.weapons.find((weapon) => weapon.id === weaponName);
        if (found) {
            this.weapon = found;
            (this.weapon as any).isSelected = true;
        }
    }

    updateBaseTarget(): void {
        const sourceActor = this.sourceActor as WH40KBaseActorDocument | null;
        if (!sourceActor) return;

        const weaponSystem = this.weapon.system as { isRanged?: boolean };
        if (weaponSystem.isRanged) {
            this.baseTarget = sourceActor.characteristics?.ballisticSkill?.total ?? 0;
            this.baseChar = 'BS';
        } else {
            this.baseTarget = sourceActor.characteristics?.weaponSkill?.total ?? 0;
            this.baseChar = 'WS';
        }

        if (this.action === 'Knock Down') {
            this.baseTarget = sourceActor.characteristics?.strength?.total ?? 0;
            this.baseChar = 'S';
        }
    }

    async finalize(): Promise<void> {
        await calculateAmmoAttackBonuses(this);
        await calculateAttackSpecialAttackBonuses(this);
        await calculateWeaponModifiersAttackBonuses(this);
        this.modifiers = {
            ...this.modifiers,
            ...this.specialModifiers,
            ...this.weaponModifiers,
            range: this.rangeBonus,
        };

        // Unselect Weapon -- UI issues if it's selected on start
        if (this.weapon) {
            (this.weapon as { isSelected?: boolean }).isSelected = false;
        }

        // Suppressing Fire ignores other modifiers
        if (this.action.includes('Suppressing Fire')) {
            this.modifiers = {
                attack: -20,
            };
        }

        await this.calculateTotalModifiers();
    }
}

export class PsychicRollData extends RollData {
    psychicPowers: WH40KItem[] = [];
    declare power: WH40KItem;
    powerSelect: boolean = false;
    hasFocus: boolean = false;

    hasDamage: boolean = false;

    maxPr: number = 0;
    pr: number = 0;

    template: string;

    constructor() {
        super();
        this.template = 'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs';
    }

    initialize(): void {
        if (!this.sourceActor) return;

        this.baseTarget = 0;
        this.modifiers['bonus'] = 0;
        this.modifiers['difficulty'] = 0;
        this.modifiers['modifier'] = 0;
        this.pr = (this.sourceActor as any).psy?.rating ?? 0;
        this.hasFocus = !!(this.sourceActor as any).psy?.hasFocus;

        this.powerSelect = this.psychicPowers.length > 1;
        this.power = this.psychicPowers[0];
        (this.power as any).isSelected = true;
        this.hasDamage = (this.power.system as any).subtype?.includes('Attack');
    }

    selectPower(powerName: string): void {
        this.psychicPowers.filter((power) => power.id !== powerName).forEach((power) => ((power as any).isSelected = false));
        const found = this.psychicPowers.find((power) => power.id === powerName);
        if (found) {
            this.power = found;
            (this.power as any).isSelected = true;
        }
    }

    async update(): Promise<void> {
        if (!this.sourceActor) return;

        this.modifiers['bonus'] = 10 * Math.floor((this.sourceActor as any).psy?.rating - this.pr);
        this.modifiers['focus'] = this.hasFocus ? 10 : 0;
        this.modifiers['power'] = (this.power.system as any).target?.bonus ?? 0;
        this.hasDamage = (this.power.system as any).subtype?.includes('Attack');
        await updateAttackSpecials(this);
        this.updateBaseTarget();
        await calculatePsychicPowerRange(this);
    }

    updateBaseTarget(): void {
        if (!this.sourceActor) return;
        const target = (this.power.system as any).target;
        if (!target) return;

        if (target.useSkill) {
            const skill = target.skill;
            const actorSkill = (this.sourceActor as any).getSkillFuzzy(skill);
            if (actorSkill) {
                this.baseTarget = actorSkill.current;
                this.baseChar = actorSkill.label;
            }
        } else {
            const characteristic = target.characteristic;
            const actorCharacteristic = (this.sourceActor as any).getCharacteristicFuzzy(characteristic);
            if (actorCharacteristic) {
                this.baseTarget = actorCharacteristic.total;
                this.baseChar = actorCharacteristic.short;
            }
        }

        if (target.isOpposed && this.targetActor) {
            this.isOpposed = true;

            if (target.useOpposedSkill) {
                const skill = target.opposedSkill;
                const actorSkill = (this.targetActor as any).getSkillFuzzy(skill);
                if (actorSkill) {
                    this.opposedTarget = actorSkill.current;
                    this.opposedChar = actorSkill.label;
                }
            } else {
                const characteristic = target.opposed;
                const actorCharacteristic = (this.targetActor as any).getCharacteristicFuzzy(characteristic);
                if (actorCharacteristic) {
                    this.opposedTarget = actorCharacteristic.total;
                    this.opposedChar = actorCharacteristic.short;
                }
            }
        }
    }

    async finalize(): Promise<void> {
        await calculateAttackSpecialAttackBonuses(this);
        this.modifiers = { ...this.modifiers, ...this.specialModifiers };
        await this.calculateTotalModifiers();
    }
}
