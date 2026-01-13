# Biography Tab Origin Panel - Visual Reference

## Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  rt-origin-panel-modern                                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ rt-panel-header                                    │ │
│  │  🛤️ Origin Path   [3/6 ✓]            [Build 📊]   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ rt-origin-steps-visual                             │ │
│  │                                                     │ │
│  │   ●────●────●────○────○────○                       │ │
│  │  Home Birth Lure Trials Drive Career               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ rt-origin-selections-modern                        │ │
│  │                                                     │ │
│  │  ┌──────────────────────────────────────────────┐  │ │
│  │  │ [🏠]  HOME WORLD                         [x] │  │ │
│  │  │       Forge World                            │  │ │
│  │  └──────────────────────────────────────────────┘  │ │
│  │  ┌──────────────────────────────────────────────┐  │ │
│  │  │ [👶]  BIRTHRIGHT                         [x] │  │ │
│  │  │       Scavenger                              │  │ │
│  │  └──────────────────────────────────────────────┘  │ │
│  │  ┌──────────────────────────────────────────────┐  │ │
│  │  │ [🌌]  LURE OF THE VOID                   [x] │  │ │
│  │  │       Criminal                               │  │ │
│  │  └──────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ rt-origin-bonuses-modern                           │ │
│  │                                                     │ │
│  │  ▼ 🎁 Accumulated Bonuses                          │ │
│  │  ┌────────────────────────────────────────────┐   │ │
│  │  │ 📊 Characteristics                         │   │ │
│  │  │   ┌─────┐ ┌─────┐ ┌─────┐                 │   │ │
│  │  │   │WS +5│ │T +5 │ │Ag -3│                 │   │ │
│  │  │   └─────┘ └─────┘ └─────┘                 │   │ │
│  │  │                                            │   │ │
│  │  │ 📖 Skills                                  │   │ │
│  │  │   [Awareness] [Trade] [Tech-Use]          │   │ │
│  │  │                                            │   │ │
│  │  │ ⭐ Talents                                  │   │ │
│  │  │   [Weapon Training (Chain)]               │   │ │
│  │  │                                            │   │ │
│  │  │ 🧬 Traits                                  │   │ │
│  │  │   [Hive-Bound] [Machine Touched]          │   │ │
│  │  └────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Panel Header
```
┌─────────────────────────────────────────┐
│ 🛤️ Origin Path   [3/6 ✓]      [Build] │
└─────────────────────────────────────────┘
```
- Gold gradient background
- Title with icon
- Progress badge (shows completion)
- Build button (opens OriginPathBuilder)

### 2. Visual Step Indicators
```
  ●────●────●────○────○────○
 Home Birth Lure Trials Drive Career
```
- 6 circular nodes (56px diameter)
- Filled (●) = origin selected, shows image
- Empty (○) = no origin, shows placeholder icon
- Connectors (────) between nodes
  - Active (gold gradient) if both sides filled
  - Inactive (gray) if either side empty
- Short labels below each node
- Hover effect: filled nodes lift up

### 3. Selected Origins List
```
┌──────────────────────────────┐
│ [img]  STEP LABEL        [x] │
│        Origin Name           │
└──────────────────────────────┘
```
- Card design with gradient background
- 40px circular thumbnail
- Two-line content:
  - Step label (uppercase, small, muted)
  - Origin name (larger, bold, clickable)
- Delete button (icon-only, right-aligned)
- Hover effect: brighten, gold border

### 4. Accumulated Bonuses (Collapsible)
```
▼ 🎁 Accumulated Bonuses
┌──────────────────────────┐
│ 📊 Characteristics       │
│   [WS +5] [T +5] [Ag -3] │
│                          │
│ 📖 Skills                │
│   [Awareness] [Trade]    │
└──────────────────────────┘
```
- Toggle button with chevron icon
- Content wraps in white/translucent background
- Categories with icons and labels
- **Characteristic chips**:
  - Green gradient = positive
  - Red gradient = negative
  - Format: "STAT +/-VALUE"
- **Skill/Talent/Trait tags**:
  - White background, subtle shadow
  - Colored left border (blue/gold/teal)
  - Hover effect: lift up

## Color Palette

| Element | Color | Purpose |
|---------|-------|---------|
| Gold (`#c9a227`) | Primary accent | Headers, progress, connectors |
| Green (`#2d5016`) | Success/positive | Positive characteristic chips |
| Red (`#6b1010`) | Failure/negative | Negative characteristic chips |
| Blue (`#2a7a9a`) | Skills accent | Skill tag left border |
| Gold-brown (`#a07818`) | Talents accent | Talent tag left border |
| Teal (`#3a5f5f`) | Equipment/traits | Trait tag left border |

## Typography

| Element | Size | Weight | Transform |
|---------|------|--------|-----------|
| Panel title | 1.2rem | 700 | UPPERCASE |
| Progress badge | 0.7rem | 700 | - |
| Step labels | 0.7rem | 600 | UPPERCASE |
| Selection step | 0.7rem | 600 | UPPERCASE |
| Selection name | 0.9rem | 600 | - |
| Bonus category | 0.7rem | 700 | UPPERCASE |
| Chip/tag text | 0.7rem | 600 | - |

## Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `$rt-space-xs` | 4px | Tight gaps |
| `$rt-space-sm` | 8px | Small gaps |
| `$rt-space-md` | 12px | Standard gaps |
| `$rt-space-lg` | 16px | Large gaps |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `$rt-radius-sm` | 2px | - |
| `$rt-radius-md` | 4px | Cards, inputs |
| `$rt-radius-lg` | 8px | Badges, chips |
| 50% | - | Circular (step nodes, thumbnails) |

## Transitions

| Element | Duration | Easing |
|---------|----------|--------|
| Hover effects | 150ms | ease |
| Collapse/expand | 250ms | ease |
| Transforms | 150ms | ease |

## Responsive Breakpoints

### < 900px (Tablet)
- Step circles: 56px → 44px
- Step icon: 1.5rem → 1.2rem
- Step labels: 0.7rem → 0.65rem
- Connector top offset: -20px → -16px

### < 600px (Mobile)
- Step labels: hidden (`display: none`)
- Bonus chips/tags: reduced gap (6px → 4px)
- More compact overall layout

## State Variants

### Step Node States
- **Empty**: Gray background, placeholder icon, no hover lift
- **Filled**: Gold gradient, origin image, hover lifts 3px
- **Connector Active**: Gold gradient (when both ends filled)
- **Connector Inactive**: Gray gradient

### Card States
- **Default**: White gradient, subtle border
- **Hover**: Brighter, gold border, slight shadow

### Bonus Section States
- **Expanded** (default if complete): Content visible, chevron down
- **Collapsed**: Content hidden (max-height: 0), chevron right
- **Toggle on hover**: Gold gradient background

## Accessibility

- All interactive elements have cursor: pointer
- Buttons have focus-visible outlines (2px solid gold)
- Data-tooltip attributes provide hover text
- Color is not the only differentiator (icons + text)
- Sufficient contrast ratios (text on backgrounds)

## Animation Details

### Step Node Hover
```scss
transform: translateY(-3px);
transition: transform 150ms ease;
```

### Card Hover
```scss
transform: translateY(-1px);
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
transition: all 150ms ease;
```

### Collapse/Expand
```scss
max-height: 0 → 800px;
opacity: 0 → 1;
transition: all 250ms ease;
```

### Chevron Rotate
```scss
transform: rotate(-90deg); // Collapsed (right)
transform: rotate(0deg);    // Expanded (down)
transition: transform 150ms ease;
```

## Integration Points

### JavaScript
- `_prepareOriginPathSteps()` - Provides step data
- `_getOriginPathSummary()` - Provides bonus summary
- CollapsiblePanelMixin - Handles collapse state

### Template
- `{{originPathSteps}}` - Array of 6 steps
- `{{originPathSummary}}` - Completion + bonuses
- `data-action="togglePanel"` - Collapse trigger
- `data-panel-id="origin-bonuses"` - Panel identifier

### SCSS
- Imports from `_variables.scss` - All design tokens
- No conflicts with unified components
- Responsive with media queries
- Uses system font stacks

## Performance Notes

- **No JavaScript animations** - All CSS transitions
- **Hardware-accelerated** - Uses transform properties
- **Minimal reflows** - Fixed dimensions where possible
- **Efficient selectors** - No deep nesting
- **Lazy render** - Bonuses only if path complete
