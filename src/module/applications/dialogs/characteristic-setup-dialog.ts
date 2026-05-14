/**
 * @file CharacteristicSetupDialog - Interactive dialog for setting up characteristic rolls
 * Provides drag-and-drop interface for assigning dice rolls to characteristics during character creation.
 *
 * Usage:
 *   await CharacteristicSetupDialog.open(actor);
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const GENERATION_CHARACTERISTICS = [
    'weaponSkill',
    'ballisticSkill',
    'strength',
    'toughness',
    'agility',
    'intelligence',
    'perception',
    'willpower',
    'fellowship',
] as const;

type CharacteristicKey = (typeof GENERATION_CHARACTERISTICS)[number];

const DEFAULT_BASE = 25;

interface DragData {
    type: 'assigned' | 'bank';
    index: number;
    characteristic: CharacteristicKey | null;
}

interface CharacterGenerationData {
    rolls?: number[];
    assignments?: Partial<Record<CharacteristicKey, number | null>>;
    customBases?: Partial<Record<CharacteristicKey, number>> & { enabled?: boolean };
}

interface CharacteristicView {
    label?: string;
    short?: string;
}

export default class CharacteristicSetupDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'characteristic-setup-{id}',
        classes: ['wh40k-rpg', 'characteristic-setup-dialog'],
        tag: 'div',
        window: {
            // eslint-disable-next-line no-restricted-syntax -- i18n: WH40K localization key resolved at runtime; rule fires on any literal in this position
            title: 'WH40K.CharacteristicSetup.Title',
            icon: 'fa-solid fa-dice-d20',
            minimizable: false,
            resizable: false,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 700,
            height: 'auto' as const,
        },
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            apply: CharacteristicSetupDialog.#onApply,
            reset: CharacteristicSetupDialog.#onReset,
            toggleAdvanced: CharacteristicSetupDialog.#onToggleAdvanced,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 DEFAULT_OPTIONS shape combines DefaultOptions + actions; cast at definition
    } as unknown as ApplicationV2Config.DefaultOptions;

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/dialogs/characteristic-setup.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    readonly #actor: WH40KBaseActor;
    #rolls: number[] = [];
    #assignments: Partial<Record<CharacteristicKey, number | null>> = {};
    #customBases: Partial<Record<CharacteristicKey, number>> = {};
    #advancedMode = false;
    #resolve: ((value: boolean) => void) | null = null;
    #applied = false;
    #dragData: DragData | null = null;

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    constructor(actor: WH40KBaseActor, options: ApplicationV2Config.DefaultOptions = {}) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 ctor accepts arbitrary options record
        super(options as Record<string, unknown>);
        this.#actor = actor;
        this.#initializeState();
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        return game.i18n.localize('WH40K.CharacteristicSetup.Title');
    }

    /* -------------------------------------------- */

    #initializeState(): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system.characterGeneration is a system-specific extension
        const genData: CharacterGenerationData = (this.#actor.system as { characterGeneration?: CharacterGenerationData }).characterGeneration ?? {};

        this.#rolls = Array.isArray(genData.rolls) && genData.rolls.length === 9 ? [...genData.rolls] : (Array(9).fill(0) as number[]);

        this.#assignments = {};
        for (const key of GENERATION_CHARACTERISTICS) {
            this.#assignments[key] = genData.assignments?.[key] ?? null;
        }

        this.#customBases = {};
        for (const key of GENERATION_CHARACTERISTICS) {
            this.#customBases[key] = genData.customBases?.[key] ?? DEFAULT_BASE;
        }

        this.#advancedMode = genData.customBases?.enabled ?? false;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns untyped record
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        if (!Array.isArray(this.#rolls) || this.#rolls.length !== 9) {
            this.#rolls = Array(9).fill(0) as number[];
        }

        const rollsBank = this.#rolls.map((value, index) => ({
            index,
            displayIndex: index + 1,
            value: value,
            isEmpty: value === 0,
            isAssigned: this.#isRollAssigned(index),
        }));

        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system.characteristics shape varies by gameSystem
        const allChars = (this.#actor.system as { characteristics?: Record<string, CharacteristicView> }).characteristics ?? {};
        const characteristics = GENERATION_CHARACTERISTICS.map((key) => {
            const charData: CharacteristicView = allChars[key] ?? {};
            const assignedIndex = this.#assignments[key] ?? null;
            const assignedRoll = assignedIndex !== null ? this.#rolls[assignedIndex] ?? 0 : 0;
            const rollValue = assignedRoll > 0 ? assignedRoll : null;
            const base = this.#advancedMode ? this.#customBases[key] ?? DEFAULT_BASE : DEFAULT_BASE;
            const total = rollValue !== null ? base + rollValue : null;

            return {
                key,
                label: charData.label !== undefined && charData.label !== '' ? charData.label : key,
                short: charData.short !== undefined && charData.short !== '' ? charData.short : key.substring(0, 2).toUpperCase(),
                base,
                rollValue,
                assignedIndex,
                total,
                hasRoll: rollValue !== null,
            };
        });

        const characteristicRows = [];
        for (let i = 0; i < characteristics.length; i += 3) {
            characteristicRows.push(characteristics.slice(i, i + 3));
        }

        const preview = characteristics.map((c) => ({
            short: c.short,
            total: c.total,
            hasValue: c.total !== null,
        }));

        const allAssigned = characteristics.every((c) => c.hasRoll);
        const anyRolls = this.#rolls.some((r) => r > 0);

        return {
            ...context,
            rollsBank,
            characteristicRows,
            characteristics,
            preview,
            advancedMode: this.#advancedMode,
            allAssigned,
            anyRolls,
            canApply: allAssigned && anyRolls,
        };
    }

    /* -------------------------------------------- */

    #isRollAssigned(index: number): boolean {
        return Object.values(this.#assignments).includes(index);
    }

    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender accepts untyped context record
    override _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- ApplicationV2 _onRender base may return Promise<void> | void
        super._onRender(context, options);
        this.#activateListeners();
    }

    /* -------------------------------------------- */

    #activateListeners(): void {
        const html = this.element;

        html.querySelectorAll('.csd-roll-chip').forEach((chip) => {
            chip.addEventListener('click', (e) => this.#onRollChipClick(e));
            chip.addEventListener('dragstart', (e) => this.#onDragStart(e as DragEvent));
            chip.addEventListener('dragend', (e) => this.#onDragEnd(e as DragEvent));
        });

        html.querySelectorAll('.csd-char-slot').forEach((slot) => {
            slot.addEventListener('dragover', (e) => this.#onDragOver(e as DragEvent));
            slot.addEventListener('dragleave', (e) => this.#onDragLeave(e as DragEvent));
            slot.addEventListener('drop', (e) => this.#onDrop(e as DragEvent));
            const rollChip = slot.querySelector('.csd-assigned-roll');
            if (rollChip) {
                rollChip.addEventListener('dragstart', (e) => this.#onDragStart(e as DragEvent));
                rollChip.addEventListener('dragend', (e) => this.#onDragEnd(e as DragEvent));
            }
        });

        const rollsBank = html.querySelector('.csd-rolls-bank');
        if (rollsBank) {
            rollsBank.addEventListener('dragover', (e) => this.#onBankDragOver(e as DragEvent));
            rollsBank.addEventListener('dragleave', (e) => this.#onDragLeave(e as DragEvent));
            rollsBank.addEventListener('drop', (e) => this.#onBankDrop(e as DragEvent));
        }

        html.querySelectorAll('.csd-base-input').forEach((input) => {
            input.addEventListener('change', (e) => this.#onBaseValueChange(e));
        });
    }

    /* -------------------------------------------- */

    #onRollChipClick(event: Event): void {
        const chip = event.currentTarget as HTMLElement;
        const index = parseInt(chip.dataset['rollIndex'] ?? '0', 10);

        if (chip.querySelector('.csd-roll-input') !== null) return;

        const currentValue = this.#rolls[index] !== 0 ? this.#rolls[index] ?? '' : '';
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'csd-roll-input';
        input.min = '2';
        input.max = '40';
        input.value = currentValue.toString();
        input.placeholder = '2-40';
        input.dataset['rollIndex'] = index.toString();

        input.addEventListener('blur', (e) => this.#onRollInputBlur(e));
        input.addEventListener('keydown', (e) => this.#onRollInputKeydown(e));

        const valueEl = chip.querySelector<HTMLElement>('.csd-roll-value');
        if (valueEl) valueEl.style.display = 'none';
        chip.appendChild(input);
        input.focus();
        input.select();
    }

    /* -------------------------------------------- */

    #onRollInputBlur(event: Event): void {
        const input = event.currentTarget as HTMLInputElement;
        this.#saveRollInput(input);
    }

    /* -------------------------------------------- */

    #onRollInputKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.#saveRollInput(event.currentTarget as HTMLInputElement);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            void this.render();
        }
    }

    /* -------------------------------------------- */

    #saveRollInput(input: HTMLInputElement): void {
        const index = parseInt(input.dataset['rollIndex'] ?? '0', 10);
        let value = parseInt(input.value, 10);

        if (Number.isNaN(value) || value < 2) value = 0;
        if (value > 40) value = 40;

        this.#rolls[index] = value;
        void this.render();
    }

    /* -------------------------------------------- */

    #onDragStart(event: DragEvent): void {
        const target = event.currentTarget as HTMLElement;
        const rollIndex = parseInt(target.dataset['rollIndex'] ?? '0', 10);
        const fromCharacteristic = (target.dataset['characteristic'] ?? null) as CharacteristicKey | null;

        if (this.#rolls[rollIndex] === 0) {
            event.preventDefault();
            return;
        }

        this.#dragData = {
            type: fromCharacteristic !== null ? 'assigned' : 'bank',
            index: rollIndex,
            characteristic: fromCharacteristic,
        };

        target.classList.add('dragging');
        if (event.dataTransfer === null) return;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', JSON.stringify(this.#dragData));

        this.element.classList.add('drag-active');
        this.element.querySelectorAll<HTMLElement>('.csd-char-slot:not(.has-roll)').forEach((slot) => {
            slot.classList.add('tw-animate-csd-pulse-border');
        });
    }

    /* -------------------------------------------- */

    #onDragEnd(event: DragEvent): void {
        (event.currentTarget as HTMLElement).classList.remove('dragging');
        this.element.classList.remove('drag-active');
        this.element.querySelectorAll('.csd-char-slot').forEach((slot) => {
            slot.classList.remove('tw-animate-csd-pulse-border');
        });
        this.element.querySelectorAll('.drop-valid, .drop-hover').forEach((el) => {
            el.classList.remove('drop-valid', 'drop-hover');
        });
        this.#dragData = null;
    }

    /* -------------------------------------------- */

    #onDragOver(event: DragEvent): void {
        if (this.#dragData === null) return;
        event.preventDefault();
        if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';

        const slot = event.currentTarget as HTMLElement;
        slot.classList.add('drop-valid', 'drop-hover');
    }

    /* -------------------------------------------- */

    #onDragLeave(event: DragEvent): void {
        (event.currentTarget as HTMLElement).classList.remove('drop-hover');
    }

    /* -------------------------------------------- */

    #onDrop(event: DragEvent): void {
        event.preventDefault();
        if (this.#dragData === null) return;

        const slot = event.currentTarget as HTMLElement;
        const targetChar = slot.dataset['characteristic'] as CharacteristicKey;
        const draggedIndex = this.#dragData.index;
        const sourceChar = this.#dragData.characteristic;

        const currentTargetIndex = this.#assignments[targetChar] ?? null;

        if (sourceChar !== null) {
            this.#assignments[sourceChar] = currentTargetIndex;
        }

        this.#assignments[targetChar] = draggedIndex;

        slot.classList.add('snap-to-slot');
        setTimeout(() => slot.classList.remove('snap-to-slot'), 600);

        void this.render();
    }

    /* -------------------------------------------- */

    #onBankDragOver(event: DragEvent): void {
        if (this.#dragData === null || this.#dragData.type !== 'assigned') return;
        event.preventDefault();
        if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
        (event.currentTarget as HTMLElement).classList.add('drop-valid', 'drop-hover');
    }

    /* -------------------------------------------- */

    #onBankDrop(event: DragEvent): void {
        event.preventDefault();
        if (this.#dragData === null || this.#dragData.characteristic === null) return;

        this.#assignments[this.#dragData.characteristic] = null;
        void this.render();
    }

    /* -------------------------------------------- */

    #onBaseValueChange(event: Event): void {
        const input = event.currentTarget as HTMLInputElement;
        const key = input.dataset['characteristic'] as CharacteristicKey;
        let value = parseInt(input.value, 10);

        if (Number.isNaN(value) || value < 0) value = 0;
        this.#customBases[key] = value;
        void this.render();
    }

    /* -------------------------------------------- */

    static async #onApply(this: CharacteristicSetupDialog, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        const allAssigned = GENERATION_CHARACTERISTICS.every((key) => {
            const index = this.#assignments[key];
            return index !== null && index !== undefined && (this.#rolls[index] ?? 0) > 0;
        });

        if (!allAssigned) {
            ui.notifications.warn(game.i18n.localize('WH40K.CharacteristicSetup.NotAllAssigned'));
            return;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() accepts arbitrary path-keyed payloads
        const updateData: Record<string, unknown> = {
            'system.characterGeneration.rolls': this.#rolls,
            'system.characterGeneration.assignments': this.#assignments,
            'system.characterGeneration.customBases.enabled': this.#advancedMode,
        };

        for (const key of GENERATION_CHARACTERISTICS) {
            updateData[`system.characterGeneration.customBases.${key}`] = this.#customBases[key] ?? DEFAULT_BASE;
        }

        for (const key of GENERATION_CHARACTERISTICS) {
            const rollIndex = this.#assignments[key];
            if (rollIndex === null || rollIndex === undefined) continue;
            const rollValue = this.#rolls[rollIndex] ?? 0;
            const base = this.#advancedMode ? this.#customBases[key] ?? DEFAULT_BASE : DEFAULT_BASE;
            const total = base + rollValue;
            updateData[`system.characteristics.${key}.base`] = total;
        }

        await this.#actor.update(updateData);

        this.#applied = true;
        this.#resolve?.(true);

        ui.notifications.info(game.i18n.localize('WH40K.CharacteristicSetup.Applied'));
        await this.close();
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- ApplicationV2 action handlers are awaited by the framework regardless of body
    static async #onReset(this: CharacteristicSetupDialog, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        for (const key of GENERATION_CHARACTERISTICS) {
            this.#assignments[key] = null;
        }
        void this.render();
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- ApplicationV2 action handlers are awaited by the framework regardless of body
    static async #onToggleAdvanced(this: CharacteristicSetupDialog, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        this.#advancedMode = !this.#advancedMode;
        void this.render();
    }

    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 close accepts arbitrary options record
    override async close(options: Record<string, unknown> = {}): Promise<unknown> {
        if (!this.#applied && this.#resolve !== null) {
            this.#resolve(false);
        }
        return super.close(options);
    }

    /* -------------------------------------------- */

    async wait(): Promise<boolean> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render({ force: true });
        });
    }

    static async open(actor: WH40KBaseActor): Promise<boolean> {
        const t = actor.type as string;
        if (t !== 'acolyte' && t !== 'character') {
            // eslint-disable-next-line no-restricted-syntax -- TODO: needs WH40K.CharacteristicSetup.OnlyForCharacters localization key
            ui.notifications.error('Characteristic setup is only available for characters.');
            return false;
        }
        const dialog = new this(actor);
        return dialog.wait();
    }
}
