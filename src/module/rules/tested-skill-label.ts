/**
 * @file tested-skill-label — what a skill test rolled, for a test titled after
 * something else (#677).
 *
 * A vehicle's trait tests title the roll after the test and the craft ("Difficult
 * Terrain Test: Chimera"), so the roll dialog and card must also say which skill
 * was rolled, with its specialisation, and whether it was rolled untrained:
 * "Operate (Surface), untrained". The base row of the target names where its
 * value comes from: the characteristic and that skill. The roll's `type` field,
 * which the dialog logic reads, is left alone; these are display strings.
 */

/** Formats a langpack key with named values (`game.i18n.format`). */
type Format = (key: string, data: Record<string, string>) => string;

/** The skill a test rolled. */
export interface TestedSkill {
    /** The skill's display name (`Operate`). */
    skill: string;
    /** The specialisation rolled (`Surface`), or null for a standard skill. */
    specialisation: string | null;
    /** True when the character lacks the skill (or the specialisation) and rolls it untrained. */
    untrained: boolean;
}

/** "Operate (Surface)", with ", untrained" when it applies. Pure. */
export function testedSkillLabel(tested: TestedSkill, format: Format): string {
    const name =
        tested.specialisation === null
            ? tested.skill
            : format('WH40K.Roll.TestedSkill.Specialised', { skill: tested.skill, specialisation: tested.specialisation });
    return tested.untrained ? format('WH40K.Roll.TestedSkill.Untrained', { skill: name }) : name;
}

/** The base row's provenance: "Base (Agility: Operate (Surface), untrained)". Pure. */
export function testedSkillBaseLabel(characteristic: string, skillLabel: string, format: Format): string {
    return format('WH40K.Roll.TestedSkill.Base', { characteristic, skill: skillLabel });
}
