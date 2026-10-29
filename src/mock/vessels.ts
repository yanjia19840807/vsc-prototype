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
} from '@/types/vsp'
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
  const ext = seed.blankVoyages
    ? ''
    : (seed.externalVoyage ??
      seed.externalExportVoyage ??
      seed.localVoyage ??
      `${1000000 + (hashId(seed.id) % 900000)}E`)
  const importVoyage = seed.blankVoyages
    ? ''
    : (seed.externalImportVoyage ?? `E${String((hashId(seed.id) % 900) + 100).padStart(3, '0')}`)
  const eta = seed.tmlEta ?? daysFromNow(etbOff - 1, 7)
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
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      takeBy: CURRENT_USER,
      takeTime: daysFromNow(-1, 9),
      externalVoyage: '015E',
      terminalCode: 'SCT',
      laraEtb: daysFromNow(1, 8),
      laraEtd: daysFromNow(2, 18),
      tasks: postSailingTask('In Progress', 1),
    }),
    build({
      id: 'v2',
      vesselName: 'APL MIAMI',
      pointCode: 'CNSHK',
      region: 'SC',
      laraPoolLocation: 'CNSHKDSCT',
      laraVoyage: '0FFDLW1MA',
      externalVoyage: '015E',
      terminalCode: 'SCT',
      matchingStatus: 'Auto matched',
      workflowStatus: 'Completed',
      tmlAtd: daysFromNow(-2, 11),
      laraEtb: daysFromNow(-3, 8),
      laraEtd: daysFromNow(-2, 18),
      completedDate: daysFromNow(-1, 16),
      owner: CURRENT_USER,
      tasks: postSailingTask('Completed', 4),
      volumes: { ...emptyVolumes(), slc: 12, sdc: 8, lc: 200, dc: 150 },
    }),
    build({
      id: 'v3',
      vesselName: 'COSCO SHIPPING ARGENTINA',
      pointCode: 'CNSHK',
      region: 'SC',
      matchingStatus: 'ETA gap > 3 days',
      remark: '【首次同步 · ETA gap > 3 days】首次码头同步正好一条，进出口航次都有，LARA ETA 与码头 ETA 相差超过 3 天。系统写入这条码头记录，匹配状态写成 ETA gap > 3 days，字段差异 pending 为 false。需要 Review，因为匹配尚未完成。天数差不阻止保存。保存后绑定保留，匹配状态改为 Manual matched。LARA ETA 或码头 ETA 为空、天数差算不出来时，状态和处理与此相同。',
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
      id: 'v4',
      vesselName: 'CMA CGM LOUISIANA',
      pointCode: 'CNNGB',
      region: 'CC',
      matchingStatus: 'No terminal record',
      remark: '【首次同步 · No terminal record】首次码头同步没有记录。系统清空码头列，匹配状态为 No terminal record。需要 Review。审核可以手工补录码头记录；保存一条码头记录后，匹配状态为 Manual matched。',
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
      id: 'v5',
      vesselName: 'OOCL TOKYO',
      pointCode: 'CNSHA',
      region: 'CC',
      matchingStatus: 'Multiple terminal records',
      remark: '【首次同步 · Multiple terminal records】首次码头同步返回多条。系统清空码头列，匹配状态为 Multiple terminal records，pending 为 false。需要 Review。在候选里选定一条并保存后，匹配状态为 Manual matched。',
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
      id: 'v6',
      vesselName: 'EVER GOLDEN',
      pointCode: 'CNYTN',
      region: 'SC',
      matchingStatus: 'Manual matched',
      remark: '【后续同步 · 已改过的码头字段】上一状态已是 Manual matched，出口航次曾被修改。这次仍是一条，进出口航次都有，ETA 相差不超过 3 天，但出口航次和已保存的值不同。已保存的出口航次不覆盖，匹配状态写成 Pending match。Review 里为这个字段选择 Previous 或 This sync。确认后仍是 Manual matched。',
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
      tasks: postSailingTask('In Progress', 2),
    }),
    build({
      id: 'v7',
      vesselName: 'MSC IRINA',
      pointCode: 'CNNSA',
      region: 'SC',
      matchingStatus: 'Auto matched',
      remark: '【已采用 LARA】ETB 由同步直接写入，没有人工修改。只显示已采用提示，没有新旧值选择。',
      workflowStatus: 'Pending',
      tmlAtd: daysFromNow(-1, 14),
      laraEtb: daysFromNow(-2, 8),
      laraEtd: daysFromNow(-1, 18),
      tasks: postSailingTask('Pending', 0),
    }),
    build({
      id: 'v8',
      vesselName: 'HMM ALGECIRAS',
      pointCode: 'CNTAO',
      region: 'NC',
      matchingStatus: 'Auto matched',
      remark: '【已采用两边】LARA ETB 和码头 ETB 都已自动采用。两边只显示已采用提示，没有选择按钮。',
      workflowStatus: 'New',
      laraEtb: daysFromNow(-4, 8),
      laraEtd: daysFromNow(-3, 18),
      tmlAtd: '',
    }),
    build({
      id: 'v9',
      vesselName: 'XIN FEI ZHOU',
      vesselNameCn: '新飞舟',
      pointCode: 'HKHKG',
      region: 'HK',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      voyageStatus: 'Omit',
      omit: true,
      remark: 'Omit voyage',
    }),
    build({
      id: 'v10',
      vesselName: 'CMA CGM KERGUELEN',
      pointCode: 'CNXMN',
      region: 'SC',
      matchingStatus: 'No external voyage',
      remark: '【首次同步 · No external voyage】首次码头同步正好一条，但进口或出口航次为空。系统写入这条码头记录，匹配状态为 No external voyage，pending 为 false。需要 Review。审核只能改出口航次和进口航次。缺航次不阻止保存，保存后匹配状态为 Manual matched。上一状态不是 Manual matched 的后续同步，处理与此相同。',
      workflowStatus: 'In Progress',
      blankVoyages: true,
      owner: CURRENT_USER,
      tasks: cargoOpsTasks(true),
      ltkReceipt: {
        receiptTime: daysFromNow(-1, 15),
        ltkAtd: daysFromNow(-1, 12),
        matchStatus: 'Mismatch',
      },
    }),
    build({
      id: 'v11',
      vesselName: 'ONE COMPETENCE',
      pointCode: 'CNTXG',
      region: 'NC',
      vesselType: '3PF',
      groupKind: '3PF',
      service: '3FCCHIN',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      oaFlag: 'non-OA',
      inCargoOpsScope: true,
    }),
    build({
      id: 'v12',
      vesselName: 'WAN HAI 513',
      pointCode: 'CNDLC',
      region: 'NC',
      matchingStatus: 'Auto matched',
      workflowStatus: 'Completed',
      tmlAtd: daysFromNow(-5, 10),
      completedDate: daysFromNow(-4, 17),
      laraEtb: daysFromNow(-6, 8),
      laraEtd: daysFromNow(-5, 18),
      tasks: postSailingTask('Completed', 4),
    }),
    build({
      id: 'v13',
      vesselName: 'YM WELLNESS',
      pointCode: 'CNSWA',
      region: 'SC',
      matchingStatus: 'No terminal record',
      workflowStatus: 'New',
    }),
    build({
      id: 'v14',
      vesselName: 'SEASPAN ADONIS',
      pointCode: 'CNLYG',
      region: 'NC',
      vesselType: 'Feeder',
      matchingStatus: 'No terminal record',
      workflowStatus: 'New',
    }),
    build({
      id: 'v15',
      vesselName: 'CMA CGM ZHENG HE',
      pointCode: 'CNSHA',
      region: 'CC',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(3, 9),
      laraEtd: daysFromNow(4, 20),
      tmlEtb: daysFromNow(3, 10),
      tmlEtd: daysFromNow(2, 18),
    }),
    build({
      id: 'v16',
      vesselName: 'MAERSK ESMERALDAS',
      pointCode: 'CNQZJ',
      region: 'SC',
      matchingStatus: 'No terminal record',
      workflowStatus: 'New',
    }),
    build({
      id: 'v17',
      vesselName: 'CMA CGM CONGO',
      pointCode: 'CNNSA',
      region: 'SC',
      matchingStatus: 'Auto matched',
      workflowStatus: 'Reopened',
      owner: CURRENT_USER,
      tasks: [
        {
          id: 'co-load',
          name: 'Loading ops',
          status: 'Reopened',
          revision: 1,
          owner: CURRENT_USER,
          reopenReason: 'Volume correction required',
          deadline: daysFromNow(0, 16),
          checkpoints: cps(['CY check', 'Loading volume confirm', 'Partner slot check'], 0),
        },
      ],
    }),
    build({
      id: 'v18',
      vesselName: 'PIL SINGAPORE',
      pointCode: 'HKHKG',
      region: 'HK',
      matchingStatus: 'ETA gap > 3 days',
      remark: '【后续同步 · ETA gap > 3 days】上一状态不是 Manual matched。这次仍是一条，LARA ETA 与码头 ETA 相差超过 3 天。系统直接改写码头列，匹配状态改为 ETA gap > 3 days，pending 为 false。需要 Review。保存后改为 Manual matched，与首次处理相同。',
      workflowStatus: 'Pending',
      externalVoyage: '088W',
      laraEtb: daysFromNow(0, 8),
      laraEta: daysFromNow(0, 7),
      tmlEta: daysFromNow(7, 7),
      laraEtd: daysFromNow(1, 18),
      tmlEtd: daysFromNow(1, 16),
      ltkReceipt: { matchStatus: 'No Receipt Found' },
    }),
    build({
      id: 'v19',
      vesselName: 'CMA CGM JACQUES SAADE',
      pointCode: 'CNYTN',
      region: 'SC',
      matchingStatus: 'Auto matched',
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      tasks: cargoOpsTasks(true),
      laraEtb: daysFromNow(2, 7),
      laraEtd: daysFromNow(3, 19),
    }),
    build({
      id: 'v20',
      vesselName: 'ANL WARRNAMBOOL',
      pointCode: 'CNNGB',
      region: 'CC',
      matchingStatus: 'Auto matched',
      workflowStatus: 'Completed',
      tmlAtd: daysFromNow(-8, 13),
      completedDate: daysFromNow(-7, 15),
      laraEtb: daysFromNow(-9, 8),
      laraEtd: daysFromNow(-8, 18),
      tasks: postSailingTask('Completed', 4),
    }),
    build({
      id: 'v21',
      vesselName: 'CMA CGM TIGRIS',
      pointCode: 'CNDCB',
      region: 'SC',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(5, 8),
      laraEtd: daysFromNow(6, 18),
    }),
    build({
      id: 'v22',
      vesselName: 'COSCO SHIPPING ARGENTINA',
      pointCode: 'CNSHA',
      region: 'CC',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      laraVoyage: '0BDP9W1NC',
      mainVoyage: '0BDP9W1MA',
      externalVoyage: '011W',
      externalImportVoyage: 'E068',
      terminalCode: 'YS01',
      laraPoolLocation: 'CNSHADYAN',
      laraEtb: daysFromNow(2, 8),
      laraEtd: daysFromNow(3, 18),
    }),
    build({
      id: 'v23',
      vesselName: 'CMA CGM NEVADA',
      pointCode: 'CNTAO',
      region: 'NC',
      matchingStatus: 'Auto matched',
      workflowStatus: 'In Progress',
      owner: 'Anni Zhu',
      tasks: postSailingTask('In Progress', 3),
      ltkReceipt: {
        receiptTime: daysFromNow(0, 8),
        ltkAtd: daysFromNow(-1, 20),
        matchStatus: 'Matched',
      },
    }),
    build({
      id: 'v24',
      vesselName: 'FEUERLAND',
      pointCode: 'CNYPG',
      region: 'SC',
      vesselType: 'Feeder',
      service: '3FCMA',
      matchingStatus: 'No terminal record',
      workflowStatus: 'New',
      inPostSailingScope: false,
      inCargoOpsScope: false,
    }),
    build({
      id: 'v25',
      vesselName: 'COSCO SHIPPING ARGENTINA',
      pointCode: 'CNSHA',
      region: 'CC',
      matchingStatus: 'Auto matched',
      workflowStatus: 'Pending',
      laraVoyage: '0BDP9W1MA',
      externalVoyage: '011W',
      externalImportVoyage: 'E068',
      terminalCode: 'YS01',
      laraPoolLocation: 'CNSHADYAN',
      laraEtb: daysFromNow(2, 8),
      laraEtd: daysFromNow(3, 18),
    }),
    build({
      id: 'v26',
      vesselName: 'HAPAG BREMEN',
      pointCode: 'CNXMN',
      region: 'SC',
      matchingStatus: 'Manual matched',
      remark: '【后续同步 · 多条且航次对上】上一状态已是 Manual matched。这次返回多条，其中一条出口航次和进口航次都与当前绑定相同。这条作为默认比对，不覆盖已保存的码头列。不同的码头字段只展示 Previous 和 This sync，不需要选择用哪一边。匹配状态写成 Pending match。可以用 Select 改选。确认后保留已保存的码头值，状态改回 Manual matched。',
      manualRemediation: 'selectMatch',
      extraCandidates: [{ evoyage: '044W', ivoyage: 'E045', terminal: 'XMN2' }],
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      externalVoyage: '044E',
      manualOverrides: {
        tmlEtd: {
          source: fmtShort(daysFromNow(2, 18)),
          manual: fmtShort(daysFromNow(1, 20)),
          reason: 'Agent update',
        },
      },
      tasks: postSailingTask('In Progress', 1),
    }),
    build({
      id: 'v27',
      vesselName: 'CMA CGM AMBARLI',
      pointCode: 'HKHKG',
      region: 'HK',
      matchingStatus: 'Auto matched',
      remark: '【已采用 LARA】另一条 ETB 已自动采用的记录。只显示已采用提示，没有选择按钮。',
      workflowStatus: 'New',
      laraEtb: daysFromNow(7, 8),
      laraEtd: daysFromNow(8, 18),
    }),
    build({
      id: 'v28',
      vesselName: 'ULSAN EXPRESS',
      pointCode: 'CNSHK',
      region: 'SC',
      matchingStatus: 'Auto matched',
      workflowStatus: 'Completed',
      tmlAtd: daysFromNow(-10, 9),
      completedDate: daysFromNow(-9, 14),
      laraEtb: daysFromNow(-11, 8),
      laraEtd: daysFromNow(-10, 18),
      tasks: postSailingTask('Completed', 4),
    }),
    build({
      id: 'v29',
      vesselName: 'CMA CGM RIVIERA',
      pointCode: 'CNNGB',
      region: 'CC',
      matchingStatus: 'No terminal record',
      remark: '【后续同步 · No terminal record】上一状态不是 Manual matched。这次没有码头记录。系统清空码头列，匹配状态改为 No terminal record，pending 为 false。需要 Review。处理与首次没有记录相同，可以手工补录。',
      workflowStatus: 'In Progress',
      rowNotFound: true,
      owner: CURRENT_USER,
      tasks: cargoOpsTasks(true),
    }),
    build({
      id: 'v32',
      vesselName: 'CMA CGM MARCO POLO',
      pointCode: 'CNSHK',
      region: 'SC',
      laraVoyage: '0SYNC32MA',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(2, 8),
      laraEtd: daysFromNow(3, 18),
      remark: '【自动采用 LARA ETB】Auto matched 直接采用最新 ETB，搜索行高亮，不需要 Review。',
    }),
    build({
      id: 'v33',
      vesselName: 'EVER ACE',
      pointCode: 'CNYTN',
      region: 'SC',
      laraVoyage: '0SYNC33MA',
      matchingStatus: 'Manual matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(3, 8),
      laraEtd: daysFromNow(4, 18),
      remark: '【后续同步 · 已改过的码头字段】上一状态已是 Manual matched，码头 ETB 曾被修改。这次仍是一条，但 ETB 和已保存的值不同。已保存的 ETB 不覆盖，匹配状态写成 Pending match。Review 里为这个字段选择 Previous 或 This sync。确认后仍是 Manual matched。',
    }),
    build({
      id: 'v34',
      vesselName: 'ONE INNOVATION',
      pointCode: 'CNNSA',
      region: 'SC',
      laraVoyage: '0SYNC34MA',
      matchingStatus: 'Manual matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(4, 8),
      laraEta: daysFromNow(3, 7),
      tmlEta: daysFromNow(3, 8),
      laraEtd: daysFromNow(5, 18),
      remark: '【后续同步 · 已改过的码头字段】上一状态已是 Manual matched，码头 ETD 曾被修改。这次 LARA ETD 写入最新值。码头 ETD 和已保存的值不同，不覆盖，匹配状态写成 Pending match。Review 里只为码头 ETD 选择 Previous 或 This sync。确认后仍是 Manual matched。',
    }),
    build({
      id: 'v35',
      vesselName: 'CMA CGM ANTOINE',
      pointCode: 'CNTAO',
      region: 'NC',
      laraVoyage: '0SYNC35MA',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(5, 8),
      laraEtd: daysFromNow(6, 18),
      remark: '【自动采用后保留】Auto matched 已先采用最新 ETB。Keep 只记确认，不再进入 Review。',
    }),
    build({
      id: 'v36',
      vesselName: 'HMM ROTTERDAM',
      pointCode: 'CNNGB',
      region: 'CC',
      laraVoyage: '0SYNC36MA',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(6, 8),
      laraEtd: daysFromNow(7, 18),
      remark: '【已采用新值】LARA ETB 曾人工修改，随后已采用新值。现在只显示已采用提示，不再提供选择。',
    }),
    build({
      id: 'v37',
      vesselName: 'COSCO SHIPPING UNIVERSE',
      pointCode: 'CNSHA',
      region: 'CC',
      laraVoyage: '0SYNC37MA',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      laraEta: daysFromNow(1, 7),
      laraEtb: daysFromNow(2, 8),
      laraEtd: daysFromNow(3, 18),
      remark: '【LARA 已写入】LARA ETA 已写入最新值。LARA 不进入审核，审核页没有选择。',
    }),
    build({
      id: 'v38',
      vesselName: 'MAERSK ESSEX',
      pointCode: 'HKHKG',
      region: 'HK',
      laraVoyage: '0SYNC38MA',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      externalVoyage: '388E',
      laraEtb: daysFromNow(1, 9),
      laraEtd: daysFromNow(2, 18),
      remark: '【已采用码头航次】出口航次已自动采用。只显示已采用提示，没有选择按钮。',
    }),
    build({
      id: 'v39',
      vesselName: 'OOCL SPAIN',
      pointCode: 'CNXMN',
      region: 'SC',
      laraVoyage: '0SYNC39MA',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(8, 8),
      laraEtd: daysFromNow(9, 18),
      remark: '【已采用码头 ETB】码头 ETB 已自动采用，LARA 无变化。只在 Terminal ETB 显示已采用提示。',
    }),
    build({
      id: 'v40',
      vesselName: 'WAN HAI 612',
      pointCode: 'CNDLC',
      region: 'NC',
      laraVoyage: '0SYNC40MA',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(3, 9),
      laraEtd: daysFromNow(4, 18),
      remark: '【自动采用】Auto matched 的 LARA ETB 和码头 ETB 都直接采用最新值，搜索行高亮，不需要 Review。',
    }),
    build({
      id: 'v41',
      vesselName: 'YM TROPHY',
      pointCode: 'CNSHK',
      region: 'SC',
      laraVoyage: '0SYNC41MA',
      matchingStatus: 'Manual matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(9, 8),
      laraEtd: daysFromNow(10, 18),
      remark: '【后续同步 · 没有记录且已保留】上一状态已是 Manual matched。这次没有码头记录，用户已选择保留当前绑定。码头列保留，匹配状态仍是 Manual matched。不需要再进入 Review。',
    }),
    build({
      id: 'v42',
      vesselName: 'SEASPAN BEYOND',
      pointCode: 'CNTAO',
      region: 'NC',
      laraVoyage: '0SYNC42MA',
      matchingStatus: 'Manual matched',
      workflowStatus: 'New',
      externalVoyage: '422E',
      laraEtb: daysFromNow(4, 9),
      laraEta: daysFromNow(3, 7),
      tmlEta: daysFromNow(3, 8),
      laraEtd: daysFromNow(5, 18),
      remark: '【后续同步 · 已改过的码头字段】上一状态已是 Manual matched，码头 ETB 和出口航次都曾被修改。这次这两个字段都和已保存的值不同，都不覆盖，匹配状态写成 Pending match。Review 里分别为它们选择 Previous 或 This sync。确认后仍是 Manual matched。',
    }),
    build({
      id: 'v43',
      vesselName: 'CMA CGM PALAIS ROYAL',
      pointCode: 'CNNSA',
      region: 'SC',
      laraVoyage: '0SYNC43MA',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(10, 8),
      laraEtd: daysFromNow(11, 18),
      remark: '【无差异】自动匹配，当前值与最新同步一致。审核页没有提示，也没有选择按钮。',
    }),
    build({
      id: 'v44',
      vesselName: 'CMA CGM LOIRE',
      pointCode: 'CNNGB',
      region: 'CC',
      laraVoyage: '0SYNC44MA',
      matchingStatus: 'Manual matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(11, 8),
      laraEta: daysFromNow(10, 7),
      tmlEta: daysFromNow(10, 8),
      laraEtd: daysFromNow(12, 18),
      remark: '【已保留码头旧值】码头 ETB 的新同步值已确认保留旧值。审核页不再提示，也没有选择按钮。',
    }),
    build({
      id: 'v45',
      vesselName: 'HMM STOCKHOLM',
      pointCode: 'CNXMN',
      region: 'SC',
      laraVoyage: '0SYNC45MA',
      matchingStatus: 'Auto matched',
      workflowStatus: 'New',
      laraEtb: daysFromNow(12, 8),
      laraEtd: daysFromNow(13, 18),
      remark: '【已采用码头新值】码头 ETB 曾人工修改，随后已采用新值。现在只显示已采用提示，不再提供选择。',
    }),
    build({
      id: 'v46',
      vesselName: 'CMA CGM VASCO DE GAMA',
      pointCode: 'CNDLC',
      region: 'NC',
      laraVoyage: '0SYNC46MA',
      matchingStatus: 'Multiple terminal records',
      remark: '【后续同步 · Multiple terminal records】上一状态不是 Manual matched。这次返回多条。系统清空码头列，匹配状态改为 Multiple terminal records，pending 为 false。需要 Review。选定一条并保存后，匹配状态为 Manual matched。',
      unbound: true,
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      externalVoyage: '046E',
      externalImportVoyage: 'E046',
      extraCandidates: [{ evoyage: '046W', ivoyage: 'E047', terminal: 'DLC2' }],
      laraEtb: daysFromNow(3, 8),
      laraEtd: daysFromNow(4, 18),
    }),
    build({
      id: 'v47',
      vesselName: 'CMA CGM JACQUES SAADE',
      pointCode: 'CNSHA',
      region: 'CC',
      laraVoyage: '0SYNC47MA',
      matchingStatus: 'Manual matched',
      remark: '【后续同步 · 多条且航次对上】上一状态已是 Manual matched。这次返回多条，其中一条出口航次和进口航次都与当前绑定相同，但 ETB、ETD 变了。这条作为默认比对，不覆盖已保存的码头列。不同的字段只展示 Previous 和 This sync，不需要选择用哪一边。匹配状态写成 Pending match。可以用 Select 改选。确认后保留已保存的码头值，状态改回 Manual matched。',
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      externalVoyage: '047E',
      externalImportVoyage: 'E047',
      laraEtb: daysFromNow(2, 8),
      laraEtd: daysFromNow(3, 18),
    }),
    build({
      id: 'v48',
      vesselName: 'CMA CGM PALAIS ROYAL',
      pointCode: 'CNNGB',
      region: 'CC',
      laraVoyage: '0SYNC48MA',
      matchingStatus: 'Manual matched',
      remark: '【后续同步 · ETA gap > 3 days】上一状态已是 Manual matched。这次仍是一条，码头 ETA 晚了 5 天，结果不再是一条已确认的自动匹配。已保存的码头字段不覆盖，匹配状态写成 Pending match。确认后保留已保存的码头值，状态改回 Manual matched。',
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
      id: 'v49',
      vesselName: 'CMA CGM JEAN MERMOZ',
      pointCode: 'CNYTN',
      region: 'SC',
      laraVoyage: '0SYNC49MA',
      matchingStatus: 'Manual matched',
      remark: '【后续同步 · 没有记录待处理】上一状态已是 Manual matched。这次没有码头记录。已保存的码头记录先保留，匹配状态写成 Pending match。确认必须保留这条码头记录，或新建一条。不能确认成没有码头记录。确认后为 Manual matched。',
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      externalVoyage: '049E',
      externalImportVoyage: 'E049',
      laraEtb: daysFromNow(6, 8),
      laraEtd: daysFromNow(7, 18),
    }),
    build({
      id: 'v50',
      vesselName: 'EVER GIVEN',
      pointCode: 'CNSHA',
      region: 'CC',
      laraVoyage: '0SYNC50MA',
      matchingStatus: 'Manual matched',
      remark: '【后续同步 · No external voyage】上一状态已是 Manual matched。这次仍是一条，但进口或出口航次为空，结果不再是一条已确认的自动匹配。已保存的码头字段不覆盖，匹配状态写成 Pending match。确认后保留已保存的码头值，状态改回 Manual matched。缺航次不阻止确认。',
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
      matchingStatus: 'Manual matched',
      remark: '【后续同步 · 多条且航次对不上】上一状态已是 Manual matched。这次返回多条，没有一条的出口航次和进口航次同时与当前绑定相同。没有默认比对，已保存的码头记录仍然显示，匹配状态写成 Pending match。可以用 Select 指定一条来比对，不同字段只展示、不选择。确认后保留已保存的码头值，状态改回 Manual matched。',
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      externalVoyage: '051E',
      externalImportVoyage: 'E051',
      laraEtb: daysFromNow(5, 8),
      laraEtd: daysFromNow(6, 18),
    }),
    build({
      id: 'v52',
      vesselName: 'HMM ALGECIRAS',
      pointCode: 'CNTXG',
      region: 'NC',
      laraVoyage: '0SYNC52MA',
      matchingStatus: 'ETA gap > 3 days',
      remark: '【首次同步 · ETA 算不出来】首次码头同步正好一条，进出口航次都有，码头 ETA 为空，天数差算不出来。系统写入这条码头记录，匹配状态写成 ETA gap > 3 days，字段差异 pending 为 false。需要 Review。天数差不阻止保存。保存后绑定保留，匹配状态改为 Manual matched。LARA ETA 为空时处理相同。',
      workflowStatus: 'Pending',
      externalVoyage: '052E',
      externalImportVoyage: 'E052',
      laraEtb: daysFromNow(1, 8),
      laraEta: daysFromNow(0, 7),
      tmlEta: '',
      laraEtd: daysFromNow(2, 18),
      tmlEtd: daysFromNow(2, 16),
    }),
    build({
      id: 'v53',
      vesselName: 'CMA CGM LOUIS BLERIOT',
      pointCode: 'CNSHK',
      region: 'SC',
      laraVoyage: '0SYNC53MA',
      matchingStatus: 'Manual matched',
      terminalSource: 'manual',
      remark: '【后续同步 · 手工补录后没有记录】码头记录是手工新增的。这次码头同步没有记录。系统忽略这次结果，码头列和匹配状态保持 Manual matched，不进入 Review。',
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      externalVoyage: '053E',
      externalImportVoyage: 'E053',
      laraEtb: daysFromNow(4, 8),
      laraEtd: daysFromNow(5, 18),
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
