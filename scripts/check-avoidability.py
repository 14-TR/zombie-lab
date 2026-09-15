#!/usr/bin/env python3
"""Independent ZL-010 finite-game certificate verifier (Python stdlib only).

Physics was encoded from the frozen protocol and legacy physics sources only,
without reading the new certificate builder, its transitions, or its results.
"""

import hashlib
import json
from pathlib import Path
import re
import struct
import time

WIDTH = 10
HEIGHT = 7
CELLS = WIDTH * HEIGHT
STATES = CELLS ** 3
MAX_CERTIFICATE_BYTES = 16 * 1024 * 1024
FROZEN_HASHES = {
    "experiments/ZL-010-protocol.md": "c809145e263e8f360b587b16a25183bcf3e55f21cdffad0a713212baa9757f33",
    "two-zombies.js": "ae62cc4ed7d4fb465a97827c0da34eb191005afc3de6c1c0185b163b00fc3243",
    "simulation.js": "4ee5817ba528b163fca1347c49ad4c48de2dcae226dd800065e5048b5b9bb568",
}


class VerificationError(ValueError):
    """A certificate or source identity violates the frozen contract."""


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_sources(root, source_hashes):
    root = Path(root).resolve()
    if not isinstance(source_hashes, dict) or "two-zombies.js" not in source_hashes:
        raise VerificationError("sourceHashes must bind at least two-zombies.js")
    for name, expected in source_hashes.items():
        if not isinstance(name, str) or not name or "\\" in name:
            raise VerificationError("invalid source path")
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts or relative.as_posix() != name:
            raise VerificationError("invalid source path: " + name)
        try:
            path = (root / relative).resolve()
            path.relative_to(root)
        except ValueError as error:
            raise VerificationError("source path outside repository: " + name) from error
        if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
            raise VerificationError("invalid SHA-256 for " + name)
        try:
            actual = sha256_file(path)
        except OSError as error:
            raise VerificationError("unreadable source: " + name) from error
        if actual != expected:
            raise VerificationError("source hash mismatch: " + name)
    # Pins prevent agreeing metadata and a modified local physics source from
    # silently certifying a different experiment.
    for name, expected in FROZEN_HASHES.items():
        try:
            actual = sha256_file(root / name)
        except OSError as error:
            raise VerificationError("missing frozen source: " + name) from error
        if actual != expected:
            raise VerificationError("frozen source hash mismatch: " + name)


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise VerificationError("duplicate JSON key: " + key)
        result[key] = value
    return result


def _invalid_constant(value):
    raise VerificationError("non-JSON numeric constant: " + value)


def load_certificate(path, root, expected_commit=None):
    """Strict JSON, implicit complete indexed domain, and actual source hashes.

    Accept metadata.{commit,sourceHashes}, or the same fields at top level;
    reject conflicting duplicate locations. Commit identity is asserted only
    when the caller supplies expected_commit; source byte identity is mandatory.
    """
    try:
        with Path(path).open("rb") as handle:
            raw = handle.read(MAX_CERTIFICATE_BYTES + 1)
        if len(raw) > MAX_CERTIFICATE_BYTES:
            raise VerificationError("certificate exceeds 16 MiB input bound")
        certificate = json.loads(raw, object_pairs_hook=_unique_object,
                                 parse_constant=_invalid_constant)
    except (OSError, UnicodeError, json.JSONDecodeError, RecursionError) as error:
        raise VerificationError("malformed/unreadable certificate: " + str(error)) from error
    if not isinstance(certificate, dict):
        raise VerificationError("certificate must be an object")
    version = certificate.get("schemaVersion")
    if type(version) is not int or version != 1:
        raise VerificationError("schemaVersion must be integer 1")
    ranks = certificate.get("ranks")
    if not isinstance(ranks, list) or len(ranks) != STATES:
        raise VerificationError("ranks must cover the complete 343000-state indexed domain")
    for index, rank in enumerate(ranks):
        if type(rank) is not int or not -1 <= rank < STATES:
            raise VerificationError("state {}: rank must be integer -1..342999".format(index))
    metadata = certificate.get("metadata", {})
    if not isinstance(metadata, dict):
        raise VerificationError("metadata must be an object")
    identity = {}
    for field in ("commit", "sourceHashes"):
        if field in metadata and field in certificate and metadata[field] != certificate[field]:
            raise VerificationError("conflicting identity field: " + field)
        identity[field] = metadata.get(field, certificate.get(field))
    commit = identity["commit"]
    if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise VerificationError("commit must be a full lowercase 40-hex identifier")
    if expected_commit is not None and commit != expected_commit:
        raise VerificationError("commit identity mismatch")
    verify_sources(root, identity["sourceHashes"])
    identity.update({"certificateSha256": hashlib.sha256(raw).hexdigest(),
                     "frozenSourceHashes": FROZEN_HASHES,
                     "commitComparedToExpected": expected_commit is not None})
    return ranks, identity


def check_rank_rule(index, terminal, rank, successor_ranks):
    """Check a local finite-game proof obligation; never solve the game."""
    prefix = "state {}: ".format(index)
    if terminal:
        if rank != 0:
            raise VerificationError(prefix + "terminal must have rank 0")
        if successor_ranks:
            raise VerificationError(prefix + "terminal cannot have successors")
        return
    if rank == 0:
        raise VerificationError(prefix + "nonterminal cannot have rank 0")
    if not successor_ranks:
        raise VerificationError(prefix + "nonterminal needs a successor")
    if rank == -1:
        if -1 not in successor_ranks:
            raise VerificationError(prefix + "winning state has no winning successor")
        return
    if any(value == -1 for value in successor_ranks):
        raise VerificationError(prefix + "losing state has winning successor")
    if any(value >= rank for value in successor_ranks):
        raise VerificationError(prefix + "losing successors must all have lower ranks")
    if rank != 1 + max(successor_ranks):
        raise VerificationError(prefix + "rank must equal exact 1 + maximum successor rank")


class Physics:
    """Ordered states, geometric pursuit, and simultaneous contacts."""

    def __init__(self):
        self.moves = []
        for human in range(CELLS):
            x, y = human % WIDTH, human // WIDTH
            legal = []
            if y:
                legal.append((0, human - WIDTH))
            if x + 1 < WIDTH:
                legal.append((1, human + 1))
            if y + 1 < HEIGHT:
                legal.append((2, human + WIDTH))
            if x:
                legal.append((3, human - 1))
            legal.append((4, human))
            self.moves.append(tuple(legal))
        self.contact = []
        self.chase = []
        for human in range(CELLS):
            hx, hy = human % WIDTH, human // WIDTH
            contact, chase = [], []
            for zombie in range(CELLS):
                zx, zy = zombie % WIDTH, zombie // WIDTH
                contact.append(abs(hx - zx) + abs(hy - zy) <= 1)
                # A shortest Manhattan move is selected geometrically, with
                # N before E before S before W; stay only at coincident target.
                if hy < zy:
                    chase.append(zombie - WIDTH)
                elif hx > zx:
                    chase.append(zombie + 1)
                elif hy > zy:
                    chase.append(zombie + WIDTH)
                elif hx < zx:
                    chase.append(zombie - 1)
                else:
                    chase.append(zombie)
            self.contact.append(tuple(contact))
            self.chase.append(tuple(chase))

    @staticmethod
    def decode(index):
        pair, human = divmod(index, CELLS)
        zombie1, zombie2 = divmod(pair, CELLS)
        return human, zombie1, zombie2

    def terminal(self, index):
        human, zombie1, zombie2 = self.decode(index)
        return self.contact[human][zombie1] or self.contact[human][zombie2]

    def transitions(self, index):
        human, zombie1, zombie2 = self.decode(index)
        if self.contact[human][zombie1] or self.contact[human][zombie2]:
            return
        next1 = self.chase[human][zombie1]
        next2 = self.chase[human][zombie2]
        base = (next1 * CELLS + next2) * CELLS
        for action, destination in self.moves[human]:
            exchanged = (destination == zombie1 and next1 == human or
                         destination == zombie2 and next2 == human)
            caught = (self.contact[destination][next1] or
                      self.contact[destination][next2] or exchanged)
            yield action, base + destination, caught


TRANSITION_MAGIC = b"ZL010-TRANSITIONS-v1\n"
TRANSITION_ENCODING = (
    "ASCII ZL010-TRANSITIONS-v1 followed by LF; then states index=0..342999. "
    "Each state header is little-endian <IBB: uint32 stateIndex, uint8 terminal "
    "(0/1), uint8 degree. Each following edge is <BIB: uint8 action "
    "(N=0,E=1,S=2,W=3,stay=4), uint32 successorIndex, uint8 captured (0/1). "
    "Terminal states have degree zero. Nonterminal edges include ALL in-bounds "
    "human actions in action order, with both zombies pursuing the OLD human. "
    "No padding, separators, or footer. Per-zombie1 hashes exclude magic and "
    "cover that zombie1's 4900 consecutive state records."
)


def scan_graph(ranks=None, transitions_path=None, max_seconds=840):
    """Recompute every state/action and optionally check all local ranks.

    O(states + legal actions) time, O(states) input ranks, O(4900 * 5)
    streaming scratch. A hash-only audit is explicitly not a certificate pass.
    """
    started = time.monotonic()
    if ranks is not None:
        if len(ranks) != STATES:
            raise VerificationError("incomplete rank domain; expected 343000 states")
        for index, rank in enumerate(ranks):
            if type(rank) is not int or not -1 <= rank < STATES:
                raise VerificationError("state {}: invalid rank".format(index))
    physics = Physics()
    digest = hashlib.sha256(TRANSITION_MAGIC)
    rank_digest = hashlib.sha256()
    chunks = []
    terminal_count = edge_count = capture_count = winning_count = 0
    histogram = {}
    total_bytes = len(TRANSITION_MAGIC)
    output = Path(transitions_path).open("wb") if transitions_path is not None else None
    try:
        if output:
            output.write(TRANSITION_MAGIC)
        for zombie1 in range(CELLS):
            if time.monotonic() - started > max_seconds:
                raise VerificationError("graph verification wall-time budget exceeded")
            block = bytearray()
            for zombie2 in range(CELLS):
                base = (zombie1 * CELLS + zombie2) * CELLS
                for human in range(CELLS):
                    index = base + human
                    terminal = physics.terminal(index)
                    edges = tuple(physics.transitions(index))
                    terminal_count += terminal
                    if len(edges) != (0 if terminal else len(physics.moves[human])):
                        raise VerificationError("incomplete action domain at state {}".format(index))
                    block.extend(struct.pack("<IBB", index, terminal, len(edges)))
                    successor_ranks = []
                    for action, target, caught in edges:
                        if not 0 <= target < STATES:
                            raise VerificationError("successor outside complete domain")
                        # Crossing can only begin at already terminal contact;
                        # verify that no transition needs a hidden captured flag.
                        if bool(caught) != physics.terminal(target):
                            raise VerificationError("capture is not encoded by endpoint contact")
                        block.extend(struct.pack("<BIB", action, target, caught))
                        edge_count += 1
                        capture_count += caught
                        if ranks is not None:
                            successor_ranks.append(ranks[target])
                    if ranks is not None:
                        rank = ranks[index]
                        check_rank_rule(index, terminal, rank, successor_ranks)
                        winning_count += rank == -1
                        histogram[rank] = histogram.get(rank, 0) + 1
                        rank_digest.update(struct.pack("<i", rank))
            chunks.append({"zombie1": zombie1, "sha256": hashlib.sha256(block).hexdigest()})
            digest.update(block)
            total_bytes += len(block)
            if output:
                output.write(block)
    finally:
        if output:
            output.close()
    receipt = {
        "certificateVerified": ranks is not None,
        "domain": {"width": WIDTH, "height": HEIGHT, "orderedAgents": ["human", "zombie1", "zombie2"],
                   "cell": "y*10+x", "stateIndex": "((zombie1*70+zombie2)*70+human)",
                   "includesContacts": True, "includesColocatedZombies": True},
        "states": STATES, "terminalStates": terminal_count,
        "nonterminalStates": STATES - terminal_count,
        "transitions": edge_count, "capturingTransitions": capture_count,
        "noncapturingTransitions": edge_count - capture_count,
        "transitionEncoding": TRANSITION_ENCODING,
        "transitionBytes": total_bytes, "transitionSha256": digest.hexdigest(),
        "transitionHashesByZombie1": chunks,
        "scanWallSeconds": time.monotonic() - started,
    }
    if ranks is not None:
        receipt.update({"winningStates": winning_count, "losingStates": STATES - winning_count,
                        "maximumFiniteRank": max(histogram),
                        "rankHistogram": {str(key): histogram[key] for key in sorted(histogram)},
                        "rankSha256": rank_digest.hexdigest(),
                        "rankEncoding": "343000 signed int32 little-endian ranks in ascending stateIndex, no header"})
    return receipt


PROOF = (
    "All 343000 ordered positions occur exactly once by dense index, and all "
    "legal nonterminal human actions have independently recomputed successors "
    "inside this domain. Rank 0 iff physical terminal contact. Every positive "
    "rank has only finite lower-ranked successors, so induction forces capture "
    "under every action sequence, including every history-dependent policy. "
    "The equality rank=1+max(successor ranks) both bounds and achieves the "
    "maximum capture delay by choosing a maximum-ranked successor. Every -1 "
    "state has a noncapturing -1 successor; selecting the first such action "
    "gives a stationary strategy that stays in this safe closed set forever. "
    "Finiteness implies recurrence, not a cutoff-based survival claim. These "
    "two disjoint certificates exhaust the complete domain and therefore "
    "establish the exact avoidability partition for the frozen positional "
    "dynamics; tick limits and other worlds are outside the theorem."
)


def main(argv=None):
    import argparse
    import resource
    import sys

    parser = argparse.ArgumentParser(description=__doc__, epilog=TRANSITION_ENCODING)
    parser.add_argument("certificate", nargs="?", type=Path,
                        help="avoidability-certificate.json to verify")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--out-dir", type=Path, default=Path("/tmp/zl010-oracle"))
    parser.add_argument("--fingerprints-only", action="store_true",
                        help="export independently computed physics; do not claim a certificate pass")
    parser.add_argument("--export-transitions", action="store_true",
                        help="also write the full canonical stream as transitions.bin")
    parser.add_argument("--expected-commit", help="require this exact certificate commit identifier")
    parser.add_argument("--expect-transition-sha256", help="require parity with a production graph digest")
    args = parser.parse_args(argv)
    if bool(args.certificate) == args.fingerprints_only:
        parser.error("supply a certificate OR --fingerprints-only")
    if args.expected_commit is not None and not re.fullmatch(r"[0-9a-f]{40}", args.expected_commit):
        parser.error("--expected-commit must be a full lowercase 40-hex identifier")
    if args.expect_transition_sha256 is not None and not re.fullmatch(r"[0-9a-f]{64}", args.expect_transition_sha256):
        parser.error("--expect-transition-sha256 must be lowercase SHA-256 hex")
    receipt_path = args.out_dir / ("fingerprints.json" if args.fingerprints_only else "verification.json")
    stream_path = args.out_dir / "transitions.bin" if args.export_transitions else None
    if args.certificate is not None and any(args.certificate.resolve() == path.resolve()
                                           for path in (receipt_path, stream_path) if path is not None):
        parser.error("output would overwrite the input certificate")
    started = time.monotonic()
    receipt = {"schemaVersion": 1, "status": "rejected", "certificateVerified": False,
               "mode": "physics-fingerprints" if args.fingerprints_only else "certificate",
               "checkerSha256": sha256_file(__file__),
               "frozenSourceHashes": FROZEN_HASHES}
    try:
        args.out_dir.mkdir(parents=True, exist_ok=True)
        if args.certificate is not None:
            ranks, identity = load_certificate(args.certificate, args.root, args.expected_commit)
            receipt["identity"] = identity
        else:
            ranks = None
            verify_sources(args.root, {"two-zombies.js": FROZEN_HASHES["two-zombies.js"]})
        receipt.update(scan_graph(ranks, stream_path))
        if args.expect_transition_sha256 is not None:
            if receipt["transitionSha256"] != args.expect_transition_sha256:
                raise VerificationError("production transition fingerprint mismatch")
            receipt["productionTransitionParityVerified"] = True
        else:
            receipt["productionTransitionParityVerified"] = False
        receipt["status"] = "passed"
        if ranks is not None:
            receipt["mathematicalSufficiency"] = PROOF
    except (VerificationError, OSError) as error:
        receipt.update({"status": "rejected", "certificateVerified": False, "error": str(error)})
    receipt["wallSeconds"] = time.monotonic() - started
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    receipt["peakRssBytes"] = rss if sys.platform == "darwin" else rss * 1024
    if receipt["peakRssBytes"] > 512 * 1024 * 1024:
        receipt.update({"status": "rejected", "certificateVerified": False, "error": "512 MiB RSS budget exceeded"})
    rendered = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    try:
        receipt_path.write_text(rendered, encoding="utf-8")
    except OSError as error:
        print("cannot save receipt: " + str(error), file=sys.stderr)
        return 1
    print(rendered, end="")
    return 0 if receipt["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
