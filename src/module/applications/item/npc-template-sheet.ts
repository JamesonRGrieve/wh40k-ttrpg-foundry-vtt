/**
 * @file NPCTemplateSheet - Item sheet for NPC templates
 * Phase 7: Template System
 */

import type NPCTemplateData from '../../data/item/npc-template.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import BaseItemSheet from './base-item-sheet.ts';

/** NPCTemplate items expose NPCTemplateData on `system`. */
type NPCTemplateItem = WH40KItemDocument & {
    system: NPCTemplateData;
};

/* eslint-disable no-restricted-syntax -- boundary: external Foundry document shapes resolved from UUID / Actor.create */
interface ResolvedItem {
    name: string;
    type: string;
    img: string;
    system: Record<string, unknown>;
}

interface CreatedActor {
    name: string | null;
    sheet: { render: (force: boolean) => unknown } | null;
    createEmbeddedDocuments: (type: string, items: Array<Record<string, unknown>>) => Promise<unknown>;
}
/* eslint-enable no-restricted-syntax */

/** Tab label localization keys, hoisted so the static TABS entries reference identifiers. */
const TAB_LABEL_BASICS = 'WH40K.NPC.Template.Tabs.Basics';
const TAB_LABEL_CHARACTERISTICS = 'WH40K.NPC.Template.Tabs.Characteristics';
const TAB_LABEL_EQUIPMENT = 'WH40K.NPC.Template.Tabs.Equipment';
const TAB_LABEL_ABILITIES = 'WH40K.NPC.Template.Tabs.Abilities';
const TAB_LABEL_PREVIEW = 'WH40K.NPC.Template.Tabs.Preview';

/**
 * Item sheet for npcTemplate type items.
 * Provides a template editor UI for creating reusable NPC configurations.
 *
 * @extends {BaseItemSheet}
 */
export default class NPCTemplateSheet extends BaseItemSheet {
    /** Narrow the inherited item document to its npcTemplate DataModel shape. */
    override get item(): NPCTemplateItem {
        return super.item as NPCTemplateItem;
    }

    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
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
    /* eslint-enable @typescript-eslint/unbound-method */

    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    static override PARTS = {
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
    static override TABS = [
        { tab: 'basics', group: 'primary', icon: 'fa-solid fa-user', label: TAB_LABEL_BASICS },
        { tab: 'characteristics', group: 'primary', icon: 'fa-solid fa-chart-bar', label: TAB_LABEL_CHARACTERISTICS },
        { tab: 'equipment', group: 'primary', icon: 'fa-solid fa-swords', label: TAB_LABEL_EQUIPMENT },
        { tab: 'abilities', group: 'primary', icon: 'fa-solid fa-sparkles', label: TAB_LABEL_ABILITIES },
        { tab: 'preview', group: 'primary', icon: 'fa-solid fa-eye', label: TAB_LABEL_PREVIEW },
    ];

    /* -------------------------------------------- */

    /** @override */
    override tabGroups = {
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
            const tabEntry = tabs[tabDef.tab];
            if (tabDef.tab in tabs && tabEntry !== undefined) {
                tabEntry['icon'] = tabDef.icon;
            }
        }

        return tabs;
    }

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        const sys = this.item.system;

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
        const baseChars = sys.baseCharacteristics;
        const characteristics = [
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
            value: baseChars[c.key as keyof typeof baseChars],
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
     */
    static async #addSkill(this: NPCTemplateSheet, event: PointerEvent, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        const skills = foundry.utils.deepClone(this.item.system.trainedSkills);
        skills.push({
            key: 'awareness',
            name: 'Awareness',
            characteristic: 'perception',
            level: 'trained',
        });

        await this.item.update({ 'system.trainedSkills': skills });
    }

    /**
     * Remove a trained skill.
     */
    static async #removeSkill(this: NPCTemplateSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const index = parseInt(target.dataset['index'] ?? '', 10);
        if (isNaN(index)) return;

        const skills = foundry.utils.deepClone(this.item.system.trainedSkills);
        skills.splice(index, 1);

        await this.item.update({ 'system.trainedSkills': skills });
    }

    /**
     * Add a custom weapon.
     */
    static async #addWeapon(this: NPCTemplateSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        const weapons = foundry.utils.deepClone(this.item.system.customWeapons);
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

        await this.item.update({ 'system.customWeapons': weapons });
    }

    /**
     * Remove a custom weapon.
     */
    static async #removeWeapon(this: NPCTemplateSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const index = parseInt(target.dataset['index'] ?? '', 10);
        if (isNaN(index)) return;

        const weapons = foundry.utils.deepClone(this.item.system.customWeapons);
        weapons.splice(index, 1);

        await this.item.update({ 'system.customWeapons': weapons });
    }

    /**
     * Add a trait.
     */
    static async #addTrait(this: NPCTemplateSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        const traits = foundry.utils.deepClone(this.item.system.traits);
        traits.push({
            uuid: '',
            name: 'New Trait',
            description: '',
        });

        await this.item.update({ 'system.traits': traits });
    }

    /**
     * Remove a trait.
     */
    static async #removeTrait(this: NPCTemplateSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const index = parseInt(target.dataset['index'] ?? '', 10);
        if (isNaN(index)) return;

        const traits = foundry.utils.deepClone(this.item.system.traits);
        traits.splice(index, 1);

        await this.item.update({ 'system.traits': traits });
    }

    /**
     * Add a talent.
     */
    static async #addTalent(this: NPCTemplateSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        const talents = foundry.utils.deepClone(this.item.system.talents);
        talents.push({
            uuid: '',
            name: 'New Talent',
            description: '',
        });

        await this.item.update({ 'system.talents': talents });
    }

    /**
     * Remove a talent.
     */
    static async #removeTalent(this: NPCTemplateSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const index = parseInt(target.dataset['index'] ?? '', 10);
        if (isNaN(index)) return;

        const talents = foundry.utils.deepClone(this.item.system.talents);
        talents.splice(index, 1);

        await this.item.update({ 'system.talents': talents });
    }

    /**
     * Add a variant.
     */
    static async #addVariant(this: NPCTemplateSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        const variants = foundry.utils.deepClone(this.item.system.variants);
        variants.push({
            name: 'New Variant',
            description: '',
            threatModifier: 0,
            characteristicModifiers: {},
            additionalEquipment: [],
            additionalTraits: [],
            additionalTalents: [],
        });

        await this.item.update({ 'system.variants': variants });
    }

    /**
     * Remove a variant.
     */
    static async #removeVariant(this: NPCTemplateSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const index = parseInt(target.dataset['index'] ?? '', 10);
        if (isNaN(index)) return;

        const variants = foundry.utils.deepClone(this.item.system.variants);
        variants.splice(index, 1);

        await this.item.update({ 'system.variants': variants });
    }

    /**
     * Update preview.
     */
    static #updatePreview(this: NPCTemplateSheet, _event: Event, _target: HTMLElement): void {
        void this.render({ parts: ['preview'] });
    }

    /**
     * Create an NPC from this template.
     */
    static async #createFromTemplate(this: NPCTemplateSheet, event: PointerEvent, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        const threatLevel = this.#previewThreat;
        const sys = this.item.system;
        const systemData = sys.generateAtThreat(threatLevel);

        const actorData = {
            name: this.item.name,
            type: 'npcV2',
            img: this.item.img ?? 'icons/svg/mystery-man.svg',
            system: systemData,
        };

        try {
            // boundary: Foundry's `Actor.create` lacks a typed payload for arbitrary system schemas.
            // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/unbound-method -- boundary: typed signature for static Actor.create
            const actor = (await (Actor.create as (data: Record<string, unknown>) => Promise<unknown>)(actorData)) as CreatedActor | null;

            if (actor !== null) {
                // Resolve all trait/talent UUIDs in parallel
                const uuids = [...sys.traits, ...sys.talents].map((ref) => ref.uuid).filter((uuid): uuid is string => uuid !== undefined && uuid !== '');
                const resolved = await Promise.all(uuids.map(async (uuid) => (await fromUuid(uuid)) as ResolvedItem | null));
                const itemsToCreate: Array<Record<string, unknown>> = resolved
                    .filter((item): item is ResolvedItem => item !== null)
                    .map((item) => ({
                        name: item.name,
                        type: item.type,
                        img: item.img,
                        system: foundry.utils.deepClone(item.system),
                    }));

                if (itemsToCreate.length > 0) {
                    await actor.createEmbeddedDocuments('Item', itemsToCreate);
                }

                ui.notifications.info(`Created NPC: ${actor.name ?? 'Unknown'}`);
                actor.sheet?.render(true);
            }
        } catch (err) {
            console.error('Failed to create NPC from template:', err);
            ui.notifications.error(game.i18n.localize('WH40K.NPC.Template.CreateError'));
        }
    }
}
