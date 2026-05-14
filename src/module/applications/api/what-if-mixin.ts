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

import type { WH40KBaseActorDocument, WH40KCharacteristic, WH40KSkill, WH40KSkillEntry } from '../../types/global.d.ts';
import type { ApplicationV2Ctor, DialogV2Like } from './application-types.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is untyped; cast required to reach DialogV2
const dialogV2 = (foundry.applications as unknown as { api: { DialogV2: DialogV2Like } }).api.DialogV2;

/**
 * Mixin that adds "What-If" mode functionality to actor sheets
 * @template {ApplicationV2} T
 * @param {T} Base  The base class being mixed
 * @returns {any}
 * @mixin
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- mixin factory: return type is the inner class, which cannot be named at the outer function scope
export default function WhatIfMixin<T extends ApplicationV2Ctor>(Base: T) {
    return class WhatIfApplication extends Base {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin constructor must accept any[] to satisfy TS2545 mixin constraint
        // biome-ignore lint/complexity/noUselessConstructor: required to forward any[] args per TS mixin rule (TS2545)
        // biome-ignore lint/suspicious/noExplicitAny: mixin constructor requires any[] per TS mixin rule (TS2545)
        constructor(...args: any[]) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- spreading any[] is inherent to the mixin pattern (TS2545)
            super(...args);
        }

        /* -------------------------------------------- */
        /*  What-If Mode State                          */
        /* -------------------------------------------- */

        _whatIfActive: boolean = false;
        // eslint-disable-next-line no-restricted-syntax -- boundary: whatIfChanges holds arbitrary actor update paths; Record<string,unknown> is correct
        _whatIfChanges: Record<string, unknown> = {};
        _whatIfPreview: WH40KBaseActorDocument | null = null;
        _whatIfImpacts: { type: string; message: string }[] = [];

        declare document: WH40KBaseActorDocument;

        /* -------------------------------------------- */
        /*  Rendering                                   */
        /* -------------------------------------------- */

        /** @inheritDoc */
        /* eslint-disable no-restricted-syntax -- boundary: _prepareContext returns Foundry untyped context; Record<string,unknown> is the correct type at this API seam */
        override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
            const context = (await super._prepareContext(options as never)) as Record<string, unknown>;
            /* eslint-enable no-restricted-syntax */

            context['whatIf'] = {
                active: this._whatIfActive,
                changeCount: Object.keys(this._whatIfChanges).length,
                impacts: this._whatIfImpacts,
            };

            return context;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        // eslint-disable-next-line no-restricted-syntax -- boundary: _onRender context is the Foundry render object; Record<string,unknown> is the correct type at this API seam
        override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
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
            toolbar.className = 'what-if-toolbar tw-animate-toolbar-slide-in';

            const changeCount = Object.keys(this._whatIfChanges).length;

            toolbar.innerHTML = `
                <div class="what-if-toolbar-content">
                    <div class="what-if-status">
                        <i class="fas fa-flask tw-animate-flask-bubble"></i>
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
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system.characteristics is typed as base DataModel; cast to concrete shape required
            const currentChars = current.system.characteristics as Record<string, WH40KCharacteristic>;
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system.characteristics is typed as base DataModel; cast to concrete shape required
            const previewChars = preview.system.characteristics as Record<string, WH40KCharacteristic>;

            for (const [key, previewChar] of Object.entries(previewChars)) {
                const currentChar = currentChars[key];

                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- noUncheckedIndexedAccess: Record lookup may return undefined at runtime
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
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system.skills is typed as base DataModel; cast to concrete shape required
            const currentSkills = current.system.skills as Record<string, WH40KSkill>;
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system.skills is typed as base DataModel; cast to concrete shape required
            const previewSkills = preview.system.skills as Record<string, WH40KSkill>;

            for (const [key, previewSkill] of Object.entries(previewSkills)) {
                const currentSkill = currentSkills[key];

                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- noUncheckedIndexedAccess: Record lookup may return undefined at runtime
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
            type DerivedSystemShape = {
                wounds: { max: number };
                initiative: { bonus: number };
                movement: { half: number; full: number; charge: number; run: number };
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system is typed as base DataModel; cast required to access derived sub-objects
            const system = current.system as unknown as DerivedSystemShape;
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system is typed as base DataModel; cast required to access derived sub-objects
            const previewSystem = preview.system as unknown as DerivedSystemShape;
            const comparisons: { path: string; selector: string; type: string }[] = [
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
            const elements = this.element.querySelectorAll<HTMLElement>(selector);

            elements.forEach((element) => {
                element.classList.add('what-if-preview');
                if (!element.querySelector('.wh40k-what-if__pulse-border')) {
                    const pulseBorder = document.createElement('span');
                    pulseBorder.className =
                        'wh40k-what-if__pulse-border tw-animate-preview-pulse tw-absolute tw-inset-[-2px] tw-border-2 tw-border-solid tw-border-[var(--wh40k-gold)] tw-rounded-[var(--wh40k-radius-md)] tw-pointer-events-none';
                    element.appendChild(pulseBorder);
                }

                const difference = data.preview - data.current;
                const sign = difference > 0 ? '+' : '';

                let badge = element.querySelector<HTMLElement>('.what-if-badge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'what-if-badge';
                    element.appendChild(badge);
                }

                badge.className = `what-if-badge tw-animate-badge-appear ${difference > 0 ? 'positive' : 'negative'}`;
                badge.textContent = `${data.current} → ${data.preview} (${sign}${difference})`;
                badge.dataset['current'] = data.current.toString();
                badge.dataset['preview'] = data.preview.toString();
                badge.dataset['difference'] = difference.toString();
            });
        }

        /* -------------------------------------------- */
        /*  What-If Mode Actions                        */
        /* -------------------------------------------- */

        async enterWhatIfMode(): Promise<void> {
            if (this._whatIfActive) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: i18n key for What-If mode notifications to be added in a follow-up i18n pass
                ui.notifications.warn('Already in What-If mode');
                return;
            }

            this._whatIfActive = true;
            this._whatIfChanges = {};
            this._whatIfImpacts = [];

            // eslint-disable-next-line @typescript-eslint/no-deprecated -- ApplicationV2.render(force) is V1 signature; used until sheet migrated to V2 render pattern
            await this.render(false);

            // eslint-disable-next-line no-restricted-syntax -- boundary: i18n key for What-If mode notifications to be added in a follow-up i18n pass
            ui.notifications.info('What-If mode activated - changes will be previewed');
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: value is arbitrary actor update data; unknown is the correct type at this API seam
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

            // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.Actor is untyped; cast required to access documentClass constructor
            this._whatIfPreview = new (CONFIG.Actor as unknown as { documentClass: typeof Actor.implementation }).documentClass(
                // eslint-disable-next-line no-restricted-syntax -- boundary: previewData is a deep-cloned object; cast required to match Actor constructor parameter type
                previewData as unknown as ConstructorParameters<typeof Actor.implementation>[0],
                { parent: null },
            );
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- _whatIfPreview may fail to construct; null check guards against constructor failure
            if (this._whatIfPreview) this._whatIfPreview.prepareData();

            this._calculateImpacts();
        }

        _calculateImpacts(): void {
            if (!this._whatIfPreview) return;

            const impacts: { type: string; message: string }[] = [];
            const current = this.document;
            const preview = this._whatIfPreview;

            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system.characteristics is typed as base DataModel; cast to concrete shape required
            const currentChars = current.system.characteristics as Record<string, WH40KCharacteristic>;
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system.characteristics is typed as base DataModel; cast to concrete shape required
            const previewChars = preview.system.characteristics as Record<string, WH40KCharacteristic>;

            for (const [key, previewChar] of Object.entries(previewChars)) {
                const currentChar = currentChars[key];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- noUncheckedIndexedAccess: Record lookup may return undefined at runtime
                if (!currentChar) continue;
                if (currentChar.bonus !== previewChar.bonus) {
                    impacts.push({
                        type: 'characteristic',
                        message: `${previewChar.label} Bonus: ${currentChar.bonus} → ${previewChar.bonus}`,
                    });
                }
            }

            type WhatIfSystem = { initiative: { bonus: number }; wounds: { max: number }; movement: { half: number } };
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system is typed as base DataModel; cast required to access derived sub-objects
            const sys = current.system as unknown as WhatIfSystem;
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system is typed as base DataModel; cast required to access derived sub-objects
            const preSys = preview.system as unknown as WhatIfSystem;

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

        async cancelWhatIfChanges(): Promise<void> {
            if (!this._whatIfActive) return;

            const count = Object.keys(this._whatIfChanges).length;
            if (count > 0) {
                const confirm = await dialogV2.confirm({
                    window: { title: 'Cancel What-If Mode' },
                    content: `Discard ${count} pending change${count !== 1 ? 's' : ''}?`,
                    yes: { label: 'Discard', default: true },
                    no: { label: 'Keep Editing', default: false },
                });

                if (!confirm) return;
            }

            await this.exitWhatIfMode();
            // eslint-disable-next-line no-restricted-syntax -- boundary: i18n key for What-If mode notifications to be added in a follow-up i18n pass
            ui.notifications.info('What-If mode cancelled - changes discarded');
        }

        async exitWhatIfMode(): Promise<void> {
            if (!this._whatIfActive) return;

            this._whatIfActive = false;
            this._whatIfChanges = {};
            this._whatIfPreview = null;
            this._whatIfImpacts = [];

            this.element.classList.remove('what-if-mode');

            const toolbar = this.element.querySelector('.what-if-toolbar');
            if (toolbar) toolbar.remove();

            for (const badge of this.element.querySelectorAll('.what-if-badge')) {
                badge.remove();
            }
            for (const el of this.element.querySelectorAll('.what-if-preview')) {
                el.classList.remove('what-if-preview');
                for (const s of el.querySelectorAll('.wh40k-what-if__pulse-border')) {
                    s.remove();
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-deprecated -- ApplicationV2.render(force) is V1 signature; used until sheet migrated to V2 render pattern
            await this.render(false);
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: value is arbitrary actor update data; unknown is the correct type at this API seam
        async _applyChange(path: string, value: unknown): Promise<void> {
            const update = {};
            foundry.utils.setProperty(update, path, value);
            await this.document.update(update);
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: changes holds arbitrary actor update paths; Record<string,unknown> is the correct return type
        getWhatIfState(): { active: boolean; changes: Record<string, unknown>; impacts: { type: string; message: string }[]; changeCount: number } {
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
