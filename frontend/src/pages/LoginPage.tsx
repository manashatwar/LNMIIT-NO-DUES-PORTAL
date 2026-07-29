import React, { useState } from 'react';
import { RoleType } from '../types';

interface LoginPageProps {
    onLogin: (username: string, password: string, role: RoleType) => Promise<void>;
}

// Roles supported by the existing backend
const ROLES: RoleType[] = [
    'Student',
    'Faculty',
    'HOD',
    'Caretaker',
    'Warden',
    'Library',
    'OnlineCC',
    'CC',
    'Thesis Manager',
    'Gymkhana',
    'Assistant Registrar',
    'Lab',
    'Account',
];

/**
 * Login screen — mirrors the original login.html (white card, green button,
 * role dropdown, background image), wired to the real backend.
 */
export function LoginPage({ onLogin }: LoginPageProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<RoleType | ''>('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim() || !role) {
            setError('Please fill all fields.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            await onLogin(username.trim(), password, role as RoleType);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-bg">
            <div className="login-page">
                <div className="login-form">
                    <form onSubmit={handleSubmit}>
                        <h1 style={{ textAlign: 'center', marginTop: 0, marginBottom: 20, fontSize: 28 }}>
                            No Dues Portal
                        </h1>

                        {error && (
                            <h3 style={{ textAlign: 'center', fontSize: 14, color: '#d9534f', marginBottom: 15, marginTop: 0 }}>
                                {error}
                            </h3>
                        )}

                        <input
                            type="text"
                            placeholder="Enter Your Webmail"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            autoComplete="username"
                        />

                        <input
                            type="password"
                            placeholder="Enter Your Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                        />

                        <select value={role} onChange={(e) => setRole(e.target.value as RoleType)}>
                            <option value="" disabled>Role</option>
                            {ROLES.map((r) => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>

                        <button type="submit" disabled={loading}>
                            {loading ? 'Logging in…' : 'Login'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
