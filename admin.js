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
        { label: "📞 간편신청 (전화확인필요)", value: rows.filter(r => r.application_mode === "simple").length, highlight: true },
        { label: "한식조리기능사", value: countBy("한식조리기능사") },
        { label: "공인중개사", value: countBy("공인중개사") },
        { label: "요양보호사", value: countBy("요양보호사") },
        { label: "지게차운전기능사", value: countBy("지게차운전기능사") },
        { label: "굴착기운전기능사", value: countBy("굴착기운전기능사") },
        { label: "손해평가사", value: countBy("손해평가사") },
    ];

    document.getElementById("statRow").innerHTML = stats.map(s => `
    <div class="stat-card${s.highlight ? " stat-card--highlight" : ""}">
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
    document.getElementById("filterMode").value = "";
    document.getElementById("filterDateFrom").value = "";
    document.getElementById("filterDateTo").value = "";
    document.getElementById("filterKeyword").value = "";
    applyFilters();
});
document.getElementById("refreshBtn").addEventListener("click", loadApplications);

function applyFilters() {
    const qualification = document.getElementById("filterQualification").value;
    const status = document.getElementById("filterStatus").value;
    const mode = document.getElementById("filterMode").value;
    const dateFrom = document.getElementById("filterDateFrom").value;
    const dateTo = document.getElementById("filterDateTo").value;
    const keyword = document.getElementById("filterKeyword").value.trim();

    let rows = allApplications;

    if (qualification) rows = rows.filter(r => r.qualification === qualification);
    if (status) rows = rows.filter(r => r.application_status === status);
    if (mode) rows = rows.filter(r => r.application_mode === mode);
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
function escapeAttr(str) {
    return String(str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderTable(rows) {
    const tbody = document.getElementById("appTableBody");
    document.getElementById("resultCount").textContent = `총 ${rows.length.toLocaleString("ko-KR")}건`;

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="table-empty">조건에 맞는 신청 내역이 없습니다.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.receipt_number ?? "-"}</td>
      <td>${r.qualification}</td>
      <td class="name-cell" title="${escapeAttr(r.name)}"><span class="name-cell__text">${r.name}</span>${r.application_mode === "simple" ? ' <span class="mode-badge">📞 전화확인필요</span>' : ""}</td>
      <td>${r.phone}</td>
      <td>${r.exam_date ?? "-"}</td>
      <td>${examLocationLabel(r)}</td>
      <td>${r.final_amount != null ? r.final_amount.toLocaleString("ko-KR") + "원" : "-"}</td>
      <td>${r.payment_method ?? "-"}</td>
      <td><span class="status-badge status-badge--${r.application_status}">${r.application_status}</span></td>
      <td>${formatDateTime(r.created_at)}</td>
      <td><button type="button" class="back-btn edit-row-btn" data-id="${r.id}">✏️ 수정</button></td>
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

// ============================================
// 수정 폼 (간편신청 완료 처리 + 일반 신청 정정)
// ============================================

const REGIONS_17 = [
    "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기",
    "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];
const HEALTH_CENTERS = [
    { code: "C01", name: "서울센터" }, { code: "C02", name: "부산센터" },
    { code: "C03", name: "대구센터" }, { code: "C04", name: "광주센터" },
    { code: "C05", name: "대전센터" }, { code: "C06", name: "수원센터" },
    { code: "C07", name: "청주센터" }, { code: "C08", name: "전주센터" },
    { code: "C09", name: "제주센터" },
];
const NATIONAL_SESSIONS = ["09:00", "10:30", "13:00", "14:30", "16:00"];

const editFormOverlay = document.getElementById("editFormOverlay");
const editForm = document.getElementById("editForm");
const editFormStatus = document.getElementById("editFormStatus");
const editCertFields = document.getElementById("editCertFields");

document.getElementById("appTableBody").addEventListener("click", (e) => {
    const btn = e.target.closest(".edit-row-btn");
    if (!btn) return;
    const row = allApplications.find(r => String(r.id) === btn.dataset.id);
    if (row) openEditForm(row);
});

function buildEditCertFields(cert, existing) {
    editCertFields.innerHTML = "";
    const ex = existing || {};

    const CBT_CERTS = ["한식조리기능사", "지게차운전기능사", "굴착기운전기능사"];
    if (CBT_CERTS.includes(cert)) {
        editCertFields.innerHTML = `
      <div class="field"><label>시험지역</label>
        <select id="editExamRegion">
          <option value="">선택 안 함</option>
          ${REGIONS_17.map(r => `<option value="${r}" ${ex.exam_region === r ? "selected" : ""}>${r}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>희망 시간대</label>
        <select id="editExamSession">
          <option value="">선택 안 함</option>
          ${NATIONAL_SESSIONS.map(s => `<option value="${s}" ${ex.exam_session === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>희망 시험일</label>
        <input type="date" id="editExamDate" value="${ex.exam_date ?? ""}">
      </div>
    `;
    } else if (cert === "요양보호사") {
        editCertFields.innerHTML = `
      <div class="field"><label>교육기관명</label>
        <input type="text" id="editTrainingInstitution" value="${escapeAttr(ex.training_institution)}"></div>
      <div class="field"><label>교육수료번호</label>
        <input type="text" id="editTrainingCertNumber" value="${escapeAttr(ex.training_cert_number)}"></div>
      <div class="field"><label>교육수료일</label>
        <input type="date" id="editTrainingCompletionDate" value="${ex.training_completion_date ?? ""}"></div>
      <div class="field"><label>시험센터</label>
        <select id="editTestCenterCode">
          <option value="">선택 안 함</option>
          ${HEALTH_CENTERS.map(c => `<option value="${c.code}" ${ex.test_center_code === c.code ? "selected" : ""}>${c.name}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>시간대</label>
        <select id="editTestTimeSlot">
          <option value="">선택 안 함</option>
          <option value="AM" ${ex.test_time_slot === "AM" ? "selected" : ""}>오전</option>
          <option value="PM" ${ex.test_time_slot === "PM" ? "selected" : ""}>오후</option>
        </select>
      </div>
      <div class="field"><label>희망 시험일</label>
        <input type="date" id="editExamDate" value="${ex.exam_date ?? ""}"></div>
    `;
    } else if (cert === "공인중개사" || cert === "손해평가사") {
        editCertFields.innerHTML = `
      <div class="field"><label>응시 차수</label>
        <select id="editExamStage">
          <option value="">선택 안 함</option>
          <option value="1차" ${ex.exam_stage === "1차" ? "selected" : ""}>1차</option>
          <option value="2차" ${ex.exam_stage === "2차" ? "selected" : ""}>2차</option>
        </select>
      </div>
      <div class="field"><label>시험지역</label>
        <select id="editExamRegion">
          <option value="">선택 안 함</option>
          ${REGIONS_17.map(r => `<option value="${r}" ${ex.exam_region === r ? "selected" : ""}>${r}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>희망 시험장</label>
        <input type="text" id="editExamCenter" value="${escapeAttr(ex.exam_center)}"></div>
    `;
    } else {
        editCertFields.innerHTML = `<p class="field-hint">이 자격증은 접수가 준비 중이라 시험 정보 입력란이 없습니다.</p>`;
    }
}

function openEditForm(row) {
    document.getElementById("editId").value = row.id;
    document.getElementById("editName").value = row.name ?? "";
    document.getElementById("editBirthDate").value = row.birth_date ?? "";
    document.getElementById("editPhone").value = row.phone ?? "";
    document.getElementById("editDiscountType").value = row.discount_type ?? "없음";
    document.getElementById("editPaymentMethod").value = row.payment_method ?? "신용카드";

    const genderRadio = document.querySelector(`input[name="editGender"][value="${row.gender}"]`);
    if (genderRadio) genderRadio.checked = true;
    else document.querySelectorAll('input[name="editGender"]').forEach(r => r.checked = false);

    document.getElementById("editModeNotice").textContent =
        row.application_mode === "simple"
            ? "📞 간편신청 건입니다. 전화로 확인한 내용을 입력하고 저장하면 '완료 처리'되며 수수료가 자동 계산됩니다."
            : `자격증: ${row.qualification}`;

    buildEditCertFields(row.qualification, row);
    editFormStatus.textContent = "";
    editFormOverlay.classList.remove("admin-hidden");
}

document.getElementById("editCancelBtn").addEventListener("click", () => {
    editFormOverlay.classList.add("admin-hidden");
});

editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const client = initSupabase();
    if (!client) return;

    const id = document.getElementById("editId").value;
    const row = allApplications.find(r => String(r.id) === id);
    if (!row) return;

    const genderChecked = document.querySelector('input[name="editGender"]:checked');
    const g = (fieldId) => document.getElementById(fieldId)?.value || null;

    const payload = {
        name: document.getElementById("editName").value.trim(),
        birth_date: document.getElementById("editBirthDate").value || null,
        gender: genderChecked ? genderChecked.value : null,
        phone: document.getElementById("editPhone").value.trim(),
        discount_type: document.getElementById("editDiscountType").value,
        payment_method: document.getElementById("editPaymentMethod").value,
        exam_region: g("editExamRegion"),
        exam_session: g("editExamSession"),
        exam_date: g("editExamDate"),
        exam_stage: g("editExamStage"),
        exam_center: g("editExamCenter"),
        training_institution: g("editTrainingInstitution"),
        training_cert_number: g("editTrainingCertNumber"),
        training_completion_date: g("editTrainingCompletionDate"),
        test_center_code: g("editTestCenterCode"),
        test_time_slot: g("editTestTimeSlot"),
        // 간편신청이었더라도, 어드민이 정보를 채워 저장하면 'full'로 완료 처리한다.
        // (수수료는 서버 트리거가 이 시점에 다시 계산한다 - 클라이언트 값 불신 원칙 유지)
        application_mode: "full",
    };

    const saveBtn = document.getElementById("editSaveBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "저장 중...";

    const { error } = await client.from("applications").update(payload).eq("id", id);

    saveBtn.disabled = false;
    saveBtn.textContent = "저장 (완료 처리)";

    if (error) {
        editFormStatus.textContent = "저장 실패: " + error.message;
        return;
    }

    editFormOverlay.classList.add("admin-hidden");
    loadApplications();
});

init();