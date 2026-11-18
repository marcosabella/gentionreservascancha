import React from 'react';
import { PAGE_SIZES, PageSize } from '../hooks/usePagination';

interface PaginationProps {
  page: number;
  pageSize: PageSize;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  page, pageSize, totalItems, totalPages, onPageChange, onPageSizeChange
}) => {
  const first = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  const buttonClass = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3">
      <label className="flex items-center gap-2 text-sm text-gray-600">
        Registros por página
        <select value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value) as PageSize)}
          className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-gray-900 focus:ring-2 focus:ring-green-500">
          {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <p aria-live="polite" className="text-sm text-gray-600">Mostrando {first}–{last} de {totalItems} registros</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={page === 1} onClick={() => onPageChange(page - 1)} className={buttonClass}>Anterior</button>
        <span className="text-sm text-gray-600">Página {page} de {totalPages}</span>
        <button type="button" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} className={buttonClass}>Siguiente</button>
      </div>
    </nav>
  );
};

export default Pagination;
