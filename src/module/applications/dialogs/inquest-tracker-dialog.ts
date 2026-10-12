/**
 * @file InquestTrackerDialog — the GM's tracker for the warband's Inquests
 * (DH2 Enemies Within pp. 62–69, #90).
 *
 * Each Inquest records its target, objective, requirements, lead investigator,
 * scope, approach and running Investigation point (IP) total. The GM uses this
 * dialog to add clues (Table 2–7), record lead tests (±IP per degree), tailor
 * the Revelation thresholds and resolve the Inquest. Whenever the IP total
 * crosses a Revelation threshold, the dialog posts a Revelation chat card. On
 * resolution it posts the Influence outcome (Table 2–9).
 *
 * Inquests are world data (the `warband-inquests` setting). The Party Overview
 * panel on DH2 character sheets shows their progress and opens this dialog.
 * All the math is the pure, unit-tested `rules/inquest.ts`, and the printed
 * values come from the line's `inquestRules` config. Opening is refused for a
 * line without them.
 */

import { inquestRulesFor } from '../../config/game-systems/index.ts';
import { t } from '../../i18n/t.ts';
import {
    applyInvestigationPoints,
    CLUE_SIGNIFICANCES,
    clueInvestigationPoints,
    createInquest,
    INQUEST_APPROACHES,
    inquestFromRow,
    inquestInfluenceOutcome,
    inquestProgress,
    type InquestProgress,
    inquestRevelationEvents,
    type InquestRevelationEvent,
    type InquestRow,
    type InquestRules,
    type InquestState,
    leadTestInvestigationPoints,
    rowFromInquest,
} from '../../rules/inquest.ts';
import { WH40KSettings } from '../../wh40k-rpg-settings.ts';
import { inquestScopeLabelKey, inquestScopeOptions, inquestStatusLabelKey } from './inquest-view.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/inquest-chat.hbs';

interface Option {
    value: string;
    label: string;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 context is a free-form template payload; Record<string, unknown> is the correct base shape
interface InquestTrackerContext extends Record<string, unknown> {
    inquests: Array<InquestRow & { index: number; isActive: boolean; progress: InquestProgress; statusLabel: string }>;
    scopeOptions: Option[];
    approachOptions: Option[];
    clueButtons: Array<{ significance: string; label: string; points: number }>;
    leadInvestigatorClueBonus: number;
    pointsPerLeadDegree: number;
}

export default class InquestTrackerDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'inquest-tracker-dialog',
        classes: ['wh40k-rpg', 'inquest-tracker-dialog'],
        tag: 'div',
        window: {
            title: 'WH40K.Inquest.TrackerTitle',
            icon: 'fa-solid fa-magnifying-glass',
            minimizable: false,
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 720,
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry accepts 'auto' at runtime but types declare number
            height: 'auto' as unknown as number,
        },
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            addInquest: InquestTrackerDialog.#onAddInquest,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            removeInquest: InquestTrackerDialog.#onRemoveInquest,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            addClue: InquestTrackerDialog.#onAddClue,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            leadTest: InquestTrackerDialog.#onLeadTest,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            resolveInquest: InquestTrackerDialog.#onResolveInquest,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            reopenInquest: InquestTrackerDialog.#onReopenInquest,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            save: InquestTrackerDialog.#onSave,
        },
    };

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/dialogs/inquest-tracker.hbs',
            scrollable: [''],
        },
    };

    readonly #rules: InquestRules;

    /** The line the tracker was opened for; chat cards carry it for per-system styling. */
    readonly #line: string;

    /** The Inquests as last stored (seeded from the setting). Every action re-reads the form first, so unsaved edits survive. */
    #inquests: InquestState[] = WH40KSettings.getWarbandInquests();

    constructor(rules: InquestRules, line: string) {
        super();
        this.#rules = rules;
        this.#line = line;
    }

    /** @override */
    get title(): string {
        return t('WH40K.Inquest.TrackerTitle');
    }

    /**
     * Open the tracker (GM only) for a line that prints Inquest rules.
     * @param line  The opening actor's `system.gameSystem`.
     */
    static open(line: string | undefined): InquestTrackerDialog | null {
        const rules = inquestRulesFor(line);
        if (rules === null || line === undefined) return null;
        if (!game.user.isGM) {
            ui.notifications.warn(t('WH40K.Inquest.GmOnly'));
            return null;
        }
        const dialog = new InquestTrackerDialog(rules, line);
        void dialog.render(true);
        return dialog;
    }

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<InquestTrackerContext> {
        const context = await super._prepareContext(options);
        const rules = this.#rules;
        return {
            ...context,
            inquests: this.#inquests.map((inquest, index) => ({
                ...rowFromInquest(inquest),
                index,
                isActive: inquest.status === 'active',
                progress: inquestProgress(rules, inquest),
                statusLabel: game.i18n.localize(inquestStatusLabelKey(inquest.status)),
            })),
            scopeOptions: inquestScopeOptions(rules).map((option) => ({
                value: option.value,
                label: game.i18n.format('WH40K.Inquest.ScopeOption', { scope: game.i18n.localize(option.labelKey), points: String(option.points) }),
            })),
            approachOptions: INQUEST_APPROACHES.map((value) => ({ value, label: game.i18n.localize(`WH40K.Inquest.Approach.${value}`) })),
            clueButtons: CLUE_SIGNIFICANCES.map((significance) => ({
                significance,
                label: game.i18n.localize(`WH40K.Inquest.Clue.${significance}`),
                points: rules.clueValues[significance],
            })),
            leadInvestigatorClueBonus: rules.leadInvestigatorClueBonus,
            pointsPerLeadDegree: rules.pointsPerLeadDegree,
        };
    }

    /** Read the rows as currently typed, so every action keeps unsaved edits. */
    #readRows(): InquestRow[] {
        const rows: InquestRow[] = [];
        for (const card of this.element.querySelectorAll<HTMLElement>('[data-wh40k-hook="inquest-card"]')) {
            const value = (field: keyof InquestRow): string =>
                card.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-field="${field}"]`)?.value ?? '';
            rows.push({
                id: value('id'),
                status: value('status'),
                target: value('target'),
                objective: value('objective'),
                requirements: value('requirements'),
                leadInvestigator: value('leadInvestigator'),
                scope: value('scope'),
                approach: value('approach'),
                investigationPoints: value('investigationPoints'),
                extraRequiredPoints: value('extraRequiredPoints'),
                revelationThresholds: value('revelationThresholds'),
            });
        }
        return rows;
    }

    /** The Inquests as currently typed, validated. */
    #readInquests(): InquestState[] {
        return this.#readRows()
            .map(inquestFromRow)
            .filter((q): q is InquestState => q !== null);
    }

    /**
     * Persist the edited list, post a Revelation card for every threshold the
     * edit crossed, and re-render from what was stored.
     */
    async #commit(next: InquestState[]): Promise<void> {
        const events = inquestRevelationEvents(this.#rules, WH40KSettings.getWarbandInquests(), next);
        await WH40KSettings.setWarbandInquests(next);
        for (const event of events) {
            // eslint-disable-next-line no-await-in-loop -- one card per Inquest, posted in order
            await this.#postRevelation(event);
        }
        this.#inquests = next;
        await this.render();
    }

    /** Apply `update` to the Inquest at the clicked card's index, then commit. */
    async #updateAt(target: HTMLElement, update: (inquest: InquestState) => InquestState): Promise<InquestState | null> {
        const index = Number(target.dataset['index']);
        if (!Number.isInteger(index) || index < 0) return null;
        const inquests = this.#readInquests();
        const current = inquests.at(index);
        if (current === undefined) return null;
        const updated = update(current);
        inquests[index] = updated;
        await this.#commit(inquests);
        return updated;
    }

    async #postCard(data: Record<string, string | number | boolean>): Promise<void> {
        const content = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, { ...data, gameSystem: this.#line });
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts a loose document-data shape
        await ChatMessage.create({ user: game.user.id, content, speaker: ChatMessage.getSpeaker({ alias: t('WH40K.Inquest.ChatSpeaker') }) });
    }

    async #postRevelation(event: InquestRevelationEvent): Promise<void> {
        await this.#postCard({
            kind: 'revelation',
            target: event.inquest.target,
            scopeLabel: game.i18n.localize(inquestScopeLabelKey(event.inquest.scope)),
            points: event.inquest.investigationPoints,
            required: inquestProgress(this.#rules, event.inquest).required,
            revelation: event.revelation,
            revelationCount: event.revelationCount,
            isFinal: event.isFinal,
        });
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    static async #onAddInquest(this: InquestTrackerDialog): Promise<void> {
        await this.#commit([...this.#readInquests(), createInquest(foundry.utils.randomID())]);
    }

    static async #onRemoveInquest(this: InquestTrackerDialog, _event: Event, target: HTMLElement): Promise<void> {
        const index = Number(target.dataset['index']);
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: t('WH40K.Inquest.RemoveTitle') },
            content: `<p>${foundry.utils.escapeHTML(t('WH40K.Inquest.RemoveConfirm'))}</p>`,
        });
        if (!confirmed) return;
        await this.#commit(this.#readInquests().filter((_q, i) => i !== index));
    }

    static async #onAddClue(this: InquestTrackerDialog, _event: Event, target: HTMLElement): Promise<void> {
        const significance = CLUE_SIGNIFICANCES.find((s) => s === target.dataset['significance']);
        if (significance === undefined) return;
        const leadRelevant = this.#leadRelevant(target);
        const rules = this.#rules;
        await this.#updateAt(target, (q) => ({
            ...q,
            investigationPoints: applyInvestigationPoints(q.investigationPoints, clueInvestigationPoints(rules, significance, leadRelevant)),
        }));
    }

    /** Whether the clicked card's "relevant to the lead investigator" box is ticked. */
    #leadRelevant(target: HTMLElement): boolean {
        return target.closest('[data-wh40k-hook="inquest-card"]')?.querySelector<HTMLInputElement>('[data-lead-relevant]')?.checked === true;
    }

    static async #onLeadTest(this: InquestTrackerDialog, _event: Event, target: HTMLElement): Promise<void> {
        const degrees = Number(target.dataset['degrees']);
        const rules = this.#rules;
        await this.#updateAt(target, (q) => ({
            ...q,
            investigationPoints: applyInvestigationPoints(q.investigationPoints, leadTestInvestigationPoints(rules, degrees)),
        }));
    }

    static async #onResolveInquest(this: InquestTrackerDialog, _event: Event, target: HTMLElement): Promise<void> {
        const goalsMet = target.dataset['goalsMet'] === 'true';
        const resolved = await this.#updateAt(target, (q) => ({ ...q, status: goalsMet ? 'goalsMet' : 'goalsFailed' }));
        if (resolved === null) return;
        const outcome = inquestInfluenceOutcome(this.#rules, resolved, goalsMet);
        await this.#postCard({
            kind: 'resolution',
            target: resolved.target,
            scopeLabel: game.i18n.localize(inquestScopeLabelKey(resolved.scope)),
            points: resolved.investigationPoints,
            required: inquestProgress(this.#rules, resolved).required,
            goalsMet,
            influenceTotal: outcome.total,
            scopeReward: outcome.scopeReward,
            surplusBonus: outcome.surplusBonus,
            shortfallPenalty: outcome.shortfallPenalty,
        });
    }

    static async #onReopenInquest(this: InquestTrackerDialog, _event: Event, target: HTMLElement): Promise<void> {
        await this.#updateAt(target, (q) => ({ ...q, status: 'active' }));
    }

    static async #onSave(this: InquestTrackerDialog): Promise<void> {
        await this.#commit(this.#readInquests());
    }
}
