import React, { useEffect } from 'react';

interface LayoutProps {
    title: string;
    userName: string;
    homeHref?: string;
    onHome?: () => void;
    onLogout: () => void;
    onRules?: () => void;
    onContact?: () => void;
    children: React.ReactNode;
}

/**
 * Modern high-fidelity layout matching LNMIIT ERP portal:
 *  - Top header banner with transparent LNMIIT logo, navy title, crimson motto
 *  - Dark charcoal navbar with crimson accent line (Home | Rules | Contact | Grievance Redressal)
 *  - Breadcrumb sub-header strip
 *  - Main content & Footer
 */
export function Layout({
    title,
    userName,
    onHome,
    onLogout,
    onRules,
    onContact,
    children,
}: LayoutProps) {
    useEffect(() => {
        document.title = title;
    }, [title]);

    // Extract first initial for user avatar
    const initial = userName ? userName.trim().charAt(0).toUpperCase() : '?';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            {/* Top Branding Header */}
            <div className="lnmiit-header-banner">
                <div className="lnmiit-logo-container">
                    <img
                        src="/lnmiit-logo.png"
                        alt="LNMIIT Logo"
                        className="lnmiit-logo-img"
                        onError={(e) => {
                            // Fallback if local logo is loading
                            (e.target as HTMLImageElement).src =
                                'https://lnmiit.ac.in/wp-content/uploads/2021/07/LNMIIT-Logo.png';
                        }}
                    />
                </div>

                <div className="lnmiit-title-group">
                    <h1 className="lnmiit-main-title">The LNM Institute of Information Technology</h1>
                    <div className="lnmiit-tagline">&quot;EXCELLENCE OUR MOTTO DISCIPLINE OUR WAY&quot;</div>
                    <span className="lnmiit-portal-badge">ONLINE NO-DUES PORTAL</span>
                </div>

                {userName ? (
                    <div className="lnmiit-user-badge">
                        <div className="lnmiit-user-avatar">{initial}</div>
                        <div>
                            <span style={{ fontSize: 11, color: '#64748b', display: 'block', lineHeight: 1 }}>
                                Welcome
                            </span>
                            <strong>{userName}</strong>
                        </div>
                    </div>
                ) : (
                    <div style={{ width: 140 }}></div>
                )}
            </div>

            {/* Main Dark Navbar */}
            <nav className="lnmiit-navbar">
                <ul className="lnmiit-nav-list">
                    <li>
                        <button onClick={onHome} className="lnmiit-nav-item">
                            🏠&nbsp;Home
                        </button>
                    </li>
                    <li>
                        <button onClick={onRules} className="lnmiit-nav-item">
                            📋&nbsp;Rules
                        </button>
                    </li>
                    <li>
                        <button onClick={onContact} className="lnmiit-nav-item">
                            📞&nbsp;Contact
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => alert('Grievance Redressal Portal')}
                            className="lnmiit-nav-item"
                        >
                            ⚖️&nbsp;Grievance Redressal
                        </button>
                    </li>

                    {userName && (
                        <li className="lnmiit-nav-right">
                            <button onClick={onLogout} className="lnmiit-logout-btn">
                                ⏻&nbsp;Logout
                            </button>
                        </li>
                    )}
                </ul>
            </nav>

            {/* Breadcrumb Sub-Header */}
            <div className="lnmiit-breadcrumb-bar">
                <div className="lnmiit-breadcrumb-text">
                    <span>🏠</span>
                    <span>&gt;</span>
                    <span>No Dues Portal</span>
                    <span>&gt;</span>
                    <strong style={{ color: '#1e293b' }}>{title}</strong>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                    Session: 2025-2026 II
                </div>
            </div>

            {/* Main Content Area */}
            <main style={{ flex: 1, padding: '24px 0' }}>{children}</main>

            {/* Browser Compatibility Bar */}
            <div className="erp-compatibility-strip">
                <span>Site Compatible with: 🌐 Google Chrome 70+ &nbsp;|&nbsp; 🦊 Firefox 65+</span>
                <span>LNMIIT No Dues Management System</span>
            </div>

            {/* Footer */}
            <footer>
                <strong>&copy;&nbsp;The LNM Institute of Information Technology, Jaipur &nbsp;|&nbsp; 2026</strong>
            </footer>
        </div>
    );
}
