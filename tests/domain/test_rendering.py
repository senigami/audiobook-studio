"""W-PERF task 003: rendering-mode translation layer.

resolve_rendering() must resolve every (kind, mode) pair, honor the doc-01 SS9
precedence chain (studio_override > explicit source fact > AI inference >
character > scene > chapter > book > engine default), and never let a locked
segment's decision be overridden by a lower-precedence tier.
"""
from app.domain.chapters.performance_schema import (
    RenderingMode,
    RenderingValue,
    SegmentKind,
    validate_performance_data,
)
from app.domain.chapters.rendering import (
    CanonicalSegment,
    RenderingDefaults,
    resolve_rendering,
)


def _segment(kind, text="hello", performance_data_raw=None, ai_suggested=False, locked=False):
    pdata = None
    if performance_data_raw is not None:
        pdata = validate_performance_data({"kind": kind, **performance_data_raw})
    return CanonicalSegment(
        kind=SegmentKind(kind),
        text=text,
        performance_data=pdata,
        ai_suggested=ai_suggested,
        locked=locked,
    )


def test_narration_defaults_to_spoken_in_audio_modes_and_visible_in_view_modes():
    seg = _segment("narration")
    defaults = RenderingDefaults()
    assert resolve_rendering(seg, RenderingMode.STANDARD_AUDIOBOOK, defaults).value == RenderingValue.SPOKEN
    assert resolve_rendering(seg, RenderingMode.SCRIPT_VIEW, defaults).value == RenderingValue.VISIBLE


def test_attribution_doc01_example_resolves_per_doc():
    seg = _segment("attribution", performance_data_raw={
        "rendering": {
            "standard_audiobook": "spoken",
            "enhanced_audiobook": "spoken",
            "audio_drama": "omit",
        },
    })
    defaults = RenderingDefaults()
    assert resolve_rendering(seg, RenderingMode.STANDARD_AUDIOBOOK, defaults).value == RenderingValue.SPOKEN
    assert resolve_rendering(seg, RenderingMode.ENHANCED_AUDIOBOOK, defaults).value == RenderingValue.SPOKEN
    assert resolve_rendering(seg, RenderingMode.AUDIO_DRAMA, defaults).value == RenderingValue.OMIT


def test_action_context_convert_or_omit_resolves_to_use_as_context_only():
    """Doc 01's 'convert_or_omit' isn't a canonical RenderingValue; this resolves
    it to use_as_context_only, matching the segment's inferred_state mechanism."""
    seg = _segment("action_context", performance_data_raw={
        "affects_next_segments": ["seg_0014"],
        "inferred_state": {"target_character_id": "char_elena", "emotion": "fearful refusal"},
        "rendering": {
            "standard_audiobook": "spoken",
            "enhanced_audiobook": "spoken",
            "audio_drama": "use_as_context_only",
        },
    })
    defaults = RenderingDefaults()
    assert resolve_rendering(seg, RenderingMode.AUDIO_DRAMA, defaults).value == RenderingValue.USE_AS_CONTEXT_ONLY


def test_vocalization_export_strategy_carried_alongside_resolved_value():
    seg = _segment("vocalization", performance_data_raw={
        "vocalization_type": "laugh",
        "spoken_text": None,
        "export_strategy": "engine_vocalization_or_prompt",
    })
    defaults = RenderingDefaults()
    decision = resolve_rendering(seg, RenderingMode.STANDARD_AUDIOBOOK, defaults)
    assert decision.value == RenderingValue.CONVERT_TO_VOCALIZATION
    assert decision.export_strategy == "engine_vocalization_or_prompt"


def test_no_override_falls_through_to_default_matrix():
    seg = _segment("sfx")
    defaults = RenderingDefaults()
    decision = resolve_rendering(seg, RenderingMode.STANDARD_AUDIOBOOK, defaults)
    assert decision.value == RenderingValue.CONVERT_TO_SFX
    assert decision.source_tier == "built_in_default"


def test_locked_segment_override_never_superseded():
    seg = _segment(
        "narration",
        performance_data_raw={"rendering": {"standard_audiobook": "omit"}},
        locked=True,
    )
    defaults = RenderingDefaults(
        character_default={RenderingMode.STANDARD_AUDIOBOOK: RenderingValue.SPOKEN},
    )
    decision = resolve_rendering(seg, RenderingMode.STANDARD_AUDIOBOOK, defaults)
    assert decision.value == RenderingValue.OMIT
    assert decision.source_tier == "studio_override"


def test_ai_suggested_override_tier_labeled_ai_inference():
    seg = _segment(
        "dialogue",
        performance_data_raw={"rendering": {"standard_audiobook": "omit"}},
        ai_suggested=True,
    )
    decision = resolve_rendering(seg, RenderingMode.STANDARD_AUDIOBOOK, RenderingDefaults())
    assert decision.source_tier == "ai_inference"


def test_explicit_override_without_ai_or_lock_is_source_fact_tier():
    seg = _segment("dialogue", performance_data_raw={"rendering": {"standard_audiobook": "omit"}})
    decision = resolve_rendering(seg, RenderingMode.STANDARD_AUDIOBOOK, RenderingDefaults())
    assert decision.source_tier == "explicit_source_fact"


def test_character_default_used_before_built_in_default():
    seg = _segment("sfx")
    defaults = RenderingDefaults(
        character_default={RenderingMode.STANDARD_AUDIOBOOK: RenderingValue.OMIT},
    )
    decision = resolve_rendering(seg, RenderingMode.STANDARD_AUDIOBOOK, defaults)
    assert decision.value == RenderingValue.OMIT
    assert decision.source_tier == "character_default"


def test_all_kinds_and_all_modes_resolve_without_error():
    defaults = RenderingDefaults()
    for kind in SegmentKind:
        seg = _segment(kind.value)
        for mode in RenderingMode:
            decision = resolve_rendering(seg, mode, defaults)
            assert decision.value is not None
