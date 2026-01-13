# Biography Origin Panel - Layout Fix Applied

## Issue
The origin panel layout and styling was broken because the CSS was being scoped under `.rt-wrapper` instead of at root level.

## Root Cause
The biography origin panel SCSS was imported from `src/scss/actor/_index.scss`, which is imported inside the `.rt-wrapper` scope in `rogue-trader.scss`. ApplicationV2 sheets don't use the `.rt-wrapper` class, so the styles weren't applying.

## Fix Applied

### 1. Moved Import to Root Level
**File**: `src/scss/rogue-trader.scss`

**Before**:
```scss
.rt-wrapper {
    // ... other imports ...
    @import 'src/scss/actor/index';  // biography-origin-panel was in here
}
```

**After**:
```scss
// Biography origin panel - ApplicationV2 sheet (outside rt-wrapper)
@import 'src/scss/actor/biography-origin-panel';

.rt-wrapper {
    // ... other imports ...
    @import 'src/scss/actor/index';  // biography-origin-panel removed from here
}
```

### 2. Removed from Actor Index
**File**: `src/scss/actor/_index.scss`

Removed the import and added a comment explaining why:
```scss
// NOTE: biography-origin-panel imported at root level (outside rt-wrapper) for ApplicationV2
```

### 3. Recompiled and Deployed

```bash
npm run scss  # Compiled CSS successfully
```

**Verification**:
- ✅ CSS is now at root level (not scoped under `.rt-wrapper`)
- ✅ 22 references to new classes found in compiled CSS
- ✅ Template copied to Foundry directory
- ✅ Module/JavaScript copied to Foundry directory

## CSS Scope Comparison

### Before (Broken)
```css
.rt-wrapper .rt-origin-panel-modern .rt-panel-header {
    /* styles */
}
```

### After (Fixed)
```css
.rt-origin-panel-modern .rt-panel-header {
    /* styles */
}
```

## Files Modified

1. ✅ `src/scss/rogue-trader.scss` - Added import at root level
2. ✅ `src/scss/actor/_index.scss` - Removed import, added comment
3. ✅ **Recompiled**: `css/rogue-trader.css` (CSS now at root level)
4. ✅ **Copied**: `templates/actor/acolyte/tab-biography.hbs`
5. ✅ **Copied**: `module/` directory

## Why This Pattern?

Several other components use this pattern because they need to work in ApplicationV2 sheets which don't use `.rt-wrapper`:

- `src/scss/components/armour.scss` - Same pattern
- `src/scss/components/rt-tooltip.scss` - Same pattern (global component)
- `src/scss/panels/_biography.scss` - Biography styles (not under wrapper)

ApplicationV2 sheets have a different DOM structure than legacy V1 sheets, so global styles need to be at root level.

## Testing

The fix is now deployed. To test:

1. **Close Foundry VTT** (if open) to release file locks
2. **Restart Foundry VTT**
3. **Open a character sheet**
4. **Navigate to Biography tab**
5. **Verify**:
   - [ ] Origin panel displays correctly
   - [ ] Visual step indicators show
   - [ ] Circular nodes with icons/images
   - [ ] Connectors between steps
   - [ ] Progress badge visible
   - [ ] Selection cards display properly
   - [ ] Bonuses section collapses/expands
   - [ ] All styles applied correctly

## Status

✅ **FIXED** - CSS now compiled at root level, not scoped under `.rt-wrapper`

The origin panel should now display with the correct modern, sleek design!
