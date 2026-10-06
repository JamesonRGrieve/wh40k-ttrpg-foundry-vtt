/**
 * @file WH40KCreateActorDialog — cascading Create Actor dialog.
 *
 * Replaces Foundry's default actor-create flow with:
 *   1. System select (DH2 / DH1 / RT / BC / OW / DW / IM)
 *   2. Kind select — options filtered by system (e.g. hides Voidcraft when
 *      system !== RT)
 *   3. Name input
 *
 * On submit, creates an actor with type `${system}-${kind}` so it lands on
 * the right per-system data model and sheet automatically.
 */

import { WH40KSettings } from '../../wh40k-rpg-settings.ts';

export const ACTOR_SYSTEM_AVAILABILITY: Record<string, string[]> = {
    dh2: ['character', 'npc', 'terracraft', 'aircraft'],
    dh1: ['character', 'npc', 'terracraft'],
    rt: ['character', 'npc', 'terracraft', 'aircraft', 'voidcraft'],
    bc: ['character', 'npc', 'terracraft'],
    ow: ['character', 'npc', 'terracraft', 'aircraft'],
    dw: ['character', 'npc', 'terracraft', 'aircraft'],
    im: ['character', 'npc', 'terracraft'],
};

/** Offered actor kinds, in dropdown order; labels resolve via `WH40K.CreateActor.Kinds.<kind>`. */
export const ACTOR_KINDS: readonly string[] = ['character', 'npc', 'terracraft', 'aircraft', 'watercraft', 'voidcraft'];

/** Offered game systems, in dropdown order; labels resolve via the primary-game-system choice keys. */
export const ACTOR_SYSTEMS: readonly string[] = Object.keys(ACTOR_SYSTEM_AVAILABILITY);

const localizedSystemLabel = (systemId: string): string => game.i18n.localize(`WH40K.SETTINGS.PrimaryGameSystem.Choices.${systemId}`);
const localizedKindLabel = (kindId: string): string => game.i18n.localize(`WH40K.CreateActor.Kinds.${kindId}`);

export interface CreateActorOptions {
    folder?: string;
    initialSystem?: string;
}

// biome-ignore lint/complexity/noStaticOnlyClass: intentional namespace-class pattern; consumed as Class.open() at call sites; converting to a module function would break the exported class name used by hooks-manager
export class WH40KCreateActorDialog {
    /**
     * Open the dialog. Resolves when the actor is created (or the user cancels).
     * Returns the created actor, or null if cancelled.
     */
    static async open(opts: CreateActorOptions = {}): Promise<Actor | null> {
        // Starts on the world's Primary Game System unless the caller names one.
        const initialSystem = opts.initialSystem ?? WH40KSettings.getPrimaryGameSystem();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: array index may be undefined at runtime
        const initialKind = ACTOR_SYSTEM_AVAILABILITY[initialSystem]?.[0] ?? 'character';

        const systemSelect = ACTOR_SYSTEMS.map((k) => `<option value="${k}" ${k === initialSystem ? 'selected' : ''}>${localizedSystemLabel(k)}</option>`).join(
            '',
        );

        const kindSelect = ACTOR_KINDS.filter((k) => (ACTOR_SYSTEM_AVAILABILITY[initialSystem] ?? []).includes(k))
            .map((k) => `<option value="${k}" ${k === initialKind ? 'selected' : ''}>${localizedKindLabel(k)}</option>`)
            .join('');

        const content = `
            <form class="wh40k-create-actor-form" style="display:flex;flex-direction:column;gap:8px;">
                <div class="form-group">
                    <label>${game.i18n.localize('WH40K.CreateActor.SystemLabel')}</label>
                    <select name="system" style="width:100%;">${systemSelect}</select>
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize('WH40K.CreateActor.KindLabel')}</label>
                    <select name="kind" style="width:100%;">${kindSelect}</select>
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize('WH40K.CreateActor.NameLabel')}</label>
                    <input type="text" name="name" placeholder="${game.i18n.localize('WH40K.CreateActor.NamePlaceholder')}" style="width:100%;" />
                </div>
            </form>
        `;

        return new Promise((resolve) => {
            const dialog = new foundry.applications.api.DialogV2({
                window: { title: game.i18n.localize('WH40K.CreateActor.Title'), icon: 'fa-solid fa-user-plus' },
                position: { width: 400 },
                content,
                buttons: [
                    {
                        action: 'create',
                        label: game.i18n.localize('WH40K.CreateActor.CreateButton'),
                        icon: 'fa-solid fa-plus',
                        default: true,
                        callback: async (_event: Event, button: HTMLElement) => {
                            const form = button.closest('form') as HTMLFormElement;
                            const selectedSystem = (form.querySelector('[name="system"]') as HTMLSelectElement).value;
                            const kind = (form.querySelector('[name="kind"]') as HTMLSelectElement).value;
                            const nameInput = (form.querySelector('[name="name"]') as HTMLInputElement).value.trim();
                            const type = `${selectedSystem}-${kind}`;
                            const name =
                                nameInput !== ''
                                    ? nameInput
                                    : game.i18n.format('WH40K.CreateActor.DefaultName', {
                                          system: localizedSystemLabel(selectedSystem),
                                          kind: localizedKindLabel(kind),
                                      });
                            // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create expects document creation data; no typed overload matches plain object
                            const data: Record<string, unknown> = { name, type };
                            if (opts.folder !== undefined) data['folder'] = opts.folder;
                            // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create parameter type is a complex Foundry generic; casting through unknown is the only viable path
                            const actor = await Actor.create(data as unknown as Parameters<typeof Actor.create>[0]);
                            // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create return type is Document.ToConfiguredInstance which doesn't match Actor directly
                            resolve((actor as unknown as Actor | null) ?? null);
                        },
                    },
                    {
                        action: 'cancel',
                        label: game.i18n.localize('WH40K.CreateActor.CancelButton'),
                        icon: 'fa-solid fa-xmark',
                        callback: () => resolve(null),
                    },
                ],
                rejectClose: false,
            });

            const afterRender = (): void => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2 exposes element but typings don't declare it on the return type
                const root = (dialog as unknown as { element: HTMLElement }).element;
                const sysSel = root.querySelector<HTMLSelectElement>('[name="system"]');
                const kindSel = root.querySelector<HTMLSelectElement>('[name="kind"]');
                if (!sysSel || !kindSel) return;
                sysSel.addEventListener('change', () => {
                    const sys = sysSel.value;
                    const allowed = ACTOR_SYSTEM_AVAILABILITY[sys] ?? [];
                    const current = kindSel.value;
                    kindSel.innerHTML = ACTOR_KINDS.filter((k) => allowed.includes(k))
                        .map((k) => `<option value="${k}" ${k === current ? 'selected' : ''}>${localizedKindLabel(k)}</option>`)
                        .join('');
                    if (!allowed.includes(current)) {
                        kindSel.value = allowed[0] ?? '';
                    }
                });
            };

            void dialog.render(true).then(afterRender);
        });
    }
}
