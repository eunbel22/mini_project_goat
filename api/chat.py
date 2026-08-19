"""
두두자격지원센터 - 챗봇 API (Vercel Python 서버리스 함수)
=====================================================

/api/chat 로 POST { "message": "질문" } 를 보내면
{ "answer": "...", "source": "...", "mode": "..." } 를 돌려준다.

검색: 제목/키워드 2배, 본문 1배 가중치 + 어미/조사 정규화(SUFFIXES) +
      불용어 제거(STOPWORDS) + 붙여쓴 합성어 보조매칭(substring_bonus) +
      유의어 확장은 질문에만 적용(SYNONYMS).
생성: 검색된 FAQ 근거를 Gemini에 넘겨 자연스럽게 답하게 하되,
      "근거에 없는 내용은 지어내지 말고 모른다고 답하라"를 프롬프트에 명시.
      GEMINI_API_KEY가 없거나 호출이 실패하면 FAQ 원문을 그대로 반환한다
      (LLM이 막혀도 서비스가 멈추지 않게 하는 안전장치).
"""

import json
import os
import re
import urllib.request
from http.server import BaseHTTPRequestHandler
from pathlib import Path

FAQ_PATH = Path(__file__).with_name("faq.json")

# ---- 빈칸: Gemini API 키 ----
# 절대 코드에 직접 쓰지 않는다. Vercel 대시보드 > Project Settings >
# Environment Variables 에서 GEMINI_API_KEY를 등록하면 여기서 읽어온다.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-3.5-flash-lite"

TOP_K = 3
MIN_SCORE = 2

# ---- 유의어 확장: 질문에서만 적용, FAQ 본문에는 적용하지 않는다 ----
SYNONYMS = {
    "접수비": {"응시료"}, "시험비": {"응시료"}, "돈": {"응시료"},
    "1차": {"필기"}, "이론": {"필기"}, "쓰는거": {"필기"}, "쓰는것": {"필기"},
    "2차": {"실기"}, "실습": {"실기"}, "직접하는거": {"실기"}, "직접하는것": {"실기"},
    "포크레인": {"굴착기운전기능사"},
    "지게차면허": {"지게차운전기능사"},
    "요양사": {"요양보호사"},
    "신청": {"접수"},
}

# 매칭 노이즈를 만드는 흔한 필러/조사/문법 어미 단어
STOPWORDS = {
    "요즘", "게", "저는", "그", "좀", "정말", "너무", "그냥", "이제", "오늘",
    "있으면", "있으세요", "있어요", "돼요", "그렇게", "많이", "이런", "그런",
    "이거", "저거", "거", "때", "같아요", "궁금해요", "궁금한데", "알려주세요",
    "알고싶어요", "확인하고싶어요",
    # "~할 수 있나요" 류 문법 어미 - 내용어가 아니라 거의 모든 질문에 붙어서
    # 그대로 두면 서로 관계없는 FAQ끼리 우연히 겹치는 원인이 된다
    "수", "있나요", "있어", "있", "되나요", "되나", "가능한가요", "가능해요",
    "인가요", "인지", "일까요",
}

# 흔히 붙는 어미/조사를 잘라내서 어간을 비슷하게 맞춰주는 간단 정규화
SUFFIXES = [
    "해줘요", "해주세요", "해줄래", "해줘", "좀줘", "줄래", "하고싶어", "하고싶다",
    "하는데", "한데", "이야", "이에요", "예요", "인데", "인가요", "일까",
    "했어요", "했어", "돼요", "됐어", "가요", "나요", "이나요", "까지",
    "야", "가", "는", "은", "이", "을", "를", "도", "만", "어", "지", "다", "요",
]


def normalize(word: str) -> str:
    for suf in sorted(SUFFIXES, key=len, reverse=True):
        if word.endswith(suf) and len(word) > len(suf):
            return word[: -len(suf)]
    return word


def tokens(text: str) -> set:
    """FAQ 콘텐츠·질문 공통: 원시 토큰 + 정규화된 어간. 유의어 확장은 하지 않는다."""
    raw = re.findall(r"[가-힣A-Za-z0-9]+", text.lower())
    base = set()
    for w in raw:
        if w in STOPWORDS:
            continue
        base.add(w)
        base.add(normalize(w))
    return base - STOPWORDS


def question_tokens(text: str) -> set:
    """사용자 질문 전용: SYNONYMS 확장을 추가로 적용."""
    base = tokens(text)
    for word, extra in SYNONYMS.items():
        if word in text:
            base |= extra
    return base


def substring_bonus(question_text: str, keyword_list: list) -> int:
    """띄어쓰기 없이 붙은 질문(예: '한식조리기능사응시료얼마')을 위한 보조 매칭."""
    q_flat = re.sub(r"\s+", "", question_text.lower())
    bonus = 0
    for kw in keyword_list:
        kw = kw.lower()
        if len(kw) >= 2 and kw in q_flat:
            bonus += 2
    return bonus


def load_faq():
    return json.loads(FAQ_PATH.read_text(encoding="utf-8"))


def search(question: str):
    q = question_tokens(question)
    faqs = load_faq()
    ranked = []
    for faq in faqs:
        keywords = faq.get("keywords", [])
        title_kw_tokens = tokens(faq.get("title", "") + " " + " ".join(keywords))
        text_tokens = tokens(faq.get("text", ""))

        score = 2 * len(q & title_kw_tokens) + 1 * len(q & (text_tokens - title_kw_tokens))
        score += substring_bonus(question, keywords + [faq.get("title", "")])

        if score:
            ranked.append((score, faq))

    ranked.sort(key=lambda x: (-x[0], x[1]["title"]))
    return [x for x in ranked if x[0] >= MIN_SCORE][:TOP_K]


def ask_gemini(question: str, faq_text: str) -> str:
    prompt = (
        "당신은 두두자격지원센터의 문의 챗봇입니다. "
        "아래 '근거' 내용만 사용해서 질문에 친절하고 자연스럽게 답하세요. "
        "근거에 없는 내용은 절대 지어내지 말고, 근거로 답할 수 없으면 "
        "'확인해드리기 어렵습니다'라고 솔직하게 답하세요.\n\n"
        f"근거:\n{faq_text}\n\n질문: {question}"
    )
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=8)
    data = json.loads(resp.read())
    return data["candidates"][0]["content"]["parts"][0]["text"]


def answer(question: str) -> dict:
    hits = search(question)

    if not hits:
        return {
            "answer": (
                "등록된 FAQ에서 확인할 수 없습니다. "
                "정확한 안내를 위해 센터로 전화 문의해 주시거나, "
                "접수 화면에서 신청서를 남겨주시면 확인 후 연락드리겠습니다."
            ),
            "source": None,
            "mode": "규칙",
        }

    faq_text = "\n".join(f"- {faq['title']}: {faq['text']}" for _, faq in hits)
    source = ", ".join(faq["title"] for _, faq in hits)

    if GEMINI_API_KEY:
        try:
            text = ask_gemini(question, faq_text)
            return {"answer": text, "source": source, "mode": "Gemini"}
        except Exception as e:
            # Gemini 호출이 실패해도 서비스가 멈추지 않도록 FAQ 원문으로 대체한다.
            print(f"[Gemini 오류] {e}")

    # GEMINI_API_KEY가 없거나 호출 실패 시: FAQ 원문을 그대로 반환
    top_faq = hits[0][1]
    return {"answer": top_faq["text"], "source": top_faq["title"], "mode": "규칙"}


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            data = json.loads(raw.decode("utf-8"))
            message = (data.get("message") or "").strip()
        except Exception:
            self._send_json(400, {"error": "요청 형식이 올바르지 않습니다."})
            return

        if not message:
            self._send_json(400, {"error": "message가 비어 있습니다."})
            return

        self._send_json(200, answer(message))
