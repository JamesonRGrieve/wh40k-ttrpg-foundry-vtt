/**
 * Untrained-skill and alternate-characteristic resolution
 * (core rules, "Untrained Skill Use", and individual skill
 * descriptors' "Special Uses" sub-sections).
 *
 * - **Which skills can't be tested untrained** is each line's own rule
 *   ({@link untrainedTestForbidden}, #757): an Advanced skill on the career
 *   lines (DH1, RT, DW), a Specialist skill on DH2 and Only War, and the
 *   skills Black Crusade's table marks. A refused test is flagged through
 *   `untrainedAdvanced`.
 * - **The untrained base** is −20 on the aptitude lines and half the
 *   characteristic on the career lines ({@link untrainedSkillBase}); the
 *   actor applies it at prepare time, so callers pass it in already applied.
 * - **Alternate characteristic:** several skill descriptors list a
 *   different characteristic for specific use cases (e.g. Athletics
 *   with Toughness for marathon endurance). The dialog surfaces these
 *   as an override dropdown.
 */

/**
 * How a line decides which skills cannot be tested untrained:
 * - `advanced`: the career lines (DH1, RT, DW) refuse an untrained Advanced skill;
 * - `specialist`: DH2 and Only War refuse an untrained Specialist skill (a skill
 *   group taken per specialisation) and let every other skill roll at −20;
 * - `listed`: Black Crusade refuses only the skills its skill table marks;
 * - `none`: no skill is refused.
 */
type UntrainedSkillRule ='advanced' | 'specialist' | 'listed' | 'none';

/** The skills a `listed` line refuses untrained: skill key → `'*'` (every specialisation) or the named specialisations. */
type UntrainedForbiddenList =Readonly<Record<string, '*' | readonly string[]>>;

/** A line's untrained-skill rule and, for `listed`, the skills it names. */
export interface UntrainedSkillRules {
    rule: UntrainedSkillRule;
    listed: UntrainedForbiddenList;
}

/** The catalog traits the rule reads: the Advanced flag and whether the skill is a specialist group. */
export interface UntrainedSkillTraits {
    advanced: boolean;
    hasEntries: boolean;
}

/** Whether a `listed` rule names a skill, or the specialisation tested of it. */
function listedForbids(listed: UntrainedForbiddenList, skillKey: string, specialisation: string | undefined): boolean {
    const named = listed[skillKey];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (ESLint's parser project) has the flag off so it types this index access as defined, while tsconfig.json has it on and requires the undefined guard.
    if (named === undefined) return false;
    if (named === '*') return true;
    const wanted = specialisation?.trim().toLowerCase();
    return wanted !== undefined && named.some((entry) => entry.toLowerCase() === wanted);
}

/** Each rule's test of one skill. */
const RULE_TESTS: Readonly<
    Record<UntrainedSkillRule, (rules: UntrainedSkillRules, skill: UntrainedSkillTraits, skillKey: string, specialisation: string | undefined) => boolean>
> = {
    advanced: (_rules, skill) => skill.advanced,
    specialist: (_rules, skill) => skill.hasEntries,
    listed: (rules, _skill, skillKey, specialisation) => listedForbids(rules.listed, skillKey, specialisation),
    none: () => false,
};

/**
 * Whether a line's rules refuse an untrained test of a skill (#757). `specialisation`
 * is the specialisation being tested, which only a `listed` rule naming specialisations
 * reads. Pure.
 */
export function untrainedTestForbidden(rules: UntrainedSkillRules, skill: UntrainedSkillTraits, skillKey: string, specialisation?: string): boolean {
    return RULE_TESTS[rules.rule](rules, skill, skillKey, specialisation);
}

/**
 * Untrained-skill base value: the one place this rule is written (#710). In
 * lines that use aptitudes an untrained test is the full characteristic minus a
 * flat 20; career-based lines use half the characteristic, rounded down. The
 * flag is the game-system config's `usesAptitudes`. Pure.
 */
export function untrainedSkillBase(charTotal: number, usesAptitudes: boolean): number {
    return usesAptitudes ? charTotal - 20 : Math.floor(charTotal / 2);
}

export interface UntrainedTestInput {
    /** Skill rank advance: 0 = untrained, >0 = trained at some tier. */
    advance: number;
    /** Whether the skill descriptor flags itself as Basic. */
    isBasic: boolean;
    /** Characteristic total to roll against. */
    characteristicTotal: number;
    /** Optional override characteristic for the test (alt-char). Caller computes the override total. */
    altCharacteristicTotal?: number;
    /** Apply the optional non-Basic halving penalty (DH1/RT carryover). */
    halveOnNonBasic?: boolean;
    /**
     * If true, a non-Basic skill is NOT refused untrained and resolves like a Basic one.
     * The roll dialog passes `false` and sets `isBasic` from the line's own rule
     * ({@link untrainedTestForbidden}, #757); no line's rules let every skill be tried untrained.
     */
    allowUntrainedAdvanced?: boolean;
}

export interface UntrainedTestOutput {
    /** Effective target value. */
    target: number;
    /** True if RAW disallows the untrained advanced roll entirely. */
    untrainedAdvanced: boolean;
    /** True if the halving rule fired. */
    halved: boolean;
    /** True if an alternate characteristic was used. */
    usedAltCharacteristic: boolean;
}

export function resolveUntrainedTarget(input: UntrainedTestInput): UntrainedTestOutput {
    const usedAlt = typeof input.altCharacteristicTotal === 'number';
    const base = usedAlt ? input.altCharacteristicTotal ?? 0 : input.characteristicTotal;
    if (input.advance > 0) {
        return { target: base, untrainedAdvanced: false, halved: false, usedAltCharacteristic: usedAlt };
    }
    // Advance is 0 — untrained.
    if (!input.isBasic && input.allowUntrainedAdvanced !== true) {
        // The line's rules refuse this skill untrained. Caller decides whether to render the row.
        return { target: 0, untrainedAdvanced: true, halved: false, usedAltCharacteristic: usedAlt };
    }
    // Basic untrained: roll at full characteristic in DH2, halved if the
    // caller opted in (older-edition carryover).
    if (input.halveOnNonBasic === true) {
        return { target: Math.floor(base / 2), untrainedAdvanced: false, halved: true, usedAltCharacteristic: usedAlt };
    }
    return { target: base, untrainedAdvanced: false, halved: false, usedAltCharacteristic: usedAlt };
}
