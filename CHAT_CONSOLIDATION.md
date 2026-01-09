# Chat System Consolidation - January 2026

## Summary

Consolidated chat card styling from duplicate legacy code into a single modern system.

## Changes Made

### 1. Removed Duplicate Styles
**File**: `src/scss/components/_chat.scss`
- **Before**: 177 lines of legacy `.rt-item-card` styles (duplicate)
- **After**: 8 lines deprecation notice pointing to modern implementation
- **Status**: Kept file for legacy compatibility, marked as deprecated

### 2. Modern Chat Card System

All chat card styles now live in **`src/scss/chat/`** directory:

#### `src/scss/chat/_roll-cards.scss` (735 lines)
- `.rt-roll-card` - Roll/test result cards
- `.rt-roll-card__header`, `__body`, `__result`, etc. (BEM structure)
- Success/failure states with animations
- Degrees of Success/Failure display
- Damage, fury, righteous fury sections
- Theme-aware CSS variables for light/dark mode

#### `src/scss/chat/_item-cards.scss` (418 lines)
- `.rt-item-card` - Item display cards
- `.rt-item-card__header`, `__body`, `__stats`, etc. (BEM structure)
- Type-specific variants (weapon, armour, talent, power)
- Action buttons with semantic colors
- Properties/qualities tag system
- Theme-aware CSS variables for light/dark mode

#### `src/scss/chat/_index.scss`
- Imports both roll-cards and item-cards
- Single entry point for all chat styles

### 3. Import Structure

**`src/scss/rogue-trader.scss`**:
```scss
// Line 19: Modern chat cards (outside wrapper) ✅ CORRECT
@import 'src/scss/chat/index';

.rt-wrapper {
    // Line 52: Legacy compatibility (inside wrapper) - DEPRECATED
    @import 'src/scss/components/chat';
}
```

**Why two imports?**
- Chat messages render in `#chat-log` (outside `.rt-wrapper`)
- Line 19 import provides styles at root level
- Line 52 kept for legacy compatibility (now just a deprecation notice)

### 4. Dark Mode Fix

Added `#chat-log .message.flexcol` selector to `_roll-cards.scss`:
```scss
#chat-log .message.flexcol,
.rt-chat {
  // Theme variables inherit from global scope
  --rt-card-bg: var(--rt-panel-bg-solid);
  --rt-card-text: var(--rt-text-dark);
  // ... etc
}
```

This ensures Foundry's chat message container gets theme-aware variables that automatically switch with `body.theme-dark`.

## Template Usage

All 16 chat templates use the modern BEM classes:

| Template | Card Class | Count |
|----------|------------|-------|
| `action-roll-chat.hbs` | `.rt-roll-card` | ✅ |
| `damage-roll-chat.hbs` | `.rt-roll-card` | ✅ |
| `force-field-roll-chat.hbs` | `.rt-roll-card` | ✅ |
| `psychic-action-chat.hbs` | `.rt-roll-card` | ✅ |
| `simple-roll-chat.hbs` | `.rt-roll-card` | ✅ |
| `item-card-chat.hbs` | `.rt-item-card` | ✅ |
| `item-vocalize-chat.hbs` | `.rt-item-card` | ✅ |
| ... 9 more roll templates | `.rt-roll-card` | ✅ |

**Total**: 250 `.rt-roll-card` instances, 125 `.rt-item-card` instances

## Benefits

1. **No Duplication**: Single source of truth for each card type
2. **Modern BEM Structure**: Consistent naming, easy to maintain
3. **Theme-Aware**: Automatic light/dark mode support via CSS variables
4. **Type Safety**: Type-specific variants (weapon, armour, etc.)
5. **Smaller Bundle**: Removed 169 lines of duplicate code

## Future Cleanup

**Can be removed after confirming no legacy templates exist:**
- `src/scss/components/_chat.scss` (now just 8-line deprecation notice)
- Line 52 import in `rogue-trader.scss`

**Check with:**
```bash
# Search for any legacy class usage (non-BEM style)
grep -r "rt-item-card-header\|rt-item-card-name" src/templates/
# Should return 0 results if all templates migrated
```

## Files Modified

1. `src/scss/chat/_roll-cards.scss` - Added `#chat-log .message.flexcol` selector for dark mode
2. `src/scss/components/_chat.scss` - Replaced 177 lines with 8-line deprecation notice

## Testing Checklist

- [x] Roll cards display correctly in light mode
- [x] Roll cards display correctly in dark mode
- [x] Item cards display correctly in light/dark mode
- [ ] Verify all 16 chat templates render correctly
- [ ] Check weapon attack rolls
- [ ] Check damage rolls
- [ ] Check psychic power rolls
- [ ] Check item display cards
- [ ] Confirm no console errors
- [ ] Verify no broken styling in chat log

## Performance Impact

- **Before**: ~1330 lines of chat CSS (with duplication)
- **After**: ~1161 lines of chat CSS (no duplication)
- **Savings**: 169 lines / 12.7% reduction
