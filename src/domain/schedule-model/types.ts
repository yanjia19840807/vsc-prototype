/** One LARA Mirror call. BATCH returns many calls; SINGLE asks for one call. */
export type LaraSyncScope = 'BATCH' | 'SINGLE'

export type ScheduleTrigger = 'SCHEDULE' | 'MANUAL'

export type LaraRunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export type TerminalBatchStatus = 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED'

export type TerminalQueryTrigger = 'SCHEDULE' | 'MANUAL' | 'REMATCH'

export type TerminalQueryStatus = 'PENDING' | 'FOUND' | 'NOT_FOUND' | 'FAILED'

export type LaraVoyageStatus = 'ACTIVE' | 'OMIT'

export type CallOrigin = 'LARA' | 'MANUAL'

export type BindingMode = 'CANDIDATE' | 'MANUAL'

export type BindingSource = 'AUTO' | 'MANUAL'

export type FieldHistoryCause = 'USER' | 'SYNC' | 'BINDING'

export type LaraSyncRun = {
  id: string
  scope: LaraSyncScope
  trigger: ScheduleTrigger
  status: LaraRunStatus
  /** Compared with LaraSyncRecord.eta. Empty on SINGLE. */
  etaFrom: string | null
  etaTo: string | null
  /** Compared with LaraSyncRecord.etb. Empty on SINGLE. */
  etbFrom: string | null
  etbTo: string | null
  /** Call key for SINGLE. Empty on BATCH. */
  internalVoyage: string | null
  poolLocation: string | null
  requestedAt: string
  respondedAt: string | null
  failureReason: string
  recordCount: number
  triggeredBy: string
}

/** One LARA call inside a single Lara Sync Run response. Immutable. */
export type LaraSyncRecord = {
  id: string
  runId: string
  internalVoyage: string
  poolLocation: string
  portCode: string
  vesselName: string
  vesselNameCn: string
  brand: string
  service: string
  vesselType: string
  voyageStatus: LaraVoyageStatus
  eta: string
  etb: string
  etd: string
  /** Equals the parent run respondedAt. */
  capturedAt: string
}

/** One round that issues many terminal calls. Not itself a call. */
export type TerminalBatchRun = {
  id: string
  trigger: ScheduleTrigger
  status: TerminalBatchStatus
  etaLeadDays: number
  atdLagDays: number
  startedAt: string
  finishedAt: string | null
  failureReason: string
  callCount: number
  succeededCount: number
  failedCount: number
  triggeredBy: string
}

/** One terminal call and its own reply. */
export type TerminalQuery = {
  id: string
  /** Empty when this call was not part of a batch round. */
  batchRunId: string | null
  callId: string
  laraRecordId: string
  internalVoyage: string
  poolLocation: string
  portCode: string
  trigger: TerminalQueryTrigger
  requestedAt: string
  requestedBy: string
  vesselName: string
  /** Empty when the call is by vessel, port, and time. */
  externalVoyage: string
  status: TerminalQueryStatus
  respondedAt: string | null
  failureReason: string
}

/** One terminal schedule row from a single Terminal Query response. */
export type TerminalCandidate = {
  id: string
  queryId: string
  importVoyage: string
  exportVoyage: string
  terminalCode: string
  terminalName: string
  vesselStatus: string
  eta: string
  etb: string
  etd: string
  atb: string
  atd: string
  cyOpen: string
  cyCutoff: string
}

export type ManualField = {
  field: string
  manualValue: string
  /** Source value when the user confirmed this field. Empty when there was no source. */
  sourceBaseline: string
  reason: string
  updatedBy: string
  updatedAt: string
}

export type ManualLara = {
  id: string
  callId: string
  fields: ManualField[]
}

export type ManualTerminal = {
  id: string
  callId: string
  fields: ManualField[]
}

/** Append-only display history for one Vessel Call, one field per row. */
export type FieldHistory = {
  id: string
  callId: string
  field: string
  originalValue: string
  updatedValue: string
  cause: FieldHistoryCause
  reason: string
  updatedBy: string
  updatedAt: string
}

export type VesselCall = {
  id: string
  origin: CallOrigin
  /** Identity with poolLocation and portCode. */
  internalVoyage: string
  poolLocation: string
  portCode: string
  laraRecordId: string | null
  platformOmit: boolean
  manualLaraId: string | null
  manualTerminalId: string | null
}

/** Current terminal association for one LARA call. */
export type TerminalBinding = {
  id: string
  callId: string
  mode: BindingMode
  /** Set when mode is CANDIDATE. Points at this call's own query result. */
  candidateId: string | null
  source: BindingSource
  reason: string
  updatedBy: string
  updatedAt: string
}

/** Link from a manual call to one formal LARA call. */
export type LaraLink = {
  id: string
  sourceCallId: string
  targetCallId: string
  reason: string
  updatedBy: string
  updatedAt: string
}

export type ScheduleState = {
  seq: number
  laraRuns: LaraSyncRun[]
  laraRecords: LaraSyncRecord[]
  terminalBatches: TerminalBatchRun[]
  terminalQueries: TerminalQuery[]
  terminalCandidates: TerminalCandidate[]
  calls: VesselCall[]
  manualLaras: ManualLara[]
  manualTerminals: ManualTerminal[]
  bindings: TerminalBinding[]
  laraLinks: LaraLink[]
  fieldHistory: FieldHistory[]
}

export type LaraRecordInput = Omit<LaraSyncRecord, 'id' | 'runId' | 'capturedAt'>

export type TerminalCandidateInput = Omit<TerminalCandidate, 'id' | 'queryId'>
