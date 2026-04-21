/**
 * @file ContextMenuMixin - Right-click context menus using Foundry V13 native ContextMenu
 * Provides contextual action menus throughout the character sheet
 */

import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KAcolyte } from '../../documents/acolyte.ts';
import type { WH40KNPCV2 } from '../../documents/npc-v2.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KCharacteristic, WH40KSkill } from '../../types/global.d.ts';
import type { ApplicationV2Ctor, ContextMenuEntryLike, DialogV2Like, FoundryApplicationUXLike } from './application-types.ts';

const applicationUX = (foundry.applications as unknown as { ux: FoundryApplicationUXLike }).ux;
const dialogV2 = (foundry.applications as unknown as { api: { DialogV2: DialogV2Like } }).api.DialogV2;

type ActorType = WH40KAcolyte | WH40KNPCV2 | WH40KBaseActor;

/**
 * Custom ContextMenu subclass for WH40K RPG styling.
 * Uses Foundry V13's native ContextMenu with fixed positioning.
 */
export class WH40KContextMenu extends applicationUX.ContextMenu {
    constructor(...args: any[]) {
        super(...args);
    }

    /** @override */
    _setPosition(html: HTMLElement, target: HTMLElement, options: Record<string, unknown> = {}): void {
        html.classList.add('wh40k-context-menu');
        return (this as any)._setFixedPosition(html, target, options);
    }

    /**
     * Trigger a context menu event in response to a normal click.
     * Useful for adding context menu buttons alongside right-click.
     * @param {PointerEvent} event
     */
    static triggerEvent(event: PointerEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const { clientX, clientY } = event;
        const selector = '[data-item-id],[data-characteristic],[data-skill],[data-fate-point]';
        const target = (event.target as HTMLElement).closest(selector) ?? (event.currentTarget as HTMLElement).closest(selector);
        target?.dispatchEvent(
            new PointerEvent('contextmenu', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX,
                clientY,
            }),
        );
    }
}

/**
 * Mixin to add context menu capabilities to ApplicationV2 sheets.
 * Uses Foundry V13's native ContextMenu for better accessibility and keyboard navigation.
 * @template {ApplicationV2} T
 * @param {T} Base   Application class being extended.
 * @returns {any}
 * @mixin
 */
export default function ContextMenuMixin<T extends ApplicationV2Ctor>(Base: T) {
    class ContextMenuApplication extends Base {
        constructor(...args: any[]) {
            super(...args);
        }

        declare actor: ActorType;

        /* -------------------------------------------- */
        /*  Lifecycle Methods                           */
        /* -------------------------------------------- */

        /** @override */
        _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> | void {
            super._onRender(context, options);

            // Setup context menus on first render
            if (options.isFirstRender) {
                this._createContextMenus();
            }
        }

        /* -------------------------------------------- */
        /*  Context Menu Setup                          */
        /* -------------------------------------------- */

        /**
         * Create all context menus for the sheet.
         * Uses Foundry's native ContextMenu class for better accessibility.
         * @protected
         */
        _createContextMenus(): void {
            // Characteristics context menu
            new WH40KContextMenu(this.element, '[data-characteristic]', [], {
                onOpen: (target: HTMLElement) => this._getCharacteristicContextOptions(target),
                jQuery: false,
            });

            // Skills context menu
            new WH40KContextMenu(this.element, '[data-skill]', [], {
                onOpen: (target: HTMLElement) => this._getSkillContextOptions(target),
                jQuery: false,
            });

            // Items context menu
            new WH40KContextMenu(this.element, '[data-item-id]', [], {
                onOpen: (target: HTMLElement) => this._getItemContextOptions(target),
                jQuery: false,
            });

            // Fate points context menu
            new WH40KContextMenu(this.element, '[data-fate-point]', [], {
                onOpen: () => this._getFatePointContextOptions(),
                jQuery: false,
            });

            // Allow subclasses to add custom menus
            this._createCustomContextMenus();
        }

        /**
         * Create custom context menus (for subclasses to override).
         * @protected
         */
        _createCustomContextMenus(): void {
            // Override in subclasses
        }

        /* -------------------------------------------- */
        /*  Context Menu Options                        */
        /* -------------------------------------------- */

        /**
         * Get context menu options for a characteristic.
         * @param {HTMLElement} target  Element that was right-clicked
         * @returns {foundry.applications.ux.ContextMenu.Entry[]}
         * @protected
         */
        _getCharacteristicContextOptions(target: HTMLElement): ContextMenuEntryLike[] {
            const charKey = target.dataset.characteristic;
            if (!charKey) return [];
            const char = (this.actor as any).system.characteristics?.[charKey] as WH40KCharacteristic | undefined;
            if (!char) return [];

            return [
                {
                    name: `Roll ${char.label || charKey} Test`,
                    icon: '<i class="fas fa-dice-d20"></i>',
                    callback: () => this._onCharacteristicRoll(charKey),
                },
                {
                    name: 'Roll with Modifier...',
                    icon: '<i class="fas fa-dice-d20"></i>',
                    callback: () => this._onCharacteristicRollWithModifier(charKey),
                },
                {
                    name: 'View Modifier Sources',
                    icon: '<i class="fas fa-info-circle"></i>',
                    callback: () => this._showModifierSources(charKey),
                },
                {
                    name: 'Edit Characteristic',
                    icon: '<i class="fas fa-edit"></i>',
                    callback: () => this._onEditCharacteristic(charKey),
                },
                {
                    name: 'Spend XP to Advance',
                    icon: '<i class="fas fa-star"></i>',
                    callback: () => this._onAdvanceCharacteristic(charKey),
                    condition: () => (char.advance ?? 0) < 5,
                },
                {
                    name: 'Post to Chat',
                    icon: '<i class="fas fa-comment"></i>',
                    callback: () => this._postCharacteristicToChat(charKey, char),
                },
            ];
        }

        /* -------------------------------------------- */

        /**
         * Get context menu options for a skill.
         * @param {HTMLElement} target  Element that was right-clicked
         * @returns {foundry.applications.ux.ContextMenu.Entry[]}
         * @protected
         */
        _getSkillContextOptions(target: HTMLElement): ContextMenuEntryLike[] {
            const skillKey = target.dataset.skill;
            if (!skillKey) return [];
            const skill = (this.actor as any).system.skills?.[skillKey] as WH40KSkill | undefined;
            if (!skill) return [];

            const options: ContextMenuEntryLike[] = [
                {
                    name: `Roll ${skill.label || skillKey} Test`,
                    icon: '<i class="fas fa-dice-d20"></i>',
                    callback: () => this._onSkillRoll(skillKey),
                },
                {
                    name: 'Roll with Modifier...',
                    icon: '<i class="fas fa-dice-d20"></i>',
                    callback: () => this._onSkillRollWithModifier(skillKey),
                },
                {
                    name: skill.trained ? 'Untrain' : 'Train',
                    icon: '<i class="fas fa-graduation-cap"></i>',
                    callback: () => this._toggleSkillTraining(skillKey, 'trained'),
                },
                {
                    name: skill.plus10 ? 'Remove +10' : 'Add +10',
                    icon: '<i class="fas fa-plus-circle"></i>',
                    callback: () => this._toggleSkillTraining(skillKey, 'plus10'),
                    condition: () => skill.trained,
                },
                {
                    name: skill.plus20 ? 'Remove +20' : 'Add +20',
                    icon: '<i class="fas fa-plus-circle"></i>',
                    callback: () => this._toggleSkillTraining(skillKey, 'plus20'),
                    condition: () => skill.plus10,
                },
                {
                    name: 'View Governing Characteristic',
                    icon: '<i class="fas fa-eye"></i>',
                    callback: () => this._showGoverningCharacteristic(skillKey, skill),
                },
            ];

            // Add specialization option for specialist skills
            if (Array.isArray(skill.entries)) {
                options.push({
                    name: 'Add Specialization',
                    icon: '<i class="fas fa-plus"></i>',
                    callback: () => this._addSkillSpecialization(skillKey),
                });
            }

            return options;
        }

        /* -------------------------------------------- */

        /**
         * Get context menu options for an item.
         * @param {HTMLElement} target  Element that was right-clicked
         * @returns {foundry.applications.ux.ContextMenu.Entry[]}
         * @protected
         */
        _getItemContextOptions(target: HTMLElement): ContextMenuEntryLike[] {
            const itemId = target.dataset.itemId;
            if (!itemId) return [];
            const item = this.actor.items.get(itemId);
            if (!item) return [];

            const options: ContextMenuEntryLike[] = [];

            // Weapon-specific options
            if (item.type === 'weapon') {
                const system = item.system as { rateOfFire?: string };
                const rateOfFire = system.rateOfFire;
                options.push(
                    {
                        name: 'Standard Attack',
                        icon: '<i class="fas fa-crosshairs"></i>',
                        callback: () => this._weaponAttack(item, 'standard'),
                    },
                    {
                        name: 'Aimed Attack',
                        icon: '<i class="fas fa-bullseye"></i>',
                        callback: () => this._weaponAttack(item, 'aimed'),
                    },
                );

                if (rateOfFire?.includes('S')) {
                    options.push({
                        name: 'Semi-Auto Burst',
                        icon: '<i class="fas fa-redo"></i>',
                        callback: () => this._weaponAttack(item, 'semi'),
                    });
                }

                if (rateOfFire?.includes('–') || rateOfFire?.includes('/-')) {
                    options.push({
                        name: 'Full-Auto Burst',
                        icon: '<i class="fas fa-fire"></i>',
                        callback: () => this._weaponAttack(item, 'full'),
                    });
                }
            }

            // Equip/Unequip for applicable items
            if (['weapon', 'armour', 'gear'].includes(item.type)) {
                const system = item.system as { equipped?: boolean };
                const equipped = system.equipped;
                options.push({
                    name: equipped ? 'Unequip' : 'Equip',
                    icon: `<i class="fas ${equipped ? 'fa-times-circle' : 'fa-check-circle'}"></i>`,
                    callback: () => this._toggleEquipped(item),
                });
            }

            // Activate/Deactivate for force fields, etc.
            const system = item.system as { activated?: boolean };
            const activated = system.activated;
            if (activated !== undefined) {
                options.push({
                    name: activated ? 'Deactivate' : 'Activate',
                    icon: `<i class="fas ${activated ? 'fa-power-off' : 'fa-bolt'}"></i>`,
                    callback: () => this._toggleActivated(item),
                });
            }

            // Standard item actions
            options.push(
                {
                    name: 'Edit Item',
                    icon: '<i class="fas fa-edit"></i>',
                    callback: () => item.sheet?.render(true),
                },
                {
                    name: 'Duplicate',
                    icon: '<i class="fas fa-copy"></i>',
                    callback: () => this._duplicateItem(item),
                },
                {
                    name: 'Delete',
                    icon: '<i class="fas fa-trash"></i>',
                    callback: () => this._deleteItem(item),
                },
            );

            return options;
        }

        /* -------------------------------------------- */

        /**
         * Get context menu options for fate points.
         * @returns {foundry.applications.ux.ContextMenu.Entry[]}
         * @protected
         */
        _getFatePointContextOptions(): ContextMenuEntryLike[] {
            return [
                {
                    name: 'Spend for Re-roll',
                    icon: '<i class="fas fa-redo"></i>',
                    callback: () => this._spendFate('reroll'),
                },
                {
                    name: 'Spend for +10 Bonus',
                    icon: '<i class="fas fa-plus-circle"></i>',
                    callback: () => this._spendFate('bonus'),
                },
                {
                    name: 'Spend for +1 DoS',
                    icon: '<i class="fas fa-arrow-up"></i>',
                    callback: () => this._spendFate('dos'),
                },
                {
                    name: 'Spend for Healing (1d5)',
                    icon: '<i class="fas fa-heartbeat"></i>',
                    callback: () => this._spendFate('healing'),
                },
                {
                    name: 'Burn Fate Point (Permanent)',
                    icon: '<i class="fas fa-fire"></i>',
                    callback: () => this._burnFatePoint(),
                    group: 'danger',
                },
            ];
        }

        /* -------------------------------------------- */
        /*  Context Menu Actions                        */
        /* -------------------------------------------- */

        async _onCharacteristicRoll(charKey: string): Promise<void> {
            if ('rollCharacteristic' in this.actor && typeof (this.actor as any).rollCharacteristic === 'function') {
                await (this.actor as any).rollCharacteristic(charKey);
            }
        }

        async _onCharacteristicRollWithModifier(charKey: string): Promise<void> {}

        async _showModifierSources(charKey: string): Promise<void> {}

        async _onAdvanceCharacteristic(charKey: string): Promise<void> {}

        async _postCharacteristicToChat(charKey: string, char: WH40KCharacteristic): Promise<void> {
            const content = `<div class="wh40k-char-chat">
                <strong>${char.label || charKey}</strong>: ${char.total}
                (Bonus: ${char.bonus})
            </div>`;
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor as unknown as Actor }),
                content,
            });
        }

        async _onEditCharacteristic(charKey: string): Promise<void> {
            const fakeTarget = document.createElement('div');
            fakeTarget.dataset.characteristic = charKey;
            await (this.constructor as any).actions.editCharacteristic.call(this, null, fakeTarget);
        }

        async _onSkillRoll(skillKey: string): Promise<void> {
            if ('rollSkill' in this.actor && typeof (this.actor as any).rollSkill === 'function') {
                await (this.actor as any).rollSkill(skillKey);
            }
        }

        async _onSkillRollWithModifier(skillKey: string): Promise<void> {}

        async _toggleSkillTraining(skillKey: string, level: string): Promise<void> {}

        _showGoverningCharacteristic(skillKey: string, skill: WH40KSkill): void {
            ui.notifications.info(`${skill.label || skillKey} is governed by ${skill.characteristic}`);
        }

        async _addSkillSpecialization(skillKey: string): Promise<void> {}

        async _duplicateItem(item: WH40KItem): Promise<void> {
            await item.clone({ name: `${item.name} (Copy)` }, { save: true });
            ui.notifications.info(`Duplicated ${item.name}`);
        }

        async _deleteItem(item: WH40KItem): Promise<void> {
            const confirmed = await dialogV2.confirm({
                window: { title: `Delete ${item.name}?` },
                content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
                yes: { default: false },
                no: { default: true },
            });

            if (confirmed) {
                await item.delete();
                ui.notifications.info(`Deleted ${item.name}`);
            }
        }

        async _weaponAttack(item: WH40KItem, mode: string): Promise<void> {}

        async _toggleEquipped(item: WH40KItem): Promise<void> {
            const system = item.system as Record<string, unknown>;
            await item.update({ 'system.equipped': !(system.equipped as boolean) });
        }

        async _toggleActivated(item: WH40KItem): Promise<void> {
            const system = item.system as Record<string, unknown>;
            await item.update({ 'system.activated': !(system.activated as boolean) });
        }

        async _spendFate(purpose: string): Promise<void> {}

        async _burnFatePoint(): Promise<void> {
            const confirmed = await dialogV2.confirm({
                window: { title: 'Burn Fate Point?' },
                content: `<p><strong>Warning:</strong> This will permanently reduce your maximum Fate Points!</p><p>Are you sure?</p>`,
                yes: { default: false },
                no: { default: true },
            });

            if (confirmed) {
                const system = this.actor.system as Record<string, unknown>;
                const fate = system.fate as Record<string, unknown> | undefined;
                const currentTotal = (fate?.total as number) ?? 0;
                if (currentTotal > 0) {
                    await this.actor.update({ 'system.fate.total': currentTotal - 1 });
                    ui.notifications.warn('Fate Point burned! Maximum reduced permanently.');
                }
            }
        }
    }

    return ContextMenuApplication;
}
