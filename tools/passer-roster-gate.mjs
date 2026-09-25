import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {CITY_SKINS,venueAt} from '../web/src/state/gear.mjs';
import {passerCountAt,passerPoolAt,passerRosterAt,passerPoolErrors} from '../web/src/state/passer.mjs';
import * as THREE from '../web/vendor/three.module.min.js';
import {chromium} from 'playwright';
import {PASSER_VARIANTS} from '../web/src/render/objects/actors.mjs';
const rows=[];
const browser=await chromium.launch({executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
let rendered;
try {
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran');
  rendered=await page.evaluate(async()=>{
    const T=await import('/web/vendor/three.module.min.js');
    const {buildPassers,setPasserRoster}=await import('/web/src/render/objects/pitch.mjs');
    const {CITY_SKINS}=await import('/web/src/state/gear.mjs');
    const {passerCountAt}=await import('/web/src/state/passer.mjs');
    const stage=new T.Group(),bodies=buildPassers(stage,passerCountAt(CITY_SKINS.length-1)),surfaces={};
    for(const [tier,hosts] of CITY_SKINS.entries())for(const [variant] of hosts.entries()){
      setPasserRoster(bodies,tier,variant);
      surfaces[tier+':'+variant]=bodies.slice(0,passerCountAt(tier)).map(body=>{
        const mesh=body.userData.walker.chest.children.find(part=>part.isMesh);
        // 승인된 병합 몸의 첫 정점은 상의다. 재질의 흰 곱색 대신 실제 정점색을 읽는다.
        const shirt=new T.Color().fromBufferAttribute(mesh.geometry.getAttribute('color'),0).getHex();
        return {key:body.userData.roster.key,id:body.userData.variantId,shirt};
      });
    }
    return surfaces;
  });
}finally{await browser.close();}
for(const [tier,hosts] of CITY_SKINS.entries())for(const [variant,host] of hosts.entries()){
  const pool=passerPoolAt(tier,variant),selected=passerRosterAt(tier,variant);
  assert.deepEqual(passerPoolErrors(pool,host),[]);
  assert.equal(selected.length,passerCountAt(tier));
  assert.ok(selected.every(row=>pool.includes(row)));
  assert.ok(new Set(selected.map(row=>row.id)).size>1);
  if(tier)assert.ok(pool.length>passerPoolAt(tier-1,variant).length);
  const actual=rendered[tier+':'+variant].map((body,i)=>{
    const outfit=selected[i],base=PASSER_VARIANTS.find(row=>row.id===outfit.id);
    // 제품 계약의 일상복 20%·외출복 55% 색 혼합을 실제 상의 재질에서 독립적으로 확인한다.
    const wanted=new THREE.Color(base.shirt).lerp(new THREE.Color(outfit.shirt),outfit.clothing==='외출복'?0.55:0.2).getHex();
    assert.equal(body.shirt,wanted);
    assert.equal(body.key,outfit.key);
    assert.equal(body.id,outfit.id);
    return {...body,wanted};
  });
  const single=pool.map(row=>({...row,id:pool[0].id}));
  assert.ok(passerPoolErrors(single,host).includes('단일 주민 종류'));
  rows.push({tier,variant,host:host.name,country:host.country,wealth:host.wealth,pool,selected,actual,singleClassRejected:true});
}
// 나이지리아와 카타르의 서로 다른 소득 구간은 같은 주민 표에서도 옷차림 비중이 달라야 한다.
const low=passerPoolAt(2,2),high=passerPoolAt(3,2);
assert.notEqual(venueAt(2,2).wealth,venueAt(3,2).wealth);
assert.notDeepEqual(low.map(row=>row.clothingWeight),high.slice(0,low.length).map(row=>row.clothingWeight));
const out=new URL('../.omo/evidence/p16/',import.meta.url);mkdirSync(out,{recursive:true});
writeFileSync(new URL('passer-roster.json',out),JSON.stringify({rows,wealthWeightsDiffer:true},null,2));
console.log('passer-roster PASS '+rows.length+' mixed venue pools and single-class controls');
