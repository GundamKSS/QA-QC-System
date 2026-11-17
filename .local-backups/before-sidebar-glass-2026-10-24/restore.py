#!/usr/bin/env python3
"""Restore only the sidebar glass files, with checks against later edits."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import os
import tarfile
import tempfile

backup = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true')
parser.add_argument('--root', type=Path, default=backup.parents[1])
args = parser.parse_args()
root = args.root.resolve()
digest = lambda data: hashlib.sha256(data).hexdigest()
original = json.loads((backup / 'original-manifest.json').read_text())
applied = json.loads((backup / 'applied-manifest.json').read_text())
if not original.keys() <= applied.keys():
    raise SystemExit('Manifest membership mismatch. No files changed.')
contents = {}
with tarfile.open(backup / 'originals.tar.gz') as archive:
    for member in archive.getmembers():
        name = member.name
        parts = PurePosixPath(name)
        if not member.isfile() or name not in original or name in contents or parts.is_absolute() or '..' in parts.parts:
            raise SystemExit('Unsafe archive. No files changed.')
        data = archive.extractfile(member).read()
        if digest(data) != original[name]:
            raise SystemExit('Archive integrity failure. No files changed.')
        contents[name] = data
if contents.keys() != original.keys():
    raise SystemExit('Incomplete archive. No files changed.')
changes = []
for name in applied:
    target = root / name
    if target.is_symlink() or not target.resolve().is_relative_to(root) or (target.exists() and not target.is_file()):
        raise SystemExit(f'Invalid target: {name}. No files changed.')
    current = digest(target.read_bytes()) if target.exists() else None
    if current == original.get(name):
        continue
    if current != applied[name]:
        raise SystemExit(f'Later edits found: {name}. No files changed.')
    changes.append((target, contents.get(name)))
print(f'Verified {len(original)} original files; {len(changes)} files to restore.')
if args.apply:
    for target, data in changes:
        if data is None:
            target.unlink()
            continue
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as output:
            temporary = Path(output.name)
            output.write(data)
        temporary.chmod(target.stat().st_mode & 0o777 if target.exists() else 0o644)
        os.replace(temporary, target)
    print('Restored the prior sidebar glass. Database and other files unchanged.')
else:
    print('Check passed. No files changed. Use --apply to restore.')
