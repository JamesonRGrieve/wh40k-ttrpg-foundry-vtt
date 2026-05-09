import type { WH40KBaseActor } from '../../../documents/base-actor.ts';

const { SchemaField, NumberField, BooleanField, ArrayField, StringField } = foundry.data.fields;

/**
 * Interface representing a single entry in the horde magnitude log.
 */
export interface HordeLogEntry {
    amount: number;
    source: string;
    timestamp: number;
}

/**
 * Interface representing the horde data structure within the actor's system data.
 */
export interface HordeData {
    enabled: boolean;
    magnitude: {
        max: number;
        current: number;
    };
    magnitudeLog: HordeLogEntry[];
    traits: string[];
    damageMultiplier: number;
    sizeModifier: number;
}

/**
 * Constructor type for mixin base classes, including expected static methods.
 */
type Constructor<T = object> = (new (...args: any[]) => T) & {
    defineSchema(): Record<string, foundry.data.fields.DataField.Any>;
    _migrateData?(source: Record<string, unknown>): void;
};

/**
 * HordeTemplate mixin for actors that can operate in horde mode.
 * Provides magnitude tracking, damage multipliers, and horde-specific rules.
 *
 * @param {typeof foundry.abstract.TypeDataModel} Base - The base class to extend.
 * @returns {typeof HordeTemplateMixin} The extended class with horde capabilities.
 */
export default function HordeTemplate<T extends Constructor<foundry.abstract.TypeDataModel<any, any>>>(Base: T) {
    return class HordeTemplateMixin extends Base {
        declare horde: HordeData;

        /**
         * Access the parent actor document with proper typing.
         * @returns {WH40KBaseActor}
         */
        get parentActor(): WH40KBaseActor {
            return (this as any).parent as WH40KBaseActor;
        }

        /* -------------------------------------------- */
        /*  Model Configuration                         */
        /* -------------------------------------------- */

        /** @inheritDoc */
        static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
            return {
                ...super.defineSchema(),
                horde: new SchemaField({
                    // Toggle horde mode on/off
                    enabled: new BooleanField({ required: true, initial: false }),

                    // Magnitude tracking (like hit points for hordes)
                    magnitude: new SchemaField({
                        max: new NumberField({ required: true, initial: 30, min: 1, integer: true }),
                        current: new NumberField({ required: true, initial: 30, min: 0, integer: true }),
                    }),

                    // Damage log for tracking magnitude loss
                    magnitudeLog: new ArrayField(
                        new SchemaField({
                            amount: new NumberField({ required: true, integer: true }),
                            source: new StringField({ required: false, initial: '', blank: true }),
                            timestamp: new NumberField({ required: true }),
                        }),
                        { required: true, initial: [] },
                    ),

                    // Horde-specific traits
                    traits: new ArrayField(new StringField({ required: true }), { required: true, initial: [] }),

                    // Derived values (calculated in prepareDerivedData)
                    damageMultiplier: new NumberField({ required: true, initial: 1.0, min: 0 }),
                    sizeModifier: new NumberField({ required: true, initial: 0, integer: true }),
                }),
            };
        }

        /* -------------------------------------------- */
        /*  Data Migration                              */
        /* -------------------------------------------- */

        /** @inheritDoc */
        static _migrateData(source: Record<string, unknown>): void {
            super._migrateData?.(source);
            // Ensure horde object exists
            source.horde ??= {
                enabled: false,
                magnitude: { max: 30, current: 30 },
                magnitudeLog: [],
                traits: [],
                damageMultiplier: 1.0,
                sizeModifier: 0,
            };
            // Migrate magnitude values to integers
            const horde = source.horde as HordeData;
            if (horde.magnitude) {
                if (horde.magnitude.max !== undefined) {
                    horde.magnitude.max = parseInt(String(horde.magnitude.max), 10) || 30;
                }
                if (horde.magnitude.current !== undefined) {
                    horde.magnitude.current = parseInt(String(horde.magnitude.current), 10) || 30;
                }
            }
        }

        /* -------------------------------------------- */
        /*  Data Preparation                            */
        /* -------------------------------------------- */

        /** @inheritDoc */
        override prepareDerivedData(): void {
            super.prepareDerivedData();
            this._prepareHordeData();
        }

        /**
         * Calculate horde-derived values based on current magnitude.
         * @protected
         */
        _prepareHordeData(): void {
            if (!this.horde.enabled) return;

            const magnitude = this.horde.magnitude;
            const magnitudePercent = magnitude.max > 0 ? magnitude.current / magnitude.max : 0;

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
         * @returns {Promise<WH40KBaseActor>} The updated actor or parent if disabled.
         */
        async applyMagnitudeDamage(amount: number, source = ''): Promise<WH40KBaseActor> {
            if (!this.horde.enabled) return this.parentActor;

            const newMagnitude = Math.max(0, this.horde.magnitude.current - amount);
            const logEntry: HordeLogEntry = {
                amount: -amount,
                source,
                timestamp: Date.now(),
            };

            return (await this.parentActor.update({
                'system.horde.magnitude.current': newMagnitude,
                'system.horde.magnitudeLog': [...this.horde.magnitudeLog, logEntry],
            })) as WH40KBaseActor;
        }

        /**
         * Restore magnitude to the horde.
         * @param {number} amount - Amount of magnitude to restore.
         * @param {string} [source] - Source of the restoration.
         * @returns {Promise<WH40KBaseActor>} The updated actor or parent if disabled.
         */
        async restoreMagnitude(amount: number, source = ''): Promise<WH40KBaseActor> {
            if (!this.horde.enabled) return this.parentActor;

            const newMagnitude = Math.min(this.horde.magnitude.max, this.horde.magnitude.current + amount);
            const logEntry: HordeLogEntry = {
                amount: amount,
                source,
                timestamp: Date.now(),
            };

            return (await this.parentActor.update({
                'system.horde.magnitude.current': newMagnitude,
                'system.horde.magnitudeLog': [...this.horde.magnitudeLog, logEntry],
            })) as WH40KBaseActor;
        }

        /**
         * Toggle horde mode on/off.
         * @returns {Promise<WH40KBaseActor>} The updated actor.
         */
        async toggleHordeMode(): Promise<WH40KBaseActor> {
            return this.parentActor.update({
                'system.horde.enabled': !this.horde.enabled,
            }) as Promise<WH40KBaseActor>;
        }

        /**
         * Get the effective damage output multiplier for this horde.
         * @returns {number} The damage multiplier.
         */
        get hordeDamageMultiplier(): number {
            return this.horde.enabled ? this.horde.damageMultiplier : 1;
        }

        /**
         * Check if the horde is destroyed (magnitude 0).
         * @returns {boolean}
         */
        get hordeDestroyed(): boolean {
            return this.horde.enabled && this.horde.magnitude.current <= 0;
        }

        /**
         * Get magnitude as a percentage.
         * @returns {number} Percentage 0-100.
         */
        get magnitudePercent(): number {
            if (!this.horde.enabled || this.horde.magnitude.max <= 0) return 0;
            return Math.round((this.horde.magnitude.current / this.horde.magnitude.max) * 100);
        }
    };
}
