/**
 * @file DaemonWeaponAttributeDialog - GM-facing roller for Daemon Weapon
 * Attributes (beyond.md L1651-1820, issue #142).
 *
 * The dialog lets the GM pick a daemonic alignment + binding strength,
 * rolls 1d10 per Attribute slot allowed by the binding tier, and emits
 * a chat card listing the resolved Attributes.
 */

import type { ChaosAlignment } from '../../config/game-systems/types.ts';
import {
    type DaemonWeaponAttributeRollResult,
    readDaemonWeaponAttributeTables,
    rollDaemonWeaponAttributes,
} from '../../rules/daemon-weapon-attribute-tables.ts';
import { BINDING_STRENGTH_PROFILES, type BindingStrength } from '../../rules/daemon-weapon.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

const DIALOG_TEMPLATE = 'systems/wh40k-rpg/templates/prompt/daemon-weapon-attribute-dialog.hbs';
const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/daemon-weapon-attribute-chat.hbs';

const ALIGNMENT_CHOICES: readonly ChaosAlignment[] = ['unaligned', 'khorne', 'nurgle', 'slaanesh', 'tzeentch'];
const BINDING_CHOICES: readonly BindingStrength[] = ['minor', 'lesser', 'normal', 'greater', 'major'];

/** Tailwind accent class per alignment used by the dialog header + chat card. */
export const ALIGNMENT_ACCENT_CLASS: Record<ChaosAlignment, string> = {
    unaligned: 'tw-text-gold',
    khorne: 'tw-text-crimson',
    nurgle: 'tw-text-green-500',
    slaanesh: 'tw-text-pink-400',
    tzeentch: 'tw-text-blue-400',
};

interface DialogOptions {
    alignment?: ChaosAlignment;
    bindingStrength?: BindingStrength;
}

/**
 * GM dialog: pick alignment + binding strength, roll Attributes, emit chat card.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2Mixin requires a constructor type; Foundry's ApplicationV2 class does not match the ctor constraint directly
export default class DaemonWeaponAttributeDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    constructor(options: DialogOptions = {}) {
        super(options);
        this.alignment = options.alignment ?? 'unaligned';
        this.bindingStrength = options.bindingStrength ?? 'minor';
        this.result = null;
    }

    /** @override */
    static override DEFAULT_OPTIONS = {
        tag: 'div',
        classes: ['wh40k-rpg', 'dialog', 'daemon-weapon-attribute', 'standard-form'],
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            roll: DaemonWeaponAttributeDialog.#onRoll,
            post: DaemonWeaponAttributeDialog.#onPost,
            close: DaemonWeaponAttributeDialog.#onClose,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
        position: { width: 480 },
        window: {
            title: 'WH40K.DaemonWeaponAttribute.DialogTitle',
            minimizable: false,
        },
    };

    /** @override */
    static override PARTS = {
        form: {
            template: DIALOG_TEMPLATE,
            scrollable: [''],
        },
    };

    alignment: ChaosAlignment;
    bindingStrength: BindingStrength;
    result: DaemonWeaponAttributeRollResult | null;

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext is typed as Record<string, unknown> in Foundry's shipped typings
    override async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        return {
            ...context,
            alignment: this.alignment,
            bindingStrength: this.bindingStrength,
            alignmentChoices: ALIGNMENT_CHOICES,
            bindingChoices: BINDING_CHOICES.map((s) => ({ value: s, label: BINDING_STRENGTH_PROFILES[s].label })),
            accentClass: ALIGNMENT_ACCENT_CLASS[this.alignment],
            result: this.result,
            hasResult: this.result !== null,
        };
    }

    /** Read current selects from the rendered form. */
    #syncSelections(): void {
        const root = this.element;
        if (!(root instanceof HTMLElement)) return;
        const alignment = root.querySelector<HTMLSelectElement>('select[name="alignment"]')?.value;
        const binding = root.querySelector<HTMLSelectElement>('select[name="bindingStrength"]')?.value;
        if (alignment !== undefined && (ALIGNMENT_CHOICES as readonly string[]).includes(alignment)) {
            this.alignment = alignment as ChaosAlignment;
        }
        if (binding !== undefined && (BINDING_CHOICES as readonly string[]).includes(binding)) {
            this.bindingStrength = binding as BindingStrength;
        }
    }

    static async #onRoll(this: DaemonWeaponAttributeDialog, _event: Event, _target: HTMLElement): Promise<void> {
        this.#syncSelections();
        const tables = await readDaemonWeaponAttributeTables();
        this.result = rollDaemonWeaponAttributes(this.alignment, this.bindingStrength, tables);
        await this.render({ force: true });
    }

    static async #onPost(this: DaemonWeaponAttributeDialog, _event: Event, _target: HTMLElement): Promise<void> {
        if (this.result === null) return;
        const content = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, {
            alignment: this.alignment,
            bindingStrength: this.bindingStrength,
            bindingLabel: BINDING_STRENGTH_PROFILES[this.bindingStrength].label,
            accentClass: ALIGNMENT_ACCENT_CLASS[this.alignment],
            result: this.result,
            gameSystem: 'dh2',
        });
        await ChatMessage.create({
            content,
            speaker: ChatMessage.getSpeaker({ alias: 'Daemon Weapon' }),
            flags: { 'wh40k-rpg': { type: 'daemon-weapon-attribute', alignment: this.alignment, bindingStrength: this.bindingStrength } },
        });
        await this.close();
    }

    static async #onClose(this: DaemonWeaponAttributeDialog, _event: Event, _target: HTMLElement): Promise<void> {
        await this.close();
    }
}

/** Convenience launcher (parallel to {@link promptRighteousFury}). */
export async function promptDaemonWeaponAttributes(options: DialogOptions = {}): Promise<void> {
    const dialog = new DaemonWeaponAttributeDialog(options);
    await dialog.render({ force: true });
}
