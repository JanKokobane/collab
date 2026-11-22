import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDashboard } from '../../context/DashboardContext';
import type { TaskItem } from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import {
  addDaysToDateKey,
  getDateDayOffset,
  isValidDateKey,
  normalizeDateKey,
  parseLocalDate,
  toLocalDateKey
} from '../../utils/dateUtils';
import styles from './CalendarGrid.module.css';

const cx = createCx(styles);

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const COMPACT_WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const STATUS_BADGE: Record<string, string> = {
  Done: 'Done',
  'In progress': 'In Progress',
  Blocked: 'Blocked',
  'To do': 'To Do',
  Backlog: 'Backlog'
};

function formatHumanDateLabel(dateKey?: string | null): string {
  if (!isValidDateKey(dateKey)) return 'Not selected';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(parseLocalDate(dateKey));
}

function getMonthGridDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startDayOfWeek + daysInMonth) / 7) * 7;

  const cells: Array<{
    dayNum: number;
    dateKey: string;
    otherMonth: boolean;
  }> = [];

  for (let i = 0; i < totalCells; i++) {
    let dayNum: number;
    let cellMonth = month;
    let cellYear = year;
    let otherMonth = false;

    if (i < startDayOfWeek) {
      dayNum = prevMonthDays - startDayOfWeek + i + 1;
      cellMonth = month - 1;
      if (cellMonth < 0) {
        cellMonth = 11;
        cellYear--;
      }
      otherMonth = true;
    } else if (i >= startDayOfWeek + daysInMonth) {
      dayNum = i - (startDayOfWeek + daysInMonth) + 1;
      cellMonth = month + 1;
      if (cellMonth > 11) {
        cellMonth = 0;
        cellYear++;
      }
      otherMonth = true;
    } else {
      dayNum = i - startDayOfWeek + 1;
    }

    const dateKey = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(
      2,
      '0'
    )}`;
    cells.push({ dayNum, dateKey, otherMonth });
  }

  return cells;
}

export const ActualCalendarGrid: React.FC = () => {
  const { meetings, reminders, accessibleTasks, setActiveModal } = useDashboard();

  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calFilter, setCalFilter] = useState<'all' | 'meeting' | 'reminder'>('all');
  const [selectedCalDate, setSelectedCalDate] = useState<string>(toLocalDateKey(today));

  const todayStr = toLocalDateKey(today);
  const cells = useMemo(() => getMonthGridDays(calYear, calMonth), [calYear, calMonth]);

  const handlePrevMonth = () => {
    setCalMonth((prev) => {
      if (prev === 0) {
        setCalYear((y) => y - 1);
        return 11;
      }
      return prev - 1;
    });
  };

  const handleNextMonth = () => {
    setCalMonth((prev) => {
      if (prev === 11) {
        setCalYear((y) => y + 1);
        return 0;
      }
      return prev + 1;
    });
  };

  const handleGoToday = () => {
    const now = new Date();
    setCalYear(now.getFullYear());
    setCalMonth(now.getMonth());
    setSelectedCalDate(toLocalDateKey(now));
  };

  return (
    <section className={cx('actual-calendar-card')}>
      <div className={cx('cal-controls-row')}>
        <div className={cx('cal-month-nav')}>
          <button
            type="button"
            className={cx('cal-nav-btn')}
            id="cal-prev-month"
            title="Previous Month"
            onClick={handlePrevMonth}
          >
            &lsaquo;
          </button>
          <h3 id="cal-month-year-label">
            {MONTH_NAMES[calMonth]} {calYear}
          </h3>
          <button
            type="button"
            className={cx('cal-nav-btn')}
            id="cal-next-month"
            title="Next Month"
            onClick={handleNextMonth}
          >
            &rsaquo;
          </button>
          <button
            type="button"
            className={cx('cal-today-btn')}
            id="cal-today-btn"
            onClick={handleGoToday}
          >
            Today
          </button>
        </div>

        <div className={cx('cal-filter-pills')} role="group" aria-label="Calendar filters">
          <button
            type="button"
            className={cx('cal-filter-pill', { active: calFilter === 'all' })}
            onClick={() => setCalFilter('all')}
          >
            All Events
          </button>
          <button
            type="button"
            className={cx('cal-filter-pill', { active: calFilter === 'meeting' })}
            onClick={() => setCalFilter('meeting')}
          >
            Pinned Meetings
          </button>
          <button
            type="button"
            className={cx('cal-filter-pill', { active: calFilter === 'reminder' })}
            onClick={() => setCalFilter('reminder')}
          >
            Reminders
          </button>
        </div>
      </div>

      <div className={cx('cal-month-table-wrap')}>
        <div className={cx('cal-weekdays-row')}>
          {WEEKDAY_NAMES.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        <div className={cx('cal-days-month-grid')} id="cal-days-month-grid">
          {cells.map((cell) => {
            const isToday = cell.dateKey === todayStr;
            const isSelected = cell.dateKey === selectedCalDate;

            const dayMeetings =
              calFilter === 'all' || calFilter === 'meeting'
                ? meetings.filter((m) => m.date === cell.dateKey)
                : [];
            const dayReminders =
              calFilter === 'all' || calFilter === 'reminder'
                ? reminders.filter((r) => r.date === cell.dateKey)
                : [];
            const dayTasks =
              calFilter === 'all'
                ? accessibleTasks.filter((t) => {
                    const dueKey = t.date || t.due_date;
                    const startKey = t.startDate || t.start_date;
                    if (!dueKey) return false;
                    if (dueKey === cell.dateKey) return true;
                    if (startKey && cell.dateKey >= startKey && cell.dateKey <= dueKey) return true;
                    return false;
                  })
                : [];

            return (
              <div
                key={cell.dateKey}
                className={cx('cal-month-day-cell', {
                  'other-month': cell.otherMonth,
                  'is-today': isToday
                })}
                data-date={cell.dateKey}
                style={
                  isSelected
                    ? {
                        borderColor: '#1C1C1F',
                        borderWidth: '1.5px',
                        boxShadow: 'inset 0 0 0 1px #1C1C1F'
                      }
                    : undefined
                }
                onClick={() => {
                  setSelectedCalDate(cell.dateKey);
                  setActiveModal({ type: 'daySchedule', dateKey: cell.dateKey });
                }}
              >
                <div className={cx('cal-day-num')}>
                  <span>{cell.dayNum}</span>
                  {isToday && (
                    <span
                      style={{
                        fontSize: '9px',
                        background: '#F5B800',
                        color: '#1C1C1F',
                        padding: '1px 5px',
                        borderRadius: '4px'
                      }}
                    >
                      TODAY
                    </span>
                  )}
                </div>

                {dayMeetings.map((m) => (
                  <div
                    key={m.id}
                    className={cx('cal-event-pin', 'meeting')}
                    title={`${m.time || ''} — ${m.title} (${m.projectName || ''})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCalDate(cell.dateKey);
                      setActiveModal({ type: 'daySchedule', dateKey: cell.dateKey });
                    }}
                  >
                    📍 {(m.startTime || m.time || '').slice(0, 5)} {m.title}
                  </div>
                ))}

                {dayReminders.map((r) => (
                  <div
                    key={r.id}
                    className={cx('cal-event-pin', 'reminder')}
                    title={r.title}
                  >
                    🔔 {(r.time || '').slice(0, 5)} {r.title}
                  </div>
                ))}

                {dayTasks.map((t) => {
                  const isEnd = (t.date || t.due_date) === cell.dateKey;
                  const isStart = (t.startDate || t.start_date) === cell.dateKey;
                  const spanLabel = isStart && !isEnd ? 'Start: ' : !isStart && !isEnd ? '↳ ' : '';
                  return (
                    <div
                      key={t.id}
                      className={cx('cal-event-pin', 'work')}
                      title={`${t.project}: ${t.title}`}
                    >
                      <span>
                        {spanLabel}
                        {t.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export const CalendarDaysGrid: React.FC = () => {
  const { accessibleTasks, projects, openTaskDetails } = useDashboard();
  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.projectId, p.name])),
    [projects]
  );

  const columns = useMemo(() => {
    const groups: Array<{
      title: string;
      urgency: string;
      tasks: TaskItem[];
    }> = [
      { title: 'Today', urgency: 'today', tasks: [] },
      { title: 'Tomorrow', urgency: 'tomorrow', tasks: [] },
      { title: 'This Week', urgency: 'this-week', tasks: [] },
      { title: 'Next Week', urgency: 'next-week', tasks: [] },
      { title: 'Completed', urgency: 'completed', tasks: [] }
    ];

    accessibleTasks.forEach((task) => {
      if (task.status === 'Done') {
        groups[4].tasks.push(task);
        return;
      }
      const dueDateKey = task.date || task.due_date;
      if (isValidDateKey(dueDateKey)) {
        const diff = getDateDayOffset(dueDateKey);
        if (diff <= 0) groups[0].tasks.push(task);
        else if (diff === 1) groups[1].tasks.push(task);
        else if (diff <= 7) groups[2].tasks.push(task);
        else groups[3].tasks.push(task);
        return;
      }
      const dueText = String(task.due || '').toLowerCase();
      if (dueText.includes('today')) groups[0].tasks.push(task);
      else if (dueText.includes('tomorrow')) groups[1].tasks.push(task);
      else groups[2].tasks.push(task);
    });

    groups.forEach((col, index) => {
      if (index === 4) {
        col.tasks.sort((a, b) =>
          String(b.updatedAt || b.createdAt || b.date || '').localeCompare(
            String(a.updatedAt || a.createdAt || a.date || '')
          )
        );
      } else {
        col.tasks.sort((a, b) =>
          String(a.date || '9999-12-31').localeCompare(String(b.date || '9999-12-31'))
        );
      }
    });

    return groups;
  }, [accessibleTasks]);

  return (
    <div className={cx('calendar-days-grid')} id="calendar-days-grid">
      {columns.map((col) => (
        <div key={col.title} className={cx('calendar-day-col')} data-urgency={col.urgency}>
          <div className={cx('calendar-day-title')}>
            <span className={cx('calendar-day-title-label')}>
              <span className={cx('calendar-day-status-dot')} aria-hidden="true" />
              <span>{col.title}</span>
            </span>
            <span className={cx('calendar-day-count')}>{col.tasks.length}</span>
          </div>

          {col.tasks.length === 0 ? (
            <div className={cx('calendar-day-empty')}>No tasks scheduled</div>
          ) : (
            col.tasks.map((t) => {
              const projName =
                t.project || (t.projectId ? projectNameById.get(t.projectId) : '') || 'Workspace';
              const tagLabel = t.tag || t.category || 'Task';
              const dueLabel =
                t.status === 'Done'
                  ? STATUS_BADGE[t.status]
                  : formatHumanDateLabel(t.date || t.due_date) !== 'Not selected'
                    ? formatHumanDateLabel(t.date || t.due_date)
                    : t.due || STATUS_BADGE[t.status] || 'Scheduled';

              return (
                <button
                  key={t.id}
                  type="button"
                  className={cx('calendar-task-chip')}
                  onClick={() => openTaskDetails(t.id)}
                >
                  <div className={cx('calendar-task-top')}>
                    <span className={cx('calendar-task-project')}>{projName}</span>
                    <span className={cx('calendar-task-due')}>{dueLabel}</span>
                  </div>
                  <strong>{t.title}</strong>
                  <div className={cx('calendar-chip-meta')}>
                    <span className={cx('calendar-task-category')}>{tagLabel}</span>
                    <span className={cx('calendar-task-due')}>
                      {STATUS_BADGE[t.status] || t.status}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      ))}
    </div>
  );
};

interface SingleMiniCalendarProps {
  title: string;
  selectedDate: string;
  otherDate: string;
  role: 'start' | 'end';
  minDate?: string | null;
  maxDate?: string | null;
  onSelectDate: (dateKey: string) => void;
}

const SingleMiniCalendar: React.FC<SingleMiniCalendarProps> = ({
  title,
  selectedDate,
  otherDate,
  role,
  minDate,
  maxDate,
  onSelectDate
}) => {
  const initialDate = isValidDateKey(selectedDate)
    ? parseLocalDate(selectedDate)
    : isValidDateKey(minDate)
      ? parseLocalDate(minDate!)
      : new Date();
  const [viewMonth, setViewMonth] = useState(
    () => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  );

  useEffect(() => {
    if (isValidDateKey(selectedDate)) {
      const parsed = parseLocalDate(selectedDate);
      setViewMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
  }, [selectedDate]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const todayKey = toLocalDateKey();
  const cells = useMemo(() => getMonthGridDays(year, month), [year, month]);

  const canGoPrev = useMemo(() => {
    if (!isValidDateKey(minDate)) return true;
    const m = parseLocalDate(minDate!);
    const minMonth = new Date(m.getFullYear(), m.getMonth(), 1);
    return new Date(year, month - 1, 1) >= minMonth;
  }, [minDate, year, month]);

  const canGoNext = useMemo(() => {
    if (!isValidDateKey(maxDate)) return true;
    const m = parseLocalDate(maxDate!);
    const maxMonth = new Date(m.getFullYear(), m.getMonth(), 1);
    return new Date(year, month + 1, 1) <= maxMonth;
  }, [maxDate, year, month]);

  const rangeStart = role === 'start' ? selectedDate : otherDate;
  const rangeEnd = role === 'start' ? otherDate : selectedDate;

  return (
    <div className="project-time-span-calendar">
      <div className="project-time-span-calendar-label">{title}</div>
      <div className="project-time-span-calendar-navigation">
        <button
          type="button"
          className="project-time-span-calendar-nav"
          aria-label={`Previous month for ${title}`}
          disabled={!canGoPrev}
          onClick={() => setViewMonth(new Date(year, month - 1, 1))}
        >
          &lsaquo;
        </button>
        <div className="project-time-span-calendar-heading">
          {MONTH_NAMES[month]} {year}
        </div>
        <button
          type="button"
          className="project-time-span-calendar-nav"
          aria-label={`Next month for ${title}`}
          disabled={!canGoNext}
          onClick={() => setViewMonth(new Date(year, month + 1, 1))}
        >
          &rsaquo;
        </button>
      </div>
      <div className="project-time-span-calendar-weekdays">
        {COMPACT_WEEKDAYS.map((w, idx) => (
          <span key={idx}>{w}</span>
        ))}
      </div>
      <div className="project-time-span-calendar-days">
        {cells.map((cell) => {
          const isBeforeMin = Boolean(minDate && cell.dateKey < minDate);
          const isAfterMax = Boolean(maxDate && cell.dateKey > maxDate);
          const disabled = isBeforeMin || isAfterMax;
          const isToday = cell.dateKey === todayKey;
          const isSelected = cell.dateKey === selectedDate;
          const isOther = cell.dateKey === otherDate;
          const isInRange =
            isValidDateKey(rangeStart) &&
            isValidDateKey(rangeEnd) &&
            cell.dateKey > rangeStart &&
            cell.dateKey < rangeEnd;

          const dayClasses = [
            'project-time-span-calendar-day',
            cell.otherMonth ? 'is-outside-month' : '',
            isToday ? 'is-today' : '',
            isSelected || (role === 'start' && isSelected) || (role === 'end' && isOther)
              ? role === 'start' && isSelected
                ? 'is-start-date'
                : ''
              : '',
            role === 'end' && isSelected ? 'is-end-date' : '',
            role === 'start' && isOther ? 'is-end-date' : '',
            role === 'end' && isOther ? 'is-start-date' : '',
            isInRange ? 'is-in-range' : ''
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={cell.dateKey}
              type="button"
              className={dayClasses}
              disabled={disabled}
              onClick={() => onSelectDate(cell.dateKey)}
            >
              {cell.dayNum}
            </button>
          );
        })}
      </div>
      <div className="project-time-span-selected-date">
        {formatHumanDateLabel(selectedDate)}
      </div>
    </div>
  );
};

export interface ScheduleCalendarPickerProps {
  startDate: string;
  dueDate: string;
  minDate?: string | null;
  maxDate?: string | null;
  onChange: (range: { startDate: string; dueDate: string }) => void;
}

export const ScheduleCalendarPicker: React.FC<ScheduleCalendarPickerProps> = ({
  startDate,
  dueDate,
  minDate,
  maxDate,
  onChange
}) => {
  const todayKey = toLocalDateKey();
  const effectiveMin = normalizeDateKey(minDate) || todayKey;
  const effectiveMax = normalizeDateKey(maxDate);

  const clamp = (value: string) => {
    let next = isValidDateKey(value) ? value : effectiveMin;
    if (effectiveMin && next < effectiveMin) next = effectiveMin;
    if (effectiveMax && next > effectiveMax) next = effectiveMax;
    return next;
  };

  const applyPreset = (preset: 'today' | 'tomorrow' | 'week' | 'next-week') => {
    const start = clamp(todayKey);
    let end = start;
    if (preset === 'tomorrow') {
      end = clamp(addDaysToDateKey(todayKey, 1));
    } else if (preset === 'week') {
      end = clamp(addDaysToDateKey(todayKey, 7));
    } else if (preset === 'next-week') {
      end = clamp(addDaysToDateKey(todayKey, 14));
    }
    if (end < start) end = start;
    onChange({ startDate: start, dueDate: end });
  };

  return (
    <div className={cx('cal-schedule-picker-card')}>
      <div className={cx('cal-schedule-header')}>
        <div className={cx('cal-schedule-title')}>Task Timeline</div>
        <div className={cx('cal-schedule-summary')}>
          <span>🗓️</span>
          <span>
            {formatHumanDateLabel(startDate)} — {formatHumanDateLabel(dueDate)}
          </span>
        </div>
      </div>

      <div className={cx('cal-schedule-presets')}>
        <button
          type="button"
          className={cx('cal-preset-pill', {
            active: startDate === todayKey && dueDate === todayKey
          })}
          onClick={() => applyPreset('today')}
        >
          Today
        </button>
        <button
          type="button"
          className={cx('cal-preset-pill')}
          onClick={() => applyPreset('tomorrow')}
        >
          Tomorrow
        </button>
        <button
          type="button"
          className={cx('cal-preset-pill')}
          onClick={() => applyPreset('week')}
        >
          This Week
        </button>
        <button
          type="button"
          className={cx('cal-preset-pill')}
          onClick={() => applyPreset('next-week')}
        >
          Next Week
        </button>
      </div>

      <div
        className={`project-time-span-calendars ${cx('cal-schedule-calendar-grid')}`}
      >
        <SingleMiniCalendar
          title="Start Date"
          role="start"
          selectedDate={startDate}
          otherDate={dueDate}
          minDate={effectiveMin}
          maxDate={effectiveMax}
          onSelectDate={(nextStart) => {
            const clampedStart = clamp(nextStart);
            const nextDue = !dueDate || dueDate < clampedStart ? clampedStart : dueDate;
            onChange({ startDate: clampedStart, dueDate: nextDue });
          }}
        />
        <SingleMiniCalendar
          title="Due Date"
          role="end"
          selectedDate={dueDate}
          otherDate={startDate}
          minDate={effectiveMin}
          maxDate={effectiveMax}
          onSelectDate={(nextDue) => {
            const clampedDue = clamp(nextDue);
            const nextStart = !startDate || startDate > clampedDue ? clampedDue : startDate;
            onChange({ startDate: nextStart, dueDate: clampedDue });
          }}
        />
      </div>
    </div>
  );
};

export interface DropdownDatePickerProps {
  label: string;
  value: string;
  minDate?: string | null;
  maxDate?: string | null;
  onChange: (dateKey: string) => void;
}

export const DropdownDatePicker: React.FC<DropdownDatePickerProps> = ({
  label,
  value,
  minDate,
  maxDate,
  onChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={cx('cal-sprint-date-picker', { 'is-open': isOpen })}
    >
      <button
        type="button"
        className={cx('cal-sprint-date-trigger')}
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
      >
        <span className={cx('cal-sprint-date-trigger-label')}>{label}</span>
        <span className={cx('cal-sprint-date-trigger-date')}>
          {formatHumanDateLabel(value)}
        </span>
      </button>

      <div className={cx('cal-sprint-date-popover')} hidden={!isOpen}>
        {isOpen && (
          <div className="project-time-span-calendars" style={{ gridTemplateColumns: '1fr' }}>
            <SingleMiniCalendar
              title={label}
              role="start"
              selectedDate={value}
              otherDate={value}
              minDate={minDate}
              maxDate={maxDate}
              onSelectDate={(next) => {
                onChange(next);
                setIsOpen(false);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
