import React, { useState, useEffect } from 'react';
import { RoleType, ExitType } from '../types';

interface LoginPageProps {
    onLogin: (username: string, password: string, role: RoleType, exitType: ExitType) => Promise<void>;
}

const EXIT_OPTIONS: { value: ExitType; label: string }[] = [
    { value: 'GRADUATION', label: 'Graduation' },
    { value: 'NEP_EXIT', label: 'NEP Exit' },
    { value: 'WITHDRAWAL', label: 'Withdrawal' },
    { value: 'ADMISSION_CANCEL', label: 'Admission Cancel' },
];

// Roles = section codes + Student (Design.md). Labels are friendly.
const ROLE_OPTIONS: { value: RoleType; label: string }[] = [
    { value: 'STUDENT', label: 'Student' },
    { value: 'LIBRARY', label: 'Library' },
    { value: 'TPC', label: 'TPC / Placement' },
    { value: 'WARDEN', label: 'Warden' },
    { value: 'STORE', label: 'Store' },
    { value: 'LUCS', label: 'LUCS' },
    { value: 'SPORTS', label: 'Sports / GSAC' },
    { value: 'MEDICAL', label: 'Medical Cell' },
    { value: 'NAD', label: 'NAD Cell' },
    { value: 'HOD', label: 'HOD' },
    { value: 'ACCOUNTS', label: 'Accounts' },
    { value: 'ADMINISTRATION', label: 'Administration' },
];

function generateCaptchaCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export function LoginPage({ onLogin }: LoginPageProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<RoleType>('STUDENT');
    const [exitType, setExitType] = useState<ExitType>('GRADUATION');
    const [captchaCode, setCaptchaCode] = useState(generateCaptchaCode());
    const [captchaInput, setCaptchaInput] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => { setCaptchaCode(generateCaptchaCode()); }, []);

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
            handleRefreshCaptcha();
            return;
        }
        setError('');
        setLoading(true);
        try {
            await onLogin(username.trim(), password, role, exitType);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'The username or password you entered is incorrect.');
            handleRefreshCaptcha();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
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

            <nav className="lnmiit-navbar">
                <ul className="lnmiit-nav-list">
                    <li className="lnmiit-nav-item">🏠&nbsp;Home</li>
                    <li className="lnmiit-nav-item">📋&nbsp;Rules</li>
                    <li className="lnmiit-nav-item">📞&nbsp;Contact</li>
                    <li className="lnmiit-nav-item">⚖️&nbsp;Grievance Redressal</li>
                </ul>
            </nav>

            <div className="erp-login-wrapper" style={{ flex: 1 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <div className="erp-main-content">
                        <div className="erp-signin-box">
                            <h3 className="erp-signin-header">🔒 Sign in</h3>

                            {error && (
                                <div style={{
                                    backgroundColor: '#fee2e2', color: '#b91c1c', padding: '8px 12px',
                                    borderRadius: 4, fontSize: 12, marginBottom: 14, border: '1px solid #fca5a5',
                                }}>
                                    ⚠️ {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit}>
                                <div className="erp-field-group">
                                    <label className="erp-label">User Type :</label>
                                    <select className="erp-select" value={role} onChange={(e) => setRole(e.target.value as RoleType)}>
                                        {ROLE_OPTIONS.map((r) => (
                                            <option key={r.value} value={r.value}>{r.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {role === 'STUDENT' && (
                                    <div className="erp-field-group" style={{
                                        background: '#eff6ff', padding: '10px 12px', borderRadius: 6,
                                        border: '1px solid #bfdbfe',
                                    }}>
                                        <label className="erp-label" style={{ color: '#1e40af', fontWeight: 600 }}>
                                            🎓 Student Exit Type :
                                        </label>
                                        <select className="erp-select" value={exitType}
                                            onChange={(e) => setExitType(e.target.value as ExitType)}
                                            style={{ borderColor: '#93c5fd', backgroundColor: '#ffffff', fontWeight: 500 }}>
                                            {EXIT_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                        <p className="text-muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
                                            Applied only when you start a new clearance request.
                                        </p>
                                    </div>
                                )}

                                <div className="erp-field-group">
                                    <label className="erp-label">Username :</label>
                                    <input type="text" className="erp-input" placeholder="webmail@lnmiit.ac.in"
                                        value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                                </div>

                                <div className="erp-field-group">
                                    <label className="erp-label">Password :</label>
                                    <input type="password" className="erp-input" placeholder="••••••••"
                                        value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                                </div>

                                <div className="erp-field-group">
                                    <label className="erp-label">Security Captcha :</label>
                                    <div className="captcha-container">
                                        <span className="captcha-code">{captchaCode}</span>
                                        <button type="button" onClick={handleRefreshCaptcha} className="captcha-refresh" title="Refresh Captcha">🔄</button>
                                    </div>
                                    <input type="text" className="erp-input" placeholder="Enter 6-digit captcha"
                                        value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)} />
                                </div>

                                <button type="submit" className="btn-signin" disabled={loading}>
                                    {loading ? 'Authenticating…' : 'Sign In'}
                                </button>
                            </form>
                        </div>

                        <div className="erp-board-box">
                            <h4 className="erp-board-header">Latest News</h4>
                            <div className="erp-board-body">
                                <ul style={{ margin: 0, paddingLeft: 18, color: '#475569' }}>
                                    <li style={{ marginBottom: 8 }}><strong>No-Dues Portal Active:</strong> Session 2025-2026 clearance is open for graduating students.</li>
                                    <li style={{ marginBottom: 8 }}>Clear independent sections first; HOD/Accounts/Administration unlock in order.</li>
                                </ul>
                            </div>
                        </div>

                        <div className="erp-board-box">
                            <h4 className="erp-board-header">Notice Board</h4>
                            <div className="erp-board-body">
                                <ul style={{ margin: 0, paddingLeft: 18, color: '#475569' }}>
                                    <li style={{ marginBottom: 8 }}>Students log in with webmail; default password: <code>csepassword</code>.</li>
                                    <li style={{ marginBottom: 8 }}>Officer role = section (e.g. Library, Warden, HOD, Accounts).</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="erp-compatibility-strip">
                <span>Site Compatible with: 🌐 Google Chrome 70+ &nbsp;|&nbsp; 🦊 Firefox 65+</span>
                <span>The LNM Institute of Information Technology, Jaipur</span>
            </div>
            <footer><strong>&copy;&nbsp;LNMIIT Jaipur &nbsp;|&nbsp; 2026</strong></footer>
        </div>
    );
}
