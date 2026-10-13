-- MSC Report Generator — 승인 대기자 보호
-- 기존 정책은 어느 펌 관리자든 소속 없는 승인 대기자 전원을 읽고 자기 펌으로 데려갈 수 있었다.
-- 승인 대기자(소속 없음)는 운영자만 보고 승인한다. 펌 관리자는 자기 펌 소속원만 보고 바꾼다.
-- 펌 관리자가 새 컨설턴트를 들이는 길은 사전 등록(invites) — 첫 로그인 때 그 펌으로 바로 들어온다.

drop policy if exists profiles_read_admin on public.profiles;
create policy profiles_read_admin on public.profiles for select
  using (public.is_operator() or (org_id is not null and public.is_org_admin_of(org_id)));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_operator() or (public.my_role() = 'org_admin' and org_id = public.my_org()))
  with check (id = auth.uid() or public.is_operator() or (public.my_role() = 'org_admin' and org_id = public.my_org()));
