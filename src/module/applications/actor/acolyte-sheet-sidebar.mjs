/**
 * @file AcolyteSheetSidebar - Variant character sheet with sidebar navigation
 * This is an alternative layout with tabs on the left side
 */

import AcolyteSheet from './acolyte-sheet.mjs';

/**
 * Acolyte sheet variant with sidebar navigation instead of horizontal tabs.
 * Extends the base AcolyteSheet and overrides layout-specific options.
 */
export default class AcolyteSheetSidebar extends AcolyteSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        ...AcolyteSheet.DEFAULT_OPTIONS,
        classes: ['acolyte', 'sidebar-nav'],
        // Tab configuration for sidebar layout
        tabs: [{ navSelector: 'nav.rt-navigation', contentSelector: '#tab-body', initial: 'overview', group: 'primary' }],
    };

    /* -------------------------------------------- */

    /**
     * Override PARTS to use sidebar navigation layout.
     * The tabs part goes into a sidebar container with the tab body.
     * @override
     */
    static PARTS = {
        header: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/header.hbs',
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/tabs-sidebar.hbs',
            container: { classes: ['wh40k-main-layout'], id: 'main' },
        },
        overview: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/tab-overview.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
            scrollable: [''],
        },
        combat: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/tab-combat.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
            scrollable: [''],
        },
        skills: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/tab-skills.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
            scrollable: [''],
        },
        talents: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/tab-talents.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
            scrollable: [''],
        },
        equipment: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/tab-equipment.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
            scrollable: [''],
        },
        powers: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/tab-powers.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
            scrollable: [''],
        },
        dynasty: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/tab-dynasty.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
            scrollable: [''],
        },
        biography: {
            template: 'systems/wh40k-rpg/templates/actor/acolyte/tab-biography.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
            scrollable: [''],
        },
    };
}
