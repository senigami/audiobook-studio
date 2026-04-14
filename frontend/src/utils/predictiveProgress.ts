const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export interface PredictiveProgressInput {
    authoritativeProgress: number
    displayedProgress: number
    elapsedSeconds: number
    etaSeconds: number
    priorProgressBasis?: number
    correctionWeightMode?: 'default' | 'queue' | 'segment'
    evidenceWeightFraction?: number
    preferLaunchEtaOnly?: boolean
}

export interface PredictiveProgressModel {
    authoritativeProgress: number
    displayedProgress: number
    estimatedRemainingSeconds: number
    actualRemainingSeconds: number
    refinedRemainingSeconds: number
    velocityPerSecond: number
}

export interface PredictiveAdvanceInput extends PredictiveProgressInput {
    deltaSeconds: number
}

export const buildPredictiveProgressModel = ({
    authoritativeProgress,
    displayedProgress,
    elapsedSeconds,
    etaSeconds,
    priorProgressBasis,
    correctionWeightMode = 'default',
    evidenceWeightFraction = 1,
    preferLaunchEtaOnly = false,
}: PredictiveProgressInput): PredictiveProgressModel => {
    const safeAuthoritative = clamp01(authoritativeProgress)
    const safeDisplayed = clamp01(displayedProgress)
    const safeElapsed = Math.max(0, elapsedSeconds)
    const safePriorBasis = clamp01(priorProgressBasis ?? safeAuthoritative)
    const safeEvidenceWeight = clamp01(evidenceWeightFraction)
    const estimatedRemainingSeconds = Math.max(1, etaSeconds - safeElapsed)
    const rawActualRemainingSeconds = safeAuthoritative > 0.001
        ? Math.max(1, (safeElapsed / safeAuthoritative) - safeElapsed)
        : estimatedRemainingSeconds
    const actualRemainingSeconds = Math.min(rawActualRemainingSeconds, estimatedRemainingSeconds)

    // Queue/progress contract:
    // 1. The backend may correct the authoritative progress value, but the
    //    visible bar should keep its current position.
    // 2. Corrections only change the future rate of progression.
    // 3. Ahead corrections should speed the bar up from "here".
    // 4. Behind corrections should slow the bar down from "here".
    // 5. The visible bar never moves backward while a job is active.
    // 6. Chapter bars and segment bars can share this engine as long as they
    //    feed it the correct scoped progress source.
    const expectedProgressFromPrior = etaSeconds > 0 ? clamp01(safeElapsed / etaSeconds) : safeAuthoritative
    const maxQueueConfidence = Math.max(0.05, Math.min(0.35, safeEvidenceWeight * 0.35))
    const confidence = preferLaunchEtaOnly
        ? 0
        : correctionWeightMode === 'queue'
        ? Math.min(
            maxQueueConfidence,
            0.08
            + Math.min(0.18, Math.abs(safeAuthoritative - expectedProgressFromPrior) * 0.45)
            + Math.min(0.08, Math.abs(safeAuthoritative - safePriorBasis) * 0.2)
            + (safeAuthoritative >= 0.75 ? 0.04 : 0),
        )
        : correctionWeightMode === 'segment'
        ? Math.min(
            1,
            0.65
            + Math.min(0.25, Math.abs(safeAuthoritative - expectedProgressFromPrior) * 1.2)
            + Math.min(0.12, Math.abs(safeAuthoritative - safePriorBasis) * 0.8)
            + (safeAuthoritative >= 0.85 ? 0.08 : 0),
        )
        : Math.min(1, safeAuthoritative / 0.35)
    const refinedRemainingSeconds = preferLaunchEtaOnly
        ? estimatedRemainingSeconds
        : Math.max(
            1,
            (estimatedRemainingSeconds * (1 - confidence)) + (actualRemainingSeconds * confidence),
        )
    const velocityPerSecond = Math.max(0, (1 - safeDisplayed) / refinedRemainingSeconds)

    return {
        authoritativeProgress: safeAuthoritative,
        displayedProgress: safeDisplayed,
        estimatedRemainingSeconds,
        actualRemainingSeconds,
        refinedRemainingSeconds,
        velocityPerSecond,
    }
}

export const advancePredictiveProgress = ({
    authoritativeProgress,
    displayedProgress,
    elapsedSeconds,
    etaSeconds,
    deltaSeconds,
    priorProgressBasis,
    correctionWeightMode,
    evidenceWeightFraction,
    preferLaunchEtaOnly,
}: PredictiveAdvanceInput) => {
    const model = buildPredictiveProgressModel({
        authoritativeProgress,
        displayedProgress,
        elapsedSeconds,
        etaSeconds,
        priorProgressBasis,
        correctionWeightMode,
        evidenceWeightFraction,
        preferLaunchEtaOnly,
    })
    const safeDelta = Math.max(0, deltaSeconds)
    const nextProgress = clamp01(
        Math.max(
            model.displayedProgress,
            Math.min(0.995, model.displayedProgress + (model.velocityPerSecond * safeDelta)),
        ),
    )

    return {
        ...model,
        deltaSeconds: safeDelta,
        nextProgress,
    }
}
