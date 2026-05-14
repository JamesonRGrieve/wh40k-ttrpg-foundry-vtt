/**
 * @file WH40KCreateActorDialog — cascading Create Actor dialog.
 *
 * Replaces Foundry's default actor-create flow with:
 *   1. System select (DH2 / DH1 / RT / BC / OW / DW / IM)
 *   2. Kind select — options filtered by system (e.g. hides Starship when
 *      system !== RT)
 *   3. Name input
 *
 * On submit, creates an actor with type `${system}-${kind}` so it lands on
 * the right per-system data model and sheet automatically.
 */

export const ACTOR_SYSTEM_AVAILABILITY: Record<string, string[]> = {
    dh2: ['character', 'npc', 'vehicle'],
    dh1: ['character', 'npc', 'vehicle'],
    rt: ['character', 'npc', 'vehicle', 'starship'],
    bc: ['character', 'npc', 'vehicle'],
    ow: ['character', 'npc', 'vehicle'],
    dw: ['character', 'npc', 'vehicle'],
    im: ['character', 'npc', 'vehicle'],
};

export const ACTOR_SYSTEM_LABELS: Record<string, string> = {
    dh2: 'Dark Heresy 2e',
    dh1: 'Dark Heresy 1e',
    rt: 'Rogue Trader',
    bc: 'Black Crusade',
    ow: 'Only War',
    dw: 'Deathwatch',
    im: 'Imperium Maledictum',
};

export const ACTOR_KIND_LABELS: Record<string, string> = {
    character: 'Player Character',
    npc: 'NPC',
    vehicle: 'Vehicle',
    starship: 'Starship',
};

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
        const initialSystem = opts.initialSystem ?? 'dh2';
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: array index may be undefined at runtime
        const initialKind = ACTOR_SYSTEM_AVAILABILITY[initialSystem]?.[0] ?? 'character';

        const systemSelect = Object.keys(ACTOR_SYSTEM_LABELS)
            .map((k) => `<option value="${k}" ${k === initialSystem ? 'selected' : ''}>${ACTOR_SYSTEM_LABELS[k]}</option>`)
            .join('');

        const kindSelect = Object.keys(ACTOR_KIND_LABELS)
            .filter((k) => (ACTOR_SYSTEM_AVAILABILITY[initialSystem] ?? []).includes(k))
            .map((k) => `<option value="${k}" ${k === initialKind ? 'selected' : ''}>${ACTOR_KIND_LABELS[k]}</option>`)
            .join('');

        const content = `
            <form class="wh40k-create-actor-form" style="display:flex;flex-direction:column;gap:8px;">
                <div class="form-group">
                    <label>Game System</label>
                    <select name="system" style="width:100%;">${systemSelect}</select>
                </div>
                <div class="form-group">
                    <label>Kind</label>
                    <select name="kind" style="width:100%;">${kindSelect}</select>
                </div>
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" name="name" placeholder="Unnamed Actor" style="width:100%;" />
                </div>
            </form>
        `;

        return new Promise((resolve) => {
            const dialog = new foundry.applications.api.DialogV2({
                window: { title: 'Create Actor', icon: 'fa-solid fa-user-plus' },
                position: { width: 400 },
                content,
                buttons: [
                    {
                        action: 'create',
                        label: 'Create',
                        icon: 'fa-solid fa-plus',
                        default: true,
                        callback: async (_event: Event, button: HTMLElement) => {
                            const form = button.closest('form') as HTMLFormElement;
                            const selectedSystem = (form.querySelector('[name="system"]') as HTMLSelectElement).value;
                            const kind = (form.querySelector('[name="kind"]') as HTMLSelectElement).value;
                            const nameInput = (form.querySelector('[name="name"]') as HTMLInputElement).value.trim();
                            const type = `${selectedSystem}-${kind}`;
                            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: lookup table indexed by user-supplied select value
                            const systemLabel = ACTOR_SYSTEM_LABELS[selectedSystem] ?? selectedSystem;
                            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: lookup table indexed by user-supplied select value
                            const kindLabel = ACTOR_KIND_LABELS[kind] ?? kind;
                            const name = nameInput !== '' ? nameInput : `New ${systemLabel} ${kindLabel}`;
                            // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create expects document creation data; no typed overload matches plain object
                            const data: Record<string, unknown> = { name, type };
                            if (opts.folder != null) data['folder'] = opts.folder;
                            // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create parameter type is a complex Foundry generic; casting through unknown is the only viable path
                            const actor = await Actor.create(data as unknown as Parameters<typeof Actor.create>[0]);
                            // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create return type is Document.ToConfiguredInstance which doesn't match Actor directly
                            resolve((actor as unknown as Actor | null) ?? null);
                        },
                    },
                    {
                        action: 'cancel',
                        label: 'Cancel',
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
                    kindSel.innerHTML = Object.keys(ACTOR_KIND_LABELS)
                        .filter((k) => allowed.includes(k))
                        .map((k) => `<option value="${k}" ${k === current ? 'selected' : ''}>${ACTOR_KIND_LABELS[k]}</option>`)
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

export default WH40KCreateActorDialog;
