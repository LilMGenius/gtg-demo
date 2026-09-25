# 수집기 선택과 연결 준비

상태: DRAFT. 계정·endpoint 미생성, 외부 전송 미실행. 현재 [모듈](../web/src/telemetry.mjs)의 TELEMETRY_ENDPOINT는 빈 문자열이다. 후보 순서는 권장 순서다.

## 후보

| 후보 | 무료 범위와 한계 | 데이터 위치·삭제 | 정확한 endpoint 값 형식 |
| --- | --- | --- | --- |
| Pipedream HTTP/Webhook, 권장 | Free 워크플로와 일일 크레딧 한도가 있고 초과 불가. 활성 워크플로·계정 수도 제한된다. 실제 할당량과 이벤트 보관 기간은 승인 계정 화면에서 기록한다. 장기 원장은 별도 내보내기가 필요 | AWS 미국 us-east-1. 워크플로/이벤트 소스의 사건과 Data Store를 각각 삭제. 계정 삭제 가능, 백업 삭제는 보안 문서의 기간을 따름 | https://<발급된-ID>.m.pipedream.net |
| Webhook.site, 합성 봉투 연결 시험용 | 무료 URL은 요청 상한과 자동 만료가 있어 장기 코호트에 부적합. 공개 URL ID를 아는 사람이 수신 내역도 볼 수 있어 공개 게임의 실제 설치 데이터에는 권장하지 않음 | Hetzner 독일. 요청별 삭제 또는 token 전체 요청 삭제 API, 토큰 삭제. 접근 로그는 요청 본문과 다른 보관 정책 | https://webhook.site/<발급된-UUID> |

<!-- Webhook.site의 무료 요청 상한 100과 만료 7일은 공식 FAQ가 정한 제한이다. -->
Webhook.site 무료는 100요청 이후 수신을 멈추고 URL과 데이터가 7일 후 만료된다. 이는 이벤트 수가 아니라 봉투 요청 수다. Pipedream은 무료의 정확한 할당량을 문서가 계정 화면으로 위임하므로 숫자를 지어내지 않는다. 양쪽 모두 JSON 문자열을 담은 HTTP POST 수신 방식이며, 이번 랩에서 실계정을 만들거나 업체 endpoint로 시험하지 않았다.

공식 근거는 비교 항목 순이다: [Pipedream HTTP trigger](https://pipedream.com/docs/workflows/building-workflows/triggers), [무료 요금제](https://pipedream.com/docs/pricing), [보관 위치·삭제](https://pipedream.com/docs/privacy-and-security), [Webhook.site FAQ](https://docs.webhook.site/), [요청 조회·삭제 API](https://docs.webhook.site/api/requests.html), [독일 호스팅·접근 로그 정책](https://webhook.site/terms). 접속 검증 시각과 응답은 비공개 증거의 research.json에 남긴다.

## 모듈이 보내는 것

navigator.sendBeacon(endpoint, JSON.stringify({ events }))이다. 객체 하나가 봉투이며 events는 배열이다. 문자열을 보내므로 JSON 내용이어도 HTTP Content-Type은 text/plain;charset=UTF-8이다. 인증 헤더를 추가하지 못하므로 인증 없는 수신 전용 HTTPS URL이 필요하다. 대시보드 주소, 관리 API, JSON만 허용하는 제품 분석 API는 그대로 꽂을 수 없다. 브라우저에 공개되는 수신 URL을 관리 비밀키로 취급하지 않는다.

events 배열 안 각 사건의 필드는 schema, event_id, event, install_id, session_id, sequence, occurred_at, local_day, build_id, source, device, mode, data다. 이벤트 이름은 모듈이 소유한다. 봉투에는 이름·연락처·정확한 화면 크기가 없지만 업체는 IP와 HTTP 헤더 같은 전송 메타데이터를 볼 수 있다. “개인정보를 전혀 처리하지 않는다”는 모집 문구를 쓰지 않는다.

## 권장안의 승인 후 실행표

아래 순서는 루프가 실행하고 계정 생성만 파운더가 한다. 외부 수신은 승인 뒤에만 연다.

| 순서 | 실행과 완료 증거 |
| --- | --- |
| 계정 | 파운더가 Free 계정을 만들고 HTTP/Webhook 워크플로 생성 권한과 수신 URL을 비공개 전달. 자동 유료 전환 없이 무료 한도 유지 |
| 수신 | HTTP 트리거에서 인증 없음, 즉시 성공 응답, 원본 본문을 보관하도록 선택. JSON 문자열이 문자열이면 JSON.parse로 읽고 이미 객체면 그대로 읽음. events 배열이 아니면 시험 실패 |
| 내보내기 | Event History에서 각 수신의 steps.trigger.event.body를 원문 봉투로 저장. 같은 날 수신 뒤 바로 비공개 JSON 배열로 내려받아 event_id로 중복 제거; 계정에 보이는 보관 기간과 한도를 보고서에 기록. HTTP 헤더·IP는 분석 파일에 복사하지 않음 |
| 양성 대조 | 실제 게임 모듈의 시험 endpoint 주입으로 첫 플레이→첫 접촉→완주→둘째 세트 봉투 수신을 확인. src와 build_id, 손/봇, event_id가 내보낸 원문과 같은지 대조 |
| 음성 대조 | endpoint가 비어 있는 제품과 opt-out·DNT에서 외부 전송 없음. 양성 대조가 없으면 전송 없음 축을 통과로 쓰지 않음 |
| 삭제 | 합성 시험 사건을 대시보드에서 삭제하고 재조회에 없음을 확인. Data Store를 사용했다면 거기도 삭제. 분석 종료 후 코호트 원문도 삭제하고 완료 시각 기록 |
| 연결 | 별도 승인된 작업에서 TELEMETRY_ENDPOINT에 발급된 HTTPS 수신 URL 문자열만 넣고 배포. 인증 토큰이나 관리 키는 넣지 않음. 이번 패키지는 endpoint를 바꾸지 않음 |
| 게시 전 | 공개 배포에서 시험 사건이 수신·내보내기 되는지 다시 확인하고 내부 QA를 코호트에서 제외. 실패·한도 소진 때 모집을 확대하지 않고 결측 기록 |

수신 성공은 sendBeacon의 true가 아니라 업체 내보내기에 같은 event_id가 있는 것이다. 이번 준비 검증은 로컬 HTTP 수신기를 양성 대조로 사용하며 업체 계정 승인 후 검증을 대체하지 않는다.

참여자 안내 문안: “플레이 흐름을 보기 위해 무작위 설치 식별자, 빌드, 유입 채널, 이벤트 시각과 손/봇 구분을 기록합니다. 수집 업체가 전송 메타데이터를 처리할 수 있습니다. 참여와 중단은 자유이며 다음 날 플레이 요청은 하지 않습니다.” 실제 관찰 전에 읽으며 임의의 보관 기간을 약속하지 않는다.
