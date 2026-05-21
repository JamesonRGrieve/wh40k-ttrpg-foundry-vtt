/**
 * Unit tests for the extracted ActiveEffect action handlers.
 *
 * These previously lived as #-prefixed static methods triplicated across
 * CharacterSheet / BaseActorSheet / BaseItemSheet. The tests stub the
 * structural owner / effect shapes and verify the resolve-then-act mechanic:
 * id resolution (closest + self fallback), create payload merge, and the
 * edit / delete / toggle dispatches.
 */

import { describe, expect, it, vi } from 'vitest';
import * as EffectActions from '../src/module/applications/api/effect-actions.ts';
import type { ActiveEffectLike, EffectsOwner } from '../src/module/applications/api/effect-actions.ts';

interface MockEffect {
    name: string;
    disabled: boolean;
    sheet: { render: ReturnType<typeof vi.fn> };
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
}

function makeEffect(over: Partial<Pick<MockEffect, 'name' | 'disabled'>> = {}): MockEffect {
    return {
        name: 'Test Effect',
        disabled: false,
        sheet: { render: vi.fn() },
        update: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        ...over,
    };
}

function makeOwner(effect?: MockEffect): EffectsOwner & { createEmbeddedDocuments: ReturnType<typeof vi.fn> } {
    return {
        uuid: 'Item.abc',
        effects: {
            // eslint-disable-next-line no-restricted-syntax -- boundary: MockEffect structurally satisfies ActiveEffectLike; full ActiveEffect interface is the Foundry document type
            get: (id: string): ActiveEffectLike | undefined => (id === 'eff1' ? (effect as unknown as ActiveEffectLike) : undefined),
        },
        createEmbeddedDocuments: vi.fn().mockResolvedValue([]),
    };
}

function targetWith(id: string | null, wrap = false): HTMLElement {
    const el = document.createElement('div');
    if (id !== null) el.dataset['effectId'] = id;
    if (!wrap) return el;
    const child = document.createElement('i');
    el.appendChild(child);
    return child;
}

describe('effectIdFromTarget', () => {
    it('resolves from the element itself', () => {
        expect(EffectActions.effectIdFromTarget(targetWith('eff1'))).toBe('eff1');
    });
    it('resolves from a closest ancestor when clicked on a child', () => {
        expect(EffectActions.effectIdFromTarget(targetWith('eff1', true))).toBe('eff1');
    });
    it('returns undefined when absent or empty', () => {
        expect(EffectActions.effectIdFromTarget(targetWith(null))).toBeUndefined();
        expect(EffectActions.effectIdFromTarget(targetWith(''))).toBeUndefined();
    });
});

describe('resolveEffect', () => {
    it('returns the matching effect', () => {
        const eff = makeEffect();
        // eslint-disable-next-line no-restricted-syntax -- boundary: MockEffect structurally satisfies ActiveEffectLike; full ActiveEffect interface is the Foundry document type
        expect(EffectActions.resolveEffect(makeOwner(eff), targetWith('eff1'))).toBe(eff as unknown as ActiveEffectLike);
    });
    it('returns undefined for unknown / missing id', () => {
        expect(EffectActions.resolveEffect(makeOwner(makeEffect()), targetWith('nope'))).toBeUndefined();
        expect(EffectActions.resolveEffect(makeOwner(makeEffect()), targetWith(null))).toBeUndefined();
    });
});

describe('createEffect', () => {
    it('merges caller overrides over the defaults and forwards the operation', async () => {
        const owner = makeOwner();
        await EffectActions.createEffect(owner, { origin: owner.uuid, disabled: true }, { renderSheet: true });
        expect(owner.createEmbeddedDocuments).toHaveBeenCalledWith(
            'ActiveEffect',
            [{ name: 'New Effect', img: 'icons/svg/aura.svg', origin: 'Item.abc', disabled: true }],
            { renderSheet: true },
        );
    });
});

describe('effectEdit / effectDelete / effectToggle', () => {
    it('effectEdit renders the effect sheet', () => {
        const eff = makeEffect();
        EffectActions.effectEdit.call({ effectsOwner: makeOwner(eff) }, new Event('click'), targetWith('eff1'));
        expect(eff.sheet.render).toHaveBeenCalledWith(true);
    });

    it('effectDelete deletes the resolved effect', async () => {
        const eff = makeEffect();
        await EffectActions.effectDelete.call({ effectsOwner: makeOwner(eff) }, new Event('click'), targetWith('eff1'));
        expect(eff.delete).toHaveBeenCalledOnce();
    });

    it('effectToggle flips disabled', async () => {
        const eff = makeEffect({ disabled: false });
        await EffectActions.effectToggle.call({ effectsOwner: makeOwner(eff) }, new Event('click'), targetWith('eff1'));
        expect(eff.update).toHaveBeenCalledWith({ disabled: true });
    });

    it('effectToggle is a no-op when the effect is missing', async () => {
        const owner = makeOwner(makeEffect());
        await EffectActions.effectToggle.call({ effectsOwner: owner }, new Event('click'), targetWith('missing'));
        // nothing resolved → no update on any effect (owner.get returns undefined)
        expect(owner.createEmbeddedDocuments).not.toHaveBeenCalled();
    });
});
