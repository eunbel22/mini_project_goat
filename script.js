// ============================================
// 두두자격지원센터 - 통합 접수 화면 스크립트
// 자격증 3종(한식조리기능사/공인중개사/요양보호사)의
// 서로 다른 필드를 하나의 폼에서 동적으로 렌더링한다.
//
// Supabase 연결 설정은 common.js에 있습니다.
// (index.html에서 common.js를 이 파일보다 먼저 불러와야 합니다)
// ============================================

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

const SONHAE_SUBJECTS = {
    "1차": ["상법 보험편", "농어업재해보험법령"],
    "2차": ["농작물재해보험 및 가축재해보험의 이론과 실무", "농작물재해보험 및 가축재해보험 손해평가의 이론과 실무"],
};

// 수수료 - 클라이언트는 미리보기용으로만 계산한다.
// 실제 최종금액은 schema.sql의 트리거가 서버에서 다시 계산한다(클라이언트 값 불신).
const FEE_TABLE = {
    "한식조리기능사": 14500,
    "지게차운전기능사": 14500,
    "굴착기운전기능사": 14500,
    "공인중개사_1차": 13400,
    "공인중개사_2차": 15200,
    "요양보호사": 32000,
    "손해평가사_1차": 30000,
    "손해평가사_2차": 30000,
};

const DISCOUNT_RATE = {
    "없음": 0, "장애인": 0.5, "기초생활수급자": 0.5, "국가유공자": 0.5, "차상위계층": 0.5,
};

// ---- 안내 배너 ----
const CERT_NOTICES = {
    "한식조리기능사": "상시 접수 종목입니다. 필기 응시료는 14,500원이며, 자리가 있으면 바로 접수됩니다.",
    "요양보호사": "상시 접수 종목입니다. 시험일 7일 전까지 접수하시면 됩니다.",
    "공인중개사": "2026년 1차 접수 기간(8/3~8/7)은 이미 종료됐습니다. 신청서를 접수해 두시면 다음 접수 시기를 저희가 확인 후 연락드립니다.",
    "지게차운전기능사": "상시 접수 종목입니다. 필기 응시료는 14,500원이며, 자리가 있으면 바로 접수됩니다.",
    "굴착기운전기능사": "상시 접수 종목입니다. 필기 응시료는 14,500원이며, 자리가 있으면 바로 접수됩니다.",
    "손해평가사": "2026년 1차 시험(5/9)은 이미 지났고, 2차 일정은 저희가 확인하지 못했습니다. 신청서를 접수해 두시면 다음 일정을 확인 후 연락드립니다.",
};

// ---- 자격증별 동적 필드 설정 ----
// select 옵션의 value는 표시용 텍스트를 그대로 쓴다 (unify_applications.py의
// 표준값과 맞춰서, 나중에 실제 원본 시스템 데이터와 합칠 때 재매핑이 필요 없게 한다).

function buildCertFields(cert) {
    const container = document.getElementById("certFields");
    container.innerHTML = "";

    // 상시CBT형 3종은 필드 구조가 완전히 동일하다 (시험지역/시간대/희망시험일).
    const CBT_CERTS = ["한식조리기능사", "지게차운전기능사", "굴착기운전기능사"];
    if (CBT_CERTS.includes(cert)) {
        container.appendChild(makeSelectField("examRegion", "시험지역", REGIONS_17, true));
        container.appendChild(makeSelectField("examSession", "희망 시간대", NATIONAL_SESSIONS, true));
        container.appendChild(makeDateField("examDate", "희망 시험일", true, todayIso, examDateMaxIso));
        container.appendChild(makeReadonlyNote("등급: 기능사 · 시험구분: 필기 · 시험유형: 상시CBT · 응시자격: 제한없음"));
    }

    if (cert === "요양보호사") {
        container.appendChild(makeTextField("trainingInstitution", "교육기관명", "예) 서울시립요양보호사교육원", true));
        container.appendChild(makeTextField("trainingCertNumber", "교육수료번호", "예) TR20261234", true));
        container.appendChild(makeDateField("trainingCompletionDate", "교육수료일", true, "1900-01-01", todayIso));
        container.appendChild(makeReadonlyNote("교육이수시간: 240시간 (고정)"));
        container.appendChild(makeSelectField("testCenterCode", "시험센터",
            HEALTH_CENTERS.map(c => c.name), true, HEALTH_CENTERS.map(c => c.code)));
        container.appendChild(makeSelectField("testTimeSlot", "시간대", ["AM", "PM"], true,
            null, { AM: "오전 (09:00)", PM: "오후 (14:00)" }));
        container.appendChild(makeDateField("examDate", "희망 시험일", true, todayIso, examDateMaxIso));
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

    if (cert === "손해평가사") {
        const stageField = makeSelectField("examStage", "응시 차수", ["1차", "2차"], true);
        container.appendChild(stageField);

        const examDateNote = document.createElement("p");
        examDateNote.id = "sonhaeExamDateNote";
        examDateNote.className = "field-hint field-hint--block";
        container.appendChild(examDateNote);

        container.appendChild(makeSelectField("examRegion", "시험지역", REGIONS_17, true));
        container.appendChild(makeTextField("examCenter", "희망 시험장", "예) OO고등학교, 미정이면 지역명만 입력", true));

        const subjectNote = document.createElement("p");
        subjectNote.id = "subjectNote";
        subjectNote.className = "notice notice--show";
        container.appendChild(subjectNote);

        // 2026년 1차 시험(5/9)은 이미 끝났고, 2차 일정은 확인된 자료가 없다.
        // 지어내지 않고 미확정으로 안내한다.
        const SONHAE_EXAM_DATE = { "1차": null, "2차": null };

        const stageSelect = stageField.querySelector("select");
        stageSelect.addEventListener("change", () => {
            const stage = stageSelect.value;
            subjectNote.textContent = "시험과목: " + SONHAE_SUBJECTS[stage].join(" / ");
            examDateNote.textContent = "시험일: 2026년 일정은 이미 지났거나 아직 확정되지 않았습니다. 확정되는 대로 저희가 별도 안내드립니다.";
            updateFeePreview();
        });
        subjectNote.textContent = "시험과목: " + SONHAE_SUBJECTS["1차"].join(" / ");
        examDateNote.textContent = "시험일: 2026년 일정은 이미 지났거나 아직 확정되지 않았습니다. 확정되는 대로 저희가 별도 안내드립니다.";
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

function makeDateField(id, label, required, min, max) {
    const div = document.createElement("div");
    div.className = "field";
    div.innerHTML = `
    <label for="${id}">${label} ${required ? '<span class="required">*</span>' : ""}</label>
    <input type="date" id="${id}" ${required ? "required" : ""}
           ${min ? `min="${min}"` : ""} ${max ? `max="${max}"` : ""}>
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

    if (["한식조리기능사", "지게차운전기능사", "굴착기운전기능사"].includes(selectedCert)) {
        baseFee = FEE_TABLE[selectedCert];
    } else if (selectedCert === "요양보호사") {
        baseFee = FEE_TABLE["요양보호사"];
    } else if (selectedCert === "공인중개사") {
        const stage = document.getElementById("examStage")?.value;
        if (stage) baseFee = FEE_TABLE["공인중개사_" + stage];
    } else if (selectedCert === "손해평가사") {
        const stage = document.getElementById("examStage")?.value;
        if (stage) baseFee = FEE_TABLE["손해평가사_" + stage];
    }

    if (baseFee == null) {
        feePreview.textContent = "-";
        return;
    }

    const rate = DISCOUNT_RATE[discountType] ?? 0;
    const final = Math.round(baseFee * (1 - rate));
    feePreview.textContent = final.toLocaleString("ko-KR") + "원";
}

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

document.getElementById("discountType").addEventListener("change", updateFeePreview);

// ---- 생년월일: 네이티브 달력 입력 유지, 대신 연도 범위를 min/max로 제한 ----
// (브라우저 자체 버그로 연도 칸에 4자리 넘게 입력되는 경우가 있어, HTML의
// min/max 속성으로 값 범위를 강제한다. 그래도 뚫리는 값은 제출 시 재검증한다.)

const todayIso = new Date().toISOString().slice(0, 10);
const examDateMaxIso = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const birthDateInput = document.getElementById("birthDate");
birthDateInput.min = "1900-01-01";
birthDateInput.max = todayIso;

// ---- 연락처: 010 프리필 + 입력할 때마다 자동 하이픈 ----

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

// 연도 범위를 벗어난 날짜(예: 200000-01-01)가 브라우저 입력 버그로 들어오면
// 잘라내서 되돌린다. 자격증별 희망 시험일(examDate)에도 같은 처리를 한다.
function clampDateInputYear(input, minIso, maxIso) {
    input.addEventListener("change", () => {
        if (input.value && (input.value < minIso || input.value > maxIso)) {
            input.value = "";
        }
    });
}
clampDateInputYear(birthDateInput, "1900-01-01", todayIso);

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

    const noticeText = CERT_NOTICES[selectedCert];
    certNotice.textContent = noticeText || "";
    certNotice.classList.toggle("notice--show", Boolean(noticeText));

    buildCertFields(selectedCert);
    goToStep("form");
});

document.getElementById("backBtn").addEventListener("click", () => goToStep("select"));

document.getElementById("restartBtn").addEventListener("click", () => {
    applyForm.reset();
    phoneInput.value = "010-";
    selectedCert = null;
    goToStep("select");
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

    // 이름: 한글/영문/공백만, 1~30자 (02_접수DB_필드명세.md 기준 VARCHAR(30))
    // QA E2/E3/E9에서 특수문자·숫자만·50자 이상이 그냥 통과되던 문제를 막는다.
    const nameVal = (val("name") || "").trim();
    const namePattern = /^[가-힣a-zA-Z\s]{1,30}$/;
    setError(
        "nameError",
        !nameVal ? "이름을 입력해 주세요."
            : !namePattern.test(nameVal) ? "이름은 한글 또는 영문으로 30자 이내로 입력해 주세요."
                : ""
    );

    const birthDateVal = val("birthDate");
    const yearOk = birthDateVal && /^\d{4}-\d{2}-\d{2}$/.test(birthDateVal)
        && birthDateVal >= "1900-01-01" && birthDateVal <= todayIso;
    setError(
        "birthDateError",
        !birthDateVal ? "생년월일을 선택해 주세요."
            : !yearOk ? "생년월일 연도를 다시 확인해 주세요. (1900~오늘 사이)"
                : ""
    );
    setError("genderError", document.querySelector('input[name="gender"]:checked') ? "" : "성별을 선택해 주세요.");

    // 연락처: 01로 시작하는 10~11자리만 허용.
    // QA E4/E5에서 "00000000000"(0만 11개), 17자리 이상도 통과되던 문제를 막는다.
    const phoneDigits = (val("phone") || "").replace(/\D/g, "");
    const phonePattern = /^01[0-9]{8,9}$/;
    setError("phoneError", phonePattern.test(phoneDigits) ? "" : "올바른 휴대전화 번호를 입력해 주세요. (예: 01012345678)");

    // 자격증별 필수 필드 검증
    if (["한식조리기능사", "지게차운전기능사", "굴착기운전기능사"].includes(selectedCert)) {
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
    if (selectedCert === "공인중개사" || selectedCert === "손해평가사") {
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