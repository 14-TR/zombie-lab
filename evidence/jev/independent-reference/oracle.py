#!/usr/bin/env python3
"""ZL-014 independent oracle. Python stdlib; legacy sources only."""
import hashlib
import json
from pathlib import Path

BASELINE = Path('/Users/tr/Projects/zombie-lab-neural-two-tick')
CERTIFICATE = BASELINE / 'evidence/avoidability/data/avoidability-certificate.json'
CERTIFICATE_SHA256 = 'a1f47e74bb5d4f086aedd8d6c01f51edd37e390c74adeb8eae4bc4d0bbc7dfc8'
SOURCE_HASHES = {
    'two-zombies.js': 'ae62cc4ed7d4fb465a97827c0da34eb191005afc3de6c1c0185b163b00fc3243',
    'scripts/build-two-zombies.cjs': '5a5a403b30a0ba1242a0411ff6aee769d787a86d277e1e3cf11d160f69f965c2',
    'scripts/build-avoidability.cjs': '3695964bf1f7a71094f3cd795b264cde5a0d3faa76418c7eaad348e4ca36ace1',
    'experiments/ZL-010-protocol.md': 'c809145e263e8f360b587b16a25183bcf3e55f21cdffad0a713212baa9757f33',
}
DIRECTIONS = ((0, -1), (1, 0), (0, 1), (-1, 0), (0, 0))
ACTION_NAMES = ('N', 'E', 'S', 'W', 'stay')
WIDTH, HEIGHT, CELLS = 10, 7, 70
STATE_COUNT = 343000


def integer(value, low, high, label):
    if type(value) is not int or not low <= value < high:
        raise ValueError(f'{label} must be an integer in [{low},{high})')
    return value


def legal_moves(cell):
    integer(cell, 0, CELLS, 'cell')
    x, y = cell % WIDTH, cell // WIDTH
    return [(a, (y + dy) * WIDTH + x + dx)
            for a, (dx, dy) in enumerate(DIRECTIONS)
            if 0 <= x + dx < WIDTH and 0 <= y + dy < HEIGHT]


def validate_state(state):
    if not isinstance(state, (tuple, list)) or len(state) != 3:
        raise ValueError('state must be ordered (human, zombie1, zombie2) cell IDs')
    return tuple(integer(c, 0, CELLS, 'cell') for c in state)


def encode(state):
    h, z1, z2 = validate_state(state)
    return (z1 * CELLS + z2) * CELLS + h


def decode(index):
    integer(index, 0, STATE_COUNT, 'stateIndex')
    return (index % CELLS, index // (CELLS * CELLS), index // CELLS % CELLS)


def distance(a, b):
    return abs(a % WIDTH - b % WIDTH) + abs(a // WIDTH - b // WIDTH)


def contact(state):
    h, z1, z2 = validate_state(state)
    return distance(h, z1) <= 1 or distance(h, z2) <= 1


def choose_zombie(zombie, old_human):
    integer(old_human, 0, CELLS, 'old human')
    return min(legal_moves(zombie), key=lambda move: distance(move[1], old_human))


def transition(state, action):
    state = validate_state(state)
    if contact(state):
        return state, True, 0  # Production stops before validating any moves.
    integer(action, 0, 5, 'action')
    h, z1, z2 = state
    legal = dict(legal_moves(h))
    if action not in legal:
        raise ValueError('out-of-bounds human action')
    nh = legal[action]
    nz1, nz2 = choose_zombie(z1, h)[1], choose_zombie(z2, h)[1]
    successor = (nh, nz1, nz2)
    # A one-cell exchange already starts adjacent, so is stopped above.
    crossed = (nh == z1 and nz1 == h) or (nh == z2 and nz2 == h)
    return successor, contact(successor) or crossed, 1


def position(cell):
    integer(cell, 0, CELLS, 'cell')
    return {'x': cell % WIDTH, 'y': cell // WIDTH}


def select_pilot():
    original = [(h, 42, z2) for z2 in range(CELLS) for h in range(CELLS)
                if h != 42 and h != z2]
    eligible = sorted((s for s in original if not contact(s)), key=encode)
    records = []
    for selection_index in range(24):
        eligible_index = selection_index * (len(eligible) - 1) // 23
        h, z1, z2 = eligible[eligible_index]
        records.append({'id': f'z2-{z2}-h{h}', 'stateIndex': encode((h, z1, z2)),
                        'selectionIndex': selection_index, 'eligibleIndex': eligible_index,
                        'human': position(h), 'zombie1': position(z1), 'zombie2': position(z2),
                        'legalActions': [a for a, _ in legal_moves(h)]})
    return {'schemaVersion': 1, 'kind': 'ZL014-answer-free-inputs',
            'selection': {'originalSliceCount': len(original), 'nonterminalCount': len(eligible),
                          'sampleCount': 24, 'fixedZombie1': {'x': 2, 'y': 4},
                          'sort': 'ascending numeric stateIndex, NOT lexicographic legacy id',
                          'indexRule': 'floor(i * (M - 1) / (24 - 1)), i=0..23, M=4259',
                          'originalExclusions': 'human==zombie1 OR human==zombie2; zombie1==zombie2 allowed',
                          'nonterminalFilter': 'Manhattan(human,zombie1)>1 AND Manhattan(human,zombie2)>1'},
            'records': records}


def validate_certificate(data):
    if not isinstance(data, dict) or type(data.get('schemaVersion')) is not int or data['schemaVersion'] != 1:
        raise ValueError('certificate schema mismatch')
    metadata = data.get('metadata', {})
    if metadata.get('sourceHashes') != SOURCE_HASHES:
        raise ValueError('certificate source identity mismatch')
    ranks = data.get('ranks')
    if not isinstance(ranks, list) or len(ranks) != STATE_COUNT:
        raise ValueError('certificate rank domain must contain every ordered state exactly once')
    if any(type(r) is not int or r < -1 or r >= STATE_COUNT for r in ranks):
        raise ValueError('invalid rank value')
    return data


def load_certificate(path=CERTIFICATE):
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != CERTIFICATE_SHA256:
        raise ValueError('certificate byte identity mismatch; refusing unreviewed ranks')
    for relative, expected in SOURCE_HASHES.items():
        if hashlib.sha256((BASELINE / relative).read_bytes()).hexdigest() != expected:
            raise ValueError('legacy source identity mismatch: ' + relative)
    return validate_certificate(json.loads(raw))


def check_rank(rank, terminal, successor_ranks):
    if type(rank) is not int or rank < -1 or rank >= STATE_COUNT:
        raise ValueError('invalid state rank')
    if any(type(r) is not int or r < -1 or r >= STATE_COUNT for r in successor_ranks):
        raise ValueError('invalid successor rank')
    if terminal:
        if rank != 0 or successor_ranks:
            raise ValueError('contact must have rank zero and no outgoing actions')
    elif rank == 0 or not successor_ranks:
        raise ValueError('nonterminal must have nonzero rank and legal actions')
    elif rank == -1:
        if -1 not in successor_ranks:
            raise ValueError('winning state has no winning successor')
    elif min(successor_ranks) < 0 or rank != 1 + max(successor_ranks):
        raise ValueError('losing state violates finite maximum-delay law')


def cell_from_position(value):
    if not isinstance(value, dict) or set(value) != {'x', 'y'}:
        raise ValueError('position must be exactly {x: integer, y: integer}')
    return integer(value['y'], 0, HEIGHT, 'y') * WIDTH + integer(value['x'], 0, WIDTH, 'x')


def parse_record(record):
    if not isinstance(record, dict):
        raise ValueError('each input record must be an object')
    allowed = {'stateIndex', 'id', 'human', 'zombie1', 'zombie2', 'action',
               'expected', 'selectionIndex', 'eligibleIndex', 'legalActions'}
    if set(record) - allowed:
        raise ValueError('unknown input keys: ' + ', '.join(sorted(set(record) - allowed)))
    names = ('human', 'zombie1', 'zombie2')
    if 'stateIndex' in record:
        state = decode(record['stateIndex'])
        for name, cell in zip(names, state):
            if name in record and cell_from_position(record[name]) != cell:
                raise ValueError('position and stateIndex disagree: ' + name)
    elif all(name in record for name in names):
        state = tuple(cell_from_position(record[name]) for name in names)
    else:
        raise ValueError('provide stateIndex or all three named positions')
    h, z1, z2 = state
    if 'id' in record and (z1 != 42 or record['id'] != f'z2-{z2}-h{h}'):
        raise ValueError('legacy id must match canonical original-slice spelling and positions')
    if 'legalActions' in record:
        expected = [] if contact(state) else [a for a, _ in legal_moves(h)]
        actual = record['legalActions']
        if (not isinstance(actual, list) or any(type(a) is not int for a in actual)
                or actual != expected):
            raise ValueError('legalActions disagree with frozen physics')
    action = record.get('action')
    if 'action' in record:
        if type(action) is str:
            if action not in ACTION_NAMES:
                raise ValueError('action string must be N, E, S, W, or stay (exact spelling)')
            action = ACTION_NAMES.index(action)
        integer(action, 0, 5, 'action')
    return state, action


def record_truth(record, ranks):
    state, action = parse_record(record)
    h, z1, z2 = state
    index, terminal = encode(state), contact(state)
    result = {'stateIndex': index, 'human': position(h), 'zombie1': position(z1),
              'zombie2': position(z2), 'terminal': terminal, 'rank': ranks[index],
              'avoidable': ranks[index] == -1,
              'legalActions': [] if terminal else [a for a, _ in legal_moves(h)],
              'zombieMoves': None if terminal else [
                  {'zombie': number, 'action': a, 'actionName': ACTION_NAMES[a],
                   'from': position(z), 'to': position(destination)}
                  for number, z in enumerate((z1, z2), 1)
                  for a, destination in [choose_zombie(z, h)]]}
    if 'id' in record:
        result['id'] = record['id']

    def action_truth(a):
        successor, captured, elapsed = transition(state, a)
        successor_index = encode(successor)
        rank = ranks[successor_index]
        if captured != (rank == 0):
            raise ValueError('capture/rank-zero inconsistency')
        return {'action': a, 'actionName': ACTION_NAMES[a],
                'humanDestination': position(successor[0]), 'elapsedTicks': elapsed,
                'successorIndex': successor_index,
                'successor': dict(zip(('human', 'zombie1', 'zombie2'), map(position, successor))),
                'captured': captured, 'successorRank': rank, 'successorAvoidable': rank == -1}

    if action is not None:
        result.update(action_truth(action))
    else:
        result['actions'] = [action_truth(a) for a in result['legalActions']]
    return result


def compare_subset(expected, actual, path='$'):
    """Return (leaf checks, mismatches). Lists require full ordered equality."""
    if isinstance(expected, dict):
        if not expected:
            raise ValueError('empty expected object is not a meaningful assertion')
        if not isinstance(actual, dict):
            return 1, [{'path': path, 'expected': expected, 'actual': actual}]
        checks, errors = 0, []
        for key, value in expected.items():
            if key not in actual:
                checks += 1
                errors.append({'path': path + '.' + key, 'expected': value, 'missing': True})
            else:
                count, found = compare_subset(value, actual[key], path + '.' + key)
                checks += count
                errors.extend(found)
        return checks, errors
    if isinstance(expected, list):
        if not isinstance(actual, list) or len(actual) != len(expected):
            return 1, [{'path': path, 'expected': expected, 'actual': actual}]
        checks, errors = (1, []) if not expected else (0, [])
        for i, (left, right) in enumerate(zip(expected, actual)):
            count, found = compare_subset(left, right, f'{path}[{i}]')
            checks += count
            errors.extend(found)
        return checks, errors
    if type(expected) is not type(actual) or expected != actual:
        return 1, [{'path': path, 'expected': expected, 'actual': actual}]
    return 1, []


def read_records(path, jsonl=False):
    import sys
    if path == '-':
        text = sys.stdin.read(16 * 1024 * 1024 + 1)
    else:
        source = Path(path)
        if source.stat().st_size > 16 * 1024 * 1024:
            raise ValueError('input exceeds 16 MiB checker bound')
        text = source.read_text()
    if len(text.encode('utf-8')) > 16 * 1024 * 1024:
        raise ValueError('input exceeds 16 MiB checker bound')
    data = [json.loads(line) for line in text.splitlines() if line.strip()] if jsonl else json.loads(text)
    if isinstance(data, dict):
        data = data['records'] if 'records' in data else [data]
    if not isinstance(data, list) or not data:
        raise ValueError('input must contain one or more records')
    return data


def verify_certificate(data):
    """Check existing dense ranks; do not solve or retain the transition graph."""
    import collections
    import resource
    import struct
    import sys
    import time
    started = time.perf_counter()
    ranks = validate_certificate(data)['ranks']
    moves = [legal_moves(c) for c in range(CELLS)]
    contacts = [[distance(h, z) <= 1 for z in range(CELLS)] for h in range(CELLS)]
    pursuit = [[choose_zombie(z, h)[1] for h in range(CELLS)] for z in range(CELLS)]
    magic = b'ZL010-TRANSITIONS-v1\n'
    digest = hashlib.sha256(magic)
    byte_count = len(magic)
    terminal_count = action_count = capture_count = 0
    partitions = []
    for z1 in range(CELLS):
        partition = hashlib.sha256()
        for z2 in range(CELLS):
            for h in range(CELLS):
                index = (z1 * CELLS + z2) * CELLS + h
                terminal = contacts[h][z1] or contacts[h][z2]
                legal = [] if terminal else moves[h]
                header = struct.pack('<IBB', index, terminal, len(legal))
                digest.update(header)
                partition.update(header)
                byte_count += len(header)
                terminal_count += terminal
                following = []
                if not terminal:
                    nz1, nz2 = pursuit[z1][h], pursuit[z2][h]
                    base = (nz1 * CELLS + nz2) * CELLS
                    for action, nh in legal:
                        successor = base + nh
                        captured = contacts[nh][nz1] or contacts[nh][nz2]
                        if not 0 <= successor < STATE_COUNT or captured != (ranks[successor] == 0):
                            raise ValueError(f'closure/contact inconsistency at {index}/{action}')
                        following.append(ranks[successor])
                        edge = struct.pack('<BIB', action, successor, captured)
                        digest.update(edge)
                        partition.update(edge)
                        byte_count += len(edge)
                        action_count += 1
                        capture_count += captured
                try:
                    check_rank(ranks[index], terminal, following)
                except ValueError as error:
                    raise ValueError(f'state {index}: {error}') from error
        partitions.append({'zombie1': z1, 'sha256': partition.hexdigest()})
    rank_hash = hashlib.sha256()
    for offset in range(0, len(ranks), 4096):
        chunk = ranks[offset:offset + 4096]
        rank_hash.update(struct.pack('<' + 'i' * len(chunk), *chunk))
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return {'schemaVersion': 1, 'kind': 'ZL014-independent-certificate-proof', 'ok': True,
            'states': STATE_COUNT, 'terminalStates': terminal_count,
            'nonterminalStates': STATE_COUNT - terminal_count, 'legalActions': action_count,
            'capturingActions': capture_count, 'rankHistogram':
                {str(rank): count for rank, count in sorted(collections.Counter(ranks).items())},
            'rankSha256': rank_hash.hexdigest(), 'transitionSha256': digest.hexdigest(),
            'transitionBytes': byte_count, 'partitionHashes': partitions,
            'certificateSha256': CERTIFICATE_SHA256, 'certificateCommit': data['metadata']['commit'],
            'sourceHashes': dict(SOURCE_HASHES), 'wallSeconds': time.perf_counter() - started,
            'peakRssBytes': rss if sys.platform == 'darwin' else rss * 1024,
            'scope': 'all ordered states/actions verified against reused ranks; no solver run or graph export'}


def main():
    import argparse
    import sys
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('select', 'truth', 'check', 'verify-certificate'))
    parser.add_argument('--input', '-i', default='-', help='JSON path or - for stdin')
    parser.add_argument('--out', '-o', help='write JSON here rather than stdout')
    parser.add_argument('--jsonl', action='store_true', help='read newline-delimited input records')
    parser.add_argument('--certificate', default=str(CERTIFICATE), help='byte-identical pinned legacy certificate')
    args = parser.parse_args()
    code = 0
    try:
        if args.command == 'select':
            output = select_pilot()
        elif args.command == 'verify-certificate':
            output = verify_certificate(load_certificate(args.certificate))
        else:
            data = load_certificate(args.certificate)
            records = read_records(args.input, args.jsonl)
            truths = [record_truth(record, data['ranks']) for record in records]
            if args.command == 'truth':
                output = {'schemaVersion': 1, 'kind': 'ZL014-evaluation-only-truth',
                          'certificateSha256': CERTIFICATE_SHA256, 'records': truths}
            else:
                checks, mismatches = 0, []
                for i, (record, truth) in enumerate(zip(records, truths)):
                    if not isinstance(record.get('expected'), dict) or not record['expected']:
                        raise ValueError('check requires a nonempty expected object in every record')
                    count, found = compare_subset(record['expected'], truth)
                    checks += count
                    mismatches.extend(dict(recordIndex=i, **failure) for failure in found)
                output = {'schemaVersion': 1, 'ok': not mismatches, 'recordCount': len(records),
                          'fieldChecks': checks, 'mismatchCount': len(mismatches), 'mismatches': mismatches,
                          'scope': 'only supplied expected fields; not a full producer audit'}
                code = 1 if mismatches else 0
        encoded = json.dumps(output, sort_keys=True, indent=2, allow_nan=False) + '\n'
        if args.out:
            Path(args.out).write_text(encoded)
        else:
            sys.stdout.write(encoded)
    except (ValueError, OSError, KeyError, TypeError) as error:
        sys.stderr.write(json.dumps({'error': str(error)}) + '\n')
        return 2
    return code


if __name__ == '__main__':
    raise SystemExit(main())
