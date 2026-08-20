// ============================================
// 두두자격지원센터 - 동의어 관리 스크립트
// Supabase 연결 설정은 common.js에 있습니다.
// ============================================

const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const logoutBtn = document.getElementById("logoutBtn");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const loginBtn = document.getElementById("loginBtn");
const synonymList = document.getElementById("synonymList");
const synFormOverlay = document.getElementById("synFormOverlay");
const synForm = document.getElementById("synForm");
const synFormStatus = document.getElementById("synFormStatus");

async function init() {
    const client = initSupabase();
    if (!client) {
        loginStatus.textContent = "Supabase 연결 정보(common.js)가 비어 있어 로그인할 수 없습니다.";
        return;
    }
    const { data } = await client.auth.getSession();
    if (data.session) showDashboard();
    else showLogin();
}

function showLogin() {
    loginView.classList.remove("admin-hidden");
    dashboardView.classList.add("admin-hidden");
    logoutBtn.classList.add("admin-hidden");
}

function showDashboard() {
    loginView.classList.add("admin-hidden");
    dashboardView.classList.remove("admin-hidden");
    logoutBtn.classList.remove("admin-hidden");
    loadSynonyms();
}

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const client = initSupabase();
    if (!client) return;

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    loginBtn.disabled = true;
    loginBtn.textContent = "로그인 중...";
    loginStatus.textContent = "";

    const { error } = await client.auth.signInWithPassword({ email, password });

    loginBtn.disabled = false;
    loginBtn.textContent = "로그인";

    if (error) {
        loginStatus.textContent = "로그인 실패: 이메일 또는 비밀번호를 확인해 주세요.";
        return;
    }
    showDashboard();
});

logoutBtn.addEventListener("click", async () => {
    const client = initSupabase();
    if (client) await client.auth.signOut();
    showLogin();
});

// ---- 목록 조회 ----
async function loadSynonyms() {
    const client = initSupabase();
    synonymList.innerHTML = `<p class="table-empty">불러오는 중...</p>`;

    const { data, error } = await client
        .from("synonyms")
        .select("*")
        .order("informal", { ascending: true });

    if (error) {
        synonymList.innerHTML = `<p class="table-empty">불러오기 실패: ${error.message}</p>`;
        return;
    }

    document.getElementById("resultCount").textContent = `총 ${data.length}건`;

    if (data.length === 0) {
        synonymList.innerHTML = `<p class="table-empty">등록된 동의어가 없습니다.</p>`;
        return;
    }

    synonymList.innerHTML = data.map(synonymCardHtml).join("");
}

function synonymCardHtml(syn) {
    return `
    <div class="faq-card" data-id="${syn.id}">
      <div class="faq-card__body">
        <h3 class="faq-card__title">${escapeHtml(syn.informal)} → ${escapeHtml(syn.formal)}</h3>
      </div>
      <div class="faq-card__actions">
        <button type="button" class="back-btn syn-delete-btn">삭제</button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

synonymList.addEventListener("click", async (e) => {
    const card = e.target.closest(".faq-card");
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.closest(".syn-delete-btn")) {
        if (!confirm("이 동의어를 삭제할까요?")) return;
        const client = initSupabase();
        const { error } = await client.from("synonyms").delete().eq("id", id);
        if (error) {
            alert("삭제 실패: " + error.message);
            return;
        }
        loadSynonyms();
    }
});

// ---- 추가 폼 ----
document.getElementById("newSynonymBtn").addEventListener("click", () => {
    synForm.reset();
    synFormStatus.textContent = "";
    synFormOverlay.classList.remove("admin-hidden");
});
document.getElementById("synCancelBtn").addEventListener("click", () => {
    synFormOverlay.classList.add("admin-hidden");
});
document.getElementById("refreshBtn").addEventListener("click", loadSynonyms);

synForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const client = initSupabase();

    const informal = document.getElementById("synInformal").value.trim();
    const formal = document.getElementById("synFormal").value.trim();

    if (!informal || !formal) {
        synFormStatus.textContent = "두 칸 모두 입력해 주세요.";
        return;
    }

    const saveBtn = document.getElementById("synSaveBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "저장 중...";

    const { error } = await client.from("synonyms").insert([{ informal, formal }]);

    saveBtn.disabled = false;
    saveBtn.textContent = "저장";

    if (error) {
        synFormStatus.textContent = "저장 실패: " + error.message;
        return;
    }

    synFormOverlay.classList.add("admin-hidden");
    loadSynonyms();
});

init();