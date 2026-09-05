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

def corpus():
    seen = set()
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for name in files:
            if not re.search(r"\.(mjs|js|html)$", name):
                continue
            with open(os.path.join(base, name), encoding="utf-8", errors="ignore") as fh:
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
    font = TTFont(cache)
    sub = subset.Subsetter(options=opts)
    sub.populate(text="".join(sorted(chars)))
    sub.subset(font)
    os.makedirs(os.path.dirname(out), exist_ok=True)
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
    # 코퍼스 지문을 같이 남긴다. 소스에 새 글자가 들어오면 이 값이 달라지고 font-gate가 빨간불을 낸다.
    # 지문이 없으면 이름 하나를 추가한 날 그 글자만 다른 서체로 떨어지는 것을 아무도 모른다.
    text = "".join(sorted(chars))
    sig = hashlib.sha256(text.encode("utf-8")).hexdigest()
    meta = os.path.join(ROOT, "web", "assets", "fonts", "pretendard-subset.json")
    with open(meta, "w", encoding="utf-8") as fh:
        json.dump({"chars": len(chars), "sha256": sig}, fh, indent=2)
    print("corpus %s" % sig[:16])

main()
