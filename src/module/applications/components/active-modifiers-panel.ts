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

import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KBaseActorDocument, WH40KItemModifiers } from '../../types/global.d.ts';
import type { WH40KActiveEffect } from '../../documents/active-effect.ts';

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

type BaseWithOptions = {
    DEFAULT_OPTIONS?: { actions?: Record<string, unknown> };
};

type ActorSheetCtor = new (...args: any[]) => foundry.appv1.sheets.ActorSheet;

/**
 * Mixin that adds active modifiers panel to actor sheets
 */
export function ActiveModifiersMixin<TBase extends ActorSheetCtor>(Base: TBase) {
    const baseWithOptions = Base as unknown as BaseWithOptions;
    return class ActiveModifiersApplication extends Base {
        constructor(...args: any[]) {
            super(...args);
        }

        /** @override */
        static DEFAULT_OPTIONS = {
            ...(baseWithOptions.DEFAULT_OPTIONS ?? {}),
            actions: {
                ...(baseWithOptions.DEFAULT_OPTIONS?.actions ?? {}),
                toggleModifier: ActiveModifiersApplication.toggleModifier,
                viewModifierSource: ActiveModifiersApplication.viewModifierSource,
                toggleModifiersPanel: ActiveModifiersApplication.toggleModifiersPanel,
            },
        };

        /**
         * Panel collapsed state
         */
        #modifiersPanelCollapsed = false;

        /**
         * Toggle a modifier on/off (for optional modifiers)
         */
        static async toggleModifier(this: any, event: PointerEvent, target: HTMLElement): Promise<void> {
            const itemId = target.dataset.itemId;
            if (!itemId) return;

            const actor = this.actor as WH40KBaseActorDocument;
            const item = actor.items.get(itemId);
            if (!item) return;

            // Toggle the item's active state
            const system = item.system as { active?: boolean };
            const isActive = system.active ?? true;
            await item.update({ 'system.active': !isActive } as Record<string, unknown>);
        }

        /**
         * View the source item of a modifier
         */
        static viewModifierSource(this: any, event: PointerEvent, target: HTMLElement): void {
            const itemId = target.dataset.itemId;
            if (!itemId) return;

            const actor = this.actor as WH40KBaseActorDocument;
            const item = actor.items.get(itemId);
            if (item) {
                item.sheet?.render(true);
            }
        }

        /**
         * Toggle modifiers panel collapsed state
         */
        static toggleModifiersPanel(this: any, event: PointerEvent, target: HTMLElement): void {
            const instance = this as { '#modifiersPanelCollapsed': boolean; 'render': () => void };
            instance['#modifiersPanelCollapsed'] = !instance['#modifiersPanelCollapsed'];
            instance.render();
        }

        /**
         * Prepare active modifiers data for rendering
         */
        prepareActiveModifiers(): Record<string, unknown> {
            const actor = (this as unknown as { actor: WH40KBaseActorDocument }).actor;
            const modifiers: Record<string, unknown> = {
                conditions: [] as ModifierEntry[],
                talents: [] as ModifierEntry[],
                traits: [] as ModifierEntry[],
                equipment: [] as ModifierEntry[],
                effects: [] as ModifierEntry[],
                collapsed: this.#modifiersPanelCollapsed,
            };

            // Collect conditions
            const conditions = actor.items.filter((i) => i.type === 'condition');
            for (const condition of conditions) {
                const system = condition.system as Record<string, unknown>;
                (modifiers.conditions as ModifierEntry[]).push({
                    id: condition.id ?? '',
                    name: condition.name ?? '',
                    img: condition.img ?? undefined,
                    description: (system.description as string) || '',
                    duration: (system.duration as string) || 'Permanent',
                    stacks: (system.stacks as number) || 1,
                    nature: (system.nature as string) || 'neutral',
                    active: true,
                    canToggle: false,
                });
            }

            // Collect talents with modifiers
            const talents = actor.items.filter((i) => i.type === 'talent');
            for (const talent of talents) {
                const system = talent.system as Record<string, unknown>;
                const mods = system.modifiers as WH40KItemModifiers;
                if (mods && this.#hasActiveModifiers(mods)) {
                    (modifiers.talents as ModifierEntry[]).push({
                        id: talent.id ?? '',
                        name: (talent.system as any).fullName || (talent.name ?? ''),
                        img: talent.img ?? undefined,
                        description: this.#formatModifierDescription(mods),
                        duration: (system.isPassive as boolean) ? 'Passive' : 'Active',
                        active: (system.active as boolean) ?? true,
                        canToggle: !(system.isPassive as boolean),
                    });
                }
            }

            // Collect traits with modifiers
            const traits = actor.items.filter((i) => i.type === 'trait');
            for (const trait of traits) {
                const system = trait.system as Record<string, unknown>;
                const mods = system.modifiers as WH40KItemModifiers;
                if (mods && this.#hasActiveModifiers(mods)) {
                    (modifiers.traits as ModifierEntry[]).push({
                        id: trait.id ?? '',
                        name: trait.name ?? '',
                        img: trait.img ?? undefined,
                        description: this.#formatModifierDescription(mods),
                        duration: 'Permanent',
                        active: true,
                        canToggle: false,
                    });
                }
            }

            // Collect equipped items with bonuses
            const equipment = actor.items.filter((i) => ['weapon', 'armour', 'gear'].includes(i.type) && (i.system as any).equipped);
            for (const item of equipment) {
                const system = item.system as Record<string, unknown>;
                const mods = system.modifiers as WH40KItemModifiers;
                if (mods && this.#hasActiveModifiers(mods)) {
                    (modifiers.equipment as ModifierEntry[]).push({
                        id: item.id ?? '',
                        name: item.name ?? '',
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
                    const e = effect as unknown as WH40KActiveEffect;
                    (modifiers.effects as ModifierEntry[]).push({
                        id: e.id ?? '',
                        name: e.name ?? (e as unknown as { label?: string }).label ?? '',
                        img: e.img ?? (e as unknown as { icon?: string }).icon ?? undefined,
                        description: this.#formatEffectDescription(e),
                        duration: this.#formatEffectDuration(e),
                        active: !e.disabled,
                        canToggle: true,
                        isEffect: true,
                    });
                }
            }

            return modifiers;
        }

        #hasActiveModifiers(modifiers: WH40KItemModifiers): boolean {
            if (!modifiers) return false;

            if (modifiers.characteristics) {
                for (const value of Object.values(modifiers.characteristics)) {
                    if (value !== 0 && value !== null && value !== undefined) return true;
                }
            }

            if (modifiers.skills) {
                for (const value of Object.values(modifiers.skills)) {
                    if (value !== 0 && value !== null && value !== undefined) return true;
                }
            }

            if (modifiers.other && modifiers.other.length > 0) {
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

            if (modifiers.other && modifiers.other.length > 0) {
                for (const mod of modifiers.other) {
                    parts.push(`${mod.key} ${mod.value > 0 ? '+' : ''}${mod.value}`);
                }
            }

            return parts.join(', ') || 'Various modifiers';
        }

        #formatEffectDescription(effect: WH40KActiveEffect): string {
            const changes = effect.changes || [];
            if (changes.length === 0) return 'No changes';

            const parts = changes.map((change) => {
                const key = change.key.split('.').pop();
                return `${key} ${change.value}`;
            });

            return parts.join(', ');
        }

        #formatEffectDuration(effect: WH40KActiveEffect): string {
            if (!effect.duration?.rounds && !effect.duration?.seconds) {
                return 'Permanent';
            }

            const parts: string[] = [];
            if (effect.duration.rounds) {
                parts.push(`${effect.duration.rounds} rounds`);
            }
            if (effect.duration.seconds) {
                parts.push(`${effect.duration.seconds}s`);
            }

            return parts.join(', ');
        }
    };
}
