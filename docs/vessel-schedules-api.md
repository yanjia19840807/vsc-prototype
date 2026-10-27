# Vessel Schedule API

主模块覆盖船期搜索、明细、审核、单笔同步、码头匹配、活动日志。临时船列表和港口覆盖各自有独立资源。

后端返回业务数据，并执行筛选、排序、分页、匹配、同步和保存。列标题、单元格文案、空值占位、按钮、提示文案、列顺序、冻结列和导出文件由前端处理。

列表方案缓存在前端，包括可见筛选、默认条件、相对日期、列、排序、关注字段和天数阈值。前端把相对日期折成绝对日期后提交。关注字段和天数阈值也由前端用来决定高亮哪些待确认差异。

前缀 `/v1`。当前用户由登录态决定。资源之间只使用 `id`，路径由前端拼接。

## 资源

| 资源 | URI |
|---|---|
| 船期 | `/v1/vessel-schedules` |
| 筛选条件 | `/v1/vessel-schedule-searches` |
| 审核 | `/v1/vessel-schedules/{id}/review` |
| LARA 单笔同步 | `/v1/vessel-schedules/{id}/lara-syncs` |
| 码头单笔查询 | `/v1/vessel-schedules/{id}/terminal-queries` |
| 当前码头记录 | `/v1/vessel-schedules/{id}/terminal` |
| 码头候选 | `/v1/vessel-schedules/{id}/terminal-candidates` |
| 码头匹配 | `/v1/vessel-schedules/{id}/terminal-match` |
| 活动日志 | `/v1/vessel-schedules/{id}/activity-logs` |

`id` 是船期主键。搜索行、明细、审核、活动日志使用同一个 `id`。

## 约定

- JSON 字段用驼峰。时刻用 ISO-8601。筛选日期用 `YYYY-MM-DD`。
- 空业务值用 `null` 或空字符串。前端决定如何显示。
- 错误使用 RFC 7807，`Content-Type: application/problem+json`。
- 分页参数 `page` 从 1 起，`pageSize` 默认 100、最大 500。JSON 含 `page.number`、`page.size`、`page.totalElements`、`page.totalPages`。
- `lara` 与 `terminal` 对象内的属性不带来源前缀。两侧都可以有 `eta`、`etb`、`etd`。
- 筛选、排序和活动日志用 `side` 与 `field` 指向某个属性。`side` 为 `LARA`、`TERMINAL` 或 `PLATFORM`。`field` 使用对象内的属性名。排序写成 `side.field`，例如 `-LARA.etb,TERMINAL.etd`。
- `POST` 返回 `201` 和 `Location`。`PUT`、`PATCH` 返回 `200`。`DELETE` 返回 `204`。

固定准入：已挂到正式航次上的手工临时船不进入搜索结果，仍可通过主键读取明细。

Region、Point code、Terminal 的可选代码来自港口覆盖模块。本接口接收代码，并在创建筛选条件时校验 Point code 落在所选 Region 内。

`diff` 表示刷新、自动匹配或自动关联之后，尚未确认的差异。没有这类差异时为 `null`。已经保存的 `matchingStatus` 不放在这里。已经连上的关系在船期的 `link` 上，不在 `diff` 里。

`fields` 放字段差异，`terminal` 放码头记录差异。同步和自动关联用同一套结构。`cause` 为 `LINK`，或 `source` 为 `Lara`、`Tmp`、`Both` 时，`temporaryId` 是对方临时船 id，否则为 `null`。`fields` 返回全部尚未决定的差异，不受前端关注字段限制。`fields` 有内容，或 `terminal` 非空，二者至少占一项。

没有差异：

```json
null
```

字段条目：

- `cause` 为 `SYNC` 时，`previousValue` 是当前保存值，`incomingValue` 是最新同步值。`side` 为 `LARA` 或 `TERMINAL`。
- `cause` 为 `LINK` 时，`previousValue` 是正式值，`incomingValue` 是临时值。`side` 为 `LARA`。比较 `vesselName`、`service`、`brand`、`eta`、`etb`、`etd`。临时船没填的字段不参与比较。

只有同步带来的字段变化。`terminal` 为 `null`。

```json
{
  "temporaryId": null,
  "fields": [
    {
      "cause": "SYNC",
      "side": "LARA",
      "field": "etb",
      "previousValue": "2026-10-27T00:00:00+08:00",
      "incomingValue": "2026-10-27T04:00:00+08:00"
    }
  ],
  "terminal": null
}
```

只有自动关联带来的字段变化。码头记录一致，所以 `terminal` 为 `null`。

```json
{
  "temporaryId": "sch-tmp",
  "fields": [
    {
      "cause": "LINK",
      "side": "LARA",
      "field": "vesselName",
      "previousValue": "CMA CGM MARCO POLO",
      "incomingValue": "MARCO POLO"
    }
  ],
  "terminal": null
}
```

同步和自动关联的字段变化在同一条 `fields` 里。

```json
{
  "temporaryId": "sch-tmp",
  "fields": [
    {
      "cause": "SYNC",
      "side": "TERMINAL",
      "field": "etd",
      "previousValue": "2026-10-28T16:00:00+08:00",
      "incomingValue": "2026-10-30T16:00:00+08:00"
    },
    {
      "cause": "LINK",
      "side": "LARA",
      "field": "service",
      "previousValue": "FAL",
      "incomingValue": "FAL2"
    }
  ],
  "terminal": null
}
```

码头条目 `kind` 为 `many` 或 `none`。`many` 时 `options` 至少两条，用户从中选一条。`none` 时 `options` 为空，表示查询没有码头记录。`source` 为 `Query`、`Lara`、`Tmp` 或 `Both`。`Query` 是这次码头查询返回的候选。`Lara` 是正式船期上的码头记录，`Tmp` 是临时船上的码头记录。同一条记录两边都有时，`source` 为 `Both`，只出现一次。`row` 与码头记录的字段相同。

只有同步返回的多条候选：

```json
{
  "temporaryId": null,
  "fields": [],
  "terminal": {
    "kind": "many",
    "options": [
      {
        "id": "cand-1",
        "source": "Query",
        "row": {
          "vesselOperator": "CMA",
          "exportVoyage": "E001",
          "importVoyage": "I001",
          "vesselNameCn": "",
          "name": "FOS",
          "eta": null,
          "ata": null,
          "etb": "2026-10-27T02:00:00+08:00",
          "atb": null,
          "etd": "2026-10-28T16:00:00+08:00",
          "atd": null,
          "cyOpen": null,
          "cyCutoff": null,
          "vesselStatus": "计划",
          "updateTime": null
        }
      },
      {
        "id": "cand-2",
        "source": "Query",
        "row": {
          "vesselOperator": "CMA",
          "exportVoyage": "E009",
          "importVoyage": "I009",
          "vesselNameCn": "",
          "name": "FOS",
          "eta": null,
          "ata": null,
          "etb": "2026-10-27T06:00:00+08:00",
          "atb": null,
          "etd": "2026-10-29T16:00:00+08:00",
          "atd": null,
          "cyOpen": null,
          "cyCutoff": null,
          "vesselStatus": "",
          "updateTime": null
        }
      }
    ]
  }
}
```

只有自动关联的码头记录不一致：

```json
{
  "temporaryId": "sch-tmp",
  "fields": [],
  "terminal": {
    "kind": "many",
    "options": [
      {
        "id": "opt-1",
        "source": "Lara",
        "row": {
          "vesselOperator": "CMA",
          "exportVoyage": "E001",
          "importVoyage": "I001",
          "vesselNameCn": "",
          "name": "FOS",
          "eta": null,
          "ata": null,
          "etb": "2026-10-27T02:00:00+08:00",
          "atb": null,
          "etd": "2026-10-28T16:00:00+08:00",
          "atd": null,
          "cyOpen": null,
          "cyCutoff": null,
          "vesselStatus": "计划",
          "updateTime": null
        }
      },
      {
        "id": "opt-2",
        "source": "Tmp",
        "row": {
          "vesselOperator": "CMA",
          "exportVoyage": "E009",
          "importVoyage": "I009",
          "vesselNameCn": "",
          "name": "FOS",
          "eta": null,
          "ata": null,
          "etb": "2026-10-27T06:00:00+08:00",
          "atb": null,
          "etd": "2026-10-29T16:00:00+08:00",
          "atd": null,
          "cyOpen": null,
          "cyCutoff": null,
          "vesselStatus": "",
          "updateTime": null
        }
      }
    ]
  }
}
```

查询没有码头记录：

```json
{
  "temporaryId": null,
  "fields": [],
  "terminal": { "kind": "none", "options": [] }
}
```

字段变化和码头选行同时存在。`options` 里可以同时有查询候选和关联两侧的记录。

```json
{
  "temporaryId": "sch-tmp",
  "fields": [
    {
      "cause": "LINK",
      "side": "LARA",
      "field": "etb",
      "previousValue": "2026-10-27T00:00:00+08:00",
      "incomingValue": "2026-10-27T04:00:00+08:00"
    }
  ],
  "terminal": {
    "kind": "many",
    "options": [
      { "id": "cand-1", "source": "Query", "row": {} },
      { "id": "opt-1", "source": "Lara", "row": {} },
      { "id": "opt-2", "source": "Tmp", "row": {} }
    ]
  }
}
```

上面的 `row` 与码头记录字段相同，此处省略。`fields` 有或空、`terminal` 为 `null`、`many` 或 `none`，可以任意组合。`many` 的 `options` 来源也可以任意组合。三者都空时 `diff` 为 `null`。

## 搜索

```
POST /v1/vessel-schedule-searches
GET  /v1/vessel-schedule-searches/{id}
```

```json
{
  "filters": [
    { "side": "PLATFORM", "field": "region", "values": ["NEU"] },
    { "side": "LARA", "field": "vesselName", "values": ["CMA CGM MARCO POLO"] },
    { "side": "LARA", "field": "service", "value": "FAL" },
    { "side": "LARA", "field": "etb", "from": "2026-10-20", "to": "2026-11-03" }
  ]
}
```

- `values`：多选，或多行精确匹配，忽略大小写。多行字段为 LARA 的 `vesselName`、`voyage`，以及码头的 `vesselNameCn`、`exportVoyage`、`importVoyage`。
- `value`：单行文本，子串匹配，忽略大小写。
- `from`、`to`：日期，包含两端，可只给一端。比较对象是对应字段的时刻。
- 同一字段只出现一次。空条件不提交。隐藏筛选项只要前端把默认值放进 `filters`，就会生效。
- 未知字段或形态不符返回 `400`。Point code 不在所选 Region 内返回 `400`。

`201` 包含 `id`、`filters`、`total`、`expiresAt`。条件保留 24 小时，过期后 `GET` 返回 `404`。

```
GET /v1/vessel-schedules?searchId={id}&sort=-LARA.etb&page=1&pageSize=100
```

`searchId` 必填。改排序或翻页时沿用同一个 `searchId`。用户改了筛选并再次搜索时，才新建一份筛选条件。`sort` 或分页参数非法时返回 `400`。筛选条件不存在或过期时返回 `404`。

```json
{
  "data": [
    {
      "id": "sch-1",
      "temporary": false,
      "platformOmit": false,
      "pointCovered": true,
      "matchingStatus": "Auto matched",
      "candidateCount": 0,
      "sharedLaraCount": 1,
      "lara": {
        "voyage": "0MEG1W",
        "pointCode": "FRFOS",
        "poolLocation": "EUROPE",
        "multipleCallNumber": "0",
        "vesselName": "CMA CGM MARCO POLO",
        "vesselOperator": "CMA",
        "brand": "CMA",
        "service": "FAL",
        "vesselType": "Group vsl",
        "eta": "2026-10-26T08:00:00+08:00",
        "etb": "2026-10-27T00:00:00+08:00",
        "etd": "2026-10-28T18:00:00+08:00"
      },
      "terminal": {
        "vesselOperator": "CMA",
        "exportVoyage": "E001",
        "importVoyage": "I001",
        "vesselNameCn": "",
        "name": "FOS",
        "eta": null,
        "ata": null,
        "etb": "2026-10-27T02:00:00+08:00",
        "atb": null,
        "etd": "2026-10-28T16:00:00+08:00",
        "atd": null,
        "cyOpen": null,
        "cyCutoff": null,
        "vesselStatus": "计划",
        "updateTime": "2026-10-27T01:00:00+08:00"
      },
      "lastModifiedBy": "Ann",
      "lastModifiedAt": "2026-10-27T02:00:00Z",
      "diff": null
    }
  ],
  "page": { "number": 1, "size": 100, "totalElements": 342, "totalPages": 4 }
}
```

已在 LARA 中 Omit 的航次不会进入同步结果，因此 LARA 快照不包含 `voyageStatus`。一条已经同步过的船期若在抓取窗口内从后续批量结果中消失，由船期上的 `platformOmit` 表示。

`temporary` 为真表示这条船期由用户手工创建。正式 LARA 船期为假。关联之后这个值不变。已关联的手工船不在搜索结果里；打开明细时用 `link.linked` 表示已经挂到正式航次。

`terminal` 在没有绑定码头记录时为 `null`。未确认的多条候选或 ETD 差距未确认时，当前码头值为 `null`，条数在 `candidateCount`。港口没有码头接口覆盖时不会写入同步结果，码头值只来自用户补录。`lastModifiedBy` 保留实际操作者，包括 system。

列表每条记录都可以打开。自动关联的字段冲突在 `diff.fields`，码头冲突在 `diff.terminal`。前端用 `matchingStatus`、`temporary`、`candidateCount` 决定行上其余按钮。用 `pointCovered` 和 `terminal` 决定码头列怎么画。用本地列表方案的关注字段和天数阈值过滤 `diff.fields`。

导出由前端根据查询到的数据生成。

## 明细

```
GET /v1/vessel-schedules/{id}
```

未知 `id` 返回 `404`。响应在搜索行的字段之外补充关联：

```json
{
  "id": "sch-1",
  "temporary": false,
  "platformOmit": false,
  "pointCovered": true,
  "matchingStatus": "Auto matched",
  "candidateCount": 0,
  "sharedLaraCount": 2,
  "lara": {},
  "terminal": {},
  "lastModifiedBy": "Ann",
  "lastModifiedAt": "2026-10-27T02:00:00Z",
  "diff": null,
  "link": {
    "linked": false,
    "peerId": null
  },
  "originalSourceId": null
}
```

`diff` 的结构见约定。`link.linked` 为真时，`link.peerId` 是对方船期 id。正式船期保留来源临时船时，`originalSourceId` 为该临时船 id。来源摘要由前端再读取该 id 的明细。

### 手工船

审核页对未关联的手工船提供修改和删除。新建临时船属于临时船模块。

```
PATCH /v1/vessel-schedules/{id}
```

```json
{
  "voyage": "0MEG1W",
  "visitNo": "1",
  "vesselName": "CMA CGM MARCO POLO",
  "pointCode": "FRFOS",
  "brand": "CMA",
  "service": "FAL",
  "poolLocation": "EUROPE",
  "eta": "2026-10-27T08:00:00+08:00",
  "etb": "2026-10-27T10:00:00+08:00",
  "etd": "2026-10-28T18:00:00+08:00",
  "remark": ""
}
```

`voyage`、`visitNo`、`vesselName`、`pointCode` 必填。`brand` 取 `CMA`、`ANL`、`APL`、`CNC` 或空。已关联或非手工船返回 `409`。成功返回明细。

```
DELETE /v1/vessel-schedules/{id}
```

仅未关联的手工船可删，否则 `409`。成功 `204`。

## 审核

```
GET /v1/vessel-schedules/{id}/review
PUT /v1/vessel-schedules/{id}/review
```

`GET` 返回当前值和待确认的最新值。已关联的手工船仍可读取，保存和同步返回 `409`。

```json
{
  "scheduleId": "sch-1",
  "lara": {
    "voyage": "0MEG1W",
    "pointCode": "FRFOS",
    "poolLocation": "EUROPE",
    "multipleCallNumber": "0",
    "vesselName": "CMA CGM MARCO POLO",
    "vesselOperator": "CMA",
    "brand": "CMA",
    "service": "FAL",
    "vesselType": "Group vsl",
    "eta": null,
    "etb": "2026-10-27T00:00:00+08:00",
    "etd": null
  },
  "terminalRows": [
    {
      "id": "row-1",
      "selected": true,
      "source": "CURRENT",
      "vesselOperator": "",
      "exportVoyage": "E001",
      "importVoyage": "I001",
      "vesselNameCn": "",
      "name": "FOS",
      "eta": null,
      "ata": null,
      "etb": null,
      "atb": null,
      "etd": null,
      "atd": null,
      "cyOpen": null,
      "cyCutoff": null,
      "vesselStatus": "",
      "updateTime": null
    }
  ],
  "candidates": [
    {
      "id": "cand-3",
      "exportVoyage": "E009",
      "importVoyage": "I009",
      "vesselNameCn": "",
      "name": "FOS",
      "eta": null,
      "ata": null,
      "etb": null,
      "atb": null,
      "etd": null,
      "atd": null,
      "cyOpen": null,
      "cyCutoff": null,
      "vesselStatus": "",
      "updateTime": null
    }
  ],
  "diff": null
}
```

`vesselType` 由服务端根据航次、品牌和船公司计算。`source` 取 `CURRENT` 或 `CANDIDATE`。`diff` 的结构见约定。

### 保存

`PUT` 提交用户确认后的业务结果。服务端写入字段版本、匹配和活动日志，并重算 `matchingStatus`。正文没有变化时返回 `400`。

```json
{
  "remark": "Confirmed with agent",
  "lara": {
    "vesselName": "CMA CGM MARCO POLO",
    "etb": "2026-10-27T04:00:00+08:00"
  },
  "decisions": [
    { "cause": "SYNC", "side": "LARA", "field": "etb", "action": "EDIT", "value": "2026-10-27T04:00:00+08:00" },
    { "cause": "LINK", "side": "LARA", "field": "vesselName", "action": "Tmp" }
  ],
  "shape": "adopt",
  "optionId": "opt-2",
  "terminalRows": [],
  "selectedTerminalRowId": "row-1"
}
```

- `lara` 是保存后的 LARA 当前值。`vesselType` 由服务端维护，提交值被忽略。
- `decisions` 只列用户对待确认字段作出的选择。`cause` 与 `diff.fields` 一致。`SYNC` 的 `action` 为 `KEEP` 或 `EDIT`，`EDIT` 的 `value` 是用户留下的值。`LINK` 的 `action` 为 `Lara` 或 `Tmp`，分别采用正式值或临时值。未出现的待确认字段保持待确认。
- `shape` 是对 `diff.terminal` 的决定，取 `keep`、`none`、`adopt`。仅当 `diff.terminal` 非空时有效。`adopt` 必须带 `optionId`，且该 id 属于 `diff.terminal.options`。`keep` 保留当前码头绑定。`none` 清空绑定。
- `terminalRows` 是保存后的码头记录。已有行沿用 `id`，新行 `id` 为 `null`。从集合中消失的行视为删除。
- `selectedTerminalRowId` 是绑定的那一行。清空匹配时传 `null`。

保存成功返回 `200` 和更新后的审核。匹配状态由服务端计算：有手工改动则为 `Manual matched`；未选中码头记录时，有行则为 `Multiple terminal records`，无行则为 `No terminal record`；选中行缺少进出口航次则为 `No external voyage`；LARA ETD 与码头 ETD 相差超过 3 天则为 `ETD gap > 3 days`；其余为 `Auto matched`。

## 单笔同步

审核页的 Sync latest 各创建一次调用。客户端先丢弃未保存编辑，再发起调用。

```
POST /v1/vessel-schedules/{id}/lara-syncs
```

```json
{ "trigger": "MANUAL" }
```

`201`，`Location` 指向这次运行。

```json
{
  "id": "lara-run-4",
  "scope": "SINGLE",
  "trigger": "MANUAL",
  "status": "SUCCEEDED",
  "scheduleId": "sch-1",
  "requestedAt": "2026-10-27T02:00:00Z",
  "respondedAt": "2026-10-27T02:00:01Z"
}
```

```
POST /v1/vessel-schedules/{id}/terminal-queries
```

```json
{ "trigger": "MANUAL", "externalVoyage": "" }
```

用户改了外部航次后再查时，`trigger` 为 `REMATCH`，并填写 `externalVoyage`。`201`：

```json
{
  "id": "terminal-query-8",
  "trigger": "MANUAL",
  "status": "FOUND",
  "scheduleId": "sch-1",
  "requestedAt": "2026-10-27T02:00:00Z",
  "respondedAt": "2026-10-27T02:00:01Z",
  "candidateCount": 2
}
```

`status` 为 `FOUND`、`NOT_FOUND` 或 `FAILED`。港口未覆盖码头接口时，码头查询返回 `409`。已关联的手工船不参加同步，返回 `409`。调用完成后，前端重新 `GET` 审核。

## 码头候选、匹配与当前码头记录

列表上的选择匹配、确认匹配、补录码头使用这三组子资源。

```
GET /v1/vessel-schedules/{id}/terminal-candidates
```

返回最新一次 `FOUND` 查询的候选，字段与审核里的 `candidates` 相同。没有候选时 `data` 为空数组。

```
PUT /v1/vessel-schedules/{id}/terminal-match
```

确认或改选一条码头记录。可同时提交对选中行的手工修改。

```json
{
  "candidateId": "cand-3",
  "terminal": {
    "vesselOperator": "",
    "exportVoyage": "E009",
    "importVoyage": "I009",
    "vesselNameCn": "",
    "name": "FOS",
    "eta": null,
    "ata": null,
    "etb": null,
    "atb": null,
    "etd": null,
    "atd": null,
    "cyOpen": null,
    "cyCutoff": null,
    "vesselStatus": "",
    "updateTime": null
  },
  "reason": "Selected the second row"
}
```

`candidateId` 指向候选。只确认当前记录、不改选时可以省略 `candidateId`。成功 `200`，响应为更新后的明细。已关联的手工船返回 `409`。

```
GET /v1/vessel-schedules/{id}/terminal
PUT /v1/vessel-schedules/{id}/terminal
```

`GET` 返回当前绑定的码头记录。尚未绑定时 `bound` 为 `false`，码头字段为 `null`。

`PUT` 写入手工码头记录。已有记录时覆盖，没有记录时建立并绑定。

```json
{
  "reason": "Added from agent mail",
  "vesselOperator": "CMA",
  "exportVoyage": "E001",
  "importVoyage": "",
  "vesselNameCn": "",
  "name": "FOS",
  "eta": null,
  "ata": null,
  "etb": null,
  "atb": null,
  "etd": null,
  "atd": null,
  "cyOpen": null,
  "cyCutoff": null,
  "vesselStatus": "",
  "updateTime": null
}
```

`name` 必填，表示码头名称。`exportVoyage` 与 `importVoyage` 至少填写一个，否则 `400`。成功 `200`，响应为更新后的明细。用户补录的码头字段，后续自动同步不覆盖，直到用户在审核里改回。

## 活动日志

```
GET /v1/vessel-schedules/{id}/activity-logs?side=LARA&field=etb&updatedBy=ann&from=2026-10-01&to=2026-10-27&sort=-triggeredAt&page=1&pageSize=100
GET /v1/vessel-schedules/{id}/activity-logs/{logId}
```

一次保存产生一条日志。同一时刻、同一操作人、同一原因的字段变化合并在这条日志的 `changes` 里。`remark` 只包含用户填写的原因。系统内部原因留在服务端，不返回：恢复来源值、采用最新来源、码头确认、临时船关联确认、临时船创建。

`side` 与 `field` 一起精确匹配。`updatedBy` 为子串，忽略大小写。`from`、`to` 为日期，包含两端。默认排序 `-triggeredAt`。

```json
{
  "data": [
    {
      "id": "log-1",
      "triggeredAt": "2026-10-27T02:10:00Z",
      "triggeredBy": "Ann",
      "remark": "Confirmed with agent",
      "changes": [
        {
          "side": "LARA",
          "field": "etb",
          "original": "2026-10-27T00:00:00+08:00",
          "updated": "2026-10-27T04:00:00+08:00"
        }
      ]
    }
  ],
  "page": { "number": 1, "size": 100, "totalElements": 1, "totalPages": 1 }
}
```

`GET` 单条返回同一结构的对象。未知 `logId` 或船期返回 `404`。字段标题和时间格式由前端处理。

## 页面与调用

搜索页使用前端缓存的列表方案生成筛选和排序，然后：

1. `POST /v1/vessel-schedule-searches`
2. `GET /v1/vessel-schedules?searchId={id}&sort={排序}&page=1`

明细页：`GET /v1/vessel-schedules/{id}`。

审核页：`GET .../review`，保存用 `PUT .../review`，单笔同步用对应的 `POST`。同步之后重新 `GET` 审核。

活动日志页：`GET .../activity-logs`。从某一列进入时，`side` 与 `field` 使用该列对应的数据字段。

列表上的快捷操作：

| 动作 | 调用 |
|---|---|
| 选择匹配 | `GET .../terminal-candidates`，再 `PUT .../terminal-match` |
| 确认匹配 | `GET .../terminal`，再 `PUT .../terminal-match` |
| 补录码头 | `PUT .../terminal` |
| 审核、临时船关联 | `GET` 与 `PUT .../review` |

## 错误

| HTTP | 场景 |
|---|---|
| 400 | 筛选字段未知、日期非法、Point code 不在所选 Region、审核正文无变化、码头名或航次缺失、关联未选码头记录、排序字段未知 |
| 404 | 船期、筛选条件、日志、候选不存在，或筛选条件已过期 |
| 409 | 对已关联的手工船同步、港口无码头覆盖、修改或删除不允许的手工船 |
