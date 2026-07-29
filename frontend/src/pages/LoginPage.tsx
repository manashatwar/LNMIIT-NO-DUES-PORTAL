import React, { useState, useEffect } from 'react';
import { RoleType } from '../types';

interface LoginPageProps {
    onLogin: (username: string, password: string, role: RoleType) => Promise<void>;
}

const ROLES: RoleType[] = [
    'Student',
    'Faculty',
    'HOD',
    'Hostel Support',
    'Store Release',
    'Library',
    'LUCS',
    'Sports',
    'Medical Unit',
    'NAD Cell',
    'Account',
];

const EXIT_OPTIONS = [
    'Graduated',
    'NEP EXIT',
    'Withdrawal',
    'Admission cancel',
];

/** Generate a random 6-digit numerical captcha code */
function generateCaptchaCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Replicates LNMIIT ERP Login Page (matching user's screenshots):
 *  - Top header + dark navbar
 *  - Center: Sign in box with User Type, Exit Type (for Student), Username, Password, Captcha & Red Sign In button
 *  - Right: Latest News & Notice Board panels
 */
export function LoginPage({ onLogin }: LoginPageProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<RoleType | ''>('Student');
    const [exitType, setExitType] = useState<string>('Graduated');
    const [captchaCode, setCaptchaCode] = useState(generateCaptchaCode());
    const [captchaInput, setCaptchaInput] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setCaptchaCode(generateCaptchaCode());
    }, []);

    const handleRefreshCaptcha = () => {
        setCaptchaCode(generateCaptchaCode());
        setCaptchaInput('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim() || !role) {
            setError('Please fill all required fields.');
            return;
        }

        if (captchaInput.trim() !== captchaCode) {
            setError('Incorrect Captcha code entered.');
            setCaptchaCode(generateCaptchaCode());
            setCaptchaInput('');
            return;
        }

        setError('');
        setLoading(true);
        try {
            await onLogin(username.trim(), password, role as RoleType);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'The username or password you entered is incorrect.');
            setCaptchaCode(generateCaptchaCode());
            setCaptchaInput('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
            {/* Top Branding Header */}
            <div className="lnmiit-header-banner">
                <div className="lnmiit-logo-container">
                    <img
                        src="/lnmiit-logo.png"
                        alt="LNMIIT Logo"
                        className="lnmiit-logo-img"
                        onError={(e) => {
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

                <div style={{ width: 120 }}></div>
            </div>

            {/* Dark Navbar */}
            <nav className="lnmiit-navbar">
                <ul className="lnmiit-nav-list">
                    <li className="lnmiit-nav-item">🏠&nbsp;Home</li>
                    <li className="lnmiit-nav-item">📋&nbsp;Rules</li>
                    <li className="lnmiit-nav-item">📞&nbsp;Contact</li>
                    <li className="lnmiit-nav-item">⚖️&nbsp;Grievance Redressal</li>
                </ul>
            </nav>

            {/* Main ERP Login Content Grid */}
            <div className="erp-login-wrapper" style={{ flex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div className="erp-main-content">
                        {/* Sign In Box */}
                        <div className="erp-signin-box">
                            <h3 className="erp-signin-header">
                                🔒 Sign in
                            </h3>

                            {error && (
                                <div style={{
                                    backgroundColor: '#fee2e2',
                                    color: '#b91c1c',
                                    padding: '8px 12px',
                                    borderRadius: 4,
                                    fontSize: 12,
                                    marginBottom: 14,
                                    border: '1px solid #fca5a5'
                                }}>
                                    ⚠️ {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit}>
                                <div className="erp-field-group">
                                    <label className="erp-label">User Type :</label>
                                    <select
                                        className="erp-select"
                                        value={role}
                                        onChange={(e) => setRole(e.target.value as RoleType)}
                                    >
                                        <option value="" disabled>Select User Type</option>
                                        {ROLES.map((r) => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                </div>

                                {role === 'Student' && (
                                    <div className="erp-field-group" style={{
                                        background: '#eff6ff',
                                        padding: '10px 12px',
                                        borderRadius: 6,
                                        border: '1px solid #bfdbfe',
                                        marginBottom: 14,
                                    }}>
                                        <label className="erp-label" style={{ color: '#1e40af', fontWeight: 600 }}>
                                            🎓 Admission Exit Type :
                                        </label>
                                        <select
                                            className="erp-select"
                                            value={exitType}
                                            onChange={(e) => setExitType(e.target.value)}
                                            style={{ borderColor: '#93c5fd', backgroundColor: '#ffffff', fontWeight: 500 }}
                                        >
                                            {EXIT_OPTIONS.map((opt) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="erp-field-group">
                                    <label className="erp-label">Username :</label>
                                    <input
                                        type="text"
                                        className="erp-input"
                                        placeholder="webmail@lnmiit.ac.in"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        autoComplete="username"
                                    />
                                </div>

                                <div className="erp-field-group">
                                    <label className="erp-label">Password :</label>
                                    <input
                                        type="password"
                                        className="erp-input"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="current-password"
                                    />
                                </div>

                                <div className="erp-field-group">
                                    <label className="erp-label">Security Captcha :</label>
                                    <div className="captcha-container">
                                        <span className="captcha-code">{captchaCode}</span>
                                        <button
                                            type="button"
                                            onClick={handleRefreshCaptcha}
                                            className="captcha-refresh"
                                            title="Refresh Captcha"
                                        >
                                            🔄
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        className="erp-input"
                                        placeholder="Enter 6-digit captcha"
                                        value={captchaInput}
                                        onChange={(e) => setCaptchaInput(e.target.value)}
                                    />
                                </div>

                                <button type="submit" className="btn-signin" disabled={loading}>
                                    {loading ? 'Authenticating…' : 'Sign In'}
                                </button>

                                <div style={{ marginTop: 12, textAlign: 'center' }}>
                                    <a href="#forgot" onClick={(e) => e.preventDefault()} style={{ fontSize: 12, color: '#1d4ed8' }}>
                                        Forgot Password ?
                                    </a>
                                </div>
                            </form>
                        </div>

                        {/* Latest News Box */}
                        <div className="erp-board-box">
                            <h4 className="erp-board-header">Latest News</h4>
                            <div className="erp-board-body">
                                <ul style={{ margin: 0, paddingLeft: 18, color: '#475569' }}>
                                    <li style={{ marginBottom: 8 }}>
                                        <strong>No-Dues Portal Active:</strong> Session 2025-2026 II No-Dues clearance is now open for graduating students.
                                    </li>
                                    <li style={{ marginBottom: 8 }}>
                                        Check department & lab prerequisites before requesting HOD clearance.
                                    </li>
                                </ul>
                            </div>
                        </div>

                        {/* Notice Board Box */}
                        <div className="erp-board-box">
                            <h4 className="erp-board-header">Notice Board</h4>
                            <div className="erp-board-body">
                                <ul style={{ margin: 0, paddingLeft: 18, color: '#475569' }}>
                                    <li style={{ marginBottom: 8 }}>
                                        Students can log in with webmail credentials and default password: <code>csepassword</code>.
                                    </li>
                                    <li style={{ marginBottom: 8 }}>
                                        For technical queries, reach out to <code>onlinecc@lnmiit.ac.in</code>.
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Compatibility Strip */}
            <div className="erp-compatibility-strip">
                <span>Site Compatible with: 🌐 Google Chrome 70+ &nbsp;|&nbsp; 🦊 Firefox 65+</span>
                <span>The LNM Institute of Information Technology, Jaipur</span>
            </div>

            {/* Footer */}
            <footer>
                <strong>&copy;&nbsp;LNMIIT Jaipur &nbsp;|&nbsp; 2026</strong>
            </footer>
        </div>
    );
}
