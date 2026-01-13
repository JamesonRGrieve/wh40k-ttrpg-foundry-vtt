# Origin Path Builder - Fixes Complete (2026-01-13)

## Issues Resolved

### 1. Choice Dialog - View Item Button
**Problem**: Choice cards in the origin-path-choice-dialog didn't show UUIDs for items granted through choices, so the "View Item" button wasn't appearing.

**Solution**: Enhanced `origin-path-choice-dialog.mjs` `_prepareContext()` method to extract UUIDs from `option.grants` structure:
- Checks `grants.talents[0].uuid`
- Checks `grants.skills[0].uuid`
- Checks `grants.traits[0].uuid`
- Checks `grants.equipment[0].uuid`

**Files Modified**:
- `src/module/applications/character-creation/origin-path-choice-dialog.mjs` (lines 115-129)

### 2. Step Navigation - Reduced Height
**Problem**: Step navigation bar was too tall and occupied excessive vertical space.

**Solution**: Made step navigation more compact:
- Reduced padding: `var(--rt-space-md)` → `var(--rt-space-sm)` vertical
- Reduced gap between items: `var(--rt-space-xs)` → `4px`
- Reduced step-nav-item padding: `var(--rt-space-sm) var(--rt-space-md)` → `var(--rt-space-xs) var(--rt-space-sm)`
- Reduced step-nav-item min-width: `100px` → `80px`
- Reduced step number size: `48px` → `40px`
- Reduced step number border: `3px` → `2px`
- Reduced step number font: `0.9rem` → `0.85rem`
- Reduced step label font: `0.7rem` → `0.65rem`
- Reduced active scale: `1.1` → `1.05`
- Reduced pulse-glow shadow: `12px/20px` → `10px/16px`
- Reduced checkmark font in complete state: `1rem` → `0.9rem`

**Files Modified**:
- `src/scss/components/_origin-path-builder.scss` (lines 152-318)

### 3. Preview Panel - Layout Fix
**Problem**: Preview panel had broken layout - content displayed in rows instead of columns, didn't span full width, and had wrong height.

**Root Cause**: Grid template only had 4 rows defined but 5 rows existed in template (toolbar, step-navigation, builder-main, preview-panel, builder-footer).

**Solution**:
1. Fixed grid template: `grid-template-rows: auto auto 1fr auto;` → `auto auto 1fr auto auto;`
2. Removed incorrect `grid-column: 1 / -1;` rule (not needed in row-based grid)
3. Removed constraining `max-width: 600px` and centering `margin: 0 auto`
4. Changed preview-grid from flex column to CSS grid: `display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));`
5. Reduced max-height for category-items: `150px` → `120px`

**Files Modified**:
- `src/scss/components/_origin-path-builder.scss` (lines 21-25, 1131-1178)

## Testing Checklist

- [ ] Open Origin Path Builder
- [ ] Verify step navigation is more compact (less vertical space)
- [ ] Select an origin that has choices
- [ ] Open choice dialog
- [ ] Verify "View Item" button appears on choice cards that grant talents/skills/traits
- [ ] Click "View Item" button and verify item sheet opens
- [ ] Verify preview panel at bottom displays in grid columns (not rows)
- [ ] Verify preview panel spans full width
- [ ] Verify preview panel height is appropriate

## Technical Details

### Choice Option Structure

Origin path choices have this structure:
```javascript
{
  type: "talent",
  label: "Choose a Talent",
  options: [
    {
      value: "option1",
      label: "Awareness +10",
      description: "Gain +10 to Awareness",
      grants: {
        talents: [{ name: "Awareness", uuid: "Compendium.rt-items-skills.xxx" }],
        skills: [],
        traits: [],
        equipment: []
      }
    }
  ],
  count: 1
}
```

The UUID extraction prioritizes in order: talents, skills, traits, equipment.

### Grid Layout

The complete grid structure is:
1. **Row 1 (auto)**: toolbar - header with controls
2. **Row 2 (auto)**: step-navigation - compact step progress
3. **Row 3 (1fr)**: builder-main - main content area (2-column grid)
4. **Row 4 (auto)**: preview-panel - total bonuses preview (full width)
5. **Row 5 (auto)**: builder-footer - status and commit button

## Files Changed

1. `src/module/applications/character-creation/origin-path-choice-dialog.mjs`
2. `src/scss/components/_origin-path-builder.scss`

## No Breaking Changes

All changes are visual/UX improvements. No API changes, no data model changes, no breaking changes to existing functionality.
