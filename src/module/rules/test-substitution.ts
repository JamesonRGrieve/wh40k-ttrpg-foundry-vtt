/**
 * Test substitutions: an owned item lets its bearer roll a different skill for a
 * test (Direction #7).
 *
 * The item declares the substitution as data on `system.modifiers.testSubstitutions`
 * ({@link TestSubstitutionEntry}): which test it replaces, the skill rolled in its
 * place, how that skill sets the target, and the conditions — the kind of attack,
 * a target type tag, a specialist skill the bearer must know. This module reads the
 * bearer's items and evaluates those conditions against the live test; it names no
 * talent and holds no content values.
 */

import type { TestSubstitutionEntry } from '../data/shared/modifiers-template.ts';
import { nonNegInt } from './_num.ts';
import type { AvoidanceSkill } from './area-template.ts';

/** An owned item as the substitution lookups read it. */
export interface SubstitutionItemLike {
    readonly name: string;
    readonly system: {
        readonly specialization?: string | null | undefined;
        readonly modifiers?: { readonly testSubstitutions?: readonly TestSubstitutionEntry[] | undefined } | undefined;
    };
}

/** One substitution an owned item grants, with the item it came from. */
export interface OwnedSubstitution {
    readonly entry: TestSubstitutionEntry;
    /** The granting item's name, for the card's provenance. */
    readonly source: string;
    /** The granting item's specialization ('' when none). */
    readonly specialization: string;
}

/** Every substitution the bearer's items grant for `test`, in item order. */
export function ownedSubstitutions(items: Iterable<SubstitutionItemLike>, test: TestSubstitutionEntry['test']): OwnedSubstitution[] {
    const out: OwnedSubstitution[] = [];
    for (const item of items) {
        // Owned items of every type pass through here; only some carry modifiers or a specialization.
        const { modifiers, specialization = '' } = item.system;
        for (const entry of modifiers?.testSubstitutions ?? []) {
            if (entry.test === test) out.push({ entry, source: item.name, specialization: (specialization ?? '').trim() });
        }
    }
    return out;
}

/** The bearer's skills as the conditions read them. */
export interface SubstitutionSkills {
    readonly [skill: string]:
        | {
              readonly current: number;
              readonly characteristic: string;
              readonly entries?:
                  | readonly { readonly name?: string; readonly specialization?: string; readonly rank?: number; readonly trained?: boolean }[]
                  | undefined;
          }
        | undefined;
}

/** Whether the bearer knows specialist `skill` (rank 1 / trained or better) in a specialization starting with `prefix`. */
export function knowsSpecialistSkill(skills: SubstitutionSkills, skill: string, prefix: string): boolean {
    const wanted = prefix.trim().toLowerCase();
    for (const entry of skills[skill]?.entries ?? []) {
        const name = (entry.name ?? '') === '' ? entry.specialization ?? '' : entry.name ?? '';
        if (wanted !== '' && !name.trim().toLowerCase().startsWith(wanted)) continue;
        if ((entry.rank ?? 0) >= 1 || entry.trained === true) return true;
    }
    return false;
}

/**
 * The replaced characteristic plus the substitute skill's own training offset (its
 * total minus its usual characteristic), so an untrained or advanced skill carries
 * over exactly — Medicae (WS) rather than Medicae (Int).
 */
export function trainingOffsetTarget(skillTotal: number, skillCharacteristicTotal: number, replacedCharacteristicTotal: number): number {
    return replacedCharacteristicTotal + (skillTotal - skillCharacteristicTotal);
}

/** The attack a Called Shot substitution is checked against. */
export interface CalledShotContext {
    readonly isCalledShot: boolean;
    readonly isRanged: boolean;
    /** The target's type tags (`collectTargetTags(...).byAxis.vsType`). */
    readonly targetTags: readonly string[];
    /** The replaced test's target (the attacker's WS or BS total). */
    readonly baseTarget: number;
    readonly skills: SubstitutionSkills;
    /** A characteristic's total by key. */
    readonly characteristicTotal: (key: string) => number;
}

/** The substituted test: the skill rolled, its target, and the item that granted it. */
export interface SubstitutedTest {
    readonly skill: string;
    readonly target: number;
    readonly source: string;
}

/** Whether the substitution's attack condition covers this attack. */
function coversAttack(owned: OwnedSubstitution, isRanged: boolean): boolean {
    const attack = owned.entry.attack;
    if (attack === 'any') return true;
    const kind = attack === 'bySpecialization' ? owned.specialization.toLowerCase() : attack;
    return kind === (isRanged ? 'ranged' : 'melee');
}

/** Whether an owned substitution's target and skill conditions hold. */
function conditionsHold(owned: OwnedSubstitution, targetTags: readonly string[], skills: SubstitutionSkills): boolean {
    const { targetTag, requiresSkill, requiresSpecialization } = owned.entry;
    if (targetTag !== '' && !targetTags.includes(targetTag)) return false;
    return requiresSkill === '' || knowsSpecialistSkill(skills, requiresSkill, requiresSpecialization);
}

/** The first substitution the bearer's items grant for this Called Shot, or null when none applies. */
export function resolveCalledShotSubstitution(items: Iterable<SubstitutionItemLike>, context: CalledShotContext): SubstitutedTest | null {
    if (!context.isCalledShot) return null;
    for (const owned of ownedSubstitutions(items, 'calledShot')) {
        if (!coversAttack(owned, context.isRanged) || !conditionsHold(owned, context.targetTags, context.skills)) continue;
        const skill = context.skills[owned.entry.skill];
        if (skill === undefined) continue;
        const target =
            owned.entry.basis === 'trainingOffset'
                ? trainingOffsetTarget(skill.current, context.characteristicTotal(skill.characteristic), context.baseTarget)
                : skill.current;
        return { skill: owned.entry.skill, target: nonNegInt(target), source: owned.source };
    }
    return null;
}

/** The skills an area-avoidance test can be rolled with (the card labels each). */
const AVOIDANCE_SKILLS: ReadonlySet<string> = new Set<AvoidanceSkill>(['agility', 'dodge']);

function isAvoidanceSkill(skill: string): skill is AvoidanceSkill {
    return AVOIDANCE_SKILLS.has(skill);
}

/**
 * The test a creature makes to avoid an area attack: Agility, or the skill one of
 * its items substitutes (a Dodge talent). Skill totals are read through `skillTotal`.
 */
export function areaAvoidanceTest(
    items: Iterable<SubstitutionItemLike>,
    agilityTotal: number,
    skillTotal: (skill: string) => number | undefined,
): { skill: AvoidanceSkill; target: number } {
    for (const owned of ownedSubstitutions(items, 'areaAvoidance')) {
        const total = skillTotal(owned.entry.skill);
        if (isAvoidanceSkill(owned.entry.skill) && total !== undefined) return { skill: owned.entry.skill, target: nonNegInt(total) };
    }
    return { skill: 'agility', target: nonNegInt(agilityTotal) };
}
