"""
[gemini.py] Gemini API 클라이언트
==================================
두두자격지원센터 로컬 Gradio 챗봇용. D23 실습 코드와 같은 구조.
"""
from __future__ import annotations
import json
import os
import urllib.request


def _default_transport(url, payload, headers, timeout):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


class GeminiClient:
    def __init__(self, api_key=None, model=None, transport=None):
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")
        # 예전 버전(gemini-2.5-flash-lite)이 아니라 최신 버전을 기본값으로 쓴다.
        self.model = model or os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
        self.transport = transport or _default_transport

    def generate(self, prompt):
        if not self.api_key:
            raise RuntimeError("GOOGLE_API_KEY(또는 GEMINI_API_KEY)가 없습니다. .env 파일에 키를 넣어주세요.")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        headers = {"Content-Type": "application/json", "x-goog-api-key": self.api_key}
        data = self.transport(url, payload, headers, 30)

        try:
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except (KeyError, IndexError, TypeError) as error:
            raise RuntimeError("Gemini 응답에서 답변 텍스트를 찾지 못했습니다.") from error