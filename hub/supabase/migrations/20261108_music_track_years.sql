-- music 인기곡 탭 '최근 곡' 보기: 곡의 첫 발매 연도(MusicBrainz) 저장소.
-- MusicBrainz는 초당 1회 제한이라 곡마다 1~2초씩 걸려, 한 번 확인한 연도를 여기 저장해 모든 PC·배포 이후에도 다시 쓴다.
-- 매일 밤 GitHub Actions(music-years.yml)가 세부 장르 후보곡의 연도를 미리 채워 둔다.
--
-- key: lower(가수) || E'\t' || lower(제목) — Postgres text에는 NUL을 넣을 수 없어 탭으로 구분한다
-- year: 찾지 못했으면 null(다시 찾지 않도록 '확인함'으로 기록)
create table if not exists public.music_track_years (
  key        text primary key,
  artist     text not null,
  title      text not null,
  year       integer,
  checked_at timestamptz not null default now()
);

-- 허브 서버(서비스 롤)와 야간 작업만 읽고 쓴다. 정책이 없으니 anon·로그인 사용자는 직접 접근할 수 없다
alter table public.music_track_years enable row level security;
