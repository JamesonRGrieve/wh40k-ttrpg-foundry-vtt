/**
 * Whether a value is a usable image path for a document's `img` (#699): a non-empty
 * string that names an image or video file. One rule for the item document's
 * `cleanData` and the item sheet's submit filter, which kept separate copies.
 */

/** File extensions an `img` may end with (before any query string). */
const IMAGE_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.webm'] as const;

/** Strings that read as a value but are not a path. */
const NOT_A_PATH = new Set(['null', 'undefined']);

/** Shortest plausible path: one character and an extension (`a.png`). */
const MIN_PATH_LENGTH = 5;

// eslint-disable-next-line no-restricted-syntax -- boundary: type guard over a raw document source / form value (`Record<string, unknown>`), narrowed on the next line
export function isValidImagePath(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const path = value.trim().toLowerCase();
    if (path.length < MIN_PATH_LENGTH || NOT_A_PATH.has(path)) return false;
    const file = path.split('?')[0] ?? path;
    return IMAGE_EXTENSIONS.some((ext) => file.endsWith(ext) || file.includes(`${ext}/`));
}
