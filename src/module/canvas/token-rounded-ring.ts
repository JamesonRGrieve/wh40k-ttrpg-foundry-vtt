import { SYSTEM_ID } from '../constants.ts';
import { parseTokenFrameFlag, resolveTokenFrameFlag, type FrameFlagSource } from './token-mask.ts';

/**
 * Rounded-rectangle token ring for non-square tokens (#587).
 *
 * Foundry's Dynamic Token Ring is a circle sized to a token's SHORT side, so a
 * 3×2 vehicle gets a small disc floating in a rectangle. A token whose width ≠
 * height instead runs in this system's rounded-rect mode: `ring.enabled` is off
 * (no core ring), `flags.wh40k-rpg.roundedRing` is on, the art is baked into a
 * rounded rectangle that fills the footprint, and a band is drawn along its edge
 * in the ring colour (or the disposition colour), so rectangular tokens read as
 * the same family as the round ones. Resizing back to square hands the token
 * back to the core circular ring. An explicit `roundedRing: false` opts a token
 * out of the mode entirely.
 */

/** Corner radius as a fraction of the token's short side. */
const CORNER_FRACTION = 0.18;
/** Band thickness as a fraction of the token's short side. */
const BAND_FRACTION = 0.06;
/** Render-texture length of the token's LONG side (the short side scales to match). */
const RT_LONG_SIDE = 512;
/** Label of the band graphic this module owns on a token. */
const BAND_NAME = 'wh40k-rounded-ring-band';

/** The ring state a token's mode decision reads. */
export interface RingModeInput {
    width: number;
    height: number;
    /** Core `ring.enabled`. */
    ringEnabled: boolean;
    /** `flags.wh40k-rpg.roundedRing`: true = rounded mode, false = opted out, undefined = unset. */
    rounded: boolean | undefined;
    /** At token creation, a non-square token opts in by default (vehicles ship ringless). */
    creating: boolean;
}

/** The nested token update that switches ring mode (empty when nothing changes). */
export interface RingModeUpdate {
    ring?: { enabled: boolean };
    flags?: { [SYSTEM_ID]: { roundedRing: boolean } };
}

/**
 * Decide the ring mode for a token. A token "wants a ring" when its core ring is
 * on, it is already in rounded mode, or it is being created non-square (and was
 * not opted out). Non-square → rounded mode; square → core ring.
 * @param input  The token's footprint and ring state.
 * @returns The nested update to apply (empty when already in the right mode).
 */
export function ringModeUpdate(input: RingModeInput): RingModeUpdate {
    const nonSquare = input.width !== input.height;
    const optedOut = input.rounded === false && !input.ringEnabled;
    const wantsRing = input.ringEnabled || input.rounded === true || (input.creating && nonSquare && input.rounded !== false);
    if (optedOut || !wantsRing) return {};

    const update: RingModeUpdate = {};
    const ringEnabled = !nonSquare;
    if (input.ringEnabled !== ringEnabled) update.ring = { enabled: ringEnabled };
    if ((input.rounded === true) !== nonSquare) update.flags = { [SYSTEM_ID]: { roundedRing: nonSquare } };
    return update;
}

/** Rounded-rect metrics for a `width`×`height` px box. */
export function roundedRectMetrics(width: number, height: number): { radius: number; band: number } {
    const short = Math.min(width, height);
    return { radius: short * CORNER_FRACTION, band: short * BAND_FRACTION };
}

/** The render-texture size for a token of this aspect: long side {@link RT_LONG_SIDE}. */
export function roundedTextureSize(width: number, height: number): { width: number; height: number } {
    const long = Math.max(width, height);
    if (!(long > 0)) return { width: RT_LONG_SIDE, height: RT_LONG_SIDE };
    return { width: Math.round((RT_LONG_SIDE * width) / long), height: Math.round((RT_LONG_SIDE * height) / long) };
}

/**
 * Cover-fit a `srcWidth`×`srcHeight` image into a `boxWidth`×`boxHeight` box so
 * the source point (`cx`, `cy`) (0–1 fractions) sits at the box centre, then
 * clamp so the image always covers the whole box (an off-centre point never
 * leaves a transparent edge). `zoom` enlarges the subject beyond cover.
 */
export function computeCoverTransform(
    srcWidth: number,
    srcHeight: number,
    boxWidth: number,
    boxHeight: number,
    cx: number,
    cy: number,
    zoom = 1,
): { scale: number; x: number; y: number } {
    const scale = Math.max(boxWidth / srcWidth, boxHeight / srcHeight) * Math.max(1, zoom);
    const clampAxis = (requested: number, extent: number, box: number): number => Math.min(0, Math.max(box - extent, requested));
    return {
        scale,
        x: clampAxis(boxWidth / 2 - cx * srcWidth * scale, srcWidth * scale, boxWidth),
        y: clampAxis(boxHeight / 2 - cy * srcHeight * scale, srcHeight * scale, boxHeight),
    };
}

/* -------------------------------------------- */
/*  Runtime                                     */
/* -------------------------------------------- */

interface RoundedToken extends FrameFlagSource {
    document: {
        getFlag: (scope: string, key: string) => object | boolean | undefined;
        texture: { src: string | null };
        ring: { colors: { ring: { valid?: boolean } | null } };
        getSize: () => { width: number; height: number };
        alpha: number;
        hidden: boolean;
    };
    mesh: { texture: PIXI.Texture } | null;
    getDispositionColor: () => number;
    _refreshMeshSizeAndScale: () => void;
    addChild: (child: PIXI.DisplayObject) => PIXI.DisplayObject;
    getChildByName: (name: string) => PIXI.DisplayObject | null;
}

const generated = new Map<string, PIXI.RenderTexture>();
const ours = new WeakSet<PIXI.Texture>();

/** Is this token in rounded-rect mode? */
export function isRoundedRingToken(token: { document: { getFlag: (scope: string, key: string) => object | boolean | undefined } }): boolean {
    return token.document.getFlag(SYSTEM_ID, 'roundedRing') === true;
}

function buildRoundedTexture(
    source: PIXI.Texture,
    size: { width: number; height: number },
    centre: { cx: number; cy: number; zoom: number },
    renderer: PIXI.IRenderer,
): PIXI.RenderTexture {
    const t = computeCoverTransform(source.width, source.height, size.width, size.height, centre.cx, centre.cy, centre.zoom);
    const sprite = new PIXI.Sprite(source);
    sprite.scale.set(t.scale);
    sprite.position.set(t.x, t.y);
    const { radius } = roundedRectMetrics(size.width, size.height);
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRoundedRect(0, 0, size.width, size.height, radius);
    mask.endFill();
    sprite.mask = mask;
    const container = new PIXI.Container();
    container.addChild(sprite, mask);
    const rt = PIXI.RenderTexture.create(size);
    renderer.render(container, { renderTexture: rt });
    container.destroy({ children: true });
    return rt;
}

/** Draw (or redraw) the band along the token's rounded edge. */
function drawBand(token: RoundedToken): void {
    const { width, height } = token.document.getSize();
    const existing = token.getChildByName(BAND_NAME);
    let band: PIXI.Graphics;
    if (existing instanceof PIXI.Graphics) {
        band = existing;
    } else {
        band = new PIXI.Graphics();
        band.name = BAND_NAME;
        token.addChild(band);
    }
    const { radius, band: thickness } = roundedRectMetrics(width, height);
    const ringColor = token.document.ring.colors.ring;
    const color = ringColor?.valid === true ? Number(ringColor) : token.getDispositionColor();
    band.clear();
    // alignment 0 = inner: the band sits inside the footprint, over the art's edge.
    band.lineStyle({ width: thickness, color, alignment: 0 });
    band.drawRoundedRect(0, 0, width, height, radius);
    band.alpha = token.document.alpha * (token.document.hidden ? 0.5 : 1);
}

/** Remove the band from a token that has left rounded mode. */
function removeBand(token: RoundedToken): void {
    const band = token.getChildByName(BAND_NAME);
    if (band !== null) band.destroy();
}

/**
 * `refreshToken` handler for rounded mode: bake the art into a rounded rect of
 * the token's aspect (cover-fit on the authored `tokenFrame` centre, else the
 * image centre) and draw the band. Returns whether the token was handled, so the
 * circular bust path skips it. A token that has left rounded mode loses its band.
 */
export function onRefreshRoundedToken(token: RoundedToken): boolean {
    if (!isRoundedRingToken(token)) {
        removeBand(token);
        return false;
    }
    drawBand(token);
    const mesh = token.mesh;
    if (mesh?.texture.valid !== true || ours.has(mesh.texture)) return true;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- fvtt-types and strict tsc disagree on canvas.app nullability
    const renderer = canvas.app?.renderer;
    if (renderer === undefined) return true;

    const frame = parseTokenFrameFlag(resolveTokenFrameFlag(token));
    const centre = frame === null ? { cx: 0.5, cy: 0.5, zoom: 1 } : { cx: frame.cx, cy: frame.cy, zoom: frame.zoom };
    const { width, height } = token.document.getSize();
    const size = roundedTextureSize(width, height);
    const key = `${token.document.texture.src ?? ''}|${size.width}x${size.height}|${centre.cx}|${centre.cy}|${centre.zoom}`;
    let rt = generated.get(key);
    if (rt === undefined) {
        rt = buildRoundedTexture(mesh.texture, size, centre, renderer);
        generated.set(key, rt);
        ours.add(rt);
    }
    mesh.texture = rt;
    token._refreshMeshSizeAndScale();
    return true;
}
