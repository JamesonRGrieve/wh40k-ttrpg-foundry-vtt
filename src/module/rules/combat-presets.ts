/**
 * A saved NPC combat preset (the combat-preset dialog's library), as the
 * world setting `combat-presets` stores it (#712).
 *
 * The blob keeps each game line's own stat shapes verbatim, so its nested
 * blocks are free-form records.
 */
/** One persisted block of a preset's game-line stats, kept as the NPC held it. */
// eslint-disable-next-line no-restricted-syntax -- boundary: a persisted preset blob preserves arbitrary game-system fields per line
type PresetBlock = Record<string, unknown>;

export interface CombatPreset {
    id: string;
    name: string;
    description: string;
    createdAt: number;
    faction: string;
    type: string;
    role: string;
    threatLevel: number;
    characteristics: PresetBlock;
    wounds: PresetBlock;
    movement: PresetBlock;
    size: string;
    initiative: PresetBlock;
    trainedSkills: PresetBlock;
    weapons: PresetBlock;
    armour: PresetBlock;
    horde: PresetBlock;
    tags: string[];
}

/** A value a stored setting can hold. */
type StoredValue = object | string | number | boolean | null | undefined;

/** Is a stored value a list of presets? Each entry must be an object with a string `id` and `name`. */
export function isCombatPresetList(stored: StoredValue): stored is CombatPreset[] {
    if (!Array.isArray(stored)) return false;
    return (stored as readonly StoredValue[]).every((entry) => {
        if (entry === null || typeof entry !== 'object') return false;
        const { id, name } = entry as { id?: StoredValue; name?: StoredValue };
        return typeof id === 'string' && typeof name === 'string';
    });
}
