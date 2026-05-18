/**
 * @file GrenadeThrowDialog — GM-only picker for the Within-supplement
 * grenade registry (#135).
 *
 * Lists each grenade in `WITHIN_GRENADES`, lets the GM pick one, and on
 * "Throw" emits a chat card showing the grenade's blast radius, damage,
 * special qualities, on-target save, and failure effect.
 *
 * The dialog is a thin emitter — all grenade definitions live in
 * `src/module/rules/within-grenades.ts`. Adding a new grenade means
 * adding a registry entry + label key; the dialog and chat card pick
 * it up without changes.
 */

import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import {
    type GrenadeDefinition,
    type GrenadeSaveCharacteristic,
    getWithinGrenade,
    listWithinGrenades,
} from '../../rules/within-grenades.ts';

const { ApplicationV2 } = foundry.applications.api;

type ActionHandler = (this: GrenadeThrowDialog, event: Event, target: HTMLElement) => Promise<void>;

interface GrenadeChoice {
    id: string;
    label: string;
    blastRadius: number;
    damage: string;
    specialQualities: readonly string[];
    saveLabel: string;
    failEffect: string;
    accentClass: string;
    isSelected: boolean;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface GrenadeThrowContext extends Record<string, unknown> {
    grenades: GrenadeChoice[];
    selectedId: string;
    selectedGrenade: GrenadeChoice | null;
}

interface AnyGame {
    user?: { id?: string; isGM?: boolean };
    i18n?: { localize?: (k: string) => string; format?: (k: string, data: Record<string, unknown>) => string };
}

function localize(key: string): string {
    const g = globalThis as unknown as { game?: AnyGame };
    const fn = g.game?.i18n?.localize;
    return fn?.(key) ?? key;
}

const CHARACTERISTIC_LABEL: Record<GrenadeSaveCharacteristic, string> = {
    toughness: 'Toughness',
    agility: 'Agility',
    willpower: 'Willpower',
};

function formatDifficulty(mod: number): string {
    if (mod === 0) return 'Ordinary (+0)';
    if (mod > 0) return `+${mod}`;
    return String(mod);
}

function saveLabelFor(def: GrenadeDefinition): string {
    return `${CHARACTERISTIC_LABEL[def.save.characteristic]} ${formatDifficulty(def.save.difficulty)}`;
}

function toChoice(def: GrenadeDefinition, selectedId: string): GrenadeChoice {
    return {
        id: def.id,
        label: localize(def.labelKey),
        blastRadius: def.blastRadius,
        damage: def.damage,
        specialQualities: def.specialQualities,
        saveLabel: saveLabelFor(def),
        failEffect: def.failEffect,
        accentClass: def.accentClass,
        isSelected: def.id === selectedId,
    };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class GrenadeThrowDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare selectedId: string;

    constructor(options: ApplicationV2Config.DefaultOptions & { grenadeId?: string } = {}) {
        super(options);
        const requested = (options as { grenadeId?: string }).grenadeId;
        const initial = typeof requested === 'string' && getWithinGrenade(requested) !== null
            ? requested
            : (listWithinGrenades()[0]?.id ?? '');
        this.selectedId = initial;
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'grenade-throw-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectGrenade: GrenadeThrowDialog.#onSelectGrenade as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            throw: GrenadeThrowDialog.#onThrow as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: GrenadeThrowDialog.#onCancel as ActionHandler,
        },
        position: { width: 560 },
        window: {
            title: 'WH40K.WithinGrenade.DialogTitle',
            resizable: false,
        },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/grenade-throw-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<GrenadeThrowContext> {
        const context = (await super._prepareContext(options)) as GrenadeThrowContext;
        const grenades = listWithinGrenades().map((g) => toChoice(g, this.selectedId));
        const selectedGrenade = grenades.find((g) => g.isSelected) ?? null;
        return {
            ...context,
            grenades,
            selectedId: this.selectedId,
            selectedGrenade,
        };
    }

    static async #onSelectGrenade(this: GrenadeThrowDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const next = target.dataset.grenadeId ?? '';
        if (next !== '' && getWithinGrenade(next) !== null) {
            this.selectedId = next;
            await this.render();
        }
    }

    static async #onThrow(this: GrenadeThrowDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const def = getWithinGrenade(this.selectedId);
        if (def === null) return;

        const choice = toChoice(def, this.selectedId);
        const templateData = {
            ...choice,
            gameSystem: 'dh2e',
        };

        const html = await foundry.applications.handlebars.renderTemplate(
            'systems/wh40k-rpg/templates/chat/grenade-throw-chat.hbs',
            templateData,
        );

        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: game.user?.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
        await this.close();
    }

    static async #onCancel(this: GrenadeThrowDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Convenience opener — mirror of openFearTestDialog. */
export function openGrenadeThrowDialog(opts: { grenadeId?: string } = {}): void {
    const dialog = new GrenadeThrowDialog(opts);
    void dialog.render({ force: true });
}
