import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';
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
import type { WH40KBaseActorDocument, WH40KPsy } from '../types/global.d.ts';

/**
 * Base class for all roll-related data
 */
export class RollData {
    difficulties: Record<string, string> = rollDifficulties();
    aims: Record<string, string> = aimModifiers();
    locations: Record<string, string> = hitDropdown();
    lasModes: string[] = (WH40K['combat'] as { las_fire_modes?: string[] }).las_fire_modes ?? [];

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

    // eslint-disable-next-line no-restricted-syntax -- boundary: combat action info populated by per-system rule modules
    combatActionInformation: Record<string, unknown> = {};
    // eslint-disable-next-line no-restricted-syntax -- boundary: actions populated by per-system rule modules
    actions: Record<string, unknown> = {};
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

    attackSpecials: { name: string }[] = [];
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

    isThrown?: boolean;

    // Set by WeaponRollData / PsychicRollData; read by ActionData.performActionAndSendToChat
    template?: string;

    get showDamage(): boolean {
        // eslint-disable-next-line no-restricted-syntax -- isThrown is set externally on per-weapon basis; nullish coalesce is the read-time default
        return this.success || (this.isThrown ?? false);
    }

    reset(): void {
        this.automatic = false;
        this.success = false;
        this.opposedSuccess = false;
    }

    nameOverride?: string;
    get name(): string {
        if (this.nameOverride !== undefined && this.nameOverride !== '') return this.nameOverride;

        // eslint-disable-next-line no-restricted-syntax -- nameOverride is opt-in caller-supplied; nullish coalesce is the read-time default
        const actionItem = this.weapon ?? this.power;
        if (actionItem) return actionItem.name;

        return '';
    }

    get effectString(): string {
        // eslint-disable-next-line no-restricted-syntax -- power is set on PsychicRollData subclass; nullish coalesce is the read-time default
        const actionItem = this.weapon ?? this.power;
        if (actionItem === undefined) return '';

        const str: string[] = [];

        const ammoName = (actionItem.system as { loadedAmmo?: { name: string } }).loadedAmmo?.name;
        if (ammoName !== undefined && ammoName !== '') {
            str.push(ammoName);
        }

        const specials = this.attackSpecials.map((s: { name: string }) => s.name).join(',');
        if (specials !== '') {
            str.push(specials);
        }

        // eslint-disable-next-line no-restricted-syntax -- structural cast to detect WeaponRollData via duck-typed method check
        const weaponRollData = this as unknown as WeaponRollData;
        if (typeof weaponRollData.hasWeaponModification === 'function') {
            const mods = weaponRollData.weaponModifications.map((m: { name: string }) => m.name).join(',');
            if (mods !== '') {
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
                const value = this.modifiers[m];
                if (value !== undefined && value !== 0) {
                    modifiers[m.toUpperCase()] = value;
                }
            } catch (err) {
                game.wh40k.error('Error while calculate roll data modifiers:', err);
            }
        }
        return modifiers;
    }

    hasAttackSpecial(special: string): boolean {
        return !!this.attackSpecials.find((s) => s.name === special);
    }

    getAttackSpecial(special: string): { name: string } | undefined {
        return this.attackSpecials.find((s) => s.name === special);
    }

    modifiersToRollData(): { formula: string; params: Record<string, number> } {
        let formula = '0 ';
        const rollParams: Record<string, number> = {};
        for (const modifier of Object.keys(this.modifiers)) {
            const value = this.modifiers[modifier];
            if (value !== undefined && value !== 0) {
                if (value >= 0) {
                    formula += ` + @${modifier}`;
                } else {
                    formula += ` - @${modifier}`;
                }
                rollParams[modifier] = Math.abs(value);
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
            const rollTotal = roll.total;
            if (rollTotal === undefined) {
                this.modifierTotal = 0;
            } else if (rollTotal > 60) {
                this.modifierTotal = 60;
            } else if (rollTotal < -60) {
                this.modifierTotal = -60;
            } else {
                this.modifierTotal = rollTotal;
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

    weaponModifications: { name: string }[] = [];
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
    override isThrown: boolean = false;
    isSpray: boolean = false;
    isLasWeapon: boolean = false;
    lasMode: string = 'Standard';

    override template: string;

    constructor() {
        super();
        this.template = 'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs';
    }

    hasWeaponModification(special: string): boolean {
        return !!this.weaponModifications.find((s) => s.name === special);
    }

    getWeaponModification(special: string): { name: string } | undefined {
        return this.weaponModifications.find((s) => s.name === special);
    }

    async update(): Promise<void> {
        const weaponSystem = this.weapon.system as { attackBonus?: number; type?: string; usesAmmo?: boolean };
        if (weaponSystem.attackBonus !== undefined && weaponSystem.attackBonus !== 0) {
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
        // eslint-disable-next-line no-restricted-syntax -- boundary: isThrown is a per-weapon flag set by item document
        this.isThrown = (this.weapon as { isThrown?: boolean }).isThrown ?? false;

        this.isOpposed = this.isKnockDown || this.isFeint;
        if (this.isOpposed && this.targetActor) {
            const targetActor = this.targetActor;
            if (this.isFeint) {
                this.opposedTarget = targetActor.characteristics['weaponSkill']?.total ?? 0;
                this.opposedChar = 'WS';
            } else if (this.isKnockDown) {
                this.opposedTarget = targetActor.characteristics['strength']?.total ?? 0;
                this.opposedChar = 'S';
            }
        }

        updateWeaponModifiers(this);
        updateAttackSpecials(this);
        updateAvailableCombatActions(this);
        calculateCombatActionModifier(this);
        if (weaponSystem.usesAmmo === true) {
            this.usesAmmo = true;
            calculateAmmoInformation(this as Parameters<typeof calculateAmmoInformation>[0]);
        } else {
            this.usesAmmo = false;
        }
        calculateWeaponRange(this);
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
        if (this.targetActor && targetActorSystem.size !== undefined && targetActorSystem.size !== '' && targetActorSystem.size !== 0) {
            try {
                const size = Number.parseInt(targetActorSystem.size.toString());
                this.modifiers['target-size'] = (size - 4) * 10;
            } catch {
                // eslint-disable-next-line no-restricted-syntax -- TODO: WH40K.RollData.TargetSizeNotANumber localization key not yet in en.json
                ui.notifications.warn('Target size is not a number. Unexpected error.');
            }
        }

        // Talents
        type ActorWithTalents = WH40KBaseActorDocument & { hasTalent(name: string): boolean };
        const sourceActor = this.sourceActor as ActorWithTalents | null;
        const sourceActorSystem = sourceActor?.system as { fate?: { value: number } };
        if (sourceActor && sourceActor.hasTalent('Eye of Vengeance') && sourceActorSystem.fate && sourceActorSystem.fate.value > 0) {
            this.hasEyeOfVengeanceAvailable = true;
        }

        this.weaponSelect = this.weapons.length > 1;
        const firstWeapon = this.weapons[0];
        if (firstWeapon === undefined) return;
        this.weapon = firstWeapon;
        (this.weapon as { isSelected?: boolean }).isSelected = true;
    }

    selectWeapon(weaponName: string): void {
        // Unselect All
        this.weapons.filter((weapon) => weapon.id !== weaponName).forEach((weapon) => ((weapon as { isSelected?: boolean }).isSelected = false));
        const found = this.weapons.find((weapon) => weapon.id === weaponName);
        if (found) {
            this.weapon = found;
            (this.weapon as { isSelected?: boolean }).isSelected = true;
        }
    }

    updateBaseTarget(): void {
        const sourceActor = this.sourceActor;
        if (!sourceActor) return;

        const weaponSystem = this.weapon.system as { isRanged?: boolean };
        if (weaponSystem.isRanged === true) {
            this.baseTarget = sourceActor.characteristics['ballisticSkill']?.total ?? 0;
            this.baseChar = 'BS';
        } else {
            this.baseTarget = sourceActor.characteristics['weaponSkill']?.total ?? 0;
            this.baseChar = 'WS';
        }

        if (this.action === 'Knock Down') {
            this.baseTarget = sourceActor.characteristics['strength']?.total ?? 0;
            this.baseChar = 'S';
        }
    }

    async finalize(): Promise<void> {
        calculateAmmoAttackBonuses(this as Parameters<typeof calculateAmmoAttackBonuses>[0]);
        calculateAttackSpecialAttackBonuses(this);
        calculateWeaponModifiersAttackBonuses(this);
        this.modifiers = {
            ...this.modifiers,
            ...this.specialModifiers,
            ...this.weaponModifiers,
            range: this.rangeBonus,
        };

        // Unselect Weapon -- UI issues if it's selected on start
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- defensive: weapon may be unset before initialize() runs
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

    override template: string;

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
        type ActorWithPsy = WH40KBaseActorDocument & { psy?: WH40KPsy };
        this.pr = (this.sourceActor as ActorWithPsy).psy?.rating ?? 0;
        this.hasFocus = (this.sourceActor as ActorWithPsy).psy?.['hasFocus'] === true;

        this.powerSelect = this.psychicPowers.length > 1;
        const firstPower = this.psychicPowers[0];
        if (firstPower === undefined) return;
        this.power = firstPower;
        (this.power as { isSelected?: boolean }).isSelected = true;
        this.hasDamage = (this.power.system as { subtype?: string }).subtype?.includes('Attack') ?? false;
    }

    selectPower(powerName: string): void {
        this.psychicPowers.filter((power) => power.id !== powerName).forEach((power) => ((power as { isSelected?: boolean }).isSelected = false));
        const found = this.psychicPowers.find((power) => power.id === powerName);
        if (found) {
            this.power = found;
            (this.power as { isSelected?: boolean }).isSelected = true;
        }
    }

    async update(): Promise<void> {
        if (!this.sourceActor) return;
        type ActorWithPsy = WH40KBaseActorDocument & { psy?: WH40KPsy };
        const sourceActor = this.sourceActor as ActorWithPsy;

        this.modifiers['bonus'] = 10 * Math.floor((sourceActor.psy?.rating ?? 0) - this.pr);
        this.modifiers['focus'] = this.hasFocus ? 10 : 0;
        this.modifiers['power'] = (this.power.system as { target?: { bonus?: number } }).target?.bonus ?? 0;
        this.hasDamage = (this.power.system as { subtype?: string }).subtype?.includes('Attack') ?? false;
        updateAttackSpecials(this);
        this.updateBaseTarget();
        await calculatePsychicPowerRange(this);
    }

    updateBaseTarget(): void {
        if (!this.sourceActor) return;
        // getSkillFuzzy lives on WH40KAcolyte at runtime; the wider WH40KBaseActor
        // type doesn't declare it. Power rolls only target actors that implement it,
        // so cast through a structural type rather than widening the base class.
        type FuzzySkill = { current: number; label?: string };
        type SkillResolver = WH40KBaseActorDocument & {
            getSkillFuzzy(skill: string): FuzzySkill | undefined;
            getCharacteristicFuzzy(characteristic: string): { total: number; short: string } | undefined;
        };
        type PowerTarget = {
            useSkill?: boolean;
            skill?: string;
            characteristic?: string;
            isOpposed?: boolean;
            useOpposedSkill?: boolean;
            opposedSkill?: string;
            opposed?: string;
        };
        const sourceActor = this.sourceActor as SkillResolver;
        const target = (this.power.system as { target?: PowerTarget }).target;
        if (!target) return;

        if (target.useSkill === true) {
            const skill = target.skill ?? '';
            const actorSkill = sourceActor.getSkillFuzzy(skill);
            if (actorSkill) {
                this.baseTarget = actorSkill.current;
                this.baseChar = actorSkill.label ?? '';
            }
        } else {
            const characteristic = target.characteristic ?? '';
            const actorCharacteristic = sourceActor.getCharacteristicFuzzy(characteristic);
            if (actorCharacteristic) {
                this.baseTarget = actorCharacteristic.total;
                this.baseChar = actorCharacteristic.short;
            }
        }

        if (target.isOpposed === true && this.targetActor) {
            this.isOpposed = true;
            const targetActor = this.targetActor as SkillResolver;

            if (target.useOpposedSkill === true) {
                const skill = target.opposedSkill ?? '';
                const actorSkill = targetActor.getSkillFuzzy(skill);
                if (actorSkill) {
                    this.opposedTarget = actorSkill.current;
                    this.opposedChar = actorSkill.label ?? '';
                }
            } else {
                const characteristic = target.opposed ?? '';
                const actorCharacteristic = targetActor.getCharacteristicFuzzy(characteristic);
                if (actorCharacteristic) {
                    this.opposedTarget = actorCharacteristic.total;
                    this.opposedChar = actorCharacteristic.short;
                }
            }
        }
    }

    async finalize(): Promise<void> {
        calculateAttackSpecialAttackBonuses(this);
        this.modifiers = { ...this.modifiers, ...this.specialModifiers };
        await this.calculateTotalModifiers();
    }
}
