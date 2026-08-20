"""
[app.py] 두두자격지원센터 - Gradio 챗봇 (share=True)
===============================================
demo.launch(share=True) -> 72시간 동안 접속 가능한 공개 URL이 생긴다.

실행하면 터미널에 이런 주소가 뜬다:
  Running on public URL: https://xxxxxxxx.gradio.live

주의: 이 컴퓨터가 켜져 있고 이 스크립트가 실행 중일 때만 작동한다.
72시간이 지나거나 터미널을 닫으면 링크가 끊긴다. (참고: 실제 서비스로
계속 운영하려면 Vercel에 배포된 api/chat.py + chatbot.html 쪽을 쓴다.)
"""
from __future__ import annotations
import os
from pathlib import Path
import gradio as gr
from gemini import GeminiClient
from rag import answer_question


def load_env():
    path = Path(__file__).resolve().parent / ".env"
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        if raw.strip() and not raw.lstrip().startswith("#") and "=" in raw:
            key, value = raw.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


load_env()
client = GeminiClient()


def chat(message, history):
    try:
        result = answer_question(message, client.generate)
        return f"{result['answer']}\n\n출처: {result['source']}"
    except Exception as error:
        return f"[오류] {type(error).__name__}: {error}"


EXAMPLES = [
    "한식조리기능사 응시수수료가 얼마예요",
    "지게차운전기능사 실기는 언제까지 봐야 해요",
    "굴착기 필기시험 과목이 뭐예요",
    "요양보호사 응시자격이 어떻게 되나요",
    "공인중개사 시험과목이 뭐예요",
    "위생사는 어디서 접수해요",
    "손해평가사 1차 2차 차이가 뭐예요",
    "전기기능사 응시수수료가 얼마예요",
    "증명사진 규격이 어떻게 되나요",
]

demo = gr.ChatInterface(
    fn=chat,
    title="자격증 시험 접수 FAQ 챗봇 (실습용)",
    description="8개 자격증(한식조리기능사·지게차운전기능사·굴착기운전기능사·요양보호사·전기기능사·위생사·손해평가사·공인중개사) 시험 접수 관련 문의에 답변합니다.",
    examples=EXAMPLES,
)

if __name__ == "__main__":
    demo.launch(share=True)