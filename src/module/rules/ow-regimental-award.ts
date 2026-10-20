/**
 * Only War · Regimental Awards (#161 — OW core.md §"CREATING REGIMENTAL
 * AWARDS" line 13103).
 *
 * Pure-rules engine for the medal / honor items that recognise notable
 * deeds by Guardsmen of a particular regiment. Each Award carries a
 * structured bonus payload — a characteristic delta, a granted trait, or
 * a bonus Fate Point — that tooling reads to apply the mechanical effect
 * when the Award is conferred.
 *
 * Per Direction #7 this module owns only the data shape and the merge
 * arithmetic for combining multiple Awards into a single grant payload.
 * Concrete Awards (their names, descriptions, mission requirements, and
 * specific bonuses) live in compendium documents and are surfaced
 * through structured `RegimentalAward` fields on the consuming
 * DataModel; the engine never enumerates them.
 *
 * Parallel structure to `dw-distinction.ts` `mergeMarkGrants`: both
 * fold a set of honor items into one aggregated grant. The Awards
 * variant additionally accumulates bonus Fate Points (an OW-specific
 * concept — Deathwatch tracks Cohesion instead).
 *
 * RNG-free and actor-decoupled.
 */

import { escapeHtml } from '../utils/escape-html.ts';

/* -------------------------------------------------------------------- */
/*  Award definition                                                    */
/* -------------------------------------------------------------------- */

/**
 * The structured benefit a Regimental Award confers on its bearer.
 * All fields are optional so a single Award can grant any combination
 * of: a single characteristic modifier (e.g. +3 Willpower for a
 * commendation for valour), a trait (e.g. an honorific keyword used by
 * other rules), or one or more bonus Fate Points.
 */
interface RegimentalAwardBonus {
    /**
     * Short code of the characteristic to bump (e.g. `WS`, `WP`, `Fel`).
     * Paired with `modifier`; both must be present for a delta to apply.
     */
    characteristic?: string;
    /** Magnitude of the characteristic delta. Negative values permitted. */
    modifier?: number;
    /** Compendium UUID or canonical slug for a granted trait. */
    trait?: string;
    /** Bonus Fate Points granted to the bearer. Non-negative integer. */
    bonusFatePoint?: number;
}

export interface RegimentalAward {
    /** Stable identifier (compendium item id or canonical slug). */
    id: string;
    /** Display name (player-facing). */
    name: string;
    /** Narrative description (player-facing). */
    description: string;
    /** Structured grant payload — what the award actually does mechanically. */
    bonus: RegimentalAwardBonus;
}

/* -------------------------------------------------------------------- */
/*  Medal items                                                         */
/* -------------------------------------------------------------------- */

/**
 * The broad types of medal OW core p. 294 names: Imperial Honours, Campaign
 * Honours and Regimental Awards.
 */
export const MEDAL_HONOUR_TYPES = ['imperial', 'campaign', 'regimental'] as const;

/** One of {@link MEDAL_HONOUR_TYPES}. */
export type MedalHonourType = (typeof MEDAL_HONOUR_TYPES)[number];

/** The part of a `medal` item the Battlefield panel reads. */
export interface MedalSource {
    readonly name: string;
    readonly system: { readonly squadBonus: string };
}

/** Rules HTML as one line of plain text, for a row's tooltip. */
function plainText(html: string): string {
    return html
        .replace(/<\/?(?:p|br|div|li)\b[^>]*>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * The award descriptor a medal item projects to: its name, and its Squad Bonus
 * as the row's description. A medal's Squad Bonus is printed as rules text
 * (situational test modifiers), never as a characteristic, trait or Fate Point,
 * so its `bonus` is empty and it adds nothing to the merged readout.
 */
export function medalAwardDescriptor(medal: MedalSource, id: string): RegimentalAward {
    return { id, name: medal.name, description: plainText(medal.system.squadBonus), bonus: {} };
}

/* -------------------------------------------------------------------- */
/*  Merge                                                               */
/* -------------------------------------------------------------------- */

export interface MergedRegimentalAwards {
    /**
     * Aggregated characteristic deltas, keyed by characteristic short
     * code. Multiple Awards bumping the same characteristic stack.
     */
    characteristicDelta: Record<string, number>;
    /**
     * Granted traits, de-duplicated. Multiple Awards granting the same
     * trait id collapse to one entry.
     */
    traits: string[];
    /** Sum of bonus Fate Points across all Awards. */
    bonusFatePoints: number;
}

/**
 * Merge a set of Regimental Awards into a single aggregated grant
 * payload. Characteristic deltas sum, traits de-duplicate by id, and
 * bonus Fate Points accumulate. Awards with empty / no-op bonuses are
 * tolerated and contribute nothing.
 */
export function mergeRegimentalAwards(awards: ReadonlyArray<RegimentalAward>): MergedRegimentalAwards {
    const characteristicDelta: Record<string, number> = {};
    const traitsSet = new Set<string>();
    let bonusFatePoints = 0;

    for (const award of awards) {
        const bonus = award.bonus;
        const characteristic = bonus.characteristic;
        const modifier = bonus.modifier;
        if (characteristic !== undefined && characteristic.length > 0 && modifier !== undefined && Number.isFinite(modifier)) {
            const prior = characteristicDelta[characteristic] ?? 0;
            characteristicDelta[characteristic] = prior + modifier;
        }
        if (bonus.trait !== undefined && bonus.trait.length > 0) {
            traitsSet.add(bonus.trait);
        }
        const fate = bonus.bonusFatePoint;
        if (fate !== undefined && Number.isFinite(fate) && fate > 0) {
            bonusFatePoints += fate;
        }
    }

    return {
        characteristicDelta,
        traits: Array.from(traitsSet),
        bonusFatePoints,
    };
}

/* -------------------------------------------------------------------- */
/*  Mission filtering — placeholder                                     */
/* -------------------------------------------------------------------- */

export interface AwardableForMissionInput {
    readonly awards: ReadonlyArray<RegimentalAward>;
    /**
     * Numeric mission rating the GM has assigned to the just-completed
     * operation. Reserved for future per-award eligibility logic — the
     * current implementation is content-agnostic and simply forwards
     * the entire `awards` list to the caller, which applies its own
     * compendium-driven eligibility rules.
     */
    readonly missionRating: number;
}

/**
 * Return the Regimental Awards eligible to be conferred after a mission
 * of the given `missionRating`. Content-agnostic by design (per
 * Direction #7): this engine does not enumerate Awards or know their
 * mission-rating thresholds — those live in compendium documents. The
 * function exists as the contracted hook point so the consuming
 * DataModel / prompt has a single entry to invoke, and so per-award
 * mission gates can be added without changing call sites.
 */
export function awardableForMission(input: AwardableForMissionInput): RegimentalAward[] {
    void input.missionRating;
    return Array.from(input.awards);
}

/* -------------------------------------------------------------------- */
/*  Panel context                                                       */
/* -------------------------------------------------------------------- */

/** Id → Award descriptor lookup, supplied by the caller from compendium content. */
export type RegimentalAwardResolver = (id: string) => RegimentalAward | undefined;

/**
 * One roster row as `ow-battlefield-panel.hbs` reads it. Deliberately not
 * exported — it is reachable as `BattlefieldPanelData['availableAwards'][number]`
 * and a second exported name for the same shape is surface with no consumer.
 */
interface BattlefieldAwardRow {
    id: string;
    name: string;
    /** The award's Squad Bonus as plain text, shown under its name (#672); `''` when unknown. */
    description: string;
    /** The shared `wh40k-tooltip` generic payload: the name over the full Squad Bonus; `''` when there is none. */
    tooltipData: string;
    conferred: boolean;
}

/** The generic `wh40k-tooltip` payload for an award row, or `''` when it has no description. Pure. */
export function awardTooltipData(name: string, description: string): string {
    // The generic tooltip inserts both as markup, so both are escaped.
    return description === '' ? '' : JSON.stringify({ title: escapeHtml(name), content: `<p>${escapeHtml(description)}</p>` });
}

/** The full context `ow-battlefield-panel.hbs` declares in its header comment. */
export interface BattlefieldPanelData {
    supportCooldown: number;
    canRequestSupport: boolean;
    cooldownActive: boolean;
    availableAwards: BattlefieldAwardRow[];
    merged: MergedRegimentalAwards & {
        /** Number of conferred Awards contributing to the merge. */
        entryCount: number;
        /** True when the merge produced anything worth rendering. */
        hasAny: boolean;
    };
}

/**
 * Build the Battlefield panel context from persisted actor state.
 *
 * Same shape and the same reason as `ow-regiment-drawback.ts`
 * `buildDrawbackPanel`: the sheet was passing the raw persisted id array
 * (`{ supportCooldown, awards }`) while the template reads
 * `availableAwards[].name` / `.description` / `.conferred`, `merged.*`,
 * `canRequestSupport` and `cooldownActive`. Three of the five declared
 * context fields were absent, which produced two live defects:
 *
 *   - The template gates the button with
 *     `{{#unless battlefieldPanel.canRequestSupport}}disabled{{/unless}}`.
 *     An absent field is undefined, so `unless` always fired and the
 *     Request Support button was PERMANENTLY DISABLED — Support could
 *     never be requested at all, cooldown or not.
 *   - The cooldown badge reads `{{#if battlefieldPanel.cooldownActive}}`,
 *     also always false, so it showed the green "ready" state while the
 *     button beneath it was disabled. The panel contradicted itself.
 *
 * The roster additionally always rendered its empty state and the
 * merged-bonus readout never appeared.
 *
 * `resolve` supplies the descriptor for an id. An id that does not resolve
 * still gets a row carrying its own id as the label, so the toggle keeps
 * working when the content pack is absent or an award was renamed — an
 * award you cannot remove is strictly worse than one with a bare label.
 * Unresolved ids contribute no bonus, which is why `entryCount` counts
 * resolved descriptors rather than rows.
 *
 * Content-agnostic per Direction #7: this engine never enumerates Awards.
 *
 * An unresolved id is labelled through `nameOf`, so a stored award document
 * UUID still reads as the document's name (#161).
 *
 * @param conferredIds The actor's persisted `system.regimentalAwards`.
 * @param supportCooldown The actor's persisted `system.supportCooldown` (rounds remaining).
 * @param resolve Id → descriptor lookup.
 * @param nameOf Id → display name, for an id no descriptor resolves.
 */
export function buildBattlefieldPanel(
    conferredIds: readonly string[],
    supportCooldown: number,
    resolve: RegimentalAwardResolver,
    nameOf: (id: string) => string,
): BattlefieldPanelData {
    const cooldown = Number.isFinite(supportCooldown) && supportCooldown > 0 ? Math.trunc(supportCooldown) : 0;

    const descriptors: RegimentalAward[] = [];
    const availableAwards: BattlefieldAwardRow[] = [];
    for (const id of conferredIds) {
        if (id === '') continue;
        const descriptor = resolve(id);
        if (descriptor !== undefined) descriptors.push(descriptor);
        const name = descriptor?.name ?? nameOf(id);
        const description = descriptor?.description ?? '';
        availableAwards.push({ id, name, description, tooltipData: awardTooltipData(name, description), conferred: true });
    }

    const merged = mergeRegimentalAwards(descriptors);
    const hasAny = Object.keys(merged.characteristicDelta).length > 0 || merged.traits.length > 0 || merged.bonusFatePoints > 0;

    return {
        supportCooldown: cooldown,
        canRequestSupport: cooldown === 0,
        cooldownActive: cooldown > 0,
        availableAwards,
        merged: { ...merged, entryCount: descriptors.length, hasAny },
    };
}
