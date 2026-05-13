import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { TransactionManager } from '../../transactions/transaction-manager.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface TransactionQuote {
    mode?: string;
}

interface TransactionItemSystemView {
    quantity?: number;
    cost?: { value?: number };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns untyped record; we extend with strict fields
interface TransactionRequestContext extends Record<string, unknown> {
    buyer: WH40KBaseActor;
    hasSources: boolean;
    sources: Array<{ id: string | null; name: string; modeLabel: string; selected: boolean }>;
    selectedSource: Actor.Implementation | null;
    items: Array<{ id: string | null; name: string; img: string | null; type: string; quantity: number; cost: number; selected: boolean }>;
    selectedItem: WH40KItem | null;
    quantity: number;
    influenceBurn: number;
    quote: TransactionQuote | null;
    isBarter: boolean;
    isRequisition: boolean;
}

export default class TransactionRequestDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        id: 'transaction-request-dialog-{id}',
        classes: ['wh40k-rpg', 'transaction-request-dialog'],
        tag: 'form',
        window: {
            title: 'Barter',
            icon: 'fa-solid fa-handshake',
            resizable: true,
        },
        position: {
            width: 720,
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 position.height accepts 'auto' but typings list number
            height: 'auto' as unknown as number,
        },
        // eslint-disable-next-line no-restricted-syntax -- boundary: exactOptionalPropertyTypes: FormConfiguration optional booleans require explicit cast when mixed with handler type cast
        form: {
            // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/unbound-method -- ApplicationV2 form handler signature differs from shipped typings
            handler: TransactionRequestDialog.#onSubmit as unknown as ApplicationV2Config.FormConfiguration['handler'],
            submitOnChange: false,
            closeOnSubmit: false,
        } as ApplicationV2Config.FormConfiguration,
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            selectItem: TransactionRequestDialog.#selectItem,
            requestApproval: TransactionRequestDialog.#requestApproval,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/transaction-request-dialog.hbs',
        },
    };

    declare actor: WH40KBaseActor;
    declare sourceId: string | null;
    declare itemId: string | null;
    declare quantity: number;
    declare influenceBurn: number;
    #resolve: ((value: boolean | null) => void) | null = null;

    constructor(actor: WH40KBaseActor, options: ApplicationV2Config.DefaultOptions = {}) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 ctor accepts a partial options record; shipped typings narrower than runtime
        super(options as unknown as Record<string, unknown>);
        this.actor = actor;

        const sources = TransactionManager.listSourcesForBuyer(actor);
        const firstSource = sources[0];
        if (firstSource !== undefined) {
            this.sourceId = firstSource.id;
            const items = TransactionManager.listItemsForSource(firstSource);
            const firstItem = items[0];
            if (firstItem !== undefined) this.itemId = firstItem.id;
        }
    }

    get title(): string {
        return 'Barter';
    }

    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<TransactionRequestContext> {
        const context = (await super._prepareContext(options)) as TransactionRequestContext;
        const sources = TransactionManager.listSourcesForBuyer(this.actor);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive null fallback against array .find()/indexed access
        const selectedSource = sources.find((source) => source.id === this.sourceId) ?? sources[0] ?? null;

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- selectedSource may legitimately be null when sources empty
        if (selectedSource !== null && this.sourceId !== selectedSource.id) {
            this.sourceId = selectedSource.id;
        }

        const items = TransactionManager.listItemsForSource(selectedSource);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive null fallback against array .find()/indexed access
        const selectedItem = items.find((item) => item.id === this.itemId) ?? items[0] ?? null;

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- selectedItem may legitimately be null when items empty
        if (selectedItem !== null && this.itemId !== selectedItem.id) {
            this.itemId = selectedItem.id;
        }

        let quote: TransactionQuote | null = null;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- guards against null cases the type system narrows away after defensive fallbacks
        if (selectedSource !== null && selectedItem !== null && this.actor.id !== null && selectedSource.id !== null && selectedItem.id !== null) {
            try {
                quote = TransactionManager.prepareQuote({
                    buyerActorId: this.actor.id,
                    sourceActorId: selectedSource.id,
                    itemId: selectedItem.id,
                    quantity: this.quantity,
                    influenceBurn: this.influenceBurn,
                });
            } catch {
                quote = null;
            }
        }

        return {
            ...context,
            buyer: this.actor,
            hasSources: sources.length > 0,
            sources: sources.map((source) => ({
                id: source.id,
                name: source.name,
                modeLabel: TransactionManager.getSourceLabel(source),
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- selectedSource may be null
                selected: source.id === selectedSource?.id,
            })),
            selectedSource,
            items: items.map((item) => ({
                id: item.id,
                name: item.name,
                img: item.img ?? null,
                type: item.type,
                // eslint-disable-next-line no-restricted-syntax -- boundary: TransactionManager surfaces items as base Item.Implementation; system shape is system-specific
                quantity: (item.system as TransactionItemSystemView).quantity ?? 1,
                // eslint-disable-next-line no-restricted-syntax -- boundary: TransactionManager surfaces items as base Item.Implementation; system shape is system-specific
                cost: (item.system as TransactionItemSystemView).cost?.value ?? 0,
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- selectedItem may be null
                selected: item.id === selectedItem?.id,
            })),
            // eslint-disable-next-line no-restricted-syntax -- boundary: items returned by TransactionManager are Item.Implementation; refine to WH40KItem at the consumer
            selectedItem: selectedItem as unknown as WH40KItem | null,
            quantity: this.quantity,
            influenceBurn: this.influenceBurn,
            quote,
            isBarter: quote?.mode === 'barter',
            isRequisition: quote?.mode === 'requisition',
        };
    }

    override _onRender(context: TransactionRequestContext, options: ApplicationV2Config.RenderOptions): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- ApplicationV2 _onRender base may return Promise<void> | void
        super._onRender(context, options);

        const sourceSelect = this.element.querySelector('[name="sourceId"]');
        const quantityInput = this.element.querySelector('[name="quantity"]');
        const influenceInput = this.element.querySelector('[name="influenceBurn"]');

        if (sourceSelect instanceof HTMLSelectElement) {
            sourceSelect.addEventListener('change', () => {
                this.sourceId = sourceSelect.value;
                this.itemId = '';
                this.quantity = 1;
                this.influenceBurn = 0;
                void this.render(false);
            });
        }

        if (quantityInput instanceof HTMLInputElement) {
            quantityInput.addEventListener('change', () => {
                this.quantity = Math.max(1, Number.parseInt(quantityInput.value !== '' ? quantityInput.value : '1', 10) || 1);
                void this.render(false);
            });
        }

        if (influenceInput instanceof HTMLInputElement) {
            influenceInput.addEventListener('change', () => {
                this.influenceBurn = Math.max(0, Number.parseInt(influenceInput.value !== '' ? influenceInput.value : '0', 10) || 0);
                void this.render(false);
            });
        }
    }

    static #onSubmit(this: TransactionRequestDialog, _event: SubmitEvent, _form: HTMLFormElement, formData: FormDataExtended): void {
        const data = formData.object;
        const qty = (data['quantity'] as string | undefined) ?? '';
        const inf = (data['influenceBurn'] as string | undefined) ?? '';
        const src = (data['sourceId'] as string | undefined) ?? '';
        this.quantity = Math.max(1, Number.parseInt(qty !== '' ? qty : '1', 10) || 1);
        this.influenceBurn = Math.max(0, Number.parseInt(inf !== '' ? inf : '0', 10) || 0);
        this.sourceId = src !== '' ? src : this.sourceId;
    }

    static async #selectItem(this: TransactionRequestDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const itemId = target.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;

        this.itemId = itemId;
        this.quantity = 1;
        await this.render(false);
    }

    static async #requestApproval(this: TransactionRequestDialog, event: PointerEvent, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        try {
            if (this.sourceId === null || this.sourceId === '' || this.itemId === null || this.itemId === '' || this.actor.id === null) {
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
            await this.close({ _skipResolve: true });
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

    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 close accepts arbitrary options; we add a private _skipResolve marker
    override async close(options: Record<string, unknown> = {}): Promise<unknown> {
        if (this.#resolve !== null && options['_skipResolve'] !== true) {
            this.#resolve(null);
        }
        return super.close(options);
    }

    static async show(actor: WH40KBaseActor): Promise<boolean | null> {
        const dialog = new TransactionRequestDialog(actor);
        return dialog.wait();
    }
}
