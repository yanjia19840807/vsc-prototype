import type { PortDef } from '@/types/vsc'

function port(
  code: string,
  name: string,
  region: PortDef['region'],
  apiCovered: boolean,
  feituoAvailable: boolean,
): PortDef {
  return { code, name, region, apiCovered, feituoAvailable }
}

/** Ports and whether the terminal schedule API covers them. */
export const PORTS: PortDef[] = [
  port('CNTAO', 'Qingdao', 'NC', true, true),
  port('CNTXG', 'Tianjin', 'NC', true, true),
  port('CNDLC', 'Dalian', 'NC', true, true),
  port('CNLYG', 'Lianyungang', 'NC', false, true),
  port('CNRZH', 'Rizhao', 'NC', false, false),
  port('CNNGB', 'Ningbo', 'CC', true, true),
  port('CNSHA', 'Shanghai', 'CC', true, true),
  port('CNYTN', 'Yantian', 'SC', true, true),
  port('CNNSA', 'Nansha', 'SC', true, true),
  port('CNSHK', 'Shekou', 'SC', true, true),
  port('CNXMN', 'Xiamen', 'SC', true, true),
  port('CNSWA', 'Shantou', 'SC', false, true),
  port('CNQZJ', 'Qinzhou', 'SC', false, false),
  port('CNYPG', 'Yangpu', 'SC', false, true),
  port('CNFUG', 'Fuzhou', 'SC', false, true),
  port('CNDCB', 'Da Chan Bay', 'SC', true, true),
  port('CNQZH', 'Quanzhou', 'SC', false, false),
  port('HKHKG', 'Hong Kong', 'HK', true, true),
]

export function portByCode(code: string): PortDef | undefined {
  return PORTS.find((p) => p.code === code)
}

export const PORTLINK_PORTS = [
  'CNSHA',
  'CNNGB',
  'CNYTN',
  'CNSHK',
  'CNNSA',
  'CNXMN',
  'HKHKG',
  'CNTAO',
  'CNTXG',
  'CNDLC',
] as const

export const CURRENT_USER = 'Wendy Zhang'
export const DEMO_USERS = ['Wendy Zhang', 'Crystal Cai', 'Katrina Qiao', 'Anni Zhu', 'Lukia Luo']
