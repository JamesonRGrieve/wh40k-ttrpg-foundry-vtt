/**
 * Origin Path Choice Dialog
 *
 * Modal dialog for selecting choices when an origin path item
 * has multiple options (e.g., "Choose 1 of 3 talents").
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { findSkillUuid } from '../../helpers/skill-uuid-helper.ts';
import { getChoiceTypeLabel } from '../../utils/origin-ui-labels.ts';

import type { ApplicationV2Ctor } from '../api/application-types.ts';
const { ApplicationV2, HandlebarsApplicationMixin } = (
    foundry.applications as unknown as { api: { ApplicationV2: ApplicationV2Ctor; HandlebarsApplicationMixin: <T extends ApplicationV2Ctor>(base: T) => T } }
).api;

/** A single selectable option within a choice. */
interface ChoiceOption {
    value?: string;
    name?: string;
    label?: string;
    description?: string;
    specializations?: string[] | null;
    specialization?: string;
    grants?: {
        talents?: Array<{ uuid?: string; name?: string }>;
        skills?: Array<{ uuid?: string; name?: string; specialization?: string } | string>;
        traits?: Array<{ uuid?: string }>;
        equipment?: Array<{ uuid?: string }>;
    };
    uuid?: string;
    [key: string]: unknown;
}

/** A raw choice entry from the item's grants (before deduplication). */
interface RawChoice {
    type?: string;
    label?: string;
    name?: string;
    count?: number;
    options?: Array<ChoiceOption | string>;
    [key: string]: unknown;
}

/** A processed choice entry with a disambiguated key. */
interface PendingChoice extends RawChoice {
    label: string;
    count: number;
    options: ChoiceOption[];
    _key: string;
}

/** Tracks which option is waiting for a specialization to be selected. */
interface PendingSpecOption {
    choiceKey: string;
    optionValue: string;
}

export default class OriginPathChoiceDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /** The origin path item with grants/choices. */
    item: WH40KItem;

    /** The character actor. */
    actor: WH40KBaseActor;

    /** Processed choices with unique keys. */
    pendingChoices: PendingChoice[];

    /** Current selections keyed by choice._key, values are composite option strings. */
    selections: Map<string, Set<string>>;

    /** Chosen specialization per option, keyed by `choiceKey::optionValue`. */
    specializationSelections: Map<string, string>;

    /** Promise resolver invoked when the user confirms or cancels. */
    _resolvePromise: ((value: Record<string, string[]> | null) => void) | null;

    /** The option currently waiting for a specialization choice, or null. */
    _pendingSpecOption: PendingSpecOption | null = null;

    /** Saved scroll position before re-render, restored in _onRender. */
    _savedScrollTop: number = 0;

    /** Inherited from ApplicationV2 — re-declared so the mixin return type exposes it. */
    declare render: (options?: boolean | Record<string, unknown>) => Promise<unknown>;

    /** Inherited from ApplicationV2 — re-declared so the mixin return type exposes it. */
    declare close: (options?: Record<string, unknown>) => Promise<void>;
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'origin-choice-dialog'],
        tag: 'form',
        window: {
            title: 'WH40K.OriginPath.MakeChoices',
            icon: 'fa-solid fa-list-check',
            minimizable: false,
            resizable: true,
        },
        position: {
            width: 700,
            height: 'auto' as const,
        },
        actions: {
            toggleOption: OriginPathChoiceDialog.#toggleOption,
            selectSpecialization: OriginPathChoiceDialog.#selectSpecialization,
            confirm: OriginPathChoiceDialog.#confirm,
            cancel: OriginPathChoiceDialog.#cancel,
            viewItem: OriginPathChoiceDialog.#viewItem,
        },
        form: {
            handler: OriginPathChoiceDialog.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
    };

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/character-creation/origin-path-choice-dialog.hbs',
        },
    };

    /* -------------------------------------------- */

    /**
     * @param {object} item - The origin path item with choices
     * @param {Actor} actor - The character actor (for context)
     * @param {object} [options={}] - Additional options
     */
    constructor(item: WH40KItem, actor: WH40KBaseActor, options: Record<string, unknown> = {}) {
        super(options);

        /**
         * The origin path item
         * @type {object}
         */
        this.item = item;

        /**
         * The character actor
         * @type {Actor}
         */
        this.actor = actor;

        /**
         * Pending choices that need selection
         * @type {Array<{type: string, label: string, options: object[], count: number}>}
         */
        // Normalize choices: DH2e uses 'name' while RT uses 'label'.
        // Disambiguate duplicate labels (e.g. two "Starting Skill" choices)
        // by appending " (2)", " (3)", etc. so each choice has a unique key.
        const itemGrants = item.system?.grants as { choices?: RawChoice[] } | undefined;
        const rawChoices = (itemGrants?.choices || []).map((c: RawChoice) => ({
            ...c,
            label: c.label || c.name || '',
            options: (c.options || []).map((o: ChoiceOption | string) => {
                // Handle plain string options (e.g. aptitude choices: ["Offence", "Tech"])
                if (typeof o === 'string') {
                    return { value: o, label: o, specializations: null };
                }
                // For options with specialization (singular) but no specializations picker,
                // use the full label as the value to avoid duplicates
                // (e.g. two "Weapon Training" options with different specializations)
                let optValue = o.value || o.name || '';
                if (o.specialization && !o.specializations?.length) {
                    const fullLabel = o.label || `${o.name} (${o.specialization})`;
                    optValue = fullLabel;
                }
                return {
                    ...o,
                    value: optValue,
                    label: o.label || o.name || '',
                    specializations: o.specializations || null,
                };
            }),
        }));

        // Deduplicate choice labels
        const labelCounts: Record<string, number> = {};
        this.pendingChoices = rawChoices.map((c: RawChoice & { label: string; options: ChoiceOption[] }) => {
            const base = c.label;
            labelCounts[base] = (labelCounts[base] || 0) + 1;
            const suffix = labelCounts[base] > 1 ? ` (${labelCounts[base]})` : '';
            return { ...c, count: c.count ?? 1, _key: `${base}${suffix}` } as PendingChoice;
        });

        /**
         * Selected options for each choice.
         * Values are the final composite strings, e.g. "Weapon Training (Chain)".
         * Keyed by choice._key (disambiguated label).
         * @type {Map<string, Set<string>>}
         */
        this.selections = new Map();

        /**
         * Chosen specialization per option, keyed by `choiceKey::optionValue`.
         * @type {Map<string, string>}
         */
        this.specializationSelections = new Map();

        // Initialize selections from existing selectedChoices
        const existing = (item.system?.selectedChoices as Record<string, string | string[]> | undefined) ?? {};
        for (const [key, selected] of Object.entries(existing)) {
            const selectedValues = Array.isArray(selected) ? selected : [selected].filter(Boolean);
            this.selections.set(key, new Set(selectedValues));
            // Reverse-engineer specialization selections from composite values
            for (const sel of selectedValues) {
                const match = sel.match(/^(.+?)\s*\((.+)\)$/);
                if (match) {
                    const baseValue = match[1].trim();
                    const spec = match[2].trim();
                    const choice = this.pendingChoices.find((c) => c._key === key);
                    const option = choice?.options?.find((o) => o.value === baseValue || o.label === baseValue);
                    if (option?.specializations) {
                        this.specializationSelections.set(`${key}::${option.value}`, spec);
                    }
                }
            }
        }

        /**
         * Promise resolver for awaiting user input
         * @type {Function|null}
         * @private
         */
        this._resolvePromise = null;
    }

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        context.item = this.item;
        context.itemName = this.item.name;
        context.itemImg = this.item.img;

        // Prepare choices with selection state
        context.choices = await Promise.all(
            this.pendingChoices.map(async (choice) => {
                const choiceKey = choice._key;
                const selections = this.selections.get(choiceKey) || new Set();
                const remaining = choice.count - selections.size;

                return {
                    type: choice.type,
                    typeLabel: this._getChoiceTypeLabel(choice.type ?? ''),
                    label: choice.label,
                    choiceKey: choiceKey,
                    count: choice.count,
                    remaining: remaining,
                    options: await Promise.all(
                        (choice.options || []).map(async (option) => {
                            const optValue = option.value || option.label || '';
                            const optLabel = option.label || option.value || '';
                            let optDesc = option.description || null;
                            const optSpecs = option.specializations || null;
                            let statBlock: string | null = null;

                            // Extract UUID from option.uuid OR from grants
                            let optUuid: string | null = typeof option === 'object' ? option.uuid ?? null : null;
                            if (!optUuid && typeof option === 'object' && option.grants) {
                                const grants = option.grants;
                                const firstTalent = (grants.talents ?? [])[0];
                                const firstTrait = (grants.traits ?? [])[0];
                                const firstEquip = (grants.equipment ?? [])[0];
                                if ((grants.talents?.length ?? 0) > 0 && firstTalent?.uuid) {
                                    optUuid = firstTalent.uuid;
                                } else if ((grants.skills?.length ?? 0) > 0) {
                                    const skillData = (grants.skills ?? [])[0];
                                    if (typeof skillData === 'string') {
                                        optUuid = await findSkillUuid(skillData, null);
                                    } else if (skillData) {
                                        if (skillData.uuid) {
                                            optUuid = skillData.uuid;
                                        } else {
                                            const skillName = skillData.name ?? '';
                                            const specialization = skillData.specialization ?? null;
                                            optUuid = await (findSkillUuid as (name: string, spec: string | null) => Promise<string | null>)(
                                                skillName,
                                                specialization,
                                            );
                                        }
                                    }
                                } else if ((grants.traits?.length ?? 0) > 0 && firstTrait?.uuid) {
                                    optUuid = firstTrait.uuid;
                                } else if ((grants.equipment?.length ?? 0) > 0 && firstEquip?.uuid) {
                                    optUuid = firstEquip.uuid;
                                }
                            }

                            // Fetch compendium description and stat block for item-type choices
                            const itemChoiceTypes = new Set(['talent', 'skill', 'equipment', 'gear', 'trait', 'psychicPower']);
                            if (!optDesc && itemChoiceTypes.has(choice.type ?? '')) {
                                const resolved = await this._resolveCompendiumItem(optLabel, optUuid);
                                if (resolved) {
                                    const resolvedDoc = resolved as { uuid?: string; system?: { description?: { value?: string } }; type?: string };
                                    if (!optUuid) optUuid = resolvedDoc.uuid ?? null;
                                    const rawDesc = resolvedDoc.system?.description?.value || '';
                                    if (rawDesc) {
                                        optDesc = rawDesc;
                                    }
                                    statBlock = this._buildStatBlock(resolved as WH40KItem);
                                }
                            }

                            // Determine if this option is selected
                            const specKey = `${choiceKey}::${optValue}`;
                            const chosenSpec = this.specializationSelections.get(specKey) || '';
                            const compositeValue = optSpecs && chosenSpec ? `${optValue} (${chosenSpec})` : optValue;
                            const isSelected = selections.has(compositeValue);

                            const isPendingSpec = this._pendingSpecOption?.choiceKey === choiceKey && this._pendingSpecOption?.optionValue === optValue;

                            return {
                                value: optValue,
                                label: optLabel,
                                description: optDesc,
                                statBlock: statBlock,
                                uuid: optUuid,
                                selected: !!isSelected,
                                disabled: !isSelected && !isPendingSpec && remaining <= 0,
                                hasSpecializations: !!optSpecs && optSpecs.length > 0,
                                specializations: optSpecs || [],
                                chosenSpecialization: chosenSpec,
                                pendingSpec: isPendingSpec,
                            };
                        }),
                    ),
                };
            }),
        );

        // Check if all choices are complete
        context.allChoicesComplete = (context.choices as Array<{ remaining: number }>).every((c) => c.remaining === 0);

        return context;
    }

    /**
     * Resolve a compendium item by UUID or name search.
     * @private
     */
    async _resolveCompendiumItem(name: string, uuid?: string | null): Promise<unknown> {
        if (uuid) {
            try {
                const item = await fromUuid(uuid);
                if (item) return item;
            } catch {
                /* fall through to name search */
            }
        }
        if (!name) return null;
        const nameLower = name.toLowerCase();
        for (const pack of game.packs) {
            if (pack.documentName !== 'Item') continue;
            const index = await pack.getIndex();
            const match = index.find((e: any) => e.name.toLowerCase() === nameLower);
            if (match) return pack.getDocument(match._id);
        }
        return null;
    }

    /**
     * Strip HTML and truncate to a max length.
     * @private
     */
    _stripAndTruncate(html: string, maxLen: number): string {
        const text = html
            .replace(/<\/(?:h[1-6]|p|div|li|tr|blockquote)>/gi, ' ')
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return text.length > maxLen ? `${text.substring(0, maxLen)}...` : text;
    }

    /**
     * Build a compact stat summary for weapons/armour/gear.
     * @private
     */
    _buildStatBlock(item: WH40KItem): string | null {
        const rawSys = item.system as Record<string, unknown> | undefined;
        if (!rawSys) return null;
        const parts: string[] = [];

        type AtkData = { type?: string; range?: { value?: number }; rateOfFire?: { single?: number; semi?: number; full?: number } };
        type DmgData = { formula?: string; bonus?: number; type?: string; penetration?: number };

        if (item.type === 'weapon') {
            const atk = (rawSys.attack || {}) as AtkData;
            const dmg = (rawSys.damage || {}) as DmgData;
            if (atk.type) parts.push(atk.type === 'melee' ? 'Melee' : 'Ranged');
            if (rawSys.class) parts.push(String(rawSys.class));
            if (atk.range?.value) parts.push(`Range ${atk.range.value}m`);
            const rof = atk.rateOfFire;
            if (rof) {
                const modes: string[] = [];
                if (rof.single) modes.push('S');
                if (rof.semi) modes.push(`${rof.semi}`);
                if (rof.full) modes.push(`${rof.full}`);
                if (modes.length) parts.push(`RoF ${modes.join('/')}`);
            }
            if (dmg.formula) {
                let dmgStr = dmg.formula;
                if (dmg.bonus) dmgStr += `+${dmg.bonus}`;
                if (dmg.type) dmgStr += ` ${dmg.type[0].toUpperCase()}`;
                parts.push(`Dmg ${dmgStr}`);
            }
            if (dmg.penetration) parts.push(`Pen ${dmg.penetration}`);
            const clip = rawSys.clip as { max?: number } | undefined;
            if (clip?.max) parts.push(`Clip ${clip.max}`);
            if (rawSys.reload) parts.push(`Rld ${String(rawSys.reload)}`);
        } else if (item.type === 'armour') {
            if (rawSys.armourPoints != null) parts.push(`AP ${rawSys.armourPoints}`);
            if (rawSys.maxAgility != null) parts.push(`Max Ag ${rawSys.maxAgility}`);
            if (rawSys.coverage) parts.push(String(rawSys.coverage));
        }

        if (rawSys.weight) parts.push(`${rawSys.weight} kg`);
        return parts.length > 0 ? parts.join(' · ') : null;
    }

    /**
     * Get choice type label
     * @param {string} type
     * @returns {string}
     * @private
     */
    _getChoiceTypeLabel(type: string): string {
        return getChoiceTypeLabel(type);
    }

    /**
     * Save scroll position before re-render so it can be restored.
     * @private
     */
    _saveScrollPosition(): void {
        const list = this.element?.querySelector('.choices-list');
        this._savedScrollTop = list ? list.scrollTop : 0;
    }

    /** @override */
    _onRender(context: Record<string, unknown>, options: Record<string, unknown>): void {
        super._onRender(context, options);

        // Restore scroll position after re-render
        if (this._savedScrollTop) {
            const list = this.element?.querySelector('.choices-list');
            if (list) list.scrollTop = this._savedScrollTop;
            this._savedScrollTop = 0;
        }

        // Attach change listeners to specialization selects (data-action doesn't fire on change)
        const selects = this.element.querySelectorAll('select[data-action="selectSpecialization"]');
        for (const select of selects) {
            select.addEventListener('change', (event) => {
                OriginPathChoiceDialog.#selectSpecialization.call(this, event, select as HTMLElement);
            });
        }
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Toggle an option selection
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #toggleOption(this: OriginPathChoiceDialog, event: Event, target: HTMLElement): Promise<void> {
        const choiceKey = target.dataset.choice;
        const optionValue = target.dataset.option;

        if (!choiceKey || !optionValue) return;

        // Get the choice config
        const choice = this.pendingChoices.find((c) => c._key === choiceKey);
        if (!choice) return;

        const option = choice.options.find((o) => o.value === optionValue);

        // Get current selections for this choice
        if (!this.selections.has(choiceKey)) {
            this.selections.set(choiceKey, new Set());
        }
        const selections = this.selections.get(choiceKey)!;
        const specKey = `${choiceKey}::${optionValue}`;

        // Build the composite value (includes specialization if present)
        const chosenSpec = this.specializationSelections.get(specKey) || '';
        const hasSpecs = (option?.specializations?.length ?? 0) > 0;
        const compositeValue = hasSpecs && chosenSpec ? `${optionValue} (${chosenSpec})` : optionValue;

        // Find any existing composite for this base option (to remove when deselecting)
        const existingComposite = [...selections].find((v) => v === optionValue || v.startsWith(`${optionValue} (`));

        // Toggle selection
        if (existingComposite) {
            selections.delete(existingComposite);
            this.specializationSelections.delete(specKey);
        } else {
            // If this option has specializations but none chosen yet, just re-render
            // to show the dropdown — don't add to selections until spec is picked
            if (hasSpecs && !chosenSpec) {
                this._pendingSpecOption = { choiceKey, optionValue };
                this._saveScrollPosition();
                await this.render();
                return;
            }

            // Check if we can add more
            if (selections.size < choice.count) {
                selections.add(compositeValue);
            } else if (choice.count === 1) {
                selections.clear();
                if (hasSpecs && !chosenSpec) {
                    this._pendingSpecOption = { choiceKey, optionValue };
                    this._saveScrollPosition();
                    await this.render();
                    return;
                }
                selections.add(compositeValue);
            } else {
                ui.notifications.warn(`You can only select ${choice.count} option(s).`);
                return;
            }
        }

        this._pendingSpecOption = null;
        this._saveScrollPosition();
        await this.render();
    }

    /**
     * Handle specialization dropdown selection.
     * When a specialization is chosen, finalize the option selection with composite value.
     * @private
     */
    static async #selectSpecialization(this: OriginPathChoiceDialog, event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation();
        const select = target.tagName === 'SELECT' ? (target as HTMLSelectElement) : target.querySelector('select');
        if (!select) return;

        const choiceKey = select.dataset.choice;
        const optionValue = select.dataset.option;
        const specValue = select.value;

        if (!choiceKey || !optionValue || !specValue) return;

        const choice = this.pendingChoices.find((c) => c._key === choiceKey);
        if (!choice) return;

        const specKey = `${choiceKey}::${optionValue}`;
        this.specializationSelections.set(specKey, specValue);

        // Build composite value and add to selections
        const compositeValue = `${optionValue} (${specValue})`;
        if (!this.selections.has(choiceKey)) {
            this.selections.set(choiceKey, new Set());
        }
        const selections = this.selections.get(choiceKey)!;

        // Remove any existing composite for this base option
        const existing = [...selections].find((v) => v === optionValue || v.startsWith(`${optionValue} (`));
        if (existing) selections.delete(existing);

        // Add the new composite
        if (selections.size < choice.count) {
            selections.add(compositeValue);
        } else if (choice.count === 1) {
            selections.clear();
            selections.add(compositeValue);
        }

        this._pendingSpecOption = null;
        this._saveScrollPosition();
        await this.render();
    }

    /**
     * Confirm selections
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static #confirm(this: OriginPathChoiceDialog, event: Event, target: HTMLElement): void {
        // Validate all choices are complete
        const incomplete = this.pendingChoices.filter((choice) => {
            const selections = this.selections.get(choice._key) || new Set();
            return selections.size < choice.count;
        });

        if (incomplete.length > 0) {
            ui.notifications.warn('Please complete all required choices.');
            return;
        }

        // Convert Map to object for storage
        const selectedChoices: Record<string, string[]> = {};
        for (const [label, selections] of this.selections.entries()) {
            selectedChoices[label] = Array.from(selections);
        }

        // Resolve promise with selections
        if (this._resolvePromise) {
            this._resolvePromise(selectedChoices);
        }

        this.close();
    }

    /**
     * Cancel dialog
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static #cancel(this: OriginPathChoiceDialog, event: Event, target: HTMLElement): void {
        if (this._resolvePromise) {
            this._resolvePromise(null);
        }
        this.close();
    }

    /**
     * View an item's sheet (for choices with UUIDs)
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The target element
     * @private
     */
    static async #viewItem(this: OriginPathChoiceDialog, event: Event, target: HTMLElement): Promise<void> {
        event.stopPropagation(); // Don't trigger parent card click
        event.preventDefault(); // Prevent default button behavior

        const uuid = target.dataset.uuid;
        if (!uuid) return;

        try {
            const item = await fromUuid(uuid);
            if (item) {
                (item as { sheet?: { render: (force?: boolean) => void } }).sheet?.render(true);
            }
        } catch (error) {
            console.warn('Could not load item:', uuid, error);
            ui.notifications.warn('Could not find that item.');
        }
    }

    /**
     * Form submit handler
     * @param {Event} event - The form submit event
     * @param {HTMLFormElement} form - The form element
     * @param {FormDataExtended} formData - The form data
     * @private
     */
    static #onSubmit(this: OriginPathChoiceDialog, event: Event, form: HTMLFormElement, formData: Record<string, unknown>): void {
        // Same as confirm - call directly on instance
        return OriginPathChoiceDialog.#confirm.call(this, event, form);
    }

    /* -------------------------------------------- */
    /*  Static Factory                              */
    /* -------------------------------------------- */

    /**
     * Show the choice dialog and await user selection
     * @param {object} item - The origin path item
     * @param {Actor} actor - The character actor
     * @returns {Promise<object|null>} The selected choices or null if cancelled
     */
    static async show(item: WH40KItem, actor: WH40KBaseActor): Promise<unknown> {
        const dialog = new OriginPathChoiceDialog(item, actor);

        // Create promise that will be resolved when user confirms/cancels
        const result = new Promise((resolve) => {
            dialog._resolvePromise = resolve;
        });

        await dialog.render(true);

        return result;
    }
}
