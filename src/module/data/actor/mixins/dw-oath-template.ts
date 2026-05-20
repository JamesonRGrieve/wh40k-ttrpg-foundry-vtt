/**
 * DW Mission Oaths (#168 — core.md Table 7-16 §"OATHS", p.10165) schema slot.
 *
 * Oaths are a kill-team SQUAD-LEVEL contract that the leader swears at the
 * start of the mission. For first integration we attach the leader marker
 * + the active-oath pointer to the character DataModel; once a dedicated
 * `dw-killteam` actor type exists, the same schema-fields function can be
 * spread there instead — that is why this exports fields + a declarations
 * interface rather than a full mixin class.
 *
 * Pure schema slot. Gating + projection (`canSwearOath`, `swearOath`,
 * `releaseOath`, `isOathActive`) live in `src/module/rules/dw-oath.ts`;
 * this file only persists the two values the resolver and the sheet
 * panel read/write:
 *
 *   - `activeOathId`  — the compendium id of the currently sworn Oath,
 *                       or `null` while no Oath is active. RAW: one Oath
 *                       per mission per leader; `releaseOath` clears it.
 *   - `isLeader`      — whether this character is the kill-team leader.
 *                       Only the leader may swear an Oath; the rest of
 *                       the kill-team is bound by what their leader has
 *                       sworn.
 *
 * The orchestrator merges `dwOathSchemaFields()` into the CharacterData
 * defineSchema() and applies the `DwOathDeclarations` shape to the class
 * via the standard `declare` block. The panel and actions read these
 * fields off `system`; no class-level mixin is needed for this round.
 */

const { StringField, BooleanField } = foundry.data.fields;

/**
 * Class-level `declare` shape contributed by the Mission Oath schema
 * slot. The orchestrator splices these declarations onto CharacterData
 * so the compiler narrows `actor.system.activeOathId` etc. without
 * casts.
 */
export interface DwOathDeclarations {
    activeOathId: string | null;
    isLeader: boolean;
}

/**
 * Schema-field bundle for the Mission Oath slot. Spread into a
 * DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...dwOathSchemaFields(),
 *     };
 *
 * `activeOathId` is `nullable: true` with `initial: null` because the
 * leader has no active Oath until one is sworn, and `releaseOath`
 * clears it back to `null`. `isLeader` defaults to `false` so the slot
 * stays safe for non-DW actors that happen to be reflected over this
 * schema — the values exist but the panel gate keeps them invisible.
 */
export function dwOathSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        activeOathId: new StringField({ required: true, nullable: true, initial: null, blank: false }),
        isLeader: new BooleanField({ required: true, initial: false }),
    };
}
