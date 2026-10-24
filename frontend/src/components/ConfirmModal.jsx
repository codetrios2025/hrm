import React from "react";
import { LogOut, X, AlertCircle } from "lucide-react";

export default function ConfirmModal({
  isOpen,
  title = "Confirm Punch Out",
  message = "Are you sure you want to punch out for the day?",
  subMessage,
  confirmText = "Yes, Punch Out",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  loading = false,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 transform transition-all">
        {/* Header Icon & Close Button */}
        <div className="flex items-start justify-between mb-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
            <LogOut className="w-5 h-5 stroke-[2.2]" />
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Text Content */}
        <div className="space-y-2 mb-6">
          <h3 className="text-base font-bold text-slate-900 leading-snug">
            {title}
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">{message}</p>
          {subMessage && (
            <div className="flex items-center gap-1.5 p-2.5 rounded-lg bg-blue-50 border border-blue-100 text-[11px] text-blue-700 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{subMessage}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl shadow-sm transition disabled:opacity-50"
          >
            {loading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
