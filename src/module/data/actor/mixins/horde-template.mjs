const { SchemaField, NumberField, BooleanField, ArrayField, StringField } = foundry.data.fields;

/**
 * HordeTemplate mixin for actors that can operate in horde mode.
 * Provides magnitude tracking, damage multipliers, and horde-specific rules.
 * 
 * @param {typeof foundry.abstract.TypeDataModel} Base - The base class to extend.
 * @returns {typeof foundry.abstract.TypeDataModel} The extended class with horde capabilities.
 */
export default function HordeTemplate(Base) {
  return class HordeTemplateMixin extends Base {
    
    /* -------------------------------------------- */
    /*  Model Configuration                         */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static defineSchema() {
      return {
        ...super.defineSchema(),
        horde: new SchemaField({
          // Toggle horde mode on/off
          enabled: new BooleanField({ required: true, initial: false }),
          
          // Magnitude tracking (like hit points for hordes)
          magnitude: new SchemaField({
            max: new NumberField({ required: true, initial: 30, min: 1, integer: true }),
            current: new NumberField({ required: true, initial: 30, min: 0, integer: true })
          }),
          
          // Damage log for tracking magnitude loss
          magnitudeLog: new ArrayField(
            new SchemaField({
              amount: new NumberField({ required: true, integer: true }),
              source: new StringField({ required: false, blank: true }),
              timestamp: new NumberField({ required: true })
            }),
            { required: true, initial: [] }
          ),
          
          // Horde-specific traits
          traits: new ArrayField(
            new StringField({ required: true }),
            { required: true, initial: [] }
          ),
          
          // Derived values (calculated in prepareDerivedData)
          damageMultiplier: new NumberField({ required: true, initial: 1.0, min: 0 }),
          sizeModifier: new NumberField({ required: true, initial: 0, integer: true })
        })
      };
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritDoc */
    prepareDerivedData() {
      super.prepareDerivedData();
      this._prepareHordeData();
    }

    /**
     * Calculate horde-derived values based on current magnitude.
     * @protected
     */
    _prepareHordeData() {
      if (!this.horde.enabled) return;

      const magnitude = this.horde.magnitude;
      const magnitudePercent = magnitude.max > 0 
        ? magnitude.current / magnitude.max 
        : 0;

      // Damage multiplier: 0.5x to 5x based on magnitude percentage
      // At 100%: 5x damage, at 10%: 0.5x damage
      this.horde.damageMultiplier = Math.max(0.5, Math.ceil(magnitudePercent * 10) / 2);

      // Size modifier: 0-3 based on magnitude (for token scaling)
      // 100%: +3 size, 66%: +2, 33%: +1, <33%: +0
      this.horde.sizeModifier = Math.floor(magnitudePercent * 3);
    }

    /* -------------------------------------------- */
    /*  Horde Methods                               */
    /* -------------------------------------------- */

    /**
     * Apply magnitude damage to the horde.
     * @param {number} amount - Amount of magnitude to reduce.
     * @param {string} [source] - Source of the damage (for logging).
     * @returns {Promise<Actor>} The updated actor.
     */
    async applyMagnitudeDamage(amount, source = "") {
      if (!this.horde.enabled) return this.parent;

      const newMagnitude = Math.max(0, this.horde.magnitude.current - amount);
      const logEntry = {
        amount: -amount,
        source,
        timestamp: Date.now()
      };

      return this.parent.update({
        "system.horde.magnitude.current": newMagnitude,
        "system.horde.magnitudeLog": [...this.horde.magnitudeLog, logEntry]
      });
    }

    /**
     * Restore magnitude to the horde.
     * @param {number} amount - Amount of magnitude to restore.
     * @param {string} [source] - Source of the restoration.
     * @returns {Promise<Actor>} The updated actor.
     */
    async restoreMagnitude(amount, source = "") {
      if (!this.horde.enabled) return this.parent;

      const newMagnitude = Math.min(
        this.horde.magnitude.max, 
        this.horde.magnitude.current + amount
      );
      const logEntry = {
        amount: amount,
        source,
        timestamp: Date.now()
      };

      return this.parent.update({
        "system.horde.magnitude.current": newMagnitude,
        "system.horde.magnitudeLog": [...this.horde.magnitudeLog, logEntry]
      });
    }

    /**
     * Toggle horde mode on/off.
     * @returns {Promise<Actor>} The updated actor.
     */
    async toggleHordeMode() {
      return this.parent.update({
        "system.horde.enabled": !this.horde.enabled
      });
    }

    /**
     * Get the effective damage output multiplier for this horde.
     * @returns {number} The damage multiplier.
     */
    get hordeDamageMultiplier() {
      return this.horde.enabled ? this.horde.damageMultiplier : 1;
    }

    /**
     * Check if the horde is destroyed (magnitude 0).
     * @returns {boolean}
     */
    get hordeDestroyed() {
      return this.horde.enabled && this.horde.magnitude.current <= 0;
    }

    /**
     * Get magnitude as a percentage.
     * @returns {number} Percentage 0-100.
     */
    get magnitudePercent() {
      if (!this.horde.enabled || this.horde.magnitude.max <= 0) return 0;
      return Math.round((this.horde.magnitude.current / this.horde.magnitude.max) * 100);
    }
  };
}
