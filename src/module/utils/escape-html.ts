/**
 * Escape text for an HTML attribute value or element content: `&`, `"`, `<` and
 * `>`. Pure, so modules that build markup strings outside Foundry (rules, icons)
 * can share it.
 */
export function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
