import { describe, it, expect } from 'vitest'
import { buildSegmentsProgressProjection } from '@/utils/segmentsProgressProjector'

// The projector must honor the backend's segment status. It must NOT infer
// "preparing" from progress===0 — the backend now emits a true running 0% start
// (START_SEGMENT / [PROGRESS] 0% / the START_SYNTHESIS sync). Forcing those to
// "preparing" nulls the predictive ETA (resolveEndAtMs I10 guard) so the segment
// bar + text highlight cannot animate until progress first exceeds 0 (the slow
// start the owner reported: animation didn't begin until the second update).

const baseEvent = {
    topic: 'segments.progress',
    eventKind: 'segment_progress',
    jobId: 'job-x',
    chapterId: 'chap-1',
    projectId: 'proj-1',
    segmentId: 'seg-1',
}

function project(payload: Record<string, unknown>) {
    return buildSegmentsProgressProjection(baseEvent as never, payload, undefined, null).projectedUpdates
}

describe('segmentsProgressProjector status projection', () => {
    it('keeps a running 0%-progress SEGMENT_PROGRESS frame as running (not preparing)', () => {
        // The [PROGRESS] 0% true-start frame: running, progress 0, has an ETA.
        const out = project({
            status: 'running',
            activeSegmentProgress: 0,
            progress: 0,
            etaSeconds: 22,
            etaBasis: 'remaining_from_update',
            reasonCode: 'SEGMENT_PROGRESS',
        })
        expect(out.status).toBe('running')
        // ETA must be carried so the bar can build a predictive lane immediately.
        expect(out.active_segment_eta_seconds).toBe(22)
    })

    it('keeps a START_SEGMENT 0% frame as running', () => {
        const out = project({
            status: 'running',
            activeSegmentProgress: 0,
            progress: 0,
            etaSeconds: 22,
            reasonCode: 'START_SEGMENT',
        })
        expect(out.status).toBe('running')
    })

    it('keeps a running mid-progress frame as running', () => {
        const out = project({
            status: 'running',
            activeSegmentProgress: 0.4,
            progress: 0.4,
            etaSeconds: 12,
            reasonCode: 'SEGMENT_PROGRESS',
        })
        expect(out.status).toBe('running')
    })

    it('projects SEGMENT_PENDING (announce, pre-confirmation) as preparing', () => {
        const out = project({
            status: 'running',
            activeSegmentProgress: 0,
            progress: 0,
            etaSeconds: null,
            reasonCode: 'SEGMENT_PENDING',
        })
        expect(out.status).toBe('preparing')
    })

    it('projects an indeterminate frame as preparing', () => {
        const out = project({
            status: 'running',
            activeSegmentProgress: 0,
            progress: 0,
            indeterminate: true,
            reasonCode: 'SEGMENT_PROGRESS',
        })
        expect(out.status).toBe('preparing')
    })

    it('does not surface terminal statuses (handled elsewhere)', () => {
        const out = project({
            status: 'done',
            activeSegmentProgress: 1,
            progress: 1,
            reasonCode: 'SEGMENT_SAVED',
        })
        expect(out.status).toBeUndefined()
    })
})

// Gap 2: indeterminate must be forwarded through projectedUpdates.
// R1 revert-check: pre-change projectedUpdates has no indeterminate key (undefined);
// post-change a payload with indeterminate:true yields projectedUpdates.indeterminate===true.
describe('segmentsProgressProjector indeterminate forwarding', () => {
    it('(INDETERMINATE-FWD) forwards indeterminate:true from camelCase payload key', () => {
        const out = project({
            status: 'running',
            activeSegmentProgress: 0,
            progress: 0,
            indeterminate: true,
            reasonCode: 'LOADING_MODEL',
        })
        // R1: fails pre-change because indeterminate is not in projectedUpdates
        expect(out.indeterminate).toBe(true)
    })

    it('(INDETERMINATE-FWD) forwards indeterminate:false from payload', () => {
        const out = project({
            status: 'running',
            activeSegmentProgress: 0.3,
            progress: 0.3,
            indeterminate: false,
            reasonCode: 'SEGMENT_PROGRESS',
        })
        expect(out.indeterminate).toBe(false)
    })

    it('(INDETERMINATE-FWD) indeterminate is undefined when not present in payload', () => {
        const out = project({
            status: 'running',
            activeSegmentProgress: 0.3,
            progress: 0.3,
            reasonCode: 'SEGMENT_PROGRESS',
        })
        // When absent in payload, getVal returns undefined — acceptable to forward as undefined
        expect(out.indeterminate).toBeUndefined()
    })
})
