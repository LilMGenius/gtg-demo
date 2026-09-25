// 기존 product-pop의 짝 표본 계측을 세트 블록으로 확장한다. 샷 안의 짝과 세트 안의 연속 실점을 보존한다.
// R boot의 보통 비모수 부트스트랩 절차를 재사용하며 외부 구현 바이트는 가져오지 않는다.
// 출처: https://stat.ethz.ch/R-manual/R-devel/library/boot/html/boot.html
import { makeRng } from '../src/chain.mjs';

// HOTL 가설: 50개 연속 시드 블록은 다섯 슛의 의존을 보존하면서 꼬리 표본을 확보한다.
const BLOCKS = 50;
// HOTL 가설: 1000회 재표집은 각 2.5% 꼬리에 25개를 두어 계산 비용과 반복 정밀도를 맞춘다.
const REPLICATES = 1000;
// HOTL 가설: 양측 95% 구간은 작은 가드 변동을 결함으로 오인하지 않기 위한 이번 랩의 해상도다.
const TAIL = 0.025;
// 고정 재표집 시드는 제품 난수와 별개라 게이트의 결정론 재현을 유지한다.
const SEED = 2803;

export function resolution(name, observations, scale = 100) {
  if (!observations.length) throw new Error('해상도 표본 없음: '+name);
  const width = observations[0].length;
  const blocks = Array.from({length:Math.min(BLOCKS,observations.length)},()=>Array(width).fill(0));
  observations.forEach((row,i)=>row.forEach((value,j)=>{ blocks[Math.floor(i*blocks.length/observations.length)][j]+=value; }));
  const total=blocks.reduce((sum,row)=>sum.map((v,j)=>v+row[j]),Array(width).fill(0));
  // 열 둘은 비율 하나, 열 넷은 같은 시드의 두 비율 차다. 0 분모는 정밀 부족이며 통과로 간주하지 않는다.
  const estimate = row => row[0]/row[1]-(width===4 ? row[2]/row[3] : 0);
  const point=estimate(total)*scale, rng=makeRng(SEED), draws=[];
  for(let b=0;b<REPLICATES;b++) {
    const sum=Array(width).fill(0);
    for(let i=0;i<blocks.length;i++) { const row=blocks[Math.floor(rng()*blocks.length)]; row.forEach((v,j)=>{sum[j]+=v;}); }
    draws.push(estimate(sum)*scale);
  }
  draws.sort((a,b)=>a-b);
  const low=draws[Math.floor(REPLICATES*TAIL)], high=draws[Math.ceil(REPLICATES*(1-TAIL))-1];
  const halfWidth=Math.max(point-low,high-point);
  const result={name,point,low,high,halfWidth,blocks:blocks.length,sets:observations.length,method:'paired-seed-block-bootstrap',confidence:1-TAIL*2};
  console.log('resolution '+JSON.stringify(result));
  return result;
}
