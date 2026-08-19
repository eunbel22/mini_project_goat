// ============================================
// 두두자격지원센터 - 챗봇 화면 스크립트
// /api/chat (Vercel Python 서버리스 함수)를 호출한다.
// ============================================

const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const chatExamples = document.getElementById("chatExamples");
const fontToggle = document.getElementById("fontToggle");

fontToggle.addEventListener("click", () => {
  const isLarge = document.body.classList.toggle("font-large");
  fontToggle.setAttribute("aria-pressed", String(isLarge));
});

function addBubble(text, who) {
  const div = document.createElement("div");
  div.className = `chat-bubble chat-bubble--${who}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

async function askBot(message) {
  addBubble(message, "user");
  chatExamples.style.display = "none";

  const loadingBubble = addBubble("답변을 찾고 있어요...", "bot");
  loadingBubble.classList.add("chat-bubble--loading");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) throw new Error("서버 응답 오류");
    const data = await res.json();

    loadingBubble.classList.remove("chat-bubble--loading");
    loadingBubble.textContent = data.answer;

    if (data.source) {
      const sourceEl = document.createElement("span");
      sourceEl.className = "chat-bubble__source";
      sourceEl.textContent = `출처: ${data.source}`;
      loadingBubble.appendChild(sourceEl);
    }
  } catch (err) {
    loadingBubble.classList.remove("chat-bubble--loading");
    loadingBubble.textContent = "답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    console.error(err);
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";
  askBot(message);
});

chatExamples.addEventListener("click", (e) => {
  const chip = e.target.closest(".chat-chip");
  if (!chip) return;
  askBot(chip.textContent);
});
