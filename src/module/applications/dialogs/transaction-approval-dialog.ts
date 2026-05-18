import { t } from '../../i18n/t.ts';
import type { TransactionApprovalDecision, TransactionQuoteView } from '../../transactions/transaction-types.ts';

/**
 * @file TransactionApprovalDialog
 *
 * GM-facing approval step for a player→NPC transaction. Replaces the old
 * binary confirm: the GM can apply a numeric percentage modifier (negative for
 * a good haggle roll, positive for adverse conditions / scarcity) which is
 * threaded back into a re-priced quote before the transaction commits.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns untyped record; we extend with strict fields
interface ApprovalContext extends Record<string, unknown> {
    quote: TransactionQuoteView;
    modeLabel: string;
    summary: string;
    gmModifierPercent: number;
    estimatedFinal: number;
    adjustments: Array<{ label: string; value: number; positive: boolean }>;
    hasAdjustments: boolean;
}

export default class TransactionApprovalDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static override DEFAULT_OPTIONS = {
        id: 'transaction-approval-dialog-{id}',
        classes: ['wh40k-rpg', 'transaction-approval-dialog'],
        tag: 'form',
        window: {
            // Title is supplied by the `get title()` getter (localized at render).
            icon: 'fa-solid fa-handshake-angle',
            resizable: false,
        },
        position: {
            width: 460,
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 position.height accepts 'auto' but typings list number
            height: 'auto' as unknown as number,
        },
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            approve: TransactionApprovalDialog.#onApprove,
            reject: TransactionApprovalDialog.#onReject,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/transaction-approval-dialog.hbs',
        },
    };

    readonly #quote: TransactionQuoteView;
    #gmModifierPercent = 0;
    #resolve: ((value: TransactionApprovalDecision) => void) | null = null;
    #resolved = false;

    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 ctor accepts a partial options record
    constructor(quote: TransactionQuoteView, options: Record<string, unknown> = {}) {
        super(options);
        this.#quote = quote;
    }

    get title(): string {
        return t('WH40K.Trade.Approval.Title');
    }

    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<ApprovalContext> {
        const context = (await super._prepareContext(options)) as ApprovalContext;
        const quote = this.#quote;

        // GM modifier is applied on the subtotal in TransactionManager; finalCost
        // is the subtotal clamped at 0, so this is a faithful GM-side estimate.
        const estimatedFinal = Math.max(0, quote.finalCost + Math.round((quote.finalCost * this.#gmModifierPercent) / 100));

        return {
            ...context,
            quote,
            modeLabel: quote.mode === 'barter' ? t('WH40K.Trade.Approval.ModeBarter') : t('WH40K.Trade.Approval.ModeRequisition'),
            summary: t('WH40K.Trade.Approval.Summary', {
                buyer: quote.buyerName,
                quantity: quote.quantity,
                item: quote.itemName,
                source: quote.sourceName,
            }),
            gmModifierPercent: this.#gmModifierPercent,
            estimatedFinal,
            adjustments: quote.adjustments.map((adjustment) => ({
                label: adjustment.label,
                value: adjustment.value,
                positive: adjustment.value >= 0,
            })),
            hasAdjustments: quote.adjustments.length > 0,
        };
    }

    override _onRender(context: ApprovalContext, options: ApplicationV2Config.RenderOptions): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- ApplicationV2 _onRender base may return Promise<void> | void
        super._onRender(context, options);

        const input = this.element.querySelector('[name="gmModifierPercent"]');
        if (input instanceof HTMLInputElement) {
            input.addEventListener('change', () => {
                this.#gmModifierPercent = Number.parseInt(input.value !== '' ? input.value : '0', 10) || 0;
                void this.render(false);
            });
        }
    }

    static async #onApprove(this: TransactionApprovalDialog, event: PointerEvent): Promise<void> {
        event.preventDefault();
        const input = this.element.querySelector('[name="gmModifierPercent"]');
        if (input instanceof HTMLInputElement) {
            this.#gmModifierPercent = Number.parseInt(input.value !== '' ? input.value : '0', 10) || 0;
        }
        this.#resolved = true;
        this.#resolve?.({ approved: true, gmModifierPercent: this.#gmModifierPercent });
        await this.close();
    }

    static async #onReject(this: TransactionApprovalDialog, event: PointerEvent): Promise<void> {
        event.preventDefault();
        this.#resolved = true;
        this.#resolve?.({ approved: false, gmModifierPercent: 0 });
        await this.close();
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 close accepts/returns an arbitrary options record per shipped typings
    override async close(options: Record<string, unknown> = {}): Promise<unknown> {
        if (!this.#resolved && this.#resolve !== null) {
            this.#resolve({ approved: false, gmModifierPercent: 0 });
        }
        return super.close(options);
    }

    async wait(): Promise<TransactionApprovalDecision> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    static async show(quote: TransactionQuoteView): Promise<TransactionApprovalDecision> {
        const dialog = new TransactionApprovalDialog(quote);
        return dialog.wait();
    }
}
