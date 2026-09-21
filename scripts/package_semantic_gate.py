"""Offline diagnostic packaging and standalone byte/provenance verification. No API calls."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from semantic_gate_diagnostic import decorate

ROOT = Path(__file__).resolve().parents[1]
E = ROOT/'evidence/jev-semantic-gate'
SOURCE = '073da696555a7370ac292f665446695dbd20560f'
REQUESTS = '585992e6d58d654710dfdcc987defb16b6dfd986'
RAW = 'c41183b5d92ff8a9815ee3a9a317bd46684a1fbf'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def git(*args):
    return subprocess.check_output(['git', '--no-replace-objects', *args], cwd=ROOT, stderr=subprocess.DEVNULL)


def git_hash(kind, raw):
    return hashlib.sha1((kind+' '+str(len(raw))+'\0').encode()+raw).hexdigest()


def tree_entry(raw, component):
    offset = 0
    found = []
    while offset < len(raw):
        space = raw.index(b' ', offset)
        nul = raw.index(b'\0', space)
        if nul+21 > len(raw):
            raise ValueError('truncated tree')
        name = raw[space+1:nul].decode()
        if name == component:
            found.append((raw[offset:space].decode(), raw[nul+1:nul+21].hex()))
        offset = nul+21
    if len(found) != 1:
        raise ValueError('nonunique tree entry')
    return found[0]


def package(frozen, out):
    # Read required real input before making an output directory; absent inputs cannot pass.
    data = json.loads((frozen/'recorded-cases.json').read_bytes())
    result = json.loads((E/'results/report.json').read_bytes())
    if data['summary'] != result['summary']:
        raise ValueError('frozen/export report mismatch')
    out.mkdir(parents=True, exist_ok=False)
    shutil.copytree(frozen, out/'frozen')
    for name in ('recorded-cases.json','metrics.csv','ZL-020-protocol.md'):
        shutil.copyfile(frozen/name, out/name)
    (out/'index.html').write_text(decorate((frozen/'index.html').read_text(), result))
    for name in ('report.json','report.csv'):
        shutil.copyfile(E/'results'/name, out/name)
    shutil.copyfile(ROOT/'experiments/ZL-020-results.md', out/'ZL-020-results.md')
    source_manifest = json.loads((E/'source-freeze.json').read_bytes())
    paths = set(source_manifest['files'])
    paths.update(str(p.relative_to(ROOT)) for p in E.rglob('*') if p.is_file())
    paths.update(str(p.relative_to(ROOT)) for p in (ROOT/'scripts').glob('test_semantic_gate*.py'))
    paths.update(['scripts/semantic_gate_diagnostic.py','scripts/package_semantic_gate.py','experiments/ZL-020-results.md'])
    browser = ROOT/'scripts/check-semantic-gate-browser.cjs'
    if browser.exists():
        paths.add(str(browser.relative_to(ROOT)))
    head = git('rev-parse','HEAD').decode().strip()
    objects, memberships, uncommitted = {}, [], []
    def add_object(kind, oid):
        if oid not in objects:
            raw = git('cat-file',kind,oid)
            if git_hash(kind,raw) != oid:
                raise ValueError('Git object hash mismatch')
            objects[oid] = dict(type=kind, raw_base64=base64.b64encode(raw).decode())
        return base64.b64decode(objects[oid]['raw_base64'])
    for rel in sorted(paths):
        source = ROOT/rel
        if source.is_symlink():
            raise ValueError('symlink not allowed')
        target = out/'source'/rel
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(source,target)
        commit = SOURCE if rel in source_manifest['files'] or rel == 'evidence/jev-semantic-gate/source-freeze.json' else RAW if '/recording/' in rel else REQUESTS if any('/'+part+'/' in rel for part in ('authoring','prepared','review')) or rel.endswith('phase2-authorization.json') else head
        try:
            committed = git('show',commit+':'+rel)
        except subprocess.CalledProcessError:
            uncommitted.append(rel)
            continue
        if committed != source.read_bytes():
            uncommitted.append(rel)
            continue
        raw_commit = add_object('commit',commit)
        expected = raw_commit.split(b'\n',1)[0].split()[1].decode()
        components = Path(rel).parts
        for i, component in enumerate(components):
            raw_tree = add_object('tree',expected)
            mode, expected = tree_entry(raw_tree,component)
            if mode != ('100644' if i == len(components)-1 else '40000'):
                raise ValueError('unexpected Git mode')
        if git_hash('blob',committed) != expected:
            raise ValueError('blob inclusion mismatch')
        memberships.append(dict(path='source/'+rel,repository_path=rel,commit=commit,blob=expected))
    proof = dict(schema='ZL020-portable-git-inclusion-v1',objects=objects,memberships=memberships)
    (out/'git-inclusion.json').write_text(json.dumps(proof,sort_keys=True,indent=2)+'\n')
    provenance = dict(schema='ZL020-standalone-diagnostic-v1',source_freeze_commit=SOURCE,request_freeze_commit=REQUESTS,
        raw_evidence_commit=RAW,package_source_commit=head,artifact_source_clean=not uncommitted,
        uncommitted_additive_files=uncommitted, frozen_index_sha256=sha((frozen/'index.html').read_bytes()),
        recorded_cases_sha256=sha((frozen/'recorded-cases.json').read_bytes()),
        presentation='Derived index only; frozen export and all source/evidence bytes retained.',
        authority='Git Merkle proof verifies byte inclusion, not independent review or signed attestation.',
        reproduction='python3 -B source/scripts/package_semantic_gate.py --verify .',
        comparator='pending_parent_owned',publication=False)
    (out/'package-provenance.json').write_text(json.dumps(provenance,indent=2,sort_keys=True)+'\n')
    manifest = {str(p.relative_to(out)):dict(sha256=sha(p.read_bytes()),bytes=p.stat().st_size)
        for p in sorted(out.rglob('*')) if p.is_file()}
    (out/'SHA256SUMS.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n')
    return provenance


def verify(directory):
    manifest = json.loads((directory/'SHA256SUMS.json').read_bytes())
    actual = {str(p.relative_to(directory)) for p in directory.rglob('*') if p.is_file()}
    if actual != set(manifest) | {'SHA256SUMS.json'}:
        raise ValueError('package file set mismatch')
    for rel, entry in manifest.items():
        path = Path(rel)
        if path.is_absolute() or '..' in path.parts or (directory/path).is_symlink():
            raise ValueError('invalid package path')
        raw = (directory/path).read_bytes()
        if sha(raw) != entry['sha256'] or len(raw) != entry['bytes']:
            raise ValueError('package digest mismatch: '+rel)
    proof = json.loads((directory/'git-inclusion.json').read_bytes())
    objects = {}
    for oid, entry in proof['objects'].items():
        raw = base64.b64decode(entry['raw_base64'], validate=True)
        if git_hash(entry['type'],raw) != oid:
            raise ValueError('Git proof object corrupted')
        objects[oid] = raw
    for member in proof['memberships']:
        raw_commit = objects[member['commit']]
        expected = raw_commit.split(b'\n',1)[0].split()[1].decode()
        components = Path(member['repository_path']).parts
        for i, component in enumerate(components):
            mode, expected = tree_entry(objects[expected],component)
            if mode != ('100644' if i == len(components)-1 else '40000'):
                raise ValueError('Git proof mode mismatch')
        if expected != member['blob'] or git_hash('blob',(directory/member['path']).read_bytes()) != expected:
            raise ValueError('Git proof blob mismatch')
    provenance = json.loads((directory/'package-provenance.json').read_bytes())
    if sha((directory/'frozen/index.html').read_bytes()) != provenance['frozen_index_sha256']:
        raise ValueError('frozen HTML mismatch')
    if (directory/'recorded-cases.json').read_bytes() != (directory/'frozen/recorded-cases.json').read_bytes():
        raise ValueError('recorded export changed')
    from build_semantic_gate import record, summary
    data = json.loads((directory/'recorded-cases.json').read_bytes())
    e = directory/'source/evidence/jev-semantic-gate'
    inputs = json.loads((e/'authoring/inputs.json').read_bytes())
    gold = json.loads((e/'authoring/gold.json').read_bytes())
    rebuilt = []
    for case in inputs:
        ident = case['id']
        request = json.loads((e/'prepared/requests'/(ident+'.json')).read_bytes())
        body_file = e/'recording'/(ident+'.response.raw')
        receipt_file = e/'recording'/(ident+'.receipt.json')
        body = body_file.read_bytes() if body_file.exists() else b''
        receipt = json.loads(receipt_file.read_bytes()) if receipt_file.exists() else None
        rebuilt.append(record(case,gold[ident],request,body,receipt))
    if rebuilt != data['cases'] or summary(rebuilt) != data['summary']:
        raise ValueError('frozen evaluator replay mismatch')
    return dict(passed=True,files_verified=len(manifest),git_inclusions_verified=len(proof['memberships']),
        replayed_cases=len(rebuilt),artifact_source_clean=provenance['artifact_source_clean'],
        package_source_commit=provenance['package_source_commit'],
        package_manifest_sha256=sha((directory/'SHA256SUMS.json').read_bytes()))


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--frozen',type=Path)
    cli.add_argument('--out',type=Path)
    cli.add_argument('--verify',type=Path)
    args = cli.parse_args()
    if args.verify is not None:
        result = verify(args.verify)
    elif args.frozen is not None and args.out is not None:
        package(args.frozen,args.out)
        result = verify(args.out)
    else:
        cli.error('--verify DIR or --frozen DIR --out NEWDIR required')
    print(json.dumps(result,indent=2))


if __name__ == '__main__':
    main()
