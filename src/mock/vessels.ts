import { applyStoredTerminal9code, applyStoredVesselType } from '@/domain/calculated-fields'
import { brandFromVoyage } from '@/domain/lara-brand'
import { createSeedPorts } from '@/features/terminal-coverage/model'
import { formatApiDateTime } from '@/lib/vessel-utils'
import type {
  ActivityLogEntry,
  Checkpoint,
  FieldHistoryEntry,
  HistoryEntry,
  TaskItem,
  TerminalSchedule,
  VesselRecord,
  VolumeData,
  WorkflowStatus,
} from '@/types/vsc'
import { CURRENT_USER, portByCode } from './ports'
import { tmlRowsForPort } from './tml-matrix'

const coveragePorts = createSeedPorts()

function daysFromNow(offset: number, hour = 10): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

function daysBefore(iso: string, days: number, hour: number) {
  const d = new Date(iso)
  d.setDate(d.getDate() - days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

function fmtShort(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function emptyVolumes(): VolumeData {
  return {
    slc: 0,
    sdc: 0,
    lc: 0,
    dc: 0,
    overshipped: 0,
    shortshipped: 0,
    overlanded: 0,
    shortlanded: 0,
    loadingVol: 0,
    dischargeVol: 0,
  }
}

function cps(names: string[], done = 0): Checkpoint[] {
  return names.map((name, i) => ({
    id: `cp-${i}`,
    name,
    required: true,
    completed: i < done,
    completedBy: i < done ? CURRENT_USER : undefined,
    completedAt: i < done ? daysFromNow(-1) : undefined,
  }))
}

function postSailingTask(status: WorkflowStatus, done = 0): TaskItem[] {
  return [
    {
      id: 'ps-main',
      name: 'Post sailing checklist',
      status,
      revision: 0,
      owner: status === 'New' ? undefined : CURRENT_USER,
      checkpoints: cps(
        ['Verify ATD', 'Enter container volumes', 'SLC/SDC file ready', 'LTK receipt check'],
        done,
      ),
    },
  ]
}

function cargoOpsTasks(withDeadline = true): TaskItem[] {
  const soon = daysFromNow(0, 14)
  const overdue = daysFromNow(-1, 9)
  return [
    {
      id: 'co-load',
      name: 'Loading ops',
      status: 'In Progress',
      revision: 0,
      owner: CURRENT_USER,
      deadline: withDeadline ? soon : undefined,
      checkpoints: cps(['CY check', 'Loading volume confirm', 'Partner slot check'], 1),
    },
    {
      id: 'co-disc',
      name: 'Discharge ops',
      status: 'Pending',
      revision: 0,
      deadline: withDeadline ? overdue : undefined,
      checkpoints: cps(['Discharge plan', 'Overlanded review'], 0),
    },
  ]
}

function log(action: string, detail?: string): ActivityLogEntry {
  return {
    id: `log-${Math.random().toString(36).slice(2, 8)}`,
    at: daysFromNow(0, 9),
    user: CURRENT_USER,
    action,
    detail,
  }
}

function shown(value: string) {
  if (!value) return ''
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return value
  return fmtShort(parsed.toISOString())
}

function changedDetails(pairs: Array<[string, string, string]>) {
  return pairs.flatMap(([field, from, to]) => (from === to ? [] : [{ field, from, to }]))
}

function historyEntry(
  id: string,
  at: string,
  type: HistoryEntry['type'],
  by: string,
  details: HistoryEntry['details'],
  reason?: string,
): HistoryEntry {
  const sync = type === 'LARA sync' || type === 'Terminal sync' || type === 'Auto match'
  return {
    id,
    at,
    type,
    trigger: sync ? 'Auto' : undefined,
    by,
    reason,
    summary: details.length === 1
      ? '1 field updated'
      : details.length
        ? `${details.length} fields updated`
        : 'No field changes',
    details,
  }
}

function matchLabel(vessel: VesselRecord) {
  return `Export ${vessel.externalExportVoyage || '—'} · Import ${vessel.externalImportVoyage || '—'} · ${vessel.terminalName || '—'}`
}

/** Values written the first time this vessel schedule arrived. Later syncs only list real changes. */
function laraArrival(vessel: VesselRecord, etd: string) {
  return changedDetails([
    ['laraVoyage', '', vessel.laraVoyage],
    ['vesselName', '', vessel.vesselName],
    ['pointCode', '', vessel.pointCode],
    ['laraPoolLocation', '', vessel.laraPoolLocation],
    ['service', '', vessel.service],
    ['laraEta', '', shown(vessel.laraEta)],
    ['laraEtb', '', shown(vessel.laraEtb)],
    ['laraEtd', '', etd],
    ['voyageStatus', '', vessel.voyageStatus],
  ])
}

/** Each later value must be the one written by the previous sync. First sync starts from empty. */
function seedActivity(
  vessel: VesselRecord,
  seed: Seed,
  times: {
    firstLaraAt: string
    laraSyncAt: string
    firstTerminalAt: string
    terminalSyncAt: string
    manualMatchAt: string
  },
): { history: HistoryEntry[]; fieldHistory: FieldHistoryEntry[] } {
  const history: HistoryEntry[] = []
  const fieldHistory: FieldHistoryEntry[] = []
  const currentLaraEtd = shown(vessel.laraEtd)
  const introducedLaraEtd = shown(daysFromNow(-2, 18))
  if (!currentLaraEtd || introducedLaraEtd === currentLaraEtd) {
    history.push(historyEntry(
      `hist-lara-first-${vessel.id}`,
      times.firstLaraAt,
      'LARA sync',
      'System',
      laraArrival(vessel, currentLaraEtd),
    ))
    history.push(historyEntry(`hist-lara-${vessel.id}`, times.laraSyncAt, 'LARA sync', 'System', []))
  } else {
    history.push(historyEntry(
      `hist-lara-first-${vessel.id}`,
      times.firstLaraAt,
      'LARA sync',
      'System',
      laraArrival(vessel, introducedLaraEtd),
    ))
    history.push(historyEntry(
      `hist-lara-${vessel.id}`,
      times.laraSyncAt,
      'LARA sync',
      'System',
      changedDetails([['laraEtd', introducedLaraEtd, currentLaraEtd]]),
    ))
  }

  const portCovered = vessel.apiCovered
  const pushTerminal = (id: string, at: string, details: HistoryEntry['details']) => {
    history.push(historyEntry(id, at, 'Terminal sync', 'System', details))
    for (const detail of details) {
      fieldHistory.push({
        field: detail.field,
        refreshTime: shown(at),
        originalValue: detail.from,
        updatedValue: detail.to,
      })
    }
  }

  if (portCovered && (seed.rowNotFound || !vessel.terminalSchedule)) {
    pushTerminal(`hist-term-${vessel.id}`, times.terminalSyncAt, [])
  } else if (portCovered && vessel.terminalSchedule) {
    const etdOverride = seed.manualOverrides?.etd ?? seed.manualOverrides?.tmlEtd
    const voyageOverride = seed.manualOverrides?.evoyage ?? seed.manualOverrides?.externalVoyage
    const currentEtd = shown(vessel.tmlEtd)
    const currentVoyage = vessel.externalExportVoyage || ''
    const priorEtd = shown(daysFromNow(0, 16))
    const systemEtd = etdOverride
      ? shown(etdOverride.source)
      : priorEtd && priorEtd !== currentEtd
        ? priorEtd
        : currentEtd
    const systemVoyage = voyageOverride ? voyageOverride.source : currentVoyage
    pushTerminal(
      `hist-term-first-${vessel.id}`,
      times.firstTerminalAt,
      changedDetails([
        ['externalVoyage', '', systemVoyage],
        ['ivoyage', '', vessel.externalImportVoyage],
        ['terminalName', '', vessel.terminalName],
        ['eta', '', shown(vessel.tmlEta)],
        ['etb', '', shown(vessel.tmlEtb)],
        ['etd', '', systemEtd],
      ]),
    )
    const later = changedDetails([
      ['etd', systemEtd, etdOverride ? systemEtd : currentEtd],
      ['externalVoyage', systemVoyage, voyageOverride ? systemVoyage : currentVoyage],
    ])
    if (later.length) pushTerminal(`hist-term-${vessel.id}`, times.terminalSyncAt, later)
    const manual = changedDetails([
      ...(etdOverride ? [['etd', shown(etdOverride.source), shown(etdOverride.manual)] as [string, string, string]] : []),
      ...(voyageOverride ? [['externalVoyage', voyageOverride.source, voyageOverride.manual] as [string, string, string]] : []),
    ])
    if (manual.length) {
      history.push(historyEntry(
        `hist-edit-${vessel.id}`,
        times.manualMatchAt,
        'Manual edit',
        voyageOverride?.by || etdOverride?.by || CURRENT_USER,
        manual,
        voyageOverride?.reason || etdOverride?.reason,
      ))
    }
  }

  if (seed.matchingStatus === 'Auto matched' && vessel.terminalSchedule) {
    history.push(historyEntry(
      `hist-match-${vessel.id}`,
      times.firstTerminalAt,
      'Auto match',
      'System',
      changedDetails([['Match', 'Unconfirmed', matchLabel(vessel)]]),
    ))
  }
  if (seed.matchingStatus === 'Manual matched') {
    history.push(historyEntry(
      `hist-match-${vessel.id}`,
      times.manualMatchAt,
      'Manual match',
      CURRENT_USER,
      changedDetails([['Match', 'Unconfirmed', matchLabel(vessel)]]),
      'Terminal confirmed',
    ))
  }

  history.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return { history, fieldHistory }
}

type CandidateSeed = { evoyage: string; ivoyage?: string; terminal?: string }

type Seed = Partial<VesselRecord> &
  Pick<VesselRecord, 'id' | 'vesselName' | 'pointCode' | 'region' | 'matchingStatus' | 'workflowStatus'> & {
    terminalCode?: string
    /** Feituo / terminal Chinese vessel name. */
    vesselNameCn?: string | null
    /** Extra Freightower rows besides the schedule built for this seed. */
    extraCandidates?: CandidateSeed[]
    /** Keep candidates only. Do not bind one terminal row. */
    unbound?: boolean
    /** Terminal times stay; import and export voyages are empty. */
    blankVoyages?: boolean
    /** Created via Add vessel, so no LARA-bound terminal row. */
  }

export function refreshSharedTerminal(vessels: VesselRecord[]) {
  const counts = new Map<string, number>()
  const keyOf = (vessel: VesselRecord) => {
    if (vessel.matchingStatus !== 'Auto matched' && vessel.matchingStatus !== 'Manual matched') return ''
    const evoyage = vessel.terminalSchedule?.evoyage?.trim()
    const terminal = vessel.terminalSchedule?.terminal?.trim()
    if (!evoyage || !terminal) return ''
    return `${vessel.pointCode}|${terminal}|${evoyage}`
  }
  for (const vessel of vessels) {
    const key = keyOf(vessel)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const vessel of vessels) {
    const key = keyOf(vessel)
    vessel.sharedLaraCount = key ? (counts.get(key) ?? 0) : 0
  }
}

function hashId(id: string) {
  return [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
}

function apiTime(value: string): string | null {
  return value ? formatApiDateTime(value) : null
}

function terminalCodeFor(pointCode: string, id: string) {
  const rows = tmlRowsForPort(pointCode).filter((row) => row.abbr)
  if (!rows.length) return null
  return rows[hashId(id) % rows.length]!.abbr
}

function terminalStatus(atd: string | null, atb: string | null) {
  if (atd) return '离港'
  if (atb) return '在港'
  return '计划'
}

function build(seed: Seed): VesselRecord {
  const firstLaraAt = daysFromNow(-2, 9)
  const laraSyncAt = daysFromNow(-1, 9)
  const firstTerminalAt = daysFromNow(-2, 17)
  const terminalSyncAt = daysFromNow(-1, 17)
  const manualMatchAt = daysFromNow(-1, 18)
  const port = portByCode(seed.pointCode)
  const apiCovered = seed.apiCovered ?? port?.apiCovered ?? false
  const etbOff = seed.laraEtb ? 0 : -1
  const etb = seed.laraEtb ?? daysFromNow(etbOff, 8)
  const laraEta = seed.laraEta ?? daysBefore(etb, 1, 7)
  const etd = seed.laraEtd ?? daysFromNow(etbOff + 1, 18)
  // Keep the default terminal ETA on the same day as LARA ETA. A gap is only the examples that set tmlEta.
  const ext = seed.blankVoyages
    ? ''
    : (seed.externalVoyage ??
      seed.externalExportVoyage ??
      seed.localVoyage ??
      `${1000000 + (hashId(seed.id) % 900000)}E`)
  const importVoyage = seed.blankVoyages
    ? ''
    : (seed.externalImportVoyage ?? `E${String((hashId(seed.id) % 900) + 100).padStart(3, '0')}`)
  const eta = seed.tmlEta ?? laraEta
  const ata = seed.tmlAta ?? ''
  const terminalEtb = seed.tmlEtb ?? etb
  const atb = seed.tmlAtb ?? ''
  const terminalEtd = seed.tmlEtd ?? etd
  const atd = seed.tmlAtd ?? ''
  const cyOpen = seed.cyOpen ?? daysFromNow(etbOff - 3, 0)
  const cyClosing = seed.cyCutoff ?? daysFromNow(etbOff - 1, 12)
  const noTerminalStatuses = new Set(['No terminal record'])
  const hasTerminal =
    !seed.rowNotFound &&
    !noTerminalStatuses.has(seed.matchingStatus) &&
    apiCovered &&
    Boolean(eta || terminalEtb || terminalEtd || ext)
  const schedule: TerminalSchedule | null = hasTerminal
    ? {
        status: terminalStatus(apiTime(atd), apiTime(atb)),
        vesselNameEn: seed.vesselName,
        vesselNameCn: seed.vesselNameCn ?? null,
        shipCode: seed.shipCode ?? null,
        shipName: null,
        agentCode: seed.agentCode || null,
        agentName: null,
        lineCode: null,
        terminal: seed.terminalCode ?? terminalCodeFor(seed.pointCode, seed.id),
        portsEn: seed.portsOfCall || null,
        portsCn: null,
        eta: apiTime(eta),
        ata: apiTime(ata),
        etb: apiTime(terminalEtb),
        atb: apiTime(atb),
        etd: apiTime(terminalEtd),
        atd: apiTime(atd),
        cyOpen: apiTime(cyOpen),
        cyClosing: apiTime(cyClosing),
        portCloseDate: apiTime(seed.portCloseDate ?? daysFromNow(etbOff - 1, 10)),
        customsCloseDate: apiTime(seed.customsCloseDate ?? daysFromNow(etbOff - 1, 11)),
        updateTime: apiTime(daysFromNow(-1, 14)),
        ivoyage: importVoyage,
        evoyage: ext,
      }
    : null
  if (schedule) {
    const voyageOverride = seed.manualOverrides?.evoyage ?? seed.manualOverrides?.externalVoyage
    if (voyageOverride?.manual) schedule.evoyage = voyageOverride.manual
    const etdOverride = seed.manualOverrides?.etd ?? seed.manualOverrides?.tmlEtd
    if (etdOverride?.manual) schedule.etd = etdOverride.manual
  }
  const candidates: TerminalSchedule[] = []
  if (schedule && seed.extraCandidates?.length) {
    candidates.push(schedule, ...seed.extraCandidates.map((candidate) => ({
      ...schedule,
      evoyage: candidate.evoyage,
      ivoyage: candidate.ivoyage ?? schedule.ivoyage,
      terminal: candidate.terminal ?? schedule.terminal,
    })))
  }
  const selected = seed.unbound ? null : schedule
  if (seed.unbound && schedule && !candidates.length) candidates.push(schedule)
  const base: VesselRecord = {
    id: seed.id,
    year: 2026,
    department: seed.department ?? 'Ops support',
    vesselName: seed.vesselName,
    vesselType: seed.vesselType ?? 'MV',
    vesselTypeLabel: '',
    vesselOperator: seed.vesselOperator ?? 'CMA',
    brand: brandFromVoyage(seed.laraVoyage ?? '0BDP9W1MA') || seed.brand,
    acPartner: seed.acPartner ?? '',
    service: seed.service ?? 'FAL1',
    oaFlag: seed.oaFlag ?? 'OA',
    groupKind: seed.groupKind ?? 'Group Vessel',
    region: port?.region ?? seed.region,
    pointCode: seed.pointCode,
    visitNo: seed.visitNo ?? '1',
    terminalName: seed.terminalName ?? 'SCT',
    terminal9code: '',
    laraPoolLocation: seed.laraPoolLocation ?? `${seed.pointCode}DSCT`,
    multipleCallNumber: seed.multipleCallNumber ?? '0',
    laraVoyage: seed.laraVoyage ?? '0BDP9W1MA',
    mainVoyage: seed.mainVoyage ?? seed.laraVoyage ?? '0BDP9W1MA',
    externalVoyage: selected?.evoyage ?? '',
    localVoyage: selected?.evoyage ?? seed.localVoyage ?? '',
    externalImportVoyage: selected?.ivoyage ?? '',
    externalExportVoyage: selected?.evoyage ?? '',
    laraEta,
    laraEtb: etb,
    laraEtd: etd,
    cutoff: seed.cutoff ?? '',
    tmlEta: selected?.eta ?? '',
    tmlAta: selected?.ata ?? '',
    tmlEtb: selected?.etb ?? '',
    tmlAtb: selected?.atb ?? '',
    tmlEtd: selected?.etd ?? '',
    tmlAtd: selected?.atd ?? '',
    cyOpen: selected?.cyOpen ?? '',
    cyCutoff: selected?.cyClosing ?? '',
    portCloseDate: selected?.portCloseDate ?? '',
    customsCloseDate: selected?.customsCloseDate ?? '',
    terminalScheduleStatus: selected?.status ?? '',
    terminalSchedule: selected,
    shipCode: seed.shipCode ?? seed.vesselOperator ?? 'CMA',
    agentCode: seed.agentCode ?? '',
    portsOfCall: seed.portsOfCall ?? '',
    matchingStatus: seed.matchingStatus,
    lastSyncStatus: '',
    sharedLaraCount: 0,
    terminalSource: selected ? 'freightower' : null,
    voyageStatus: seed.voyageStatus ?? 'Active',
    workflowStatus: seed.workflowStatus,
    pic: seed.pic ?? 'Crystal Cai',
    owner: seed.owner,
    takeBy: seed.takeBy,
    takeTime: seed.takeTime,
    apiCovered,
    inPostSailingScope: seed.inPostSailingScope ?? true,
    inCargoOpsScope: seed.inCargoOpsScope ?? true,
    omit: seed.omit ?? false,
    volumes: seed.volumes ?? { ...emptyVolumes(), lc: 120, dc: 80 },
    tasks: seed.tasks ?? postSailingTask(seed.workflowStatus),
    activityLog: seed.activityLog ?? [log('Record created')],
    fieldHistory: [],
    history: [],
    scheduleLogs: [],
    manualOverrides: seed.manualOverrides ?? {},
    terminalCandidates: candidates,
    matchHistory: seed.matchHistory ?? [],
    ltkReceipt: seed.ltkReceipt,
    remark: seed.remark ?? '',
    completedDate: seed.completedDate,
    laraSyncTime: seed.laraSyncTime ?? fmtShort(laraSyncAt),
    lastRefreshTime: seed.lastRefreshTime ?? fmtShort(terminalSyncAt),
    notFoundFields: seed.notFoundFields,
    rowNotFound: seed.rowNotFound,
  }
  const traced = seed.history
    ? { history: seed.history, fieldHistory: seed.fieldHistory ?? [] }
    : seedActivity(base, seed, { firstLaraAt, laraSyncAt, firstTerminalAt, terminalSyncAt, manualMatchAt })
  const fieldHistory = traced.fieldHistory
  const seededHistory = traced.history
  const latestLara = seededHistory.filter((item) => item.type === 'LARA sync').map((item) => item.at).sort().at(-1)
  const latestTerminal = seededHistory.filter((item) => item.type === 'Terminal sync').map((item) => item.at).sort().at(-1)
  const record: VesselRecord = {
    ...base,
    ...seed,
    volumes: seed.volumes ?? base.volumes,
    externalVoyage: base.externalVoyage,
    localVoyage: base.localVoyage,
    externalImportVoyage: base.externalImportVoyage,
    externalExportVoyage: base.externalExportVoyage,
    tmlEta: base.tmlEta,
    tmlAta: base.tmlAta,
    tmlEtb: base.tmlEtb,
    tmlAtb: base.tmlAtb,
    tmlEtd: base.tmlEtd,
    tmlAtd: base.tmlAtd,
    cyOpen: base.cyOpen,
    cyCutoff: base.cyCutoff,
    portCloseDate: base.portCloseDate,
    customsCloseDate: base.customsCloseDate,
    terminalScheduleStatus: base.terminalScheduleStatus,
    terminalSchedule: base.terminalSchedule,
    terminalCandidates: base.terminalCandidates,
    matchHistory: seed.matchHistory ?? base.matchHistory,
    fieldHistory,
    history: seededHistory,
    laraSyncTime: seed.laraSyncTime ?? (latestLara ? fmtShort(latestLara) : ''),
    lastRefreshTime: seed.lastRefreshTime ?? (latestTerminal ? fmtShort(latestTerminal) : ''),
    scheduleLogs: [],
    sharedLaraCount: 0,
    terminalSource: seed.terminalSource ?? base.terminalSource,
    apiCovered,
    region: port?.region ?? seed.region,
    vesselTypeLabel: '',
    terminal9code: '',
  }
  applyStoredVesselType(record)
  applyStoredTerminal9code(record, coveragePorts)
  return record
}

export function createInitialVessels(): VesselRecord[] {
  const vessels = [
    build({
      id: 'v1',
      vesselName: 'CMA CGM FORT FLEUR',
      vesselNameCn: '达飞福乐',
      pointCode: 'CNSHK',
      region: 'SC',
      matchingStatus: 'Auto matched',
      remark: '【首次同步 · Auto matched】一条码头记录，进出口航次齐全，ETA 相差不超过 3 天。直接绑定。',
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      takeBy: CURRENT_USER,
      takeTime: daysFromNow(-1, 9),
      externalVoyage: '015E',
      externalImportVoyage: 'E015',
      terminalCode: 'SCT',
      laraEtb: daysFromNow(1, 8),
      laraEtd: daysFromNow(2, 18),
      tasks: postSailingTask('In Progress', 1),
    }),
    build({
      id: 'v5',
      vesselName: 'OOCL TOKYO',
      pointCode: 'CNSHA',
      region: 'CC',
      matchingStatus: 'Multiple terminal records',
      remark: '【首次同步 · Multiple terminal records】返回多条码头记录，未绑定。需从中选一条。',
      workflowStatus: 'In Progress',
      terminalCode: 'YS01',
      externalVoyage: '022W-A',
      externalImportVoyage: 'E022',
      unbound: true,
      extraCandidates: [{ evoyage: '022W-B', ivoyage: 'E023', terminal: 'YAN3' }],
      laraVoyage: '0BDP9W1MA',
      owner: 'Crystal Cai',
      tasks: cargoOpsTasks(true),
    }),
    build({
      id: 'v3',
      vesselName: 'COSCO SHIPPING ARGENTINA',
      pointCode: 'CNSHK',
      region: 'SC',
      matchingStatus: 'ETA gap > 3 days',
      remark: '【首次同步 · ETA gap > 3 days】一条码头记录，进出口航次齐全，ETA 相差超过 3 天（一边为空也一样）。已写入，待确认。',
      workflowStatus: 'Pending',
      externalVoyage: '011W',
      externalImportVoyage: 'E011',
      laraEtb: daysFromNow(0, 8),
      laraEta: daysFromNow(0, 7),
      tmlEta: daysFromNow(6, 7),
      laraEtd: daysFromNow(1, 18),
      tmlEtd: daysFromNow(1, 16),
    }),
    build({
      id: 'v10',
      vesselName: 'CMA CGM KERGUELEN',
      pointCode: 'CNXMN',
      region: 'SC',
      matchingStatus: 'No external voyage',
      remark: '【首次同步 · No external voyage】一条码头记录，进口或出口航次为空。已写入，待确认。',
      workflowStatus: 'In Progress',
      blankVoyages: true,
      owner: CURRENT_USER,
      tasks: cargoOpsTasks(true),
    }),
    build({
      id: 'v4',
      vesselName: 'CMA CGM LOUISIANA',
      pointCode: 'CNNGB',
      region: 'CC',
      matchingStatus: 'No terminal record',
      remark: '【首次同步 · No terminal record】没有码头记录，码头列为空。',
      workflowStatus: 'New',
      rowNotFound: true,
      tmlEta: '',
      tmlEtb: '',
      tmlEtd: '',
      tmlAtd: '',
      externalVoyage: '',
      localVoyage: '',
    }),
    build({
      id: 'v6',
      vesselName: 'EVER GOLDEN',
      pointCode: 'CNYTN',
      region: 'SC',
      matchingStatus: 'Pending match',
      remark: '【Pending match · 已改字段不同】此前已是 Manual matched，出口航次曾修改。这次仍是一条，但与已保存值不同，不覆盖。整条选择 Keep previous 或 Use this sync。',
      manualRemediation: 'reviewMatch',
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      manualOverrides: {
        evoyage: {
          source: '018W',
          manual: '019W',
          reason: 'Terminal confirmed',
          by: CURRENT_USER,
          at: daysFromNow(-1, 18),
        },
      },
      externalVoyage: '019W',
      externalImportVoyage: 'E019',
      tasks: postSailingTask('In Progress', 2),
    }),
    build({
      id: 'v48',
      vesselName: 'CMA CGM PALAIS ROYAL',
      pointCode: 'CNNGB',
      region: 'CC',
      laraVoyage: '0SYNC48MA',
      matchingStatus: 'Pending match',
      remark: '【Pending match · ETA gap > 3 days】此前已是 Manual matched。这次仍是一条，ETA 相差超过 3 天，不覆盖已保存记录。选择 Keep previous 或 Use this sync。',
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      externalVoyage: '048E',
      externalImportVoyage: 'E048',
      laraEtb: daysFromNow(4, 8),
      laraEta: daysFromNow(3, 8),
      tmlEta: daysFromNow(3, 10),
      laraEtd: daysFromNow(5, 18),
      tmlEtd: daysFromNow(5, 16),
    }),
    build({
      id: 'v50',
      vesselName: 'EVER GIVEN',
      pointCode: 'CNSHA',
      region: 'CC',
      laraVoyage: '0SYNC50MA',
      matchingStatus: 'Pending match',
      remark: '【Pending match · No external voyage】此前已是 Manual matched。这次仍是一条，进口或出口航次为空，不覆盖已保存记录。选择 Keep previous 或 Use this sync。',
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      externalVoyage: '050E',
      externalImportVoyage: 'E050',
      laraEtb: daysFromNow(8, 8),
      laraEtd: daysFromNow(9, 18),
    }),
    build({
      id: 'v51',
      vesselName: 'CMA CGM CONCORDE',
      pointCode: 'CNDCB',
      region: 'SC',
      laraVoyage: '0SYNC51MA',
      matchingStatus: 'Pending match',
      remark: '【Pending match · 多条且航次对不上】此前已是 Manual matched。这次多条，没有一条进出口航次同时对上，不覆盖。Keep previous，或选中一条后 Use this sync。',
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      externalVoyage: '051E',
      externalImportVoyage: 'E051',
      laraEtb: daysFromNow(5, 8),
      laraEtd: daysFromNow(6, 18),
    }),
    build({
      id: 'v47',
      vesselName: 'CMA CGM JACQUES SAADE',
      pointCode: 'CNSHA',
      region: 'CC',
      laraVoyage: '0SYNC47MA',
      matchingStatus: 'Pending match',
      remark: '【Pending match · 多条且航次对上】此前已是 Manual matched。这次多条，有一条航次对上但其他字段不同，不覆盖。比较时默认这条，也可以改选。Keep previous 保留已保存记录，Use this sync 写入所选记录。字段完全相同则仍是 Manual matched。',
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      externalVoyage: '047E',
      externalImportVoyage: 'E047',
      laraEtb: daysFromNow(2, 8),
      laraEtd: daysFromNow(3, 18),
    }),
    build({
      id: 'v7',
      vesselName: 'MSC IRINA',
      pointCode: 'CNNSA',
      region: 'SC',
      matchingStatus: 'Auto matched',
      remark: '【LARA 同步 · ETB】ETB 有新值，直接写入。搜索行高亮，可查看新旧值。ETD 同样处理。',
      workflowStatus: 'Pending',
      tmlAtd: daysFromNow(-1, 14),
      laraEtb: daysFromNow(-2, 8),
      laraEtd: daysFromNow(-1, 18),
      tasks: postSailingTask('Pending', 0),
    }),
    build({
      id: 'v37',
      vesselName: 'COSCO SHIPPING UNIVERSE',
      pointCode: 'CNSHA',
      region: 'CC',
      laraVoyage: '0SYNC37MA',
      matchingStatus: 'Auto matched',
      remark: '【LARA 同步 · ETA】ETA 已写入最新值。该字段不进入审核，搜索行不高亮。',
      workflowStatus: 'New',
      laraEta: daysFromNow(1, 7),
      laraEtb: daysFromNow(2, 8),
      laraEtd: daysFromNow(3, 18),
    }),
  ]
  refreshSharedTerminal(vessels)
  assignVisitNumbers(vessels)
  return vessels
}

function scheduleIdentity(vessel: VesselRecord, visit: string) {
  return [vessel.laraVoyage, vessel.pointCode, vessel.laraPoolLocation, visit]
    .map((part) => part.trim().toUpperCase())
    .join('\0')
}

/** Formal rows keep a unique voyage, point code, pool location, and visit no. */
function assignVisitNumbers(vessels: VesselRecord[]) {
  const taken = new Set<string>()
  for (const vessel of vessels) {
    let n = Number(vessel.visitNo || '1')
    if (!Number.isFinite(n) || n < 1) n = 1
    let visit = String(n)
    let key = scheduleIdentity(vessel, visit)
    while (taken.has(key)) {
      n += 1
      visit = String(n)
      key = scheduleIdentity(vessel, visit)
    }
    vessel.visitNo = visit
    taken.add(key)
  }
}
