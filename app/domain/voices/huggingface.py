"""Hugging Face voice import/export flow — FOUNDATION SCAFFOLD (inert).

Implements the module skeleton described in
``design-docs/plans/active/v2_huggingface_voice_interface.md``: browse/search the
Hub, inspect a voice card, gate on explicit consent, download, build a voice
asset from the downloaded files, annotate metadata, export to a portable
``.asvoice.zip`` bundle, and upload loose files back to the Hub.

STATUS: this module has **zero live callers**. It is not imported by any
FastAPI router, service, or startup path (see ``app/core/boot.py``,
``app/api/web.py``). A future integration pass will wire it up — see the
module docstring note near ``HFVoiceCardMetadata`` for the ``VoiceProvenance``
handoff.

Design notes:
- All real HTTP calls to the Hugging Face Hub API are routed through
  ``HFHubClient`` so tests can substitute a fake/mocked client (network is a
  valid mock boundary per ``design-docs/specs/testing-standards.md`` R2). No
  function in this module performs a network call directly.
- Exported bundles are MP3 for voice samples, per this repo's binding
  audio-format convention (voice bundles = MP3; only chapter/book render
  audio is WAV).
- License handling is "warn, don't block" per the plan (§7/§9): restrictive
  licenses are flagged in the parsed metadata, never used to refuse an
  import.
- The HF token is modeled the same way ``app/core/security.py`` models other
  secrets: an opaque string compared/used at call time, never logged, never
  serialized into exported artifacts. This module does not read or write the
  live settings store — callers decide how to source the token.
"""

from __future__ import annotations

import io
import json
import logging
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Protocol

from ...utils.pathing import safe_join_flat

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# The anchor tag used to discover Studio-compatible voices on the Hub.
HF_VOICE_TAG = "audiobook-studio-voice"

# Licenses considered restrictive enough to flag in the UI. Flagging never
# blocks an import — the user decides (plan §7).
RESTRICTIVE_LICENSE_MARKERS = (
    "nc",  # non-commercial (e.g. cc-by-nc-4.0)
    "nd",  # no-derivatives (e.g. cc-by-nd-4.0)
)

ASVOICE_BUNDLE_SUFFIX = ".asvoice.zip"
ASVOICE_MANIFEST_FILENAME = "voice.json"


# ---------------------------------------------------------------------------
# Token handling
# ---------------------------------------------------------------------------
#
# Modeled like the bearer tokens in app/core/security.py: an opaque string,
# compared/used only at call time, never logged. Unlike tts_api_key this is
# NOT read from app.db.state.get_settings() here — this module intentionally
# stays decoupled from the live settings store until an integration pass
# wires a real HF-token setting up. Callers pass the token explicitly.


@dataclass(frozen=True)
class HFToken:
    """An optional Hugging Face access token.

    Public browse/import calls need no token. Uploading, or reading private
    repos, requires one. The value is intentionally excluded from ``repr()``
    so it can't leak into logs, tracebacks, or accidental ``print(token)``
    calls.

    CAVEAT — this only covers the repr/str/logging surface. ``token.value``
    is still a real string field: ``dataclasses.asdict(token)``, pickling,
    or a caller writing ``f"{token.value}"``/``str(token.value)`` directly
    (instead of ``str(token)``) all bypass the redaction and expose the raw
    secret. Never place ``token`` (or ``token.value``) into a dict/object
    that gets serialized (JSON, logs, debug dumps) — pass ``token.value``
    only at the point of handing it to an ``HFHubClientProtocol`` call.
    """

    value: str

    def __repr__(self) -> str:  # pragma: no cover - trivial
        return "HFToken(***redacted***)"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return "HFToken(***redacted***)"


# ---------------------------------------------------------------------------
# HF card metadata (local to this module — NOT VoiceProvenance)
# ---------------------------------------------------------------------------
#
# The plan doc describes a shared `VoiceProvenance` shape also consumed by a
# parallel AI-casting task. That field does not exist yet and this module
# must not define it. `HFVoiceCardMetadata` below is this module's own,
# self-contained representation of a scraped Hub card; a future integration
# pass will map it onto `VoiceProfile.provenance` once `VoiceProvenance`
# lands.


@dataclass(frozen=True)
class HFVoiceCardMetadata:
    """Parsed representation of a Hugging Face Hub voice card.

    Distinct from (and not to be confused with) the future shared
    ``VoiceProvenance`` record.
    """

    hub_id: str
    revision: Optional[str] = None
    license: Optional[str] = None
    is_restrictive_license: bool = False
    languages: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    author: Optional[str] = None
    description: Optional[str] = None
    sample_url: Optional[str] = None


@dataclass(frozen=True)
class HFSearchResult:
    """One row of a Hub search result (before the user inspects the full card)."""

    hub_id: str
    author: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    likes: int = 0


@dataclass
class HFConsentDecision:
    """Result of the consent-gate check (plan §4 step 3, §7 Consent)."""

    granted: bool
    consent_ack: bool
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# HTTP client boundary (mockable — no real network calls happen in tests)
# ---------------------------------------------------------------------------


class HFHubClientProtocol(Protocol):
    """The minimal Hub surface this module depends on.

    A real implementation wraps ``huggingface_hub`` or raw HTTP calls; tests
    substitute a fake implementing this protocol so no network call is ever
    made from a test (testing-standards.md R2 — network is a valid mock
    boundary).
    """

    def search_models(self, *, tag: str, query: Optional[str] = None) -> list[dict[str, Any]]:
        """Return raw card dicts for models tagged with ``tag`` (optionally filtered by ``query``)."""
        ...

    def get_model_card(self, hub_id: str, *, revision: Optional[str] = None) -> dict[str, Any]:
        """Return the raw card dict (metadata + README frontmatter) for one model."""
        ...

    def download_files(
        self, hub_id: str, *, revision: Optional[str] = None, token: Optional[HFToken] = None
    ) -> list[Path]:
        """Download the repo's files to a local cache dir and return their paths."""
        ...

    def upload_files(
        self,
        hub_id: str,
        files: list[Path],
        *,
        tags: list[str],
        token: HFToken,
    ) -> str:
        """Push loose files to ``hub_id``, returning the resulting commit/revision id."""
        ...


class HFHubClient:
    """Default client — talks to the real Hugging Face Hub.

    Not exercised by unit tests (tests substitute a fake honoring
    ``HFHubClientProtocol``). Left unimplemented on purpose: this is a
    foundation scaffold, not a wired feature.
    """

    def search_models(self, *, tag: str, query: Optional[str] = None) -> list[dict[str, Any]]:
        raise NotImplementedError("HFHubClient is a live-network stub; inject a fake client in tests")

    def get_model_card(self, hub_id: str, *, revision: Optional[str] = None) -> dict[str, Any]:
        raise NotImplementedError("HFHubClient is a live-network stub; inject a fake client in tests")

    def download_files(
        self, hub_id: str, *, revision: Optional[str] = None, token: Optional[HFToken] = None
    ) -> list[Path]:
        raise NotImplementedError("HFHubClient is a live-network stub; inject a fake client in tests")

    def upload_files(
        self,
        hub_id: str,
        files: list[Path],
        *,
        tags: list[str],
        token: HFToken,
    ) -> str:
        raise NotImplementedError("HFHubClient is a live-network stub; inject a fake client in tests")


# ---------------------------------------------------------------------------
# 1. Search
# ---------------------------------------------------------------------------


def search_voices(
    client: HFHubClientProtocol,
    *,
    query: Optional[str] = None,
) -> list[HFSearchResult]:
    """Search the Hub for voice cards tagged ``audiobook-studio-voice``.

    Public, read-only; no token required (plan §4 step 1, §9 decided).
    """
    raw_results = client.search_models(tag=HF_VOICE_TAG, query=query)
    return [
        HFSearchResult(
            hub_id=r["id"],
            author=r.get("author"),
            tags=list(r.get("tags") or []),
            likes=int(r.get("likes") or 0),
        )
        for r in raw_results
    ]


# ---------------------------------------------------------------------------
# 2. Inspect
# ---------------------------------------------------------------------------


def _is_restrictive_license(license_id: Optional[str]) -> bool:
    """Flag (never block) restrictive licenses — plan §7 "warn, don't block"."""
    if not license_id:
        return False
    normalized = license_id.lower()
    return any(f"-{marker}-" in f"-{normalized}-" for marker in RESTRICTIVE_LICENSE_MARKERS)


def inspect_card(
    client: HFHubClientProtocol,
    hub_id: str,
    *,
    revision: Optional[str] = None,
) -> HFVoiceCardMetadata:
    """Fetch and parse a Hub card into ``HFVoiceCardMetadata``.

    License and consent-relevant terms must be visible before download (plan
    §4 step 2); this function surfaces the license and flags restrictive
    ones without acting as a gate.
    """
    card = client.get_model_card(hub_id, revision=revision)
    license_id = card.get("license")
    return HFVoiceCardMetadata(
        hub_id=hub_id,
        revision=card.get("sha") or revision,
        license=license_id,
        is_restrictive_license=_is_restrictive_license(license_id),
        languages=list(card.get("languages") or []),
        tags=list(card.get("tags") or []),
        author=card.get("author"),
        description=card.get("description"),
        sample_url=card.get("sample_url"),
    )


# ---------------------------------------------------------------------------
# 3. Consent gate
# ---------------------------------------------------------------------------


def check_consent(*, user_confirmed: bool) -> HFConsentDecision:
    """Gate the import on an explicit cloning-consent acknowledgement.

    Only an explicit ``True`` grants consent; missing/false/None style
    "falsy" input is treated as not granted (no implicit consent).
    """
    if user_confirmed is True:
        return HFConsentDecision(granted=True, consent_ack=True)
    return HFConsentDecision(
        granted=False,
        consent_ack=False,
        reason="User did not explicitly confirm cloning consent.",
    )


# ---------------------------------------------------------------------------
# 4. Download
# ---------------------------------------------------------------------------


def download_voice_files(
    client: HFHubClientProtocol,
    hub_id: str,
    *,
    revision: Optional[str] = None,
    token: Optional[HFToken] = None,
) -> list[Path]:
    """Download the repo's files to a local cache dir.

    ``token`` is optional — required only for private repos (plan §9
    decided: "Token ... required only to upload or to read private repos").
    """
    return client.download_files(hub_id, revision=revision, token=token)


# ---------------------------------------------------------------------------
# 5. Build voice asset
# ---------------------------------------------------------------------------


def build_voice_asset_from_download(
    downloaded_files: list[Path],
    card: HFVoiceCardMetadata,
) -> dict[str, Any]:
    """Stub for running the existing engine clone path on downloaded files.

    A real implementation locates the voice bundle (if the repo follows the
    Audiobook Studio voice bundle shape) or the reference audio, then calls
    the engine contract's ``build_voice_asset(...)`` (see
    ``design-docs/plans/reference/v2_voice_system_interface.md`` §3). This
    scaffold returns a plain dict describing what a caller would need,
    without touching the engine registry or voice bridge.
    """
    return {
        "hub_id": card.hub_id,
        "revision": card.revision,
        "source_files": [str(p) for p in downloaded_files],
        "status": "not_built",  # future pass wires this to build_voice_asset()
    }


# ---------------------------------------------------------------------------
# 6. Annotate metadata
# ---------------------------------------------------------------------------


def annotate_from_card(card: HFVoiceCardMetadata) -> dict[str, Any]:
    """Pre-fill voice metadata fields from the HF card (plan §4 step 6).

    Returns a plain dict — this module does not call
    ``app.domain.voices.metadata.update_voice_metadata`` directly to stay
    decoupled from the live voice store. Of the returned keys, only
    ``description``/``tags``/``languages`` map onto that function's accepted
    kwargs; ``license`` does NOT (there is no PATCH-able ``license`` field on
    the metadata endpoint today) — a future integration pass must route
    ``license`` separately (e.g. into the top-level manifest ``license``
    field, or drop it) rather than passing this dict through verbatim.
    """
    return {
        "description": card.description or "",
        "languages": list(card.languages),
        "tags": list(card.tags),
        "license": card.license,
    }


# ---------------------------------------------------------------------------
# 7. Export to .asvoice.zip
# ---------------------------------------------------------------------------


def export_hf_voice_bundle(
    *,
    voice_manifest: dict[str, Any],
    sample_mp3_bytes: bytes,
    output_dir: Path,
    bundle_name: str,
) -> Path:
    """Write a portable ``<bundle_name>.asvoice.zip`` under ``output_dir``.

    Bundle shape: ``voice.json`` at the zip root plus
    ``samples/preview.mp3`` (voice bundle audio is MP3 per this repo's
    binding audio-format convention — see CLAUDE.md). ``sample_mp3_bytes``
    is written verbatim; this function does not itself verify the bytes are
    actually MP3-encoded — that is the caller's responsibility. This is a
    self-contained scaffold: it does not touch the live voices root or the
    existing ``app.domain.voices.bundles`` exporter; a future integration
    pass decides whether to reuse that exporter directly.

    ``bundle_name`` is validated as a single trusted-root-contained filename
    (``safe_join_flat``) — rejects path separators and ``..`` segments, so a
    Hub-derived or user-typed name can't write outside ``output_dir``.

    Never includes a token or any secret value in the bundle contents.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = safe_join_flat(output_dir, f"{bundle_name}{ASVOICE_BUNDLE_SUFFIX}")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(ASVOICE_MANIFEST_FILENAME, json.dumps(voice_manifest, indent=2))
        zf.writestr("samples/preview.mp3", sample_mp3_bytes)

    bundle_path.write_bytes(buffer.getvalue())
    return bundle_path


# ---------------------------------------------------------------------------
# 8. Upload to Hugging Face
# ---------------------------------------------------------------------------


def upload_voice_to_hub(
    client: HFHubClientProtocol,
    hub_id: str,
    files: list[Path],
    *,
    extra_tags: Optional[list[str]] = None,
    token: HFToken,
) -> str:
    """Push loose files to ``hub_id``, auto-setting the anchor tag + ``as-*`` tags.

    ``token`` is required for upload (plan §9 decided). The token value is
    never included in the returned commit id, in any log line, or in the
    files pushed — it is used only as a call-time credential handed to the
    client.
    """
    tags = [HF_VOICE_TAG, *(extra_tags or [])]
    logger.info("Uploading voice bundle to Hub repo %s (%d files)", hub_id, len(files))
    return client.upload_files(hub_id, files, tags=tags, token=token)


def utc_now_iso() -> str:
    """Small helper mirroring ``bundles._utc_now`` for provenance-adjacent timestamps."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
