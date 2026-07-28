import React, { useState } from 'react';
import { SectionStatusItem, ApprovalStatus } from '../types';
import { 
  Package, 
  Globe, 
  Trophy, 
  Stethoscope, 
  FileCheck, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  ShieldAlert
} from 'lucide-react';

interface Page3Props {
  sectionStatuses: Record<string, SectionStatusItem>;
  onUpdateStatus: (code: string, status: ApprovalStatus, comment?: string) => void;
  onNext: () => void;
}

export const Page3Department: React.FC<Page3Props> = ({
  sectionStatuses,
  onUpdateStatus,
  onNext
}) => {
  const [lucsLink, setLucsLink] = useState<string>('https://lucs.lnmiit.ac.in/reports/24ucc174');

  const deptItems = [
    {
      code: 'STORE',
      title: 'Central Store',
      desc: 'Verification of store equipment & inventory clearance.',
      icon: <Package className="w-5 h-5 text-amber-400" />,
      status: sectionStatuses['STORE']?.status || 'APPROVED'
    },
    {
      code: 'LUCS',
      title: 'LUCS (LNMIIT Unix Computing Society)',
      desc: 'Attach Event Report Link or File upload.',
      icon: <Globe className="w-5 h-5 text-cyan-400" />,
      status: sectionStatuses['LUCS']?.status || 'APPROVED'
    },
    {
      code: 'SPORTS',
      title: 'Sports Council',
      desc: 'GSAC General Secretary & Sports Secretary sports equipment clearance.',
      icon: <Trophy className="w-5 h-5 text-indigo-400" />,
      status: sectionStatuses['SPORTS']?.status || 'APPROVED'
    },
    {
      code: 'MEDICAL',
      title: 'Medical Unit',
      desc: 'Medical booklet surrender & health center clearance.',
      icon: <Stethoscope className="w-5 h-5 text-rose-400" />,
      status: sectionStatuses['MEDICAL']?.status || 'APPROVED'
    },
    {
      code: 'NAD',
      title: 'NAD Cell (National Academic Depository)',
      desc: 'Degree transcript availability check.',
      icon: <FileCheck className="w-5 h-5 text-emerald-400" />,
      status: sectionStatuses['NAD']?.status || 'APPROVED'
    }
  ];

  const hodStatus = sectionStatuses['HOD']?.status || 'APPROVED';
  const allDeptCleared = deptItems.every(i => i.status === 'APPROVED') && hodStatus === 'APPROVED';

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Header */}
      <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-indigo-500/20 relative overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider border border-indigo-500/30">
                Page 3 • Academic Unit
              </span>
              <span className="text-xs text-slate-400">Departmental & Field Clearance Grid</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-heading">
              Computer Science Engineering <span className="text-gradient">HOD Clearance</span>
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Consolidated departmental checklist combining Store, LUCS, Sports, Medical, and NAD Cell.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium">HOD Status:</span>
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold font-mono border ${
              hodStatus === 'APPROVED'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}>
              {hodStatus === 'APPROVED' ? '✓ HOD CLEARED' : 'PENDING'}
            </span>
          </div>
        </div>
      </div>

      {/* Operational Status Checklist Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <span>Operational Status Checklist</span>
          <span className="text-xs font-normal text-indigo-400 font-mono">ACAD Unit Sub-Clearances</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {deptItems.map((item) => {
            const isApproved = item.status === 'APPROVED';
            return (
              <div
                key={item.code}
                className={`glass-panel p-6 rounded-2xl border transition-all ${
                  isApproved
                    ? 'border-emerald-500/40 bg-emerald-950/10'
                    : 'border-slate-700 bg-slate-900/50'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    {item.icon}
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${
                    isApproved
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    {isApproved ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> CLEARED
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5" /> PENDING
                      </>
                    )}
                  </span>
                </div>

                <h4 className="text-base font-bold text-white font-heading">{item.title}</h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.desc}</p>

                {/* Custom Submission Input for LUCS */}
                {item.code === 'LUCS' && (
                  <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                    <label className="text-[11px] font-semibold text-slate-300 block">
                      Attach Event Report Link/File:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={lucsLink}
                        onChange={(e) => setLucsLink(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white font-mono focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        onClick={() => {
                          onUpdateStatus('LUCS', 'APPROVED');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {/* Quick Toggle for Simulation */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-mono">{item.code}</span>
                  <button
                    onClick={() => onUpdateStatus(item.code, isApproved ? 'PENDING' : 'APPROVED')}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold underline"
                  >
                    Toggle {isApproved ? 'Pending' : 'Clear'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reverse Cascade Information Banner */}
      <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 flex items-center gap-3">
        <ShieldAlert className="w-5 h-5 text-indigo-400 shrink-0" />
        <div>
          <strong className="text-white block font-heading text-sm">Automated Reverse-Cascade Guarantee:</strong>
          If any upstream clearance (e.g. Store or LUCS) is revoked by an officer, HOD approval automatically resets to <em>PENDING</em> to maintain audit integrity.
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex justify-end pt-4">
        <button
          onClick={onNext}
          disabled={!allDeptCleared}
          className={`flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-sm transition-all ${
            allDeptCleared
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-xl shadow-indigo-500/25 cursor-pointer'
              : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
          }`}
        >
          <span>Proceed to Page 4: Financial Clearance (Accounts)</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
