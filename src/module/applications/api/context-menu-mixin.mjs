/**
 * @file ContextMenuMixin - Right-click context menus using Foundry V13 native ContextMenu
 * Provides contextual action menus throughout the character sheet
 */

/**
 * Custom ContextMenu subclass for Rogue Trader styling.
 * Uses Foundry V13's native ContextMenu with fixed positioning.
 */
export class RTContextMenu extends foundry.applications.ux.ContextMenu {
    /** @override */
    _setPosition(html, target, options = {}) {
        html.classList.add("rt-context-menu");
        return this._setFixedPosition(html, target, options);
    }

    /**
     * Trigger a context menu event in response to a normal click.
     * Useful for adding context menu buttons alongside right-click.
     * @param {PointerEvent} event
     */
    static triggerEvent(event) {
        event.preventDefault();
        event.stopPropagation();
        const { clientX, clientY } = event;
        const selector = "[data-item-id],[data-characteristic],[data-skill],[data-fate-point]";
        const target = event.target.closest(selector) ?? event.currentTarget.closest(selector);
        target?.dispatchEvent(new PointerEvent("contextmenu", {
            view: window, bubbles: true, cancelable: true, clientX, clientY
        }));
    }
}

/**
 * Mixin to add context menu capabilities to ApplicationV2 sheets.
 * Uses Foundry V13's native ContextMenu for better accessibility and keyboard navigation.
 * @template {ApplicationV2} T
 * @param {typeof T} Base   Application class being extended.
 * @returns {typeof ContextMenuApplication}
 * @mixin
 */
export default function ContextMenuMixin(Base) {
    class ContextMenuApplication extends Base {
        
        /* -------------------------------------------- */
        /*  Lifecycle Methods                           */
        /* -------------------------------------------- */
        
        /** @override */
        _onRender(context, options) {
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
        _createContextMenus() {
            // Characteristics context menu
            new RTContextMenu(this.element, "[data-characteristic]", [], {
                onOpen: target => this._getCharacteristicContextOptions(target),
                jQuery: false
            });
            
            // Skills context menu
            new RTContextMenu(this.element, "[data-skill]", [], {
                onOpen: target => this._getSkillContextOptions(target),
                jQuery: false
            });
            
            // Items context menu
            new RTContextMenu(this.element, "[data-item-id]", [], {
                onOpen: target => this._getItemContextOptions(target),
                jQuery: false
            });
            
            // Fate points context menu
            new RTContextMenu(this.element, "[data-fate-point]", [], {
                onOpen: () => this._getFatePointContextOptions(),
                jQuery: false
            });
            
            // Allow subclasses to add custom menus
            this._createCustomContextMenus();
        }
        
        /**
         * Create custom context menus (for subclasses to override).
         * @protected
         */
        _createCustomContextMenus() {
            // Override in subclasses
        }
        
        /* -------------------------------------------- */
        /*  Context Menu Options                        */
        /* -------------------------------------------- */
        
        /**
         * Get context menu options for a characteristic.
         * @param {HTMLElement} target  Element that was right-clicked
         * @returns {ContextMenuEntry[]}
         * @protected
         */
        _getCharacteristicContextOptions(target) {
            const charKey = target.dataset.characteristic;
            const char = this.actor.characteristics?.[charKey];
            if (!char) return [];
            
            return [
                {
                    name: `Roll ${char.label || charKey} Test`,
                    icon: '<i class="fas fa-dice-d20"></i>',
                    callback: () => this._onCharacteristicRoll(charKey)
                },
                {
                    name: "Roll with Modifier...",
                    icon: '<i class="fas fa-dice-d20"></i>',
                    callback: () => this._onCharacteristicRollWithModifier(charKey)
                },
                {
                    name: "View Modifier Sources",
                    icon: '<i class="fas fa-info-circle"></i>',
                    callback: () => this._showModifierSources(charKey)
                },
                {
                    name: "Spend XP to Advance",
                    icon: '<i class="fas fa-star"></i>',
                    callback: () => this._onAdvanceCharacteristic(charKey),
                    condition: () => (char.advance ?? 0) < 5
                },
                {
                    name: "Post to Chat",
                    icon: '<i class="fas fa-comment"></i>',
                    callback: () => this._postCharacteristicToChat(charKey, char)
                }
            ];
        }
        
        /* -------------------------------------------- */
        
        /**
         * Get context menu options for a skill.
         * @param {HTMLElement} target  Element that was right-clicked
         * @returns {ContextMenuEntry[]}
         * @protected
         */
        _getSkillContextOptions(target) {
            const skillKey = target.dataset.skill;
            const skill = this.actor.skills?.[skillKey];
            if (!skill) return [];
            
            const options = [
                {
                    name: `Roll ${skill.label || skillKey} Test`,
                    icon: '<i class="fas fa-dice-d20"></i>',
                    callback: () => this._onSkillRoll(skillKey)
                },
                {
                    name: "Roll with Modifier...",
                    icon: '<i class="fas fa-dice-d20"></i>',
                    callback: () => this._onSkillRollWithModifier(skillKey)
                },
                {
                    name: skill.trained ? "Untrain" : "Train",
                    icon: '<i class="fas fa-graduation-cap"></i>',
                    callback: () => this._toggleSkillTraining(skillKey, "trained")
                },
                {
                    name: skill.plus10 ? "Remove +10" : "Add +10",
                    icon: '<i class="fas fa-plus-circle"></i>',
                    callback: () => this._toggleSkillTraining(skillKey, "plus10"),
                    condition: () => skill.trained
                },
                {
                    name: skill.plus20 ? "Remove +20" : "Add +20",
                    icon: '<i class="fas fa-plus-circle"></i>',
                    callback: () => this._toggleSkillTraining(skillKey, "plus20"),
                    condition: () => skill.plus10
                },
                {
                    name: "View Governing Characteristic",
                    icon: '<i class="fas fa-eye"></i>',
                    callback: () => this._showGoverningCharacteristic(skillKey, skill)
                }
            ];
            
            // Add specialization option for specialist skills
            if (Array.isArray(skill.entries)) {
                options.push({
                    name: "Add Specialization",
                    icon: '<i class="fas fa-plus"></i>',
                    callback: () => this._addSkillSpecialization(skillKey)
                });
            }
            
            return options;
        }
        
        /* -------------------------------------------- */
        
        /**
         * Get context menu options for an item.
         * @param {HTMLElement} target  Element that was right-clicked
         * @returns {ContextMenuEntry[]}
         * @protected
         */
        _getItemContextOptions(target) {
            const itemId = target.dataset.itemId;
            const item = this.actor.items.get(itemId);
            if (!item) return [];
            
            const options = [];
            
            // Weapon-specific options
            if (item.type === "weapon") {
                options.push(
                    {
                        name: "Standard Attack",
                        icon: '<i class="fas fa-crosshairs"></i>',
                        callback: () => this._weaponAttack(item, "standard")
                    },
                    {
                        name: "Aimed Attack",
                        icon: '<i class="fas fa-bullseye"></i>',
                        callback: () => this._weaponAttack(item, "aimed")
                    }
                );
                
                if (item.system.rateOfFire?.includes("S")) {
                    options.push({
                        name: "Semi-Auto Burst",
                        icon: '<i class="fas fa-redo"></i>',
                        callback: () => this._weaponAttack(item, "semi")
                    });
                }
                
                if (item.system.rateOfFire?.includes("–") || item.system.rateOfFire?.includes("/-")) {
                    options.push({
                        name: "Full-Auto Burst",
                        icon: '<i class="fas fa-fire"></i>',
                        callback: () => this._weaponAttack(item, "full")
                    });
                }
            }
            
            // Equip/Unequip for applicable items
            if (["weapon", "armour", "gear"].includes(item.type)) {
                options.push({
                    name: item.system.equipped ? "Unequip" : "Equip",
                    icon: `<i class="fas ${item.system.equipped ? "fa-times-circle" : "fa-check-circle"}"></i>`,
                    callback: () => this._toggleEquipped(item)
                });
            }
            
            // Activate/Deactivate for force fields, etc.
            if (item.system.activated !== undefined) {
                options.push({
                    name: item.system.activated ? "Deactivate" : "Activate",
                    icon: `<i class="fas ${item.system.activated ? "fa-power-off" : "fa-bolt"}"></i>`,
                    callback: () => this._toggleActivated(item)
                });
            }
            
            // Standard item actions
            options.push(
                {
                    name: "Edit Item",
                    icon: '<i class="fas fa-edit"></i>',
                    callback: () => item.sheet.render(true)
                },
                {
                    name: "Duplicate",
                    icon: '<i class="fas fa-copy"></i>',
                    callback: () => this._duplicateItem(item)
                },
                {
                    name: "Delete",
                    icon: '<i class="fas fa-trash"></i>',
                    callback: () => this._deleteItem(item)
                }
            );
            
            return options;
        }
        
        /* -------------------------------------------- */
        
        /**
         * Get context menu options for fate points.
         * @returns {ContextMenuEntry[]}
         * @protected
         */
        _getFatePointContextOptions() {
            return [
                {
                    name: "Spend for Re-roll",
                    icon: '<i class="fas fa-redo"></i>',
                    callback: () => this._spendFate("reroll")
                },
                {
                    name: "Spend for +10 Bonus",
                    icon: '<i class="fas fa-plus-circle"></i>',
                    callback: () => this._spendFate("bonus")
                },
                {
                    name: "Spend for +1 DoS",
                    icon: '<i class="fas fa-arrow-up"></i>',
                    callback: () => this._spendFate("dos")
                },
                {
                    name: "Spend for Healing (1d5)",
                    icon: '<i class="fas fa-heartbeat"></i>',
                    callback: () => this._spendFate("healing")
                },
                {
                    name: "Burn Fate Point (Permanent)",
                    icon: '<i class="fas fa-fire"></i>',
                    callback: () => this._burnFatePoint(),
                    group: "danger"
                }
            ];
        }
        
        /* -------------------------------------------- */
        /*  Context Menu Actions                        */
        /* -------------------------------------------- */
        
        async _onCharacteristicRoll(charKey) {
            // Implement in subclass or delegate to actor
            if (this.actor.rollCharacteristic) {
                await this.actor.rollCharacteristic(charKey);
            }
        }
        
        async _onCharacteristicRollWithModifier(charKey) {
            // Implement in subclass
        }
        
        async _showModifierSources(charKey) {
            // Implement in subclass
        }
        
        async _onAdvanceCharacteristic(charKey) {
            // Implement in subclass
        }
        
        async _postCharacteristicToChat(charKey, char) {
            // Create a simple chat message with characteristic info
            const content = `<div class="rt-char-chat">
                <strong>${char.label || charKey}</strong>: ${char.total}
                (Bonus: ${char.bonus})
            </div>`;
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content
            });
        }
        
        async _onSkillRoll(skillKey) {
            // Implement in subclass or delegate to actor
            if (this.actor.rollSkill) {
                await this.actor.rollSkill(skillKey);
            }
        }
        
        async _onSkillRollWithModifier(skillKey) {
            // Implement in subclass
        }
        
        async _toggleSkillTraining(skillKey, level) {
            // Implement in subclass
        }
        
        async _showGoverningCharacteristic(skillKey, skill) {
            ui.notifications.info(`${skill.label || skillKey} is governed by ${skill.characteristic}`);
        }
        
        async _addSkillSpecialization(skillKey) {
            // Implement in subclass
        }
        
        async _duplicateItem(item) {
            await item.clone({ name: `${item.name} (Copy)` }, { save: true });
            ui.notifications.info(`Duplicated ${item.name}`);
        }
        
        async _deleteItem(item) {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: `Delete ${item.name}?` },
                content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
                yes: { default: false },
                no: { default: true }
            });
            
            if (confirmed) {
                await item.delete();
                ui.notifications.info(`Deleted ${item.name}`);
            }
        }
        
        async _weaponAttack(item, mode) {
            // Implement in subclass
        }
        
        async _toggleEquipped(item) {
            await item.update({ "system.equipped": !item.system.equipped });
        }
        
        async _toggleActivated(item) {
            await item.update({ "system.activated": !item.system.activated });
        }
        
        async _spendFate(purpose) {
            // Implement in subclass
        }
        
        async _burnFatePoint() {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: "Burn Fate Point?" },
                content: `<p><strong>Warning:</strong> This will permanently reduce your maximum Fate Points!</p><p>Are you sure?</p>`,
                yes: { default: false },
                no: { default: true }
            });
            
            if (confirmed) {
                // Implement burning fate point
                const currentTotal = this.actor.system.fate?.total ?? 0;
                if (currentTotal > 0) {
                    await this.actor.update({ "system.fate.total": currentTotal - 1 });
                    ui.notifications.warn("Fate Point burned! Maximum reduced permanently.");
                }
            }
        }
    }
    
    return ContextMenuApplication;
}
