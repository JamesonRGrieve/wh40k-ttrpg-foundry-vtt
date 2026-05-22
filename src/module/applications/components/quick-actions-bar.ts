/**
 * @file QuickActionsBar - Unified action bar component for items
 */

import type { WH40KItem } from '../../documents/item.ts';

interface QuickAction {
    id: string;
    icon: string;
    label: string;
    action: string;
    dataset: Record<string, string | number>;
    variant: 'primary' | 'secondary' | 'danger';
}

/** Narrow system fields read by QuickActionsBar across item types. */
interface ItemSystemFlags {
    equipped?: boolean;
    isRollable?: boolean;
    rollable?: boolean;
    consumable?: boolean;
}

// biome-ignore lint/complexity/noStaticOnlyClass: exported as default for module re-export compatibility; callers use QuickActionsBar.method() syntax and _module.ts re-exports the default
export default class QuickActionsBar {
    /**
     * Get action definitions for an item
     */
    // eslint-disable-next-line complexity -- quick-action availability is intentionally centralized here so item-type button rules stay in one place
    static getActionsForItem(
        item: WH40KItem,
        { compact: _compact = false, inSheet = false, isGM = game.user.isGM }: { compact?: boolean; inSheet?: boolean; isGM?: boolean } = {},
    ): QuickAction[] {
        const actions: QuickAction[] = [];
        const type = item.type;
        const system = item.system as ItemSystemFlags;
        const itemId: string = item.id ?? '';

        // Type-specific actions
        if (type === 'weapon') {
            actions.push(
                this.#createAction('attack', 'fa-solid fa-crosshairs', 'Attack', 'itemRoll', { itemId }),
                this.#createAction('damage', 'fa-solid fa-burst', 'Damage', 'rollDamage', { itemId }),
                this.#createAction('reload', 'fa-solid fa-rotate-right', 'Reload', 'reloadWeapon', { itemId }),
            );
        } else if (type === 'armour') {
            const isEquipped = system.equipped === true;
            actions.push(
                this.#createAction('equip', isEquipped ? 'fa-solid fa-user-check' : 'fa-solid fa-user-plus', isEquipped ? 'Unequip' : 'Equip', 'toggleEquip', {
                    itemId,
                }),
            );
        } else if (type === 'talent') {
            if (system.isRollable === true) {
                actions.push(this.#createAction('roll', 'fa-solid fa-dice-d20', 'Roll', 'itemRoll', { itemId }));
            }
            actions.push(this.#createAction('favorite', 'fa-solid fa-star', 'Favorite', 'toggleFavorite', { itemId }));
        } else if (type === 'trait') {
            if (system.rollable === true) {
                actions.push(this.#createAction('roll', 'fa-solid fa-dice-d20', 'Roll', 'itemRoll', { itemId }));
            }
        } else if (type === 'gear') {
            if (system.consumable === true) {
                actions.push(
                    this.#createAction('use', 'fa-solid fa-flask', 'Use', 'useItem', { itemId }),
                    this.#createAction('adjust', 'fa-solid fa-sliders', 'Adjust', 'adjustQuantity', { itemId }),
                );
            }
        } else if (type === 'consumable' || type === 'drug') {
            actions.push(
                this.#createAction('use', 'fa-solid fa-capsules', 'Use', 'useItem', { itemId }),
                this.#createAction('adjust', 'fa-solid fa-sliders', 'Adjust', 'adjustQuantity', { itemId }),
            );
        } else if (type === 'condition') {
            // Conditions are GM-imposed game state. Only the GM may stack/reduce/remove them
            // from the actor; players see conditions as read-only display.
            if (isGM) {
                actions.push(
                    this.#createAction('stack', 'fa-solid fa-plus', 'Stack', 'stackCondition', { itemId }),
                    this.#createAction('reduce', 'fa-solid fa-minus', 'Reduce', 'reduceCondition', { itemId }),
                    this.#createAction('remove', 'fa-solid fa-xmark', 'Remove', 'removeCondition', { itemId }),
                );
            }
        } else if (type === 'criticalInjury') {
            actions.push(
                this.#createAction('rollSeverity', 'fa-solid fa-dice', 'Roll Severity', 'rollSeverity', { itemId }),
                this.#createAction('treat', 'fa-solid fa-kit-medical', 'Treat', 'treatInjury', { itemId }),
            );
        } else if (type === 'psychicPower' || type === 'navigatorPower') {
            actions.push(this.#createAction('manifest', 'fa-solid fa-brain', 'Manifest', 'manifestPower', { itemId }));
        } else if (type === 'ammunition') {
            actions.push(this.#createAction('load', 'fa-solid fa-arrow-up-from-bracket', 'Load', 'loadAmmo', { itemId }));
        }

        // Universal actions (available on most items)
        if (!inSheet) {
            actions.push(this.#createAction('chat', 'fa-solid fa-comment', 'Post to Chat', 'postToChat', { itemId }));
        }

        if (inSheet && item.isOwner) {
            actions.push(this.#createAction('edit', 'fa-solid fa-pen-to-square', 'Edit', 'editItem', { itemId }));
        }

        if (!inSheet && item.isOwner && (type !== 'condition' || isGM)) {
            actions.push(this.#createAction('delete', 'fa-solid fa-trash', 'Delete', 'deleteItem', { itemId }, 'danger'));
        }

        return actions;
    }

    /**
     * Create an action definition
     */
    static #createAction(
        id: string,
        icon: string,
        label: string,
        action: string,
        dataset: Record<string, string | number> = {},
        variant: 'primary' | 'secondary' | 'danger' = 'primary',
    ): QuickAction {
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
     */
    static renderActions(actions: QuickAction[], compact: boolean = false): string {
        return actions
            .map((action) => {
                const dataAttrs = Object.entries(action.dataset)
                    .map(([key, value]) => `data-${key}="${value}"`)
                    .join(' ');

                const classList = ['wh40k-quick-action', `wh40k-quick-action--${action.variant}`, compact ? 'wh40k-quick-action--compact' : ''].join(' ');

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
