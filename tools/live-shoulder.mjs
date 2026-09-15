import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pinClock } from './clock.mjs';
import { clearDraw } from './draw.mjs';
import { KEEPERS, KICKERS } from '../src/roster.mjs';

// Reuse thumb-gate's roster/chain envelope and scene's live postprocess renderer.
// Isolation changes visibility only; the paired pitch frames retain their real occluders.
const chain = readFileSync(new URL('../src/chain.mjs', import.meta.url), 'utf8');
const crew = KEEPERS.concat(KICKERS).filter(k => Number.isFinite(k.height) && Number.isFinite(k.weight));
const band = key => {
  const hit = chain.match(new RegExp('const ' + key + ' = (\\d+) \\+ Math\\.floor\\(rng\\(\\) \\* (\\d+)\\)'));
  if (!hit) throw Error('live shoulder envelope source drift: ' + key);
  const values = crew.map(k => k[key]).concat(+hit[1], +hit[1] + +hit[2] - 1);
  return [Math.min(...values), Math.max(...values)];
};
const heights = band('height'), weights = band('weight');
const bodies = [{height:188,weight:84}, ...heights.flatMap(height => weights.map(weight => ({height,weight})))];

export async function liveShoulders(browser, base, parent = false, capture = () => {}) {
  const ctx = await browser.newContext({viewport:{width:1280,height:720}});
  const rows = [];
  try {
    await pinClock(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    if (parent) {
      const body = execFileSync('git', ['show','2564b55:web/src/render/objects/actors.mjs'], {
        cwd:new URL('..',import.meta.url), maxBuffer:16000000
      });
      await page.route('**/web/src/render/objects/actors.mjs', route => route.fulfill({contentType:'text/javascript',body}));
    }
    await page.route('**/web/src/render/scene.mjs', async route => {
      const response = await route.fetch();
      let body = await response.text();
      const anchor = '  window.__sceneRoot = () => scene;';
      if (body.split(anchor).length !== 2) throw Error('live shoulder surface anchor drift');
      body = body.replace(anchor, anchor + `
  window.__liveShoulderSurface = (k, look) => {
    setKeeper(k, look);
    keeper.updateMatrixWorld(true);
    return {rig:keeper, scene, cv:renderer.domElement, render:() => {
      renderer.setRenderTarget(rt); renderer.render(scene,camera);
      renderer.setRenderTarget(null); renderer.render(postScene,postCam);
    }};
  };`);
      await route.fulfill({response,body});
    });
    await page.goto(base, {waitUntil:'load'});
    await page.click('#go', {force:true});
    if (!await clearDraw(page)) throw Error('live shoulder pitch is behind a card');
    const stop = await page.evaluate(() => {
      window.__lockRound(); window.__swayPin(0); window.__impactHide(true);
      document.getElementById('hud').style.display = 'none';
      if (window.__frames() >= 240) throw Error('live shoulder plan missed frame 240');
      const stop = 270;
      window.__plan(0, null, stop);
      return stop;
    });
    await page.waitForFunction(n => window.__frames() >= n, stop);
    const frozen = await page.evaluate(() => ({time:window.__camDbg().vnow, frame:window.__frames()}));
    await page.waitForFunction(f => window.__frames() > f + 2, frozen.frame);
    if (await page.evaluate(() => window.__camDbg().vnow) !== frozen.time) throw Error('live shoulder world clock did not stop');
    const looks = await page.evaluate(async () => {
      const g = await import('/web/src/state/gear.mjs');
      return g.KITS.flatMap((_,rank) => g.skinsAt('pads',rank).flatMap((skin,index) => skin.cut.pad > 0 ? [[rank,index]] : []));
    });
    for (const body of bodies) for (const look of looks) {
      const result = await page.evaluate(async ({body,look}) => {
        const gear = await import('/web/src/state/gear.mjs');
        const s = window.__liveShoulderSurface(body,gear.lookOf({pads:look[0],padsSkin:look[1]}));
        const time = window.__camDbg().vnow;
        const state = window.__pixState();
        if (state.rt.join('x') !== '683x384') throw Error('live shoulder target drift: '+JSON.stringify(state));
        const pads = s.rig.userData.arms.map(a => a.children.filter(c => c.isMesh && c.geometry.type === 'BoxGeometry'));
        if (pads.length !== 2 || pads.some(a => a.length !== 1)) throw Error('live shoulder pad population drift');
        const meshes = [];
        s.scene.traverse(o => {if(o.isMesh) meshes.push([o,o.visible]);});
        const cv = document.createElement('canvas'); cv.width=1280; cv.height=720;
        const c = cv.getContext('2d',{willReadFrequently:true});
        const grab = () => {s.render(); c.drawImage(s.cv,0,0);return c.getImageData(0,0,1280,720).data;};
        const belongs = (o,p) => {for(let q=o;q;q=q.parent) if(q===p) return true;return false;};
        const diff = (a,b,i) => Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2])) > 24;
        const restore = () => {for(const [o,v] of meshes) o.visible=v;};
        const full = grab(), fullUrl = cv.toDataURL();
        const repeat = grab();
        if(window.__padHide(true)!==2) throw Error('live shoulder hide hook drift');
        const bare = grab();
        const bareRepeat = grab();
        window.__padHide(false);
        const restored = grab();
        for(const [o] of meshes) o.visible=false;
        const empty = grab();
        for(const [o] of meshes) o.visible=belongs(o,s.rig.userData.torso);
        const torso = grab();
        let crown=720, left=1280, right=-1, torsoPixels=0;
        for(let i=0;i<torso.length;i+=4) if(diff(torso,empty,i)) {
          const x=(i/4)%1280, y=Math.floor(i/4/1280);
          crown=Math.min(crown,y); left=Math.min(left,x);right=Math.max(right,x);torsoPixels++;
        }
        const out=[];
        for(let hand=0;hand<2;hand++) {
          for(const [o] of meshes) o.visible=belongs(o,pads[hand][0]);
          const only=grab();
          let total=0, above=0, lateralLeft=0,lateralRight=0, drift=0, noPad=0;
          for(let i=0;i<full.length;i+=4) {
            if(diff(full,repeat,i)||diff(full,restored,i)) drift++;
            if(diff(bare,bareRepeat,i)) noPad++;
            if(!diff(only,empty,i)||!diff(full,bare,i)) continue;
            const x=(i/4)%1280,y=Math.floor(i/4/1280);
            total++;
            if(y<crown) above++;
            if(x<left) lateralLeft++;
            if(x>right) lateralRight++;
          }
          out.push({body:body.height+'/'+body.weight,look:look.join(':'),hand,total,above,lateralLeft,lateralRight,lateral:lateralLeft+lateralRight,crown,left,right,torsoPixels,drift,noPad,time});
        }
        restore(); grab();
        if(window.__camDbg().vnow!==time) throw Error('live shoulder clock moved');
        return {rows:out,png:body.height===165&&body.weight===96&&look.join(':')==='3:2'?fullUrl:null};
      },{body,look});
      rows.push(...result.rows);
      console.log('live-shoulder '+(parent?'parent':'live')+' '+JSON.stringify(result.rows));
      if(result.png) await capture(result.png,parent);
    }
    if(errors.length) throw Error(errors.join('\n'));
    if(rows.length !== bodies.length*looks.length*2 || looks.length!==6) throw Error('live shoulder sample count drift');
    return rows;
  } finally {await ctx.close();}
}
