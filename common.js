// ============================================
// 두두자격지원센터 - 공통 설정
// index.html(접수화면), admin.html(어드민)이 함께 사용
// ============================================

// ---- 빈칸: Supabase 연결 정보 ----
// Supabase 대시보드 > Settings > API 에서 복사해서 넣으세요.
const SUPABASE_URL = ""; // 예) "https://xxxxxxxx.supabase.co"
const SUPABASE_ANON_KEY = ""; // 예) "eyJhbGciOi..."

let supabaseClient = null;
function initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    if (typeof window.supabase === "undefined") return null;
    if (!supabaseClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}