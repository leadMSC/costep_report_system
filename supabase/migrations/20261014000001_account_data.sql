-- MSC Report Generator — 계정별 내 정보(펌·나)와 고객사 정보를 서버에 저장
-- 2026-10-14 · 작업로그 L-094
--
-- 구조 요약
--   orgs        펌(소속)         = 내 정보 > 소속 펌   (1인 컨설턴트도 자기 펌 1개 = kind 'solo')
--   profiles    나(계정)         = 내 정보 > 나
--   clients     고객사(수진기업) = 고객사 정보 중 잘 안 바뀌는 것(상호·사업자번호·대표 등) — 담당 컨설턴트(owner_id) 별
--   assessments 진단 건          = 한 고객의 한 번 진단에 쓴 화면 입력 전체(form_data JSON) — 회차·버전
--
-- 보이는 범위(계정별)
--   컨설턴트  = 자기가 만든 고객·진단 건만
--   펌 관리자 = 자기 펌 전체
--   운영자    = 전체
--
-- 이 파일은 더하기만 한다(기존 열·자료를 지우지 않음). 정책은 같은 이름으로 다시 만든다.

-- ---------------------------------------------------------------------------
-- 1. 펌(orgs) — 내 정보 > 소속 펌 칸을 모두 담는다
-- ---------------------------------------------------------------------------
alter table public.orgs
  add column if not exists kind            text not null default 'firm' check (kind in ('firm', 'solo')),
  add column if not exists biz_no          text,          -- 펌 사업자등록번호
  add column if not exists ceo_name        text,          -- 대표
  add column if not exists reviewer_label  text,          -- 검토자 (서식1 결재란)
  add column if not exists approver_label  text,          -- 결재권자
  add column if not exists email           text,
  add column if not exists created_by      uuid references auth.users (id),
  add column if not exists updated_at      timestamptz not null default now(),
  add column if not exists updated_by      uuid references auth.users (id);

-- ---------------------------------------------------------------------------
-- 2. 나(profiles) — 이름·직함은 이미 있음. 휴대폰·연락 메일·화면 설정을 더한다
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists phone          text,           -- 서식 담당자 전화
  add column if not exists contact_email  text,           -- 서식에 쓰는 메일(로그인 메일과 다를 수 있음)
  add column if not exists prefs          jsonb not null default '{}'::jsonb,  -- 내보내기 기본값 등 화면 설정
  add column if not exists updated_at     timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 3. 고객사(clients) — 담당 컨설턴트별, 사업자번호로 중복 막기, 지우면 휴지통
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists owner_id     uuid references auth.users (id) default auth.uid(),  -- 담당 컨설턴트
  add column if not exists biz_no_norm  text generated always as (nullif(regexp_replace(coalesce(biz_no, ''), '\D', '', 'g'), '')) stored,
  add column if not exists profile      jsonb not null default '{}'::jsonb,  -- 잘 안 바뀌는 정보(대표·개업일·소재지·업종 등)
  add column if not exists memo         text,
  add column if not exists updated_by   uuid references auth.users (id),
  add column if not exists deleted_at   timestamptz;
update public.clients set owner_id = created_by where owner_id is null;

create unique index if not exists clients_org_bizno_uniq
  on public.clients (org_id, biz_no_norm) where biz_no_norm is not null and deleted_at is null;
create index if not exists clients_owner_idx on public.clients (owner_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- 4. 진단 건(assessments) — 화면 입력 전체 + 회차 + 동시 수정 감지(version)
-- ---------------------------------------------------------------------------
alter table public.assessments
  add column if not exists round         int  not null default 1,          -- 같은 고객의 몇 번째 진단
  add column if not exists title         text,                            -- 목록에 보일 이름(예: 2026 경영개선)
  add column if not exists report_keys   text[] not null default '{}',     -- 상담 목적 = 보고서 분야
  add column if not exists form_version  int  not null default 1,          -- form_data 형식 버전(collectFormData)
  add column if not exists version       int  not null default 1,          -- 저장할 때마다 +1 (다른 PC에서 먼저 고쳤는지 확인)
  add column if not exists updated_by    uuid references auth.users (id),
  add column if not exists deleted_at    timestamptz;
create index if not exists assessments_owner_idx on public.assessments (consultant_id, updated_at desc);
-- 상호를 아직 안 적은 작성 중 화면도 바로 서버에 저장한다(고객은 상호가 생기면 연결)
alter table public.assessments alter column client_id drop not null;

-- ---------------------------------------------------------------------------
-- 5. 고친 시각·고친 사람·버전 자동 기록
-- ---------------------------------------------------------------------------
create or replace function public.touch_row() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_table_name in ('orgs', 'clients', 'assessments') then new.updated_by := auth.uid(); end if;
  if tg_table_name = 'assessments' then new.version := old.version + 1; end if;
  return new;
end $$;

drop trigger if exists touch_orgs on public.orgs;
create trigger touch_orgs before update on public.orgs for each row execute function public.touch_row();
drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles for each row execute function public.touch_row();
drop trigger if exists touch_clients on public.clients;
create trigger touch_clients before update on public.clients for each row execute function public.touch_row();
drop trigger if exists touch_assessments on public.assessments;
create trigger touch_assessments before update on public.assessments for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- 6. 소속 펌이 없는 승인 계정이 자기 펌을 만든다(1인 컨설턴트·운영자)
--    만든 사람은 그 펌 소속이 되고, 컨설턴트였다면 그 펌의 관리자가 된다(운영자는 운영자 그대로)
-- ---------------------------------------------------------------------------
create or replace function public.create_my_org(p_name text, p_prefix text default 'MSC') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role text; v_org uuid; v_cur uuid;
begin
  select role, org_id into v_role, v_cur from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('consultant', 'org_admin', 'operator') then
    raise exception '승인된 계정만 펌을 만들 수 있습니다';
  end if;
  if v_cur is not null then raise exception '이미 소속 펌이 있습니다'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception '상호를 입력해 주세요'; end if;
  insert into public.orgs (name, doc_prefix, kind, created_by)
  values (btrim(p_name), coalesce(nullif(regexp_replace(coalesce(p_prefix, ''), '[^A-Za-z0-9]', '', 'g'), ''), 'MSC'), 'solo', auth.uid())
  returning id into v_org;
  perform set_config('msc.self_org', '1', true);   -- 이 거래 안에서만 소속 지정 허용(아래 보호 트리거)
  update public.profiles
     set org_id = v_org, role = case when v_role = 'operator' then 'operator' else 'org_admin' end
   where id = auth.uid();
  insert into public.audit_logs (org_id, action, target_type, target_id, detail)
  values (v_org, 'org_create', 'org', v_org::text, jsonb_build_object('name', btrim(p_name)));
  return v_org;
end $$;

-- 보호 트리거: create_my_org 안에서 자기 소속을 정할 때만 통과시킨다(그 밖은 그대로 관리자만)
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.org_id is distinct from old.org_id) then
    if coalesce(current_setting('msc.self_org', true), '') = '1' and new.id = auth.uid() and old.org_id is null then
      null;   -- 자기 펌 만들기(create_my_org)
    else
      if not public.is_org_admin_of(coalesce(new.org_id, old.org_id)) then
        raise exception '역할·소속은 관리자만 바꿀 수 있습니다';
      end if;
      if new.role = 'operator' and not public.is_operator() then
        raise exception '운영자 권한은 운영자만 줄 수 있습니다';
      end if;
    end if;
    if new.role is distinct from old.role then
      new.approved_at := now();
      new.approved_by := auth.uid();
      insert into public.audit_logs (org_id, action, target_type, target_id, detail)
      values (coalesce(new.org_id, old.org_id), 'role_change', 'profile', new.id::text,
              jsonb_build_object('from', old.role, 'to', new.role));
    end if;
  end if;
  if new.email is distinct from old.email then
    raise exception '이메일은 바꿀 수 없습니다';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 7. 보이는 범위: 컨설턴트는 자기 것, 펌 관리자는 펌 전체, 운영자는 전체
-- ---------------------------------------------------------------------------
create or replace function public.can_see_owned(row_org uuid, row_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_operator()
      or (public.is_active_user() and row_org = public.my_org()
          and (row_owner = auth.uid() or public.my_role() = 'org_admin'))
$$;

drop policy if exists clients_rw  on public.clients;
drop policy if exists clients_ins on public.clients;
drop policy if exists clients_upd on public.clients;
drop policy if exists clients_del on public.clients;
create policy clients_read on public.clients for select using (public.can_see_owned(org_id, owner_id));
create policy clients_ins  on public.clients for insert with check (public.is_active_user() and org_id = public.my_org() and owner_id = auth.uid());
create policy clients_upd  on public.clients for update using (public.can_see_owned(org_id, owner_id)) with check (public.is_operator() or org_id = public.my_org());
create policy clients_del  on public.clients for delete using (public.is_org_admin_of(org_id));

drop policy if exists assess_read on public.assessments;
drop policy if exists assess_ins  on public.assessments;
drop policy if exists assess_upd  on public.assessments;
drop policy if exists assess_del  on public.assessments;
create policy assess_read on public.assessments for select using (public.can_see_owned(org_id, consultant_id));
create policy assess_ins  on public.assessments for insert with check (public.is_active_user() and org_id = public.my_org() and consultant_id = auth.uid());
create policy assess_upd  on public.assessments for update using (public.can_see_owned(org_id, consultant_id)) with check (public.is_operator() or org_id = public.my_org());
create policy assess_del  on public.assessments for delete using (public.is_org_admin_of(org_id));

grant execute on function public.create_my_org(text, text), public.can_see_owned(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. 확인 (SQL 편집기에서 실행 후)
--   select column_name from information_schema.columns where table_name = 'orgs' order by ordinal_position;
--   select policyname, tablename from pg_policies where tablename in ('clients', 'assessments') order by 2, 1;
-- ---------------------------------------------------------------------------
