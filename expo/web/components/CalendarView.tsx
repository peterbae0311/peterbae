import Link from "next/link";
import type { EventRow } from "@/lib/types";
import { decodeEntities } from "@/lib/types";
import { withParams, type ParamsInput } from "@/lib/query-string";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function eachDateInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function CalendarView({
  year,
  month,
  events,
  selectedDay,
  current,
}: {
  year: number;
  month: number;
  events: EventRow[];
  selectedDay: string;
  current: ParamsInput;
}) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEndDate = new Date(year, month, 0);
  const firstWeekday = monthStart.getDay();
  const daysInMonth = monthEndDate.getDate();

  const byDay = new Map<string, EventRow[]>();
  for (const ev of events) {
    const end = ev.end_date ?? ev.start_date;
    for (const day of eachDateInRange(ev.start_date, end)) {
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(ev);
    }
  }

  const cells: { date: string | null }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const selectedEvents = byDay.get(selectedDay) ?? [];

  return (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-6 flex items-end justify-between border-b border-ink/50 pb-4">
          <span className="text-3xl font-black tracking-tight">
            {year}<span className="text-culture">.</span>{String(month).padStart(2, "0")}
          </span>
          <div className="flex gap-6 text-sm font-bold uppercase tracking-wide">
            <Link href={withParams(current, { y: String(prevMonth.y), m: String(prevMonth.m) }, false)} className="underline-grow text-ink-muted hover:text-ink">
              ‹ 이전 달
            </Link>
            <Link href={withParams(current, { y: String(nextMonth.y), m: String(nextMonth.m) }, false)} className="underline-grow text-ink-muted hover:text-ink">
              다음 달 ›
            </Link>
          </div>
        </div>

        <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px border border-line bg-line">
          {cells.map((cell, i) => {
            if (!cell.date) return <div key={i} className="min-h-[100px] bg-paper" />;
            const dayEvents = byDay.get(cell.date) ?? [];
            const isToday = cell.date === todayIso;
            const isSelected = cell.date === selectedDay;
            const shown = dayEvents.slice(0, 4);
            const overflow = dayEvents.length - shown.length;
            return (
              <Link
                key={cell.date}
                href={withParams(current, { day: cell.date }, false)}
                className={
                  "min-h-[100px] p-2 text-[10px] transition-colors " +
                  (isSelected ? "bg-ink text-paper" : "bg-surface hover:bg-line/40")
                }
              >
                <div className={"text-sm font-black " + (isToday && !isSelected ? "text-culture" : "")}>
                  {Number(cell.date.slice(-2))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {shown.map((ev) => (
                    <span
                      key={ev.id}
                      className={
                        "h-1.5 w-1.5 rounded-full " +
                        (isSelected ? "bg-paper" : ev.exh_categories?.parent_code === "IND" ? "bg-industry" : "bg-culture")
                      }
                    />
                  ))}
                </div>
                {overflow > 0 ? <div className={"mt-1 " + (isSelected ? "text-paper/70" : "text-ink-muted")}>+{overflow}</div> : null}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="border-t border-line-strong pt-4">
        <div className="mb-4 text-sm font-black">
          {selectedDay} <span className="text-ink-muted font-bold">· {selectedEvents.length}건</span>
        </div>
        <div className="flex flex-col">
          {selectedEvents.length === 0 ? (
            <p className="text-xs text-ink-muted">이 날짜에는 이벤트가 없습니다.</p>
          ) : (
            selectedEvents.slice(0, 30).map((ev) => (
              <Link key={ev.id} href={`/events/${ev.id}`} className="group border-b border-line py-3 text-xs last:border-none">
                <div className="font-bold group-hover:text-culture">{decodeEntities(ev.title)}</div>
                <div className="mt-1 text-ink-muted">
                  {ev.event_time ? decodeEntities(ev.event_time).replace(/<br\s*\/?>/gi, " ").trim() + " " : ""}
                  {ev.exh_venues?.name ?? ev.region_sido ?? ""}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
