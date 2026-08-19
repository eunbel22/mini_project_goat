// ============================================
// 두두자격지원센터 - FAQ 어드민 스크립트
// Supabase 연결 설정은 common.js에 있습니다.
// ============================================

const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const logoutBtn = document.getElementById("logoutBtn");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const loginBtn = document.getElementById("loginBtn");
const faqList = document.getElementById("faqList");
const faqFormOverlay = document.getElementById("faqFormOverlay");
const faqForm = document.getElementById("faqForm");
const faqFormTitle = document.getElementById("faqFormTitle");
const faqFormStatus = document.getElementById("faqFormStatus");

// ---- 초기 진입: 로그인 상태 확인 (admin.html과 세션 공유) ----
async function init() {
    const client = initSupabase();
    if (!client) {
        loginStatus.textContent = "Supabase 연결 정보(common.js)가 비어 있어 로그인할 수 없습니다.";
        return;
    }
    const { data } = await client.auth.getSession();
    if (data.session) {
        showDashboard();
    } else {
        showLogin();
    }
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
    loadFaqList();
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
async function loadFaqList() {
    const client = initSupabase();
    faqList.innerHTML = `<p class="table-empty">불러오는 중...</p>`;

    const { data, error } = await client
        .from("faq_items")
        .select("*")
        .order("slug", { ascending: true });

    if (error) {
        faqList.innerHTML = `<p class="table-empty">불러오기 실패: ${error.message}</p>`;
        return;
    }

    document.getElementById("resultCount").textContent = `총 ${data.length}건`;

    if (data.length === 0) {
        faqList.innerHTML = `<p class="table-empty">등록된 FAQ가 없습니다.</p>`;
        return;
    }

    faqList.innerHTML = data.map(faqCardHtml).join("");
}

function faqCardHtml(faq) {
    const keywords = (faq.keywords || []).join(", ");
    return `
    <div class="faq-card" data-slug="${escapeHtml(faq.slug)}">
      <div class="faq-card__body">
        <h3 class="faq-card__title">${escapeHtml(faq.title)}</h3>
        <p class="faq-card__text">${escapeHtml(faq.text)}</p>
        ${keywords ? `<p class="faq-card__keywords">키워드: ${escapeHtml(keywords)}</p>` : ""}
      </div>
      <div class="faq-card__actions">
        <button type="button" class="back-btn faq-edit-btn">수정</button>
        <button type="button" class="back-btn faq-delete-btn">삭제</button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

// ---- 목록 클릭 위임: 수정/삭제 ----
faqList.addEventListener("click", async (e) => {
    const card = e.target.closest(".faq-card");
    if (!card) return;
    const slug = card.dataset.slug;

    if (e.target.closest(".faq-edit-btn")) {
        openEditForm(slug);
    }
    if (e.target.closest(".faq-delete-btn")) {
        if (!confirm("이 FAQ를 삭제할까요? 삭제하면 챗봇이 더 이상 이 질문에 답하지 못합니다.")) return;
        await deleteFaq(slug);
    }
});

async function deleteFaq(slug) {
    const client = initSupabase();
    const { error } = await client.from("faq_items").delete().eq("slug", slug);
    if (error) {
        alert("삭제 실패: " + error.message);
        return;
    }
    loadFaqList();
}

// ---- 추가/수정 폼 ----
document.getElementById("newFaqBtn").addEventListener("click", () => openNewForm());
document.getElementById("faqCancelBtn").addEventListener("click", closeForm);
document.getElementById("refreshBtn").addEventListener("click", loadFaqList);

function openNewForm() {
    faqFormTitle.textContent = "FAQ 추가";
    faqForm.reset();
    document.getElementById("faqSlug").value = "";
    faqFormStatus.textContent = "";
    faqFormOverlay.classList.remove("admin-hidden");
}

async function openEditForm(slug) {
    const client = initSupabase();
    const { data, error } = await client.from("faq_items").select("*").eq("slug", slug).single();
    if (error || !data) {
        alert("불러오기 실패");
        return;
    }
    faqFormTitle.textContent = "FAQ 수정";
    document.getElementById("faqSlug").value = data.slug;
    document.getElementById("faqTitle").value = data.title;
    document.getElementById("faqText").value = data.text;
    document.getElementById("faqKeywords").value = (data.keywords || []).join(", ");
    faqFormStatus.textContent = "";
    faqFormOverlay.classList.remove("admin-hidden");
}

function closeForm() {
    faqFormOverlay.classList.add("admin-hidden");
}

function slugify(title) {
    // 새 FAQ의 slug를 제목 기반으로 자동 생성 (직원이 직접 신경 안 써도 되게)
    const base = title.trim().replace(/\s+/g, "-").toLowerCase();
    const suffix = Date.now().toString(36).slice(-4);
    return `custom-${base.slice(0, 20)}-${suffix}`;
}

faqForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const client = initSupabase();

    const existingSlug = document.getElementById("faqSlug").value;
    const title = document.getElementById("faqTitle").value.trim();
    const text = document.getElementById("faqText").value.trim();
    const keywords = document.getElementById("faqKeywords").value
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

    if (!title || !text) {
        faqFormStatus.textContent = "제목과 답변 내용을 입력해 주세요.";
        return;
    }

    const saveBtn = document.getElementById("faqSaveBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "저장 중...";

    let error;
    if (existingSlug) {
        ({ error } = await client
            .from("faq_items")
            .update({ title, text, keywords })
            .eq("slug", existingSlug));
    } else {
        const slug = slugify(title);
        ({ error } = await client.from("faq_items").insert([{ slug, title, text, keywords }]));
    }

    saveBtn.disabled = false;
    saveBtn.textContent = "저장";

    if (error) {
        faqFormStatus.textContent = "저장 실패: " + error.message;
        return;
    }

    closeForm();
    loadFaqList();
});

init();