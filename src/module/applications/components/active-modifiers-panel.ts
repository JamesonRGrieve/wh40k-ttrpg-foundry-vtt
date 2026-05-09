/**
 * @file ActiveModifiersPanel - Displays active modifiers and their sources on character sheets
 *
 * Shows a panel of all active modifiers affecting an actor, including:
 * - Conditions and their effects
 * - Talent bonuses/penalties
 * - Trait modifiers
 * - Equipment bonuses
 * - Active effects
 *
 * Usage:
 * - Apply ActiveModifiersMixin to actor sheets
 * - Renders panel in overview/status tab
 * - Click sources to view item sheets
 * - Toggle optional modifiers on/off
 */

import type { WH40KActiveEffect } from '../../documents/active-effect.ts';
import type { WH40KBaseActorDocument, WH40KItemModifiers } from '../../types/global.d.ts';

interface ConditionSystem {
    description?: string;
    duration?: string;
    stacks?: number;
    nature?: string;
    modifiers?: WH40KItemModifiers;
}

interface TalentSystem {
    description?: string;
    fullName?: string;
    isPassive?: boolean;
    active?: boolean;
    modifiers?: WH40KItemModifiers;
}

interface EquippableSystem {
    equipped?: boolean;
    active?: boolean;
    modifiers?: WH40KItemModifiers;
}

interface ModifierEntry {
    id: string;
    name: string;
    img?: string;
    description: string;
    duration: string;
    active: boolean;
    canToggle: boolean;
    stacks?: number;
    nature?: string;
    isEffect?: boolean;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: actions table is a free-form record indexed by Foundry's action dispatcher
type BaseWithOptions = {
    DEFAULT_OPTIONS?: {
        // eslint-disable-next-line no-restricted-syntax -- boundary: actions table is a free-form record indexed by Foundry's action dispatcher
        actions?: Record<string, unknown>;
    };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin constructor signature must use any[] per TS mixin rule
type ActorSheetCtor = new (...args: any[]) => foundry.appv1.sheets.ActorSheet;

/**
 * Mixin that adds active modifiers panel to actor sheets
 */
export function ActiveModifiersMixin<TBase extends ActorSheetCtor>(Base: TBase): TBase {
    // eslint-disable-next-line no-restricted-syntax -- boundary: mixin host class lacks DEFAULT_OPTIONS in its declared type
    const baseWithOptions = Base as unknown as BaseWithOptions;
    return class ActiveModifiersApplication extends Base {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin constructor signature must use any[] per TS mixin rule
        constructor(...args: any[]) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- mixin constructor forwards untyped args
            super(...args);
        }

        /** @override */
        static DEFAULT_OPTIONS = {
            ...(baseWithOptions.DEFAULT_OPTIONS ?? {}),
            /* eslint-disable @typescript-eslint/unbound-method -- Foundry V2 actions table receives method references and rebinds `this` to the sheet instance at dispatch time */
            actions: {
                ...(baseWithOptions.DEFAULT_OPTIONS?.actions ?? {}),
                toggleModifier: ActiveModifiersApplication.toggleModifier,
                viewModifierSource: ActiveModifiersApplication.viewModifierSource,
                toggleModifiersPanel: ActiveModifiersApplication.toggleModifiersPanel,
            },
            /* eslint-enable @typescript-eslint/unbound-method */
        };

        /**
         * Panel collapsed state
         */
        readonly #modifiersPanelCollapsed = false;

        /**
         * Toggle a modifier on/off (for optional modifiers)
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin-internal action handler runs against host sheet whose concrete type is unknown to the mixin
        static async toggleModifier(this: any, event: PointerEvent, target: HTMLElement): Promise<void> {
            const itemId = target.dataset.itemId;
            if (itemId === undefined || itemId.length === 0) return;

            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- this is `any`-typed for mixin compat; actor is the host sheet's documented field
            const actor = this.actor as WH40KBaseActorDocument;
            const item = actor.items.get(itemId);
            if (!item) return;

            // Toggle the item's active state
            const system = item.system as { active?: boolean };
            const isActive = system.active ?? true;
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update accepts arbitrary path-keyed payloads
            await item.update({ 'system.active': !isActive });
        }

        /**
         * View the source item of a modifier
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin-internal action handler runs against host sheet whose concrete type is unknown to the mixin
        static viewModifierSource(this: any, event: PointerEvent, target: HTMLElement): void {
            const itemId = target.dataset.itemId;
            if (itemId === undefined || itemId.length === 0) return;

            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- this is `any`-typed for mixin compat; actor is the host sheet's documented field
            const actor = this.actor as WH40KBaseActorDocument;
            const item = actor.items.get(itemId);
            if (item) {
                // eslint-disable-next-line @typescript-eslint/no-deprecated, @typescript-eslint/no-floating-promises -- legacy ApplicationV1 render(true) is fire-and-forget by design
                item.sheet?.render(true);
            }
        }

        /**
         * Toggle modifiers panel collapsed state
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin-internal action handler runs against host sheet whose concrete type is unknown to the mixin
        static toggleModifiersPanel(this: any, event: PointerEvent, target: HTMLElement): void {
            const instance = this as { '#modifiersPanelCollapsed': boolean; 'render': () => void };
            instance['#modifiersPanelCollapsed'] = !instance['#modifiersPanelCollapsed'];
            instance.render();
        }

        /**
         * Prepare active modifiers data for rendering
         */
        // eslint-disable-next-line no-restricted-syntax, complexity -- boundary: returned shape is a free-form template payload; complexity is inherent to the per-category roll-up
        prepareActiveModifiers(): Record<string, unknown> {
            // eslint-disable-next-line no-restricted-syntax -- boundary: mixin host sheet's actor field is not in the mixin's type
            const actor = (this as unknown as { actor: WH40KBaseActorDocument }).actor;
            const conditionsList: ModifierEntry[] = [];
            const talentsList: ModifierEntry[] = [];
            const traitsList: ModifierEntry[] = [];
            const equipmentList: ModifierEntry[] = [];
            const effectsList: ModifierEntry[] = [];

            // Collect conditions
            const conditions = actor.items.filter((i) => i.type === 'condition');
            for (const condition of conditions) {
                const system = condition.system as ConditionSystem;
                conditionsList.push({
                    id: condition.id,
                    name: condition.name,
                    img: condition.img ?? undefined,
                    description: system.description ?? '',
                    duration: system.duration ?? 'Permanent',
                    stacks: system.stacks ?? 1,
                    nature: system.nature ?? 'neutral',
                    active: true,
                    canToggle: false,
                });
            }

            // Collect talents with modifiers
            const talents = actor.items.filter((i) => i.type === 'talent');
            for (const talent of talents) {
                const system = talent.system as TalentSystem;
                const mods = system.modifiers;
                if (mods !== undefined && this.#hasActiveModifiers(mods)) {
                    const fullName = system.fullName;
                    talentsList.push({
                        id: talent.id,
                        name: fullName !== undefined && fullName.length > 0 ? fullName : talent.name,
                        img: talent.img ?? undefined,
                        description: this.#formatModifierDescription(mods),
                        duration: system.isPassive === true ? 'Passive' : 'Active',
                        active: system.active ?? true,
                        canToggle: system.isPassive !== true,
                    });
                }
            }

            // Collect traits with modifiers
            const traits = actor.items.filter((i) => i.type === 'trait');
            for (const trait of traits) {
                const system = trait.system as TalentSystem;
                const mods = system.modifiers;
                if (mods !== undefined && this.#hasActiveModifiers(mods)) {
                    traitsList.push({
                        id: trait.id,
                        name: trait.name,
                        img: trait.img ?? undefined,
                        description: this.#formatModifierDescription(mods),
                        duration: 'Permanent',
                        active: true,
                        canToggle: false,
                    });
                }
            }

            // Collect equipped items with bonuses
            const equipment = actor.items.filter((i) => ['weapon', 'armour', 'gear'].includes(i.type) && (i.system as EquippableSystem).equipped === true);
            for (const item of equipment) {
                const system = item.system as EquippableSystem;
                const mods = system.modifiers;
                if (mods !== undefined && this.#hasActiveModifiers(mods)) {
                    equipmentList.push({
                        id: item.id,
                        name: item.name,
                        img: item.img ?? undefined,
                        description: this.#formatModifierDescription(mods),
                        duration: 'While Equipped',
                        active: true,
                        canToggle: false,
                    });
                }
            }

            // Collect active effects
            for (const effect of actor.effects) {
                if (!effect.disabled) {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry effect type narrows to system-augmented WH40KActiveEffect
                    const e = effect as unknown as WH40KActiveEffect;
                    // eslint-disable-next-line no-restricted-syntax -- boundary: legacy ActiveEffect API uses `label`/`icon` fields not present in the V14 type
                    const legacy = e as unknown as { label?: string; icon?: string };
                    effectsList.push({
                        id: e.id ?? '',
                        name: e.name.length > 0 ? e.name : legacy.label ?? '',
                        img: (e.img !== null && e.img.length > 0 ? e.img : legacy.icon) ?? undefined,
                        description: this.#formatEffectDescription(e),
                        duration: this.#formatEffectDuration(e),
                        active: !e.disabled,
                        canToggle: true,
                        isEffect: true,
                    });
                }
            }

            return {
                conditions: conditionsList,
                talents: talentsList,
                traits: traitsList,
                equipment: equipmentList,
                effects: effectsList,
                collapsed: this.#modifiersPanelCollapsed,
            };
        }

        #hasActiveModifiers(modifiers: WH40KItemModifiers): boolean {
            if (modifiers.characteristics) {
                for (const value of Object.values(modifiers.characteristics)) {
                    if (value !== 0) return true;
                }
            }

            if (modifiers.skills) {
                for (const value of Object.values(modifiers.skills)) {
                    if (value !== 0) return true;
                }
            }

            if (modifiers.other !== undefined && modifiers.other.length > 0) {
                return true;
            }

            return false;
        }

        #formatModifierDescription(modifiers: WH40KItemModifiers): string {
            const parts: string[] = [];

            if (modifiers.characteristics) {
                for (const [char, value] of Object.entries(modifiers.characteristics)) {
                    if (value) {
                        const numVal = Number(value);
                        parts.push(`${char.toUpperCase()} ${numVal > 0 ? '+' : ''}${numVal}`);
                    }
                }
            }

            if (modifiers.skills) {
                for (const [skill, value] of Object.entries(modifiers.skills)) {
                    if (value) {
                        const numVal = Number(value);
                        parts.push(`${skill} ${numVal > 0 ? '+' : ''}${numVal}`);
                    }
                }
            }

            if (modifiers.other !== undefined && modifiers.other.length > 0) {
                for (const mod of modifiers.other) {
                    parts.push(`${mod.key} ${mod.value > 0 ? '+' : ''}${mod.value}`);
                }
            }

            return parts.length > 0 ? parts.join(', ') : 'Various modifiers';
        }

        #formatEffectDescription(effect: WH40KActiveEffect): string {
            const changes = effect.changes;
            if (changes.length === 0) return 'No changes';

            const parts = changes.map((change) => {
                const key = change.key.split('.').pop();
                return `${key} ${change.value}`;
            });

            return parts.join(', ');
        }

        #formatEffectDuration(effect: WH40KActiveEffect): string {
            const rounds = effect.duration.rounds;
            const seconds = effect.duration.seconds;
            if ((rounds === undefined || rounds === null || rounds === 0) && (seconds === undefined || seconds === null || seconds === 0)) {
                return 'Permanent';
            }

            const parts: string[] = [];
            if (rounds !== undefined && rounds !== null && rounds > 0) {
                parts.push(`${rounds} rounds`);
            }
            if (seconds !== undefined && seconds !== null && seconds > 0) {
                parts.push(`${seconds}s`);
            }

            return parts.join(', ');
        }
    };
}
