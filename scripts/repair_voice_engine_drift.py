#!/usr/bin/env python
import argparse
import json
import os
import sys
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description="Repair voice engine drift in state.json and voice profiles.")
    parser.add_argument("--engine", default="xtts", help="Target engine (default: 'xtts')")
    parser.add_argument("--source-engine", default="voxtral", help="Source engine to replace (default: 'voxtral')")
    parser.add_argument("--voices-dir", default="voices", help="Path to voices directory")
    parser.add_argument("--state-file", default="state.json", help="Path to state.json")
    parser.add_argument("--apply", action="store_true", help="Apply the changes (default is dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="Dry run mode (no changes will be written)")

    args = parser.parse_args()

    target_engine = args.engine.strip().lower()
    source_engine = args.source_engine.strip().lower()
    voices_dir_path = Path(args.voices_dir).resolve()
    state_file_path = Path(args.state_file).resolve()
    apply_changes = args.apply and not args.dry_run

    if not apply_changes:
        print("=== DRY RUN MODE (No changes will be written) ===\n")
    else:
        print("=== APPLY MODE (Writing changes to disk) ===\n")

    changes_made = 0

    # 1. Repair state.json
    if state_file_path.exists():
        try:
            with open(state_file_path, "r", encoding="utf-8") as f:
                state_data = json.load(f)

            settings = state_data.get("settings", {})
            current_default = settings.get("default_engine")

            if current_default == source_engine:
                print(f"Proposed: Update settings.default_engine in '{state_file_path}' from '{current_default}' to '{target_engine}'")
                if apply_changes:
                    settings["default_engine"] = target_engine
                    state_data["settings"] = settings
                    with open(state_file_path, "w", encoding="utf-8") as f:
                        f.write(json.dumps(state_data, indent=2) + "\n")
                    print("--> Done.")
                changes_made += 1
            else:
                print(f"Info: settings.default_engine in '{state_file_path}' is '{current_default}', not '{source_engine}'. Skipping.")
        except Exception as e:
            print(f"Error processing state.json: {e}", file=sys.stderr)
    else:
        print(f"Warning: State file not found at '{state_file_path}'")

    # 2. Repair voices/*/*/profile.json
    if voices_dir_path.exists() and voices_dir_path.is_dir():
        # Find all profile.json files
        profile_paths = list(voices_dir_path.glob("*/*/profile.json"))
        if not profile_paths:
            print(f"No profile.json files found under '{voices_dir_path}'")
        for profile_path in profile_paths:
            try:
                with open(profile_path, "r", encoding="utf-8") as f:
                    profile_data = json.load(f)

                current_engine = profile_data.get("engine")
                if current_engine == source_engine:
                    print(f"Proposed: Update engine in '{profile_path}' from '{current_engine}' to '{target_engine}'")
                    if apply_changes:
                        profile_data["engine"] = target_engine
                        with open(profile_path, "w", encoding="utf-8") as f:
                            f.write(json.dumps(profile_data, indent=2) + "\n")
                        print("--> Done.")
                    changes_made += 1
            except Exception as e:
                print(f"Error processing profile '{profile_path}': {e}", file=sys.stderr)
    else:
        print(f"Warning: Voices directory not found or not a dir at '{voices_dir_path}'")

    print(f"\nTotal files proposed/modified: {changes_made}")

    if not apply_changes and changes_made > 0:
        print("\nTo apply these changes, run the script with the --apply option.")

if __name__ == "__main__":
    main()
