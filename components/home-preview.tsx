const sampleWeeks = [
  [0, 1, 0, 2, 1, 0, 0],
  [1, 0, 2, 1, 0, 3, 0],
  [0, 2, 1, 0, 2, 1, 0],
  [1, 1, 0, 3, 0, 2, 1],
  [0, 2, 3, 1, 2, 0, 1],
  [2, 0, 1, 2, 3, 1, 0],
  [1, 2, 0, 3, 1, 2, 1],
  [0, 3, 2, 1, 2, 3, 0],
  [2, 1, 3, 0, 2, 1, 2],
  [1, 3, 2, 1, 3, 2, 0],
  [2, 1, 3, 2, 1, 3, 1],
  [1, 2, 1, 3, 2, 1, 0],
];

export function HomePreview() {
  return (
    <figure className="home-preview" aria-labelledby="home-preview-caption">
      <div className="preview-calendar">
        <div className="preview-window-bar" aria-hidden="true">
          <span />
          <span />
          <span />
          <span className="preview-window-title">Your dashboard</span>
        </div>
        <div className="preview-calendar-content">
          <div className="preview-heading">
            <div>
              <p className="eyebrow">Every solution adds up</p>
              <h2>One habit. More progress.</h2>
            </div>
            <span className="preview-status">Accepted</span>
          </div>
          <div
            className="preview-heatmap"
            role="img"
            aria-label="Sample activity calendar with green squares showing practice across twelve weeks"
          >
            <div className="preview-weekdays" aria-hidden="true">
              <span>Mon</span>
              <span>Wed</span>
              <span>Fri</span>
            </div>
            {sampleWeeks.map((days, week) => (
              <div className="preview-week" key={week} aria-hidden="true">
                {days.map((level, day) => (
                  <span className={`preview-day activity-level-${level}`} key={day} />
                ))}
              </div>
            ))}
          </div>
          <div className="preview-calendar-footer">
            <span>One day at a time.</span>
            <span className="preview-legend" aria-hidden="true">
              Less
              {[0, 1, 2, 3].map((level) => (
                <span className={`activity-level-${level}`} key={level} />
              ))}
              More
            </span>
          </div>
        </div>
      </div>
      <div className="preview-recap">
        <div className="preview-recap-heading">
          <span className="preview-telegram-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="m4 11 16-7-4 16-5-6-7-3Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="m11 14 9-10" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
          <div>
            <h3>Your daily recap</h3>
            <p>Daily Grind · Telegram</p>
          </div>
          <span className="preview-time">Morning</span>
        </div>
        <div className="preview-message">
          <p>
            Yesterday, you solved <strong>2 problems.</strong>
          </p>
          <ul>
            <li>
              <span aria-hidden="true">✓</span> Two Sum
            </li>
            <li>
              <span aria-hidden="true">✓</span> Valid Parentheses
            </li>
          </ul>
          <p className="preview-message-note">A little more progress. Keep it going.</p>
        </div>
      </div>
      <figcaption id="home-preview-caption">
        Illustrative preview · sample activity and recap
      </figcaption>
    </figure>
  );
}
