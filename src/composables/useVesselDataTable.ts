import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import type {
  ColumnDef,
  ColumnVisibilityState,
  PaginationState,
  SortingState,
} from '@tanstack/vue-table'
import {
  columnOrderingFeature,
  columnVisibilityFeature,
  createPaginatedRowModel,
  createSortedRowModel,
  functionalUpdate,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  tableFeatures,
  useTable,
} from '@tanstack/vue-table'

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  columnOrderingFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    datetime: sortFn_datetime,
  },
})

/** Shared TanStack Table setup (sort + pagination + optional column visibility). */
export function useVesselDataTable<TData extends { id: string }>(options: {
  columns: ColumnDef<any, any>[] | Ref<ColumnDef<any, any>[]>
  data: MaybeRefOrGetter<TData[]>
  initialSorting?: SortingState
  initialPageSize?: number
  columnVisibility?: Ref<ColumnVisibilityState>
  columnOrder?: Ref<string[]>
  getRowId?: (row: TData) => string
}) {
  const sorting = ref<SortingState>(options.initialSorting ?? [])
  const pagination = ref<PaginationState>({
    pageIndex: 0,
    pageSize: options.initialPageSize ?? 10,
  })
  const localVisibility = ref<ColumnVisibilityState>({})
  const columnVisibility = options.columnVisibility ?? localVisibility

  const tableState = computed(() => ({
    sorting: sorting.value,
    pagination: pagination.value,
    columnVisibility: columnVisibility.value,
    ...(options.columnOrder ? { columnOrder: options.columnOrder.value } : {}),
  }))

  const tableData = computed(() => toValue(options.data))

  const table = useTable({
    features,
    columns: options.columns as any,
    data: tableData,
    state: tableState,
    getRowId: (row: TData) => options.getRowId?.(row) ?? row.id,
    onSortingChange: (updater) => {
      sorting.value = functionalUpdate(updater, sorting.value)
      pagination.value = { ...pagination.value, pageIndex: 0 }
    },
    onPaginationChange: (updater) => {
      pagination.value = functionalUpdate(updater, pagination.value)
    },
    onColumnVisibilityChange: (updater) => {
      columnVisibility.value = functionalUpdate(updater, columnVisibility.value)
    },
    onColumnOrderChange: (updater) => {
      if (!options.columnOrder) return
      options.columnOrder.value = functionalUpdate(updater, options.columnOrder.value)
    },
  })

  function resetPage() {
    pagination.value = { ...pagination.value, pageIndex: 0 }
  }

  function clearSort(next: SortingState = options.initialSorting ?? []) {
    table.setSorting(next.map((rule) => ({ ...rule })))
  }

  /** Add or update one column without dropping the other sort rules. */
  function setColumnSort(id: string, desc: boolean) {
    table.getColumn(id)?.toggleSorting(desc, true)
  }

  return {
    table,
    sorting,
    pagination,
    columnVisibility,
    tableRows: computed(() => table.getRowModel().rows),
    sortedAllRows: computed(() => table.getSortedRowModel().rows.map((r) => r.original)),
    rowCount: computed(() => table.getRowCount()),
    pageCount: computed(() => table.getPageCount()),
    headerGroups: computed(() => table.getHeaderGroups()),
    resetPage,
    clearSort,
    setColumnSort,
  }
}

export function textColumn(id: string, header: string, sortable = true): ColumnDef<any, any> {
  return {
    accessorKey: id,
    id,
    header,
    enableSorting: sortable,
  }
}

export function datetimeColumn(id: string, header: string): ColumnDef<any, any> {
  return {
    accessorKey: id,
    id,
    header,
    enableSorting: true,
    sortFn: 'datetime',
  }
}
