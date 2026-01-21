/**
 * @file ForceFieldSheet - ApplicationV2 sheet for force field items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for force field items.
 */
export default class ForceFieldSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'force-field'],
        position: {
            width: 540,
            height: 620,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/rogue-trader/templates/item/item-force-field-sheet-v2.hbs',
            scrollable: ['.rt-forcefield-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'stats', group: 'primary', label: 'Stats' },
        { tab: 'description', group: 'primary', label: 'Info' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'stats',
    };

    /* -------------------------------------------- */

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Set up tab listeners
        this._setupForceFieldTabs();
    }

    /**
     * Set up tab click listeners for force field sheet tabs.
     * @protected
     */
    _setupForceFieldTabs() {
        const tabs = this.element.querySelectorAll('.rt-forcefield-tabs .rt-forcefield-tab');
        tabs.forEach((tab) => {
            tab.addEventListener('click', (event) => {
                event.preventDefault();
                const tabName = tab.dataset.tab;
                if (!tabName) return;

                // Update active tab button
                tabs.forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');

                // Show/hide panels
                const panels = this.element.querySelectorAll('.rt-forcefield-panel');
                panels.forEach((panel) => {
                    panel.classList.toggle('active', panel.dataset.tab === tabName);
                });

                // Update tab group state
                this.tabGroups.primary = tabName;
            });
        });
    }
}
