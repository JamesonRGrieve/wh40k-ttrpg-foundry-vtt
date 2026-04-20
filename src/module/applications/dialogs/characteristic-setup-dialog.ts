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

type CharacteristicKey = typeof GENERATION_CHARACTERISTICS[number];

const DEFAULT_BASE = 25;

interface DragData {
    type: 'assigned' | 'bank';
    index: number;
    characteristic: CharacteristicKey | null;
}

export default class CharacteristicSetupDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'characteristic-setup-{id}',
        classes: ['wh40k-rpg', 'characteristic-setup-dialog'],
        tag: 'div',
        window: {
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
        actions: {
            apply: CharacteristicSetupDialog.#onApply,
            reset: CharacteristicSetupDialog.#onReset,
            toggleAdvanced: CharacteristicSetupDialog.#onToggleAdvanced,
        },
    };

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

    #actor: WH40KBaseActor;
    #rolls: number[] = [];
    #assignments: Partial<Record<CharacteristicKey, number>> = {};
    #customBases: Partial<Record<CharacteristicKey, number>> = {};
    #advancedMode = false;
    #resolve: ((value: boolean) => void) | null = null;
    #applied = false;
    #dragData: DragData | null = null;

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    constructor(actor: WH40KBaseActor, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.#actor = actor;
        this.#initializeState();
    }

    /* -------------------------------------------- */

    /** @override */
    get title() {
        return game.i18n.localize('WH40K.CharacteristicSetup.Title');
    }

    /* -------------------------------------------- */

    #initializeState(): void {
        const genData = (this.#actor.system as any)?.characterGeneration || {};

        this.#rolls = Array.isArray(genData.rolls) && genData.rolls.length === 9 ? [...genData.rolls] : Array(9).fill(0);

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
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        if (!Array.isArray(this.#rolls) || this.#rolls.length !== 9) {
            this.#rolls = Array(9).fill(0);
        }

        const rollsBank = this.#rolls.map((value, index) => ({
            index,
            displayIndex: index + 1,
            value: value || 0,
            isEmpty: !value || value === 0,
            isAssigned: this.#isRollAssigned(index),
        }));

        const characteristics = GENERATION_CHARACTERISTICS.map((key) => {
            const charData = (this.#actor.system.characteristics as any)?.[key] || {};
            const assignedIndex = this.#assignments[key] ?? null;
            const rollValue = assignedIndex !== null && this.#rolls[assignedIndex] ? this.#rolls[assignedIndex] : null;
            const base = this.#advancedMode ? this.#customBases[key] ?? DEFAULT_BASE : DEFAULT_BASE;
            const total = rollValue !== null ? base + rollValue : null;

            return {
                key,
                label: charData.label || key,
                short: charData.short || key.substring(0, 2).toUpperCase(),
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
    _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void {
        super._onRender(context, options);
        this.#activateListeners();
    }

    /* -------------------------------------------- */

    #activateListeners(): void {
        const html = this.element;

        html.querySelectorAll('.csd-roll-chip').forEach((chip) => {
            chip.addEventListener('click', this.#onRollChipClick.bind(this) as EventListener);
            chip.addEventListener('dragstart', this.#onDragStart.bind(this) as EventListener);
            chip.addEventListener('dragend', this.#onDragEnd.bind(this) as EventListener);
        });

        html.querySelectorAll('.csd-char-slot').forEach((slot) => {
            slot.addEventListener('dragover', this.#onDragOver.bind(this) as EventListener);
            slot.addEventListener('dragleave', this.#onDragLeave.bind(this) as EventListener);
            slot.addEventListener('drop', this.#onDrop.bind(this) as EventListener);
            const rollChip = slot.querySelector('.csd-assigned-roll');
            if (rollChip) {
                rollChip.addEventListener('dragstart', this.#onDragStart.bind(this) as EventListener);
                rollChip.addEventListener('dragend', this.#onDragEnd.bind(this) as EventListener);
            }
        });

        const rollsBank = html.querySelector('.csd-rolls-bank');
        if (rollsBank) {
            rollsBank.addEventListener('dragover', this.#onBankDragOver.bind(this) as EventListener);
            rollsBank.addEventListener('dragleave', this.#onDragLeave.bind(this) as EventListener);
            rollsBank.addEventListener('drop', this.#onBankDrop.bind(this) as EventListener);
        }

        html.querySelectorAll('.csd-base-input').forEach((input) => {
            input.addEventListener('change', this.#onBaseValueChange.bind(this) as EventListener);
        });
    }

    /* -------------------------------------------- */

    #onRollChipClick(event: Event): void {
        const chip = event.currentTarget as HTMLElement;
        const index = parseInt(chip.dataset.rollIndex ?? '0', 10);

        if (chip.querySelector('.csd-roll-input')) return;

        const currentValue = this.#rolls[index] || '';
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'csd-roll-input';
        input.min = '2';
        input.max = '40';
        input.value = currentValue.toString();
        input.placeholder = '2-40';
        input.dataset.rollIndex = index.toString();

        input.addEventListener('blur', this.#onRollInputBlur.bind(this));
        input.addEventListener('keydown', this.#onRollInputKeydown.bind(this) as EventListener);

        const valueEl = chip.querySelector('.csd-roll-value') as HTMLElement | null;
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
            this.render();
        }
    }

    /* -------------------------------------------- */

    #saveRollInput(input: HTMLInputElement): void {
        const index = parseInt(input.dataset.rollIndex ?? '0', 10);
        let value = parseInt(input.value, 10);

        if (isNaN(value) || value < 2) value = 0;
        if (value > 40) value = 40;

        this.#rolls[index] = value;
        void this.render();
    }

    /* -------------------------------------------- */

    #onDragStart(event: DragEvent): void {
        const target = event.currentTarget as HTMLElement;
        const rollIndex = parseInt(target.dataset.rollIndex ?? '0', 10);
        const fromCharacteristic = (target.dataset.characteristic ?? null) as CharacteristicKey | null;

        if (this.#rolls[rollIndex] === 0) {
            event.preventDefault();
            return;
        }

        this.#dragData = {
            type: fromCharacteristic ? 'assigned' : 'bank',
            index: rollIndex,
            characteristic: fromCharacteristic,
        };

        target.classList.add('dragging');
        event.dataTransfer!.effectAllowed = 'move';
        event.dataTransfer!.setData('text/plain', JSON.stringify(this.#dragData));

        this.element.classList.add('drag-active');
    }

    /* -------------------------------------------- */

    #onDragEnd(event: DragEvent): void {
        (event.currentTarget as HTMLElement).classList.remove('dragging');
        this.element.classList.remove('drag-active');
        this.element.querySelectorAll('.drop-valid, .drop-hover').forEach((el) => {
            el.classList.remove('drop-valid', 'drop-hover');
        });
        this.#dragData = null;
    }

    /* -------------------------------------------- */

    #onDragOver(event: DragEvent): void {
        if (!this.#dragData) return;
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';

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
        if (!this.#dragData) return;

        const slot = event.currentTarget as HTMLElement;
        const targetChar = slot.dataset.characteristic as CharacteristicKey;
        const draggedIndex = this.#dragData.index;
        const sourceChar = this.#dragData.characteristic;

        const currentTargetIndex = this.#assignments[targetChar];

        if (sourceChar) {
            this.#assignments[sourceChar] = currentTargetIndex;
        }

        this.#assignments[targetChar] = draggedIndex;

        slot.classList.add('snap-to-slot');
        setTimeout(() => slot.classList.remove('snap-to-slot'), 600);

        void this.render();
    }

    /* -------------------------------------------- */

    #onBankDragOver(event: DragEvent): void {
        if (!this.#dragData || this.#dragData.type !== 'assigned') return;
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
        (event.currentTarget as HTMLElement).classList.add('drop-valid', 'drop-hover');
    }

    /* -------------------------------------------- */

    #onBankDrop(event: DragEvent): void {
        event.preventDefault();
        if (!this.#dragData || !this.#dragData.characteristic) return;

        this.#assignments[this.#dragData.characteristic] = null;
        void this.render();
    }

    /* -------------------------------------------- */

    #onBaseValueChange(event: Event): void {
        const input = event.currentTarget as HTMLInputElement;
        const key = input.dataset.characteristic as CharacteristicKey;
        let value = parseInt(input.value, 10);

        if (isNaN(value) || value < 0) value = 0;
        this.#customBases[key] = value;
        void this.render();
    }

    /* -------------------------------------------- */

    static async #onApply(this: CharacteristicSetupDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        const allAssigned = GENERATION_CHARACTERISTICS.every((key) => this.#assignments[key] !== null && this.#rolls[this.#assignments[key]!] > 0);

        if (!allAssigned) {
            ui.notifications.warn(game.i18n.localize('WH40K.CharacteristicSetup.NotAllAssigned'));
            return;
        }

        const updateData: Record<string, unknown> = {
            'system.characterGeneration.rolls': this.#rolls,
            'system.characterGeneration.assignments': this.#assignments,
            'system.characterGeneration.customBases.enabled': this.#advancedMode,
        };

        for (const key of GENERATION_CHARACTERISTICS) {
            updateData[`system.characterGeneration.customBases.${key}`] = this.#customBases[key];
        }

        for (const key of GENERATION_CHARACTERISTICS) {
            const rollIndex = this.#assignments[key];
            const rollValue = this.#rolls[rollIndex!];
            const base = this.#advancedMode ? this.#customBases[key]! : DEFAULT_BASE;
            const total = base + rollValue;
            updateData[`system.characteristics.${key}.base`] = total;
        }

        await this.#actor.update(updateData);

        this.#applied = true;
        this.#resolve?.(true);

        ui.notifications.info(game.i18n.localize('WH40K.CharacteristicSetup.Applied'));
        await this.close();
    }

    static async #onReset(this: CharacteristicSetupDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        for (const key of GENERATION_CHARACTERISTICS) {
            this.#assignments[key] = null;
        }
        this.render();
    }

    static async #onToggleAdvanced(this: CharacteristicSetupDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        this.#advancedMode = !this.#advancedMode;
        this.render();
    }

    /* -------------------------------------------- */

    /** @override */
    async close(options: Record<string, unknown> = {}): Promise<unknown> {
        if (!this.#applied && this.#resolve) {
            this.#resolve(false);
        }
        return super.close(options);
    }

    /* -------------------------------------------- */

    async wait(): Promise<boolean> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    static async open(actor: WH40KBaseActor): Promise<boolean> {
        if (!actor || (actor.type !== 'acolyte' && actor.type !== 'character')) {
            ui.notifications.error('Characteristic setup is only available for characters.');
            return false;
        }
        const dialog = new this(actor);
        return dialog.wait();
    }
}
