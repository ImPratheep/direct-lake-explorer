import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import { REVIEW_SCREENS, REVIEW_VIEWPORTS, ReviewScreen } from '../review/reviewScreens';
import './ReviewPanel.css';

interface ReviewPanelProps {
  activeScreenId: string;
  viewportId: string;
  onSelectScreen: (screenId: string) => void;
  onSelectViewport: (viewportId: string) => void;
  onReset: () => void;
  onExit: () => void;
}

const GROUPS: ReviewScreen['group'][] = ['Architecture', 'Stage 5', 'Stage 6'];

const ReviewPanel: React.FC<ReviewPanelProps> = ({ activeScreenId, viewportId, onSelectScreen, onSelectViewport, onReset, onExit }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const update = (): void => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const index = Math.max(0, REVIEW_SCREENS.findIndex((screen) => screen.id === activeScreenId));
  const active = REVIEW_SCREENS[index];
  const viewport = REVIEW_VIEWPORTS.find((entry) => entry.id === viewportId) ?? REVIEW_VIEWPORTS[0];
  const matches = viewport.width !== null && windowSize.width === viewport.width && windowSize.height === viewport.height;

  const go = (offset: number): void => {
    const next = REVIEW_SCREENS[(index + offset + REVIEW_SCREENS.length) % REVIEW_SCREENS.length];
    onSelectScreen(next.id);
  };

  return (
    <section className="review-panel" aria-label="UI Review Mode">
      <div className="review-bar">
        <span className="review-badge">UI Review Mode</span>
        <p className="review-position" aria-live="polite">
          Screen {index + 1} of {REVIEW_SCREENS.length}: <strong>{active.label}</strong>
        </p>

        <div className="review-actions">
          <button type="button" className="ui-button" onClick={() => go(-1)} aria-label="Previous screen">
            <Icon name="chevronLeft" size={16} />
            Prev
          </button>
          <button type="button" className="ui-button" onClick={() => go(1)} aria-label="Next screen">
            Next
            <Icon name="chevronRight" size={16} />
          </button>

          <div className="review-field">
            <label htmlFor="review-viewport">Viewport</label>
            <select id="review-viewport" value={viewport.id} onChange={(event) => onSelectViewport(event.target.value)}>
              {REVIEW_VIEWPORTS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>

          <button type="button" className="ui-button ui-button-primary" onClick={onReset}>
            Reset to default state
          </button>
          <button type="button" className="ui-button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
            {collapsed ? 'Show review controls' : 'Hide review controls'}
          </button>
          <button type="button" className="ui-button" onClick={onExit}>
            <Icon name="close" size={16} />
            Exit review
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <nav className="review-screens" aria-label="Review screens">
            {GROUPS.map((group) => (
              <div className="review-group" key={group}>
                <span className="review-group-label">{group}</span>
                <ul className="review-group-list">
                  {REVIEW_SCREENS.filter((screen) => screen.group === group).map((screen) => {
                    const isActive = screen.id === activeScreenId;
                    return (
                      <li key={screen.id}>
                        <button
                          type="button"
                          className={`review-screen-button${isActive ? ' is-active' : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                          onClick={() => onSelectScreen(screen.id)}
                        >
                          {isActive && <Icon name="check" size={14} />}
                          {screen.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <p className="review-note">
            <span className="review-window" data-match={matches ? 'yes' : 'no'}>
              {matches ? '✓' : '○'} Window {windowSize.width} × {windowSize.height}
              {viewport.width !== null && (matches ? ` matches ${viewport.label}` : ` (target ${viewport.label})`)}
            </span>
            Review data uses a fixed clock and seed, and every screen opens in a populated starting state. A viewport
            size limits the layout width and marks its height with a dashed line; for pixel-exact captures, also size
            the browser window to match.
          </p>
        </>
      )}
    </section>
  );
};

export default ReviewPanel;
