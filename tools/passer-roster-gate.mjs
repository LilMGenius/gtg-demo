import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {CITY_SKINS,venueAt} from '../web/src/state/gear.mjs';
import {passerCountAt,passerPoolAt,passerRosterAt,passerPoolErrors} from '../web/src/state/passer.mjs';
import * as THREE from '../web/vendor/three.module.min.js';
import {buildPassers,setPasserRoster} from '../web/src/render/objects/pitch.mjs';
import {PASSER_VARIANTS} from '../web/src/render/objects/actors.mjs';
const rows=[];
const scene=new THREE.Group();
// 최상위 시설의 인원만 한 번 만들고 같은 루트를 모든 개최지로 갈아입힌다.
const bodies=buildPassers(scene,passerCountAt(CITY_SKINS.length-1));
for(const [tier,hosts] of CITY_SKINS.entries())for(const [variant,host] of hosts.entries()){
  const pool=passerPoolAt(tier,variant),selected=passerRosterAt(tier,variant);
  assert.deepEqual(passerPoolErrors(pool,host),[]);
  assert.equal(selected.length,passerCountAt(tier));
  assert.ok(selected.every(row=>pool.includes(row)));
  assert.ok(new Set(selected.map(row=>row.id)).size>1);
  if(tier)assert.ok(pool.length>passerPoolAt(tier-1,variant).length);
  setPasserRoster(bodies,tier,variant);
  const actual=bodies.slice(0,selected.length).map((body,i)=>{
    const outfit=selected[i],base=PASSER_VARIANTS.find(row=>row.id===outfit.id);
    // 제품 계약의 일상복 20%·외출복 55% 색 혼합을 실제 상의 재질에서 독립적으로 확인한다.
    const wanted=new THREE.Color(base.shirt).lerp(new THREE.Color(outfit.shirt),outfit.clothing==='외출복'?0.55:0.2).getHex();
    const material=body.userData.walker.chest.children.find(part=>part.isMesh).material;
    assert.equal(material.color.getHex(),wanted);
    assert.equal(body.userData.roster.key,outfit.key);
    assert.equal(body.userData.variantId,outfit.id);
    return {key:body.userData.roster.key,shirt:material.color.getHex(),wanted};
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
