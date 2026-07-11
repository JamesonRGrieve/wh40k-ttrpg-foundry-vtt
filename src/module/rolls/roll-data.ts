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
import { targetSizeModifier } from '../rules/target-size.ts';
import { calculateWeaponModifiersAttackBonuses, updateWeaponModifiers } from '../rules/weapon-modifiers.ts';
import { getWeaponTrainingModifier } from '../rules/weapon-training.ts';
import type { WH40KBaseActorDocument, WH40KPsy } from '../types/global.d.ts';
import { aggregateRollTarget, clampModifierToCap } from './aggregate-target.ts';
import { evaluateFormula } from './evaluate-formula.ts';

// Re-exported for existing consumers (chat-card cap surfacing, tests) that
// import the cap primitives from this module. The canonical definitions now
// live in `aggregate-target.ts` alongside the pure target-sum helpers.
export { clampModifierToCap, ROLL_MODIFIER_CAP } from './aggregate-target.ts';

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

    // Unified-roll metadata (set by `WH40KBaseActor._buildSimpleSkillRoll`): the
    // displayed roll category ('Characteristic' | 'Skill' | 'Attack' | …) and the
    // underlying stat key ('willpower' | 'awareness' | …). Read by the situational-
    // modifier and re-roll-variant collectors to scope options to this test.
    type: string = '';
    rollKey: string = '';

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
    /** The un-clamped sum of modifiers (un-capped). Equals `modifierTotal`
     *  except when the ±60 cap fired, in which case this exposes what the
     *  raw accumulator would have been so chat cards can surface "cap
     *  absorbed X" to the GM (DH2 core.md L1050). */
    rawModifierTotal: number = 0;
    /** True when the ±60 cap clamped `rawModifierTotal` down to
     *  `modifierTotal`. The chat-card layer reads this to render a
     *  visual indicator. */
    modifierCapFired: boolean = false;
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
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: modifiers[m] may be undefined despite Record<string, number> type
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
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: modifiers[modifier] may be undefined despite Record<string, number> type
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
        const rollTotal = await evaluateFormula(rollDetails.formula, rollDetails.params);
        const { clamped, raw, capFired } = clampModifierToCap(rollTotal);
        this.modifierTotal = clamped;
        this.rawModifierTotal = raw;
        this.modifierCapFired = capFired;
    }

    /**
     * Set the transient `isSelected` roll-dialog marker on a weapon / power
     * item. The flag is not part of the shipped item schema, so it is written
     * through a structural cast — concentrated here so the cast lives once
     * rather than at every select / initialize site.
     */
    protected static setSelected(item: WH40KItem, value: boolean): void {
        (item as { isSelected?: boolean }).isSelected = value;
    }

    /**
     * Unselect every item except the one whose `id` matches, mark the match
     * selected, and return it (`undefined` when no id matches). Shared by
     * {@link WeaponRollData.selectWeapon} and {@link PsychicRollData.selectPower}.
     */
    protected selectFrom(items: WH40KItem[], id: string): WH40KItem | undefined {
        let found: WH40KItem | undefined;
        for (const item of items) {
            const isMatch = item.id === id;
            RollData.setSelected(item, isMatch);
            if (isMatch) found = item;
        }
        return found;
    }

    /**
     * Mark the first item selected and report whether the list holds more than
     * one entry (drives the weapon / power picker dropdown). Shared by both
     * subclasses' `initialize()`.
     */
    protected pickSelected(items: WH40KItem[]): { hasMultiple: boolean; first: WH40KItem | undefined } {
        const first = items[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) sees items[0] as defined, tsconfig.json (flag on) types it `WH40KItem | undefined` and requires this guard
        if (first !== undefined) RollData.setSelected(first, true);
        return { hasMultiple: items.length > 1, first };
    }
}

export class WeaponRollData extends RollData {
    weapons: WH40KItem[] = [];
    declare weapon: WH40KItem;
    weaponSelect: boolean = false;

    weaponModifications: { name: string }[] = [];
    isCalledShot: boolean = false;
    calledShotLocation: string | undefined;
    /**
     * Cover armour-point bonus applied to the target at the hit location,
     * collected from active "Cover" situational modifiers in the roll dialog.
     * Read by `AssignDamageData.update()` after location lookup so the
     * armour total includes cover before AP / TB reduction.
     */
    coverAP: number = 0;
    usesAmmo: boolean = false;
    ammoText: string = '';
    ammoPerShot: number = 1;
    fireRate: number = 1;
    ammoUsed: number = 0;
    weaponModifiers: Record<string, number> = {};

    /**
     * Live aggregate test target shown at the top of the attack dialog:
     * base characteristic + every active modifier (weapon, training, combat
     * action, difficulty, aim, range, attack-mode, …) with the ±60 cap applied.
     * Recomputed on every `update()` so changing any modifier moves the number,
     * and equal to `modifiedTarget` once `finalize()` commits the roll (#382).
     */
    displayTarget: number = 0;

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

    update(): void {
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
        this.isThrown = (this.weapon as { isThrown?: boolean }).isThrown ?? false;

        this.isOpposed = this.isKnockDown || this.isFeint;
        if (this.isOpposed && this.targetActor) {
            const targetActor = this.targetActor;
            if (this.isFeint) {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: characteristics index may be undefined at runtime
                this.opposedTarget = targetActor.characteristics['weaponSkill']?.total ?? 0;
                this.opposedChar = 'WS';
            } else if (this.isKnockDown) {
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: characteristics index may be undefined at runtime
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

        // Refresh the displayed aggregate target so the top number reflects
        // every active modifier on every render / form change (#382). Uses the
        // same modifier assembly the committed roll runs in `finalize()`, so the
        // displayed value matches `modifiedTarget` exactly.
        this.displayTarget = aggregateRollTarget(this.baseTarget, this.assembleFinalModifiers());
    }

    initialize(): void {
        this.baseTarget = 0;
        this.modifiers['attack'] = 0;
        this.modifiers['combat-action'] = 0;
        this.modifiers['difficulty'] = 0;
        this.modifiers['aim'] = 0;
        this.modifiers['modifier'] = 0;

        // Size Bonus should not change after initial targeting
        const targetActorSystem = this.targetActor?.system as { size?: string | number };
        if (this.targetActor && targetActorSystem.size !== undefined && targetActorSystem.size !== '' && targetActorSystem.size !== 0) {
            try {
                const size = Number.parseInt(targetActorSystem.size.toString(), 10);
                this.modifiers['target-size'] = targetSizeModifier(size);
            } catch {
                // eslint-disable-next-line no-restricted-syntax -- TODO: WH40K.RollData.TargetSizeNotANumber localization key not yet in en.json
                ui.notifications.warn('Target size is not a number. Unexpected error.');
            }
        }

        // Talents
        type ActorWithTalents = WH40KBaseActorDocument & { hasTalent: (name: string) => boolean };
        const sourceActor = this.sourceActor as ActorWithTalents | null;
        const sourceActorSystem = sourceActor?.system as { fate?: { value: number } };
        if (sourceActor?.hasTalent('Eye of Vengeance') === true && sourceActorSystem.fate !== undefined && sourceActorSystem.fate.value > 0) {
            this.hasEyeOfVengeanceAvailable = true;
        }

        const { hasMultiple, first } = this.pickSelected(this.weapons);
        this.weaponSelect = hasMultiple;
        if (first === undefined) return;
        this.weapon = first;
    }

    selectWeapon(weaponName: string): void {
        const found = this.selectFrom(this.weapons, weaponName);
        if (found !== undefined) this.weapon = found;
    }

    updateBaseTarget(): void {
        const sourceActor = this.sourceActor;
        if (!sourceActor) return;

        const weaponSystem = this.weapon.system as { isRanged?: boolean };
        if (weaponSystem.isRanged === true) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: characteristics index may be undefined at runtime
            this.baseTarget = sourceActor.characteristics['ballisticSkill']?.total ?? 0;
            this.baseChar = 'BS';
        } else {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: characteristics index may be undefined at runtime
            this.baseTarget = sourceActor.characteristics['weaponSkill']?.total ?? 0;
            this.baseChar = 'WS';
        }

        if (this.action === 'Knock Down') {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: characteristics index may be undefined at runtime
            this.baseTarget = sourceActor.characteristics['strength']?.total ?? 0;
            this.baseChar = 'S';
        }
    }

    /**
     * Assemble the full modifier record the roll target is summed from: the
     * dialog-managed modifiers merged with the context-dependent attack bonuses
     * (ammo, attack specials, weapon modifications) and the range bonus, with
     * the Suppressing Fire override applied. Pure with respect to
     * `this.modifiers` — it reads but never reassigns it — so it can be called
     * every render to refresh `displayTarget` without disturbing the user's
     * selected modifier inputs. The attack-bonus calculators it invokes each
     * reset their own scratch map (`specialModifiers` / `weaponModifiers`)
     * before recomputing, so repeated calls are idempotent.
     */
    assembleFinalModifiers(): Record<string, number> {
        calculateAmmoAttackBonuses(this as Parameters<typeof calculateAmmoAttackBonuses>[0]);
        calculateAttackSpecialAttackBonuses(this);
        calculateWeaponModifiersAttackBonuses(this);

        // Suppressing Fire ignores other modifiers
        if (this.action.includes('Suppressing Fire')) {
            return { attack: -20 };
        }

        return {
            ...this.modifiers,
            ...this.specialModifiers,
            ...this.weaponModifiers,
            range: this.rangeBonus,
        };
    }

    async finalize(): Promise<void> {
        this.modifiers = this.assembleFinalModifiers();

        // Unselect Weapon -- UI issues if it's selected on start
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- defensive: weapon may be unset before initialize() runs
        if (this.weapon) {
            RollData.setSelected(this.weapon, false);
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

        const { hasMultiple, first } = this.pickSelected(this.psychicPowers);
        this.powerSelect = hasMultiple;
        if (first === undefined) return;
        this.power = first;
        this.hasDamage = (this.power.system as { isAttack?: boolean }).isAttack === true;
    }

    selectPower(powerName: string): void {
        const found = this.selectFrom(this.psychicPowers, powerName);
        if (found !== undefined) this.power = found;
    }

    async update(): Promise<void> {
        if (!this.sourceActor) return;
        type ActorWithPsy = WH40KBaseActorDocument & { psy?: WH40KPsy };
        const sourceActor = this.sourceActor as ActorWithPsy;

        this.modifiers['bonus'] = 10 * Math.floor((sourceActor.psy?.rating ?? 0) - this.pr);
        this.modifiers['focus'] = this.hasFocus ? 10 : 0;
        this.modifiers['power'] = (this.power.system as { target?: { bonus?: number } }).target?.bonus ?? 0;
        this.hasDamage = (this.power.system as { isAttack?: boolean }).isAttack === true;
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
            getSkillFuzzy: (skill: string) => FuzzySkill | undefined;
            getCharacteristicFuzzy: (characteristic: string) => { total: number; short: string } | undefined;
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
