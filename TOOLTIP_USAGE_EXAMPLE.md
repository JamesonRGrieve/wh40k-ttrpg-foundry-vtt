# RT Tooltip System - Usage Examples

This document shows how to use the new Rich Tooltip system in your templates and sheets.

---

## Quick Start

### 1. Add TooltipMixin to Your Sheet

```javascript
import ApplicationV2Mixin from "../api/application-v2-mixin.mjs";
import PrimarySheetMixin from "../api/primary-sheet-mixin.mjs";
import TooltipMixin from "../api/tooltip-mixin.mjs";

export default class MySheet extends TooltipMixin(
    PrimarySheetMixin(ApplicationV2Mixin(ActorSheetV2))
) {
    // Your sheet code
}
```

The mixin will automatically initialize tooltips on render.

### 2. Use in Templates

Add `data-rt-tooltip` attribute to any element:

```handlebars
{{!-- Characteristic tooltip --}}
<div
    class="characteristic-value"
    data-rt-tooltip="characteristic"
    data-rt-tooltip-data='{{prepareCharacteristicTooltip "weaponSkill" characteristics.weaponSkill modifierSources}}'
>
    {{characteristics.weaponSkill.total}}
</div>

{{!-- Skill tooltip --}}
<div
    class="skill-value"
    data-rt-tooltip="skill"
    data-rt-tooltip-data='{{prepareSkillTooltip "acrobatics" skills.acrobatics characteristics}}'
>
    {{skills.acrobatics.current}}
</div>

{{!-- Armor tooltip --}}
<div
    class="armor-value"
    data-rt-tooltip="armor"
    data-rt-tooltip-data='{{prepareArmorTooltip "head" armour.head equippedArmor}}'
>
    AP {{armour.head.total}}
</div>
```

---

## Template Helper Functions

The TooltipMixin provides these helper functions for use in templates:

### `prepareCharacteristicTooltip(key, characteristic, modifierSources)`

Prepares tooltip data for a characteristic.

**Parameters:**
- `key` - Characteristic key (e.g., "weaponSkill")
- `characteristic` - The characteristic object
- `modifierSources` - Object containing modifier source arrays

**Example:**
```handlebars
<span
    data-rt-tooltip="characteristic"
    data-rt-tooltip-data='{{prepareCharacteristicTooltip "strength" characteristics.strength modifierSources}}'
>
    S {{characteristics.strength.total}}
</span>
```

**Tooltip Shows:**
```
┌─────────────────────────┐
│ Strength: 42            │
├─────────────────────────┤
│ Base:      35           │
│ Advances:  1 (×5 = +5)  │
│ Modifiers: +2           │
├─────────────────────────┤
│ Modifier Sources:       │
│ • Mono Sword: +2        │
├─────────────────────────┤
│ Bonus: 4                │
│ Click to roll test      │
└─────────────────────────┘
```

---

### `prepareSkillTooltip(key, skill, characteristics)`

Prepares tooltip data for a skill.

**Parameters:**
- `key` - Skill key (e.g., "acrobatics")
- `skill` - The skill object
- `characteristics` - Character characteristics object

**Example:**
```handlebars
<span
    data-rt-tooltip="skill"
    data-rt-tooltip-data='{{prepareSkillTooltip "dodge" skills.dodge characteristics}}'
>
    Dodge {{skills.dodge.current}}
</span>
```

**Tooltip Shows:**
```
┌─────────────────────────────┐
│ Dodge: 50                   │
├─────────────────────────────┤
│ Agility:  40                │
│ Training: +10               │
├─────────────────────────────┤
│ Training Progression:       │
│ Untrained → Trained → +10 → +20 │
│              (active)       │
├─────────────────────────────┤
│ Click to roll test          │
└─────────────────────────────┘
```

---

### `prepareArmorTooltip(location, armorData, equipped)`

Prepares tooltip data for armor at a specific location.

**Parameters:**
- `location` - Armor location key (e.g., "head", "body")
- `armorData` - Armor data object for this location
- `equipped` - Array of equipped armor items

**Example:**
```handlebars
<span
    data-rt-tooltip="armor"
    data-rt-tooltip-data='{{prepareArmorTooltip "body" armour.body equippedArmor}}'
>
    Body AP {{armour.body.total}}
</span>
```

**Tooltip Shows:**
```
┌─────────────────────────────┐
│ Body: AP 6                  │
├─────────────────────────────┤
│ Toughness Bonus: 4          │
│ Armor:           2          │
├─────────────────────────────┤
│ Equipped:                   │
│ [icon] Flak Armor +2        │
└─────────────────────────────┘
```

---

### `prepareWeaponTooltip(weapon)`

Prepares tooltip data for a weapon.

**Parameters:**
- `weapon` - The weapon item object

**Example:**
```handlebars
<span
    data-rt-tooltip="weapon"
    data-rt-tooltip-data='{{prepareWeaponTooltip this}}'
>
    {{name}}
</span>
```

**Tooltip Shows:**
```
┌─────────────────────────────┐
│ Bolt Pistol                 │
├─────────────────────────────┤
│ Damage:      1d10+4         │
│ Penetration: 4              │
│ Range:       30m            │
│ Rate of Fire: S/2/–         │
├─────────────────────────────┤
│ Qualities:                  │
│ Tearing  Reliable           │
├─────────────────────────────┤
│ Click to attack             │
└─────────────────────────────┘
```

---

### `prepareModifierTooltip(title, sources)`

Prepares tooltip data showing modifier sources.

**Parameters:**
- `title` - Tooltip title
- `sources` - Array of modifier source objects

**Example:**
```handlebars
<span
    data-rt-tooltip="modifier"
    data-rt-tooltip-data='{{prepareModifierTooltip "Initiative Modifiers" initiativeModifiers}}'
>
    Initiative: {{initiative.total}}
</span>
```

**Tooltip Shows:**
```
┌─────────────────────────────┐
│ Initiative Modifiers        │
├─────────────────────────────┤
│ • Quick Draw: +2            │
│ • Lightning Reflexes: +2    │
└─────────────────────────────┘
```

---

## Complete Integration Example

Here's a complete example showing how to integrate tooltips into a character sheet section:

### Sheet Class (base-actor-sheet.mjs)

```javascript
import ApplicationV2Mixin from "../api/application-v2-mixin.mjs";
import PrimarySheetMixin from "../api/primary-sheet-mixin.mjs";
import TooltipMixin from "../api/tooltip-mixin.mjs";

export default class BaseActorSheet extends TooltipMixin(
    PrimarySheetMixin(ApplicationV2Mixin(ActorSheetV2))
) {
    /** @inheritDoc */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Prepare modifier sources for tooltips
        context.modifierSources = this.actor.system.modifierSources || {};

        // Prepare equipped armor for armor tooltips
        context.equippedArmor = this.actor.items.filter(
            i => i.type === "armour" && i.system?.equipped
        );

        return context;
    }
}
```

### Template (characteristics-panel.hbs)

```handlebars
<div class="characteristics-grid">
    {{#each characteristics}}
    <div class="characteristic">
        <div class="characteristic-label">{{short}}</div>
        <div
            class="characteristic-value"
            data-rt-tooltip="characteristic"
            data-rt-tooltip-data='{{../prepareCharacteristicTooltip @key this ../modifierSources}}'
        >
            {{total}}
        </div>
        <div class="characteristic-bonus">{{bonus}}</div>
    </div>
    {{/each}}
</div>
```

---

## Styling Customization

Tooltips use CSS custom properties for theming:

```css
:root {
    --rt-bone: #e8dcc8;      /* Text color */
    --rt-gold: #d4af37;      /* Accent color */
    --rt-bronze: #cd7f32;    /* Border color */
    --rt-black: #0a0a0a;     /* Background color */
    --rt-font-header: "Caslon Antique", serif;
    --rt-font-body: "Garamond", serif;
}
```

### Custom Tooltip Styling

You can add custom styles for specific tooltip types:

```scss
.rt-tooltip--custom {
    .rt-tooltip__header {
        background: linear-gradient(135deg, rgba(100, 200, 100, 0.3) 0%, rgba(0, 100, 0, 0.3) 100%);
    }
}
```

---

## Advanced Usage

### Manual Tooltip Triggering

You can manually show/hide tooltips programmatically:

```javascript
import { RTTooltip } from "./components/rt-tooltip.mjs";

// Show tooltip
const element = document.querySelector(".my-element");
const event = new MouseEvent("mouseenter", {
    clientX: 100,
    clientY: 100
});
RTTooltip.show(element, event);

// Hide tooltip
RTTooltip.hide();
```

### Custom Tooltip Data

For complex cases, you can provide custom tooltip data directly:

```handlebars
<div
    data-rt-tooltip="custom"
    data-rt-tooltip-data='{"title": "Custom Info", "content": "<p>Custom HTML content here</p>"}'
>
    Hover me
</div>
```

---

## Performance Notes

1. **Initialization:** Tooltips are initialized once per render
2. **Show Delay:** 500ms delay before tooltip shows (configurable via `RTTooltip.showDelay`)
3. **Cleanup:** Tooltips are automatically cleaned up when hidden
4. **Re-renders:** Tooltip listeners are re-attached on each render

To change the show delay:

```javascript
import { RTTooltip } from "./components/rt-tooltip.mjs";

RTTooltip.showDelay = 300; // Show after 300ms
```

---

## Troubleshooting

### Tooltip Not Showing

**Check:**
1. Element has `data-rt-tooltip` attribute
2. TooltipMixin is applied to your sheet
3. Tooltip data is valid JSON
4. Element is visible and not disabled

### Tooltip Positioning Issues

**Fix:**
```javascript
RTTooltip.offset = { x: 20, y: 20 }; // Increase offset from cursor
```

### Tooltip Content Not Updating

**Solution:**
The sheet must re-render for tooltip data to update. Call `this.render()` after data changes.

---

## Future Enhancements

Planned features (not yet implemented):

- [ ] **Click-to-Pin** - Click tooltip to pin it open
- [ ] **Tooltip Themes** - Light/dark theme toggle
- [ ] **Animation Options** - Fade, slide, scale animations
- [ ] **Touch Support** - Long-press on mobile to show tooltip
- [ ] **Tooltip Groups** - Shared tooltips for related elements
- [ ] **Rich Media** - Images, videos in tooltips
- [ ] **Interactive Tooltips** - Buttons and forms inside tooltips

---

**May the Omnissiah bless your tooltips! ⚙️**
