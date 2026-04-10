import { describe, expect, it } from 'vitest'
import { advancePredictiveProgress, buildPredictiveProgressModel } from './predictiveProgress'

describe('predictiveProgress', () => {
    it('computes forward velocity from the current displayed position to the end', () => {
        const model = buildPredictiveProgressModel({
            authoritativeProgress: 0.25,
            displayedProgress: 0.25,
            elapsedSeconds: 25,
            etaSeconds: 100,
        })

        expect(model.refinedRemainingSeconds).toBeGreaterThan(70)
        expect(model.refinedRemainingSeconds).toBeLessThan(80)
        expect(model.velocityPerSecond).toBeCloseTo(0.01, 3)
    })

    it('predicts where the bar should be in 10 seconds without jumping first', () => {
        const advanced = advancePredictiveProgress({
            authoritativeProgress: 0.25,
            displayedProgress: 0.25,
            elapsedSeconds: 25,
            etaSeconds: 100,
            deltaSeconds: 10,
        })

        expect(advanced.nextProgress).toBeGreaterThan(0.34)
        expect(advanced.nextProgress).toBeLessThan(0.36)
    })

    it('an update ahead changes future speed but does not jump current position', () => {
        const before = buildPredictiveProgressModel({
            authoritativeProgress: 0.25,
            displayedProgress: 0.25,
            elapsedSeconds: 25,
            etaSeconds: 100,
        })
        const after = advancePredictiveProgress({
            authoritativeProgress: 0.5,
            displayedProgress: 0.25,
            elapsedSeconds: 25,
            etaSeconds: 100,
            deltaSeconds: 0,
        })
        const afterTenSeconds = advancePredictiveProgress({
            authoritativeProgress: 0.5,
            displayedProgress: 0.25,
            elapsedSeconds: 25,
            etaSeconds: 100,
            deltaSeconds: 10,
        })

        expect(after.nextProgress).toBeCloseTo(0.25, 5)
        expect(after.velocityPerSecond).toBeGreaterThan(before.velocityPerSecond)
        expect(afterTenSeconds.nextProgress).toBeGreaterThan(0.54)
        expect(afterTenSeconds.nextProgress).toBeLessThan(0.56)
    })

    it('an update behind slows the rate but does not move backward', () => {
        const before = buildPredictiveProgressModel({
            authoritativeProgress: 0.5,
            displayedProgress: 0.5,
            elapsedSeconds: 50,
            etaSeconds: 100,
        })
        const after = advancePredictiveProgress({
            authoritativeProgress: 0.25,
            displayedProgress: 0.5,
            elapsedSeconds: 50,
            etaSeconds: 100,
            deltaSeconds: 0,
        })
        const afterTenSeconds = advancePredictiveProgress({
            authoritativeProgress: 0.25,
            displayedProgress: 0.5,
            elapsedSeconds: 50,
            etaSeconds: 100,
            deltaSeconds: 10,
        })

        expect(after.nextProgress).toBeCloseTo(0.5, 5)
        expect(after.velocityPerSecond).toBeCloseTo(before.velocityPerSecond, 5)
        expect(afterTenSeconds.nextProgress).toBeGreaterThanOrEqual(0.5)
    })

    it('keeps the bar monotonic even when current display is ahead of the backend update', () => {
        const advanced = advancePredictiveProgress({
            authoritativeProgress: 0.2,
            displayedProgress: 0.6,
            elapsedSeconds: 60,
            etaSeconds: 100,
            deltaSeconds: 10,
        })

        expect(advanced.nextProgress).toBeGreaterThanOrEqual(0.6)
    })

    it('anchors low-progress ETA to the configured estimate instead of inflating it', () => {
        const model = buildPredictiveProgressModel({
            authoritativeProgress: 0.01,
            displayedProgress: 0.01,
            elapsedSeconds: 1,
            etaSeconds: 5,
        })

        expect(model.estimatedRemainingSeconds).toBe(4)
        expect(model.actualRemainingSeconds).toBe(4)
        expect(model.refinedRemainingSeconds).toBeCloseTo(4, 3)
        expect(model.velocityPerSecond).toBeCloseTo(0.2475, 3)
    })

    it('keeps a short ETA from stretching even when the run started long ago', () => {
        const model = buildPredictiveProgressModel({
            authoritativeProgress: 0.5,
            displayedProgress: 0.5,
            elapsedSeconds: 120,
            etaSeconds: 5,
        })

        expect(model.estimatedRemainingSeconds).toBe(1)
        expect(model.actualRemainingSeconds).toBe(1)
        expect(model.refinedRemainingSeconds).toBe(1)
        expect(model.velocityPerSecond).toBe(0.5)
    })

    it('uses the learned queue ETA as a strong prior and only bends it gently at coarse checkpoints', () => {
        const model = buildPredictiveProgressModel({
            authoritativeProgress: 0.6,
            displayedProgress: 0.55,
            elapsedSeconds: 42,
            etaSeconds: 61,
            priorProgressBasis: 0.55,
            correctionWeightMode: 'queue',
            evidenceWeightFraction: 0.4,
        })

        expect(model.estimatedRemainingSeconds).toBeCloseTo(19, 0)
        expect(model.actualRemainingSeconds).toBeCloseTo(19, 0)
        expect(model.refinedRemainingSeconds).toBeCloseTo(19, 0)
    })

    it('does not let a late short-group checkpoint stretch the queue ETA beyond the learned finish', () => {
        const model = buildPredictiveProgressModel({
            authoritativeProgress: 0.56,
            displayedProgress: 0.62,
            elapsedSeconds: 56,
            etaSeconds: 63,
            priorProgressBasis: 0.62,
            correctionWeightMode: 'queue',
            evidenceWeightFraction: 0.17,
        })

        expect(model.estimatedRemainingSeconds).toBe(7)
        expect(model.actualRemainingSeconds).toBe(7)
        expect(model.refinedRemainingSeconds).toBe(7)
    })
})
