/**
 * @file EquipmentLoadout - Visual equipment slot system for character sheets
 *
 * Provides interactive visual equipment slots with drag-drop functionality,
 * automatic slot assignment, and integration with existing equip system.
 *
 * Usage:
 * - Apply EquipmentLoadoutMixin to actor sheets
 * - Call _prepareEquipmentSlots() in _prepareContext()
 * - Use equipment-slots-panel.hbs template
 * - Slots auto-assign from equipped items
 * - Drag items to slots to equip
 */

/**
 * Slot type definitions and compatibility rules
 */
export const SLOT_TYPES = {
    // Weapon slots
    PRIMARY_WEAPON: {
        id: 'primaryWeapon',
        label: 'Primary Weapon',
        accepts: ['weapon'],
        icon: 'fa-solid fa-gun',
        filter: (item) => item.type === 'weapon',
        priority: (item) => {
            // Prefer ranged weapons, then melee
            if (item.system.class === 'melee') return 1;
            return 2;
        },
    },
    SECONDARY_WEAPON: {
        id: 'secondaryWeapon',
        label: 'Secondary Weapon',
        accepts: ['weapon'],
        icon: 'fa-solid fa-gavel',
        filter: (item) => item.type === 'weapon',
        priority: (item) => {
            // Prefer different type from primary
            return 1;
        },
    },
    SIDEARM: {
        id: 'sidearm',
        label: 'Sidearm',
        accepts: ['weapon'],
        icon: 'fa-solid fa-hand-holding-gun',
        filter: (item) => item.type === 'weapon' && item.system.class === 'pistol',
        priority: () => 1,
    },

    // Armour slots (by location)
    ARMOUR_HEAD: {
        id: 'armourHead',
        label: 'Head Armour',
        accepts: ['armour'],
        icon: 'fa-solid fa-helmet-battle',
        filter: (item) => item.type === 'armour' && item.system.coverage?.includes('head'),
        location: 'head',
    },
    ARMOUR_BODY: {
        id: 'armourBody',
        label: 'Body Armour',
        accepts: ['armour'],
        icon: 'fa-solid fa-vest',
        filter: (item) => item.type === 'armour' && item.system.coverage?.includes('body'),
        location: 'body',
    },
    ARMOUR_ARMS: {
        id: 'armourArms',
        label: 'Arm Armour',
        accepts: ['armour'],
        icon: 'fa-solid fa-hand-back-point-up',
        filter: (item) => item.type === 'armour' && (item.system.coverage?.includes('leftArm') || item.system.coverage?.includes('rightArm')),
        location: 'arms',
    },
    ARMOUR_LEGS: {
        id: 'armourLegs',
        label: 'Leg Armour',
        accepts: ['armour'],
        icon: 'fa-solid fa-boot-heeled',
        filter: (item) => item.type === 'armour' && (item.system.coverage?.includes('leftLeg') || item.system.coverage?.includes('rightLeg')),
        location: 'legs',
    },

    // Special equipment slots
    FORCE_FIELD: {
        id: 'forceField',
        label: 'Force Field',
        accepts: ['forceField'],
        icon: 'fa-solid fa-shield-halved',
        filter: (item) => item.type === 'forceField',
    },

    // Utility belt slots (quick-access gear)
    UTILITY_1: {
        id: 'utility1',
        label: 'Utility 1',
        accepts: ['gear', 'consumable', 'drug', 'tool', 'ammunition'],
        icon: 'fa-solid fa-circle',
        filter: (item) => ['gear', 'consumable', 'drug', 'tool', 'ammunition'].includes(item.type),
    },
    UTILITY_2: {
        id: 'utility2',
        label: 'Utility 2',
        accepts: ['gear', 'consumable', 'drug', 'tool', 'ammunition'],
        icon: 'fa-solid fa-circle',
        filter: (item) => ['gear', 'consumable', 'drug', 'tool', 'ammunition'].includes(item.type),
    },
    UTILITY_3: {
        id: 'utility3',
        label: 'Utility 3',
        accepts: ['gear', 'consumable', 'drug', 'tool', 'ammunition'],
        icon: 'fa-solid fa-circle',
        filter: (item) => ['gear', 'consumable', 'drug', 'tool', 'ammunition'].includes(item.type),
    },

    // Grenade slots
    GRENADE_1: {
        id: 'grenade1',
        label: 'Grenade 1',
        accepts: ['weapon'],
        icon: 'fa-solid fa-bomb',
        filter: (item) => item.type === 'weapon' && item.system.class === 'thrown',
    },
    GRENADE_2: {
        id: 'grenade2',
        label: 'Grenade 2',
        accepts: ['weapon'],
        icon: 'fa-solid fa-bomb',
        filter: (item) => item.type === 'weapon' && item.system.class === 'thrown',
    },
};

/**
 * Slot groups for visual layout
 */
export const SLOT_GROUPS = {
    weapons: {
        label: 'Weapons',
        slots: ['primaryWeapon', 'secondaryWeapon', 'sidearm'],
    },
    armour: {
        label: 'Armour',
        slots: ['armourHead', 'armourBody', 'armourArms', 'armourLegs'],
    },
    special: {
        label: 'Special Equipment',
        slots: ['forceField'],
    },
    utility: {
        label: 'Utility Belt',
        slots: ['utility1', 'utility2', 'utility3'],
    },
    grenades: {
        label: 'Grenades',
        slots: ['grenade1', 'grenade2'],
    },
};

/**
 * Mixin that adds equipment slot functionality to actor sheets
 * @param {typeof Application} Base - Base class to extend
 * @returns {typeof Application} Extended class
 */
export function EquipmentLoadoutMixin(Base) {
    return class extends Base {
        /** @override */
        static DEFAULT_OPTIONS = {
            actions: {
                ...super.DEFAULT_OPTIONS?.actions,
                equipToSlot: this.#equipToSlot,
                unequipFromSlot: this.#unequipFromSlot,
                swapSlots: this.#swapSlots,
                toggleSlotView: this.#toggleSlotView,
            },
        };

        /**
         * Current view mode (list or slots)
         * @type {string}
         */
        #viewMode = 'list';

        /**
         * Constructor override to initialize view mode from saved flag
         * @override
         */
        constructor(options = {}) {
            super(options);

            // Initialize view mode from actor flag (defaults to 'list')
            if (this.actor) {
                this.#viewMode = this.actor.getFlag('rogue-trader', 'equipmentViewMode') || 'list';
            }
        }

        /**
         * Get current view mode
         * @returns {string}
         */
        get equipmentViewMode() {
            return this.#viewMode;
        }

        /**
         * Prepare equipment slots data for rendering
         * @param {Object} context - Sheet context
         * @returns {Object} Slots data
         */
        _prepareEquipmentSlots(context) {
            const equippedItems = this.actor.items.filter((i) => i.system?.equipped === true);

            // Initialize all slots as empty
            const slots = {};
            for (const [key, slotDef] of Object.entries(SLOT_TYPES)) {
                slots[slotDef.id] = {
                    id: slotDef.id,
                    label: slotDef.label,
                    icon: slotDef.icon,
                    accepts: slotDef.accepts,
                    item: null,
                    isEmpty: true,
                };
            }

            // Track which items have been assigned to slots
            const assignedItems = new Set();

            // Auto-assign equipped items to appropriate slots
            this._autoAssignToSlots(equippedItems, slots, assignedItems);

            // Get unassigned equipped items (for overflow display)
            const unassignedEquipped = equippedItems.filter((item) => !assignedItems.has(item.id));

            // Group slots for layout
            const slotGroups = {};
            for (const [groupKey, groupDef] of Object.entries(SLOT_GROUPS)) {
                slotGroups[groupKey] = {
                    label: groupDef.label,
                    slots: groupDef.slots.map((slotId) => slots[slotId]),
                };
            }

            return {
                slots,
                slotGroups,
                unassignedEquipped,
                viewMode: this.#viewMode,
            };
        }

        /**
         * Auto-assign equipped items to slots based on priority rules
         * @param {Item[]} items - Equipped items
         * @param {Object} slots - Slot definitions
         * @param {Set} assignedItems - Tracks assigned item IDs
         * @private
         */
        _autoAssignToSlots(items, slots, assignedItems) {
            // Weapons
            const weapons = items.filter((i) => i.type === 'weapon' && !assignedItems.has(i.id));
            const rangedWeapons = weapons.filter((w) => w.system.class !== 'melee' && w.system.class !== 'thrown');
            const meleeWeapons = weapons.filter((w) => w.system.class === 'melee');
            const pistols = weapons.filter((w) => w.system.class === 'pistol');
            const grenades = weapons.filter((w) => w.system.class === 'thrown');

            // Assign primary weapon (prefer ranged, fallback to melee)
            if (rangedWeapons.length > 0) {
                this._assignItemToSlot(rangedWeapons[0], slots.primaryWeapon, assignedItems);
            } else if (meleeWeapons.length > 0) {
                this._assignItemToSlot(meleeWeapons[0], slots.primaryWeapon, assignedItems);
            }

            // Assign secondary weapon (prefer different type)
            const remainingWeapons = weapons.filter((w) => !assignedItems.has(w.id) && w.system.class !== 'thrown');
            if (remainingWeapons.length > 0) {
                // Try to find a different class than primary
                const primaryClass = slots.primaryWeapon.item?.system?.class;
                const differentClass = remainingWeapons.find((w) => w.system.class !== primaryClass);
                const secondary = differentClass || remainingWeapons[0];
                this._assignItemToSlot(secondary, slots.secondaryWeapon, assignedItems);
            }

            // Assign sidearm (prefer pistol not already assigned)
            const unassignedPistol = pistols.find((p) => !assignedItems.has(p.id));
            if (unassignedPistol) {
                this._assignItemToSlot(unassignedPistol, slots.sidearm, assignedItems);
            }

            // Assign grenades (up to 2)
            grenades.slice(0, 2).forEach((grenade, idx) => {
                const slot = idx === 0 ? slots.grenade1 : slots.grenade2;
                this._assignItemToSlot(grenade, slot, assignedItems);
            });

            // Armour - assign by coverage
            const armourItems = items.filter((i) => i.type === 'armour' && !assignedItems.has(i.id));
            for (const armour of armourItems) {
                const coverage = armour.system.coverage || [];

                // Head
                if (coverage.includes('head') && !slots.armourHead.item) {
                    this._assignItemToSlot(armour, slots.armourHead, assignedItems);
                    continue;
                }

                // Body
                if (coverage.includes('body') && !slots.armourBody.item) {
                    this._assignItemToSlot(armour, slots.armourBody, assignedItems);
                    continue;
                }

                // Arms
                if ((coverage.includes('leftArm') || coverage.includes('rightArm')) && !slots.armourArms.item) {
                    this._assignItemToSlot(armour, slots.armourArms, assignedItems);
                    continue;
                }

                // Legs
                if ((coverage.includes('leftLeg') || coverage.includes('rightLeg')) && !slots.armourLegs.item) {
                    this._assignItemToSlot(armour, slots.armourLegs, assignedItems);
                    continue;
                }

                // Full coverage armor - assign to first empty armour slot
                if (coverage.includes('all')) {
                    if (!slots.armourHead.item) {
                        this._assignItemToSlot(armour, slots.armourHead, assignedItems);
                    } else if (!slots.armourBody.item) {
                        this._assignItemToSlot(armour, slots.armourBody, assignedItems);
                    } else if (!slots.armourArms.item) {
                        this._assignItemToSlot(armour, slots.armourArms, assignedItems);
                    } else if (!slots.armourLegs.item) {
                        this._assignItemToSlot(armour, slots.armourLegs, assignedItems);
                    }
                }
            }

            // Force field
            const forceField = items.find((i) => i.type === 'forceField' && !assignedItems.has(i.id));
            if (forceField) {
                this._assignItemToSlot(forceField, slots.forceField, assignedItems);
            }

            // Utility belt - quick access gear
            const utilityGear = items.filter((i) => ['gear', 'consumable', 'drug', 'tool', 'ammunition'].includes(i.type) && !assignedItems.has(i.id));
            utilityGear.slice(0, 3).forEach((item, idx) => {
                const slotKey = `utility${idx + 1}`;
                this._assignItemToSlot(item, slots[slotKey], assignedItems);
            });
        }

        /**
         * Assign an item to a slot
         * @param {Item} item - Item to assign
         * @param {Object} slot - Slot definition
         * @param {Set} assignedItems - Tracks assigned item IDs
         * @private
         */
        _assignItemToSlot(item, slot, assignedItems) {
            if (!item || !slot) return;

            slot.item = item;
            slot.isEmpty = false;
            assignedItems.add(item.id);
        }

        /**
         * Check if an item can be equipped to a slot
         * @param {Item} item - Item to check
         * @param {string} slotId - Slot ID
         * @returns {boolean}
         */
        _canEquipToSlot(item, slotId) {
            // Find slot definition by ID
            const slotDef = Object.values(SLOT_TYPES).find((s) => s.id === slotId);
            if (!slotDef) return false;

            // Check type compatibility
            if (!slotDef.accepts.includes(item.type)) return false;

            // Check filter function
            if (slotDef.filter && !slotDef.filter(item)) return false;

            return true;
        }

        /**
         * Toggle between list and slots view
         * @this {Application}
         * @param {PointerEvent} event - Triggering event
         * @param {HTMLElement} target - Action target
         */
        static async #toggleSlotView(event, target) {
            this.#viewMode = this.#viewMode === 'list' ? 'slots' : 'list';

            // Save preference
            await this.actor.setFlag('rogue-trader', 'equipmentViewMode', this.#viewMode);

            // Re-render
            this.render();
        }

        /**
         * Equip an item to a specific slot
         * @this {Application}
         * @param {PointerEvent} event - Triggering event
         * @param {HTMLElement} target - Action target
         */
        static async #equipToSlot(event, target) {
            const slotId = target.dataset.slotId;
            const itemId = target.dataset.itemId;

            if (!slotId || !itemId) return;

            const item = this.actor.items.get(itemId);
            if (!item) return;

            // Check compatibility
            if (!this._canEquipToSlot(item, slotId)) {
                ui.notifications.warn(`${item.name} cannot be equipped to this slot.`);
                return;
            }

            // Equip the item
            await item.update({ 'system.equipped': true });
        }

        /**
         * Unequip an item from a slot
         * @this {Application}
         * @param {PointerEvent} event - Triggering event
         * @param {HTMLElement} target - Action target
         */
        static async #unequipFromSlot(event, target) {
            const itemId = target.dataset.itemId;
            if (!itemId) return;

            const item = this.actor.items.get(itemId);
            if (!item) return;

            await item.update({ 'system.equipped': false });
        }

        /**
         * Swap items between two slots
         * @this {Application}
         * @param {PointerEvent} event - Triggering event
         * @param {HTMLElement} target - Action target
         */
        static async #swapSlots(event, target) {
            const fromSlotId = target.dataset.fromSlot;
            const toSlotId = target.dataset.toSlot;
            const itemId = target.dataset.itemId;

            if (!fromSlotId || !toSlotId || !itemId) return;

            // TODO: Implement slot swapping logic
            // This would require tracking slot assignments persistently
            // For now, auto-assignment handles this on re-render
        }

        /**
         * Override _onDropItem to handle slot-specific drops
         * @override
         */
        async _onDropItem(event, item) {
            // Check if dropped on a slot
            const slotElement = event.target.closest('[data-slot-id]');

            if (slotElement) {
                const slotId = slotElement.dataset.slotId;

                // Check if item already on actor
                const existingItem = this.actor.items.get(item.id);

                if (existingItem) {
                    // Already on actor - just need to equip
                    if (!existingItem.system.equipped) {
                        // Check compatibility
                        if (this._canEquipToSlot(existingItem, slotId)) {
                            await existingItem.update({ 'system.equipped': true });
                        } else {
                            ui.notifications.warn(`${existingItem.name} cannot be equipped to this slot.`);
                        }
                    }
                    return;
                }

                // Not on actor - add and equip
                const created = await this.actor.createEmbeddedDocuments('Item', [item.toObject()]);
                if (created && created[0]) {
                    // Check compatibility
                    if (this._canEquipToSlot(created[0], slotId)) {
                        await created[0].update({ 'system.equipped': true });
                    } else {
                        ui.notifications.warn(`${created[0].name} cannot be equipped to this slot.`);
                    }
                }

                return;
            }

            // Not dropped on a slot - use default behavior
            return super._onDropItem?.(event, item);
        }

        /**
         * Override _onRender to attach drag-drop event listeners
         * @override
         */
        _onRender(context, options) {
            super._onRender?.(context, options);

            // Attach drag-drop handlers to slots
            this._attachSlotDragHandlers();
        }

        /**
         * Attach drag-drop event listeners to equipment slots
         * @private
         */
        _attachSlotDragHandlers() {
            const slots = this.element.querySelectorAll('.rt-equipment-slot');

            for (const slot of slots) {
                // Dragover - highlight valid drop zones
                slot.addEventListener('dragover', this._onSlotDragOver.bind(this));

                // Dragleave - remove highlight
                slot.addEventListener('dragleave', this._onSlotDragLeave.bind(this));

                // Drop - handled by ApplicationV2 _onDropItem
            }

            // Make filled slots draggable
            const filledSlots = this.element.querySelectorAll('.rt-slot-filled');
            for (const filled of filledSlots) {
                filled.addEventListener('dragstart', this._onSlotDragStart.bind(this));
                filled.addEventListener('dragend', this._onSlotDragEnd.bind(this));
            }

            // Make overflow items draggable
            const overflowItems = this.element.querySelectorAll('.rt-overflow-item');
            for (const overflowItem of overflowItems) {
                overflowItem.addEventListener('dragstart', this._onOverflowDragStart.bind(this));
                overflowItem.addEventListener('dragend', this._onSlotDragEnd.bind(this));
            }
        }

        /**
         * Handle dragover on equipment slot
         * @param {DragEvent} event - Drag event
         * @private
         */
        _onSlotDragOver(event) {
            event.preventDefault();

            const slot = event.currentTarget;
            const slotId = slot.dataset.slotId;

            // Get dragged item data
            let dragData;
            try {
                dragData = JSON.parse(event.dataTransfer.getData('text/plain'));
            } catch (err) {
                return;
            }

            if (dragData.type !== 'Item') return;

            // Check if item is compatible with slot
            // We need the item object to check compatibility
            // For now, just highlight as valid - validation happens on drop
            slot.classList.add('drag-over');
        }

        /**
         * Handle dragleave on equipment slot
         * @param {DragEvent} event - Drag event
         * @private
         */
        _onSlotDragLeave(event) {
            const slot = event.currentTarget;
            slot.classList.remove('drag-over', 'drag-invalid');
        }

        /**
         * Handle dragstart on filled slot
         * @param {DragEvent} event - Drag event
         * @private
         */
        _onSlotDragStart(event) {
            const itemId = event.currentTarget.dataset.itemId;
            if (!itemId) return;

            const item = this.actor.items.get(itemId);
            if (!item) return;

            // Set drag data
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(
                'text/plain',
                JSON.stringify({
                    type: 'Item',
                    uuid: item.uuid,
                }),
            );

            // Add dragging class
            event.currentTarget.classList.add('dragging');
        }

        /**
         * Handle dragstart on overflow item
         * @param {DragEvent} event - Drag event
         * @private
         */
        _onOverflowDragStart(event) {
            const itemId = event.currentTarget.dataset.itemId;
            if (!itemId) return;

            const item = this.actor.items.get(itemId);
            if (!item) return;

            // Set drag data
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(
                'text/plain',
                JSON.stringify({
                    type: 'Item',
                    uuid: item.uuid,
                }),
            );

            // Add dragging class
            event.currentTarget.classList.add('dragging');
        }

        /**
         * Handle dragend
         * @param {DragEvent} event - Drag event
         * @private
         */
        _onSlotDragEnd(event) {
            // Remove dragging classes
            event.currentTarget.classList.remove('dragging');

            // Remove all drag-over highlights
            const slots = this.element.querySelectorAll('.rt-equipment-slot');
            for (const slot of slots) {
                slot.classList.remove('drag-over', 'drag-invalid');
            }
        }
    };
}
