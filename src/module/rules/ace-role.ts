/**
 * Ace role — Right Stuff Fate spend (without.md L948-L980, p. 39; #100).
 *
 * "In addition to the normal uses of Fate points, an Ace character may
 *  spend a Fate point to automatically succeed at an Operate or Survival
 *  skill test involving vehicles or living steeds with a number of
 *  degrees of success equal to his Agility bonus."
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
 * and `aerial-manoeuvres.ts` neighbours under `rules/`. Per Direction
 * #7, the role and its applicable skills are content from the
 * compendium and `RIGHT_STUFF.applicableSkills`; this file is the
 * content-agnostic resolution primitive only.
 */

import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import { applyRollModeWhispers } from '../rolls/roll-helpers.ts';
import { RIGHT_STUFF } from './xenos-features.ts';

/** Skill keys Right Stuff applies to (mirrors `RIGHT_STUFF.applicableSkills`). */
export type RightStuffSkill = (typeof RIGHT_STUFF.applicableSkills)[number];

/**
 * Case-insensitive substrings on the actor's `originPath.role` string
 * that identify the Ace role. Matching by name keeps detection content-
 * agnostic: the compendium role item (dh2-without-stats-roles/ace_*.json)
 * is the source of truth; this only narrows the actor's resolved role
 * to the Without "Ace" entry at runtime. No hardcoded UUIDs (Direction
 * #7).
 */
const ACE_ROLE_NAME_HINTS: ReadonlyArray<string> = Object.freeze(['ace']);

/**
 * Without is an FFG-family supplement; the canonical Ace role ships
 * for the six d100 lines and is opt-in for IM via its own role mapping.
 * Imperium Maledictum does not ship the Without "Ace" role entry, so
 * the gate excludes it — matching the homologation pattern used by
 * `isMedicaeMechadendriteSystem`. Returning `true` for the six FFG
 * systems and `false` for `im` keeps homologation explicit rather
 * than accidental.
 */
export function isRightStuffSystem(gameSystem: string | undefined): boolean {
    return gameSystem !== undefined && gameSystem !== 'im';
}

/** True when the actor's resolved origin-path role is the Without "Ace" role. */
export function actorIsAce(actor: WH40KBaseActorDocument): boolean {
    const gameSystem = (actor.system as { gameSystem?: string } | undefined)?.gameSystem;
    if (!isRightStuffSystem(gameSystem)) return false;
    const originPath = (actor.system as { originPath?: { role?: unknown } } | undefined)?.originPath;
    const role = typeof originPath?.role === 'string' ? originPath.role.trim().toLowerCase() : '';
    if (role === '') return false;
    return ACE_ROLE_NAME_HINTS.some((hint) => role === hint || role.endsWith(` ${hint}`) || role.startsWith(`${hint} `) || role.includes(` ${hint} `));
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
export async function spendRightStuff(
    actor: WH40KBaseActorDocument,
    skill: RightStuffSkill,
): Promise<RightStuffResolution | null> {
    if (!canSpendRightStuff(actor)) return null;
    if (!isRightStuffSkill(skill)) return null;

    const agilityBonus = getAgilityBonus(actor);
    const resolution = resolveRightStuff(skill, agilityBonus);

    const fate = (actor.system as { fate?: { value?: number } } | undefined)?.fate;
    const currentFate = fate?.value ?? 0;
    await actor.update({ system: { fate: { value: Math.max(0, currentFate - 1) } } });

    const gameSystem = (actor.system as { gameSystem?: string } | undefined)?.gameSystem ?? 'dh2e';

    const templateData = {
        actorName: actor.name,
        skillKey: `WH40K.RightStuff.Skill.${skill}`,
        skillRaw: skill,
        degrees: resolution.degrees,
        agilityBonus,
        hasDegrees: resolution.hasDegrees,
        gameSystem,
    };

    const html = await foundry.applications.handlebars.renderTemplate(
        'systems/wh40k-rpg/templates/chat/right-stuff-chat.hbs',
        // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate accepts an untyped Handlebars context bag
        templateData as unknown as Record<string, unknown>,
    );

    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
    const chatData: Record<string, unknown> = {
        user: game.user?.id,
        content: html,
    };
    applyRollModeWhispers(chatData);
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts untyped Foundry data
    await ChatMessage.create(chatData as unknown as Parameters<typeof ChatMessage.create>[0]);

    return resolution;
}
