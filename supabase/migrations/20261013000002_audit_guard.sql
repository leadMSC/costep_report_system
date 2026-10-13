-- MSC Report Generator — 접속·작업 기록 보호
-- 기록은 본인 이름으로만, 소속 펌은 자기 펌(또는 비움)으로만 남길 수 있다. 운영자는 예외.

drop policy if exists audit_ins on public.audit_logs;
create policy audit_ins on public.audit_logs for insert to authenticated
  with check (user_id = auth.uid() and (org_id is null or org_id = public.my_org() or public.is_operator()));
