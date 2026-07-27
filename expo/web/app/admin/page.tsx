import { getAdminSourceStatus, getPendingMappings } from "@/lib/data";

// 소스 동기화 상태/큐는 요청 시점 최신값을 봐야 하므로 정적 프리렌더를 끈다.
export const dynamic = "force-dynamic";

const STATUS_DOT: Record<string, string> = {
  success: "bg-[#1f6b1f]",
  partial: "bg-industry",
  failed: "bg-red-600",
};

export default async function AdminPage() {
  const [sources, pending] = await Promise.all([getAdminSourceStatus(), getPendingMappings()]);

  const totalEvents = sources.reduce((sum, s) => sum + s.event_count, 0);
  const activeCount = sources.filter((s) => s.is_active).length;
  const connectedCount = sources.filter((s) => s.event_count > 0).length;

  return (
    <div className="content-shell py-10">
      <h1 className="mb-8 border-b border-ink/50 pb-6 text-3xl font-black tracking-tight">관리자 대시보드</h1>

      <div className="mb-10 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
        <Tile n={sources.length} l="등록 소스" />
        <Tile n={activeCount} l="활성 소스" />
        <Tile n={connectedCount} l="연동 완료" />
        <Tile n={totalEvents.toLocaleString()} l="전체 이벤트" />
      </div>

      <div className="mb-10 overflow-x-auto border border-line">
        <table className="w-full min-w-[600px] border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-line-strong text-left text-[9.5px] uppercase tracking-wide text-ink-muted">
              <th className="px-3 py-2">소스</th>
              <th className="px-3 py-2">대분류</th>
              <th className="px-3 py-2">활성</th>
              <th className="px-3 py-2">최근 동기화</th>
              <th className="px-3 py-2">결과</th>
              <th className="px-3 py-2 text-right">적재 건수</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.code} className="border-b border-line last:border-none">
                <td className="px-3 py-2 font-semibold">{s.name}</td>
                <td className="px-3 py-2 text-ink-muted">{s.domain}</td>
                <td className="px-3 py-2">{s.is_active ? "●" : "—"}</td>
                <td className="px-3 py-2 text-ink-muted">{s.last_sync_at ? new Date(s.last_sync_at).toLocaleString("ko-KR") : "-"}</td>
                <td className="px-3 py-2">
                  {s.last_sync_status ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className={"inline-block h-1.5 w-1.5 rounded-full " + (STATUS_DOT[s.last_sync_status] ?? "bg-ink-muted")} />
                      {s.last_sync_status}
                      {s.last_processed !== null ? ` (${s.last_processed}/${s.last_failed})` : ""}
                    </span>
                  ) : (
                    <span className="text-ink-muted">기록 없음</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{s.event_count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
        카테고리 매핑 확인 큐 ({pending.length}건)
      </h2>
      <div className="flex flex-col gap-1.5">
        {pending.length === 0 ? (
          <p className="text-[11px] text-ink-muted">미확정 매핑이 없습니다.</p>
        ) : (
          pending.map((p, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-dashed border-line-strong px-3 py-2 text-[11px]">
              <span>
                {p.source_code} · 원본값 &quot;{p.raw_value}&quot; → 임시분류 {p.mapped_category_code}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Tile({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="bg-surface p-5">
      <div className="text-3xl font-black">{n}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-ink-muted">{l}</div>
    </div>
  );
}
