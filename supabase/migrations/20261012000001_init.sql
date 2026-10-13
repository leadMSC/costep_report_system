-- MSC Report Generator (경영지원센터 리포트 생성기) — 초기 스키마
-- 대상: Supabase 프로젝트 msc-report-generator (서울)
-- 원칙
--   * 첫 로그인 사용자는 '대기(pending)' — 운영자나 펌 관리자가 승인해야 쓸 수 있다
--   * 같은 컨설팅펌(org) 데이터만 보인다 (행 단위 보호 RLS)
--   * 발행 문서 대장(documents)과 접속·행위 기록(audit_logs)은 고칠 수 없다
--   * 공고(programs)는 승인된 사용자 모두 읽고, 쓰기는 서버(수집 작업)만 한다

-- ---------------------------------------------------------------------------
-- 1. 표
-- ---------------------------------------------------------------------------
create table public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                       -- 컨설팅펌 상호
  logo_path   text,                                -- Storage 경로
  seal_path   text,                                -- 직인 이미지 Storage 경로
  address     text,
  phone       text,
  homepage    text,
  doc_prefix  text not null default 'MSC',         -- 문서번호 접두어
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  name         text,
  title        text,                                -- 직함 (예: 경영컨설턴트)
  org_id       uuid references public.orgs (id),
  role         text not null default 'pending'
               check (role in ('pending', 'consultant', 'org_admin', 'operator', 'blocked')),
  senior_mode  boolean not null default false,
  approved_at  timestamptz,
  approved_by  uuid references auth.users (id),
  created_at   timestamptz not null default now()
);

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id),
  name        text not null,                       -- 수진기업 상호
  biz_no      text,
  created_by  uuid not null references auth.users (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.assessments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id),
  client_id       uuid not null references public.clients (id) on delete cascade,
  consultant_id   uuid not null references auth.users (id) default auth.uid(),
  biz_track       text not null check (biz_track in ('smb', 'small', 'sme')),
  industry_track  text not null,
  form_data       jsonb not null,                  -- 화면 collectFormData() 결과 그대로
  status          text not null default 'draft' check (status in ('draft', 'final')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.doc_sequences (
  org_id   uuid not null references public.orgs (id),
  year     int  not null,
  last_no  int  not null default 0,
  primary key (org_id, year)
);

create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs (id),
  assessment_id  uuid not null references public.assessments (id),
  doc_no         text not null,
  sheet_type     text not null check (sheet_type in ('official', 'report', 'guide', 'bplan', 'all')),
  report_key     text not null,
  html_snapshot  text not null,                    -- 발행 시점 본문 사본
  issued_by      uuid not null references auth.users (id) default auth.uid(),
  issued_at      timestamptz not null default now(),
  unique (org_id, doc_no)
);

create table public.programs (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,                     -- bizinfo / kstartup / kocca / manual
  source_id     text not null,
  title         text not null,
  agency        text,
  category      text,
  apply_start   date,
  apply_end     date,
  url           text,
  requirements  jsonb not null default '{}'::jsonb, -- 업력·매출·인원·지역·업종·인증·규모 (구조화)
  raw           jsonb,
  fetched_at    timestamptz not null default now(),
  unique (source, source_id)
);

create table public.recommendations (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references public.assessments (id) on delete cascade,
  program_id     uuid not null references public.programs (id),
  score          numeric,
  reasons        jsonb not null default '[]'::jsonb, -- 충족 / 미충족 / 확인 필요 사유
  phase          text check (phase in ('now', 'prepare', 'next_year')),
  created_at     timestamptz not null default now(),
  unique (assessment_id, program_id)
);

create table public.audit_logs (
  id           bigint generated always as identity primary key,
  user_id      uuid references auth.users (id) default auth.uid(),
  org_id       uuid references public.orgs (id),
  action       text not null,                      -- login / view / save / issue / approve / block ...
  target_type  text,
  target_id    text,
  detail       jsonb,
  created_at   timestamptz not null default now()
);

create index on public.clients (org_id);
create index on public.assessments (org_id, client_id);
create index on public.documents (org_id, issued_at desc);
create index on public.audit_logs (org_id, created_at desc);
create index on public.audit_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. 권한 판단 함수 (RLS 안에서 profiles 를 다시 읽지 않도록 security definer)
-- ---------------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('consultant', 'org_admin', 'operator'), false)
$$;

create or replace function public.is_operator() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'operator', false)
$$;

create or replace function public.is_org_admin_of(target_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_operator() or (public.my_role() = 'org_admin' and public.my_org() = target_org)
$$;

-- ---------------------------------------------------------------------------
-- 3. 가입 시 프로필 자동 생성 (항상 '대기')
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  insert into public.audit_logs (user_id, action, target_type, target_id)
  values (new.id, 'signup', 'profile', new.id::text);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 본인은 이름·직함·시니어모드만 바꿀 수 있다. 역할·소속은 관리자만.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.org_id is distinct from old.org_id) then
    if not public.is_org_admin_of(coalesce(new.org_id, old.org_id)) then
      raise exception '역할·소속은 관리자만 바꿀 수 있습니다';
    end if;
    if new.role = 'operator' and not public.is_operator() then
      raise exception '운영자 권한은 운영자만 줄 수 있습니다';
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

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- 문서번호: 펌별·연도별 일련번호 (예: MSC-2026-0007)
create or replace function public.next_doc_no(target_org uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from now() at time zone 'Asia/Seoul');
  n int;
  prefix text;
begin
  if not (public.is_active_user() and (public.my_org() = target_org or public.is_operator())) then
    raise exception '문서번호를 받을 권한이 없습니다';
  end if;
  insert into public.doc_sequences (org_id, year, last_no) values (target_org, y, 1)
  on conflict (org_id, year) do update set last_no = public.doc_sequences.last_no + 1
  returning last_no into n;
  select doc_prefix into prefix from public.orgs where id = target_org;
  return format('%s-%s-%s', coalesce(prefix, 'MSC'), y, lpad(n::text, 4, '0'));
end $$;

-- ---------------------------------------------------------------------------
-- 4. 행 단위 보호 (RLS)
-- ---------------------------------------------------------------------------
alter table public.orgs            enable row level security;
alter table public.profiles        enable row level security;
alter table public.clients         enable row level security;
alter table public.assessments     enable row level security;
alter table public.doc_sequences   enable row level security;
alter table public.documents       enable row level security;
alter table public.programs        enable row level security;
alter table public.recommendations enable row level security;
alter table public.audit_logs      enable row level security;

-- orgs: 소속원 읽기, 펌 관리자·운영자 수정, 운영자 생성
create policy orgs_read   on public.orgs for select using (public.is_operator() or (public.is_active_user() and id = public.my_org()));
create policy orgs_update on public.orgs for update using (public.is_org_admin_of(id)) with check (public.is_org_admin_of(id));
create policy orgs_insert on public.orgs for insert with check (public.is_operator());

-- profiles: 본인 읽기·수정(대기·차단 상태도 본인 상태 확인 가능), 관리자는 소속원 전체
create policy profiles_read_self  on public.profiles for select using (id = auth.uid());
create policy profiles_read_admin on public.profiles for select using (public.is_operator() or (org_id is not null and public.is_org_admin_of(org_id)) or (org_id is null and public.my_role() = 'org_admin'));
-- 수정 대상: 본인 / 운영자는 전체 / 펌 관리자는 자기 펌 소속원과 소속 없는 대기자(승인용). 바꿀 수 있는 칸은 guard_profile_update 트리거가 막는다
create policy profiles_update     on public.profiles for update
  using (id = auth.uid() or public.is_operator() or (public.my_role() = 'org_admin' and (org_id = public.my_org() or org_id is null)))
  with check (id = auth.uid() or public.is_operator() or (public.my_role() = 'org_admin' and org_id = public.my_org()));

-- clients / assessments: 같은 펌 승인 사용자, 삭제는 관리자
create policy clients_rw    on public.clients for select using (public.is_operator() or (public.is_active_user() and org_id = public.my_org()));
create policy clients_ins   on public.clients for insert with check (public.is_active_user() and org_id = public.my_org());
create policy clients_upd   on public.clients for update using (public.is_active_user() and org_id = public.my_org()) with check (org_id = public.my_org());
create policy clients_del   on public.clients for delete using (public.is_org_admin_of(org_id));

create policy assess_read   on public.assessments for select using (public.is_operator() or (public.is_active_user() and org_id = public.my_org()));
create policy assess_ins    on public.assessments for insert with check (public.is_active_user() and org_id = public.my_org());
create policy assess_upd    on public.assessments for update using (public.is_active_user() and org_id = public.my_org()) with check (org_id = public.my_org());
create policy assess_del    on public.assessments for delete using (public.is_org_admin_of(org_id));

-- documents: 같은 펌 읽기·발행(추가)만. 수정·삭제 정책 없음 = 불가
create policy docs_read on public.documents for select using (public.is_operator() or (public.is_active_user() and org_id = public.my_org()));
create policy docs_ins  on public.documents for insert with check (public.is_active_user() and org_id = public.my_org());

-- programs: 승인 사용자 읽기 (쓰기는 서버 수집 작업이 service role 로)
create policy programs_read on public.programs for select using (public.is_active_user());

-- recommendations: 진단 건의 펌 기준
create policy rec_read on public.recommendations for select using (
  exists (select 1 from public.assessments a where a.id = assessment_id and (public.is_operator() or (public.is_active_user() and a.org_id = public.my_org()))));
create policy rec_write on public.recommendations for insert with check (
  exists (select 1 from public.assessments a where a.id = assessment_id and public.is_active_user() and a.org_id = public.my_org()));

-- audit_logs: 본인 이름으로만 추가, 읽기는 펌 관리자(자기 펌)·운영자. 수정·삭제 불가
create policy audit_ins  on public.audit_logs for insert with check (user_id = auth.uid());
create policy audit_read on public.audit_logs for select using (public.is_operator() or (org_id is not null and public.is_org_admin_of(org_id)));

-- doc_sequences: 직접 접근 없음 (next_doc_no 함수로만)

-- ---------------------------------------------------------------------------
-- 5. Data API 권한 (프로젝트 설정: 새 표 자동 공개 꺼짐 → 필요한 것만 명시)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.clients, public.assessments to authenticated;
grant select, update on public.orgs to authenticated;
grant insert on public.orgs to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert on public.documents, public.recommendations, public.audit_logs to authenticated;
grant select on public.programs to authenticated;
grant execute on function public.next_doc_no(uuid), public.my_role(), public.my_org(), public.is_active_user(),
  public.is_operator(), public.is_org_admin_of(uuid) to authenticated;
-- 로그인하지 않은 사용자(anon)에게는 아무 표도 열지 않는다.

-- ---------------------------------------------------------------------------
-- 6. 첫 운영자 지정 (구글 로그인으로 한 번 들어온 뒤 SQL 편집기에서 직접 실행)
--   update public.profiles set role = 'operator' where email = '<운영자 이메일>';
--   (트리거는 auth.uid() 가 없는 SQL 편집기 실행에서 is_org_admin_of 검사를 통과하지 못하므로,
--    첫 지정만은 아래처럼 트리거를 잠시 끄고 실행한다)
--   alter table public.profiles disable trigger guard_profile_update;
--   update public.profiles set role = 'operator', approved_at = now() where email = '<운영자 이메일>';
--   alter table public.profiles enable trigger guard_profile_update;
-- ---------------------------------------------------------------------------
