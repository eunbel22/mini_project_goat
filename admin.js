// ============================================
// 두두자격지원센터 - 접수 어드민 스크립트
// Supabase 연결 설정은 common.js에 있습니다.
// ============================================

let allApplications = []; // 서버에서 받아온 전체 목록 (필터는 이 배열을 클라이언트에서 거른다)

const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const logoutBtn = document.getElementById("logoutBtn");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const loginBtn = document.getElementById("loginBtn");

// ---- 초기 진입: 로그인 상태 확인 ----
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
    loadApplications();
}

// ---- 로그인 / 로그아웃 ----
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

// ---- 데이터 로드 ----
async function loadApplications() {
    const client = initSupabase();
    const tbody = document.getElementById("appTableBody");
    tbody.innerHTML = `<tr><td colspan="10" class="table-empty">불러오는 중...</td></tr>`;

    const { data, error } = await client
        .from("applications")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty">불러오기 실패: ${error.message}</td></tr>`;
        return;
    }

    allApplications = data;
    renderStats(allApplications);
    applyFilters();
}

// ---- 요약 카드 ----
function renderStats(rows) {
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = rows.filter(r => r.created_at?.slice(0, 10) === today).length;

    const countBy = (cert) => rows.filter(r => r.qualification === cert).length;

    const stats = [
        { label: "오늘 접수", value: todayCount },
        { label: "전체 접수", value: rows.length },
        { label: "한식조리기능사", value: countBy("한식조리기능사") },
        { label: "공인중개사", value: countBy("공인중개사") },
        { label: "요양보호사", value: countBy("요양보호사") },
    ];

    document.getElementById("statRow").innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-card__label">${s.label}</div>
      <div class="stat-card__value">${s.value.toLocaleString("ko-KR")}</div>
    </div>
  `).join("");
}

// ---- 필터 ----
document.getElementById("applyFilterBtn").addEventListener("click", applyFilters);
document.getElementById("resetFilterBtn").addEventListener("click", () => {
    document.getElementById("filterQualification").value = "";
    document.getElementById("filterStatus").value = "";
    document.getElementById("filterDateFrom").value = "";
    document.getElementById("filterDateTo").value = "";
    document.getElementById("filterKeyword").value = "";
    applyFilters();
});
document.getElementById("refreshBtn").addEventListener("click", loadApplications);

function applyFilters() {
    const qualification = document.getElementById("filterQualification").value;
    const status = document.getElementById("filterStatus").value;
    const dateFrom = document.getElementById("filterDateFrom").value;
    const dateTo = document.getElementById("filterDateTo").value;
    const keyword = document.getElementById("filterKeyword").value.trim();

    let rows = allApplications;

    if (qualification) rows = rows.filter(r => r.qualification === qualification);
    if (status) rows = rows.filter(r => r.application_status === status);
    if (dateFrom) rows = rows.filter(r => r.created_at?.slice(0, 10) >= dateFrom);
    if (dateTo) rows = rows.filter(r => r.created_at?.slice(0, 10) <= dateTo);
    if (keyword) {
        rows = rows.filter(r =>
            r.name?.includes(keyword) || r.phone?.includes(keyword)
        );
    }

    renderTable(rows);
}

// ---- 테이블 렌더링 ----
function renderTable(rows) {
    const tbody = document.getElementById("appTableBody");
    document.getElementById("resultCount").textContent = `총 ${rows.length.toLocaleString("ko-KR")}건`;

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty">조건에 맞는 신청 내역이 없습니다.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.receipt_number ?? "-"}</td>
      <td>${r.qualification}</td>
      <td>${r.name}</td>
      <td>${r.phone}</td>
      <td>${r.exam_date ?? "-"}</td>
      <td>${examLocationLabel(r)}</td>
      <td>${r.final_amount != null ? r.final_amount.toLocaleString("ko-KR") + "원" : "-"}</td>
      <td>${r.payment_method ?? "-"}</td>
      <td><span class="status-badge status-badge--${r.application_status}">${r.application_status}</span></td>
      <td>${formatDateTime(r.created_at)}</td>
    </tr>
  `).join("");
}

function examLocationLabel(r) {
    if (r.qualification === "요양보호사") return r.test_center_code ?? "-";
    const parts = [r.exam_region, r.exam_center].filter(Boolean);
    return parts.length ? parts.join(" / ") : "-";
}

function formatDateTime(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
    });
}

// ---- CSV 내보내기 (현재 필터가 적용된 화면 기준) ----
document.getElementById("exportCsvBtn").addEventListener("click", () => {
    const qualification = document.getElementById("filterQualification").value;
    const status = document.getElementById("filterStatus").value;
    const dateFrom = document.getElementById("filterDateFrom").value;
    const dateTo = document.getElementById("filterDateTo").value;
    const keyword = document.getElementById("filterKeyword").value.trim();

    let rows = allApplications;
    if (qualification) rows = rows.filter(r => r.qualification === qualification);
    if (status) rows = rows.filter(r => r.application_status === status);
    if (dateFrom) rows = rows.filter(r => r.created_at?.slice(0, 10) >= dateFrom);
    if (dateTo) rows = rows.filter(r => r.created_at?.slice(0, 10) <= dateTo);
    if (keyword) rows = rows.filter(r => r.name?.includes(keyword) || r.phone?.includes(keyword));

    if (rows.length === 0) {
        alert("내보낼 데이터가 없습니다.");
        return;
    }

    const headers = ["접수번호", "자격증", "이름", "연락처", "시험일", "지역/센터", "결제금액", "결제수단", "상태", "접수일시"];
    const csvRows = rows.map(r => [
        r.receipt_number, r.qualification, r.name, r.phone, r.exam_date ?? "",
        examLocationLabel(r), r.final_amount ?? "", r.payment_method, r.application_status,
        formatDateTime(r.created_at),
    ]);

    const csvContent = [headers, ...csvRows]
        .map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\r\n");

    // 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `두두자격지원센터_접수내역_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
});

init();