-- ============================================================
-- 마이그레이션 02: 공인중개사 필드 정리
-- 실행 시점: migration_01_exam_date_eligibility.sql 이후
--
-- 배경: 근거가 불확실했던 필드 2개를 정리하고, 실제로 빠져있던
--       시험장 필드를 추가한다.
--
--  1. is_first_pass_holder / first_pass_year / first_pass_number 삭제
--     - 02_안내규정.md에 "1차 면제 1년" 내용이 있지만 바로 다음 줄에
--       "공식 문서로 확인 못함"이라 명시돼 있음. 확정 안 된 정책을
--       신청서에 넣지 않는다. 나중에 확인되면 다시 추가.
--
--  2. eligibility_type - 공인중개사에도 '제한없음' 자동 적용
--     - 한식조리기능사와 마찬가지로 공인중개사도 응시자격 제한이
--       없다고 보는 게 합리적. 신청자 입력 없이 트리거가 채운다.
--       (컬럼 자체는 유지 - 나중에 실제로 제한이 있는 자격증이
--        추가되면 그때 신청자 선택 항목으로 되살릴 수 있음)
--
--  3. exam_center 컬럼 추가
--     - 지금까지 exam_region(17개 광역)만 있고 실제 시험장이 없었음.
--       02_접수DB_필드명세.md에 정식 필드로 있는데 빠뜨렸던 부분.
--       실제 지역별 시험장 목록 데이터가 없어서 자유 입력으로 받는다
--       (드롭다운으로 만들려면 지역-시험장 매핑 데이터가 더 필요함).
--
--  4. exam_date - 공인중개사 1차는 자동으로 채운다
--     - 02_안내규정.md 기준 2026년 37회 1차 시험일은 2026.10.31로
--       확정돼 있어 트리거가 자동 반영한다.
--     - 2차 시험일은 저희 문서 어디에도 없어 null로 둔다.
--       "모르는 건 지어내지 않는다" 원칙 그대로 적용.
--
-- ⚠️ 이번엔 기존 데이터를 지우지 않는다. 컬럼 삭제/추가는 기존 행에
--    영향 없고, exam_center는 DB 레벨 필수값으로 걸지 않아서
--    (프론트엔드 검증만) 이전 테스트 행도 그대로 유효하다.
-- ============================================================

-- 1) 불확실한 필드 삭제
alter table applications
  drop column if exists is_first_pass_holder,
  drop column if exists first_pass_year,
  drop column if exists first_pass_number;

-- 2) 시험장 컬럼 추가 (자유 입력, DB 레벨 필수 아님 - 기존 데이터 보존 위해)
alter table applications
  add column if not exists exam_center text;

-- 3) 트리거 함수 갱신
create or replace function fn_applications_before_insert()
returns trigger as $$
declare
  base_fee int;
  discount_rate numeric;
begin
  -- 정가 계산
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

  new.grade := case
    when new.qualification = '한식조리기능사' then '기능사'
    else null
  end;

  new.exam_type := case
    when new.qualification = '한식조리기능사' then '상시CBT'
    when new.qualification = '공인중개사' then '연1회'
    when new.qualification = '요양보호사' then '상시'
    else null
  end;

  -- 응시자격유형: 한식조리기능사·공인중개사 둘 다 '제한없음' 자동 적용
  if new.qualification in ('한식조리기능사', '공인중개사') and new.eligibility_type is null then
    new.eligibility_type := '제한없음';
  end if;

  -- 공인중개사 1차 시험일: 확정된 값만 자동 반영, 2차는 미확정이라 비워둠
  if new.qualification = '공인중개사' and new.exam_stage = '1차' and new.exam_date is null then
    new.exam_date := '2026-10-31';
  end if;

  return new;
end;
$$ language plpgsql;

-- 4) 필수 필드 체크 갱신 - 공인중개사는 eligibility_type 요구 제거
alter table applications drop constraint if exists chk_gongin_fields;
alter table applications add constraint chk_gongin_fields
  check (
    qualification <> '공인중개사'
    or (exam_stage is not null and exam_region is not null)
  );