/**
 * @file Skill specialisation index (#498).
 *
 * Buying a specialist skill (Common Lore, Trade, Linguistics…) used to be a
 * free-text typing exercise with no canonical list. Nothing validated the typed
 * string, so a near-miss spelling created a NEW paid track that the roll engine —
 * which matches specialisations by name/slug — could not find: the player paid
 * XP for a skill that rolls untrained (#225).
 *
 * The rulebook's specialisations are now authored on the skill compendium
 * documents (`system.specializations`), transcribed from each line's own skills
 * chapter. This indexes them at `ready` and looks them up by the actor's skill
 * key, exactly as `skill-variant-index.ts` does for test variants (#440) — the
 * actor's skills live in `system.skills`, a SchemaField, not as embedded Items,
 * so reading them off an owned Item finds nothing.
 *
 * Keys normalise to lowercase alphanumerics so every spelling of one skill
 * collides: the actor's camelCase key (`commonLore`), the pack doc's display name
 * (`Common Lore`), and Foundry's derived kebab identifier (`common-lore`) all
 * reduce to `commonlore`.
 */

import { type LoadablePack, loadLinePackDocs } from '../utils/line-pack-docs.ts';

/** Minimal shape of a skill pack document this module reads. */
interface SkillPackDoc {
    name?: string | undefined;
    system?: { identifier?: string | undefined; specializations?: string[] | undefined } | undefined;
}

interface PackGameLike {
    packs?: Iterable<LoadablePack<SkillPackDoc>> | undefined;
}

let specializationsBySystem: Map<string, Map<string, string[]>> | null = null;
let specializationsFlat: Map<string, string[]> | null = null;

/**
 * Reduce any spelling of a skill's name/key to one comparison key: lowercase,
 * alphanumerics only. `Common Lore` / `commonLore` / `common-lore` → `commonlore`.
 * @param {string} value  A skill name, key or identifier.
 * @returns {string}  The comparison key.
 */
export function normalizeSkillKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Build the per-line specialisation index from every line's skills
 * compendiums. Call once on `ready`; idempotent.
 *
 * Only skills that actually declare specialisations are indexed. An empty list is
 * indistinguishable from "not found" to callers — and both correctly mean "offer
 * the free-text path" — so storing them would only grow the map.
 * @returns {Promise<void>}
 */
export async function buildSkillSpecializationIndex(): Promise<void> {
    const bySystem = new Map<string, Map<string, string[]>>();
    const flat = new Map<string, string[]>();
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `game` is a runtime global with no shipped type at this seam
    const packGame = (globalThis as unknown as { game?: PackGameLike }).game;
    const perPack = await loadLinePackDocs(packGame?.packs ?? [], 'skills');

    for (const { line: systemId, docs: packDocs } of perPack) {
        for (const doc of packDocs) {
            const specializations = doc.system?.specializations;
            if (!Array.isArray(specializations) || specializations.length === 0) continue;
            const keys = [doc.name, doc.system?.identifier].filter((k): k is string => typeof k === 'string' && k.trim() !== '').map(normalizeSkillKey);
            let systemMap = bySystem.get(systemId);
            if (systemMap === undefined) {
                systemMap = new Map<string, string[]>();
                bySystem.set(systemId, systemMap);
            }
            for (const key of keys) {
                systemMap.set(key, specializations);
                if (!flat.has(key)) flat.set(key, specializations);
            }
        }
    }

    specializationsBySystem = bySystem;
    specializationsFlat = flat;
}

/**
 * A skill's canonical specialisations, by the actor's skill key.
 *
 * Returns `[]` when the skill declares none or the index is not built — which the
 * picker reads as "this skill has no canonical list", falling through to the
 * explicit free-text path rather than offering an empty select.
 * @param {string} skillKey  The actor's skill key, name or identifier.
 * @param {string} [systemId]  Game line to scope to; falls back cross-line.
 * @returns {string[]}  Specialisations in book order.
 */
export function getSpecializationsForSkill(skillKey: string, systemId?: string): string[] {
    const key = normalizeSkillKey(skillKey);
    if (key === '') return [];
    if (systemId !== undefined) {
        const scoped = specializationsBySystem?.get(systemId)?.get(key);
        if (scoped !== undefined) return scoped;
    }
    return specializationsFlat?.get(key) ?? [];
}

/** Seed the index directly (unit tests / stories — no Foundry pack available). */
export function setSpecializationsForTesting(entries: Record<string, string[]>, systemId?: string): void {
    const flat = new Map(Object.entries(entries).map(([name, list]) => [normalizeSkillKey(name), list]));
    specializationsFlat = flat;
    specializationsBySystem = systemId === undefined ? null : new Map([[systemId, flat]]);
}
