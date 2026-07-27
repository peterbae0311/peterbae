'use client';

import { useState } from 'react';
import { DayData, SessionType, SelectedSession } from '@/lib/types';

interface SessionTreeProps {
  days: DayData[];
  selected: SelectedSession | null;
  onSelect: (selection: SelectedSession) => void;
}

const SESSION_ICONS: Record<SessionType, string> = {
  daymarket:   '☀️',
  premarket:   '🌅',
  regular:     '🔔',
  aftermarket: '🌙',
};

// KST 기준 거래 시간 (EST: 11월~3월 / EDT: 3월~11월, 1시간 앞당겨짐)
const SESSION_HOURS: Record<SessionType, { est: string; edt: string }> = {
  daymarket:   { est: '10:00 ~ 18:00', edt: '09:00 ~ 17:00' },
  premarket:   { est: '18:00 ~ 23:30', edt: '17:00 ~ 22:30' },
  regular:     { est: '23:30 ~ 익일 06:00', edt: '22:30 ~ 익일 05:00' },
  aftermarket: { est: '06:00 ~ 10:00', edt: '05:00 ~ 09:00' },
};

// 현재 서머타임(EDT) 여부 — 3월 둘째 일요일 ~ 11월 첫째 일요일
function isEDT(): boolean {
  const now = new Date();
  const year = now.getFullYear();
  const mar = new Date(year, 2, 1);
  const dstStart = new Date(year, 2, 8 + ((7 - mar.getDay()) % 7)); // 3월 둘째 일요일
  const nov = new Date(year, 10, 1);
  const dstEnd = new Date(year, 10, 1 + ((7 - nov.getDay()) % 7));  // 11월 첫째 일요일
  return now >= dstStart && now < dstEnd;
}

export default function SessionTree({ days, selected, onSelect }: SessionTreeProps) {
  const edt = isEDT();
  // By default, expand the most recent date
  const [expandedDates, setExpandedDates] = useState<Set<string>>(
    new Set([days[0]?.date])
  );

  function toggleDate(date: string) {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  function isSelected(date: string, sessionType: SessionType) {
    return selected?.date === date && selected?.sessionType === sessionType;
  }

  return (
    <nav
      className="flex flex-col gap-1"
      aria-label="날짜별 세션 네비게이션"
    >
      {days.map(day => {
        const isExpanded = expandedDates.has(day.date);

        return (
          <div key={day.date}>
            {/* Date row — toggle collapse */}
            <button
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-gray-800 transition-colors group"
              onClick={() => toggleDate(day.date)}
              aria-expanded={isExpanded}
              aria-controls={`sessions-${day.date}`}
            >
              <span className="text-sm font-semibold text-gray-200 group-hover:text-white">
                {day.date}{' '}
                <span className="text-gray-500 font-normal">({day.dayOfWeek})</span>
              </span>
              <span
                className="text-gray-500 text-xs transition-transform duration-200"
                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                aria-hidden="true"
              >
                ▶
              </span>
            </button>

            {/* Session list */}
            {isExpanded && (
              <ul id={`sessions-${day.date}`} className="ml-3 mb-1 space-y-0.5">
                {day.sessions.map(session => {
                  const active = isSelected(day.date, session.type);
                  return (
                    <li key={session.type}>
                      <button
                        className={`
                          w-full flex flex-col px-3 py-2 rounded-md text-left transition-colors
                          ${active
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                          }
                        `}
                        onClick={() => onSelect({ date: day.date, sessionType: session.type })}
                        aria-current={active ? 'page' : undefined}
                      >
                        <div className="flex items-center gap-2">
                          <span aria-hidden="true">{SESSION_ICONS[session.type]}</span>
                          <span className="text-sm font-semibold">{session.labelKr}</span>
                        </div>
                        <span className={`text-xs font-mono ml-6 mt-0.5 ${active ? 'text-blue-200' : 'text-gray-600'}`}>
                          {edt ? SESSION_HOURS[session.type].edt : SESSION_HOURS[session.type].est} KST
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
