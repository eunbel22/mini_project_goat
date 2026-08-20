"""
두두자격지원센터 - 챗봇 API (Vercel Python 서버리스 함수, TF-IDF 버전)
================================================================

4,705건 규모에서 기존 방식(매 요청마다 전체 스캔 + 단어 겹침 세기)이
1초 이상 걸리고 정확도도 떨어져서, 순수 파이썬 TF-IDF + 역색인으로 교체했다.
외부 라이브러리(scikit-learn 등)는 안 쓴다 - Vercel 서버리스 함수는
콜드 스타트 시 패키지를 매번 새로 불러와야 해서, 무거운 라이브러리는
그 자체로 응답 지연의 원인이 된다.

성능 전략
  1. 역색인(inverted index): 질문에 나온 단어를 포함한 문서만 후보로
     좁힌다. 4,705건 전체를 매번 순회하지 않는다.
  2. 웜 인스턴스 캐시: Vercel 함수 인스턴스가 살아있는 동안(연속 요청)은
     인덱스를 다시 만들지 않고 재사용한다. 5분 지나면 다시 만든다
     (FAQ 어드민에서 수정한 내용이 결국은 반영되게).
"""

import json
import math
import os
import re
import time
import urllib.request
from collections import defaultdict
from http.server import BaseHTTPRequestHandler
from pathlib import Path

FAQ_PATH = Path(__file__).with_name("faq.json")  # Supabase 연결 실패 시 폴백

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-3.5-flash-lite"

MIN_SCORE = 0.05  # 코사인 유사도 임계값 (TF-IDF는 0~1 사이 값이라 기준이 다름)
TOP_K = 3
CACHE_TTL_SECONDS = 300  # 5분

SYNONYMS = {
    "접수비": {"응시료"}, "시험비": {"응시료"}, "돈": {"응시료"},
    "1차": {"필기"}, "이론": {"필기"}, "쓰는거": {"필기"}, "쓰는것": {"필기"},
    "2차": {"실기"}, "실습": {"실기"}, "직접하는거": {"실기"}, "직접하는것": {"실기"},
    "포크레인": {"굴착기운전기능사"},
    "지게차면허": {"지게차운전기능사"},
    "요양사": {"요양보호사"},
    "신청": {"접수"},
}

STOPWORDS = {
    "요즘", "게", "저는", "그", "좀", "정말", "너무", "그냥", "이제", "오늘",
    "있으면", "있으세요", "있어요", "돼요", "그렇게", "많이", "이런", "그런",
    "이거", "저거", "거", "때", "같아요", "궁금해요", "궁금한데", "알려주세요",
    "알고싶어요", "확인하고싶어요",
    "수", "있나요", "있어", "있", "되나요", "되나", "가능한가요", "가능해요",
    "인가요", "인지", "일까요",
}

SUFFIXES = [
    "해줘요", "해주세요", "해줄래", "해줘", "좀줘", "줄래", "하고싶어", "하고싶다",
    "하는데", "한데", "이야", "이에요", "예요", "인데", "인가요", "일까",
    "했어요", "했어", "돼요", "됐어", "가요", "나요", "이나요", "까지",
    "야", "가", "는", "은", "이", "을", "를", "도", "만", "어", "지", "다", "요",
]


def _normalize(word: str) -> str:
    for suf in sorted(SUFFIXES, key=len, reverse=True):
        if word.endswith(suf) and len(word) > len(suf):
            return word[: -len(suf)]
    return word


def tokenize_counts(text: str) -> dict:
    """TF-IDF용: 단어별 등장 횟수를 센다 (집합이 아니라 빈도가 필요하다)."""
    raw = re.findall(r"[가-힣A-Za-z0-9]+", text.lower())
    counts = defaultdict(int)
    for w in raw:
        if w in STOPWORDS:
            continue
        counts[_normalize(w)] += 1
    return dict(counts)


def expand_query(question: str) -> str:
    expanded = question
    for informal, formal in SYNONYMS.items():
        if informal in question:
            expanded += " " + " ".join(formal)
    return expanded


# ------------------------------------------------------------------
# TF-IDF 인덱스 (순수 파이썬, 외부 라이브러리 없음)
# ------------------------------------------------------------------

class TfidfIndex:
    def __init__(self, faqs: list):
        self.faqs = faqs
        n = len(faqs)

        doc_term_counts = []  # 문서별 단어 빈도
        df = defaultdict(int)  # 단어별 등장 문서 수

        for faq in faqs:
            combined = faq["title"] + " " + " ".join(faq.get("keywords", [])) + " " + faq["text"]
            counts = tokenize_counts(combined)
            doc_term_counts.append(counts)
            for term in counts:
                df[term] += 1

        self.idf = {
            term: math.log(n / (1 + count)) + 1
            for term, count in df.items()
        }

        # 문서 벡터(단어 -> tf-idf값)와 크기(L2 norm)를 미리 계산해둔다.
        self.doc_vectors = []
        self.doc_norms = []
        self.inverted = defaultdict(list)  # 단어 -> 그 단어를 포함한 문서 인덱스 목록

        for doc_id, counts in enumerate(doc_term_counts):
            vec = {term: tf * self.idf[term] for term, tf in counts.items()}
            norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
            self.doc_vectors.append(vec)
            self.doc_norms.append(norm)
            for term in counts:
                self.inverted[term].append(doc_id)

    def search(self, question: str, top_k: int = TOP_K, min_score: float = MIN_SCORE):
        q_counts = tokenize_counts(expand_query(question))
        if not q_counts:
            return []

        q_vec = {term: tf * self.idf.get(term, 0) for term, tf in q_counts.items()}
        q_norm = math.sqrt(sum(v * v for v in q_vec.values())) or 1.0

        # 역색인으로 질문 단어를 포함한 문서만 후보로 좁힌다 (전체 스캔 안 함).
        candidate_ids = set()
        for term in q_counts:
            candidate_ids.update(self.inverted.get(term, []))

        scored = []
        for doc_id in candidate_ids:
            doc_vec = self.doc_vectors[doc_id]
            dot = sum(q_vec.get(t, 0) * v for t, v in doc_vec.items())
            cosine = dot / (q_norm * self.doc_norms[doc_id])
            if cosine > 0:
                scored.append((cosine, self.faqs[doc_id]))

        scored.sort(key=lambda x: (-x[0], x[1]["title"]))
        return [(score, faq) for score, faq in scored[:top_k] if score >= min_score]


# ------------------------------------------------------------------
# 웜 인스턴스 캐시: 인덱스를 요청마다 새로 만들지 않는다.
# ------------------------------------------------------------------

_cache = {"index": None, "built_at": 0}


def load_faq_rows():
    if SUPABASE_URL and SUPABASE_ANON_KEY:
        try:
            url = f"{SUPABASE_URL}/rest/v1/faq_items?select=title,text,keywords"
            req = urllib.request.Request(
                url,
                headers={
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                },
            )
            resp = urllib.request.urlopen(req, timeout=8)
            return json.loads(resp.read())
        except Exception as e:
            print(f"[FAQ 조회 오류 - 로컬 백업으로 대체] {e}")

    return json.loads(FAQ_PATH.read_text(encoding="utf-8"))


def get_index() -> TfidfIndex:
    now = time.time()
    if _cache["index"] is None or (now - _cache["built_at"]) > CACHE_TTL_SECONDS:
        rows = load_faq_rows()
        _cache["index"] = TfidfIndex(rows)
        _cache["built_at"] = now
    return _cache["index"]


# ------------------------------------------------------------------
# Gemini 호출
# ------------------------------------------------------------------

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
    resp = urllib.request.urlopen(req, timeout=7)
    data = json.loads(resp.read())
    return data["candidates"][0]["content"]["parts"][0]["text"]


def answer(question: str) -> dict:
    index = get_index()
    hits = index.search(question)

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
            print(f"[Gemini 오류] {e}")

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