"""Drift guard: plugin-local ``Job`` test fakes must stay a faithful subset of the real model.

The xtts/voxtral plugin suites use plugin-local ``Job`` dataclass fakes
(``xtts_test_fakes.py`` / ``voxtral_test_fakes.py``) so they can run without
the Studio host installed. Those fakes mirror ``app.db.models.Job`` by hand,
which can drift silently. This host-side test pins the contract: every field
declared on a fake must exist on the real model with the same name, type
category (required vs defaulted), and default value.
"""

from __future__ import annotations

import dataclasses
import importlib.util
import sys
from pathlib import Path

import pytest

from app.db.models import Job as RealJob

REPO_ROOT = Path(__file__).resolve().parents[2]

FAKE_MODULES = {
    "xtts": REPO_ROOT / "tts_engines" / "tts_xtts" / "tests" / "xtts_test_fakes.py",
    "voxtral": REPO_ROOT / "tts_engines" / "tts_voxtral" / "tests" / "voxtral_test_fakes.py",
}


def _load_fake_job(path: Path):
    spec = importlib.util.spec_from_file_location(f"_fake_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
        return module.Job
    finally:
        sys.modules.pop(spec.name, None)


def _field_map(cls) -> dict[str, dataclasses.Field]:
    return {f.name: f for f in dataclasses.fields(cls)}


@pytest.mark.parametrize("plugin", sorted(FAKE_MODULES))
def test_fake_job_is_subset_of_real_job(plugin: str) -> None:
    fake_fields = _field_map(_load_fake_job(FAKE_MODULES[plugin]))
    real_fields = _field_map(RealJob)

    missing = sorted(set(fake_fields) - set(real_fields))
    assert not missing, (
        f"{plugin} fake Job declares fields absent from app.db.models.Job: {missing}. "
        "Update the fake to match the real model."
    )

    for name, fake_field in fake_fields.items():
        real_field = real_fields[name]
        fake_has_default = fake_field.default is not dataclasses.MISSING
        real_has_default = real_field.default is not dataclasses.MISSING
        assert fake_has_default == real_has_default, (
            f"{plugin} fake Job field {name!r}: required/defaulted mismatch with the real model."
        )
        if fake_has_default:
            assert fake_field.default == real_field.default, (
                f"{plugin} fake Job field {name!r}: default {fake_field.default!r} "
                f"!= real default {real_field.default!r}."
            )
