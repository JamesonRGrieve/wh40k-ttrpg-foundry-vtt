# Visual Consistency & Unified Component Guide

## Overview

This document explains the unified component system created to standardize button, input, and panel styling across all tabs in the Rogue Trader VTT system.

## Problem Solved

Previously, there were 4+ button variations and 3+ input variations scattered across different panel stylesheets:
- `.rt-vital-btn`, `.rt-vital-btn-compact`, `.rt-vital-ctrl-btn`
- `.rt-btn-minus`, `.rt-btn-plus`, `.rt-quick-action-btn`
- `.rt-control-button`, `.rt-header-btn`, `.rt-add-btn-small`
- `.rt-edit-input`, `.rt-vital-input`, `.rt-field-input`, `.rt-xp-input`

## New Unified System

All unified components are defined in `src/scss/abstracts/_unified-components.scss`.

### Typography CSS Variables

```scss
--rt-text-h1: 1.5rem;     // Tab headers, major sections
--rt-text-h2: 1.25rem;    // Panel headers
--rt-text-h3: 1.1rem;     // Section headers
--rt-text-h4: 0.95rem;    // Minor headers
--rt-text-body: 0.9rem;   // Normal text
--rt-text-small: 0.8rem;  // Labels, captions
--rt-text-tiny: 0.7rem;   // Badges, meta info
--rt-text-micro: 0.65rem; // Smallest labels

--rt-font-display: "Modesto Condensed", "Cinzel", serif;
--rt-font-heading: "Modesto Condensed", "IM Fell DW Pica", serif;
--rt-font-numeric: "Modesto Condensed", "Roboto Mono", monospace;
```

### Button Classes

| Class | Purpose | Size | Variants |
|-------|---------|------|----------|
| `.rt-btn-primary` | Major actions (roll, use, activate) | 6px 12px | `--combat`, `--skills`, `--compact` |
| `.rt-btn-control` | Stat adjustments (+/-), toggle | 28x28px | `--minus`, `--plus`, `--compact`, `--large` |
| `.rt-btn-icon` | Config, delete, expand, collapse | 22x22px | `--delete`, `--add`, `--accent`, `--bordered` |
| `.rt-btn-quick` | Rest, clear, restore actions | flex | `--success`, `--warning`, `--danger`, `--full` |

#### Examples

```html
<!-- Primary roll button -->
<button class="rt-btn-primary" data-action="roll">
  <i class="fas fa-dice-d20"></i> Roll
</button>

<!-- Combat variant -->
<button class="rt-btn-primary rt-btn-primary--combat" data-action="attack">
  <i class="fas fa-sword"></i> Attack
</button>

<!-- Control buttons (+/-) -->
<button class="rt-btn-control rt-btn-control--minus" data-action="decrement">−</button>
<button class="rt-btn-control rt-btn-control--plus" data-action="increment">+</button>

<!-- Icon buttons -->
<button class="rt-btn-icon rt-btn-icon--delete" data-action="itemDelete">
  <i class="fas fa-trash"></i>
</button>

<!-- Quick action with success style -->
<button class="rt-btn-quick rt-btn-quick--success" data-action="rest">
  <i class="fas fa-bed"></i> Rest
</button>
```

### Input Classes

| Class | Purpose | Style |
|-------|---------|-------|
| `.rt-input` | Standard text/number input | Full width, 4px 8px padding |
| `.rt-input-numeric` | Numbers with special styling | Center-aligned, monospace font |
| `.rt-input-inline` | Transparent underline style | No background, border-bottom only |
| `.rt-select` | Dropdown styling | With chevron indicator |
| `.rt-textarea` | Multi-line input | Resizable, min-height 60px |

#### Variants

```scss
// Input modifiers
.rt-input--compact    // 2px 6px padding
.rt-input--large      // 6px 10px padding

// Numeric modifiers
.rt-input-numeric--styled   // 36px height, styled for vitals
.rt-input-numeric--display  // 40px height, larger display
.rt-input-numeric--narrow   // 40-60px width
.rt-input-numeric--wide     // 70-100px width

// Inline modifiers
.rt-input-inline--name      // Larger, bolder for names
```

### Panel Accent Colors

Panels now support accent color modifiers via CSS custom properties:

```html
<div class="rt-panel rt-panel--wounds">
  <!-- Icon color and left border will be red/combat themed -->
</div>

<div class="rt-panel rt-panel--skills">
  <!-- Icon color and left border will be blue/teal themed -->
</div>
```

Available modifiers:
- `--wounds`, `--fatigue`, `--fate`
- `--corruption`, `--insanity`
- `--skills`, `--talents`, `--equipment`
- `--powers`, `--dynasty`, `--bio`
- `--combat`, `--xp`

## Backwards Compatibility

Legacy classes are aliased to the new unified classes in `_unified-components.scss`:

```scss
.rt-vital-btn { @extend .rt-btn-control; }
.rt-vital-btn-compact { @extend .rt-btn-control--compact; }
.rt-header-btn { @extend .rt-btn-icon--bordered; }
```

Existing templates will continue to work. New code should use the unified classes.

## Migration Guide

When updating existing templates:

1. **Replace button classes:**
   - `.rt-vital-btn` → `.rt-btn-control`
   - `.rt-header-btn` → `.rt-btn-icon--bordered`
   - Old `.rt-quick-action-btn` → `.rt-btn-quick`

2. **Replace input classes:**
   - `.rt-vital-input` → `.rt-input-numeric--styled`
   - `.rt-edit-input` → `.rt-input-numeric`

3. **Add panel accent:**
   - Add modifier class like `.rt-panel--wounds` to panels

4. **Use typography variables:**
   - Replace hardcoded `font-size: 0.7rem` with `var(--rt-text-tiny)`
   - Replace `font-family: 'Modesto Condensed'` with `var(--rt-font-display)`
