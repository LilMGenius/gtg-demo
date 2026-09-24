import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BEARDS, BEARD_SKINS, HAIRS, lookOf, lookBoost, readGear } from '../web/src/state/gear.mjs';
import { KEEPERS, KICKERS, faceOf } from '../src/roster.mjs';

// 수염 선반도 헤어와 같은 구매·시착·저장 경로를 통과해야 한다.
const out = new URL('../.omo/evidence/p20-p21a/', import.meta.url);
mkdirSync(out, { recursive: true });
const rows = [];
const check = (name, pass, detail) => { rows.push({ name, pass, detail }); console.log((pass ? 'ok ' : 'FAIL ') + name + ' ' + JSON.stringify(detail)); };
check('beard:keepers-start-shaved', KEEPERS.every(k => lookOf({}, k.name).face.beard === 0), KEEPERS.length);
check('beard:identity-beards-remain-on-kickers', KICKERS.some(k => faceOf(k.name).beard > 0), KICKERS.filter(k => faceOf(k.name).beard > 0).length);
check('beard:prices-match-hair-and-names-stay-short', BEARDS.every((row, i) => row.cost === HAIRS[i].cost && row.name.length <= 8) && BEARD_SKINS.flat().every(row => row.name.length <= 8), BEARDS);
// 기존 외형 상한 1.3은 선반이 늘어도 올라가지 않는다. 수염만 샀을 때는 등급당 기존 5%다.
check('beard:follower-effect-stays-in-existing-cap', lookBoost({ beard: 3 }) === 1.15 && lookBoost({ beard: 3, hair: 3, ink: 3 }) === 1.3, [lookBoost({ beard: 3 }), lookBoost({ beard: 3, hair: 3, ink: 3 })]);
check('beard:old-save-defaults-shaved', readGear({}).beard === 0 && readGear({}).beardSkin === 0, readGear({}));
// 브라우저가 멈춰도 세 분 뒤 종료한다. 기존 얼굴 게이트와 같은 예산이다.
const timer = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 180000); timer.unref();
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
try {
  // 과제의 데스크톱 기준 크기다. 캡처 자체가 1600 이하 JPEG다.
  const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // 패널의 0.24초 전환이 끝난 뒤 두 배 여유를 두고 실제 화면을 찍는다.
  const shot = async name => { await p.waitForTimeout(500); await p.screenshot({ path: fileURLToPath(new URL(name, out)), type: 'jpeg' }); };
  const errors = []; p.on('pageerror', e => errors.push(String(e)));
  await p.goto('http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran');
  await p.click('#go', { force: true });
  // 판 보상으로 구매 잔고가 바뀌지 않도록 기존 variant-gate의 시계를 쓴다.
  await p.evaluate(() => { window.__fixedStep(0.000001); window.__shop(true); });
  await p.locator('#shop .tab[data-tab="beard"]').click({ force: true });
  await shot('beard-desktop.jpg');
  const shape = await p.evaluate(async () => {
    const a = await import('/web/src/render/objects/actors.mjs');
    const g = await import('/web/src/state/gear.mjs');
    const r = await import('/src/roster.mjs');
    const THREE = await import('/web/vendor/three.module.min.js');
    // 머리와 피부에 없는 표식 색이다. 뒤쪽 반지름 절반 너머의 표식은 턱 감싸개다.
    const mark = 0xff00ff;
    const read = (head, dir) => {
      let painted = 0, back = 0;
      const radius = head.geometry.parameters.radius;
      head.traverse(mesh => {
        const pos = mesh.geometry?.getAttribute('position'), color = mesh.geometry?.getAttribute('color');
        if (!pos || !color) return;
        for (let i = 0; i < pos.count; i++) {
          if (color.getX(i) !== 1 || color.getY(i) !== 0 || color.getZ(i) !== 1) continue;
          painted++;
          if (pos.getZ(i) * dir < -radius / 2) back++;
        }
      });
      return { painted, back };
    };
    const samples = [];
    for (const k of r.KEEPERS) for (const [rank, variants] of g.BEARD_SKINS.entries()) for (const [variant] of variants.entries()) {
      const look = g.lookOf({ beard: rank, beardSkin: variant }, k.name);
      look.face.beardTone = mark;
      const rig = a.buildKeeper(k.height, k.weight, look);
      const measured = read(rig.userData.head, 1);
      samples.push({ name: k.name, rank, variant, expected: look.face.beard > 0, ...measured });
    }
    for (const k of r.KICKERS) {
      const face = { ...r.faceOf(k.name), beardTone: mark };
      const rig = a.buildKicker(face);
      samples.push({ name: k.name, kicker: true, expected: face.beard > 0, ...read(rig.userData.head, -1) });
    }
    // 양성 대조군은 기존 전둘레 턱 덮개와 같은 구의 아래 반쪽이다. 머리 반지름은 실제 리그에서 읽는다.
    const rig = a.buildKeeper(r.KEEPERS[0].height, r.KEEPERS[0].weight, g.lookOf({}, r.KEEPERS[0].name));
    const head = rig.userData.head;
    const cap = new THREE.SphereGeometry(head.geometry.parameters.radius, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const colors = new Float32Array(cap.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = 1; colors[i + 2] = 1; }
    cap.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    head.add(new THREE.Mesh(cap, new THREE.MeshBasicMaterial({ vertexColors: true })));
    return { samples, control: read(head, 1) };
  });
  writeFileSync(new URL('beard-shapes.json', out), JSON.stringify(shape, null, 2));
  check('beard:keeper-and-kicker-shapes-never-wrap-behind-the-chin', shape.samples.length > 0 && shape.samples.every(row => row.back === 0 && (row.painted > 0) === row.expected), { samples: shape.samples.length, failures: shape.samples.filter(row => row.back || (row.painted > 0) !== row.expected) });
  check('control:full-circumference-chin-cap-is-detected', shape.control.back > 0, shape.control);
  const pictures = await p.locator('#shop .rack .shot img').evaluateAll(imgs => imgs.map(im => im.src));
  check('beard:all-grades-have-distinct-thumbnails', pictures.length === BEARDS.length && new Set(pictures).size === pictures.length && pictures.every(s => s.startsWith('data:image')), pictures.map(s => s.length));
  const coin = () => p.evaluate(() => window.__squad().coin);
  const before = await coin();
  await p.locator('#shop .buy[data-kind="beard"][data-rank="2"]').click({ force: true });
  const bought = await p.evaluate(() => window.__gear());
  check('beard:direct-purchase-charges-only-selected-grade', bought.beard === 2 && before - await coin() === BEARDS[2].cost, { before, after: await coin(), gear: bought });
  const variantCoin = await coin();
  await p.locator('#shop .skin[data-field="beard"][data-rank="2"][data-skin="2"]').click({ force: true });
  const worn = await p.evaluate(() => window.__gear());
  check('beard:owned-variant-is-free', worn.beardSkin === 2 && await coin() === variantCoin, worn);
  const shavedPreview = await p.locator('#shop .card[data-at="0"] .shot img').getAttribute('src');
  const cleanPreview = await p.evaluate(async () => {
    const m = await import('/web/src/render/thumb.mjs');
    const g = await import('/web/src/state/gear.mjs');
    const k = window.__keeperStats();
    return m.thumbURL('beard', k, g.lookOf({ ...window.__gear(), beard: 0, beardSkin: 0 }, k.name));
  });
  check('beard:shave-preview-stays-shaved-after-equipping-variant', shavedPreview === cleanPreview, shavedPreview.length);
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem(window.__saveKey())));
  check('beard:purchase-and-variant-reach-save', raw.keeper.worn.beard === 2 && raw.keeper.worn.beardSkin === 2, raw.keeper.worn);
  // 가장 비싼 등급을 시착만 하고 취소해 저장과 지갑이 변하지 않는지 확인한다.
  await p.locator('#shop .card[data-spec="beard"][data-at="3"] .shot').click({ force: true });
  await shot('beard-fitting.jpg');
  await p.locator('#shop .strip').click({ force: true });
  check('beard:cancelled-fitting-keeps-wallet-and-wear', await coin() === variantCoin && (await p.evaluate(() => window.__gear())).beard === 2, await coin());
  await p.locator('#shop .close').click({ force: true });
  await shot('beard-pitch.jpg');
  await p.goto('http://127.0.0.1:10310/web/index.html?seed=20');
  await p.click('#go', { force: true });
  const restored = await p.evaluate(() => window.__gear());
  check('beard:reload-restores-worn-variant', restored.beard === 2 && restored.beardSkin === 2, restored);
  // 과제의 가로 휴대폰 크기다. 새 탭이 다른 선반을 밀어내지 않는지 실제 창으로 찍는다.
  await p.setViewportSize({ width: 740, height: 360 });
  await p.evaluate(() => window.__shop(true));
  await p.locator('#shop .tab[data-tab="beard"]').click({ force: true });
  await shot('beard-phone.jpg');
  const tabBox = await p.locator('#shop .tab[data-tab="beard"]').boundingBox();
  const viewport = p.viewportSize();
  check('beard:phone-category-is-visible', tabBox && tabBox.x >= 0 && tabBox.y >= 0 && tabBox.x + tabBox.width <= viewport.width && tabBox.y + tabBox.height <= viewport.height && await p.locator('#shop .rack .card').count() === BEARDS.length, tabBox);
  check('console:no-errors', errors.length === 0, errors);
} finally { await browser.close(); clearTimeout(timer); }
writeFileSync(new URL('beard-results.json', out), JSON.stringify(rows, null, 2));
console.log('beard ' + (rows.every(row => row.pass) ? 'PASS' : 'FAIL') + ' ' + rows.length);
if (rows.some(row => !row.pass)) process.exitCode = 1;
