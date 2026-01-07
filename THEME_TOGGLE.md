# Theme Toggle - Removed

## Overview

The custom theme toggle button has been **removed** from character sheet headers. Instead, use Foundry VTT's native theme switching.

## How to Switch Themes

1. **Game Settings** → **Configure Settings** → **Core Settings**
2. Find **Color Scheme** setting
3. Choose **Light**, **Dark**, or **Auto** (follows system preference)

## Why the Change?

1. **Native Integration** - Foundry V13 has robust built-in theme support
2. **Consistency** - All UI elements switch together, not just character sheets
3. **User Preference** - Setting is remembered per-user, persists across sessions
4. **Less Maintenance** - No need to update custom toggle for Foundry changes

## For Developers

The Rogue Trader system now uses theme-aware CSS custom properties that automatically adapt:

```scss
// These variables change based on body.theme-light or body.theme-dark
background: var(--rt-panel-bg);
color: var(--rt-text-dark);
border: 1px solid var(--rt-border-color);

// These remain constant across themes
border-color: var(--rt-gold);
color: var(--rt-red-bright);
```

See `THEME_SYSTEM.md` for the complete list of theme-aware variables.

## Files Modified (Removal)

- `src/templates/actor/acolyte/header.hbs` - Button removed
- `src/module/applications/actor/acolyte-sheet.mjs` - Handler removed
- `src/scss/components/_header.scss` - Styles removed
