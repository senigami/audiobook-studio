# Task 003 — Switch upload from per-file loop to `upload_folder()` (atomic, structure-preserving)

Status: pending

## Goal

`HFHubClient.upload_files()` currently pushes each file with a separate `upload_file()` call
using `path_in_repo=Path(file_path).name` — this **flattens directory structure** (`samples/
preview.mp3` becomes `preview.mp3` at repo root) and is N sequential commits, not one atomic
commit. Per the research in `design-docs/plans/reference/v2_huggingface_upload_implementation.md`
§2.1, `HfApi.upload_folder()` is the correct API: point it at the folder, get one atomic commit,
structure preserved, no manual LFS/Xet handling needed.

This requires a **signature change**: `upload_files` moves from `files: list[Path]` to
`folder_path: Path`. Every caller and every test that touches this signature must change in the
same commit — see the ripple list in `01-map.md`'s "Connections" section before starting.

## Files

- `app/domain/voices/huggingface.py`:
  - `HFHubClientProtocol.upload_files` (line 233-242)
  - `HFHubClient.upload_files` (line 405-443)
  - `upload_voice_to_hub` (line 649-666)
- `app/api/routers/voices_huggingface.py`:
  - `upload_hub_voice` (line 332-375)
- `tests/domain/test_voice_huggingface_client.py`:
  - `TestHFHubClientUpload` (line 304-359) — 4 tests
- `tests/api/test_api_voices_huggingface.py`:
  - `FakeHFHubClient.upload_files` (line 53-55)
  - `TestUploadEndpoint::test_upload_pushes_extracted_bundle_files_and_never_returns_token` (line 304-328)
- `tests/domain/test_voice_huggingface.py`:
  - `FakeHFHubClient.upload_files` (line 56-60) and
    `TestTokenHandling::test_token_not_present_in_upload_log_output` (line 247-275 — passes
    `[sample_file]` to `upload_voice_to_hub` and serializes `upload_calls[0]["files"]`)
    <!-- added 2026-07-04, Fable accuracy review: this fake/test was missing from the file list -->


## Current contract — Protocol (line 233-242)

```python
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
```

## Target contract — Protocol

```python
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
```

## Current implementation (line 405-443, `HFHubClient.upload_files`)

```python
    def upload_files(
        self,
        hub_id: str,
        files: list[Path],
        *,
        tags: list[str],
        token: HFToken,
    ) -> str:
        validate_hub_id(hub_id)
        raw_token = _hf_token_value(token)
        if not raw_token:
            raise ValueError("upload_files requires a non-empty HF token")

        self._api.create_repo(hub_id, token=raw_token, exist_ok=True)

        last_commit = None
        for file_path in files:
            commit_info = self._api.upload_file(
                path_or_fileobj=str(file_path),
                path_in_repo=Path(file_path).name,
                repo_id=hub_id,
                token=raw_token,
                commit_message=f"Add/update {Path(file_path).name} via Audiobook Studio",
            )
            last_commit = commit_info

        # Best-effort tag application: tags are declared via the model card's
        # metadata rather than a dedicated "add tag" endpoint.
        try:
            from huggingface_hub import ModelCard, ModelCardData  # noqa: PLC0415

            card_data = ModelCardData(tags=list(dict.fromkeys(tags)))
            card = ModelCard.from_template(card_data, model_id=hub_id.split("/", 1)[-1])
            card.push_to_hub(hub_id, token=raw_token)
        except Exception:
            logger.warning("Failed to push tag metadata card for %s (files were still uploaded)", hub_id)

        commit_id = getattr(last_commit, "oid", None) or getattr(last_commit, "commit_url", None) or ""
        return str(commit_id)
```

## Target implementation

```python
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
```

Notes on this change, don't deviate:
- `repo_type="model"` is now passed explicitly on **both** `create_repo` and `upload_folder`
  (INV-HF-2 — never inferred). The current code only passes it nowhere; add it to both calls.
- The generic `ModelCard.from_template(...).push_to_hub(...)` fallback is **removed entirely**
  (not kept as a fallback — see `00-overview.md` Open Question 2; if you believe it should be
  kept as a defensive fallback instead, flag that to the owner rather than silently keeping or
  removing it against this task's instruction).
- `tags` is still accepted as a parameter (the Protocol signature keeps it) even though this
  implementation no longer uses it to push a separate tag-only card — the tags now travel via the
  generated `README.md`'s YAML frontmatter, which is already part of `folder_path`'s contents
  after task 002 lands. Keeping the parameter (even if unused by this specific implementation)
  preserves the Protocol shape for `HFHubClientProtocol` and any other implementer. If ruff/lint
  flags the now-unused `tags` parameter, prefix it `_tags` only if required to pass lint — prefer
  keeping the name `tags` with a `# noqa` only if actually needed; check `ruff check` output
  before adding a suppression.

## `upload_voice_to_hub` (line 649-666) — no signature change needed to its own params, just passthrough

```python
def upload_voice_to_hub(
    client: HFHubClientProtocol,
    hub_id: str,
    folder_path: Path,
    *,
    extra_tags: Optional[list[str]] = None,
    token: HFToken,
) -> str:
    """Push a voice bundle folder to ``hub_id``, auto-setting the anchor tag + ``as-*`` tags.
    ...
    """
    tags = [HF_VOICE_TAG, *(extra_tags or [])]
    logger.info("Uploading voice bundle to Hub repo %s (folder: %s)", hub_id, folder_path)
    return client.upload_files(hub_id, folder_path, tags=tags, token=token)
```

(Only the parameter name `files: list[Path]` → `folder_path: Path` changes; the body is
otherwise identical — just update the log line to not assume a `len()`.)

## Router change (`app/api/routers/voices_huggingface.py`, `upload_hub_voice`, line 332-375)

Current (line 355-371):
```python
    import zipfile

    extract_dir = contained_path(TRANSIENT_DIR, "hf_uploads", safe_basename(body.voice_id))
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(bundle_path) as zf:
        zf.extractall(extract_dir)

    loose_files = [p for p in extract_dir.rglob("*") if p.is_file()]

    try:
        commit_id = upload_voice_to_hub(
            _client(),
            body.hub_id,
            loose_files,
            extra_tags=body.extra_tags,
            token=token,
        )
```

Target — delete the `loose_files` line entirely, pass `extract_dir` directly:
```python
    import zipfile

    extract_dir = contained_path(TRANSIENT_DIR, "hf_uploads", safe_basename(body.voice_id))
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(bundle_path) as zf:
        zf.extractall(extract_dir)

    try:
        commit_id = upload_voice_to_hub(
            _client(),
            body.hub_id,
            extract_dir,
            extra_tags=body.extra_tags,
            token=token,
        )
```

## Test updates (must land in the same change)

1. `tests/domain/test_voice_huggingface_client.py::TestHFHubClientUpload`:
   - `test_upload_files_creates_repo_and_uploads_each_file` — rename to
     `test_upload_files_creates_repo_and_uploads_folder`. Replace
     `instance.upload_file.return_value = ...` / `instance.upload_file.assert_called_once()`
     with `instance.upload_folder.return_value = SimpleNamespace(oid="abc123")` /
     `instance.upload_folder.assert_called_once()`. Pass a `tmp_path` directory instead of a
     single file to `client.upload_files(...)`. Remove the `MockModelCard` patch entirely (no
     longer called) — drop `patch("huggingface_hub.ModelCard")` from this test.
   - `test_upload_files_never_logs_or_returns_token` — same `upload_folder` mock swap; remove the
     `MockModelCard` patch here too.
   - `test_upload_files_rejects_malformed_hub_id` / `test_upload_files_requires_a_token` — change
     the second positional arg from `[]` to `Path("/tmp/whatever")` (any `Path`, since these tests
     raise before ever touching the filesystem) to match the new signature.
2. `tests/api/test_api_voices_huggingface.py`:
   - `FakeHFHubClient.upload_files(self, hub_id, folder_path, *, tags, token)` — rename the
     recorded dict key from `"files"` to `"folder_path"`.
   - `test_upload_pushes_extracted_bundle_files_and_never_returns_token` — it asserts MORE than
     call count (corrected 2026-07-04, Fable accuracy review — this task previously claimed it
     "only asserts `len(fake.upload_calls) == 1`"): lines 323-328 also assert
     `call["hub_id"]`, the uploaded file **basenames** via
     `{Path(p).name for p in call["files"]}` (`voice.json`, `preview.mp3` present), and
     `"as-narrator" in call["tags"]`. After the signature change, rewrite the file-name
     assertions against the recorded `folder_path`'s on-disk contents (e.g.
     `{p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file()}` includes
     `voice.json` and `samples/preview.mp3`) — don't drop the content coverage, and note the
     nested `samples/preview.mp3` assertion is exactly what pins the structure-preservation goal.
3. `tests/domain/test_voice_huggingface.py`:
   - `FakeHFHubClient.upload_files` (line 56-60) — same `files` → `folder_path` rename.
   - `TestTokenHandling::test_token_not_present_in_upload_log_output` — currently passes
     `[sample_file]` to `upload_voice_to_hub` and serializes
     `upload_calls[0]["files"]` (line 272); pass `tmp_path` (a dir) instead and serialize the
     recorded `folder_path`. This is the test INV-HF-1 names — keep its intent identical.
4. Grep the whole test suite for `HFHubClientProtocol` and `upload_files(` before finishing, to
   catch any fake/caller this list missed: `grep -rn "upload_files(" tests/ app/`.

## R1 revert-check

`git stash push -- app/domain/voices/huggingface.py app/api/routers/voices_huggingface.py`, run
the updated tests (they should fail — either `AttributeError: upload_folder` not called, or the
old code still calling `upload_file` in a loop), `git stash pop`, confirm green.

## Acceptance criteria

- [ ] `HFHubClientProtocol.upload_files` and `HFHubClient.upload_files` both take `folder_path: Path`.
- [ ] `HFHubClient.upload_files` calls `self._api.upload_folder(...)` exactly once, with
      `repo_type="model"` passed explicitly on both `create_repo` and `upload_folder`.
- [ ] The `ModelCard.from_template`/`push_to_hub` fallback block is deleted.
- [ ] `upload_hub_voice` passes `extract_dir` directly — no `loose_files` list construction.
- [ ] `./venv/bin/python -m pytest tests/domain/test_voice_huggingface_client.py tests/api/test_api_voices_huggingface.py -q` — all green.
- [ ] `./venv/bin/python -m pytest -q` (full suite) — green.
- [ ] `ruff check app/domain/voices/huggingface.py app/api/routers/voices_huggingface.py` clean.
- [ ] `git diff app/domain/voices/bundles.py` empty (INV-HF-4).
- [ ] INV-HF-1 (token never logged/returned) still verified by
      `test_upload_files_never_logs_or_returns_token` and the token-security test file.

## Dependencies

None strictly (touches different functions than task 002), but see `02-roadmap.md` for the
same-router-file serialization note if run concurrently with task 002.

## Map links

`01-map.md` — Parts: `HFHubClient.upload_files()`, `upload_voice_to_hub()`, `export_hub_voice`/
`upload_hub_voice`. Connections diagram, bottom half. Invariants: INV-HF-1, INV-HF-2, INV-HF-3,
INV-HF-4. Risks: "Test-contract drift risk."

## Out of scope

- Do not change `export_hf_voice_bundle` or the `/export` endpoint — that's task 002.
- Do not implement `preupload_lfs_files` or any custom commit-batching — the research doc is
  explicit that `upload_folder` handles this transparently; don't add unneeded complexity.
- Do not implement OAuth device-code auth — token-based auth only, unchanged.
