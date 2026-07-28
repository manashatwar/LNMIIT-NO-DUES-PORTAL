import { useState } from 'react';
import { RoleType, ExitType, StudentProfile, OCRResult, SectionStatusItem, RefundLedgerState, ApprovalStatus } from './types';
import { Navbar } from './components/Navbar';
import { Page0Initiation } from './components/Page0Initiation';
import { Page1Intake } from './components/Page1Intake';
import { Page2TriGate } from './components/Page2TriGate';
import { Page3Department } from './components/Page3Department';
import { Page4Financial } from './components/Page4Financial';
import { ShieldCheck } from 'lucide-react';

export function App() {
  const [activeRole, setActiveRole] = useState<RoleType>('STUDENT');
  const [activePage, setActivePage] = useState<number>(0);

  // Student details
  const [studentProfile, setStudentProfile] = useState<StudentProfile>({
    name: 'Rahul Sharma',
    rollNo: '24UCC174',
    dept: 'CSE',
    hostel: 'BH1',
    vacantRoom: '123',
    email: 'rahul.sharma@lnmiit.ac.in'
  });

  const [exitType, setExitType] = useState<ExitType>('GRADUATION');
  const [donateWelfare, setDonateWelfare] = useState<boolean>(true);
  const [donationAmount, setDonationAmount] = useState<number>(1000);

  // OCR state
  const [ocrResult, setOcrResult] = useState<OCRResult | null>({
    title: 'Advanced Computer Networks & Security Protocols',
    author: 'Rahul Sharma',
    plagiarism: 8.5,
    publisher: 'LNMIIT Technical Publications',
    year: 2026,
    detectedName: 'Rahul Sharma',
    detectedRoll: '24UCC174',
    status: 'SUCCESS'
  });

  // Master Section Statuses
  const [sectionStatuses, setSectionStatuses] = useState<Record<string, SectionStatusItem>>({
    LIBRARY: { code: 'LIBRARY', name: 'Central Library', category: 'TRI_GATE', status: 'APPROVED', isRequired: true },
    TPC: { code: 'TPC', name: 'TPC Placement', category: 'TRI_GATE', status: 'APPROVED', isRequired: true },
    WARDEN: { code: 'WARDEN', name: 'BH1 Warden Desk', category: 'TRI_GATE', status: 'APPROVED', isRequired: true },
    STORE: { code: 'STORE', name: 'Central Store', category: 'ACADEMIC_FIELD', status: 'APPROVED', isRequired: true },
    LUCS: { code: 'LUCS', name: 'LUCS Society', category: 'ACADEMIC_FIELD', status: 'APPROVED', isRequired: true },
    SPORTS: { code: 'SPORTS', name: 'Sports Council', category: 'ACADEMIC_FIELD', status: 'APPROVED', isRequired: true },
    MEDICAL: { code: 'MEDICAL', name: 'Medical Unit', category: 'ACADEMIC_FIELD', status: 'APPROVED', isRequired: true },
    NAD: { code: 'NAD', name: 'NAD Cell', category: 'ACADEMIC_FIELD', status: 'APPROVED', isRequired: true },
    HOD: { code: 'HOD', name: 'CSE Department HOD', category: 'ACADEMIC_FIELD', status: 'APPROVED', isRequired: true },
    ACCOUNTS: { code: 'ACCOUNTS', name: 'Accounts Section', category: 'FINANCIAL', status: 'APPROVED', isRequired: true },
    ADMINISTRATION: { code: 'ADMINISTRATION', name: 'Administration Office', category: 'FINAL', status: 'APPROVED', isRequired: true },
  });

  // Update status with REVERSE-HIERARCHY CASCADE
  const handleUpdateStatus = (code: string, status: ApprovalStatus, comment?: string) => {
    setSectionStatuses((prev) => {
      const next = { ...prev };
      next[code] = {
        ...next[code],
        status,
        feedbackComment: comment || next[code].feedbackComment,
        decidedBy: activeRole,
        decidedAt: new Date().toLocaleTimeString()
      };

      // REVERSE HIERARCHY CASCADE: If an upstream section reverts to PENDING/REJECTED, downstream resets!
      if (status !== 'APPROVED') {
        if (['STORE', 'LUCS', 'SPORTS', 'MEDICAL', 'NAD'].includes(code)) {
          next['HOD'] = { ...next['HOD'], status: 'PENDING' };
        }
        next['ACCOUNTS'] = { ...next['ACCOUNTS'], status: 'PENDING' };
        next['ADMINISTRATION'] = { ...next['ADMINISTRATION'], status: 'PENDING' };
      }

      return next;
    });
  };

  const resetSimulation = () => {
    setSectionStatuses({
      LIBRARY: { code: 'LIBRARY', name: 'Central Library', category: 'TRI_GATE', status: 'PENDING', isRequired: true },
      TPC: { code: 'TPC', name: 'TPC Placement', category: 'TRI_GATE', status: 'PENDING', isRequired: true },
      WARDEN: { code: 'WARDEN', name: 'BH1 Warden Desk', category: 'TRI_GATE', status: 'PENDING', isRequired: true },
      STORE: { code: 'STORE', name: 'Central Store', category: 'ACADEMIC_FIELD', status: 'PENDING', isRequired: true },
      LUCS: { code: 'LUCS', name: 'LUCS Society', category: 'ACADEMIC_FIELD', status: 'PENDING', isRequired: true },
      SPORTS: { code: 'SPORTS', name: 'Sports Council', category: 'ACADEMIC_FIELD', status: 'PENDING', isRequired: true },
      MEDICAL: { code: 'MEDICAL', name: 'Medical Unit', category: 'ACADEMIC_FIELD', status: 'PENDING', isRequired: true },
      NAD: { code: 'NAD', name: 'NAD Cell', category: 'ACADEMIC_FIELD', status: 'PENDING', isRequired: true },
      HOD: { code: 'HOD', name: 'CSE Department HOD', category: 'ACADEMIC_FIELD', status: 'PENDING', isRequired: true },
      ACCOUNTS: { code: 'ACCOUNTS', name: 'Accounts Section', category: 'FINANCIAL', status: 'PENDING', isRequired: true },
      ADMINISTRATION: { code: 'ADMINISTRATION', name: 'Administration Office', category: 'FINAL', status: 'PENDING', isRequired: true },
    });
    setActivePage(0);
  };

  const clearedCount = Object.values(sectionStatuses).filter(s => s.status === 'APPROVED').length;
  const totalSections = Object.keys(sectionStatuses).length;

  const refundLedger: RefundLedgerState = {
    cautionMoney: 10000,
    totalDues: 500,
    voluntaryDonation: donateWelfare ? donationAmount : 0,
    netRefund: 10000 - 500 - (donateWelfare ? donationAmount : 0)
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-body selection:bg-blue-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeRole={activeRole}
        setActiveRole={setActiveRole}
        activePage={activePage}
        setActivePage={setActivePage}
        clearedCount={clearedCount}
        totalSections={totalSections}
        onResetData={resetSimulation}
      />

      {/* Main Page Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activePage === 0 && (
          <Page0Initiation
            exitType={exitType}
            setExitType={setExitType}
            donateWelfare={donateWelfare}
            setDonateWelfare={setDonateWelfare}
            donationAmount={donationAmount}
            setDonationAmount={setDonationAmount}
            onNext={() => setActivePage(1)}
          />
        )}

        {activePage === 1 && (
          <Page1Intake
            studentProfile={studentProfile}
            setStudentProfile={setStudentProfile}
            ocrResult={ocrResult}
            setOcrResult={setOcrResult}
            onNext={() => setActivePage(2)}
          />
        )}

        {activePage === 2 && (
          <Page2TriGate
            activeRole={activeRole}
            setActiveRole={setActiveRole}
            sectionStatuses={sectionStatuses}
            onUpdateStatus={handleUpdateStatus}
            onNext={() => setActivePage(3)}
          />
        )}

        {activePage === 3 && (
          <Page3Department
            sectionStatuses={sectionStatuses}
            onUpdateStatus={handleUpdateStatus}
            onNext={() => setActivePage(4)}
          />
        )}

        {activePage === 4 && (
          <Page4Financial
            studentProfile={studentProfile}
            exitType={exitType}
            refundLedger={refundLedger}
            sectionStatuses={sectionStatuses}
            onUpdateStatus={handleUpdateStatus}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="glass-panel border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>LNMIIT Deemed University • No Dues Student Clearance System</span>
          </div>

          <div className="flex items-center gap-4 font-mono text-[11px]">
            <span>Roll: {studentProfile.rollNo}</span>
            <span>•</span>
            <span>Dept: {studentProfile.dept}</span>
            <span>•</span>
            <span className="text-emerald-400">Secure Audit Trail Active</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
