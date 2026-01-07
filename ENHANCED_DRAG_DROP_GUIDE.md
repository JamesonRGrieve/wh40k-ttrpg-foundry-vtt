# Enhanced Drag-Drop System - User Guide

**Showcase Feature #6 - ApplicationV2 Enhancement**

---

## 🎯 Overview

The Enhanced Drag-Drop system transforms inventory management in Rogue Trader VTT with intuitive visual feedback, quick equipment, item reordering, stack splitting, and a favorites bar for frequently used items.

**Built with:**
- ApplicationV2 mixin architecture
- Gothic 40K visual theming
- Smooth GPU-accelerated animations
- Touch device support
- Accessibility features

---

## ✨ Features

### 1. Visual Drag Feedback

**Custom Drag Ghost:**
```
┌────────────────────────┐
│ 🖼️  Bolt Pistol        │
│     ×20 rounds ✓       │
└────────────────────────┘
```

- Shows item icon, name, quantity, and equipped status
- Follows cursor with smooth animation
- Gothic 40K styling with bronze border

### 2. Drop Zone Highlighting

**Valid Drop Zones:**
- Pulse with gold border
- Show "⬇ Drop Here" text
- Animate with diagonal stripes

**Invalid Drop Zones:**
- Red border with X icon
- "✖ Cannot Drop" warning
- Cursor changes to not-allowed

### 3. Item Reordering

Drag items within inventory lists to reorder them:

```
Before:
1. Bolt Pistol
2. Las Carbine
3. Chainsword

[User drags Chainsword above Las Carbine]

After:
1. Bolt Pistol
2. Chainsword
3. Las Carbine
```

**Visual Indicator:**
- Gold horizontal line shows drop position
- Diamond markers (◆) at both ends
- Glowing animation

### 4. Quick Equip to Slots

Drag weapons or armor to equipment slots:

```
Equipment Slots:
┌──────────────────┐
│ Primary Weapon   │ ← Drag weapon here
│ [Empty Slot]     │
└──────────────────┘
```

**Features:**
- Validates item type (weapons to weapon slots, armor to armor slots)
- Auto-equips item on drop
- Snap-to-slot animation (bounce effect)
- Shows slot label when empty

### 5. Item Stack Splitting

**Ctrl+Drag** to split item stacks:

```
Step 1: Hold Ctrl and drag ammo (×100)
Step 2: Dialog appears:

┌─────────────────────────────┐
│ Split Bolt Pistol Ammo      │
├─────────────────────────────┤
│ Quantity to move: [20]      │
│ (Remaining: 80)             │
├─────────────────────────────┤
│ [Split] [Cancel]            │
└─────────────────────────────┘

Step 3: Drop creates new stack of 20
Original stack reduced to 80
```

**Works with:**
- Ammunition
- Consumables (stims, grenades)
- Any item with quantity > 1

### 6. Favorites Bar

Drag frequently used items to a quick-access bar:

```
Favorites Bar:
┌─────────────────────────────────────────┐
│ [⚔️] [🔫] [💊] [💣] [+] [+] [+] [+]    │
└─────────────────────────────────────────┘
  weapon  gun  stim  grenade  empty slots
```

**Features:**
- Holds up to 8 favorite items
- Click to use item
- Hover shows X to remove
- Drag to reorder favorites
- Persists per-actor via flags

---

## 🎮 Usage

### Basic Drag-Drop

**Dragging Items:**
1. Hover over any item in your inventory
2. Click and hold to start dragging
3. Item element becomes semi-transparent
4. Drag ghost follows cursor

**Dropping Items:**
1. Drag over valid drop zone
2. Zone highlights with gold border
3. Release to drop
4. Item moves/copies based on keyboard modifiers

**Keyboard Modifiers:**
- **No modifier:** Move item (if same actor) or copy (if different)
- **Shift:** Force copy item
- **Alt:** Create link to item
- **Ctrl:** Split stack (if quantity > 1)

### Equipment Slots

**Quick Equip Workflow:**

1. Drag weapon from inventory
2. Drop on "Primary Weapon" slot
3. Item automatically equipped
4. Snap-to-slot animation plays
5. Notification confirms: "Equipped Bolt Pistol"

**Slot Types:**
- `primary-weapon` - Main weapon
- `secondary-weapon` - Backup weapon
- `head-armor` - Helmet
- `body-armor` - Chest piece
- `arm-armor` - Gauntlets
- `leg-armor` - Greaves

### Item Reordering

**Within Inventory Lists:**

1. Drag item in list
2. Hover over target position
3. Gold line appears showing drop point
4. Release to reorder
5. Items automatically re-sorted

**Visual Feedback:**
```
[Item 1]
[Item 2]
◆──────◆  ← Drop indicator
[Item 3]
[Item 4]
```

### Stack Splitting

**Splitting Ammunition:**

1. Hold **Ctrl** key
2. Drag ammunition item (×100)
3. Split dialog appears
4. Enter quantity to move: `20`
5. Click "Split"
6. Drop at target location
7. Result: Two stacks (×20 and ×80)

**Use Cases:**
- Share ammo with party members
- Distribute consumables
- Organize inventory by quantity
- Prepare for missions

### Favorites Bar

**Adding Favorites:**

1. Drag item to favorites bar
2. Drop in empty slot
3. Confirmation: "Added [item] to favorites"
4. Item icon appears in bar

**Using Favorites:**

1. Click favorite item icon
2. Item's default action triggers
3. Weapons attack, consumables use, etc.

**Removing Favorites:**

1. Hover over favorite item
2. Click red X button (top-right corner)
3. Item removed from favorites
4. Original item remains in inventory

**Managing Favorites:**

```javascript
// In console or macro:
const sheet = actor.sheet;

// Get favorite items
const favorites = sheet.getFavoriteItems();

// Remove specific item
await sheet.removeFromFavorites("itemId");

// Clear all favorites
await sheet.clearFavorites();
```

---

## 🎨 Visual States

### Drag States

| State | Visual | Description |
|-------|--------|-------------|
| **Dragging** | 40% opacity, scaled down | Element being dragged |
| **Drag Active** | Gold tint on lists | Sheet in drag mode |
| **Valid Zone** | Gold dashed border, pulsing | Can drop here |
| **Invalid Zone** | Red dashed border, static | Cannot drop |
| **Drop Hover** | Solid border, glow effect | Actively over zone |

### Animations

**Drop Indicator:**
- Gold gradient line
- Diamond markers (◆)
- Pulsing glow effect
- Duration: 1s infinite

**Snap-to-Slot:**
- Scale up (1.15x) → down (0.95x) → normal
- Slight rotation (-5° to +5°)
- Duration: 600ms
- Easing: cubic-bezier bounce

**Drop Zone Pulse:**
- Diagonal stripe pattern
- Opacity oscillates (50% → 100% → 50%)
- Duration: 2s infinite

---

## ⚙️ Template Integration

### Equipment Slots

Add equipment slots to your actor sheet template:

```handlebars
<div class="equipment-panel">
    <h3>Equipment Slots</h3>
    
    <!-- Primary Weapon Slot -->
    <div class="equipment-slot" 
         data-drop-zone="equipment" 
         data-slot="primary-weapon"
         data-accepts="weapon"
         data-slot-label="Primary Weapon">
        {{#if system.equipment.primaryWeapon}}
            <div class="item-card" data-item-id="{{system.equipment.primaryWeapon._id}}">
                <img src="{{system.equipment.primaryWeapon.img}}" />
                <span>{{system.equipment.primaryWeapon.name}}</span>
            </div>
        {{else}}
            <span class="empty-slot">Drop weapon here</span>
        {{/if}}
    </div>
    
    <!-- Secondary Weapon Slot -->
    <div class="equipment-slot" 
         data-drop-zone="equipment" 
         data-slot="secondary-weapon"
         data-accepts="weapon"
         data-slot-label="Secondary Weapon">
        <!-- Similar structure -->
    </div>
</div>
```

### Favorites Bar

```handlebars
<div class="favorites-panel">
    <h3>⭐ Favorites</h3>
    <div class="favorites-bar" data-favorites-bar>
        {{#each favoriteItems}}
            <div class="favorite-item" data-item-id="{{this.id}}" draggable="true">
                <img src="{{this.img}}" alt="{{this.name}}" title="{{this.name}}" />
                <button class="remove-favorite" data-action="removeFromFavorites" data-item-id="{{this.id}}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        {{else}}
            {{#each (range 8)}}
                <div class="favorite-empty">+</div>
            {{/each}}
        {{/each}}
    </div>
</div>
```

### Inventory List (with reordering)

```handlebars
<div class="inventory-section">
    <h3>Inventory</h3>
    <div class="inventory-list">
        {{#each items}}
            <div class="item-row" data-item-id="{{this.id}}" draggable="true">
                <img src="{{this.img}}" />
                <span class="item-name">{{this.name}}</span>
                {{#if this.system.quantity}}
                    <span class="item-quantity">×{{this.system.quantity}}</span>
                {{/if}}
                {{#if this.system.equipped}}
                    <i class="fas fa-check-circle equipped"></i>
                {{/if}}
            </div>
        {{/each}}
    </div>
</div>
```

### Data Attributes

**Required attributes:**

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `data-drop-zone` | Marks as drop target | `data-drop-zone="equipment"` |
| `data-slot` | Equipment slot identifier | `data-slot="primary-weapon"` |
| `data-accepts` | Accepted item types (comma-separated) | `data-accepts="weapon,armour"` |
| `data-slot-label` | Label shown when empty | `data-slot-label="Main Hand"` |
| `data-favorites-bar` | Marks favorites container | `data-favorites-bar` |
| `data-item-id` | Item identifier for dragging | `data-item-id="{{id}}"` |

---

## 🔧 Customization

### Custom Drag Ghost

Override `_createDragGhost()` in your sheet:

```javascript
_createDragGhost(item, event) {
    const ghost = super._createDragGhost(item, event);
    
    // Add custom styling
    ghost.classList.add("my-custom-ghost");
    
    // Add extra info
    if (item.system.damage) {
        const damageEl = document.createElement("div");
        damageEl.className = "ghost-damage";
        damageEl.textContent = item.system.damage;
        ghost.querySelector(".ghost-details").appendChild(damageEl);
    }
    
    return ghost;
}
```

### Custom Drop Zone Validation

Override `_validateEquipmentSlot()`:

```javascript
_validateEquipmentSlot(item, slot) {
    // Custom validation logic
    if (slot === "primary-weapon") {
        // Only allow two-handed weapons
        return item.type === "weapon" && item.system.twoHanded;
    }
    
    return super._validateEquipmentSlot(item, slot);
}
```

### Custom Drop Handlers

Override specific drop methods:

```javascript
async _handleEquipmentDrop(item, slot) {
    // Custom equip logic
    console.log(`Equipping ${item.name} in ${slot}`);
    
    // Check prerequisites
    if (!this._canEquipItem(item)) {
        ui.notifications.warn("Cannot equip: Missing prerequisite");
        return;
    }
    
    // Call parent implementation
    await super._handleEquipmentDrop(item, slot);
    
    // Post-equip actions
    await this._updateEncumbrance();
}
```

---

## 🎨 Styling

### CSS Variables

Override these in your custom stylesheet:

```css
:root {
    --rt-drag-ghost-bg: linear-gradient(135deg, #3e3e3e, #0a0a0a);
    --rt-drag-border: #cd7f32;
    --rt-drag-highlight: #d4af37;
    --rt-drop-valid-color: rgba(212, 175, 55, 0.2);
    --rt-drop-invalid-color: rgba(220, 20, 60, 0.2);
}
```

### Custom Ghost Styling

```css
.rt-drag-ghost.my-custom-style {
    background: linear-gradient(90deg, darkred, black);
    border-color: crimson;
    
    .ghost-name {
        color: gold;
        text-transform: uppercase;
    }
    
    .ghost-damage {
        color: red;
        font-weight: bold;
    }
}
```

### Custom Drop Zone Styling

```css
[data-drop-zone="my-custom-zone"] {
    background: url(/path/to/texture.png);
    border-style: double;
    min-height: 120px;
    
    &.drop-valid {
        box-shadow: 0 0 20px cyan;
    }
    
    &.drop-hover::after {
        content: "⚡ Drop Item Here";
        color: cyan;
    }
}
```

---

## 📱 Mobile / Touch Support

### Touch Gestures

**Long Press to Drag:**
- Touch and hold item for 500ms
- Haptic feedback (if supported)
- Drag ghost appears
- Move finger to drag

**Touch Drop:**
- Move to drop zone
- Zone highlights on touch-over
- Lift finger to drop

### Responsive Adjustments

**Small Screens (<768px):**
- Smaller drag ghost (150px width)
- Larger touch targets (60×60px)
- Favorites bar wraps to multiple rows
- Drop zones taller (100px min)
- Always show remove buttons

**Touch Optimizations:**
```css
@media (hover: none) and (pointer: coarse) {
    // Touch-specific styles automatically applied
    .favorite-item {
        width: 60px;
        height: 60px;
    }
    
    .remove-favorite {
        opacity: 1; // Always visible
    }
}
```

---

## ♿ Accessibility

### Keyboard Support

**Not Yet Implemented** (future enhancement):
- Tab to focus drag items
- Space/Enter to pick up
- Arrow keys to move
- Space/Enter to drop
- Escape to cancel

### Screen Readers

Add ARIA labels to templates:

```handlebars
<div class="equipment-slot" 
     data-drop-zone="equipment"
     role="button"
     aria-label="Primary Weapon Slot. {{#if item}}Equipped: {{item.name}}{{else}}Empty{{/if}}"
     tabindex="0">
    <!-- Content -->
</div>
```

### Reduced Motion

Automatically respects `prefers-reduced-motion`:
- No animations
- No transitions
- Instant state changes
- Static visual feedback only

---

## 🐛 Troubleshooting

### Issue: Drag not starting

**Symptoms:** Items don't drag when clicked

**Solutions:**
1. Check `draggable="true"` on item elements
2. Verify `data-item-id` is set correctly
3. Ensure mixin is in sheet's mixin chain
4. Check console for permission errors

### Issue: Drop zones not highlighting

**Symptoms:** No visual feedback when dragging over zones

**Solutions:**
1. Verify `data-drop-zone` attribute is set
2. Check SCSS is compiled and imported
3. Ensure `_setupDropZones()` is called in `_onRender()`
4. Inspect element: should have `.drop-valid` or `.drop-invalid` class

### Issue: Split dialog not appearing

**Symptoms:** Ctrl+Drag doesn't show split dialog

**Solutions:**
1. Check item has `system.quantity > 1`
2. Verify item type is in `splittableTypes` array
3. Check browser console for dialog errors
4. Ensure Foundry Dialog API is available

### Issue: Favorites not persisting

**Symptoms:** Favorites lost on sheet close/reopen

**Solutions:**
1. Check actor flags: `actor.getFlag("rogue-trader", "favorites")`
2. Verify user has permission to set flags
3. Check for flag save errors in console
4. Ensure favorites are loaded in `_prepareContext()`

### Issue: Items duplicating instead of moving

**Symptoms:** Drag creates copies, original remains

**Solutions:**
1. Check `_dropBehavior()` logic
2. Verify source and target actor are same
3. Check keyboard modifiers (Shift forces copy)
4. Inspect drag data: should have correct UUID

---

## 🔍 Developer Reference

### Mixin API

**Public Methods:**

```javascript
class EnhancedDragDropMixin {
    // Get favorite items
    getFavoriteItems(): Item[]
    
    // Remove item from favorites
    async removeFromFavorites(itemId: string): Promise<void>
    
    // Clear all favorites
    async clearFavorites(): Promise<void>
    
    // Animate snap-to-slot effect
    _animateSnapToSlot(item: Item): void
}
```

**Override Points:**

```javascript
// Customize drag ghost
_createDragGhost(item, event): HTMLElement

// Validate equipment slots
_validateEquipmentSlot(item, slot): boolean

// Handle equipment drops
async _handleEquipmentDrop(item, slot): Promise<void>

// Handle general drops
async _handleGeneralDrop(item, event): Promise<void>

// Handle split drops
async _handleSplitDrop(item, quantity): Promise<void>

// Reorder items
async _reorderItems(sourceId, targetId, clientY): Promise<void>
```

### Actor Flags

**Favorites:**
```javascript
// Structure
actor.flags["rogue-trader"].favorites = ["itemId1", "itemId2", ...]

// Get
const favorites = actor.getFlag("rogue-trader", "favorites") || [];

// Set
await actor.setFlag("rogue-trader", "favorites", ["itemId1"]);
```

### Events

**Fired by mixin:**

```javascript
// Item dropped on equipment slot
Hooks.call("rt.itemEquipped", actor, item, slot);

// Item added to favorites
Hooks.call("rt.favoriteAdded", actor, item);

// Item removed from favorites
Hooks.call("rt.favoriteRemoved", actor, itemId);

// Items reordered
Hooks.call("rt.itemsReordered", actor, updates);
```

**Listen to events:**

```javascript
Hooks.on("rt.itemEquipped", (actor, item, slot) => {
    console.log(`${item.name} equipped in ${slot} by ${actor.name}`);
});
```

---

## 🎯 Best Practices

### Performance

1. **Limit Drag Ghosts:** Remove after use to prevent memory leaks
2. **Debounce Reordering:** Don't update on every pixel movement
3. **Virtual Scrolling:** For large inventories (100+ items)
4. **Lazy Loading:** Only setup drag-drop on visible items

### User Experience

1. **Clear Visual Feedback:** Always show where item will drop
2. **Undo Support:** Consider adding undo for accidental drops
3. **Confirmation Dialogs:** For destructive actions (combining items)
4. **Tooltips:** Show item details while dragging

### Accessibility

1. **Keyboard Navigation:** Implement keyboard-only drag-drop
2. **Screen Reader Labels:** Add ARIA labels to all interactive elements
3. **Focus Management:** Restore focus after drop
4. **Reduced Motion:** Respect user preferences

---

## 📚 Examples

### Complete Equipment Panel

```handlebars
<section class="equipment-panel" data-panel-id="equipment">
    <h2 class="panel-header">
        <i class="fas fa-shield-alt"></i>
        Equipment
    </h2>
    
    <div class="equipment-grid">
        <!-- Weapon Slots -->
        <div class="equipment-row">
            <label>Weapons</label>
            <div class="equipment-slots">
                <div class="equipment-slot" 
                     data-drop-zone="equipment" 
                     data-slot="primary-weapon"
                     data-accepts="weapon"
                     data-slot-label="Primary Weapon">
                    {{#with system.equipment.primaryWeapon}}
                        {{> itemCard}}
                    {{else}}
                        <span class="empty-slot">Drop primary weapon</span>
                    {{/with}}
                </div>
                
                <div class="equipment-slot" 
                     data-drop-zone="equipment" 
                     data-slot="secondary-weapon"
                     data-accepts="weapon"
                     data-slot-label="Secondary Weapon">
                    {{#with system.equipment.secondaryWeapon}}
                        {{> itemCard}}
                    {{else}}
                        <span class="empty-slot">Drop secondary weapon</span>
                    {{/with}}
                </div>
            </div>
        </div>
        
        <!-- Armor Slots -->
        <div class="equipment-row">
            <label>Armor</label>
            <div class="equipment-slots">
                <div class="equipment-slot" 
                     data-drop-zone="equipment" 
                     data-slot="body-armor"
                     data-accepts="armour"
                     data-slot-label="Body Armor">
                    {{#with system.equipment.bodyArmor}}
                        {{> itemCard}}
                    {{else}}
                        <span class="empty-slot">Drop armor</span>
                    {{/with}}
                </div>
            </div>
        </div>
    </div>
</section>
```

### Macro: Quick Equip

```javascript
// Macro to quick-equip item by name
const itemName = "Bolt Pistol";
const actor = game.user.character;

if (!actor) {
    ui.notifications.warn("No character selected");
    return;
}

const item = actor.items.find(i => i.name === itemName);
if (!item) {
    ui.notifications.warn(`Item "${itemName}" not found`);
    return;
}

await item.update({ "system.equipped": true });
ui.notifications.info(`Equipped ${itemName}`);
```

### Macro: Manage Favorites

```javascript
// Add item to favorites
const itemId = "abc123";
const actor = game.user.character;
const sheet = actor.sheet;

await sheet.removeFromFavorites(itemId); // Remove if exists
const favorites = actor.getFlag("rogue-trader", "favorites") || [];
favorites.push(itemId);
await actor.setFlag("rogue-trader", "favorites", favorites);

ui.notifications.info("Updated favorites");
```

---

## 🚀 Future Enhancements

**Planned features:**

1. **Keyboard-Only Drag-Drop** - Full accessibility support
2. **Item Combining** - Drag items together to craft/combine
3. **Quick Sell** - Drag to "trash" zone to sell items
4. **Loadout Presets** - Save/load equipment configurations
5. **Auto-Sort** - Smart inventory organization by type/value
6. **Weight Visualization** - Show encumbrance as items drag
7. **Multi-Select** - Drag multiple items at once (Shift+Click)
8. **Gesture Shortcuts** - Swipe patterns for quick actions

---

## 📖 Related Documentation

- [ApplicationV2 Features Vision](APPLICATIONV2_FEATURES_VISION.md)
- [ApplicationV2 Progress Report](APPLICATIONV2_PROGRESS.md)
- [Visual Feedback Guide](INLINE_EDITING_FEEDBACK_GUIDE.md)
- [Context Menu Guide](CONTEXT_MENU_GUIDE.md)
- [Collapsible Panels Guide](COLLAPSIBLE_PANELS_GUIDE.md)

---

**For the Emperor! Through efficient inventory management, victory! ⚔️**

*Created: 2026-01-07*
*Feature Status: Complete ✅*
*Build: Passing*
