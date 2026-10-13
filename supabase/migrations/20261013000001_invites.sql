-- MSC Report Generator — 사전 등록(초대)
-- 운영자·펌 관리자가 이메일과 역할을 미리 적어 두면, 그 사람이 처음 구글 로그인할 때
-- '승인 대기'를 거치지 않고 정해 둔 역할·소속으로 바로 시작한다.

create table public.invites (
  email       text primary key check (email = lower(email)),
  role        text not null check (role in ('consultant', 'org_admin')),
  org_id      uuid not null references public.orgs (id),
  invited_by  uuid references auth.users (id) default auth.uid(),
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.invites enable row level security;

-- 운영자는 전체, 펌 관리자는 자기 펌 초대만 보고 만들고 지운다. 펌 관리자 초대는 운영자만.
create policy invites_select on public.invites for select to authenticated
  using (public.is_operator() or public.is_org_admin_of(org_id));
create policy invites_insert on public.invites for insert to authenticated
  with check ((public.is_operator() or public.is_org_admin_of(org_id))
              and (role = 'consultant' or public.is_operator()));
create policy invites_delete on public.invites for delete to authenticated
  using (public.is_operator() or public.is_org_admin_of(org_id));

grant select, insert, delete on public.invites to authenticated;

-- 가입 트리거: 초대가 있으면 그 역할·소속으로, 없으면 '승인 대기'
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
begin
  select * into inv from public.invites where email = lower(new.email) and used_at is null;
  insert into public.profiles (id, email, name, role, org_id, approved_at)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
          coalesce(inv.role, 'pending'), inv.org_id,
          case when inv.email is not null then now() end);
  if inv.email is not null then
    update public.invites set used_at = now() where email = inv.email;
  end if;
  insert into public.audit_logs (user_id, org_id, action, target_type, target_id, detail)
  values (new.id, inv.org_id, 'signup', 'profile', new.id::text,
          jsonb_build_object('invited', inv.email is not null, 'role', coalesce(inv.role, 'pending')));
  return new;
end $$;

-- 펌·초대 등록 예 (SQL 편집기에서 운영자가 실행, 이메일은 저장소에 남기지 않는다)
--   insert into public.orgs (name) values ('코스텝') returning id;
--   insert into public.invites (email, role, org_id) values ('<관리자 이메일>', 'org_admin', '<위 id>');
