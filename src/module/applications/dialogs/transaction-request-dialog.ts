import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { TransactionManager } from '../../transactions/transaction-manager.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface TransactionRequestContext extends Record<string, unknown> {
    buyer: WH40KBaseActor;
    hasSources: boolean;
    sources: Array<{ id: string; name: string; modeLabel: string; selected: boolean }>;
    selectedSource: Actor | null; // Assuming Actor is a globally available Foundry type
    items: Array<{ id: string; name: string; img: string | null; type: string; quantity: number; cost: number; selected: boolean }>;
    selectedItem: WH40KItem | null;
    quantity: number;
    influenceBurn: number;
    quote: unknown;
    isBarter: boolean;
    isRequisition: boolean;
}

export default class TransactionRequestDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        id: 'transaction-request-dialog-{id}',
        classes: ['wh40k-rpg', 'transaction-request-dialog', 'standard-form'], // Moved contentClasses to classes
        tag: 'form',
        window: {
            title: 'Barter',
            icon: 'fa-solid fa-handshake',
            resizable: true,
        },
        position: {
            width: 720,
            height: 'auto',
        },
        form: {
            handler: TransactionRequestDialog.#onSubmit as unknown as ApplicationV2Config.FormConfiguration['handler'],
            submitOnChange: false,
            closeOnSubmit: false,
        },
        actions: {
            selectItem: TransactionRequestDialog.#selectItem,
            requestApproval: TransactionRequestDialog.#requestApproval,
        },
    };

    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/transaction-request-dialog.hbs',
        },
    };

    declare actor: WH40KBaseActor;
    declare sourceId: string;
    declare itemId: string;
    declare quantity: number;
    declare influenceBurn: number;
    #resolve: ((value: boolean | null) => void) | null = null;

    constructor(actor: WH40KBaseActor, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.actor = actor;

        const sources = TransactionManager.listSourcesForBuyer(actor);
        if (sources.length) {
            this.sourceId = String(sources[0].id ?? ''); // Ensure string assignment
            const items = TransactionManager.listItemsForSource(sources[0]);
            if (items.length) {
                this.itemId = String(items[0].id ?? ''); // Ensure string assignment
            }
        } else {
            this.sourceId = ''; // Default to empty string if no sources
            this.itemId = ''; // Default to empty string if no sources
        }
        this.quantity = 1; // Explicitly set defaults
        this.influenceBurn = 0; // Explicitly set defaults
    }

    get title(): string {
        return 'Barter';
    }

    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<TransactionRequestContext> {
        const context = (await super._prepareContext(options as Record<string, unknown>)) as Record<string, unknown>; // Cast options
        const sources = TransactionManager.listSourcesForBuyer(this.actor);
        const selectedSource = sources.find((source) => source.id === this.sourceId) ?? sources[0] ?? null;

        // Ensure sourceId is always a string, defaulting if necessary
        if (selectedSource && this.sourceId !== selectedSource.id) {
            this.sourceId = String(selectedSource.id ?? '');
        } else if (!this.sourceId && sources.length > 0) {
            // If no sourceId is set and there are sources, default to the first one
            this.sourceId = String(sources[0].id ?? '');
        } else if (sources.length === 0) {
            this.sourceId = ''; // Ensure it's a string if no sources exist
        }

        const items = TransactionManager.listItemsForSource(selectedSource);
        const selectedItem = items.find((item) => item.id === this.itemId) ?? items[0] ?? null;

        // Ensure itemId is always a string, defaulting if necessary
        if (selectedItem && this.itemId !== selectedItem.id) {
            this.itemId = String(selectedItem.id ?? '');
        } else if (!this.itemId && items.length > 0) {
            // If no itemId is set and there are items, default to the first one
            this.itemId = String(items[0].id ?? '');
        } else if (items.length === 0) {
            this.itemId = ''; // Ensure it's a string if no items exist
        }

        let quote: unknown = null;
        if (selectedSource && selectedItem) {
            try {
                quote = TransactionManager.prepareQuote({
                    buyerActorId: this.actor.id,
                    sourceActorId: selectedSource.id,
                    itemId: selectedItem.id,
                    quantity: this.quantity,
                    influenceBurn: this.influenceBurn,
                });
            } catch (error) {
                quote = null;
            }
        }

        // Ensure that specific properties are correctly typed or cast
        return {
            ...context,
            buyer: this.actor, // Assuming WH40KBaseActor is compatible with the expected Actor type in the interface
            hasSources: sources.length > 0,
            sources: sources.map((source) => ({
                id: String(source.id ?? ''), // Cast to string
                name: source.name,
                modeLabel: TransactionManager.getSourceLabel(source),
                selected: source.id === selectedSource?.id,
            })),
            selectedSource,
            items: items.map((item) => ({
                id: String(item.id ?? ''), // Cast to string
                name: item.name,
                img: item.img ?? null,
                type: item.type,
                quantity: Number((item.system as any)?.quantity ?? 1), // Cast to number, provide default
                cost: Number((item.system as any)?.cost?.value ?? 0), // Cast to number, provide default
                selected: item.id === selectedItem?.id,
            })),
            selectedItem: selectedItem as WH40KItem | null, // Cast to expected type
            quantity: this.quantity,
            influenceBurn: this.influenceBurn,
            quote,
            isBarter: (quote as any)?.mode === 'barter',
            isRequisition: (quote as any)?.mode === 'requisition',
        };
    }

    _onRender(context: TransactionRequestContext, options: ApplicationV2Config.RenderOptions): void {
        super._onRender(context, options);

        const sourceSelect = this.element.querySelector('[name="sourceId"]') as HTMLSelectElement | null;
        const quantityInput = this.element.querySelector('[name="quantity"]') as HTMLInputElement | null;
        const influenceInput = this.element.querySelector('[name="influenceBurn"]') as HTMLInputElement | null;

        sourceSelect?.addEventListener('change', () => {
            this.sourceId = String(sourceSelect.value ?? ''); // Ensure string assignment
            this.itemId = '';
            this.quantity = 1;
            this.influenceBurn = 0;
            void this.render(false);
        });

        quantityInput?.addEventListener('change', () => {
            // Ensure parsed quantity is a number, default to 1 if invalid or empty
            this.quantity = Math.max(1, Number.parseInt(quantityInput.value || '1', 10) || 1);
            void this.render(false);
        });

        influenceInput?.addEventListener('change', () => {
            // Ensure parsed influence is a number, default to 0 if invalid or empty
            this.influenceBurn = Math.max(0, Number.parseInt(influenceInput.value || '0', 10) || 0);
            void this.render(false);
        });
    }

    static #onSubmit(this: TransactionRequestDialog, event: SubmitEvent, form: HTMLFormElement, formData: FormDataExtended): void {
        const data = formData.object;

        // Ensure parsed quantity is a number, default to 1 if invalid or empty
        this.quantity = Math.max(1, Number.parseInt(String(data.quantity) || '1', 10) || 1);
        // Ensure parsed influence is a number, default to 0 if invalid or empty
        this.influenceBurn = Math.max(0, Number.parseInt(String(data.influenceBurn) || '0', 10) || 0);
        // Ensure sourceId is a string, defaulting if necessary
        this.sourceId = String(data.sourceId ?? this.sourceId);
    }

    static async #selectItem(this: TransactionRequestDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const itemId = target.dataset.itemId;
        // Ensure itemId is assigned as a string, defaulting to empty string if null/undefined
        this.itemId = String(itemId ?? '');
        this.quantity = 1; // Reset quantity on item selection
        await this.render(false);
    }

    static async #requestApproval(this: TransactionRequestDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();

        try {
            // Ensure sourceId and itemId are valid strings before proceeding
            if (!this.sourceId || !this.itemId) {
                throw new Error('Choose a source and an item first.');
            }

            await TransactionManager.submitRequest({
                buyerActorId: this.actor.id,
                sourceActorId: this.sourceId,
                itemId: this.itemId,
                quantity: this.quantity,
                influenceBurn: this.influenceBurn,
            });

            await TransactionManager.notifyRequester('Transaction request sent to the GM for approval.', 'info');
            this.#resolve?.(true);
            await this.close({ _skipResolve: true } as Record<string, unknown>);
        } catch (error) {
            await TransactionManager.notifyRequester(error instanceof Error ? error.message : 'Unable to submit transaction request.', 'error');
        }
    }

    async wait(): Promise<boolean | null> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    async close(options: Record<string, unknown> = {}): Promise<unknown> {
        if (this.#resolve && !options._skipResolve) {
            this.#resolve(null);
        }
        return super.close(options);
    }

    static async show(actor: WH40KBaseActor): Promise<boolean | null> {
        const dialog = new TransactionRequestDialog(actor);
        return dialog.wait();
    }
}
