/**
 * @file ActiveModifiersPanel - Displays active modifiers and their sources on character sheets
 *
 * Shows a panel of all active modifiers affecting an actor, including:
 * - Conditions and their effects
 * - Talent bonuses/penalties
 * - Trait modifiers
 * - Equipment bonuses
 * - Active effects
 *
 * Usage:
 * - Apply ActiveModifiersMixin to actor sheets
 * - Renders panel in overview/status tab
 * - Click sources to view item sheets
 * - Toggle optional modifiers on/off
 */

/**
 * Mixin that adds active modifiers panel to actor sheets
 * @param {typeof Application} Base - Base class to extend
 * @returns {typeof Application} Extended class
 */
export function ActiveModifiersMixin(Base) {
    return class extends Base {
        /** @override */
        static DEFAULT_OPTIONS = {
            actions: {
                ...super.DEFAULT_OPTIONS?.actions,
                toggleModifier: ActiveModifiersMixin.#toggleModifier,
                viewModifierSource: ActiveModifiersMixin.#viewModifierSource,
                toggleModifiersPanel: ActiveModifiersMixin.#toggleModifiersPanel,
            },
        };

        /**
         * Panel collapsed state
         * @type {boolean}
         */
        #modifiersPanelCollapsed = false;

        /**
         * Toggle a modifier on/off (for optional modifiers)
         * @this {Application}
         * @param {PointerEvent} event - Triggering event
         * @param {HTMLElement} target - Action target
         */
        static async #toggleModifier(event, target) {
            const itemId = target.dataset.itemId;
            if (!itemId) return;

            const item = this.actor.items.get(itemId);
            if (!item) return;

            // Toggle the item's active state
            const isActive = item.system.active ?? true;
            await item.update({ 'system.active': !isActive });
        }

        /**
         * View the source item of a modifier
         * @this {Application}
         * @param {PointerEvent} event - Triggering event
         * @param {HTMLElement} target - Action target
         */
        static async #viewModifierSource(event, target) {
            const itemId = target.dataset.itemId;
            if (!itemId) return;

            const item = this.actor.items.get(itemId);
            if (item) {
                item.sheet.render(true);
            }
        }

        /**
         * Toggle modifiers panel collapsed state
         * @this {Application}
         * @param {PointerEvent} event - Triggering event
         * @param {HTMLElement} target - Action target
         */
        static async #toggleModifiersPanel(event, target) {
            this.#modifiersPanelCollapsed = !this.#modifiersPanelCollapsed;
            this.render();
        }

        /**
         * Prepare active modifiers data for rendering
         * @returns {Object} Modifiers data structure
         */
        prepareActiveModifiers() {
            const actor = this.actor;
            const modifiers = {
                conditions: [],
                talents: [],
                traits: [],
                equipment: [],
                effects: [],
                collapsed: this.#modifiersPanelCollapsed,
            };

            // Collect conditions
            const conditions = actor.items.filter((i) => i.type === 'condition');
            for (const condition of conditions) {
                const system = condition.system;
                modifiers.conditions.push({
                    id: condition.id,
                    name: condition.name,
                    img: condition.img,
                    description: system.description || '',
                    duration: system.duration || 'Permanent',
                    stacks: system.stacks || 1,
                    nature: system.nature || 'neutral',
                    active: true, // Conditions are always active
                    canToggle: false,
                });
            }

            // Collect talents with modifiers
            const talents = actor.items.filter((i) => i.type === 'talent');
            for (const talent of talents) {
                const system = talent.system;
                if (system.modifiers && this.#hasActiveModifiers(system.modifiers)) {
                    modifiers.talents.push({
                        id: talent.id,
                        name: talent.fullName || talent.name,
                        img: talent.img,
                        description: this.#formatModifierDescription(system.modifiers),
                        duration: system.isPassive ? 'Passive' : 'Active',
                        active: system.active ?? true,
                        canToggle: !system.isPassive,
                    });
                }
            }

            // Collect traits with modifiers
            const traits = actor.items.filter((i) => i.type === 'trait');
            for (const trait of traits) {
                const system = trait.system;
                if (system.modifiers && this.#hasActiveModifiers(system.modifiers)) {
                    modifiers.traits.push({
                        id: trait.id,
                        name: trait.name,
                        img: trait.img,
                        description: this.#formatModifierDescription(system.modifiers),
                        duration: 'Permanent',
                        active: true,
                        canToggle: false,
                    });
                }
            }

            // Collect equipped items with bonuses
            const equipment = actor.items.filter((i) => ['weapon', 'armour', 'gear'].includes(i.type) && i.system.equipped);
            for (const item of equipment) {
                const system = item.system;
                if (system.modifiers && this.#hasActiveModifiers(system.modifiers)) {
                    modifiers.equipment.push({
                        id: item.id,
                        name: item.name,
                        img: item.img,
                        description: this.#formatModifierDescription(system.modifiers),
                        duration: 'While Equipped',
                        active: true,
                        canToggle: false,
                    });
                }
            }

            // Collect active effects
            for (const effect of actor.effects) {
                if (!effect.disabled) {
                    modifiers.effects.push({
                        id: effect.id,
                        name: effect.name || effect.label,
                        img: effect.img || effect.icon,
                        description: this.#formatEffectDescription(effect),
                        duration: this.#formatEffectDuration(effect),
                        active: !effect.disabled,
                        canToggle: true,
                        isEffect: true,
                    });
                }
            }

            return modifiers;
        }

        /**
         * Check if modifiers object has any active modifiers
         * @param {Object} modifiers - Modifiers object
         * @returns {boolean}
         * @private
         */
        #hasActiveModifiers(modifiers) {
            if (!modifiers) return false;

            // Check characteristics
            if (modifiers.characteristics) {
                for (const value of Object.values(modifiers.characteristics)) {
                    if (value !== 0 && value !== null && value !== undefined) return true;
                }
            }

            // Check skills
            if (modifiers.skills) {
                for (const value of Object.values(modifiers.skills)) {
                    if (value !== 0 && value !== null && value !== undefined) return true;
                }
            }

            // Check combat
            if (modifiers.combat) {
                for (const value of Object.values(modifiers.combat)) {
                    if (value !== 0 && value !== null && value !== undefined) return true;
                }
            }

            // Check other
            if (modifiers.other && modifiers.other.length > 0) {
                return true;
            }

            return false;
        }

        /**
         * Format modifiers into readable description
         * @param {Object} modifiers - Modifiers object
         * @returns {string}
         * @private
         */
        #formatModifierDescription(modifiers) {
            const parts = [];

            // Characteristics
            if (modifiers.characteristics) {
                for (const [char, value] of Object.entries(modifiers.characteristics)) {
                    if (value) {
                        parts.push(`${char.toUpperCase()} ${value > 0 ? '+' : ''}${value}`);
                    }
                }
            }

            // Skills
            if (modifiers.skills) {
                for (const [skill, value] of Object.entries(modifiers.skills)) {
                    if (value) {
                        parts.push(`${skill} ${value > 0 ? '+' : ''}${value}`);
                    }
                }
            }

            // Combat
            if (modifiers.combat) {
                for (const [type, value] of Object.entries(modifiers.combat)) {
                    if (value) {
                        parts.push(`${type} ${value > 0 ? '+' : ''}${value}`);
                    }
                }
            }

            // Other
            if (modifiers.other && modifiers.other.length > 0) {
                for (const mod of modifiers.other) {
                    parts.push(`${mod.key} ${mod.value > 0 ? '+' : ''}${mod.value}`);
                }
            }

            return parts.join(', ') || 'Various modifiers';
        }

        /**
         * Format active effect description
         * @param {ActiveEffect} effect - Active effect
         * @returns {string}
         * @private
         */
        #formatEffectDescription(effect) {
            const changes = effect.changes || [];
            if (changes.length === 0) return 'No changes';

            const parts = changes.map((change) => {
                const key = change.key.split('.').pop();
                return `${key} ${change.value}`;
            });

            return parts.join(', ');
        }

        /**
         * Format active effect duration
         * @param {ActiveEffect} effect - Active effect
         * @returns {string}
         * @private
         */
        #formatEffectDuration(effect) {
            if (!effect.duration?.rounds && !effect.duration?.seconds) {
                return 'Permanent';
            }

            const parts = [];
            if (effect.duration.rounds) {
                parts.push(`${effect.duration.rounds} rounds`);
            }
            if (effect.duration.seconds) {
                parts.push(`${effect.duration.seconds}s`);
            }

            return parts.join(', ');
        }
    };
}
