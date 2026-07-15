/**
 * @file DisorderRollDialog — GM-only dialog for rolling a Mental Disorder
 * from the canonical Disorders RollTable (#116, core.md §"Insanity").
 *
 * The GM picks a severity tier (Minor / Severe / Acute) — corresponding
 * to the 40 / 60 / 80 Insanity thresholds — clicks Roll, and the dialog
 * draws from the "Disorders" RollTable in the `dh2-core-rolltables`
 * compendium, resolves the referenced Mental Disorder item, and emits a
 * chat card surfacing the disorder's name, the chosen severity, and a
 * concise effect summary.
 *
 * The disorder content lives ONLY in the compendium packs
 * (`dh2-core-rolltables` for the range→disorder mapping and
 * `dh2-core-items-mental-disorders` for the item bodies); this file is a
 * thin UI shell that reads that content at runtime.
 */

import { emitChatFromTemplate } from '../../rolls/roll-helpers.ts';
import { capitalize } from '../../utils/format.ts';
import { RollTableUtils } from '../../utils/roll-table-utils.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import { conciseEffect } from './disorder-text.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Three canonical severity tiers, mirroring `MentalDisorderData.severity`. */
export type DisorderSeverity = 'minor' | 'severe' | 'acute';

/** World/compendium name of the Disorders roll table (authored in `dh2-core-rolltables`). */
const DISORDERS_TABLE_NAME = 'Disorders';
/** Compendium collection id the Disorders table lives in — scopes the lookup so a shared table name can't mis-resolve. */
const DISORDERS_ROLLTABLE_PACK = 'wh40k-rpg.dh2-core-rolltables';

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

/** The subset of a drawn `TableResult` this dialog reads. */
interface DrawnDisorderResult {
    documentUuid: string | null;
    name: string;
    description: string;
}

/** The subset of a resolved Mental Disorder item this dialog reads (per-line variants already flattened at load). */
interface ResolvedDisorderItem {
    name: string;
    system: { trigger?: string; effect?: string };
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

        // Draw the disorder from the compendium RollTable (content lives in the
        // packs, not in this module). `displayChat: false` — we emit a bespoke card below.
        const rollResult = await RollTableUtils.rollTable(DISORDERS_TABLE_NAME, {
            pack: DISORDERS_ROLLTABLE_PACK,
            displayChat: false,
        });
        const results = rollResult?.results ?? [];
        const first = results[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess (tsconfig.strict.json) types results[0] as TableResult|undefined; the main/ESLint config has the flag off and sees the guard as redundant
        if (first === undefined) {
            await this.close();
            return;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's TableResult is untyped for our purposes; we read only documentUuid/name/description
        const drawn = first as unknown as DrawnDisorderResult;
        const item = drawn.documentUuid !== null ? ((await fromUuid(drawn.documentUuid)) as ResolvedDisorderItem | null) : null;

        // Bind `system` to a local so the `??` defaults below don't read a `.system.*`
        // member directly (which the no-restricted-syntax schema-tightening rule forbids).
        const sys = item?.system;
        const disorderName = item?.name ?? drawn.name;
        const effect = conciseEffect(sys?.trigger ?? '', sys?.effect ?? drawn.description);

        const templateData = {
            severity: this.severity,
            severityKey: `WH40K.DisorderRoll.${capitalize(this.severity)}`,
            disorderName,
            effect,
            gameSystem: 'dh2',
        };

        await emitChatFromTemplate('systems/wh40k-rpg/templates/chat/disorder-roll-chat.hbs', templateData);
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
