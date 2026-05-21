import type { Meta, StoryObj } from '@storybook/html-vite';
import HandlebarsLib from 'handlebars';
import assignDamageChatSrc from '../../src/templates/chat/assign-damage-chat.hbs?raw';
import { renderTemplate as renderStoryTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

/**
 * Chat-card story for the DW Horde Magnitude resolution path (#166 —
 * core.md p. 359 "Damaging a Horde"). When AssignDamageData sees a
 * horde target on the DW ruleset, it replaces the wounds card with a
 * Magnitude delta card. Stories exercise each TABLE 13-1 tier so the
 * per-system theme cascade and the RAW math are both visible in review.
 */
initializeStoryHandlebars();

const assignDamageTemplate = HandlebarsLib.compile(assignDamageChatSrc);

interface HordeMagnitudeCardArgs {
    actorName: string;
    gameSystem: string;
    magnitudeBefore: number;
    magnitudeAfter: number;
    magnitudeLost: number;
    damageType: string;
    isExplosive: boolean;
}

interface HordeMagnitudeCardContext {
    gameSystem: string;
    actor: { name: string; system: { wounds: { value: string; max: string; critical: string }; fatigue: { value: string; max: string } } };
    hit: { location: string; damageType: string };
    hasDamage: boolean;
    hasCriticalDamage: boolean;
    hasFatigueDamage: boolean;
    hasHordeDamage: boolean;
    magnitudeBefore: number;
    magnitudeAfter: number;
    magnitudeLost: number;
}

function buildContext(args: HordeMagnitudeCardArgs): HordeMagnitudeCardContext {
    return {
        gameSystem: args.gameSystem,
        actor: { name: args.actorName, system: { wounds: { value: '—', max: '—', critical: '—' }, fatigue: { value: '—', max: '—' } } },
        hit: { location: 'Horde', damageType: args.damageType },
        hasDamage: false,
        hasCriticalDamage: false,
        hasFatigueDamage: false,
        hasHordeDamage: true,
        magnitudeBefore: args.magnitudeBefore,
        magnitudeAfter: args.magnitudeAfter,
        magnitudeLost: args.magnitudeLost,
    };
}

const meta: Meta<HordeMagnitudeCardArgs> = {
    title: 'Chat/DW Horde Magnitude (#166)',
    render: (args) => renderStoryTemplate(assignDamageTemplate, buildContext(args)),
    args: {
        actorName: 'Tyranid Hormagaunt Horde',
        gameSystem: 'dw',
        magnitudeBefore: 30,
        magnitudeAfter: 29,
        magnitudeLost: 1,
        damageType: 'Impact',
        isExplosive: false,
    },
};
export default meta;

type Story = StoryObj<HordeMagnitudeCardArgs>;

export const MobOneHit: Story = {
    name: 'Mob (Magnitude 30) — 1 Magnitude lost on a regular hit',
};

export const MobExplosive: Story = {
    name: 'Mob (Magnitude 30) — Explosive removes 2 (RAW: counts as extra hit)',
    args: {
        magnitudeBefore: 30,
        magnitudeAfter: 28,
        magnitudeLost: 2,
        damageType: 'Explosive',
        isExplosive: true,
    },
};

export const Throng: Story = {
    name: 'Throng (Magnitude 60) — 1 Magnitude lost',
    args: {
        actorName: 'Chaos Heretic Throng',
        magnitudeBefore: 60,
        magnitudeAfter: 59,
        magnitudeLost: 1,
    },
};

export const Monumental: Story = {
    name: 'Monumental (Magnitude 90) — 1 Magnitude lost',
    args: {
        actorName: 'Ork Boyz Massed Assault',
        magnitudeBefore: 90,
        magnitudeAfter: 89,
        magnitudeLost: 1,
    },
};

export const TitanicTide: Story = {
    name: 'Titanic (Magnitude 120) — 1 Magnitude lost',
    args: {
        actorName: 'Tyranid Hormagaunt Tide',
        magnitudeBefore: 120,
        magnitudeAfter: 119,
        magnitudeLost: 1,
    },
};

export const BrokenThreshold: Story = {
    name: 'Below 25% threshold — Magnitude 7 → 6 (will auto-break next turn)',
    args: {
        magnitudeBefore: 7,
        magnitudeAfter: 6,
        magnitudeLost: 1,
    },
};
