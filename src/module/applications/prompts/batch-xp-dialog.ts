/**
 * @file BatchXPDialog — GM dialog to award XP to multiple characters at once (#553).
 */

import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

type ActionHandler = (this: BatchXPDialog, event: Event, target: HTMLElement) => Promise<void>;

interface CharacterEntry {
    id: string;
    name: string;
    img: string;
    currentXP: number;
    selected: boolean;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag
interface BatchXPContext extends Record<string, unknown> {
    characters: CharacterEntry[];
    xpAmount: number;
    isAddition: boolean;
    absAmount: number;
    selectedCount: number;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs
export default class BatchXPDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare xpAmount: number;
    declare selectedIds: Set<string>;

    constructor(options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.xpAmount = 0;
        this.selectedIds = new Set(
            // eslint-disable-next-line no-restricted-syntax -- boundary: game.actors typed as Foundry collection
            (game.actors.contents as Array<{ id: string; type: string }>)
                .filter((a) => (a.type as string).includes('character'))
                .map((a) => a.id),
        );
    }

    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'batch-xp-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            apply: BatchXPDialog.#onApply as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: BatchXPDialog.#onCancel as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            toggleAll: BatchXPDialog.#onToggleAll as ActionHandler,
        },
        form: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            handler: BatchXPDialog.#onFormChange,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        position: { width: 450 },
        window: {
            title: 'WH40K.XP.BatchTitle',
            resizable: false,
        },
    };

    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/batch-xp-prompt.hbs',
            classes: [],
            scrollable: [],
        },
    };

    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<BatchXPContext> {
        const context = (await super._prepareContext(options)) as BatchXPContext;
        // eslint-disable-next-line no-restricted-syntax -- boundary: game.actors is Foundry's actor collection
        const allActors = game.actors.contents as Array<{ id: string; name: string; img: string; type: string; system?: { experience?: { total?: number } } }>;
        const characters: CharacterEntry[] = allActors
            .filter((a) => (a.type as string).includes('character'))
            .map((a) => ({
                id: a.id,
                name: a.name,
                img: a.img,
                currentXP: a.system?.experience?.total ?? 0,
                selected: this.selectedIds.has(a.id),
            }));

        return {
            ...context,
            characters,
            xpAmount: this.xpAmount,
            isAddition: this.xpAmount >= 0,
            absAmount: Math.abs(this.xpAmount),
            selectedCount: this.selectedIds.size,
        };
    }

    static async #onFormChange(this: BatchXPDialog, _event: Event, _form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        const rawXp = formData.object['xpAmount'];
        const xpAmount = typeof rawXp === 'string' || typeof rawXp === 'number' ? parseInt(String(rawXp), 10) || 0 : 0;
        const selected = formData.object['selected'];
        const ids = Array.isArray(selected) ? selected : selected !== undefined ? [selected] : [];
        this.selectedIds = new Set(ids.filter((id): id is string => typeof id === 'string'));
        if (this.xpAmount !== xpAmount) this.xpAmount = xpAmount;
        await this.render();
    }

    static async #onApply(this: BatchXPDialog, event: PointerEvent, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        if (this.xpAmount === 0 || this.selectedIds.size === 0) { await this.close(); return; }

        let count = 0;
        for (const actorId of this.selectedIds) {
            const actor = game.actors.get(actorId);
            if (actor === undefined) continue;
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system.experience is per-system typed
            const exp = (actor as { system?: { experience?: { total?: number } } }).system?.experience;
            const current = exp?.total ?? 0;
            const newTotal = Math.max(0, current + this.xpAmount);
            // eslint-disable-next-line no-await-in-loop -- sequential to avoid race
            await actor.update({ 'system.experience.total': newTotal });
            count++;
        }

        const verb = this.xpAmount > 0 ? 'added to' : 'removed from';
        ui.notifications.info(`${Math.abs(this.xpAmount)} XP ${verb} ${count} character(s).`);
        await this.close();
    }

    static async #onToggleAll(this: BatchXPDialog, _event: Event, _target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: game.actors
        const allIds = (game.actors.contents as Array<{ id: string; type: string }>)
            .filter((a) => (a.type as string).includes('character'))
            .map((a) => a.id);
        const allSelected = allIds.every((id) => this.selectedIds.has(id));
        this.selectedIds = allSelected ? new Set() : new Set(allIds);
        await this.render();
    }

    static async #onCancel(this: BatchXPDialog, event: PointerEvent, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

export function openBatchXPDialog(): void {
    if (!game.user.isGM) {
        ui.notifications.warn('Only the GM can award XP to multiple characters.');
        return;
    }
    const dialog = new BatchXPDialog();
    void dialog.render({ force: true });
}
