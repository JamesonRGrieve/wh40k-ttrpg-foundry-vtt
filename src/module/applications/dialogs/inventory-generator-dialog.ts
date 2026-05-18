import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { t } from '../../i18n/t.ts';
import { type InventoryCandidate, collectProfiles, generateInventory, seededRng } from '../../inventory/inventory-generator.ts';
import { InventoryGeneratorManager } from '../../managers/inventory-generator-manager.ts';

/**
 * @file InventoryGeneratorDialog
 *
 * GM popup for stocking an NPC / vendor / inquisitorial armoury from the
 * compendium. Two tabs share one staging list:
 *
 *  - **Generate** — pick a profile (a homebrew tag discovered from the packs)
 *    + a count, and weighted-random-draw a preview. Reroll until happy.
 *  - **Browse** — search the full scoped pool and hand-pick items.
 *
 * "Apply" instantiates the staged items onto the actor. Entirely
 * compendium-driven and stateless: every candidate, every profile, and every
 * mechanic value is read from the packs at open time — nothing about the
 * content lives in this class (Direction #7).
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

type GeneratorTab = 'generate' | 'browse';

const BROWSE_RESULT_CAP = 200;

interface StagedRow {
    uuid: string;
    name: string;
    type: string;
    img: string;
    availability: string;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns an untyped record; we extend it with strict fields
interface GeneratorContext extends Record<string, unknown> {
    gameSystem: string;
    actorName: string;
    activeTab: GeneratorTab;
    onGenerateTab: boolean;
    onBrowseTab: boolean;
    profile: string;
    profiles: string[];
    count: number;
    browseSearch: string;
    browseRows: StagedRow[];
    browseTruncated: boolean;
    staged: StagedRow[];
    stagedCount: number;
    poolEmpty: boolean;
}

export default class InventoryGeneratorDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static override DEFAULT_OPTIONS = {
        id: 'inventory-generator-{id}',
        classes: ['wh40k-rpg', 'inventory-generator-dialog'],
        tag: 'form',
        window: {
            // Title is supplied by the localized `get title()` getter.
            icon: 'fa-solid fa-boxes-stacked',
            resizable: true,
        },
        position: { width: 720, height: 680 },
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            switchTab: InventoryGeneratorDialog.#onSwitchTab,
            generate: InventoryGeneratorDialog.#onGenerate,
            reroll: InventoryGeneratorDialog.#onReroll,
            stage: InventoryGeneratorDialog.#onStage,
            unstage: InventoryGeneratorDialog.#onUnstage,
            clearStaged: InventoryGeneratorDialog.#onClearStaged,
            apply: InventoryGeneratorDialog.#onApply,
            cancel: InventoryGeneratorDialog.#onCancel,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    static PARTS = {
        form: { template: 'systems/wh40k-rpg/templates/dialogs/inventory-generator-dialog.hbs' },
    };

    readonly #actor: WH40KBaseActor;
    readonly #gameSystem: string;
    #candidates: InventoryCandidate[] = [];
    #loaded = false;
    #activeTab: GeneratorTab = 'generate';
    #profile = '';
    #count = 6;
    #seed = Math.floor(Math.random() * 0x7fffffff) >>> 0 || 1;
    #browseSearch = '';
    readonly #staged = new Map<string, InventoryCandidate>();
    #resolve: ((value: number | null) => void) | null = null;
    #resolved = false;

    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 ctor accepts a partial options record
    constructor(actor: WH40KBaseActor, options: Record<string, unknown> = {}) {
        super(options);
        this.#actor = actor;
        this.#gameSystem = (actor.system as { gameSystem?: string } | undefined)?.gameSystem ?? '';
    }

    get title(): string {
        return t('WH40K.InventoryGenerator.Title', { actor: this.#actor.name });
    }

    #toRow(candidate: InventoryCandidate): StagedRow {
        return { uuid: candidate.uuid, name: candidate.name, type: candidate.type, img: candidate.img, availability: candidate.availability };
    }

    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<GeneratorContext> {
        const context = (await super._prepareContext(options)) as GeneratorContext;

        if (!this.#loaded) {
            this.#candidates = await InventoryGeneratorManager.collectCandidates(this.#gameSystem);
            this.#loaded = true;
        }

        const search = this.#browseSearch.trim().toLowerCase();
        const matches =
            search.length === 0
                ? this.#candidates
                : this.#candidates.filter((c) => c.name.toLowerCase().includes(search) || c.type.toLowerCase().includes(search));

        return {
            ...context,
            gameSystem: this.#gameSystem,
            actorName: this.#actor.name,
            activeTab: this.#activeTab,
            onGenerateTab: this.#activeTab === 'generate',
            onBrowseTab: this.#activeTab === 'browse',
            profile: this.#profile,
            profiles: collectProfiles(this.#candidates),
            count: this.#count,
            browseSearch: this.#browseSearch,
            browseRows: matches.slice(0, BROWSE_RESULT_CAP).map((c) => this.#toRow(c)),
            browseTruncated: matches.length > BROWSE_RESULT_CAP,
            staged: [...this.#staged.values()].map((c) => this.#toRow(c)),
            stagedCount: this.#staged.size,
            poolEmpty: this.#candidates.length === 0,
        };
    }

    override _onRender(context: GeneratorContext, options: ApplicationV2Config.RenderOptions): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- ApplicationV2 _onRender base may return Promise<void> | void
        super._onRender(context, options);

        const searchInput = this.element.querySelector('[name="browseSearch"]');
        if (searchInput instanceof HTMLInputElement) {
            searchInput.addEventListener('change', () => {
                this.#browseSearch = searchInput.value;
                void this.render(false);
            });
        }
    }

    /** Snapshot the Generate-tab inputs into instance state before a redraw. */
    #syncGenerateInputs(): void {
        const profileEl = this.element.querySelector('[name="profile"]');
        if (profileEl instanceof HTMLSelectElement) this.#profile = profileEl.value;
        const countEl = this.element.querySelector('[name="count"]');
        if (countEl instanceof HTMLInputElement) {
            const parsed = Number.parseInt(countEl.value !== '' ? countEl.value : '0', 10);
            if (Number.isFinite(parsed) && parsed > 0) this.#count = parsed;
        }
    }

    #regenerate(): void {
        const drawn = generateInventory(this.#candidates, {
            profile: this.#profile.length > 0 ? this.#profile : null,
            count: this.#count,
            rng: seededRng(this.#seed),
        });
        this.#staged.clear();
        for (const candidate of drawn) this.#staged.set(candidate.uuid, candidate);
    }

    static async #onSwitchTab(this: InventoryGeneratorDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const tab = target.dataset['tab'];
        if (tab === 'generate' || tab === 'browse') {
            if (this.#activeTab === 'generate') this.#syncGenerateInputs();
            this.#activeTab = tab;
            await this.render(false);
        }
    }

    static async #onGenerate(this: InventoryGeneratorDialog, event: Event): Promise<void> {
        event.preventDefault();
        this.#syncGenerateInputs();
        this.#regenerate();
        await this.render(false);
    }

    static async #onReroll(this: InventoryGeneratorDialog, event: Event): Promise<void> {
        event.preventDefault();
        this.#syncGenerateInputs();
        this.#seed = Math.floor(Math.random() * 0x7fffffff) >>> 0 || 1;
        this.#regenerate();
        await this.render(false);
    }

    static async #onStage(this: InventoryGeneratorDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const uuid = target.dataset['uuid'];
        if (uuid === undefined || uuid === '') return;
        const candidate = this.#candidates.find((c) => c.uuid === uuid);
        if (candidate !== undefined) this.#staged.set(uuid, candidate);
        await this.render(false);
    }

    static async #onUnstage(this: InventoryGeneratorDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const uuid = target.dataset['uuid'];
        if (uuid !== undefined && uuid !== '') this.#staged.delete(uuid);
        await this.render(false);
    }

    static async #onClearStaged(this: InventoryGeneratorDialog, event: Event): Promise<void> {
        event.preventDefault();
        this.#staged.clear();
        await this.render(false);
    }

    static async #onApply(this: InventoryGeneratorDialog, event: Event): Promise<void> {
        event.preventDefault();
        if (this.#staged.size === 0) {
            ui.notifications.warn(t('WH40K.InventoryGenerator.NothingStaged'));
            return;
        }
        const applied = await InventoryGeneratorManager.applyToActor(this.#actor, [...this.#staged.keys()]);
        this.#resolved = true;
        this.#resolve?.(applied);
        await this.close();
    }

    static async #onCancel(this: InventoryGeneratorDialog, event: Event): Promise<void> {
        event.preventDefault();
        this.#resolved = true;
        this.#resolve?.(null);
        await this.close();
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 close accepts/returns an arbitrary options record per shipped typings
    override async close(options: Record<string, unknown> = {}): Promise<unknown> {
        if (!this.#resolved && this.#resolve !== null) this.#resolve(null);
        return super.close(options);
    }

    async wait(): Promise<number | null> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    static async show(actor: WH40KBaseActor): Promise<number | null> {
        return new InventoryGeneratorDialog(actor).wait();
    }
}
