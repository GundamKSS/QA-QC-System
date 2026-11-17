#!/usr/bin/env python3
"""Check or restore the local QCheck snapshot from before the titanium theme."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import tarfile
import tempfile


BACKUP_DIR = Path(__file__).resolve().parent
DEFAULT_ROOT = Path(__file__).resolve().parents[2]
ADDED_PATH = "src/app/app-theme.css"
HASH_PATTERN = re.compile(r"[0-9a-f]{64}\Z")


class RestoreError(Exception):
    pass


def relative_name(value):
    if not isinstance(value, str) or not value:
        raise RestoreError("A manifest contains an invalid path.")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or str(path) != value or "\\" in value:
        raise RestoreError(f"Unsafe snapshot path: {value!r}")
    if not value.startswith("src/"):
        raise RestoreError(f"Snapshot path is outside src/: {value!r}")
    return value


def read_manifest(path):
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise RestoreError(f"Cannot read {path.name}: {error}") from error
    if not isinstance(result, dict) or not result:
        raise RestoreError(f"{path.name} must be a nonempty path-to-SHA256 mapping.")
    for name, digest in result.items():
        relative_name(name)
        if not isinstance(digest, str) or not HASH_PATTERN.fullmatch(digest):
            raise RestoreError(f"Invalid SHA256 for {name} in {path.name}.")
    return result


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_originals(manifest):
    contents = {}
    modes = {}
    try:
        with tarfile.open(BACKUP_DIR / "originals.tar.gz", mode="r:gz") as archive:
            for member in archive.getmembers():
                name = relative_name(member.name)
                if not member.isfile() or name not in manifest or name in contents:
                    raise RestoreError(f"Unexpected or duplicate archive member: {name}")
                source = archive.extractfile(member)
                if source is None:
                    raise RestoreError(f"Cannot read archive member: {name}")
                with source:
                    data = source.read()
                if sha256(data) != manifest[name]:
                    raise RestoreError(f"Original archive integrity check failed: {name}")
                contents[name] = data
                modes[name] = member.mode & 0o777
    except (OSError, tarfile.TarError) as error:
        raise RestoreError(f"Cannot verify originals.tar.gz: {error}") from error
    if set(contents) != set(manifest):
        raise RestoreError("Archive membership does not exactly match manifest.json.")
    return contents, modes


def target_path(root, name):
    relative_name(name)
    target = root.joinpath(*PurePosixPath(name).parts)
    if not target.resolve().is_relative_to(root):
        raise RestoreError(f"Target escapes the selected root: {name}")
    current = root
    for part in PurePosixPath(name).parts:
        current /= part
        if current.is_symlink():
            raise RestoreError(f"Refusing a symbolic link in the target path: {name}")
    if target.exists() and not target.is_file():
        raise RestoreError(f"Target is not a regular file: {name}")
    return target


def current_digest(path):
    return sha256(path.read_bytes()) if path.exists() else None


def atomic_write(path, contents, mode):
    # Each replacement stays on the target filesystem and preserves its original mode.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".qcheck-restore-", delete=False) as output:
            temporary = Path(output.name)
            output.write(contents)
        temporary.chmod(mode)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--check", action="store_true", help="Verify and list changes; writes nothing (default).")
    action.add_argument("--apply", action="store_true", help="Restore the recorded theme files after all checks pass.")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="Target checkout root; intended for a temporary restoration rehearsal.")
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    if not root.is_dir():
        raise RestoreError(f"Target root does not exist: {root}")

    manifest = read_manifest(BACKUP_DIR / "manifest.json")
    originals, modes = read_originals(manifest)
    print(f"Verified archive: {len(originals)} original files.")

    applied_path = BACKUP_DIR / "applied-manifest.json"
    if not applied_path.is_file():
        differences = [name for name, digest in manifest.items() if current_digest(target_path(root, name)) != digest]
        if target_path(root, ADDED_PATH).exists():
            differences.append(ADDED_PATH)
        print(f"Current differences from snapshot: {len(differences)}")
        for name in sorted(differences):
            print(f"  {name}")
        raise RestoreError("applied-manifest.json has not been finalized; no files were changed.")

    applied = read_manifest(applied_path)
    if ADDED_PATH not in applied or not (set(applied) & set(manifest)):
        raise RestoreError("Applied manifest must include the added stylesheet and changed original files.")
    if set(applied) - (set(manifest) | {ADDED_PATH}):
        raise RestoreError("Applied manifest includes files outside this theme snapshot.")

    actions = []
    conflicts = []
    for name, applied_digest in sorted(applied.items()):
        target = target_path(root, name)
        digest = current_digest(target)
        original_digest = manifest.get(name)
        # An already-restored file (or already-removed new file) is a safe no-op.
        if digest == original_digest:
            continue
        if digest != applied_digest:
            conflicts.append(name)
        else:
            actions.append((name, target, digest))

    print(f"Theme differences to restore: {len(actions)}")
    for name, _, _ in actions:
        print(f"  {'REMOVE' if name == ADDED_PATH else 'RESTORE'} {name}")
    if conflicts:
        raise RestoreError("Files have changed since the theme was finalized; refusing all writes:\n  " + "\n  ".join(conflicts))

    if not args.apply:
        print("Check passed. No files changed. Use --apply to restore these files.")
        return

    # Preflight every target before the first write; never extract archive paths directly.
    for name, target, digest in actions:
        if current_digest(target_path(root, name)) != digest:
            raise RestoreError(f"File changed during preflight; no files were changed: {name}")
    for name, target, _ in actions:
        if name == ADDED_PATH:
            target.unlink()
        else:
            atomic_write(target, originals[name], modes[name])
    print(f"Restored {len(actions)} theme files. Other files were left unchanged.")


if __name__ == "__main__":
    try:
        run()
    except (RestoreError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
