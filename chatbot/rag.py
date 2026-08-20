"""
[rag.py] FAQ 검색 + Gemini 프롬프트 생성
==========================================
faq.json이 title/text/keywords만 있는 구조(id, cert 필드 없음)로
바뀌어서, 정렬 기준을 id -> title로, 출처 표시를 cert -> title로 바꿨다.
검색 로직 자체는 두두자격지원센터 프로젝트에서 검증된 버전(조사 정규화 +
불용어 제거 + 짧은 단어 오탐 방지)을 그대로 쓴다.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
UNKNOWN = "제공된 FAQ에서 확인할 수 없는 내용입니다."

FAQ = json.loads((ROOT / "faq.json").read_text(encoding="utf-8"))

MIN_SCORE = 2
TOP_K = 3

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


def _normalize(word):
    for suf in sorted(SUFFIXES, key=len, reverse=True):
        if word.endswith(suf) and len(word) > len(suf):
            return word[: -len(suf)]
    return word


def _tokens(text):
    raw = re.findall(r"[가-힣A-Za-z0-9]+", text.lower())
    base = set()
    for w in raw:
        if w in STOPWORDS:
            continue
        base.add(w)
        base.add(_normalize(w))
    return base - STOPWORDS


def _fuzzy_overlap(question_tokens, ref_tokens):
    """완전일치뿐 아니라 '지게차'-'지게차운전기능사'처럼 줄임말/조사가
    붙은 경우도 부분일치로 잡는다."""
    count = 0
    for qt in question_tokens:
        for rt in ref_tokens:
            if qt == rt or (
                len(qt) >= 2 and len(rt) >= 2 and (qt.startswith(rt) or rt.startswith(qt))
            ):
                count += 1
                break
    return count


def _substring_bonus(question_text, keyword_list):
    q_flat = re.sub(r"\s+", "", question_text.lower())
    bonus = 0
    for kw in keyword_list:
        kw = kw.lower()
        if len(kw) >= 2 and kw in q_flat:
            bonus += 2
    return bonus


def retrieve(question, top_k=TOP_K, min_score=MIN_SCORE):
    q = _tokens(question)
    ranked = []
    for row in FAQ:
        keywords = row.get("keywords", [])
        title_kw_tokens = _tokens(row.get("title", "") + " " + " ".join(keywords))
        text_tokens = _tokens(row.get("text", ""))

        score = 2 * _fuzzy_overlap(q, title_kw_tokens) + 1 * _fuzzy_overlap(q, text_tokens - title_kw_tokens)
        score += _substring_bonus(question, keywords + [row.get("title", "")])

        if score:
            ranked.append((score, row))

    # 정렬 기준: id가 없으므로 title로 동점 처리
    ranked.sort(key=lambda item: (-item[0], item[1]["title"]))
    return [(score, row) for score, row in ranked[:top_k] if score >= min_score]


def build_prompt(question, document):
    return f"""당신은 자격증 시험 접수 FAQ 상담원입니다.
아래 근거 안에서만 답하세요. 근거에 없는 내용을 만들지 마세요.
근거로 답할 수 없으면 정확히 UNKNOWN이라고 답하세요.

[질문]
{question}

[근거]
{document['text']}

한국어 두 문장 이내로 답하세요."""


def answer_question(question, generate):
    results = retrieve(question)
    if not results:
        return {"status": "UNKNOWN", "answer": UNKNOWN, "source": "없음", "score": 0}

    best_score, best_doc = results[0]
    generated = generate(build_prompt(question, best_doc)).strip()

    if not generated or generated.upper() == "UNKNOWN":
        return {"status": "UNKNOWN", "answer": UNKNOWN, "source": "없음", "score": best_score}

    # cert 필드가 없으므로 title만으로 출처를 표시한다.
    return {
        "status": "ANSWERED",
        "answer": generated,
        "source": best_doc["title"],
        "score": best_score,
    }