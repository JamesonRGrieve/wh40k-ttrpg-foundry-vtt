/**
 * @file ContextMenuMixin - Right-click context menus for quick actions
 * Provides contextual action menus throughout the character sheet
 */

/**
 * Mixin to add context menu capabilities to ApplicationV2 sheets.
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
            
            // Setup context menu listeners on first render
            if (options.isFirstRender) {
                this._setupContextMenus();
            }
        }
        
        /* -------------------------------------------- */
        
        /** @override */
        _onClose(options) {
            super._onClose(options);
            
            // Clean up any open context menus
            this._closeAllContextMenus();
        }
        
        /* -------------------------------------------- */
        /*  Context Menu Setup                          */
        /* -------------------------------------------- */
        
        /**
         * Setup context menu listeners for various elements.
         * @protected
         */
        _setupContextMenus() {
            // Characteristics context menu
            this._setupCharacteristicContextMenu();
            
            // Skills context menu
            this._setupSkillContextMenu();
            
            // Items context menu
            this._setupItemContextMenu();
            
            // Fate points context menu
            this._setupFatePointContextMenu();
            
            // Custom context menus (for subclasses to override)
            this._setupCustomContextMenus();
        }
        
        /* -------------------------------------------- */
        
        /**
         * Setup context menu for characteristics.
         * @protected
         */
        _setupCharacteristicContextMenu() {
            const elements = this.element.querySelectorAll("[data-characteristic]");
            
            elements.forEach(element => {
                element.addEventListener("contextmenu", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    const charKey = element.dataset.characteristic;
                    const char = this.actor.characteristics?.[charKey];
                    if (!char) return;
                    
                    this._showCharacteristicContextMenu(event, charKey, char);
                });
            });
        }
        
        /* -------------------------------------------- */
        
        /**
         * Setup context menu for skills.
         * @protected
         */
        _setupSkillContextMenu() {
            const elements = this.element.querySelectorAll("[data-skill]");
            
            elements.forEach(element => {
                element.addEventListener("contextmenu", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    const skillKey = element.dataset.skill;
                    const skill = this.actor.skills?.[skillKey];
                    if (!skill) return;
                    
                    this._showSkillContextMenu(event, skillKey, skill);
                });
            });
        }
        
        /* -------------------------------------------- */
        
        /**
         * Setup context menu for items.
         * @protected
         */
        _setupItemContextMenu() {
            const elements = this.element.querySelectorAll("[data-item-id]");
            
            elements.forEach(element => {
                element.addEventListener("contextmenu", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    const itemId = element.dataset.itemId;
                    const item = this.actor.items.get(itemId);
                    if (!item) return;
                    
                    this._showItemContextMenu(event, item);
                });
            });
        }
        
        /* -------------------------------------------- */
        
        /**
         * Setup context menu for fate points.
         * @protected
         */
        _setupFatePointContextMenu() {
            const elements = this.element.querySelectorAll("[data-fate-point]");
            
            elements.forEach(element => {
                element.addEventListener("contextmenu", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    this._showFatePointContextMenu(event);
                });
            });
        }
        
        /* -------------------------------------------- */
        
        /**
         * Setup custom context menus (for subclasses to override).
         * @protected
         */
        _setupCustomContextMenus() {
            // Override in subclasses to add custom menus
        }
        
        /* -------------------------------------------- */
        /*  Context Menu Display                        */
        /* -------------------------------------------- */
        
        /**
         * Show characteristic context menu.
         * @param {MouseEvent} event    Triggering event
         * @param {string} charKey      Characteristic key
         * @param {object} char         Characteristic data
         * @protected
         */
        _showCharacteristicContextMenu(event, charKey, char) {
            const menuItems = [
                {
                    icon: "fa-dice-d20",
                    label: `Roll ${char.label || charKey} Test`,
                    callback: () => this._onCharacteristicRoll(charKey)
                },
                {
                    icon: "fa-dice-d20",
                    label: "Roll with Modifier...",
                    callback: () => this._onCharacteristicRollWithModifier(charKey)
                },
                { separator: true },
                {
                    icon: "fa-info-circle",
                    label: "View Modifier Sources",
                    callback: () => this._showModifierSources(charKey)
                },
                {
                    icon: "fa-star",
                    label: "Spend XP to Advance",
                    callback: () => this._onAdvanceCharacteristic(charKey),
                    disabled: char.advance >= 5
                },
                { separator: true },
                {
                    icon: "fa-comment",
                    label: "Post to Chat",
                    callback: () => this._postCharacteristicToChat(charKey, char)
                }
            ];
            
            this._displayContextMenu(event, menuItems);
        }
        
        /* -------------------------------------------- */
        
        /**
         * Show skill context menu.
         * @param {MouseEvent} event    Triggering event
         * @param {string} skillKey     Skill key
         * @param {object} skill        Skill data
         * @protected
         */
        _showSkillContextMenu(event, skillKey, skill) {
            const menuItems = [
                {
                    icon: "fa-dice-d20",
                    label: `Roll ${skill.label || skillKey} Test`,
                    callback: () => this._onSkillRoll(skillKey)
                },
                {
                    icon: "fa-dice-d20",
                    label: "Roll with Modifier...",
                    callback: () => this._onSkillRollWithModifier(skillKey)
                },
                { separator: true },
                {
                    icon: "fa-graduation-cap",
                    label: skill.trained ? "Untrain" : "Train",
                    callback: () => this._toggleSkillTraining(skillKey, "trained")
                },
                {
                    icon: "fa-plus-circle",
                    label: skill.plus10 ? "Remove +10" : "Add +10",
                    callback: () => this._toggleSkillTraining(skillKey, "plus10"),
                    disabled: !skill.trained
                },
                {
                    icon: "fa-plus-circle",
                    label: skill.plus20 ? "Remove +20" : "Add +20",
                    callback: () => this._toggleSkillTraining(skillKey, "plus20"),
                    disabled: !skill.plus10
                },
                { separator: true },
                {
                    icon: "fa-eye",
                    label: "View Governing Characteristic",
                    callback: () => this._showGoverningCharacteristic(skillKey, skill)
                }
            ];
            
            // Add specialization option for specialist skills
            if (Array.isArray(skill.entries)) {
                menuItems.push({ separator: true });
                menuItems.push({
                    icon: "fa-plus",
                    label: "Add Specialization",
                    callback: () => this._addSkillSpecialization(skillKey)
                });
            }
            
            this._displayContextMenu(event, menuItems);
        }
        
        /* -------------------------------------------- */
        
        /**
         * Show item context menu.
         * @param {MouseEvent} event    Triggering event
         * @param {Item} item           Item document
         * @protected
         */
        _showItemContextMenu(event, item) {
            const menuItems = [
                {
                    icon: "fa-edit",
                    label: "Edit Item",
                    callback: () => item.sheet.render(true)
                },
                {
                    icon: "fa-copy",
                    label: "Duplicate",
                    callback: () => this._duplicateItem(item)
                },
                {
                    icon: "fa-trash",
                    label: "Delete",
                    callback: () => this._deleteItem(item)
                }
            ];
            
            // Type-specific options
            if (item.type === "weapon") {
                menuItems.unshift(
                    {
                        icon: "fa-crosshairs",
                        label: "Standard Attack",
                        callback: () => this._weaponAttack(item, "standard")
                    },
                    {
                        icon: "fa-bullseye",
                        label: "Aimed Attack",
                        callback: () => this._weaponAttack(item, "aimed")
                    },
                    { separator: true }
                );
                
                if (item.system.rateOfFire?.includes("S")) {
                    menuItems.splice(2, 0, {
                        icon: "fa-redo",
                        label: "Semi-Auto Burst",
                        callback: () => this._weaponAttack(item, "semi")
                    });
                }
                
                if (item.system.rateOfFire?.includes("–") || item.system.rateOfFire?.includes("/-")) {
                    menuItems.splice(3, 0, {
                        icon: "fa-fire",
                        label: "Full-Auto Burst",
                        callback: () => this._weaponAttack(item, "full")
                    });
                }
                
                menuItems.splice(4, 0, { separator: true });
            }
            
            // Equip/Unequip
            if (["weapon", "armour", "gear"].includes(item.type)) {
                menuItems.splice(-3, 0, {
                    icon: item.system.equipped ? "fa-times-circle" : "fa-check-circle",
                    label: item.system.equipped ? "Unequip" : "Equip",
                    callback: () => this._toggleEquipped(item)
                }, { separator: true });
            }
            
            // Activate/Deactivate (force fields, etc.)
            if (item.system.activated !== undefined) {
                menuItems.splice(-3, 0, {
                    icon: item.system.activated ? "fa-power-off" : "fa-bolt",
                    label: item.system.activated ? "Deactivate" : "Activate",
                    callback: () => this._toggleActivated(item)
                });
            }
            
            this._displayContextMenu(event, menuItems);
        }
        
        /* -------------------------------------------- */
        
        /**
         * Show fate point context menu.
         * @param {MouseEvent} event    Triggering event
         * @protected
         */
        _showFatePointContextMenu(event) {
            const menuItems = [
                {
                    icon: "fa-redo",
                    label: "Spend for Re-roll",
                    callback: () => this._spendFate("reroll")
                },
                {
                    icon: "fa-plus-circle",
                    label: "Spend for +10 Bonus",
                    callback: () => this._spendFate("bonus")
                },
                {
                    icon: "fa-arrow-up",
                    label: "Spend for +1 DoS",
                    callback: () => this._spendFate("dos")
                },
                {
                    icon: "fa-heartbeat",
                    label: "Spend for Healing (1d5)",
                    callback: () => this._spendFate("healing")
                },
                { separator: true },
                {
                    icon: "fa-fire",
                    label: "Burn Fate Point (Permanent)",
                    callback: () => this._burnFatePoint(),
                    cssClass: "danger"
                }
            ];
            
            this._displayContextMenu(event, menuItems);
        }
        
        /* -------------------------------------------- */
        /*  Context Menu Rendering                      */
        /* -------------------------------------------- */
        
        /**
         * Display a context menu at the cursor position.
         * @param {MouseEvent} event        Triggering event
         * @param {Array<object>} menuItems Menu item definitions
         * @protected
         */
        _displayContextMenu(event, menuItems) {
            // Close any existing menus
            this._closeAllContextMenus();
            
            // Create menu element
            const menu = document.createElement("div");
            menu.className = "rt-context-menu";
            menu.dataset.contextMenu = "true";
            
            // Add menu items
            menuItems.forEach(item => {
                if (item.separator) {
                    const separator = document.createElement("div");
                    separator.className = "rt-context-menu-separator";
                    menu.appendChild(separator);
                } else {
                    const menuItem = this._createMenuItem(item);
                    menu.appendChild(menuItem);
                }
            });
            
            // Position menu
            document.body.appendChild(menu);
            this._positionContextMenu(menu, event.clientX, event.clientY);
            
            // Setup close handlers
            this._setupContextMenuCloseHandlers(menu);
            
            // Animate in
            requestAnimationFrame(() => {
                menu.classList.add("visible");
            });
        }
        
        /* -------------------------------------------- */
        
        /**
         * Create a menu item element.
         * @param {object} item     Menu item definition
         * @returns {HTMLElement}
         * @protected
         */
        _createMenuItem(item) {
            const menuItem = document.createElement("button");
            menuItem.className = "rt-context-menu-item";
            menuItem.type = "button";
            
            if (item.disabled) {
                menuItem.disabled = true;
                menuItem.classList.add("disabled");
            }
            
            if (item.cssClass) {
                menuItem.classList.add(item.cssClass);
            }
            
            // Icon
            if (item.icon) {
                const icon = document.createElement("i");
                icon.className = `fas ${item.icon}`;
                menuItem.appendChild(icon);
            }
            
            // Label
            const label = document.createElement("span");
            label.textContent = item.label;
            menuItem.appendChild(label);
            
            // Callback
            if (!item.disabled && item.callback) {
                menuItem.addEventListener("click", async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    try {
                        await item.callback();
                    } catch (error) {
                        console.error("Context menu action error:", error);
                        ui.notifications.error("Action failed. See console for details.");
                    }
                    
                    this._closeAllContextMenus();
                });
            }
            
            return menuItem;
        }
        
        /* -------------------------------------------- */
        
        /**
         * Position context menu, ensuring it stays within viewport.
         * @param {HTMLElement} menu    Menu element
         * @param {number} x            X coordinate
         * @param {number} y            Y coordinate
         * @protected
         */
        _positionContextMenu(menu, x, y) {
            const menuRect = menu.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Position menu
            let left = x;
            let top = y;
            
            // Flip horizontally if off-screen right
            if (left + menuRect.width > viewportWidth) {
                left = Math.max(0, x - menuRect.width);
            }
            
            // Flip vertically if off-screen bottom
            if (top + menuRect.height > viewportHeight) {
                top = Math.max(0, y - menuRect.height);
            }
            
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
        }
        
        /* -------------------------------------------- */
        
        /**
         * Setup handlers to close context menu.
         * @param {HTMLElement} menu    Menu element
         * @protected
         */
        _setupContextMenuCloseHandlers(menu) {
            // Close on click outside
            const closeHandler = (event) => {
                if (!menu.contains(event.target)) {
                    this._closeAllContextMenus();
                    document.removeEventListener("click", closeHandler);
                }
            };
            
            // Delay to avoid immediate close from triggering click
            setTimeout(() => {
                document.addEventListener("click", closeHandler);
            }, 100);
            
            // Close on escape
            const escapeHandler = (event) => {
                if (event.key === "Escape") {
                    this._closeAllContextMenus();
                    document.removeEventListener("keydown", escapeHandler);
                }
            };
            document.addEventListener("keydown", escapeHandler);
            
            // Close on scroll
            const scrollHandler = () => {
                this._closeAllContextMenus();
                this.element.removeEventListener("scroll", scrollHandler, true);
            };
            this.element.addEventListener("scroll", scrollHandler, true);
        }
        
        /* -------------------------------------------- */
        
        /**
         * Close all open context menus.
         * @protected
         */
        _closeAllContextMenus() {
            document.querySelectorAll(".rt-context-menu").forEach(menu => {
                menu.classList.remove("visible");
                setTimeout(() => menu.remove(), 200);
            });
        }
        
        /* -------------------------------------------- */
        /*  Context Menu Actions (for subclasses)      */
        /* -------------------------------------------- */
        
        async _onCharacteristicRoll(charKey) {
            // Implement in subclass
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
            // Implement in subclass
        }
        
        async _onSkillRoll(skillKey) {
            // Implement in subclass
        }
        
        async _onSkillRollWithModifier(skillKey) {
            // Implement in subclass
        }
        
        async _toggleSkillTraining(skillKey, level) {
            // Implement in subclass
        }
        
        async _showGoverningCharacteristic(skillKey, skill) {
            // Implement in subclass
        }
        
        async _addSkillSpecialization(skillKey) {
            // Implement in subclass
        }
        
        async _duplicateItem(item) {
            await item.clone({ name: `${item.name} (Copy)` }, { save: true });
            ui.notifications.info(`Duplicated ${item.name}`);
        }
        
        async _deleteItem(item) {
            const confirmed = await Dialog.confirm({
                title: `Delete ${item.name}?`,
                content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
                yes: () => true,
                no: () => false
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
            const confirmed = await Dialog.confirm({
                title: "Burn Fate Point?",
                content: `<p><strong>Warning:</strong> This will permanently reduce your maximum Fate Points!</p><p>Are you sure?</p>`,
                yes: () => true,
                no: () => false
            });
            
            if (confirmed) {
                // Implement in subclass
            }
        }
    }
    
    return ContextMenuApplication;
}
