-- ============================================================
-- QA C2 테스트용: applications 테이블에 랜덤 100건 삽입
--
-- 자격증 3종(한식조리기능사/공인중개사/요양보호사)에 골고루 분산해서
-- 생성한다. fee_amount/final_amount/receipt_number/grade/exam_type/
-- eligibility_type은 schema.sql의 BEFORE INSERT 트리거가 자동으로
-- 채우므로 여기서는 신청자가 실제로 입력하는 값만 넣는다.
--
-- 주의: 테스트용 더미 데이터다. 실행 전 이미 들어있는 실제 데이터를
-- 지우고 싶지 않다면 그대로 실행해도 안전하다(기존 행에 추가만 됨).
-- 테스트 끝나고 지우고 싶으면 맨 아래 주석 처리된 DELETE문을 쓰면 된다.
-- ============================================================

do $$
declare
  first_names text[] := array['민준','서연','도윤','하윤','시우','지우','예준','수아','주원','지호',
                                '영자','순자','말순','옥순','봉숙','계순','만수','상길','동수','옥자'];
  last_names  text[] := array['김','이','박','최','정','강','조','윤','장','임'];
  regions     text[] := array['서울','부산','대구','인천','광주','대전','울산','세종','경기',
                                '강원','충북','충남','전북','전남','경북','경남','제주'];
  sessions    text[] := array['09:00','10:30','13:00','14:30','16:00'];
  centers     text[] := array['C01','C02','C03','C04','C05','C06','C07','C08','C09'];
  time_slots  text[] := array['AM','PM'];
  discounts   text[] := array['없음','없음','없음','없음','장애인','기초생활수급자','국가유공자','차상위계층'];
  payments    text[] := array['신용카드','계좌이체','가상계좌'];
  quals       text[] := array['한식조리기능사','공인중개사','요양보호사'];

  v_qual      text;
  v_name      text;
  v_gender    text;
  v_phone     text;
  v_birth     date;
  v_discount  text;
  v_payment   text;
begin
  for i in 1..100 loop
    v_qual := quals[1 + floor(random() * 3)::int];
    v_name := last_names[1 + floor(random() * array_length(last_names,1))::int]
              || first_names[1 + floor(random() * array_length(first_names,1))::int];
    v_gender := case when random() < 0.5 then '남' else '여' end;
    v_phone := '010-' || lpad(floor(random()*10000)::text, 4, '0') || '-' || lpad(floor(random()*10000)::text, 4, '0');
    v_birth := date '1950-01-01' + (floor(random() * 20000)::int) * interval '1 day';
    v_discount := discounts[1 + floor(random() * array_length(discounts,1))::int];
    v_payment := payments[1 + floor(random() * 3)::int];

    if v_qual = '한식조리기능사' then
      insert into applications (
        qualification, name, birth_date, gender, phone,
        exam_region, exam_session, exam_date,
        discount_type, payment_method
      ) values (
        v_qual, v_name, v_birth, v_gender, v_phone,
        regions[1 + floor(random() * array_length(regions,1))::int],
        sessions[1 + floor(random() * array_length(sessions,1))::int],
        current_date + (floor(random()*60)::int) * interval '1 day',
        v_discount, v_payment
      );

    elsif v_qual = '공인중개사' then
      insert into applications (
        qualification, name, birth_date, gender, phone,
        exam_stage, exam_region, exam_center,
        discount_type, payment_method
      ) values (
        v_qual, v_name, v_birth, v_gender, v_phone,
        case when random() < 0.5 then '1차' else '2차' end,
        regions[1 + floor(random() * array_length(regions,1))::int],
        '테스트시험장' || (1 + floor(random()*20)::int)::text,
        v_discount, v_payment
      );

    else -- 요양보호사
      insert into applications (
        qualification, name, birth_date, gender, phone,
        training_institution, training_cert_number, training_completion_date,
        test_center_code, test_time_slot, exam_date,
        discount_type, payment_method
      ) values (
        v_qual, v_name, v_birth, v_gender, v_phone,
        '테스트요양보호사교육원' || (1 + floor(random()*10)::int)::text,
        'TR' || to_char(now(), 'YYYY') || lpad(floor(random()*1000000)::text, 6, '0'),
        current_date - (floor(random()*180)::int) * interval '1 day',
        centers[1 + floor(random() * array_length(centers,1))::int],
        time_slots[1 + floor(random() * 2)::int],
        current_date + (floor(random()*60)::int) * interval '1 day',
        v_discount, v_payment
      );
    end if;
  end loop;
end $$;

-- 확인
select qualification, count(*) from applications group by qualification;
select count(*) as 전체건수 from applications;

-- 테스트 끝난 뒤 지우고 싶으면 (신중히! 실제 데이터까지 지워질 수 있음):
-- delete from applications where name like any(array['김%','이%','박%','최%','정%','강%','조%','윤%','장%','임%'])
--   and created_at > now() - interval '1 hour';