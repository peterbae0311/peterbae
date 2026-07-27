import Link from "next/link";
import { getCategories, getEvents, getCalendarMonth, subCategoryCodes } from "@/lib/data";
import { selectedCategoryCodes, withParams, type ParamsInput } from "@/lib/query-string";
import { FilterPanelBody } from "@/components/FilterPanel";
import { EventCard } from "@/components/EventCard";
import { Pagination } from "@/components/Pagination";
import { CalendarView } from "@/components/CalendarView";
import type { FilterStatus } from "@/lib/types";

// 이벤트 목록은 수집 배치가 수시로 갱신하므로 fetch 캐시에 갇히지 않도록 정적 프리렌더를 끈다.
export const dynamic = "force-dynamic";

const DOMAINS = [
  { code: "CULTURE", label: "문화" },
  { code: "IND", label: "산업" },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const current = sp as ParamsInput;

  const domain = typeof sp.domain === "string" ? sp.domain : "CULTURE";
  const view = typeof sp.view === "string" ? sp.view : "card";
  const q = typeof sp.q === "string" ? sp.q : "";
  const sido = typeof sp.sido === "string" ? sp.sido : undefined;
  const status = typeof sp.status === "string" ? (sp.status as FilterStatus) : undefined;
  const page = typeof sp.page === "string" ? parseInt(sp.page, 10) || 1 : 1;

  const categories = await getCategories();
  const domainCodes = subCategoryCodes(categories, domain).map((c) => c.code);
  const catCodes = selectedCategoryCodes(sp, domainCodes);

  const filterAside = (
    <FilterPanelBody categories={categories} domainCodes={domainCodes} current={current} />
  );

  const now = new Date();
  const year = typeof sp.y === "string" ? parseInt(sp.y, 10) : now.getFullYear();
  const month = typeof sp.m === "string" ? parseInt(sp.m, 10) : now.getMonth() + 1;

  return (
    <div className="content-shell py-10">
      {/* GNB: 대분류 탭 + 검색 */}
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-ink/50 pb-6">
        <nav className="flex gap-3">
          {DOMAINS.map((d) => (
            <Link
              key={d.code}
              href={withParams(current, { domain: d.code, cat: null })}
              className={
                "px-1 pb-1 text-2xl font-black tracking-tight transition-colors md:text-4xl " +
                (domain === d.code ? "text-ink border-b-4 border-culture" : "text-line-strong hover:text-ink-muted")
              }
            >
              {d.label}
            </Link>
          ))}
        </nav>
        <form action="/" method="get" className="flex items-center gap-2 border-b border-ink/50 pb-1">
          <input type="hidden" name="domain" value={domain} />
          {sido ? <input type="hidden" name="sido" value={sido} /> : null}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="검색어를 입력하세요"
            className="w-64 bg-transparent py-1 text-sm placeholder:text-line-strong focus:outline-none"
          />
          <button type="submit" className="text-sm font-bold uppercase tracking-wide text-ink-muted hover:text-ink">
            검색
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-[220px_1fr]">
        <aside className="hidden md:block">
          <div className="sticky top-8 border-t border-line-strong pt-4">{filterAside}</div>
        </aside>

        <details className="border border-line-strong md:hidden">
          <summary className="cursor-pointer px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink-muted">필터</summary>
          <div className="border-t border-line p-3">{filterAside}</div>
        </details>

        <div>
          <div className="mb-6 flex items-center justify-between">
            <ResultSummary catCodes={catCodes} sido={sido} status={status} q={q} />
            <div className="flex gap-4 text-xs font-bold uppercase tracking-wide">
              <Link
                href={withParams(current, { view: "card" }, false)}
                className={view !== "calendar" ? "text-ink underline-grow" : "text-line-strong hover:text-ink-muted"}
              >
                카드
              </Link>
              <Link
                href={withParams(current, { view: "calendar" }, false)}
                className={view === "calendar" ? "text-ink underline-grow" : "text-line-strong hover:text-ink-muted"}
              >
                캘린더
              </Link>
            </div>
          </div>

          {view === "calendar" ? (
            <CalendarBlock catCodes={catCodes} sido={sido} year={year} month={month} sp={sp} current={current} />
          ) : (
            <ListBlock catCodes={catCodes} sido={sido} status={status} q={q} page={page} current={current} />
          )}
        </div>
      </div>
    </div>
  );
}

async function ResultSummary({
  catCodes,
  sido,
  status,
  q,
}: {
  catCodes: string[];
  sido?: string;
  status?: FilterStatus;
  q?: string;
}) {
  const { total } = await getEvents({ categoryCodes: catCodes, sido, status, q: q || undefined, page: 1, pageSize: 1 });
  return (
    <span className="text-sm text-ink-muted">
      <b className="text-lg font-black text-ink">{total.toLocaleString()}</b>건 · 기간순 정렬
    </span>
  );
}

async function ListBlock({
  catCodes,
  sido,
  status,
  q,
  page,
  current,
}: {
  catCodes: string[];
  sido?: string;
  status?: FilterStatus;
  q?: string;
  page: number;
  current: ParamsInput;
}) {
  const pageSize = 20;
  const { rows, total } = await getEvents({ categoryCodes: catCodes, sido, status, q: q || undefined, page, pageSize });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (rows.length === 0) {
    return (
      <div className="border border-line-strong p-16 text-center">
        <div className="mb-2 text-xl font-black">결과가 없습니다</div>
        <div className="text-sm text-ink-muted">필터를 해제하거나 다른 검색어로 시도해보세요.</div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {rows.map((ev) => (
          <EventCard key={ev.id} event={ev} />
        ))}
      </div>
      <Pagination current={current} page={page} totalPages={totalPages} />
    </>
  );
}

async function CalendarBlock({
  catCodes,
  sido,
  year,
  month,
  sp,
  current,
}: {
  catCodes: string[];
  sido?: string;
  year: number;
  month: number;
  sp: Record<string, string | string[] | undefined>;
  current: ParamsInput;
}) {
  const selectedDay = typeof sp.day === "string" ? sp.day : new Date().toISOString().slice(0, 10);
  const { events } = await getCalendarMonth(year, month, { categoryCodes: catCodes, sido });
  return <CalendarView year={year} month={month} events={events} selectedDay={selectedDay} current={{ ...current, y: String(year), m: String(month) }} />;
}
