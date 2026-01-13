# Origin Path Builder - Visual Changes Guide

Quick visual reference for the refactored Origin Path Builder system.

---

## 1. Origin Card Selection - Before vs After

### BEFORE (Dialog-based selection)
```
┌─────────────────┐
│  Origin Card    │
│   [Image]       │  ← Click here
│   Name          │
│  [Badges]       │
└─────────────────┘
        ↓
┌──────────────────────────┐
│  Detail Dialog           │
│  ┌────────────────────┐  │
│  │ Full description   │  │
│  │ All grants         │  │
│  │ Requirements       │  │
│  └────────────────────┘  │
│                          │
│  [Cancel] [Select This]  │ ← Must confirm
└──────────────────────────┘
        ↓
    Selected!
```

### AFTER (Direct selection + Preview option)
```
┌─────────────────┐
│ 👁️ Origin Card  │  ← Eye icon (preview)
│   [Image]       │  ← Click here = Select!
│   Name          │
│  [Badges]       │
└─────────────────┘
        ↓
    Selected! (immediately)

OR click eye icon →

┌──────────────────────────┐
│  Detail Dialog           │
│  ┌────────────────────┐  │
│  │ Full description   │  │
│  │ All grants         │  │
│  │ Requirements       │  │
│  └────────────────────┘  │
│                          │
│       [Close]            │ ← Preview only
└──────────────────────────┘
```

**Key Difference**: 
- Before: 2 steps to select (click → confirm)
- After: 1 click to select, optional preview via eye icon

---

## 2. Eye Icon Button Appearance

### Visual Design
```
Card in normal state:
┌────────────────────┐
│                    │
│   [Image]          │  No eye icon visible
│   Name             │
│  [Badges]          │
└────────────────────┘

Card on hover:
┌────────────────────┐
│ 👁️                 │  ← Eye icon fades in (top-left)
│   [Image]          │
│   Name             │
│  [Badges]          │
└────────────────────┘
```

### CSS Behavior
```scss
.card-preview-btn {
  position: absolute;
  top: 4px;
  left: 4px;
  opacity: 0;  // Hidden by default
  
  // Parent hover
  .origin-card:hover & {
    opacity: 1;  // Fade in
  }
  
  // Button hover
  &:hover {
    transform: scale(1.1);  // Grow slightly
    background: gold;
    color: black;
  }
}
```

---

## 3. Origin Item Sheet Layout - Before vs After

### BEFORE (Cramped layout)
```
┌──────────────────────────────┐
│ Origin Path Item Sheet       │
├──────────────────────────────┤
│ [Tabs: Grants | Description] │
├──────────────────────────────┤
│                              │
│ Grants Tab:                  │
│ ┌──────────────────────────┐ │
│ │ Characteristic Modifiers │ │ ← Hardcoded label
│ │ [WS +5] [BS +5]         │ │
│ ├──────────────────────────┤ │
│ │ Other Bonuses           │ │ ← Hardcoded label
│ │ [Wounds] [Fate]         │ │
│ ├──────────────────────────┤ │
│ │ Skills Granted          │ │ ← Hardcoded label
│ │ [Skill list...]         │ │
│ │                         │ │
│ │ [Content cuts off]      │ │ ← Can't scroll!
│ └──────────────────────────┘ │
│                              │
└──────────────────────────────┘

Description Tab:
┌──────────────────────────────┐
│ Description:                 │
│ ┌──────────┐                 │
│ │ Tiny     │                 │ ← Only 150px high
│ │ editor   │                 │
│ └──────────┘                 │
│ [Large empty space below]    │
└──────────────────────────────┘
```

### AFTER (Proper layout)
```
┌──────────────────────────────┐
│ Origin Path Item Sheet       │
├──────────────────────────────┤
│ [Tabs: Grants | Description] │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ ▼ Scrollable Panel       │ │ ← Entire panel scrolls
│ │                          │ │
│ │ Grants Tab:              │ │
│ │ ┌────────────────────────│ │
│ │ │ {{localize "RT.Charac"}}│ ← Localized!
│ │ │ [WS +5] [BS +5]       │ │
│ │ ├────────────────────────│ │
│ │ │ {{localize "RT.Other"}} │ ← Localized!
│ │ │ [Wounds] [Fate]       │ │
│ │ ├────────────────────────│ │
│ │ │ {{localize "RT.Skills"}}│ ← Localized!
│ │ │ [Skill list...]       │ │
│ │ │ [More content...]     │ │
│ │ │ [All visible!]        │ │ ← Scrollable!
│ │ └────────────────────────│ │
│ │                [scroll]  │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘

Description Tab:
┌──────────────────────────────┐
│ Description:                 │
│ ┌──────────────────────────┐ │
│ │ Much larger editor       │ │ ← 200px min height
│ │                          │ │
│ │ Room to write lore       │ │
│ │                          │ │
│ │ Comfortable editing      │ │ ← Up to 400px max
│ │                          │ │
│ │ [scroll if needed]       │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

---

## 4. Localization Changes

### Before (Hardcoded)
```handlebars
<h3 class="rt-section-title">
  <i class="fas fa-graduation-cap"></i> Skills Granted
</h3>
```

### After (Localized)
```handlebars
<h3 class="rt-section-title">
  <i class="fas fa-graduation-cap"></i> {{localize "RT.SkillsGranted"}}
</h3>
```

### Translation Ready
```json
// en.json
{
  "RT": {
    "SkillsGranted": "Skills Granted",
    "TalentsGranted": "Talents Granted",
    "TraitsGranted": "Traits Granted",
    ...
  }
}

// es.json (example)
{
  "RT": {
    "SkillsGranted": "Habilidades Otorgadas",
    "TalentsGranted": "Talentos Otorgados",
    "TraitsGranted": "Rasgos Otorgados",
    ...
  }
}
```

---

## 5. Z-Index Layering

### Visual Stack (Front to Back)
```
┌─────────────────────────────┐
│                             │
│   [👁️ Eye icon: z-3]        │ ← Topmost layer
│                             │
│     [✓ Check: z-2] ────┐    │ ← Selected badge
│                        │    │
│   [Image]              │    │
│   Card Content: z-1    │    │ ← Base layer
│                        │    │
└────────────────────────┴────┘
```

### Interaction Flow
```
1. Card not selected, not hovered
   └─ Eye icon hidden (opacity: 0)

2. Card hovered
   └─ Eye icon fades in (opacity: 1)

3. Card selected
   └─ Checkmark badge appears (z-index: 2)
   └─ Eye icon still visible on hover (z-index: 3)

4. Eye icon hovered
   └─ Icon grows (scale: 1.1)
   └─ Background becomes gold
```

---

## 6. Scrollbar Styling

### Custom Scrollbar (Webkit)
```scss
// Applied to both .rt-origin-panel and .rt-editor-container
&::-webkit-scrollbar {
  width: 8px;
}

&::-webkit-scrollbar-track {
  background: var(--color-bg-tertiary);  // Dark background
}

&::-webkit-scrollbar-thumb {
  background: var(--color-border-secondary);  // Lighter thumb
  border-radius: $rt-radius-sm;
  
  &:hover {
    background: var(--color-border-highlight);  // Gold on hover
  }
}
```

### Visual Appearance
```
┌─────────────────────────┐
│ Content                 │
│ More content            │
│ Even more content       │
│ ...                     ║  ← 8px scrollbar
│ Scrollable content      ║
│ ...                     ║
└─────────────────────────┘
```

---

## Summary of Visual Changes

| Element | Before | After |
|---------|--------|-------|
| **Origin Card Click** | Opens dialog → Confirm | Selects immediately |
| **Preview Option** | None (must open dialog) | Eye icon button |
| **Eye Icon Visibility** | N/A | Fades in on hover |
| **Grants Section** | Can't scroll, cuts off | Fully scrollable |
| **Description Editor** | 150px cramped | 200-400px comfortable |
| **Labels** | Hardcoded English | Localized, translation-ready |
| **Scrollbars** | Default OS style | Custom themed scrollbars |

---

## User Workflow Comparison

### Before: 4 Steps to Select
```
1. Hover card
2. Click card
3. Read dialog
4. Click "Select This"
```

### After: 1 Step to Select
```
1. Click card → Done!
```

### After: Preview if Needed
```
1. Hover card
2. Click eye icon
3. Read dialog
4. Close
```

**Result**: 75% fewer clicks for the most common action (selection).
