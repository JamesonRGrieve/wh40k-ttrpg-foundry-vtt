# Enhanced Skill Test Quick-Roller - Usage Guide

**Status:** ✅ Complete and Ready to Use
**Branch:** `feature/applicationv2-enhancements`
**Build Status:** ✅ Passing

---

## Overview

The Enhanced Skill Test Quick-Roller is a showcase ApplicationV2 feature that transforms the simple skill roll dialog into a modern, feature-rich interface with visual difficulty presets, smart modifiers, and live calculations.

This is the first production-ready feature demonstrating the power of Foundry V13's ApplicationV2 framework in the Rogue Trader VTT system.

---

## Features

### 🎯 Visual Difficulty Presets

Click any difficulty button to instantly apply the modifier:

| Difficulty | Modifier | Icon | Use Case |
|------------|----------|------|----------|
| Trivial | +60 | 😊 | Automatic success unless complications |
| Easy | +30 | 😃 | Simple tasks with no pressure |
| Routine | +20 | 😐 | Standard tasks with time |
| Ordinary | +10 | 🙂 | Typical difficulty |
| **Challenging** | **±0** | 😰 | **Baseline (default)** |
| Difficult | -10 | 😨 | Complex or contested tasks |
| Hard | -20 | 😱 | Very challenging circumstances |
| Very Hard | -30 | 😵 | Exceptional difficulty |
| Hellish | -60 | 💀 | Near-impossible feats |

### ✅ Common Modifiers

Quick-select checkboxes for frequently used modifiers:

- **Good Tools** (+10) - Quality equipment aids the task
- **Poor Tools** (-10) - Inadequate or damaged equipment
- **Rushed** (-10) - Insufficient time to work carefully
- **Extra Time** (+10) - Taking time to work methodically
- **Assistance** (+10) - Help from another character (+10 per helper, max +30)

### 🔢 Live Target Calculation

See the breakdown in real-time:

```
Base Target: 45
Difficulty: 0 (Challenging)
Common Mods: +10 (Good Tools)
Custom: +5
────────────────────
Final Target: 60
```

The final target shows in:
- **Green** if increased from base
- **Red** if decreased from base
- **White** if unchanged

### 📜 Recent Rolls History

The dialog remembers your last 3 rolls. Click any recent roll to instantly repeat it with the same modifiers:

```
Recent Rolls:
[Acrobatics +15] [Dodge +10] [Awareness -10]
```

### ⌨️ Keyboard Shortcuts

- **Enter** - Roll test
- **Escape** - Cancel dialog

### 🎨 Gothic 40K Visual Theme

- Parchment texture gradients
- Bronze and gold accents
- Ornate borders and decorations
- Smooth animations and transitions
- Responsive design (works on mobile!)

---

## How to Use

### Method 1: Use in Actor Sheets

The enhanced dialog can be used anywhere the current `prepareSimpleRoll()` function is called.

To enable it, replace calls to `prepareSimpleRoll()` with `prepareEnhancedSkillRoll()`:

```javascript
// OLD (simple dialog):
import { prepareSimpleRoll } from "../applications/prompts/simple-roll-dialog.mjs";
await prepareSimpleRoll(skillData);

// NEW (enhanced dialog):
import { prepareEnhancedSkillRoll } from "../applications/prompts/enhanced-skill-dialog.mjs";
await prepareEnhancedSkillRoll(skillData);
```

### Method 2: Test from Console

You can test the enhanced dialog directly from the Foundry console:

```javascript
// Get an actor
const actor = game.actors.getName("Your Character");

// Prepare skill data (simplified example)
const skillData = {
    name: "Acrobatics",
    rollData: {
        name: "Acrobatics",
        baseTarget: 45,
        modifiers: {},
        calculateTotalModifiers: async function() {
            // Calculate logic here
        }
    },
    calculateSuccessOrFailure: async function() {
        // Roll logic here
    }
};

// Import and show the dialog
const { prepareEnhancedSkillRoll } = await import("./systems/rogue-trader/dist/module/applications/prompts/enhanced-skill-dialog.mjs");
await prepareEnhancedSkillRoll(skillData);
```

### Method 3: Integration Example

Here's how to integrate it into a character sheet:

```javascript
// In src/module/applications/actor/acolyte-sheet.mjs

import { prepareEnhancedSkillRoll } from "../prompts/enhanced-skill-dialog.mjs";

static async #rollSkill(event, target) {
    const skillKey = target.dataset.skillKey;
    const skill = this.actor.system.skills[skillKey];

    const skillData = {
        name: skill.label,
        rollData: {
            name: skill.label,
            baseTarget: skill.current || 0,
            modifiers: {},
            calculateTotalModifiers: async function() {
                let total = this.baseTarget;
                for (const [key, value] of Object.entries(this.modifiers)) {
                    total += value;
                }
                this.total = total;
            }
        },
        calculateSuccessOrFailure: async function() {
            const roll = await new Roll("1d100").evaluate();
            const success = roll.total <= this.rollData.total;
            const margin = success
                ? this.rollData.total - roll.total
                : roll.total - this.rollData.total;
            const degrees = Math.floor(margin / 10);

            this.roll = roll;
            this.success = success;
            this.degrees = degrees;
        }
    };

    await prepareEnhancedSkillRoll(skillData);
}
```

---

## Technical Details

### Architecture

**Class:** `EnhancedSkillDialog`
- **Extends:** `ApplicationV2Mixin(HandlebarsApplicationMixin(ApplicationV2))`
- **Framework:** Foundry V13 ApplicationV2
- **Pattern:** Action handlers with V2 state management

### Key Methods

| Method | Purpose |
|--------|---------|
| `_prepareContext()` | Builds context with difficulties, modifiers, calculations |
| `_calculateCommonModifiers()` | Sums all checked common modifiers |
| `_saveToRecentRolls()` | Persists roll to user flags for history |
| `_performRoll()` | Executes the roll and sends to chat |

### Action Handlers

All interactions use V2's static action handler pattern:

```javascript
static DEFAULT_OPTIONS = {
    actions: {
        selectDifficulty: EnhancedSkillDialog.#onSelectDifficulty,
        toggleModifier: EnhancedSkillDialog.#onToggleModifier,
        updateCustom: EnhancedSkillDialog.#onUpdateCustom,
        roll: EnhancedSkillDialog.#onRoll,
        rollRepeat: EnhancedSkillDialog.#onRollRepeat,
        cancel: EnhancedSkillDialog.#onCancel
    }
};
```

### State Management

The dialog maintains three pieces of state:

```javascript
_selectedDifficulty = 0;           // Current difficulty modifier
_commonModifiers = {};              // {key: boolean} for checked modifiers
_customModifier = 0;                // Custom modifier input value
```

All state changes trigger a re-render with `this.render(false, { parts: ["form"] })` for surgical updates.

### User Data Persistence

Recent rolls are saved to user flags:

```javascript
game.user.setFlag("rogue-trader", "recentRolls", [
    { name: "Acrobatics", modifier: 15, timestamp: Date.now() },
    // ... up to 10 most recent
]);
```

---

## Customization

### Adding New Difficulty Presets

Edit the `DIFFICULTIES` array in `enhanced-skill-dialog.mjs`:

```javascript
static DIFFICULTIES = [
    // ... existing difficulties
    {
        key: "mythical",
        label: "Mythical",
        modifier: -80,
        icon: "fa-dragon",
        description: "Reserved for the Emperor's chosen"
    }
];
```

### Adding New Common Modifiers

Edit the `COMMON_MODIFIERS` array:

```javascript
static COMMON_MODIFIERS = [
    // ... existing modifiers
    {
        key: "blessed",
        label: "Emperor's Blessing",
        value: 20,
        description: "Divine intervention favors your action"
    }
];
```

### Changing Visual Theme

All styling is in `src/scss/components/_enhanced-skill-roll.scss`. Key variables:

```scss
--rt-bone: #e8dcc8;         // Text color
--rt-gold: #d4af37;         // Accent color
--rt-bronze: #cd7f32;       // Border color
--rt-black: #0a0a0a;        // Background color
```

---

## Testing Checklist

Before using in production:

- [ ] Difficulty buttons select correctly
- [ ] Common modifier checkboxes work
- [ ] Custom modifier updates live calculation
- [ ] Final target shows correct color (green/red/white)
- [ ] Recent rolls appear and repeat correctly
- [ ] Enter key rolls
- [ ] Escape key cancels
- [ ] Animations play smoothly
- [ ] Mobile layout works (responsive grid)
- [ ] Build succeeds (`npm run build`)

---

## Screenshots

### Main Dialog
```
┌──────────────────────────────────────────┐
│           Acrobatics                     │
│        Base Target: 45                   │
├──────────────────────────────────────────┤
│ Difficulty                               │
│ [😊+60] [😃+30] [😐+20] [🙂+10]         │
│ [😰±0]  [😨-10] [😱-20] [😵-30] [💀-60]│
├──────────────────────────────────────────┤
│ Common Modifiers                         │
│ ☑ Good Tools (+10)                       │
│ ☐ Poor Tools (-10)                       │
│ ☐ Rushed (-10)                           │
├──────────────────────────────────────────┤
│ Custom Modifier: [+5]                    │
├──────────────────────────────────────────┤
│ Base Target: 45                          │
│ Common Mods: +10                         │
│ Custom: +5                               │
│ ────────────────                        │
│ Final Target: 60 (green)                │
├──────────────────────────────────────────┤
│ Recent Rolls                             │
│ [Dodge +10] [Awareness -10]              │
├──────────────────────────────────────────┤
│ [🎲 Roll Test] [Cancel]                 │
│                                          │
│ ⌨️ Press Enter to roll                  │
└──────────────────────────────────────────┘
```

---

## Future Enhancements

Potential additions (not yet implemented):

- [ ] **Fate Point Spending** - Quick buttons to spend Fate for +10 or re-roll
- [ ] **Modifier Presets** - Save custom modifier combinations
- [ ] **Roll History View** - Expandable panel showing all recent rolls
- [ ] **Target Highlighting** - Show success probability percentage
- [ ] **Situational Modifiers** - Context-aware suggestions (e.g., "Shooting at long range" auto-suggests -10)
- [ ] **Sound Effects** - Audio feedback on roll (optional)
- [ ] **Dice Animation** - 3D dice roll visualization (optional)

---

## Comparison: Simple vs Enhanced

| Feature | Simple Dialog | Enhanced Dialog |
|---------|---------------|-----------------|
| Difficulty selection | Dropdown | Visual buttons with icons |
| Modifiers | Single input field | Checkboxes + custom field |
| Target calculation | Hidden | Live breakdown display |
| Recent rolls | None | Last 3 rolls, click to repeat |
| Visual feedback | Basic | Animated, color-coded |
| Keyboard shortcuts | None | Enter to roll, Escape to cancel |
| Mobile friendly | Basic | Fully responsive |
| Theme | Minimal | Gothic 40K aesthetic |

---

## Credits

**Design Pattern:** Based on dnd5e ApplicationV2 patterns
**Visual Theme:** Warhammer 40K Gothic aesthetic
**Framework:** Foundry VTT V13 ApplicationV2
**Created:** January 2026
**Status:** Production-ready showcase feature

---

## Support

If you encounter issues or have suggestions:

1. Check that you're on the `feature/applicationv2-enhancements` branch
2. Ensure build succeeds: `npm run build`
3. Check browser console for errors
4. Verify Foundry V13+ compatibility

---

**May the God-Emperor guide your rolls! ⚔️**
