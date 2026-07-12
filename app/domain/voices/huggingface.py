"""Hugging Face voice import/export flow.

Implements the module described in
``design-docs/plans/active/v2_huggingface_voice_interface.md``: browse/search the
Hub, inspect a voice card, gate on explicit consent, download, build a voice
asset from the downloaded files, annotate metadata, export to a portable
``.asvoice.zip`` bundle, and upload loose files back to the Hub.

STATUS: ``HFHubClient`` is a real, live implementation backed by the
``huggingface_hub`` PyPI package — search/inspect/download/upload all make
genuine outbound HTTPS calls to huggingface.co. It is wired up by
``app.api.routers.voices_huggingface`` (mounted under ``/api/voices/huggingface``
via ``app.api.routers.voices``). See that router module for the exact
search -> inspect -> consent -> import -> export -> upload endpoint shapes.

Design notes:
- All real HTTP calls to the Hugging Face Hub API are routed through
  ``HFHubClient`` so tests can substitute a fake/mocked client (network is a
  valid mock boundary per ``design-docs/specs/testing-standards.md`` R2). No
  function in this module *other than* ``HFHubClient`` performs a network call
  directly.
- Exported bundles are MP3 for voice samples, per this repo's binding
  audio-format convention (voice bundles = MP3; only chapter/book render
  audio is WAV).
- License handling is "warn, don't block" per the plan (§7/§9): restrictive
  licenses are flagged in the parsed metadata, never used to refuse an
  import.
- The HF token is modeled the same way ``app/core/security.py`` models other
  secrets: an opaque string compared/used at call time, never logged, never
  serialized into exported artifacts. This module does not read or write the
  live settings store — callers (the router) decide how to source the token
  (from ``app.db.state.get_settings()['huggingface_token']``).
- A Hub repo id (``hub_id``) is untrusted input that reaches an outbound HTTPS
  call and, via ``download_files``, local file paths. ``validate_hub_id``
  enforces the strict ``namespace/repo-name`` shape before any such use.
"""

from __future__ import annotations

import io
import json
import logging
import re
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Protocol

from ...utils.pathing import contained_path, safe_basename, safe_join_flat

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

# Extensions ``download_files`` will pull from a Hub repo: reference audio
# (matching the router's own audio allowlist in
# app/api/routers/voices_huggingface.py's import handler) plus ``.json`` for
# the voice manifest. Everything else (model weights, READMEs, arbitrary
# repo contents) is filtered out before any download call is made — a
# malicious or oversized repo must not be pulled synchronously into
# TRANSIENT_DIR just because ``list_repo_files`` mentions it.
DOWNLOAD_FILE_EXTENSIONS = frozenset({".wav", ".mp3", ".flac", ".ogg", ".json"})

# Defense-in-depth cap on the number of files downloaded per import, even
# after the extension allowlist above. A legitimate voice card is "one short
# audio file plus a manifest" (see the router module docstring); 20 leaves
# generous headroom for a repo with a handful of alternate takes/languages
# while still bounding a repo that lists hundreds/thousands of matching
# files. This does not cap per-file or total byte size — see the
# ``download_files`` docstring for what remains unaddressed.
MAX_DOWNLOAD_FILES = 20

# A Hugging Face Hub repo id is "namespace/repo-name". Both segments are
# restricted to alphanumerics, hyphen, underscore, and dot — strict enough to
# rule out path-traversal segments ("..", "/"), URL-scheme smuggling, and
# whitespace/control characters before the value ever reaches an outbound
# HTTPS call or a local file path (SSRF-via-malformed-hub-id / path-injection
# defense-in-depth; see the security note in the module docstring).
_HUB_ID_SEGMENT = r"[A-Za-z0-9][A-Za-z0-9_.-]*"
HUB_ID_RE = re.compile(rf"^{_HUB_ID_SEGMENT}/{_HUB_ID_SEGMENT}$")


def validate_hub_id(hub_id: str) -> str:
    """Strictly validate a Hub repo id (``namespace/repo-name``) before use.

    Rejects anything that isn't exactly one ``/``-separated pair of
    alphanumeric+``-``/``_``/``.`` segments — no leading ``.``/``..`` segment
    tricks, no extra path segments, no whitespace, no URL scheme. Raises
    ``ValueError`` on rejection; callers map this to a 4xx response.
    """
    if not isinstance(hub_id, str) or not HUB_ID_RE.fullmatch(hub_id):
        raise ValueError(f"Invalid Hugging Face hub_id: {hub_id!r}")
    # Belt-and-suspenders: explicitly reject dot-segment traversal tricks
    # even though the character class above already can't produce "..".
    for segment in hub_id.split("/"):
        if segment in (".", ".."):
            raise ValueError(f"Invalid Hugging Face hub_id: {hub_id!r}")
    return hub_id


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
        folder_path: Path,
        *,
        tags: list[str],
        token: HFToken,
    ) -> str:
        """Push every file under ``folder_path`` to ``hub_id`` in one atomic commit,
        preserving the folder's relative directory structure, returning the
        resulting commit/revision id."""
        ...


def _hf_token_value(token: Optional[HFToken]) -> Optional[str]:
    """Extract the raw token value at the last possible moment, for a single call-time use."""
    if token is None:
        return None
    return token.value or None


class HFHubClient:
    """Default client — talks to the real Hugging Face Hub via ``huggingface_hub``.

    This is the one class in this module that performs real network I/O.
    Every method validates ``hub_id`` with ``validate_hub_id`` before using it
    in an outbound call (defense against SSRF-via-malformed-hub-id). Unit
    tests never exercise this class directly — they substitute a fake
    honoring ``HFHubClientProtocol`` (testing-standards.md R2: network is the
    correct mock boundary). This class is instead covered by tests that mock
    the ``huggingface_hub.HfApi`` boundary.
    """

    def __init__(self) -> None:
        # Imported lazily so importing this module never requires the
        # dependency to be installed unless the live client is actually used
        # (matches the "importing a module must not have side effects"
        # constraint — no network client construction happens at import time).
        from huggingface_hub import HfApi  # noqa: PLC0415

        self._api = HfApi()

    def search_models(self, *, tag: str, query: Optional[str] = None) -> list[dict[str, Any]]:
        models = self._api.list_models(tags=[tag], search=query, cardData=False)
        results: list[dict[str, Any]] = []
        for model in models:
            results.append(
                {
                    "id": model.id,
                    "author": model.author,
                    "tags": list(model.tags or []),
                    "likes": model.likes or 0,
                }
            )
        return results

    def get_model_card(self, hub_id: str, *, revision: Optional[str] = None) -> dict[str, Any]:
        validate_hub_id(hub_id)
        info = self._api.model_info(hub_id, revision=revision, cardData=True)
        card_data = info.card_data
        license_id = None
        languages: list[str] = []
        if card_data is not None:
            card_dict = card_data.to_dict() if hasattr(card_data, "to_dict") else dict(card_data)
            license_id = card_dict.get("license")
            raw_languages = card_dict.get("language") or card_dict.get("languages") or []
            languages = [raw_languages] if isinstance(raw_languages, str) else list(raw_languages)

        description = ""
        try:
            from huggingface_hub import ModelCard  # noqa: PLC0415

            card = ModelCard.load(hub_id, ignore_metadata_errors=True)
            description = (card.text or "").strip()
        except Exception:  # pragma: no cover - README is optional/best-effort
            logger.info("No README/model card body available for %s", hub_id)

        sample_url = None
        for sibling in info.siblings or []:
            name = getattr(sibling, "rfilename", None)
            if name and ("preview" in name.lower() or "sample" in name.lower()):
                sample_url = f"https://huggingface.co/{hub_id}/resolve/main/{name}"
                break

        return {
            "id": hub_id,
            "sha": info.sha,
            "license": license_id,
            "languages": languages,
            "tags": list(info.tags or []),
            "author": info.author,
            "description": description,
            "sample_url": sample_url,
        }

    def download_files(
        self, hub_id: str, *, revision: Optional[str] = None, token: Optional[HFToken] = None
    ) -> list[Path]:
        """Download the repo's allowlisted files to a local cache dir.

        Hardening (independent of whatever ``huggingface_hub`` itself does
        internally — see the module-level security note above
        ``DOWNLOAD_FILE_EXTENSIONS``):

        - Each ``filename`` returned by ``list_repo_files`` is repo-controlled,
          untrusted input. Before it is ever handed to ``hf_hub_download``,
          it must survive ``safe_basename`` (rejects path separators, ``..``,
          and empty/dot-only results) — this module does not rely on the
          installed ``huggingface_hub`` version's own filename sanitization.
        - Filenames are filtered to ``DOWNLOAD_FILE_EXTENSIONS`` (reference
          audio + the voice manifest) before any download call, and the
          remaining list is capped at ``MAX_DOWNLOAD_FILES``.

        NOT covered by this method (accepted, documented gap): there is no
        per-file or total byte-size cap. A single oversized file that still
        matches the extension allowlist (e.g. a many-hundred-MB ``.wav``)
        can still be downloaded in full. ``huggingface_hub`` does not expose
        a clean pre-download size check; enforcing a byte cap would require
        streaming the download manually. Follow-up work, not done here.
        """
        validate_hub_id(hub_id)
        from huggingface_hub import hf_hub_download  # noqa: PLC0415

        from ...core.config import TRANSIENT_DIR  # noqa: PLC0415

        raw_token = _hf_token_value(token)
        filenames = self._api.list_repo_files(hub_id, revision=revision, token=raw_token)

        safe_filenames: list[str] = []
        for filename in filenames:
            if Path(filename).suffix.lower() not in DOWNLOAD_FILE_EXTENSIONS:
                continue
            try:
                # safe_basename is applied only to validate containment of
                # the leaf name; the original (possibly-nested, e.g.
                # "samples/preview.mp3") filename is what's passed to
                # hf_hub_download, matching this method's existing repo-path
                # semantics. A filename whose basename doesn't survive
                # safe_basename (e.g. "..", "") is rejected outright.
                safe_basename(Path(filename).name)
            except ValueError:
                logger.warning("Rejecting unsafe Hugging Face filename for %s: %r", hub_id, filename)
                continue
            if ".." in Path(filename).parts:
                logger.warning("Rejecting path-traversal Hugging Face filename for %s: %r", hub_id, filename)
                continue
            safe_filenames.append(filename)

        if len(safe_filenames) > MAX_DOWNLOAD_FILES:
            logger.warning(
                "Hugging Face repo %s listed %d allowlisted files, exceeding the cap of %d; truncating.",
                hub_id,
                len(safe_filenames),
                MAX_DOWNLOAD_FILES,
            )
            safe_filenames = safe_filenames[:MAX_DOWNLOAD_FILES]

        # Containment: downloads land under TRANSIENT_DIR/hf_downloads/<safe-name>,
        # never at a path derived unchecked from hub_id.
        dest_root = contained_path(TRANSIENT_DIR, "hf_downloads", hub_id.replace("/", "__"))
        dest_root.mkdir(parents=True, exist_ok=True)

        downloaded: list[Path] = []
        for filename in safe_filenames:
            local_path = hf_hub_download(
                repo_id=hub_id,
                filename=filename,
                revision=revision,
                token=raw_token,
                local_dir=str(dest_root),
            )
            downloaded.append(Path(local_path))
        return downloaded

    def upload_files(
        self,
        hub_id: str,
        folder_path: Path,
        *,
        tags: list[str],
        token: HFToken,
    ) -> str:
        validate_hub_id(hub_id)
        raw_token = _hf_token_value(token)
        if not raw_token:
            raise ValueError("upload_files requires a non-empty HF token")

        self._api.create_repo(hub_id, repo_type="model", token=raw_token, exist_ok=True)

        commit_info = self._api.upload_folder(
            folder_path=str(folder_path),
            repo_id=hub_id,
            repo_type="model",
            token=raw_token,
            commit_message=f"Publish voice via Audiobook Studio ({', '.join(tags) or 'no tags'})",
        )

        commit_id = getattr(commit_info, "oid", None) or getattr(commit_info, "commit_url", None) or ""
        return str(commit_id)


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
    icon_bytes: bytes | None = None,
) -> Path:
    """Write a portable ``<bundle_name>.asvoice.zip`` under ``output_dir``.

    Always includes ``voice.json`` and ``samples/preview.mp3`` (voice bundle
    audio is MP3 per this repo's binding audio-format convention — see
    CLAUDE.md). ``sample_mp3_bytes`` is written verbatim; this function does
    not itself verify the bytes are actually MP3-encoded — that is the
    caller's responsibility. Also includes a generated ``README.md`` (via
    ``bundles.generate_readme_md`` — the same HF-card generator the
    Studio-to-Studio bundle exporter uses, reused here rather than
    duplicated) and, when ``icon_bytes`` is provided, ``icon.png``.
    ``icon_bytes`` is optional so a voice with no icon set still exports
    successfully with just the three always-present files. This is a
    self-contained scaffold: it does not touch the live voices root or the
    existing ``app.domain.voices.bundles`` exporter; a future integration
    pass decides whether to reuse that exporter directly.

    ``bundle_name`` is validated as a single trusted-root-contained filename
    (``safe_join_flat``) — rejects path separators and ``..`` segments, so a
    Hub-derived or user-typed name can't write outside ``output_dir``.

    Never includes a token or any secret value in the bundle contents.
    """
    from .bundles import generate_readme_md  # local import: avoid a module-level dependency on bundles.py

    output_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = safe_join_flat(output_dir, f"{bundle_name}{ASVOICE_BUNDLE_SUFFIX}")

    # generate_readme_md only emits the playable `widget:` block when
    # voice_manifest["samples"] is non-empty. Most installed voices have no
    # samples[] locally (only the v1-schema migration ever writes it), so
    # when we actually have a sample to publish, synthesize the entry here
    # -- both for the README and for the voice.json written into the bundle,
    # so the on-Hub manifest and README agree with each other.
    manifest_for_export = voice_manifest
    if sample_mp3_bytes and not voice_manifest.get("samples"):
        manifest_for_export = {
            **voice_manifest,
            "samples": [{"path": "samples/preview.mp3", "primary": True}],
        }

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(ASVOICE_MANIFEST_FILENAME, json.dumps(manifest_for_export, indent=2))
        zf.writestr("samples/preview.mp3", sample_mp3_bytes)
        zf.writestr("README.md", generate_readme_md(manifest_for_export))
        if icon_bytes:
            zf.writestr("icon.png", icon_bytes)

    bundle_path.write_bytes(buffer.getvalue())
    return bundle_path


# ---------------------------------------------------------------------------
# 8. Upload to Hugging Face
# ---------------------------------------------------------------------------


def upload_voice_to_hub(
    client: HFHubClientProtocol,
    hub_id: str,
    folder_path: Path,
    *,
    extra_tags: Optional[list[str]] = None,
    token: HFToken,
) -> str:
    """Push a voice bundle folder to ``hub_id``, auto-setting the anchor tag + ``as-*`` tags.

    ``token`` is required for upload (plan §9 decided). The token value is
    never included in the returned commit id, in any log line, or in the
    files pushed — it is used only as a call-time credential handed to the
    client.
    """
    tags = [HF_VOICE_TAG, *(extra_tags or [])]
    logger.info("Uploading voice bundle to Hub repo %s (folder: %s)", hub_id, folder_path)
    return client.upload_files(hub_id, folder_path, tags=tags, token=token)


def utc_now_iso() -> str:
    """Small helper mirroring ``bundles._utc_now`` for provenance-adjacent timestamps."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
