# Inline Editing with Visual Feedback - User Guide

**Feature Status:** ✅ Complete and Ready to Use  
**ApplicationV2 Showcase Feature #3**

---

## 🎯 Overview

The **Inline Editing with Visual Feedback** system provides immediate, animated visual responses when character stats are updated. This creates a more engaging and responsive user experience, making it clear when values change and helping users understand the impact of their actions.

### Key Features

- ✨ **Automatic Animation Detection** - Changes are automatically detected and animated
- 🎨 **Context-Aware Animations** - Different animations for increases, decreases, healing, damage
- 💚 **Green Flash for Increases** - Positive changes pulse green
- ❤️ **Red Flash for Decreases** - Negative changes pulse red
- ⚕️ **Special Healing Effect** - Wounds restored get a healing animation
- ⚔️ **Special Damage Effect** - Wounds lost get a damage animation
- 🌟 **Advancement Glow** - XP gains and characteristic advances get gold glow
- ♿ **Accessibility Support** - Respects `prefers-reduced-motion` setting

---

## 📋 Animation Types

### 1. Stat Increase (Green Flash)
**Trigger:** Any numeric value increases  
**Duration:** 0.6 seconds  
**Effect:** Green background flash with subtle scale-up

**Use Cases:**
- Characteristic advances
- Skill training increases
- Gaining XP
- Restoring fate points
- Increasing Profit Factor

### 2. Stat Decrease (Red Flash)
**Trigger:** Any numeric value decreases  
**Duration:** 0.6 seconds  
**Effect:** Red background flash with subtle scale-up

**Use Cases:**
- Spending XP
- Using fate points
- Losing Profit Factor
- Gaining corruption/insanity

### 3. Healing Effect (Green Glow)
**Trigger:** Wounds value increases  
**Duration:** 0.8 seconds  
**Effect:** Bright green glow with box-shadow

**Use Cases:**
- Natural healing
- Medicae treatment
- Fate point healing
- Regeneration

### 4. Damage Effect (Red Pulse)
**Trigger:** Wounds value decreases  
**Duration:** 0.8 seconds  
**Effect:** Dark red pulse with box-shadow and scale

**Use Cases:**
- Taking damage
- Critical damage
- Bleed effects

### 5. Advancement Glow (Gold Radiance)
**Trigger:** XP total increases or characteristic advances  
**Duration:** 1.0 seconds  
**Effect:** Golden radial gradient with glow

**Use Cases:**
- Gaining XP rewards
- Advancing characteristics
- Purchasing skills
- Level-up moments

### 6. Flash Update (Blue Pulse)
**Trigger:** Any non-numeric change  
**Duration:** 0.5 seconds  
**Effect:** Blue background flash

**Use Cases:**
- Text field changes
- Name updates
- Equipment toggles

---

## 🎬 How It Works

### Automatic Detection

The system automatically detects changes through the ApplicationV2 form submission pipeline:

1. User edits a field (characteristic, wounds, XP, etc.)
2. Form auto-submits on change (`submitOnChange: true`)
3. System captures old value before update
4. Document updates with new value
5. Visual feedback detects the difference
6. Appropriate animation triggers on the field

### Multi-User Support

When another user updates the same actor:
1. Foundry broadcasts the update via WebSocket
2. `updateActor` Hook fires in all connected clients
3. Visual feedback highlights the changed fields
4. Blue "external change" pulse indicates remote update

---

## 🔧 Technical Integration

### For Sheet Developers

The `VisualFeedbackMixin` is already integrated into `BaseActorSheet`, so all character sheets automatically get visual feedback support.

#### Mixin Chain
```javascript
BaseActorSheet extends 
  VisualFeedbackMixin(
    TooltipMixin(
      PrimarySheetMixin(
        ApplicationV2Mixin(ActorSheetV2)
      )
    )
  )
```

### Manual Animation Triggers

You can manually trigger animations from sheet action handlers:

```javascript
// In an action handler
static async #myAction(event, target) {
    await this.actor.update({ "system.wounds.value": newValue });
    
    // Manually trigger animation (if needed)
    this.animateStatChange("system.wounds.value", "heal");
}
```

#### Available Animation Types
- `"increase"` - Green flash
- `"decrease"` - Red flash  
- `"heal"` - Green glow (for wounds)
- `"damage"` - Red pulse (for wounds)
- `"flash"` - Blue pulse (default)

---

## 🎨 CSS Animation Classes

### Core Animation Classes

| Class | Effect | Duration |
|-------|--------|----------|
| `.stat-increase` | Green flash for increases | 0.6s |
| `.stat-decrease` | Red flash for decreases | 0.6s |
| `.stat-heal` | Green glow for healing | 0.8s |
| `.stat-damage` | Red pulse for damage | 0.8s |
| `.stat-advancement` | Gold radiance for XP/advances | 1.0s |
| `.flash-update` | Blue pulse for any change | 0.5s |
| `.pulse-gold` | Gold text shimmer | 0.8s |
| `.pulse-glow` | Gold box-shadow pulse | 0.8s |

### Supporting Classes

| Class | Effect |
|-------|--------|
| `.characteristic-bonus.changed` | Scale + gold pulse for characteristic bonuses |
| `.derived-stat-changed` | Glow effect for derived calculations |
| `.stat-critical-warning` | Infinite red pulse for critical states |
| `.value-counter` | Smooth number counter animation |

---

## 🎯 Usage Examples

### Example 1: Characteristic Advance
```javascript
// User increases Weapon Skill advance by 1
await this.actor.update({ 
    "system.characteristics.weaponSkill.advance": 2 
});

// Result: Green flash on WS field, gold pulse on WS bonus
```

### Example 2: Taking Damage
```javascript
// Character takes 5 damage
const currentWounds = this.actor.system.wounds.value;
await this.actor.update({ 
    "system.wounds.value": currentWounds - 5 
});

// Result: Red damage pulse on wounds tracker
```

### Example 3: Spending XP
```javascript
// Purchase a skill
await this.actor.update({ 
    "system.experience.spent": newSpent 
});

// Result: Red flash on XP spent, recalculates available with green flash
```

### Example 4: Multi-Field Update
```javascript
// Level up: advance characteristic and gain XP
await this.actor.update({
    "system.characteristics.strength.advance": 3,
    "system.experience.total": 5000
});

// Result: Gold advancement glow on both fields
```

---

## 🎨 Customization

### Adjusting Animation Timing

Edit `/src/scss/components/_stat-animations.scss`:

```scss
@keyframes stat-increase {
    0% { /* Start state */ }
    25% { /* Peak effect */ }
    100% { /* End state */ }
}
```

### Adding Custom Animations

```scss
@keyframes my-custom-animation {
    0% {
        background-color: transparent;
    }
    50% {
        background-color: rgba(255, 215, 0, 0.3); // Gold
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
    }
    100% {
        background-color: transparent;
        box-shadow: none;
    }
}

.my-custom-effect {
    animation: my-custom-animation 1s ease-out;
}
```

### Targeting Specific Fields

Add data attributes to your template:

```handlebars
<div class="stat-display" data-field="wounds-value" data-stat="wounds">
    {{system.wounds.value}} / {{system.wounds.max}}
</div>
```

The visual feedback system will automatically find and animate this field.

---

## ⚙️ Advanced Features

### 1. Number Counter Animation

Animate numbers counting up or down:

```javascript
const element = this.element.querySelector(".xp-display");
this._animateCounter(element, oldValue, newValue, 500);
```

### 2. Brief Notification Tooltip

Show a brief notification near a field:

```javascript
const button = event.currentTarget;
this._showBriefNotification(button, "Fate Point Spent!", "success");
```

Types: `"success"`, `"warning"`, `"error"`, `"info"`

### 3. Derived Stat Pulse

Trigger animations on calculated fields:

```javascript
// When characteristic changes, pulse the bonus
this._animateDerivedStat(".characteristic-bonus[data-char='weaponSkill']");
```

### 4. Batch Change Visualization

Process multiple changes at once:

```javascript
const changes = {
    "system.wounds.value": 15,
    "system.fatigue.value": 2,
    "system.fate.current": 3
};

// This will animate all three fields appropriately
this.visualizeChanges(changes);
```

---

## ♿ Accessibility

### Reduced Motion Support

The system automatically respects the user's motion preferences:

```css
@media (prefers-reduced-motion: reduce) {
    .stat-increase,
    .stat-decrease,
    /* ... all animations ... */ {
        animation: none !important;
        transition: none !important;
        transform: none !important;
    }
}
```

Users who enable "Reduce Motion" in their OS will see instant updates without animations.

### Alternative Feedback

For users with animations disabled, consider:
- Icon changes (✓ for success, ✗ for failure)
- Color-only indicators (no animation)
- Text-based feedback ("Updated successfully")

---

## 🐛 Troubleshooting

### Animation Not Triggering

**Problem:** Field updates but no animation plays  
**Solution:** Check that the field has a proper selector:
- Use `name` attribute matching the field path
- Add `data-field` attribute
- Add `data-stat` attribute
- Verify the element is rendered

### Animation Repeats Too Fast

**Problem:** Multiple animations stacking on rapid changes  
**Solution:** The system automatically removes old animations before applying new ones. If still an issue, add debouncing:

```javascript
// In your action handler
foundry.utils.debounce(() => {
    this.animateStatChange("system.wounds.value", "heal");
}, 300);
```

### Wrong Animation Type

**Problem:** Field shows increase animation when it should show decrease  
**Solution:** Verify the field contains a numeric value, not a string:

```javascript
// Bad: String comparison
const oldValue = "5";  
const newValue = "10";

// Good: Numeric comparison
const oldValue = 5;
const newValue = 10;
```

### Animations Lagging

**Problem:** Animations feel slow or janky  
**Solution:** 
- Ensure GPU acceleration: Use `transform` and `opacity` in CSS
- Avoid animating `width`, `height`, or `margin`
- Limit simultaneous animations to < 10

---

## 📊 Performance Considerations

### Optimized Animations

All animations use GPU-accelerated CSS properties:
- ✅ `transform` (scale, translate)
- ✅ `opacity`
- ✅ `box-shadow` (with caution)
- ✅ `background-color`

Avoid:
- ❌ `width` / `height`
- ❌ `margin` / `padding`
- ❌ `top` / `left` (use `transform` instead)

### Memory Management

The system automatically:
- Cleans up animation classes after completion
- Removes event listeners on sheet close
- Limits stored previous values to changed fields only

### Batch Updates

For multiple simultaneous changes, use a single `update()` call:

```javascript
// Good: Single update
await this.actor.update({
    "system.wounds.value": 15,
    "system.fatigue.value": 2,
    "system.fate.current": 3
});

// Bad: Multiple updates (causes multiple re-renders)
await this.actor.update({ "system.wounds.value": 15 });
await this.actor.update({ "system.fatigue.value": 2 });
await this.actor.update({ "system.fate.current": 3 });
```

---

## 🎬 Showcase Features

This system is part of the **ApplicationV2 Features Vision** roadmap:

✅ **Completed:**
1. Smart Contextual Tooltips
2. Enhanced Skill Test Quick-Roller
3. **Inline Editing with Visual Feedback** ← You are here

🔜 **Coming Next:**
- Collapsible Panels with State Persistence
- Context Menus for Quick Actions
- Combat Quick Panel (Floating HUD)

---

## 📚 Related Documentation

- **[APPLICATIONV2_FEATURES_VISION.md](APPLICATIONV2_FEATURES_VISION.md)** - Full feature roadmap
- **[APPLICATIONV2_PROGRESS.md](APPLICATIONV2_PROGRESS.md)** - Implementation status
- **[TOOLTIP_USAGE_EXAMPLE.md](TOOLTIP_USAGE_EXAMPLE.md)** - Tooltip system guide
- **[ENHANCED_SKILL_ROLLER_GUIDE.md](ENHANCED_SKILL_ROLLER_GUIDE.md)** - Skill roller guide

---

## 🎨 Visual Examples

### Wounds Healing
```
Before: ██████░░░░ 6/10
Action: Medicae test success, heal 1d5 = 3 wounds
After:  █████████░ 9/10 (bright green glow)
```

### Characteristic Advance
```
Before: WS 42 (Bonus: 4)
Action: Spend 500 XP to advance WS
After:  WS 47 (Bonus: 4) (gold radiance, bonus pulses gold)
```

### Taking Damage
```
Before: ████████░░ 16/20
Action: Ork hits for 12 damage, reduced to 8
After:  ████░░░░░░ 8/20 (red damage pulse)
```

---

**For the Emperor and smooth animations! ⚔️✨**

*Version: 1.0*  
*Created: 2026-01-07*  
*Part of the ApplicationV2 Enhancement Initiative*
