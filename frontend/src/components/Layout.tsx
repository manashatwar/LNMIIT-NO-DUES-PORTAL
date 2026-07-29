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
 * Replicates base.html:
 *  - LNMIIT logo + "No Dues Portal" header
 *  - Dark Bootstrap-style navbar (Home | Rules | Contact) + Name | Logout on right
 *  - Footer
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

    return (
        <>
            {/* Header: Logo + Title */}
            <div className="container" style={{ textAlign: 'center', padding: '20px 0 0' }}>
                <img
                    src="https://lnmiit.ac.in/wp-content/uploads/2021/07/LNMIIT-Logo.png"
                    alt="LNMIIT Logo"
                    style={{ width: 220, height: 'auto', objectFit: 'contain' }}
                    onError={(e) => {
                        // fallback if logo doesn't load
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
                <h1 style={{ marginTop: 10 }}>No Dues Portal</h1>
                <p>
                    <strong>LNM Institute of Information Technology, Jaipur</strong>
                </p>
            </div>

            {/* Navbar */}
            <nav
                style={{
                    backgroundColor: '#222',
                    borderColor: '#080808',
                    marginBottom: 50,
                    borderRadius: 0,
                    borderTop: '1px solid #080808',
                    borderBottom: '1px solid #080808',
                }}
            >
                <div
                    style={{
                        maxWidth: '100%',
                        padding: '0 15px',
                        display: 'flex',
                        alignItems: 'center',
                        minHeight: 50,
                    }}
                >
                    {/* Left nav links */}
                    <ul
                        style={{
                            display: 'flex',
                            listStyle: 'none',
                            margin: 0,
                            padding: 0,
                            flex: 1,
                        }}
                    >
                        <li>
                            <button
                                onClick={onHome}
                                style={navLinkStyle}
                            >
                                🏠&nbsp;Home
                            </button>
                        </li>
                        <li>
                            <button
                                onClick={onRules}
                                style={navLinkStyle}
                            >
                                ℹ️&nbsp;Rules
                            </button>
                        </li>
                        <li>
                            <button
                                onClick={onContact}
                                style={navLinkStyle}
                            >
                                📞&nbsp;Contact
                            </button>
                        </li>
                    </ul>

                    {/* Right: Name | Logout */}
                    <ul style={{ display: 'flex', listStyle: 'none', margin: 0, padding: 0 }}>
                        <li>
                            <button
                                onClick={onLogout}
                                style={{ ...navLinkStyle, color: '#9d9d9d' }}
                            >
                                <strong>{userName}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;⏻&nbsp;Logout
                            </button>
                        </li>
                    </ul>
                </div>
            </nav>

            {/* Page content */}
            <div style={{ minHeight: 'calc(100vh - 380px)' }}>
                {children}
            </div>

            {/* Footer */}
            <footer
                style={{
                    backgroundColor: '#f2f2f2',
                    padding: '25px',
                    textAlign: 'center',
                    marginTop: 40,
                    borderTop: '1px solid #ddd',
                }}
            >
                <h4 style={{ margin: 0 }}>
                    &copy;&nbsp;<strong>LNMIIT Jaipur&nbsp;&nbsp;|&nbsp;&nbsp;2026</strong>
                </h4>
            </footer>
        </>
    );
}

const navLinkStyle: React.CSSProperties = {
    display: 'block',
    padding: '15px',
    color: '#9d9d9d',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontFamily: 'inherit',
    lineHeight: '20px',
    textDecoration: 'none',
};
