/**
 * @file EnhancedAnimationsMixin - Advanced animations for stat changes
 * Provides smooth counter animations, wounds bar filling, bonus pulses.
 *
 * This mixin is the single home of the sheet animation engine: it absorbed the
 * former VisualFeedbackMixin (#276), which is now a thin alias of this class
 * (see `visual-feedback-mixin.ts`). It therefore exposes both the change-tracking
 * / stat-flash API (`_flashStatChange`, `visualizeChanges`, `animateStatChange`,
 * `_findFieldElement`, …) and the richer counter / wounds-bar / XP animations.
 */

import type { WH40KBaseActorDocument, WH40KWounds } from '../../types/global.d.ts';
import { flashElement, rafTween, showBriefNotification } from './animation-utils.ts';
import type { ApplicationV2Ctor } from './application-types.ts';
import type { EnhancedAnimationsMixinAPI } from './sheet-mixin-types.js';

/** CSS animation classes cleared before (re-)applying a stat-change animation. */
const STAT_ANIMATION_CLASSES = [
    'tw-animate-stat-increase',
    'tw-animate-stat-decrease',
    'tw-animate-flash-update',
    'tw-animate-stat-heal',
    'tw-animate-stat-damage',
    'tw-animate-stat-advance',
    'pulse-gold',
    'pulse-glow',
] as const;

interface AnimationSnapshot {
    wounds?: number;
    woundsMax?: number;
    characteristics?: Record<string, { total?: number; bonus?: number }>;
    experience?: number;
    fatigue?: number;
}

/**
 * Mixin to add enhanced animation capabilities to ApplicationV2 sheets.
 * @template {ApplicationV2} T
 * @param {T} Base   Application class being extended.
 * @returns {any}
 * @mixin
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- mixin return type is the inferred derived class shape
export default function EnhancedAnimationsMixin<T extends ApplicationV2Ctor>(Base: T) {
    return class EnhancedAnimationsApplication extends Base implements EnhancedAnimationsMixinAPI {
        /* eslint-disable @typescript-eslint/no-explicit-any -- mixin constructor must use any[] per TS 2545 for class merging */
        // biome-ignore lint/complexity/noUselessConstructor: required to forward any[] args per TS mixin rule (TS2545)
        // biome-ignore lint/suspicious/noExplicitAny: mixin constructor requires any[] per TS mixin rule (TS2545)
        constructor(...args: any[]) {
            /* eslint-enable @typescript-eslint/no-explicit-any */
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- super spread accepts any[] from mixin constructor
            super(...args);
        }

        /* -------------------------------------------- */
        /*  Configuration                               */
        /* -------------------------------------------- */

        /**
         * Animation configuration settings.
         * @type {Object}
         * @protected
         */
        _animationConfig = {
            counterDuration: 500, // ms for number counter
            barDuration: 400, // ms for progress bar
            pulseDuration: 800, // ms for bonus pulse
            enableSound: false, // Sound effects (future)
            respectReducedMotion: true, // Honor accessibility settings
        };

        /* -------------------------------------------- */

        /**
         * Track currently running animations to prevent conflicts.
         * @type {Map<string, number>}
         * @protected
         */
        _runningAnimations: Map<string, number> = new Map();

        /** Previous animation state snapshot. */
        _previousState: AnimationSnapshot | null = null;
        /** MutationObserver for dynamic content. */
        _mutationObserver: MutationObserver | null = null;

        /** Flat previous document values for change tracking (absorbed VisualFeedback API). */
        _previousValues: Map<string, number | string> = new Map();

        declare document: WH40KBaseActorDocument;

        /* -------------------------------------------- */
        /*  Hook into Document Updates                  */
        /* -------------------------------------------- */

        /** @override */
        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender context is untyped record
        override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            await super._onRender(context, options);

            // Capture flat values for change tracking
            this._captureCurrentValues();

            // Capture current state for comparison
            this._captureAnimationState();

            // Setup mutation observer for dynamic content
            this._setupMutationObserver();
        }

        /* -------------------------------------------- */

        /**
         * Capture current document values for change tracking (flat map).
         * @protected
         */
        _captureCurrentValues(): void {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- defensive: document may be unset early in lifecycle
            if (!this.document) return;

            const data = foundry.utils.flattenObject(this.document.toObject());
            Object.entries(data).forEach(([key, value]) => {
                if (typeof value === 'number' || typeof value === 'string') {
                    this._previousValues.set(key, value);
                }
            });
        }

        /* -------------------------------------------- */

        /**
         * Capture current document values for animation comparison.
         * @protected
         */
        _captureAnimationState(): void {
            const document = this.document;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- defensive: document may be unset early in lifecycle
            if (!document) return;

            type AnimSystem = {
                wounds?: { value?: number; max?: number };
                experience?: { total?: number };
                fatigue?: { value?: number };
                characteristics?: Record<string, { total: number; bonus: number }>;
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: per-system actor schemas read uniformly via local AnimSystem shape
            const system = document.system as unknown as AnimSystem;
            const snapshot: AnimationSnapshot = { characteristics: {} };
            const woundsValue = system.wounds?.value;
            const woundsMax = system.wounds?.max;
            const experience = system.experience?.total;
            const fatigue = system.fatigue?.value;
            if (woundsValue !== undefined) snapshot.wounds = woundsValue;
            if (woundsMax !== undefined) snapshot.woundsMax = woundsMax;
            if (experience !== undefined) snapshot.experience = experience;
            if (fatigue !== undefined) snapshot.fatigue = fatigue;
            this._previousState = snapshot;

            // Capture characteristic bonuses
            const chars = system.characteristics;
            if (chars) {
                this._previousState.characteristics = {};
                for (const [key, char] of Object.entries(chars)) {
                    this._previousState.characteristics[key] = {
                        total: char.total,
                        bonus: char.bonus,
                    };
                }
            }
        }

        /* -------------------------------------------- */

        /**
         * Setup mutation observer to detect DOM changes.
         * @protected
         */
        _setupMutationObserver(): void {
            if (this._mutationObserver) this._mutationObserver.disconnect();

            this._mutationObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'data-percent') {
                        // Progress bar percentage changed
                        this._animateProgressBar(mutation.target as HTMLElement);
                    }
                }
            });

            // Observe wounds bar
            const woundsBar = this.element.querySelector('.wh40k-wounds-bar');
            if (woundsBar) {
                this._mutationObserver.observe(woundsBar, { attributes: true });
            }
        }

        /* -------------------------------------------- */
        /*  Counter Animations                          */
        /* -------------------------------------------- */

        /**
         * Animate a number counting from old to new value.
         * @param {HTMLElement} element     Element containing the number
         * @param {number} fromValue        Starting value
         * @param {number} toValue          Ending value
         * @param {Object} options          Animation options
         */
        // eslint-disable-next-line no-restricted-syntax -- boundary: animation options accept ad-hoc consumer-supplied fields
        animateCounter(element: HTMLElement, fromValue: number, toValue: number, options: Record<string, unknown> = {}): void {
            if (fromValue === toValue) return;
            if (this._shouldSkipAnimation()) return;

            const duration = (options['duration'] as number | undefined) ?? this._animationConfig.counterDuration;
            const formatFn = (options['format'] as ((v: number) => string) | undefined) ?? ((v: number) => Math.round(v).toString());
            const animationKey = element.dataset['animationKey'] ?? `counter-${Date.now()}`;

            // Cancel existing animation on this element
            const runningId = this._runningAnimations.get(animationKey);
            if (runningId !== undefined) {
                cancelAnimationFrame(runningId);
            }

            // Add counter class for styling
            element.classList.add('value-counter');
            if (toValue > fromValue) {
                element.classList.add('tw-animate-count-up');
                element.classList.remove('tw-animate-count-down');
            } else {
                element.classList.add('tw-animate-count-down');
                element.classList.remove('tw-animate-count-up');
            }

            rafTween({
                from: fromValue,
                to: toValue,
                duration,
                onFrame: (value) => {
                    element.textContent = formatFn(value);
                },
                onSchedule: (frameId) => {
                    this._runningAnimations.set(animationKey, frameId);
                },
                onComplete: () => {
                    element.textContent = formatFn(toValue);
                    this._runningAnimations.delete(animationKey);
                    element.classList.remove('tw-animate-count-up', 'tw-animate-count-down');
                },
            });
        }

        /* -------------------------------------------- */
        /*  Wounds Animations                           */
        /* -------------------------------------------- */

        /**
         * Animate wounds value change with counter and bar.
         * @param {number} oldValue     Previous wounds
         * @param {number} newValue     New wounds
         */
        animateWoundsChange(oldValue: number, newValue: number): void {
            if (this._shouldSkipAnimation()) return;

            // Animate the counter
            const woundsDisplay = this.element.querySelector<HTMLElement>('.wh40k-wounds-current');
            if (woundsDisplay) {
                this.animateCounter(woundsDisplay, oldValue, newValue);
            }

            // Animate the wounds bar
            const woundsBar = this.element.querySelector<HTMLElement>('.wh40k-wounds-bar');
            if (woundsBar) {
                const doc = this.document;
                const wounds = doc.system.wounds as WH40KWounds | undefined;
                const max = wounds?.max ?? 1;
                const oldPercent = (oldValue / max) * 100;
                const newPercent = (newValue / max) * 100;
                this._animateWoundsBar(woundsBar, oldPercent, newPercent);
            }

            // Add visual feedback class
            const woundsValue = this.element.querySelector<HTMLElement>('.wh40k-wounds-value');
            if (woundsValue) {
                const animClass = newValue > oldValue ? 'tw-animate-stat-heal' : 'tw-animate-stat-damage';
                this._flashElement(woundsValue, animClass, 800);
            }
        }

        /* -------------------------------------------- */

        /**
         * Animate wounds bar filling/draining.
         * @param {HTMLElement} barElement      The wounds bar container
         * @param {number} fromPercent          Starting percentage
         * @param {number} toPercent            Ending percentage
         * @protected
         */
        _animateWoundsBar(barElement: HTMLElement, fromPercent: number, toPercent: number): void {
            const fill = barElement.querySelector('.wh40k-wounds-bar-fill');
            if (!fill) return;

            const duration = this._animationConfig.barDuration;
            rafTween({
                from: fromPercent,
                to: toPercent,
                duration,
                onFrame: (value) => {
                    barElement.style.setProperty('--wounds-percent', `${value}%`);
                },
            });
        }

        /* -------------------------------------------- */
        /*  Characteristic Animations                   */
        /* -------------------------------------------- */

        /**
         * Animate characteristic total change.
         * @param {string} charKey      Characteristic key (e.g., "weaponSkill")
         * @param {number} oldValue     Previous total
         * @param {number} newValue     New total
         */
        animateCharacteristicChange(charKey: string, oldValue: number, newValue: number): void {
            if (this._shouldSkipAnimation()) return;

            // Find the characteristic display
            const charElement = this.element.querySelector<HTMLElement>(`[data-characteristic="${charKey}"] .char-total`);

            if (charElement) {
                this.animateCounter(charElement, oldValue, newValue);
                this._flashElement(charElement, 'changed', 500);
            }

            // Check if bonus changed
            const oldBonus = Math.floor(oldValue / 10);
            const newBonus = Math.floor(newValue / 10);

            if (oldBonus !== newBonus) {
                this.animateCharacteristicBonus(charKey, oldBonus, newBonus);
            }
        }

        /* -------------------------------------------- */

        /**
         * Animate characteristic bonus change with pulse.
         * @param {string} charKey      Characteristic key
         * @param {number} oldBonus     Previous bonus
         * @param {number} newBonus     New bonus
         */
        animateCharacteristicBonus(charKey: string, oldBonus: number, newBonus: number): void {
            if (this._shouldSkipAnimation()) return;

            // Find bonus display - try V1 HUD first, then fallback
            const bonusElement =
                this.element.querySelector<HTMLElement>(`[data-characteristic="${charKey}"] .wh40k-char-hud-mod`) ??
                this.element.querySelector<HTMLElement>(`[data-characteristic="${charKey}"] .bonus-val`);

            if (!bonusElement) return;

            // Animate counter
            this.animateCounter(bonusElement, oldBonus, newBonus);

            // Pulse effect on the circle container (V1 HUD)
            const circleContainer = bonusElement.closest('.wh40k-char-hud-circle');
            if (circleContainer) {
                circleContainer.classList.remove('value-changed');
                void (circleContainer as HTMLElement).offsetWidth; // Force reflow
                circleContainer.classList.add('value-changed');

                setTimeout(() => {
                    circleContainer.classList.remove('value-changed');
                }, 500);
            }
        }

        /* -------------------------------------------- */
        /*  XP & Advancement Animations                 */
        /* -------------------------------------------- */

        /**
         * Animate XP gain with "leveling up" effect.
         * @param {number} oldXP        Previous XP total
         * @param {number} newXP        New XP total
         */
        animateXPGain(oldXP: number, newXP: number): void {
            if (this._shouldSkipAnimation()) return;
            if (newXP <= oldXP) return; // Only animate gains

            const xpElement = this.element.querySelector<HTMLElement>('[name="system.experience.total"], .xp-total, [data-field="experience-total"]');

            if (!xpElement) return;

            // Animate counter
            this.animateCounter(xpElement, oldXP, newXP);

            // Add golden radiance effect
            const flashTarget = xpElement.closest<HTMLElement>('.xp-display') ?? xpElement;
            this._flashElement(flashTarget, 'tw-animate-stat-advance', 1000);
        }

        /* -------------------------------------------- */
        /*  Progress Bar Animations                     */
        /* -------------------------------------------- */

        /**
         * Animate any progress bar change.
         * @param {HTMLElement} barElement      Progress bar element
         * @protected
         */
        _animateProgressBar(barElement: HTMLElement): void {
            if (this._shouldSkipAnimation()) return;

            const fill = barElement.querySelector<HTMLElement>('.wh40k-wounds-bar-fill, .progress-fill');

            if (fill) {
                fill.style.transition = `width ${this._animationConfig.barDuration}ms ease-out`;
            }
        }

        /* -------------------------------------------- */
        /*  Utility Methods                             */
        /* -------------------------------------------- */

        /**
         * Flash an element with an animation class.
         * @param {HTMLElement} element     Element to flash
         * @param {string} animClass        CSS animation class
         * @param {number} duration         Duration in ms
         * @protected
         */
        _flashElement(element: HTMLElement, animClass: string, duration: number = 500): void {
            flashElement(element, animClass, duration);
        }

        /* -------------------------------------------- */

        /**
         * Check if animations should be skipped (reduced motion preference).
         * @returns {boolean}
         * @protected
         */
        _shouldSkipAnimation(): boolean {
            if (!this._animationConfig.respectReducedMotion) return false;
            return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        }

        /* -------------------------------------------- */

        /**
         * Show a brief toast notification anchored to the right of an element.
         * @param {HTMLElement} element     Element to anchor the toast to
         * @param {string} message          Message to display
         * @param {string} type             Type: "success", "warning", "error", "info"
         * @protected
         */
        _showBriefNotification(element: HTMLElement, message: string, type: string = 'info'): void {
            showBriefNotification(element, message, type, { position: 'right' });
        }

        /* -------------------------------------------- */
        /*  Stat-Change Feedback (absorbed VisualFeedback) */
        /* -------------------------------------------- */

        /**
         * Flash visual feedback when a stat changes.
         * @param {string} fieldName    The field name that changed (e.g., "system.wounds.value")
         * @param {number|string} oldValue  The previous value
         * @param {number|string} newValue  The new value
         * @protected
         */
        _flashStatChange(fieldName: string, oldValue: number | string, newValue: number | string): void {
            const element = this._findFieldElement(fieldName);
            if (!element) return;

            const animationClass = this._getAnimationClass(fieldName, oldValue, newValue);
            this._applyAnimation(element, animationClass);
        }

        /* -------------------------------------------- */

        /**
         * Find the DOM element for a field via a name → data-attr → class selector cascade.
         * @param {string} fieldName    The field name
         * @returns {HTMLElement|null}
         * @protected
         */
        _findFieldElement(fieldName: string): HTMLElement | null {
            let element = this.element.querySelector(`[name="${fieldName}"]`);
            if (element) return element as HTMLElement;

            const dataAttr = fieldName.replace(/^system\./, '').replace(/\./g, '-');
            element = this.element.querySelector(`[data-field="${dataAttr}"]`);
            if (element) return element as HTMLElement;

            element = this.element.querySelector(`[data-stat="${dataAttr}"]`);
            if (element) return element as HTMLElement;

            const patterns = [`.stat-${dataAttr}`, `.${dataAttr}-value`, `#${dataAttr}`, `[data-tooltip*="${dataAttr}"]`];

            for (const pattern of patterns) {
                element = this.element.querySelector(pattern);
                if (element) return element as HTMLElement;
            }

            return null;
        }

        /* -------------------------------------------- */

        /**
         * Determine the appropriate animation class for a given value change.
         * @param {string} fieldName    Field that changed
         * @param {number|string} oldValue  Previous value
         * @param {number|string} newValue  New value
         * @returns {string}    Animation class name
         * @protected
         */
        _getAnimationClass(fieldName: string, oldValue: number | string, newValue: number | string): string {
            if (fieldName.includes('wounds') && fieldName.includes('value')) {
                return Number(newValue) > Number(oldValue) ? 'tw-animate-stat-heal' : 'tw-animate-stat-damage';
            }

            if (fieldName.includes('experience.total') || fieldName.includes('advance')) {
                return 'tw-animate-stat-advance';
            }

            if (typeof oldValue === 'number' && typeof newValue === 'number') {
                if (newValue > oldValue) return 'tw-animate-stat-increase';
                if (newValue < oldValue) return 'tw-animate-stat-decrease';
            }

            return 'tw-animate-flash-update';
        }

        /* -------------------------------------------- */

        /**
         * Apply a stat-change animation class to an element (clearing the prior set first).
         * @param {HTMLElement} element     Element to animate
         * @param {string} animationClass   CSS animation class
         * @protected
         */
        _applyAnimation(element: HTMLElement, animationClass: string): void {
            flashElement(element, animationClass, 1000, STAT_ANIMATION_CLASSES);
        }

        /* -------------------------------------------- */

        /**
         * Animate derived stat changes (like characteristic bonuses) with a glow pulse.
         * @param {string} selector     CSS selector for element
         * @protected
         */
        _animateDerivedStat(selector: string): void {
            const element = this.element.querySelector<HTMLElement>(selector);
            if (!element) return;
            flashElement(element, 'tw-animate-pulse-glow', 1000);
        }

        /* -------------------------------------------- */

        /**
         * Animate a numeric counter from one value to another (simple variant; no
         * skip/cancel bookkeeping — see {@link animateCounter} for the richer engine).
         * @param {HTMLElement} element     Element containing the number
         * @param {number} fromValue        Starting value
         * @param {number} toValue          Ending value
         * @param {number} duration         Animation duration in ms
         * @protected
         */
        _animateCounter(element: HTMLElement, fromValue: number, toValue: number, duration: number = 500): void {
            rafTween({
                from: fromValue,
                to: toValue,
                duration,
                onFrame: (value) => {
                    element.textContent = Math.round(value).toString();
                },
                onComplete: () => {
                    element.textContent = toValue.toString();
                },
            });
        }

        /* -------------------------------------------- */

        /**
         * Public API: flash a stat field by animation kind.
         * @param {string} fieldName        Field to animate
         * @param {string} animationType    "increase" | "decrease" | "heal" | "damage" | "flash"
         */
        animateStatChange(fieldName: string, animationType: string = 'flash'): void {
            const element = this._findFieldElement(fieldName);
            if (!element) return;

            const animationClass =
                animationType === 'increase'
                    ? 'tw-animate-stat-increase'
                    : animationType === 'decrease'
                    ? 'tw-animate-stat-decrease'
                    : animationType === 'heal'
                    ? 'tw-animate-stat-heal'
                    : animationType === 'damage'
                    ? 'tw-animate-stat-damage'
                    : 'tw-animate-flash-update';

            this._applyAnimation(element, animationClass);
        }

        /* -------------------------------------------- */

        /**
         * Public API: diff a changes payload against the captured previous values and
         * flash each changed field, then re-capture.
         * @param {Record<string, unknown>} changes    Foundry update payload
         */
        // eslint-disable-next-line no-restricted-syntax -- Foundry API boundary: flattenObject input is untyped
        visualizeChanges(changes: Record<string, unknown>): void {
            const flattened = foundry.utils.flattenObject(changes);

            Object.entries(flattened).forEach(([key, newValue]) => {
                const oldValue = this._previousValues.get(key);
                if (oldValue !== undefined && oldValue !== newValue) {
                    this._flashStatChange(key, oldValue, newValue as number | string);
                }
            });

            this._captureCurrentValues();
        }

        /* -------------------------------------------- */
    };
}
