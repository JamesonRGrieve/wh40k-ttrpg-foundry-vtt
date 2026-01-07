# Rogue Trader VTT - ApplicationV2 Features Vision
**Modern Character Sheet Enhancements Using Foundry V13 ApplicationV2**

---

## 🎯 Executive Summary

This document outlines feature enhancements and integrations for the Rogue Trader character sheet leveraging Foundry V13's ApplicationV2 framework. These features will transform the character sheet from a static form into a dynamic, immersive command center for navigating the void.

**Design Philosophy:**
- **Information at a glance** - Critical stats always visible
- **Context-aware interactions** - Smart tooltips and inline help
- **Responsive feedback** - Immediate visual responses to actions
- **Streamlined workflows** - Reduce clicks for common tasks
- **Thematic immersion** - Gothic 40K aesthetic with modern UX

---

## 🚀 Tier 1: Foundation Features (High Impact, Lower Complexity)

### 1.1 Smart Contextual Tooltips

**Feature:** Rich, context-aware tooltips leveraging V2's tooltip system.

**Implementation:**
```javascript
static DEFAULT_OPTIONS = {
    actions: {
        showTooltip: CharacterSheet.#showTooltip
    }
};

// In template:
<div class="characteristic" data-tooltip-class="rt-tooltip-rich">
    <tooltip-element for="ws-value">
        <h4>Weapon Skill: {{characteristics.weaponSkill.total}}</h4>
        <div class="tooltip-breakdown">
            <div class="line">Base: {{characteristics.weaponSkill.base}}</div>
            <div class="line">Advances: {{characteristics.weaponSkill.advance}} × 5</div>
            {{#if characteristics.weaponSkill.modifier}}
            <div class="line modifier">Modifiers: {{numberFormat characteristics.weaponSkill.modifier sign=true}}</div>
            {{/if}}
        </div>
        <div class="tooltip-source">
            {{#each modifierSources.weaponSkill}}
            <div class="source">{{this.name}}: {{numberFormat this.value sign=true}}</div>
            {{/each}}
        </div>
    </tooltip-element>
</div>
```

**Benefits:**
- See breakdown of characteristic totals without opening sheets
- View all modifier sources at a glance
- Show skill governing characteristics and training bonuses
- Display weapon stats (damage, penetration, special qualities) on hover
- Show armor breakdown by location with hit roll bands

**Pitfalls:**
- Tooltip positioning on small screens - use V2's automatic positioning
- Too much information overwhelming users - progressive disclosure (basic hover, shift-hover for detailed)
- Performance with many tooltips - use lazy rendering

---

### 1.2 Collapsible Panel System with State Persistence

**Feature:** Expandable/collapsible sections using V2's built-in state management.

**Implementation:**
```javascript
// Already implemented via ApplicationV2Mixin
static DEFAULT_OPTIONS = {
    actions: {
        toggleCollapsed: BaseApplicationRT.#toggleCollapsed
    }
};

// Enhanced version with animations
#expandedSections = new Map();

static async #toggleCollapsed(event, target) {
    const section = target.closest(".collapsible-section");
    const id = section.dataset.sectionId;
    const content = section.querySelector(".section-content");

    const isExpanded = !section.classList.contains("collapsed");

    // Animate height change
    content.style.height = isExpanded ? `${content.scrollHeight}px` : "0px";
    section.classList.toggle("collapsed", isExpanded);

    // Store state
    this.expandedSections.set(id, !isExpanded);

    // Persist to user flags
    await game.user.setFlag("rogue-trader", `sheet.expanded.${id}`, !isExpanded);
}
```

**Benefits:**
- Reduce visual clutter on complex character sheets
- Focus on relevant sections (combat in battle, skills during exploration)
- Persist preferences across sessions
- Fast panel toggling without re-rendering entire sheet

**User Experience Enhancements:**
- Shift-click to collapse all except clicked section
- Double-click panel header to collapse all in that tab
- Keyboard shortcuts (Alt+1-9 for common panels)
- "Quick Setup" presets (Combat Mode, Social Mode, Exploration Mode)

**Pitfalls:**
- Scrollbar jumping when toggling - use smooth scroll to keep focused element in view
- State sync issues - always update expanded state before re-render
- Accessibility - ensure keyboard navigation and screen reader support

---

### 1.3 Inline Editing with Visual Feedback

**Feature:** Click-to-edit fields with immediate visual feedback using V2's form handling.

**Implementation:**
```javascript
// V2 automatic form submission on change
static DEFAULT_OPTIONS = {
    form: {
        submitOnChange: true,
        handler: CharacterSheet.#onFormSubmit
    }
};

static async #onFormSubmit(event, form, formData) {
    const expanded = foundry.utils.expandObject(formData.object);

    // Optimistic update - update UI immediately
    this._optimisticUpdate(expanded);

    // Then save to document
    await this.document.update(expanded);
}

_optimisticUpdate(changes) {
    // Flash changed field
    const changedFields = this._getChangedFields(changes);
    changedFields.forEach(field => {
        field.classList.add("flash-update");
        setTimeout(() => field.classList.remove("flash-update"), 500);
    });
}
```

**Enhanced Fields:**
- Characteristic advances with +/− buttons
- Wounds/Fatigue sliders with drag support
- Quick increment buttons (±1, ±5, ±10) for common stats
- Number fields with mousewheel support (scroll to adjust)

**Visual Feedback:**
- Green flash for increases, red for decreases
- Pulse animation on derived stat recalculation
- "Undo last change" button (keep 5 recent changes in memory)

**Pitfalls:**
- Race conditions with rapid changes - debounce updates (300ms)
- Conflicting updates from multiple users - use Foundry's document locking
- Validation errors - show inline, don't clear field (let user correct)

---

### 1.4 Drag-Drop Enhancements

**Feature:** Advanced drag-drop interactions with visual feedback.

**Implementation:**
```javascript
// Enhanced drag-drop mixin already in place
export default function DragDropMixin(Base) {
    return class extends Base {
        _onDragStart(event) {
            const dragData = this._getDragData(event);

            // Create ghost image with RT styling
            const ghost = this._createDragGhost(dragData);
            event.dataTransfer.setDragImage(ghost, 0, 0);

            // Add visual feedback
            event.currentTarget.classList.add("dragging");
            this.element.classList.add("drag-active");
        }

        _onDragOver(event) {
            // Show drop zones
            const dropZones = this._getValidDropZones(event.dataTransfer.types);
            dropZones.forEach(zone => zone.classList.add("drop-valid"));
        }
    };
}
```

**Enhancements:**
- **Item Reordering:** Drag items within lists to reorder
- **Quick Equip:** Drag from inventory to equipment slots (visual weapon/armor slots)
- **Item Splitting:** Ctrl+Drag to split item stacks (ammo, consumables)
- **Quick Compare:** Drag item over equipped item to see stat comparison tooltip
- **Favorites Bar:** Drag frequently used items to a quick-access bar
- **Origin Path Builder:** Drag origin path items to character creation panel to build lifepath

**Visual Feedback:**
- Animated drop zone highlights
- Invalid drop zones show red border
- Preview item stats on hover while dragging
- Snap-to-slot animation when dropping

**Pitfalls:**
- Touch screen support - implement touch events separately
- Drag performance with large inventories - use virtual scrolling
- Accidental drags - require 50px movement before activating drag

---

### 1.5 Context Menus for Quick Actions

**Feature:** Right-click menus for common actions using V2's context menu API.

**Implementation:**
```javascript
static DEFAULT_OPTIONS = {
    actions: {
        showContextMenu: CharacterSheet.#showContextMenu
    }
};

static #showContextMenu(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);

    const menu = [
        {
            name: "RT.ContextMenu.Edit",
            icon: "fas fa-edit",
            callback: () => item.sheet.render(true)
        },
        {
            name: "RT.ContextMenu.Duplicate",
            icon: "fas fa-copy",
            callback: () => item.clone({ name: `${item.name} (Copy)` }, { save: true })
        },
        {
            name: "RT.ContextMenu.Delete",
            icon: "fas fa-trash",
            callback: () => item.deleteDialog()
        },
        { separator: true },
        {
            name: item.system.equipped ? "RT.ContextMenu.Unequip" : "RT.ContextMenu.Equip",
            icon: item.system.equipped ? "fas fa-times-circle" : "fas fa-check-circle",
            callback: () => item.update({ "system.equipped": !item.system.equipped })
        }
    ];

    if (item.type === "weapon") {
        menu.push({
            name: "RT.ContextMenu.Attack",
            icon: "fas fa-crosshairs",
            callback: () => this.actor.rollWeaponAttack(item)
        });
    }

    ContextMenu.show(menu, { event, parent: this });
}
```

**Context Menus By Type:**

**Characteristics:**
- Roll Test
- Roll Test with Modifier...
- View Modifier Sources
- Spend XP to Advance

**Skills:**
- Roll Test
- Toggle Training (T/+10/+20)
- Add Specialization (for specialist skills)
- View Governing Characteristic

**Items (Weapons):**
- Attack (Standard/Semi-Auto/Full Auto)
- Reload
- Toggle Equipped
- View Qualities
- Edit / Delete

**Items (Armor):**
- Toggle Equipped
- View AP by Location
- Compare with Other Armor

**Fate Points:**
- Spend for Re-roll
- Spend for +10 Bonus
- Spend for +1 DoS
- Spend for Healing (1d5 wounds)
- Burn Fate Point (permanent uses)

**Pitfalls:**
- Menu positioning at screen edges - auto-flip direction
- Conflicting browser context menus - preventDefault consistently
- Touch/mobile - show on long-press (500ms)
- Too many options overwhelming - group related actions in submenus

---

## 🌟 Tier 2: Advanced Interactive Features (High Impact, Medium Complexity)

### 2.1 Real-Time Stat Calculator & "What-If" Mode

**Feature:** Preview stat changes before committing using V2's reactive context system.

**Implementation:**
```javascript
class WhatIfMode {
    constructor(sheet) {
        this.sheet = sheet;
        this.hypotheticalChanges = {};
        this.active = false;
    }

    activate() {
        this.active = true;
        this.sheet.element.classList.add("what-if-mode");
        this._createComparisonOverlay();
    }

    previewChange(path, value) {
        foundry.utils.setProperty(this.hypotheticalChanges, path, value);
        this._updatePreview();
    }

    _updatePreview() {
        // Create temporary actor clone with changes
        const previewData = foundry.utils.mergeObject(
            this.sheet.actor.toObject(),
            this.hypotheticalChanges,
            { inplace: false }
        );

        // Calculate derived stats
        const preview = new CONFIG.Actor.documentClass(previewData);
        preview.prepareData();

        // Show comparison
        this._showComparison(this.sheet.actor, preview);
    }

    _showComparison(current, preview) {
        // Highlight changed stats in green/red
        Object.entries(preview.system.characteristics).forEach(([key, char]) => {
            const currentVal = current.system.characteristics[key].total;
            const previewVal = char.total;

            if (currentVal !== previewVal) {
                const element = this.sheet.element.querySelector(`[data-characteristic="${key}"]`);
                element.classList.add("preview-change");
                element.dataset.previewValue = previewVal;
                element.dataset.difference = previewVal - currentVal;
            }
        });
    }
}

// Usage
static DEFAULT_OPTIONS = {
    actions: {
        enterWhatIf: CharacterSheet.#enterWhatIfMode,
        commitChanges: CharacterSheet.#commitWhatIfChanges,
        cancelWhatIf: CharacterSheet.#cancelWhatIfMode
    }
};
```

**Use Cases:**
- **XP Spending Preview:** "What if I advance Weapon Skill? How does it affect my combat stats?"
- **Equipment Comparison:** "What if I equip this armor instead? How does my protection change?"
- **Origin Path Planning:** "What if I choose Void Born? How does it affect my characteristics?"
- **Talent Preview:** "What if I take this talent? What bonuses do I get?"

**UI Elements:**
- Floating toolbar: "Preview Mode | Changes: 3 | Commit | Cancel"
- Changed stats show: `45 → 50 (+5)` in green
- Calculated impacts: "Your initiative increases by 1"
- Side-by-side comparison panel option

**Pitfalls:**
- Performance with complex calculations - cache preview actors
- User confusion about preview vs reality - VERY clear visual distinction
- Multiple preview layers - only allow one level of what-if
- Memory leaks from preview actors - proper cleanup on cancel

---

### 2.2 Combat Quick Panel (Floating HUD)

**Feature:** Draggable, minimizable combat panel using V2's positioning system.

**Implementation:**
```javascript
class CombatQuickPanel extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
        id: "combat-quick-panel-{id}",
        classes: ["rogue-trader", "combat-hud", "floating-panel"],
        window: {
            title: "RT.CombatPanel.Title",
            minimizable: true,
            resizable: false
        },
        position: {
            width: 320,
            height: "auto"
        },
        actions: {
            rollInitiative: CombatQuickPanel.#rollInitiative,
            standardAttack: CombatQuickPanel.#standardAttack,
            fullAutoAttack: CombatQuickPanel.#fullAutoAttack,
            dodge: CombatQuickPanel.#dodge,
            parry: CombatQuickPanel.#parry,
            reload: CombatQuickPanel.#reload
        }
    };

    static PARTS = {
        weapons: {
            template: "systems/rogue-trader/templates/hud/combat-weapons.hbs"
        },
        reactions: {
            template: "systems/rogue-trader/templates/hud/combat-reactions.hbs"
        },
        vitals: {
            template: "systems/rogue-trader/templates/hud/combat-vitals.hbs"
        }
    };
}
```

**Panel Contents:**
```
┌─────────────────────────────────┐
│ ⚔️ Combat Panel - [Character]  │
├─────────────────────────────────┤
│ Initiative: [Roll] [17]         │
│                                 │
│ HP: ████████░░ 16/20            │
│ Fatigue: ██░░░░░░░░ 2/10       │
│                                 │
│ 🎯 Primary Weapon              │
│ [Las Carbine] [Standard Attack]│
│ [Semi-Auto] [Full Auto]        │
│ Ammo: ████████░░ 16/20         │
│                                 │
│ 🛡️ Reactions (Available: 1)   │
│ [Dodge: 45] [Parry: 38]        │
│                                 │
│ ⚡ Quick Actions               │
│ [Reload] [Aim] [Draw Weapon]   │
└─────────────────────────────────┘
```

**Features:**
- Auto-show when combat starts
- One-click common actions (no dialogs for standard attacks)
- Live ammo tracking with reload button
- Reaction countdown (grayed out when used)
- Quick consumable use (stims, grenades)

**Advanced:**
- Floating position remembers location per user
- Minimizes to corner icon during non-combat
- Multiple panels for GMs (one per NPC)
- Opacity slider for see-through mode

**Pitfalls:**
- Blocking important UI elements - snap-to-grid positioning, avoid center screen
- Clutter with multiple tokens selected - show combined panel or switch on token select
- Touch devices - ensure draggable header is large enough
- Memory issues - destroy panel when combat ends, not just hide

---

### 2.3 Skill Test Quick-Roller with Difficulty Presets

**Feature:** Enhanced skill rolling interface with common difficulty presets.

**Implementation:**
```javascript
static PARTS = {
    skillTest: {
        template: "systems/rogue-trader/templates/dialog/skill-test-quick.hbs"
    }
};

async _prepareContext(options) {
    return {
        ...await super._prepareContext(options),
        skill: this.skill,
        target: this.skill.current, // Base target number
        difficulties: [
            { key: "trivial", label: "Trivial", modifier: 60, icon: "😊" },
            { key: "easy", label: "Easy", modifier: 30, icon: "🙂" },
            { key: "routine", label: "Routine", modifier: 20, icon: "😐" },
            { key: "ordinary", label: "Ordinary", modifier: 10, icon: "😕" },
            { key: "challenging", label: "Challenging", modifier: 0, icon: "😰", selected: true },
            { key: "difficult", label: "Difficult", modifier: -10, icon: "😨" },
            { key: "hard", label: "Hard", modifier: -20, icon: "😱" },
            { key: "veryHard", label: "Very Hard", modifier: -30, icon: "💀" }
        ],
        commonModifiers: [
            { label: "Good Tools", value: 10 },
            { label: "Poor Tools", value: -10 },
            { label: "Rushed", value: -10 },
            { label: "Extra Time", value: 10 },
            { label: "Assistance (+10/helper)", value: 10 }
        ],
        recentModifiers: this._getRecentModifiers()
    };
}
```

**UI Layout:**
```
┌──────────────────────────────────────────┐
│ Rolling: Acrobatics (Ag)                 │
├──────────────────────────────────────────┤
│ Base Target: 45                          │
│                                          │
│ Difficulty:                              │
│ [😊 +60] [🙂 +30] [😐 +20] [😕 +10]     │
│ [😰  ±0] [😨 -10] [😱 -20] [💀 -30]     │
│                                          │
│ Common Modifiers:                        │
│ [ ] Good Tools (+10)                     │
│ [ ] Poor Tools (-10)                     │
│ [ ] Rushed (-10)                         │
│                                          │
│ Custom Modifier: [___] (+/-)             │
│                                          │
│ ──────────────────────────────────────  │
│ Final Target: 45 + 0 - 10 = 35          │
│ ──────────────────────────────────────  │
│                                          │
│ [Roll] [Cancel]                          │
└──────────────────────────────────────────┘
```

**Features:**
- One-click difficulty selection
- Checkbox common modifiers (auto-apply)
- Live target number calculation
- Save custom modifier presets
- Recent rolls history ("Roll again like last time")

**Enhanced Roll Results:**
```
┌─────────────────────────────────────┐
│ Acrobatics Test: SUCCESS            │
│ Rolled: 27 vs Target: 35            │
│ Margin: 8 (0 DoS)                   │
│                                     │
│ [Re-roll with Fate] [+1 DoS (Fate)]│
└─────────────────────────────────────┘
```

**Pitfalls:**
- Too many clicks to roll - provide "use last settings" quick button
- Modifier overload - limit to 5 common modifiers, rest in dropdown
- Mobile layout - stack difficulty buttons vertically on small screens

---

### 2.4 Origin Path Visual Builder

**Feature:** Interactive character creation flowchart using V2's drag-drop and animations.

**Implementation:**
```javascript
static PARTS = {
    originPath: {
        template: "systems/rogue-trader/templates/actor/origin-path-builder.hbs",
        scrollable: [".path-canvas"]
    }
};
```

**Visual Layout:**
```
┌────────────────────────────────────────────────────────┐
│         Your Path Through the Imperium                 │
├────────────────────────────────────────────────────────┤
│                                                        │
│  [1: Home World]  →  [2: Birthright]  →  [3: Lure]   │
│   (Death World)       (Empty Slot)        (Empty)     │
│       +5 S                                            │
│       +5 T                                            │
│                                                        │
│         ↓                                             │
│                                                        │
│  [4: Trials]  →  [5: Motivation]  →  [6: Career]     │
│   (Empty)          (Empty)            (Empty)         │
│                                                        │
│                                                        │
│ Drag items from compendium to slots above             │
│ Current Bonuses: S+5, T+5, Ag-5, WP+3                │
└────────────────────────────────────────────────────────┘
```

**Features:**
- Drag origin path items to appropriate slots
- Visual flow showing dependencies
- Real-time characteristic preview
- Highlight compatible choices (valid progressions)
- Show all bonuses/abilities granted
- "Randomize Path" button for quick character gen
- Export/Import path as code (for sharing builds)

**Interactions:**
- Hover over empty slot to see what fits
- Click slot to open filtered compendium (only valid choices)
- Right-click filled slot to see details/remove
- "Lock" completed slots to prevent accidental changes

**Pitfalls:**
- Touch drag-drop on mobile - provide click-to-select fallback
- Complex validation rules - clearly show why choice is invalid
- Too much screen space - make collapsible/modal

---

### 2.5 Profit Factor & Acquisition Manager

**Feature:** Dedicated panel for dynasty economics with acquisition test automation.

**Implementation:**
```javascript
static PARTS = {
    profitFactor: {
        template: "systems/rogue-trader/templates/actor/profit-factor-panel.hbs"
    },
    acquisitions: {
        template: "systems/rogue-trader/templates/actor/acquisitions-panel.hbs"
    },
    endeavours: {
        template: "systems/rogue-trader/templates/actor/endeavours-panel.hbs"
    }
};

static DEFAULT_OPTIONS = {
    actions: {
        rollAcquisition: CharacterSheet.#rollAcquisition,
        addEndeavour: CharacterSheet.#addEndeavour,
        updateEndeavourProgress: CharacterSheet.#updateEndeavourProgress
    }
};

static async #rollAcquisition(event, target) {
    const itemData = await this._getItemFromDrag(event);

    // Show acquisition dialog
    const dialog = new AcquisitionDialog({
        profitFactor: this.actor.system.rogueTrader.profitFactor.current,
        item: itemData,
        modifiers: this._calculateAcquisitionModifiers(itemData)
    });

    const result = await dialog.wait();
    if (!result) return;

    // Roll d100 vs PF
    const roll = await new Roll("1d100").evaluate();
    const target = this.actor.system.rogueTrader.profitFactor.current + result.totalModifier;
    const success = roll.total <= target;
    const dos = Math.floor((target - roll.total) / 10);

    // Create chat message with result
    await this._createAcquisitionChatMessage({
        roll,
        target,
        success,
        dos,
        item: itemData,
        modifiers: result.modifiers
    });

    // On success, add item to inventory
    if (success) {
        await this.actor.createEmbeddedDocuments("Item", [itemData]);
    }

    // Update PF if critical failure
    if (dos <= -3) {
        await this._reduceProfitFactor(1);
    }
}
```

**Acquisition Dialog:**
```
┌─────────────────────────────────────────┐
│ Acquire: Las Carbine                    │
├─────────────────────────────────────────┤
│ Base Profit Factor: 45                  │
│                                         │
│ Availability: Common       (+20)        │
│ Craftsmanship: Common      (+0)         │
│ Scale: Single Item         (+0)         │
│                                         │
│ Additional Modifiers:                   │
│ [ ] Haggling Successful    (+10)        │
│ [ ] Rushed Purchase        (-10)        │
│ [ ] Known Supplier         (+5)         │
│                                         │
│ Custom: [____] (+/-)                    │
│                                         │
│ ───────────────────────────────────────│
│ Final Target: 45 + 20 = 65             │
│ ───────────────────────────────────────│
│                                         │
│ [Acquire] [Cancel]                      │
└─────────────────────────────────────────┘
```

**Endeavour Tracker:**
```
┌──────────────────────────────────────────────┐
│ Current Endeavour: Explore the Koronus      │
│ Progress: ████████░░░░░░ 8/15 AP           │
│ Reward: +2 Profit Factor                    │
│                                             │
│ [Add Achievement Points] [Complete]         │
│ [Abandon Endeavour]                         │
└──────────────────────────────────────────────┘
```

**Features:**
- Drag items from compendium to auto-fill acquisition form
- Auto-calculate availability modifiers from item data
- Track acquisition history (successful/failed)
- Profit Factor graph over time
- Misfortune log (what caused PF reductions)
- Endeavour progress bars with milestones

**Pitfalls:**
- Complexity of rules - provide tooltips for each modifier
- Item availability not in compendium data - allow manual entry with hints
- PF changes from multiple sources - clear audit log

---

## 🎨 Tier 3: Visual & UX Polish (Medium Impact, Medium Complexity)

### 3.1 Animated Stat Changes

**Feature:** Smooth animations for stat updates using CSS transitions and V2's render pipeline.

**Implementation:**
```javascript
_optimisticUpdate(changes) {
    Object.entries(changes).forEach(([path, value]) => {
        const element = this.element.querySelector(`[name="${path}"]`);
        if (!element) return;

        const oldValue = Number(element.value);
        const newValue = Number(value);

        if (oldValue === newValue) return;

        // Animate value change
        this._animateValueChange(element, oldValue, newValue);

        // Flash effect
        element.closest(".stat-value")?.classList.add(
            newValue > oldValue ? "stat-increase" : "stat-decrease"
        );
    });
}

_animateValueChange(element, from, to) {
    const duration = 500;
    const start = Date.now();

    const animate = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);

        // Ease-out animation
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(from + (to - from) * eased);

        element.value = current;
        element.closest(".stat-display").textContent = current;

        if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
}
```

**CSS:**
```css
.stat-increase {
    animation: pulse-green 0.5s ease-out;
}

.stat-decrease {
    animation: pulse-red 0.5s ease-out;
}

@keyframes pulse-green {
    0% { background-color: transparent; }
    50% { background-color: rgba(0, 255, 0, 0.3); box-shadow: 0 0 10px rgba(0, 255, 0, 0.5); }
    100% { background-color: transparent; }
}

.characteristic-bonus {
    transition: transform 0.3s ease-out;
}

.characteristic-bonus.changed {
    transform: scale(1.2);
    color: var(--rt-gold);
}
```

**Animated Elements:**
- Characteristic totals counting up/down
- Bonus values pulsing on change
- Wounds bar draining/filling
- XP spending with "leveling up" effect
- Skill training checkboxes checking with sound effect

**Pitfalls:**
- Animation overload - use sparingly, not for every change
- Performance on low-end devices - provide "reduced motion" setting
- Accessibility - respect `prefers-reduced-motion` media query

---

### 3.2 Progressive Disclosure & Adaptive UI

**Feature:** Show complexity gradually based on user expertise level.

**Implementation:**
```javascript
class AdaptiveUI {
    static EXPERTISE_LEVELS = {
        NOVICE: {
            showAdvanced: false,
            showModifierSources: false,
            autoExpandPanels: true,
            hints: true
        },
        INTERMEDIATE: {
            showAdvanced: true,
            showModifierSources: false,
            autoExpandPanels: false,
            hints: false
        },
        EXPERT: {
            showAdvanced: true,
            showModifierSources: true,
            autoExpandPanels: false,
            hints: false,
            keyboardShortcuts: true
        }
    };

    static getExpertiseLevel(user) {
        return user.getFlag("rogue-trader", "expertiseLevel") || "NOVICE";
    }

    static async setExpertiseLevel(user, level) {
        await user.setFlag("rogue-trader", "expertiseLevel", level);
    }
}

// In sheet rendering
async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const expertise = AdaptiveUI.getExpertiseLevel(game.user);
    const config = AdaptiveUI.EXPERTISE_LEVELS[expertise];

    context.showAdvanced = config.showAdvanced;
    context.showHints = config.hints;

    return context;
}
```

**Novice Mode:**
- Hide advanced fields (unnatural characteristics, modifier breakdown)
- Show inline help text and examples
- Auto-expand common panels
- Highlight "next step" in workflows
- Simplified skill test dialog (just difficulty, no custom modifiers)

**Intermediate Mode:**
- Show advanced fields
- Tooltips instead of inline help
- Manual panel control
- Full skill test dialog

**Expert Mode:**
- All fields visible
- Keyboard shortcuts enabled
- Quick-roll (skip dialogs for common actions)
- Developer tools (inspect actor data, export to JSON)
- Modifier source tracking

**Pitfalls:**
- Mode switching confusing - clear indicator of current mode
- Too much hidden in novice - ensure no features are unreachable
- Expertise creep - auto-suggest upgrade to intermediate after X sessions

---

### 3.3 Characteristic HUD Redesign

**Feature:** Visual, interactive characteristic display inspired by video game UIs.

**Concept:**
```
      ┌─────────────────────────────────────┐
      │    ⚔️  WEAPON SKILL                 │
      │                                     │
      │         ┌─────────┐                │
      │         │         │                │
      │         │   42    │  ← Total       │
      │         │         │                │
      │         └─────────┘                │
      │            ╱   ╲                   │
      │          ╱       ╲                 │
      │     Base: 35   Bonus: 4           │
      │     Adv: 1     Mod: +2            │
      │                                    │
      │  ████████████░░░░░░░░░░░          │
      │  Progress to next advance: 5/8 XP │
      │                                    │
      │  [Roll Test] [Spend XP]           │
      └─────────────────────────────────────┘
```

**Implementation:**
```javascript
static PARTS = {
    characteristicHUD: {
        template: "systems/rogue-trader/templates/actor/characteristic-hud.hbs"
    }
};

_prepareCharacteristicHUD(context) {
    context.characteristics = Object.entries(this.actor.system.characteristics).map(([key, data]) => {
        const xpCost = this._calculateCharacteristicXPCost(data.advance + 1);
        const xpSpent = this._getXPSpentOnCharacteristic(key);

        return {
            key,
            ...data,
            icon: CONFIG.rt.characteristicIcons[key],
            color: CONFIG.rt.characteristicColors[key],
            xpCost,
            xpProgress: xpSpent,
            xpProgressPercent: Math.min(100, (xpSpent / xpCost) * 100),
            canAdvance: this.actor.system.experience.available >= xpCost
        };
    });
}
```

**Features:**
- Circular progress bars around total value
- Color-coded by characteristic (WS = red, BS = orange, etc.)
- One-click roll from HUD
- XP progress bar showing advancement cost
- Modifier sources on expand
- Comparison mode (show vs another character/NPC)

**Pitfalls:**
- Visual clutter - provide compact/expanded view toggle
- Color blindness - use patterns in addition to colors
- Small screens - responsive layout (stack vertically on mobile)

---

### 3.4 Skill Training Visual Tracker

**Feature:** Visual skill tree showing training progression.

**Layout:**
```
Acrobatics (Ag)
┌──────────────────────────────────────┐
│ Untrained → Trained → +10 → +20      │
│    (⚫)  →   (🔵)  →  (🟡) → (🟢)   │
│    ½Ag       Ag       Ag+10  Ag+20   │
│                                      │
│ Current: Trained (45)                │
│ Next: +10 (55) - Cost: 100 XP       │
│                                      │
│ [Train to +10]                       │
└──────────────────────────────────────┘
```

**Features:**
- Visual progression path
- Inline XP costs
- One-click training purchase
- Filter by characteristic (show all Ag skills)
- Group by category (Combat, Social, Knowledge)
- Search/filter by name
- "Suggested Skills" based on career path

**Advanced:**
- Skill planner (plan XP spending across multiple skills)
- "Skills I can afford" highlight
- Skill synergy display (talents that improve this skill)

**Pitfalls:**
- Information density - use progressive disclosure (click to expand)
- Specialist skills complexity - separate panel for adding specializations
- Mobile layout - horizontal scroll for progression path

---

### 3.5 Hit Location Visual Overlay

**Feature:** Human silhouette with click-to-target hit locations.

**Implementation:**
```javascript
static PARTS = {
    hitLocation: {
        template: "systems/rogue-trader/templates/actor/hit-location-overlay.hbs"
    }
};

static DEFAULT_OPTIONS = {
    actions: {
        clickHitLocation: CharacterSheet.#clickHitLocation
    }
};

static async #clickHitLocation(event, target) {
    const location = target.dataset.location;
    const armor = this.actor.system.armour[location];

    // Roll to attack this location (reverse lookup ranges)
    const ranges = {
        head: [1, 10],
        rightArm: [11, 20],
        leftArm: [21, 30],
        body: [31, 70],
        rightLeg: [71, 85],
        leftLeg: [86, 100]
    };

    const [min, max] = ranges[location];
    const roll = await new Roll("1d100").evaluate();

    await ChatMessage.create({
        content: `Targeted ${location} - Rolled ${roll.total} (${min}-${max}): ${roll.total >= min && roll.total <= max ? "HIT" : "MISS"}`,
        speaker: ChatMessage.getSpeaker({ actor: this.actor })
    });
}
```

**Visual:**
```
       ╭───╮
       │ ● │ ← Head (01-10) AP: 4
       ╰───╯
    ╭────┬────╮
    │    │    │ ← Arms
    │ ●  │  ● │    L: 21-30, R: 11-20
    ╰────┴────╯    AP: 3
       │   │
       │ ● │ ← Body (31-70) AP: 6
       │   │
    ╭──┴───┴──╮
    │ ●     ● │ ← Legs
    │         │    L: 86-00, R: 71-85
    ╰─────────╯    AP: 4
```

**Features:**
- Hover shows AP, TB, and total protection
- Click to roll targeted attack
- Color-coded by armor level (red = low, green = high)
- Damage visualization (wounds shown as red overlay)
- Critical injuries marker on affected location

**Enhanced:**
- Drag damage token to location to apply
- Cybernetic augmentations shown on body part
- Armor pieces shown as overlay icons
- "Called Shot" difficulty calculator

**Pitfalls:**
- Touch accuracy on small screens - larger hitboxes than visual
- Artistic style clash - match Gothic 40K aesthetic
- Accessibility - ensure keyboard navigation, alt text

---

## 🔧 Tier 4: Advanced Workflow Automation (High Impact, High Complexity)

### 4.1 Smart Combat Automation

**Feature:** Automated combat flow using V2's action system and Foundry hooks.

**Workflow:**
```
1. [Click Attack Button]
   ↓
2. Auto-roll attack test
   ↓
3. On success: Auto-roll hit location
   ↓
4. Auto-roll damage
   ↓
5. Show "Apply Damage" dialog with:
   - Target selection
   - Hit location pre-selected
   - Armor/TB auto-calculated
   - Final damage shown
   ↓
6. One click applies damage to target
```

**Implementation:**
```javascript
class CombatAutomation {
    static async executeAttack(actor, weapon, target, options = {}) {
        // Step 1: Attack roll
        const attackRoll = await this._rollAttack(actor, weapon, options);
        if (!attackRoll.success) {
            return await this._createMissMessage(actor, weapon, attackRoll);
        }

        // Step 2: Hit location
        const hitLocation = options.called_shot
            ? options.target_location
            : await this._rollHitLocation();

        // Step 3: Damage roll
        const damageRoll = await this._rollDamage(weapon, attackRoll.dos);

        // Step 4: Calculate final damage
        const targetArmor = target.system.armour[hitLocation];
        const finalDamage = Math.max(0,
            damageRoll.total
            - targetArmor.total
            - target.system.characteristics.toughness.bonus
        );

        // Step 5: Show application dialog
        if (game.settings.get("rogue-trader", "autoApplyDamage")) {
            await this._applyDamage(target, finalDamage, hitLocation);
        } else {
            await this._showDamageDialog(target, finalDamage, hitLocation, {
                attackRoll,
                damageRoll,
                armor: targetArmor
            });
        }

        // Create comprehensive chat message
        await this._createAttackMessage({
            actor,
            weapon,
            target,
            attackRoll,
            hitLocation,
            damageRoll,
            finalDamage,
            armourReduction: targetArmor.total,
            tbReduction: target.system.characteristics.toughness.bonus
        });
    }
}
```

**Chat Message:**
```
┌────────────────────────────────────────┐
│ Quintus attacks Ork Nob with Bolter   │
├────────────────────────────────────────┤
│ Attack: 35 vs 45 ✓ Success (1 DoS)    │
│ Hit Location: Body (47)                │
│ Damage: 1d10+4 = 9 damage              │
│                                        │
│ Armor Reduction: -4 (Body AP)          │
│ Toughness: -4 (TB)                     │
│ ──────────────────────────────────────│
│ Final Damage: 1 wound                  │
│                                        │
│ [Apply to Ork Nob] [Modify]           │
└────────────────────────────────────────┘
```

**Settings:**
- Auto-apply damage (skip dialog)
- Auto-roll hit location
- Auto-roll damage
- Confirm before applying
- Chat message verbosity (brief/detailed)

**Pitfalls:**
- Edge cases in rules - provide manual override option
- GM vs Player permissions - respect token ownership
- Ammo tracking - auto-deduct ammo, warn when low
- Special weapon qualities - ensure Tearing, Accurate, etc. are applied

---

### 4.2 Conditional Formatting & Warnings

**Feature:** Visual indicators for important states using V2's reactive rendering.

**Implementation:**
```javascript
_prepareContext(options) {
    const context = await super._prepareContext(options);

    // Add warning flags
    context.warnings = this._calculateWarnings();

    return context;
}

_calculateWarnings() {
    const warnings = [];
    const system = this.actor.system;

    // Health warnings
    if (system.wounds.value <= 0) {
        warnings.push({
            type: "critical",
            category: "wounds",
            message: "Character is at 0 wounds! Roll on Critical Damage table.",
            icon: "fas fa-skull-crossbones"
        });
    } else if (system.wounds.value <= system.wounds.max * 0.25) {
        warnings.push({
            type: "warning",
            category: "wounds",
            message: "Character is lightly wounded (< 25% HP)",
            icon: "fas fa-heartbeat"
        });
    }

    // Fatigue warnings
    if (system.fatigue.value >= system.fatigue.max) {
        warnings.push({
            type: "critical",
            category: "fatigue",
            message: "Character is exhausted! -10 to all tests.",
            icon: "fas fa-tired"
        });
    }

    // Corruption/Insanity warnings
    if (system.corruption.points % 10 === 9) {
        warnings.push({
            type: "warning",
            category: "corruption",
            message: "One more corruption point triggers a malignancy!",
            icon: "fas fa-biohazard"
        });
    }

    // Ammo warnings
    this.actor.items.filter(i => i.type === "weapon" && i.system.equipped).forEach(weapon => {
        if (weapon.system.clip && weapon.system.clip.value === 0) {
            warnings.push({
                type: "warning",
                category: "ammo",
                message: `${weapon.name} is out of ammo!`,
                icon: "fas fa-battery-empty"
            });
        }
    });

    // XP milestone warnings
    if (system.experience.available >= 500) {
        warnings.push({
            type: "info",
            category: "xp",
            message: `${system.experience.available} XP available to spend!`,
            icon: "fas fa-star"
        });
    }

    return warnings;
}
```

**Visual Indicators:**
```css
.stat-critical {
    background: var(--rt-red);
    animation: pulse 1s infinite;
    border: 2px solid var(--rt-red-bright);
}

.stat-warning {
    background: var(--rt-yellow);
    border-left: 4px solid var(--rt-yellow-bright);
}

.stat-info {
    background: var(--rt-blue);
}

.warning-banner {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    gap: 1rem;
    padding: 0.5rem;
    background: rgba(255, 0, 0, 0.9);
    border-bottom: 2px solid var(--rt-gold);
}
```

**Warnings Display:**
- Sticky banner at top of sheet for critical warnings
- Badge count on tab headers (Combat tab shows "⚠️ 2")
- Color-coded stat backgrounds
- Tooltip details on hover
- "Dismiss" option for non-critical warnings

**Pitfalls:**
- Warning fatigue - don't show same warning repeatedly
- False positives - ensure rules are correctly implemented
- Performance - cache warning calculations, don't recalculate on every render

---

### 4.3 Quick Reference Sidebar

**Feature:** Context-sensitive help panel using V2's parts system.

**Implementation:**
```javascript
static PARTS = {
    sidebar: {
        template: "systems/rogue-trader/templates/actor/quick-reference.hbs"
    }
};

_prepareSidebarContext(context) {
    const activeTab = this.tabGroups.primary;

    // Show relevant help based on current tab
    const references = {
        combat: [
            {
                title: "Actions in Combat",
                content: `
                    <strong>Half Actions:</strong> Move, Standard Attack, Aim, Ready
                    <strong>Full Actions:</strong> Charge, All-Out Attack, Full Auto
                    <strong>Reactions:</strong> Dodge, Parry (1 per round)
                `
            },
            {
                title: "Degrees of Success",
                content: "Every 10 points under target = +1 DoS. Some weapons add DoS to damage."
            }
        ],
        skills: [
            {
                title: "Skill Training",
                content: `
                    <strong>Untrained:</strong> Roll at ½ characteristic
                    <strong>Trained:</strong> Roll at full characteristic
                    <strong>+10:</strong> Full +10 bonus
                    <strong>+20:</strong> Full +20 bonus
                `
            }
        ],
        dynasty: [
            {
                title: "Acquisition Tests",
                content: "Roll d100 vs (Profit Factor + Availability modifier). Success = acquire item."
            }
        ]
    };

    context.quickReference = references[activeTab] || [];

    return context;
}
```

**Sidebar Content:**
```
┌─────────────────────────┐
│ 📖 Quick Reference      │
├─────────────────────────┤
│ [Current Tab: Combat]   │
│                         │
│ ⚔️ Actions in Combat   │
│ • Half: Move, Attack    │
│ • Full: Charge, FA      │
│ • React: Dodge, Parry   │
│                         │
│ 🎯 Attack Modifiers    │
│ • Point Blank: +30      │
│ • Short: +10            │
│ • Long: -10             │
│ • Extreme: -30          │
│                         │
│ [Show All Rules]        │
│ [Collapse Sidebar]      │
└─────────────────────────┘
```

**Features:**
- Auto-collapse on small screens
- Searchable rules database
- Click to expand full rule text
- Bookmark frequently used rules
- Share rule to chat
- GM-only notes section

**Pitfalls:**
- Screen space on laptops - make resizable, collapsible
- Too much text - use progressive disclosure
- Outdated rules - version control with system updates

---

### 4.4 Macro Quick Bar Integration

**Feature:** Auto-generate macros for common actions using V2 action handlers.

**Implementation:**
```javascript
static DEFAULT_OPTIONS = {
    actions: {
        createMacro: CharacterSheet.#createMacro
    }
};

static async #createMacro(event, target) {
    const type = target.dataset.macroType;
    const itemId = target.dataset.itemId;

    let command, name, img;

    switch(type) {
        case "attack":
            const weapon = this.actor.items.get(itemId);
            command = `game.actors.get("${this.actor.id}").rollWeaponAttack("${itemId}")`;
            name = `Attack: ${weapon.name}`;
            img = weapon.img;
            break;

        case "skill":
            const skillKey = target.dataset.skillKey;
            command = `game.actors.get("${this.actor.id}").rollSkill("${skillKey}")`;
            name = `Test: ${target.dataset.skillName}`;
            img = "icons/skills/trades/academics-book-study-read.webp";
            break;

        case "characteristic":
            const charKey = target.dataset.charKey;
            command = `game.actors.get("${this.actor.id}").rollCharacteristic("${charKey}")`;
            name = `Test: ${target.dataset.charName}`;
            img = "icons/skills/trades/academics-study-runes.webp";
            break;
    }

    // Create macro
    const macro = await Macro.create({
        name,
        type: "script",
        img,
        command
    });

    // Notify user
    ui.notifications.info(`Created macro: ${name}`);

    return macro;
}
```

**Drag-to-Hotbar:**
- Drag weapons to hotbar → create attack macro
- Drag skills to hotbar → create skill test macro
- Drag characteristics to hotbar → create characteristic test macro
- Drag psychic powers to hotbar → create power manifestation macro

**Auto-Macro Panel:**
```
┌────────────────────────────────┐
│ 🎬 Quick Actions               │
├────────────────────────────────┤
│ [WS Test] [BS Test] [Dodge]    │
│ [Attack: Bolter] [Reload]      │
│ [Spend Fate] [Roll Initiative] │
│                                │
│ Drag any to hotbar to create   │
│ permanent macro                │
└────────────────────────────────┘
```

**Pitfalls:**
- Macro breaks if actor deleted - use UUID instead of ID
- Macro clutter - provide "Clear RT Macros" option
- Permissions - ensure players can only create for owned actors

---

### 4.5 Live Stat Synchronization (Multi-User)

**Feature:** Real-time updates when other users modify same actor.

**Implementation:**
```javascript
// Subscribe to actor updates
Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (this.actor.id !== actor.id) return;
    if (userId === game.userId) return; // Don't react to own changes

    // Show toast notification
    const user = game.users.get(userId);
    ui.notifications.info(`${user.name} updated ${actor.name}`);

    // Highlight changed fields
    this._highlightChanges(changes);

    // Auto-refresh after delay
    setTimeout(() => this.render(false), 1000);
});

_highlightChanges(changes) {
    const flattened = foundry.utils.flattenObject(changes);

    Object.keys(flattened).forEach(path => {
        const element = this.element.querySelector(`[name="system.${path}"]`);
        if (element) {
            element.classList.add("external-change");
            setTimeout(() => element.classList.remove("external-change"), 2000);
        }
    });
}
```

**CSS:**
```css
.external-change {
    animation: external-pulse 2s ease-out;
    border: 2px solid var(--rt-blue);
}

@keyframes external-pulse {
    0% { background: transparent; }
    25% { background: rgba(0, 150, 255, 0.3); }
    100% { background: transparent; }
}
```

**Features:**
- Toast notification showing who made changes
- Blue pulse on changed fields
- Option to auto-refresh or prompt user
- Conflict resolution (warn if both users editing same field)
- "Revert" button to undo external changes

**Pitfalls:**
- Change spam if multiple users - debounce notifications
- Unexpected refreshes losing form state - preserve unsaved changes
- Permissions - respect sheet locking

---

## 🎨 Tier 5: Immersive Theme Features (Medium Impact, Variable Complexity)

### 5.1 Gothic 40K Visual Theme

**Feature:** Immersive UI theming matching Warhammer 40K aesthetic.

**Design Elements:**
- **Typography:** Gothic-style headers, serif body text
- **Colors:** Dark metallics (bronze, iron, gold), deep reds, bone white
- **Textures:** Parchment backgrounds, metal panels, rivets
- **Icons:** Aquila (two-headed eagle), cog wheels, skulls, gothic arches
- **Borders:** Ornate frames, mechanicus patterns, scrollwork

**CSS Theme:**
```css
:root {
    /* Gothic 40K Color Palette */
    --rt-black: #0a0a0a;
    --rt-bone: #e8dcc8;
    --rt-parchment: #f4ead5;
    --rt-gold: #d4af37;
    --rt-bronze: #cd7f32;
    --rt-iron: #3e3e3e;
    --rt-red: #8b0000;
    --rt-red-bright: #dc143c;

    /* Gothic Fonts */
    --rt-font-header: "Caslon Antique", "Trajan Pro", serif;
    --rt-font-body: "Garamond", "Georgia", serif;
    --rt-font-numbers: "Cinzel", serif;
}

.rogue-trader.sheet {
    background:
        linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0.8)),
        url(/systems/rogue-trader/assets/parchment-texture.webp);
    border: 3px solid var(--rt-bronze);
    box-shadow:
        0 0 20px rgba(0, 0, 0, 0.9),
        inset 0 0 30px rgba(0, 0, 0, 0.5);
}

.rt-panel-header {
    background: linear-gradient(90deg, var(--rt-bronze), var(--rt-iron));
    border-top: 2px solid var(--rt-gold);
    border-bottom: 2px solid var(--rt-black);
    font-family: var(--rt-font-header);
    text-transform: uppercase;
    letter-spacing: 2px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
}

.rt-panel-header::before {
    content: "⚜";
    margin-right: 0.5rem;
    color: var(--rt-gold);
}

/* Gothic buttons */
.rt-button {
    background: var(--rt-iron);
    border: 2px solid var(--rt-bronze);
    color: var(--rt-bone);
    font-family: var(--rt-font-header);
    text-transform: uppercase;
    position: relative;
    overflow: hidden;
}

.rt-button::before {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(212,175,55,0.3), transparent);
    transition: left 0.5s;
}

.rt-button:hover::before {
    left: 100%;
}

/* Rivets on panels */
.rt-panel::after {
    content: "• •";
    position: absolute;
    top: 10px;
    right: 10px;
    color: var(--rt-iron);
    font-size: 8px;
    letter-spacing: 4px;
}
```

**Asset Requirements:**
- Parchment textures (aged paper, scrolls)
- Metal panel textures (brushed steel, bronze, riveted)
- Gothic ornaments (SVG decorations)
- Iconography (Aquila, Mechanicus cog, Inquisition symbol)
- Custom fonts (ensure licensing)

**Pitfalls:**
- Readability - ensure contrast ratios meet WCAG standards
- Performance - optimize texture file sizes, use CSS instead of images where possible
- Accessibility - provide high-contrast theme option
- Overdesign - balance theme with usability

---

### 5.2 Sound Effects & Audio Feedback

**Feature:** Audio cues for actions (with user setting to disable).

**Implementation:**
```javascript
class AudioFeedback {
    static SOUNDS = {
        rollDice: "systems/rogue-trader/sounds/dice-roll.ogg",
        success: "systems/rogue-trader/sounds/success.ogg",
        failure: "systems/rogue-trader/sounds/failure.ogg",
        criticalSuccess: "systems/rogue-trader/sounds/critical-success.ogg",
        weaponFire: "systems/rogue-trader/sounds/weapon-fire.ogg",
        reload: "systems/rogue-trader/sounds/reload.ogg",
        fateSpend: "systems/rogue-trader/sounds/fate-spend.ogg",
        woundTaken: "systems/rogue-trader/sounds/wound.ogg",
        levelUp: "systems/rogue-trader/sounds/level-up.ogg"
    };

    static async play(soundKey, volume = 1.0) {
        if (!game.settings.get("rogue-trader", "audioFeedback")) return;

        const src = this.SOUNDS[soundKey];
        if (!src) return;

        const userVolume = game.settings.get("rogue-trader", "audioVolume") / 100;

        await AudioHelper.play({
            src,
            volume: volume * userVolume,
            autoplay: true,
            loop: false
        }, false);
    }
}

// Usage in action handlers
static async #rollInitiative(event, target) {
    await AudioFeedback.play("rollDice");

    const roll = await new Roll("1d10 + @ab", this.actor.getRollData()).evaluate();

    if (roll.total >= 10) {
        await AudioFeedback.play("criticalSuccess");
    }

    // ... rest of logic
}
```

**Sound Triggers:**
- Dice rolling sound on any test
- Success/failure chimes
- Weapon sounds (bolter fire, chainsaw rev, energy weapon hum)
- Metallic click for checkboxes
- Coin jingle for Profit Factor changes
- Ominous chord for corruption/insanity gain
- Triumphant fanfare for XP milestone

**Settings:**
- Master enable/disable
- Volume slider
- Individual sound toggles
- Upload custom sounds

**Pitfalls:**
- Annoyance factor - default to OFF, let users opt in
- Copyright - use royalty-free sounds or create original
- File size - compress audio, use OGG/MP3
- Timing - ensure sounds don't overlap awkwardly

---

### 5.3 Animated Character Portrait

**Feature:** Dynamic portrait with state-based effects.

**Implementation:**
```javascript
_prepareContext(options) {
    const context = await super._prepareContext(options);

    // Portrait effects
    context.portraitEffects = [];

    if (this.actor.system.wounds.value <= 0) {
        context.portraitEffects.push("critically-wounded");
    } else if (this.actor.system.wounds.value <= this.actor.system.wounds.max * 0.25) {
        context.portraitEffects.push("wounded");
    }

    if (this.actor.system.fatigue.value >= this.actor.system.fatigue.max) {
        context.portraitEffects.push("exhausted");
    }

    if (this.actor.system.corruption.points >= 50) {
        context.portraitEffects.push("corrupted");
    }

    if (this.actor.statuses.has("burning")) {
        context.portraitEffects.push("burning");
    }

    return context;
}
```

**CSS Effects:**
```css
.portrait.critically-wounded {
    filter: grayscale(0.8) brightness(0.5);
    animation: portrait-pulse-red 2s infinite;
}

.portrait.wounded {
    filter: saturate(0.5);
    border: 3px solid var(--rt-red);
}

.portrait.exhausted {
    filter: brightness(0.7) contrast(0.8);
}

.portrait.corrupted {
    filter: hue-rotate(270deg) saturate(1.5);
    box-shadow: 0 0 20px rgba(139, 0, 0, 0.8);
}

.portrait.burning {
    animation: portrait-fire 0.5s infinite;
}

@keyframes portrait-pulse-red {
    0%, 100% { box-shadow: 0 0 10px rgba(139, 0, 0, 0.5); }
    50% { box-shadow: 0 0 30px rgba(220, 20, 60, 0.9); }
}

@keyframes portrait-fire {
    0%, 100% { filter: brightness(1) hue-rotate(0deg); }
    50% { filter: brightness(1.3) hue-rotate(20deg); }
}
```

**Advanced:**
- Particle effects overlay (flames, blood, corruption aura)
- Token sync (portrait matches token effects)
- Hover to see conditions tooltip
- Click portrait to open full-size viewer

**Pitfalls:**
- Performance - limit simultaneous animations
- Customization - allow users to disable effects
- Edge cases - handle missing portraits gracefully

---

### 5.4 Dynamic Background Themes

**Feature:** Background changes based on character state or location.

**Themes:**
- **Standard:** Parchment and metal (default)
- **Void Born:** Starfield and dark metal
- **Death World:** Jungle/harsh terrain textures
- **Navigator:** Warp-touched ethereal theme
- **Corrupted:** Dark, shifting chaos patterns (high corruption)
- **Psyker:** Mystical, psychic energy theme
- **Combat:** Red alert, battle-scarred theme

**Implementation:**
```javascript
_getSheetTheme() {
    const system = this.actor.system;

    // Corruption override
    if (system.corruption.points >= 70) {
        return "corrupted";
    }

    // Psyker theme
    if (system.psy?.rating > 0) {
        return "psyker";
    }

    // Origin-based theme
    const originPath = this.actor.items.find(i =>
        i.isOriginPath && i.flags?.rt?.step === "Home World"
    );

    if (originPath?.name.includes("Void Born")) {
        return "void-born";
    }

    if (originPath?.name.includes("Death World")) {
        return "death-world";
    }

    // Combat theme (in active combat)
    if (game.combat?.combatants.find(c => c.actor?.id === this.actor.id)) {
        return "combat";
    }

    return "standard";
}

_renderFrame(options) {
    const frame = super._renderFrame(options);
    const theme = this._getSheetTheme();
    frame.dataset.theme = theme;
    return frame;
}
```

**CSS:**
```css
.rogue-trader.sheet[data-theme="void-born"] {
    background-image: url(/systems/rogue-trader/assets/themes/starfield.webp);
}

.rogue-trader.sheet[data-theme="corrupted"] {
    background:
        linear-gradient(45deg, rgba(139,0,0,0.3) 0%, rgba(75,0,0,0.3) 100%),
        url(/systems/rogue-trader/assets/themes/chaos-texture.webp);
    animation: corruption-shift 10s infinite;
}

@keyframes corruption-shift {
    0%, 100% { filter: hue-rotate(0deg); }
    50% { filter: hue-rotate(20deg); }
}
```

**Pitfalls:**
- File size - use optimized images, lazy load
- Readability - ensure text contrast on all themes
- User preference - allow manual theme selection

---

## 🎯 Implementation Strategy & Pitfalls Summary

### Recommended Implementation Order

**Phase 1: Foundation (Weeks 1-2)**
1. Fix ApplicationV2 migration issues (see MIGRATION_REVIEW_REPORT.md)
2. Implement smart tooltips (1.1)
3. Improve collapsible panels (1.2)
4. Add inline editing feedback (1.3)

**Phase 2: Core Interactions (Weeks 3-4)**
5. Enhanced drag-drop (1.4)
6. Context menus (1.5)
7. Skill test quick-roller (2.3)

**Phase 3: Advanced Features (Weeks 5-6)**
8. Combat quick panel (2.2)
9. What-if mode (2.1)
10. Animated stat changes (3.1)

**Phase 4: Automation (Weeks 7-8)**
11. Combat automation (4.1)
12. Conditional warnings (4.2)
13. Macro integration (4.4)

**Phase 5: Polish (Weeks 9-10)**
14. Gothic theme (5.1)
15. Visual enhancements (3.3, 3.4, 3.5)
16. Audio feedback (5.2) - optional

**Phase 6: Specialized Features (Weeks 11-12)**
17. Origin path builder (2.4)
18. Profit factor manager (2.5)
19. Quick reference sidebar (4.3)
20. Advanced theme features (5.3, 5.4)

---

### Critical Pitfalls to Avoid

#### 1. Performance Pitfalls
- **Excessive Re-rendering:** Use V2's parts system to update only changed sections
- **Memory Leaks:** Properly destroy temporary actors, dialogs, and event listeners
- **Large Asset Files:** Optimize images (WebP), compress audio, lazy-load resources
- **Animation Overload:** Limit simultaneous animations, respect `prefers-reduced-motion`

#### 2. User Experience Pitfalls
- **Feature Overload:** Implement progressive disclosure (novice/expert modes)
- **Unintuitive Workflows:** User test with actual RT players
- **Lack of Feedback:** Always provide visual/audio confirmation of actions
- **Accessibility:** Keyboard navigation, screen reader support, color blind modes

#### 3. Technical Pitfalls
- **V1/V2 Mixing:** Complete V2 migration before adding features
- **Hardcoded Values:** Use CONFIG.rt for all game constants
- **Permission Bugs:** Always check `actor.isOwner`, `game.user.isGM`
- **Data Migration:** Version all data structures, provide migration paths

#### 4. Foundry Integration Pitfalls
- **Breaking Core Functions:** Don't override Foundry methods unnecessarily
- **Hook Abuse:** Limit hooks to essential updates, avoid hook loops
- **Module Conflicts:** Test with popular modules (PF2e Utils, Drag Ruler, etc.)
- **Version Compatibility:** Support current + previous Foundry version

#### 5. Rogue Trader Rules Pitfalls
- **Incorrect Calculations:** Verify all formulas against rulebooks
- **Edge Cases:** Handle unnatural characteristics, negative modifiers, etc.
- **Optional Rules:** Make house rules/variants toggleable in settings
- **Errata:** Track official errata, update calculations accordingly

---

### Testing Checklist

Before each feature release:

- [ ] Feature works on mobile/tablet (touch events)
- [ ] Feature works with keyboard only (accessibility)
- [ ] Feature works with reduced motion enabled
- [ ] Feature works with high contrast mode
- [ ] No console errors or warnings
- [ ] No memory leaks (test with Chrome DevTools)
- [ ] Localizable (all text uses i18n)
- [ ] Settings provide sensible defaults
- [ ] Works for players (not just GM)
- [ ] Works with locked/limited actors
- [ ] Migrates old data correctly
- [ ] Compatible with existing save files
- [ ] Doesn't conflict with popular modules
- [ ] Performance acceptable on low-end devices
- [ ] Follows RT rules accurately

---

## 🎬 Conclusion

These features transform the Rogue Trader character sheet from a static form into an immersive command console worthy of a Rogue Trader's flagship. By leveraging ApplicationV2's modern architecture, we can create a responsive, beautiful, and functionally superior experience.

**Key Principles:**
1. **Performance First:** Use V2's parts system for surgical updates
2. **User-Centric:** Design for actual play at the table, not showcases
3. **Progressive Enhancement:** Core functionality works, enhancements degrade gracefully
4. **Thematic Immersion:** Gothic 40K aesthetic without sacrificing usability
5. **Accessibility:** Ensure all players can use the system

The future of Rogue Trader VTT is bright. By the Emperor's will and the Machine God's blessing, these features will serve Rogue Traders across the void!

---

**Document Version:** 1.0
**Created:** 2026-01-06
**Next Review:** After Phase 1 completion
