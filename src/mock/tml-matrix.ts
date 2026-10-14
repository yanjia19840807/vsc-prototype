/**
 * Seed rows from the BRD sheet "TML Matrix".
 * Runtime lookup uses the terminal coverage store, which nests these rows under each port.
 */
export type TmlMatrixRow = {
  port: string
  /** CMA pool location code converted from the terminal name (Terminal_9code). */
  pool: string
  abbr: string
  nameZh: string
}

export const TML_MATRIX: TmlMatrixRow[] = [
  { port: 'CNSHA', pool: 'CNSHADT16', abbr: 'WGQ1', nameZh: '外高桥一期码头(浦东)' },
  { port: 'CNSHA', pool: 'CNSHADT17', abbr: 'WGQ2', nameZh: '外高桥二期码头(振东)' },
  { port: 'CNSHA', pool: 'CNSHADT18', abbr: 'WGQ4', nameZh: '外高桥四期码头(沪东)' },
  { port: 'CNSHA', pool: 'CNSHADT19', abbr: 'WGQ5', nameZh: '外高桥五期码头(明东)' },
  { port: 'CNSHA', pool: 'CNSHADYAN', abbr: 'YAN1', nameZh: '洋山一期码头(盛东）' },
  { port: 'CNSHA', pool: 'CNSHADYTP', abbr: 'YAN3', nameZh: '洋山三期码头(冠东)' },
  { port: 'CNSHA', pool: 'CNSHADSH4', abbr: 'YAN4', nameZh: '洋山四期码头(尚东）' },
  { port: 'CNNGB', pool: 'CNNGBTCMI', abbr: 'BLCTZS', nameZh: '大榭' },
  { port: 'CNNGB', pool: 'CNNGBDMSI', abbr: 'BLCTMS', nameZh: '梅山' },
  { port: 'CNNGB', pool: 'CNNGBDZYC', abbr: 'YZCT', nameZh: '甬州' },
  { port: 'CNNGB', pool: 'CNNGBTNBC', abbr: 'BLCT', nameZh: '北一/二期/北仑二期' },
  { port: 'CNNGB', pool: 'CNNGBDNBS', abbr: 'BLCT2', nameZh: '北二/三期/北二集司' },
  { port: 'CNNGB', pool: 'CNNGBDBCT', abbr: 'BLCT3', nameZh: '北三/四期/北三集司/远东码头' },
  { port: 'CNTAO', pool: 'CNTAODQCT', abbr: 'QQCT', nameZh: '青岛三期' },
  { port: 'CNTAO', pool: 'CNTAODQCU', abbr: 'QQCTU', nameZh: '青岛四期' },
  { port: 'CNTAO', pool: 'CNTAODQCN', abbr: 'QQCTN', nameZh: '青岛五期' },
  { port: 'CNTXG', pool: 'CNTXGDTPC', abbr: 'TPCT', nameZh: '太平洋' },
  { port: 'CNTXG', pool: 'CNTXGDAIC', abbr: 'TACT', nameZh: '联盟国际' },
  { port: 'CNTXG', pool: 'CNTXGDFIC', abbr: 'TECT', nameZh: '欧亚国际' },
  { port: 'CNTXG', pool: 'CNTXGDTEC', abbr: 'TECT', nameZh: '欧亚国际' },
  { port: 'CNTXG', pool: 'CNTXGDTCT', abbr: 'TCT', nameZh: '集装箱' },
  { port: 'CNTXG', pool: 'CNTXGDTPO', abbr: 'TCT', nameZh: '集装箱' },
  { port: 'CNTXG', pool: 'CNTXGDTSC', abbr: 'TSCT', nameZh: '第二集装箱' },
  { port: 'CNDLC', pool: 'CNDLCDDCT', abbr: '', nameZh: '大连港二期码头' },
  { port: 'CNDLC', pool: 'CNDLCDTER', abbr: '', nameZh: '' },
  { port: 'CNDLC', pool: 'CNDLCDDAT', abbr: '', nameZh: '' },
  { port: 'CNDLC', pool: 'CNDLCDDAL', abbr: '', nameZh: '' },
  { port: 'CNLYG', pool: 'CNLYGDPSA', abbr: '', nameZh: '' },
  { port: 'CNLYG', pool: 'CNLYGDCST', abbr: '', nameZh: '' },
  { port: 'CNLYG', pool: 'CNLYGDDTA', abbr: '', nameZh: '' },
]

/** Vendor terminal codes that are not the matrix abbreviation. */
const TERMINAL_CODE_ALIAS: Record<string, string> = {
  YS01: 'YAN1',
}

export function tmlRowsForPort(port: string): TmlMatrixRow[] {
  return TML_MATRIX.filter((row) => row.port === port)
}

/** Resolve API `terminal` (for example YS01) to the TML Matrix row for that port. */
export function tmlRowForTerminal(port: string, terminal: string | null | undefined): TmlMatrixRow | undefined {
  if (!terminal) return undefined
  const code = TERMINAL_CODE_ALIAS[terminal] ?? terminal
  return tmlRowsForPort(port).find((row) => row.abbr === code || row.pool === code || row.abbr === terminal || row.pool === terminal)
}
