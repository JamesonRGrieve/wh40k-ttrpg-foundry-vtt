/**
 * Storybook stories for the Daemonic Immunities badge (issue #143).
 *
 * The badge renders into the actor sheet sidebar header whenever the
 * actor carries the Daemonic trait. DH2 Errata L69-73 makes the trait
 * grant disease + poison immunity plus the Undying revival rider; the
 * pill summarises all three on one line, and the tooltip elaborates.
 *
 * The companion vitest suite covers the rules predicates
 * (`src/module/rules/daemonic-immunities.test.ts`). These stories
 * exist for visual review of the badge in isolation.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import badgeSrc from '../../src/templates/actor/partial/daemonic-immunities-badge.hbs?raw';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

initializeStoryHandlebars();

interface BadgeContext {
    /** Reserved — the badge consumes no context fields; carried so the
     *  Storybook arg-types panel has a non-empty shape. */
    _: never;
}

const badgeTpl = Handlebars.compile(badgeSrc);

function renderBadge(): HTMLElement {
    return renderTemplate(badgeTpl, {});
}

const meta: Meta<BadgeContext> = {
    title: 'Actor/Panels/DaemonicImmunitiesBadge',
};
export default meta;
type Story = StoryObj<BadgeContext>;

export const Default: Story = {
    name: 'Daemonic — disease/poison immunity + Undying',
    render: () => renderBadge(),
};
