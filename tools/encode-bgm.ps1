# 배포용 BGM을 원본에서 다시 만든다. 원본만 자산이고 출력은 언제든 버려도 된다.
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'assets/audio/bgm.mp3'
$out = Join-Path $root 'web/assets/audio'
New-Item -ItemType Directory -Force -Path $out | Out-Null
ffmpeg -hide_banner -loglevel error -y -i $src -vn -ac 2 -ar 48000 -c:a libopus -b:a 48k (Join-Path $out 'bgm.ogg')
ffmpeg -hide_banner -loglevel error -y -i $src -vn -ac 2 -ar 44100 -c:a aac -b:a 48k -movflags +faststart (Join-Path $out 'bgm.m4a')
Get-ChildItem $out | Select-Object Name, Length
