/**
 * Storybook stories for the OW Battlefield Awareness chat card
 * (#161 — core.md §"BATTLEFIELD AWARENESS AND MANOEUVRES" line 13361,
 * §"Support" line 13411; §"CREATING REGIMENTAL AWARDS" line 13103).
 *
 * Payloads come straight from `requestSupport()` so any change to the
 * effective-target arithmetic / arrival timing surfaces visually here
 * first.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { randomId, seedRandom, type SystemId } from '../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import { requestSupport, type SupportAssetDef, type SupportAssetKind } from '../../module/rules/ow-battlefield-support';
import cardSrc from './ow-battlefield-chat.hbs?raw';

initializeStoryHandlebars();

const rng = seedRandom(0xba771e);

const ASSET_NAME_KEY: Readonly<Record<SupportAssetKind, string>> = {
    'artillery': 'WH40K.OW.Battlefield.Support.Asset.Artillery',
    'air-strike': 'WH40K.OW.Battlefield.Support.Asset.AirStrike',
    'reinforcements': 'WH40K.OW.Battlefield.Support.Asset.Reinforcements',
    'orbital': 'WH40K.OW.Battlefield.Support.Asset.Orbital',
};

interface BaseCtx {
    gameSystem: 'ow';
    actor: { name: string };
}

interface RequestEvent {
    kind: 'request';
    assetKind: SupportAssetKind;
    assetNameKey: string;
    successful: boolean;
    effectiveTarget: number;
    roll: number;
    turnsUntilArrival: number | null;
    cooldownAfter: number;
}

interface AwardEvent {
    kind: 'award';
    awardId: string;
    toggledOn: boolean;
    rosterSize: number;
}

interface BattlefieldChatCtx extends BaseCtx {
    event: RequestEvent | AwardEvent;
}

const BASE: BaseCtx = {
    gameSystem: 'ow',
    actor: { name: 'Trooper Halden, 99th Cadian' },
};

function requestContext(opts: { asset: SupportAssetDef; currentLogisticsTarget: number; roll: number }): BattlefieldChatCtx {
    const result = requestSupport({ asset: opts.asset, currentLogisticsTarget: opts.currentLogisticsTarget, roll: opts.roll });
    return {
        ...BASE,
        event: {
            kind: 'request',
            assetKind: opts.asset.kind,
            assetNameKey: ASSET_NAME_KEY[opts.asset.kind],
            successful: result.successful,
            effectiveTarget: result.effectiveTarget,
            roll: opts.roll,
            turnsUntilArrival: result.turnsUntilArrival ?? null,
            cooldownAfter: result.successful ? opts.asset.cooldownTurns : 0,
        },
    };
}

function awardContext(opts: { awardId: string; toggledOn: boolean; rosterSize: number }): BattlefieldChatCtx {
    return {
        ...BASE,
        event: {
            kind: 'award',
            awardId: opts.awardId,
            toggledOn: opts.toggledOn,
            rosterSize: opts.rosterSize,
        },
    };
}

function renderCard(ctx: BattlefieldChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

const meta: Meta<BattlefieldChatCtx> = {
    title: 'Chat/OwBattlefieldChat',
};
export default meta;
type Story = StoryObj<BattlefieldChatCtx>;

export const RequestArtillerySuccess: Story = {
    name: 'Request — Artillery, request succeeded',
    args: requestContext({
        asset: { id: 'asset-arty', kind: 'artillery', logisticsModifier: -10, cooldownTurns: 4 },
        currentLogisticsTarget: 50,
        roll: 35,
    }),
    render: (args) => renderCard(args),
};

export const RequestOrbitalFailure: Story = {
    name: 'Request — Orbital Bombardment, request failed',
    args: requestContext({
        asset: { id: 'asset-orb', kind: 'orbital', logisticsModifier: -30, cooldownTurns: 6 },
        currentLogisticsTarget: 40,
        roll: 75,
    }),
    render: (args) => renderCard(args),
};

export const AwardConferred: Story = {
    name: 'Award — Cadian Valour commendation conferred',
    args: awardContext({ awardId: 'award-cadian-valour', toggledOn: true, rosterSize: 2 }),
    render: (args) => renderCard(args),
};

export const AwardRevoked: Story = {
    name: 'Award — Purgation Cross revoked',
    args: awardContext({ awardId: 'award-purgation-cross', toggledOn: false, rosterSize: 1 }),
    render: (args) => renderCard(args),
};

// ── Per-system homologation ──────────────────────────────────────────────────
//
// The Battlefield Awareness rules are Only War content, but the card renders
// through the shared `modern-card-shell` whose frame carries a per-system
// border / title variant chain gated on `data-wh40k-system="{{gameSystem}}"`.
// Render the same successful Artillery request under each of the seven system
// ids so the shared chat-card chrome is proven to cascade for every line, not
// just `ow`. Seeded ids keep the screenshot diff deterministic.
//
// `BaseCtx.gameSystem` is locked to the literal `'ow'` for the OW-content
// stories above; the per-system frame variant carries its own context shape
// with a widened `gameSystem` so those stories keep their precise type.

interface PerSystemBattlefieldCtx {
    gameSystem: SystemId;
    actor: { name: string };
    event: BattlefieldChatCtx['event'];
}

function renderPerSystemCard(ctx: PerSystemBattlefieldCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = ctx.gameSystem;
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

const ALL_SYSTEM_IDS: readonly SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

function perSystemRequestCtx(gameSystem: SystemId): PerSystemBattlefieldCtx {
    const base = requestContext({
        asset: { id: randomId('asset-arty', rng), kind: 'artillery', logisticsModifier: -10, cooldownTurns: 4 },
        currentLogisticsTarget: 50,
        roll: 35,
    });
    return {
        gameSystem,
        actor: base.actor,
        event: base.event,
    };
}

export const PerSystemFrames: Story = {
    name: 'Per-system — Battlefield card frame across all 7 lines',
    render: () => {
        const container = document.createElement('div');
        container.className = 'tw-flex tw-flex-col tw-gap-3';
        for (const systemId of ALL_SYSTEM_IDS) {
            container.appendChild(renderPerSystemCard(perSystemRequestCtx(systemId)));
        }
        return container;
    },
};
