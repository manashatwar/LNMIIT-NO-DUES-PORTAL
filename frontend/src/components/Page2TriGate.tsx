import React, { useState } from 'react';
import { SectionStatusItem, PendingStudentRequest, RoleType } from '../types';
import { 
  Lock, 
  UserCheck, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  MessageSquare, 
  FileText, 
  Eye, 
  ArrowRight,
  Users
} from 'lucide-react';

interface Page2Props {
  activeRole: RoleType;
  setActiveRole: (role: RoleType) => void;
  sectionStatuses: Record<string, SectionStatusItem>;
  onUpdateStatus: (code: string, status: 'APPROVED' | 'REJECTED', comment?: string) => void;
  onNext: () => void;
}

export const Page2TriGate: React.FC<Page2Props> = ({
  activeRole,
  sectionStatuses,
  onUpdateStatus,
  onNext
}) => {
  const [viewMode, setViewMode] = useState<'STUDENT' | 'STAFF'>(
    activeRole === 'STUDENT' ? 'STUDENT' : 'STAFF'
  );

  const [selectedStudentId, setSelectedStudentId] = useState<string>('std-1');
  const [feedbackInput, setFeedbackInput] = useState<string>('');
  const [activeDocPreview, setActiveDocPreview] = useState<string | null>(null);

  // Mock pending students queue for staff dashboard
  const pendingStudents: PendingStudentRequest[] = [
    {
      id: 'std-1',
      name: 'Rahul Sharma',
      rollNo: '24UCC174',
      dept: 'CSE',
      hostel: 'BH1',
      exitType: 'GRADUATION',
      submittedAt: 'Today, 10:45 AM',
      documents: [
        { name: 'BTP_Form_Signed.pdf', type: 'PDF', size: '42 KB', url: '#' },
        { name: 'Offer_Letter.pdf', type: 'PDF', size: '85 KB', url: '#' },
      ],
      sectionStatuses: {
        LIBRARY: sectionStatuses['LIBRARY']?.status || 'PENDING',
        TPC: sectionStatuses['TPC']?.status || 'PENDING',
        WARDEN: sectionStatuses['WARDEN']?.status || 'PENDING',
      } as any
    },
    {
      id: 'std-2',
      name: 'Ananya Gupta',
      rollNo: '24UEC082',
      dept: 'ECE',
      hostel: 'GH1',
      exitType: 'GRADUATION',
      submittedAt: 'Yesterday, 03:15 PM',
      documents: [
        { name: 'BTP_Form_Signed.pdf', type: 'PDF', size: '38 KB', url: '#' }
      ],
      sectionStatuses: {
        LIBRARY: 'APPROVED',
        TPC: 'PENDING',
        WARDEN: 'PENDING',
      } as any
    },
    {
      id: 'std-3',
      name: 'Vikram Singh',
      rollNo: '24UME019',
      dept: 'ME',
      hostel: 'BH3',
      exitType: 'WITHDRAWAL',
      submittedAt: '2 days ago',
      documents: [
        { name: 'Withdrawal_Form.pdf', type: 'PDF', size: '49 KB', url: '#' }
      ],
      sectionStatuses: {
        LIBRARY: 'PENDING',
        TPC: 'APPROVED',
        WARDEN: 'PENDING',
      } as any
    }
  ];

  const triGateSections = [
    {
      code: 'LIBRARY',
      title: 'Librarian Final Verification',
      desc: 'Checking OCR data against physical library records & return slips.',
      status: sectionStatuses['LIBRARY']?.status || 'PENDING',
      feedback: sectionStatuses['LIBRARY']?.feedbackComment
    },
    {
      code: 'TPC',
      title: 'TPC Check',
      desc: 'Reviewing placement offer letter and clearance obligations.',
      status: sectionStatuses['TPC']?.status || 'PENDING',
      feedback: sectionStatuses['TPC']?.feedbackComment
    },
    {
      code: 'WARDEN',
      title: 'Warden Desk',
      desc: 'Verifying vacant room details (Room 123, BH1) & hostel dues.',
      status: sectionStatuses['WARDEN']?.status || 'PENDING',
      feedback: sectionStatuses['WARDEN']?.feedbackComment
    }
  ];

  const allTriGateCleared = triGateSections.every(s => s.status === 'APPROVED');

  const selectedStudent = pendingStudents.find(s => s.id === selectedStudentId) || pendingStudents[0];

  const getTargetSectionForRole = (role: RoleType) => {
    switch(role) {
      case 'LIBRARIAN': return 'LIBRARY';
      case 'TPC_STAFF': return 'TPC';
      case 'WARDEN': return 'WARDEN';
      default: return 'LIBRARY';
    }
  };

  const handleAction = (status: 'APPROVED' | 'REJECTED') => {
    const targetSection = getTargetSectionForRole(activeRole);
    onUpdateStatus(targetSection, status, feedbackInput);
    setFeedbackInput('');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Controls & Dual View Switcher */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 border border-blue-500/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider border border-blue-500/30">
              Page 2 • Core Tri-Gate Verification
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-heading">
            Tri-Gate Initial Approval Pipeline
          </h2>
          <p className="text-xs text-slate-400">
            Librarian, TPC, and Warden initial verification check.
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewMode('STUDENT')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'STUDENT'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Student View (Lock Screen)</span>
          </button>
          <button
            onClick={() => setViewMode('STAFF')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'STAFF'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Staff Dashboard View</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: STUDENT LOCKING SCREEN */}
      {viewMode === 'STUDENT' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="glass-panel p-8 rounded-2xl border border-blue-500/30 text-center relative overflow-hidden bg-gradient-to-b from-slate-900/90 via-slate-900/60 to-blue-950/20">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Lock className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-extrabold text-white font-heading">STUDENT VIEW (LOCKING SCREEN)</h3>
            <p className="text-sm text-slate-300 mt-1 max-w-lg mx-auto">
              Please wait while your clearance is being verified by the Librarian, TPC, and Warden desks.
            </p>

            {allTriGateCleared ? (
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>All 3 Tri-Gate Desks Have Cleared Your Application!</span>
              </div>
            ) : (
              <p className="text-xs text-amber-400 mt-3 font-mono">
                ⚠️ Screen remains locked until all 3 sections issue clearance approval.
              </p>
            )}
          </div>

          {/* Tri-Gate Verification Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {triGateSections.map((sec) => {
              const isApproved = sec.status === 'APPROVED';
              const isRejected = sec.status === 'REJECTED';
              
              return (
                <div
                  key={sec.code}
                  className={`glass-panel p-6 rounded-2xl border transition-all ${
                    isApproved
                      ? 'border-emerald-500/40 bg-emerald-950/10'
                      : isRejected
                      ? 'border-rose-500/40 bg-rose-950/10'
                      : 'border-slate-700 bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                      {sec.code}
                    </span>
                    
                    {/* Status Badge */}
                    {isApproved ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> CLEARED
                      </span>
                    ) : isRejected ? (
                      <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> REJECTED
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center gap-1 animate-pulse">
                        <Clock className="w-3.5 h-3.5" /> IN PROGRESS
                      </span>
                    )}
                  </div>

                  <h4 className="text-base font-bold text-white font-heading">{sec.title}</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{sec.desc}</p>

                  {/* Annotated Feedback Area */}
                  {sec.feedback && (
                    <div className="mt-4 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-300 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Officer Feedback / Change Request (CR):</span>
                      </div>
                      <p className="italic">{sec.feedback}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Advance button when cleared */}
          <div className="flex justify-end pt-4">
            <button
              onClick={onNext}
              disabled={!allTriGateCleared}
              className={`flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-sm transition-all ${
                allTriGateCleared
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-xl shadow-emerald-500/25 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              <span>Proceed to Page 3: Departmental & Field Clearance Grid</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: WARDEN / TPC STAFF DASHBOARD VIEW */}
      {viewMode === 'STAFF' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fadeIn">
          {/* Left Sidebar: Pending Students Queue (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="glass-panel p-5 rounded-2xl border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white font-heading">
                    Pending Students Requiring Action
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-mono font-bold">
                  {pendingStudents.length} Pending
                </span>
              </div>

              {/* Student Queue Items */}
              <div className="space-y-3">
                {pendingStudents.map((std) => {
                  const isSelected = std.id === selectedStudentId;
                  return (
                    <div
                      key={std.id}
                      onClick={() => setSelectedStudentId(std.id)}
                      className={`p-4 rounded-xl cursor-pointer border transition-all ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-white font-heading">{std.name}</h4>
                        <span className="text-xs font-mono text-slate-400">{std.rollNo}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                        <span>Dept: <strong className="text-slate-300">{std.dept}</strong></span>
                        <span>Hostel: <strong className="text-slate-300">{std.hostel}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Detail Panel: Review Student Documents & Issue Decision (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-amber-500/30 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                <div>
                  <span className="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider">
                    Acting Role: {activeRole}
                  </span>
                  <h3 className="text-xl font-bold text-white font-heading mt-1">
                    Student: {selectedStudent.name} ({selectedStudent.dept})
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">Roll: {selectedStudent.rollNo} | Hostel: {selectedStudent.hostel}</p>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold">
                  <span>CR Active</span>
                </div>
              </div>

              {/* Uploaded Documents List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Uploaded Documents Submission
                </h4>

                {selectedStudent.documents.map((doc, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-blue-400" />
                      <div>
                        <p className="text-xs font-semibold text-white">{doc.name}</p>
                        <p className="text-[11px] text-slate-400">{doc.type} • {doc.size}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveDocPreview(doc.name)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="Preview Document"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Action Section: Approve, Reject, Send Feedback (CR) */}
              <div className="pt-4 border-t border-slate-800 space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1.5">
                    Write feedback / request for correction (CR):
                  </label>
                  <textarea
                    rows={3}
                    value={feedbackInput}
                    onChange={(e) => setFeedbackInput(e.target.value)}
                    placeholder="Enter details if requesting correction or rejection reason..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Button Toolbar matching image.png */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => handleAction('APPROVED')}
                    className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve</span>
                  </button>

                  <button
                    onClick={() => handleAction('REJECTED')}
                    className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject</span>
                  </button>

                  <button
                    onClick={() => {
                      if (!feedbackInput) alert('Please write feedback in text area first.');
                      else handleAction('REJECTED');
                    }}
                    className="flex-1 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Send Feedback (CR)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {activeDocPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel p-6 rounded-2xl max-w-lg w-full border border-slate-700 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white font-heading">Document Preview</h3>
              <button
                onClick={() => setActiveDocPreview(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="p-8 bg-slate-950 border border-slate-800 rounded-xl text-center space-y-3">
              <FileText className="w-12 h-12 text-blue-400 mx-auto" />
              <p className="text-sm font-bold text-white">{activeDocPreview}</p>
              <p className="text-xs text-emerald-400 font-mono">OCR Match: Verified for Rahul Sharma (24UCC174)</p>
            </div>

            <button
              onClick={() => setActiveDocPreview(null)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
