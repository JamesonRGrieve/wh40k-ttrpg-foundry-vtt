import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { TransactionManager } from '../../transactions/transaction-manager.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface TransactionRequestContext extends Record<string, unknown> {
    buyer: WH40KBaseActor;
    hasSources: boolean;
    sources: Array<{ id: string; name: string; modeLabel: string; selected: boolean }>;
    selectedSource: Actor | null;
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
        classes: ['wh40k-rpg', 'transaction-request-dialog'],
        tag: 'form',
        window: {
            title: 'Barter',
            icon: 'fa-solid fa-handshake',
            resizable: true,
            contentClasses: ['standard-form'],
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
            this.sourceId = sources[0].id;
            const items = TransactionManager.listItemsForSource(sources[0]);
            if (items.length) this.itemId = items[0].id;
        }
    }

    get title(): string {
        return 'Barter';
    }

    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<TransactionRequestContext> {
        const context = (await super._prepareContext(options)) as TransactionRequestContext;
        const sources = TransactionManager.listSourcesForBuyer(this.actor);
        const selectedSource = sources.find((source) => source.id === this.sourceId) ?? sources[0] ?? null;

        if (selectedSource && this.sourceId !== selectedSource.id) {
            this.sourceId = selectedSource.id;
        }

        const items = TransactionManager.listItemsForSource(selectedSource);
        const selectedItem = items.find((item) => item.id === this.itemId) ?? items[0] ?? null;

        if (selectedItem && this.itemId !== selectedItem.id) {
            this.itemId = selectedItem.id;
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

        return {
            ...context,
            buyer: this.actor,
            hasSources: sources.length > 0,
            sources: sources.map((source) => ({
                id: source.id,
                name: source.name,
                modeLabel: TransactionManager.getSourceLabel(source),
                selected: source.id === selectedSource?.id,
            })),
            selectedSource,
            items: items.map((item) => ({
                id: item.id,
                name: item.name,
                img: item.img ?? null,
                type: item.type,
                quantity: (item.system as any)?.quantity ?? 1,
                cost: (item.system as any)?.cost?.value ?? 0,
                selected: item.id === selectedItem?.id,
            })),
            selectedItem,
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
            this.sourceId = sourceSelect.value;
            this.itemId = '';
            this.quantity = 1;
            this.influenceBurn = 0;
            void this.render(false);
        });

        quantityInput?.addEventListener('change', () => {
            this.quantity = Math.max(1, Number.parseInt(quantityInput.value || '1', 10) || 1);
            void this.render(false);
        });

        influenceInput?.addEventListener('change', () => {
            this.influenceBurn = Math.max(0, Number.parseInt(influenceInput.value || '0', 10) || 0);
            void this.render(false);
        });
    }

    static #onSubmit(this: TransactionRequestDialog, event: SubmitEvent, form: HTMLFormElement, formData: FormDataExtended): void {
        const data = formData.object;
        this.quantity = Math.max(1, Number.parseInt((data.quantity as string) || '1', 10) || 1);
        this.influenceBurn = Math.max(0, Number.parseInt((data.influenceBurn as string) || '0', 10) || 0);
        this.sourceId = (data.sourceId as string) || this.sourceId;
    }

    static async #selectItem(this: TransactionRequestDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const itemId = target.dataset.itemId;
        if (!itemId) return;

        this.itemId = itemId;
        this.quantity = 1;
        await this.render(false);
    }

    static async #requestApproval(this: TransactionRequestDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();

        try {
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
