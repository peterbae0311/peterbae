import Link from "next/link";
import type { CategoryRow, FilterStatus } from "@/lib/types";
import { REGIONS } from "@/lib/regions";
import { toggleCategoryHref, withParams, type ParamsInput } from "@/lib/query-string";

const STATUS_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: "ongoing", label: "진행중" },
  { value: "upcoming", label: "예정" },
  { value: "ended", label: "종료" },
  { value: "all", label: "전체(종료 포함)" },
];

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        "border px-2.5 py-1 text-[11px] font-bold transition-colors " +
        (active
          ? "border-ink/70 bg-ink text-paper"
          : "border-line-strong text-ink-muted hover:border-ink/60 hover:text-ink")
      }
    >
      {children}
    </Link>
  );
}

export function FilterPanelBody({
  categories,
  domainCodes,
  current,
}: {
  categories: CategoryRow[];
  domainCodes: string[];
  current: ParamsInput;
}) {
  const rawCat = typeof current.cat === "string" ? current.cat : undefined;
  const selectedCats = rawCat && rawCat.length > 0 ? rawCat.split(",") : [];
  const sido = typeof current.sido === "string" ? current.sido : undefined;
  const status = typeof current.status === "string" ? (current.status as FilterStatus) : undefined;

  const subCategories = categories.filter((c) => domainCodes.includes(c.code));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2.5 text-[11px] font-black uppercase tracking-[0.1em] text-ink">중분류</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip href={withParams(current, { cat: null })} active={selectedCats.length === 0}>
            전체
          </Chip>
          {subCategories.map((c) => (
            <Chip key={c.code} href={toggleCategoryHref(current, c.code)} active={selectedCats.includes(c.code)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2.5 text-[11px] font-black uppercase tracking-[0.1em] text-ink">지역</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip href={withParams(current, { sido: null })} active={!sido}>
            전체
          </Chip>
          {REGIONS.map((r) => (
            <Chip key={r} href={withParams(current, { sido: sido === r ? null : r })} active={sido === r}>
              {r}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2.5 text-[11px] font-black uppercase tracking-[0.1em] text-ink">진행상태</div>
        <p className="mb-1.5 text-[10.5px] text-ink-muted">기본은 진행중+예정만 표시</p>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <Chip key={s.value} href={withParams(current, { status: status === s.value ? null : s.value })} active={status === s.value}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <Link
        href={withParams(current, { cat: null, sido: null, status: null, from: null, to: null, q: null })}
        className="underline-grow border-t border-line pt-3 text-center text-[11px] font-bold uppercase tracking-wide text-ink-muted"
      >
        필터 초기화
      </Link>
    </div>
  );
}
