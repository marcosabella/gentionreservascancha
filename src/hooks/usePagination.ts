import { useState } from 'react';

export const PAGE_SIZES = [5, 10, 20] as const;
export type PageSize = typeof PAGE_SIZES[number];

export function usePagination<T>(items: T[], filterKey: string) {
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [position, setPosition] = useState({ page: 1, filterKey });
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = position.filterKey === filterKey ? Math.min(position.page, totalPages) : 1;

  // Reset searches immediately and keep the last page valid after deletions.
  if (position.filterKey !== filterKey || position.page !== page) {
    setPosition({ page, filterKey });
  }

  const startIndex = (page - 1) * pageSize;
  return {
    paginatedItems: items.slice(startIndex, startIndex + pageSize),
    pagination: {
      page,
      pageSize,
      totalItems: items.length,
      totalPages,
      onPageChange: (nextPage: number) => setPosition({
        page: Math.max(1, Math.min(nextPage, totalPages)), filterKey
      }),
      onPageSizeChange: (size: PageSize) => {
        setPageSize(size);
        setPosition({ page: 1, filterKey });
      }
    }
  };
}
