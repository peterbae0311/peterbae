import Link from "next/link";
import { withParams, type ParamsInput } from "@/lib/query-string";

export function Pagination({ current, page, totalPages }: { current: ParamsInput; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let p = start; p <= end; p++) pages.push(p);

  return (
    <div className="mt-10 flex items-center justify-center gap-2 border-t border-line pt-8 text-sm font-bold">
      {page > 1 ? (
        <Link href={withParams(current, { page: String(page - 1) }, false)} className="px-2 text-ink-muted hover:text-ink">
          ‹ 이전
        </Link>
      ) : (
        <span className="px-2 text-line-strong">‹ 이전</span>
      )}
      <span className="mx-2 flex gap-3">
        {pages.map((p) => (
          <Link
            key={p}
            href={withParams(current, { page: String(p) }, false)}
            className={p === page ? "text-culture underline-grow" : "text-ink-muted hover:text-ink"}
          >
            {p}
          </Link>
        ))}
      </span>
      {page < totalPages ? (
        <Link href={withParams(current, { page: String(page + 1) }, false)} className="px-2 text-ink-muted hover:text-ink">
          다음 ›
        </Link>
      ) : (
        <span className="px-2 text-line-strong">다음 ›</span>
      )}
    </div>
  );
}
