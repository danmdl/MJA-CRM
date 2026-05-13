import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  totalRows: number;
  onPageChange: (page: number) => void;
}

/**
 * Compact paginator used at the top and bottom of the Semillero table.
 * Rendered twice in the parent so the user can paginate from either
 * end of a long page without scrolling.
 */
export const PaginationControls = ({
  page,
  totalPages,
  pageStart,
  pageEnd,
  totalRows,
  onPageChange,
}: PaginationControlsProps) => {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t text-xs">
      <div className="text-muted-foreground tabular-nums">
        Mostrando <span className="font-semibold text-foreground">{pageStart.toLocaleString('es-AR')}–{pageEnd.toLocaleString('es-AR')}</span> de {totalRows.toLocaleString('es-AR')}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(0)}
          disabled={page === 0}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          title="Primera página"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          title="Página anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-2 tabular-nums text-muted-foreground">
          Página <span className="font-semibold text-foreground">{page + 1}</span> de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          title="Página siguiente"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages - 1)}
          disabled={page >= totalPages - 1}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          title="Última página"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
