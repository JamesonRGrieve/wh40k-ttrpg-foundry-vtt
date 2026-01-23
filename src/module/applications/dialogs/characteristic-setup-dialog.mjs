/**
 * @file CharacteristicSetupDialog - Interactive dialog for setting up characteristic rolls
 * Provides drag-and-drop interface for assigning dice rolls to characteristics during character creation.
 * 
 * Usage:
 *   await CharacteristicSetupDialog.open(actor);
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * List of characteristic keys used for character generation (excludes Influence).
 * @type {string[]}
 */
const GENERATION_CHARACTERISTICS = [
  'weaponSkill', 'ballisticSkill', 'strength', 'toughness',
  'agility', 'intelligence', 'perception', 'willpower', 'fellowship'
];

/**
 * Default base value for characteristics.
 * @type {number}
 */
const DEFAULT_BASE = 25;

export default class CharacteristicSetupDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /* -------------------------------------------- */
  /*  Configuration                               */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "characteristic-setup-{id}",
    classes: ["rogue-trader", "characteristic-setup-dialog"],
    tag: "div",
    window: {
      title: "RT.CharacteristicSetup.Title",
      icon: "fa-solid fa-dice-d20",
      minimizable: false,
      resizable: false,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 700,
      height: "auto"
    },
    actions: {
      apply: CharacteristicSetupDialog.#onApply,
      reset: CharacteristicSetupDialog.#onReset,
      toggleAdvanced: CharacteristicSetupDialog.#onToggleAdvanced
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    content: {
      template: "systems/rogue-trader/templates/dialogs/characteristic-setup.hbs"
    }
  };

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The actor being configured.
   * @type {Actor}
   */
  #actor;

  /**
   * Local state for rolls (array of 9 values, 0 = unset).
   * @type {number[]}
   */
  #rolls = [];

  /**
   * Local state for assignments (characteristic key → roll index or null).
   * @type {Object<string, number|null>}
   */
  #assignments = {};

  /**
   * Local state for custom base values.
   * @type {Object<string, number>}
   */
  #customBases = {};

  /**
   * Whether advanced mode is enabled.
   * @type {boolean}
   */
  #advancedMode = false;

  /**
   * Promise resolve function for wait().
   * @type {Function|null}
   */
  #resolve = null;

  /**
   * Whether changes were applied.
   * @type {boolean}
   */
  #applied = false;

  /**
   * Currently dragged element data.
   * @type {{ type: string, index?: number, characteristic?: string }|null}
   */
  #dragData = null;

  /* -------------------------------------------- */
  /*  Construction                                */
  /* -------------------------------------------- */

  /**
   * Create a characteristic setup dialog.
   * @param {Actor} actor - The actor to configure
   * @param {object} [options] - Application options
   */
  constructor(actor, options = {}) {
    super(options);
    this.#actor = actor;
    this.#initializeState();
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.localize("RT.CharacteristicSetup.Title");
  }

  /* -------------------------------------------- */

  /**
   * Initialize local state from actor data.
   * @private
   */
  #initializeState() {
    const genData = this.#actor.system.characterGeneration || {};
    
    // Initialize rolls - either from actor or empty array of 9 zeros
    this.#rolls = Array.isArray(genData.rolls) && genData.rolls.length === 9
      ? [...genData.rolls]
      : Array(9).fill(0);
    
    // Initialize assignments
    this.#assignments = {};
    for (const key of GENERATION_CHARACTERISTICS) {
      this.#assignments[key] = genData.assignments?.[key] ?? null;
    }
    
    // Initialize custom bases
    this.#customBases = {};
    for (const key of GENERATION_CHARACTERISTICS) {
      this.#customBases[key] = genData.customBases?.[key] ?? DEFAULT_BASE;
    }
    
    // Initialize advanced mode
    this.#advancedMode = genData.customBases?.enabled ?? false;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // Build rolls bank data
    const rollsBank = this.#rolls.map((value, index) => ({
      index,
      displayIndex: index + 1,
      value,
      isEmpty: value === 0,
      isAssigned: this.#isRollAssigned(index)
    }));
    
    // Build characteristics data
    const characteristics = GENERATION_CHARACTERISTICS.map(key => {
      const charData = this.#actor.system.characteristics[key];
      const assignedIndex = this.#assignments[key];
      const rollValue = assignedIndex !== null ? this.#rolls[assignedIndex] : null;
      const base = this.#advancedMode ? this.#customBases[key] : DEFAULT_BASE;
      const total = rollValue !== null ? base + rollValue : null;
      
      return {
        key,
        label: charData.label,
        short: charData.short,
        base,
        rollValue,
        assignedIndex,
        total,
        hasRoll: rollValue !== null
      };
    });
    
    // Split into rows of 3 for grid layout
    const characteristicRows = [];
    for (let i = 0; i < characteristics.length; i += 3) {
      characteristicRows.push(characteristics.slice(i, i + 3));
    }
    
    // Calculate preview totals
    const preview = characteristics.map(c => ({
      short: c.short,
      total: c.total,
      hasValue: c.total !== null
    }));
    
    // Check if all rolls are assigned
    const allAssigned = characteristics.every(c => c.hasRoll);
    const anyRolls = this.#rolls.some(r => r > 0);
    
    return {
      ...context,
      rollsBank,
      characteristicRows,
      characteristics,
      preview,
      advancedMode: this.#advancedMode,
      allAssigned,
      anyRolls,
      canApply: allAssigned && anyRolls
    };
  }

  /* -------------------------------------------- */

  /**
   * Check if a roll index is currently assigned to any characteristic.
   * @param {number} index - Roll index
   * @returns {boolean}
   * @private
   */
  #isRollAssigned(index) {
    return Object.values(this.#assignments).includes(index);
  }

  /* -------------------------------------------- */

  /**
   * Get the characteristic that a roll is assigned to.
   * @param {number} index - Roll index
   * @returns {string|null} - Characteristic key or null
   * @private
   */
  #getAssignedCharacteristic(index) {
    for (const [key, assignedIndex] of Object.entries(this.#assignments)) {
      if (assignedIndex === index) return key;
    }
    return null;
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#activateListeners();
  }

  /* -------------------------------------------- */

  /**
   * Activate event listeners on the rendered HTML.
   * @private
   */
  #activateListeners() {
    const html = this.element;
    
    // Roll chip click-to-edit
    html.querySelectorAll('.csd-roll-chip').forEach(chip => {
      chip.addEventListener('click', this.#onRollChipClick.bind(this));
      chip.addEventListener('dragstart', this.#onDragStart.bind(this));
      chip.addEventListener('dragend', this.#onDragEnd.bind(this));
    });
    
    // Roll input blur/change
    html.querySelectorAll('.csd-roll-input').forEach(input => {
      input.addEventListener('blur', this.#onRollInputBlur.bind(this));
      input.addEventListener('keydown', this.#onRollInputKeydown.bind(this));
    });
    
    // Characteristic slots as drop targets
    html.querySelectorAll('.csd-char-slot').forEach(slot => {
      slot.addEventListener('dragover', this.#onDragOver.bind(this));
      slot.addEventListener('dragleave', this.#onDragLeave.bind(this));
      slot.addEventListener('drop', this.#onDrop.bind(this));
      // Make assigned rolls in slots draggable
      const rollChip = slot.querySelector('.csd-assigned-roll');
      if (rollChip) {
        rollChip.addEventListener('dragstart', this.#onDragStart.bind(this));
        rollChip.addEventListener('dragend', this.#onDragEnd.bind(this));
      }
    });
    
    // Rolls bank as drop target (for returning rolls)
    const rollsBank = html.querySelector('.csd-rolls-bank');
    if (rollsBank) {
      rollsBank.addEventListener('dragover', this.#onBankDragOver.bind(this));
      rollsBank.addEventListener('dragleave', this.#onDragLeave.bind(this));
      rollsBank.addEventListener('drop', this.#onBankDrop.bind(this));
    }
    
    // Base value inputs (advanced mode)
    html.querySelectorAll('.csd-base-input').forEach(input => {
      input.addEventListener('change', this.#onBaseValueChange.bind(this));
    });
  }

  /* -------------------------------------------- */
  /*  Roll Chip Editing                           */
  /* -------------------------------------------- */

  /**
   * Handle click on a roll chip to edit its value.
   * @param {MouseEvent} event
   * @private
   */
  #onRollChipClick(event) {
    const chip = event.currentTarget;
    const index = parseInt(chip.dataset.rollIndex);
    
    // If already editing, don't restart
    if (chip.querySelector('.csd-roll-input')) return;
    
    // Create inline input
    const currentValue = this.#rolls[index] || '';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'csd-roll-input';
    input.min = 2;
    input.max = 40;
    input.value = currentValue || '';
    input.placeholder = '2-40';
    input.dataset.rollIndex = index;
    
    // Replace chip content with input
    const valueEl = chip.querySelector('.csd-roll-value');
    if (valueEl) valueEl.style.display = 'none';
    chip.appendChild(input);
    input.focus();
    input.select();
  }

  /* -------------------------------------------- */

  /**
   * Handle blur on roll input to save value.
   * @param {FocusEvent} event
   * @private
   */
  #onRollInputBlur(event) {
    const input = event.currentTarget;
    this.#saveRollInput(input);
  }

  /* -------------------------------------------- */

  /**
   * Handle keydown on roll input.
   * @param {KeyboardEvent} event
   * @private
   */
  #onRollInputKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.#saveRollInput(event.currentTarget);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.#cancelRollInput(event.currentTarget);
    }
  }

  /* -------------------------------------------- */

  /**
   * Save the value from a roll input.
   * @param {HTMLInputElement} input
   * @private
   */
  #saveRollInput(input) {
    const index = parseInt(input.dataset.rollIndex);
    let value = parseInt(input.value);
    
    // Validate range (2D20 = 2-40)
    if (isNaN(value) || value < 2) value = 0;
    if (value > 40) value = 40;
    
    this.#rolls[index] = value;
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Cancel editing a roll input.
   * @param {HTMLInputElement} input
   * @private
   */
  #cancelRollInput(input) {
    this.render();
  }

  /* -------------------------------------------- */
  /*  Drag and Drop                               */
  /* -------------------------------------------- */

  /**
   * Handle drag start on a roll chip.
   * @param {DragEvent} event
   * @private
   */
  #onDragStart(event) {
    const target = event.currentTarget;
    const rollIndex = parseInt(target.dataset.rollIndex);
    const fromCharacteristic = target.dataset.characteristic || null;
    
    // Don't allow dragging empty/zero rolls
    if (this.#rolls[rollIndex] === 0) {
      event.preventDefault();
      return;
    }
    
    this.#dragData = {
      type: fromCharacteristic ? 'assigned' : 'bank',
      index: rollIndex,
      characteristic: fromCharacteristic
    };
    
    target.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(this.#dragData));
    
    // Add drag-active class to dialog
    this.element.classList.add('drag-active');
  }

  /* -------------------------------------------- */

  /**
   * Handle drag end.
   * @param {DragEvent} event
   * @private
   */
  #onDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    this.element.classList.remove('drag-active');
    this.element.querySelectorAll('.drop-valid, .drop-hover').forEach(el => {
      el.classList.remove('drop-valid', 'drop-hover');
    });
    this.#dragData = null;
  }

  /* -------------------------------------------- */

  /**
   * Handle drag over a characteristic slot.
   * @param {DragEvent} event
   * @private
   */
  #onDragOver(event) {
    if (!this.#dragData) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    const slot = event.currentTarget;
    slot.classList.add('drop-valid', 'drop-hover');
  }

  /* -------------------------------------------- */

  /**
   * Handle drag leave.
   * @param {DragEvent} event
   * @private
   */
  #onDragLeave(event) {
    event.currentTarget.classList.remove('drop-hover');
  }

  /* -------------------------------------------- */

  /**
   * Handle drop on a characteristic slot.
   * @param {DragEvent} event
   * @private
   */
  #onDrop(event) {
    event.preventDefault();
    if (!this.#dragData) return;
    
    const slot = event.currentTarget;
    const targetChar = slot.dataset.characteristic;
    const draggedIndex = this.#dragData.index;
    const sourceChar = this.#dragData.characteristic;
    
    // Get current assignment of target slot
    const currentTargetIndex = this.#assignments[targetChar];
    
    // Swap logic
    if (sourceChar) {
      // Dragging from another slot - swap
      this.#assignments[sourceChar] = currentTargetIndex;
    } else {
      // Dragging from bank - if target has a roll, return it to bank
      // (no action needed, just overwrite)
    }
    
    // Assign dragged roll to target
    this.#assignments[targetChar] = draggedIndex;
    
    // Add animation class
    slot.classList.add('snap-to-slot');
    setTimeout(() => slot.classList.remove('snap-to-slot'), 600);
    
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle drag over the rolls bank.
   * @param {DragEvent} event
   * @private
   */
  #onBankDragOver(event) {
    if (!this.#dragData || this.#dragData.type !== 'assigned') return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    event.currentTarget.classList.add('drop-valid', 'drop-hover');
  }

  /* -------------------------------------------- */

  /**
   * Handle drop on the rolls bank (return roll).
   * @param {DragEvent} event
   * @private
   */
  #onBankDrop(event) {
    event.preventDefault();
    if (!this.#dragData || !this.#dragData.characteristic) return;
    
    // Unassign the roll from its characteristic
    this.#assignments[this.#dragData.characteristic] = null;
    this.render();
  }

  /* -------------------------------------------- */
  /*  Advanced Mode                               */
  /* -------------------------------------------- */

  /**
   * Handle base value input change.
   * @param {Event} event
   * @private
   */
  #onBaseValueChange(event) {
    const input = event.currentTarget;
    const key = input.dataset.characteristic;
    let value = parseInt(input.value);
    
    if (isNaN(value) || value < 0) value = 0;
    this.#customBases[key] = value;
    this.render();
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Handle Apply button click.
   * @this {CharacteristicSetupDialog}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onApply(event, target) {
    // Validate all rolls are assigned
    const allAssigned = GENERATION_CHARACTERISTICS.every(key => 
      this.#assignments[key] !== null && this.#rolls[this.#assignments[key]] > 0
    );
    
    if (!allAssigned) {
      ui.notifications.warn(game.i18n.localize("RT.CharacteristicSetup.NotAllAssigned"));
      return;
    }
    
    // Build update data
    const updateData = {
      'system.characterGeneration.rolls': this.#rolls,
      'system.characterGeneration.assignments': this.#assignments,
      'system.characterGeneration.customBases.enabled': this.#advancedMode
    };
    
    // Update custom bases if advanced mode
    for (const key of GENERATION_CHARACTERISTICS) {
      updateData[`system.characterGeneration.customBases.${key}`] = this.#customBases[key];
    }
    
    // Calculate and update characteristic base values
    for (const key of GENERATION_CHARACTERISTICS) {
      const rollIndex = this.#assignments[key];
      const rollValue = this.#rolls[rollIndex];
      const base = this.#advancedMode ? this.#customBases[key] : DEFAULT_BASE;
      const total = base + rollValue;
      updateData[`system.characteristics.${key}.base`] = total;
    }
    
    await this.#actor.update(updateData);
    
    this.#applied = true;
    this.#resolve?.(true);
    
    ui.notifications.info(game.i18n.localize("RT.CharacteristicSetup.Applied"));
    await this.close();
  }

  /* -------------------------------------------- */

  /**
   * Handle Reset button click.
   * @this {CharacteristicSetupDialog}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onReset(event, target) {
    // Clear all assignments
    for (const key of GENERATION_CHARACTERISTICS) {
      this.#assignments[key] = null;
    }
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle Advanced Mode toggle.
   * @this {CharacteristicSetupDialog}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onToggleAdvanced(event, target) {
    this.#advancedMode = !this.#advancedMode;
    this.render();
  }

  /* -------------------------------------------- */
  /*  Lifecycle                                   */
  /* -------------------------------------------- */

  /** @override */
  async close(options = {}) {
    if (!this.#applied && this.#resolve) {
      this.#resolve(false);
    }
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Public API                                  */
  /* -------------------------------------------- */

  /**
   * Wait for dialog to complete.
   * @returns {Promise<boolean>} True if applied, false if cancelled
   */
  async wait() {
    return new Promise((resolve) => {
      this.#resolve = resolve;
      this.render(true);
    });
  }

  /* -------------------------------------------- */

  /**
   * Open the characteristic setup dialog for an actor.
   * @param {Actor} actor - The actor to configure
   * @returns {Promise<boolean>} True if applied, false if cancelled
   * @static
   */
  static async open(actor) {
    if (!actor || actor.type !== 'acolyte') {
      ui.notifications.error("Characteristic setup is only available for characters.");
      return false;
    }
    const dialog = new this(actor);
    return dialog.wait();
  }
}
