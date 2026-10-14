export type Role =
  | 'post_sailing'
  | 'cargo_ops'
  | 'transshipment'
  | 'logistics'
  | 'admin'

export type Region = 'NC' | 'CC' | 'SC' | 'HK'

export type MatchingStatus =
  | 'Auto matched'
  | 'Manual matched'
  | 'Multiple terminal records'
  | 'Terminal time gap'
  | 'No external voyage'
  | 'No terminal record'
  | 'Port not covered'
  | 'Pending match'
  | 'Linked'

/** Where the bound terminal row came from. Manual rows are not Freightower results. */
export type TerminalSource = 'freightower' | 'manual'

export type ManualOverride = {
  source: string
  manual: string
  reason?: string
  by?: string
  at?: string
}

/** One confirm or change of a multiple-match selection. */
export type MatchChange = {
  id: string
  at: string
  by: string
  reason: string
  fromSelection: string
  toSelection: string
}

/** BRD create / edit manners for unified vessel history. */
export type HistoryType =
  | 'LARA sync'
  | 'Terminal sync'
  | 'Auto match'
  | 'Manual match'
  | 'Manual create'
  | 'Manual terminal'
  | 'Manual edit'

export type HistoryTrigger = 'Auto' | 'Manual'

/** Field-level change under one History entry. */
export type HistoryDetail = {
  field: string
  from: string
  to: string
}

export type UpdateSource = 'System Sync' | 'Manual Update'
export type RefreshSource = 'LARA' | 'Terminal'
export type RefreshTrigger = 'Schedule' | 'Manual'

/** One LARA batch run, or one terminal API call. Not owned by a field change. */
export type ScheduleRefresh = {
  id: string
  source: RefreshSource
  trigger: RefreshTrigger
  refreshTime: string
  updatedBy: string
  result: 'Success' | 'Failed'
  failureSource: '' | RefreshSource
  /** Set for a terminal call. Empty for a LARA batch. */
  internalVoyage: string
  port: string
  poolLocation: string
  vesselId: string
}

/** One changed field or match on a LARA call. System rows point at a ScheduleRefresh. */
export type ScheduleActivityLog = {
  id: string
  vesselId: string
  internalVoyage: string
  port: string
  poolLocation: string
  updateSource: UpdateSource
  refreshId: string
  updatedTime: string
  updatedBy: string
  field: string
  originalValue: string
  updatedValue: string
  originalMatchResult: string
  updatedMatchResult: string
  reason: string
}

/** One operation (sync / match / create / edit). Seed input for schedule logs. */
export type HistoryEntry = {
  id: string
  at: string
  type: HistoryType
  /** Present for Sync types only. */
  trigger?: HistoryTrigger
  by: string
  reason?: string
  summary: string
  details: HistoryDetail[]
}

export type WorkflowStatus = 'New' | 'Pending' | 'In Progress' | 'Completed' | 'Reopened'

export type VoyageStatus = 'Active' | 'Omit'

export type HighlightKind =
  | 'completed'
  | 'pending_after_atd'
  | 'missing_atd'
  | 'omit'
  | 'selected'
  | 'normal'

export type DeadlineAlert = 'Normal' | 'Warning' | 'Urgent' | 'Overdue'

export type Checkpoint = {
  id: string
  name: string
  required: boolean
  completed: boolean
  completedBy?: string
  completedAt?: string
  remark?: string
}

export type TaskItem = {
  id: string
  name: string
  owner?: string
  status: WorkflowStatus
  deadline?: string
  revision: number
  checkpoints: Checkpoint[]
  reopenReason?: string
}

export type ActivityLogEntry = {
  id: string
  at: string
  user: string
  action: string
  detail?: string
}

export type FieldHistoryEntry = {
  field: string
  refreshTime: string
  originalValue: string
  updatedValue: string
}

export type VolumeData = {
  slc: number
  sdc: number
  lc: number
  dc: number
  overshipped: number
  shortshipped: number
  overlanded: number
  shortlanded: number
  loadingVol: number
  dischargeVol: number
}

/** One row from the terminal schedule API `data` array. */
export type TerminalSchedule = {
  status: string | null
  vesselNameEn: string | null
  vesselNameCn: string | null
  shipCode: string | null
  shipName: string | null
  agentCode: string | null
  agentName: string | null
  lineCode: string | null
  terminal: string | null
  portsEn: string | null
  portsCn: string | null
  eta: string | null
  ata: string | null
  etb: string | null
  atb: string | null
  etd: string | null
  atd: string | null
  cyOpen: string | null
  cyClosing: string | null
  portCloseDate: string | null
  customsCloseDate: string | null
  updateTime: string | null
  ivoyage: string | null
  evoyage: string | null
}

export type VesselRecord = {
  id: string
  year: number
  /** BIZ template: Department */
  department: string
  vesselName: string
  vesselType: 'MV' | 'Feeder' | '3PF'
  vesselOperator: string
  /** LARA brand shown in search (CMA / ANL / APL / CNC). Derived when empty. */
  brand?: string
  /** Service / line name */
  service: string
  oaFlag: 'OA' | 'non-OA'
  groupKind: 'Group Vessel' | 'Partner Vessel' | '3PF'
  /** Region code from the port catalog. Empty when that region was deleted. */
  region: string
  pointCode: string
  terminalName: string
  poolLocation: string
  laraVoyage: string
  /** Primary external voyage used for matching (usually export). */
  externalVoyage: string
  /** Template: Local VOY */
  localVoyage: string
  /** Template: import voyage */
  externalImportVoyage: string
  /** Template: export voyage */
  externalExportVoyage: string
  laraEtb: string
  laraEtd: string
  tmlEta: string
  tmlAta: string
  tmlEtb: string
  tmlAtb: string
  tmlEtd: string
  tmlAtd: string
  cyOpen: string
  cyCutoff: string
  /** Template: port close */
  portCloseDate: string
  /** Template: customs close */
  customsCloseDate: string
  /** Template: terminal schedule status. Display reads TerminalSchedule.status. */
  terminalScheduleStatus: string
  /** Terminal schedule API payload. Null when the berth has no terminal record. */
  terminalSchedule: TerminalSchedule | null
  shipCode: string
  agentCode: string
  /** Template: ports of call */
  portsOfCall: string
  matchingStatus: MatchingStatus
  /** True when another LARA voyage is bound to the same port, terminal, and export voyage. */
  sharedTerminal: boolean
  /** Null when no terminal row is bound. */
  terminalSource: TerminalSource | null
  voyageStatus: VoyageStatus
  workflowStatus: WorkflowStatus
  pic: string
  owner?: string
  takeBy?: string
  takeTime?: string
  apiCovered: boolean
  inPostSailingScope: boolean
  inCargoOpsScope: boolean
  omit: boolean
  volumes: VolumeData
  tasks: TaskItem[]
  activityLog: ActivityLogEntry[]
  fieldHistory: FieldHistoryEntry[]
  /** Seed source converted into scheduleLogs. New writes go to scheduleLogs. */
  history: HistoryEntry[]
  /** Activity logs for this LARA call. Workflow activityLog stays separate. */
  scheduleLogs: ScheduleActivityLog[]
  manualOverrides: Record<string, ManualOverride>
  /** Freightower rows kept for multiple-match selection, including after confirmation. */
  terminalCandidates: TerminalSchedule[]
  /** Confirmation and reselection history for a multiple match. */
  matchHistory: MatchChange[]
  /**
   * Which mismatch dialog last resolved this row.
   * Kept after Manual matched so the same edit flow can reopen.
   */
  manualRemediation?: 'selectMatch' | 'reviewMatch' | 'addTerminal'
  ltkReceipt?: {
    receiptTime?: string
    ltkAtd?: string
    matchStatus: 'Matched' | 'Mismatch' | 'Manual Review Required' | 'No Receipt Found'
  }
  remark: string
  completedDate?: string
  /** When LARA schedule data was last synced into this platform. */
  laraSyncTime: string
  /** When this platform last synced terminal (Freightower) data for the row. */
  lastRefreshTime: string
  notFoundFields?: string[]
  rowNotFound?: boolean
  /** Created via Manual Add Vessel (not from LARA sync). */
  createdManually?: boolean
  /** Manual vessel is the source of a LARA link. */
  laraLinked?: boolean
  /** Formal LARA vessel this manual row points at. */
  laraLinkTargetId?: string
  /** Manual vessel that points at this formal LARA row. */
  laraLinkSourceId?: string
  /** Mapping status restored when the LARA link is removed. */
  laraLinkPreviousStatus?: MatchingStatus
}

/** Fields Feituo /terminal/selectScheduleInfo can return when a port is API-covered. */
export type ApiCoveredField =
  | 'terminal'
  | 'ivoyage'
  | 'evoyage'
  | 'vesselNameEn'
  | 'vesselNameCn'
  | 'shipCode'
  | 'shipName'
  | 'agentCode'
  | 'agentName'
  | 'lineCode'
  | 'portsEn'
  | 'portsCn'
  | 'eta'
  | 'ata'
  | 'etb'
  | 'atb'
  | 'etd'
  | 'atd'
  | 'cyOpen'
  | 'cyClosing'
  | 'portCloseDate'
  | 'customsCloseDate'
  | 'updateTime'
  | 'status'

export type PortDef = {
  code: string
  name: string
  region: Region
  apiCovered: boolean
  feituoAvailable: boolean
  /** Vendor API Coverage Matrix: which terminal fields are available for this port. */
  coveredFields: ApiCoveredField[]
}

export type UserAccount = {
  id: string
  username: string
  email: string
  department: string
  region: Region | 'ALL'
  role: Role
  status: 'Active' | 'Inactive'
}

export type RfiTemplate = {
  id: string
  name: string
  port?: string
  partner?: string
  to: string
  cc: string
  subjectFormat: string
  body: string
  active: boolean
}

export type QuickLink = {
  id: string
  name: string
  url: string
  order: number
  active: boolean
}

export type TaskTemplate = {
  id: string
  module: 'post_sailing' | 'cargo_ops'
  name: string
  order: number
  active: boolean
  checkpoints: { id: string; name: string; required: boolean; order: number }[]
}

export type ScopeRule = {
  id: string
  vesselName: string
  operator: string
  service: string
  includePostSailing: boolean
  includeCargoOps: boolean
}
