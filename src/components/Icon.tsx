import React from 'react';

/**
 * Small, dependency-free stroke icon set (24x24 grid). Icons are decorative by default and
 * hidden from assistive technology; the visible text label next to them carries the meaning.
 * Pass `title` only when an icon appears on its own.
 */
export type IconName =
  | 'architecture'
  | 'deltaLake'
  | 'parquet'
  | 'pushdown'
  | 'partitions'
  | 'schema'
  | 'vertipaq'
  | 'dictionary'
  | 'encoding'
  | 'segment'
  | 'elimination'
  | 'compression'
  | 'loading'
  | 'memory'
  | 'scan'
  | 'info'
  | 'pipeline'
  | 'close'
  | 'check'
  | 'chevronRight'
  | 'chevronLeft'
  | 'pointer'
  | 'book'
  | 'link'
  | 'review';

const PATHS: Record<IconName, string> = {
  architecture: 'M12 3 3 8l9 5 9-5-9-5Z M3 12l9 5 9-5 M3 16l9 5 9-5',
  deltaLake: 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h7',
  parquet: 'M4 5h16v14H4z M9.33 5v14 M14.67 5v14',
  pushdown: 'M4 5h16l-6 7v6l-4 2v-8z',
  partitions: 'M3 6h6l2 2h10v11H3z',
  schema: 'M4 5h16v14H4z M4 10h16 M4 14.5h16 M10 5v14',
  vertipaq: 'M7 7h10v10H7z M10 10h4v4h-4z M9 3v4 M15 3v4 M9 17v4 M15 17v4 M3 9h4 M3 15h4 M17 9h4 M17 15h4',
  dictionary: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11',
  encoding: 'M4 8h14l-3-3 M20 16H6l3 3',
  segment: 'M4 5h16v3.5H4z M4 10.25h16v3.5H4z M4 15.5h16V19H4z',
  elimination: 'M4 5h16v14H4z M4 12h16 M12 5v14 M14.5 14.5l3 3 M17.5 14.5l-3 3',
  compression: 'M9 4v5H4 M15 4v5h5 M9 20v-5H4 M15 20v-5h5',
  loading: 'M12 4v11 M7.5 10.5 12 15l4.5-4.5 M5 19h14',
  memory: 'M3 7h18v10H3z M7 11v2 M12 11v2 M17 11v2 M6 17v2 M10 17v2 M14 17v2 M18 17v2',
  scan: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z M16 16l5 5 M8 12v-2 M10.5 13V8 M13 12v-3',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 11v5 M12 8v.01',
  pipeline: 'M4 5h5v4H4z M15 5h5v4h-5z M9.5 15h5v4h-5z M9 7h6 M12 9v6',
  close: 'M6 6l12 12 M18 6 6 18',
  check: 'm5 12 4.5 4.5L19 7',
  chevronRight: 'm9 6 6 6-6 6',
  chevronLeft: 'm15 6-6 6 6 6',
  pointer: 'M5 3l14 7-6 2-2 6z',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1 M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  review: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
};

interface IconProps {
  name: IconName;
  size?: number;
  title?: string;
  className?: string;
}

const Icon: React.FC<IconProps> = ({ name, size = 18, title, className }) => (
  <svg
    className={`ui-icon${className ? ` ${className}` : ''}`}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    focusable="false"
  >
    {title ? <title>{title}</title> : null}
    <path d={PATHS[name]} />
  </svg>
);

export default Icon;
