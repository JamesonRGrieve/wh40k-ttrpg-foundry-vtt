/**
 * @file DisorderRollDialog — GM-only dialog for rolling a Mental Disorder
 * from the canonical Disorders table (#116, core.md §"Insanity").
 *
 * The GM picks a severity tier (Minor / Severe / Acute) — corresponding
 * to the 40 / 60 / 80 Insanity thresholds — clicks Roll, and the dialog
 * emits a chat card surfacing the rolled disorder's name, severity, and
 * mechanical effect summary.
 *
 * Pure picking logic lives in `src/module/rules/disorders-table.ts`;
 * this file is a thin UI shell over `rollDisorder()`.
 */

import { type DisorderDef, type DisorderSeverity, rollDisorder } from '../../rules/disorders-table.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

interface SeverityOption {
    id: DisorderSeverity;
    labelKey: string;
    /** Insanity-point threshold associated with this tier (40 / 60 / 80). */
    threshold: number;
}

const SEVERITY_OPTIONS: ReadonlyArray<SeverityOption> = Object.freeze([
    { id: 'minor', labelKey: 'WH40K.DisorderRoll.Minor', threshold: 40 },
    { id: 'severe', labelKey: 'WH40K.DisorderRoll.Severe', threshold: 60 },
    { id: 'acute', labelKey: 'WH40K.DisorderRoll.Acute', threshold: 80 },
]);

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface DisorderRollContext extends Record<string, unknown> {
    severities: ReadonlyArray<SeverityOption>;
    severity: DisorderSeverity;
}

function isValidSeverity(value: string): value is DisorderSeverity {
    return value === 'minor' || value === 'severe' || value === 'acute';
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class DisorderRollDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare severity: DisorderSeverity;

    constructor(options: ApplicationV2Config.DefaultOptions & { severity?: DisorderSeverity } = {}) {
        super(options);
        const initial = (options as { severity?: DisorderSeverity }).severity ?? 'minor';
        this.severity = isValidSeverity(initial) ? initial : 'minor';
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'disorder-roll-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectSeverity: DisorderRollDialog.#onSelectSeverity,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            rollDisorder: DisorderRollDialog.#onRollDisorder,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: DisorderRollDialog.#onCancel,
        },
        position: { width: 480 },
        window: {
            title: 'WH40K.DisorderRoll.DialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/disorder-roll-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<DisorderRollContext> {
        const context = (await super._prepareContext(options)) as DisorderRollContext;
        return {
            ...context,
            severities: SEVERITY_OPTIONS,
            severity: this.severity,
        };
    }

    static async #onSelectSeverity(this: DisorderRollDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const next = target.dataset['severity'] ?? '';
        if (isValidSeverity(next)) {
            this.severity = next;
            await this.render();
        }
    }

    static async #onRollDisorder(this: DisorderRollDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const disorder: DisorderDef | null = rollDisorder(this.severity);
        if (disorder === null) {
            await this.close();
            return;
        }

        const templateData = {
            severity: this.severity,
            severityKey: `WH40K.DisorderRoll.${this.severity.charAt(0).toUpperCase()}${this.severity.slice(1)}`,
            disorderName: disorder.name,
            disorderKey: disorder.key,
            effect: disorder.effect,
            gameSystem: 'dh2e',
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/disorder-roll-chat.hbs', templateData);

        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: game.user.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
        await this.close();
    }

    static async #onCancel(this: DisorderRollDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Convenience opener; sheets / chat-card buttons hook into this. */
export function openDisorderRollDialog(opts: { severity?: DisorderSeverity } = {}): void {
    const dialog = new DisorderRollDialog(opts);
    void dialog.render({ force: true });
}
