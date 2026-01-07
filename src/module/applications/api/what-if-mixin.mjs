/**
 * @file WhatIfMixin - Preview stat changes before committing
 * Allows users to test changes and see their impacts before saving
 * 
 * Features:
 * - Preview characteristic advances
 * - Preview equipment changes
 * - Preview skill training
 * - Preview talent/trait additions
 * - Live calculation of derived stats
 * - Side-by-side comparison view
 * - Commit or cancel changes
 * - Clear visual distinction from reality
 */

/**
 * Mixin that adds "What-If" mode functionality to actor sheets
 * @param {typeof ApplicationV2} Base  The base class being mixed
 * @returns {typeof WhatIfApplication}
 * @mixin
 */
export default function WhatIfMixin(Base) {
    return class WhatIfApplication extends Base {

        /* -------------------------------------------- */
        /*  What-If Mode State                          */
        /* -------------------------------------------- */

        /**
         * Is What-If mode currently active?
         * @type {boolean}
         * @private
         */
        _whatIfActive = false;

        /**
         * Hypothetical changes being previewed
         * @type {object}
         * @private
         */
        _whatIfChanges = {};

        /**
         * Preview actor (temporary clone with changes)
         * @type {Actor|null}
         * @private
         */
        _whatIfPreview = null;

        /**
         * Cache of calculated impacts
         * @type {object}
         * @private
         */
        _whatIfImpacts = {};

        /* -------------------------------------------- */
        /*  Rendering                                   */
        /* -------------------------------------------- */

        /** @inheritDoc */
        async _prepareContext(options) {
            const context = await super._prepareContext(options);

            // Add What-If mode data
            context.whatIf = {
                active: this._whatIfActive,
                changeCount: Object.keys(this._whatIfChanges).length,
                impacts: this._whatIfImpacts
            };

            return context;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onRender(context, options) {
            await super._onRender(context, options);

            // Setup What-If mode UI if active
            if (this._whatIfActive) {
                this._renderWhatIfOverlay();
            }
        }

        /* -------------------------------------------- */

        /**
         * Render the What-If mode overlay and toolbar
         * @private
         */
        _renderWhatIfOverlay() {
            // Add overlay class to sheet
            this.element.classList.add("what-if-mode");

            // Create toolbar if not exists
            let toolbar = this.element.querySelector(".what-if-toolbar");
            if (!toolbar) {
                toolbar = this._createWhatIfToolbar();
                this.element.prepend(toolbar);
            }

            // Update comparison displays
            this._updateComparisonDisplays();
        }

        /* -------------------------------------------- */

        /**
         * Create the What-If mode toolbar
         * @returns {HTMLElement}  The toolbar element
         * @private
         */
        _createWhatIfToolbar() {
            const toolbar = document.createElement("div");
            toolbar.className = "what-if-toolbar";
            
            const changeCount = Object.keys(this._whatIfChanges).length;
            
            toolbar.innerHTML = `
                <div class="what-if-toolbar-content">
                    <div class="what-if-status">
                        <i class="fas fa-flask"></i>
                        <span class="what-if-label">Preview Mode</span>
                        <span class="what-if-count">${changeCount} change${changeCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="what-if-actions">
                        <button type="button" class="what-if-btn commit-btn" data-action="commitWhatIf" title="Save Changes">
                            <i class="fas fa-check"></i> Commit
                        </button>
                        <button type="button" class="what-if-btn cancel-btn" data-action="cancelWhatIf" title="Discard Changes">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                    </div>
                </div>
            `;

            return toolbar;
        }

        /* -------------------------------------------- */

        /**
         * Update comparison displays for changed stats
         * @private
         */
        _updateComparisonDisplays() {
            if (!this._whatIfPreview) return;

            const current = this.document;
            const preview = this._whatIfPreview;

            // Compare characteristics
            this._compareCharacteristics(current, preview);

            // Compare skills
            this._compareSkills(current, preview);

            // Compare derived stats
            this._compareDerivedStats(current, preview);
        }

        /* -------------------------------------------- */

        /**
         * Compare characteristics and show differences
         * @param {Actor} current  Current actor
         * @param {Actor} preview  Preview actor
         * @private
         */
        _compareCharacteristics(current, preview) {
            for (const [key, previewChar] of Object.entries(preview.system.characteristics)) {
                const currentChar = current.system.characteristics[key];
                
                if (!currentChar) continue;

                // Compare totals
                if (currentChar.total !== previewChar.total) {
                    this._showComparison(`[data-characteristic="${key}"]`, {
                        current: currentChar.total,
                        preview: previewChar.total,
                        type: "characteristic"
                    });
                }

                // Compare bonuses
                if (currentChar.bonus !== previewChar.bonus) {
                    this._showComparison(`[data-characteristic-bonus="${key}"]`, {
                        current: currentChar.bonus,
                        preview: previewChar.bonus,
                        type: "bonus"
                    });
                }
            }
        }

        /* -------------------------------------------- */

        /**
         * Compare skills and show differences
         * @param {Actor} current  Current actor
         * @param {Actor} preview  Preview actor
         * @private
         */
        _compareSkills(current, preview) {
            for (const [key, previewSkill] of Object.entries(preview.system.skills)) {
                const currentSkill = current.system.skills[key];
                
                if (!currentSkill) continue;

                // Compare current values
                if (currentSkill.current !== previewSkill.current) {
                    this._showComparison(`[data-skill="${key}"]`, {
                        current: currentSkill.current,
                        preview: previewSkill.current,
                        type: "skill"
                    });
                }

                // For specialist skills, compare entries
                if (currentSkill.entries && previewSkill.entries) {
                    previewSkill.entries.forEach((previewEntry, index) => {
                        const currentEntry = currentSkill.entries[index];
                        if (currentEntry && currentEntry.current !== previewEntry.current) {
                            this._showComparison(`[data-skill="${key}"][data-entry-index="${index}"]`, {
                                current: currentEntry.current,
                                preview: previewEntry.current,
                                type: "skill"
                            });
                        }
                    });
                }
            }
        }

        /* -------------------------------------------- */

        /**
         * Compare derived stats and show differences
         * @param {Actor} current  Current actor
         * @param {Actor} preview  Preview actor
         * @private
         */
        _compareDerivedStats(current, preview) {
            const comparisons = [
                { path: "system.wounds.max", selector: "[data-stat='wounds-max']", type: "wounds" },
                { path: "system.initiative.bonus", selector: "[data-stat='initiative']", type: "initiative" },
                { path: "system.movement.half", selector: "[data-stat='movement-half']", type: "movement" },
                { path: "system.movement.full", selector: "[data-stat='movement-full']", type: "movement" },
                { path: "system.movement.charge", selector: "[data-stat='movement-charge']", type: "movement" },
                { path: "system.movement.run", selector: "[data-stat='movement-run']", type: "movement" }
            ];

            for (const comp of comparisons) {
                const currentValue = foundry.utils.getProperty(current, comp.path);
                const previewValue = foundry.utils.getProperty(preview, comp.path);

                if (currentValue !== previewValue) {
                    this._showComparison(comp.selector, {
                        current: currentValue,
                        preview: previewValue,
                        type: comp.type
                    });
                }
            }
        }

        /* -------------------------------------------- */

        /**
         * Show comparison for a specific element
         * @param {string} selector  Element selector
         * @param {object} data  Comparison data
         * @private
         */
        _showComparison(selector, data) {
            const elements = this.element.querySelectorAll(selector);
            
            elements.forEach(element => {
                element.classList.add("what-if-preview");
                
                const difference = data.preview - data.current;
                const sign = difference > 0 ? "+" : "";
                
                // Add comparison badge
                let badge = element.querySelector(".what-if-badge");
                if (!badge) {
                    badge = document.createElement("div");
                    badge.className = "what-if-badge";
                    element.appendChild(badge);
                }

                badge.className = `what-if-badge ${difference > 0 ? "positive" : "negative"}`;
                badge.textContent = `${data.current} → ${data.preview} (${sign}${difference})`;
                badge.dataset.current = data.current;
                badge.dataset.preview = data.preview;
                badge.dataset.difference = difference;
            });
        }

        /* -------------------------------------------- */
        /*  What-If Mode Actions                        */
        /* -------------------------------------------- */

        /**
         * Enter What-If mode
         * @public
         */
        async enterWhatIfMode() {
            if (this._whatIfActive) {
                ui.notifications.warn("Already in What-If mode");
                return;
            }

            this._whatIfActive = true;
            this._whatIfChanges = {};
            this._whatIfImpacts = {};

            // Re-render to show toolbar
            await this.render(false);

            ui.notifications.info("What-If mode activated - changes will be previewed");
        }

        /* -------------------------------------------- */

        /**
         * Preview a change without committing
         * @param {string} path  The property path (e.g., "system.characteristics.weaponSkill.advance")
         * @param {*} value  The new value
         * @public
         */
        async previewChange(path, value) {
            if (!this._whatIfActive) {
                // If not in What-If mode, just apply directly
                return this._applyChange(path, value);
            }

            // Store the change
            foundry.utils.setProperty(this._whatIfChanges, path, value);

            // Update preview
            await this._updatePreview();

            // Re-render comparisons
            this._updateComparisonDisplays();

            // Update toolbar
            const toolbar = this.element.querySelector(".what-if-toolbar");
            if (toolbar) {
                const count = Object.keys(this._whatIfChanges).length;
                const countEl = toolbar.querySelector(".what-if-count");
                if (countEl) {
                    countEl.textContent = `${count} change${count !== 1 ? 's' : ''}`;
                }
            }
        }

        /* -------------------------------------------- */

        /**
         * Update the preview actor with current changes
         * @private
         */
        async _updatePreview() {
            // Create preview data
            const baseData = this.document.toObject();
            const previewData = foundry.utils.mergeObject(
                baseData,
                this._whatIfChanges,
                { inplace: false }
            );

            // Create temporary actor (not in world)
            this._whatIfPreview = new CONFIG.Actor.documentClass(previewData, { parent: null });
            this._whatIfPreview.prepareData();

            // Calculate impacts
            this._calculateImpacts();
        }

        /* -------------------------------------------- */

        /**
         * Calculate the impacts of the changes
         * @private
         */
        _calculateImpacts() {
            if (!this._whatIfPreview) return;

            const impacts = [];
            const current = this.document;
            const preview = this._whatIfPreview;

            // Check characteristic bonus changes
            for (const [key, previewChar] of Object.entries(preview.system.characteristics)) {
                const currentChar = current.system.characteristics[key];
                if (currentChar.bonus !== previewChar.bonus) {
                    impacts.push({
                        type: "characteristic",
                        message: `${previewChar.label} Bonus: ${currentChar.bonus} → ${previewChar.bonus}`
                    });
                }
            }

            // Check initiative changes
            if (current.system.initiative.bonus !== preview.system.initiative.bonus) {
                impacts.push({
                    type: "combat",
                    message: `Initiative: ${current.system.initiative.bonus} → ${preview.system.initiative.bonus}`
                });
            }

            // Check wounds changes
            if (current.system.wounds.max !== preview.system.wounds.max) {
                impacts.push({
                    type: "survival",
                    message: `Max Wounds: ${current.system.wounds.max} → ${preview.system.wounds.max}`
                });
            }

            // Check movement changes
            if (current.system.movement.half !== preview.system.movement.half) {
                impacts.push({
                    type: "movement",
                    message: `Half Move: ${current.system.movement.half}m → ${preview.system.movement.half}m`
                });
            }

            this._whatIfImpacts = impacts;
        }

        /* -------------------------------------------- */

        /**
         * Commit What-If changes to the actor
         * @public
         */
        async commitWhatIfChanges() {
            if (!this._whatIfActive) return;

            if (Object.keys(this._whatIfChanges).length === 0) {
                ui.notifications.warn("No changes to commit");
                await this.exitWhatIfMode();
                return;
            }

            // Apply all changes
            await this.document.update(this._whatIfChanges);

            ui.notifications.info(`Committed ${Object.keys(this._whatIfChanges).length} changes`);

            // Exit What-If mode
            await this.exitWhatIfMode();
        }

        /* -------------------------------------------- */

        /**
         * Cancel What-If mode and discard changes
         * @public
         */
        async cancelWhatIfChanges() {
            if (!this._whatIfActive) return;

            const count = Object.keys(this._whatIfChanges).length;
            
            if (count > 0) {
                const confirm = await Dialog.confirm({
                    title: "Cancel What-If Mode",
                    content: `<p>Discard ${count} pending change${count !== 1 ? 's' : ''}?</p>`,
                    defaultYes: false
                });

                if (!confirm) return;
            }

            await this.exitWhatIfMode();

            ui.notifications.info("What-If mode cancelled - changes discarded");
        }

        /* -------------------------------------------- */

        /**
         * Exit What-If mode
         * @public
         */
        async exitWhatIfMode() {
            if (!this._whatIfActive) return;

            // Clear state
            this._whatIfActive = false;
            this._whatIfChanges = {};
            this._whatIfPreview = null;
            this._whatIfImpacts = {};

            // Remove overlay
            this.element.classList.remove("what-if-mode");
            
            // Remove toolbar
            const toolbar = this.element.querySelector(".what-if-toolbar");
            if (toolbar) toolbar.remove();

            // Remove all comparison badges
            this.element.querySelectorAll(".what-if-badge").forEach(badge => badge.remove());
            this.element.querySelectorAll(".what-if-preview").forEach(el => {
                el.classList.remove("what-if-preview");
            });

            // Re-render to clean state
            await this.render(false);
        }

        /* -------------------------------------------- */

        /**
         * Apply a change directly (when not in What-If mode)
         * @param {string} path  Property path
         * @param {*} value  New value
         * @private
         */
        async _applyChange(path, value) {
            const update = {};
            foundry.utils.setProperty(update, path, value);
            await this.document.update(update);
        }

        /* -------------------------------------------- */
        /*  Public API                                  */
        /* -------------------------------------------- */

        /**
         * Get current What-If mode state
         * @returns {object}  State information
         * @public
         */
        getWhatIfState() {
            return {
                active: this._whatIfActive,
                changes: foundry.utils.deepClone(this._whatIfChanges),
                impacts: foundry.utils.deepClone(this._whatIfImpacts),
                changeCount: Object.keys(this._whatIfChanges).length
            };
        }

        /* -------------------------------------------- */

        /**
         * Check if What-If mode is active
         * @returns {boolean}
         * @public
         */
        isWhatIfActive() {
            return this._whatIfActive;
        }
    };
}
