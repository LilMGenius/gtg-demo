// 공이 화면에 실제로 있는지 재는 자. 선언값은 읽지 않는다.
// mesh.visible이 true인 것과 픽셀이 보이는 것은 다른 주장이다.
import * as THREE from '../../vendor/three.module.min.js';

// 가림 판정에서 빼는 것: 공 자신, 그림자, 그리고 빛을 통과시키는 표면.
// 그물 너머의 공은 보인다. 기둥 뒤의 공은 안 보인다.
function opaqueBlocker(o) {
  if (!o.isMesh || o.userData.probeIgnore) return false;
  const m = o.material;
  if (!m) return false;
  if (m.wireframe || m.transparent) return false;
  if (m.side === THREE.BackSide) return false;
  return true;
}

export function createBallProbe(camera, scene, ball, radius) {
  const ray = new THREE.Raycaster();
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const stats = { frames: 0, visible: 0, offscreen: 0, occluded: 0, behind: 0, streak: 0, longestStreak: 0, last: null, blockers: {} };

  // 한 프레임의 판정. 투영해서 NDC를 구하고, 카메라에서 공까지 실제로 광선을 쏜다.
  function sample() {
    camera.updateMatrixWorld();
    v.copy(ball.position).project(camera);
    const behind = v.z > 1 || v.z < -1;
    const onScreen = !behind && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;

    let occluded = false;
    if (onScreen) {
      dir.copy(ball.position).sub(camera.position);
      const dist = dir.length();
      ray.set(camera.position, dir.normalize());
      ray.far = Math.max(0.01, dist - radius);
      ray.near = 0.01;
      const hits = ray.intersectObjects(scene.children, true);
      const hit = hits.find((h) => opaqueBlocker(h.object));
      occluded = Boolean(hit);
      // 무엇이 가렸는지 모르면 가렸다는 숫자로 아무 판단도 못 한다.
      if (hit) {
        const k = hit.object.name || hit.object.geometry?.type || 'unknown';
        stats.blockers[k] = (stats.blockers[k] || 0) + 1;
      }
    }

    const visible = onScreen && !occluded;
    stats.frames += 1;
    if (visible) stats.visible += 1;
    else if (behind) stats.behind += 1;
    else if (!onScreen) stats.offscreen += 1;
    else stats.occluded += 1;
    // 누적 비율은 순간의 가림과 지속적인 사라짐을 같은 숫자로 만든다.
    // 키퍼 뒤로 잠시 지나는 것은 정상이고, 계속 안 보이는 것은 구도 문제다.
    if (visible) stats.streak = 0;
    else { stats.streak += 1; stats.longestStreak = Math.max(stats.longestStreak, stats.streak); }
    stats.last = { visible, onScreen, occluded, behind, ndc: [v.x, v.y, v.z] };
    return stats.last;
  }

  // 대조군은 게이트와 같은 함수를 타야 한다. 다른 코드로 재면 게이트에 대해 아무것도 증명하지 못한다.
  function probeAt(x, y, z) {
    const keep = ball.position.clone();
    const snap = { ...stats };
    ball.position.set(x, y, z);
    const r = sample();
    ball.position.copy(keep);
    Object.assign(stats, snap);
    return r;
  }

  function reset() {
    stats.frames = 0; stats.visible = 0; stats.offscreen = 0; stats.occluded = 0; stats.behind = 0; stats.streak = 0; stats.longestStreak = 0; stats.last = null; stats.blockers = {};
  }

  return { sample, probeAt, reset, stats };
}
