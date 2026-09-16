// 화면의 릴리스 좌표를 한 곳에서 읽고 매니페스트와의 일치는 version 게이트가 잰다.
export const VERSION = '0.7.0';
let identity;

export function buildId() {
  // 404는 브라우저 콘솔 오류라 없는 파일로 dev를 표현할 수 없고, 추적된 자리 표시자는 배포가 덮어쓴다.
  identity ??= fetch(new URL('../build.json', import.meta.url), { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('Build HTTP ' + response.status);
      return response.json();
    })
    .then(data => {
      if (data?.version !== VERSION || !/^[0-9a-f]{40}$/.test(data?.commit)
        || !/^[0-9a-f]{7}$/.test(data?.short) || data.short !== data.commit.slice(0, 7)) {
        throw new Error('Invalid build metadata');
      }
      return VERSION + '+g' + data.short;
    }).catch(() => VERSION + '+dev');
  return identity;
}
