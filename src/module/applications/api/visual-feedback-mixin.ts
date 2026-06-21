/**
 * @file VisualFeedbackMixin - thin alias of {@link EnhancedAnimationsMixin} (#276).
 *
 * VisualFeedbackMixin and EnhancedAnimationsMixin were two copies of the same
 * animation engine sharing a stat-flash / change-tracking surface. The engine was
 * single-sourced in `animation-utils.ts`, and the change-tracking + stat-flash API
 * (`_flashStatChange`, `visualizeChanges`, `animateStatChange`, `_findFieldElement`,
 * `_getAnimationClass`, `_applyAnimation`, `_animateDerivedStat`, `_animateCounter`,
 * `_captureCurrentValues`, `_previousValues`, `_showBriefNotification`) was folded
 * INTO EnhancedAnimationsMixin, which is now the single home of both surfaces.
 *
 * This module remains so existing consumers that import VisualFeedbackMixin keep
 * resolving every method they relied on — the alias delivers the full superset.
 */

export { default } from './enhanced-animations-mixin.ts';
