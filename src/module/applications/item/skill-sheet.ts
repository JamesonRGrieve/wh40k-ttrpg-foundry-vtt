/**
 * @file SkillSheet - ApplicationV2 sheet for skill items (compendium skills)
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/**
 * Sheet for skill items (used in compendiums).
 * Redesigned with Imperial Gothic theme and comprehensive layout.
 *
 * Note: this sheet has no tabs — its template renders a single body region.
 * The non-default scrollable selector reflects that template's structure.
 */
const SkillSheet = defineSimpleItemSheet({
    className: 'SkillSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'skill'],
    template: 'systems/wh40k-rpg/templates/item/item-skill-sheet.hbs',
    width: 600,
    height: 700,
    partOverrides: {
        scrollable: ['.wh40k-item-body'],
    },
});

export default SkillSheet;
