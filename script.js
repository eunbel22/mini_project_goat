// ============================================
// 두두자격지원센터 - 통합 접수 화면 스크립트
// 자격증 3종(한식조리기능사/공인중개사/요양보호사)의
// 서로 다른 필드를 하나의 폼에서 동적으로 렌더링한다.
//
// ---- 상태 ----
let selectedCert = null;

// ---- 참조 데이터 (01_form_정책.md 기준) ----

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

const GONGIN_SUBJECTS = {
    "1차": ["부동산학개론", "민법 및 민사특별법"],
    "2차": ["공인중개사법령 및 중개실무(필수)", "부동산공법(필수)", "부동산공시법 및 부동산세법(선택)"],
};

// 수수료 - 클라이언트는 미리보기용으로만 계산한다.
// 실제 최종금액은 schema.sql의 트리거가 서버에서 다시 계산한다(클라이언트 값 불신).
const FEE_TABLE = {
    "한식조리기능사": 14500,
    "공인중개사_1차": 13400,
    "공인중개사_2차": 15200,
    "요양보호사": 32000,
};

const DISCOUNT_RATE = {
    "없음": 0, "장애인": 0.5, "기초생활수급자": 0.5, "국가유공자": 0.5, "차상위계층": 0.5,
};

// ---- 안내 배너 ----
const CERT_NOTICES = {
    "한식조리기능사": "상시 접수 종목입니다. 필기 응시료는 14,500원이며, 자리가 있으면 바로 접수됩니다.",
    "요양보호사": "상시 접수 종목입니다. 시험일 7일 전까지 접수하시면 됩니다.",
    "공인중개사": "2026년 1차 접수 기간(8/3~8/7)은 이미 종료됐습니다. 신청서를 접수해 두시면 다음 접수 시기를 저희가 확인 후 연락드립니다.",
};

// ---- 자격증별 동적 필드 설정 ----
// select 옵션의 value는 표시용 텍스트를 그대로 쓴다 (unify_applications.py의
// 표준값과 맞춰서, 나중에 실제 원본 시스템 데이터와 합칠 때 재매핑이 필요 없게 한다).

function buildCertFields(cert) {
    const container = document.getElementById("certFields");
    container.innerHTML = "";

    if (cert === "한식조리기능사") {
        container.appendChild(makeSelectField("examRegion", "시험지역", REGIONS_17, true));
        container.appendChild(makeSelectField("examSession", "희망 시간대", NATIONAL_SESSIONS, true));
        container.appendChild(makeDateField("examDate", "희망 시험일", true));
        container.appendChild(makeReadonlyNote("등급: 기능사 · 시험구분: 필기 · 시험유형: 상시CBT · 응시자격: 제한없음"));
    }

    if (cert === "요양보호사") {
        container.appendChild(makeTextField("trainingInstitution", "교육기관명", "예) 서울시립요양보호사교육원", true));
        container.appendChild(makeTextField("trainingCertNumber", "교육수료번호", "예) TR20261234", true));
        container.appendChild(makeDateField("trainingCompletionDate", "교육수료일", true));
        container.appendChild(makeReadonlyNote("교육이수시간: 240시간 (고정)"));
        container.appendChild(makeSelectField("testCenterCode", "시험센터",
            HEALTH_CENTERS.map(c => c.name), true, HEALTH_CENTERS.map(c => c.code)));
        container.appendChild(makeSelectField("testTimeSlot", "시간대", ["AM", "PM"], true,
            null, { AM: "오전 (09:00)", PM: "오후 (14:00)" }));
        container.appendChild(makeDateField("examDate", "희망 시험일", true));
    }

    if (cert === "공인중개사") {
        const stageField = makeSelectField("examStage", "응시 차수", ["1차", "2차"], true);
        container.appendChild(stageField);

        const examDateNote = document.createElement("p");
        examDateNote.id = "gonginExamDateNote";
        examDateNote.className = "field-hint field-hint--block";
        container.appendChild(examDateNote);

        container.appendChild(makeSelectField("examRegion", "시험지역", REGIONS_17, true));
        container.appendChild(makeTextField("examCenter", "희망 시험장", "예) OO고등학교, 미정이면 지역명만 입력", true));

        const subjectNote = document.createElement("p");
        subjectNote.id = "subjectNote";
        subjectNote.className = "notice notice--show";
        container.appendChild(subjectNote);

        const GONGIN_EXAM_DATE = { "1차": "2026-10-31", "2차": null };

        const stageSelect = stageField.querySelector("select");
        stageSelect.addEventListener("change", () => {
            const stage = stageSelect.value;
            subjectNote.textContent = "시험과목: " + GONGIN_SUBJECTS[stage].join(" / ");
            examDateNote.textContent = GONGIN_EXAM_DATE[stage]
                ? `시험일: ${GONGIN_EXAM_DATE[stage]} (연 1회 고정일 · 자동 반영)`
                : "시험일: 아직 확정되지 않았습니다. 확정되는 대로 저희가 별도 안내드립니다.";
            updateFeePreview();
        });
        // 초기 표시
        subjectNote.textContent = "시험과목: " + GONGIN_SUBJECTS["1차"].join(" / ");
        examDateNote.textContent = `시험일: ${GONGIN_EXAM_DATE["1차"]} (연 1회 고정일 · 자동 반영)`;
    }

    updateFeePreview();
}

// ---- 작은 필드 생성 헬퍼들 ----

function makeTextField(id, label, placeholder, required) {
    const div = document.createElement("div");
    div.className = "field";
    div.innerHTML = `
    <label for="${id}">${label} ${required ? '<span class="required">*</span>' : ""}</label>
    <input type="text" id="${id}" placeholder="${placeholder || ""}" ${required ? "required" : ""}>
  `;
    return div;
}

function makeDateField(id, label, required) {
    const div = document.createElement("div");
    div.className = "field";
    div.innerHTML = `
    <label for="${id}">${label} ${required ? '<span class="required">*</span>' : ""}</label>
    <input type="date" id="${id}" ${required ? "required" : ""}>
  `;
    return div;
}

function makeSelectField(id, label, options, required, values, labels) {
    const div = document.createElement("div");
    div.className = "field";
    const optionsHtml = options.map((opt, i) => {
        const value = values ? values[i] : opt;
        const text = labels ? labels[opt] : opt;
        return `<option value="${value}">${text}</option>`;
    }).join("");
    div.innerHTML = `
    <label for="${id}">${label} ${required ? '<span class="required">*</span>' : ""}</label>
    <select id="${id}" ${required ? "required" : ""}>
      <option value="" disabled selected>선택해 주세요</option>
      ${optionsHtml}
    </select>
  `;
    if (id === "examSession" || id === "examRegion" || id === "testCenterCode" || id === "testTimeSlot" || id === "examStage") {
        div.querySelector("select").addEventListener("change", updateFeePreview);
    }
    return div;
}

function makeReadonlyNote(text) {
    const p = document.createElement("p");
    p.className = "field-hint field-hint--block";
    p.textContent = text;
    return p;
}

// ---- 예상 결제금액 미리보기 (참고용, 최종 계산은 서버 트리거) ----

function updateFeePreview() {
    const feePreview = document.getElementById("feePreview");
    const discountType = document.getElementById("discountType")?.value || "없음";
    let baseFee = null;

    if (selectedCert === "한식조리기능사") {
        baseFee = FEE_TABLE["한식조리기능사"];
    } else if (selectedCert === "요양보호사") {
        baseFee = FEE_TABLE["요양보호사"];
    } else if (selectedCert === "공인중개사") {
        const stage = document.getElementById("examStage")?.value;
        if (stage) baseFee = FEE_TABLE["공인중개사_" + stage];
    }

    if (baseFee == null) {
        feePreview.textContent = "-";
        return;
    }

    const rate = DISCOUNT_RATE[discountType] ?? 0;
    const final = Math.round(baseFee * (1 - rate));
    feePreview.textContent = final.toLocaleString("ko-KR") + "원";
}

// ---- 1단계: 자격증 선택 ----
document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById("certGrid");
    if (grid) {
        grid.addEventListener("click", (e) => {
            const card = e.target.closest(".cert-card");
            if (!card) return;

            selectedCert = card.dataset.cert;
            const certLabel = document.getElementById("selectedCertLabel");
            if (certLabel) certLabel.textContent = selectedCert;

            const noticeText = CERT_NOTICES[selectedCert];
            const certNoticeEl = document.getElementById("certNotice");
            if (certNoticeEl) {
                certNoticeEl.textContent = noticeText || "";
                certNoticeEl.classList.toggle("notice--show", Boolean(noticeText));
            }

            buildCertFields(selectedCert);
            goToStep("form");
        });
    }

    const backBtn = document.getElementById("backBtn");
    if (backBtn) {
        backBtn.addEventListener("click", () => goToStep("select"));
    }

    const restartBtn = document.getElementById("restartBtn");
    if (restartBtn) {
        restartBtn.addEventListener("click", () => {
            const applyForm = document.getElementById("applyForm");
            if (applyForm) applyForm.reset();
            selectedCert = null;
            goToStep("select");
        });
    }

    const discountTypeEl = document.getElementById("discountType");
    if (discountTypeEl) {
        discountTypeEl.addEventListener("change", updateFeePreview);
    }

    const fontToggleBtn = document.getElementById("fontToggle");
    if (fontToggleBtn) {
        fontToggleBtn.addEventListener("click", () => {
            const isLarge = document.body.classList.toggle("font-large");
            fontToggleBtn.setAttribute("aria-pressed", String(isLarge));
        });
    }
});

function goToStep(step) {
    stepSelect.classList.toggle("step--hidden", step !== "select");
    stepForm.classList.toggle("step--hidden", step !== "form");
    stepDone.classList.toggle("step--hidden", step !== "done");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---- 유틸 ----

function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return raw.trim();
}

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : null;
}

// ---- 폼 검증 ----

function validateForm() {
    let valid = true;
    const setError = (id, msg) => {
        const el = document.getElementById(id);
        if (el) el.textContent = msg;
        if (msg) valid = false;
    };

    setError("nameError", val("name") ? "" : "이름을 입력해 주세요.");
    setError("birthDateError", val("birthDate") ? "" : "생년월일을 선택해 주세요.");
    setError("genderError", document.querySelector('input[name="gender"]:checked') ? "" : "성별을 선택해 주세요.");

    const phoneDigits = (val("phone") || "").replace(/\D/g, "");
    setError("phoneError", phoneDigits.length >= 9 ? "" : "연락처를 숫자로 입력해 주세요.");

    // 자격증별 필수 필드 검증
    if (selectedCert === "한식조리기능사") {
        if (!val("examRegion")) valid = false;
        if (!val("examSession")) valid = false;
        if (!val("examDate")) valid = false;
    }
    if (selectedCert === "요양보호사") {
        if (!val("trainingInstitution")) valid = false;
        if (!val("trainingCertNumber")) valid = false;
        if (!val("trainingCompletionDate")) valid = false;
        if (!val("testCenterCode")) valid = false;
        if (!val("testTimeSlot")) valid = false;
        if (!val("examDate")) valid = false;
    }
    if (selectedCert === "공인중개사") {
        if (!val("examStage")) valid = false;
        if (!val("examRegion")) valid = false;
        if (!val("examCenter")) valid = false;
    }

    if (!valid) {
        submitStatus.textContent = "입력하지 않은 항목이 있는지 확인해 주세요.";
    }
    return valid;
}

// ---- 제출 ----

applyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitStatus.textContent = "";

    if (!validateForm()) return;

    const phone = normalizePhone(val("phone"));
    const gender = document.querySelector('input[name="gender"]:checked').value;

    const payload = {
        qualification: selectedCert,
        name: val("name"),
        birth_date: val("birthDate"),
        gender,
        phone,
        discount_type: val("discountType"),
        payment_method: val("paymentMethod"),

        // 자격증별 필드 - 해당 없는 값은 null로 보낸다
        exam_region: val("examRegion"),
        exam_center: val("examCenter"),
        exam_session: val("examSession"),
        exam_date: val("examDate") || null, // 공인중개사는 서버 트리거가 채움(미입력 시 null 전송)
        exam_stage: val("examStage"),
        training_institution: val("trainingInstitution"),
        training_cert_number: val("trainingCertNumber"),
        training_completion_date: val("trainingCompletionDate"),
        training_hours: selectedCert === "요양보호사" ? 240 : null,
        test_center_code: val("testCenterCode"),
        test_time_slot: val("testTimeSlot"),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "접수 중...";

    try {
        await submitApplication(payload);
        doneSummary.innerHTML = `<strong>${payload.name}</strong>님, <strong>${selectedCert}</strong> 신청이 접수됐어요.`;
        goToStep("done");
    } catch (err) {
        submitStatus.textContent = "접수 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.";
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "신청서 제출하기";
    }
});

// ---- 실제 저장 ----
// fee_amount / final_amount / receipt_number는 보내지 않는다.
// schema.sql의 트리거가 서버에서 계산·채번한다 (클라이언트 값 불신 원칙).
async function submitApplication(data) {
    const client = initSupabase();

    if (!client) {
        console.log("[임시 저장 - Supabase 미연결]", data);
        await new Promise((r) => setTimeout(r, 400));
        return;
    }

    const { error } = await client.from("applications").insert([data]);
    if (error) throw error;
}