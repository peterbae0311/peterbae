import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getEventById } from "@/lib/data";
import { computeStatus, statusLabel, displayVenue, displayRegion, displayDateRange, decodeEntities, toMultiline, isOverseasEvent } from "@/lib/types";
import { EventImage } from "@/components/EventImage";
import { VenuePlaceButton } from "@/components/VenuePlaceButton";

// 이벤트 데이터가 수시로 갱신되므로 fetch 캐시에 갇히지 않도록 정적 프리렌더를 끔다.
export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  const status = computeStatus(event.start_date, event.end_date);
  const isIndustry = event.exh_categories?.parent_code === "IND";
  const domainLabel = isIndustry ? "산업" : "문화";
  const categoryLabel = event.exh_categories?.name ?? "기타";
  const region = displayRegion(event);
  const listHref = isIndustry ? "/?domain=IND" : "/?domain=CULTURE";

  return (
    <div className="content-shell py-10">
      <div className="mb-6 text-xs font-bold uppercase tracking-wide text-ink-muted">
        <Link href={listHref} className="underline-grow hover:text-ink">
          목록
        </Link>{" "}
        / {categoryLabel}
      </div>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-[340px_1fr]">
        <div className="aspect-[3/4] w-full bg-line/30">
          <EventImage
            src={event.image_url}
            alt=""
            imgClassName="h-full w-full object-contain"
            fallbackClassName="h-full w-full bg-gradient-to-br from-culture/30 to-line"
          />
        </div>

        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className={"px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white " + (isIndustry ? "bg-industry" : "bg-culture")}>
              {domainLabel} · {categoryLabel}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{statusLabel(status)}</span>
          </div>

          <h1 className="mb-8 text-3xl font-black leading-tight tracking-tight md:text-4xl">
            {decodeEntities(event.title)}
          </h1>

          <dl className="border-t border-ink/50 text-sm">
            <Row k="기간" v={displayDateRange(event)} />
            {event.event_time ? <Row k="시간" v={toMultiline(event.event_time)} pre /> : null}
            <Row
              k="장소"
              v={
                <VenuePlaceButton
                  venueName={decodeEntities(displayVenue(event))}
                  isOverseas={isOverseasEvent(event)}
                  className="hover:underline"
                />
              }
            />
            {region ? <Row k="지역" v={region} /> : null}
            {event.price_info ? <Row k="요금" v={decodeEntities(event.price_info)} /> : null}
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            {event.source_url ? (
              <a
                href={event.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-ink px-6 py-3 text-center text-sm font-bold text-paper transition-opacity hover:opacity-80"
              >
                원문에서 보기 ↗
              </a>
            ) : null}
            <Link href={listHref} className="border border-line-strong px-6 py-3 text-center text-sm font-bold text-ink-muted hover:border-ink/60 hover:text-ink">
              ← 목록으로
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, pre }: { k: string; v: ReactNode; pre?: boolean }) {
  return (
    <div className="flex gap-6 border-b border-line py-4">
      <dt className="w-16 shrink-0 pt-0.5 text-xs font-bold uppercase tracking-wide text-ink-muted">{k}</dt>
      <dd className={pre ? "whitespace-pre-line" : undefined}>{v}</dd>
    </div>
  );
}
