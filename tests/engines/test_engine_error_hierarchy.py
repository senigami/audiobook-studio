"""Structural guard on the engine bridge exception hierarchy (issue #200 Stage C).

Re-parenting an exception fails silently: an `except EngineBridgeError` clause
that stops matching raises no error of its own, it just stops catching, and the
suite stays green. Seven live `except EngineBridgeError` sites depend on the
single `RuntimeError` root, and two plugins fetch the base class through a
patchable module-level accessor, so nothing else in the suite would go red.

Every expectation here is a literal written by hand. Nothing is read back off
the classes under test and compared to itself.
"""

from __future__ import annotations

import pytest


# The complete roster. A new error class added to the module without a row here
# fails `test_module_defines_exactly_the_expected_classes`.
_EXPECTED_DIRECT_BASES: dict[str, tuple[str, ...]] = {
    "EngineBridgeError": ("RuntimeError",),
    "EngineRequestError": ("EngineBridgeError",),
    "EngineUnavailableError": ("EngineBridgeError",),
    "EngineNotReadyError": ("EngineBridgeError",),
    "EngineExecutionError": ("EngineBridgeError",),
    "EngineOutputRejectedError": ("EngineBridgeError",),
}

# Constructor arguments, per class. EngineOutputRejectedError takes a reason.
_CONSTRUCTOR_ARGS: dict[str, tuple[object, ...]] = {
    "EngineBridgeError": ("boom",),
    "EngineRequestError": ("boom",),
    "EngineUnavailableError": ("boom",),
    "EngineNotReadyError": ("boom",),
    "EngineExecutionError": ("boom",),
    "EngineOutputRejectedError": ("codec mismatch",),
}

# Every import path that must resolve to the identical class object.
_IMPORT_PATHS = (
    "studio_plugin_sdk.engine_errors",
    "studio_plugin_sdk",
    "app.engines.errors",
    "app.studio_plugin_sdk",
)

_ALL_NAMES = sorted(_EXPECTED_DIRECT_BASES)


def _load(module_path: str, name: str):
    import importlib

    return getattr(importlib.import_module(module_path), name)


class TestEveryErrorIsCaughtByTheRoot:
    """The property the seven live `except EngineBridgeError` sites rely on."""

    @pytest.mark.parametrize("name", _ALL_NAMES)
    def test_caught_by_except_engine_bridge_error(self, name: str) -> None:
        from app.engines.errors import EngineBridgeError

        cls = _load("app.engines.errors", name)
        raised = cls(*_CONSTRUCTOR_ARGS[name])

        try:
            raise raised
        except EngineBridgeError as caught:
            assert caught is raised
        except Exception:  # pragma: no cover - only reached on a broken hierarchy
            pytest.fail(f"{name} escaped `except EngineBridgeError`")

    @pytest.mark.parametrize("name", _ALL_NAMES)
    def test_caught_by_except_runtime_error(self, name: str) -> None:
        """`EngineBridgeError` roots at RuntimeError, not Exception or StudioException."""
        cls = _load("app.engines.errors", name)
        raised = cls(*_CONSTRUCTOR_ARGS[name])

        try:
            raise raised
        except RuntimeError as caught:
            assert caught is raised
        except Exception:  # pragma: no cover - only reached on a broken hierarchy
            pytest.fail(f"{name} escaped `except RuntimeError`")


class TestDirectBasesAreExactlyAsDeclared:
    """Named parents, written as literals, compared to `__bases__` by name."""

    @pytest.mark.parametrize("name", _ALL_NAMES)
    def test_direct_bases_match_the_literal(self, name: str) -> None:
        cls = _load("app.engines.errors", name)
        actual = tuple(base.__name__ for base in cls.__bases__)
        assert actual == _EXPECTED_DIRECT_BASES[name], (
            f"{name} direct bases changed: expected {_EXPECTED_DIRECT_BASES[name]}, got {actual}"
        )

    def test_root_is_not_reparented_under_studio_exception(self) -> None:
        """The specific re-parenting that would break `except EngineBridgeError`.

        `studio_plugin_sdk.errors.StudioException` sits next to this tree in the
        SDK and is the obvious wrong parent to reach for.
        """
        from studio_plugin_sdk.errors import StudioException

        engine_bridge_error = _load("app.engines.errors", "EngineBridgeError")
        assert not issubclass(engine_bridge_error, StudioException)

    def test_module_defines_exactly_the_expected_classes(self) -> None:
        import studio_plugin_sdk.engine_errors as engine_errors

        defined = {
            name
            for name, obj in vars(engine_errors).items()
            if isinstance(obj, type)
            and issubclass(obj, BaseException)
            and obj.__module__ == engine_errors.__name__
        }
        assert defined == set(_EXPECTED_DIRECT_BASES), (
            "engine_errors class roster drifted from the literal list in this test"
        )


class TestOneClassPerName:
    """Re-export shims must not produce a second class object for a name."""

    @pytest.mark.parametrize("name", _ALL_NAMES)
    def test_identical_object_from_every_import_path(self, name: str) -> None:
        canonical = _load("studio_plugin_sdk.engine_errors", name)
        for path in _IMPORT_PATHS:
            assert _load(path, name) is canonical, (
                f"{path}.{name} is a different object from studio_plugin_sdk.engine_errors.{name}"
            )


class TestPayloadSurvivedTheMove:
    def test_output_rejected_keeps_reason_attribute_and_message(self) -> None:
        from app.engines.errors import EngineOutputRejectedError

        err = EngineOutputRejectedError("codec mismatch")
        assert err.reason == "codec mismatch"
        assert str(err) == "output_rejected: codec mismatch"
