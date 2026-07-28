import React from 'react';
import { ExitType } from '../types';
import { 
  GraduationCap, 
  BookOpenCheck, 
  LogOut, 
  UserX, 
  HeartHandshake, 
  ArrowRight, 
  Check, 
  Info
} from 'lucide-react';

interface Page0Props {
  exitType: ExitType;
  setExitType: (type: ExitType) => void;
  donateWelfare: boolean;
  setDonateWelfare: (donate: boolean) => void;
  donationAmount: number;
  setDonationAmount: (amount: number) => void;
  onNext: () => void;
}

export const Page0Initiation: React.FC<Page0Props> = ({
  exitType,
  setExitType,
  donateWelfare,
  setDonateWelfare,
  donationAmount,
  setDonationAmount,
  onNext
}) => {
  const exitOptions: { type: ExitType; title: string; desc: string; icon: React.ReactNode }[] = [
    {
      type: 'GRADUATION',
      title: 'Graduation',
      desc: 'Regular B.Tech/M.Tech/Ph.D Degree completion exit.',
      icon: <GraduationCap className="w-8 h-8 text-blue-400" />
    },
    {
      type: 'NEP_EXIT',
      title: 'NEP Exit',
      desc: 'National Education Policy 2020 multi-stage exit option.',
      icon: <BookOpenCheck className="w-8 h-8 text-cyan-400" />
    },
    {
      type: 'WITHDRAWAL',
      title: 'Withdrawal',
      desc: 'Voluntary institutional withdrawal prior to graduation.',
      icon: <LogOut className="w-8 h-8 text-amber-400" />
    },
    {
      type: 'ADMISSION_CANCEL',
      title: 'Admission Cancel',
      desc: 'Seat cancellation or immediate entry stage exit.',
      icon: <UserX className="w-8 h-8 text-rose-400" />
    }
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Header Card */}
      <div className="glass-panel p-6 sm:p-8 rounded-2xl relative overflow-hidden border border-blue-500/20">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-3 mb-2">
          <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider border border-blue-500/30">
            Page 0 • Option Gate
          </span>
          <span className="text-xs text-slate-400">Student Intake & Declaration</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-heading">
          Select Your <span className="text-gradient">Exit Type</span>
        </h2>
        <p className="mt-2 text-sm text-slate-300 max-w-2xl">
          Choose the institutional exit option that best describes your status. Your section clearance checklist will automatically customize to your required workflow.
        </p>
      </div>

      {/* Exit Option Grid */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <span>1. Institutional Exit Mode</span>
          <span className="text-xs font-normal text-blue-400 font-mono">(MIS Configured)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {exitOptions.map((opt) => {
            const isSelected = exitType === opt.type;
            return (
              <div
                key={opt.type}
                onClick={() => setExitType(opt.type)}
                className={`glass-card p-6 rounded-2xl cursor-pointer relative flex flex-col justify-between transition-all duration-300 ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/50 shadow-xl shadow-blue-500/10 scale-[1.02]'
                    : 'hover:border-slate-600 hover:bg-slate-800/60'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-md">
                    <Check className="w-4 h-4" />
                  </div>
                )}
                
                <div className="space-y-4">
                  <div className="p-3 w-fit rounded-xl bg-slate-900/80 border border-slate-700/80">
                    {opt.icon}
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white font-heading">{opt.title}</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{opt.desc}</p>
                  </div>
                </div>

                <div className="mt-6 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className={isSelected ? 'text-blue-400 font-semibold' : 'text-slate-500'}>
                    {isSelected ? 'Selected' : 'Click to select'}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 uppercase">{opt.type}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Voluntary Welfare Fund Donation Box (Annotated in image.png) */}
      <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-emerald-950/20 relative">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 mt-1">
              <HeartHandshake className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white font-heading">
                  Institute Students' Welfare Fund Contribution
                </h3>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  OPTIONAL
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-xl">
                Would you like to donate a portion of your caution money refund to support student welfare and campus development initiatives?
              </p>
            </div>
          </div>

          {/* Toggle switch */}
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={donateWelfare}
              onChange={(e) => setDonateWelfare(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-14 h-8 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        {/* Donation Amount Input if enabled */}
        {donateWelfare && (
          <div className="mt-6 pt-6 border-t border-slate-800/80 space-y-4 animate-fadeIn">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-slate-300">Select Donation Amount (₹):</span>
              {[500, 1000, 2000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setDonationAmount(amt)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    donationAmount === amt
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 scale-105'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  ₹{amt.toLocaleString('en-IN')}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 max-w-xs">
              <span className="text-xs text-slate-400 font-medium">Enter amount (₹):</span>
              <input
                type="number"
                min="100"
                max="10000"
                value={donationAmount}
                onChange={(e) => setDonationAmount(Math.max(0, Number(e.target.value)))}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>
                Note: <strong>₹{donationAmount.toLocaleString('en-IN')}</strong> will be automatically deducted from your Caution Money refund on <strong>Page 4 (Financial Clearance - Accounts)</strong>.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex justify-end pt-4">
        <button
          onClick={onNext}
          className="flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-blue-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <span>Proceed to Page 1: Intake & Verification Uploads</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
