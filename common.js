// ============================================
// 두두자격지원센터 - 공통 설정
// index.html(접수화면), admin.html(어드민)이 함께 사용
// ============================================

// ---- 빈칸: Supabase 연결 정보 ----
// Supabase 대시보드 > Settings > API 에서 복사해서 넣으세요.
const SUPABASE_URL = "https://ofpqspcpumnexfqcyurs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mcHFzcGNwdW1uZXhmcWN5dXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTk1MDEsImV4cCI6MjEwMjY3NTUwMX0.Z1qVsLPiFWrP8MYXQLc-ojxCqxJLnmup5nlQUyf6lE4";

let supabaseClient = null;
function initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    if (typeof window.supabase === "undefined") return null;
    if (!supabaseClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
}

