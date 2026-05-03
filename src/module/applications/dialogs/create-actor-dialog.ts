/**
 * @gulpfile.js WH40KCreateActorDialog — cascading Create Actor dialog.
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

// Foundry VTT Application base classes and types are assumed to be globally available
// in the context where this code will run, as is typical for Foundry modules.
// Therefore, no explicit imports are added for DialogV2, Actor, etc.

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

// Foundry types for Actor and its creation data are assumed to be globally available.
// The `CreateInput` and `MaybeArray` types are not defined in this file and are
// not part of global Foundry types, so we use Record<string, unknown> as the fallback
// for the actor creation data.

export class WH40KCreateActorDialog {
    /**
     * Open the dialog. Resolves when the actor is created (or the user cancels).
     * Returns the created actor, or null if cancelled.
     */
    static async open(opts: CreateActorOptions = {}): Promise<Actor | null> {
        const initialSystem = opts.initialSystem ?? 'dh2';
        const initialKind = ACTOR_SYSTEM_AVAILABILITY[initialSystem][0];

        const systemSelect = Object.keys(ACTOR_SYSTEM_LABELS)
            .map((k) => `<option value="${k}" ${k === initialSystem ? 'selected' : ''}>${ACTOR_SYSTEM_LABELS[k]}</option>`)
            .join('');

        const kindSelect = Object.keys(ACTOR_KIND_LABELS)
            .filter((k) => ACTOR_SYSTEM_AVAILABILITY[initialSystem].includes(k))
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
                            const system = (form.querySelector('[name="system"]') as HTMLSelectElement).value;
                            const kind = (form.querySelector('[name="kind"]') as HTMLSelectElement).value;
                            const nameInput = (form.querySelector('[name="name"]') as HTMLInputElement).value.trim();
                            const type = `${system}-${kind}`;
                            const name = nameInput || `New ${ACTOR_SYSTEM_LABELS[system]} ${ACTOR_KIND_LABELS[kind]}`;
                            // The Actor.create method expects an object that can be cast to the creation data type.
                            // Record<string, unknown> is used as a fallback for unknown object types.
                            const data: Record<string, unknown> = { name, type };
                            if (opts.folder) {
                                data.folder = opts.folder;
                            }
                            // Cast `data` at the call site to satisfy the Actor.create signature.
                            // The specific type `MaybeArray<CreateInput>` is unknown and cannot be imported,
                            // so we cast to `Record<string, unknown>` which is the fallback type.
                            // This assumes the structure of `data` is compatible with what Actor.create expects.
                            const actor = await Actor.create(data as Record<string, unknown>);
                            resolve(actor ?? null);
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

            const afterRender = () => {
                // Casting `dialog` to `Record<string, any>` to safely access the `element` property,
                // as `DialogV2` type definition might not expose it directly, but it's expected for UI elements.
                const root = (dialog as Record<string, any>).element;
                const sysSel = root.querySelector('[name="system"]') as HTMLSelectElement | null;
                const kindSel = root.querySelector('[name="kind"]') as HTMLSelectElement | null;
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
                        kindSel.value = allowed[0];
                    }
                });
            };

            void dialog.render(true).then(afterRender);
        });
    }
}

export default WH40KCreateActorDialog;
