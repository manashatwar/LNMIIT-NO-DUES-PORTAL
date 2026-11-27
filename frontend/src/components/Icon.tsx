// A few simple line icons (inline SVG, no icon package), drawn in the current
// text colour. Used where a symbol says more than a word: upload areas, locks.
import type { CSSProperties, ReactElement } from 'react';

export type IconName = 'upload' | 'check' | 'alert' | 'file' | 'lock' | 'download' | 'tick';

const PATHS: Record<IconName, ReactElement> = {
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
    check: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
    alert: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    tick: <polyline points="20 6 9 17 4 12" />,
};

export function Icon({ name, size = 16, color, strokeWidth = 2, style }: {
    name: IconName;
    size?: number;
    color?: string;
    strokeWidth?: number;
    style?: CSSProperties;
}) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'}
            strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ flex: 'none', verticalAlign: 'middle', ...style }}>
            {PATHS[name]}
        </svg>
    );
}
