import { useEffect, useState } from 'react';
import { api } from './api';
import { CurrentUser, RoleType, ExitType, StudentRequestResponse, SectionQueue } from './types';
import { LoginPage } from './pages/LoginPage';
import { StudentDashboard } from './pages/StudentDashboard';
import { SectionApprovalPage } from './pages/SectionApprovalPage';
import { RulesPage } from './pages/RulesPage';
import { ContactPage } from './pages/ContactPage';

type View = 'HOME' | 'RULES' | 'CONTACT';

const SECTION_ROLES: RoleType[] = [
  'LIBRARY', 'TPC', 'WARDEN', 'STORE', 'LUCS', 'SPORTS',
  'MEDICAL', 'NAD', 'DEPT', 'HOD', 'ACCOUNTS', 'ADMINISTRATION',
];

export function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [view, setView] = useState<View>('HOME');

  const [studentData, setStudentData] = useState<StudentRequestResponse | null>(null);
  const [queue, setQueue] = useState<SectionQueue | null>(null);
  const [error, setError] = useState('');

  // Ensure a student has an active request; create one (with the chosen exit type) if not.
  const ensureStudentRequest = async (exitType?: ExitType) => {
    let data = await api.studentRequest();
    if (!data.has_request && exitType) {
      data = await api.initiate(exitType, 0, '');
    }
    setStudentData(data);
    setQueue(null);
  };

  const loadData = async (u: CurrentUser, exitType?: ExitType) => {
    setError('');
    try {
      if (u.role === 'STUDENT') {
        await ensureStudentRequest(exitType);
      } else if (SECTION_ROLES.includes(u.role)) {
        setQueue(await api.sectionQueue());
        setStudentData(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const u = await api.me();
        setUser(u);
        await loadData(u);           // resume existing session (no exit type needed)
      } catch {
        setUser(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const handleLogin = async (username: string, password: string, role: RoleType, exitType: ExitType) => {
    const u = await api.login(username, password, role);
    setUser(u);
    setView('HOME');
    await loadData(u, exitType);
  };

  const handleLogout = async () => {
    try { await api.logout(); } finally {
      setUser(null); setStudentData(null); setQueue(null); setView('HOME');
    }
  };

  const reloadStudent = async () => { if (user) setStudentData(await api.studentRequest()); };
  const reloadQueue = async () => { if (user) setQueue(await api.sectionQueue()); };

  if (booting) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}><p>Loading…</p></div>;
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const goHome = () => setView('HOME');
  if (view === 'RULES') return <RulesPage onHome={goHome} onLogout={handleLogout} />;
  if (view === 'CONTACT') return <ContactPage onHome={goHome} onLogout={handleLogout} />;

  // ── Student: Page 1 (intake) until submitted, then Page 2 (dashboard) ──
  if (user.role === 'STUDENT') {
    if (!studentData || !studentData.has_request || !studentData.request) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p className="text-danger">{error || 'Preparing your clearance request…'}</p>
          <button className="btn btn-primary" onClick={handleLogout}>Back to login</button>
        </div>
      );
    }
    return (
      <StudentDashboard
        request={studentData.request}
        onReload={reloadStudent}
        onLogout={handleLogout}
        onRules={() => setView('RULES')}
        onContact={() => setView('CONTACT')}
      />
    );
  }

  // ── Officer ──
  if (SECTION_ROLES.includes(user.role)) {
    return (
      <SectionApprovalPage
        officerName={user.name}
        heading={queue?.heading ?? 'Officer Desk'}
        rows={queue?.students ?? []}
        onReload={reloadQueue}
        onLogout={handleLogout}
        onRules={() => setView('RULES')}
        onContact={() => setView('CONTACT')}
      />
    );
  }

  // ── Admin / other ──
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p>Logged in as <strong>{user.username}</strong> ({user.role}).</p>
      <p className="text-muted">Use the Django admin at <code>/admin</code> for administrative tasks.</p>
      <button className="btn btn-primary" onClick={handleLogout}>Logout</button>
    </div>
  );
}

export default App;
