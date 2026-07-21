/**
 * @file Assistance eligibility — pure rule logic (#60).
 *
 * RAW grants +10 per assistant up to a cap (`getAssistanceBonus`), but a bare
 * count lets a player claim help from allies who aren't present or can't perform
 * the skill. This module decides WHO may assist, so the dialog can offer one chip
 * per eligible ally and derive the bonus from the selection instead of a free
 * integer — which also gives the chat card its assistant names for free.
 *
 * Foundry-free so it is unit-testable; the dialog injects token/actor descriptors.
 */

/** Whether an actor is trained enough in a skill to render aid. */
export interface AssistSkillSource {
    /** Character actors: `system.skills[key] = { advance }`. */
    skills?: Record<string, { advance?: number } | undefined> | undefined;
    /**
     * NPC actors use a separate trained-skill map (skill key → target number)
     * rather than the full character skill schema.
     */
    trainedSkills?: Record<string, number | undefined> | undefined;
}

/** A potential assistant, projected from a token on the active scene. */
export interface AssistCandidate {
    /** Stable id used as the chip's toggle key (the token id). */
    id: string;
    name: string;
    /** Foundry token disposition: 1 friendly, 0 neutral, -1 hostile. */
    disposition: number;
    /** True when this token belongs to the actor making the roll. */
    isSelf: boolean;
    /**
     * The candidate's skill store. Nullable/optional so a token whose actor
     * carries no system data passes straight through — `actorKnowsSkill` treats
     * an absent store as "cannot assist", so no call-site fallback is needed.
     */
    actor: AssistSkillSource | null | undefined;
}

/** Foundry's TOKEN_DISPOSITIONS.FRIENDLY. Local so the module stays Foundry-free. */
const DISPOSITION_FRIENDLY = 1;

/**
 * Whether an actor knows the skill well enough to assist.
 *
 * Characters store skills in `system.skills` with an `advance` rank; NPCs use a
 * `trainedSkills` map instead, so both stores are checked. RAW assistance is
 * generally trained-only, so an untrained ally (advance 0 / absent) is excluded —
 * the GM can still override via the cap argument to `getAssistanceBonus` for the
 * group-effort exceptions the corebook calls out.
 */
export function actorKnowsSkill(actor: AssistSkillSource | null | undefined, skillKey: string | null): boolean {
    if (actor == null || skillKey === null || skillKey === '') return false;
    const advance = actor.skills?.[skillKey]?.advance;
    if (typeof advance === 'number' && advance > 0) return true;
    return actor.trainedSkills?.[skillKey] !== undefined;
}

/**
 * Filter scene tokens down to the allies who may assist this test: friendly
 * disposition, not the roller themselves, and trained in the skill being rolled.
 *
 * Returns [] when the roll has no skill key (a characteristic test has no
 * "knows the skill" notion, so no chips are offered rather than every ally).
 * Deduplicates by actor so one actor with several tokens on the map contributes
 * a single chip.
 */
export function eligibleAssistants(candidates: readonly AssistCandidate[], skillKey: string | null): AssistCandidate[] {
    if (skillKey === null || skillKey === '') return [];
    const seen = new Set<string>();
    const out: AssistCandidate[] = [];
    for (const candidate of candidates) {
        if (candidate.isSelf) continue;
        if (candidate.disposition !== DISPOSITION_FRIENDLY) continue;
        if (!actorKnowsSkill(candidate.actor, skillKey)) continue;
        if (seen.has(candidate.name)) continue;
        seen.add(candidate.name);
        out.push(candidate);
    }
    return out;
}

/**
 * Narrow a selection set to ids that are still eligible, preserving selection
 * order. Guards the case where a chip was toggled on and the token then left the
 * scene / the roll's skill changed — the stale id must not keep contributing a
 * +10 that no longer has a visible chip behind it.
 */
export function retainEligibleSelection(selectedIds: ReadonlySet<string>, eligible: readonly AssistCandidate[]): AssistCandidate[] {
    return eligible.filter((candidate) => selectedIds.has(candidate.id));
}
