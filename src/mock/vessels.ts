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

function daysFromNow(offset: number, hour = 10): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
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

/** Values written the first time this LARA call arrived. Later syncs only list real changes. */
function laraArrival(vessel: VesselRecord, etd: string) {
  return changedDetails([
    ['laraVoyage', '', vessel.laraVoyage],
    ['vesselName', '', vessel.vesselName],
    ['pointCode', '', vessel.pointCode],
    ['laraPoolLocation', '', vessel.poolLocation],
    ['service', '', vessel.service],
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
  if (seed.createdManually) {
    return {
      history: [
        historyEntry(
          `hist-create-${vessel.id}`,
          times.manualMatchAt,
          'Manual create',
          CURRENT_USER,
          changedDetails([
            ['laraVoyage', '', vessel.laraVoyage],
            ['vesselName', '', vessel.vesselName],
            ['pointCode', '', vessel.pointCode],
            ['laraEtb', '', shown(vessel.laraEtb)],
            ['laraEtd', '', shown(vessel.laraEtd)],
            ['remark', '', vessel.remark],
          ]),
          vessel.remark || undefined,
        ),
      ],
      fieldHistory: [],
    }
  }

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
    createdManually?: boolean
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
    vessel.sharedTerminal = !!key && (counts.get(key) ?? 0) > 1
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
  const noTerminalStatuses = new Set(['No terminal record', 'Pending match'])
  const hasTerminal =
    !seed.createdManually &&
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
    vesselOperator: seed.vesselOperator ?? 'CMA',
    service: seed.service ?? 'FAL1',
    oaFlag: seed.oaFlag ?? 'OA',
    groupKind: seed.groupKind ?? 'Group Vessel',
    region: port?.region ?? seed.region,
    pointCode: seed.pointCode,
    terminalName: seed.terminalName ?? 'SCT',
    poolLocation: seed.poolLocation ?? `${seed.pointCode}DSCT`,
    laraVoyage: seed.laraVoyage ?? '0BDP9W1MA',
    externalVoyage: selected?.evoyage ?? '',
    localVoyage: selected?.evoyage ?? seed.localVoyage ?? '',
    externalImportVoyage: selected?.ivoyage ?? '',
    externalExportVoyage: selected?.evoyage ?? '',
    laraEtb: etb,
    laraEtd: etd,
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
    sharedTerminal: false,
    terminalSource: selected ? 'freightower' : null,
    voyageStatus: seed.voyageStatus ?? 'Active',
    workflowStatus: seed.workflowStatus,
    pic: seed.pic ?? 'Crystal Cai',
    owner: seed.owner,
    takeBy: seed.takeBy,
    takeTime: seed.takeTime,
    apiCovered,
    createdManually: seed.createdManually ?? false,
    laraLinked: seed.laraLinked ?? false,
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
  return {
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
    sharedTerminal: false,
    terminalSource: base.terminalSource,
    apiCovered,
    region: port?.region ?? seed.region,
    createdManually: seed.createdManually ?? false,
    laraLinked: seed.laraLinked ?? false,
  }
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
      laraEtb: daysFromNow(1, 8),
      laraEtd: daysFromNow(2, 18),
      tasks: postSailingTask('In Progress', 1),
    }),
    build({
      id: 'v2',
      vesselName: 'APL MIAMI',
      pointCode: 'CNSHK',
      region: 'SC',
      poolLocation: 'CNSHKDSCT',
      laraVoyage: '0FFDLW1MA',
      externalVoyage: '015E',
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
      matchingStatus: 'ETD gap > 5 days',
      workflowStatus: 'Pending',
      externalVoyage: '011W',
      externalImportVoyage: 'E011',
      unbound: true,
      laraEtb: daysFromNow(0, 8),
      laraEtd: daysFromNow(6, 18),
      tmlEtd: daysFromNow(0, 18),
    }),
    build({
      id: 'v4',
      vesselName: 'CMA CGM LOUISIANA',
      pointCode: 'CNNGB',
      region: 'CC',
      matchingStatus: 'No terminal record',
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
      matchingStatus: 'ETD gap > 5 days',
      workflowStatus: 'Pending',
      externalVoyage: '088W',
      unbound: true,
      laraEtb: daysFromNow(0, 8),
      laraEtd: daysFromNow(7, 18),
      tmlEtd: daysFromNow(0, 16),
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
      externalVoyage: '011W',
      externalImportVoyage: 'E068',
      terminalCode: 'YS01',
      poolLocation: 'CNSHADYAN',
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
      poolLocation: 'CNSHADYAN',
      laraEtb: daysFromNow(2, 8),
      laraEtd: daysFromNow(3, 18),
    }),
    build({
      id: 'v26',
      vesselName: 'HAPAG BREMEN',
      pointCode: 'CNXMN',
      region: 'SC',
      matchingStatus: 'Manual matched',
      manualRemediation: 'selectMatch',
      extraCandidates: [{ evoyage: '044W', ivoyage: 'E045' }],
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
      matchingStatus: 'Auto matched',
      workflowStatus: 'In Progress',
      owner: CURRENT_USER,
      tasks: cargoOpsTasks(true),
    }),
    build({
      id: 'v30',
      vesselName: 'CMA CGM THALASSA',
      pointCode: 'CNSHK',
      region: 'SC',
      matchingStatus: 'Pending match',
      workflowStatus: 'New',
      createdManually: true,
      laraVoyage: '9MANUAL1',
      laraEtb: daysFromNow(1, 8),
      laraEtd: daysFromNow(2, 18),
      remark: 'Added at terminal before LARA voyage exists.',
    }),
  ]
  refreshSharedTerminal(vessels)
  return vessels
}
