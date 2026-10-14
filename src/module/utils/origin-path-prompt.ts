/**
 * When a character sheet nudges its owner to build an origin path (#541).
 *
 * The "Origin Path Incomplete" prompt is for a genuinely unbuilt character. It
 * never fires for an NPC (which has no origin path), for a character whose
 * three core steps are set, for one whose owner chose "don't show again" — nor
 * for a character whose sheet came from an AUTHORED BUILD: a pregen exported
 * from a vault `canonical_sheet.source: initial_build`, whose characteristics,
 * wounds, fate, XP, skills and kit are written straight from that build. Such a
 * sheet has no origin-path items by design, and telling a player to "build" one
 * is wrong. The exporter marks it `flags["wh40k-rpg"].sheetSource =
 * "authored-build"`; the marker, never the actor's name, is what is read.
 */

/** The `flags["wh40k-rpg"]` key recording where a character's sheet came from. */
export const SHEET_SOURCE_FLAG = 'sheetSource';

/** {@link SHEET_SOURCE_FLAG} value: the sheet was written from an authored build (a pregen). */
export const AUTHORED_BUILD_SHEET_SOURCE = 'authored-build';

/** The `flags["wh40k-rpg"]` key an owner sets with "don't show again". */
export const ORIGIN_PROMPT_DISMISSED_FLAG = 'originPromptDismissed';

/** Everything the decision reads, gathered from the actor and the world settings. */
export interface OriginPromptFacts {
    isOwner: boolean;
    promptEnabled: boolean;
    actorType: string;
    /** The three core steps as stored; the generic actor system types them loosely. */
    // eslint-disable-next-line no-restricted-syntax -- boundary: the actor system union types origin steps as unknown on its generic member; each value is fed straight into the isStepSet guard
    originPath: Readonly<Partial<Record<'homeWorld' | 'background' | 'role', unknown>>>;
    /** The actor's `originPromptDismissed` flag, as stored. */
    dismissed: boolean;
    /** The actor's `sheetSource` flag, as stored (`undefined` when absent). */
    sheetSource: string | undefined;
}

/** Is this an authored-build sheet (a pregen), whose origin path is not to be built? */
export function isAuthoredBuildSheet(sheetSource: string | undefined): boolean {
    return sheetSource === AUTHORED_BUILD_SHEET_SOURCE;
}

/**
 * The prompt's dialog body: the message and the "don't show again" checkbox the
 * sheet reads back from the dialog form. Both strings arrive localized.
 */
export function originPathPromptContent(message: string, dontShowAgain: string): string {
    return `<div class="wh40k-rpg"><p>${message}</p><label class="tw-flex tw-items-center tw-gap-2 tw-mt-2"><input type="checkbox" name="dontShowAgain" /> <span>${dontShowAgain}</span></label></div>`;
}

/** Should opening this sheet prompt its owner to build an origin path? */
export function shouldPromptOriginPath(facts: OriginPromptFacts): boolean {
    if (!facts.isOwner || !facts.promptEnabled) return false;
    if (facts.actorType.includes('npc')) return false;
    if (isAuthoredBuildSheet(facts.sheetSource)) return false;
    const { homeWorld, background, role } = facts.originPath;
    if (isStepSet(homeWorld) && isStepSet(background) && isStepSet(role)) return false;
    return !facts.dismissed;
}

/** A core origin step counts as set when it holds a non-empty name. */
// eslint-disable-next-line no-restricted-syntax -- boundary: type guard over the loosely-typed stored origin step
function isStepSet(step: unknown): boolean {
    return typeof step === 'string' && step !== '';
}
