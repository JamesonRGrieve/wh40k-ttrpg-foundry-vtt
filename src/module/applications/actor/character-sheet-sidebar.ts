/**
 * @file CharacterSheetSidebar - Variant character sheet with sidebar navigation
 * This is an alternative layout with tabs on the left side
 */

import CharacterSheet from './character-sheet.ts';

/**
 * Player sheet variant with sidebar navigation instead of horizontal tabs.
 * Extends the base CharacterSheet and overrides layout-specific options.
 */
export default class CharacterSheetSidebar extends CharacterSheet {
    /** @override */
    static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        ...CharacterSheet.DEFAULT_OPTIONS,
        classes: ['player', 'sidebar-nav'],
        tabs: [{ navSelector: 'nav.wh40k-navigation', contentSelector: '#tab-body', initial: 'overview', group: 'primary' }],
    };

    /* -------------------------------------------- */

    /**
     * Override PARTS to use sidebar navigation layout.
     * The tabs part goes into a sidebar container with the tab body.
     * @override
     */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        ...CharacterSheet.PARTS,
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/player/tabs-sidebar.hbs',
            container: { classes: ['wh40k-main-layout'], id: 'main' },
        },
        overview: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-overview.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
        },
        combat: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-combat.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
        },
        skills: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-skills.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
        },
        talents: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-talents.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
        },
        equipment: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-equipment.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
        },
        powers: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-powers.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
        },
        dynasty: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-dynasty.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
        },
        biography: {
            template: 'systems/wh40k-rpg/templates/actor/player/tab-biography.hbs',
            container: { classes: ['wh40k-main-layout', 'wh40k-body'], id: 'main' },
        },
    };
}
