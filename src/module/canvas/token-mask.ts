import { SYSTEM_ID } from '../constants.ts';
import { isCharacterActorType, isNpcActorType } from '../documents/actor-types.ts';

/**
 * Runtime circular token masks — tokens from plain rectangular portraits,
 * no pre-tokenized image variants.
 *
 * A token whose document carries `flags.wh40k-rpg.tokenFrame` gets its mesh
 * texture swapped for a GPU-generated circular bust: the source portrait is
 * cover-cropped around the flagged centre coordinates, scaled into a padded
 * content circle and alpha-masked into a RenderTexture. Every actor-portrait
 * token — ring or not — draws its bust at the same final diameter
 * ({@link ENFORCED_BUST_FRACTION} of the token), so a ringless Citizen and a
 * ringed PC read as the same size (#501).
 *
 * Why a RenderTexture swap and not `mesh.mask`: the ring band and the
 * subject are drawn by the SAME mesh (the ring sampler shader sources the
 * band from the spritesheet and the subject from the mesh texture), so
 * masking the mesh would clip the band off along with the art's corners.
 * Swapping the subject texture leaves the band sampler untouched —
 * verified by screenshot in the live e2e harness before this was built.
 *
 * The flag:
 *   flags.wh40k-rpg.tokenFrame = {
 *     cx?: number,       // centre of the bust in the source image, 0-1 (default 0.5)
 *     cy?: number,       // (default 0.3 — head-biased for portrait art)
 *     zoom?: number,     // subject zoom inside the circle (default DEFAULT_BUST_ZOOM)
 *     content?: number,  // content-circle fraction override (default: normalised
 *   }                    //  so the final bust is ENFORCED_BUST_FRACTION)
 */

export interface TokenFrameFlag {
    cx?: number;
    cy?: number;
    content?: number;
    /** Subject zoom, decoupled from the content circle: the source is scaled by
     *  `content * zoom`, so `zoom > 1` fills the bust with a face on portraits
     *  where the head is only a fraction of the frame. Default 1. */
    zoom?: number;
}

export interface FrameTransform {
    scale: number;
    x: number;
    y: number;
    radius: number;
}

/** Render-texture edge size: bust resolution independent of source size. */
const RT_SIZE = 512;
/** Content-circle fraction when the Dynamic Ring needs band clearance. */
const RING_CONTENT = 0.75;
/** Ring subject scale the player-character tokens use. The enforced final bust
 * fraction is derived against it so every token matches the party look. */
const REFERENCE_SUBJECT_SCALE = 0.8;
/** The on-token bust diameter (fraction of the token) enforced for EVERY
 * actor-portrait token, ring or not. For a ringed token `content ×
 * subjectScale` is normalised to this, so a freshly spawned token (subject scale
 * 1) seats inside the band exactly like a PC token (subject scale 0.8) — the
 * global no-clip guarantee. A ringless token has no subject scale (its mesh fills
 * the footprint), so its content circle IS this fraction (#501). */
const ENFORCED_BUST_FRACTION = RING_CONTENT * REFERENCE_SUBJECT_SCALE; // 0.6

/** Default bust centre: horizontally centred, head-biased vertically. */
const DEFAULT_BUST_CX = 0.5;
const DEFAULT_BUST_CY = 0.3;
/**
 * Default subject zoom for a frame that does not author one. It is the median of
 * the authored NPC `token_frame.zoom` values in the campaign vault (87 framed
 * NPCs, 2026-10: median 1.67, p10 1.667, p90 1.77), so an unframed or partially
 * framed portrait shows the same head-and-shoulders bust as the framed NPCs
 * instead of a small full-length figure (#501).
 */
const DEFAULT_BUST_ZOOM = 1.67;

/** The defaults {@link parseTokenFrameFlag} fills in for an absent field. */
export interface TokenFrameDefaults {
    cx: number;
    cy: number;
    zoom: number;
}

/** Head-biased bust defaults for actor portraits. */
const BUST_FRAME_DEFAULTS: TokenFrameDefaults = { cx: DEFAULT_BUST_CX, cy: DEFAULT_BUST_CY, zoom: DEFAULT_BUST_ZOOM };

/**
 * Pure geometry: place a `srcWidth`x`srcHeight` portrait into a `size`-px
 * square frame so the point (`cx`, `cy`) (source-fraction coordinates) sits
 * at the frame centre. The source's short side spans `content * zoom` of the
 * frame — `content` is the ring content circle (mask radius); `zoom` scales the
 * subject INSIDE it, so a face can fill the bust without enlarging the mask.
 *
 * The placement is then clamped so the scaled source always COVERS the content
 * circle. Without the clamp an off-centre `cx`/`cy` slides the source until an
 * arc of the circle falls outside it and renders transparent — the bust reads
 * as cut off on that side, and on a ringed token the gap exposes the band
 * (#501). The clamp only ever engages when the requested centre would uncover
 * the circle, so a well-framed portrait keeps its exact requested centre.
 *
 * When the source is smaller than the circle on an axis (only possible for
 * `zoom < 1`) full coverage is unachievable; the source is centred on that
 * axis rather than pinned to one edge, which keeps the gap symmetric.
 */
export function computeFrameTransform(srcWidth: number, srcHeight: number, size: number, content: number, cx: number, cy: number, zoom = 1): FrameTransform {
    const side = Math.min(srcWidth, srcHeight);
    const scale = (size * content * zoom) / side;
    const radius = (size * content) / 2;
    return {
        scale,
        x: coverClamp(size / 2 - cx * srcWidth * scale, srcWidth * scale, size, radius),
        y: coverClamp(size / 2 - cy * srcHeight * scale, srcHeight * scale, size, radius),
        radius,
    };
}

/**
 * Clamp one axis of the source placement so `[offset, offset + extent]` spans
 * the content circle `[size/2 - radius, size/2 + radius]`.
 * @param {number} offset  Requested top/left of the scaled source, in frame px.
 * @param {number} extent  Scaled source length on this axis, in frame px.
 * @param {number} size    Frame edge length, in px.
 * @param {number} radius  Content-circle radius, in px.
 * @returns {number}  The clamped offset.
 */
function coverClamp(offset: number, extent: number, size: number, radius: number): number {
    const min = size / 2 - radius;
    const max = size / 2 + radius;
    // Source too small to cover: centre it so the shortfall is shared.
    if (extent < max - min) return size / 2 - extent / 2;
    return Math.min(min, Math.max(max - extent, offset));
}

/**
 * Narrow an arbitrary flag value to a usable TokenFrameFlag. Authored fields are
 * kept (clamped to range); absent ones take `defaults` — the head-biased bust
 * defaults unless the caller frames something other than a portrait bust.
 */
export function parseTokenFrameFlag(
    value: object | boolean | undefined | null,
    defaults: TokenFrameDefaults = BUST_FRAME_DEFAULTS,
): Required<TokenFrameFlag> | null {
    if (value === undefined || value === null || value === false) return null;
    const raw: TokenFrameFlag = value === true ? {} : value;
    const clamp = (v: number | undefined, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
    // zoom is a subject multiplier (may exceed 1), clamped to a sane [0.25, 4].
    const clampZoom = (v: number | undefined, fallback: number): number =>
        typeof v === 'number' && Number.isFinite(v) ? Math.min(4, Math.max(0.25, v)) : fallback;
    return {
        cx: clamp(raw.cx, defaults.cx),
        cy: clamp(raw.cy, defaults.cy),
        content: clamp(raw.content, 0),
        zoom: clampZoom(raw.zoom, defaults.zoom),
    };
}

/** Minimal shape needed to resolve a token's frame flag: the token's own
 *  document plus its actor's prototype token. */
export interface FrameFlagSource {
    document: { getFlag: (scope: string, key: string) => object | boolean | undefined };
    actor?: { prototypeToken?: { getFlag?: (scope: string, key: string) => object | boolean | undefined } | null } | null;
}

/**
 * Resolve the `tokenFrame` flag for a placed token. The token's OWN document
 * flag wins — including an explicit `false`, which opts a specific token out of
 * the circular bust. Only when the document carries no flag at all (`undefined`)
 * do we fall back to the actor's prototype-token flag.
 *
 * The fallback fixes tokens dropped on a scene BEFORE the actor gained its
 * portrait framing: Foundry copies `prototypeToken.flags` onto a token only at
 * creation time, so those pre-existing tokens never receive the flag and would
 * render the full rectangular portrait forever after. Reading through to the
 * prototype makes them pick up the bust on the next refresh, matching a
 * freshly-dragged token — no per-token document migration required.
 */
export function resolveTokenFrameFlag(token: FrameFlagSource): object | boolean | undefined {
    const own = token.document.getFlag(SYSTEM_ID, 'tokenFrame');
    if (own !== undefined) return own;
    return token.actor?.prototypeToken?.getFlag?.(SYSTEM_ID, 'tokenFrame');
}

interface MeshLike {
    texture: PIXI.Texture;
}

interface MaskableToken extends FrameFlagSource {
    document: {
        getFlag: (scope: string, key: string) => object | boolean | undefined;
        texture: { src: string | null };
        ring: { enabled: boolean; subject?: { scale?: number | null } | null };
    };
    actor?: (NonNullable<FrameFlagSource['actor']> & { type: string }) | null;
    mesh: MeshLike | null;
    /** Core-protected resize: recomputes mesh scale from the CURRENT texture.
     * Called after the swap — the original transform was fitted to the
     * portrait's aspect and would stretch the square bust into an ellipse. */
    _refreshMeshSizeAndScale: () => void;
}

/** Generated busts keyed by source path + frame parameters; the WeakSet
 * marks our own RenderTextures so a cache hit is never re-used as a source. */
const generated = new Map<string, PIXI.RenderTexture>();
const ours = new WeakSet<PIXI.Texture>();

function buildBustTexture(source: PIXI.Texture, frame: Required<TokenFrameFlag>, content: number, renderer: PIXI.IRenderer): PIXI.RenderTexture {
    const t = computeFrameTransform(source.width, source.height, RT_SIZE, content, frame.cx, frame.cy, frame.zoom);
    const sprite = new PIXI.Sprite(source);
    sprite.scale.set(t.scale);
    sprite.position.set(t.x, t.y);
    const circle = new PIXI.Graphics();
    circle.beginFill(0xffffff);
    circle.drawCircle(RT_SIZE / 2, RT_SIZE / 2, t.radius);
    circle.endFill();
    sprite.mask = circle;
    const container = new PIXI.Container();
    container.addChild(sprite, circle);
    const rt = PIXI.RenderTexture.create({ width: RT_SIZE, height: RT_SIZE });
    renderer.render(container, { renderTexture: rt });
    container.destroy({ children: true });
    return rt;
}

/**
 * The content-circle fraction to bake into the bust so the FINAL rendered bust is
 * {@link ENFORCED_BUST_FRACTION} of the token, ring or not. An explicit authored
 * `content` wins. A ring-enabled token draws its subject at `content ×
 * subjectScale`, so it normalises against that scale (clamped ≤ 1) — the global
 * no-clip enforcement, holding for ANY subject scale. A ringless token's mesh
 * fills its footprint with no subject scale, so it bakes the fraction directly;
 * before #501 it used the full frame and drew ~1.7× larger than a ringed PC.
 * Pure, so it is unit-tested.
 */
export function resolveBustContent(authoredContent: number, ringEnabled: boolean, subjectScale: number): number {
    if (authoredContent > 0) return Math.min(1, authoredContent);
    const scale = ringEnabled && subjectScale > 0 ? subjectScale : 1;
    return Math.min(1, ENFORCED_BUST_FRACTION / scale);
}

/**
 * Does this actor type carry a character portrait (as opposed to vehicle, loot
 * or container art)? Only these get a default bust when they have no frame.
 */
export function isPortraitActorType(type: string | null | undefined): boolean {
    return typeof type === 'string' && (isCharacterActorType(type) || isNpcActorType(type));
}

/** What {@link resolveBustPlan} reads off a token. */
export interface BustPlanInput {
    /** The resolved `tokenFrame` flag (token's own, else the prototype's). */
    flag: object | boolean | undefined | null;
    ringEnabled: boolean;
    /** `ring.subject.scale` (only meaningful with the ring on). */
    subjectScale: number;
    /** The owning actor's type, or null for an actorless token. */
    actorType: string | null | undefined;
}

/** The frame and content circle to bake, from {@link resolveBustPlan}. */
export interface BustPlan {
    frame: Required<TokenFrameFlag>;
    content: number;
}

/**
 * Decide whether a token gets a circular bust, and how. Pure, so it is unit-tested.
 *
 * - A ring-enabled token ALWAYS gets one (authored frame, else the defaults), so
 *   raw rectangular art can never overflow the band.
 * - A ringless token gets one when it carries a frame, or when it is an
 *   actor-portrait token (character / NPC) with no frame at all — so a ringless
 *   Citizen and a ringed PC draw the same diameter (#501). An explicit `false`
 *   frame opts a ringless token out.
 * - Anything else (loot, containers, vehicles without a frame) keeps its raw art.
 */
export function resolveBustPlan(input: BustPlanInput): BustPlan | null {
    const authored = parseTokenFrameFlag(input.flag);
    const wantsDefault = input.ringEnabled || (input.flag !== false && isPortraitActorType(input.actorType));
    const frame = authored ?? (wantsDefault ? parseTokenFrameFlag(true) : null);
    if (frame === null) return null;
    return { frame, content: resolveBustContent(frame.content, input.ringEnabled, input.subjectScale) };
}

/**
 * `refreshToken` hook: apply the circular bust to the token mesh.
 * Foundry re-assigns the source texture on every full draw, so this runs on
 * each refresh and is a no-op when the mesh already shows our bust. Which tokens
 * are masked, and at what size, is {@link resolveBustPlan}.
 */
export function onRefreshToken(token: MaskableToken): void {
    const plan = resolveBustPlan({
        flag: resolveTokenFrameFlag(token),
        ringEnabled: token.document.ring.enabled,
        subjectScale: token.document.ring.subject?.scale ?? 1,
        actorType: token.actor?.type,
    });
    if (plan === null) return;
    const { frame, content } = plan;
    const mesh = token.mesh;
    if (mesh?.texture.valid !== true) return;
    if (ours.has(mesh.texture)) return; // already showing the generated bust
    const key = `${token.document.texture.src ?? ''}|${frame.cx}|${frame.cy}|${content}|${frame.zoom}`;
    // strict tsc types canvas.app as possibly undefined (pre-boot); the hook
    // only fires with a live canvas, but guard rather than assert.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- fvtt-types and strict tsc disagree on canvas.app nullability
    const renderer = canvas.app?.renderer;
    if (renderer === undefined) return;
    let rt = generated.get(key);
    if (rt === undefined) {
        rt = buildBustTexture(mesh.texture, frame, content, renderer);
        generated.set(key, rt);
        ours.add(rt);
    }
    mesh.texture = rt;
    // The mesh transform was computed for the source portrait's aspect ratio;
    // re-derive it from the (square) bust or the disc renders as an ellipse.
    // Resize-only — no texture reassignment, so no refresh re-entry.
    token._refreshMeshSizeAndScale();
}
