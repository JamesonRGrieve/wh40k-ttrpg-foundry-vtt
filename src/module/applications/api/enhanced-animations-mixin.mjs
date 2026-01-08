/**
 * @file EnhancedAnimationsMixin - Advanced animations for stat changes
 * Provides smooth counter animations, wounds bar filling, bonus pulses
 * Extends the basic VisualFeedbackMixin with more sophisticated animations
 */

/**
 * Mixin to add enhanced animation capabilities to ApplicationV2 sheets.
 * @template {ApplicationV2} T
 * @param {typeof T} Base   Application class being extended.
 * @returns {typeof EnhancedAnimationsApplication}
 * @mixin
 */
export default function EnhancedAnimationsMixin(Base) {
    class EnhancedAnimationsApplication extends Base {
        
        /* -------------------------------------------- */
        /*  Configuration                               */
        /* -------------------------------------------- */
        
        /**
         * Animation configuration settings.
         * @type {Object}
         * @protected
         */
        _animationConfig = {
            counterDuration: 500,      // ms for number counter
            barDuration: 400,          // ms for progress bar
            pulseDuration: 800,        // ms for bonus pulse
            enableSound: false,        // Sound effects (future)
            respectReducedMotion: true // Honor accessibility settings
        };
        
        /* -------------------------------------------- */
        
        /**
         * Track currently running animations to prevent conflicts.
         * @type {Map<string, number>}
         * @protected
         */
        _runningAnimations = new Map();
        
        /* -------------------------------------------- */
        /*  Hook into Document Updates                  */
        /* -------------------------------------------- */
        
        /** @override */
        _onRender(context, options) {
            super._onRender?.(context, options);
            
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
        _captureAnimationState() {
            if (!this.document) return;
            
            this._previousState = {
                wounds: this.document.system.wounds?.value,
                woundsMax: this.document.system.wounds?.max,
                characteristics: {},
                experience: this.document.system.experience?.total,
                fatigue: this.document.system.fatigue?.value
            };
            
            // Capture characteristic bonuses
            for (const [key, char] of Object.entries(this.document.system.characteristics || {})) {
                this._previousState.characteristics[key] = {
                    total: char.total,
                    bonus: char.bonus
                };
            }
        }
        
        /* -------------------------------------------- */
        
        /**
         * Setup mutation observer to detect DOM changes.
         * @protected
         */
        _setupMutationObserver() {
            if (this._mutationObserver) this._mutationObserver.disconnect();
            
            this._mutationObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === "attributes" && mutation.attributeName === "data-percent") {
                        // Progress bar percentage changed
                        this._animateProgressBar(mutation.target);
                    }
                }
            });
            
            // Observe wounds bar
            const woundsBar = this.element.querySelector(".rt-wounds-bar");
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
         * @returns {Promise<void>}
         */
        async animateCounter(element, fromValue, toValue, options = {}) {
            if (!element || fromValue === toValue) return;
            if (this._shouldSkipAnimation()) return;
            
            const duration = options.duration || this._animationConfig.counterDuration;
            const formatFn = options.format || (v => Math.round(v));
            const animationKey = element.dataset.animationKey || `counter-${Date.now()}`;
            
            // Cancel existing animation on this element
            if (this._runningAnimations.has(animationKey)) {
                cancelAnimationFrame(this._runningAnimations.get(animationKey));
            }
            
            // Add counter class for styling
            element.classList.add("value-counter");
            if (toValue > fromValue) {
                element.classList.add("counting-up");
                element.classList.remove("counting-down");
            } else {
                element.classList.add("counting-down");
                element.classList.remove("counting-up");
            }
            
            const startTime = Date.now();
            const difference = toValue - fromValue;
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Ease-out cubic for smooth deceleration
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = fromValue + (difference * eased);
                
                element.textContent = formatFn(current);
                
                if (progress < 1) {
                    const frameId = requestAnimationFrame(animate);
                    this._runningAnimations.set(animationKey, frameId);
                } else {
                    element.textContent = formatFn(toValue);
                    this._runningAnimations.delete(animationKey);
                    element.classList.remove("counting-up", "counting-down");
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
        animateWoundsChange(oldValue, newValue) {
            if (this._shouldSkipAnimation()) return;
            
            // Animate the counter
            const woundsDisplay = this.element.querySelector(".rt-wounds-current");
            if (woundsDisplay) {
                this.animateCounter(woundsDisplay, oldValue, newValue);
            }
            
            // Animate the wounds bar
            const woundsBar = this.element.querySelector(".rt-wounds-bar");
            if (woundsBar) {
                const max = this.document.system.wounds?.max || 1;
                const oldPercent = (oldValue / max) * 100;
                const newPercent = (newValue / max) * 100;
                this._animateWoundsBar(woundsBar, oldPercent, newPercent);
            }
            
            // Add visual feedback class
            const woundsValue = this.element.querySelector(".rt-wounds-value");
            if (woundsValue) {
                const animClass = newValue > oldValue ? "stat-heal" : "stat-damage";
                this._flashElement(woundsValue, animClass, 800);
            }
            
            // Show brief notification
            if (woundsDisplay && Math.abs(newValue - oldValue) > 0) {
                const delta = newValue - oldValue;
                const message = delta > 0 ? `+${delta} Wounds` : `${delta} Wounds`;
                this._showBriefNotification(woundsDisplay, message, delta > 0 ? "success" : "error");
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
        _animateWoundsBar(barElement, fromPercent, toPercent) {
            const fill = barElement.querySelector(".rt-wounds-bar-fill");
            if (!fill) return;
            
            const duration = this._animationConfig.barDuration;
            const startTime = Date.now();
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Ease-out for smooth transition
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = fromPercent + ((toPercent - fromPercent) * eased);
                
                barElement.style.setProperty("--wounds-percent", `${current}%`);
                
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
        animateCharacteristicChange(charKey, oldValue, newValue) {
            if (this._shouldSkipAnimation()) return;

            // Find the characteristic display
            const charElement = this.element.querySelector(
                `[data-characteristic="${charKey}"] .char-total`
            );

            if (charElement) {
                this.animateCounter(charElement, oldValue, newValue);
                this._flashElement(charElement, "changed", 500);
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
        animateCharacteristicBonus(charKey, oldBonus, newBonus) {
            if (this._shouldSkipAnimation()) return;

            // Find bonus display
            const bonusElement = this.element.querySelector(
                `[data-characteristic="${charKey}"] .bonus-val`
            );

            if (!bonusElement) return;

            // Animate counter
            this.animateCounter(bonusElement, oldBonus, newBonus);

            // Pulse effect on the badge container
            const badgeContainer = bonusElement.closest('.char-badge');
            if (badgeContainer) {
                badgeContainer.classList.remove("advanced");
                void badgeContainer.offsetWidth; // Force reflow
                badgeContainer.classList.add("advanced");

                setTimeout(() => {
                    badgeContainer.classList.remove("advanced");
                }, 500);
            }

            // Show notification
            const delta = newBonus - oldBonus;
            if (delta !== 0) {
                const message = `Bonus ${delta > 0 ? "+" + delta : delta}`;
                this._showBriefNotification(bonusElement, message, "info");
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
        animateXPGain(oldXP, newXP) {
            if (this._shouldSkipAnimation()) return;
            if (newXP <= oldXP) return; // Only animate gains
            
            const xpElement = this.element.querySelector(
                '[name="system.experience.total"], ' +
                '.xp-total, ' +
                '[data-field="experience-total"]'
            );
            
            if (!xpElement) return;
            
            // Animate counter
            this.animateCounter(xpElement, oldXP, newXP);
            
            // Add golden radiance effect
            this._flashElement(xpElement.closest(".xp-display") || xpElement, "stat-advancement", 1000);
            
            // Show notification
            const gained = newXP - oldXP;
            this._showBriefNotification(xpElement, `+${gained} XP`, "success");
        }
        
        /* -------------------------------------------- */
        /*  Progress Bar Animations                     */
        /* -------------------------------------------- */
        
        /**
         * Animate any progress bar change.
         * @param {HTMLElement} barElement      Progress bar element
         * @protected
         */
        _animateProgressBar(barElement) {
            if (this._shouldSkipAnimation()) return;
            
            const newPercent = parseFloat(barElement.dataset.percent) || 0;
            const fill = barElement.querySelector(".rt-wounds-bar-fill, .progress-fill");
            
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
        _flashElement(element, animClass, duration = 500) {
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
         * Show a brief floating notification near an element.
         * @param {HTMLElement} element     Element to show notification near
         * @param {string} message          Message text
         * @param {string} type             Type: "success", "error", "info", "warning"
         * @protected
         */
        _showBriefNotification(element, message, type = "info") {
            const notification = document.createElement("div");
            notification.className = `rt-brief-notification rt-notification-${type}`;
            notification.textContent = message;
            
            // Position near element
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
            
            // Fade in
            requestAnimationFrame(() => {
                notification.style.opacity = "1";
                notification.style.transform = "translateX(0)";
            });
            
            // Fade out and remove
            setTimeout(() => {
                notification.style.opacity = "0";
                notification.style.transform = "translateX(10px)";
                setTimeout(() => notification.remove(), 200);
            }, 1500);
        }
        
        /* -------------------------------------------- */
        
        /**
         * Check if animations should be skipped (reduced motion preference).
         * @returns {boolean}
         * @protected
         */
        _shouldSkipAnimation() {
            if (!this._animationConfig.respectReducedMotion) return false;
            return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        }
        
        /* -------------------------------------------- */
        
        /** @override */
        close(options) {
            // Clean up
            if (this._mutationObserver) {
                this._mutationObserver.disconnect();
                this._mutationObserver = null;
            }
            
            // Cancel all running animations
            for (const frameId of this._runningAnimations.values()) {
                cancelAnimationFrame(frameId);
            }
            this._runningAnimations.clear();
            
            return super.close(options);
        }
    }
    
    return EnhancedAnimationsApplication;
}
