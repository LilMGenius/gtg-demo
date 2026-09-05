# 배포용 BGM을 원본에서 다시 만든다. 원본만 자산이고 출력은 언제든 버려도 된다.
# 모노 32k다. 원본은 좌우 차 RMS가 -23.9dB로 중앙 -14.2dB보다 9.7dB 아래라 스테레오가
# 사실상 없고, 침대 음악은 효과음 아래 -13.8dB로 깔리므로 32k 오퍼스가 남기는 손실이
# 그 밑에 묻힌다. 실측으로 ogg가 4.24MB에서 2.87MB로, 방문자 콜드 로드가 6.71에서 5.34MB로 준다.
# 곡은 12분 12초이고 반복 구간이 없어 잘라서 루프로 만들 수 없다. 1분 창끼리 상관이 최대 0.44다.
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'assets/audio/bgm.mp3'
$out = Join-Path $root 'web/assets/audio'
New-Item -ItemType Directory -Force -Path $out | Out-Null
ffmpeg -hide_banner -loglevel error -y -i $src -vn -ac 1 -ar 48000 -c:a libopus -b:a 32k (Join-Path $out 'bgm.ogg')
ffmpeg -hide_banner -loglevel error -y -i $src -vn -ac 1 -ar 44100 -c:a aac -b:a 32k -movflags +faststart (Join-Path $out 'bgm.m4a')
Get-ChildItem $out | Select-Object Name, Length
