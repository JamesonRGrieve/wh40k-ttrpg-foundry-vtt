/**
 * WCAG contrast helpers for the colour-token guards (#635, #260): parse the
 * token values in tailwind/design-tokens.js, composite translucent surfaces over
 * what lies beneath them, and measure the contrast ratio of text on the result.
 */

export interface Rgb {
    r: number;
    g: number;
    b: number;
}

/** A `#rrggbb` colour. */
export function hexRgb(hex: string): Rgb {
    return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

/** A `#rrggbb` or `rgb[a](r, g, b[, a])` token value, with its alpha (1 when opaque). */
export function parseColour(value: string): { rgb: Rgb; alpha: number } {
    if (value.startsWith('#')) return { rgb: hexRgb(value), alpha: 1 };
    const body = /^rgba?\(([^)]*)\)$/.exec(value.trim())?.[1];
    if (body === undefined) throw new Error(`not a colour: ${value}`);
    const channels = body.split(',').map((part) => Number(part.trim()));
    if (channels.length < 3 || channels.length > 4 || channels.some(Number.isNaN)) throw new Error(`not a colour: ${value}`);
    const [r, g, b] = channels;
    // An `rgb(...)` value has no alpha channel: it is opaque.
    return { rgb: { r, g, b }, alpha: channels.length === 4 ? channels[3] : 1 };
}

function channel(v: number): number {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance({ r, g, b }: Rgb): number {
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The WCAG contrast ratio of two colours. */
export function contrast(a: Rgb, b: Rgb): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A surface `rgba(r, g, b, alpha)` composited over what lies underneath it. */
export function over(surface: Rgb, alpha: number, under: Rgb): Rgb {
    const mix = (top: number, bottom: number): number => top * alpha + bottom * (1 - alpha);
    return { r: mix(surface.r, under.r), g: mix(surface.g, under.g), b: mix(surface.b, under.b) };
}

/** The `'key': 'value'` pairs of a JS object literal named `name` in `source`. */
export function objectLiteral(source: string, name: string): Map<string, string> {
    const body = new RegExp(`const ${name} = \\{([^}]*)\\}`).exec(source)?.[1] ?? '';
    return new Map([...body.matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
}
