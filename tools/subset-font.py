# 본문 서체를 이 게임이 실제로 쓰는 글자만 남기고 깎는다.
# Pretendard 정본 woff2는 766KB다. 통째로 실으면 첫 화면이 그만큼 늦게 뜨는데,
# 이 게임이 그리는 글자는 소스에 전부 적혀 있어 셀 수 있다.
#
# 글자 집합은 font-gate가 쓰는 것과 같은 코퍼스에서 뽑는다. 두 서체를 같은 자로 재야
# 한쪽만 덮이고 다른 쪽이 빠지는 일이 안 생긴다. 새 이름이 소스에 들어오면 이 스크립트를
# 다시 돌려야 하고, 안 돌리면 font-gate가 그 글자를 빨간불로 낸다.
#
# 필요: python -m pip install fonttools brotli
import hashlib, json, os, re, sys, urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# tools는 코퍼스가 아니다. 굽는 쪽과 재는 쪽이 같은 목록을 봐야 하고, 계기의 주석은
# 화면에 안 뜨므로 실려 나갈 이유가 없다. 근거는 tools/font-gate.mjs의 같은 줄이다.
SKIP = {".git", "node_modules", "vendor", "video.local", "critic.local", "renders", "tools"}
BASE = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff2/Pretendard-%s.woff2"
# 굵기 둘을 싣는다. 하나만 실으면 브라우저가 나머지를 기울이고 늘려 가짜 굵기를 만들고,
# 그 가짜는 진짜 굵은 획보다 지저분하다. HUD의 숫자가 700을 쓰므로 없으면 바로 드러난다.
WEIGHTS = [("Regular", 400), ("Bold", 700)]
# 정본 woff2는 레포에 안 넣는다. 깎은 것만 싣고 원본은 필요할 때 받는다.

# 코퍼스는 git이 추적하는 파일이다. 폴더를 걸으면 무시된 증거 폴더(.omo)의 스크립트까지 세어
# 같은 커밋이 작업 트리마다 다른 지문을 낸다. 실측으로 이 기기와 깨끗한 체크아웃이 c6f541b0과 ca9daa29로 갈렸다.
def corpus():
    import subprocess
    seen = set()
    names = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout.decode("utf-8").split("\0")
    for rel in names:
        parts = rel.split("/")
        if not rel or any(p in SKIP for p in parts[:-1]) or ".local" in rel or not re.search(r"\.(mjs|js|html)$", rel):
            continue
        with open(os.path.join(ROOT, rel), encoding="utf-8", errors="ignore") as fh:
            seen.update(fh.read())
    return seen

def build(name, chars):
    cache = os.path.join(ROOT, "pretendard-%s.local.woff2" % name)
    out = os.path.join(ROOT, "web", "assets", "fonts", "pretendard-%s.subset.woff2" % name.lower())
    if not os.path.exists(cache):
        urllib.request.urlretrieve(BASE % name, cache)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.desubroutinize = True
    opts.layout_features = ["*"]
    # recalcTimestamp=False. 기본값은 저장할 때마다 head.modified를 그 시각으로 다시 쓴다.
    # 글자 집합이 그대로인데 woff2 바이트가 매번 달라져서, 실려 있는 서체를
    # 다시 구워 대조해 보는 길이 없었다. 이 플래그로 세 번 구워 같은 바이트가 나왔다.
    #   regular sha256 7ff569da425e67c2255c2814322ba2278b787759ab46439a412a6dfc54792a6d
    #   bold    sha256 17979c8b4c3bd7a11507f72dc69f22cfaa943b616534801013148fd9b7d1d81c
    # 굽고 나서 git diff가 뜨면 실려 있는 바이트가 이 플래그 없이 구운 것이고,
    # 그때 달라지는 표는 head 하나다. 실측으로 cmap 1114자와 표 14개가 양쪽 같았다.
    font = TTFont(cache, recalcTimestamp=False)
    sub = subset.Subsetter(options=opts)
    sub.populate(text="".join(sorted(chars)))
    sub.subset(font)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    font.flavor = "woff2"
    font.save(out)
    return os.path.getsize(out)

# 제목 서체. 정본 ttf는 979KB이고 font-display:block이라 받는 동안 타이틀 글자가 안 선다.
# 같은 코퍼스로 깎아 woff2로 싣는다. 정본 ttf는 font-gate가 글자 덮임을 재는 원본이라 레포에 남고 화면은 안 받는다.
# OFL 1.1이고 예약 서체 이름이 없어 깎은 판도 같은 이름으로 싣는다.
def build_display(chars):
    src = os.path.join(ROOT, "web", "assets", "fonts", "black-han-sans.ttf")
    out = os.path.join(ROOT, "web", "assets", "fonts", "black-han-sans.subset.woff2")
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    font = TTFont(src, recalcTimestamp=False)
    sub = subset.Subsetter(options=opts)
    sub.populate(text="".join(sorted(chars)))
    sub.subset(font)
    font.flavor = "woff2"
    font.save(out)
    return os.path.getsize(out)

def main():
    chars = corpus()
    # 아스키 인쇄 가능 문자는 전부 넣는다. 숫자와 문장부호는 소스에 없어도 런타임에 조립된다.
    chars.update(chr(c) for c in range(0x20, 0x7f))
    # 줄바꿈과 탭은 글리프가 아니다.
    chars = {c for c in chars if c.isprintable()}
    for name, weight in WEIGHTS:
        size = build(name, chars)
        print("%s(%d)  chars %d  out %d bytes" % (name, weight, len(chars), size))
    print("BlackHanSans  chars %d  out %d bytes" % (len(chars), build_display(chars)))
    # 코퍼스 지문을 같이 남긴다. 소스에 새 글자가 들어오면 이 값이 달라지고 font-gate가 빨간불을 낸다.
    # 지문이 없으면 이름 하나를 추가한 날 그 글자만 다른 서체로 떨어지는 것을 아무도 모른다.
    text = "".join(sorted(chars))
    sig = hashlib.sha256(text.encode("utf-8")).hexdigest()
    meta = os.path.join(ROOT, "web", "assets", "fonts", "pretendard-subset.json")
    with open(meta, "w", encoding="utf-8") as fh:
        json.dump({"chars": len(chars), "sha256": sig}, fh, indent=2)
    print("corpus %s" % sig[:16])

main()
