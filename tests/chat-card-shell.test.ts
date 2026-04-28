/**
 * Smoke + HTML-equivalence tests for the chat-card shell partial.
 *
 * The shell wraps the common outer / header / body / footer pattern shared by
 * the legacy `wh40k-chat-card` family (condition-card, critical-injury-card,
 * movement-card, etc). When `legacyClasses=true` (default) it emits both the
 * new BEM class names (`wh40k-card__header`, `wh40k-card__body`, …) AND the
 * legacy ones (`wh40k-card-header`, `wh40k-card-body`, …), so already-rendered
 * chat messages keep their CSS targeting.
 *
 * The HTML-equivalence tests compare the structural DOM produced by the new
 * shell against fixtures derived from the legacy templates: same tag names,
 * same data attributes, same text content, same legacy class names present.
 * Whitespace and attribute ordering are allowed to differ.
 */

import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import { initializeStoryHandlebars } from '../stories/template-support';
import shellSrc from '../src/templates/chat/partial/chat-card-shell.hbs?raw';

initializeStoryHandlebars();

Handlebars.registerPartial('chat-card-shell', shellSrc);

function dom(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

describe('chat-card-shell partial — basic structural contract', () => {
    it('emits outer card div with the configured cardClass and outerExtraClass', () => {
        const tpl = Handlebars.compile(
            '{{#> chat-card-shell cardClass="wh40k-condition-card" outerExtraClass="tw-overflow-hidden tw-rounded-md" title="Stunned"}}body content{{/chat-card-shell}}',
        );
        const html = tpl({});
        const root = dom(html);
        const card = root.querySelector('.wh40k-chat-card');
        expect(card).not.toBeNull();
        expect(card?.classList.contains('wh40k-condition-card')).toBe(true);
        expect(card?.classList.contains('tw-overflow-hidden')).toBe(true);
        expect(card?.classList.contains('tw-rounded-md')).toBe(true);
    });

    it('renders header with image, title, and badges when provided', () => {
        const tpl = Handlebars.compile(
            '{{#> chat-card-shell cardClass="wh40k-condition-card" image="/img/test.png" imageAlt="Test" title="Stunned" subtitle="Status Effect" badges=badges}}body{{/chat-card-shell}}',
        );
        const html = tpl({
            badges: [
                { class: 'wh40k-badge--harmful', icon: 'fa-skull', label: 'Harmful' },
                { class: 'wh40k-badge--stacks', icon: 'fa-layer-group', label: '×2' },
            ],
        });
        const root = dom(html);
        const header = root.querySelector('header');
        expect(header).not.toBeNull();
        // Both legacy and BEM class names should be present (default legacyClasses=true).
        expect(header?.classList.contains('wh40k-card-header')).toBe(true);
        expect(header?.classList.contains('wh40k-card__header')).toBe(true);
        const img = header?.querySelector('img');
        expect(img?.getAttribute('src')).toBe('/img/test.png');
        expect(img?.getAttribute('alt')).toBe('Test');
        expect(img?.classList.contains('wh40k-card-icon')).toBe(true);
        expect(header?.querySelector('h3')?.textContent?.trim()).toBe('Stunned');
        expect(header?.querySelector('.wh40k-card-subtitle')?.textContent?.trim()).toBe('Status Effect');
        const badgeEls = header?.querySelectorAll('.wh40k-badge');
        expect(badgeEls?.length).toBe(2);
        expect(badgeEls?.[0]?.classList.contains('wh40k-badge--harmful')).toBe(true);
        expect(badgeEls?.[0]?.querySelector('.fa-skull')).not.toBeNull();
        expect(badgeEls?.[1]?.textContent).toContain('×2');
    });

    it('renders icon-wrapper variant when iconClass is provided instead of image', () => {
        const tpl = Handlebars.compile(
            '{{#> chat-card-shell cardClass="wh40k-trait-card" iconClass="fa-shield-halved" title="Resilient"}}body{{/chat-card-shell}}',
        );
        const html = tpl({});
        const root = dom(html);
        expect(root.querySelector('img')).toBeNull();
        const wrapper = root.querySelector('.wh40k-card-icon-wrapper');
        expect(wrapper).not.toBeNull();
        expect(wrapper?.querySelector('i.fa-shield-halved')).not.toBeNull();
        expect(wrapper?.querySelector('i.wh40k-card-icon')).not.toBeNull();
    });

    it('renders footer when footerLabel is provided', () => {
        const tpl = Handlebars.compile(
            '{{#> chat-card-shell cardClass="wh40k-condition-card" title="X" footerLabel="Core Rulebook p.245" footerIcon="fa-book"}}body{{/chat-card-shell}}',
        );
        const html = tpl({});
        const root = dom(html);
        const footer = root.querySelector('footer');
        expect(footer).not.toBeNull();
        expect(footer?.classList.contains('wh40k-card-footer')).toBe(true);
        expect(footer?.classList.contains('wh40k-card__footer')).toBe(true);
        expect(footer?.querySelector('.wh40k-source-ref')?.textContent).toContain('Core Rulebook p.245');
        expect(footer?.querySelector('.fa-book')).not.toBeNull();
    });

    it('omits footer when footerLabel is absent', () => {
        const tpl = Handlebars.compile('{{#> chat-card-shell cardClass="wh40k-x" title="X"}}body{{/chat-card-shell}}');
        expect(dom(tpl({})).querySelector('footer')).toBeNull();
    });

    it('renders body content from {{> @partial-block}}', () => {
        const tpl = Handlebars.compile(
            '{{#> chat-card-shell cardClass="wh40k-x" title="X"}}<div class="custom-body">hello body</div>{{/chat-card-shell}}',
        );
        const root = dom(tpl({}));
        const body = root.querySelector('.wh40k-card-body');
        expect(body).not.toBeNull();
        expect(body?.classList.contains('wh40k-card__body')).toBe(true);
        expect(body?.querySelector('.custom-body')?.textContent).toBe('hello body');
    });

    it('omits legacy classes when legacyClasses=false (new-only chat messages)', () => {
        const tpl = Handlebars.compile(
            '{{#> chat-card-shell cardClass="wh40k-x" title="X" legacyClasses=false}}body{{/chat-card-shell}}',
        );
        const root = dom(tpl({}));
        expect(root.querySelector('.wh40k-card-header')).toBeNull();
        expect(root.querySelector('.wh40k-card-body')).toBeNull();
        expect(root.querySelector('.wh40k-card__header')).not.toBeNull();
        expect(root.querySelector('.wh40k-card__body')).not.toBeNull();
    });
});

/**
 * HTML-equivalence: produce the legacy markup directly as a string fixture,
 * then render the shell-based migration of the same template, and assert that
 * the structural DOM is preserved (legacy classes intact, same tag types, same
 * text content, same data attributes).
 *
 * We don't byte-compare strings because Handlebars whitespace handling differs
 * between block-partial and inline templates; the test asserts the
 * properties that matter for CSS targeting and chat-handler dispatch.
 */
describe('chat-card-shell — HTML equivalence with legacy templates', () => {
    it('condition-card structural equivalence', () => {
        // Derived from the original src/templates/chat/condition-card.hbs (header
        // + body + footer) — values flattened for comparison.
        const ctx = {
            img: '/img/conditions/stunned.png',
            name: 'Stunned',
            natureLabel: 'Harmful',
            natureClass: 'harmful',
            natureIcon: 'fa-skull',
            stackable: true,
            stacks: 2,
            sourceReference: 'Core Rulebook p.245',
        };

        // Build the legacy fixture by hand (exactly what condition-card emitted).
        const legacy = `<div class="wh40k-chat-card wh40k-condition-card wh40k-condition-card--harmful tw-overflow-hidden tw-rounded-md">
    <header class="wh40k-card-header">
        <img src="${ctx.img}" alt="${ctx.name}" class="wh40k-card-icon" />
        <div class="wh40k-card-title-area">
            <h3 class="wh40k-card-title">${ctx.name}</h3>
            <div class="wh40k-card-subtitle">${ctx.natureLabel} Condition</div>
            <div class="wh40k-card-badges">
                <span class="wh40k-badge wh40k-badge--${ctx.natureClass}">
                    <i class="fas ${ctx.natureIcon}"></i>
                    ${ctx.natureLabel}
                </span>
                <span class="wh40k-badge wh40k-badge--stacks">
                    <i class="fas fa-layer-group"></i>
                    ×${ctx.stacks}
                </span>
            </div>
        </div>
    </header>
    <div class="wh40k-card-body">body</div>
    <footer class="wh40k-card-footer">
        <span class="wh40k-source-ref">
            <i class="fas fa-book"></i>
            ${ctx.sourceReference}
        </span>
    </footer>
</div>`;

        const tpl = Handlebars.compile(
            `{{#> chat-card-shell
                  cardClass="wh40k-condition-card wh40k-condition-card--harmful"
                  outerExtraClass="tw-overflow-hidden tw-rounded-md"
                  image=img
                  imageAlt=name
                  title=name
                  subtitle=subtitleText
                  badges=badges
                  footerLabel=sourceReference
                  footerIcon="fa-book"}}body{{/chat-card-shell}}`,
        );
        const newHtml = tpl({
            ...ctx,
            subtitleText: `${ctx.natureLabel} Condition`,
            badges: [
                { class: `wh40k-badge--${ctx.natureClass}`, icon: ctx.natureIcon, label: ctx.natureLabel },
                { class: 'wh40k-badge--stacks', icon: 'fa-layer-group', label: `×${ctx.stacks}` },
            ],
        });

        const legacyDom = dom(legacy);
        const newDom = dom(newHtml);

        // Outer card div — legacy classes preserved.
        for (const cls of [
            'wh40k-chat-card',
            'wh40k-condition-card',
            'wh40k-condition-card--harmful',
            'tw-overflow-hidden',
            'tw-rounded-md',
        ]) {
            expect(newDom.firstElementChild?.classList.contains(cls)).toBe(true);
        }

        // Header tag is <header>, with legacy class.
        expect(newDom.querySelector('header')?.classList.contains('wh40k-card-header')).toBe(true);

        // Image src/alt/class.
        const legacyImg = legacyDom.querySelector('img');
        const newImg = newDom.querySelector('img');
        expect(newImg?.getAttribute('src')).toBe(legacyImg?.getAttribute('src'));
        expect(newImg?.getAttribute('alt')).toBe(legacyImg?.getAttribute('alt'));
        expect(newImg?.classList.contains('wh40k-card-icon')).toBe(true);

        // Title-area, title, subtitle.
        expect(newDom.querySelector('.wh40k-card-title-area')).not.toBeNull();
        expect(newDom.querySelector('h3.wh40k-card-title')?.textContent?.trim()).toBe(ctx.name);
        expect(newDom.querySelector('.wh40k-card-subtitle')?.textContent?.trim()).toBe('Harmful Condition');

        // Badges.
        const newBadges = newDom.querySelectorAll('.wh40k-card-badges .wh40k-badge');
        expect(newBadges.length).toBe(2);
        expect(newBadges[0].classList.contains(`wh40k-badge--${ctx.natureClass}`)).toBe(true);
        expect(newBadges[0].querySelector(`.${ctx.natureIcon}`)).not.toBeNull();
        expect(newBadges[1].classList.contains('wh40k-badge--stacks')).toBe(true);
        expect(newBadges[1].textContent).toContain('×2');

        // Body wrapper preserved.
        expect(newDom.querySelector('.wh40k-card-body')).not.toBeNull();

        // Footer with source ref.
        expect(newDom.querySelector('footer')?.classList.contains('wh40k-card-footer')).toBe(true);
        expect(newDom.querySelector('.wh40k-source-ref')?.textContent).toContain(ctx.sourceReference);
        expect(newDom.querySelector('footer .fa-book')).not.toBeNull();
    });

    it('movement-card icon-wrapper variant equivalence', () => {
        const ctx = {
            actor: 'Iredrina',
            movementLabel: 'Run',
            movementType: 'run',
            icon: 'fa-running',
        };

        const tpl = Handlebars.compile(
            `{{#> chat-card-shell
                  cardClass="wh40k-movement-card wh40k-movement-card--run"
                  outerExtraClass="tw-relative tw-overflow-hidden tw-rounded-md"
                  iconClass=icon
                  title=actor
                  subtitle=subtitleText}}movement-body{{/chat-card-shell}}`,
        );
        const html = tpl({
            ...ctx,
            subtitleText: `Movement: ${ctx.movementLabel}`,
        });
        const root = dom(html);
        expect(root.firstElementChild?.classList.contains('wh40k-movement-card--run')).toBe(true);
        expect(root.querySelector('.wh40k-card-icon-wrapper')).not.toBeNull();
        expect(root.querySelector(`i.${ctx.icon}`)).not.toBeNull();
        expect(root.querySelector('h3.wh40k-card-title')?.textContent?.trim()).toBe(ctx.actor);
        expect(root.querySelector('.wh40k-card-subtitle')?.textContent?.trim()).toBe('Movement: Run');
        // No image (icon variant).
        expect(root.querySelector('header > img')).toBeNull();
    });
});
