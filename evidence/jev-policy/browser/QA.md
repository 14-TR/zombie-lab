# Actual exported replay QA

Source/build `241124b9e2f728d5a65eaea93ec9c6788ae07891`. Actual local `file://` export, cached Playwright/Chromium, no install or server. Not a downloaded PR artifact or deployed website.

Automated browser gate passed at 320, 390 and 1200 pixels: each width checks both starts and 26 shared ticks / 104 rendered board frames, complete histories, exact coordinates including marker cells and accessible labels, true stopping endpoints, both arms' raw choices/predictions/actual moves, all 111 encountered relative links, JSON/classic-script data parity, play/pause/auto-stop/back/next/keyboard scrub, no overflow, no marker-label overlap, no script/console errors, no external requests. Minimum rendered SVG glyphs: 14.78375 / 18.70375 / 29.51125 px respectively.

Visual inspection: `top-320.png`, `boards-320.png`, `decision-390.png` loaded and examined. Negative result is readable above the fold; policy card clearly shows captured at local tick 4, H and zombie labels remain legible, raw human stay and both wrong zombie predictions are clearly distinguished from actual moves and evaluator-only W safety label. No visible clipping/overlap defect. The partial original board at the top of the scrolled policy screenshot is normal viewport framing, not hidden history.

Issues observed in this scoped new replay: 0. Untested gates: independent implementation review, remote CI/downloaded artifact, live Pages. All retained PNGs and `receipt.json` came from real browser execution.
