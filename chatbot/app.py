"""
두두자격지원센터 - FAQ 챗봇
========================

한식조리기능사 / 공인중개사 / 요양보호사 3종에 대해서만 답한다.
문서(faq.json)에 없는 내용은 절대 지어내지 않고 "모르겠습니다"라고 답한다.

검색 방식: 제목/키워드는 2배, 본문은 1배로 점수를 매기는 차등 가중치 검색.
유의어 확장은 사용자의 질문에만 적용한다 (FAQ 본문은 그대로 둔다 - 원문을
훼손하지 않기 위해). 점수가 MIN_SCORE 미만이면 근거 없이 답하지 않는다.
"""

import json
import re
from pathlib import Path

import gradio as gr

FAQ_PATH = Path(__file__).with_name("faq.json")

# 점수가 이 값 미만이면 "모르겠습니다"로 답한다.
# 너무 낮추면 근거 없이 답하게 되고, 너무 높이면 아는 것도 모른다고 하게 된다.
MIN_SCORE = 2

# 어르신들이 실제로 쓰는 말 -> 문서에 쓰인 말.
# 질문에서만 치환한다. (02_안내규정.md / 01_사업현황_발주서.md 기준)
SYNONYMS = {
    "접수비": "응시료", "시험비": "응시료", "돈": "응시료",
    "1차": "필기", "이론": "필기", "쓰는거": "필기", "쓰는것": "필기",
    "2차": "실기", "실습": "실기", "직접하는거": "실기", "직접하는것": "실기",
    "포크레인": "굴착기운전기능사",
    "지게차면허": "지게차운전기능사",
    "요양사": "요양보호사",
    "신청": "접수",
}


def tokenize(text: str) -> set:
    """한글/영문/숫자 토큰만 뽑아 소문자로 정규화한다."""
    return set(re.findall(r"[가-힣A-Za-z0-9]+", text.lower()))


def expand_query(question: str) -> str:
    """질문에 등장하는 구어체 표현을 문서에 쓰인 말로 보강한다.
    원래 표현은 지우지 않고 옆에 덧붙인다 (둘 다 매칭에 쓰일 수 있게)."""
    expanded = question
    for informal, formal in SYNONYMS.items():
        if informal in question:
            expanded += " " + formal
    return expanded


def load_faq():
    return json.loads(FAQ_PATH.read_text(encoding="utf-8"))


def fuzzy_overlap(question_tokens: set, ref_tokens: set) -> int:
    """완전일치뿐 아니라 조사가 붙은 경우('응시료가'-'응시료')도 부분일치로 잡는다.
    완전한 형태소 분석기는 아니지만, 2글자 이상일 때 한쪽이 다른 쪽의 접두사면
    같은 단어로 본다. (다음 개선 단계는 kiwipiepy 같은 형태소 분석기 도입)"""
    count = 0
    for qt in question_tokens:
        for rt in ref_tokens:
            if qt == rt or (
                len(qt) >= 2 and len(rt) >= 2 and (qt.startswith(rt) or rt.startswith(qt))
            ):
                count += 1
                break
    return count


def score_faq(question_tokens: set, faq: dict) -> int:
    """제목+키워드는 2배, 본문은 1배 가중치로 겹치는 토큰 수를 센다."""
    title_keyword_tokens = tokenize(faq["title"] + " " + " ".join(faq.get("keywords", [])))
    text_tokens = tokenize(faq["text"])

    title_score = fuzzy_overlap(question_tokens, title_keyword_tokens) * 2
    text_score = fuzzy_overlap(question_tokens, text_tokens) * 1
    return title_score + text_score


def retrieve(question: str):
    faqs = load_faq()
    expanded = expand_query(question)
    q_tokens = tokenize(expanded)

    ranked = [(score_faq(q_tokens, faq), faq) for faq in faqs]
    ranked.sort(key=lambda x: (-x[0], x[1]["title"]))
    return ranked[0] if ranked else (0, None)


def chat(message, history):
    score, faq = retrieve(message)

    if not faq or score < MIN_SCORE:
        return (
            "등록된 FAQ에서 확인할 수 없습니다. "
            "정확한 안내를 위해 센터로 전화 문의해 주시거나, "
            "접수 화면에서 신청서를 남겨주시면 확인 후 연락드리겠습니다.\n\n출처: 없음"
        )

    return f"{faq['text']}\n\n출처: {faq['title']}"


demo = gr.ChatInterface(
    fn=chat,
    title="두두자격지원센터 · 문의 챗봇",
    description=(
        "한식조리기능사 · 공인중개사 · 요양보호사 관련 문의에 답해드립니다. "
        "저희가 확인한 내용만 안내하며, 확인되지 않은 내용은 모른다고 말씀드립니다."
    ),
    examples=[
        "한식조리기능사 응시료가 얼마예요",
        "요양보호사 접수비는 얼마인가요",
        "공인중개사 1차 지금 접수되나요",
        "실기시험도 접수해주나요",
        "시험장에 주차 되나요",
    ],
)

if __name__ == "__main__":
    demo.launch()
