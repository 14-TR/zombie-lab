# ZL-011 — Preserved original evidence

These compact files are **unchanged copies of the original completed training and evaluation receipts**, not a new experiment. They remain bound to the original dirty worktree/source hashes. Publication does not retroactively turn them into clean-commit evidence.

- [Original evaluation](evaluation/evaluation.json), [independent reconciliation](evaluation/verified-real.json), [split-specific comparisons](evaluation/original-split-summary.json), [all-state frozen-export parity](evaluation/frozen-export-parity.json).
- [Training receipt](training/training.json), [model freeze](training/model-freeze.json), [pretraining freeze](training/pretraining-freeze.json), [gradient check](training/gradient-check.json), [isolation check](training/isolation-check.json), [parity metadata](training/python-parity.json).
- [Dataset manifest](dataset/manifest.json), [complete retained/external file hash manifest](manifest.json), [original evaluator handoff](evaluation/handoff.json).

The original full dataset (58,132,184 bytes), training directory (25,997,362 bytes, including the 25,818,232-byte label-free parity binary), and evaluation directory (15,179,423 bytes) remain outside Git. The manifest inventories them without duplicating their large files or deleting the originals. **Combined original training/evaluation evidence exceeded the 30 MB target.** Small copied receipts add storage; they are not a claim of returning under that budget. Shared Git history and existing environments are excluded from these measurements.

The original evaluator's report is preserved as `evaluation/original-report.md`; its completion wording describes that earlier evaluation stage. Read the [current report](../../experiments/ZL-011-feed-forward.md) for the delivery distinction. Its relative protocol link is retained with an unchanged protocol copy alongside it.

The site-root `neural.json`, `neural-heldout.json`, `neural-data.js` and `evaluation.json` are generated again by the unchanged evaluator for **the actual release commit**, using the same frozen model bytes. They verify packaging/source identity and deterministic outcomes; timing and resource fields are freshly measured and may differ. CI does not train or run NumPy parity. Original NumPy parity is the separate hash-bound receipt above, not an implied CI result.

The expanded held-out comparison is **exact-avoidability-only**, not expanded planner trajectories; only starting configurations are held out. The original model failed the preregistered planner-replacement criterion. Nothing in release verification selects a different model, changes the protocol or repairs the negative result.
