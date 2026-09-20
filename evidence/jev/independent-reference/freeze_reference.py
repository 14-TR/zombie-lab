#!/usr/bin/env python3
"""One-time local freeze of this owned oracle preparation directory."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
LEGACY = Path('/Users/tr/Projects/zombie-lab-neural-two-tick')
GOAL = Path('/Users/tr/Projects/zombie-lab-evidence/ZL-014-goal.md')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_new(name, value):
    with (ROOT / name).open('x') as handle:
        json.dump(value, handle, sort_keys=True, indent=2, allow_nan=False)
        handle.write('\n')


def git(*args):
    return subprocess.check_output(['git', '-C', str(LEGACY), *args], text=True).strip()


def main():
    if (ROOT / 'FREEZE.json').exists():
        raise SystemExit('Already frozen. Do not overwrite or silently refreeze.')
    source_commit = git('rev-parse', 'HEAD')
    contract_commit = '7bb12e5b0c84bd2f14c2e90360dfca64c8313d17'
    tree = git('rev-parse', 'HEAD^{tree}')
    assert source_commit == '1bf90b4584fad715dcca2686a9e242b6c2a2195f'
    assert tree == git('rev-parse', contract_commit + '^{tree}')
    assert not git('status', '--porcelain=v1')
    inputs = json.loads((ROOT / 'selected-inputs.json').read_text())
    reference = json.loads((ROOT / 'reference.json').read_text())
    proof = json.loads((ROOT / 'certificate-verification.json').read_text())
    parity = json.loads((ROOT / 'legacy-parity.json').read_text())
    rows = reference['records']
    ids = [r['stateIndex'] for r in rows]
    assert len(ids) == len(set(ids)) == 24
    assert ids == sorted(ids) == [r['stateIndex'] for r in inputs['records']]
    assert proof['ok'] and parity['ok']
    assert proof['states'] == 343000 and proof['legalActions'] == 1351892
    assert parity['referenceHashes']['reference.json'] == digest(ROOT / 'reference.json')
    actions = [action for row in rows for action in row['actions']]
    summary = {
        'schemaVersion': 1, 'pilotStates': len(rows), 'pilotActions': len(actions),
        'initialContacts': sum(r['terminal'] for r in rows),
        'initialAvoidable': sum(r['avoidable'] for r in rows),
        'immediateCaptureActions': sum(a['captured'] for a in actions),
        'avoidableSuccessorActions': sum(a['successorAvoidable'] for a in actions),
        'safeButLosingSuccessorActions': sum(not a['captured'] and not a['successorAvoidable'] for a in actions),
        'numericStateIds': ids, 'legacyIds': [r['id'] for r in rows],
        'selection': inputs['selection'], 'parity': parity,
        'noNewJevImplementationOrResultsRead': True, 'paidCalls': 0,
        'certificateReusedNotResolved': True,
    }
    write_new('artifact-summary.json', summary)
    files = {path.relative_to(ROOT).as_posix(): {'sha256': digest(path), 'bytes': path.stat().st_size}
             for path in sorted(ROOT.rglob('*')) if path.is_file()
             and path.name not in {'FREEZE.json', 'SHA256SUMS'} and '__pycache__' not in path.parts}
    manifest = {
        'schemaVersion': 1, 'kind': 'ZL014-independent-reference-freeze',
        'frozenAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'status': 'frozen-before-any-new-implementation-or-results-access-by-this-worker',
        'scope': 'oracle preparation only; no new Jev implementation or results review',
        'legacyRoot': str(LEGACY), 'legacyCommit': source_commit, 'contractBaselineCommit': contract_commit,
        'sharedTree': tree, 'legacyWorktreeClean': True,
        'goalPath': str(GOAL), 'goalSha256': digest(GOAL),
        'certificateSha256': proof['certificateSha256'], 'sourceHashes': proof['sourceHashes'],
        'transitionSha256': proof['transitionSha256'], 'rankSha256': proof['rankSha256'],
        'files': files, 'fileCountExcludingFreezeAndChecksumList': len(files),
        'fileBytesExcludingFreezeAndChecksumList': sum(entry['bytes'] for entry in files.values()),
        'pilotStates': len(rows), 'pilotActions': len(actions),
        'completeCertificateStatesChecked': proof['states'],
        'completeCertificateActionsChecked': proof['legalActions'],
        'proofWallSeconds': proof['wallSeconds'], 'proofPeakRssBytes': proof['peakRssBytes'],
        'immutability': 'SHA-256 snapshot plus read-only files, not an operating-system security boundary',
    }
    write_new('FREEZE.json', manifest)
    with (ROOT / 'SHA256SUMS').open('x') as handle:
        for name in sorted([*files, 'FREEZE.json']):
            handle.write(digest(ROOT / name) + '  ' + name + '\n')
    for name in [*files, 'FREEZE.json', 'SHA256SUMS']:
        (ROOT / name).chmod(0o555 if name == 'oracle.py' else 0o444)
    print(json.dumps({'freeze': str(ROOT / 'FREEZE.json'), 'freezeSha256': digest(ROOT / 'FREEZE.json'),
                      'referenceSha256': digest(ROOT / 'reference.json'),
                      'oracleSha256': digest(ROOT / 'oracle.py'),
                      'pilotStates': len(rows), 'pilotActions': len(actions),
                      'retainedBytes': sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file())}, indent=2))


if __name__ == '__main__':
    main()
