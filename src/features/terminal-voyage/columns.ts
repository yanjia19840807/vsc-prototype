import { h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'

import { formatDateTime } from '@/lib/vessel-utils'

import {
  TERMINAL_VOYAGE_COLUMNS,
  isTerminalVoyageDate,
  terminalVoyageSortValue,
  type TerminalVoyageField,
  type TerminalVoyageRow,
} from '@/features/terminal-voyage/model'

export function terminalVoyageText(row: TerminalVoyageRow, id: TerminalVoyageField) {
  const raw = row[id]
  if (raw == null || raw === '') return '—'
  return isTerminalVoyageDate(id) ? formatDateTime(raw) : raw
}

export function terminalVoyageColumnDefs(): ColumnDef<any, any>[] {
  const leaves: ColumnDef<any, any>[] = TERMINAL_VOYAGE_COLUMNS.map((column) => ({
    id: column.id,
    header: column.label,
    enableSorting: true,
    enableHiding: false,
    accessorFn: (row: TerminalVoyageRow) => terminalVoyageSortValue(row, column.id),
    cell: ({ row }) => h('span', terminalVoyageText(row.original as TerminalVoyageRow, column.id)),
    ...(column.kind === 'datetime' ? { sortFn: 'datetime' as const } : {}),
  }))
  leaves.push({
    id: 'actions',
    header: 'Actions',
    enableSorting: false,
    enableHiding: false,
  })
  return leaves
}
