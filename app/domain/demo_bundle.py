import argparse
import shutil
import zipfile
from pathlib import Path


ALLOWED_TOP_LEVEL = {"audiobook_studio.db", "projects", "voices"}


def _has_meaningful_entries(path: Path) -> bool:
    if not path.exists():
        return False
    if path.is_file():
        return path.stat().st_size > 0
    for child in path.iterdir():
        if child.name.startswith("."):
            continue
        return True
    return False


def demo_restore_needed(base_dir: Path) -> bool:
    projects_dir = base_dir / "projects"
    voices_dir = base_dir / "voices"
    return (
        not _has_meaningful_entries(projects_dir)
        and not _has_meaningful_entries(voices_dir)
    )


def _safe_extract_path(base_dir: Path, member_name: str) -> Path:
    cleaned = member_name.strip("/")
    if not cleaned:
        raise ValueError("Empty archive member")

    top_level = cleaned.split("/", 1)[0]
    if top_level not in ALLOWED_TOP_LEVEL:
        raise ValueError(f"Unsupported demo bundle entry: {member_name}")

    destination = (base_dir / cleaned).resolve()
    resolved_base = base_dir.resolve()
    if destination != resolved_base and resolved_base not in destination.parents:
        raise ValueError(f"Unsafe archive member path: {member_name}")

    return destination


def restore_demo_bundle(base_dir: Path, zip_path: Path) -> list[Path]:
    extracted: list[Path] = []
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            destination = _safe_extract_path(base_dir, member.filename)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as src, destination.open("wb") as dst:
                shutil.copyfileobj(src, dst)
            extracted.append(destination)
    return extracted


def main() -> int:
    parser = argparse.ArgumentParser(description="Audiobook Studio demo bundle helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    status_parser = subparsers.add_parser("status")
    status_parser.add_argument("--base-dir", required=True)

    restore_parser = subparsers.add_parser("restore")
    restore_parser.add_argument("--base-dir", required=True)
    restore_parser.add_argument("--zip", required=True)

    args = parser.parse_args()
    base_dir = Path(args.base_dir).resolve()

    if args.command == "status":
        if demo_restore_needed(base_dir):
            print("restore-needed")
            return 0
        print("library-present")
        return 1

    zip_path = Path(args.zip).resolve()
    restored = restore_demo_bundle(base_dir, zip_path)
    print(f"restored {len(restored)} file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
