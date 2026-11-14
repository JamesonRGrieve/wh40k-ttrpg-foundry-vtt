/**
 * Aptitude grants, duplicates and the swap pool (#717): pure rules over plain data.
 *
 * Aptitudes compare by canonical identity (trimmed, whitespace-collapsed,
 * lower-cased), so "Willpower" and " willpower" are the same aptitude. The first
 * literal spelling seen is kept for display and as the override key.
 */
import { iterateResolvedChoices } from '../../utils/origin-choices.ts';
import type { GrantChoiceRaw } from './origin-path/builder-support.ts';

/** The part of an origin's system data that grants aptitudes. */
export interface AptitudeGrantSource {
    grants?: { aptitudes?: string[]; choices?: GrantChoiceRaw[] };
    selectedChoices?: Record<string, string[]>;
}

/** An aptitude granted twice, or granted again when the actor already has it. */
export interface AptitudeCollision {
    original: string;
    /** The chosen swap; '' means the player skipped it; null means not yet chosen. */
    replacement: string | null;
}

/** The canonical identity two aptitude spellings compare by. */
export function normalizeAptitudeIdentity(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** Add the aptitudes an aptitude-typed choice resolved to into `into`. */
export function collectAptitudeChoices(choice: GrantChoiceRaw, selectedValues: readonly string[], into: Set<string>): void {
    for (const selectedValue of selectedValues) {
        const option = choice.options?.find((o) => o.value === selectedValue || o.name === selectedValue);
        const aptName = (option?.value !== undefined && option.value !== '' ? option.value : option?.name) ?? selectedValue;
        if (aptName !== '') into.add(aptName);
    }
}

/** The aptitudes one origin grants, deduplicated within it: fixed grants plus resolved aptitude choices. */
export function grantedAptitudes(system: AptitudeGrantSource): Set<string> {
    const grants = system.grants ?? {};
    const out = new Set<string>();
    for (const apt of grants.aptitudes ?? []) if (apt !== '') out.add(apt);
    const choices = grants.choices ?? [];
    if (choices.length === 0) return out;
    for (const { choice, selectedValues } of iterateResolvedChoices(choices, system.selectedChoices ?? {})) {
        if (choice.type === 'aptitude') collectAptitudeChoices(choice, selectedValues, out);
    }
    return out;
}

/** How many origins grant each aptitude (each origin counts once per aptitude). */
export function aptitudeGrantCounts(grantSets: Iterable<ReadonlySet<string>>): Map<string, number> {
    const counts = new Map<string, number>();
    for (const set of grantSets) for (const apt of set) counts.set(apt, (counts.get(apt) ?? 0) + 1);
    return counts;
}

/** Origin data read for the aptitudes it names; raw compendium options may be bare strings. */
export interface AptitudeReferenceSource {
    grants?: {
        aptitudes?: string[];
        choices?: ReadonlyArray<{ type?: string; options?: ReadonlyArray<string | { value?: string; name?: string }> }>;
    };
}

/** Every aptitude an origin names, fixed or offered as a choice option. */
export function referencedAptitudes(system: AptitudeReferenceSource): string[] {
    const grants = system.grants ?? {};
    const out: string[] = (grants.aptitudes ?? []).filter((apt) => apt !== '');
    for (const choice of grants.choices ?? []) {
        if (choice.type !== 'aptitude') continue;
        for (const opt of choice.options ?? []) {
            const name = typeof opt === 'string' ? opt : (opt.value !== undefined && opt.value !== '' ? opt.value : opt.name) ?? '';
            if (name !== '') out.push(name);
        }
    }
    return out;
}

/**
 * The aptitudes a duplicate may be swapped for: characteristic aptitudes only
 * (`characteristicLabels`), none already taken, each once. The mined `pool` keeps
 * its spellings; any characteristic aptitude it lacks is topped up from the labels.
 * Sorted for display.
 */
export function swapCandidates(pool: Iterable<string>, characteristicLabels: readonly string[], taken: Iterable<string>): string[] {
    const characteristicKeys = new Set(characteristicLabels.filter((l) => l !== '').map(normalizeAptitudeIdentity));
    const takenKeys = new Set([...taken].map(normalizeAptitudeIdentity));
    const seen = new Set<string>();
    const result: string[] = [];
    const offer = (apt: string): void => {
        const key = normalizeAptitudeIdentity(apt);
        if (takenKeys.has(key) || seen.has(key) || !characteristicKeys.has(key)) return;
        seen.add(key);
        result.push(apt);
    };
    for (const apt of pool) offer(apt);
    for (const label of characteristicLabels) if (label !== '') offer(label);
    return result.sort((a, b) => a.localeCompare(b));
}

/** The swap recorded for `original`, matched by canonical identity; undefined when none. */
export function findAptitudeOverride(overrides: ReadonlyMap<string, string>, original: string): string | undefined {
    const direct = overrides.get(original);
    if (direct !== undefined) return direct;
    const key = normalizeAptitudeIdentity(original);
    for (const [k, v] of overrides) if (normalizeAptitudeIdentity(k) === key) return v;
    return undefined;
}

/**
 * The collisions: an aptitude granted by more than one origin (counts folded by
 * canonical identity), or granted when the actor already has it independently.
 * Sorted by name.
 */
export function aptitudeCollisions(
    counts: ReadonlyMap<string, number>,
    existing: Iterable<string>,
    lookupOverride: (original: string) => string | undefined,
): AptitudeCollision[] {
    const existingKeys = new Set([...existing].map(normalizeAptitudeIdentity));
    const folded = new Map<string, { display: string; count: number }>();
    for (const [apt, count] of counts) {
        const key = normalizeAptitudeIdentity(apt);
        const prior = folded.get(key);
        if (prior === undefined) folded.set(key, { display: apt, count });
        else prior.count += count;
    }
    const collisions: AptitudeCollision[] = [];
    for (const [key, { display, count }] of folded) {
        if (count > 1 || existingKeys.has(key)) collisions.push({ original: display, replacement: lookupOverride(display) ?? null });
    }
    return collisions.sort((a, b) => a.original.localeCompare(b.original));
}
