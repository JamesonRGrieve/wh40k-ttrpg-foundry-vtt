/**
 * @file CyberneticSheet - ApplicationV2 sheet for cybernetic items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for cybernetic/augmetic items.
 */
export default class CyberneticSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'cybernetic'],
        position: {
            width: 600,
            height: 700,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/rogue-trader/templates/item/item-cybernetic-sheet-v2.hbs',
            scrollable: ['.rt-cybernetic-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'properties', group: 'primary', label: 'Properties' },
        { tab: 'installation', group: 'primary', label: 'Installation' },
        { tab: 'modifiers', group: 'primary', label: 'Modifiers' },
        { tab: 'description', group: 'primary', label: 'Info' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'properties',
    };

    /* -------------------------------------------- */

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Set up tab listeners
        this._setupCyberneticTabs();
    }

    /**
     * Set up tab click listeners for cybernetic sheet tabs.
     * @protected
     */
    _setupCyberneticTabs() {
        const tabs = this.element.querySelectorAll('.rt-cybernetic-tabs .rt-cybernetic-tab');
        tabs.forEach((tab) => {
            tab.addEventListener('click', (event) => {
                event.preventDefault();
                const tabName = tab.dataset.tab;
                if (!tabName) return;

                // Update active tab button
                tabs.forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');

                // Show/hide panels
                const panels = this.element.querySelectorAll('.rt-cybernetic-panel');
                panels.forEach((panel) => {
                    panel.classList.toggle('active', panel.dataset.tab === tabName);
                });

                // Update tab group state
                this.tabGroups.primary = tabName;
            });
        });
    }
}
