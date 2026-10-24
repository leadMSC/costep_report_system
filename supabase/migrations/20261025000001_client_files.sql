-- 담당자가 올린 원본 서류 보관 (작업로그 L-152)
-- 서류 창에 올린 원본(PDF·사진·엑셀·메모)을 비공개 저장소에 두고, 펌 관리자(대표)와 올린 담당자만 목록·내려받기.
-- 사용자 결정(2026-10-25): 신분증 포함 전부 보관, 자동 삭제 없음(관리자·올린 사람이 지울 때까지).
-- 저장 경로: client-docs/<펌 id>/<올린 사람 id>/<파일 id>.<확장자>  (원래 이름은 표의 file_name)

-- 1) 비공개 저장소(50MB 한도 = 앱 업로드 한도)
insert into storage.buckets (id, name, public, file_size_limit)
values ('client-docs', 'client-docs', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- 경로 글자 → uuid (형식이 아니면 null — 정책 계산 중 오류가 나지 않게)
create or replace function public.try_uuid(t text) returns uuid
language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

-- 2) 서류 대장
create table if not exists public.client_files (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  uploader_id   uuid not null default auth.uid() references auth.users(id),
  client_id     uuid references public.clients(id) on delete set null,
  assessment_id uuid references public.assessments(id) on delete set null,
  client_name   text,
  file_name     text not null,
  path          text not null unique,
  size          bigint,
  mime          text,
  kind          text,
  created_at    timestamptz not null default now()
);
create index if not exists client_files_org_idx on public.client_files (org_id, created_at desc);
create index if not exists client_files_client_idx on public.client_files (client_id);
alter table public.client_files enable row level security;

drop policy if exists cfiles_read on public.client_files;
drop policy if exists cfiles_ins on public.client_files;
drop policy if exists cfiles_del on public.client_files;
-- 읽기: 올린 사람 · 같은 펌 관리자 · 운영자 (고객·진단 건과 같은 규칙)
create policy cfiles_read on public.client_files for select using (public.can_see_owned(org_id, uploader_id));
-- 쓰기: 승인된 사용자가 자기 펌·자기 이름으로만
create policy cfiles_ins on public.client_files for insert with check (public.is_active_user() and org_id = public.my_org() and uploader_id = auth.uid());
-- 지우기: 펌 관리자·운영자 · 올린 사람
create policy cfiles_del on public.client_files for delete using (public.is_org_admin_of(org_id) or (public.is_active_user() and uploader_id = auth.uid()));

-- 3) 저장소 파일 권한 (경로 첫 칸 = 펌, 둘째 칸 = 올린 사람)
drop policy if exists cdocs_ins on storage.objects;
drop policy if exists cdocs_read on storage.objects;
drop policy if exists cdocs_del on storage.objects;
create policy cdocs_ins on storage.objects for insert to authenticated with check (
  bucket_id = 'client-docs' and public.is_active_user()
  and public.try_uuid((storage.foldername(name))[1]) = public.my_org()
  and (storage.foldername(name))[2] = auth.uid()::text
);
create policy cdocs_read on storage.objects for select to authenticated using (
  bucket_id = 'client-docs' and public.can_see_owned(public.try_uuid((storage.foldername(name))[1]), public.try_uuid((storage.foldername(name))[2]))
);
create policy cdocs_del on storage.objects for delete to authenticated using (
  bucket_id = 'client-docs' and (
    public.is_org_admin_of(public.try_uuid((storage.foldername(name))[1]))
    or (public.is_active_user() and (storage.foldername(name))[2] = auth.uid()::text)
  )
);
