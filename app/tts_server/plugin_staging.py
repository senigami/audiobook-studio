"""Plugin import/staging pipeline for the TTS Server.

Handles installing new engine plugins from an uploaded .zip or a GitHub
repository: path-containment checks on zip extraction, symlink rejection on
cloned repos, and the two-phase preview/confirm staging flow (a plugin is
staged under ``.preview_<token>`` and only moved to its final
``tts_<engine_id>`` directory once the caller POSTs
``/plugins/confirm/<token>``).

Route decorators stay in ``app.tts_server.server`` (the sole HTTP/FastAPI
boundary per that module's docstring) — this module holds the underlying
logic, called from thin wrappers there. Functions here take the caller's
current ``plugins_dir`` explicitly rather than importing ``server``'s mutable
global at module scope, and reach back into ``server`` only via a lazy,
function-local import (matching this module's existing lazy-import
convention) to avoid a server<->plugin_staging import cycle.
"""

from __future__ import annotations

import logging
import re
import threading
from pathlib import Path
from typing import Any

from fastapi import HTTPException

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Plugin staging store — keyed by opaque UUID token
# ---------------------------------------------------------------------------

_staging_lock = threading.Lock()
# token -> {"staging_dir": Path, "engine_id": str, "display_name": str,
#           "version": str|None, "requirements": list[str]}
_staging: dict[str, dict] = {}


_GITHUB_REPO_RE = re.compile(r"^/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?/?$")


# ---------------------------------------------------------------------------
# Size ceilings (issue #219a) — an uploaded plugin .zip is untrusted input from
# the moment it hits /plugins/import or /plugins/preview: an unbounded read()
# followed by extractall() is a memory/disk exhaustion (zip-bomb) vector that
# runs before any manifest validation. Chosen generously above any real
# plugin's footprint so legitimate installs never hit them, tight enough to
# bound the blast radius of a malicious one.
# ---------------------------------------------------------------------------

# A plugin bundle is source + a manifest + maybe a few small fixture/sample
# assets — 200 MB comfortably covers that with headroom while still capping
# how much an attacker can push through the upload boundary in one request.
MAX_PLUGIN_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB

# The classic zip-bomb defence: bound the SUM of declared uncompressed sizes
# across all members before extractall() touches disk, not just the
# compressed upload size. Python's zipfile trusts (and enforces) this
# central-directory `file_size` field when reading/extracting a member, so
# checking it up front is a real bound on extraction output, not just a
# heuristic. 2 GB is far beyond any real plugin's unpacked size.
MAX_PLUGIN_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB

# A second, independent zip-bomb shape: many tiny/empty members instead of one
# huge one (inode/extraction-call exhaustion). No real plugin needs anywhere
# near this many files.
MAX_PLUGIN_ZIP_MEMBERS = 10_000

# Any single config file this module reads directly (manifest.json,
# settings_schema.json, requirements.txt) before extraction even starts.
# These are always small in a real plugin; 10 MB is generous headroom.
MAX_PLUGIN_CONFIG_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


def _reject_oversized_zip(zf) -> list:
    """Cheap, early member-count and declared-size pre-filter.

    ``member.file_size`` is read from the archive's own central directory --
    ordinary attacker-controlled metadata. Bounding it here is a real,
    correct check for an HONESTLY-declared huge archive (the ordinary case),
    but is not by itself proof against a member that LIES about its declared
    size while decompressing to something larger.

    That lie turns out to matter only for a specific pair of call sites, not
    everywhere ``zipfile`` touches a member's bytes -- confirmed empirically
    rather than assumed. ``zipfile.ZipFile.read(name)`` (and, transitively,
    ``extractall()``, which streams through the same bounded ``.open()`` path
    per member) both cap a member's decompressed OUTPUT at its declared
    ``file_size`` before validating CRC, so a forged-small declaration
    against a real-large payload is caught almost instantly with negligible
    memory cost through those APIs. The one call this module used to make
    that is NOT bounded that way is the single-shot convenience read,
    ``ZipFile.read(name)`` -- it decompresses a member's entire DEFLATE
    stream in one call regardless of declared size, deferring the size/CRC
    check to the very end. Measured directly: an 800 MB payload declared as
    100 bytes fully decompressed (RSS +839 MB) before ``zf.read()`` raised
    ``BadZipFile`` on the resulting CRC mismatch; the same forged member read
    through ``zf.open(member)`` in a chunked loop raised the identical
    ``BadZipFile`` after 0 bytes and negligible memory, because the streaming
    reader's own EOF tracking stopped it at the declared size first.

    So: this sum is a fast, honest-case pre-filter, not the sole line of
    defence. ``_safe_read_member`` below replaces the vulnerable
    ``zf.read(name)`` calls (manifest.json / settings_schema.json /
    requirements.txt, all read before extraction starts) with the same
    bounded streaming pattern ``extractall()`` already used safely.
    ``_safe_extractall`` does the same for the extraction step itself --
    not because ``extractall()`` was proven exploitable, but so the
    ceiling is an explicit, tested property of this module rather than an
    implicit side effect of ``zipfile``'s internal ``_left`` bookkeeping,
    and so a corrupted/tampered member is reported as a clean rejection
    instead of an opaque 500.

    ``zf`` is a ``zipfile.ZipFile`` -- left untyped since ``zipfile`` is only
    ever imported lazily inside this module's caller functions.

    Returns ``zf.infolist()`` so callers don't need a second pass. Raises
    HTTPException(413) — a client payload-too-large condition, not a 500 —
    without extracting anything.
    """
    members = zf.infolist()
    if len(members) > MAX_PLUGIN_ZIP_MEMBERS:
        raise HTTPException(status_code=413, detail="Plugin zip contains too many files.")
    total_uncompressed = sum(m.file_size for m in members)
    if total_uncompressed > MAX_PLUGIN_UNCOMPRESSED_BYTES:
        raise HTTPException(status_code=413, detail="Plugin zip is too large when uncompressed.")
    return members


_STREAM_CHUNK_BYTES = 1024 * 1024  # 1 MB read/decompress granularity


def _safe_read_member(zf, member, *, max_bytes: int, what: str) -> bytes:
    """Read one member's DECOMPRESSED content, bounded by real bytes produced.

    Reads through ``zf.open(member)`` in fixed-size chunks rather than the
    vulnerable ``zf.read(name)`` (see ``_reject_oversized_zip`` above for why
    that call specifically, and not ``extractall()``, was the real gap).
    Also translates ``zipfile.BadZipFile`` -- the CRC-mismatch a forged or
    otherwise corrupted member produces -- into a clean 400 rather than
    letting it propagate as a raw 500 or get mis-caught by an unrelated
    ``except Exception`` elsewhere in the caller (e.g. the JSON-parse
    handler, which would report it as an "invalid manifest.json" and hide
    what actually happened).
    """
    import zipfile

    total = 0
    chunks: list[bytes] = []
    try:
        with zf.open(member) as fh:
            while True:
                chunk = fh.read(_STREAM_CHUNK_BYTES)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Plugin zip's {what} exceeds the allowed decompressed size.",
                    )
                chunks.append(chunk)
    except zipfile.BadZipFile as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Plugin zip's {what} is corrupted or was tampered with.",
        ) from exc
    return b"".join(chunks)


def _safe_extractall(zf, members: list, staging_dir: Path, *, max_total_bytes: int) -> None:
    """Extract every member, bounding the CUMULATIVE real decompressed output.

    Streams each member through ``zf.open()`` with an explicit running-total
    check, so the ceiling is a tested property of this module rather than an
    implicit side effect of relying on ``extractall()``'s internal per-member
    truncation to keep working the same way across Python versions. Also
    translates ``zipfile.BadZipFile`` into a clean 400 (see
    ``_safe_read_member`` above) instead of the generic 500 the caller's
    broad ``except Exception`` would otherwise produce. Caller is
    responsible for removing ``staging_dir`` on failure.
    """
    import zipfile

    total = 0
    try:
        for member in members:
            target = staging_dir / member.filename
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(member) as src, open(target, "wb") as dst:
                while True:
                    chunk = src.read(_STREAM_CHUNK_BYTES)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_total_bytes:
                        raise HTTPException(
                            status_code=413,
                            detail="Plugin zip exceeded the allowed decompressed size during extraction.",
                        )
                    dst.write(chunk)
    except zipfile.BadZipFile as exc:
        raise HTTPException(
            status_code=400,
            detail="Plugin zip contains a corrupted or tampered file.",
        ) from exc


def _normalize_github_repo_url(raw_url: str) -> str:
    """Return a canonical GitHub repository URL or raise ``HTTPException``."""
    from urllib.parse import urlparse

    parsed = urlparse(raw_url.strip())
    if parsed.scheme != "https" or parsed.netloc.lower() != "github.com":
        raise HTTPException(status_code=400, detail="Only https://github.com/<owner>/<repo> URLs are supported.")
    if parsed.username or parsed.password or parsed.params or parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="GitHub repository URL must not include credentials, query, or fragment.")
    if not _GITHUB_REPO_RE.fullmatch(parsed.path):
        raise HTTPException(status_code=400, detail="GitHub repository URL must be https://github.com/<owner>/<repo>.")
    return f"https://github.com{parsed.path.rstrip('/')}"


def _reject_staging_symlinks(staging_dir: Path) -> None:
    """Reject cloned plugin repos that contain symlinks before trust confirmation."""
    for entry in staging_dir.rglob("*"):
        if entry.is_symlink():
            raise HTTPException(status_code=400, detail="Plugin repository must not contain symlinks.")


def _parse_requirements(req_text: str) -> list[str]:
    """Return non-empty, non-comment requirement lines."""
    lines = []
    for line in req_text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            lines.append(stripped)
    return lines


def sweep_orphaned_staging_dirs(plugins_dir: Path) -> None:
    """Remove leftover ``.preview_*`` staging dirs from prior runs.

    The in-memory ``_staging`` map does not survive a restart, so any staging
    dirs left on disk by an un-confirmed/un-cancelled preview would otherwise
    leak permanently with no token to clean them. Sweep them on startup to
    cap disk usage (defense against the preview disk-fill vector).
    """
    import shutil as _shutil

    try:
        if not plugins_dir.exists():
            return
        for entry in plugins_dir.iterdir():
            if entry.is_dir() and entry.name.startswith(".preview_"):
                try:
                    _shutil.rmtree(entry)
                    logger.info("Swept orphaned plugin staging dir: %s", entry.name)
                except OSError as exc:
                    logger.warning("Failed to sweep staging dir %s: %s", entry, exc)
    except OSError as exc:
        logger.warning("Failed to enumerate plugins dir for staging sweep: %s", exc)


def import_plugin_zip(*, content: bytes, filename: str | None, plugins_dir: Path) -> dict[str, Any]:
    """Extract and install a plugin .zip directly (no staging/confirm step)."""
    import io
    import json
    import zipfile
    import shutil
    import uuid
    from pathlib import PurePosixPath

    if not filename or not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported.")

    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Invalid zip file.") from exc

    with zf:
        # 1. Size ceilings (issue #219a) before anything else touches the
        # archive's contents, then path safety and member list.
        members = _reject_oversized_zip(zf)
        for member in members:
            name = member.filename
            # Reject Windows-style backslash separators — PurePosixPath won't split these
            if "\\" in name:
                raise HTTPException(status_code=400, detail="Unsafe path in uploaded archive.")
            path = PurePosixPath(name)
            if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
                raise HTTPException(status_code=400, detail="Unsafe path in uploaded archive.")

        # 2. Check for manifest.json
        manifest_names = [m.filename for m in members if m.filename.lower() == "manifest.json"]
        if not manifest_names:
            raise HTTPException(status_code=400, detail="Plugin zip is missing manifest.json")

        # Bounded reads happen OUTSIDE the JSON try/except below: HTTPException
        # is an Exception subclass, so a 413 raised by _safe_read_member inside
        # that block would be swallowed and reported as a 400 "invalid" instead.
        manifest_bytes = _safe_read_member(
            zf, zf.getinfo(manifest_names[0]), max_bytes=MAX_PLUGIN_CONFIG_FILE_BYTES, what="manifest.json"
        )
        try:
            manifest_data = json.loads(manifest_bytes.decode("utf-8"))
        except Exception as exc:
            logger.exception("Failed to parse manifest.json in plugin zip")
            raise HTTPException(status_code=400, detail="Invalid manifest.json.") from exc

        # 2b. Check for optional settings_schema.json
        schema_names = [m.filename for m in members if m.filename.lower() == "settings_schema.json"]
        if schema_names:
            schema_bytes = _safe_read_member(
                zf, zf.getinfo(schema_names[0]), max_bytes=MAX_PLUGIN_CONFIG_FILE_BYTES, what="settings_schema.json"
            )
            try:
                schema_data = json.loads(schema_bytes.decode("utf-8"))
                if not isinstance(schema_data, dict):
                    raise ValueError("settings_schema.json must be a dictionary (object) at the root.")
            except Exception as exc:
                logger.exception("Failed to parse settings_schema.json in plugin zip")
                raise HTTPException(status_code=400, detail="Invalid settings_schema.json.") from exc

        # 3. Validate engine_id
        engine_id = manifest_data.get("engine_id")
        if not engine_id:
            raise HTTPException(status_code=400, detail="manifest.json missing engine_id")

        if not re.fullmatch(r"[a-z][a-z0-9_]{1,14}", engine_id):
            raise HTTPException(status_code=400, detail="Invalid engine_id in uploaded plugin manifest.")

        # 4. Check for conflicts
        target_folder = f"tts_{engine_id}"
        target_dir = plugins_dir / target_folder
        if target_dir.exists():
            raise HTTPException(status_code=409, detail="A plugin with this engine_id is already installed.")

        # 5. Extract to staging
        staging_dir = plugins_dir / f".import_{uuid.uuid4().hex}"
        try:
            staging_dir.mkdir(parents=True)
            _safe_extractall(zf, members, staging_dir, max_total_bytes=MAX_PLUGIN_UNCOMPRESSED_BYTES)

            # 5b. Post-extract containment check — guard against zip implementations
            # that honour backslash separators on Windows or other bypass techniques.
            staging_resolved = staging_dir.resolve()
            for extracted in staging_dir.rglob("*"):
                if not extracted.resolve().is_relative_to(staging_resolved):
                    raise ValueError(f"Extracted path escapes staging dir: {extracted}")

            # 6. Atomic-ish move
            staging_dir.rename(target_dir)
        except HTTPException:
            # A real ceiling raised mid-extraction (issue #219a follow-up):
            # _safe_extractall may have written a partial member to disk
            # before aborting, so clean up the same as any other failure, but
            # let the 413 (not a 500) reach the caller unchanged.
            if staging_dir.exists():
                shutil.rmtree(staging_dir)
            raise
        except (ValueError, OSError) as exc:
            if staging_dir.exists():
                shutil.rmtree(staging_dir)
            logger.exception("Failed to extract plugin zip to staging dir")
            raise HTTPException(status_code=500, detail="Failed to extract plugin.") from exc
        except Exception as exc:
            if staging_dir.exists():
                shutil.rmtree(staging_dir)
            logger.exception("Unexpected error during plugin extraction")
            raise HTTPException(status_code=500, detail="Failed to extract plugin.") from exc

    # 7. Refresh plugins in memory
    from app.tts_server import server as _server

    _server.load_plugins(plugins_dir)

    return {
        "ok": True,
        "message": f"Successfully imported plugin {engine_id}",
        "engine_id": engine_id,
    }


def preview_plugin_zip(*, content: bytes, filename: str | None, plugins_dir: Path) -> dict[str, Any]:
    """Stage a plugin zip and return manifest metadata + requirements WITHOUT installing."""
    import io
    import json
    import zipfile
    import shutil
    import uuid
    from pathlib import PurePosixPath

    if not filename or not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported.")

    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Invalid zip file.") from exc

    with zf:
        # Size ceilings (issue #219a) before anything else touches the archive.
        members = _reject_oversized_zip(zf)
        for member in members:
            name = member.filename
            if "\\" in name:
                raise HTTPException(status_code=400, detail="Unsafe path in uploaded archive.")
            path = PurePosixPath(name)
            if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
                raise HTTPException(status_code=400, detail="Unsafe path in uploaded archive.")

        manifest_names = [m.filename for m in members if m.filename.lower() == "manifest.json"]
        if not manifest_names:
            raise HTTPException(status_code=400, detail="Plugin zip is missing manifest.json")

        # Bounded reads happen OUTSIDE the surrounding try/except blocks below:
        # HTTPException is an Exception subclass, so a 413 raised by
        # _safe_read_member inside one of those would be swallowed and
        # reported as a 400 "invalid" (or silently dropped, for requirements).
        manifest_bytes = _safe_read_member(
            zf, zf.getinfo(manifest_names[0]), max_bytes=MAX_PLUGIN_CONFIG_FILE_BYTES, what="manifest.json"
        )
        try:
            manifest_data = json.loads(manifest_bytes.decode("utf-8"))
        except Exception as exc:
            logger.exception("Failed to parse manifest.json in plugin zip")
            raise HTTPException(status_code=400, detail="Invalid manifest.json.") from exc

        schema_names = [m.filename for m in members if m.filename.lower() == "settings_schema.json"]
        if schema_names:
            schema_bytes = _safe_read_member(
                zf, zf.getinfo(schema_names[0]), max_bytes=MAX_PLUGIN_CONFIG_FILE_BYTES, what="settings_schema.json"
            )
            try:
                schema_data = json.loads(schema_bytes.decode("utf-8"))
                if not isinstance(schema_data, dict):
                    raise ValueError("settings_schema.json must be a dictionary (object) at the root.")
            except Exception as exc:
                logger.exception("Failed to parse settings_schema.json in plugin zip")
                raise HTTPException(status_code=400, detail="Invalid settings_schema.json.") from exc

        engine_id = manifest_data.get("engine_id")
        if not engine_id:
            raise HTTPException(status_code=400, detail="manifest.json missing engine_id")

        if not re.fullmatch(r"[a-z][a-z0-9_]{1,14}", engine_id):
            raise HTTPException(status_code=400, detail="Invalid engine_id in uploaded plugin manifest.")

        target_folder = f"tts_{engine_id}"
        target_dir = plugins_dir / target_folder
        if target_dir.exists():
            raise HTTPException(status_code=409, detail="A plugin with this engine_id is already installed.")

        # Read requirements before extraction — we only need the text content.
        req_text = ""
        req_names = [m.filename for m in members if m.filename.lower() == "requirements.txt"]
        if req_names:
            req_bytes = _safe_read_member(
                zf, zf.getinfo(req_names[0]), max_bytes=MAX_PLUGIN_CONFIG_FILE_BYTES, what="requirements.txt"
            )
            try:
                req_text = req_bytes.decode("utf-8", errors="replace")
            except Exception:
                pass

        requirements = _parse_requirements(req_text)

        # Extract to staging but do NOT rename to final location yet.
        token = uuid.uuid4().hex
        staging_dir = plugins_dir / f".preview_{token}"
        try:
            staging_dir.mkdir(parents=True)
            _safe_extractall(zf, members, staging_dir, max_total_bytes=MAX_PLUGIN_UNCOMPRESSED_BYTES)

            staging_resolved = staging_dir.resolve()
            for extracted in staging_dir.rglob("*"):
                if not extracted.resolve().is_relative_to(staging_resolved):
                    raise ValueError(f"Extracted path escapes staging dir: {extracted}")
        except HTTPException:
            if staging_dir.exists():
                shutil.rmtree(staging_dir)
            raise
        except (ValueError, OSError) as exc:
            if staging_dir.exists():
                shutil.rmtree(staging_dir)
            logger.exception("Failed to extract plugin zip to staging dir (preview)")
            raise HTTPException(status_code=500, detail="Failed to stage plugin.") from exc
        except Exception as exc:
            if staging_dir.exists():
                shutil.rmtree(staging_dir)
            logger.exception("Unexpected error during plugin preview extraction")
            raise HTTPException(status_code=500, detail="Failed to stage plugin.") from exc

    display_name = manifest_data.get("display_name") or engine_id
    version = manifest_data.get("version") or None

    with _staging_lock:
        _staging[token] = {
            "staging_dir": staging_dir,
            "engine_id": engine_id,
            "display_name": display_name,
            "version": version,
            "requirements": requirements,
        }

    return {
        "ok": True,
        "engine_id": engine_id,
        "display_name": display_name,
        "version": version,
        "requirements": requirements,
        "staging_token": token,
    }


def preview_github_repo(*, git_url: str, plugins_dir: Path) -> dict[str, Any]:
    """Stage a GitHub plugin repo and return manifest metadata + requirements WITHOUT installing."""
    return _clone_and_stage(_normalize_github_repo_url(git_url), plugins_dir)


def _clone_and_stage(git_url: str, plugins_dir: Path) -> dict[str, Any]:
    """Clone an already-validated git URL into a ``.preview_*`` staging dir.

    Post-validation body of :func:`preview_github_repo` — callers MUST pass a
    URL that already went through :func:`_normalize_github_repo_url` (tests
    exercise this seam with local ``file://`` fixture repos; production input
    never bypasses validation).
    """
    import json
    import shutil
    import uuid
    import subprocess
    from app.tts_server.plugin_loader import _validate_manifest, PluginLoadError

    token = uuid.uuid4().hex
    staging_dir = plugins_dir / f".preview_{token}"

    try:
        # 1. Clone the repository into the staging directory
        staging_dir.mkdir(parents=True)
        # Using depth=1 for shallow clone to be faster and save disk space
        cmd = ["git", "clone", "--depth", "1", git_url, str(staging_dir)]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=120)
        if result.returncode != 0:
            output = "\n".join(part.strip() for part in (result.stderr, result.stdout) if part and part.strip())
            logger.error("Git clone failed for %s: %s", git_url, output[-4000:])
            raise HTTPException(status_code=400, detail="Failed to clone GitHub repository.")

        _reject_staging_symlinks(staging_dir)

        # 2. Check for manifest.json
        manifest_path = staging_dir / "manifest.json"
        if not manifest_path.is_file():
            raise HTTPException(status_code=400, detail="Repository is missing manifest.json")

        try:
            manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.exception("Failed to parse manifest.json from GitHub repo")
            raise HTTPException(status_code=400, detail="Invalid manifest.json.") from exc

        # 2b. Check for optional settings_schema.json
        schema_path = staging_dir / "settings_schema.json"
        if schema_path.is_file():
            try:
                schema_data = json.loads(schema_path.read_text(encoding="utf-8"))
                if not isinstance(schema_data, dict):
                    raise ValueError("settings_schema.json must be a dictionary (object) at the root.")
            except Exception as exc:
                logger.exception("Failed to parse settings_schema.json from GitHub repo")
                raise HTTPException(status_code=400, detail="Invalid settings_schema.json.") from exc

        preview_engine_id = str(manifest_data.get("engine_id") or "").strip()
        preview_folder_name = f"tts_{preview_engine_id}" if preview_engine_id else staging_dir.name
        try:
            _validate_manifest(manifest=manifest_data, folder_name=preview_folder_name)
        except PluginLoadError as exc:
            logger.warning("GitHub plugin manifest validation failed: %s", exc)
            raise HTTPException(status_code=400, detail="Plugin manifest failed validation.") from exc

        engine_id = preview_engine_id

        target_folder = f"tts_{engine_id}"
        target_dir = plugins_dir / target_folder
        if target_dir.exists():
            raise HTTPException(status_code=409, detail="A plugin with this engine_id is already installed.")

        # 4. Parse requirements
        req_text = ""
        req_path = staging_dir / "requirements.txt"
        if req_path.is_file():
            try:
                req_text = req_path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                pass

        requirements = _parse_requirements(req_text)

    except HTTPException:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        raise
    except subprocess.TimeoutExpired as exc:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        logger.warning("Git clone timed out for %s", git_url)
        raise HTTPException(status_code=408, detail="Timed out while cloning GitHub repository.") from exc
    except Exception as exc:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        logger.exception("Unexpected error during GitHub plugin preview clone")
        raise HTTPException(status_code=500, detail="Failed to stage GitHub plugin.") from exc

    display_name = manifest_data.get("display_name") or engine_id
    version = manifest_data.get("version") or None

    with _staging_lock:
        _staging[token] = {
            "staging_dir": staging_dir,
            "engine_id": engine_id,
            "display_name": display_name,
            "version": version,
            "requirements": requirements,
        }

    return {
        "ok": True,
        "engine_id": engine_id,
        "display_name": display_name,
        "version": version,
        "requirements": requirements,
        "staging_token": token,
    }


def confirm_staged_plugin(*, token: str, plugins_dir: Path) -> dict[str, Any]:
    """Complete a staged plugin import.

    Moves the staging directory to the final plugin location and loads the plugin.
    The staging entry is removed regardless of outcome.
    """
    import shutil

    if not re.fullmatch(r"[0-9a-f]{32}", token):
        raise HTTPException(status_code=400, detail="Invalid staging token.")

    with _staging_lock:
        entry = _staging.pop(token, None)

    if entry is None:
        raise HTTPException(status_code=404, detail="Staging token not found or already used.")

    staging_dir: Path = entry["staging_dir"]
    engine_id: str = entry["engine_id"]
    target_dir = plugins_dir / f"tts_{engine_id}"

    if target_dir.exists():
        if staging_dir.exists():
            shutil.rmtree(staging_dir)
        raise HTTPException(status_code=409, detail="A plugin with this engine_id is already installed.")

    try:
        staging_dir.rename(target_dir)
    except OSError as exc:
        if staging_dir.exists():
            shutil.rmtree(staging_dir)
        logger.exception("Failed to move staging dir to target for engine %s", engine_id)
        raise HTTPException(status_code=500, detail="Failed to install plugin.") from exc

    from app.tts_server import server as _server

    _server.load_plugins(plugins_dir)

    return {
        "ok": True,
        "message": f"Successfully imported plugin {engine_id}",
        "engine_id": engine_id,
    }


def cancel_staged_plugin(*, token: str) -> dict[str, Any]:
    """Discard a staged plugin import and clean up the staging directory."""
    if not re.fullmatch(r"[0-9a-f]{32}", token):
        raise HTTPException(status_code=400, detail="Invalid staging token.")

    with _staging_lock:
        entry = _staging.pop(token, None)

    if entry is None:
        # Already consumed or never existed — treat as success (idempotent cancel).
        return {"ok": True, "message": "Staging token not found (already cancelled or consumed)."}

    staging_dir: Path = entry["staging_dir"]
    if staging_dir.exists():
        try:
            import shutil as _shutil

            _shutil.rmtree(staging_dir)
        except OSError as exc:
            logger.warning("Failed to remove staging dir %s: %s", staging_dir, exc)

    return {"ok": True, "message": "Staging cancelled."}
