# Rogue Trader VTT - Theme System

## Overview

The Rogue Trader system fully supports Foundry VTT V13's light/dark theme modes. All styles automatically adapt to the user's selected theme while maintaining the Gothic 40K aesthetic.

**How to Switch Themes:** Game Settings → Configure Settings → Core Settings → Color Scheme

## Design Philosophy

1. **Use Foundry's Theme Classes** - Styles adapt based on `body.theme-light` and `body.theme-dark`
2. **CSS Custom Properties** - Theme-aware variables defined in `_gothic-theme.scss`
3. **Preserve Gothic Identity** - Imperial gold, bronze, crimson accents consistent across themes
4. **Automatic Adaptation** - Styles respond to Foundry's theme without manual intervention

## Theme-Aware CSS Custom Properties

These properties are defined in `/src/scss/abstracts/_gothic-theme.scss` and automatically switch values based on the active theme:

### Sheet Backgrounds
```css
--rt-sheet-bg          /* Main sheet background */
--rt-sheet-bg-alt      /* Alternative sheet background */
```

### Panel Backgrounds
```css
--rt-panel-bg          /* Standard panel background */
--rt-panel-bg-solid    /* Solid panel background */
--rt-panel-bg-translucent  /* Semi-transparent panel background */
--rt-panel-body-bg     /* Panel body area background */
```

### Input Backgrounds
```css
--rt-input-bg          /* Input field background */
--rt-input-bg-focus    /* Input field focus state */
```

### Text Colors
```css
--rt-text-dark         /* Primary text (high contrast) */
--rt-text-medium       /* Secondary text */
--rt-text-muted        /* Muted/tertiary text */
--rt-text-subtle       /* Very subtle text */
```

### Border Colors
```css
--rt-border-color         /* Standard borders */
--rt-border-color-light   /* Subtle borders */
--rt-border-color-strong  /* Emphasized borders */
--rt-border-accent        /* Accent-colored borders */
```

### Shadows
```css
--rt-shadow-soft       /* Subtle shadows */
--rt-shadow-medium     /* Medium shadows */
--rt-text-shadow       /* Text shadow for legibility */
```

### UI Components
```css
--rt-hud-bg            /* HUD background gradient */
--rt-hud-item-bg       /* HUD item background */
--rt-circle-bg         /* Circular element gradient */
--rt-btn-bg            /* Button background */
--rt-btn-bg-hover      /* Button hover state */
--rt-accent-overlay    /* Accent color overlay */
--rt-accent-border     /* Accent color for borders */
```

## Semantic Panel Colors

Each panel type has dedicated color variables for consistent theming. These remain visually consistent across themes but adapt their opacity and saturation:

### Wounds Panel (Red/Crimson)
```css
--rt-wounds-primary    /* Primary red color */
--rt-wounds-secondary  /* Lighter red */
--rt-wounds-bg         /* Panel background tint */
--rt-wounds-border     /* Border color */
--rt-wounds-panel-bg   /* Full panel background gradient */
```

### Fatigue Panel (Amber/Orange)
```css
--rt-fatigue-primary    /* Primary amber color */
--rt-fatigue-secondary  /* Lighter amber */
--rt-fatigue-bg         /* Panel background tint */
--rt-fatigue-border     /* Border color */
```

### Fate Panel (Gold/Divine)
```css
--rt-fate-primary       /* Primary gold color */
--rt-fate-secondary     /* Lighter gold */
--rt-fate-bg            /* Panel background tint */
--rt-fate-border        /* Border color */
```

### Insanity Panel (Purple/Violet)
```css
--rt-insanity-primary   /* Primary purple color */
--rt-insanity-secondary /* Lighter purple */
--rt-insanity-bg        /* Panel background tint */
--rt-insanity-border    /* Border color */
```

### Corruption Panel (Teal/Dark Green)
```css
--rt-corruption-primary   /* Primary teal color */
--rt-corruption-secondary /* Lighter teal */
--rt-corruption-bg        /* Panel background tint */
--rt-corruption-border    /* Border color */
```

### Skills Panel (Blue/Teal)
```css
--rt-skills-primary     /* Primary blue color */
--rt-skills-secondary   /* Lighter blue */
--rt-skills-bg          /* Panel background tint */
--rt-skills-border      /* Border color */
```

### Utility Colors
```css
--rt-success-primary    /* Green for positive actions */
--rt-success-secondary  /* Light green */
--rt-success-bg         /* Success background tint */
--rt-warning-primary    /* Amber for warnings */
--rt-danger-primary     /* Red for dangerous actions */
```

## Constant Gothic Accents

These colors remain **consistent across themes**:

```css
--rt-gold: #d4af37
--rt-gold-bright: #ffd700
--rt-gold-dark: #b8941f
--rt-bronze: #cd7f32
--rt-bronze-bright: #e89b5a
--rt-bronze-dark: #8b5a2b
--rt-red: #8b0000
--rt-red-bright: #dc143c
--rt-green: #2d5a2d
--rt-green-bright: #4ade80
```

## Usage Guidelines

### ✅ DO

**Use RT theme-aware variables for adaptive colors:**
```scss
.my-element {
  background: var(--rt-panel-bg);
  color: var(--rt-text-dark);
  border: 1px solid var(--rt-border-color);
}
```

**Use RT constant properties for accents:**
```scss
.highlight {
  border-color: var(--rt-gold);
  box-shadow: 0 0 10px rgba(212, 175, 55, 0.3);
}
```

**Combine theme-aware and constant variables:**
```scss
.panel {
  background: var(--rt-panel-bg);
  border: 2px solid var(--rt-bronze);
  color: var(--rt-text-dark);
}
```

**Use semantic panel colors for stat panels:**
```scss
.wounds-section {
  background: var(--rt-wounds-bg);
  border: 2px solid var(--rt-wounds-border);
  
  .value {
    color: var(--rt-wounds-primary);
  }
  
  .btn:hover {
    background: var(--rt-wounds-bg);
    border-color: var(--rt-wounds-secondary);
  }
}
```

### ❌ DON'T

**Hardcode colors that should adapt:**
```scss
/* BAD - won't adapt to dark mode */
.element {
  background: rgba(255, 255, 255, 0.9);
  color: #2a1a0a;
}
```

**Use specific RGB values for backgrounds/text:**
```scss
/* BAD - use Foundry variables instead */
.element {
  background: rgba(10, 10, 10, 0.9);
  color: #2a1a0a;
}
```

**Mix semantic meanings:**
```scss
/* BAD - inconsistent usage */
.element {
  background: var(--color-text-primary); /* text color as background? */
  color: var(--color-bg-tertiary);      /* background as text? */
}
```

## Color Mapping Reference

### Old Variables → New Variables

| Old Variable | New Variable | Usage |
|--------------|--------------|-------|
| `$rt-bg-primary` | `var(--color-bg-primary)` | Darkest backgrounds |
| `$rt-bg-secondary` | `var(--color-bg-secondary)` | Medium backgrounds |
| `$rt-bg-tertiary` | `var(--color-bg-tertiary)` | Light backgrounds |
| `$rt-text-primary` | `var(--color-text-primary)` | Main text |
| `$rt-text-secondary` | `var(--color-text-secondary)` | Secondary text |
| `$rt-color-parchment` | `var(--color-text-primary)` | Light mode text |
| `$rt-color-void` | `var(--color-bg-primary)` | Dark backgrounds |
| `$rt-color-steel` | `var(--color-border-primary)` | Borders |

### Gothic Accents (No Change)

These remain consistent across themes:
- `$rt-color-gold` → Still gold accent
- `$rt-color-bronze` → Still bronze accent
- `$rt-color-crimson` → Still crimson accent
- Status colors (success, failure, warning, info)

## Testing Themes

1. **Switch Foundry's theme:** Game Settings → Configure Settings → Core Settings → Color Scheme
2. **Test in Light Mode:** Check readability, contrast, visual hierarchy
3. **Test in Dark Mode:** Ensure Gothic aesthetic is maintained
4. **Verify Accents:** Gold, bronze, crimson should be prominent in both modes

## Component Examples

### Character Card
```scss
.rt-char-card {
  background: var(--color-bg-tertiary);        // Adapts to theme
  border: 2px solid var(--color-border-secondary);  // Adapts to theme
  color: var(--color-text-primary);            // Adapts to theme
  
  &:hover {
    border-color: var(--rt-gold);              // Gothic accent
    box-shadow: 0 0 15px rgba(212, 175, 55, 0.3);  // Gold glow
  }
}
```

### Context Menu
```scss
.rt-context-menu {
  background: var(--color-bg-primary);         // Dark in both modes
  border: 2px solid var(--rt-bronze);         // Gothic accent
  color: var(--color-text-primary);            // Adapts to theme
  
  &-item:hover {
    background: linear-gradient(90deg, 
      var(--color-warm-3) 0%,                  // Foundry semantic
      var(--color-warm-2) 100%                 // Foundry semantic
    );
    border-color: var(--rt-gold);              // Gothic accent
  }
}
```

### Input Field
```scss
.rt-vital-btn {
  background: var(--color-bg-option);          // Input background
  border: 1px solid var(--color-border-secondary);  // Border
  color: var(--color-text-primary);            // Text color
  
  &:hover {
    background: var(--color-bg-tertiary);      // Hover state
    border-color: var(--color-border-highlight);  // Active border
  }
}
```

## Migration Checklist

When adding new components:

- [ ] Use Foundry CSS custom properties for backgrounds, text, borders
- [ ] Use RT custom properties for gold/bronze/crimson accents
- [ ] Test in both light and dark modes
- [ ] Verify sufficient contrast in both modes
- [ ] Check hover/focus/active states adapt correctly
- [ ] Ensure Gothic aesthetic is preserved

## Benefits

1. **Automatic Theme Support** - No manual light/dark mode CSS needed
2. **User Preference** - Respects player's Foundry theme choice
3. **Accessibility** - Better contrast options for different lighting conditions
4. **Maintainability** - Semantic color usage makes updates easier
5. **Gothic Identity** - Imperial accents remain distinctive
6. **Future-Proof** - Adapts if Foundry updates its color system

## Files Reference

- **Variables:** `/src/scss/abstracts/_variables.scss`
- **Gothic Theme:** `/src/scss/abstracts/_gothic-theme.scss`
- **Mixins:** `/src/scss/abstracts/_mixins.scss`
- **Main Stylesheet:** `/src/scss/rogue-trader.scss`

## Support

If you encounter theme-related issues:
1. Check if using Foundry CSS custom properties correctly
2. Verify accent colors use RT custom properties
3. Test in both light and dark modes
4. Check browser console for CSS variable errors
5. Rebuild with `npm run build` after changes
