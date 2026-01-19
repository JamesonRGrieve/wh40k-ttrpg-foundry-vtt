# Phase 5: Enhanced Threat Scaler Visual Reference

## Dialog Layout

```
┌─────────────────────────────────────────────────────┐
│  NPC THREAT SCALER DIALOG                   ╳  □  ─ │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌──────────────────────────────────────────────┐  │
│  │ [PORTRAIT]  TestNPC                          │  │
│  │  80x80      Current Threat: 5  [MINOR]       │  │
│  └──────────────────────────────────────────────┘  │
│                                                       │
│  New Threat Level                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ [════════●═════════════════════════]          │  │
│  │  1     10    15    20             30          │  │
│  │ Minor  Std  Tough Elite          Boss         │  │
│  └──────────────────────────────────────────────┘  │
│                                                       │
│            [ 10 ]  [STANDARD]                        │
│                                                       │
│  [-5]  [-1]  [↻ Reset]  [+1]  [+5]                  │
│                                                       │
│  Scaling Options                                     │
│  ┌─────────────┬─────────────┬─────────────────┐   │
│  │☑Characteristics│☑Wounds    │☑Skills         │   │
│  │☑Weapons      │☑Armour     │                 │   │
│  └─────────────┴─────────────┴─────────────────┘   │
│                                                       │
│  Preview Changes                                     │
│  ⚠ Large threat change (5 levels) - review!         │
│                                                       │
│  [Characteristics] [Combat] [Skills]                 │
│  ━━━━━━━━━━━━━━                                      │
│  ┌──────┬────────┬───┬────────┬─────────┐          │
│  │ Stat │Current │ → │  New   │ Change  │          │
│  ├──────┼────────┼───┼────────┼─────────┤          │
│  │  WS  │   35   │ → │   42   │ +7 (20%)│          │
│  │  BS  │   30   │ → │   36   │ +6 (20%)│          │
│  │   S  │   32   │ → │   38   │ +6 (19%)│          │
│  │   T  │   33   │ → │   39   │ +6 (18%)│          │
│  │  Ag  │   28   │ → │   34   │ +6 (21%)│          │
│  │ Int  │   25   │ → │   30   │ +5 (20%)│          │
│  │ Per  │   27   │ → │   32   │ +5 (19%)│          │
│  │  WP  │   30   │ → │   36   │ +6 (20%)│          │
│  │ Fel  │   24   │ → │   29   │ +5 (21%)│          │
│  │ Inf  │   20   │ → │   24   │ +4 (20%)│          │
│  └──────┴────────┴───┴────────┴─────────┘          │
│                                                       │
│  ──────────────────────────────────────────────     │
│                          [Cancel] [✓ Apply Scaling]  │
└─────────────────────────────────────────────────────┘
```

## Color Scheme

### Threat Tier Colors
```
Minor (1-5):     ████ #4caf50 (Green)
Standard (6-10): ████ #2196f3 (Blue)
Tough (11-15):   ████ #ff9800 (Orange)
Elite (16-20):   ████ #f44336 (Red)
Boss (21-30):    ████ #9c27b0 (Purple)
```

### UI Element Colors
```
Primary Accent:  ████ #c9a227 (Gold)
Positive Change: ████ #4caf50 (Green)
Negative Change: ████ #f44336 (Red)
Neutral:         ████ #888888 (Gray)
Warning:         ████ #ff9800 (Orange)
```

### Background/Text Colors
```
Background:      Uses Foundry CSS variables
  - Primary:     var(--color-bg-primary)
  - Secondary:   var(--color-bg-secondary)
  - Tertiary:    var(--color-bg-tertiary)

Text:            Uses Foundry CSS variables
  - Primary:     var(--color-text-light-primary)
  - Secondary:   var(--color-text-light-secondary)

Borders:         Uses Foundry CSS variables
  - Primary:     var(--color-border-primary)
  - Secondary:   var(--color-border-secondary)
```

## Component Breakdown

### 1. Header Section
```
┌─────────────────────────────────────────┐
│ [PORTRAIT]  Actor Name                  │
│  80x80      Current Threat: 5  [TIER]   │
└─────────────────────────────────────────┘

- Portrait: 80×80px, rounded corners, 2px border
- Name: 1.4rem bold, primary text color
- Current Threat: 0.9rem, secondary text color
- Tier Badge: Small, uppercase, colored background
```

### 2. Slider Section
```
New Threat Level

[════════════●═════════════════════]
 1     10    15    20             30
Minor  Std  Tough Elite          Boss

       [ 10 ]  [STANDARD]

- Slider: 12px high, gradient background
- Thumb: 24px circle, white with gold border
- Marks: Vertical ticks at key positions
- Value: 3rem large display
- Tier: Colored badge with tier name
```

### 3. Quick Presets
```
[-5]  [-1]  [↻ Reset]  [+1]  [+5]

- Buttons: 8px×16px padding
- Reset: Special gold styling
- Hover: Border color changes to gold
- Icons: Font Awesome icons
```

### 4. Scaling Options
```
Scaling Options

☑ Characteristics   ☑ Wounds      ☑ Skills
☑ Weapons          ☑ Armour

- Grid: Auto-fit, minimum 140px columns
- Checkboxes: 18×18px
- Labels: 0.85rem
- Hover: Background and border highlight
```

### 5. Preview Section (3 Tabs)

#### Characteristics Tab
```
┌────┬────────┬───┬────────┬─────────┐
│Stat│Current │ → │  New   │ Change  │
├────┼────────┼───┼────────┼─────────┤
│ WS │   35   │ → │   42   │ +7 (20%)│
│ BS │   30   │ → │   36   │ +6 (20%)│
└────┴────────┴───┴────────┴─────────┘

- Table: Full width, 8px padding
- Headers: 0.75rem, uppercase, gray
- Stats: Short name, gold accent
- Current: Secondary text color
- New: Bold, colored (green/red/gray)
- Change: Bold, right-aligned, colored
- Percentage: 0.75rem, gray
```

#### Combat Tab
```
Wounds:   12  →  15  [+3]
Armour:    3  →   4  [+1]

- Large format with spacing
- Label: 80px min-width, bold
- Values: Bold, primary color
- Diff: Right-aligned, colored badge
```

#### Skills Tab
```
ℹ Skill levels will be adjusted based on
  characteristic changes.

- Centered italic text
- Informational style
- Gray background panel
```

### 6. Warning Banner (Conditional)
```
⚠ Large threat change (X levels) - review carefully!

- Orange background (#ff9800, 20% opacity)
- Orange border and text
- Exclamation triangle icon
- Appears when difference > 10 levels
```

### 7. Footer
```
──────────────────────────────────────
                   [Cancel] [✓ Apply]

- Cancel: Gray, secondary style
- Apply: Gold, primary style
- Icons: Font Awesome
- Right-aligned with gap
```

## Interactive States

### Hover States
```
Preset Buttons:
  Normal:  border: var(--color-border-secondary)
  Hover:   border: $rt-accent-gold (#c9a227)
           background: rgba(139, 0, 0, 0.2)

Checkboxes:
  Normal:  border: var(--color-border-secondary)
  Hover:   border: $rt-accent-gold
           background: rgba(139, 0, 0, 0.1)

Tabs:
  Inactive: color: var(--color-text-light-secondary)
  Hover:    color: var(--color-text-light-primary)
  Active:   color: $rt-accent-gold
            border-bottom: 2px solid $rt-accent-gold

Table Rows:
  Hover:    background: var(--color-bg-tertiary)
```

### Focus States
All form controls have visible focus indicators using:
```css
outline: 2px solid $rt-accent-gold;
outline-offset: 2px;
```

## Typography

### Font Sizes
```
Extra Large:  3rem      (Threat value display)
Large:        1.4rem    (Actor name)
Medium:       1.1rem    (Current threat value)
Base:         0.9rem    (Body text, buttons)
Small:        0.85rem   (Labels, table text)
Extra Small:  0.75rem   (Table headers, percentages)
Tiny:         0.65rem   (Slider mark labels)
```

### Font Weights
```
Bold:    700  (Threat value, stat names, changes)
Semibold: 600  (Labels, buttons)
Medium:  500  (Checkboxes)
Normal:  400  (Body text)
```

## Spacing System

### Internal Spacing
```
$rt-space-xs:  4px   (Tight elements)
$rt-space-sm:  8px   (Close elements)
$rt-space-md:  12px  (Standard gap)
$rt-space-lg:  16px  (Section dividers)
$rt-space-xl:  24px  (Major sections)
```

### Padding
```
Form:         12px       (Main container)
Buttons:      8px 16px   (Presets)
             10px 20px   (Footer buttons)
Checkboxes:   8px 12px   (Labels)
Table cells:  8px        (Standard)
Portrait:     N/A        (No padding)
```

## Transitions

All interactive elements use:
```css
transition: all 0.2s ease;
```

This includes:
- Hover states
- Tab switching (visual only)
- Button interactions
- Checkbox highlighting

## Accessibility Features

1. **Semantic HTML**: Form, sections, headers, tables
2. **ARIA Labels**: Implied by semantic structure
3. **Keyboard Navigation**: Tab order, arrow keys on slider
4. **Focus Indicators**: Visible outlines on all controls
5. **Color Contrast**: WCAG AA compliant (3:1 minimum)
6. **Screen Reader**: All form controls properly labeled

## Responsive Behavior

### Width Constraints
```
Minimum:  450px   (Narrow but usable)
Default:  550px   (Comfortable)
Maximum:  None    (Scales up gracefully)
```

### Grid Adjustments
```
Checkboxes Grid:
  Wide:     5 columns (if space allows)
  Medium:   3 columns (auto-fit, min 140px)
  Narrow:   2 columns (below ~400px)
```

### Content Wrapping
- Text wraps naturally
- Tables remain horizontally scrollable if needed
- Buttons stack if width < 500px

## Animation Details

No animations by design for:
- Performance (frequent updates)
- Clarity (immediate feedback)
- Accessibility (motion sensitivity)

Only CSS transitions used:
- 200ms for hover states
- No JavaScript animations

## Z-Index Layers

Dialog uses Foundry's modal system:
```
Dialog:       (Foundry managed)
Tabs:         1  (Above content)
Active tab:   2  (Above inactive)
Slider thumb: 1  (Above track)
```

## Print Considerations

Dialog not optimized for printing (by design):
- Interactive tool only
- Use character sheets for printable output

## Dark/Light Theme Support

Automatically adapts via Foundry CSS variables:
- `--color-bg-*` for backgrounds
- `--color-text-*` for text
- `--color-border-*` for borders

Fixed colors (by design):
- Threat tier colors (semantic)
- Gold accent (brand identity)
- Positive/negative indicators (universal)

## Browser-Specific Notes

### Chrome/Edge
- Native slider styling fully replaced
- No issues

### Firefox
- Slider thumb requires separate styling
- Works identically

### Safari
- Untested but should work
- Uses standard properties only

## Future Visual Enhancements

Not implemented in Phase 5:
1. Animated value transitions
2. Sparkline charts for trends
3. Comparison mode (side-by-side)
4. Custom theme colors
5. Export preview as image
