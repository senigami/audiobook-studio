/**
 * PhaseStepper.tsx — R5-T5
 *
 * 4-step phase indicator: Samples → Build → Test → Ready.
 * Past steps show a check in accent, active is filled, future is muted.
 * Driven by VoicePhase from voicePhase.ts.
 */
import React from 'react';
import { Check } from 'lucide-react';
import type { VoicePhase } from '@/pages/Voices/voicePhase';

const STEPS: { phase: VoicePhase; label: string }[] = [
    { phase: 'samples', label: 'Samples' },
    { phase: 'build', label: 'Build' },
    { phase: 'test', label: 'Test' },
    { phase: 'ready', label: 'Ready' },
];

const PHASE_INDEX: Record<VoicePhase, number> = {
    samples: 0,
    build: 1,
    test: 2,
    ready: 3,
};

interface PhaseStepperProps {
    phase: VoicePhase;
}

export const PhaseStepper: React.FC<PhaseStepperProps> = ({ phase }) => {
    const activeIdx = PHASE_INDEX[phase] ?? 0;

    return (
        <div className="voice-lab-phase-stepper" role="list" aria-label="Voice setup progress">
            {STEPS.map(({ phase: stepPhase, label }, i) => {
                const stepIdx = PHASE_INDEX[stepPhase];
                const isPast = stepIdx < activeIdx;
                const isActive = stepIdx === activeIdx;

                return (
                    <React.Fragment key={stepPhase}>
                        {i > 0 && (
                            <div
                                aria-hidden="true"
                                className="voice-lab-phase-stepper__connector"
                                style={{
                                    background: isPast || isActive ? 'var(--accent)' : 'var(--border)',
                                }}
                            />
                        )}
                        <div
                            role="listitem"
                            aria-current={isActive ? 'step' : undefined}
                            className="voice-lab-phase-stepper__step"
                        >
                            <div
                                className={
                                    'voice-lab-phase-stepper__dot' +
                                    (isActive ? ' voice-lab-phase-stepper__dot--active' : '') +
                                    (isPast ? ' voice-lab-phase-stepper__dot--past' : '')
                                }
                            >
                                {isPast ? <Check size={14} aria-hidden="true" /> : i + 1}
                            </div>
                            <span
                                className={
                                    'voice-lab-phase-stepper__label' +
                                    (isActive ? ' voice-lab-phase-stepper__label--active' : '') +
                                    (isPast ? ' voice-lab-phase-stepper__label--past' : '')
                                }
                            >
                                {label}
                            </span>
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
};
