/**
 * The origin-path builder footer counts the stepper's own steps (#701). It read
 * "0/5 steps" beside a six-step stepper: Equipment was never counted.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../../testing/repo-file.ts';
import { stepProgress } from './origin-step-progress.ts';

describe('stepProgress (#701)', () => {
    it('counts every stepper step, Equipment included, and the completed ones', () => {
        const steps = [{ isComplete: true }, { isComplete: true }, { isComplete: false }, { isComplete: false }, { isComplete: false }, { isComplete: false }];
        expect(stepProgress(steps)).toEqual({ done: 2, total: 6 });
    });

    it('reads 0 of all steps before anything is picked', () => {
        expect(stepProgress(Array.from({ length: 6 }, () => ({ isComplete: false })))).toEqual({ done: 0, total: 6 });
    });

    it('is what the footer status uses, over the stepper navigation', () => {
        const builder = readRepoFile('src/module/applications/character-creation/origin-path-builder.ts');
        expect(builder).toMatch(/const progress = stepProgress\(this\._prepareStepNavigation\(\)/u);
        expect(builder).toContain('totalSteps: progress.total');
    });

    it('the footer speaks of choices only once an origin is picked', () => {
        const template = readRepoFile('src/templates/character-creation/origin-path-builder.hbs');
        expect(template).toMatch(/\{\{#if status\.hasSelections\}\}\s*<span[^>]*data-wh40k-hook="origin-footer-choices"/u);
    });
});
