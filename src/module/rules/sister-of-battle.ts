/**
 * Sister of Battle elite advance (DH2 Enemies Within pp38-39; #134).
 *
 * The advance and its talents are compendium content. This module only
 * turns the advance document's `grants` into the rows the confirmation
 * dialog and chat card list, so every label comes from the document.
 */

/** The Sister of Battle elite advance document's `system.identifier`. */
export const SISTER_OF_BATTLE_ADVANCE_IDENTIFIER = 'sister-of-battle';

/** One row the dialog / chat card lists. */
export interface AdvanceGrantCard {
    id: string;
    label: string;
    summary: string;
    /** An unlocked talent: available to purchase at its XP cost, not granted. */
    unlocked: boolean;
}

/** The slice of an origin-path `grants` block the rows are built from. */
export interface AdvanceGrantsLike {
    talents?: ReadonlyArray<{ name?: string; specialization?: string; uuid?: string }>;
    unlockedTalents?: ReadonlyArray<{ name?: string; uuid?: string }>;
    specialAbilities?: ReadonlyArray<{ name?: string; description?: string }>;
}

/** Strip markup from a rich-text grant description for a one-line summary. */
function plainText(html: string): string {
    return html
        .replace(/<\/p>\s*<p>/g, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Rows for the advance's granted talents (name, with its specialisation), the
 * talents it unlocks for purchase, and its special abilities (name and
 * description), in that order. Pure.
 */
export function advanceGrantCards(grants: AdvanceGrantsLike): AdvanceGrantCard[] {
    const talents = (grants.talents ?? []).map((talent, index) => {
        const name = talent.name ?? '';
        const spec = talent.specialization ?? '';
        return { id: talent.uuid ?? `talent-${index}`, label: spec === '' ? name : `${name} (${spec})`, summary: '', unlocked: false };
    });
    const unlocked = (grants.unlockedTalents ?? []).map((talent, index) => ({
        id: talent.uuid ?? `unlocked-${index}`,
        label: talent.name ?? '',
        summary: '',
        unlocked: true,
    }));
    const abilities = (grants.specialAbilities ?? []).map((ability, index) => ({
        id: `ability-${index}`,
        label: ability.name ?? '',
        summary: plainText(ability.description ?? ''),
        unlocked: false,
    }));
    return [...talents, ...unlocked, ...abilities].filter((card) => card.label !== '');
}
