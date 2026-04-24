import shishkaLogo from '../../assets/shishka-logo.png'

interface RoadmapTopbarProps {
  /** Full human-readable today, e.g. "Fri 24 Apr 2026". */
  todayLabel: string
  /** Chapter line, e.g. "04 · Opening". */
  chapterLabel: string
}

export function RoadmapTopbar({ todayLabel, chapterLabel }: RoadmapTopbarProps) {
  return (
    <header className="topbar reveal r1">
      <div className="brand">
        <img className="brand-icon" src={shishkaLogo} alt="Shishka pine-cone mark" />
        <div>
          <div className="brand-text">SHISHKA</div>
          <div className="brand-sub">Healthy Kitchen · Opening Roadmap</div>
        </div>
      </div>
      <div className="top-meta">
        <div className="item-today">
          <div className="k">Today</div>
          <div className="v">{todayLabel}</div>
        </div>
        <div>
          <div className="k">Chapter</div>
          <div className="v">{chapterLabel}</div>
        </div>
      </div>
    </header>
  )
}
