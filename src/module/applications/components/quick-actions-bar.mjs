/**
 * @file QuickActionsBar - Unified action bar component for items
 *
 * Provides standardized quick actions for items across character sheets
 * and item sheets. Context-sensitive based on item type and state.
 *
 * Usage:
 * In templates: {{> quick-actions-bar.hbs item=item compact=true}}
 * In sheets: context.quickActions = QuickActionsBar.getActionsForItem(item);
 */

export default class QuickActionsBar {
    /**
     * Get action definitions for an item
     * @param {Item} item - The item to generate actions for
     * @param {Object} options - Configuration options
     * @param {boolean} options.compact - Use compact mode (icons only)
     * @param {boolean} options.inSheet - Rendering in item sheet (vs character sheet)
     * @returns {Object[]} Array of action definitions
     */
    static getActionsForItem(item, { compact = false, inSheet = false } = {}) {
        const actions = [];
        const type = item.type;

        // Type-specific actions
        switch (type) {
            case 'weapon':
                actions.push(
                    this.#createAction('attack', 'fa-solid fa-crosshairs', 'Attack', 'itemRoll', { itemId: item.id }),
                    this.#createAction('damage', 'fa-solid fa-burst', 'Damage', 'rollDamage', { itemId: item.id }),
                    this.#createAction('reload', 'fa-solid fa-rotate-right', 'Reload', 'reloadWeapon', { itemId: item.id }),
                );
                break;

            case 'armour':
                const isEquipped = item.system.equipped;
                actions.push(
                    this.#createAction(
                        'equip',
                        isEquipped ? 'fa-solid fa-user-check' : 'fa-solid fa-user-plus',
                        isEquipped ? 'Unequip' : 'Equip',
                        'toggleEquip',
                        { itemId: item.id },
                    ),
                );
                break;

            case 'talent':
                if (item.system.isRollable) {
                    actions.push(this.#createAction('roll', 'fa-solid fa-dice-d20', 'Roll', 'itemRoll', { itemId: item.id }));
                }
                actions.push(this.#createAction('favorite', 'fa-solid fa-star', 'Favorite', 'toggleFavorite', { itemId: item.id }));
                break;

            case 'trait':
                if (item.system.rollable) {
                    actions.push(this.#createAction('roll', 'fa-solid fa-dice-d20', 'Roll', 'itemRoll', { itemId: item.id }));
                }
                break;

            case 'gear':
                if (item.system.consumable) {
                    actions.push(
                        this.#createAction('use', 'fa-solid fa-flask', 'Use', 'useItem', { itemId: item.id }),
                        this.#createAction('adjust', 'fa-solid fa-sliders', 'Adjust', 'adjustQuantity', { itemId: item.id }),
                    );
                }
                break;

            case 'consumable':
            case 'drug':
                actions.push(
                    this.#createAction('use', 'fa-solid fa-capsules', 'Use', 'useItem', { itemId: item.id }),
                    this.#createAction('adjust', 'fa-solid fa-sliders', 'Adjust', 'adjustQuantity', { itemId: item.id }),
                );
                break;

            case 'condition':
                actions.push(
                    this.#createAction('stack', 'fa-solid fa-plus', 'Stack', 'stackCondition', { itemId: item.id }),
                    this.#createAction('reduce', 'fa-solid fa-minus', 'Reduce', 'reduceCondition', { itemId: item.id }),
                    this.#createAction('remove', 'fa-solid fa-xmark', 'Remove', 'removeCondition', { itemId: item.id }),
                );
                break;

            case 'criticalInjury':
                actions.push(
                    this.#createAction('rollSeverity', 'fa-solid fa-dice', 'Roll Severity', 'rollSeverity', { itemId: item.id }),
                    this.#createAction('treat', 'fa-solid fa-kit-medical', 'Treat', 'treatInjury', { itemId: item.id }),
                );
                break;

            case 'psychicPower':
            case 'navigatorPower':
                actions.push(this.#createAction('manifest', 'fa-solid fa-brain', 'Manifest', 'manifestPower', { itemId: item.id }));
                break;

            case 'ammunition':
                actions.push(this.#createAction('load', 'fa-solid fa-arrow-up-from-bracket', 'Load', 'loadAmmo', { itemId: item.id }));
                break;
        }

        // Universal actions (available on most items)
        if (!inSheet) {
            actions.push(this.#createAction('chat', 'fa-solid fa-comment', 'Post to Chat', 'postToChat', { itemId: item.id }));
        }

        if (inSheet && item.isOwner) {
            actions.push(this.#createAction('edit', 'fa-solid fa-pen-to-square', 'Edit', 'editItem', { itemId: item.id }));
        }

        if (!inSheet && item.isOwner) {
            actions.push(this.#createAction('delete', 'fa-solid fa-trash', 'Delete', 'deleteItem', { itemId: item.id }, 'danger'));
        }

        return actions;
    }

    /**
     * Create an action definition
     * @param {string} id - Action identifier
     * @param {string} icon - Font Awesome icon class
     * @param {string} label - Action label
     * @param {string} action - Action handler name
     * @param {Object} dataset - Data attributes
     * @param {string} variant - Button variant (primary, secondary, danger)
     * @returns {Object} Action definition
     * @private
     */
    static #createAction(id, icon, label, action, dataset = {}, variant = 'primary') {
        return {
            id,
            icon,
            label,
            action,
            dataset,
            variant,
        };
    }

    /**
     * Render actions as HTML
     * @param {Object[]} actions - Action definitions
     * @param {boolean} compact - Compact mode (icons only)
     * @returns {string} HTML string
     */
    static renderActions(actions, compact = false) {
        return actions
            .map((action) => {
                const dataAttrs = Object.entries(action.dataset)
                    .map(([key, value]) => `data-${key}="${value}"`)
                    .join(' ');

                const classList = ['rt-quick-action', `rt-quick-action--${action.variant}`, compact ? 'rt-quick-action--compact' : ''].join(' ');

                return `
                <button type="button" 
                        class="${classList}" 
                        data-action="${action.action}"
                        ${dataAttrs}
                        title="${action.label}">
                    <i class="${action.icon}"></i>
                    ${!compact ? `<span>${action.label}</span>` : ''}
                </button>
            `;
            })
            .join('');
    }
}
