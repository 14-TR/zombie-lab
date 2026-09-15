#!/usr/bin/env python3
"""ZL-011 trainer tests; synthetic fixtures never use evaluation performance."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import struct
import sys
import time
import tempfile
from typing import Any
import unittest

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts/build-neural-dataset.cjs"


class DatasetTests(unittest.TestCase):
    def test_group_split_and_uniform_exact_rank_targets(self):
        self.assertTrue(BUILDER.exists(), "dataset builder API is missing")
        result = subprocess.run(["node", "-e", r'''
const b = require(process.argv[1]);
const splits = [];
for(let a=0;a<70;a++) for(let c=0;c<70;c++) splits.push(b.splitForCells(a,c));
console.log(JSON.stringify({splits,
 winning:b.targetsForRanks(-1, [null,-1,0,-1,4]),
 losing:b.targetsForRanks(5, [4,null,1,4,3]),
 duplicate:b.targetsForRanks(1, [0,0,0,0,0]),
 boundary:b.inputsAndLegal(69,0,42)}));
''', str(BUILDER)], capture_output=True, text=True, check=True)
        actual = json.loads(result.stdout)
        expected = []
        for a in range(70):
            for b in range(70):
                bucket = int(hashlib.sha256(f"ZL011:{min(a,b)}:{max(a,b)}".encode()).hexdigest()[:8], 16) % 10
                expected.append("train" if bucket < 8 else "validation" if bucket == 8 else "test")
        self.assertEqual(actual["splits"], expected)
        self.assertEqual(actual["winning"], [0, .5, 0, .5, 0])
        self.assertEqual(actual["losing"], [.5, 0, 0, .5, 0])
        self.assertEqual(actual["duplicate"], [.2] * 5)
        self.assertEqual(actual["boundary"], {"inputs": [1, 1, 0, 0, 2/9, 4/6],
                                                "legal": [True, False, False, True, True]})
        invalid = subprocess.run(["node", "-e", r'''
const assert=require('node:assert/strict'),b=require(process.argv[1]);
for(const args of [[-1,[0,0,0,0,0]], [3,[3,1,1,1,1]], [0,[null,null,null,null,null]],
 [2,[-1,1,1,1,1]], [2,[null,null,null,null,null]], [2,[1,1,1,1,NaN]]])
 assert.throws(()=>b.targetsForRanks(...args));
for(const args of [[-1,0],[70,0],[0,1.5]]) assert.throws(()=>b.splitForCells(...args));
''', str(BUILDER)], capture_output=True, text=True)
        self.assertEqual(invalid.returncode, 0, invalid.stderr)

    def test_dataset_files_freeze_counts_digests_and_exclude_contacts(self):
        with tempfile.TemporaryDirectory() as directory:
            run = subprocess.run(["node", "-e", r'''
const assert=require('node:assert/strict'),b=require(process.argv[1]);
assert.equal(typeof b.writeDataset,'function','streaming dataset writer is missing');
const terminals=new Uint8Array(343000).fill(1),ranks=new Int32Array(343000),
 successors=new Int32Array(343000*5).fill(-1);
for(const s of [69, 7315]) {
 terminals[s]=0;ranks[s]=1;
 const h=s%70,z1=Math.floor(s/4900),z2=Math.floor(s/70)%70;
 b.inputsAndLegal(h,z1,z2).legal.forEach((v,a)=>{if(v)successors[s*5+a]=0;});
}
b.writeDataset({terminals,ranks,successors},process.argv[2],{fixture:true});
assert.throws(()=>b.writeDataset({terminals,ranks,successors},process.argv[2],{}),/exist/i);
''', str(BUILDER), directory], capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            folder = Path(directory)
            manifest = json.loads((folder / "manifest.json").read_text())
            self.assertEqual(manifest["schemaVersion"], 1)
            collected = []
            for split in ("train", "validation", "test"):
                raw = (folder / (split + ".json")).read_bytes()
                rows = json.loads(raw)["examples"]
                collected.extend(rows)
                stats = manifest["splits"][split]
                self.assertEqual(stats["examples"], len(rows))
                digest = hashlib.sha256("".join(f'{r["stateIndex"]}\n' for r in rows).encode()).hexdigest()
                self.assertEqual(stats["membershipSha256"], digest)
                self.assertEqual(manifest["files"][split + ".json"],
                                 {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
                for row in rows:
                    self.assertEqual(set(row), {"stateIndex", "inputs", "legal", "targets"})
                    self.assertAlmostEqual(sum(row["targets"]), 1)
                    self.assertTrue(all(v == 0 for v, legal in zip(row["targets"], row["legal"]) if not legal))
            self.assertEqual(sorted(r["stateIndex"] for r in collected), [69, 7315])
            self.assertEqual(sum(s["groups"] for s in manifest["splits"].values()), 2485)
            self.assertEqual(sum(s["orderedStates"] for s in manifest["splits"].values()), 343000)
            self.assertEqual(sum(s["terminalStates"] for s in manifest["splits"].values()), 342998)


TRAINER = ROOT / "scripts/train-neural.py"


def load_trainer(case):
    case.assertTrue(TRAINER.exists(), "NumPy trainer API is missing")
    spec = importlib.util.spec_from_file_location("neural_training", TRAINER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class NumericalTests(unittest.TestCase):
    def test_float64_xavier_masked_soft_targets_and_all_parameter_gradients(self):
        t = load_trainer(self)
        import numpy as np
        rng = np.random.default_rng(17)
        p = t.initialize(rng)
        reference = np.random.default_rng(17)
        np.testing.assert_array_equal(p["W1"], reference.uniform(-np.sqrt(6/38), np.sqrt(6/38), (6,32)))
        np.testing.assert_array_equal(p["W2"], reference.uniform(-np.sqrt(6/37), np.sqrt(6/37), (32,5)))
        self.assertEqual(sum(v.size for v in p.values()), 389)
        for key, value in p.items():
            self.assertEqual(value.dtype, np.float64)
            if key.startswith("b"):
                np.testing.assert_array_equal(value, 0)
        x = np.array([[0,0,1,1,.2,.3], [.1,.3,.8,.5,.4,.6], [1,1,0,0,.7,.2]], dtype=np.float64)
        legal = np.array([[False,True,True,False,True], [True]*5, [True,False,False,True,True]])
        target = np.array([[0,.5,.5,0,0],[.2]*5,[.5,0,0,.5,0]], dtype=np.float64)
        loss, gradient = t.loss_and_gradients(p, x, legal, target)
        logits = t.forward(p, x)
        reference_loss = 0.
        for row, mask, y in zip(logits, legal, target):
            logsum = np.logaddexp.reduce(row[mask])
            reference_loss -= sum(y[i] * (row[i] - logsum) for i in range(5) if mask[i]) / len(x)
        self.assertAlmostEqual(loss, reference_loss, places=14)
        h = 1e-5
        maximum = 0.
        checked = 0
        for name, values in p.items():
            numerical = np.empty_like(values)
            for index in np.ndindex(values.shape):
                original = values[index]
                values[index] = original + h
                plus = t.loss_and_gradients(p, x, legal, target)[0]
                values[index] = original - h
                minus = t.loss_and_gradients(p, x, legal, target)[0]
                values[index] = original
                numerical[index] = (plus-minus)/(2*h)
                checked += 1
            maximum = max(maximum, float(np.max(np.abs(numerical-gradient[name]))))
            np.testing.assert_allclose(gradient[name], numerical, rtol=1e-6, atol=2e-9)
        # With exactly one legal action, illegal logits and their derivatives
        # cannot affect either loss or update, even with a huge illegal bias.
        p["b2"][0] = 1e6
        one = np.array([[False,False,False,False,True]] * len(x))
        labels = one.astype(np.float64)
        exact_loss, exact_gradient = t.loss_and_gradients(p, x, one, labels)
        self.assertEqual(exact_loss, 0.)
        for value in exact_gradient.values():
            np.testing.assert_array_equal(value, 0.)
        for bad in (target * .5, np.full_like(target, .2), np.full_like(target, float("nan"))):
            with self.assertRaises(ValueError):
                t.loss_and_gradients(p, x, legal, bad)
        self.assertEqual(checked, 389)
        receipt = os.environ.get("ZL011_TEST_RECEIPTS")
        if receipt:
            Path(receipt, "gradient-check.json").write_text(json.dumps({"method":"central finite differences", "step":h,
                "parametersChecked":checked,"maxAbsoluteError":maximum,"relativeTolerance":1e-6,"absoluteTolerance":2e-9,
                "passed":True,"trainerSha256":hashlib.sha256(TRAINER.read_bytes()).hexdigest()}, indent=2)+"\n")

    def test_adam_bias_correction_matches_scalar_reference(self):
        t = load_trainer(self)
        self.assertTrue(hasattr(t, "Adam"), "Adam optimizer is missing")
        import numpy as np
        p = {"probe": np.array([.3, -.4], dtype=np.float64)}
        opt = t.Adam(p)
        expected = p["probe"].copy()
        m = [0., 0.]
        v = [0., 0.]
        for step, g in enumerate(([.2, -.1], [-.7, .3], [0., .2]), 1):
            for i in range(2):
                m[i] = .9*m[i] + .1*g[i]
                v[i] = .999*v[i] + .001*g[i]*g[i]
                expected[i] -= .003 * (m[i]/(1-.9**step)) / ((v[i]/(1-.999**step))**.5 + 1e-8)
            opt.update(p, {"probe": np.array(g)})
            np.testing.assert_allclose(p["probe"], expected, rtol=0, atol=1e-15)
            self.assertEqual(opt.steps, step)
        with self.assertRaises(FloatingPointError):
            opt.update(p, {"probe": np.array([np.nan, 0.])})


def fixture_dataset(directory, validation_variant=0):
    """Independent positions/split encoder; deliberately synthetic safe targets."""
    rows = {"train": [], "validation": []}
    limits = {"train": 513, "validation": 9}
    for index in range(343000):
        pair, h = divmod(index, 70)
        z1, z2 = divmod(pair, 70)
        points = [(v % 10, v // 10) for v in (h, z1, z2)]
        hx, hy = points[0]
        if any(abs(hx-x)+abs(hy-y) <= 1 for x,y in points[1:]):
            continue
        bucket = int(hashlib.sha256(f"ZL011:{min(z1,z2)}:{max(z1,z2)}".encode()).hexdigest()[:8],16)%10
        split = "train" if bucket < 8 else "validation" if bucket == 8 else "test"
        if split == "test" or len(rows[split]) >= limits[split]:
            continue
        legal = [hy>0, hx<9, hy<6, hx>0, True]
        labels = [float(v)/sum(legal) for v in legal]
        if split == "validation" and validation_variant:
            labels = [0.,0.,0.,0.,1.]
        rows[split].append({"stateIndex": index,"inputs":[n/d for x,y in points for n,d in ((x,9),(y,6))],
                            "legal":legal,"targets":labels})
        if all(len(rows[s]) == limits[s] for s in rows):
            break
    manifest = {"schemaVersion":1,"metadata":{"fixture":True},"stateCount":343000,"splits":{},"files":{}}
    for split, examples in rows.items():
        body = '{"schemaVersion":1,"split":"'+split+'","examples":[\n' + ',\n'.join(json.dumps(r,separators=(",",":")) for r in examples) + '\n]}\n'
        raw = body.encode()
        Path(directory, split+".json").write_bytes(raw)
        manifest["splits"][split] = {"examples":len(examples), "membershipSha256":hashlib.sha256("".join(f'{r["stateIndex"]}\n' for r in examples).encode()).hexdigest()}
        manifest["files"][split+".json"] = {"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}
    Path(directory,"manifest.json").write_text(json.dumps(manifest)+"\n")
    # Malformed poison: any accidental test read would fail this entire run.
    Path(directory,"test.json").write_text("THIS IS NOT JSON OR TRAINING DATA")
    return manifest


class IsolationTests(unittest.TestCase):
    def test_fixed40_epochs_final_short_batch_and_validation_test_isolation(self):
        t = load_trainer(self)
        self.assertTrue(hasattr(t,"run_training"), "isolated training pipeline is missing")
        import numpy as np
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for variant in (0,1):
                data = root / f"data{variant}"
                out = root / f"out{variant}"
                data.mkdir()
                fixture_dataset(data,variant)
                result = subprocess.run([sys.executable,str(TRAINER),"--data-dir",str(data),"--out-dir",str(out)],
                    capture_output=True,text=True,timeout=30)
                self.assertEqual(result.returncode,0,result.stderr)
                receipt = json.loads((out/"training.json").read_text())
                self.assertEqual(receipt["status"],"completed")
                self.assertEqual(receipt["epochsCompleted"],40)
                self.assertEqual(receipt["steps"],80)
                self.assertEqual(receipt["batchSize"],512)
                self.assertEqual(receipt["lastBatchSize"],1)
                self.assertEqual(receipt["testFilesOpened"],[])
                self.assertEqual(set(receipt["datasetFilesRead"]),{"manifest.json","train.json","validation.json"})
                self.assertEqual(len(receipt["epochs"]),40)
                rng = np.random.default_rng(17)
                t.initialize(rng)
                for epoch, recorded in enumerate(receipt["epochs"],1):
                    expected = hashlib.sha256(rng.permutation(513).astype("<u4").tobytes()).hexdigest()
                    self.assertEqual(recorded["epoch"],epoch)
                    self.assertEqual(recorded["permutationSha256"],expected)
                freeze = json.loads((out/"model-freeze.json").read_text())
                for name, expected in freeze["files"].items():
                    self.assertEqual(hashlib.sha256((out/name).read_bytes()).hexdigest(),expected)
                self.assertEqual(json.loads((out/"feed-forward.json").read_text())["epoch"],40)
                self.assertEqual(json.loads((out/"feed-forward-initial.json").read_text())["epoch"],0)
                self.assertTrue((out/"pretraining-freeze.json").exists())
                again = subprocess.run([sys.executable,str(TRAINER),"--data-dir",str(data),"--out-dir",str(out)],
                    capture_output=True,text=True,timeout=10)
                self.assertNotEqual(again.returncode,0)
                self.assertIn("already exists",again.stderr)
            outputs = [json.loads((root/f"out{variant}"/"feed-forward.json").read_text()) for variant in (0,1)]
            for name in ("W1","b1","W2","b2"):
                np.testing.assert_array_equal(outputs[0][name],outputs[1][name])
            metrics = [json.loads((root/f"out{variant}"/"training.json").read_text()) for variant in (0,1)]
            self.assertNotEqual(metrics[0]["epochs"][-1]["validationLoss"], metrics[1]["epochs"][-1]["validationLoss"])
            guard = subprocess.run([sys.executable,"-c", r'''
import importlib.util, pathlib,sys
spec=importlib.util.spec_from_file_location('trainer',sys.argv[1]); t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
t.install_test_guard()
try:pathlib.Path(sys.argv[2]).read_bytes()
except PermissionError:print('blocked')
else:raise AssertionError('test label access allowed')
''',str(TRAINER),str(root/"data0"/"test.json")],capture_output=True,text=True,timeout=10)
            self.assertEqual(guard.returncode,0,guard.stderr)
            self.assertEqual(guard.stdout.strip(),"blocked")
            receipt_dir = os.environ.get("ZL011_TEST_RECEIPTS")
            if receipt_dir:
                Path(receipt_dir,"isolation-check.json").write_text(json.dumps({"passed":True,"syntheticFixture":True,
                    "trainExamples":513,"epochs":40,"steps":80,"lastBatchSize":1,"validationTargetsChanged":True,
                    "identicalFinalWeights":True,"malformedTestNeverOpened":True,"runtimeAuditGuardBlockedTest":True,
                    "all40PermutationsIndependentlyChecked":True,"trainerSha256":hashlib.sha256(TRAINER.read_bytes()).hexdigest()},indent=2)+"\n")


class ExportTests(unittest.TestCase):
    def test_label_free_export_requires_frozen_hashes_and_preserves_ties(self):
        t = load_trainer(self)
        self.assertTrue(hasattr(t,"export_parity"), "post-freeze positional parity export is missing")
        import numpy as np
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model_dir = root/"models"
            model_dir.mkdir()
            final_p = {name:np.zeros(shape,dtype=np.float64) for name,shape in t.SHAPES.items()}
            initial_p = t.initialize(np.random.default_rng(17))
            models = {"feed-forward.json":t.model_object(final_p,40,{"probe":"</script><>&\u2028\u2029"}),
                      "feed-forward-initial.json":t.model_object(initial_p,0,{})}
            for name,model in models.items():
                (model_dir/name).write_text(json.dumps(model)+"\n")
            wrapper = t.model_wrapper(models["feed-forward.json"])
            self.assertTrue(all(c not in wrapper for c in "<>&\u2028\u2029"))
            (model_dir/"feed-forward.js").write_text(wrapper)
            check = subprocess.run(["node","-e",r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),ctx);
const model=ctx.window.ZL_NEURAL_MODEL;
function check(v){if(v && typeof v==='object'){assert.ok(Object.isFrozen(v));Object.values(v).forEach(check)}}
check(model);assert.equal(JSON.stringify(model),JSON.stringify(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))));
''',str(model_dir/"feed-forward.js"),str(model_dir/"feed-forward.json")],capture_output=True,text=True)
            self.assertEqual(check.returncode,0,check.stderr)
            with self.assertRaises(FileNotFoundError):
                t.export_parity(model_dir,root/"unfrozen",range(200))
            freeze = {"epoch":40,"files":{name:hashlib.sha256((model_dir/name).read_bytes()).hexdigest() for name in (*models,"feed-forward.js")},
                      "weightsSha256":t.weights_sha256(final_p),"initialWeightsSha256":t.weights_sha256(initial_p)}
            (model_dir/"model-freeze.json").write_text(json.dumps(freeze))
            meta = t.export_parity(model_dir,root/"parity",range(200))
            raw = (root/"parity"/"python-parity.bin").read_bytes()
            rows = list(struct.iter_unpack("<I5dB5dB",raw))
            expected = [i for i in range(200) if not t.state_features(i)[2]]
            self.assertEqual([r[0] for r in rows],expected)
            self.assertEqual(meta["rows"],len(rows))
            self.assertEqual(meta["recordBytes"],86)
            self.assertEqual(meta["nearTies"]["neural"]["countWithin1e10"],len(rows))
            for row in rows:
                features,legal,_,_ = t.state_features(row[0])
                np.testing.assert_array_equal(row[1:6],0.)
                self.assertEqual(row[6],legal.index(True))
                initial_logits = t.forward(initial_p,np.array([features],dtype=np.float64))[0]
                np.testing.assert_allclose(row[7:12],initial_logits,rtol=0,atol=1e-14)
                self.assertEqual(row[12],int(np.argmax(np.where(legal,initial_logits,-np.inf))))
            self.assertEqual(meta["sha256"],hashlib.sha256(raw).hexdigest())
            (model_dir/"feed-forward.json").write_text(json.dumps({**models["feed-forward.json"],"seed":18}))
            with self.assertRaises(ValueError):
                t.export_parity(model_dir,root/"mutated",range(200))

    def test_watchdog_interrupts_without_shortening_success(self):
        t = load_trainer(self)
        self.assertTrue(hasattr(t,"training_watchdog"), "enforced wall-clock context is missing")
        before = time.monotonic()
        with self.assertRaises(TimeoutError):
            with t.training_watchdog(.02):
                time.sleep(.1)
        self.assertLess(time.monotonic()-before,2.)
        with self.assertRaises(ValueError):
            with t.training_watchdog(601):
                pass


def verify_real_dataset(directory):
    """Independent ZL-010 physics checks labels; never opens test.json."""
    import numpy as np
    spec = importlib.util.spec_from_file_location("zl011_trainer_verify", TRAINER)
    assert spec is not None and spec.loader is not None
    trainer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(trainer)
    trainer.install_test_guard()
    checker_path = ROOT/"scripts/check-avoidability.py"
    spec = importlib.util.spec_from_file_location("zl010_frozen_checker", checker_path)
    assert spec is not None and spec.loader is not None
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    physics = checker.Physics()
    folder = Path(directory)
    manifest = json.loads((folder/"manifest.json").read_text())
    ranks = json.loads((ROOT/"evidence/avoidability/data/avoidability-certificate.json").read_text())["ranks"]
    names = ("train","validation","test")
    stats: dict[str, dict[str, Any]] = {s:{"groups":0,"orderedStates":0,"terminalStates":0,"examples":0} for s in names}
    membership = {s:hashlib.sha256() for s in names}
    group_hash,state_hash = hashlib.sha256(),hashlib.sha256()
    group_split = {}
    for a in range(70):
        for b in range(a,70):
            bucket = int(hashlib.sha256(f"ZL011:{a}:{b}".encode()).hexdigest()[:8],16)%10
            split = "train" if bucket < 8 else "validation" if bucket == 8 else "test"
            group_split[a,b] = group_split[b,a] = split
            stats[split]["groups"] += 1
            group_hash.update(f"{a}:{b}:{split}\n".encode())
    for index in range(343000):
        h,z1,z2 = physics.decode(index)
        split = group_split[z1,z2]
        terminal = physics.terminal(index)
        stats[split]["orderedStates"] += 1
        stats[split]["terminalStates"] += int(terminal)
        state_hash.update(f"{index}:{split}:{int(terminal)}\n".encode())
        if not terminal:
            stats[split]["examples"] += 1
            membership[split].update(f"{index}\n".encode())
    for split in names:
        stats[split]["membershipSha256"] = membership[split].hexdigest()
    assert stats == manifest["splits"], "independent full split membership/count mismatch"
    assert group_hash.hexdigest() == manifest["groupMembershipSha256"]
    assert state_hash.hexdigest() == manifest["stateMembershipSha256"]
    assert hashlib.sha256(np.asarray(ranks,dtype="<i4").tobytes()).hexdigest() == manifest["ranksSha256"]
    checked = {}
    for split in ("train","validation"):
        arrays = trainer.load_split(folder,manifest,split)
        for row, raw_index in enumerate(arrays["stateIndex"]):
            index = int(raw_index)
            edges = list(physics.transitions(index))
            legal = [False]*5
            successor = {}
            for action, destination, caught in edges:
                legal[action] = True
                successor[action] = ranks[destination]
                assert caught == (ranks[destination] == 0)
            desired = -1 if ranks[index] == -1 else max(successor.values())
            selected = [a for a,r in successor.items() if r == desired]
            expected = [1/len(selected) if a in selected else 0. for a in range(5)]
            assert arrays["legal"][row].tolist() == legal, (split,index,"legal mask")
            assert arrays["targets"][row].tolist() == expected, (split,index,"exact uniform target")
            h,z1,z2 = physics.decode(index)
            expected_inputs = [coordinate/scale for cell in (h,z1,z2) for coordinate,scale in ((cell%10,9),(cell//10,6))]
            assert arrays["inputs"][row].tolist() == expected_inputs
        checked[split] = len(arrays["stateIndex"])
    return {"passed":True,"all343000MembershipsIndependentlyChecked":True,"splits":stats,
            "targetsCheckedAgainstIndependentPhysicsAndFrozenRanks":checked,"testLabelsOpened":False,
            "manifestSha256":hashlib.sha256((folder/"manifest.json").read_bytes()).hexdigest(),
            "checkerSha256":hashlib.sha256(checker_path.read_bytes()).hexdigest(),
            "trainerSha256":hashlib.sha256(TRAINER.read_bytes()).hexdigest(),
            "testSourceSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--verify-dataset":
        print(json.dumps(verify_real_dataset(sys.argv[2]),indent=2))
    else:
        unittest.main(verbosity=2)
