-- ============================================================
-- 마이그레이션: 시험일자 + 응시자격유형 + 관리자용 파생컬럼 추가
-- 실행 시점: schema.sql로 applications 테이블을 이미 만든 이후
--
-- ⚠️ 0단계에서 applications 테이블의 기존 행을 전부 지웁니다.
--    테스트로 넣어둔 데이터라 지워도 된다고 확인하신 뒤 실행하세요.
--
-- 이번에 추가하는 것
--  1. exam_date        - 상시CBT(한식조리기능사/요양보호사)는 신청자가
--                         직접 고르는 시험일. 공인중개사는 연1회 고정일이라
--                         신청자 입력 없이 null로 둔다 (확정일이 정해지면
--                         관리자가 별도로 채운다).
--  2. eligibility_type - 신청 시점의 응시자격유형 스냅샷.
--                         한식조리기능사는 정책상 "제한없음" 고정이라
--                         트리거가 자동으로 채운다.
--                         공인중개사는 01_form_정책.md에 값 목록이 없어서
--                         확정할 수 없으므로, 신청자가 직접 선택하게 한다
--                         (모르는 걸 임의로 "제한없음"이라 단정하지 않는다).
--                         요양보호사는 교육수료가 곧 응시자격이라 해당 없음.
--  3. grade / exam_type - 관리자 편의용 파생컬럼. qualification 하나로
--                         100% 결정되는 값이라 신청자 입력을 받지 않고
--                         트리거가 채운다.
-- ============================================================

-- ------------------------------------------------------------------
-- 0) 기존 테스트 데이터 삭제
--    (새 필수값 제약을 넣기 전에 지운다 - 기존 행엔 exam_date가 없어서
--     그대로 두면 제약 추가 자체가 실패한다)
-- ------------------------------------------------------------------

truncate table applications;

-- ------------------------------------------------------------------
-- 1) 신규 컬럼 추가
-- ------------------------------------------------------------------

alter table applications
  add column if not exists exam_date       date,
  add column if not exists eligibility_type text
    check (eligibility_type in ('제한없음', '관련학과졸업', '경력', '기타')),
  add column if not exists grade            text,   -- 관리자용 파생값
  add column if not exists exam_type        text;   -- 관리자용 파생값

-- ------------------------------------------------------------------
-- 2) 트리거 함수 갱신
-- ------------------------------------------------------------------

create or replace function fn_applications_before_insert()
returns trigger as $$
declare
  base_fee int;
  discount_rate numeric;
begin
  -- 1) 정가 계산 (기존과 동일)
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

  discount_rate := case when new.discount_type = '없음' then 0 else 0.5 end;
  new.fee_amount := base_fee;
  new.final_amount := round(base_fee * (1 - discount_rate));

  if new.receipt_number is null then
    new.receipt_number := 'DJ' || to_char(now(), 'YYYY') ||
      lpad(floor(random() * 1000000)::text, 6, '0');
  end if;

  -- 2) 등급 / 시험유형 - qualification에서 100% 유도되는 관리자용 파생값
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

  -- 3) 응시자격유형 - 한식조리기능사는 정책상 고정값이라 자동 채움.
  --    공인중개사는 신청자가 select로 직접 선택해서 보낸 값을 그대로 쓴다.
  --    (정책 문서에 근거가 없어 임의로 기본값을 넣지 않는다)
  if new.qualification = '한식조리기능사' and new.eligibility_type is null then
    new.eligibility_type := '제한없음';
  end if;

  return new;
end;
$$ language plpgsql;

-- ------------------------------------------------------------------
-- 3) 필수 필드 체크 갱신 (기존 제약 지우고 새로 추가)
-- ------------------------------------------------------------------

alter table applications drop constraint if exists chk_hansik_fields;
alter table applications add constraint chk_hansik_fields
  check (
    qualification <> '한식조리기능사'
    or (exam_region is not null and exam_session is not null and exam_date is not null)
  );

alter table applications drop constraint if exists chk_gongin_fields;
alter table applications add constraint chk_gongin_fields
  check (
    qualification <> '공인중개사'
    or (exam_stage is not null and exam_region is not null and eligibility_type is not null)
  );

alter table applications drop constraint if exists chk_yoyang_fields;
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