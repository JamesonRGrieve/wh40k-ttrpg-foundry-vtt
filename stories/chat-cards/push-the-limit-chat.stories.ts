import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import { resolvePushTheLimit } from '../../src/module/rules/without-talents.ts';
import pushChatSrc from '../../src/templates/chat/push-the-limit-chat.hbs?raw';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

/**
 * Chat-card story for the Push the Limit Operate-test outcome card
 * (#101 — without.md p. 62). Three canonical outcomes from the pure
 * `resolvePushTheLimit()` resolver:
 *
 *   1. Bonus applied, test succeeds — clean +20 win.
 *   2. Bonus applied, test fails by 4+ DoF — Motive Systems critical.
 *   3. Bonus applied, living mount fails by 5 — Impact Leg critical.
 *
 * The card carries `data-wh40k-system` so per-system Tailwind variants
 * fire even though chat lives outside the sheet root.
 */
initializeStoryHandlebars();

const pushChatTemplate = Handlebars.compile(pushChatSrc);

function cardContext(
    result: ReturnType<typeof resolvePushTheLimit>,
    extras: { actorName: string; success: boolean; degrees: number },
): Record<string, unknown> {
    return {
        gameSystem: 'dh2e',
        actorName: extras.actorName,
        invoked: result.invoked,
        modifier: result.modifier,
        success: extras.success,
        degrees: extras.degrees,
        triggersCritical: result.triggersCritical,
        criticalTableKey:
            result.criticalTable === 'motive-systems'
                ? 'WH40K.WithoutTalents.PushTheLimit.MotiveSystemsTable'
                : result.criticalTable === 'impact-leg'
                ? 'WH40K.WithoutTalents.PushTheLimit.ImpactLegTable'
                : '',
    };
}

const meta: Meta = {
    title: 'Chat/Push the Limit (#101)',
};
export default meta;

type Story = StoryObj;

export const SuccessWithBonus: Story = {
    name: '+20 invoked — Operate test passes by 2',
    render: () =>
        renderTemplate(
            pushChatTemplate,
            cardContext(
                resolvePushTheLimit({
                    invoke: true,
                    alreadyUsedThisRound: false,
                    rawDegrees: 2,
                    success: true,
                    livingMount: false,
                }),
                { actorName: 'Acolyte Drake', success: true, degrees: 2 },
            ),
        ),
    play: async ({ canvasElement }) => {
        expect(canvasElement.querySelector('.wh40k-push-the-limit-card')).toBeTruthy();
        expect(canvasElement.querySelector('[data-wh40k-system="dh2e"]')).toBeTruthy();
    },
};

export const MotiveSystemsCritical: Story = {
    name: 'Catastrophic failure — Motive Systems critical (vehicle)',
    render: () =>
        renderTemplate(
            pushChatTemplate,
            cardContext(
                resolvePushTheLimit({
                    invoke: true,
                    alreadyUsedThisRound: false,
                    rawDegrees: 4,
                    success: false,
                    livingMount: false,
                }),
                { actorName: 'Acolyte Drake', success: false, degrees: 4 },
            ),
        ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText(/WH40K\.WithoutTalents\.PushTheLimit\.CriticalLabel/)).toBeTruthy();
        expect(canvas.getByText(/WH40K\.WithoutTalents\.PushTheLimit\.MotiveSystemsTable/)).toBeTruthy();
    },
};

export const ImpactLegCritical: Story = {
    name: 'Catastrophic failure — Impact Leg critical (living mount)',
    render: () =>
        renderTemplate(
            pushChatTemplate,
            cardContext(
                resolvePushTheLimit({
                    invoke: true,
                    alreadyUsedThisRound: false,
                    rawDegrees: 5,
                    success: false,
                    livingMount: true,
                }),
                { actorName: 'Acolyte Drake', success: false, degrees: 5 },
            ),
        ),
};

export const NotInvoked: Story = {
    name: 'Talent not invoked — raw test',
    render: () =>
        renderTemplate(
            pushChatTemplate,
            cardContext(
                resolvePushTheLimit({
                    invoke: false,
                    alreadyUsedThisRound: false,
                    rawDegrees: 1,
                    success: true,
                    livingMount: false,
                }),
                { actorName: 'Acolyte Drake', success: true, degrees: 1 },
            ),
        ),
};
