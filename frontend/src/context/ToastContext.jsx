import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  // Default duration set to 10000ms (10 seconds)
  const addToast = useCallback(
    (message, type = "success", duration = 10000) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type, duration }]);

      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [],
  );

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider
      value={{
        showSuccess: (msg, duration) => addToast(msg, "success", duration),
        showError: (msg, duration) => addToast(msg, "error", duration),
        showInfo: (msg, duration) => addToast(msg, "info", duration),
      }}
    >
      {children}
      {/* Positioned at the TOP RIGHT corner with a high z-index */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto relative overflow-hidden flex items-center justify-between p-4 rounded-lg shadow-2xl border text-xs font-medium transition-all duration-300 transform translate-y-0 ${
              toast.type === "success"
                ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                : toast.type === "error"
                  ? "bg-rose-50 text-rose-900 border-rose-300"
                  : "bg-indigo-50 text-indigo-900 border-indigo-300"
            }`}
          >
            <div className="flex items-center gap-2.5 pr-2">
              {toast.type === "success" && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              {toast.type === "error" && (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              {toast.type === "info" && (
                <Info className="w-4 h-4 text-indigo-600 shrink-0" />
              )}
              <span className="leading-snug">{toast.message}</span>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-black/5 rounded transition text-slate-400 hover:text-slate-700 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Countdown line over 10-15 seconds */}
            <div
              className={`absolute bottom-0 left-0 h-1 ${
                toast.type === "success"
                  ? "bg-emerald-500"
                  : toast.type === "error"
                    ? "bg-rose-500"
                    : "bg-indigo-500"
              }`}
              style={{
                width: "100%",
                animation: `shrinkWidth ${toast.duration}ms linear forwards`,
              }}
            />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
