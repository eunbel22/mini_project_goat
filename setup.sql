-- ============================================================
-- 두두자격지원센터 - 통합 접수 DB 스키마
-- 대상 자격증 3종: 한식조리기능사 / 공인중개사 / 요양보호사
--
-- 설계 원칙
--  1. 세 시스템(국가기술/전문/보건)에만 있는 필드도 한 테이블에 담되,
--     해당 자격증에만 값이 채워지는 nullable 컬럼으로 둔다.
--  2. 수수료(fee_amount)·최종결제금액(final_amount)은 클라이언트를
--     신뢰하지 않는다. 자격증·차수·감면유형만 받고, 금액은 트리거가
--     서버에서 다시 계산한다. (두두택배 프로젝트와 동일한 원칙)
--  3. 감면유형 표기는 시스템마다 달랐던 것("기초생활수급자" vs
--     "기초수급")을 이번 신규 시스템에서는 하나로 통일한다.
-- ============================================================

create table if not exists applications (
  id                    bigint generated always as identity primary key,
  receipt_number        text unique,                -- 트리거가 자동 채번

  -- 공통 필드
  qualification         text not null
                         check (qualification in ('한식조리기능사', '공인중개사', '요양보호사')),
  name                  text not null,
  birth_date            date not null,
  gender                text not null check (gender in ('남', '여')),
  phone                 text not null,

  -- 한식조리기능사 전용
  exam_region           text,   -- 17개 광역 중 하나
  exam_session          text,   -- 09:00 / 10:30 / 13:00 / 14:30 / 16:00
  exam_date             date,   -- 상시CBT는 신청자가 직접 고르는 시험일

  -- 응시자격유형: 신청 시점 스냅샷. 한식조리기능사는 정책상 '제한없음'
  -- 고정이라 트리거가 자동으로 채운다. 공인중개사는 정책 문서에 값
  -- 목록이 없어 확정할 수 없으므로 신청자가 직접 선택한다.
  -- 요양보호사는 교육수료가 곧 응시자격이라 해당 없음(null).
  eligibility_type      text check (eligibility_type in ('제한없음', '관련학과졸업', '경력', '기타')),

  -- 관리자 편의용 파생컬럼. qualification 하나로 100% 결정되는 값이라
  -- 신청자 입력을 받지 않고 트리거가 채운다.
  grade                 text,
  exam_type             text,

  -- 공인중개사 전용
  exam_stage            text check (exam_stage in ('1차', '2차')),
  exam_center            text,   -- 자유 입력 (지역별 시험장 목록 데이터가 없어 텍스트로 받음)

  -- 요양보호사 전용
  training_institution      text,
  training_cert_number      text,
  training_completion_date  date,
  training_hours             int,
  test_center_code           text,     -- 9개 CBT 센터 코드 (C01~C09)
  test_time_slot              text check (test_time_slot in ('AM', 'PM')),

  -- 결제 (fee_amount / final_amount은 트리거가 계산 - 클라이언트 값 무시)
  fee_amount            int,
  discount_type         text not null default '없음'
                         check (discount_type in ('없음', '장애인', '기초생활수급자', '국가유공자', '차상위계층')),
  final_amount          int,
  payment_method        text not null
                         check (payment_method in ('신용카드', '계좌이체', '가상계좌')),

  application_status    text not null default '접수완료'
                         check (application_status in ('접수완료', '결제대기', '취소')),

  created_at            timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 자격증/차수별 정가 (01_form_정책.md 기준)
-- ------------------------------------------------------------------
--   한식조리기능사        : 14,500원
--   공인중개사 1차        : 13,400원
--   공인중개사 2차        : 15,200원
--   요양보호사            : 32,000원
--
-- 감면율 (이번 통합 시스템에서 하나로 정리)
--   없음 : 0%   /   장애인·기초생활수급자·국가유공자·차상위계층 : 50%
-- ------------------------------------------------------------------

create or replace function fn_applications_before_insert()
returns trigger as $$
declare
  base_fee int;
  discount_rate numeric;
begin
  -- 1) 정가 계산: 클라이언트가 보낸 fee_amount는 참고하지 않는다.
  base_fee := case
    when new.qualification = '한식조리기능사' then 14500
    when new.qualification = '공인중개사' and new.exam_stage = '1차' then 13400
    when new.qualification = '공인중개사' and new.exam_stage = '2차' then 15200
    when new.qualification = '요양보호사' then 32000
    else null
  end;

  if base_fee is null then
    raise exception '수수료를 계산할 수 없습니다 (자격증/차수 조합을 확인하세요): %, %',
      new.qualification, new.exam_stage;
  end if;

  -- 2) 감면율 계산
  discount_rate := case
    when new.discount_type = '없음' then 0
    else 0.5
  end;

  new.fee_amount := base_fee;
  new.final_amount := round(base_fee * (1 - discount_rate));

  -- 3) 접수번호 자동 채번: DJ + 연도 + 6자리 랜덤
  if new.receipt_number is null then
    new.receipt_number := 'DJ' || to_char(now(), 'YYYY') ||
      lpad(floor(random() * 1000000)::text, 6, '0');
  end if;

  -- 4) 등급 / 시험유형 - qualification에서 100% 유도되는 관리자용 파생값
  new.grade := case
    when new.qualification = '한식조리기능사' then '기능사'
    else null  -- 공인중개사·요양보호사는 '등급' 개념 자체가 없음
  end;

  new.exam_type := case
    when new.qualification = '한식조리기능사' then '상시CBT'
    when new.qualification = '공인중개사' then '연1회'
    when new.qualification = '요양보호사' then '상시'
    else null
  end;

  -- 5) 응시자격유형: 한식조리기능사·공인중개사 둘 다 응시제한이 없다고 보고
  --    '제한없음'을 자동으로 채운다. 요양보호사는 교육수료가 곧 응시자격이라
  --    해당 없음(null)으로 둔다.
  if new.qualification in ('한식조리기능사', '공인중개사') and new.eligibility_type is null then
    new.eligibility_type := '제한없음';
  end if;

  -- 6) 공인중개사 1차 시험일: 확정된 값만 자동 반영 (02_안내규정.md 기준).
  --    2차 시험일은 확인된 자료가 없어 임의로 채우지 않고 null로 둔다.
  if new.qualification = '공인중개사' and new.exam_stage = '1차' and new.exam_date is null then
    new.exam_date := '2026-10-31';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_applications_before_insert on applications;
create trigger trg_applications_before_insert
  before insert on applications
  for each row
  execute function fn_applications_before_insert();

-- ------------------------------------------------------------------
-- 자격증별 필수 필드 체크 (애플리케이션 레벨 검증의 이중 안전장치)
-- ------------------------------------------------------------------

alter table applications add constraint chk_hansik_fields
  check (
    qualification <> '한식조리기능사'
    or (exam_region is not null and exam_session is not null and exam_date is not null)
  );

alter table applications add constraint chk_gongin_fields
  check (
    qualification <> '공인중개사'
    or (exam_stage is not null and exam_region is not null)
  );

alter table applications add constraint chk_yoyang_fields
  check (
    qualification <> '요양보호사'
    or (
      training_institution is not null
      and training_cert_number is not null
      and training_completion_date is not null
      and test_center_code is not null
      and test_time_slot is not null
      and exam_date is not null
    )
  );

-- ------------------------------------------------------------------
-- RLS: 접수는 누구나(anon) 가능, 조회는 서비스 역할만 (어드민 화면용)
-- ------------------------------------------------------------------

alter table applications enable row level security;

create policy "누구나 접수 가능"
  on applications for insert
  to anon
  with check (true);

create policy "서비스 역할만 조회"
  on applications for select
  to service_role
  using (true);

-- 인덱스: 어드민 화면에서 자격증별/날짜별 조회가 잦으므로
create index if not exists idx_applications_qualification on applications (qualification);
create index if not exists idx_applications_created_at on applications (created_at desc);