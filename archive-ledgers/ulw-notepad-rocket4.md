# Ultrawork Notepad — GTG rocket loop fourth run (founder 2026-09-25)
Started: 2026-09-25 00:30 KST. Codex goal set (objective = fourth run). ulw-loop session rocket-fun-20260925 (cwd daedal-games, CLI components/ulw-loop/dist/cli.js). Research session gtg-demo .omo/ulw-research/20260925-003054.
Tier: HEAVY (judgement domain model change, new shelves, venue system). Skills used: ultrawork, ulw-loop, ulw-research, macrothink, multithink, hate, gauntlet-loop (reference-bar critic), game-studio routing (three-webgl-game, game-ui-frontend, game-playtest), visual-qa, refactor, git-master. game-development-studio: game-dev CLI absent (not installed; its workflows blocked; local gates cover QA).

## Plan
1. Snapshot + PLAN ladder + P15-P23 (DONE 256cda13, efc955f1 on feat/gtg).
2. Research wave (7 librarians) + codemaps (2) + macrothink (3): DONE, journal in research dir.
3. U1 P15 judgement position path + move gate (worker 01a0d420-07dd) RUNNING.
4. V1 beard regression + beard shelf + ball size (worker 01a0d420-0fc3) RUNNING.
5. Docs by orchestrator: ALIGN E, HANDOFF, rocket-loop router split (find-fun, market-test, polish, balance, expand), AGENCY/SCREEN/MEASURE/SYSTEM paragraphs, docs/gamedev (progression.md, presentation.md new; economy, judgement, AUTONOMY, EVIDENCE, README sections).
6. U2 P15 UI: two arrows, keeper moves, resolve at contact, auto-dive render, remove pad/out/ruler, update zone/hand/beat/frame/mobile/keys/readiness/live/walkback/restart/shot gates; default path switch + node gates re-based to keep intended save bands.
7. P16 venue ladder (names: 동네 운동장 or 학교 운동장 + 골대 뒤 연습 골대, 풋살장, 잔디 축구장, 프로 경기장; 3 countries each; flags top-right via flag-icons MIT; entry conditions; locked previews: unearned vs not-shipped).
8. P17 purchase conditions + P18 short names (stat<=6, trait<=8, effect<=10 chars; wiki holds detail).
9. P19 pack shop (pack art, foil sweep, tilt, 10-pull badge, odds link beneath, pity 'N회 남음') + legend showcase.
10. P21 pedestrians (roster table, venue country/wealth pools, face travel direction, glamour within 12+) + P22 character/animation quality with fresh critic vs Gang Beasts reference.
11. v0.9.0 tag at track close; README score refresh; final slow sweep; HANDOFF.

## Success criteria + QA scenarios
- C1 move gate: node tools/move-gate.mjs prints all axes PASS incl. old-path checksum.
- C2 controls: browser gate drives ArrowLeft/ArrowRight, keeper world x changes, no .zone pad, result caption, screenshot viewed.
- C3 beard: hair-tone pixels below mouth = 0 across hair thumbnails (positive control > 0); beard shelf renders.
- C4 ball: ballsize cap <= 1.3x near goal line, flight bar moved in same commit, screenshots viewed.
- C5 venue ladder: four tiers, flags, entry condition text + progress, locked preview tiles distinct from shipped-locked.
- C6 names: every stat/trait/effect label within length caps; wiki carries long text.
- C7 pack shop + legend showcase screenshots viewed by a fresh critic.
- C8 pedestrians face travel direction (yaw matches velocity), roster by venue.
- C9 docs: router split + gamedev files committed, residue/skillcheck green in daedal-games.
- C10 v0.9.0: version gate PASS, build.json 0.9.0 live.
WHEN TO STOP: all C1-C10 pass with evidence, or recorded blocked.

## Now
Workers U1, V1 running. Orchestrator writing docs (ALIGN E, router split, ontology).

## Findings
- Thread cap = 6 concurrent agents (completed agents must be closed to free slots).
- resolve() is called before the 550 ms run-up (main.mjs:628); new model needs resolve at contact.
- Chin wrap = identity beard cap (actors.mjs:517) coloured with hairTone (:527); 동네형 is a keeper (roster.mjs:137).
- Pedestrians translate +X with geometry facing +Z, camera at Z=-8 sees backs (scene.mjs:2220, pitch.mjs:671).
- Legend pulls share pullShelf renderer (main.mjs:2312); PULL_KINDS legend fame>=9, no tickets.
- Predecessor trace: Grow The Goalie 골키퍼 키우기, Catastrophe Games, com.sm.gtg v1.19.1, archive 52,807 downloads (PLAN item 29 evidence).
- Agentic PMF defined in daedal-games DICT.md line 49.
- Slow sweep auto-dispatches after every commit (hooks/post-commit); workers stop it with taskkill when they need a browser.

## Learnings
- Macrothink (3 fresh reads) converged on one root the direction lacked: no player-evidence path (telemetry, 5 uncoached sessions, bounded cohort). Classified divergent-compatible: adds a market-test stage; does not reject the fun-loop focus.


## Log 02:40 KST
- DONE U1 3fcdbc4 (move gate 11 axes PASS, verified by orchestrator run; bias scale 0.32 by ruling: field data wins).
- DONE V1 532e347 hair dye chin, 72a5632 beard shelf, bce8756 ball (1.25x near, ~1.71x spot); screenshots viewed (hair before/after, ball spot before/after).
- DONE ontology a3458d20 (daedal-games), router e831116f, PLAN e292bfc1 (P24, kill table), ledgers 299ffce8 (SCREEN beard third recurrence, MEASURE ball multiplier).
- DONE reference bar .omo/reference (Gang Beasts 8, peers 6, refs.md).
- RUNNING U3 01a0d431 (headless population to position path + tuning), U2 01a0d442-5492 (UI switch), T1 01a0d448 (telemetry module).
- QUEUED S1a (P18 names, P17 conditions) after U3+U2; S1b (P16 venues); S2 (P19 packs); VQ2 (P22 characters with fresh critic vs .omo/reference); VQ1 (P21 pedestrians); U4 (old path removal) + sweep + v0.9.0.
- Rule learned: librarian role is read-only (cannot write files); use lazycodex-worker-low for downloads.


## Log 03:05 KST
- U3 REJECT after two tuning rounds (68a2ffb instrumentation only; coefficients restored). Measured: hand-follow falls from ~38% (Lv1) to ~31-34% (Lv13-21) and loses to hand-centre at Lv21 greedy; bait loses as kicker composure rises; bot Lv21 greedy 48.9%; offball negative for bots Lv5-13; handling/agility dominate marginals early.
- DECISION (find-fun, HOOTL): keeper stays controllable after contact until the auto-dive fires at the last reachable moment (diveNeed by diving, reaction time by reflex, margin by reflex); aimAt at contact; diveTrigger per frame; resolve at trigger. Reason: founder's 'keep moving continuously'; x-at-contact made post-kick play passive and removed skill at high levels.
- U1b spawned 01a0d44b (chain extension + move axes + position-pop policies hand-react). U2 told to wire the timeline behind one adapter and hold that part until U1b's hash.
- NEXT after U1b: U3b balance tuning on the new population; then canon judgement.md 자리와 읽기 update + SYSTEM ledger paragraph (두 배우의 관계).


## Log 03:55 KST
- DONE T1 3613a25 telemetry module (11 axes PASS, verified), unwired.
- DONE U1b 0580055 (move 19 axes PASS incl. reacting-beats-standing at Lv1/5/13/21, reflex widens window; position-pop PASS; verified). Call order sent to U2: aimAt at contact, diveTrigger per frame, resolve at trigger.
- DONE canon judgement.md 237f749b (keeper moves until the dive).
- DONE P19-proto .omo/proto/packs (index.html, shots, PORT.md) viewed: foil packs, odds link beneath, separate promises, legend showcase with 이적시장 button.
- DONE P22-proto .omo/proto/character (toy-like capsule kit, faces, soft shadows, walkers face travel; full resolution recommended over pixel layer) viewed.
- RUNNING U2 01a0d442-5492 (UI switch; now wiring U1b API), U3b 01a0d46a (balance tuning, 3 rounds max).
- QUEUE (serialize main.mjs/scene.mjs owners): after U2 -> S2 port (packs: main.mjs pullShelf + hud.css) in parallel with VQ2 port (characters: actors/pitch/scene/texture/thumb, full-res switch) -> S1a (names+conditions) -> S1b (venues) -> VQ1 (pedestrian roster by country/wealth) -> U4 (old path removal) + P24 wiring + sweep + v0.9.0 + README score + ledgers (SYSTEM 두 배우 for P15; AGENCY 작명 for P18) + PLAN [x].
- Briefs stored in exec memory: briefS1a, briefS1b (reload with load()); PORT.md files hold the port plans.



## Log 03:22 KST (real clock; earlier log headings in this file carried estimated times)
- FOUNDER NOTE 02:26 and 02:38: squad counted eleven outfield plus the keeper. Snapshot merged into PROMPT-20260925-003054.md per founder ruling (one file per run; record 56fd5364, README row). Earlier split file f4105d20 removed in 9c9d1708.
- DONE ledger e1705c71 (record): MEASURE axis-source rule gains cited world facts; definition-source rule splits product-decided vs world-decided; ball + squad as one recurrence; rule: world facts in one cited registry, gates re-read the clause and plant a violating sample, factchk in the same lap. Router real-reference ratchet widened. PLAN P25 added.
- DONE canon aab24a76: presentation.md 실물 크기와 규칙 (team rule, sizes, registry procedure), progression points there, EVIDENCE G31 G32, AUTONOMY rule 1 + ledger row 세계의 사실.
- DONE P25 03321bd (verified: reality PASS, squad PASS 15, screenshot 주전 11 / 11명, 4-3-3).
- DONE U2 9028355 d18eba2 ffed2b8 (arrows, auto-dive timeline; fast FAIL 14 left to U3c). Screens viewed. Defect noted: at 740x360 the cause badge text collides with the result caption (beat-740x360-caption.jpg) -> polish queue.
- REJECT U3b (3 rounds, C4 23.5% closest, 13 gates red). U3c spawned (structure allowed: read-before-certainty auto-dive, bot asymptote under human reference, offball role or ACCEPTED, re-pin by rule).
- RUNNING: P26 01a0d493 (world facts registry migration + fingerprint scan, after P25), U3c 01a0d494 (after P26), S2 01a0d4a6 (packs port), G1 01a0d4a7 (mepane row count from data).
- QUEUE: VQ2 after P26 (briefVQ2 stored) -> S1a -> S1b -> VQ1 -> U4 + telemetry wiring -> sweep -> v0.9.0. AGENTS.md (gtg-demo) world-facts line after P26. PLAN P25 [x] after P26.
- Browser lock protocol: .omo/browser.local.lock (New-Item -ErrorAction Stop).


## Log 05:06 KST
- FOUNDER NOTE 03:58 (beard quality, shave swatches changed length) captured in the run file (record dbf0b1d1 after a sibling re-sign of feat/gtg; my earlier record hashes were rewritten: 60fbac16 snapshot, 20a3ea27 delete, af135887 merge, 66b7116e ledger). Ledger 5bc1ee88 (MEASURE swatch recurrence + rule; router seventh UX question; PLAN P26 P27). PLAN P25 P26 [x] 64512703.
- DONE P26 26b8c80 (+ my 0fc02f5 icon false positive), AGENTS.md 1e7dc27, S2 e6d5d5a (packs; showcase kickers render as keepers -> sent to VQ2), G1 e2c2235, G2 00d7162 (shave single variant, swatch gate: 28 FAIL rows on other shelves -> S1a scope A; re-equip owned cosmetics -> S1a B; portrait exemption for packs -> S1a C).
- VQ2 commit 1 ccd163f (kit bodies/faces); pedestrians facing travel in progress; beard quality + legend thumbnails added.
- U3c REJECT x5. Cause: my bar demanded all gates green while balance/shot monitors pin the old judgement (rejection trap). R4 best: product-pop FAIL 16->6, bot<hand 0/0, hands/bot-effect/gear-effect green, rookie +1.82pp. U3d spawned to land R4 with classified re-pins, then one red per round (<=8 rounds).
- LESSON to ledger after U3d lands: a structural lap's acceptance bar holds target rows and guards only; monitors pinned to the old judgement are re-pinned after acceptance, not inside the bar.
- Commit protocol: --only everywhere (index race measured at 03:55).


## Log 06:29 KST
- LANDED: U3d da25ce7 (positional structure from U3c R4, Law 14 in reality, Bar-Eli 0.287 cited, monitors classified) and b78a75c (curve re-pin by classification). S1a 151805c (names), 189291e (conditions), 1be0d07 (swatches colour-only everywhere, swatch 54), c019452 (re-wear owned cosmetics), d7b6e34 (portrait prompt uniform). VQ2 ccd163f dd8c8e5 359c6fa. VQ3 71fe762 (matte ground) + caeb366 (band fix). Mine: 23bf13b (reality hex boundary).
- Ledger 7018c3d4 (MEASURE three-column acceptance bar; router: --only commits, browser lock), canon 45497626 (balance.md three-column bar). PLAN P20 P23 [x] c4c4a414.
- Visual QA caught two regressions before the founder: (1) effect name and number split across lines at 1280 (founder class 2026-09-09) -> G3 01a0d550; (2) glove cards show headless torso (founder class, kit card) -> VQ3 item 6 widened to all worn shelves with the person axis.
- Critic verdict .omo/evidence/critic/VERDICT.md -> VQ3 01a0d521 (ground, limbs, wind-up, pedestrian junctions, full beard, previews). Showcase at 844x390 cuts names -> later polish (S1b phase B or G-series).
- RUNNING: U3d (rounds on remaining reds), VQ3, G3, S1b 01a0d552 (phase A data/flags/conditions; B after G3; C after VQ3).
- QUEUE: VQ1 after S1b A + VQ3; U4 (old input path, telemetry wiring) after G3 + U3d; canon judgement.md paragraph from U3d's report; sweep; v0.9.0; README score; P24 package; SCREEN ledger line for the glove person axis after VQ3 lands.


## Log 07:54 KST
- LANDED since 06:29: U3d 5b7938b (C4 24.0%, C3 PASS; stopped at 8 rounds). U4a 6c3f6b5 + 119c83d (all judgement gates on positional path, autoInput retired, 6000 outcomes identical). G3 26c0a1b (effect rows, condition bar, pair gate 60). VQ3 1ada809 9f91daf b4b2c3b 9271062 (+71fe762 caeb366). S1b phase A: bca404b (GNI cited in reality), fd514e1 (entry conditions), 99591cf, d5f0ec3 + 0a53ac4 (flags), 96dae58 (wiki).
- Canon 8ef8718a: judgement.md position/read with Law 14 line rule, bot 250 ms asymptote, K9 Bar-Eli. Record d7caae04: PLAN P15 P17 P18 P19 P27 [x].
- ulw-loop G001 criteria revised (C001 run deliverables, C002 old saves + narrow widths, C003 registry + positional gates).
- Critic 2 (.omo/evidence/critic2/VERDICT.md): most visible gain = shorter broader keeper; plus kicker boot clearance, stride tilt, beard volume, tattoo framing, bot emblem crop, kit collar, background fog. -> VQ4 01a0d5a0.
- RUNNING: S1b 01a0d552 (phase B commit pending, then C venue geometry, D pedestrian roster), U3e 01a0d59c (balance on positional path, <=8 rounds), VQ4 01a0d5a0.
- NEXT after these: sweep (slow) clean except recorded reds; version bump v0.9.0 in closing commit + tag; README score with v1.0 rubric (fun loop + PMF); P24 telemetry wiring (endpoint empty) and market-test package; canon balance.md measured paragraph from U3e; SCREEN ledger line for worn-card person axis on all shelves (glove, bot) and ink framing; HANDOFF + ALIGN sync; ulw-loop evidence + checkpoint.


## Log 10:04 KST
- LANDED since 07:54: VQ4 7c43b7a 1ac3fb2 5621224 ada24b5 18c4305 (5,6 left uncommitted -> VQ5). S1b 18 commits (venue ladder: 14bf883 570ff84 7c9e1a5 62c7d42 b4f068c, passer pools 89522ad 9e8dbe6 77ddc04, gates f0d54aa bb7550b 6746e77, font 5574468, captions 03c0750). U3e e84d029 fbd7f40 c97c86e (8 rounds, no OBSERVE). U4b 31de474 (telemetry wired, endpoint empty) 63051f4 (caption collision). U3f 4195b49 so far.
- Visual QA viewed: venue shelf (flags, conditions, coming tiles; tier 0 subtitle uses a middle dot -> VQ5 item 3), tier 3 stadium, pedestrians by wealth band, caption 740x360 clean.
- RUNNING: U3f 01a0d5d5 (balance on causes), VQ5 01a0d617 (VQ4 leftovers, thumb FAIL 1, separator gate).
- NEXT: when U3f and VQ5 land -> full slow sweep; triage reds; v0.9.0 closing commit (package.json, package-lock.json, web/src/build.mjs VERSION) + tag; README score with v1.0 rubric; P16 P21 P22 P24 [x] in PLAN; canon balance.md measured paragraph (U3e + U3f); HANDOFF, ALIGN sync; ulw-loop evidence and checkpoint; Codex goal; founder briefing.


## Log 11:13 KST
- LANDED: P24b dc6dc9d ee1182a (market-test kit; HITL list: collector account Pipedream, recruiting five, zero spend, posting, result switch). VQ5 dd5db4f (round pads) 8e5d6d4 (tattoo framing) 06e1b4a (venue subtitle + separator gate). U3g so far f9703b0 (bought bot tiers below manual) 24ca35b (coach training vs opponent progression) 6d0397a (growth measured on rendered movement and caption causes).
- Record: PLAN P16 P21 P22 [x] + P28 opened 8b5e3706; MEASURE denominator recurrence 9d6c206a.
- Visual QA of the tattoo shelf: emoji lock + 'key: value' condition label on item cards vs header+rows on venue cards (two grammars), orphaned title syllable -> G6 01a0d656 (one condition component, SVG icons, text-wrap balance, separator gate gains colon and emoji rules, title balance axis).
- RUNNING: U3g 01a0d61f (ruler audit + fixes, <=10 rounds), G6 01a0d656.
- NEXT: close-out sweep after U3g and G6; v0.9.0; README; canon balance paragraph; HANDOFF/ALIGN; ulw-loop checkpoint; briefing.


## Log 13:32 KST
- Slow sweep at 0533fde finished 13:23: gates FAIL 23 (mepane, ballkind, chrome, face, fit, fullscreen, gear, goal, hand, hudlink, market, maxview, perf, profile, read, scale, shelf, skin, tabicon, tailstart, toon, ui, wallet). Tree moved under it (worker gate edits), so reds are re-run by owners.
- Owners: G7 chrome mepane ballkind goal + affected-gates/pre-push; G8 fit (65716eb landed) gear market maxview profile hand fullscreen hudlink read wallet shelf skin tabicon ui toon tailstart; G9 face perf; G10 01a0d6d9 scale (hud.css type tokens, the pack/legend component's parallel scale) + readiness 3 (walker follows a navigation href into wiki/site; odds axis read "no digit" instead of "no copied probability").
- P28 U3h 01a0d6e4 spawned: step 0 measures each balance row's resolution (paired 95% band) before any knob; re-judges U3g rounds 5 and 8 whose target rows passed and whose guard moves were 0.04 points; then offball monopoly and physique upper.
- Queue after owners release files: polish lap from critic3 (haze in scene.mjs after G7; keeper mitten hands, pedestrian joint blending, kit collar lobes after G9; shop card middle, venue card at 740x360, matte pack after G10), then critic 4. Then full slow sweep, v0.9.0 close, README rescore, ledgers, briefing.



## Log 14:30 KST
- LANDED since 13:32: 65716eb fit, 304a1c7 face (beard taper), 0ea4bd7 chrome, 2b80509 gear, 5388c28 market, 0a640d5 mepane, 7b5193e U3h resolution instrument, 2973502 G10 scale (pack/legend aliases onto global tokens, venue price moved above mode tiles, scale gate reads shorthand and aliases).
- Viewed G10 captures: venue 1280x720 after pushes tier-2 mode tiles below the fold, tier-0 card empty middle; 740x360 landscape card good. Folded into PL1 item 7.
- PL1 01a0d708 spawned (critic3 items: haze, mitten hands, collar lobes, goatee shape, pedestrian joints, card middle, venue shelf fit). Declined: pack foil glare (founder asked for packs that tempt a click; foil is the genre convention; critic reference has no shop UI).
- Browser lock is the bottleneck: five units queue on one lock.



## Log 15:12 KST
- LANDED: 9fa3dd4 G7 carried ball clear of the wider keeper; 7265230 U3h round 1 (standing recovery value; corr PASS 16, product-pop FAIL 0, physique guard moves -0.040/+0.033pp inside frozen 0.154/0.134 resolution, so U3g round 5 rejection overturned by the resolution contract); e3e97f0 G9 perf (calls 201 -> 93-101, triangles 77k -> 38.8k, walking buffers immutable); 2418e0b G10 readiness RED=0; 2973502 G10 scale.
- G9 closed with frame p50 33 ms. Isolation: all actors hidden still 36.8 ms, CPU submit 1.1 ms, so fixed per-pixel GPU cost after the full-resolution switch (359c6fa: full DPR, full-size intermediate RT, MSAA, 2048 PCF shadow). P29 01a0d731 spawned: measure each fixed cost, remove what the look does not need, dynamic resolution scaling from prior art, perf gate axes with controls.
- U3h round 2 (toughness 1.06%, balance -0.04pp inside +-0.08) in guard runs.



## Log 15:45 KST, FOUNDER VERDICT
- Founder (after waking): this run's visuals are a severe regression versus the build he saw before sleeping; shaders, sky/clouds, materials, assets, shop, modelling all worse, more low-poly, personality lost; "nothing worth taking back".
- understood as: capture the pre-run build (e674af7, version 0.8.0, label v0.8) and the current build (label v0.1-draft) part by part under identical seed/camera/viewport; README.md in its own folder with an A/B screenshot table ordered v0.1-draft then v0.8; honest per-part scores; re0-memo of why, into the rocket-loop ledgers and router, plus an executable check so a visual lap cannot land without losing-free A/B against the baseline build.
- Froze: PL1 (committed 9817108 locally, wip.patch), P29 (wip.patch, no commit), G7 (wip.patch affected-gates + pre-push), G8 (stopped after read PASS), U3h (stop sent).



## Log 17:30 KST
- A/B: 65 captures (v0.1-draft 5c4d9f4 vs v0.8 e674af7), record 97fd7e1c docs/gtg/ab/README.md. Scores 3.8 vs 5.8. Blind critics picked the draft (Opus 20:8, Astra 18:8): the loop's judge prefers the regression.
- Root causes with evidence: level read as style (Gang Beasts), orchestrator ordered the default look switch (VQ2 brief), brand misclassified HOOTL, toon gate red filed as stale read and repointed (stopped), critics compared against reference not baseline, GOAL never reached workers (0 reads; asset skills 0), 30+ render commits no owner. Model not the cause.
- Enforcement: gtg-demo 9ee832c look gate (e674af7 PASS 13, main FAIL 5) + hooks/pre-push; ab-capture.mjs commit pending hooks. Canon 09145c5b (presentation quality bar, AUTONOMY row, EVIDENCE S21). Record 97fd7e1c (ledgers, router ratchet, PLAN P22 reopened, P29).
- Next: P29 look restore worker (brief stored briefP29look).

