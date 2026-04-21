/**
 * @file EnhancedAnimationsMixin - Advanced animations for stat changes
 * Provides smooth counter animations, wounds bar filling, bonus pulses
 * Extends the basic VisualFeedbackMixin with more sophisticated animations
 */

import type { AnyApplicationV2, ApplicationV2Ctor } from './application-types.ts';
import type { WH40KBaseActorDocument, WH40KWounds } from '../../types/global.d.ts';
import type { EnhancedAnimationsMixinAPI } from './sheet-mixin-types.js';

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
export default function EnhancedAnimationsMixin<T extends ApplicationV2Ctor>(Base: T) {
    return class EnhancedAnimationsApplication extends Base implements EnhancedAnimationsMixinAPI {
        constructor(...args: any[]) {
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

        declare document: WH40KBaseActorDocument;

        /* -------------------------------------------- */
        /*  Hook into Document Updates                  */
        /* -------------------------------------------- */

        /** @override */
        async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            await super._onRender(context, options);

            // Capture current state for comparison
            this._captureAnimationState();

            // Setup mutation observer for dynamic content
            this._setupMutationObserver();
        }

        /* -------------------------------------------- */

        /**
         * Capture current document values for animation comparison.
         * @protected
         */
        _captureAnimationState(): void {
            const document = this.document;
            if (!document) return;

            const system = document.system as any;
            this._previousState = {
                wounds: system.wounds?.value as number | undefined,
                woundsMax: system.wounds?.max as number | undefined,
                characteristics: {} as Record<string, { total: number; bonus: number }>,
                experience: system.experience?.total as number | undefined,
                fatigue: system.fatigue?.value as number | undefined,
            };

            // Capture characteristic bonuses
            const chars = system.characteristics as Record<string, { total: number; bonus: number }> | undefined;
            if (chars) {
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
        animateCounter(element: HTMLElement, fromValue: number, toValue: number, options: Record<string, unknown> = {}): void {
            if (!element || fromValue === toValue) return;
            if (this._shouldSkipAnimation()) return;

            const duration = (options.duration as number) || this._animationConfig.counterDuration;
            const formatFn = (options.format as (v: number) => string) || ((v: number) => Math.round(v).toString());
            const animationKey = element.dataset.animationKey || `counter-${Date.now()}`;

            // Cancel existing animation on this element
            if (this._runningAnimations.has(animationKey)) {
                cancelAnimationFrame(this._runningAnimations.get(animationKey)!);
            }

            // Add counter class for styling
            element.classList.add('value-counter');
            if (toValue > fromValue) {
                element.classList.add('counting-up');
                element.classList.remove('counting-down');
            } else {
                element.classList.add('counting-down');
                element.classList.remove('counting-up');
            }

            const startTime = Date.now();
            const difference = toValue - fromValue;

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease-out cubic for smooth deceleration
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = fromValue + difference * eased;

                element.textContent = formatFn(current);

                if (progress < 1) {
                    const frameId = requestAnimationFrame(animate);
                    this._runningAnimations.set(animationKey, frameId);
                } else {
                    element.textContent = formatFn(toValue);
                    this._runningAnimations.delete(animationKey);
                    element.classList.remove('counting-up', 'counting-down');
                }
            };

            requestAnimationFrame(animate);
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
                const animClass = newValue > oldValue ? 'stat-heal' : 'stat-damage';
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
            const fill = barElement.querySelector('.wh40k-wounds-bar-fill') as HTMLElement | null;
            if (!fill) return;

            const duration = this._animationConfig.barDuration;
            const startTime = Date.now();

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease-out for smooth transition
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = fromPercent + (toPercent - fromPercent) * eased;

                barElement.style.setProperty('--wounds-percent', `${current}%`);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };

            requestAnimationFrame(animate);
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
            const charElement = this.element.querySelector(`[data-characteristic="${charKey}"] .char-total`) as HTMLElement | null;

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
            let bonusElement = this.element.querySelector(`[data-characteristic="${charKey}"] .wh40k-char-hud-mod`) as HTMLElement | null;

            // Fallback to generic bonus-val class
            if (!bonusElement) {
                bonusElement = this.element.querySelector(`[data-characteristic="${charKey}"] .bonus-val`) as HTMLElement | null;
            }

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

            const xpElement = this.element.querySelector(
                '[name="system.experience.total"], ' + '.xp-total, ' + '[data-field="experience-total"]',
            ) as HTMLElement | null;

            if (!xpElement) return;

            // Animate counter
            this.animateCounter(xpElement, oldXP, newXP);

            // Add golden radiance effect
            this._flashElement((xpElement.closest('.xp-display') as HTMLElement) || xpElement, 'stat-advancement', 1000);
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

            const fill = barElement.querySelector('.wh40k-wounds-bar-fill, .progress-fill') as HTMLElement | null;

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
            if (!element) return;

            element.classList.remove(animClass);
            void element.offsetWidth; // Force reflow
            element.classList.add(animClass);

            setTimeout(() => {
                element.classList.remove(animClass);
            }, duration);
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

        _showBriefNotification(element: HTMLElement, message: string, type: string = 'info'): void {
            const notification = document.createElement('div');
            notification.className = `wh40k-brief-notification wh40k-notification-${type}`;
            notification.textContent = message;

            const rect = element.getBoundingClientRect();
            notification.style.cssText = `
                position: fixed;
                left: ${rect.right + 10}px;
                top: ${rect.top}px;
                z-index: 10000;
                pointer-events: none;
                opacity: 0;
                transform: translateX(-10px);
                transition: opacity 0.2s ease, transform 0.2s ease;
            `;

            document.body.appendChild(notification);

            requestAnimationFrame(() => {
                notification.style.opacity = '1';
                notification.style.transform = 'translateX(0)';
            });

            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(10px)';
                setTimeout(() => notification.remove(), 200);
            }, 1500);
        }

        /* -------------------------------------------- */
    };
}
