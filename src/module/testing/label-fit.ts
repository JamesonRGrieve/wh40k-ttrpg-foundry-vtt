/**
 * Which buttons' labels spill out of them (#651). Each button's first `<span>` is
 * its label; it must sit inside the button's box on every side, scroll nothing
 * horizontally, and take at most two lines.
 *
 * Self-contained, with no imports or outer references, so a Playwright spec can hand
 * it to `locator.evaluateAll` (which serialises the function into the page) and
 * a story can call it directly.
 */
export function overflowingLabels(buttons: readonly Element[]): string[] {
    const MAX_LINES = 2;
    const SLACK_PX = 0.5;
    return buttons.flatMap((button) => {
        const id = button.getAttribute('data-category') ?? button.textContent.trim();
        const label = button.querySelector('span');
        if (label === null) return [`${id}: no label`];
        const box = button.getBoundingClientRect();
        const text = label.getBoundingClientRect();
        const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
        const lines = Number.isNaN(lineHeight) || lineHeight === 0 ? 1 : Math.round(text.height / lineHeight);
        const inside =
            text.left >= box.left - SLACK_PX && text.right <= box.right + SLACK_PX && text.top >= box.top - SLACK_PX && text.bottom <= box.bottom + SLACK_PX;
        if (inside && label.scrollWidth <= label.clientWidth + 1 && lines <= MAX_LINES) return [];
        return [
            `${id}: label ${Math.round(text.width)}×${Math.round(text.height)}px (${lines} lines) in a ${Math.round(box.width)}×${Math.round(
                box.height,
            )}px button`,
        ];
    });
}
