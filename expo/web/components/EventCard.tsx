import Link from "next/link";
import type { EventRow } from "@/lib/types";
import { computeStatus, statusLabel, displayVenue, displayDateRange, decodeEntities, isOverseasEvent } from "@/lib/types";
import { EventImage } from "@/components/EventImage";
import { VenuePlaceButton } from "@/components/VenuePlaceButton";

export function EventCard({ event }: { event: EventRow }) {
  const status = computeStatus(event.start_date, event.end_date);
  const isIndustry = event.exh_categories?.parent_code === "IND";

  return (
    <Link href={`/events/${event.id}`} className="group block">
      <div className="img-zoom relative aspect-[4/3] bg-line/30">
        <EventImage
          src={event.image_url}
          alt=""
          imgClassName="h-full w-full object-contain"
          fallbackClassName="h-full w-full bg-gradient-to-br from-culture/20 to-line"
        />
        <span
          className={
            "absolute right-0 top-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white " +
            (isIndustry ? "bg-industry" : "bg-culture")
          }
        >
          {statusLabel(status)}
        </span>
      </div>
      <div className="pt-3">
        {event.exh_categories?.name ? (
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-ink-muted">
            {event.exh_categories.name}
          </div>
        ) : null}
        <div className="line-clamp-2 min-h-[2.75rem] text-[15px] font-extrabold leading-snug tracking-tight group-hover:text-culture">
          {decodeEntities(event.title)}
        </div>
        <div className="mt-1 text-[11px] font-bold tabular-nums text-ink-muted">{displayDateRange(event)}</div>
        <VenuePlaceButton
          venueName={decodeEntities(displayVenue(event))}
          isOverseas={isOverseasEvent(event)}
          className="mt-0.5 w-full text-[12px] text-ink-muted"
        />
      </div>
    </Link>
  );
}
