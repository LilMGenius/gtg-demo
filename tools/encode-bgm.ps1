# 배포용 BGM을 원본에서 다시 만든다. 원본만 자산이고 출력은 언제든 버려도 된다.
# 모노 32k다. 원본은 좌우 차 RMS가 -23.9dB로 중앙 -14.2dB보다 9.7dB 아래라 스테레오가
# 사실상 없고, 침대 음악은 효과음 아래 -13.8dB로 깔리므로 32k 오퍼스가 남기는 손실이
# 그 밑에 묻힌다. 실측으로 ogg가 4.24MB에서 2.87MB로, 방문자 콜드 로드가 6.71에서 5.34MB로 준다.
# 곡은 12분 12초이고 반복 구간이 없어 잘라서 루프로 만들 수 없다. 1분 창끼리 상관이 최대 0.44다.
# 다운믹스는 pan으로 명시한다. -ac 1만 주면 좌우를 0.5가 아니라 더 큰 계수로 더해 파일이
# 원본보다 2.9dB 커지고, 베드가 그만큼 올라와 가장 작은 효과음과의 3dB 여유가 0.4dB로 줄었다.
# 실측으로 원본 -13.8dB, -ac 1 결과 -11.3dB, pan 0.5+0.5 결과 -14.2dB다.
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'assets/audio/bgm.mp3'
$out = Join-Path $root 'web/assets/audio'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$mono = 'pan=mono|c0=0.5*c0+0.5*c1'
ffmpeg -hide_banner -loglevel error -y -i $src -vn -af $mono -ar 48000 -c:a libopus -b:a 32k (Join-Path $out 'bgm.ogg')
ffmpeg -hide_banner -loglevel error -y -i $src -vn -af $mono -ar 44100 -c:a aac -b:a 32k -movflags +faststart (Join-Path $out 'bgm.m4a')
Get-ChildItem $out | Select-Object Name, Length
