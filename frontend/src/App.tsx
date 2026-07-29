import { useEffect, useState } from 'react';
import { api } from './api';
import { CurrentUser, RoleType, StudentStatus, SectionQueue, DetailItem, SectionKey } from './types';
import { LoginPage } from './pages/LoginPage';
import { StudentDashboard } from './pages/StudentDashboard';
import { StudentDetailPage } from './pages/StudentDetailPage';
import { SectionApprovalPage } from './pages/SectionApprovalPage';
import { RulesPage } from './pages/RulesPage';
import { ContactPage } from './pages/ContactPage';

type View = 'HOME' | 'RULES' | 'CONTACT' | 'DETAIL';

export function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [view, setView] = useState<View>('HOME');

  const [studentStatus, setStudentStatus] = useState<StudentStatus | null>(null);
  const [queue, setQueue] = useState<SectionQueue | null>(null);
  const [saving, setSaving] = useState(false);
  const [dataError, setDataError] = useState('');

  // Detail-page state (Department / Labs breakdown)
  const [detailTitle, setDetailTitle] = useState('');
  const [detailItems, setDetailItems] = useState<DetailItem[]>([]);

  // Load the role-specific data for a logged-in user.
  const loadData = async (u: CurrentUser) => {
    setDataError('');
    try {
      if (u.role === 'Student') {
        setStudentStatus(await api.studentStatus());
        setQueue(null);
      } else {
        setQueue(await api.sectionQueue());
        setStudentStatus(null);
      }
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to load data');
    }
  };

  // Restore an existing session on first load.
  useEffect(() => {
    (async () => {
      try {
        const u = await api.me();
        setUser(u);
        await loadData(u);
      } catch {
        setUser(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const handleLogin = async (username: string, password: string, role: RoleType) => {
    const u = await api.login(username, password, role);
    setUser(u);
    setView('HOME');
    await loadData(u);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setStudentStatus(null);
      setQueue(null);
      setView('HOME');
    }
  };

  // Open a section's detail page. Department & Labs show the full per-faculty /
  // per-lab breakdown; every other section shows its single approval status.
  const openSection = async (section: SectionKey, label: string) => {
    try {
      if (section === 'department') {
        const d = await api.deptDetail();
        setDetailTitle(`Department (${d.dept}) — Faculty Details`);
        setDetailItems(d.items);
      } else if (section === 'labs') {
        const d = await api.labDetail();
        setDetailTitle('Lab Details');
        setDetailItems(d.items);
      } else {
        setDetailTitle(`${label} — Details`);
        setDetailItems([{ name: label, approved: !!studentStatus?.sections[section] }]);
      }
      setView('DETAIL');
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to load details');
    }
  };

  const handleSave = async (approvals: Record<string, boolean | { approved: boolean; feedback?: string }>) => {
    setSaving(true);
    try {
      await api.sectionSave(approvals);
      setQueue(await api.sectionQueue());
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──
  if (booting) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const goHome = () => setView('HOME');

  if (view === 'RULES') {
    return <RulesPage onHome={goHome} onLogout={handleLogout} />;
  }
  if (view === 'CONTACT') {
    return <ContactPage onHome={goHome} onLogout={handleLogout} />;
  }
  if (view === 'DETAIL' && user.role === 'Student') {
    return (
      <StudentDetailPage
        title={detailTitle}
        studentName={user.name}
        items={detailItems}
        onHome={goHome}
        onBack={goHome}
        onLogout={handleLogout}
      />
    );
  }

  // HOME
  if (user.role === 'Student') {
    if (!studentStatus) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p className="text-danger">{dataError || 'No student record found.'}</p>
          <button className="btn btn-primary" onClick={handleLogout}>Back to login</button>
        </div>
      );
    }
    return (
      <StudentDashboard
        student={studentStatus}
        onHome={goHome}
        onLogout={handleLogout}
        onRules={() => setView('RULES')}
        onContact={() => setView('CONTACT')}
        onOpenSection={openSection}
      />
    );
  }

  // Officer roles
  return (
    <SectionApprovalPage
      officerName={user.name}
      heading={queue?.heading ?? 'Students'}
      students={queue?.students ?? []}
      saving={saving}
      onSave={handleSave}
      onLogout={handleLogout}
      onRules={() => setView('RULES')}
      onContact={() => setView('CONTACT')}
    />
  );
}

export default App;
