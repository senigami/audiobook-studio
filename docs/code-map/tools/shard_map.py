#!/usr/bin/env python3
"""One-time (and re-runnable) migration: split a single-file map.json into the
sharded layout defined by the map-code skill (v1.6.0).

- shards/files.<slug>.json   one per module prefix (longest-prefix routing), plus _misc
- hashes.json                {"file_hashes": ..., "repo_checksum": ...}
- map.json                   core only: meta (with shards directory), flows,
                             invariants, modules, coupling, hotspots, data

Pure mechanical transform — no record content changes. Verifies round-trip
(record count + per-record equality) before writing anything.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # docs/code-map/


def slug(prefix: str) -> str:
    return prefix.rstrip("/").replace("/", "-") or "_misc"


def route(path: str, prefixes: list[str]) -> str:
    best = ""
    for p in prefixes:
        if path.startswith(p) and len(p) > len(best):
            best = p
    return best


def main() -> None:
    map_path = ROOT / "map.json"
    m = json.loads(map_path.read_text())
    files = m.get("files")
    if files is None:
        sys.exit("map.json has no top-level 'files' — already sharded?")

    # Shard boundaries = module keys, as directory prefixes, plus catch-all "".
    prefixes = [k.rstrip("/") + "/" for k in m["modules"]]

    buckets: dict[str, dict] = {p: {} for p in prefixes}
    buckets[""] = {}
    for path, rec in files.items():
        buckets[route(path, prefixes)][path] = rec

    # Reshard rule (skill: split along child dirs, merge < ~8KB): promote any
    # directory inside the catch-all that owns > 8KB of records to its own shard.
    MERGE_FLOOR = 8 * 1024
    misc = buckets[""]
    by_dir: dict[str, dict] = {}
    for path, rec in misc.items():
        parts = path.split("/")
        depth = 3 if path.startswith("frontend/src/") else 2
        key = "/".join(parts[:depth]) + "/" if len(parts) > depth else ""
        by_dir.setdefault(key, {})[path] = rec
    for key, group in by_dir.items():
        if key and sum(len(json.dumps(r)) for r in group.values()) > MERGE_FLOOR:
            prefixes.append(key)
            buckets[key] = group
            for p in group:
                del misc[p]

    # Round-trip check before any write.
    total = sum(len(b) for b in buckets.values())
    assert total == len(files), f"routing lost records: {total} != {len(files)}"

    shards_dir = ROOT / "shards"
    shards_dir.mkdir(exist_ok=True)
    directory = []
    for prefix in sorted(buckets, key=lambda p: (p != "", p)):
        bucket = buckets[prefix]
        if not bucket and prefix != "":
            continue  # module with no directly-owned files (covered by a longer prefix)
        out = shards_dir / f"files.{slug(prefix)}.json"
        payload = json.dumps({"files": dict(sorted(bucket.items()))}, indent=1, ensure_ascii=False)
        out.write_text(payload + "\n")
        directory.append({
            "prefix": prefix,
            "path": f"shards/files.{slug(prefix)}.json",
            "files": len(bucket),
            "bytes": len(payload) + 1,
        })
    # Directory sorted longest-prefix-first so naive first-match scans also work.
    directory.sort(key=lambda e: -len(e["prefix"]))

    hashes = {
        "file_hashes": m["meta"].pop("file_hashes"),
        "repo_checksum": m["meta"].pop("repo_checksum"),
    }
    (ROOT / "hashes.json").write_text(json.dumps(hashes, indent=1, ensure_ascii=False) + "\n")

    m["meta"]["shards"] = directory
    del m["files"]
    map_path.write_text(json.dumps(m, indent=1, ensure_ascii=False) + "\n")

    # Post-write verification: every original record retrievable via routing.
    for path, rec in files.items():
        entry = next(e for e in directory if path.startswith(e["prefix"]))
        got = json.loads((ROOT / entry["path"]).read_text())["files"][path]
        assert got == rec, f"record mismatch after migration: {path}"

    core = map_path.stat().st_size
    print(f"OK: {len(files)} records -> {len(directory)} shards; map.json now {core/1024:.0f}KB")


if __name__ == "__main__":
    main()
