// 임팩트. 사건이 일어난 자리에 한 번 터지고 사라진다.
// 파티클 시스템은 없다. 도형 몇 개를 키우고 지우는 것이 전부다.
import * as THREE from '../../../vendor/three.module.min.js';

// 방사형 흰 선. 만화가 충격을 그리는 방법이 이것이다.
// 셰이더가 필요 없다. 원점에서 뻗은 선분 여섯 개를 카메라 쪽으로 돌려세우면 된다.
// 선을 원점에서 시작하면 가운데가 뭉쳐 별이 아니라 점이 된다. 안쪽 반경을 띄운다.
function starGeo(n) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + 0.31;
    pts.push(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0, Math.cos(a), Math.sin(a), 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

export function createImpact(scene) {
  const starMat = new THREE.LineBasicMaterial({ color: 0xfffbe8, transparent: true, opacity: 0 });
  const star = new THREE.LineSegments(starGeo(7), starMat);
  star.visible = false;
  star.userData.probeIgnore = true;
  scene.add(star);

  // 흙먼지. 흙 운동장이라 부딪히면 흙이 뜬다. 잔디였으면 이걸 안 넣었다.
  const dustMat = new THREE.MeshBasicMaterial({ color: 0xbf9a63, transparent: true, opacity: 0, depthWrite: false });
  const dustGeo = new THREE.CircleGeometry(0.16, 7);
  const dust = [];
  for (let i = 0; i < 6; i += 1) {
    const m = new THREE.Mesh(dustGeo, dustMat);
    m.visible = false;
    m.userData.probeIgnore = true;
    // 여섯 개가 같은 각으로 날면 부채가 된다. 각도와 속도를 미리 흩어 고정한다.
    const a = (i / 6) * Math.PI * 2 + 0.7;
    m.userData.dir = new THREE.Vector3(Math.cos(a) * (0.7 + (i % 3) * 0.3), 0.5 + (i % 2) * 0.55, Math.sin(a) * 0.4);
    scene.add(m);
    dust.push(m);
  }

  let t = 0;
  let life = 0;
  let power = 1;
  const at = new THREE.Vector3();

  // 사건이 일어난 좌표를 받는다. 세기는 사건의 무게다.
  function burst(pos, strength = 1) {
    at.copy(pos);
    power = strength;
    life = 0.34;
    t = 0;
    star.visible = true;
    star.position.copy(at);
    for (const m of dust) { m.visible = true; m.position.copy(at); }
  }

  function update(dt, camera) {
    if (life <= 0) return;
    t += dt;
    const u = Math.min(1, t / life);
    if (u >= 1) {
      star.visible = false;
      for (const m of dust) m.visible = false;
      life = 0;
      return;
    }
    // 별은 빠르게 커지고 빠르게 빠진다. 천천히 사라지면 충격이 아니라 후광이 된다.
    star.scale.setScalar((0.35 + u * 1.5) * power);
    star.quaternion.copy(camera.quaternion);
    starMat.opacity = (1 - u) * 0.9;
    // 먼지는 흩어지면서 가라앉는다. 위로만 보내면 연기가 된다.
    for (const m of dust) {
      const d = m.userData.dir;
      m.position.set(at.x + d.x * u * 1.1 * power, Math.max(0.04, at.y + (d.y * u - u * u * 1.6) * power), at.z + d.z * u * 1.1 * power);
      m.quaternion.copy(camera.quaternion);
      m.scale.setScalar((0.5 + u * 1.4) * power);
    }
    dustMat.opacity = (1 - u) * 0.55;
  }

  return { burst, update };
}
