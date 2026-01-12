# Rogue Trader VTT - Item Sheet Style Guide

> **Definitive reference for creating consistent, modern item sheets**
> 
> *Based on the gold-standard Weapon Sheet implementation*

---

## Table of Contents

1. [Sheet Structure](#1-sheet-structure)
2. [Header Pattern](#2-header-pattern)
3. [Stats Bar Pattern](#3-stats-bar-pattern)
4. [Tab Navigation Pattern](#4-tab-navigation-pattern)
5. [Section Pattern](#5-section-pattern)
6. [Form Field Patterns](#6-form-field-patterns)
7. [Badge Patterns](#7-badge-patterns)
8. [Color Theming](#8-color-theming-by-item-type)
9. [CSS Custom Properties](#9-css-custom-properties-reference)
10. [Typography](#10-typography)
11. [SCSS Structure](#11-scss-file-structure)
12. [Complete Examples](#12-complete-examples)
13. [Checklist](#13-item-sheet-checklist)

---

## 1. Sheet Structure

### Required Elements (in order)

1. **Container**: `.rt-{itemtype}-sheet`
2. **Form**: `<form autocomplete="off">`
3. **Header**: `.rt-{itemtype}-header`
4. **Stats Bar**: `.rt-{itemtype}-stats` *(optional, for data-heavy items)*
5. **Qualities Bar**: `.rt-{itemtype}-qualities` *(optional, if item has qualities)*
6. **Tab Navigation**: `.rt-{itemtype}-tabs`
7. **Tab Content**: `.rt-{itemtype}-content`

### Container Pattern

```html
<div class="rt-{itemtype}-sheet">
  <form autocomplete="off">
    <!-- All content inside form -->
  </form>
</div>
```

### Base SCSS

```scss
.rt-{itemtype}-sheet {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--rt-sheet-bg);
  color: var(--rt-text-dark);
  font-family: 'Roboto', sans-serif;
  font-size: 0.9rem;
  overflow: hidden;
  
  form {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}
```

---

## 2. Header Pattern

### Structure

```html
<header class="rt-{itemtype}-header">
  <!-- Image with edit overlay -->
  <div class="rt-{itemtype}-header__image" data-action="editImage" data-edit="img">
    <img src="{{item.img}}" alt="{{item.name}}" />
    <div class="rt-{itemtype}-header__image-overlay">
      <i class="fas fa-edit"></i>
    </div>
  </div>
  
  <!-- Name and meta badges -->
  <div class="rt-{itemtype}-header__info">
    <input type="text" class="rt-{itemtype}-header__name" name="name" 
           value="{{item.name}}" placeholder="{Item Type} Name" />
    
    <div class="rt-{itemtype}-header__meta">
      <span class="rt-{itemtype}-badge rt-{itemtype}-badge--type" title="Type">
        <i class="fas fa-{icon}"></i>
        {{item.system.typeLabel}}
      </span>
      <!-- Additional badges -->
    </div>
  </div>
  
  <!-- Equipped toggle (for equippable items) -->
  <div class="rt-{itemtype}-header__equipped">
    <label class="rt-toggle-equipped" title="Toggle Equipped">
      <input type="checkbox" name="system.equipped" {{checked item.system.equipped}} />
      <span class="rt-toggle-equipped__indicator">
        <i class="fas {{#if item.system.equipped}}fa-check-circle{{else}}fa-circle{{/if}}"></i>
      </span>
      <span class="rt-toggle-equipped__label">
        {{#if item.system.equipped}}Equipped{{else}}Stowed{{/if}}
      </span>
    </label>
  </div>
</header>
```

### SCSS

```scss
.rt-{itemtype}-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: linear-gradient(135deg, var(--rt-{type}-bg) 0%, transparent 100%);
  border-bottom: 2px solid var(--rt-{type}-border);
  
  &__image {
    position: relative;
    width: 64px;
    height: 64px;
    flex-shrink: 0;
    border: 2px solid var(--rt-bronze);
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    &:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 12px var(--rt-shadow-medium);
      
      .rt-{itemtype}-header__image-overlay {
        opacity: 1;
      }
    }
  }
  
  &__image-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    opacity: 0;
    transition: opacity 0.2s ease;
    
    i {
      color: white;
      font-size: 1.2rem;
    }
  }
  
  &__info {
    flex: 1;
    min-width: 0;
  }
  
  &__name {
    width: 100%;
    padding: 4px 8px;
    margin: 0;
    background: transparent;
    border: none;
    border-bottom: 1px solid transparent;
    font-family: 'Cinzel', serif;
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--rt-text-dark);
    transition: border-color 0.2s ease;
    
    &:hover,
    &:focus {
      border-bottom-color: var(--rt-gold);
      outline: none;
    }
  }
  
  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
    padding-left: 8px;
  }
  
  &__equipped {
    flex-shrink: 0;
  }
}
```

---

## 3. Stats Bar Pattern

### Structure

```html
<div class="rt-{itemtype}-stats">
  <div class="rt-{itemtype}-stat rt-{itemtype}-stat--{statname}">
    <div class="rt-{itemtype}-stat__icon">
      <i class="fas fa-{icon}"></i>
    </div>
    <div class="rt-{itemtype}-stat__content">
      <span class="rt-{itemtype}-stat__label">{Label}</span>
      <span class="rt-{itemtype}-stat__value">{Value}</span>
    </div>
  </div>
  <!-- Repeat for each stat -->
  
  <!-- Optional: Stat with progress bar -->
  <div class="rt-{itemtype}-stat rt-{itemtype}-stat--bar">
    <div class="rt-{itemtype}-stat__icon">
      <i class="fas fa-{icon}"></i>
    </div>
    <div class="rt-{itemtype}-stat__content">
      <span class="rt-{itemtype}-stat__label">{Label}</span>
      <span class="rt-{itemtype}-stat__value">{{current}}/{{max}}</span>
    </div>
    <div class="rt-{itemtype}-stat__bar">
      <div class="rt-{itemtype}-stat__bar-fill" style="width: {{percentage}}%"></div>
    </div>
  </div>
</div>
```

### SCSS

```scss
.rt-{itemtype}-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 8px;
  background: var(--rt-panel-bg-solid);
  border-bottom: 1px solid var(--rt-border-color-light);
}

.rt-{itemtype}-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 60px;
  padding: 8px 6px;
  background: var(--rt-panel-bg);
  border-radius: 4px;
  border: 1px solid var(--rt-border-color-light);
  
  &__icon {
    font-size: 1rem;
    color: var(--rt-bronze);
    margin-bottom: 4px;
  }
  
  &__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  
  &__label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--rt-text-muted);
  }
  
  &__value {
    font-family: 'Cinzel', serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--rt-text-dark);
  }
  
  &__bar {
    width: 100%;
    height: 4px;
    margin-top: 4px;
    background: var(--rt-panel-bg-translucent);
    border-radius: 2px;
    overflow: hidden;
  }
  
  &__bar-fill {
    height: 100%;
    background: var(--rt-green-bright);
    transition: width 0.3s ease;
  }
  
  // Stat variants - colored icons/values
  &--damage {
    .rt-{itemtype}-stat__icon { color: var(--rt-red-bright); }
    .rt-{itemtype}-stat__value { color: var(--rt-red-bright); }
  }
  
  &--pen {
    .rt-{itemtype}-stat__icon { color: var(--rt-gold); }
  }
  
  &--critical {
    border-color: var(--rt-red);
    .rt-{itemtype}-stat__bar-fill { background: var(--rt-red-bright); }
    .rt-{itemtype}-stat__value { color: var(--rt-red-bright); }
  }
}
```

### Common Stat Icons

| Stat Type | Icon | Color Variant |
|-----------|------|---------------|
| Damage | `fa-burst` | `--damage` (red) |
| Penetration | `fa-bullseye` | `--pen` (gold) |
| Range | `fa-arrows-left-right` | default |
| Rate of Fire | `fa-bolt` | default |
| Weight | `fa-weight-hanging` | default |
| Clip/Ammo | `fa-database` | dynamic (green/yellow/red) |
| Protection | `fa-shield` | default |
| Armour | `fa-shield-halved` | default |
| Power | `fa-bolt-lightning` | default |

---

## 4. Tab Navigation Pattern

### Structure (CRITICAL - Must match exactly)

```html
<nav class="rt-{itemtype}-tabs" data-group="primary">
  <button type="button" class="rt-{itemtype}-tab active" data-tab="stats" data-group="primary">
    <i class="fas fa-chart-bar"></i>
    <span>Stats</span>
  </button>
  <button type="button" class="rt-{itemtype}-tab" data-tab="qualities" data-group="primary">
    <i class="fas fa-star"></i>
    <span>Qualities</span>
  </button>
  <button type="button" class="rt-{itemtype}-tab" data-tab="description" data-group="primary">
    <i class="fas fa-scroll"></i>
    <span>Info</span>
  </button>
  <button type="button" class="rt-{itemtype}-tab" data-tab="effects" data-group="primary">
    <i class="fas fa-magic"></i>
    <span>Effects</span>
  </button>
</nav>
```

### Tab Content

```html
<section class="rt-{itemtype}-content">
  <!-- First tab: Must have 'active' class -->
  <div class="rt-{itemtype}-panel active" data-tab="stats" data-group="primary">
    <!-- Stats tab content -->
  </div>
  
  <div class="rt-{itemtype}-panel" data-tab="qualities" data-group="primary">
    <!-- Qualities tab content -->
  </div>
  
  <div class="rt-{itemtype}-panel" data-tab="description" data-group="primary">
    <!-- Description tab content -->
  </div>
  
  <div class="rt-{itemtype}-panel" data-tab="effects" data-group="primary">
    {{> systems/rogue-trader/templates/item/panel/active-effects-panel.hbs}}
  </div>
</section>
```

### SCSS

```scss
.rt-{itemtype}-tabs {
  display: flex;
  gap: 2px;
  padding: 0 12px;
  background: var(--rt-panel-bg-solid);
  border-bottom: 1px solid var(--rt-border-color);
}

.rt-{itemtype}-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--rt-text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  
  i {
    font-size: 0.9rem;
  }
  
  &:hover {
    color: var(--rt-text-dark);
    background: var(--rt-panel-bg-translucent);
  }
  
  &.active {
    color: var(--rt-{type}-primary);
    border-bottom-color: var(--rt-{type}-primary);
    background: var(--rt-{type}-bg);
  }
}

.rt-{itemtype}-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  
  // Scrollbar styling
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: var(--rt-panel-bg);
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--rt-border-color);
    border-radius: 4px;
    
    &:hover {
      background: var(--rt-gold-dark);
    }
  }
}

.rt-{itemtype}-panel {
  display: none;
  
  &.active {
    display: block;
  }
}
```

### Common Tab Icons

| Tab Name | Icon |
|----------|------|
| Stats | `fa-chart-bar` |
| Qualities | `fa-star` |
| Description/Info | `fa-scroll` |
| Effects | `fa-magic` |
| Modifiers | `fa-sliders` |
| Rules | `fa-book-open` |
| Notes | `fa-sticky-note` |
| Attack | `fa-crosshairs` |
| Equipment | `fa-suitcase` |

---

## 5. Section Pattern

### Structure

```html
<div class="rt-{itemtype}-section">
  <div class="rt-{itemtype}-section__header">
    <i class="fas fa-{icon}"></i>
    <h3>{Section Title}</h3>
    <!-- Optional: count badge -->
    <span class="rt-{itemtype}-section__count">{{count}}</span>
    <!-- Optional: action button -->
    <button type="button" class="rt-btn rt-btn--small rt-btn--ghost" data-action="{action}">
      <i class="fas fa-plus"></i>
    </button>
  </div>
  <div class="rt-{itemtype}-section__body">
    <!-- Section content -->
  </div>
</div>
```

### SCSS

```scss
.rt-{itemtype}-section {
  background: var(--rt-panel-bg);
  border: 1px solid var(--rt-border-color-light);
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
  
  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: linear-gradient(135deg, var(--rt-accent-overlay) 0%, transparent 100%);
    border-bottom: 1px solid var(--rt-border-color-light);
    
    i {
      font-size: 0.9rem;
      color: var(--rt-bronze);
    }
    
    h3 {
      flex: 1;
      margin: 0;
      font-family: 'Cinzel', serif;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--rt-text-dark);
    }
  }
  
  &__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: var(--rt-talents-bg);
    border: 1px solid var(--rt-talents-border);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--rt-talents-primary);
  }
  
  &__badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    
    &--warning {
      background: var(--rt-warning-bg);
      border: 1px solid var(--rt-warning-primary);
      color: var(--rt-warning-primary);
    }
    
    &--success {
      background: var(--rt-success-bg);
      border: 1px solid var(--rt-success-primary);
      color: var(--rt-success-primary);
    }
  }
  
  &__body {
    padding: 12px;
  }
  
  // Full-width variant (no body padding)
  &--full .rt-{itemtype}-section__body {
    padding: 0;
  }
  
  // Themed section variant
  &--themed {
    border-color: var(--rt-{type}-border);
    
    .rt-{itemtype}-section__header {
      background: linear-gradient(135deg, var(--rt-{type}-bg) 0%, transparent 100%);
      border-bottom-color: var(--rt-{type}-border);
      
      h3 { color: var(--rt-{type}-primary); }
      i { color: var(--rt-{type}-primary); }
    }
  }
}
```

---

## 6. Form Field Patterns

### Standard Field Row

```html
<div class="rt-field-row">
  <div class="rt-field">
    <label>Field Name</label>
    <input type="text" name="system.fieldPath" value="{{item.system.fieldPath}}" />
  </div>
  <div class="rt-field rt-field--small">
    <label>Small Field</label>
    <input type="number" name="system.numberField" value="{{item.system.numberField}}" />
  </div>
</div>
```

### 2-Column Grid

```html
<div class="rt-field-grid rt-field-grid--2col">
  <div class="rt-field">...</div>
  <div class="rt-field">...</div>
  <div class="rt-field">...</div>
  <div class="rt-field">...</div>
</div>
```

### Checkbox Row

```html
<div class="rt-field-row rt-field-row--checkboxes">
  <label class="rt-checkbox">
    <input type="checkbox" name="system.boolField" {{checked item.system.boolField}} />
    <span><i class="fas fa-{icon}"></i> Label</span>
  </label>
  <label class="rt-checkbox">
    <input type="checkbox" name="system.anotherBool" {{checked item.system.anotherBool}} />
    <span><i class="fas fa-{icon}"></i> Another Label</span>
  </label>
</div>
```

### Select Dropdown

```html
<div class="rt-field">
  <label>Selection</label>
  <select name="system.selection">
    {{selectOptions (arrayToObject CONFIG.ROGUE_TRADER.options) selected=item.system.selection}}
  </select>
</div>
```

### Textarea

```html
<div class="rt-field">
  <label>Notes</label>
  <textarea name="system.notes" rows="3" placeholder="Notes...">{{item.system.notes}}</textarea>
</div>
```

### ProseMirror Editor

```html
<div class="rt-prose-editor">
  {{editor item.system.description.value target="system.description.value" 
           button=true editable=true engine="prosemirror"}}
</div>
```

### SCSS

```scss
.rt-field-row {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
  
  &:last-child {
    margin-bottom: 0;
  }
  
  &--checkboxes {
    flex-wrap: wrap;
    gap: 16px;
  }
}

.rt-field-grid {
  display: grid;
  gap: 10px;
  margin-bottom: 10px;
  
  &--2col {
    grid-template-columns: repeat(2, 1fr);
  }
  
  &--3col {
    grid-template-columns: repeat(3, 1fr);
  }
}

.rt-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  
  &--small {
    flex: 0 0 70px;
  }
  
  &--medium {
    flex: 0 0 120px;
  }
  
  label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--rt-text-muted);
  }
  
  input,
  select,
  textarea {
    padding: 6px 10px;
    background: var(--rt-input-bg);
    border: 1px solid var(--rt-border-color-light);
    border-radius: 4px;
    font-size: 0.9rem;
    color: var(--rt-text-dark);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    
    &:focus {
      outline: none;
      border-color: var(--rt-gold);
      box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.2);
    }
  }
  
  input[type="number"] {
    text-align: center;
  }
  
  select {
    cursor: pointer;
  }
  
  textarea {
    resize: vertical;
    min-height: 60px;
  }
}

.rt-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  
  input {
    width: 16px;
    height: 16px;
    accent-color: var(--rt-gold);
  }
  
  span {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85rem;
    color: var(--rt-text-medium);
    
    i {
      font-size: 0.8rem;
    }
  }
}

.rt-prose-editor {
  .prosemirror {
    min-height: 120px;
    padding: 12px;
    background: var(--rt-input-bg);
    border: 1px solid var(--rt-border-color-light);
    border-radius: 4px;
  }
}
```

---

## 7. Badge Patterns

### Type/Category Badge

```html
<span class="rt-{itemtype}-badge rt-{itemtype}-badge--{variant}" title="Tooltip">
  <i class="fas fa-{icon}"></i>
  {Label}
</span>
```

### SCSS

```scss
.rt-{itemtype}-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  
  // Type variant
  &--type {
    background: var(--rt-panel-bg-translucent);
    border: 1px solid var(--rt-border-color-light);
    color: var(--rt-text-medium);
  }
  
  // Primary/Class variant
  &--class {
    background: var(--rt-{type}-bg);
    border: 1px solid var(--rt-{type}-border);
    color: var(--rt-{type}-primary);
  }
  
  // Craftsmanship variants
  &--craft {
    border: 1px solid;
    
    &.rt-{itemtype}-badge--poor {
      background: rgba(139, 0, 0, 0.1);
      border-color: rgba(139, 0, 0, 0.4);
      color: var(--rt-red);
    }
    
    &.rt-{itemtype}-badge--common {
      background: var(--rt-panel-bg-translucent);
      border-color: var(--rt-border-color-light);
      color: var(--rt-text-muted);
    }
    
    &.rt-{itemtype}-badge--good {
      background: rgba(45, 90, 45, 0.1);
      border-color: rgba(45, 90, 45, 0.4);
      color: var(--rt-green);
    }
    
    &.rt-{itemtype}-badge--best,
    &.rt-{itemtype}-badge--master-crafted {
      background: rgba(212, 175, 55, 0.15);
      border-color: rgba(212, 175, 55, 0.5);
      color: var(--rt-gold);
    }
  }
  
  // Status variants
  &--success {
    background: var(--rt-success-bg);
    border: 1px solid var(--rt-success-primary);
    color: var(--rt-success-primary);
  }
  
  &--warning {
    background: var(--rt-warning-bg);
    border: 1px solid var(--rt-warning-primary);
    color: var(--rt-warning-primary);
  }
  
  &--danger {
    background: var(--rt-danger-bg);
    border: 1px solid var(--rt-danger-primary);
    color: var(--rt-danger-primary);
  }
}
```

### Quality Tag (for weapon qualities, traits, etc.)

```html
<span class="rt-quality-tag" data-tooltip="{{quality.description}}" data-tooltip-direction="UP">
  {{quality.label}}{{#if quality.level}} ({{quality.level}}){{/if}}
</span>
```

```scss
.rt-quality-tag {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--rt-panel-bg);
  border: 1px solid var(--rt-talents-border);
  color: var(--rt-talents-primary);
  cursor: help;
  transition: all 0.2s ease;
  
  &:hover {
    background: var(--rt-talents-bg);
    transform: translateY(-1px);
    box-shadow: 0 2px 6px var(--rt-shadow-soft);
  }
}
```

---

## 8. Color Theming by Item Type

### Setting Theme Colors

Define CSS custom properties for each item type at the sheet level:

```scss
// Weapon - Combat Red
.rt-weapon-sheet {
  --rt-type-primary: var(--rt-combat-primary);
  --rt-type-bg: var(--rt-combat-bg);
  --rt-type-border: var(--rt-combat-border);
}

// Armour - Equipment Teal
.rt-armour-sheet {
  --rt-type-primary: var(--rt-equipment-primary);
  --rt-type-bg: var(--rt-equipment-bg);
  --rt-type-border: var(--rt-equipment-border);
}

// Talent - Bronze/Gold
.rt-talent-sheet {
  --rt-type-primary: var(--rt-talents-primary);
  --rt-type-bg: var(--rt-talents-bg);
  --rt-type-border: var(--rt-talents-border);
}

// Psychic Power - Purple
.rt-psychicPower-sheet {
  --rt-type-primary: var(--rt-powers-primary);
  --rt-type-bg: var(--rt-powers-bg);
  --rt-type-border: var(--rt-powers-border);
}

// Skill - Blue/Teal
.rt-skill-sheet {
  --rt-type-primary: var(--rt-skills-primary);
  --rt-type-bg: var(--rt-skills-bg);
  --rt-type-border: var(--rt-skills-border);
}
```

### Available Panel Theme Colors

| Theme | Primary Variable | Background | Border | Use Case |
|-------|-----------------|------------|--------|----------|
| Combat | `--rt-combat-*` | #a82020 | Red/Crimson | Weapons, attacks |
| Equipment | `--rt-equipment-*` | #3a5f5f | Teal | Armour, gear |
| Talents | `--rt-talents-*` | #a07818 | Bronze/Gold | Talents, traits |
| Skills | `--rt-skills-*` | #2a7a9a | Blue | Skills |
| Powers | `--rt-powers-*` | #6a2090 | Purple | Psychic, powers |
| Dynasty | `--rt-dynasty-*` | #d4a520 | Imperial Gold | Dynasty items |
| Wounds | `--rt-wounds-*` | #8b0000 | Red | Health-related |
| Fatigue | `--rt-fatigue-*` | #a07818 | Amber | Fatigue items |

---

## 9. CSS Custom Properties Reference

### Core Theme Colors

```scss
// Gold / Bronze (Imperial accents)
--rt-gold: #d4af37;
--rt-gold-bright: #ffd700;
--rt-gold-dark: #b8941f;
--rt-bronze: #cd7f32;

// Combat/Danger
--rt-red: #8b0000;
--rt-red-bright: #dc143c;

// Success/Health
--rt-green: #2d5a2d;
--rt-green-bright: #4ade80;
```

### Backgrounds (Theme-Adaptive)

```scss
// Sheet backgrounds
--rt-sheet-bg          // Main sheet background
--rt-sheet-bg-alt      // Alternate sheet background

// Panel backgrounds
--rt-panel-bg          // Panel background
--rt-panel-bg-solid    // Solid panel background
--rt-panel-bg-translucent

// Input backgrounds
--rt-input-bg
--rt-input-bg-focus
```

### Text Colors (Theme-Adaptive)

```scss
--rt-text-dark    // Primary text
--rt-text-medium  // Secondary text
--rt-text-muted   // Muted/subtle text
--rt-text-subtle  // Very subtle text
```

### Border Colors (Theme-Adaptive)

```scss
--rt-border-color        // Standard border
--rt-border-color-light  // Subtle border
--rt-border-color-strong // Strong border
```

### Shadows

```scss
--rt-shadow-soft    // Subtle shadow
--rt-shadow-medium  // Standard shadow
```

---

## 10. Typography

### Font Families

```scss
// Display/Headers (Cinzel)
font-family: 'Cinzel', serif;

// Body text (Roboto)
font-family: 'Roboto', sans-serif;

// Alternative display (IM Fell DW Pica)
font-family: 'IM Fell DW Pica', serif;
```

### Font Sizes

| Size | Value | Use Case |
|------|-------|----------|
| 2xs | 0.625rem | Micro labels |
| xs | 0.7rem | Small badges, counts |
| sm | 0.8rem | Labels, secondary text |
| base | 0.9rem | Body text, inputs |
| md | 1rem | Standard text, stat values |
| lg | 1.2rem | Section headers |
| xl | 1.5rem | Item names |
| xxl | 2rem | Large display text |

### Standard Text Styles

```scss
// Item name
.rt-{itemtype}-header__name {
  font-family: 'Cinzel', serif;
  font-size: 1.3rem;
  font-weight: 600;
}

// Section header
.rt-{itemtype}-section__header h3 {
  font-family: 'Cinzel', serif;
  font-size: 0.95rem;
  font-weight: 600;
}

// Field label
label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

// Stat value
.rt-{itemtype}-stat__value {
  font-family: 'Cinzel', serif;
  font-size: 1rem;
  font-weight: 700;
}

// Badge
.rt-{itemtype}-badge {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
```

---

## 11. SCSS File Structure

### File Location

All item sheet SCSS files go in: `src/scss/item/`

### File Naming

- `_weapon.scss` - Weapon sheet styles
- `_armour.scss` - Armour sheet styles
- `_talent.scss` - Talent sheet styles
- `_{itemtype}.scss` - Pattern for all item types

### File Structure Template

```scss
// ============================================
// Rogue Trader {ItemType} Sheet Styles
// ============================================
// Modern, information-dense {itemtype} display
// Uses theme-aware CSS custom properties

// ============================================
// SHEET BASE
// ============================================

.rt-{itemtype}-sheet {
  // ... base styles
}

// ============================================
// HEADER
// ============================================

.rt-{itemtype}-header {
  // ... header styles
}

// ============================================
// BADGES
// ============================================

.rt-{itemtype}-badge {
  // ... badge styles
}

// ============================================
// STATS BAR
// ============================================

.rt-{itemtype}-stats {
  // ... stats bar styles
}

// ============================================
// TAB NAVIGATION
// ============================================

.rt-{itemtype}-tabs {
  // ... tab styles
}

// ============================================
// TAB CONTENT
// ============================================

.rt-{itemtype}-content {
  // ... content styles
}

// ============================================
// SECTIONS
// ============================================

.rt-{itemtype}-section {
  // ... section styles
}

// ============================================
// FORM FIELDS
// ============================================

// Field rows, inputs, checkboxes...

// ============================================
// SPECIFIC COMPONENTS
// ============================================

// Item-specific components...

// ============================================
// BUTTONS
// ============================================

.rt-btn {
  // ... button styles (if not using global)
}

// ============================================
// EMPTY STATES
// ============================================

.rt-empty-message {
  // ... empty state styles
}
```

### Importing

Add import to `src/scss/rogue-trader.scss`:

```scss
@import 'item/{itemtype}';
```

---

## 12. Complete Examples

### Minimal Item Sheet (Basic Template)

```html
<div class="rt-{itemtype}-sheet">
  <form autocomplete="off">
    
    {{!-- Header --}}
    <header class="rt-{itemtype}-header">
      <div class="rt-{itemtype}-header__image" data-action="editImage" data-edit="img">
        <img src="{{item.img}}" alt="{{item.name}}" />
        <div class="rt-{itemtype}-header__image-overlay">
          <i class="fas fa-edit"></i>
        </div>
      </div>
      <div class="rt-{itemtype}-header__info">
        <input type="text" class="rt-{itemtype}-header__name" name="name" value="{{item.name}}" />
        <div class="rt-{itemtype}-header__meta">
          <span class="rt-{itemtype}-badge rt-{itemtype}-badge--type">
            <i class="fas fa-cube"></i>
            {{item.type}}
          </span>
        </div>
      </div>
    </header>

    {{!-- Tabs --}}
    <nav class="rt-{itemtype}-tabs" data-group="primary">
      <button type="button" class="rt-{itemtype}-tab active" data-tab="details" data-group="primary">
        <i class="fas fa-info-circle"></i>
        <span>Details</span>
      </button>
      <button type="button" class="rt-{itemtype}-tab" data-tab="effects" data-group="primary">
        <i class="fas fa-magic"></i>
        <span>Effects</span>
      </button>
    </nav>

    {{!-- Content --}}
    <section class="rt-{itemtype}-content">
      
      {{!-- Details Tab --}}
      <div class="rt-{itemtype}-panel active" data-tab="details" data-group="primary">
        <div class="rt-{itemtype}-section">
          <div class="rt-{itemtype}-section__header">
            <i class="fas fa-scroll"></i>
            <h3>Description</h3>
          </div>
          <div class="rt-{itemtype}-section__body">
            <div class="rt-prose-editor">
              {{editor item.system.description.value target="system.description.value" 
                       button=true editable=true engine="prosemirror"}}
            </div>
          </div>
        </div>
      </div>
      
      {{!-- Effects Tab --}}
      <div class="rt-{itemtype}-panel" data-tab="effects" data-group="primary">
        {{> systems/rogue-trader/templates/item/panel/active-effects-panel.hbs}}
      </div>
      
    </section>
  </form>
</div>
```

---

## 13. Item Sheet Checklist

Use this checklist when creating a new item sheet:

### Structure
- [ ] Container with `.rt-{itemtype}-sheet` class
- [ ] Form with `autocomplete="off"`
- [ ] Header with image, name input, and meta badges
- [ ] Tab navigation with `data-group="primary"`
- [ ] Tab content sections with matching `data-tab` and `data-group`
- [ ] First tab panel has `active` class

### Header
- [ ] Image with edit overlay
- [ ] Name input with Cinzel font
- [ ] Type badge(s) in meta area
- [ ] Equipped toggle (if applicable)

### Tabs
- [ ] All tabs use `button type="button"` (not anchor tags)
- [ ] Each tab has icon and label span
- [ ] First tab has `active` class
- [ ] All tabs have matching `data-group="primary"`

### Content
- [ ] All panels have matching `data-tab` and `data-group`
- [ ] First panel has `active` class
- [ ] Sections use consistent pattern
- [ ] Effects tab includes effects panel partial

### Styling
- [ ] SCSS file created in `src/scss/item/`
- [ ] Import added to `rogue-trader.scss`
- [ ] Theme colors defined at sheet level
- [ ] All form fields have proper labels
- [ ] Responsive considerations (flex-wrap, min-width)

### Data Binding
- [ ] All inputs use `name="system.{path}"` format
- [ ] Checkboxes use `{{checked item.system.field}}`
- [ ] Selects use `{{selectOptions}}` helper
- [ ] Editor uses ProseMirror engine

---

## Reference Files

| File | Purpose |
|------|---------|
| `src/templates/item/item-weapon-sheet-modern.hbs` | Gold standard template |
| `src/scss/item/_weapon.scss` | Complete SCSS reference |
| `src/scss/abstracts/_variables.scss` | Design tokens |
| `src/scss/abstracts/_gothic-theme.scss` | Theme system |
| `src/templates/item/item-skill-sheet-modern.hbs` | Alternative template |

---

*For the Emperor and the Warrant of Trade!*
