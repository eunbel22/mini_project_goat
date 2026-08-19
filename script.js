// ============================================
// 두두자격지원센터 - 접수 화면 스크립트
// ============================================

// ---- 빈칸 1: Supabase 연결 정보 ----
// Supabase 대시보드 > Settings > API 에서 복사해서 넣으세요.
const SUPABASE_URL = ""; // 예) "https://xxxxxxxx.supabase.co"
const SUPABASE_ANON_KEY = ""; // 예) "eyJhbGciOi..."

// SUPABASE_URL / SUPABASE_ANON_KEY가 채워지면 아래 스크립트 태그를
// index.html <head>에 추가하고 이 파일의 initSupabase()를 사용하세요.
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
let supabaseClient = null;
function initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    if (typeof window.supabase === "undefined") return null;
    if (!supabaseClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

// ---- 자격증별 안내 문구 ----
// 02_안내규정.md 기준. 확인 안 된 정보는 절대 지어내지 않는다.
const CERT_NOTICES = {
    "한식조리기능사": {
        text: "상시 접수 종목입니다. 필기 응시료는 14,500원이며, 자리가 있으면 바로 접수됩니다.",
        tone: "info"
    },
    "요양보호사": {
        text: "상시 접수 종목입니다. 시험일 7일 전까지 접수하시면 됩니다. 응시료는 저희가 아직 확인하지 못했습니다 — 접수 확정 시 다시 안내드리겠습니다.",
        tone: "warn"
    },
    "공인중개사": {
        text: "2026년 1차 접수 기간(8/3~8/7)이 이미 종료되었습니다. 지금 신청서를 내시면 다음 접수 시기를 저희가 확인 후 별도로 연락드립니다.",
        tone: "warn"
    }
};

// ---- 상태 ----
let selectedCert = null;

// ---- DOM 참조 ----
const stepSelect = document.getElementById("step-select");
const stepForm = document.getElementById("step-form");
const stepDone = document.getElementById("step-done");
const certGrid = document.getElementById("certGrid");
const selectedCertLabel = document.getElementById("selectedCertLabel");
const certNotice = document.getElementById("certNotice");
const applyForm = document.getElementById("applyForm");
const submitBtn = document.getElementById("submitBtn");
const submitStatus = document.getElementById("submitStatus");
const doneSummary = document.getElementById("doneSummary");
const fontToggle = document.getElementById("fontToggle");

// ---- 글자 크게 보기 ----
fontToggle.addEventListener("click", () => {
    const isLarge = document.body.classList.toggle("font-large");
    fontToggle.setAttribute("aria-pressed", String(isLarge));
});

// ---- 1단계: 자격증 선택 ----
certGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".cert-card");
    if (!card) return;

    selectedCert = card.dataset.cert;
    selectedCertLabel.textContent = selectedCert;

    const notice = CERT_NOTICES[selectedCert];
    if (notice) {
        certNotice.textContent = notice.text;
        certNotice.classList.add("notice--show");
    } else {
        certNotice.classList.remove("notice--show");
    }

    goToStep("form");
});

document.getElementById("backBtn").addEventListener("click", () => {
    goToStep("select");
});

document.getElementById("restartBtn").addEventListener("click", () => {
    applyForm.reset();
    selectedCert = null;
    goToStep("select");
});

function goToStep(step) {
    stepSelect.classList.toggle("step--hidden", step !== "select");
    stepForm.classList.toggle("step--hidden", step !== "form");
    stepDone.classList.toggle("step--hidden", step !== "done");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---- 2단계: 폼 검증 + 제출 ----

function normalizePhone(raw) {
    // 접수대장.docx 레거시 데이터처럼 하이픈 유무가 섞이는 문제를 막기 위해
    // 여기서 숫자만 남긴 뒤 표준 형식(010-0000-0000)으로 통일한다.
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return raw.trim();
}

function validateForm(name, phone) {
    let valid = true;
    document.getElementById("nameError").textContent = "";
    document.getElementById("phoneError").textContent = "";

    if (!name.trim()) {
        document.getElementById("nameError").textContent = "이름을 입력해 주세요.";
        valid = false;
    }
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
        document.getElementById("phoneError").textContent = "연락처를 숫자로 입력해 주세요. (예: 01012345678)";
        valid = false;
    }
    return valid;
}

applyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitStatus.textContent = "";

    const name = document.getElementById("name").value;
    const phoneRaw = document.getElementById("phone").value;
    const path = document.getElementById("path").value;

    if (!validateForm(name, phoneRaw)) return;

    const phone = normalizePhone(phoneRaw);

    submitBtn.disabled = true;
    submitBtn.textContent = "접수 중...";

    try {
        await submitApplication({
            name: name.trim(),
            phone,
            certificate: selectedCert,
            path
        });

        doneSummary.innerHTML =
            `<strong>${name.trim()}</strong>님, <strong>${selectedCert}</strong> 신청이 접수됐어요.`;
        goToStep("done");
    } catch (err) {
        submitStatus.textContent = "접수 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.";
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "신청서 제출하기";
    }
});

// ---- 빈칸 2: 실제 저장 로직 ----
// Supabase 연결 전에는 콘솔에만 기록하고 통과시킨다(화면 흐름 확인용).
// Supabase 연결 후에는 아래 client.from("applications").insert(...) 부분을 사용한다.
async function submitApplication(data) {
    const client = initSupabase();

    if (!client) {
        console.log("[임시 저장 - Supabase 미연결]", data);
        await new Promise((r) => setTimeout(r, 400)); // 제출감 확인용 지연
        return;
    }

    const { error } = await client.from("applications").insert([
        {
            name: data.name,
            phone: data.phone,
            certificate: data.certificate,
            apply_path: data.path
        }
    ]);

    if (error) throw error;
}