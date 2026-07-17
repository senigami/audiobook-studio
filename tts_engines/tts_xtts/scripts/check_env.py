import os
import sys
from importlib import metadata

def check_conflicts():
    """Checks for known package conflicts in the current environment."""
    conflicting_dists = []
    # Legacy Coqui packages that are known to conflict with the Idiap fork
    for dist_name in ("coqpit",):
        try:
            metadata.distribution(dist_name)
        except metadata.PackageNotFoundError:
            continue
        else:
            conflicting_dists.append(dist_name)

    return conflicting_dists

def check_health():
    """Checks if the environment is healthy (e.g. pip is present)."""
    # In a venv, we expect Scripts/pip.exe (Windows) or bin/pip (Unix)
    # But since this script is RUNNING in the target venv,
    # we can just check if we can import basic things.
    try:
        import pip
        return True
    except ImportError:
        return False

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"

    if mode == "conflicts":
        conflicts = check_conflicts()
        if conflicts:
            print(f"Conflicts detected: {', '.join(conflicts)}")
            sys.exit(0)  # 0 means "has conflicts" to the caller
        else:
            sys.exit(1)  # 1 means "no conflicts"

    elif mode == "health":
        if check_health():
            sys.exit(1)  # 1 means "healthy"
        else:
            print("Environment unhealthy (pip missing or import failed)")
            sys.exit(0)  # 0 means "unhealthy"

    else:
        print(f"Unknown mode: {mode}")
        sys.exit(2)
