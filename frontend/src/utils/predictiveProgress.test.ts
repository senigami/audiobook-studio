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
        expect(after.velocityPerSecond).toBeLessThan(before.velocityPerSecond)
        expect(afterTenSeconds.nextProgress).toBeGreaterThan(0.54)
        expect(afterTenSeconds.nextProgress).toBeLessThan(0.56)
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
})
