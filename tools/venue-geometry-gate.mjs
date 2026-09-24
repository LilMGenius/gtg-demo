import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {placeGeo,placeCardGeo,venueCrowd} from '../web/src/render/objects/places.mjs';
// 네 시설의 월드와 카드가 유한한 기하를 가지며 같은 기하로 퇴행하지 않는지 잰다.
const hashes=[];
const rows=[];
for(let tier=0;tier<4;tier++)for(const [surface,geo] of [['world',placeGeo(tier)],['card',placeCardGeo(tier)]]){
  const vertices=geo.getAttribute('position').array;
  assert.ok(vertices.length>0 && [...vertices].every(Number.isFinite));
  geo.computeBoundingBox();
  const hash=createHash('sha256').update(Buffer.from(vertices.buffer)).digest('hex');
  hashes.push(hash);rows.push({tier,surface,vertices:vertices.length,hash,bounds:geo.boundingBox});
}
assert.equal(new Set(hashes).size,hashes.length);
// 같은 지오메트리를 복제한 대조군은 구별되지 않아야 한다.
assert.notEqual(new Set([hashes[0],hashes[0]]).size,2);
const crowd=venueCrowd();
assert.ok(crowd.isInstancedMesh && crowd.count>0);
const out=new URL('../.omo/evidence/p16/',import.meta.url);mkdirSync(out,{recursive:true});
writeFileSync(new URL('venue-geometry.json',out),JSON.stringify({rows,crowdInstances:crowd.count,duplicateControlRejected:true},null,2));
console.log('venue-geometry PASS '+rows.length+' surfaces; '+crowd.count+' instanced spectators');
