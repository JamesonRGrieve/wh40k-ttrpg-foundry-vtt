/**
 * Ace role — Right Stuff Fate spend (#100).
 *
 * Summary: besides the usual Fate uses, an Ace can burn one Fate point to
 * pass a vehicle- or mount-related Operate or Survival test outright, scoring
 * DoS equal to their Agility bonus.
 *
 * This module is pure logic plus one runtime entry point. The
 * `RightStuffDialog` gates the "Spend Fate (Right Stuff)" button on
 * {@link actorIsAce} and {@link actorHasFatePoints}, then calls
 * {@link spendRightStuff}. The numeric Ace registry already lives in
 * `xenos-features.ts` ({@link RIGHT_STUFF}); this module adds the
 * runtime — detection, fate deduction, chat card — without restating
 * the constants.
 *
 * Sister file to `medicae-mechadendrite.ts` (errata Half-Action staunch)
 * under `rules/`. Per Direction
 * #7, the role and its applicable skills are content from the
 * compendium and `RIGHT_STUFF.applicableSkills`; this file is the
 * content-agnostic resolution primitive only.
 */

import { emitChatFromTemplate } from '../rolls/roll-helpers.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import { hasItemWithIdentifier, type IdentifiableItem } from '../utils/item-identifier.ts';
import { RIGHT_STUFF } from './xenos-features.ts';

/** Skill keys Right Stuff applies to (mirrors `RIGHT_STUFF.applicableSkills`). */
export type RightStuffSkill = (typeof RIGHT_STUFF.applicableSkills)[number];

/** The Ace role document's `system.identifier`. */
export const ACE_IDENTIFIER = 'ace';

/**
 * Whether the actor owns the Ace role: an `originPath` item whose
 * `system.identifier` is `ace` — matched by identifier, never by the role's
 * display name, so a line whose packs carry no Ace role simply has none.
 */
export function actorIsAce(actor: { readonly items: Iterable<IdentifiableItem> }): boolean {
    return hasItemWithIdentifier(actor.items, 'originPath', ACE_IDENTIFIER);
}

/** True when Right Stuff applies to the supplied skill key. */
export function isRightStuffSkill(skillKey: string): skillKey is RightStuffSkill {
    return (RIGHT_STUFF.applicableSkills as ReadonlyArray<string>).includes(skillKey);
}

/** True when the actor currently has at least one Fate point to spend. */
export function actorHasFatePoints(actor: WH40KBaseActorDocument): boolean {
    const fate = (actor.system as { fate?: { value?: number } } | undefined)?.fate;
    return (fate?.value ?? 0) > 0;
}

/** Read the actor's Agility bonus (0 when characteristic absent). */
export function getAgilityBonus(actor: WH40KBaseActorDocument): number {
    const characteristics = (actor.system as { characteristics?: Record<string, { bonus?: number } | undefined> } | undefined)?.characteristics;
    return characteristics?.['agility']?.bonus ?? 0;
}

/** Combined eligibility gate for opening / firing the Right Stuff action. */
export function canSpendRightStuff(actor: WH40KBaseActorDocument): boolean {
    return actorIsAce(actor) && actorHasFatePoints(actor);
}

/** Outcome of resolving a Right Stuff Fate spend. */
export interface RightStuffResolution {
    /** Skill that was auto-succeeded. */
    readonly skill: RightStuffSkill;
    /** Degrees of success granted (= Agility bonus, clamped to ≥ 0). */
    readonly degrees: number;
    /**
     * Whether the spend is mechanically meaningful. An Ace with AgB 0
     * still auto-succeeds with 0 DoS — the success itself is the value,
     * not the DoS count. Callers may use this to surface a soft warning
     * but must not block the spend.
     */
    readonly hasDegrees: boolean;
}

/**
 * Pure resolution of a Right Stuff Fate spend. Returns the deterministic
 * outcome (skill, DoS) for the supplied Agility bonus. No I/O, no
 * Foundry. Tests assert directly against this; the runtime wrapper
 * ({@link spendRightStuff}) handles the fate deduction and chat card.
 */
export function resolveRightStuff(skill: RightStuffSkill, agilityBonus: number): RightStuffResolution {
    const degrees = Math.max(0, Math.floor(agilityBonus));
    return { skill, degrees, hasDegrees: degrees > 0 };
}

/**
 * Runtime entry point. Verifies eligibility, deducts one Fate point,
 * computes the DoS from the actor's Agility bonus, and emits a chat
 * card stating the automatic success. Returns the resolution so callers
 * (and tests) can assert on the outcome. Returns `null` when the actor
 * is ineligible or has no fate to spend (the dialog button is already
 * disabled in that case; this re-check is a defence in depth).
 *
 * The fate deduction is a single `actor.update()` so atomicity is on
 * the actor document; chat card posting is best-effort after the update.
 *
 * @param actor The Ace whose Fate is being spent.
 * @param skill One of `RIGHT_STUFF.applicableSkills`.
 */
export async function spendRightStuff(actor: WH40KBaseActorDocument, skill: RightStuffSkill): Promise<RightStuffResolution | null> {
    if (!canSpendRightStuff(actor)) return null;
    if (!isRightStuffSkill(skill)) return null;

    const agilityBonus = getAgilityBonus(actor);
    const resolution = resolveRightStuff(skill, agilityBonus);

    const fate = (actor.system as { fate?: { value?: number } } | undefined)?.fate;
    const currentFate = fate?.value ?? 0;
    await actor.update({ system: { fate: { value: Math.max(0, currentFate - 1) } } });

    const gameSystem = (actor.system as { gameSystem?: string } | undefined)?.gameSystem ?? 'dh2';

    const templateData = {
        actorName: actor.name,
        skillKey: `WH40K.RightStuff.Skill.${skill}`,
        skillRaw: skill,
        degrees: resolution.degrees,
        agilityBonus,
        hasDegrees: resolution.hasDegrees,
        gameSystem,
    };

    await emitChatFromTemplate(
        'systems/wh40k-rpg/templates/chat/right-stuff-chat.hbs',
        // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate accepts an untyped Handlebars context bag
        templateData,
        { applyWhispers: true },
    );

    return resolution;
}
