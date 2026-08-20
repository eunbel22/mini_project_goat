// ============================================
// 두두자격지원센터 - 간편신청 전용 스크립트
// 자격증명 + 이름 + 전화번호만 받는다.
// ============================================

let selectedCert = null;

const stepSelect = document.getElementById("step-select");
const stepForm = document.getElementById("step-form");
const stepDone = document.getElementById("step-done");
const certGrid = document.getElementById("certGrid");
const selectedCertLabel = document.getElementById("selectedCertLabel");
const simpleForm = document.getElementById("simpleForm");
const submitBtn = document.getElementById("submitBtn");
const submitStatus = document.getElementById("submitStatus");
const doneSummary = document.getElementById("doneSummary");
const fontToggle = document.getElementById("fontToggle");

function goToStep(step) {
    stepSelect.classList.toggle("step--hidden", step !== "select");
    stepForm.classList.toggle("step--hidden", step !== "form");
    stepDone.classList.toggle("step--hidden", step !== "done");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

const val = (id) => document.getElementById(id)?.value?.trim();

// ---- 연락처: 010 프리필 + 자동 하이픈 (apply.html의 script.js와 동일 로직) ----
const phoneInput = document.getElementById("phone");
phoneInput.value = "010-";
phoneInput.addEventListener("input", () => {
    const digits = phoneInput.value.replace(/\D/g, "").slice(0, 11);
    let formatted = digits;
    if (digits.length > 7) {
        formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    } else if (digits.length > 3) {
        formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
    }
    phoneInput.value = formatted;
});

function normalizePhone(raw) {
    const digits = (raw || "").replace(/\D/g, "");
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return raw.trim();
}

// ---- 자격증 카드 선택 ----
certGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".cert-card");
    if (!card) return;

    selectedCert = card.dataset.cert;
    selectedCertLabel.textContent = selectedCert;
    goToStep("form");
});

document.getElementById("backBtn").addEventListener("click", () => goToStep("select"));

document.getElementById("restartBtn").addEventListener("click", () => {
    simpleForm.reset();
    phoneInput.value = "010-";
    selectedCert = null;
    goToStep("select");
});

fontToggle.addEventListener("click", () => {
    const isLarge = document.body.classList.toggle("font-large");
    fontToggle.setAttribute("aria-pressed", String(isLarge));
});

// ---- 검증 ----
function validateForm() {
    let valid = true;
    const setError = (id, msg) => {
        const el = document.getElementById(id);
        if (el) el.textContent = msg;
        if (msg) valid = false;
    };

    const nameVal = (val("name") || "").trim();
    const namePattern = /^[가-힣a-zA-Z\s]{1,30}$/;
    setError(
        "nameError",
        !nameVal ? "이름을 입력해 주세요."
            : !namePattern.test(nameVal) ? "이름은 한글 또는 영문으로 30자 이내로 입력해 주세요."
                : ""
    );

    const phoneDigits = (val("phone") || "").replace(/\D/g, "");
    const phonePattern = /^01[0-9]{8,9}$/;
    setError("phoneError", phonePattern.test(phoneDigits) ? "" : "올바른 휴대전화 번호를 입력해 주세요. (예: 01012345678)");

    if (!valid) submitStatus.textContent = "이름과 연락처를 확인해 주세요.";
    return valid;
}

// ---- 제출 ----
async function submitSimpleApplication(payload) {
    const client = initSupabase();
    if (!client) {
        console.log("[임시 저장 - Supabase 미연결]", payload);
        return;
    }
    const { error } = await client.from("applications").insert([payload]);
    if (error) throw error;
}

simpleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitStatus.textContent = "";

    if (!validateForm()) return;

    const payload = {
        qualification: selectedCert,
        name: val("name"),
        phone: normalizePhone(val("phone")),
        application_mode: "simple",
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "접수 중...";

    try {
        await submitSimpleApplication(payload);
        doneSummary.innerHTML = `<strong>${payload.name}</strong>님, <strong>${selectedCert}</strong> 간편 신청이 접수됐어요.`;
        goToStep("done");
    } catch (err) {
        submitStatus.textContent = "접수 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.";
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "간편 신청 제출하기";
    }
});