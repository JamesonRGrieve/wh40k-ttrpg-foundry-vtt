# Rogue Trader V13 Grand Refactor Plan

**Date**: 2026-01-09
**Status**: Draft for Review
**Goal**: Fix all V13 compatibility issues and modernize the entire Rogue Trader system to fully utilize Foundry V13 capabilities

---

## Executive Summary

The Rogue Trader system has **good foundations** with proper ApplicationV2 usage and modern data models, but several critical V13 compatibility issues prevent full functionality. This plan addresses:

- ✅ **What's Working**: ApplicationV2 sheets, basic data models, compendium browser
- ⚠️ **What's Broken**: Chat message interactions, roll system hooks, data preparation lifecycle
- 🔥 **What's Missing**: Extended chat messages, advanced roll configuration, proper V13 patterns

This refactor will transform the system into a **fully modern V13 implementation** using dnd5e patterns as reference.

---

## Critical Issues Identified

### 🔴 CRITICAL (System-Breaking)

1. **prepareEmbeddedData() V12 Anti-Pattern**
   - **Problem**: Using V12 `prepareEmbeddedData()` method in CreatureTemplate
   - **Impact**: Item modifiers don't recalculate reliably when items change
   - **Files**: `/src/module/data/actor/templates/creature.mjs:319`
   - **Fix**: Move to actor document level with proper item change observers

2. **Missing await on ChatMessage.create()**
   - **Problem**: Not awaiting ChatMessage.create() in 5+ locations
   - **Impact**: Race conditions, unreliable chat message posting
   - **Files**:
     - `/src/module/rolls/roll-helpers.mjs:64`
     - `/src/module/actions/basic-action-manager.mjs:254`
     - `/src/module/rolls/force-field-data.mjs:70`
     - `/src/module/rolls/assign-damage-data.mjs:122`
     - `/src/module/rules/active-effects.mjs`

3. **Chat Message Action Buttons Not Wired**
   - **Problem**: Item cards in chat have buttons but no event listeners
   - **Impact**: Clicking buttons in chat does nothing
   - **Fix**: Implement chat message listeners like dnd5e

### 🟡 HIGH PRIORITY (Feature-Breaking)

4. **No Extended ChatMessage Class**
   - **Problem**: Using vanilla ChatMessage instead of custom subclass
   - **Impact**: Can't customize chat card rendering, enrichment, or interactions
   - **DnD5e Pattern**: `ChatMessage5e` extends `ChatMessage` with custom `renderHTML()`

5. **Basic Roll System Missing Advanced Features**
   - **Problem**: No configuration dialogs, no keybindings, no advantage/disadvantage
   - **Impact**: Limited roll functionality compared to modern V13 systems
   - **DnD5e Pattern**: Three-stage workflow (configure → evaluate → post)

6. **SetField Initialization Issues**
   - **Problem**: SetField with `initial: []` (array) instead of Set
   - **Impact**: Serialization issues with coverage field in armour
   - **Files**: `/src/module/data/item/armour.mjs:54-60`

7. **Missing ItemDataModel cleanData()**
   - **Problem**: No data cleaning/validation at item level
   - **Impact**: Invalid data can be saved, causes downstream errors
   - **Fix**: Add cleanData() to ItemDataModel base class

### 🟢 MEDIUM PRIORITY (Polish & Best Practices)

8. **Dialog.confirm() Old Pattern**
   - **Problem**: Using legacy Dialog API instead of ApplicationV2
   - **Files**: `/src/module/actions/basic-action-manager.mjs`
   - **Fix**: Create ApplicationV2-based confirmation dialogs

9. **Duplicate Migration Logic**
   - **Problem**: ItemDataModel and DescriptionTemplate both migrate description fields
   - **Impact**: Potential double-migration conflicts
   - **Fix**: Consolidate to single location

10. **HTMLField Conflicting Constraints**
    - **Problem**: `required: false, blank: true` on HTMLFields
    - **Impact**: Unclear validation behavior
    - **Fix**: Use either `required` OR `blank`, not both

---

## Refactor Architecture

### New Components to Create

1. **ChatMessageRT** - Extended ChatMessage class
2. **BasicRollRT** - Base roll class with configuration workflow
3. **D100Roll** - Specialized d100 roll (Rogue Trader uses d100, not d20)
4. **RollConfigurationDialog** - ApplicationV2-based roll config
5. **ActorItemObserver** - Observer pattern for item changes
6. **ConfirmationDialog** - ApplicationV2-based confirmation prompts

### Files to Refactor

**High Impact Files** (20-25 files):
- Chat system (3-4 files)
- Roll system (5-6 files)
- Data models (8-10 files)
- Actor document (2 files)
- Migration system (1 file)

---

## Phase 1: Critical Fixes 🔴 HIGHEST PRIORITY

### Goal: Fix system-breaking bugs

### Task 1.1: Fix Async ChatMessage Calls

**Files to modify**:
- `/src/module/rolls/roll-helpers.mjs`
- `/src/module/actions/basic-action-manager.mjs`
- `/src/module/rolls/force-field-data.mjs`
- `/src/module/rolls/assign-damage-data.mjs`
- `/src/module/rules/active-effects.mjs`

**Changes**:
```javascript
// BEFORE (incorrect)
ChatMessage.create(chatData);

// AFTER (correct)
await ChatMessage.create(chatData);
```

**Testing**: Verify chat messages post correctly in all scenarios

---

### Task 1.2: Replace prepareEmbeddedData() Pattern

**Problem Analysis**:
```javascript
// CURRENT (V12 anti-pattern)
// File: creature.mjs:319
prepareEmbeddedData() {
  this._computeItemModifiers();
  this._applyModifiersToCharacteristics();
  this._applyModifiersToSkills();
  this._computeArmour();
  this._computeEncumbrance();
}
```

**Solution**: Move to Actor document level

**New Pattern**:
```javascript
// File: /src/module/documents/actor.mjs

class RogueTraderActor extends Actor {

  /** @override */
  prepareData() {
    super.prepareData();
    // Now safe to access items collection
    this.system.computeItemModifiers();
  }

  /** @override */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (collection === "items") {
      this.prepareData(); // Recalculate when items added
    }
  }

  /** @override */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if (collection === "items") {
      this.prepareData(); // Recalculate when items updated
    }
  }

  /** @override */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if (collection === "items") {
      this.prepareData(); // Recalculate when items deleted
    }
  }
}
```

**Files to modify**:
- `/src/module/documents/actor.mjs` - Add descendant document hooks
- `/src/module/data/actor/templates/creature.mjs` - Remove prepareEmbeddedData(), make methods callable from document

**Benefits**:
- ✓ V13 compliant
- ✓ Reliable item modifier calculations
- ✓ Real-time updates when items change
- ✓ Proper lifecycle management

---

### Task 1.3: Fix Data Model Field Issues

**Sub-task 1.3a: Fix SetField Initialization**

```javascript
// BEFORE (incorrect)
// File: armour.mjs:54-60
coverage: new fields.SetField(
  new fields.StringField({ required: true, choices: CONFIG.ROGUE_TRADER.hitLocations }),
  { required: true, initial: ["body"] } // WRONG: Array not Set
)

// AFTER (correct)
coverage: new fields.SetField(
  new fields.StringField({ required: true, choices: CONFIG.ROGUE_TRADER.hitLocations }),
  { required: true, initial: new Set(["body"]) } // CORRECT: Set object
)
```

**Sub-task 1.3b: Add ItemDataModel cleanData()**

```javascript
// File: /src/module/data/abstract/item-data-model.mjs

static cleanData(source = {}, options = {}) {
  // Clean numeric fields
  for (const [key, field] of Object.entries(this.schema.fields)) {
    if (field instanceof fields.NumberField && key in source) {
      const value = source[key];
      if (typeof value === "string") {
        const num = Number(value);
        if (!Number.isNaN(num)) source[key] = Number.isInteger(num) ? num : Math.floor(num);
      }
    }
  }

  return super.cleanData(source, options);
}
```

**Sub-task 1.3c: Fix HTMLField Constraints**

```javascript
// BEFORE (conflicting)
chat: new fields.HTMLField({ required: false, blank: true })

// AFTER (clear)
chat: new fields.HTMLField({ required: false }) // blank is implied
```

**Files to modify**:
- `/src/module/data/item/armour.mjs` - Fix SetField
- `/src/module/data/abstract/item-data-model.mjs` - Add cleanData()
- `/src/module/data/shared/description-template.mjs` - Fix HTMLField constraints

---

## Phase 2: Extended Chat System 💬 HIGH PRIORITY

### Goal: Create modern V13 chat message system like dnd5e

### Task 2.1: Create Extended ChatMessage Class

**New File**: `/src/module/documents/chat-message.mjs`

```javascript
export default class ChatMessageRT extends ChatMessage {

  /**
   * Render HTML for the chat message
   * @override
   */
  async renderHTML() {
    const html = await super.renderHTML();

    // Enrich item cards
    if (this.getFlag("rogue-trader", "itemCard")) {
      return this._enrichItemCard(html);
    }

    // Enrich roll cards
    if (this.isRoll) {
      return this._enrichRollCard(html);
    }

    return html;
  }

  /**
   * Enrich item card with interactive elements
   */
  _enrichItemCard(html) {
    const $html = $(html);

    // Add avatar if missing
    const speaker = ChatMessage.getSpeakerActor(this.speaker);
    if (speaker && !$html.find(".message-portrait").length) {
      const portrait = $('<img class="message-portrait">').attr("src", speaker.img);
      $html.find(".message-sender").prepend(portrait);
    }

    // Enrich action buttons with data attributes
    $html.find("[data-action]").each((i, btn) => {
      $(btn).attr("data-message-id", this.id);
    });

    return $html[0].outerHTML;
  }

  /**
   * Enrich roll card with tooltips and formatting
   */
  _enrichRollCard(html) {
    const $html = $(html);

    // Add degree of success/failure
    const roll = this.rolls[0];
    if (roll && roll.formula.includes("d100")) {
      const target = this.getFlag("rogue-trader", "target");
      if (target) {
        const total = roll.total;
        const success = total <= target;
        const degrees = Math.floor(Math.abs(total - target) / 10);

        const badge = $(`<span class="degree-badge ${success ? 'success' : 'failure'}">`)
          .text(`${degrees} ${success ? 'DoS' : 'DoF'}`);

        $html.find(".dice-total").append(badge);
      }
    }

    return $html[0].outerHTML;
  }

  /**
   * Handle click events on chat message action buttons
   */
  static _onClickAction(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const action = button.dataset.action;
    const messageId = button.dataset.messageId;
    const message = game.messages.get(messageId);

    if (!message) return;

    switch (action) {
      case "rollDamage":
        return message._onRollDamage(event);
      case "applyDamage":
        return message._onApplyDamage(event);
      case "useItem":
        return message._onUseItem(event);
      default:
        console.warn(`Unknown action: ${action}`);
    }
  }

  /**
   * Roll damage from item card
   */
  async _onRollDamage(event) {
    const itemUuid = this.getFlag("rogue-trader", "item.uuid");
    if (!itemUuid) return;

    const item = await fromUuid(itemUuid);
    if (!item) return;

    // Roll item damage
    await item.rollDamage();
  }

  /**
   * Apply damage to selected tokens
   */
  async _onApplyDamage(event) {
    const damage = parseInt(event.currentTarget.dataset.damage) || 0;
    const targets = game.user.targets;

    if (targets.size === 0) {
      ui.notifications.warn("No tokens targeted");
      return;
    }

    for (const token of targets) {
      await token.actor.applyDamage(damage);
    }
  }
}

// Register chat message listeners
Hooks.on("renderChatMessage", (message, html) => {
  html.find("[data-action]").on("click", ChatMessageRT._onClickAction.bind(message));
});
```

**Files to modify**:
- Create `/src/module/documents/chat-message.mjs`
- `/src/module/rogue-trader.mjs` - Register custom ChatMessage class
- `/src/templates/chat/item-card-chat.hbs` - Update with proper data attributes

**Key Features**:
- ✓ Extended renderHTML() for custom enrichment
- ✓ Interactive action buttons in chat
- ✓ Degree of Success/Failure display for d100 rolls
- ✓ Avatar integration
- ✓ Apply damage to targets
- ✓ Roll damage from item cards

---

### Task 2.2: Update Chat Templates

**Update**: `/src/templates/chat/item-card-chat.hbs`

```handlebars
<div class="rt-item-card" data-item-id="{{item._id}}" data-actor-id="{{actor._id}}">
  <header class="card-header">
    <img src="{{item.img}}" alt="{{item.name}}" class="item-image"/>
    <h3 class="item-name">{{item.name}}</h3>
    <span class="item-type">{{item.type}}</span>
  </header>

  <div class="card-content">
    {{#if item.system.description.value}}
      <div class="item-description">
        {{{item.system.description.value}}}
      </div>
    {{/if}}

    {{#if item.system.damage}}
      <div class="item-damage">
        <strong>Damage:</strong> {{item.system.damage.formula}}
        <button type="button"
                data-action="rollDamage"
                data-item-uuid="{{item.uuid}}"
                data-message-id="{{message._id}}">
          <i class="fas fa-dice-d20"></i> Roll Damage
        </button>
      </div>
    {{/if}}

    {{#if item.system.properties}}
      <div class="item-properties">
        {{#each item.system.properties as |prop|}}
          <span class="property-tag">{{prop}}</span>
        {{/each}}
      </div>
    {{/if}}
  </div>

  <footer class="card-footer">
    {{#if item.system.activation}}
      <button type="button"
              data-action="useItem"
              data-item-uuid="{{item.uuid}}"
              data-message-id="{{message._id}}">
        <i class="fas fa-magic"></i> Use
      </button>
    {{/if}}
  </footer>
</div>
```

**Files to modify**:
- `/src/templates/chat/item-card-chat.hbs` - Add data attributes and action buttons
- `/src/scss/chat/_item-card.scss` - Style enhancements

---

## Phase 3: Advanced Roll System 🎲 HIGH PRIORITY

### Goal: Implement three-stage roll workflow like dnd5e

### Task 3.1: Create BasicRollRT Base Class

**New File**: `/src/module/dice/basic-roll.mjs`

```javascript
export default class BasicRollRT extends Roll {

  /** Configuration data */
  configuration = {};

  /**
   * Three-stage roll workflow
   * @returns {Promise<ChatMessage|null>}
   */
  static async build(config = {}) {
    // Stage 1: Configure
    const configured = await this.buildConfigure(config);
    if (!configured) return null;

    // Stage 2: Evaluate
    const evaluated = await this.buildEvaluate(configured);

    // Stage 3: Post to chat
    return this.buildPost(evaluated);
  }

  /**
   * Stage 1: Show configuration dialog
   */
  static async buildConfigure(config) {
    // Fire pre-roll hook
    const hookResult = Hooks.call("rogue-trader.preRoll", config);
    if (hookResult === false) return null;

    // Show configuration dialog if needed
    if (config.configure !== false) {
      const dialog = new RollConfigurationDialog(config);
      const result = await dialog.render(true);
      if (!result) return null; // User cancelled
      Object.assign(config, result);
    }

    // Fire post-configuration hook
    Hooks.callAll("rogue-trader.postRollConfiguration", config);

    return config;
  }

  /**
   * Stage 2: Evaluate the roll
   */
  static async buildEvaluate(config) {
    // Construct roll formula
    const formula = this.constructFormula(config);
    const roll = new this(formula, config.data, config);

    // Store configuration
    roll.configuration = config;

    // Evaluate
    await roll.evaluate();

    // Fire post-evaluation hook
    Hooks.callAll("rogue-trader.postRollEvaluate", roll);

    return roll;
  }

  /**
   * Stage 3: Post to chat
   */
  static async buildPost(roll) {
    const config = roll.configuration;

    // Prepare chat data
    const chatData = {
      type: CONST.CHAT_MESSAGE_TYPES.ROLL,
      rolls: [roll],
      speaker: ChatMessage.getSpeaker(config.speaker),
      flavor: config.flavor || this.defaultFlavor,
      flags: {
        "rogue-trader": {
          target: config.target,
          type: config.type
        }
      }
    };

    // Apply chat options
    ChatMessage.applyRollMode(chatData, config.rollMode || game.settings.get("core", "rollMode"));

    // Create message
    const message = await ChatMessage.create(chatData);

    // Fire post-message hook
    Hooks.callAll("rogue-trader.postRollPost", message, roll);

    return message;
  }

  /**
   * Construct roll formula from configuration
   */
  static constructFormula(config) {
    const parts = [config.base || "1d100"];

    // Add modifiers
    if (config.modifier) {
      parts.push(config.modifier > 0 ? `+${config.modifier}` : config.modifier);
    }

    return parts.join(" ");
  }

  /**
   * Quick roll without configuration
   */
  static async roll(config = {}) {
    config.configure = false;
    return this.build(config);
  }
}
```

---

### Task 3.2: Create D100Roll Class

**New File**: `/src/module/dice/d100-roll.mjs`

```javascript
import BasicRollRT from "./basic-roll.mjs";

export default class D100Roll extends BasicRollRT {

  /**
   * Construct d100 roll formula with target number
   */
  static constructFormula(config) {
    return "1d100";
  }

  /**
   * Check if roll is a critical success (01-05 or succeed by 3+ degrees)
   */
  get isCriticalSuccess() {
    const total = this.total;
    const target = this.configuration.target || 0;

    if (total > target) return false; // Failed
    if (total <= 5) return true; // Natural crit (01-05)

    const degrees = Math.floor((target - total) / 10);
    return degrees >= 3; // 3+ DoS
  }

  /**
   * Check if roll is a critical failure (96-00 or fail by 3+ degrees)
   */
  get isCriticalFailure() {
    const total = this.total;
    const target = this.configuration.target || 0;

    if (total <= target) return false; // Succeeded
    if (total >= 96) return true; // Natural fumble (96-00)

    const degrees = Math.floor((total - target) / 10);
    return degrees >= 3; // 3+ DoF
  }

  /**
   * Calculate degrees of success/failure
   */
  get degrees() {
    const total = this.total;
    const target = this.configuration.target || 0;
    const diff = Math.abs(total - target);
    return Math.floor(diff / 10);
  }

  /**
   * Check if roll succeeded
   */
  get isSuccess() {
    return this.total <= (this.configuration.target || 0);
  }

  /**
   * Render roll tooltip with target and degrees
   */
  async getTooltip() {
    const html = await super.getTooltip();
    const target = this.configuration.target;

    if (target !== undefined) {
      const $html = $(html);
      const success = this.isSuccess;
      const degrees = this.degrees;

      const summary = $(`
        <div class="dice-summary">
          <div>Target: ${target}</div>
          <div class="${success ? 'success' : 'failure'}">
            ${success ? 'Success' : 'Failure'}: ${degrees} Degree${degrees !== 1 ? 's' : ''}
          </div>
          ${this.isCriticalSuccess ? '<div class="critical">Critical Success!</div>' : ''}
          ${this.isCriticalFailure ? '<div class="fumble">Critical Failure!</div>' : ''}
        </div>
      `);

      $html.find(".dice-total").after(summary);
      return $html[0].outerHTML;
    }

    return html;
  }
}
```

---

### Task 3.3: Create Roll Configuration Dialog

**New File**: `/src/module/applications/dialogs/roll-configuration-dialog.mjs`

```javascript
export default class RollConfigurationDialog extends foundry.applications.api.ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "roll-configuration-{id}",
    classes: ["rogue-trader", "roll-configuration-dialog"],
    tag: "form",
    window: {
      title: "Configure Roll",
      contentClasses: ["standard-form"]
    },
    position: { width: 400 },
    form: {
      handler: this.onSubmit,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    form: {
      template: "systems/rogue-trader/templates/dialogs/roll-configuration.hbs"
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  /**
   * Configuration data passed to dialog
   */
  #config = {};

  constructor(config, options = {}) {
    super(options);
    this.#config = config;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    return {
      ...context,
      config: this.#config,
      target: this.#config.target || 0,
      modifier: this.#config.modifier || 0,
      hasAdvantage: this.#config.hasAdvantage || false,
      hasDisadvantage: this.#config.hasDisadvantage || false,
      // Modifier presets
      presets: [
        { label: "+60 (Trivial)", value: 60 },
        { label: "+40 (Easy)", value: 40 },
        { label: "+20 (Routine)", value: 20 },
        { label: "+10 (Ordinary)", value: 10 },
        { label: "+0 (Challenging)", value: 0 },
        { label: "−10 (Difficult)", value: -10 },
        { label: "−20 (Hard)", value: -20 },
        { label: "−30 (Very Hard)", value: -30 },
        { label: "−40 (Arduous)", value: -40 },
        { label: "−60 (Hellish)", value: -60 }
      ],
      buttons: [
        { type: "submit", icon: "fa-solid fa-dice-d20", label: "Roll" },
        { type: "button", action: "cancel", icon: "fa-solid fa-times", label: "Cancel" }
      ]
    };
  }

  static async onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    this.close();
    return data;
  }

  _onClickAction(event, target) {
    if (target.dataset.action === "cancel") {
      this.close();
      return null;
    }
  }
}
```

**Template**: `/src/templates/dialogs/roll-configuration.hbs`

```handlebars
<div class="form-group">
  <label>Target Number</label>
  <input type="number" name="target" value="{{target}}" disabled />
</div>

<div class="form-group">
  <label>Situational Modifier</label>
  <select name="modifier">
    {{#each presets as |preset|}}
      <option value="{{preset.value}}" {{#if (eq preset.value ../modifier)}}selected{{/if}}>
        {{preset.label}}
      </option>
    {{/each}}
  </select>
</div>

<div class="form-group">
  <label>Custom Modifier</label>
  <input type="number" name="customModifier" value="0" placeholder="Additional ±" />
</div>

<div class="form-group">
  <label>Roll Mode</label>
  <select name="rollMode">
    <option value="publicroll">Public Roll</option>
    <option value="gmroll">GM Roll</option>
    <option value="blindroll">Blind Roll</option>
    <option value="selfroll">Self Roll</option>
  </select>
</div>
```

---

### Task 3.4: Integrate New Roll System

**Files to modify**:
- `/src/module/rogue-trader.mjs` - Register roll classes
- `/src/module/documents/actor.mjs` - Use new roll system in roll methods
- `/src/module/documents/item.mjs` - Use new roll system
- `/src/module/actions/basic-action-manager.mjs` - Replace old roll calls

**Example Integration**:
```javascript
// File: actor.mjs

async rollCharacteristic(charKey, options = {}) {
  const char = this.system.characteristics[charKey];
  if (!char) return null;

  // Use new roll system
  return D100Roll.build({
    target: char.total,
    flavor: `${char.label} Test`,
    speaker: { actor: this },
    type: "characteristic",
    ...options
  });
}

async rollSkill(skillId, options = {}) {
  const skill = this.items.get(skillId);
  if (!skill) return null;

  return D100Roll.build({
    target: skill.system.target,
    flavor: `${skill.name} Test`,
    speaker: { actor: this },
    type: "skill",
    ...options
  });
}
```

---

## Phase 4: Data Model Improvements 📊 MEDIUM PRIORITY

### Goal: Fix remaining data model issues

### Task 4.1: Consolidate Migration Logic

**Problem**: Duplicate migration between ItemDataModel and DescriptionTemplate

**Solution**: Move to single location

```javascript
// File: /src/module/data/abstract/item-data-model.mjs

static migrateData(source) {
  // Description migration (remove from DescriptionTemplate)
  if (typeof source.description === "string") {
    source.description = { value: source.description, chat: "", summary: "" };
  }

  // Source migration
  if (typeof source.source === "string") {
    source.source = { book: "", page: "", custom: source.source };
  }

  return super.migrateData(source);
}
```

**Files to modify**:
- `/src/module/data/abstract/item-data-model.mjs` - Keep migrations here
- `/src/module/data/shared/description-template.mjs` - Remove duplicate migrations

---

### Task 4.2: Add V13 Migration Handler

**File**: `/src/module/rogue-trader-migrations.mjs`

Add new migration:

```javascript
export default function registerMigrations() {
  // ... existing migrations ...

  /**
   * V13 Compatibility Migration (v184)
   */
  migrations[184] = async function v184_V13Compatibility(doc) {
    const updateData = {};

    // Fix armour coverage (array → Set)
    if (doc.type === "armour" && doc.system?.coverage) {
      if (Array.isArray(doc.system.coverage)) {
        updateData["system.coverage"] = new Set(doc.system.coverage);
      }
    }

    // Fix HTMLField blanks
    if (doc.system?.description?.chat === null) {
      updateData["system.description.chat"] = "";
    }

    // Remove prepareEmbeddedData flag if exists
    if (doc.system?._usePrepareEmbedded) {
      updateData["system.-=_usePrepareEmbedded"] = null;
    }

    return updateData;
  };
}
```

---

## Phase 5: ApplicationV2 Dialog Replacements 🪟 LOW PRIORITY

### Goal: Replace legacy Dialog API with ApplicationV2

### Task 5.1: Create Reusable ConfirmationDialog

**New File**: `/src/module/applications/dialogs/confirmation-dialog.mjs`

```javascript
export default class ConfirmationDialog extends foundry.applications.api.ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: "confirmation-{id}",
    classes: ["rogue-trader", "confirmation-dialog"],
    tag: "div",
    window: {
      title: "Confirm",
      contentClasses: ["standard-form"]
    },
    position: { width: 400 },
    actions: {
      confirm: this.onConfirm,
      cancel: this.onCancel
    }
  };

  static PARTS = {
    content: {
      template: "systems/rogue-trader/templates/dialogs/confirmation.hbs"
    }
  };

  #config = {};
  #resolve = null;

  constructor(config, options = {}) {
    super(options);
    this.#config = config;
  }

  async _prepareContext(options) {
    return {
      ...await super._prepareContext(options),
      content: this.#config.content || "Are you sure?",
      confirmLabel: this.#config.confirmLabel || "Confirm",
      cancelLabel: this.#config.cancelLabel || "Cancel"
    };
  }

  /**
   * Wait for user response
   */
  async wait() {
    return new Promise(resolve => {
      this.#resolve = resolve;
      this.render(true);
    });
  }

  static async onConfirm(event, target) {
    this.#resolve?.(true);
    this.close();
  }

  static async onCancel(event, target) {
    this.#resolve?.(false);
    this.close();
  }

  /**
   * Static helper method
   */
  static async confirm(config) {
    const dialog = new this(config);
    return dialog.wait();
  }
}
```

---

### Task 5.2: Replace Dialog.confirm() Calls

**Files to modify**:
- `/src/module/actions/basic-action-manager.mjs`

**Example**:
```javascript
// BEFORE
const confirmed = await Dialog.confirm({
  title: "Delete Item",
  content: `<p>Delete ${item.name}?</p>`
});

// AFTER
const confirmed = await ConfirmationDialog.confirm({
  title: "Delete Item",
  content: `Delete ${item.name}?`,
  confirmLabel: "Delete",
  cancelLabel: "Cancel"
});
```

---

## Phase 6: Testing & Validation ✅ ONGOING

### Goal: Ensure all changes work correctly

### Task 6.1: Manual Testing Checklist

**Chat Messages**:
- [ ] Item cards display correctly in chat
- [ ] Action buttons in chat work (Roll Damage, Use Item, Apply Damage)
- [ ] Roll results show degrees of success/failure
- [ ] Avatars appear in chat cards
- [ ] Drag items from chat to sheets

**Rolls**:
- [ ] Characteristic tests work with configuration dialog
- [ ] Skill tests work with configuration dialog
- [ ] Weapon attack rolls work
- [ ] Damage rolls work
- [ ] Critical success/failure detected correctly (01-05, 96-00, 3+ degrees)
- [ ] Roll modes respect settings (public, GM, blind, self)

**Data Models**:
- [ ] Item modifiers recalculate when items added/removed
- [ ] Armour values update when armour equipped/unequipped
- [ ] Characteristic bonuses calculated correctly
- [ ] Skills show correct targets
- [ ] Encumbrance calculates properly

**Character Sheet**:
- [ ] All tabs load without errors
- [ ] Inline rolls work
- [ ] Item drag-drop works
- [ ] Collapsible panels work
- [ ] State persists between renders

---

### Task 6.2: Console Error Checking

Check for:
- [ ] No deprecation warnings
- [ ] No "null is not an object" errors
- [ ] No async/await warnings
- [ ] No schema validation errors

---

## Phase 7: Polish & Documentation 📝 LOW PRIORITY

### Goal: Clean up and document changes

### Task 7.1: Code Cleanup

- Remove console.log debug statements
- Add JSDoc comments to new classes
- Update CHANGELOG.md
- Add migration notes for users

### Task 7.2: Complete TODO Items

**Known TODOs**:
- `/src/module/applications/hud/combat-quick-panel.mjs:647` - "TODO: Show weapon selection dialog"
- `/src/module/applications/hud/combat-quick-panel.mjs:697` - "TODO: Implement consumable use logic"

---

## Implementation Priority Summary

### 🔴 Phase 1: Critical Fixes (Week 1)
- Fix async ChatMessage calls (2-3 hours)
- Replace prepareEmbeddedData() pattern (1 day)
- Fix data model field issues (1 day)

### 💬 Phase 2: Extended Chat System (Week 2)
- Create ChatMessageRT class (1 day)
- Update chat templates (1 day)
- Test chat interactions (1 day)

### 🎲 Phase 3: Advanced Roll System (Week 2-3)
- Create BasicRollRT and D100Roll (2 days)
- Create RollConfigurationDialog (1 day)
- Integrate throughout system (2 days)
- Test roll workflows (1 day)

### 📊 Phase 4: Data Model Improvements (Week 3)
- Consolidate migrations (1 day)
- Add V13 migration handler (1 day)

### 🪟 Phase 5: Dialog Replacements (Week 4)
- Create ConfirmationDialog (1 day)
- Replace Dialog.confirm() calls (1 day)

### ✅ Phase 6: Testing (Ongoing)
- Manual testing after each phase
- Bug fixes as discovered

### 📝 Phase 7: Polish (Week 4-5)
- Code cleanup (1 day)
- Documentation (1 day)
- Complete TODOs (2 days)

---

## Success Criteria

The refactor will be successful when:

✓ **No console errors** - System runs clean without warnings
✓ **All rolls work** - Configuration dialogs, degrees, criticals
✓ **Chat is interactive** - Buttons work, cards enriched, drag-drop functional
✓ **Data updates reliably** - Item changes recalculate actor stats immediately
✓ **V13 compliance** - No deprecated patterns, all modern APIs used
✓ **Feature parity** - All existing functionality preserved
✓ **Enhanced UX** - Better than before with new features

---

## Critical Files Reference

### High-Impact Files (Must Change):
1. `/src/module/documents/actor.mjs` - prepareEmbeddedData replacement
2. `/src/module/data/actor/templates/creature.mjs` - Remove V12 pattern
3. `/src/module/rolls/roll-helpers.mjs` - Add await
4. `/src/module/actions/basic-action-manager.mjs` - Add await, replace Dialog
5. `/src/module/data/item/armour.mjs` - Fix SetField
6. `/src/module/data/abstract/item-data-model.mjs` - Add cleanData()

### New Files (Must Create):
1. `/src/module/documents/chat-message.mjs` - Extended ChatMessage
2. `/src/module/dice/basic-roll.mjs` - Base roll class
3. `/src/module/dice/d100-roll.mjs` - Specialized d100 roll
4. `/src/module/applications/dialogs/roll-configuration-dialog.mjs` - Roll config UI
5. `/src/module/applications/dialogs/confirmation-dialog.mjs` - Confirmation UI

### Templates (Must Update):
1. `/src/templates/chat/item-card-chat.hbs` - Add action buttons
2. `/src/templates/dialogs/roll-configuration.hbs` - New roll dialog
3. `/src/templates/dialogs/confirmation.hbs` - New confirmation dialog

---

## Risk Mitigation

**Backup Strategy**:
- Create git branch for refactor
- Commit after each phase
- Keep current `main` branch stable

**Testing Strategy**:
- Test after each phase before proceeding
- Create test world with sample characters
- Verify core workflows (roll, chat, items, modifiers)

**Rollback Plan**:
- If critical issues found, can revert individual commits
- Migration system handles data structure changes
- No data loss with proper migrations

---

This refactor will transform the Rogue Trader system into a **fully modern, V13-compliant implementation** with enhanced features and reliability. The phased approach allows for incremental progress with testing at each stage.
