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

type ApplicationV2 = foundry.applications.api.ApplicationV2.Any;
import type { WH40KBaseActorDocument, WH40KCharacteristic, WH40KSkill, WH40KSkillEntry } from '../../types/global.d.ts';
import type { WhatIfMixinAPI } from './sheet-mixin-types.js';

/**
 * Mixin that adds "What-If" mode functionality to actor sheets
 * @template {ApplicationV2} T
 * @param {T} Base  The base class being mixed
 * @returns {any}
 * @mixin
 */
export default function WhatIfMixin<T extends new (...args: any[]) => ApplicationV2>(Base: T) {
    return class WhatIfApplication extends Base implements WhatIfMixinAPI {
        /* -------------------------------------------- */
        /*  What-If Mode State                          */
        /* -------------------------------------------- */

        _whatIfActive: boolean = false;
        _whatIfChanges: Record<string, unknown> = {};
        _whatIfPreview: any = null;
        _whatIfImpacts: any[] | Record<string, unknown> = {};

        declare document: WH40KBaseActorDocument;

        /* -------------------------------------------- */
        /*  Rendering                                   */
        /* -------------------------------------------- */

        /** @inheritDoc */
        async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
            const context = await super._prepareContext(options);

            context.whatIf = {
                active: this._whatIfActive,
                changeCount: Object.keys(this._whatIfChanges).length,
                impacts: this._whatIfImpacts,
            };

            return context;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            await super._onRender(context, options);

            if (this._whatIfActive) {
                this._renderWhatIfOverlay();
            }
        }

        /* -------------------------------------------- */

        _renderWhatIfOverlay(): void {
            this.element.classList.add('what-if-mode');

            let toolbar = this.element.querySelector('.what-if-toolbar');
            if (!toolbar) {
                toolbar = this._createWhatIfToolbar();
                this.element.prepend(toolbar);
            }

            this._updateComparisonDisplays();
        }

        /* -------------------------------------------- */

        _createWhatIfToolbar(): HTMLElement {
            const toolbar = document.createElement('div');
            toolbar.className = 'what-if-toolbar';

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

        _updateComparisonDisplays(): void {
            if (!this._whatIfPreview) return;

            const current = this.document;
            const preview = this._whatIfPreview;

            this._compareCharacteristics(current, preview);
            this._compareSkills(current, preview);
            this._compareDerivedStats(current, preview);
        }

        /* -------------------------------------------- */

        _compareCharacteristics(current: WH40KBaseActorDocument, preview: WH40KBaseActorDocument): void {
            const currentChars = current.system.characteristics as Record<string, WH40KCharacteristic>;
            const previewChars = preview.system.characteristics as Record<string, WH40KCharacteristic>;

            for (const [key, previewChar] of Object.entries(previewChars)) {
                const currentChar = currentChars[key];

                if (!currentChar) continue;

                if (currentChar.total !== previewChar.total) {
                    this._showComparison(`[data-characteristic="${key}"]`, {
                        current: currentChar.total,
                        preview: previewChar.total,
                        type: 'characteristic',
                    });
                }

                if (currentChar.bonus !== previewChar.bonus) {
                    this._showComparison(`[data-characteristic-bonus="${key}"]`, {
                        current: currentChar.bonus,
                        preview: previewChar.bonus,
                        type: 'bonus',
                    });
                }
            }
        }

        /* -------------------------------------------- */

        _compareSkills(current: WH40KBaseActorDocument, preview: WH40KBaseActorDocument): void {
            const currentSkills = current.system.skills as Record<string, WH40KSkill>;
            const previewSkills = preview.system.skills as Record<string, WH40KSkill>;

            for (const [key, previewSkill] of Object.entries(previewSkills)) {
                const currentSkill = currentSkills[key];

                if (!currentSkill) continue;

                if (currentSkill.current !== previewSkill.current) {
                    this._showComparison(`[data-skill="${key}"]`, {
                        current: currentSkill.current,
                        preview: previewSkill.current,
                        type: 'skill',
                    });
                }

                if (currentSkill.entries && previewSkill.entries) {
                    previewSkill.entries.forEach((previewEntry: WH40KSkillEntry, index: number) => {
                        const currentEntry = currentSkill.entries?.[index];
                        if (currentEntry && currentEntry.current !== previewEntry.current) {
                            this._showComparison(`[data-skill="${key}"][data-entry-index="${index}"]`, {
                                current: currentEntry.current,
                                preview: previewEntry.current,
                                type: 'skill',
                            });
                        }
                    });
                }
            }
        }

        /* -------------------------------------------- */

        _compareDerivedStats(current: WH40KBaseActorDocument, preview: WH40KBaseActorDocument): void {
            const system = current.system as any;
            const previewSystem = preview.system as any;
            const comparisons = [
                { path: 'wounds.max', selector: "[data-stat='wounds-max']", type: 'wounds' },
                { path: 'initiative.bonus', selector: "[data-stat='initiative']", type: 'initiative' },
                { path: 'movement.half', selector: "[data-stat='movement-half']", type: 'movement' },
                { path: 'movement.full', selector: "[data-stat='movement-full']", type: 'movement' },
                { path: 'movement.charge', selector: "[data-stat='movement-charge']", type: 'movement' },
                { path: 'movement.run', selector: "[data-stat='movement-run']", type: 'movement' },
            ];

            for (const comp of comparisons) {
                const currentValue = foundry.utils.getProperty(system, comp.path);
                const previewValue = foundry.utils.getProperty(previewSystem, comp.path);

                if (currentValue !== previewValue) {
                    this._showComparison(comp.selector, {
                        current: currentValue as number,
                        preview: previewValue as number,
                        type: comp.type,
                    });
                }
            }
        }

        /* -------------------------------------------- */

        _showComparison(selector: string, data: { current: number; preview: number; type: string }): void {
            const elements = this.element.querySelectorAll(selector);

            elements.forEach((element) => {
                element.classList.add('what-if-preview');

                const difference = data.preview - data.current;
                const sign = difference > 0 ? '+' : '';

                let badge = element.querySelector('.what-if-badge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'what-if-badge';
                    element.appendChild(badge);
                }

                badge.className = `what-if-badge ${difference > 0 ? 'positive' : 'negative'}`;
                badge.textContent = `${data.current} → ${data.preview} (${sign}${difference})`;
                (badge as HTMLElement).dataset.current = data.current.toString();
                (badge as HTMLElement).dataset.preview = data.preview.toString();
                (badge as HTMLElement).dataset.difference = difference.toString();
            });
        }

        /* -------------------------------------------- */
        /*  What-If Mode Actions                        */
        /* -------------------------------------------- */

        async enterWhatIfMode(): Promise<void> {
            if (this._whatIfActive) {
                ui.notifications.warn('Already in What-If mode');
                return;
            }

            this._whatIfActive = true;
            this._whatIfChanges = {};
            this._whatIfImpacts = {};

            await this.render(false);

            ui.notifications.info('What-If mode activated - changes will be previewed');
        }

        async previewChange(path: string, value: unknown): Promise<void> {
            if (!this._whatIfActive) {
                await this._applyChange(path, value);
                return;
            }

            foundry.utils.setProperty(this._whatIfChanges, path, value);
            this._updatePreview();
            this._updateComparisonDisplays();

            const toolbar = this.element.querySelector('.what-if-toolbar');
            if (toolbar) {
                const count = Object.keys(this._whatIfChanges).length;
                const countEl = toolbar.querySelector('.what-if-count');
                if (countEl) {
                    countEl.textContent = `${count} change${count !== 1 ? 's' : ''}`;
                }
            }
        }

        _updatePreview(): void {
            const baseData = this.document.toObject();
            const previewData = foundry.utils.mergeObject(baseData, this._whatIfChanges, { inplace: false });

            this._whatIfPreview = new (CONFIG.Actor as any).documentClass(previewData, { parent: null });
            this._whatIfPreview.prepareData();

            this._calculateImpacts();
        }

        _calculateImpacts(): void {
            if (!this._whatIfPreview) return;

            const impacts = [];
            const current = this.document;
            const preview = this._whatIfPreview;

            const currentChars = current.system.characteristics as Record<string, WH40KCharacteristic>;
            const previewChars = preview.system.characteristics as Record<string, WH40KCharacteristic>;

            for (const [key, previewChar] of Object.entries(previewChars)) {
                const currentChar = currentChars[key];
                if (currentChar.bonus !== previewChar.bonus) {
                    impacts.push({
                        type: 'characteristic',
                        message: `${previewChar.label} Bonus: ${currentChar.bonus} → ${previewChar.bonus}`,
                    });
                }
            }

            const sys = current.system as any;
            const preSys = preview.system as any;

            if (sys.initiative.bonus !== preSys.initiative.bonus) {
                impacts.push({
                    type: 'combat',
                    message: `Initiative: ${sys.initiative.bonus} → ${preSys.initiative.bonus}`,
                });
            }

            if (sys.wounds.max !== preSys.wounds.max) {
                impacts.push({
                    type: 'survival',
                    message: `Max Wounds: ${sys.wounds.max} → ${preSys.wounds.max}`,
                });
            }

            if (sys.movement.half !== preSys.movement.half) {
                impacts.push({
                    type: 'movement',
                    message: `Half Move: ${sys.movement.half}m → ${preSys.movement.half}m`,
                });
            }

            this._whatIfImpacts = impacts;
        }

        async commitWhatIfChanges(): Promise<void> {
            if (!this._whatIfActive) return;

            if (Object.keys(this._whatIfChanges).length === 0) {
                ui.notifications.warn('No changes to commit');
                await this.exitWhatIfMode();
                return;
            }

            await this.document.update(this._whatIfChanges);
            ui.notifications.info(`Committed ${Object.keys(this._whatIfChanges).length} changes`);
            await this.exitWhatIfMode();
        }

        async cancelWhatIfChanges(): Promise<void> {
            if (!this._whatIfActive) return;

            const count = Object.keys(this._whatIfChanges).length;
            if (count > 0) {
                const confirm = await (foundry.applications.api as any).DialogV2.confirm({
                    window: { title: 'Cancel What-If Mode' },
                    content: `Discard ${count} pending change${count !== 1 ? 's' : ''}?`,
                    yes: { label: 'Discard', default: true },
                    no: { label: 'Keep Editing', default: false },
                });

                if (!confirm) return;
            }

            await this.exitWhatIfMode();
            ui.notifications.info('What-If mode cancelled - changes discarded');
        }

        async exitWhatIfMode(): Promise<void> {
            if (!this._whatIfActive) return;

            this._whatIfActive = false;
            this._whatIfChanges = {};
            this._whatIfPreview = null;
            this._whatIfImpacts = {};

            this.element.classList.remove('what-if-mode');

            const toolbar = this.element.querySelector('.what-if-toolbar');
            if (toolbar) toolbar.remove();

            this.element.querySelectorAll('.what-if-badge').forEach((badge) => badge.remove());
            this.element.querySelectorAll('.what-if-preview').forEach((el) => {
                el.classList.remove('what-if-preview');
            });

            await this.render(false);
        }

        async _applyChange(path: string, value: unknown): Promise<void> {
            const update = {};
            foundry.utils.setProperty(update, path, value);
            await this.document.update(update);
        }

        getWhatIfState() {
            return {
                active: this._whatIfActive,
                changes: foundry.utils.deepClone(this._whatIfChanges),
                impacts: foundry.utils.deepClone(this._whatIfImpacts),
                changeCount: Object.keys(this._whatIfChanges).length,
            };
        }

        isWhatIfActive(): boolean {
            return this._whatIfActive;
        }
    };
}
