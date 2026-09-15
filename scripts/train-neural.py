#!/usr/bin/env python3
"""ZL-011 fixed CPU-only NumPy float64 imitation trainer (no test labels)."""
import os

# These must be set before importing NumPy/Accelerate, including direct CLI use.
THREAD_ENV = ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS",
              "VECLIB_MAXIMUM_THREADS", "NUMEXPR_NUM_THREADS", "BLIS_NUM_THREADS")
for _name in THREAD_ENV:
    os.environ[_name] = "1"

import numpy as np

PARAMETERS = ("W1", "b1", "W2", "b2")
SHAPES = {"W1": (6, 32), "b1": (32,), "W2": (32, 5), "b2": (5,)}


def initialize(rng):
    return {"W1": rng.uniform(-np.sqrt(6/38), np.sqrt(6/38), (6, 32)),
            "b1": np.zeros(32, dtype=np.float64),
            "W2": rng.uniform(-np.sqrt(6/37), np.sqrt(6/37), (32, 5)),
            "b2": np.zeros(5, dtype=np.float64)}


def forward(parameters, inputs):
    hidden = np.tanh(inputs @ parameters["W1"] + parameters["b1"])
    return hidden @ parameters["W2"] + parameters["b2"]


def loss_and_gradients(parameters, inputs, legal, targets):
    """Batch-mean soft-target CE; illegal actions have exactly zero derivative."""
    count = len(inputs)
    if (count < 1 or inputs.shape != (count, 6) or legal.shape != (count, 5)
            or targets.shape != (count, 5) or inputs.dtype != np.float64
            or targets.dtype != np.float64 or legal.dtype != np.bool_
            or not np.isfinite(inputs).all() or not np.isfinite(targets).all()
            or not legal.any(axis=1).all() or (targets < 0).any()
            or np.any(targets[~legal] != 0)
            or not np.allclose(targets.sum(axis=1), 1., rtol=0, atol=1e-14)):
        raise ValueError("Invalid float64 inputs, legal mask or soft targets")
    hidden = np.tanh(inputs @ parameters["W1"] + parameters["b1"])
    logits = hidden @ parameters["W2"] + parameters["b2"]
    if not np.isfinite(logits).all():
        raise FloatingPointError("Nonfinite logits")
    maximum = np.max(np.where(legal, logits, -np.inf), axis=1, keepdims=True)
    shifted = np.where(legal, logits - maximum, -np.inf)
    exponentials = np.exp(shifted)
    normalizer = exponentials.sum(axis=1, keepdims=True)
    log_probability = np.where(legal, shifted - np.log(normalizer), 0.)
    loss = -float(np.sum(targets * log_probability) / count)
    delta = (exponentials / normalizer - targets) / count
    hidden_delta = (delta @ parameters["W2"].T) * (1. - hidden * hidden)
    gradients = {"W1": inputs.T @ hidden_delta, "b1": hidden_delta.sum(axis=0),
                 "W2": hidden.T @ delta, "b2": delta.sum(axis=0)}
    if not np.isfinite(loss) or not all(np.isfinite(v).all() for v in gradients.values()):
        raise FloatingPointError("Nonfinite loss/gradient")
    return loss, gradients


class Adam:
    def __init__(self, parameters):
        self.first = {key: np.zeros_like(value) for key, value in parameters.items()}
        self.second = {key: np.zeros_like(value) for key, value in parameters.items()}
        self.steps = 0

    def update(self, parameters, gradients):
        if not all(np.isfinite(g).all() for g in gradients.values()):
            raise FloatingPointError("Nonfinite Adam gradient")
        self.steps += 1
        for name, value in parameters.items():
            g = gradients[name]
            m, v = self.first[name], self.second[name]
            m *= .9
            m += (1. - .9) * g
            v *= .999
            v += (1. - .999) * g * g
            corrected_m = m / (1. - .9 ** self.steps)
            corrected_v = v / (1. - .999 ** self.steps)
            value -= .003 * corrected_m / (np.sqrt(corrected_v) + 1e-8)
            if not np.isfinite(value).all():
                raise FloatingPointError("Nonfinite Adam parameter")


import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import platform
import resource
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
EPOCHS = 40
BATCH_SIZE = 512
WATCHDOG_SECONDS = 600
MEMORY_TARGET_BYTES = 512 * 1024 * 1024


def sha256_file(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def write_json_new(path, value):
    with Path(path).open("x", encoding="utf8") as handle:
        json.dump(value, handle, indent=2, allow_nan=False)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())


def install_test_guard():
    """A permanent per-process audit barrier, including Path.open and os.open."""
    opened = set()
    def audit(event, args):
        if event != "open" or not isinstance(args[0], (str, bytes, os.PathLike)):
            return
        candidate = Path(os.fsdecode(args[0]))
        resolved = candidate.resolve()
        if candidate.name == "test.json" or resolved.name == "test.json":
            raise PermissionError("ZL-011 trainer cannot open test.json")
        if candidate.name in ("manifest.json", "train.json", "validation.json"):
            opened.add(candidate.name)
    sys.addaudithook(audit)
    return opened


@lru_cache(maxsize=4900)
def split_for_cells(z1, z2):
    if any(type(v) is not int or not 0 <= v < 70 for v in (z1, z2)):
        raise ValueError("Invalid zombie cell")
    text = f"ZL011:{min(z1,z2)}:{max(z1,z2)}".encode("utf8")
    bucket = int(hashlib.sha256(text).hexdigest()[:8], 16) % 10
    return "train" if bucket < 8 else "validation" if bucket == 8 else "test"


def state_features(index):
    if type(index) is not int or not 0 <= index < 343000:
        raise ValueError("Invalid state index")
    pair, h = divmod(index, 70)
    z1, z2 = divmod(pair, 70)
    points = [(v % 10, v // 10) for v in (h, z1, z2)]
    hx, hy = points[0]
    inputs = [coordinate / scale for x, y in points for coordinate, scale in ((x, 9), (y, 6))]
    legal = [hy > 0, hx < 9, hy < 6, hx > 0, True]
    terminal = any(abs(hx-x) + abs(hy-y) <= 1 for x, y in points[1:])
    return inputs, legal, terminal, split_for_cells(z1, z2)


def strict_json(text):
    def reject_constant(value):
        raise ValueError("Non-JSON number: " + value)
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate JSON key: " + key)
            result[key] = value
        return result
    return json.loads(text, parse_constant=reject_constant, object_pairs_hook=unique)


def load_split(data_dir, manifest, split):
    """Read only a named training/validation file, with bounded streaming RAM."""
    if split not in ("train", "validation"):
        raise PermissionError("Only train and validation labels are accessible")
    count = manifest["splits"][split]["examples"]
    if type(count) is not int or not 0 < count <= 343000:
        raise ValueError("Invalid example count")
    path = Path(data_dir) / (split + ".json")
    expected_file = manifest["files"][path.name]
    if path.stat().st_size != expected_file["bytes"] or sha256_file(path) != expected_file["sha256"]:
        raise ValueError("Dataset file hash/size mismatch: " + split)
    arrays = {"stateIndex": np.empty(count, dtype=np.uint32), "inputs": np.empty((count, 6), dtype=np.float64),
              "legal": np.empty((count, 5), dtype=np.bool_), "targets": np.empty((count, 5), dtype=np.float64)}
    membership = hashlib.sha256()
    previous = -1
    with path.open("r", encoding="utf8") as handle:
        if handle.readline() != '{"schemaVersion":1,"split":"'+split+'","examples":[\n':
            raise ValueError("Expected builder's streaming examples object")
        for row_number in range(count):
            line = handle.readline()
            suffix = ",\n" if row_number < count - 1 else "\n"
            if not line.endswith(suffix):
                raise ValueError("Malformed/truncated examples array")
            row = strict_json(line[:-len(suffix)])
            if not isinstance(row, dict) or set(row) != {"stateIndex", "inputs", "legal", "targets"}:
                raise ValueError("Invalid example schema")
            index = row["stateIndex"]
            inputs, legal, terminal, actual_split = state_features(index)
            if index <= previous or terminal or actual_split != split:
                raise ValueError("Duplicate, terminal or cross-split example")
            if (row["inputs"] != inputs or row["legal"] != legal
                    or any(type(v) is not bool for v in row["legal"])
                    or any(type(v) not in (int, float) for v in row["inputs"])
                    or not isinstance(row["targets"], list) or len(row["targets"]) != 5
                    or any(type(v) not in (int, float) for v in row["targets"])):
                raise ValueError("Invalid positional inputs, mask or targets")
            previous = index
            membership.update(f"{index}\n".encode())
            for name in arrays:
                arrays[name][row_number] = row[name]
        if handle.read() != "]}\n":
            raise ValueError("Trailing/missing dataset content")
    targets, legal = arrays["targets"], arrays["legal"]
    if (not np.isfinite(targets).all() or (targets < 0).any() or np.any(targets[~legal] != 0)
            or not np.allclose(targets.sum(axis=1), 1., rtol=0, atol=1e-14)):
        raise ValueError("Invalid soft-target probabilities")
    if membership.hexdigest() != manifest["splits"][split]["membershipSha256"]:
        raise ValueError("Membership digest mismatch")
    for array in arrays.values():
        array.setflags(write=False)
    return arrays


def peak_rss_bytes():
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(peak if sys.platform == "darwin" else peak * 1024)


def check_memory():
    if peak_rss_bytes() >= MEMORY_TARGET_BYTES:
        raise MemoryError("512 MiB training memory target exceeded; no shortened success")


def mean_loss(parameters, dataset):
    total, count = 0., len(dataset["inputs"])
    for start in range(0, count, 4096):
        legal = dataset["legal"][start:start+4096]
        targets = dataset["targets"][start:start+4096]
        logits = forward(parameters, dataset["inputs"][start:start+4096])
        if not np.isfinite(logits).all():
            raise FloatingPointError("Nonfinite loss logits")
        maximum = np.max(np.where(legal, logits, -np.inf), axis=1, keepdims=True)
        shifted = np.where(legal, logits - maximum, -np.inf)
        logp = np.where(legal, shifted - np.log(np.exp(shifted).sum(axis=1, keepdims=True)), 0.)
        total -= float(np.sum(targets * logp))
    loss = total / count
    if not np.isfinite(loss):
        raise FloatingPointError("Nonfinite epoch loss")
    return loss


def train_arrays(parameters, rng, train, validation, on_epoch):
    optimizer = Adam(parameters)
    count = len(train["inputs"])
    epochs = []
    for epoch in range(1, EPOCHS + 1):
        started = time.monotonic()
        permutation = rng.permutation(count)
        for start in range(0, count, BATCH_SIZE):
            check_memory()
            indices = permutation[start:start+BATCH_SIZE]
            _, gradients = loss_and_gradients(parameters, train["inputs"][indices],
                                               train["legal"][indices], train["targets"][indices])
            optimizer.update(parameters, gradients)
        # Validation is read for reporting only, after every update in the epoch.
        row = {"epoch": epoch, "steps": optimizer.steps,
               "trainLoss": mean_loss(parameters, train), "validationLoss": mean_loss(parameters, validation),
               "permutationSha256": hashlib.sha256(permutation.astype("<u4").tobytes()).hexdigest(),
               "elapsedSeconds": time.monotonic() - started}
        epochs.append(row)
        on_epoch(row)
    return epochs, optimizer.steps


def weights_sha256(parameters):
    h = hashlib.sha256()
    for name in PARAMETERS:
        h.update(np.asarray(parameters[name], dtype="<f8").tobytes(order="C"))
    return h.hexdigest()


def model_object(parameters, epoch, provenance):
    return {"schemaVersion": 1, "architecture": [6, 32, 5], "seed": 17, "epoch": epoch,
            **{name: parameters[name].tolist() for name in PARAMETERS},
            "provenance": {**provenance, "weightsSha256": weights_sha256(parameters),
                           "weightsEncoding": "W1,b1,W2,b2; float64 little-endian C row-major"}}


def model_wrapper(model):
    safe = json.dumps(model, separators=(",", ":"), allow_nan=False)
    for character in "<>&\u2028\u2029":
        safe = safe.replace(character, "\\u" + format(ord(character), "04x"))
    return ('window.ZL_NEURAL_MODEL = (function freeze(value) { '
            'if (value) { if (typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } } '
            'return value; })(' + safe + ');\n')


def source_identity():
    names = ("scripts/train-neural.py", "scripts/test-neural-training.py", "scripts/build-neural-dataset.cjs",
             "experiments/ZL-011-protocol.md", "two-zombies.js")
    return {"protocolCommit": "875c75ec5bc8c0b39179202ff570b6a5d4e10fbd",
            "sourceHashes": {name: sha256_file(ROOT / name) for name in names},
            "sourceCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
            "worktreeStatus": subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip()}


def run_training(data_dir, out_dir):
    started = time.monotonic()
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    if any((out/name).exists() for name in ("run-started.json", "feed-forward.json", "feed-forward-initial.json",
                                          "feed-forward.js", "training.json", "model-freeze.json", "pretraining-freeze.json")):
        raise FileExistsError("Training output already exists; a fixed run is not restarted or overwritten")
    opened = install_test_guard()
    write_json_new(out / "run-started.json", {"startedAt": utc_now(), "seed": 17, "epochs": EPOCHS,
                                              "watchdogSeconds": WATCHDOG_SECONDS, "dataDir": str(Path(data_dir).resolve())})
    manifest_path = Path(data_dir) / "manifest.json"
    manifest = strict_json(manifest_path.read_text())
    if manifest["schemaVersion"] != 1 or manifest["stateCount"] != 343000:
        raise ValueError("Invalid frozen dataset manifest")
    train = load_split(data_dir, manifest, "train")
    validation = load_split(data_dir, manifest, "validation")
    identity = source_identity()
    dataset_identity = {"manifestSha256": sha256_file(manifest_path), "files": manifest["files"],
                        "splits": manifest["splits"]}
    pretraining = {"frozenAt": utc_now(), "identity": identity, "dataset": manifest,
                   "manifestSha256": dataset_identity["manifestSha256"], "testFilesOpened": []}
    write_json_new(out / "pretraining-freeze.json", pretraining)
    provenance = {**identity, "dataset": dataset_identity, "dtype": "float64", "numpyVersion": np.__version__}
    rng = np.random.default_rng(17)
    parameters = initialize(rng)
    initial = model_object(parameters, 0, provenance)
    write_json_new(out / "feed-forward-initial.json", initial)
    initial_weights_hash = weights_sha256(parameters)
    optimization_started = time.monotonic()
    with (out / "epochs.jsonl").open("x", encoding="utf8") as progress:
        def on_epoch(row):
            progress.write(json.dumps(row, allow_nan=False) + "\n")
            progress.flush()
        epochs, steps = train_arrays(parameters, rng, train, validation, on_epoch)
    optimization_seconds = time.monotonic() - optimization_started
    if len(epochs) != EPOCHS or steps != EPOCHS * ((len(train["inputs"])+BATCH_SIZE-1)//BATCH_SIZE):
        raise RuntimeError("Incomplete fixed training run")
    final = model_object(parameters, EPOCHS, provenance)
    write_json_new(out / "feed-forward.json", final)
    with (out / "feed-forward.js").open("x", encoding="utf8") as handle:
        handle.write(model_wrapper(final))
    filenames = ("feed-forward.json", "feed-forward.js", "feed-forward-initial.json")
    frozen = {"schemaVersion": 1, "frozenAt": utc_now(), "epoch": EPOCHS,
              "files": {name: sha256_file(out/name) for name in filenames},
              "weightsSha256": weights_sha256(parameters), "initialWeightsSha256": initial_weights_hash,
              "testResultsOpened": False, "testFilesOpened": [],
              "pretrainingFreezeSha256": sha256_file(out / "pretraining-freeze.json")}
    write_json_new(out / "model-freeze.json", frozen)
    for name in filenames:
        (out / name).chmod(0o444)
    usage = resource.getrusage(resource.RUSAGE_SELF)
    metrics = {"schemaVersion": 1, "status": "completed", "seed": 17, "architecture": [6, 32, 5],
               "parameters": sum(v.size for v in parameters.values()), "dtype": "float64", "epochsCompleted": EPOCHS,
               "batchSize": BATCH_SIZE, "lastBatchSize": (len(train["inputs"])-1)%BATCH_SIZE+1, "steps": steps,
               "optimizer": {"name": "Adam", "learningRate": .003, "beta1": .9, "beta2": .999, "epsilon": 1e-8,
                             "weightDecay": 0, "gradientClipping": False, "biasCorrection": True},
               "loss": "batch-mean legal-masked soft-target cross-entropy", "checkpoint": "final epoch40 only",
               "lossReporting": "post-epoch full train/validation means; no test performance computed",
               "permutationEncoding": "uint32 little-endian row indices; fresh same-RNG permutation each epoch after Xavier draws",
               "epochs": epochs, "identity": identity, "dataset": dataset_identity,
               "pythonVersion": sys.version, "numpyVersion": np.__version__, "platform": platform.platform(),
               "numpyConfiguration": np.show_config(mode="dicts"),
               "threadEnvironment": {name: os.environ[name] for name in THREAD_ENV},
               "watchdogSeconds": WATCHDOG_SECONDS, "memoryTargetBytes": MEMORY_TARGET_BYTES,
               "optimizationAndLossWallSeconds": optimization_seconds, "wallSeconds": time.monotonic()-started,
               "peakRSSBytes": peak_rss_bytes(), "userCPUSeconds": usage.ru_utime, "systemCPUSeconds": usage.ru_stime,
               "datasetFilesRead": sorted(opened), "testFilesOpened": [], "models": frozen,
               "artifactBytes": {name: (out/name).stat().st_size for name in filenames}}
    check_memory()
    write_json_new(out / "training.json", metrics)
    return metrics


@contextmanager
def training_watchdog(seconds=WATCHDOG_SECONDS):
    if not isinstance(seconds, (int, float)) or not 0 < seconds <= WATCHDOG_SECONDS:
        raise ValueError("Watchdog must be positive and at most 600 seconds")
    def timed_out(signum, frame):
        raise TimeoutError("Training wall-clock watchdog exceeded; no shortened successful run")
    started = time.monotonic()
    previous_handler = signal.signal(signal.SIGALRM, timed_out)
    previous_timer = signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
        # macOS can defer SIGALRM past a short operation's return; cancellation
        # alone would then turn an expired budget into a false success.
        if time.monotonic() - started >= seconds:
            raise TimeoutError("Training wall-clock watchdog exceeded; no shortened successful run")
    finally:
        signal.setitimer(signal.ITIMER_REAL, *previous_timer)
        signal.signal(signal.SIGALRM, previous_handler)


def export_parity(model_dir, out_dir, indices=range(343000)):
    """Position-only logits/predictions; never reads data, ranks, or outcomes."""
    started = time.monotonic()
    model_dir, out = Path(model_dir), Path(out_dir)
    frozen = strict_json((model_dir / "model-freeze.json").read_text())
    filenames = ("feed-forward.json", "feed-forward.js", "feed-forward-initial.json")
    if frozen["epoch"] != 40 or any(sha256_file(model_dir/name) != frozen["files"][name] for name in filenames):
        raise ValueError("Model differs from the pre-evaluation freeze")
    parameters = {}
    for label, filename, epoch, hashkey in (("neural", "feed-forward.json", 40, "weightsSha256"),
                                          ("untrained", "feed-forward-initial.json", 0, "initialWeightsSha256")):
        model = strict_json((model_dir/filename).read_text())
        if model["schemaVersion"] != 1 or model["architecture"] != [6,32,5] or model["seed"] != 17 or model["epoch"] != epoch:
            raise ValueError("Invalid frozen model schema")
        p = {name: np.asarray(model[name],dtype=np.float64) for name in PARAMETERS}
        if any(p[name].shape != SHAPES[name] or not np.isfinite(p[name]).all() for name in PARAMETERS):
            raise ValueError("Invalid parameter shapes or nonfinite weights")
        if weights_sha256(p) != frozen[hashkey]:
            raise ValueError("Frozen weights digest mismatch")
        parameters[label] = p
    out.mkdir(parents=True, exist_ok=True)
    dtype = np.dtype([("stateIndex", "<u4"), ("neuralLogits", "<f8", (5,)), ("neuralAction", "u1"),
                      ("initialLogits", "<f8", (5,)), ("initialAction", "u1")], align=False)
    digest, row_count, terminals, previous = hashlib.sha256(), 0, 0, -1
    ties = {name: {"threshold":1e-10, "countWithin1e10":0, "exactTies":0, "minimumMargin":None,
                   "firstWithin1e10":[]} for name in parameters}
    batch_ids, batch_inputs, batch_legal = [], [], []
    with (out/"python-parity.bin").open("xb") as handle:
        def flush():
            nonlocal row_count
            if not batch_ids:
                return
            x, legal = np.asarray(batch_inputs,dtype=np.float64), np.asarray(batch_legal,dtype=np.bool_)
            rows = np.empty(len(x),dtype=dtype)
            rows["stateIndex"] = batch_ids
            for label, logit_field, action_field in (("neural", "neuralLogits", "neuralAction"),
                                                    ("untrained", "initialLogits", "initialAction")):
                logits = forward(parameters[label],x)
                if not np.isfinite(logits).all():
                    raise FloatingPointError("Nonfinite parity logits")
                rows[logit_field] = logits
                masked = np.where(legal,logits,-np.inf)
                rows[action_field] = np.argmax(masked,axis=1)
                ordered = np.sort(masked,axis=1)
                margins = ordered[:,-1] - ordered[:,-2]
                stats = ties[label]
                minimum = float(margins.min())
                stats["minimumMargin"] = minimum if stats["minimumMargin"] is None else min(minimum,stats["minimumMargin"])
                stats["countWithin1e10"] += int(np.count_nonzero(margins <= 1e-10))
                stats["exactTies"] += int(np.count_nonzero(margins == 0.))
                for at in np.flatnonzero(margins <= 1e-10):
                    if len(stats["firstWithin1e10"]) < 10:
                        stats["firstWithin1e10"].append({"stateIndex":batch_ids[at],"margin":float(margins[at]),"action":int(rows[action_field][at])})
            raw = rows.tobytes()
            handle.write(raw)
            digest.update(raw)
            row_count += len(rows)
            batch_ids.clear(); batch_inputs.clear(); batch_legal.clear()
        for index in indices:
            if index <= previous:
                raise ValueError("Parity indices must be strictly ascending and unique")
            previous = index
            features, legal, terminal, _ = state_features(index)
            if terminal:
                terminals += 1
                continue
            batch_ids.append(index); batch_inputs.append(features); batch_legal.append(legal)
            if len(batch_ids) == 1024:
                flush()
                check_memory()
        flush()
        handle.flush()
        os.fsync(handle.fileno())
    metadata = {"schemaVersion":1, "createdAt":utc_now(), "scope":"all nonterminal ordered states" if indices == range(343000) else "explicit positional fixture subset",
                "rows":row_count,"excludedInitialContact":terminals,"recordBytes":dtype.itemsize,
                "encoding":"little-endian <I5dB5dB; stateIndex, final logits[5], final action, initial logits[5], initial action",
                "actions":["N","E","S","W","stay"],"order":"strictly ascending stateIndex","sha256":digest.hexdigest(),
                "bytes":(out/"python-parity.bin").stat().st_size,"nearTies":ties,"modelFreezeSha256":sha256_file(model_dir/"model-freeze.json"),
                "models":frozen,"labelsRead":False,"performanceEvaluated":False,"sourceSha256":sha256_file(__file__),
                "wallSeconds":time.monotonic()-started,"peakRSSBytes":peak_rss_bytes()}
    write_json_new(out/"python-parity.json",metadata)
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--data-dir")
    mode.add_argument("--export-parity", metavar="FROZEN_MODEL_DIR", help="export label-free logits only after model freeze")
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()
    try:
        with training_watchdog():
            if args.export_parity:
                install_test_guard()
                print(json.dumps(export_parity(args.export_parity,args.out_dir)))
            else:
                metrics = run_training(args.data_dir, args.out_dir)
                print(json.dumps({key: metrics[key] for key in ("status", "epochsCompleted", "steps", "wallSeconds", "peakRSSBytes", "models")}))
    except Exception as error:
        out = Path(args.out_dir)
        if out.is_dir() and not (out/"training.json").exists() and not (out/"failure.json").exists():
            write_json_new(out/"failure.json", {"status": "failed", "error": str(error), "type": type(error).__name__, "at": utc_now()})
        print(f"ZL-011 training/export failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
