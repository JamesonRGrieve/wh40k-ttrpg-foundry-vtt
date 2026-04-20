/**
 * @file VisualFeedbackMixin - Provides visual feedback for stat changes
 * Adds animated feedback when actor values are updated
 */

type ApplicationV2 = foundry.applications.api.ApplicationV2.Any;
import type { VisualFeedbackMixinAPI } from './sheet-mixin-types.js';

/**
 * Mixin to add visual feedback capabilities to ApplicationV2 sheets.
 * @template {ApplicationV2} T
 * @param {T} Base   Application class being extended.
 * @returns {any}
 * @mixin
 */
export default function VisualFeedbackMixin<T extends new (...args: any[]) => ApplicationV2>(Base: T) {
    return class VisualFeedbackApplication extends Base implements VisualFeedbackMixinAPI {
        /* -------------------------------------------- */
        /*  Change Tracking                             */
        /* -------------------------------------------- */

        /**
         * Store previous values for comparison.
         * @type {Map<string, any>}
         * @protected
         */
        _previousValues: Map<string, any> = new Map();

        /* -------------------------------------------- */

        declare document: any;

        /* -------------------------------------------- */
        /*  Form Submission Override                    */
        /* -------------------------------------------- */

        /** @override */
        _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> | void {
            super._onRender(context, options);
            this._captureCurrentValues();
        }

        /* -------------------------------------------- */

        /**
         * Capture current document values for change tracking.
         * @protected
         */
        _captureCurrentValues(): void {
            if (!this.document) return;

            const data = foundry.utils.flattenObject(this.document.toObject());
            Object.entries(data).forEach(([key, value]) => {
                if (typeof value === 'number' || typeof value === 'string') {
                    this._previousValues.set(key, value);
                }
            });
        }

        /* -------------------------------------------- */
        /*  Visual Feedback Methods                     */
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
         * Find the DOM element for a field.
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
         * Determine appropriate animation class based on change.
         * @param {string} fieldName    Field that changed
         * @param {number|string} oldValue  Previous value
         * @param {number|string} newValue  New value
         * @returns {string}    Animation class name
         * @protected
         */
        _getAnimationClass(fieldName: string, oldValue: number | string, newValue: number | string): string {
            if (fieldName.includes('wounds') && fieldName.includes('value')) {
                return Number(newValue) > Number(oldValue) ? 'stat-heal' : 'stat-damage';
            }

            if (fieldName.includes('experience.total') || fieldName.includes('advance')) {
                return 'stat-advancement';
            }

            if (typeof oldValue === 'number' && typeof newValue === 'number') {
                if (newValue > oldValue) return 'stat-increase';
                if (newValue < oldValue) return 'stat-decrease';
            }

            return 'flash-update';
        }

        /* -------------------------------------------- */

        /**
         * Apply animation class to element.
         * @param {HTMLElement} element     Element to animate
         * @param {string} animationClass   CSS animation class
         * @protected
         */
        _applyAnimation(element: HTMLElement, animationClass: string): void {
            const animationClasses = [
                'stat-increase',
                'stat-decrease',
                'flash-update',
                'stat-heal',
                'stat-damage',
                'stat-advancement',
                'pulse-gold',
                'pulse-glow',
            ];
            element.classList.remove(...animationClasses);

            void element.offsetWidth;

            element.classList.add(animationClass);

            setTimeout(() => {
                element.classList.remove(animationClass);
            }, 1000);
        }

        /* -------------------------------------------- */

        /**
         * Animate derived stat changes (like characteristic bonuses).
         * @param {string} selector     CSS selector for element
         * @protected
         */
        _animateDerivedStat(selector: string): void {
            const element = this.element.querySelector(selector);
            if (!element) return;

            element.classList.remove('derived-stat-changed');
            void element.offsetWidth;
            element.classList.add('derived-stat-changed');

            setTimeout(() => {
                element.classList.remove('derived-stat-changed');
            }, 1000);
        }

        /* -------------------------------------------- */

        /**
         * Animate a value counter (number counting up/down).
         * @param {HTMLElement} element     Element containing the number
         * @param {number} fromValue        Starting value
         * @param {number} toValue          Ending value
         * @param {number} duration         Animation duration in ms
         * @protected
         */
        _animateCounter(element: HTMLElement, fromValue: number, toValue: number, duration: number = 500): void {
            const start = Date.now();
            const difference = toValue - fromValue;

            const animate = () => {
                const elapsed = Date.now() - start;
                const progress = Math.min(elapsed / duration, 1);

                const eased = 1 - Math.pow(1 - progress, 3);
                const current = Math.round(fromValue + difference * eased);

                element.textContent = current.toString();

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    element.textContent = toValue.toString();
                }
            };

            requestAnimationFrame(animate);
        }

        /* -------------------------------------------- */

        /**
         * Show a brief notification tooltip on an element.
         * @param {HTMLElement} element     Element to show tooltip on
         * @param {string} message          Message to display
         * @param {string} type             Type: "success", "warning", "error", "info"
         * @protected
         */
        _showBriefNotification(element: HTMLElement, message: string, type: string = 'info'): void {
            const tooltip = document.createElement('div');
            tooltip.className = `brief-notification brief-notification-${type}`;
            tooltip.textContent = message;
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.85em;
                pointer-events: none;
                z-index: 10000;
                white-space: nowrap;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;

            const rect = element.getBoundingClientRect();
            tooltip.style.left = `${rect.left + rect.width / 2}px`;
            tooltip.style.top = `${rect.top - 30}px`;
            tooltip.style.transform = 'translateX(-50%)';

            document.body.appendChild(tooltip);

            tooltip.style.opacity = '0';
            tooltip.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            requestAnimationFrame(() => {
                tooltip.style.opacity = '1';
                tooltip.style.transform = 'translateX(-50%) translateY(-5px)';
            });

            setTimeout(() => {
                tooltip.style.opacity = '0';
                tooltip.style.transform = 'translateX(-50%) translateY(-10px)';
                setTimeout(() => tooltip.remove(), 200);
            }, 2000);
        }

        /* -------------------------------------------- */
        /*  Public API                                  */
        /* -------------------------------------------- */

        animateStatChange(fieldName: string, animationType: string = 'flash'): void {
            const element = this._findFieldElement(fieldName);
            if (!element) return;

            const animationClass =
                animationType === 'increase'
                    ? 'stat-increase'
                    : animationType === 'decrease'
                    ? 'stat-decrease'
                    : animationType === 'heal'
                    ? 'stat-heal'
                    : animationType === 'damage'
                    ? 'stat-damage'
                    : 'flash-update';

            this._applyAnimation(element, animationClass);
        }

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
    };
}
