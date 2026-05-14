import { t } from '../i18n/t.ts';
import type { PsychicRollData, RollData, WeaponRollData } from '../rolls/roll-data.ts';
import { calculateRangeModifier } from '../utils/range-calculator.ts';

type RangeAnnotatedRollData = RollData & {
    rangeBracket?: string;
    rangeModifiedBy?: string;
    isMeltaRange?: boolean;
};

type WeaponRangeSystem = {
    range?: string | number;
    attack?: {
        range?: {
            value?: string | number;
        };
    };
    effectiveSpecial?: Set<string>;
};

type PsychicPowerRangeSystem = {
    range?: string | number;
};

/**
 * @param rollData {WeaponRollData}
 */
function calculateWeaponMaxRange(rollData: WeaponRollData): void {
    const weapon = rollData.weapon;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- noUncheckedIndexedAccess guard: weapon is declared non-optional but may be unset before initialize() runs
    if (!weapon) {
        rollData.maxRange = 0;
        return;
    }

    if (weapon.isMelee) {
        rollData.maxRange = 1;
        return;
    }

    // Get base range from weapon
    let range = 0;
    const weaponSystem = weapon.system as WeaponRangeSystem;
    const weaponRange = weaponSystem.attack?.range?.value ?? weaponSystem.range;

    if (Number.isInteger(weaponRange)) {
        range = Number(weaponRange);
    } else if (weaponRange === '' || weaponRange === 'N/A') {
        range = 0;
    } else {
        try {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Roll formula data context is an arbitrary plain object
            const rangeCalculation = new Roll(String(weaponRange), rollData as unknown as Record<string, unknown>);
            rangeCalculation.evaluateSync();
            range = rangeCalculation.total ?? 0;
        } catch {
            ui.notifications.warn(t('WH40K.Warning.RangeFormulaFailed'));
            range = 0;
        }
    }

    // Check Maximal
    if (rollData.hasAttackSpecial('Maximal')) {
        range += 10;
    }

    //Check Forearm Mounting
    if (rollData.hasWeaponModification('Forearm Weapon Mounting')) {
        range = Math.floor(range * 0.66);
    }

    //Check Pistol Grip
    if (rollData.hasWeaponModification('Pistol Grip')) {
        range = Math.floor(range * 0.5);
    }

    rollData.maxRange = range;
}

/**
 * @param rollData {PsychicRollData}
 */
async function calculatePsychicAbilityMaxRange(rollData: PsychicRollData): Promise<void> {
    const data = rollData;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- noUncheckedIndexedAccess guard: power is declared non-optional but may be unset before initialize() runs
    if (!data.power) {
        data.maxRange = 0;
        return;
    }

    const powerSystem = data.power.system as PsychicPowerRangeSystem;
    let range = 0;
    if (Number.isInteger(powerSystem.range)) {
        range = Number(powerSystem.range);
    } else if (powerSystem.range === '') {
        range = 0;
    } else {
        try {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Roll formula data context is an arbitrary plain object
            const rangeCalculation = new Roll(String(powerSystem.range ?? ''), data as unknown as Record<string, unknown>);
            await rangeCalculation.evaluate();
            range = rangeCalculation.total ?? 0;
        } catch {
            ui.notifications.warn(t('WH40K.Warning.RangeFormulaFailed'));
            range = 0;
        }
    }

    data.maxRange = range;
}

/**
 * Calculate range bracket and bonus using the new range calculator system.
 * @param rollData {RollData}
 */
function calculateRangeNameAndBonus(rollData: RollData): void {
    const mutableRollData = rollData as RangeAnnotatedRollData;
    if (rollData.weapon?.isMelee === true) {
        rollData.rangeName = 'Melee';
        rollData.rangeBonus = 0;
        mutableRollData.rangeBracket = 'melee';
        mutableRollData.isMeltaRange = false;
        return;
    }

    const targetDistance = rollData.distance;
    const maxRange = rollData.maxRange;

    // Get weapon qualities if available
    const weaponQualities = (rollData.weapon?.system as WeaponRangeSystem | undefined)?.effectiveSpecial ?? new Set<string>();

    // Use new range calculator
    const rangeInfo = calculateRangeModifier({
        distance: targetDistance,
        weaponRange: maxRange,
        weaponQualities: weaponQualities,
        isRangedWeapon: true,
    });

    // Store range information in rollData
    rollData.rangeName = rangeInfo.label;
    rollData.rangeBonus = rangeInfo.modifier;
    mutableRollData.rangeBracket = rangeInfo.bracket;
    if (rangeInfo.modifiedBy !== null) {
        mutableRollData.rangeModifiedBy = rangeInfo.modifiedBy;
    } else {
        delete mutableRollData.rangeModifiedBy;
    }
    mutableRollData.isMeltaRange = rangeInfo.isMeltaRange;
}

/**
 * @param rollData {WeaponRollData}
 */
export function calculateWeaponRange(rollData: WeaponRollData): void {
    const mutableRollData = rollData as WeaponRollData & RangeAnnotatedRollData;
    calculateWeaponMaxRange(rollData);
    calculateRangeNameAndBonus(rollData);

    // Ignore Negative Range Bonus for certain modifications
    if (rollData.rangeBonus < 0) {
        const aiming = (rollData.modifiers['aim'] ?? 0) > 0;
        if (aiming && (rollData.hasWeaponModification('Telescopic Sight') || rollData.hasWeaponModification('Omni-Scope'))) {
            rollData.rangeBonus = 0;
            mutableRollData.rangeModifiedBy = 'telescopic-sight';
        }
    }
}

/**
 * @param rollData {PsychicRollData}
 */
export async function calculatePsychicPowerRange(rollData: PsychicRollData): Promise<void> {
    await calculatePsychicAbilityMaxRange(rollData);
    calculateRangeNameAndBonus(rollData);
    // Ignore Bonus for Psychic Powers
    rollData.rangeBonus = 0;
}
