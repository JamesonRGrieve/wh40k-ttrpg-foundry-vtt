/**
 * Character sheet: skill actions.
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import AdvancementDialog from '../../dialogs/advancement-dialog.ts';
import type CharacterSheet from '../character-sheet.ts';

/**
 * Handle filtering skills by search term, characteristic, and training level.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering event.
 * @param {HTMLElement} target  Element that triggered the event.
 */
export async function filterSkills(this: CharacterSheet, event: Event, _target: HTMLElement): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const name = input.name || 'search';
    const value = input.value || '';

    // Update filter state
    this._skillsFilter[name] = value;

    // Re-render skills tab only
    await this.render({ parts: ['skills'] });
}

/**
 * Clear all skill filters.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering event.
 * @param {HTMLElement} target  Element that triggered the event.
 */
export async function clearSkillsSearch(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    // Reset all filters
    this._skillsFilter = { search: '', characteristic: '', training: '' };

    // Re-render skills tab
    await this.render({ parts: ['skills'] });
}

/**
 * Toggle favorite status for a skill.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering event.
 * @param {HTMLElement} target  Element that triggered the event.
 */
export async function toggleFavoriteSkill(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const skillKey = target.dataset['skill'];
    if (skillKey === undefined || skillKey === '') return;
    await this._toggleFavorite('favoriteSkills', skillKey, ['skills', 'overview']);
}

/**
 * Toggle favorite status for a specialist skill entry.
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 * @this {CharacterSheet}
 */
export async function toggleFavoriteSpecialistSkill(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const skillKey = target.dataset['skill'];
    const entryIndex = parseInt(target.dataset['index'] ?? '');
    if (skillKey === undefined || skillKey === '' || Number.isNaN(entryIndex)) return;

    // Create a unique key for this specialist skill entry
    const favoriteKey = `${skillKey}:${entryIndex}`;
    await this._toggleFavorite('favoriteSpecialistSkills', favoriteKey, ['skills']);
}

/**
 * Add a specialist-skill specialization via the advancement menu.
 * Specializations are XP-purchased, so the "+" routes to the AdvancementDialog
 * ('__new' specialist-add path charges XP) rather than a free add (#387).
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 * @this {CharacterSheet}
 */
export function openAddSpecialistDialog(this: CharacterSheet, event: Event, _target: HTMLElement): void {
    event.preventDefault();
    // Specialist specializations are XP-purchased: route through the advancement
    // menu (its '__new' specialist-add path charges XP and records the cost) rather
    // than the free SpecialistSkillDialog, which added them untrained at no cost (#387).
    // The free dialog is retained for NPC sheets, where the GM edits skills directly
    // and there is no XP economy.
    const careerKey = this.actor.originPath['career'];
    AdvancementDialog.open(this.actor, { careerKey });
}
