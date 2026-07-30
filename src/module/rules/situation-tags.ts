/**
 * Situation tags (#518) — the one place that turns live documents into the
 * *situation* inputs a dynamic-modifier hook is gated on.
 *
 * `rules/dynamic-modifiers.ts` evaluates a hook's trigger against a
 * `DynamicModifierSituation`: what the target is (`vsType` / `vsFaction` /
 * `vsAlignment` read `targetTags`), what state the acting actor is in
 * (`whileState` reads `states`), and how far away the target is (`rangeBand` /
 * `when: atRangeBand` read `rangeBand`). Those three inputs were declared and
 * read but never produced, so every hook using them silently evaluated to "does
 * not apply". This module produces them.
 *
 * **Content-agnostic by construction (Direction #7).** Every tag is DERIVED —
 * from a schema enum (`system.nature`), a schema string slot
 * (`system.faction`), the actor document's own registered type, or the *kind* of
 * an owned item (`trait` / `vehicleTrait`). No content name, faction, or
 * creature-group string is written here; the specific value a hook tests
 * (`'daemon'`, `'khorne'`, `'chaos-space-marines'`) is authored on the
 * compendium item. That inversion is the point — it is what makes a
 * name-matcher such as `rules/hatred.ts` retirable instead of load-bearing.
 *
 * The target's NAME is deliberately NOT a tag. Matching on a display name is the
 * offender pattern this channel exists to replace; a tag has to come from a
 * structured field or a document type, so content authors get a stable
 * vocabulary rather than whatever an NPC happens to be called.
 *
 * Foundry-free and pure, so it unit-tests directly.
 */

/** The target-tag axes the `vsType` / `vsFaction` / `vsAlignment` conditions test. */
export const TARGET_TAG_AXES = ['vsType', 'vsFaction', 'vsAlignment'] as const;

/** One target-tag axis — the same string the hook's `condition` carries. */
export type TargetTagAxis = (typeof TARGET_TAG_AXES)[number];

/**
 * Target tags grouped by the axis that produced them. An axis mapped to an empty
 * list is the signal that NO value on that axis could ever match this target —
 * which is how the engine tells "does not apply" apart from "was never asked".
 */
export type TargetTagsByAxis = Readonly<Record<TargetTagAxis, readonly string[]>>;

/** The derived tag set for one target. */
export interface TargetTags {
    /** Every tag, flattened and de-duplicated — the set the `vs*` conditions test membership in. */
    all: readonly string[];
    /** The same tags grouped by axis, so an axis that contributed nothing is detectable. */
    byAxis: TargetTagsByAxis;
}

/** The DataModel slots a target contributes tags from. All optional — actor types differ. */
interface TargetTagSystem {
    /** NPC creature nature (`swarm` / `creature` / `daemon` / `xenos`); `none` contributes nothing. */
    nature?: string | null | undefined;
    /** NPC RAW magnitude tier (`troop` / `elite` / `master` / `horde`). */
    tier?: string | null | undefined;
    /** IM NPC species slot. */
    species?: string | null | undefined;
    /** Organisation the target belongs to. */
    faction?: string | null | undefined;
    /** Sub-organisation within {@link faction}. */
    subfaction?: string | null | undefined;
    /** Broad side the target serves (Imperium / Chaos / …) — an alignment, not an organisation. */
    allegiance?: string | null | undefined;
    /** BC Chaos alignment (`unaligned` / `khorne` / `nurgle` / `slaanesh` / `tzeentch`). */
    chaosAlignment?: string | null | undefined;
}

/** An owned item, read only for its registered TYPE and name — never for content matching. */
interface TargetTagItem {
    type?: string | null | undefined;
    name?: string | null | undefined;
}

/**
 * The minimal target-actor surface tags are derived from. The live Foundry actor
 * satisfies it structurally; tests pass plain fixtures.
 */
export interface TargetTagSource {
    /** The registered actor type, `<line>-<role>` (e.g. `dh2-npc`); the role half becomes a type tag. */
    type?: string | null | undefined;
    system?: TargetTagSystem | null | undefined;
    items?: Iterable<TargetTagItem> | null | undefined;
}

/** The minimal actor surface {@link collectActorStates} reads. */
export interface ActorStateSource {
    /** Foundry status ids currently on the actor (`actor.statuses`). */
    statuses?: Iterable<string> | null | undefined;
    /** Active-Effect documents; a non-disabled effect's name is a state. */
    effects?: Iterable<{ name?: string | null | undefined; disabled?: boolean | undefined }> | null | undefined;
}

/**
 * Owned-item types that describe WHAT a target is (rather than what it carries).
 * Traits are the canonical creature descriptor — Daemonic, Machine, From Beyond —
 * and are what an authored `vsType` hook is expected to key on.
 */
const TYPE_TAG_ITEM_TYPES: ReadonlySet<string> = new Set(['trait', 'vehicleTrait']);

/** NPC `nature` value meaning "ordinary humanoid"; contributes no tag. */
const NATURE_NONE = 'none';

/**
 * The `whileState` slug for a declared Aim. Aim is a roll option rather than an
 * actor condition, so it is the one state not already carried by `actor.statuses`
 * and each channel derives it. Shared so the to-hit and damage channels cannot
 * disagree on its spelling — a hook keyed on `aiming` must mean the same thing to
 * both, or it fires on one and not the other.
 */
export const AIM_STATE = 'aiming';

/**
 * Normalise a raw value to a tag slug: camelCase and word boundaries become
 * hyphens, everything lower-cases, and any run of non-alphanumerics collapses.
 * `'Point Blank'`, `'pointBlank'` and `'POINT_BLANK'` all slug to `point-blank`,
 * so authored content and derived values meet in one spelling.
 */
export function normalizeTag(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Push `value`'s slug onto `into` when it is a non-blank string. */
function pushTag(into: string[], value: string | null | undefined): void {
    if (value === null || value === undefined) return;
    const tag = normalizeTag(value);
    if (tag !== '' && !into.includes(tag)) into.push(tag);
}

/**
 * The role half of a registered actor type — `dh2-npc` → `npc`, `rt-voidcraft` →
 * `voidcraft`, bare `loot` → `loot`. The game-line prefix is deliberately
 * dropped: which rulebook an actor runs on is not what it *is*.
 */
function actorRole(type: string | null | undefined): string {
    if (type === null || type === undefined) return '';
    const parts = type.split('-');
    return parts[parts.length - 1] ?? '';
}

/** Type-axis tags: actor role, NPC nature/tier, IM species, and every trait item. */
function typeTags(target: TargetTagSource): string[] {
    const tags: string[] = [];
    pushTag(tags, actorRole(target.type));
    const system = target.system;
    if (system != null) {
        if (system.nature !== NATURE_NONE) pushTag(tags, system.nature);
        pushTag(tags, system.tier);
        pushTag(tags, system.species);
    }
    for (const item of target.items ?? []) {
        const itemType = item.type;
        if (itemType == null || !TYPE_TAG_ITEM_TYPES.has(itemType)) continue;
        pushTag(tags, item.name);
    }
    return tags;
}

/** Faction-axis tags: the organisation and sub-organisation slots. */
function factionTags(system: TargetTagSystem | null | undefined): string[] {
    const tags: string[] = [];
    if (system == null) return tags;
    pushTag(tags, system.faction);
    pushTag(tags, system.subfaction);
    return tags;
}

/**
 * Alignment-axis tags: the BC Chaos alignment plus the NPC `allegiance` slot.
 * `allegiance` records the broad side an NPC serves (Imperium / Chaos / Xenos),
 * which is an alignment statement rather than membership of an organisation —
 * `faction` / `subfaction` carry the latter.
 */
function alignmentTags(system: TargetTagSystem | null | undefined): string[] {
    const tags: string[] = [];
    if (system == null) return tags;
    pushTag(tags, system.chaosAlignment);
    pushTag(tags, system.allegiance);
    return tags;
}

/**
 * Derive the tag set for a target. A missing target yields every axis empty,
 * which the engine reads as "no `vs*` condition can match" rather than silently
 * failing each one.
 */
export function collectTargetTags(target: TargetTagSource | null | undefined): TargetTags {
    if (target == null) return { all: [], byAxis: { vsType: [], vsFaction: [], vsAlignment: [] } };
    const byAxis: TargetTagsByAxis = {
        vsType: typeTags(target),
        vsFaction: factionTags(target.system),
        vsAlignment: alignmentTags(target.system),
    };
    const all: string[] = [];
    for (const axis of TARGET_TAG_AXES) {
        for (const tag of byAxis[axis]) if (!all.includes(tag)) all.push(tag);
    }
    return { all, byAxis };
}

/**
 * Derive the acting actor's state slugs for `condition: whileState` — its active
 * Foundry status ids plus the names of its non-disabled Active Effects, which is
 * the same vocabulary the conditions registry writes. An actor under no
 * conditions yields an empty list (a real "no state"), never `undefined` (which
 * the engine reserves for "this input was never supplied").
 */
export function collectActorStates(actor: ActorStateSource | null | undefined): string[] {
    const states: string[] = [];
    if (actor == null) return states;
    for (const status of actor.statuses ?? []) pushTag(states, status);
    for (const effect of actor.effects ?? []) {
        if (effect.disabled === true) continue;
        pushTag(states, effect.name);
    }
    return states;
}

/**
 * Slug a range bracket (`pointBlank` / `short` / … / `melee`, as produced by
 * `utils/range-calculator.ts` and stored on the roll) into the `rangeBand`
 * vocabulary a hook's `conditionValue` is authored against. Returns `undefined`
 * when the roll never computed a bracket, so the engine can tell that apart from
 * a band that simply did not match.
 */
export function rangeBandOf(bracket: string | null | undefined): string | undefined {
    if (bracket === null || bracket === undefined) return undefined;
    const band = normalizeTag(bracket);
    return band === '' ? undefined : band;
}
