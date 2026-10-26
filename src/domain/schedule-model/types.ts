export type LaraSyncScope = 'BATCH' | 'SINGLE'

export type ScheduleTrigger = 'SCHEDULE' | 'MANUAL'

export type LaraRunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export type TerminalSyncStatus = 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED'

export type TerminalQueryTrigger = 'SCHEDULE' | 'MANUAL' | 'REMATCH'

export type TerminalQueryStatus = 'PENDING' | 'FOUND' | 'NOT_FOUND' | 'FAILED'

export type VoyageStatus = 'ACTIVE' | 'OMIT'

export type CallOrigin = 'LARA' | 'MANUAL'

export type VersionSource = 'SYNC' | 'USER'

export type MatchMethod = 'AUTO' | 'USER'

export type DecisionSide = 'LARA' | 'TERMINAL'

export type DecisionAction = 'KEEP' | 'EDIT'

export type LaraSyncRun = {
  id: string
  scope: LaraSyncScope
  trigger: ScheduleTrigger
  status: LaraRunStatus
  etaFrom: string | null
  etaTo: string | null
  etbFrom: string | null
  etbTo: string | null
  /** Set for a single-call run. Batch runs leave this empty. */
  callId: string | null
  requestedAt: string
  respondedAt: string | null
  failureReason: string
  recordCount: number
  triggeredBy: string
}

export type TerminalSyncRun = {
  id: string
  trigger: ScheduleTrigger
  status: TerminalSyncStatus
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

export type TerminalQuery = {
  id: string
  syncRunId: string | null
  callId: string
  laraVersionId: string
  trigger: TerminalQueryTrigger
  requestedAt: string
  requestedBy: string
  externalVoyage: string
  status: TerminalQueryStatus
  respondedAt: string | null
  failureReason: string
}

export type LaraSnapshot = {
  laraVoyage: string
  pointCode: string
  laraPoolLocation: string
  multipleCallNumber: string
  vesselName: string
  vesselOperator: string
  brand: string
  service: string
  vesselType: string
  acPartner: string
  laraEta: string
  laraEtb: string
  laraEtd: string
  cutoff: string
  voyageStatus: VoyageStatus
}

export type TerminalSnapshot = {
  vesselOperator: string
  exportVoyage: string
  importVoyage: string
  vesselNameCn: string
  terminalName: string
  eta: string
  ata: string
  etb: string
  atb: string
  etd: string
  atd: string
  cyOpen: string
  cyCutoff: string
  vesselStatus: string
  updateTime: string
}

export type LaraPayload = LaraSnapshot & {
  id: string
  runId: string
  callId: string
  capturedAt: string
}

export type TerminalPayload = TerminalSnapshot & {
  id: string
  queryId: string
  callId: string
}

export type LaraVersion = LaraSnapshot & {
  id: string
  callId: string
  seq: number
  source: VersionSource
  payloadId: string | null
  reason: string
  updatedBy: string
  updatedAt: string
}

export type TerminalVersion = TerminalSnapshot & {
  id: string
  callId: string
  seq: number
  source: VersionSource
  payloadId: string | null
  reason: string
  updatedBy: string
  updatedAt: string
}

/** One LARA call. The primary key is `id`. Visit no stays on the call and is not written by LARA sync. */
export type VesselCall = {
  id: string
  createdFrom: CallOrigin
  laraVoyage: string
  pointCode: string
  laraPoolLocation: string
  visitNo: string
  platformOmit: boolean
  laraVersionId: string | null
  matchId: string | null
}

export type Match = {
  id: string
  callId: string
  seq: number
  laraVersionId: string
  terminalVersionId: string | null
  method: MatchMethod
  reason: string
  updatedBy: string
  updatedAt: string
}

export type FieldDecision = {
  id: string
  callId: string
  side: DecisionSide
  payloadId: string
  field: string
  action: DecisionAction
  versionId: string | null
  updatedBy: string
  updatedAt: string
}

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
  calls: VesselCall[]
  laraVersions: LaraVersion[]
  terminalVersions: TerminalVersion[]
  matches: Match[]
  fieldDecisions: FieldDecision[]
  laraPayloads: LaraPayload[]
  terminalPayloads: TerminalPayload[]
  laraRuns: LaraSyncRun[]
  terminalSyncRuns: TerminalSyncRun[]
  terminalQueries: TerminalQuery[]
  laraLinks: LaraLink[]
}

export type LaraPayloadInput = Omit<LaraPayload, 'id' | 'runId' | 'callId' | 'capturedAt'> & {
  /** Existing call to update. A record without this creates a new call. */
  callId?: string
}

export type TerminalPayloadInput = Omit<TerminalPayload, 'id' | 'queryId' | 'callId'>
