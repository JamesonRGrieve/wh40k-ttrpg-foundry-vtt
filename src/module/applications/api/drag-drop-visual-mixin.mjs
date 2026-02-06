/**
 * @file DragDropVisualMixin - Visual drag-drop feedback layer
 * Extends the base DragDropAPIMixin with Rogue Trader-specific visual enhancements
 * 
 * Features:
 * - Custom Gothic 40K drag ghost images
 * - Visual drop zone highlighting
 * - Item reordering within lists
 * - Quick equip to equipment slots
 * - Item splitting (Ctrl+Drag for stacks)
 * - Stat comparison tooltips while dragging
 * - Snap-to-slot animations
 * - Favorites bar for quick access items
 * 
 * This is the visual layer - for core API, see drag-drop-api-mixin.mjs
 */

/**
 * Mixin that adds enhanced drag-drop with visual feedback
 * @param {typeof ApplicationV2} Base  The base class being mixed
 * @returns {typeof EnhancedDragDropApplication}
 * @mixin
 */
export default function EnhancedDragDropMixin(Base) {
    return class EnhancedDragDropApplication extends Base {

        /* -------------------------------------------- */
        /*  Initialization                              */
        /* -------------------------------------------- */

        /**
         * Track the currently dragged item
         * @type {object|null}
         * @private
         */
        _draggedItem = null;

        /**
         * Track the drag start position
         * @type {{x: number, y: number}|null}
         * @private
         */
        _dragStartPos = null;

        /**
         * Minimum pixels to move before activating drag
         * @type {number}
         * @private
         */
        static DRAG_THRESHOLD = 5;

        /**
         * Split dialog result cache
         * @type {object|null}
         * @private
         */
        _splitResult = null;

        /* -------------------------------------------- */
        /*  Render Hooks                                */
        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onRender(context, options) {
            await super._onRender(context, options);

            // Enhanced drag-drop setup
            this._setupEnhancedDragDrop();
        }

        /* -------------------------------------------- */

        /**
         * Setup enhanced drag-drop handlers
         * @private
         */
        _setupEnhancedDragDrop() {
            // Item rows - exclude talent panel rows (rt-tp_row) which should not be draggable
            this.element.querySelectorAll("[data-item-id]").forEach(el => {
                // Skip if element is inside a talent panel row
                if (el.closest('.rt-tp_row') || el.closest('.rt-talent-row')) return;
                
                if (!el.hasAttribute("draggable")) {
                    el.setAttribute("draggable", true);
                }

                // Add enhanced drag listeners
                el.addEventListener("dragstart", this._onEnhancedDragStart.bind(this));
                el.addEventListener("dragend", this._onEnhancedDragEnd.bind(this));
            });

            // Drop zones
            this._setupDropZones();

            // Favorites bar
            this._setupFavoritesBar();
        }

        /* -------------------------------------------- */

        /**
         * Setup drop zones for equipment slots and inventory sections
         * @private
         */
        _setupDropZones() {
            const dropZones = this.element.querySelectorAll("[data-drop-zone]");
            
            dropZones.forEach(zone => {
                zone.addEventListener("dragover", this._onEnhancedDragOver.bind(this));
                zone.addEventListener("dragleave", this._onEnhancedDragLeave.bind(this));
                zone.addEventListener("drop", this._onEnhancedDrop.bind(this));
            });

            // Inventory list reordering
            const inventoryLists = this.element.querySelectorAll(".inventory-list, .item-list");
            inventoryLists.forEach(list => {
                list.addEventListener("dragover", this._onInventoryDragOver.bind(this));
                list.addEventListener("drop", this._onInventoryDrop.bind(this));
            });
        }

        /* -------------------------------------------- */

        /**
         * Setup favorites bar if present
         * @private
         */
        _setupFavoritesBar() {
            const favBar = this.element.querySelector("[data-favorites-bar]");
            if (!favBar) return;

            favBar.addEventListener("dragover", this._onFavoritesDragOver.bind(this));
            favBar.addEventListener("drop", this._onFavoritesDrop.bind(this));
        }

        /* -------------------------------------------- */
        /*  Drag Start Handlers                         */
        /* -------------------------------------------- */

        /**
         * Enhanced drag start with visual feedback
         * @param {DragEvent} event  The drag start event
         * @private
         */
        async _onEnhancedDragStart(event) {
            const element = event.currentTarget;
            const itemId = element.dataset.itemId;
            const item = this.document.items.get(itemId);

            if (!item) return;

            // Track drag start position
            this._dragStartPos = { x: event.clientX, y: event.clientY };

            // Store dragged item
            this._draggedItem = {
                id: itemId,
                item: item,
                element: element,
                sourceList: element.closest(".inventory-list, .item-list")
            };

            // Check for split modifier (Ctrl key)
            if (event.ctrlKey && this._canSplitItem(item)) {
                const result = await this._showSplitDialog(item);
                if (!result) {
                    event.preventDefault();
                    this._resetDrag();
                    return;
                }
                this._splitResult = result;
            }

            // Create custom drag ghost
            const ghost = this._createDragGhost(item, event);
            document.body.appendChild(ghost);
            event.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
            setTimeout(() => ghost.remove(), 0);

            // Set drag data
            event.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));

            // Visual feedback
            element.classList.add("dragging");
            this.element.classList.add("drag-active");

            // Show valid drop zones
            this._highlightValidDropZones(item);
        }

        /* -------------------------------------------- */

        /**
         * Create a custom drag ghost image with RT styling
         * @param {Item} item        The item being dragged
         * @param {DragEvent} event  The drag event
         * @returns {HTMLElement}    The ghost element
         * @private
         */
        _createDragGhost(item, event) {
            const ghost = document.createElement("div");
            ghost.className = "rt-drag-ghost";
            
            // Check for split
            const quantity = this._splitResult ? this._splitResult.quantity : (item.system.quantity || 1);
            
            ghost.innerHTML = `
                <div class="ghost-content">
                    <img src="${item.img}" alt="${item.name}" />
                    <div class="ghost-details">
                        <div class="ghost-name">${item.name}</div>
                        ${quantity > 1 ? `<div class="ghost-quantity">×${quantity}</div>` : ''}
                        ${item.system.equipped ? '<i class="fas fa-check-circle ghost-equipped"></i>' : ''}
                    </div>
                </div>
            `;

            ghost.style.position = "absolute";
            ghost.style.top = "-1000px";
            ghost.style.left = "-1000px";
            ghost.style.pointerEvents = "none";
            ghost.style.zIndex = "10000";

            return ghost;
        }

        /* -------------------------------------------- */

        /**
         * Check if an item can be split
         * @param {Item} item  The item to check
         * @returns {boolean}  True if item can be split
         * @private
         */
        _canSplitItem(item) {
            const quantity = item.system.quantity;
            if (!quantity || quantity <= 1) return false;
            
            // Only certain item types can be split
            const splittableTypes = ["gear", "weapon"];
            return splittableTypes.includes(item.type);
        }

        /* -------------------------------------------- */

        /**
         * Show dialog to split item stack
         * @param {Item} item  The item to split
         * @returns {Promise<{quantity: number}|null>}  Split result or null if cancelled
         * @private
         */
        async _showSplitDialog(item) {
            const quantity = item.system.quantity || 1;
            
            return new Promise(resolve => {
                new Dialog({
                    title: `Split ${item.name}`,
                    content: `
                        <form class="rt-split-dialog">
                            <div class="form-group">
                                <label>Quantity to move (max ${quantity})</label>
                                <input type="number" name="quantity" min="1" max="${quantity}" value="1" autofocus />
                            </div>
                            <p class="hint">The remaining ${quantity - 1} will stay in the original stack.</p>
                        </form>
                    `,
                    buttons: {
                        split: {
                            icon: '<i class="fas fa-split"></i>',
                            label: "Split",
                            callback: html => {
                                const qty = parseInt(html.find('[name="quantity"]').val());
                                if (qty > 0 && qty <= quantity) {
                                    resolve({ quantity: qty });
                                } else {
                                    ui.notifications.warn("Invalid quantity");
                                    resolve(null);
                                }
                            }
                        },
                        cancel: {
                            icon: '<i class="fas fa-times"></i>',
                            label: "Cancel",
                            callback: () => resolve(null)
                        }
                    },
                    default: "split"
                }).render(true);
            });
        }

        /* -------------------------------------------- */

        /**
         * Highlight valid drop zones based on dragged item
         * @param {Item} item  The dragged item
         * @private
         */
        _highlightValidDropZones(item) {
            const dropZones = this.element.querySelectorAll("[data-drop-zone]");
            
            dropZones.forEach(zone => {
                const zoneType = zone.dataset.dropZone;
                const accepts = zone.dataset.accepts?.split(",") || [];
                
                // Check if zone accepts this item type
                if (accepts.length === 0 || accepts.includes(item.type)) {
                    zone.classList.add("drop-valid");
                } else {
                    zone.classList.add("drop-invalid");
                }
            });
        }

        /* -------------------------------------------- */
        /*  Drag Over Handlers                          */
        /* -------------------------------------------- */

        /**
         * Enhanced drag over handler with visual feedback
         * @param {DragEvent} event  The drag over event
         * @private
         */
        _onEnhancedDragOver(event) {
            event.preventDefault();
            event.stopPropagation();

            const zone = event.currentTarget;
            const zoneType = zone.dataset.dropZone;
            
            // Add drag-over visual feedback
            if (zoneType === "personal" || zoneType === "ship") {
                zone.classList.add("rt-drag-over");
                event.dataTransfer.dropEffect = "move";
            }
            // Check if this is a valid drop for equipment zones
            else if (zone.classList.contains("drop-valid")) {
                zone.classList.add("drop-hover");
                event.dataTransfer.dropEffect = "move";
            } else if (zone.classList.contains("drop-invalid")) {
                event.dataTransfer.dropEffect = "none";
            }
        }

        /* -------------------------------------------- */

        /**
         * Drag leave handler to remove hover effects
         * @param {DragEvent} event  The drag leave event
         * @private
         */
        _onEnhancedDragLeave(event) {
            const zone = event.currentTarget;
            zone.classList.remove("drop-hover");
            zone.classList.remove("rt-drag-over");
        }

        /* -------------------------------------------- */

        /**
         * Inventory list drag over for reordering
         * @param {DragEvent} event  The drag over event
         * @private
         */
        _onInventoryDragOver(event) {
            event.preventDefault();
            event.stopPropagation();

            if (!this._draggedItem) return;

            // Find the item row being hovered over
            const targetRow = event.target.closest("[data-item-id]");
            if (!targetRow || targetRow === this._draggedItem.element) return;

            // Determine if we should insert before or after
            const rect = targetRow.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const insertBefore = event.clientY < midpoint;

            // Remove previous indicators
            this.element.querySelectorAll(".drop-indicator").forEach(el => el.remove());

            // Add drop indicator
            const indicator = document.createElement("div");
            indicator.className = "drop-indicator";
            if (insertBefore) {
                targetRow.parentNode.insertBefore(indicator, targetRow);
            } else {
                targetRow.parentNode.insertBefore(indicator, targetRow.nextSibling);
            }
        }

        /* -------------------------------------------- */

        /**
         * Favorites bar drag over handler
         * @param {DragEvent} event  The drag over event
         * @private
         */
        _onFavoritesDragOver(event) {
            event.preventDefault();
            event.stopPropagation();

            const favBar = event.currentTarget;
            favBar.classList.add("drop-hover");
            event.dataTransfer.dropEffect = "copy";
        }

        /* -------------------------------------------- */
        /*  Drop Handlers                               */
        /* -------------------------------------------- */

        /**
         * Enhanced drop handler with equipment slots
         * @param {DragEvent} event  The drop event
         * @private
         */
        async _onEnhancedDrop(event) {
            event.preventDefault();
            event.stopPropagation();

            const zone = event.currentTarget;
            zone.classList.remove("drop-hover");

            // Parse drag data
            const data = TextEditor.getDragEventData(event);
            if (!data?.uuid) return;

            const item = await fromUuid(data.uuid);
            if (!item) return;

            // Get zone type and slot
            const zoneType = zone.dataset.dropZone;
            const slot = zone.dataset.slot;

            // Handle ship/personal storage zone drops
            if (zoneType === "personal") {
                // If item is from compendium or another actor, create new item
                if (item.actor?.id !== this.document.id) {
                    const itemData = item.toObject();
                    itemData.system.inShipStorage = false;
                    itemData.system.equipped = false;
                    await this.document.createEmbeddedDocuments("Item", [itemData]);
                    if (this.flashElement) this.flashElement(zone, "success");
                } else {
                    // Move existing item to personal inventory (remove from ship)
                    await item.update({ 
                        "system.inShipStorage": false 
                    });
                    if (this.flashElement) this.flashElement(zone, "success");
                }
            } else if (zoneType === "ship") {
                // If item is from compendium or another actor, create new item
                if (item.actor?.id !== this.document.id) {
                    const itemData = item.toObject();
                    itemData.system.inShipStorage = true;
                    itemData.system.equipped = false;
                    itemData.system.inBackpack = false;
                    await this.document.createEmbeddedDocuments("Item", [itemData]);
                    if (this.flashElement) this.flashElement(zone, "success");
                } else {
                    // Move existing item to ship storage
                    await item.update({ 
                        "system.equipped": false,
                        "system.inBackpack": false,
                        "system.inShipStorage": true 
                    });
                    if (this.flashElement) this.flashElement(zone, "success");
                }
            }
            // Handle equipment slot drops
            else if (zoneType === "equipment") {
                await this._handleEquipmentDrop(item, slot);
            }
            // Handle general drops
            else {
                await this._handleGeneralDrop(item, event);
            }

            this._resetDrag();
        }

        /* -------------------------------------------- */

        /**
         * Handle drop onto equipment slot
         * @param {Item} item  The dropped item
         * @param {string} slot  The equipment slot
         * @private
         */
        async _handleEquipmentDrop(item, slot) {
            // Check if item belongs to this actor
            if (item.actor?.id !== this.document.id) {
                ui.notifications.warn("Cannot equip items from other actors");
                return;
            }

            // Check if item can be equipped in this slot
            const validSlot = this._validateEquipmentSlot(item, slot);
            if (!validSlot) {
                ui.notifications.warn(`${item.name} cannot be equipped in ${slot} slot`);
                return;
            }

            // Equip the item
            await item.update({ "system.equipped": true });
            
            // Show feedback
            ui.notifications.info(`Equipped ${item.name}`);
            
            // Animate snap-to-slot
            this._animateSnapToSlot(item);
        }

        /* -------------------------------------------- */

        /**
         * Validate if item can be equipped in slot
         * @param {Item} item  The item to validate
         * @param {string} slot  The target slot
         * @returns {boolean}  True if valid
         * @private
         */
        _validateEquipmentSlot(item, slot) {
            // Weapons can go in weapon slots
            if (slot === "primary-weapon" || slot === "secondary-weapon") {
                return item.type === "weapon";
            }
            
            // Armor can go in armor slots
            if (slot.includes("armor")) {
                return item.type === "armour";
            }

            return true;
        }

        /* -------------------------------------------- */

        /**
         * Handle general drop (not equipment slot)
         * @param {Item} item  The dropped item
         * @param {DragEvent} event  The drop event
         * @private
         */
        async _handleGeneralDrop(item, event) {
            // Check if this is a split operation
            if (this._splitResult) {
                await this._handleSplitDrop(item, this._splitResult.quantity);
                this._splitResult = null;
                return;
            }

            // Default: move/copy item
            const behavior = this._dropBehavior(event);
            
            if (behavior === "copy") {
                const itemData = item.toObject();
                await this.document.createEmbeddedDocuments("Item", [itemData]);
                ui.notifications.info(`Added ${item.name} to inventory`);
            } else if (behavior === "move") {
                // Item is already on this actor, no action needed
                ui.notifications.info(`Moved ${item.name}`);
            }
        }

        /* -------------------------------------------- */

        /**
         * Handle split item drop
         * @param {Item} item  The source item
         * @param {number} quantity  Quantity to split
         * @private
         */
        async _handleSplitDrop(item, quantity) {
            const remaining = (item.system.quantity || 1) - quantity;

            if (remaining <= 0) {
                ui.notifications.error("Cannot split entire stack");
                return;
            }

            // Create new item with split quantity
            const newItemData = item.toObject();
            newItemData.system.quantity = quantity;
            newItemData.name = `${item.name} (${quantity})`;

            await this.document.createEmbeddedDocuments("Item", [newItemData]);

            // Update original item quantity
            await item.update({ "system.quantity": remaining });

            ui.notifications.info(`Split ${item.name}: ${quantity} moved, ${remaining} remaining`);
        }

        /* -------------------------------------------- */

        /**
         * Handle drop in inventory list for reordering
         * @param {DragEvent} event  The drop event
         * @private
         */
        async _onInventoryDrop(event) {
            event.preventDefault();
            event.stopPropagation();

            // Remove drop indicator
            this.element.querySelectorAll(".drop-indicator").forEach(el => el.remove());

            if (!this._draggedItem) return;

            const targetRow = event.target.closest("[data-item-id]");
            if (!targetRow) return;

            const targetId = targetRow.dataset.itemId;
            const sourceId = this._draggedItem.id;

            if (sourceId === targetId) return;

            // Reorder items
            await this._reorderItems(sourceId, targetId, event.clientY);

            this._resetDrag();
        }

        /* -------------------------------------------- */

        /**
         * Reorder items in the list
         * @param {string} sourceId  Source item ID
         * @param {string} targetId  Target item ID
         * @param {number} clientY  Y position for before/after
         * @private
         */
        async _reorderItems(sourceId, targetId, clientY) {
            // Get all items in order
            const items = Array.from(this.document.items);
            
            // Find source and target
            const sourceIndex = items.findIndex(i => i.id === sourceId);
            const targetIndex = items.findIndex(i => i.id === targetId);

            if (sourceIndex === -1 || targetIndex === -1) return;

            // Reorder
            const [removed] = items.splice(sourceIndex, 1);
            items.splice(targetIndex, 0, removed);

            // Update sort values
            const updates = items.map((item, index) => ({
                _id: item.id,
                sort: index * 100
            }));

            await this.document.updateEmbeddedDocuments("Item", updates);

            ui.notifications.info("Items reordered");
        }

        /* -------------------------------------------- */

        /**
         * Handle drop on favorites bar
         * @param {DragEvent} event  The drop event
         * @private
         */
        async _onFavoritesDrop(event) {
            event.preventDefault();
            event.stopPropagation();

            const favBar = event.currentTarget;
            favBar.classList.remove("drop-hover");

            // Parse drag data
            const data = TextEditor.getDragEventData(event);
            if (!data?.uuid) return;

            const item = await fromUuid(data.uuid);
            if (!item || item.actor?.id !== this.document.id) return;

            // Add to favorites
            await this._addToFavorites(item);

            this._resetDrag();
        }

        /* -------------------------------------------- */

        /**
         * Add item to favorites bar
         * @param {Item} item  The item to favorite
         * @private
         */
        async _addToFavorites(item) {
            const favorites = this.document.getFlag("rogue-trader", "favorites") || [];
            
            if (favorites.includes(item.id)) {
                ui.notifications.warn(`${item.name} is already in favorites`);
                return;
            }

            if (favorites.length >= 8) {
                ui.notifications.warn("Favorites bar is full (max 8 items)");
                return;
            }

            favorites.push(item.id);
            await this.document.setFlag("rogue-trader", "favorites", favorites);

            ui.notifications.info(`Added ${item.name} to favorites`);
        }

        /* -------------------------------------------- */
        /*  Drag End Handlers                           */
        /* -------------------------------------------- */

        /**
         * Enhanced drag end handler
         * @param {DragEvent} event  The drag end event
         * @private
         */
        _onEnhancedDragEnd(event) {
            this._resetDrag();
        }

        /* -------------------------------------------- */

        /**
         * Reset drag state and cleanup visual feedback
         * @private
         */
        _resetDrag() {
            // Remove dragging class
            if (this._draggedItem?.element) {
                this._draggedItem.element.classList.remove("dragging");
            }

            // Remove drag-active state
            this.element.classList.remove("drag-active");

            // Remove drop zone highlights
            this.element.querySelectorAll("[data-drop-zone]").forEach(zone => {
                zone.classList.remove("drop-valid", "drop-invalid", "drop-hover");
            });

            // Remove drop indicators
            this.element.querySelectorAll(".drop-indicator").forEach(el => el.remove());

            // Clear drag state
            this._draggedItem = null;
            this._dragStartPos = null;
            this._splitResult = null;
        }

        /* -------------------------------------------- */
        /*  Animation Helpers                           */
        /* -------------------------------------------- */

        /**
         * Animate snap-to-slot effect
         * @param {Item} item  The item being equipped
         * @private
         */
        _animateSnapToSlot(item) {
            // Find the item element
            const itemEl = this.element.querySelector(`[data-item-id="${item.id}"]`);
            if (!itemEl) return;

            // Add snap animation
            itemEl.classList.add("snap-to-slot");
            setTimeout(() => {
                itemEl.classList.remove("snap-to-slot");
            }, 600);
        }

        /* -------------------------------------------- */
        /*  Public API                                  */
        /* -------------------------------------------- */

        /**
         * Remove item from favorites bar
         * @param {string} itemId  The item ID to remove
         * @public
         */
        async removeFromFavorites(itemId) {
            const favorites = this.document.getFlag("rogue-trader", "favorites") || [];
            const newFavorites = favorites.filter(id => id !== itemId);
            await this.document.setFlag("rogue-trader", "favorites", newFavorites);
        }

        /* -------------------------------------------- */

        /**
         * Clear all favorites
         * @public
         */
        async clearFavorites() {
            await this.document.setFlag("rogue-trader", "favorites", []);
        }

        /* -------------------------------------------- */

        /**
         * Get favorite items
         * @returns {Item[]}  Array of favorite items
         * @public
         */
        getFavoriteItems() {
            const favorites = this.document.getFlag("rogue-trader", "favorites") || [];
            return favorites.map(id => this.document.items.get(id)).filter(i => i);
        }
    };
}
