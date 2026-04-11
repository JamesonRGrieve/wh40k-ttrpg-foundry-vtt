/**
 * @file DragDropVisualMixin - Visual drag-drop feedback layer
 * Extends the base DragDropAPIMixin with WH40K RPG-specific visual enhancements
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
/** Human-readable labels for item types shown in the header drop zone. */
const DROP_ZONE_LABELS: Record<string, string> = {
    weapon:        'Add Weapon',
    armour:        'Add Armour',
    gear:          'Add Item',
    ammunition:    'Add Ammunition',
    cybernetic:    'Add Cybernetic',
    talent:        'Add Talent',
    trait:         'Add Trait',
    psychicPower:  'Add Psychic Power',
    forceField:    'Add Force Field',
    criticalInjury:'Add Critical Injury',
    condition:     'Add Condition',
    skill:         'Add Skill',
    specialAbility:'Add Special Ability',
};
const DROP_ZONE_DEFAULT_LABEL = 'Drag and Drop from Compendium to Add';

/** Captured at dragstart so dragover handlers can read the item type. */
let _activeDragType: string | null = null;
let _globalDragListenersSetup = false;

function ensureGlobalDragTracking(): void {
    if (_globalDragListenersSetup) return;
    _globalDragListenersSetup = true;
    // Bubble phase (false) so this fires AFTER the target's dragstart handler
    // has already called setData — capture phase would read empty data.
    document.addEventListener('dragstart', (e: DragEvent) => {
        try {
            const raw = e.dataTransfer?.getData('text/plain');
            _activeDragType = raw ? (JSON.parse(raw).type ?? null) : null;
        } catch { _activeDragType = null; }
    }, false);
    document.addEventListener('dragend', () => { _activeDragType = null; }, false);
}

export default function EnhancedDragDropMixin<T extends new (...args: any[]) => any>(Base: T) {
    return class EnhancedDragDropApplication extends Base {
    [key: string]: any;
        /* -------------------------------------------- */
        /*  Initialization                              */
        /* -------------------------------------------- */

        /**
         * Track the currently dragged item
         * @type {object|null}
         * @private
         */
        _draggedItem: Record<string, any> | null = null;

        /**
         * Track the drag start position
         * @type {{x: number, y: number}|null}
         * @private
         */
        _dragStartPos: { x: number; y: number } | null = null;

        /**
         * Minimum pixels to move before activating drag
         * @type {number}
         * @private
         */
        static DRAG_THRESHOLD: number = 5;

        /**
         * Split dialog result cache
         * @type {object|null}
         * @private
         */
        _splitResult: { quantity: number } | null = null;

        /* -------------------------------------------- */
        /*  Render Hooks                                */
        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
            await super._onRender(context, options);

            // Enhanced drag-drop setup
            this._setupEnhancedDragDrop();
        }

        /* -------------------------------------------- */

        /**
         * Setup enhanced drag-drop handlers
         * @private
         */
        _setupEnhancedDragDrop(): void {
            // Item rows - exclude talent panel rows (wh40k-tp_row) which should not be draggable
            this.element.querySelectorAll('[data-item-id]').forEach((el) => {
                // Skip if element is inside a talent panel row
                if (el.closest('.wh40k-tp_row') || el.closest('.wh40k-talent-row')) return;

                if (!el.hasAttribute('draggable')) {
                    el.setAttribute('draggable', true);
                }

                // Add enhanced drag listeners
                el.addEventListener('dragstart', this._onEnhancedDragStart.bind(this));
                el.addEventListener('dragend', this._onEnhancedDragEnd.bind(this));
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
        _setupDropZones(): void {
            ensureGlobalDragTracking();
            const dropZones = this.element.querySelectorAll('[data-drop-zone]');

            dropZones.forEach((zone) => {
                zone.addEventListener('dragover', this._onEnhancedDragOver.bind(this));
                zone.addEventListener('dragleave', this._onEnhancedDragLeave.bind(this));
                zone.addEventListener('drop', this._onEnhancedDrop.bind(this));
            });

            // Inventory list reordering
            const inventoryLists = this.element.querySelectorAll('.inventory-list, .item-list');
            inventoryLists.forEach((list) => {
                list.addEventListener('dragover', this._onInventoryDragOver.bind(this));
                list.addEventListener('drop', this._onInventoryDrop.bind(this));
            });
        }

        /* -------------------------------------------- */

        /**
         * Setup favorites bar if present
         * @private
         */
        _setupFavoritesBar(): void {
            const favBar = this.element.querySelector('[data-favorites-bar]');
            if (!favBar) return;

            favBar.addEventListener('dragover', this._onFavoritesDragOver.bind(this));
            favBar.addEventListener('drop', this._onFavoritesDrop.bind(this));
        }

        /* -------------------------------------------- */
        /*  Drag Start Handlers                         */
        /* -------------------------------------------- */

        /**
         * Enhanced drag start with visual feedback
         * @param {DragEvent} event  The drag start event
         * @private
         */
        async _onEnhancedDragStart(event: DragEvent): Promise<void> {
            const element = event.currentTarget as HTMLElement;
            const itemId = (element as any).dataset.itemId;
            const item = this.document.items.get(itemId);

            if (!item) return;

            // Track drag start position
            this._dragStartPos = { x: event.clientX, y: event.clientY };

            // Store dragged item
            this._draggedItem = {
                id: itemId,
                item: item,
                element: element,
                sourceList: (element as any).closest('.inventory-list, .item-list'),
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
            event.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));

            // Visual feedback
            (element as any).classList.add('dragging');
            this.element.classList.add('drag-active');

            // Show valid drop zones
            this._highlightValidDropZones(item);
        }

        /* -------------------------------------------- */

        /**
         * Create a custom drag ghost image with WH40K styling
         * @param {Item} item        The item being dragged
         * @param {DragEvent} event  The drag event
         * @returns {HTMLElement}    The ghost element
         * @private
         */
        _createDragGhost(item: any, event: DragEvent): HTMLElement {
            const ghost = document.createElement('div');
            ghost.className = 'wh40k-drag-ghost';

            // Check for split
            const quantity = this._splitResult ? this._splitResult.quantity : item.system.quantity || 1;

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

            ghost.style.position = 'absolute';
            ghost.style.top = '-1000px';
            ghost.style.left = '-1000px';
            ghost.style.pointerEvents = 'none';
            ghost.style.zIndex = '10000';

            return ghost;
        }

        /* -------------------------------------------- */

        /**
         * Check if an item can be split
         * @param {Item} item  The item to check
         * @returns {boolean}  True if item can be split
         * @private
         */
        _canSplitItem(item: any): boolean {
            const quantity = item.system.quantity;
            if (!quantity || quantity <= 1) return false;

            // Only certain item types can be split
            const splittableTypes = ['gear', 'weapon'];
            return splittableTypes.includes(item.type);
        }

        /* -------------------------------------------- */

        /**
         * Show dialog to split item stack
         * @param {Item} item  The item to split
         * @returns {Promise<{quantity: number}|null>}  Split result or null if cancelled
         * @private
         */
        async _showSplitDialog(item: any): Promise<{ quantity: number } | null> {
            const quantity = item.system.quantity || 1;

            return (foundry.applications.api as any).DialogV2.prompt({
                window: { title: `Split ${item.name}` },
                content: `
                    <form class="wh40k-split-dialog">
                        <div class="form-group">
                            <label>Quantity to move (max ${quantity})</label>
                            <input type="number" name="quantity" min="1" max="${quantity}" value="1" autofocus />
                        </div>
                        <p class="hint">The remaining ${quantity - 1} will stay in the original stack.</p>
                    </form>
                `,
                ok: {
                    icon: 'fas fa-split',
                    label: 'Split',
                    callback: (event, button, dialog) => {
                        const qty = parseInt(dialog.querySelector('[name="quantity"]').value);
                        if (qty > 0 && qty <= quantity) {
                            return { quantity: qty };
                        }
                        (ui.notifications as any).warn('Invalid quantity');
                        return null;
                    },
                },
                rejectClose: false,
            });
        }

        /* -------------------------------------------- */

        /**
         * Highlight valid drop zones based on dragged item
         * @param {Item} item  The dragged item
         * @private
         */
        _highlightValidDropZones(item: any): void {
            const dropZones = this.element.querySelectorAll('[data-drop-zone]');

            dropZones.forEach((zone) => {
                const zoneType = zone.dataset.dropZone;
                const accepts = zone.dataset.accepts?.split(',') || [];

                // Check if zone accepts this item type
                if (accepts.length === 0 || accepts.includes(item.type)) {
                    zone.classList.add('drop-valid');
                } else {
                    zone.classList.add('drop-invalid');
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
        _onEnhancedDragOver(event: DragEvent): void {
            event.preventDefault();
            event.stopPropagation();

            const zone = event.currentTarget as HTMLElement;

            // Check if this is explicitly invalid
            if (zone.classList.contains('drop-invalid')) {
                event.dataTransfer.dropEffect = 'none';
                return;
            }

            // Add drag-over visual feedback for all drop zones
            zone.classList.add('wh40k-drag-over');
            event.dataTransfer.dropEffect = 'copy';

            // Update drop zone label based on dragged item type
            const textEl = zone.querySelector('.wh40k-dropzone-text') as HTMLElement | null;
            if (textEl) {
                const type = _activeDragType ?? this._draggedItem?.item?.type ?? null;
                textEl.textContent = type ? (DROP_ZONE_LABELS[type] ?? DROP_ZONE_DEFAULT_LABEL) : DROP_ZONE_DEFAULT_LABEL;
            }
        }

        /* -------------------------------------------- */

        /**
         * Drag leave handler to remove hover effects
         * @param {DragEvent} event  The drag leave event
         * @private
         */
        _onEnhancedDragLeave(event: DragEvent): void {
            const zone = event.currentTarget as HTMLElement;
            zone.classList.remove('drop-hover');
            zone.classList.remove('wh40k-drag-over');

            // Reset label
            const textEl = zone.querySelector('.wh40k-dropzone-text') as HTMLElement | null;
            if (textEl) textEl.textContent = 'Drag and Drop from Compendium to Add';
        }

        /* -------------------------------------------- */

        /**
         * Inventory list drag over for reordering
         * @param {DragEvent} event  The drag over event
         * @private
         */
        _onInventoryDragOver(event: DragEvent): void {
            event.preventDefault();
            event.stopPropagation();

            if (!this._draggedItem) return;

            // Find the item row being hovered over
            const targetRow = (event.target as HTMLElement).closest('[data-item-id]');
            if (!targetRow || targetRow === this._draggedItem.element) return;

            // Determine if we should insert before or after
            const rect = targetRow.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const insertBefore = event.clientY < midpoint;

            // Remove previous indicators
            this.element.querySelectorAll('.drop-indicator').forEach((el) => el.remove());

            // Add drop indicator
            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator';
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
        _onFavoritesDragOver(event: DragEvent): void {
            event.preventDefault();
            event.stopPropagation();

            const favBar = event.currentTarget as HTMLElement;
            favBar.classList.add('drop-hover');
            event.dataTransfer.dropEffect = 'copy';
        }

        /* -------------------------------------------- */
        /*  Drop Handlers                               */
        /* -------------------------------------------- */

        /**
         * Enhanced drop handler with equipment slots
         * @param {DragEvent} event  The drop event
         * @private
         */
        async _onEnhancedDrop(event: DragEvent): Promise<void> {
            event.preventDefault();
            event.stopPropagation();

            const zone = event.currentTarget as HTMLElement;
            zone.classList.remove('drop-hover');

            // Parse drag data
            const data = TextEditor.getDragEventData(event) as any;
            if (!data?.uuid) return;

            const item = await fromUuid(data.uuid) as any;
            if (!item) return;

            // Get zone type and slot
            const zoneType = (zone as any).dataset.dropZone;
            const slot = (zone as any).dataset.slot;

            // Handle ship/personal storage zone drops
            if (zoneType === 'personal') {
                // If item is from compendium or another actor, create new item
                if (item.actor?.id !== this.document.id) {
                    const itemData = item.toObject();
                    itemData.system.inShipStorage = false;
                    itemData.system.equipped = false;
                    await this.document.createEmbeddedDocuments('Item', [itemData]);
                    if (this.flashElement) this.flashElement(zone, 'success');
                } else {
                    // Move existing item to personal inventory (remove from ship)
                    await item.update({
                        'system.inShipStorage': false,
                    });
                    if (this.flashElement) this.flashElement(zone, 'success');
                }
            } else if (zoneType === 'ship') {
                // If item is from compendium or another actor, create new item
                if (item.actor?.id !== this.document.id) {
                    const itemData = item.toObject();
                    itemData.system.inShipStorage = true;
                    itemData.system.equipped = false;
                    itemData.system.inBackpack = false;
                    await this.document.createEmbeddedDocuments('Item', [itemData]);
                    if (this.flashElement) this.flashElement(zone, 'success');
                } else {
                    // Move existing item to ship storage
                    await item.update({
                        'system.equipped': false,
                        'system.inBackpack': false,
                        'system.inShipStorage': true,
                    });
                    if (this.flashElement) this.flashElement(zone, 'success');
                }
            }
            // Handle equipment slot drops
            else if (zoneType === 'equipment') {
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
        async _handleEquipmentDrop(item: any, slot: string): Promise<void> {
            // Check if item belongs to this actor
            if (item.actor?.id !== this.document.id) {
                (ui.notifications as any).warn('Cannot equip items from other actors');
                return;
            }

            // Check if item can be equipped in this slot
            const validSlot = this._validateEquipmentSlot(item, slot);
            if (!validSlot) {
                (ui.notifications as any).warn(`${item.name} cannot be equipped in ${slot} slot`);
                return;
            }

            // Equip the item
            await item.update({ 'system.equipped': true });

            // Show feedback
            (ui.notifications as any).info(`Equipped ${item.name}`);

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
        _validateEquipmentSlot(item: any, slot: string): boolean {
            // Weapons can go in weapon slots
            if (slot === 'primary-weapon' || slot === 'secondary-weapon') {
                return item.type === 'weapon';
            }

            // Armor can go in armor slots
            if (slot.includes('armor')) {
                return item.type === 'armour';
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
        async _handleGeneralDrop(item: any, event: DragEvent): Promise<void> {
            // Check if this is a split operation
            if (this._splitResult) {
                await this._handleSplitDrop(item, this._splitResult.quantity);
                this._splitResult = null;
                return;
            }

            // Default: move/copy item
            const behavior = this._dropBehavior(event);

            if (behavior === 'copy') {
                const itemData = item.toObject();
                await this.document.createEmbeddedDocuments('Item', [itemData]);
                (ui.notifications as any).info(`Added ${item.name} to inventory`);
            } else if (behavior === 'move') {
                // Item is already on this actor, no action needed
                (ui.notifications as any).info(`Moved ${item.name}`);
            }
        }

        /* -------------------------------------------- */

        /**
         * Handle split item drop
         * @param {Item} item  The source item
         * @param {number} quantity  Quantity to split
         * @private
         */
        async _handleSplitDrop(item: any, quantity: number): Promise<void> {
            const remaining = (item.system.quantity || 1) - quantity;

            if (remaining <= 0) {
                (ui.notifications as any).error('Cannot split entire stack');
                return;
            }

            // Create new item with split quantity
            const newItemData = item.toObject();
            newItemData.system.quantity = quantity;
            newItemData.name = `${item.name} (${quantity})`;

            await this.document.createEmbeddedDocuments('Item', [newItemData]);

            // Update original item quantity
            await item.update({ 'system.quantity': remaining });

            (ui.notifications as any).info(`Split ${item.name}: ${quantity} moved, ${remaining} remaining`);
        }

        /* -------------------------------------------- */

        /**
         * Handle drop in inventory list for reordering
         * @param {DragEvent} event  The drop event
         * @private
         */
        async _onInventoryDrop(event: DragEvent): Promise<void> {
            event.preventDefault();
            event.stopPropagation();

            // Remove drop indicator
            this.element.querySelectorAll('.drop-indicator').forEach((el) => el.remove());

            if (!this._draggedItem) return;

            const targetRow = (event.target as HTMLElement).closest('[data-item-id]') as HTMLElement;
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
        async _reorderItems(sourceId: string, targetId: string, clientY: number): Promise<void> {
            // Get all items in order
            const items = Array.from(this.document.items) as any[];

            // Find source and target
            const sourceIndex = items.findIndex((i: any) => i.id === sourceId);
            const targetIndex = items.findIndex((i: any) => i.id === targetId);

            if (sourceIndex === -1 || targetIndex === -1) return;

            // Reorder
            const [removed] = items.splice(sourceIndex, 1);
            items.splice(targetIndex, 0, removed);

            // Update sort values
            const updates = items.map((item, index) => ({
                _id: item.id,
                sort: index * 100,
            }));

            await this.document.updateEmbeddedDocuments('Item', updates);

            (ui.notifications as any).info('Items reordered');
        }

        /* -------------------------------------------- */

        /**
         * Handle drop on favorites bar
         * @param {DragEvent} event  The drop event
         * @private
         */
        async _onFavoritesDrop(event: DragEvent): Promise<void> {
            event.preventDefault();
            event.stopPropagation();

            const favBar = event.currentTarget as HTMLElement;
            favBar.classList.remove('drop-hover');

            // Parse drag data
            const data = TextEditor.getDragEventData(event) as any;
            if (!data?.uuid) return;

            const item = await fromUuid(data.uuid) as any;
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
        async _addToFavorites(item: any): Promise<void> {
            const favorites = this.document.getFlag('wh40k-rpg', 'favorites') || [];

            if (favorites.includes(item.id)) {
                (ui.notifications as any).warn(`${item.name} is already in favorites`);
                return;
            }

            if (favorites.length >= 8) {
                (ui.notifications as any).warn('Favorites bar is full (max 8 items)');
                return;
            }

            favorites.push(item.id);
            await this.document.setFlag('wh40k-rpg', 'favorites', favorites);

            (ui.notifications as any).info(`Added ${item.name} to favorites`);
        }

        /* -------------------------------------------- */
        /*  Drag End Handlers                           */
        /* -------------------------------------------- */

        /**
         * Enhanced drag end handler
         * @param {DragEvent} event  The drag end event
         * @private
         */
        _onEnhancedDragEnd(event: DragEvent): void {
            this._resetDrag();
        }

        /* -------------------------------------------- */

        /**
         * Reset drag state and cleanup visual feedback
         * @private
         */
        _resetDrag(): void {
            // Remove dragging class
            if (this._draggedItem?.element) {
                this._draggedItem.element.classList.remove('dragging');
            }

            // Remove drag-active state
            this.element.classList.remove('drag-active');

            // Remove drop zone highlights
            this.element.querySelectorAll('[data-drop-zone]').forEach((zone) => {
                zone.classList.remove('drop-valid', 'drop-invalid', 'drop-hover');
            });

            // Remove drop indicators
            this.element.querySelectorAll('.drop-indicator').forEach((el) => el.remove());

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
        _animateSnapToSlot(item: any): void {
            // Find the item element
            const itemEl = this.element.querySelector(`[data-item-id="${item.id}"]`);
            if (!itemEl) return;

            // Add snap animation
            itemEl.classList.add('snap-to-slot');
            setTimeout(() => {
                itemEl.classList.remove('snap-to-slot');
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
        async removeFromFavorites(itemId: string): Promise<void> {
            const favorites = this.document.getFlag('wh40k-rpg', 'favorites') || [];
            const newFavorites = favorites.filter((id) => id !== itemId);
            await this.document.setFlag('wh40k-rpg', 'favorites', newFavorites);
        }

        /* -------------------------------------------- */

        /**
         * Clear all favorites
         * @public
         */
        async clearFavorites(): Promise<void> {
            await this.document.setFlag('wh40k-rpg', 'favorites', []);
        }

        /* -------------------------------------------- */

        /**
         * Get favorite items
         * @returns {Item[]}  Array of favorite items
         * @public
         */
        getFavoriteItems(): any[] {
            const favorites = this.document.getFlag('wh40k-rpg', 'favorites') || [];
            return favorites.map((id) => this.document.items.get(id)).filter((i) => i);
        }
    };
}
