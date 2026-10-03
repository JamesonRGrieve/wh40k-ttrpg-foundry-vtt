/**
 * @file ContextMenuMixin - Right-click context menus using Foundry V13 native ContextMenu
 * Provides contextual action menus throughout the character sheet
 */

import type { WH40KAcolyte } from '../../documents/acolyte.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KNPC } from '../../documents/npc.ts';
import type { WH40KCharacteristic, WH40KSkill } from '../../types/global.d.ts';
import type { ApplicationV2Ctor, ContextMenuEntryLike, DialogV2Like, FoundryApplicationUXLike } from './application-types.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications.ux not on shipped types
const applicationUX = (foundry.applications as unknown as { ux: FoundryApplicationUXLike }).ux;
// eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2 not on shipped foundry.applications.api types
const dialogV2 = (foundry.applications as unknown as { api: { DialogV2: DialogV2Like } }).api.DialogV2;

type ActorType = WH40KAcolyte | WH40KNPC | WH40KBaseActor;

/**
 * Custom ContextMenu subclass for WH40K RPG styling.
 * Uses Foundry V13's native ContextMenu with fixed positioning.
 */
class WH40KContextMenu extends applicationUX.ContextMenu {
    // biome-ignore lint/complexity/noUselessConstructor: required to forward deprecated ContextMenu args with explicit annotation
    constructor(...args: ConstructorParameters<typeof applicationUX.ContextMenu>) {
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- boundary: ContextMenu super-call deprecated jQuery default; we always pass jQuery: false at call sites
        super(...args);
    }

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ContextMenu options record varies between V13/V14 typings
    override _setPosition(html: HTMLElement, target: HTMLElement, options: Record<string, unknown> = {}): void {
        html.classList.add('wh40k-context-menu');
        // eslint-disable-next-line no-restricted-syntax -- boundary: _setFixedPosition is V13 internal, not on shipped types
        (this as unknown as { _setFixedPosition: (h: HTMLElement, t: HTMLElement, o: Record<string, unknown>) => void })._setFixedPosition(
            html,
            target,
            options,
        );
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
export default function ContextMenuMixin<T extends ApplicationV2Ctor>(Base: T): T {
    class ContextMenuApplication extends Base {
        /* eslint-disable @typescript-eslint/no-explicit-any -- TypeScript mixin requirement */
        // biome-ignore lint/complexity/noUselessConstructor: required to forward any[] args per TS mixin rule (TS2545)
        // biome-ignore lint/suspicious/noExplicitAny: mixin constructor requires any[] per TS mixin rule (TS2545)
        constructor(...args: any[]) {
            /* eslint-enable @typescript-eslint/no-explicit-any */
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- spreading any[] is inherent to the mixin pattern (TS2545)
            super(...args);
        }

        declare actor: ActorType;

        /* -------------------------------------------- */
        /*  Lifecycle Methods                           */
        /* -------------------------------------------- */

        /** @override */
        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender accepts untyped context record
        override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            await super._onRender(context, options);

            // Setup context menus on first render
            if (options.isFirstRender === true) {
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
            const charKey = target.dataset['characteristic'];
            if (charKey === undefined || charKey === '') return [];
            const characteristics = (this.actor.system as { characteristics?: Record<string, WH40KCharacteristic> }).characteristics;
            const char = characteristics?.[charKey];
            if (!char) return [];

            return [
                {
                    name: game.i18n.format('WH40K.ContextMenu.RollTest', { name: char.label !== '' ? char.label : charKey }),
                    icon: '<i class="fas fa-dice-d20"></i>',
                    callback: async () => this._onCharacteristicRoll(charKey),
                },
                {
                    name: game.i18n.localize('WH40K.ContextMenu.RollWithModifier'),
                    icon: '<i class="fas fa-dice-d20"></i>',
                    callback: async () => this._onCharacteristicRollWithModifier(charKey),
                },
                {
                    name: game.i18n.localize('WH40K.ContextMenu.ViewModifierSources'),
                    icon: '<i class="fas fa-info-circle"></i>',
                    callback: async () => this._showModifierSources(charKey),
                },
                {
                    name: game.i18n.localize('WH40K.ContextMenu.EditCharacteristic'),
                    icon: '<i class="fas fa-edit"></i>',
                    callback: async () => this._onEditCharacteristic(charKey),
                },
                {
                    name: game.i18n.localize('WH40K.ContextMenu.SpendXpToAdvance'),
                    icon: '<i class="fas fa-star"></i>',
                    callback: async () => this._onAdvanceCharacteristic(charKey),
                    condition: () => char.advance < 5,
                },
                {
                    name: game.i18n.localize('WH40K.Action.PostToChat'),
                    icon: '<i class="fas fa-comment"></i>',
                    callback: async () => this._postCharacteristicToChat(charKey, char),
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
            const skillKey = target.dataset['skill'];
            if (skillKey === undefined || skillKey === '') return [];
            const skills = (this.actor.system as { skills?: Record<string, WH40KSkill> }).skills;
            const skill = skills?.[skillKey];
            if (!skill) return [];

            const options: ContextMenuEntryLike[] = [
                {
                    name: game.i18n.format('WH40K.ContextMenu.RollTest', { name: skill.label !== undefined && skill.label !== '' ? skill.label : skillKey }),
                    icon: '<i class="fas fa-dice-d20"></i>',
                    callback: async () => this._onSkillRoll(skillKey),
                },
                {
                    name: game.i18n.localize('WH40K.ContextMenu.RollWithModifier'),
                    icon: '<i class="fas fa-dice-d20"></i>',
                    callback: async () => this._onSkillRollWithModifier(skillKey),
                },
                {
                    name: game.i18n.localize(skill.trained ? 'WH40K.ContextMenu.Untrain' : 'WH40K.ContextMenu.Train'),
                    icon: '<i class="fas fa-graduation-cap"></i>',
                    callback: async () => this._toggleSkillTraining(skillKey, 'trained'),
                },
                {
                    name: game.i18n.localize(skill.plus10 ? 'WH40K.ContextMenu.RemovePlus10' : 'WH40K.ContextMenu.AddPlus10'),
                    icon: '<i class="fas fa-plus-circle"></i>',
                    callback: async () => this._toggleSkillTraining(skillKey, 'plus10'),
                    condition: () => skill.trained,
                },
                {
                    name: game.i18n.localize(skill.plus20 ? 'WH40K.ContextMenu.RemovePlus20' : 'WH40K.ContextMenu.AddPlus20'),
                    icon: '<i class="fas fa-plus-circle"></i>',
                    callback: async () => this._toggleSkillTraining(skillKey, 'plus20'),
                    condition: () => skill.plus10,
                },
                {
                    name: game.i18n.localize('WH40K.ContextMenu.ViewGoverningCharacteristic'),
                    icon: '<i class="fas fa-eye"></i>',
                    callback: () => this._showGoverningCharacteristic(skillKey, skill),
                },
            ];

            // Add specialization option for specialist skills
            if (Array.isArray(skill.entries)) {
                options.push({
                    name: game.i18n.localize('WH40K.ContextMenu.AddSpecialisation'),
                    icon: '<i class="fas fa-plus"></i>',
                    callback: async () => this._addSkillSpecialization(skillKey),
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
            const itemId = target.dataset['itemId'];
            if (itemId === undefined || itemId === '') return [];
            const item = this.actor.items.get(itemId);
            if (!item) return [];

            const options: ContextMenuEntryLike[] = [];

            // Weapon-specific options
            if (item.type === 'weapon') {
                const system = item.system as { rateOfFire?: string };
                const rateOfFire = system.rateOfFire;
                options.push(
                    {
                        name: game.i18n.localize('WH40K.ContextMenu.StandardAttack'),
                        icon: '<i class="fas fa-crosshairs"></i>',
                        callback: async () => this._weaponAttack(item, 'standard'),
                    },
                    {
                        name: game.i18n.localize('WH40K.ContextMenu.AimedAttack'),
                        icon: '<i class="fas fa-bullseye"></i>',
                        callback: async () => this._weaponAttack(item, 'aimed'),
                    },
                );

                if (rateOfFire?.includes('S') === true) {
                    options.push({
                        name: game.i18n.localize('WH40K.ContextMenu.SemiAutoBurst'),
                        icon: '<i class="fas fa-redo"></i>',
                        callback: async () => this._weaponAttack(item, 'semi'),
                    });
                }

                if (rateOfFire?.includes('–') === true || rateOfFire?.includes('/-') === true) {
                    options.push({
                        name: game.i18n.localize('WH40K.ContextMenu.FullAutoBurst'),
                        icon: '<i class="fas fa-fire"></i>',
                        callback: async () => this._weaponAttack(item, 'full'),
                    });
                }
            }

            // Equip/Unequip for applicable items
            if (['weapon', 'armour', 'gear'].includes(item.type)) {
                const system = item.system as { state?: { equipped?: boolean } };
                const equipped = system.state?.equipped;
                options.push({
                    name: equipped === true ? 'Unequip' : 'Equip',
                    icon: `<i class="fas ${equipped === true ? 'fa-times-circle' : 'fa-check-circle'}"></i>`,
                    callback: async () => this._toggleEquipped(item),
                });
            }

            // Activate/Deactivate for force fields, etc.
            const activatableSystem = item.system as { state?: { activated?: boolean } };
            const activated = activatableSystem.state?.activated;
            if (activated !== undefined) {
                options.push({
                    name: activated ? 'Deactivate' : 'Activate',
                    icon: `<i class="fas ${activated ? 'fa-power-off' : 'fa-bolt'}"></i>`,
                    callback: async () => this._toggleActivated(item),
                });
            }

            // Standard item actions
            options.push(
                {
                    name: game.i18n.localize('WH40K.ContextMenu.EditItem'),
                    icon: '<i class="fas fa-edit"></i>',
                    callback: () => {
                        // eslint-disable-next-line @typescript-eslint/no-deprecated -- render(true) is the V14-compatible force-open idiom
                        void item.sheet?.render(true);
                    },
                },
                {
                    name: game.i18n.localize('WH40K.ContextMenu.Duplicate'),
                    icon: '<i class="fas fa-copy"></i>',
                    callback: async () => this._duplicateItem(item),
                },
                {
                    name: game.i18n.localize('WH40K.Common.Delete'),
                    icon: '<i class="fas fa-trash"></i>',
                    callback: async () => this._deleteItem(item),
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
                    name: game.i18n.localize('WH40K.ContextMenu.SpendReroll'),
                    icon: '<i class="fas fa-redo"></i>',
                    callback: async () => this._spendFate('reroll'),
                },
                {
                    name: game.i18n.localize('WH40K.ContextMenu.SpendBonus'),
                    icon: '<i class="fas fa-plus-circle"></i>',
                    callback: async () => this._spendFate('bonus'),
                },
                {
                    name: game.i18n.localize('WH40K.ContextMenu.SpendDos'),
                    icon: '<i class="fas fa-arrow-up"></i>',
                    callback: async () => this._spendFate('dos'),
                },
                {
                    name: game.i18n.localize('WH40K.ContextMenu.SpendHealing'),
                    icon: '<i class="fas fa-heartbeat"></i>',
                    callback: async () => this._spendFate('healing'),
                },
                {
                    name: game.i18n.localize('WH40K.ContextMenu.BurnFatePoint'),
                    icon: '<i class="fas fa-fire"></i>',
                    callback: async () => this._burnFatePoint(),
                    group: 'danger',
                },
            ];
        }

        /* -------------------------------------------- */
        /*  Context Menu Actions                        */
        /* -------------------------------------------- */

        async _onCharacteristicRoll(charKey: string): Promise<void> {
            // eslint-disable-next-line no-restricted-syntax -- boundary: rollCharacteristic exists on game-system actor subclasses, not on Actor.Implementation
            const a = this.actor as unknown as { rollCharacteristic?: (key: string) => Promise<void> };
            if (typeof a.rollCharacteristic === 'function') {
                await a.rollCharacteristic(charKey);
            }
        }

        async _onCharacteristicRollWithModifier(_charKey: string): Promise<void> {}

        async _showModifierSources(_charKey: string): Promise<void> {}

        async _onAdvanceCharacteristic(_charKey: string): Promise<void> {}

        async _postCharacteristicToChat(charKey: string, char: WH40KCharacteristic): Promise<void> {
            const label = char.label !== '' ? char.label : charKey;
            const content = `<div class="wh40k-char-chat">
                <strong>${label}</strong>: ${char.total}
                (Bonus: ${char.bonus})
            </div>`;
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content,
            });
        }

        async _onEditCharacteristic(charKey: string): Promise<void> {
            const fakeTarget = document.createElement('div');
            fakeTarget.dataset['characteristic'] = charKey;
            // eslint-disable-next-line no-restricted-syntax -- boundary: subclass action map shape varies; static action ref accessed via constructor
            const ctor = this.constructor as unknown as {
                actions: { editCharacteristic: (this: ContextMenuApplication, e: Event | null, t: HTMLElement) => Promise<void> };
            };
            await ctor.actions.editCharacteristic.call(this, null, fakeTarget);
        }

        async _onSkillRoll(skillKey: string): Promise<void> {
            // eslint-disable-next-line no-restricted-syntax -- boundary: rollSkill exists on game-system actor subclasses, not on Actor.Implementation
            const a = this.actor as unknown as { rollSkill?: (key: string) => Promise<void> };
            if (typeof a.rollSkill === 'function') {
                await a.rollSkill(skillKey);
            }
        }

        async _onSkillRollWithModifier(_skillKey: string): Promise<void> {}

        async _toggleSkillTraining(_skillKey: string, _level: string): Promise<void> {}

        _showGoverningCharacteristic(skillKey: string, skill: WH40KSkill): void {
            const label = skill.label !== undefined && skill.label !== '' ? skill.label : skillKey;
            ui.notifications.info(game.i18n.format('WH40K.Notify.Item.GovernedBy', { label, characteristic: skill.characteristic }));
        }

        async _addSkillSpecialization(_skillKey: string): Promise<void> {}

        async _duplicateItem(item: WH40KItem): Promise<void> {
            await item.clone({ name: game.i18n.format('WH40K.Notify.Item.CopyName', { name: item.name }) }, { save: true });
            ui.notifications.info(game.i18n.format('WH40K.Notify.Item.Duplicated', { item: item.name }));
        }

        async _deleteItem(item: WH40KItem): Promise<void> {
            const confirmed = await dialogV2.confirm({
                window: { title: game.i18n.format('WH40K.WeaponSheet.ConfirmDeleteTitle', { name: item.name }) },
                content: game.i18n.format('WH40K.Notify.Item.ConfirmDeleteContent', { item: item.name }),
                yes: { default: false },
                no: { default: true },
            });

            if (confirmed) {
                await item.delete();
                ui.notifications.info(game.i18n.format('WH40K.Notify.Item.Deleted', { item: item.name }));
            }
        }

        async _weaponAttack(_item: WH40KItem, _mode: string): Promise<void> {}

        async _toggleEquipped(item: WH40KItem): Promise<void> {
            const sys = item.system as { state?: { equipped?: boolean } };
            await item.update({ 'system.state.equipped': sys.state?.equipped !== true });
        }

        async _toggleActivated(item: WH40KItem): Promise<void> {
            const sys = item.system as { state?: { activated?: boolean } };
            await item.update({ 'system.state.activated': sys.state?.activated !== true });
        }

        async _spendFate(_purpose: string): Promise<void> {}

        async _burnFatePoint(): Promise<void> {
            const confirmed = await dialogV2.confirm({
                window: { title: game.i18n.localize('WH40K.Notify.Stat.BurnFateTitle') },
                content: game.i18n.localize('WH40K.Notify.Stat.BurnFateWarning'),
                yes: { default: false },
                no: { default: true },
            });

            if (confirmed) {
                const fate = (this.actor.system as { fate?: { total?: number } }).fate;
                const currentTotal = fate?.total ?? 0;
                if (currentTotal > 0) {
                    await this.actor.update({ 'system.fate.total': currentTotal - 1 });
                    ui.notifications.warn(game.i18n.localize('WH40K.Notify.Fate.Burned'));
                }
            }
        }
    }

    return ContextMenuApplication;
}
