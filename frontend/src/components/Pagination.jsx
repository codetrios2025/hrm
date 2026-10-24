import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, totalPages, total, limit } = pagination;
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between px-3 py-3 border-t border-slate-100 text-xs text-slate-600">
      <div>
        Showing <span className="font-medium text-slate-800">{startItem}</span>{" "}
        to <span className="font-medium text-slate-800">{endItem}</span> of{" "}
        <span className="font-medium text-slate-800">{total}</span> entries
      </div>
      <div className="flex items-center space-x-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
        </button>

        <span className="px-2 py-1 font-medium text-slate-700">
          Page {page} of {totalPages}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
        </button>
      </div>
    </div>
  );
}
