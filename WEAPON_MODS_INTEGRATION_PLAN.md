# Weapon Modifications Full Integration Plan

**Issue**: RogueTraderVTT-q2w  
**Status**: Planning Phase  
**Prerequisites**: RogueTraderVTT-6zd (Data Model Work - COMPLETE)

---

## Executive Summary

This plan details the complete integration of weapon modifications into the weapon sheet UI, connecting the existing data model work to create a seamless user experience for managing weapon modifications, with real-time stat updates and clear visual feedback.

**Completed Foundation (RogueTraderVTT-6zd)**:

- ✅ `modifications` array schema in WeaponData
- ✅ `_aggregateModificationModifiers()` aggregation method
- ✅ `effective*` getters (damage, penetration, toHit, range, weight)
- ✅ `cachedModifiers` schema for display optimization

**This Integration Task**:

- Nested item management (drag-drop, edit, delete)
- Real-time stat aggregation display
- Active/inactive toggle for modifications
- Visual distinction between base and modified stats
- Quality addition/removal from modifications

---

## 1. Architecture & Data Flow

### 1.1 Current State Analysis

**DataModel Layer** (`src/module/data/item/weapon.mjs`):

```javascript
// Schema (lines 74-92)
modifications: ArrayField([{
  uuid: String,           // Reference to modification item
  name: String,           // Cached name for display
  active: Boolean,        // Toggle state
  cachedModifiers: {      // Pre-aggregated for performance
    damage: Number,
    penetration: Number,
    toHit: Number,
    range: Number,
    weight: Number
  }
}])

// Aggregation (lines 153-173)
_aggregateModificationModifiers() {
  this._modificationModifiers = { damage: 0, pen: 0, toHit: 0, range: 0, weight: 0 };
  for (const mod of this.modifications) {
    if (mod.active && mod.cachedModifiers) {
      // Sum all active modifiers
    }
  }
}

// Effective getters (lines 305-363)
get effectiveDamageFormula()    // base + craft + mods
get effectivePenetration()      // base + mods
get effectiveToHit()            // craft + mods
get effectiveRange()            // base + mods
get effectiveWeight()           // base + mods
```

**WeaponModificationData** (`src/module/data/item/weapon-modification.mjs`):

```javascript
// Full modifier schema (lines 38-51)
modifiers: {
  damage: Number,
  penetration: Number,
  range: Number,
  rangeMultiplier: Number,
  clip: Number,
  toHit: Number,
  weight: Number,
  rateOfFire: { single, semi, full }
}

// Quality management (lines 54-63)
addedQualities: Set<String>,    // Adds new qualities
removedQualities: Set<String>   // Removes existing qualities

// Restrictions (lines 26-35)
restrictions: {
  weaponClasses: Set<String>,   // melee, pistol, basic, heavy, thrown, exotic
  weaponTypes: Set<String>      // las, solid-projectile, bolt, plasma, etc.
}
```

### 1.2 Integration Points

```
┌─────────────────────────────────────────────────────────────────┐
│                        Weapon Sheet UI                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  STAT BAR (Overview)                                     │  │
│  │  Shows: effective* values with visual indicators        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              ↑                                  │
│                              │ Read effective* getters          │
│                              │                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  MODIFICATIONS TAB (Qualities Tab)                       │  │
│  │  - List of modification cards                            │  │
│  │  - Active/inactive toggle                                │  │
│  │  - Drag-drop zone                                        │  │
│  │  - Edit/Delete actions                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ↓ Update modifications array       │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ↓
┌──────────────────────────────────────────────────────────────────┐
│                    WeaponData.modifications[]                    │
│  [{ uuid, name, active, cachedModifiers }, ...]                  │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ↓ prepareDerivedData()
┌──────────────────────────────────────────────────────────────────┐
│            _aggregateModificationModifiers()                     │
│  Sums all active mod cachedModifiers → _modificationModifiers   │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ↓ Used by getters
┌──────────────────────────────────────────────────────────────────┐
│                    Effective Stat Getters                        │
│  effectiveDamageFormula, effectivePenetration, etc.             │
└──────────────────────────────────────────────────────────────────┘
```

### 1.3 Reference Architecture Pattern

**Existing Pattern**: Talent Grants Display (src/templates/item/talent-sheet-v2.hbs:271-295)

```handlebars
{{#if grantsData.hasSpecialAbilities}}
    <div class='rt-abilities-list'>
        {{#each grantsData.specialAbilities}}
            <div class='rt-ability-card'>
                <h4 class='rt-ability-name'>{{this.name}}</h4>
                <div class='rt-ability-description'>{{{this.description}}}</div>
            </div>
        {{/each}}
    </div>
{{/if}}
```

**Apply to Modifications**: Similar card-based display with:

- Modification name and icon
- Active/inactive toggle
- Quick stats summary (cached modifiers)
- Edit/Delete actions
- Drag handle for reordering

---

## 2. Nested Item Management Strategy

### 2.1 NOT Using Nested Documents

**CRITICAL DECISION**: The `modifications` array stores **references** (UUIDs), NOT embedded documents.

**Why NOT use nested documents**:

1. WeaponModification items should remain in compendiums/world items
2. Multiple weapons can share the same modification reference
3. Avoid data duplication
4. Simpler update flow (single source of truth)
5. Easier to update modification definitions globally

**Storage Pattern**:

```javascript
// Weapon system.modifications array
[
    {
        uuid: 'Compendium.rogue-trader.rt-items-weapon-mods.Item.abc123',
        name: 'Red Dot Sight', // Cached for display
        active: true,
        cachedModifiers: {
            // Cached from source at add time
            damage: 0,
            penetration: 0,
            toHit: 10,
            range: 0,
            weight: 0.5,
        },
    },
];
```

### 2.2 Modification Lifecycle

#### Adding a Modification

```javascript
// Action: addModification
static async #addModification(event, target) {
  // Option 1: Open compendium browser (future)
  // Option 2: Drag-drop from compendium (current)

  // User drags weaponModification item onto weapon sheet
  // → Triggers _onDrop in WeaponSheet
}

async _onDrop(event) {
  const data = JSON.parse(event.dataTransfer.getData("text/plain"));
  const droppedItem = await fromUuid(data.uuid);

  if (droppedItem.type !== "weaponModification") return;

  // Validation
  if (!this._canAddModification(droppedItem)) return;

  // Create modification reference entry
  const modEntry = {
    uuid: droppedItem.uuid,
    name: droppedItem.name,
    active: true,
    cachedModifiers: {
      damage: droppedItem.system.modifiers.damage,
      penetration: droppedItem.system.modifiers.penetration,
      toHit: droppedItem.system.modifiers.toHit,
      range: droppedItem.system.modifiers.range,
      weight: droppedItem.system.modifiers.weight
    }
  };

  // Add to array
  const mods = [...this.item.system.modifications, modEntry];
  await this.item.update({ "system.modifications": mods });
}
```

#### Validation Rules

```javascript
_canAddModification(modItem) {
  const weapon = this.item.system;

  // Check restrictions
  const restrictions = modItem.system.restrictions;

  // Weapon class restriction
  if (restrictions.weaponClasses.size > 0) {
    if (!restrictions.weaponClasses.has(weapon.class)) {
      ui.notifications.warn(`${modItem.name} cannot be installed on ${weapon.classLabel} weapons.`);
      return false;
    }
  }

  // Weapon type restriction
  if (restrictions.weaponTypes.size > 0) {
    if (!restrictions.weaponTypes.has(weapon.type)) {
      ui.notifications.warn(`${modItem.name} is not compatible with ${weapon.typeLabel} weapons.`);
      return false;
    }
  }

  // Duplicate check
  if (weapon.modifications.some(m => m.uuid === modItem.uuid)) {
    ui.notifications.info(`${modItem.name} is already installed.`);
    return false;
  }

  return true;
}
```

#### Toggle Active/Inactive

```javascript
// Action: toggleModificationActive
static async #toggleModificationActive(event, target) {
  const index = parseInt(target.dataset.modIndex);
  const mods = foundry.utils.deepClone(this.item.system.modifications);

  mods[index].active = !mods[index].active;

  await this.item.update({ "system.modifications": mods });
  // prepareDerivedData() runs automatically → re-aggregates modifiers
}
```

#### Remove Modification

```javascript
// Action: removeModification
static async #removeModification(event, target) {
  const index = parseInt(target.dataset.modIndex);
  const mod = this.item.system.modifications[index];

  const confirmed = await Dialog.confirm({
    title: "Remove Modification",
    content: `<p>Remove <strong>${mod.name}</strong>?</p>`,
    yes: () => true,
    no: () => false
  });

  if (!confirmed) return;

  const mods = this.item.system.modifications.filter((_, i) => i !== index);
  await this.item.update({ "system.modifications": mods });
}
```

#### View/Edit Modification

```javascript
// Action: viewModification
static async #viewModification(event, target) {
  const index = parseInt(target.dataset.modIndex);
  const mod = this.item.system.modifications[index];

  const modItem = await fromUuid(mod.uuid);
  if (!modItem) {
    ui.notifications.error("Modification item not found. It may have been deleted.");
    return;
  }

  modItem.sheet.render(true);
}
```

### 2.3 Drag-Drop Implementation

```javascript
// In WeaponSheet, override _setupContainerDragDrop
_setupContainerDragDrop() {
  const dropZone = this.element.querySelector("[data-drop='modification']");
  if (!dropZone) return;

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("rt-dropzone--active");
  });

  dropZone.addEventListener("dragleave", (e) => {
    dropZone.classList.remove("rt-dropzone--active");
  });

  dropZone.addEventListener("drop", this._onDrop.bind(this));
}
```

---

## 3. Visual Display Design

### 3.1 Modifications Section Layout (Qualities Tab)

**Location**: `item-weapon-sheet-modern.hbs` lines 436-468 (expand existing section)

```handlebars
{{!-- MODIFICATIONS SECTION --}}
<div class="rt-weapon-section rt-weapon-section--modifications">
  <div class="rt-weapon-section__header">
    <i class="fa-solid fa-screwdriver-wrench"></i>
    <h3>Modifications</h3>
    <span class="rt-weapon-section__count">{{system.modifications.length}}</span>
    <button type="button" class="rt-btn rt-btn--small rt-btn--ghost"
            data-action="addModification" title="Add Modification">
      <i class="fa-solid fa-plus"></i>
    </button>
  </div>

  <div class="rt-weapon-section__body">
    {{#if system.modifications.length}}
    <div class="rt-mods-list">
      {{#each system.modifications as |mod index|}}
      <div class="rt-mod-card {{unless mod.active}}rt-mod-card--inactive{{/unless}}"
           data-mod-index="{{index}}">

        {{!-- Mod Header --}}
        <div class="rt-mod-card__header">
          <div class="rt-mod-card__title">
            <i class="fa-solid fa-screwdriver-wrench"></i>
            <span class="rt-mod-card__name">{{mod.name}}</span>
          </div>
          <div class="rt-mod-card__actions">
            {{!-- Active/Inactive Toggle --}}
            <button type="button"
                    class="rt-btn rt-btn--icon rt-mod-toggle {{#if mod.active}}rt-mod-toggle--active{{/if}}"
                    data-action="toggleModificationActive"
                    data-mod-index="{{index}}"
                    title="{{#if mod.active}}Deactivate{{else}}Activate{{/if}}">
              <i class="fa-solid {{#if mod.active}}fa-toggle-on{{else}}fa-toggle-off{{/if}}"></i>
            </button>

            {{!-- View/Edit Button --}}
            <button type="button"
                    class="rt-btn rt-btn--icon"
                    data-action="viewModification"
                    data-mod-index="{{index}}"
                    title="View Details">
              <i class="fa-solid fa-eye"></i>
            </button>

            {{!-- Remove Button --}}
            <button type="button"
                    class="rt-btn rt-btn--icon rt-btn--danger"
                    data-action="removeModification"
                    data-mod-index="{{index}}"
                    title="Remove">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>

        {{!-- Mod Effects Summary --}}
        {{#if mod.cachedModifiers}}
        <div class="rt-mod-card__effects">
          {{#if (ne mod.cachedModifiers.damage 0)}}
          <span class="rt-mod-effect {{#if (gt mod.cachedModifiers.damage 0)}}rt-mod-effect--positive{{else}}rt-mod-effect--negative{{/if}}">
            <i class="fa-solid fa-burst"></i>
            {{#if (gt mod.cachedModifiers.damage 0)}}+{{/if}}{{mod.cachedModifiers.damage}} Dmg
          </span>
          {{/if}}

          {{#if (ne mod.cachedModifiers.penetration 0)}}
          <span class="rt-mod-effect {{#if (gt mod.cachedModifiers.penetration 0)}}rt-mod-effect--positive{{else}}rt-mod-effect--negative{{/if}}">
            <i class="fa-solid fa-bullseye"></i>
            {{#if (gt mod.cachedModifiers.penetration 0)}}+{{/if}}{{mod.cachedModifiers.penetration}} Pen
          </span>
          {{/if}}

          {{#if (ne mod.cachedModifiers.toHit 0)}}
          <span class="rt-mod-effect {{#if (gt mod.cachedModifiers.toHit 0)}}rt-mod-effect--positive{{else}}rt-mod-effect--negative{{/if}}">
            <i class="fa-solid fa-crosshairs"></i>
            {{#if (gt mod.cachedModifiers.toHit 0)}}+{{/if}}{{mod.cachedModifiers.toHit}} Hit
          </span>
          {{/if}}

          {{#if (ne mod.cachedModifiers.range 0)}}
          <span class="rt-mod-effect {{#if (gt mod.cachedModifiers.range 0)}}rt-mod-effect--positive{{else}}rt-mod-effect--negative{{/if}}">
            <i class="fa-solid fa-arrows-left-right"></i>
            {{#if (gt mod.cachedModifiers.range 0)}}+{{/if}}{{mod.cachedModifiers.range}}m Range
          </span>
          {{/if}}

          {{#if (ne mod.cachedModifiers.weight 0)}}
          <span class="rt-mod-effect rt-mod-effect--neutral">
            <i class="fa-solid fa-weight-hanging"></i>
            {{#if (gt mod.cachedModifiers.weight 0)}}+{{/if}}{{mod.cachedModifiers.weight}}kg
          </span>
          {{/if}}
        </div>
        {{/if}}
      </div>
      {{/each}}
    </div>
    {{else}}
    <div class="rt-dropzone rt-dropzone--mods" data-drop="modification">
      <i class="fa-solid fa-screwdriver-wrench"></i>
      <p>Drag modifications here to install them</p>
      <span class="rt-dropzone__hint">Or click + to browse compendium</span>
    </div>
    {{/if}}
  </div>
</div>
```

### 3.2 Base vs Effective Stats Display (Stats Tab)

**Location**: `item-weapon-sheet-modern.hbs` lines 56-128 (stat bar section)

**Strategy**: Show effective values prominently, with tooltip showing breakdown:

```handlebars
{{!-- Enhanced Damage Stat with Modification Indicator --}}
<div class="rt-weapon-stat rt-weapon-stat--damage {{#if (hasModifications system)}}rt-weapon-stat--modified{{/if}}">
  <div class="rt-weapon-stat__icon">
    <i class="fa-solid fa-burst"></i>
    {{#if (hasModifications system)}}
    <span class="rt-weapon-stat__modified-badge" title="Modified by equipment">
      <i class="fa-solid fa-screwdriver-wrench"></i>
    </span>
    {{/if}}
  </div>
  <div class="rt-weapon-stat__content">
    <span class="rt-weapon-stat__label">Damage</span>
    <span class="rt-weapon-stat__value"
          data-tooltip="{{#if (hasModifications system)}}{{damageBreakdown system}}{{/if}}"
          data-tooltip-direction="UP">
      {{system.effectiveDamageFormula}}
    </span>
  </div>
</div>
```

**Handlebars Helper** (add to `src/module/handlebars/helpers.mjs`):

```javascript
Handlebars.registerHelper('hasModifications', (system) => {
    return system.modifications?.some((m) => m.active) ?? false;
});

Handlebars.registerHelper('damageBreakdown', (system) => {
    const base = system.damage.formula + (system.damage.bonus > 0 ? `+${system.damage.bonus}` : '');
    const craft = system.craftsmanshipModifiers.damage;
    const mods = system._modificationModifiers?.damage ?? 0;

    let breakdown = `Base: ${base}`;
    if (craft !== 0) breakdown += `\nCraftsmanship: ${craft > 0 ? '+' : ''}${craft}`;
    if (mods !== 0) breakdown += `\nModifications: ${mods > 0 ? '+' : ''}${mods}`;
    breakdown += `\n━━━━━━━━━\nTotal: ${system.effectiveDamageFormula}`;

    return breakdown;
});
```

### 3.3 Modifications Effects Banner (Overview Tab)

**Location**: After stat bar, before tabs (line ~150)

```handlebars
{{! Modifications Active Banner }}
{{#if (hasActiveModifications system)}}
    <div class='rt-weapon-banner rt-weapon-banner--mods'>
        <div class='rt-weapon-banner__icon'>
            <i class='fa-solid fa-screwdriver-wrench'></i>
        </div>
        <div class='rt-weapon-banner__content'>
            <span class='rt-weapon-banner__label'>
                {{system.modifications.length}}
                modification{{#if (gt system.modifications.length 1)}}s{{/if}}
                installed
            </span>
            <span class='rt-weapon-banner__details'>
                {{modsEffectSummary system}}
            </span>
        </div>
        <button type='button' class='rt-weapon-banner__link' data-tab='qualities'>
            View Details
            <i class='fa-solid fa-chevron-right'></i>
        </button>
    </div>
{{/if}}
```

**Helper**:

```javascript
Handlebars.registerHelper('modsEffectSummary', (system) => {
    const mods = system._modificationModifiers ?? {};
    const effects = [];

    if (mods.damage !== 0) effects.push(`${mods.damage > 0 ? '+' : ''}${mods.damage} Dmg`);
    if (mods.penetration !== 0) effects.push(`${mods.penetration > 0 ? '+' : ''}${mods.penetration} Pen`);
    if (mods.toHit !== 0) effects.push(`${mods.toHit > 0 ? '+' : ''}${mods.toHit} Hit`);
    if (mods.range !== 0) effects.push(`${mods.range > 0 ? '+' : ''}${mods.range}m Range`);

    return effects.length > 0 ? effects.join(', ') : 'No stat changes';
});
```

### 3.4 SCSS Styling

**New file**: `src/scss/components/_weapon-modifications.scss`

```scss
// ═══════════════════════════════════════════════════════════════════
// WEAPON MODIFICATIONS
// ═══════════════════════════════════════════════════════════════════

.rt-mods-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.rt-mod-card {
    background: rgba($color-secondary-dark, 0.3);
    border: 1px solid rgba($color-gold-dim, 0.3);
    border-radius: $border-radius-sm;
    padding: 0.75rem;
    transition: all $transition-speed-normal;

    &:hover {
        border-color: rgba($color-gold, 0.5);
        box-shadow: 0 2px 8px rgba($color-gold, 0.1);
    }

    // Inactive state
    &--inactive {
        opacity: 0.5;
        border-color: rgba($color-text-muted, 0.3);

        .rt-mod-card__name {
            text-decoration: line-through;
        }
    }

    &__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }

    &__title {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        i {
            color: $color-gold;
        }
    }

    &__name {
        font-weight: 600;
        color: $color-text-primary;
    }

    &__actions {
        display: flex;
        gap: 0.25rem;
    }

    &__effects {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
}

.rt-mod-effect {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: rgba($color-secondary-dark, 0.5);
    border-radius: $border-radius-xs;
    font-size: 0.875rem;

    i {
        font-size: 0.75rem;
    }

    &--positive {
        color: $color-success;
        border: 1px solid rgba($color-success, 0.3);

        i {
            color: $color-success;
        }
    }

    &--negative {
        color: $color-danger;
        border: 1px solid rgba($color-danger, 0.3);

        i {
            color: $color-danger;
        }
    }

    &--neutral {
        color: $color-text-secondary;
        border: 1px solid rgba($color-text-muted, 0.3);
    }
}

.rt-mod-toggle {
    &--active {
        color: $color-success;
    }
}

// Modified stat indicator
.rt-weapon-stat {
    &--modified {
        position: relative;

        .rt-weapon-stat__value {
            color: $color-gold;
            font-weight: 600;
        }
    }

    &__modified-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        width: 16px;
        height: 16px;
        background: $color-gold;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;

        i {
            font-size: 0.5rem;
            color: $color-background-dark;
        }
    }
}

// Modifications banner
.rt-weapon-banner--mods {
    background: linear-gradient(90deg, rgba($color-gold, 0.15), rgba($color-gold, 0.05));
    border-left: 3px solid $color-gold;

    .rt-weapon-banner__icon {
        color: $color-gold;
    }
}

// Dropzone
.rt-dropzone--mods {
    min-height: 120px;
    border: 2px dashed rgba($color-gold-dim, 0.3);
    border-radius: $border-radius-md;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
    transition: all $transition-speed-normal;

    i {
        font-size: 2rem;
        color: $color-text-muted;
        margin-bottom: 0.5rem;
    }

    p {
        color: $color-text-secondary;
        font-size: 1rem;
        margin-bottom: 0.25rem;
    }

    &__hint {
        font-size: 0.875rem;
        color: $color-text-muted;
    }

    &--active {
        border-color: $color-gold;
        background: rgba($color-gold, 0.1);

        i {
            color: $color-gold;
        }
    }
}
```

---

## 4. Action Handlers Specification

### 4.1 WeaponSheet Action Additions

**Location**: `src/module/applications/item/weapon-sheet.mjs`

```javascript
export default class WeaponSheet extends ContainerItemSheet {
    static DEFAULT_OPTIONS = {
        actions: {
            ...super.DEFAULT_OPTIONS.actions,
            reload: WeaponSheet.#onReload, // Existing
            addModification: WeaponSheet.#onAddModification, // Existing (stub)
            toggleModificationActive: WeaponSheet.#toggleModificationActive, // NEW
            viewModification: WeaponSheet.#viewModification, // NEW
            removeModification: WeaponSheet.#removeModification, // NEW
        },
    };

    /**
     * Toggle a modification's active state.
     * @param {Event} event - Triggering event
     * @param {HTMLElement} target - Button that was clicked
     */
    static async #toggleModificationActive(event, target) {
        const index = parseInt(target.dataset.modIndex, 10);
        if (isNaN(index)) return;

        const mods = foundry.utils.deepClone(this.item.system.modifications);
        if (index < 0 || index >= mods.length) return;

        mods[index].active = !mods[index].active;

        await this.item.update({ 'system.modifications': mods });

        const mod = mods[index];
        ui.notifications.info(`${mod.name} ${mod.active ? 'activated' : 'deactivated'}.`);
    }

    /**
     * View/edit a modification's details.
     * @param {Event} event - Triggering event
     * @param {HTMLElement} target - Button that was clicked
     */
    static async #viewModification(event, target) {
        const index = parseInt(target.dataset.modIndex, 10);
        if (isNaN(index)) return;

        const mod = this.item.system.modifications[index];
        if (!mod) return;

        const modItem = await fromUuid(mod.uuid);
        if (!modItem) {
            ui.notifications.error(`Modification "${mod.name}" not found. It may have been deleted.`);
            return;
        }

        modItem.sheet.render(true);
    }

    /**
     * Remove a modification from the weapon.
     * @param {Event} event - Triggering event
     * @param {HTMLElement} target - Button that was clicked
     */
    static async #removeModification(event, target) {
        const index = parseInt(target.dataset.modIndex, 10);
        if (isNaN(index)) return;

        const mod = this.item.system.modifications[index];
        if (!mod) return;

        const confirmed = await Dialog.confirm({
            title: 'Remove Modification',
            content: `<p>Remove <strong>${mod.name}</strong> from this weapon?</p>`,
            yes: () => true,
            no: () => false,
        });

        if (!confirmed) return;

        const mods = this.item.system.modifications.filter((_, i) => i !== index);
        await this.item.update({ 'system.modifications': mods });

        ui.notifications.info(`${mod.name} removed.`);
    }

    /**
     * Enhanced add modification handler (replace stub).
     * @param {Event} event - Triggering event
     * @param {HTMLElement} target - Button that was clicked
     */
    static async #onAddModification(event, target) {
        // Future: Open compendium browser filtered to weaponModification type
        // For now, show instruction
        ui.notifications.info('Drag a weapon modification from the compendium to install it.');
    }

    /**
     * Override drop handler to support modification drops.
     * @param {DragEvent} event - Drop event
     */
    async _onDrop(event) {
        event.preventDefault();

        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        } catch (err) {
            return false;
        }

        if (data.type !== 'Item') return false;

        const droppedItem = await fromUuid(data.uuid);
        if (!droppedItem) return false;

        // Handle weaponModification drops
        if (droppedItem.type === 'weaponModification') {
            return this._onDropModification(droppedItem);
        }

        // Fallback to parent container behavior for other item types
        return super._onDrop(event);
    }

    /**
     * Handle dropping a weaponModification onto the weapon.
     * @param {Item} modItem - The modification item
     * @returns {Promise<boolean>}
     * @private
     */
    async _onDropModification(modItem) {
        // Validate
        if (!this._canAddModification(modItem)) {
            return false;
        }

        // Create modification entry
        const modEntry = {
            uuid: modItem.uuid,
            name: modItem.name,
            active: true,
            cachedModifiers: {
                damage: modItem.system.modifiers.damage ?? 0,
                penetration: modItem.system.modifiers.penetration ?? 0,
                toHit: modItem.system.modifiers.toHit ?? 0,
                range: modItem.system.modifiers.range ?? 0,
                weight: modItem.system.modifiers.weight ?? 0,
            },
        };

        // Add to array
        const mods = [...this.item.system.modifications, modEntry];
        await this.item.update({ 'system.modifications': mods });

        ui.notifications.info(`${modItem.name} installed.`);
        return true;
    }

    /**
     * Check if a modification can be added to this weapon.
     * @param {Item} modItem - The modification item
     * @returns {boolean}
     * @private
     */
    _canAddModification(modItem) {
        const weapon = this.item.system;
        const restrictions = modItem.system.restrictions;

        // Check weapon class restriction
        if (restrictions.weaponClasses.size > 0) {
            if (!restrictions.weaponClasses.has(weapon.class)) {
                ui.notifications.warn(`${modItem.name} cannot be installed on ${weapon.classLabel} weapons.`);
                return false;
            }
        }

        // Check weapon type restriction
        if (restrictions.weaponTypes.size > 0) {
            if (!restrictions.weaponTypes.has(weapon.type)) {
                ui.notifications.warn(`${modItem.name} is not compatible with ${weapon.typeLabel} weapons.`);
                return false;
            }
        }

        // Check for duplicates
        if (weapon.modifications.some((m) => m.uuid === modItem.uuid)) {
            ui.notifications.info(`${modItem.name} is already installed.`);
            return false;
        }

        return true;
    }
}
```

---

## 5. Quality Addition/Removal (Future Enhancement)

**Status**: Phase 2 (not in initial integration)

**Why defer**:

- Core stat modification functionality is highest priority
- Quality management adds complexity
- Needs design decisions on display (merged vs separate lists)

**When implemented**:

### 5.1 Schema Extension

```javascript
// In weapon.mjs modifications array
{
  uuid: String,
  name: String,
  active: Boolean,
  cachedModifiers: {...},
  addedQualities: Set<String>,      // NEW
  removedQualities: Set<String>     // NEW
}
```

### 5.2 Aggregation in prepareDerivedData

```javascript
prepareDerivedData() {
  super.prepareDerivedData();
  this._aggregateModificationModifiers();
  this._aggregateModificationQualities();  // NEW
}

_aggregateModificationQualities() {
  // Start with base qualities
  const baseQualities = new Set(this.special);

  // Apply modifications
  for (const mod of this.modifications) {
    if (!mod.active) continue;

    // Add qualities
    for (const quality of mod.addedQualities) {
      baseQualities.add(quality);
    }

    // Remove qualities
    for (const quality of mod.removedQualities) {
      baseQualities.delete(quality);
    }
  }

  // Store as derived property
  this._effectiveQualities = baseQualities;
}
```

### 5.3 Display Strategy

**Option A**: Merged list with indicators

```handlebars
{{#each qualitiesArray as |quality|}}
    <div class='rt-quality-card {{quality.source}}'>
        {{#if (eq quality.source 'base')}}
            <i class='fa-solid fa-circle'></i>
        {{else if (eq quality.source 'mod')}}
            <i class='fa-solid fa-screwdriver-wrench'></i>
        {{/if}}
        {{quality.label}}
    </div>
{{/each}}
```

**Option B**: Separate sections

```handlebars
<div class='rt-qualities-base'>...</div>
<div class='rt-qualities-from-mods'>...</div>
```

---

## 6. Edge Cases & Error Handling

### 6.1 Missing Modification Item

**Scenario**: Modification UUID no longer exists (deleted from compendium/world)

**Solution**:

```javascript
// In _prepareContext
async _prepareContext(options) {
  const context = await super._prepareContext(options);

  // Validate modifications
  const validatedMods = [];
  for (const mod of this.item.system.modifications) {
    const modItem = await fromUuid(mod.uuid);
    validatedMods.push({
      ...mod,
      isValid: !!modItem,
      isBroken: !modItem
    });
  }

  context.modifications = validatedMods;
  return context;
}
```

**Display**:

```handlebars
{{#if mod.isBroken}}
    <div class='rt-mod-card rt-mod-card--broken'>
        <i class='fa-solid fa-triangle-exclamation'></i>
        {{mod.name}}
        (Missing)
        <button data-action='removeModification' data-mod-index='{{index}}'>
            Remove
        </button>
    </div>
{{/if}}
```

### 6.2 Multiple Mods with Conflicting Effects

**Scenario**: Two mods both add/remove same quality

**Resolution**: Last-applied wins (array order)

```javascript
// In _aggregateModificationQualities
for (const mod of this.modifications) {
    // Removals processed after additions
    // Later mods override earlier ones
}
```

### 6.3 Ranged vs Melee Specific Mods

**Validation**:

```javascript
_canAddModification(modItem) {
  // ...existing checks...

  // Check if mod is ranged-only on melee weapon
  if (modItem.system.requiresRanged && this.item.system.isMeleeWeapon) {
    ui.notifications.warn(`${modItem.name} can only be installed on ranged weapons.`);
    return false;
  }

  return true;
}
```

**Future schema extension**:

```javascript
// In weapon-modification.mjs
restrictions: {
  weaponClasses: Set,
  weaponTypes: Set,
  requiresRanged: Boolean,   // NEW
  requiresMelee: Boolean     // NEW
}
```

### 6.4 Weight Calculation

**Current**: `effectiveWeight` getter includes modifications

**Ensure**: Encumbrance calculations use `effectiveWeight`, not raw `weight`

**Verify in**: `src/module/utils/encumbrance-calculator.mjs`

```javascript
// Should use:
weapon.system.effectiveWeight;

// NOT:
weapon.system.weight;
```

### 6.5 Disabled Modification Behavior

**When toggled off**:

- `active: false` in modifications array
- `_aggregateModificationModifiers()` skips it (line 164 check)
- Effective stats revert to base + other active mods
- Visual indication in UI (opacity, strikethrough)
- Can be re-enabled without data loss

---

## 7. Testing Checklist

### 7.1 Core Functionality

- [ ] Add modification via drag-drop from compendium
- [ ] Add modification via world items
- [ ] Restriction validation (weapon class)
- [ ] Restriction validation (weapon type)
- [ ] Duplicate prevention
- [ ] Toggle modification active/inactive
- [ ] View modification details (opens sheet)
- [ ] Remove modification (with confirmation)
- [ ] Stats update in real-time on toggle
- [ ] Stats update on add/remove

### 7.2 Display

- [ ] Modification cards show correct data
- [ ] Active/inactive visual state
- [ ] Cached modifiers display correctly
- [ ] Base vs effective stats distinction
- [ ] Stat breakdown tooltips
- [ ] Modifications banner shows correct count
- [ ] Empty state (no mods) displays dropzone
- [ ] Modified stat badges appear

### 7.3 Edge Cases

- [ ] Missing modification item handling
- [ ] Multiple mods stacking correctly
- [ ] Weight calculation includes mods
- [ ] Ranged-only mod on melee weapon rejected
- [ ] Melee-only mod on ranged weapon rejected
- [ ] Save/load weapon with mods
- [ ] Delete weapon with mods (no orphans)
- [ ] Modification order preserved

### 7.4 Integration

- [ ] Works with craftsmanship bonuses
- [ ] Works with equipped/unequipped state
- [ ] Encumbrance uses effective weight
- [ ] Roll damage uses effective formula
- [ ] Attack rolls use effective toHit
- [ ] Chat card shows effective stats

### 7.5 Performance

- [ ] No lag with 5+ modifications
- [ ] prepareDerivedData() doesn't cause render loops
- [ ] Drag-drop responsive
- [ ] Sheet opens quickly with modifications

---

## 8. Implementation Phases

### Phase 1: Core Integration (This Issue)

**Estimated**: 6-8 hours

1. **Hour 1-2**: Action handlers in WeaponSheet
    - `toggleModificationActive`
    - `viewModification`
    - `removeModification`
    - `_onDropModification`
    - `_canAddModification`

2. **Hour 2-3**: Template modifications
    - Expand modifications section in Qualities tab
    - Add modification cards with effects display
    - Add active/inactive toggle UI
    - Add dropzone for empty state

3. **Hour 3-4**: Stats display enhancements
    - Add modified badges to stat bar
    - Add tooltip breakdowns
    - Add modifications banner

4. **Hour 4-5**: SCSS styling
    - Create `_weapon-modifications.scss`
    - Style modification cards
    - Style active/inactive states
    - Style dropzone

5. **Hour 5-6**: Handlebars helpers
    - `hasModifications`
    - `damageBreakdown`
    - `modsEffectSummary`
    - `hasActiveModifications`

6. **Hour 6-8**: Testing & refinement
    - Test all action handlers
    - Test validation rules
    - Test edge cases
    - Polish UI/UX

### Phase 2: Quality Management (Future Issue)

**Estimated**: 4-6 hours

1. Schema extension (cachedQualities in modifications array)
2. `_aggregateModificationQualities()` method
3. Display strategy (merged vs separate)
4. Quality source indicators
5. Testing

### Phase 3: Advanced Features (Future)

**Potential enhancements**:

- Modification prerequisites (requires certain other mods)
- Modification slots (limited number)
- Modification conflicts (incompatible pairs)
- Modification synergies (bonuses for combinations)
- Modification costs (weight, availability penalties)
- Custom modifications (user-created)
- Modification transfer (move between weapons)

---

## 9. Known Limitations

### 9.1 Current Implementation

1. **No nested document support**: Modifications are references only
    - **Impact**: Cannot edit modification inline in weapon sheet
    - **Workaround**: View button opens modification sheet separately
    - **Future**: Could implement inline editing dialog

2. **No modification reordering**: Array order fixed after add
    - **Impact**: Cannot prioritize modification application order
    - **Current**: Not critical (addition is commutative)
    - **Future**: Add drag-to-reorder in modification list

3. **No modification slots**: Unlimited modifications
    - **Impact**: Weapons can have dozens of mods
    - **Current**: GM discretion
    - **Future**: Add `maxModifications` weapon property

4. **Manual cache invalidation**: Cached modifiers don't auto-update
    - **Impact**: If source modification changes, cache stale
    - **Current**: Remove and re-add modification to refresh
    - **Future**: Add "Refresh Cache" button or auto-refresh on view

5. **No quality visualization yet**: Phase 2 feature
    - **Impact**: Added/removed qualities not shown in UI
    - **Current**: Only stat modifiers visible
    - **Phase 2**: Full quality management

### 9.2 Performance Considerations

1. **UUID lookups**: Each modification requires async UUID resolution
    - **Mitigation**: Cached modifiers minimize lookups
    - **Only needed**: View/Edit actions, not display

2. **Deep cloning on toggle**: Full array clone for single toggle
    - **Acceptable**: Modifications array typically small (1-5 items)
    - **Alternative**: Could use targeted update path

3. **prepareDerivedData() runs on every update**: Normal Foundry pattern
    - **Not a concern**: Aggregation is O(n) with small n

---

## 10. File Manifest

### Files to Modify

1. **`src/module/applications/item/weapon-sheet.mjs`**
    - Add 4 new action handlers
    - Override `_onDrop` method
    - Add `_onDropModification` helper
    - Add `_canAddModification` validator
    - ~150 lines added

2. **`src/templates/item/item-weapon-sheet-modern.hbs`**
    - Expand modifications section (lines 436-468)
    - Add modification cards UI
    - Add stat modification indicators
    - Add modifications banner
    - ~100 lines added

3. **`src/module/handlebars/helpers.mjs`**
    - Add 4 new helpers
    - ~60 lines added

4. **`src/scss/components/_weapon-modifications.scss`** (NEW FILE)
    - Complete modification styling
    - ~200 lines

5. **`src/scss/rogue-trader.scss`**
    - Import new \_weapon-modifications partial
    - 1 line added

### Files Created

- `WEAPON_MODS_INTEGRATION_PLAN.md` (this document)

### Files to Reference (No Changes)

- `src/module/data/item/weapon.mjs` (data model - already complete)
- `src/module/data/item/weapon-modification.mjs` (mod schema - already complete)
- `src/module/applications/item/container-item-sheet.mjs` (parent class reference)
- `src/templates/item/talent-sheet-v2.hbs` (UI pattern reference)

---

## 11. Success Criteria

Integration is complete when:

1. ✅ User can drag weaponModification from compendium onto weapon sheet
2. ✅ Modification appears in list with cached stats visible
3. ✅ Toggle button activates/deactivates modification
4. ✅ Weapon effective stats update in real-time on toggle
5. ✅ View button opens modification item sheet
6. ✅ Remove button deletes modification (with confirmation)
7. ✅ Validation prevents incompatible mods (class/type restrictions)
8. ✅ Validation prevents duplicate mods
9. ✅ Base vs modified stats visually distinguished
10. ✅ Empty state shows helpful dropzone
11. ✅ All edge cases handled gracefully (missing items, etc.)
12. ✅ Performance acceptable with multiple modifications
13. ✅ Changes persist across save/load
14. ✅ No console errors or warnings

---

## 12. Post-Implementation Tasks

After core integration is complete:

1. **User Testing**
    - GM feedback on workflow
    - Player feedback on clarity
    - Identify pain points

2. **Documentation**
    - Update AGENTS.md with modifications section
    - Add JSDoc comments to new methods
    - Create user guide for modifications

3. **Compendium Content**
    - Create weapon modification compendium pack
    - Add common mods (scopes, grips, suppressors, etc.)
    - Add exotic mods (xenos tech, archaeotech)

4. **Integration with Other Systems**
    - Encumbrance calculator verification
    - Roll dialog integration (show effective stats)
    - Character creation integration (starting gear mods)

5. **Future Enhancements Queue**
    - Quality management (Phase 2)
    - Modification prerequisites
    - Modification slots
    - Compendium browser integration

---

## End of Plan

**Next Steps**:

1. Review plan with team/stakeholders
2. Create beads issue for Phase 1 implementation
3. Begin implementation following phase breakdown
4. Test iteratively
5. Deploy Phase 1
6. Gather feedback for Phase 2 planning
