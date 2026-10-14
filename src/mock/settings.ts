import type { QuickLink, RfiTemplate, ScopeRule, TaskTemplate, UserAccount } from '@/types/vsp'

export const USERS: UserAccount[] = [
  {
    id: 'u1',
    username: 'Wendy Zhang',
    email: 'wendy.zhang@cma-cgm.com',
    department: 'Ops support',
    region: 'SC',
    role: 'post_sailing',
    status: 'Active',
  },
  {
    id: 'u2',
    username: 'Crystal Cai',
    email: 'crystal.cai@cma-cgm.com',
    department: 'Ops support',
    region: 'CC',
    role: 'cargo_ops',
    status: 'Active',
  },
  {
    id: 'u3',
    username: 'Anni Zhu',
    email: 'anni.zhu@cma-cgm.com',
    department: 'Transshipment',
    region: 'SC',
    role: 'transshipment',
    status: 'Active',
  },
  {
    id: 'u4',
    username: 'Lukia Luo',
    email: 'lukia.luo@cma-cgm.com',
    department: 'Logistics',
    region: 'ALL',
    role: 'logistics',
    status: 'Active',
  },
  {
    id: 'u5',
    username: 'Katrina Qiao',
    email: 'katrina.qiao@cma-cgm.com',
    department: 'Ops support',
    region: 'ALL',
    role: 'admin',
    status: 'Active',
  },
]

export const RFI_TEMPLATES: RfiTemplate[] = [
  {
    id: 'rfi1',
    name: 'Default port RFI',
    port: 'CNSHK',
    to: 'terminal.ops@example.com',
    cc: 'post.sailing@cma-cgm.com',
    subjectFormat: '[{{service}}] {{vessel}} / {{laraVoyage}} / {{tmlVoyage}} / {{port}} - RFI',
    body: 'Dear Team,\n\nPlease advise the latest schedule for the captioned vessel.\n\nThanks.',
    active: true,
  },
  {
    id: 'rfi2',
    name: 'Partner RFI',
    partner: 'COS',
    to: 'partner.desk@example.com',
    cc: 'cargo.ops@cma-cgm.com',
    subjectFormat: '[{{service}}] {{vessel}} / {{laraVoyage}} / {{port}} - Partner RFI',
    body: 'Dear Partner,\n\nKindly confirm berth window and cut-off.\n\nRegards.',
    active: true,
  },
]

export const QUICK_LINKS: QuickLink[] = [
  { id: 'ql1', name: 'Shipxy', url: 'https://www.shipxy.com/', order: 1, active: true },
  { id: 'ql2', name: 'LARA', url: 'https://example.com/lara', order: 2, active: true },
  { id: 'ql3', name: 'XFLOW', url: 'https://example.com/xflow', order: 3, active: true },
]

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'tt1',
    module: 'post_sailing',
    name: 'Post sailing checklist',
    order: 1,
    active: true,
    checkpoints: [
      { id: 'c1', name: 'Verify ATD', required: true, order: 1 },
      { id: 'c2', name: 'Enter container volumes', required: true, order: 2 },
      { id: 'c3', name: 'SLC/SDC file ready', required: true, order: 3 },
      { id: 'c4', name: 'LTK receipt check', required: true, order: 4 },
    ],
  },
  {
    id: 'tt2',
    module: 'cargo_ops',
    name: 'Loading ops',
    order: 1,
    active: true,
    checkpoints: [
      { id: 'c5', name: 'CY check', required: true, order: 1 },
      { id: 'c6', name: 'Loading volume confirm', required: true, order: 2 },
      { id: 'c7', name: 'Partner slot check', required: false, order: 3 },
    ],
  },
  {
    id: 'tt3',
    module: 'cargo_ops',
    name: 'Discharge ops',
    order: 2,
    active: true,
    checkpoints: [
      { id: 'c8', name: 'Discharge plan', required: true, order: 1 },
      { id: 'c9', name: 'Overlanded review', required: true, order: 2 },
    ],
  },
]

export const SCOPE_RULES: ScopeRule[] = [
  {
    id: 's1',
    vesselName: 'ONE COMPETENCE',
    operator: 'ONE',
    service: '3FCCHIN',
    includePostSailing: true,
    includeCargoOps: true,
  },
  {
    id: 's2',
    vesselName: 'FEUERLAND',
    operator: 'CMA',
    service: '3FCMA',
    includePostSailing: false,
    includeCargoOps: false,
  },
]
