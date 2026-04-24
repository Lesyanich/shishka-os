import { CALENDAR_MARKERS, CALENDAR_TICKS } from './calendar-config'

export function CalendarRibbon() {
  return (
    <>
      <div className="section-head reveal r2">
        <span className="num">PART ONE</span>
        <h2>
          The <em>Calendar</em>
        </h2>
        <span className="spacer" />
      </div>

      <section
        className="calendar reveal r2"
        style={{ marginBottom: 56 }}
        aria-label="Opening timeline"
      >
        <div className="cal-track">
          <div className="cal-line">
            <div className="cal-days">
              {CALENDAR_TICKS.map((tick, i) => (
                <div
                  key={`${tick.label}-${i}`}
                  className={tick.major ? 't maj' : 't'}
                >
                  {tick.major && tick.label && <span>{tick.label}</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="cal-markers">
            {CALENDAR_MARKERS.map((m) => (
              <div
                key={m.label}
                className={`marker ${m.kind}`}
                style={{ left: `${m.position}%` }}
              >
                <div className="m-flag" />
                <div className="m-pin" />
                <div className="m-label">{m.label}</div>
                <div className="m-date">{m.date}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
