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

/** One NPC trained-skill entry (`NPCV2TrainedSkill` in `data/actor/npc.ts`). */
export interface AssistTrainedSkill {
    trained?: boolean;
    plus10?: boolean;
    plus20?: boolean;
    plus30?: boolean;
}

/**
 * Whether an actor is trained enough in a skill to render aid.
 *
 * Characters and NPCs store skills in genuinely different shapes, and an ally is
 * offered only if this resolves — so getting the NPC shapes wrong silently
 * narrows the assistant list to player characters (#488).
 */
export interface AssistSkillSource {
    /**
     * Character actors: `system.skills[key] = { advance }`.
     *
     * NPCs may instead expose a flat `skillKey → target number` map, so a numeric
     * value is accepted here too rather than being read as `{ advance }` and
     * silently yielding `undefined`.
     */
    skills?: Record<string, { advance?: number } | number | undefined> | undefined;
    /**
     * NPC actors carry a sparse trained-skill map whose values are ENTRY OBJECTS
     * (`{ trained, plus10, … }`), not numbers. The previous `number` typing meant
     * the presence check passed for any entry — including one explicitly marked
     * untrained.
     */
    trainedSkills?: Record<string, AssistTrainedSkill | number | undefined> | undefined;
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

    // Character shape: an advance rank above 0.
    const skillEntry = actor.skills?.[skillKey];
    if (typeof skillEntry === 'object' && typeof skillEntry.advance === 'number' && skillEntry.advance > 0) return true;
    // NPC flat map: skillKey → target number. A 0/absent target is not training.
    if (typeof skillEntry === 'number' && skillEntry > 0) return true;

    // NPC trained-skill entry. Values are objects, so a bare presence check would
    // count an entry explicitly flagged untrained — read the rank flags instead.
    const trained = actor.trainedSkills?.[skillKey];
    if (typeof trained === 'number') return trained > 0;
    if (typeof trained === 'object') {
        return trained.trained === true || trained.plus10 === true || trained.plus20 === true || trained.plus30 === true;
    }
    return false;
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
