# Origin Path Builder - CRITICAL Styling Fix

**Date**: January 12, 2026  
**Status**: ✅ FIXED - Root Cause Identified

---

## THE PROBLEM

The Origin Path Builder rendered but had **NO STYLING AT ALL** - completely unstyled.

---

## ROOT CAUSE ANALYSIS

### The Issue

The `origin-path-builder` SCSS was imported **INSIDE** the `.rt-wrapper` block in `rogue-trader.scss`:

```scss
.rt-wrapper {
    // ... other imports
    @import 'src/scss/components/origin-path-builder';  // ❌ WRONG LOCATION
}
```

This caused all styles to be scoped as:
```css
.rt-wrapper .origin-path-builder { /* styles */ }
.rt-wrapper .builder-toolbar { /* styles */ }
.rt-wrapper .path-canvas { /* styles */ }
```

### Why This Broke Everything

**ApplicationV2 windows render at ROOT level**, not inside `.rt-wrapper`:

```html
<body>
    <div id="ui-middle">
        <div class="rt-wrapper">
            <!-- Actor sheets here -->
        </div>
    </div>
    
    <!-- ApplicationV2 windows render HERE at root level! -->
    <div class="application origin-path-builder">
        <!-- Origin Path Builder content -->
    </div>
</body>
```

**Result**: CSS selectors like `.rt-wrapper .origin-path-builder` never matched because the dialog isn't inside `.rt-wrapper`.

---

## THE FIX

### Move Import Outside Wrapper

**File**: `src/scss/rogue-trader.scss`

**Before** (Line 81, inside `.rt-wrapper`):
```scss
.rt-wrapper {
    // ... imports
    @import 'src/scss/components/origin-path-builder';  // ❌ Inside wrapper
}
```

**After** (Line 24, outside wrapper):
```scss
// Modern RT Styles (standalone, not nested)
@import 'src/scss/components/origin-path-builder';  // ✅ At root level
@import 'journals';

// ... rest of file

.rt-wrapper {
    // ... imports (no origin-path-builder here)
}
```

### Now Styles Compile As:

```css
.origin-path-builder { /* styles */ }
.origin-path-builder .builder-toolbar { /* styles */ }
.origin-path-builder .path-canvas { /* styles */ }
```

These selectors **WILL MATCH** because they're at root level!

---

## WHY THIS PATTERN

### Other Root-Level Imports

Looking at `rogue-trader.scss`, these are already imported at root level:

```scss
// Line 15-28: Modern RT Styles (standalone)
@import 'src/scss/item/index';              // Item sheets (ApplicationV2)
@import 'src/scss/panels/index';            // Panel components
@import 'src/scss/chat/index';              // Chat cards
@import 'src/scss/prompts/index';           // Roll prompts
@import 'src/scss/dialogs/loadout-preset-dialog';     // ✓ Dialog
@import 'src/scss/dialogs/confirmation-dialog';       // ✓ Dialog
@import 'src/scss/dialogs/effect-creation-dialog';    // ✓ Dialog
@import 'src/scss/components/origin-path-builder';    // ✓ Dialog (NOW FIXED)
@import 'journals';

// Line 27-28: Global components
@import 'src/scss/components/rt-tooltip';   // Tooltips (body-level)
@import 'src/scss/components/armour';       // Works in both contexts
```

**Pattern**: All ApplicationV2 dialogs are imported at root level, NOT inside `.rt-wrapper`.

---

## FILES MODIFIED

**Single File Changed**:
- `src/scss/rogue-trader.scss`
  - Line 24: Added import at root level
  - Line 82: Removed import from inside `.rt-wrapper`

---

## VERIFICATION

### Before Fix (Broken)
```css
/* Compiled CSS */
.rt-wrapper .origin-path-builder { /* never matches */ }
```

```html
<!-- Actual DOM -->
<div class="application origin-path-builder">
    <!-- Not inside .rt-wrapper, so styles don't apply -->
</div>
```

### After Fix (Working)
```css
/* Compiled CSS */
.origin-path-builder { /* matches! */ }
```

```html
<!-- Actual DOM -->
<div class="application origin-path-builder">
    <!-- Styles apply correctly -->
</div>
```

---

## LESSON LEARNED

### ApplicationV2 Rendering Context

**CRITICAL RULE**: ApplicationV2 sheets and dialogs render at **root level** (appended to body), not inside game UI containers.

**SCSS Import Rules**:
1. **Root-level components** → Import outside `.rt-wrapper`
   - ApplicationV2 sheets (item sheets, actor sheets)
   - ApplicationV2 dialogs (prompts, confirmations)
   - Body-appended tooltips
   - Chat messages (in sidebar)

2. **Wrapper-scoped components** → Import inside `.rt-wrapper`
   - V1 legacy sheets (if any remain)
   - UI elements that are part of the game canvas
   - HUD overlays

### How to Check

If a component extends ApplicationV2 or DialogV2:
```javascript
export default class MyDialog extends ApplicationV2 { }
```

Then its SCSS **MUST** be imported at root level:
```scss
// At root level, NOT inside .rt-wrapper
@import 'src/scss/components/my-dialog';
```

---

## RELATED ISSUES FIXED

This fix resolves:
1. ✅ No styling on Origin Path Builder
2. ✅ Broken layout (elements collapsed/stacked)
3. ✅ Missing colors and fonts
4. ✅ No borders or backgrounds
5. ✅ Button styling absent
6. ✅ Panel styling missing

All because the CSS selectors never matched due to incorrect scope.

---

## BUILD REQUIRED

**User must run**: `npm run build`

This will:
1. Compile SCSS with new import order
2. Generate CSS with correct selector scope
3. Copy to Foundry data directory

---

## TESTING CHECKLIST

After build:
- [ ] Open Origin Path Builder from Biography tab
- [ ] Verify toolbar has bronze/gold gradient background
- [ ] Verify buttons have styling
- [ ] Verify step slots have borders (dashed when empty)
- [ ] Verify gold text for headings
- [ ] Verify proper spacing throughout
- [ ] Verify preview panel has styling
- [ ] Verify footer badges appear

---

## SUMMARY

**The Problem**: Origin Path Builder SCSS was scoped inside `.rt-wrapper`, but ApplicationV2 windows render at root level.

**The Fix**: Moved `@import 'src/scss/components/origin-path-builder';` from inside `.rt-wrapper` (line 82) to root level (line 24).

**Why It Works**: CSS selectors now match the actual DOM structure where ApplicationV2 windows exist.

**Status**: Ready for build and testing.

---

**Critical Takeaway**: Always import ApplicationV2 component styles at root level, NOT inside `.rt-wrapper`.
