/**
 * @file StatBlockValidator - Validates parsed stat block data
 *
 * Provides:
 * - Schema validation for parsed data
 * - Quality checks (reasonable values)
 * - Completeness checks
 * - Detailed validation messages
 */

export interface StatBlockData {
    name?: string;
    type?: string;
    system?: {
        characteristics?: Record<string, { base?: number | null; unnatural?: number }>;
        wounds?: { max?: number | null };
        movement?: { half?: number; full?: number; charge?: number; run?: number };
        armour?: {
            mode?: 'simple' | 'locations';
            total?: number | null;
            locations?: Record<string, number | null>;
        };
        threatLevel?: number;
        trainedSkills?: Record<string, { name?: string; characteristic?: string }>;
    };
    items?: Array<{ name?: string; type?: string }>;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    info: string[];
}

/**
 * Validator for stat block data.
 */
export default class StatBlockValidator {
    /**
     * Characteristic value ranges (min/max)
     */
    static characteristicRanges = {
        min: 1,
        max: 100,
    };

    /**
     * Reasonable value ranges for common stats
     */
    static statRanges = {
        wounds: { min: 1, max: 500 },
        armour: { min: 0, max: 20 },
        movement: { min: 0, max: 50 },
        threatLevel: { min: 1, max: 30 },
        size: { min: 1, max: 10 },
    };

    /**
     * Validate parsed stat block data.
     * @param {Object} data - Parsed stat block data
     * @returns {Object} Validation result with errors and warnings
     */
    static validate(data: StatBlockData | null | undefined): ValidationResult {
        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
            info: [],
        };

        if (!data) {
            result.valid = false;
            result.errors.push('No data provided for validation');
            return result;
        }

        // Validate structure
        this._validateStructure(data, result);

        // Validate characteristics
        if (data.system?.characteristics) {
            this._validateCharacteristics(data.system.characteristics, result);
        } else {
            result.warnings.push('No characteristics found. Default values will be used.');
        }

        // Validate wounds
        if (data.system?.wounds) {
            this._validateWounds(data.system.wounds, result);
        } else {
            result.warnings.push('No wounds found. Default value will be used.');
        }

        // Validate movement
        if (data.system?.movement) {
            this._validateMovement(data.system.movement, result);
        }

        // Validate armour
        if (data.system?.armour) {
            this._validateArmour(data.system.armour, result);
        }

        // Validate threat level
        if (data.system?.threatLevel) {
            this._validateThreatLevel(data.system.threatLevel, result);
        }

        // Validate skills
        if (data.system?.trainedSkills) {
            this._validateSkills(data.system.trainedSkills, result);
        }

        // Validate items (talents, traits, weapons)
        if (data.items) {
            this._validateItems(data.items, result);
        }

        // Check completeness
        this._checkCompleteness(data, result);

        result.valid = result.errors.length === 0;
        return result;
    }

    /**
     * Validate basic structure.
     * @private
     */
    static _validateStructure(data: StatBlockData, result: ValidationResult): void {
        if (!data.name || data.name === 'Imported NPC') {
            result.warnings.push("No name extracted. Using default 'Imported NPC'.");
        }

        if (!data.type) {
            result.errors.push("Missing actor type. Expected 'npcV2'.");
        } else if (data.type !== 'npcV2') {
            result.warnings.push(`Actor type is '${data.type}', expected 'npcV2'.`);
        }

        if (!data.system) {
            result.errors.push('Missing system data object.');
        }
    }

    /**
     * Validate characteristics.
     * @private
     */
    static _validateCharacteristics(characteristics: NonNullable<NonNullable<StatBlockData['system']>['characteristics']>, result: ValidationResult): void {
        const required = ['weaponSkill', 'ballisticSkill', 'strength', 'toughness', 'agility', 'intelligence', 'perception', 'willpower', 'fellowship'];

        let foundCount = 0;

        for (const key of required) {
            const char = characteristics[key];
            if (!char) {
                result.warnings.push(`Missing characteristic: ${key}`);
                continue;
            }

            foundCount++;

            const base = char.base;
            if (base === undefined || base === null) {
                result.warnings.push(`Characteristic ${key} has no base value`);
                continue;
            }

            if (base < this.characteristicRanges.min || base > this.characteristicRanges.max) {
                result.warnings.push(
                    `Characteristic ${key} (${base}) is outside normal range (${this.characteristicRanges.min}-${this.characteristicRanges.max})`,
                );
            }

            // Check unnatural characteristics
            if (char.unnatural && char.unnatural > 1) {
                result.info.push(`${key} has Unnatural (x${char.unnatural})`);
            }
        }

        if (foundCount === 0) {
            result.errors.push('No valid characteristics found');
        } else if (foundCount < required.length) {
            result.warnings.push(`Only ${foundCount}/${required.length} characteristics found`);
        }
    }

    /**
     * Validate wounds.
     * @private
     */
    static _validateWounds(wounds: NonNullable<NonNullable<StatBlockData['system']>['wounds']>, result: ValidationResult): void {
        const max = wounds.max;
        if (max === undefined || max === null) {
            result.warnings.push('Wounds max value is missing');
            return;
        }

        if (max < this.statRanges.wounds.min || max > this.statRanges.wounds.max) {
            result.warnings.push(`Wounds (${max}) is outside reasonable range (${this.statRanges.wounds.min}-${this.statRanges.wounds.max})`);
        }
    }

    /**
     * Validate movement.
     * @private
     */
    static _validateMovement(movement: NonNullable<NonNullable<StatBlockData['system']>['movement']>, result: ValidationResult): void {
        const rates: Array<keyof typeof movement> = ['half', 'full', 'charge', 'run'];
        let hasAny = false;

        for (const rate of rates) {
            const value = movement[rate];
            if (value !== undefined && value !== null) {
                hasAny = true;
                if (value < this.statRanges.movement.min || value > this.statRanges.movement.max) {
                    result.warnings.push(
                        `Movement ${rate} (${value}) is outside reasonable range (${this.statRanges.movement.min}-${this.statRanges.movement.max})`,
                    );
                }
            }
        }

        if (!hasAny) {
            result.warnings.push('No movement rates found. Using defaults.');
            return;
        }

        // Validate logical relationships
        if (movement.half !== undefined && movement.full !== undefined && movement.half > movement.full) {
            result.warnings.push('Half move is greater than full move');
        }
        if (movement.full !== undefined && movement.charge !== undefined && movement.full > movement.charge) {
            result.warnings.push('Full move is greater than charge');
        }
        if (movement.charge !== undefined && movement.run !== undefined && movement.charge > movement.run) {
            result.warnings.push('Charge is greater than run');
        }
    }

    /**
     * Validate armour.
     * @private
     */
    static _validateArmour(armour: NonNullable<NonNullable<StatBlockData['system']>['armour']>, result: ValidationResult): void {
        if (armour.mode === 'simple') {
            const total = armour.total;
            if (total !== undefined && total !== null) {
                if (total < this.statRanges.armour.min || total > this.statRanges.armour.max) {
                    result.warnings.push(`Armour (${total}) is outside reasonable range (${this.statRanges.armour.min}-${this.statRanges.armour.max})`);
                }
            }
        } else if (armour.mode === 'locations') {
            const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
            for (const loc of locations) {
                const value = armour.locations?.[loc];
                if (value !== undefined && value !== null) {
                    if (value < this.statRanges.armour.min || value > this.statRanges.armour.max) {
                        result.warnings.push(
                            `Armour ${loc} (${value}) is outside reasonable range (${this.statRanges.armour.min}-${this.statRanges.armour.max})`,
                        );
                    }
                }
            }
        }
    }

    /**
     * Validate threat level.
     * @private
     */
    static _validateThreatLevel(threatLevel: number, result: ValidationResult): void {
        if (threatLevel < this.statRanges.threatLevel.min || threatLevel > this.statRanges.threatLevel.max) {
            result.warnings.push(
                `Threat level (${threatLevel}) is outside reasonable range (${this.statRanges.threatLevel.min}-${this.statRanges.threatLevel.max})`,
            );
        }
    }

    /**
     * Validate skills.
     * @private
     */
    static _validateSkills(trainedSkills: NonNullable<NonNullable<StatBlockData['system']>['trainedSkills']>, result: ValidationResult): void {
        const skillCount = Object.keys(trainedSkills).length;
        if (skillCount === 0) {
            result.warnings.push('No trained skills found');
            return;
        }

        result.info.push(`Found ${skillCount} trained skill(s)`);

        // Validate each skill entry
        for (const [key, skill] of Object.entries(trainedSkills)) {
            if (!skill.name) {
                result.warnings.push(`Skill ${key} missing name`);
            }
            if (!skill.characteristic) {
                result.warnings.push(`Skill ${key} missing characteristic`);
            }
        }
    }

    /**
     * Validate items (talents, traits, weapons).
     * @private
     */
    static _validateItems(items: NonNullable<StatBlockData['items']>, result: ValidationResult): void {
        if (!Array.isArray(items)) {
            result.errors.push('Items is not an array');
            return;
        }

        const talents = items.filter((i) => i.type === 'talent');
        const traits = items.filter((i) => i.type === 'trait');
        const weapons = items.filter((i) => i.type === 'weapon');

        if (talents.length > 0) {
            result.info.push(`Found ${talents.length} talent(s)`);
        }
        if (traits.length > 0) {
            result.info.push(`Found ${traits.length} trait(s)`);
        }
        if (weapons.length > 0) {
            result.info.push(`Found ${weapons.length} weapon(s)`);
        }

        // Validate item structure
        for (const item of items) {
            if (!item.name) {
                result.warnings.push(`Item of type ${item.type} missing name`);
            }
            if (!item.type) {
                result.warnings.push(`Item '${item.name}' missing type`);
            }
        }
    }

    /**
     * Check completeness of parsed data.
     * @private
     */
    static _checkCompleteness(data: StatBlockData, result: ValidationResult): void {
        const components = {
            name: data.name && data.name !== 'Imported NPC',
            characteristics: data.system?.characteristics && Object.keys(data.system.characteristics).length > 0,
            wounds: data.system?.wounds?.max,
            skills: data.system?.trainedSkills && Object.keys(data.system.trainedSkills).length > 0,
            items: data.items && data.items.length > 0,
        };

        const complete = Object.values(components).filter(Boolean).length;
        const total = Object.keys(components).length;
        const percentage = Math.round((complete / total) * 100);

        result.info.push(`Data completeness: ${complete}/${total} (${percentage}%)`);

        if (percentage < 50) {
            result.warnings.push('Less than 50% of expected data was parsed. Check input format.');
        }
    }

    /**
     * Quick validation - returns just boolean
     * @param {Object} data - Parsed data
     * @returns {boolean} True if data is valid
     */
    static isValid(data: StatBlockData | null | undefined): boolean {
        const result = this.validate(data);
        return result.valid;
    }

    /**
     * Get validation summary string
     * @param {Object} validationResult - Result from validate()
     * @returns {string} Human-readable summary
     */
    static getSummary(validationResult: ValidationResult): string {
        const parts: string[] = [];

        if (validationResult.errors.length > 0) {
            parts.push(`${validationResult.errors.length} error(s)`);
        }
        if (validationResult.warnings.length > 0) {
            parts.push(`${validationResult.warnings.length} warning(s)`);
        }
        if (validationResult.info.length > 0) {
            parts.push(`${validationResult.info.length} info message(s)`);
        }

        return parts.length > 0 ? parts.join(', ') : 'No issues';
    }
}
