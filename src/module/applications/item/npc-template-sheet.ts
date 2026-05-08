/**
 * @file NPCTemplateSheet - Item sheet for NPC templates
 * Phase 7: Template System
 */

import BaseItemSheet from './base-item-sheet.ts';

/** System shape for npcTemplate items. */
interface NPCTemplateSystem {
    category: string;
    role: string;
    type: string;
    equipmentPreset: string;
    baseCharacteristics: Record<string, number>;
    unnaturals: Record<string, number>;
    trainedSkills: TrainedSkill[];
    customWeapons: CustomWeapon[];
    traits: TraitRef[];
    talents: TalentRef[];
    variants: Variant[];
    scaling: unknown;
    previewAtThreat: (threat: number) => Record<string, unknown>;
    generateAtThreat: (threat: number) => Record<string, unknown>;
}

interface TrainedSkill {
    key: string;
    name: string;
    characteristic: string;
    level: string;
}

interface CustomWeapon {
    name: string;
    damage: string;
    pen: number;
    range: string;
    rof: string;
    clip: number;
    reload: string;
    special: string;
    class: string;
}

interface TraitRef {
    uuid: string;
    name: string;
    description: string;
}

interface TalentRef {
    uuid: string;
    name: string;
    description: string;
}

interface Variant {
    name: string;
    description: string;
    threatModifier: number;
    characteristicModifiers: Record<string, number>;
    additionalEquipment: unknown[];
    additionalTraits: unknown[];
    additionalTalents: unknown[];
}

interface ResolvedItem {
    name: string | null;
    type: string;
    img: string | null;
    system: unknown;
}

/**
 * Item sheet for npcTemplate type items.
 * Provides a template editor UI for creating reusable NPC configurations.
 *
 * @extends {BaseItemSheet}
 */
export default class NPCTemplateSheet extends BaseItemSheet {
    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static override DEFAULT_OPTIONS = {
        ...BaseItemSheet.DEFAULT_OPTIONS,
        classes: ['sheet', 'wh40k-rpg', 'npc-template-sheet'],
        position: {
            width: 700,
            height: 700,
        },
        actions: {
            ...BaseItemSheet.DEFAULT_OPTIONS.actions,
            // Skill actions
            addSkill: NPCTemplateSheet.#addSkill,
            removeSkill: NPCTemplateSheet.#removeSkill,
            // Weapon actions
            addWeapon: NPCTemplateSheet.#addWeapon,
            removeWeapon: NPCTemplateSheet.#removeWeapon,
            // Trait/Talent actions
            addTrait: NPCTemplateSheet.#addTrait,
            removeTrait: NPCTemplateSheet.#removeTrait,
            addTalent: NPCTemplateSheet.#addTalent,
            removeTalent: NPCTemplateSheet.#removeTalent,
            // Variant actions
            addVariant: NPCTemplateSheet.#addVariant,
            removeVariant: NPCTemplateSheet.#removeVariant,
            // Preview
            updatePreview: NPCTemplateSheet.#updatePreview,
            // Instantiate
            createFromTemplate: NPCTemplateSheet.#createFromTemplate,
        },
    } satisfies typeof BaseItemSheet.DEFAULT_OPTIONS & Partial<ApplicationV2Config.DefaultOptions>;

    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static PARTS = {
        header: {
            template: 'systems/wh40k-rpg/templates/item/npc-template/header.hbs',
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/item/npc-template/tabs.hbs',
        },
        basics: {
            template: 'systems/wh40k-rpg/templates/item/npc-template/tab-basics.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        characteristics: {
            template: 'systems/wh40k-rpg/templates/item/npc-template/tab-characteristics.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        equipment: {
            template: 'systems/wh40k-rpg/templates/item/npc-template/tab-equipment.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        abilities: {
            template: 'systems/wh40k-rpg/templates/item/npc-template/tab-abilities.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        preview: {
            template: 'systems/wh40k-rpg/templates/item/npc-template/tab-preview.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static TABS = [
        { tab: 'basics', group: 'primary', icon: 'fa-solid fa-user', label: 'WH40K.NPC.Template.Tabs.Basics' },
        { tab: 'characteristics', group: 'primary', icon: 'fa-solid fa-chart-bar', label: 'WH40K.NPC.Template.Tabs.Characteristics' },
        { tab: 'equipment', group: 'primary', icon: 'fa-solid fa-swords', label: 'WH40K.NPC.Template.Tabs.Equipment' },
        { tab: 'abilities', group: 'primary', icon: 'fa-solid fa-sparkles', label: 'WH40K.NPC.Template.Tabs.Abilities' },
        { tab: 'preview', group: 'primary', icon: 'fa-solid fa-eye', label: 'WH40K.NPC.Template.Tabs.Preview' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'basics',
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Preview threat level.
     * @type {number}
     */
    #previewThreat = 5;

    #renderTimeout: ReturnType<typeof setTimeout> | undefined;

    get _previewThreat(): number {
        return this.#previewThreat;
    }
    set _previewThreat(value: number) {
        this.#previewThreat = value;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /**
     * Override _getTabs to include icons from TABS definition.
     * @returns {object} Tab configuration object.
     * @protected
     */
    override _getTabs(): Record<string, Record<string, unknown>> {
        const tabs = super._getTabs();

        // Add icons from TABS definition
        for (const tabDef of NPCTemplateSheet.TABS) {
            if (tabDef.tab in tabs) {
                tabs[tabDef.tab].icon = tabDef.icon;
            }
        }

        return tabs;
    }

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        const sys = this.item.system as unknown as NPCTemplateSystem;

        // Prepare categories
        const categories = [
            { key: 'humanoid', label: 'Humanoid' },
            { key: 'xenos', label: 'Xenos' },
            { key: 'daemon', label: 'Daemon' },
            { key: 'creature', label: 'Creature' },
            { key: 'vehicle', label: 'Vehicle' },
            { key: 'custom', label: 'Custom' },
        ].map((c) => ({ ...c, selected: c.key === sys.category }));

        // Prepare roles
        const roles = [
            { key: 'bruiser', name: 'Bruiser' },
            { key: 'sniper', name: 'Sniper' },
            { key: 'caster', name: 'Caster' },
            { key: 'support', name: 'Support' },
            { key: 'commander', name: 'Commander' },
            { key: 'specialist', name: 'Specialist' },
        ].map((r) => ({ ...r, selected: r.key === sys.role }));

        // Prepare types
        const types = [
            { key: 'troop', name: 'Troop' },
            { key: 'elite', name: 'Elite' },
            { key: 'master', name: 'Master' },
            { key: 'horde', name: 'Horde' },
            { key: 'swarm', name: 'Swarm' },
            { key: 'creature', name: 'Creature' },
            { key: 'daemon', name: 'Daemon' },
            { key: 'xenos', name: 'Xenos' },
        ].map((t) => ({ ...t, selected: t.key === sys.type }));

        // Prepare equipment presets
        const presets = [
            { key: 'melee', name: 'Melee' },
            { key: 'ranged', name: 'Ranged' },
            { key: 'mixed', name: 'Mixed' },
            { key: 'caster', name: 'Caster' },
            { key: 'support', name: 'Support' },
            { key: 'heavy', name: 'Heavy' },
            { key: 'unarmed', name: 'Unarmed' },
            { key: 'custom', name: 'Custom' },
        ].map((p) => ({ ...p, selected: p.key === sys.equipmentPreset }));

        // Prepare characteristics for display
        const characteristics: Array<{ key: string; label: string; short: string; value: number; unnatural: number }> = [
            { key: 'weaponSkill', label: 'Weapon Skill', short: 'WS' },
            { key: 'ballisticSkill', label: 'Ballistic Skill', short: 'BS' },
            { key: 'strength', label: 'Strength', short: 'S' },
            { key: 'toughness', label: 'Toughness', short: 'T' },
            { key: 'agility', label: 'Agility', short: 'Ag' },
            { key: 'intelligence', label: 'Intelligence', short: 'Int' },
            { key: 'perception', label: 'Perception', short: 'Per' },
            { key: 'willpower', label: 'Willpower', short: 'WP' },
            { key: 'fellowship', label: 'Fellowship', short: 'Fel' },
            { key: 'influence', label: 'Influence', short: 'Inf' },
        ].map((c) => ({
            ...c,
            value: sys.baseCharacteristics[c.key] ?? 30,
            unnatural: sys.unnaturals[c.key] ?? 0,
        }));

        // Generate preview data
        const preview = sys.previewAtThreat(this.#previewThreat);

        return {
            ...context,

            // Form options
            categories,
            roles,
            types,
            presets,
            characteristics,

            // Skills
            skills: sys.trainedSkills,
            hasSkills: sys.trainedSkills.length > 0,

            // Weapons
            weapons: sys.customWeapons,
            hasWeapons: sys.customWeapons.length > 0,
            isCustomPreset: sys.equipmentPreset === 'custom',

            // Abilities
            traits: sys.traits,
            talents: sys.talents,
            hasTraits: sys.traits.length > 0,
            hasTalents: sys.talents.length > 0,

            // Variants
            variants: sys.variants,
            hasVariants: sys.variants.length > 0,

            // Preview
            previewThreat: this.#previewThreat,
            preview,

            // Scaling rules
            scaling: sys.scaling,
        };
    }

    /** @override */
    override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        // Preview threat slider
        const threatSlider = this.element.querySelector<HTMLInputElement>('[name="previewThreat"]');
        const threatValue = this.element.querySelector<HTMLElement>('.preview-threat-value');
        if (threatSlider !== null) {
            threatSlider.addEventListener('input', () => {
                this.#previewThreat = parseInt(threatSlider.value, 10);
                if (threatValue !== null) threatValue.textContent = String(this.#previewThreat);
                this._debounceRender();
            });
        }
    }

    /**
     * Debounced render for preview updates.
     * @private
     */
    _debounceRender(): void {
        if (this.#renderTimeout !== undefined) clearTimeout(this.#renderTimeout);
        this.#renderTimeout = setTimeout(() => {
            void this.render({ parts: ['preview'] });
        }, 150);
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Add a trained skill.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #addSkill(this: NPCTemplateSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();

        const sys = this.item.system as unknown as NPCTemplateSystem;
        const skills = foundry.utils.deepClone(sys.trainedSkills);
        skills.push({
            key: 'awareness',
            name: 'Awareness',
            characteristic: 'perception',
            level: 'trained',
        });

        await (this.item as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({ 'system.trainedSkills': skills });
    }

    /**
     * Remove a trained skill.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #removeSkill(this: NPCTemplateSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const index = parseInt(target.dataset.index ?? '', 10);
        if (isNaN(index)) return;

        const sys = this.item.system as unknown as NPCTemplateSystem;
        const skills = foundry.utils.deepClone(sys.trainedSkills);
        skills.splice(index, 1);

        await (this.item as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({ 'system.trainedSkills': skills });
    }

    /**
     * Add a custom weapon.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #addWeapon(this: NPCTemplateSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();

        const sys = this.item.system as unknown as NPCTemplateSystem;
        const weapons = foundry.utils.deepClone(sys.customWeapons);
        weapons.push({
            name: 'New Weapon',
            damage: '1d10',
            pen: 0,
            range: 'Melee',
            rof: 'S/-/-',
            clip: 0,
            reload: '-',
            special: '',
            class: 'melee',
        });

        await (this.item as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({ 'system.customWeapons': weapons });
    }

    /**
     * Remove a custom weapon.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #removeWeapon(this: NPCTemplateSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const index = parseInt(target.dataset.index ?? '', 10);
        if (isNaN(index)) return;

        const sys = this.item.system as unknown as NPCTemplateSystem;
        const weapons = foundry.utils.deepClone(sys.customWeapons);
        weapons.splice(index, 1);

        await (this.item as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({ 'system.customWeapons': weapons });
    }

    /**
     * Add a trait.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #addTrait(this: NPCTemplateSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();

        const sys = this.item.system as unknown as NPCTemplateSystem;
        const traits = foundry.utils.deepClone(sys.traits);
        traits.push({
            uuid: '',
            name: 'New Trait',
            description: '',
        });

        await (this.item as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({ 'system.traits': traits });
    }

    /**
     * Remove a trait.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #removeTrait(this: NPCTemplateSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const index = parseInt(target.dataset.index ?? '', 10);
        if (isNaN(index)) return;

        const sys = this.item.system as unknown as NPCTemplateSystem;
        const traits = foundry.utils.deepClone(sys.traits);
        traits.splice(index, 1);

        await (this.item as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({ 'system.traits': traits });
    }

    /**
     * Add a talent.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #addTalent(this: NPCTemplateSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();

        const sys = this.item.system as unknown as NPCTemplateSystem;
        const talents = foundry.utils.deepClone(sys.talents);
        talents.push({
            uuid: '',
            name: 'New Talent',
            description: '',
        });

        await (this.item as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({ 'system.talents': talents });
    }

    /**
     * Remove a talent.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #removeTalent(this: NPCTemplateSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const index = parseInt(target.dataset.index ?? '', 10);
        if (isNaN(index)) return;

        const sys = this.item.system as unknown as NPCTemplateSystem;
        const talents = foundry.utils.deepClone(sys.talents);
        talents.splice(index, 1);

        await (this.item as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({ 'system.talents': talents });
    }

    /**
     * Add a variant.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #addVariant(this: NPCTemplateSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();

        const sys = this.item.system as unknown as NPCTemplateSystem;
        const variants = foundry.utils.deepClone(sys.variants);
        variants.push({
            name: 'New Variant',
            description: '',
            threatModifier: 0,
            characteristicModifiers: {},
            additionalEquipment: [],
            additionalTraits: [],
            additionalTalents: [],
        });

        await (this.item as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({ 'system.variants': variants });
    }

    /**
     * Remove a variant.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #removeVariant(this: NPCTemplateSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const index = parseInt(target.dataset.index ?? '', 10);
        if (isNaN(index)) return;

        const sys = this.item.system as unknown as NPCTemplateSystem;
        const variants = foundry.utils.deepClone(sys.variants);
        variants.splice(index, 1);

        await (this.item as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({ 'system.variants': variants });
    }

    /**
     * Update preview.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #updatePreview(this: NPCTemplateSheet, event: Event, _target: HTMLElement): void {
        void this.render({ parts: ['preview'] });
    }

    /**
     * Create an NPC from this template.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #createFromTemplate(this: NPCTemplateSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();

        const threatLevel = this.#previewThreat;
        const sys = this.item.system as unknown as NPCTemplateSystem;
        const systemData = sys.generateAtThreat(threatLevel);

        const actorData = {
            name: this.item.name,
            type: 'npcV2',
            img: this.item.img ?? 'icons/svg/mystery-man.svg',
            system: systemData,
        };

        try {
            const actor = (await (Actor as unknown as { create: (data: Record<string, unknown>) => Promise<Record<string, unknown> | null> }).create(
                actorData,
            )) as {
                name: string | null;
                sheet: { render: (force: boolean) => void } | null;
                createEmbeddedDocuments: (type: string, items: unknown[]) => Promise<unknown>;
            } | null;

            if (actor !== null) {
                // Create embedded traits and talents
                const itemsToCreate: Record<string, unknown>[] = [];

                for (const trait of sys.traits) {
                    if (trait.uuid !== '') {
                        const item = (await fromUuid(trait.uuid)) as ResolvedItem | null;
                        if (item !== null) {
                            itemsToCreate.push({
                                name: item.name,
                                type: item.type,
                                img: item.img,
                                system: foundry.utils.deepClone(item.system as Record<string, unknown>),
                            });
                        }
                    }
                }

                for (const talent of sys.talents) {
                    if (talent.uuid !== '') {
                        const item = (await fromUuid(talent.uuid)) as ResolvedItem | null;
                        if (item !== null) {
                            itemsToCreate.push({
                                name: item.name,
                                type: item.type,
                                img: item.img,
                                system: foundry.utils.deepClone(item.system as Record<string, unknown>),
                            });
                        }
                    }
                }

                if (itemsToCreate.length > 0) {
                    await actor.createEmbeddedDocuments('Item', itemsToCreate);
                }

                ui.notifications.info(`Created NPC: ${actor.name ?? 'Unknown'}`);
                actor.sheet?.render(true);
            }
        } catch (err) {
            console.error('Failed to create NPC from template:', err);
            ui.notifications.error('Failed to create NPC from template');
        }
    }
}
