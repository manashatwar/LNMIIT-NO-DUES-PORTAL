import React, { useState } from 'react';
import { StudentProfile, RefundLedgerState, ExitType, SectionStatusItem, ApprovalStatus } from '../types';
import { 
  CheckCircle2, 
  Download, 
  Building2, 
  Award,
  CreditCard
} from 'lucide-react';
import { CertificateModal } from './CertificateModal';

interface Page4Props {
  studentProfile: StudentProfile;
  exitType: ExitType;
  refundLedger: RefundLedgerState;
  sectionStatuses: Record<string, SectionStatusItem>;
  onUpdateStatus: (code: string, status: ApprovalStatus, comment?: string) => void;
}

export const Page4Financial: React.FC<Page4Props> = ({
  studentProfile,
  exitType,
  refundLedger,
  sectionStatuses,
  onUpdateStatus
}) => {
  const [showCertificate, setShowCertificate] = useState<boolean>(false);

  const accountsStatus = sectionStatuses['ACCOUNTS']?.status || 'APPROVED';
  const adminStatus = sectionStatuses['ADMINISTRATION']?.status || 'APPROVED';

  const isFinalReleased = adminStatus === 'APPROVED';

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Header */}
      <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-purple-500/20 relative overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold uppercase tracking-wider border border-purple-500/30">
                Page 4 • Financial Clearance & Release
              </span>
              <span className="text-xs text-slate-400 font-mono">Final Approval Stage</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-heading">
              Accounts Refund & <span className="text-gradient">Final Release</span>
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Verification of refundable caution money, deduction of voluntary donations, and final digital certificate issuance.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Accounts Refund Ledger (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-purple-500/30 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-heading">Financial Clearance (Accounts)</h3>
                  <p className="text-xs text-slate-400">Refund Ledger Calculation</p>
                </div>
              </div>

              <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                accountsStatus === 'APPROVED'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              }`}>
                {accountsStatus === 'APPROVED' ? '✓ ACCOUNTS CLEARED' : 'PENDING'}
              </span>
            </div>

            {/* Note regarding the crossed out table from image.png */}
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold font-mono text-[10px]">
                UPDATED PROCESS
              </span>
              <span>
                Granular fee line items simplified directly into consolidated Caution Refund Ledger as requested.
              </span>
            </div>

            {/* Refund Ledger Card (Annotated in image.png) */}
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Refund Ledger Details</h4>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between py-2 border-b border-slate-900">
                  <span className="text-slate-400">Caution Money (Refundable)</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    + ₹{refundLedger.cautionMoney.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-900">
                  <span className="text-slate-400">Total Outstanding Dues</span>
                  <span className="text-rose-400 font-mono font-bold">
                    - ₹{refundLedger.totalDues.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-900">
                  <span className="text-slate-400">Voluntary Student Welfare Donation (Page 0)</span>
                  <span className="text-amber-400 font-mono font-bold">
                    - ₹{refundLedger.voluntaryDonation.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Net Refund Amount */}
                <div className="pt-2 flex items-center justify-between text-sm">
                  <span className="font-bold text-white font-heading">Net Refund Amount:</span>
                  <span className="text-xl font-extrabold font-mono text-emerald-400 bg-emerald-500/10 px-4 py-1.5 rounded-xl border border-emerald-500/30">
                    ₹{refundLedger.netRefund.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-400 shrink-0" />
                <span>
                  Amount will be credited to registered bank account after final administration release.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Final Administration Release (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-emerald-500/40 relative overflow-hidden bg-gradient-to-b from-slate-900/90 to-emerald-950/20 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Award className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-heading">Final Administration Release</h3>
                <p className="text-xs text-slate-400">Registrar Sign-Off</p>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 text-center space-y-4">
              {isFinalReleased ? (
                <div className="space-y-3 animate-fadeIn">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="text-lg font-extrabold text-white font-heading">Released Successfully! 🎉</h4>
                    <p className="text-xs text-slate-300 mt-1">
                      Your clearance process is complete. You can now view and download your digital no-dues certificate.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-amber-400 font-medium">Pending Administration Release...</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => setShowCertificate(true)}
                disabled={!isFinalReleased}
                className={`w-full py-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                  isFinalReleased
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-xl shadow-emerald-500/25 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>Download Complete Digital No-Dues Certificate</span>
              </button>

              <button
                onClick={() => onUpdateStatus('ADMINISTRATION', isFinalReleased ? 'PENDING' : 'APPROVED')}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold border border-slate-800 transition-colors"
              >
                Toggle Admin Sign-Off ({isFinalReleased ? 'Revoke Release' : 'Grant Release'})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Certificate Modal */}
      {showCertificate && (
        <CertificateModal
          studentProfile={studentProfile}
          exitType={exitType}
          refundLedger={refundLedger}
          onClose={() => setShowCertificate(false)}
        />
      )}
    </div>
  );
};
