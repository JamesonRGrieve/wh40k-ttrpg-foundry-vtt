/**
 * @file specialist-skill-test — the test a rule names by a printed
 * specialisation: Trade (Armourer) to fit a weapon modification (#136), the
 * Operate (Surface) / Drive (Walker) / Pilot (Flyers) a vehicle's driver tests
 * (content#28).
 *
 * The rule names one specialisation and only that one counts. A character who
 * has it tests with that entry's target and rank; one who lacks it makes the test
 * untrained (the parent skill at rank 0, which the roll dialog resolves under the
 * line's untrained rule). It never falls back to a different specialisation.
 */

/** One specialisation entry of a specialist skill, as the character's sheet carries it. */
export interface SpecialisationEntry {
    name?: string | undefined;
    label?: string | undefined;
    current?: number | undefined;
    /** Effective training rank, computed in CreatureTemplate._prepareSkills. */
    rank?: number | undefined;
    trained?: boolean | undefined;
}

/** The label, target and rank a printed-specialisation test rolls. */
export interface SpecialisationTest {
    label: string;
    target: number;
    skillRank: number;
}

/**
 * The test of `specialisation` for a character whose matching entry is `entry`
 * (undefined when they lack it).
 * @param skillLabel  The parent skill's label (`Operate`).
 * @param skillCurrent  The parent skill's target, used when untrained.
 * @param entry  The character's entry for the specialisation, if any.
 * @param specialisation  The specialisation the rule names.
 */
export function printedSpecialisationTest(
    skillLabel: string,
    skillCurrent: number,
    entry: SpecialisationEntry | undefined,
    specialisation: string,
): SpecialisationTest {
    if (entry === undefined) return { label: `${skillLabel}: ${specialisation}`, target: skillCurrent, skillRank: 0 };
    return {
        label: `${skillLabel}: ${entry.name ?? entry.label ?? specialisation}`,
        target: entry.current ?? skillCurrent,
        skillRank: entry.rank ?? (entry.trained === true ? 1 : 0),
    };
}
