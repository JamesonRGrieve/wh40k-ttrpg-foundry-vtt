/**
 * @file Skill pack index (#440, #498, #707).
 *
 * Two lists are authored on the skill compendium documents and read by the
 * actor's skill key:
 *
 * - **Test variants** (`system.variants`, #440) — Awareness → Visual / Auditory /
 *   Olfactory. The roll dialog used to read them off an *owned skill Item*, but a
 *   character's skills live in `system.skills`, a SchemaField generated from
 *   `SKILL_DEFINITIONS`, not as embedded Items. Unless an origin/background grant
 *   happened to place an Awareness Item on the actor, the lookup found nothing and
 *   the sense-channel selector never rendered.
 * - **Specialisations** (`system.specializations`, #498) — the rulebook's list for
 *   a specialist skill (Common Lore, Trade, Linguistics…). Buying one used to be a
 *   free-text typing exercise; a near-miss spelling created a NEW paid track the
 *   roll engine could not match, so the player paid XP for a skill that rolls
 *   untrained (#225).
 *
 * Both are indexed from every line's skills packs in ONE pass at `ready`: the
 * packs are read once and each document fills both lists (#707).
 *
 * Keys are normalised to lowercase alphanumerics so every spelling of the same
 * skill collides: the actor's camelCase key (`sleightOfHand`), the pack doc's
 * display name (`Sleight of Hand`), and the kebab identifier Foundry derives in
 * `Item#_preCreate` (`sleight-of-hand`) all reduce to `sleightofhand`. The pack
 * docs carry no `identifier` of their own, so the display name is the real key.
 */

import { loadLinePackIndex } from '../utils/line-pack-docs.ts';
import type { IndexablePack } from '../utils/pack-index.ts';
import type { SkillVariant } from './skill-variants.ts';

/** The index row of a skill pack entry this module reads (stored source: `identifier` may be null). */
interface SkillPackDoc {
    name?: string | undefined;
    system?:
        | {
              identifier?: string | null | undefined;
              variants?: SkillVariant[] | undefined;
              specializations?: string[] | undefined;
          }
        | undefined;
}

interface PackGameLike {
    packs?: Iterable<IndexablePack<SkillPackDoc>> | undefined;
}

/**
 * Reduce any spelling of a skill's name/key to a single comparison key:
 * lowercase, alphanumerics only. `Sleight of Hand` / `sleightOfHand` /
 * `sleight-of-hand` → `sleightofhand`.
 */
export function normalizeSkillKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * One list per skill, per game line, with a cross-line fallback: the list the
 * first line to author the skill declares, for a line whose own packs author
 * none.
 */
class SkillListIndex<T> {
    /** line → skill key → list */
    readonly #byLine = new Map<string, Map<string, T[]>>();
    /** skill key → the first authored list across lines */
    readonly #flat = new Map<string, T[]>();

    /** Drop every entry. */
    clear(): void {
        this.#byLine.clear();
        this.#flat.clear();
    }

    /** Record `list` for `line` under each of the (already normalised) `keys`. */
    add(line: string, keys: readonly string[], list: T[]): void {
        const lineMap = this.#lineMap(line);
        for (const key of keys) {
            lineMap.set(key, list);
            if (!this.#flat.has(key)) this.#flat.set(key, list);
        }
    }

    /**
     * The list for a skill key in any spelling, scoped to `line` when given and
     * falling back across lines. `[]` when nothing is authored or indexed.
     */
    get(skillKey: string, line?: string): T[] {
        const key = normalizeSkillKey(skillKey);
        if (key === '') return [];
        if (line !== undefined) {
            const scoped = this.#byLine.get(line)?.get(key);
            if (scoped !== undefined) return scoped;
        }
        return this.#flat.get(key) ?? [];
    }

    /** Replace the whole index with `entries` (skill name → list), scoped to `line` when given. */
    seed(entries: Record<string, T[]>, line?: string): void {
        this.clear();
        for (const [name, list] of Object.entries(entries)) {
            const key = normalizeSkillKey(name);
            this.#flat.set(key, list);
            if (line !== undefined) this.#lineMap(line).set(key, list);
        }
    }

    /** The map of `line`, created on first use. */
    #lineMap(line: string): Map<string, T[]> {
        let lineMap = this.#byLine.get(line);
        if (lineMap === undefined) {
            lineMap = new Map<string, T[]>();
            this.#byLine.set(line, lineMap);
        }
        return lineMap;
    }
}

const variantIndex = new SkillListIndex<SkillVariant>();
const specializationIndex = new SkillListIndex<string>();

/**
 * Build both per-line lists from every line's skills compendiums, reading each
 * pack once. Call once on `ready`; idempotent (rebuilds the index).
 *
 * Only a skill that actually declares a list is indexed for it — the vast
 * majority declare neither, and an empty array is indistinguishable from "not
 * found" to callers, so storing them would just grow the maps.
 */
export async function buildSkillPackIndex(): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `game` is a runtime global with no shipped type at this seam
    const packGame = (globalThis as unknown as { game?: PackGameLike }).game;
    const perPack = await loadLinePackIndex(packGame?.packs ?? [], 'skills');

    variantIndex.clear();
    specializationIndex.clear();
    for (const { line, entries: docs } of perPack) {
        for (const doc of docs) {
            // Index under both the display name and any authored identifier; both
            // normalise to the same key today, but an authored identifier that
            // diverges from the name should still resolve.
            const keys = [doc.name, doc.system?.identifier].filter((k): k is string => typeof k === 'string' && k.trim() !== '').map(normalizeSkillKey);
            const variants = doc.system?.variants;
            if (Array.isArray(variants) && variants.length > 0) variantIndex.add(line, keys, variants);
            const specializations = doc.system?.specializations;
            if (Array.isArray(specializations) && specializations.length > 0) specializationIndex.add(line, keys, specializations);
        }
    }
}

/**
 * Look up a skill's declared test variants by the actor's skill key
 * (case/separator-insensitive), optionally scoped to a game system. Falls back to
 * the cross-system entry when no system is given or that system authors none.
 * Returns `[]` when the skill declares no variants or the index is not built.
 */
export function getSkillVariantsForKey(skillKey: string, systemId?: string): SkillVariant[] {
    return variantIndex.get(skillKey, systemId);
}

/**
 * A skill's canonical specialisations, in book order, by the actor's skill key.
 *
 * Returns `[]` when the skill declares none or the index is not built — which the
 * picker reads as "this skill has no canonical list", falling through to the
 * explicit free-text path rather than offering an empty select. Scoped to
 * `systemId` when given, falling back across lines.
 */
export function getSpecializationsForSkill(skillKey: string, systemId?: string): string[] {
    return specializationIndex.get(skillKey, systemId);
}

/** Seed the variant list directly (unit tests / stories — no Foundry pack available there). */
export function setSkillVariantsForTesting(entries: Record<string, SkillVariant[]>, systemId?: string): void {
    variantIndex.seed(entries, systemId);
}

/** Seed the specialisation list directly (unit tests / stories — no Foundry pack available there). */
export function setSpecializationsForTesting(entries: Record<string, string[]>, systemId?: string): void {
    specializationIndex.seed(entries, systemId);
}
