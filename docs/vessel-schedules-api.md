# 船期平台：表与接口

## 表

### vessel_schedule

主键 `id`。一条船期一行。同步身份是 `voyage_reference` + `point_code` + `visit_no`。`pool_location` 原地更新，不另开一行。列表、明细、审核、活动日志用的是 `id`。

| 列 | 说明 |
|---|---|
| id | 主键。列表、明细、审核、活动日志都用它 |
| voyage_reference | VOYAGE_REFERENCE。页面 voyage。同步身份 |
| point_code | POINT_CODE。页面 pointCode。同步身份 |
| visit_no | VISIT_NO。同步身份。页面和接口不返回 |
| pool_location | POOL_LOCATION。页面 poolLocation |
| service_no | VOYAGES.SERVICE_NO。页面 service |
| operator_code | SHIPCOMP.OPERATOR_CODE。页面 Vessel operator。也用来算 vesselType |
| vessel_full_name | VESSELS.FULL_NAME。页面 vesselName |
| eta | ETA_DATE + ETA_TIME，已加 8 小时。页面 LARA eta |
| etb | ETB_DATE + ETB_TIME。页面 LARA etb。关注字段 |
| etd | ETD_DATE + ETD_TIME，已加 8 小时。页面 LARA etd。关注字段 |
| platform_omit | 后续批量里不再出现时为真，包括 LARA 把 OMIT_FLAG 改成 Y 之后。页面 voyageStatus 据此显示 Omit |
| match_method | 空：还没有匹配。AUTO：系统绑定，尚未审核；未审核的多条或没有记录也留在 AUTO，同时码头列被清空。USER：审核确认过，绑定保留，之后同步保持 Manual matched，不改回 AUTO。ETA 差超过 3 天仍保存为 USER。最近一次码头查询没有记录且不带码头保存时，改为 AUTO，状态为 No terminal record |
| terminal_source | 空：当前没有绑定码头。SYNC：码头列来自报文。USER：码头列是手工补录。审核确认一条同步记录时仍是 SYNC |
| evoyage | 报文 evoyage。页面 exportVoyage。关注字段 |
| ivoyage | 报文 ivoyage。页面 importVoyage。关注字段 |
| vessel_name_cn | 报文 vesselNameCn |
| terminal | 报文 terminal，例如 YS01。页面码头名。9code 按 point_code 和它连接 |
| status | 报文 status，例如离港、在港、计划 |
| terminal_eta | 报文 eta |
| terminal_ata | 报文 ata |
| terminal_etb | 报文 etb。关注字段 |
| terminal_atb | 报文 atb。关注字段 |
| terminal_etd | 报文 etd。关注字段 |
| terminal_atd | 报文 atd。关注字段 |
| cy_open | 报文 cyOpen。页面 cyOpen |
| cy_closing | 报文 cyClosing。页面 cyCutoff |
| update_time | 报文 updateTime |

`matching_status`、备注、最后修改人不在这张表上。匹配状态读取时计算。备注和最后修改来自最新一条活动日志。

### lara_sync_run

主键 `id`。一次 LARA 同步一行。

| 列 | 说明 |
|---|---|
| id | 主键 |
| scope | BATCH：按时间窗拉一批。SINGLE：只同步一条船期，schedule_id 有值 |
| trigger | SCHEDULE：定时。MANUAL：人在页面上发起 |
| status | RUNNING：进行中。SUCCEEDED：成功。FAILED：失败，没有写下原文 |
| eta_from | 批量时间窗。单条同步为空 |
| eta_to | 批量时间窗。单条同步为空 |
| etb_from | 批量时间窗。单条同步为空 |
| etb_to | 批量时间窗。单条同步为空 |
| schedule_id | 单条同步指向的船期。批量为空 |
| requested_at | 发起时间 |
| responded_at | 结束时间 |
| failure_reason | 失败原因。成功时为空 |
| triggered_by | 发起人，可以是 System |

### lara_payload

主键 `id`。一条船期一行，`schedule_id` 唯一。每次 LARA 同步按这条船期更新这一行，保存最近一次原文。当前采用后的值在 `vessel_schedule`。已写入的历史在活动日志。

| 列 | 说明 |
|---|---|
| id | 主键 |
| run_id | 最近一次写入它的 lara_sync_run |
| schedule_id | 船期。唯一 |
| captured_at | 收到时间 |
| voyage_reference | VOYAGE_REFERENCE |
| point_code | POINT_CODE |
| visit_no | VISIT_NO |
| pool_location | POOL_LOCATION |
| service_no | SERVICE_NO |
| operator_code | OPERATOR_CODE |
| vessel_full_name | VESSELS.FULL_NAME |
| eta | ETA_DATE + ETA_TIME |
| etb | ETB_DATE + ETB_TIME |
| etd | ETD_DATE + ETD_TIME |

### terminal_sync_run

主键 `id`。批量码头同步一行。审核页上的单条同步不建这行。

| 列 | 说明 |
|---|---|
| id | 主键 |
| trigger | SCHEDULE：定时批量。MANUAL：人在页面上发起 |
| status | RUNNING：进行中。SUCCEEDED：查询都有结果。PARTIAL：有的查询失败。FAILED：整批没有发出 |
| started_at | 开始时间 |
| finished_at | 全部查询结束的时间 |
| failure_reason | 整批发起失败的原因 |
| triggered_by | 发起人 |

船期是否到了该查码头的时间，由同步配置里的提前天数和滞后天数决定。

### terminal_query

主键 `id`。一条船期的一次码头查询一行。形态决定写在这行上。查询条件是当时的英文船名和港口代码，对应报文里的 `vesselNameEn` 和 `portCode`。

| 列 | 说明 |
|---|---|
| id | 主键 |
| sync_run_id | 所属批量运行。单条同步为空 |
| schedule_id | 船期 |
| trigger | SCHEDULE：批量中的一条。MANUAL：审核页单条同步。REMATCH：重新匹配时发起 |
| requested_at | 发起时间 |
| requested_by | 发起人 |
| vessel_name_en | 这次查询使用的英文船名，取当时的 vessel_full_name |
| port_code | 这次查询使用的港口代码，取当时的 point_code |
| status | PENDING：已发出，还没返回。FOUND：找到候选。NOT_FOUND：没有记录。FAILED：这次查询失败 |
| responded_at | 完成时间 |
| failure_reason | 失败原因 |
| terminal_resolution | 空：多条或没有记录还没处理；已审核的多条保持空，选择按钮还在。keep：保留当前码头。clear：解开绑定，码头列已清空 |
| pinned_payload_id | 用来比对的 terminal_payload。候选被新一次成功查询替换后，按出口航次和进口航次对到新的候选；对不上则为空 |

### terminal_payload

主键 `id`。一条船期只保留最近一次成功查询的候选，选择框返回的就是这个 `id`。新查询结果为 FOUND 或 NOT_FOUND 时，删掉该船期更早的候选，再写入这一次的。NOT_FOUND 写零行。FAILED 时保留上一次的候选。

| 列 | 说明 |
|---|---|
| id | 主键 |
| query_id | 所属 terminal_query。船期从这条查询取得 |
| evoyage | 报文 evoyage。和 ivoyage 一起做默认比对 |
| ivoyage | 报文 ivoyage |
| vessel_name_en | 报文 vesselNameEn |
| vessel_name_cn | 报文 vesselNameCn |
| ship_code | 报文 shipCode |
| ship_name | 报文 shipName |
| agent_code | 报文 agentCode |
| agent_name | 报文 agentName |
| line_code | 报文 lineCode |
| terminal | 报文 terminal |
| ports_en | 报文 portsEn |
| ports_cn | 报文 portsCn |
| status | 报文 status |
| eta | 报文 eta |
| ata | 报文 ata |
| etb | 报文 etb |
| atb | 报文 atb |
| etd | 报文 etd |
| atd | 报文 atd |
| cy_open | 报文 cyOpen |
| cy_closing | 报文 cyClosing |
| port_close_date | 报文 portCloseDate |
| customs_close_date | 报文 customsCloseDate |
| update_time | 报文 updateTime |

报文里没有 vessel operator。页面上的 Vessel operator 用船期的 `operator_code`。

### field_decision

主键 `schedule_id`、`side`、`field`。记录用户对这个字段的决定。比较对象是船期当前值和最新原文，原文行被更新后决定仍然有效。

| 列 | 说明 |
|---|---|
| schedule_id | 船期。主键之一 |
| side | LARA：针对 LARA 字段。TERMINAL：针对码头字段。PLATFORM：针对匹配状态。主键之一 |
| field | 字段名。匹配状态用 matchingStatus。主键之一 |
| action | KEEP：保留当前值，不采用这次入站。EDIT：采用这次入站值 |
| updated_by | 操作人 |
| updated_at | 操作时间 |

### activity_log

主键 `id`。一次已经落库的操作一行。

| 列 | 说明 |
|---|---|
| id | 主键 |
| schedule_id | 船期 |
| triggered_at | 发生时间 |
| triggered_by | 操作人 |
| remark | 用户写下的备注。系统写入时为空 |
| match | 空：没有改变码头绑定。confirm：这次建立起绑定。switch：从已绑定的一条改到另一条。cancel：取消绑定 |

### activity_log_change

主键 `log_id`、`side`、`field`。只记这次真正写下去的原值和新值。`field` 用页面字段名。待确认差异不写在这里，读取船期时现算。

| 列 | 说明 |
|---|---|
| log_id | 所属 activity_log。主键之一 |
| side | LARA：变化在 LARA 列。TERMINAL：变化在码头列。PLATFORM：变化在匹配状态。主键之一 |
| field | 字段名。主键之一 |
| original | 写入前的值 |
| updated | 写入后的值 |

### region

主键 `code`。页面上的 Region。

| 列 | 说明 |
|---|---|
| code | 主键。例如 NC、CC、SC |
| name | 区域名称。页面可显示成 code (name) |
| active | true：新建港口可以选。false：停用。已经挂在港口上的代码仍显示，新建不能再选 |

### port

主键 `port_code`。页面对应 Point code。船期用 `point_code` 连接到这里取得区域。

| 列 | 说明 |
|---|---|
| port_code | 主键。LARA 的 POINT_CODE，也是码头查询的 portCode |
| port_name | 港口名称 |
| region_code | 所属 region.code。区域停用后这列仍保留原代码 |
| active | true：筛选里可以选。false：停用。历史船期仍显示这个代码，新建筛选不能再选。停用后也不发码头查询 |
| api_covered | true：这个港口对接码头接口，审核页可以发码头同步。false：不发。页面 pointCovered 用它。港口还须 active 才真正发起查询 |

### terminal

主键 `nine_code`。页面 Terminal 9code。由船期的 `point_code` 和报文 `terminal` 连接到这里。

| 列 | 说明 |
|---|---|
| nine_code | 主键。CMA 的 Terminal 9code，例如 CNSHADT17 |
| port_code | 所属港口 |
| name_zh | 码头中文名 |

### terminal_code

主键 `port_code`、`code`。报文里的码头代码和简称都通过这张表对到 `nine_code`。YS01 与 YAN1 可以指向同一条码头。

| 列 | 说明 |
|---|---|
| port_code | 港口。主键之一 |
| code | 报文 terminal，或矩阵里的简称。主键之一。例如 YS01、YAN1、WGQ2 |
| nine_code | 对到 terminal.nine_code |

### terminal_voyage

主键 `id`。一个港口当前码头船期中的一行。该港口同步成功后，用这次返回的行替换该 `port_code` 下的全部行。region 从 `port` 连接。

| 列 | 说明 |
|---|---|
| id | 主键。码头航次明细用它读取 |
| port_code | 这次同步询问的港口。只出现在筛选里，不是列表列 |
| status | 报文 status。原文，例如计划、在港、离港。不是匹配状态 |
| vessel_name_en | 报文 vesselNameEn。页面 Vessel name |
| vessel_name_cn | 报文 vesselNameCn。页面 Vessel name CN |
| ship_code | 报文 shipCode |
| ship_name | 报文 shipName |
| agent_code | 报文 agentCode |
| agent_name | 报文 agentName |
| line_code | 报文 lineCode |
| terminal | 报文 terminal。9code 用 port_code 和它去 terminal_code 连接 |
| ports_en | 报文 portsEn。页面 Ports |
| ports_cn | 报文 portsCn。页面 Ports Cn |
| eta | 报文 eta |
| ata | 报文 ata |
| etb | 报文 etb |
| atb | 报文 atb |
| etd | 报文 etd |
| atd | 报文 atd |
| cy_open | 报文 cyOpen。页面 CY open |
| cy_closing | 报文 cyClosing。页面 CY closing |
| port_close_date | 报文 portCloseDate。页面 Port close |
| customs_close_date | 报文 customsCloseDate。页面 Customs close |
| update_time | 报文 updateTime。页面 Update time |
| ivoyage | 报文 ivoyage。页面 Import voyage |
| evoyage | 报文 evoyage。页面 Export voyage |

### list_setting

主键 `id`。一个用户的一份列表方案一行。`owner` 是登录名。

| 列 | 说明 |
|---|---|
| id | 主键 |
| owner | 登录名。只能读写自己的方案 |
| name | 方案名称。同一 owner 下不重复 |
| position | 在该用户方案列表中的顺序，从 0 起 |
| active | true：当前生效的方案。每个 owner 恰好有一行是 true。false：已保存但未生效 |
| freeze_side | 左冻结截止列的 side。不冻结时为空 |
| freeze_field | 左冻结截止列的 field，含这一列。不冻结时为空。必须是这份方案里的一列 |

### list_setting_filter

主键 `setting_id`、`side`、`field`。一个筛选项一行，含是否显示和默认值。相对日期存在这里，提交船期搜索前再折成绝对日期。

| 列 | 说明 |
|---|---|
| setting_id | 所属 list_setting。主键之一 |
| side | LARA、TERMINAL 或 PLATFORM。主键之一 |
| field | 页面字段名。主键之一。region 只有筛选项，不是列表列 |
| position | 筛选项顺序，从 0 起 |
| visible | true：搜索页显示这个筛选项。false：不显示，默认值仍会在搜索时提交 |
| date_mode | 空：不是日期。fixed：用 date_from、date_to。relative：用 from_days、to_days |
| text_value | 子串默认值。多选和多行不用 |
| date_from | fixed 的开始日期，可空 |
| date_to | fixed 的结束日期，可空 |
| from_days | relative 时，从今天往前的天数。空表示这一端不限制 |
| to_days | relative 时，从今天往后的天数。空表示这一端不限制 |

### list_setting_filter_value

主键 `setting_id`、`side`、`field`、`position`。多选和多行的一个默认值一行。

| 列 | 说明 |
|---|---|
| setting_id | 所属方案。主键之一 |
| side | 与筛选项相同。主键之一 |
| field | 与筛选项相同。主键之一 |
| position | 值的顺序，从 0 起。主键之一 |
| value | 默认值。多行忽略大小写匹配，代码类区分大小写 |

### list_setting_column

主键 `setting_id`、`side`、`field`。列表一列一行。

| 列 | 说明 |
|---|---|
| setting_id | 所属方案。主键之一 |
| side | LARA、TERMINAL 或 PLATFORM。主键之一 |
| field | 页面字段名。主键之一。LARA.voyage 不能隐藏 |
| position | 列顺序，从 0 起 |
| hidden | true：列表不显示。false：显示。LARA.voyage 必须是 false |

### list_setting_sort

主键 `setting_id`、`position`。方案自带的默认排序。用户在搜索页临时改的排序不写回这里，随那一次搜索的 `sort` 参数走。

| 列 | 说明 |
|---|---|
| setting_id | 所属方案。主键之一 |
| position | 排序优先级，从 0 起。主键之一 |
| side | LARA、TERMINAL 或 PLATFORM |
| field | 页面字段名 |
| descending | true：降序。false：升序 |

### list_setting_watch

主键 `setting_id`、`side`、`field`。用户勾选的高亮字段，以及日期的天数阈值。同步时保持原值的字段是服务端固定的一组，见下方接口说明。已审核且这次码头同步仍是多条时，日期是否进入 `changes` 使用当前生效方案的 `day_threshold`。

| 列 | 说明 |
|---|---|
| setting_id | 所属方案。主键之一 |
| side | LARA、TERMINAL 或 PLATFORM。主键之一 |
| field | 页面字段名。主键之一。PLATFORM.matchingStatus 必须保留，不能删 |
| day_threshold | 日期列的天数阈值。空或 0：只要不同就高亮，多条比对时也进入 changes。非日期列为空 |

### 不建表

同步条数、成功数、失败数、候选数在读取时计算。查询参数不落库。

## 接口

时刻用 ISO-8601，筛选日期用 `YYYY-MM-DD`。空业务值用 `null`。错误使用 `application/problem+json`。创建返回 `201`，读取和替换返回 `200`。响应里是资源 `id`。`page` 从 1 起，`pageSize` 默认 100、最大 500。

`lara_sync_run`、`lara_payload`、`terminal_sync_run`、`terminal_query`、`terminal_payload`、`field_decision` 供同步和审核使用，不单独提供查询。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /v1/vessel-schedules | 按本次查询参数查询船期 |
| GET | /v1/vessel-schedules/export | 按本次查询参数导出全部命中船期 |
| GET | /v1/vessel-schedules/{scheduleId} | 船期明细 |
| GET | /v1/vessel-schedules/{scheduleId}/review | 读取审核 |
| PUT | /v1/vessel-schedules/{scheduleId}/review | 保存审核 |
| GET | /v1/vessel-schedules/{scheduleId}/terminal-candidates | 码头候选 |
| POST | /v1/vessel-schedules/{scheduleId}/terminal-resolution | 决定码头形态 |
| POST | /v1/vessel-schedules/{scheduleId}/lara-sync | 单笔同步 LARA |
| POST | /v1/vessel-schedules/{scheduleId}/terminal-sync | 单笔同步码头 |
| GET | /v1/vessel-schedules/{scheduleId}/activity-logs | 活动日志 |
| GET | /v1/list-settings | 当前用户的列表方案 |
| POST | /v1/list-settings | 新建一份方案 |
| GET | /v1/list-settings/{settingId} | 读取一份方案 |
| PUT | /v1/list-settings/{settingId} | 保存一份方案 |
| PATCH | /v1/list-settings/{settingId} | 改名 |
| POST | /v1/list-settings/{settingId}/activate | 设为当前生效 |
| POST | /v1/list-settings/{settingId}/duplicate | 复制一份 |
| DELETE | /v1/list-settings/{settingId} | 删除一份方案 |
| GET | /v1/terminal-voyages | 按本次查询参数查询码头航次 |
| GET | /v1/terminal-voyages/{voyageId} | 一条码头航次 |
| GET | /v1/regions | 查询区域 |
| PUT | /v1/regions/{code} | 保存区域 |
| PATCH | /v1/regions/{code} | 停用或启用区域 |
| DELETE | /v1/regions/{code} | 删除区域 |
| GET | /v1/ports | 查询港口 |
| PUT | /v1/ports/{portCode} | 保存港口 |
| PATCH | /v1/ports/{portCode} | 停用或启用港口 |
| DELETE | /v1/ports/{portCode} | 删除港口 |

### 公共字段

`side` 为 `LARA`、`TERMINAL` 或 `PLATFORM`。`field` 用下面对象里的属性名。排序写成 `side.field`，减号表示降序，例如 `-LARA.etb,TERMINAL.etd`。

#### lara

页面 LARA 区。`vesselOperator` 来自 LARA 的 `OPERATOR_CODE`。`brand`、`vesselType`、`terminal`（Terminal 9code）由服务端算出，提交了也忽略。

| 字段 | 含义 | 示例 |
|---|---|---|
| voyage | 航次，库列 voyage_reference | 0MEG1W |
| pointCode | 港口，库列 point_code | FRFOS |
| poolLocation | 库列 pool_location | EUROPE |
| vesselName | 英文船名，库列 vessel_full_name | CMA CGM MARCO POLO |
| vesselOperator | 船公司代码，库列 operator_code。页面 Vessel operator 用它，码头报文里没有这一项 | CMA |
| brand | 由航次末两位算出。MA/NC/PL/NL 对应 CMA/CNC/APL/ANL | CMA |
| service | 航线，库列 service_no | FAL |
| eta | LARA ETA。日期和时间已合成一个时刻 | 2026-10-26T08:00:00+08:00 |
| etb | LARA ETB。关注字段 | 2026-10-27T00:00:00+08:00 |
| etd | LARA ETD。关注字段 | 2026-10-28T18:00:00+08:00 |
| vesselType | 由航次数字、brand、vesselOperator 算出。3 为 3PF，9 再分 Group vsl 与 Partner vsl | Group vsl |
| terminal | Terminal 9code。按 pointCode 和码头代码从港口覆盖连接。格子不展示时为 null | FRFOSFOS |

```json
{
  "voyage": "0MEG1W",
  "pointCode": "FRFOS",
  "poolLocation": "EUROPE",
  "vesselName": "CMA CGM MARCO POLO",
  "vesselOperator": "CMA",
  "brand": "CMA",
  "service": "FAL",
  "eta": "2026-10-26T08:00:00+08:00",
  "etb": "2026-10-27T00:00:00+08:00",
  "etd": "2026-10-28T18:00:00+08:00",
  "vesselType": "Group vsl",
  "terminal": "FRFOSFOS"
}
```

#### terminal

当前绑定的码头记录。列表和明细在下面三种情况返回 `null`：没有绑定；`matchingStatus` 为 `Multiple terminal records` 或 `ETA gap > 3 days`；港口没有码头接口覆盖，并且不是手工补录。审核在已绑定时始终返回这条记录。

| 字段 | 含义 | 示例 |
|---|---|---|
| enteredManually | true 表示手工补录，对应 terminal_source = USER。确认一条同步记录时仍是 false | false |
| exportVoyage | 出口航次，库列 evoyage。关注字段 | E001 |
| importVoyage | 进口航次，库列 ivoyage。关注字段 | I001 |
| vesselNameCn | 中文船名 |  |
| name | 报文 terminal，例如 YS01。9code 不写在这个字段里 | YS01 |
| eta | 码头 ETA，库列 terminal_eta | null |
| ata | 码头 ATA，库列 terminal_ata | null |
| etb | 码头 ETB，库列 terminal_etb。关注字段 | 2026-10-27T02:00:00+08:00 |
| atb | 码头 ATB，库列 terminal_atb。关注字段 | null |
| etd | 码头 ETD，库列 terminal_etd。关注字段 | 2026-10-28T16:00:00+08:00 |
| atd | 码头 ATD，库列 terminal_atd。关注字段 | null |
| cyOpen | 库列 cy_open | null |
| cyCutoff | 库列 cy_closing | null |
| vesselStatus | 报文 status，例如计划、在港、离港。不是匹配状态 | 计划 |
| updateTime | 报文 updateTime | 2026-10-27T01:00:00+08:00 |

```json
{
  "enteredManually": false,
  "exportVoyage": "E001",
  "importVoyage": "I001",
  "vesselNameCn": "",
  "name": "YS01",
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
}
```

#### 船期行上的其他字段

| 字段 | 含义 | 示例 |
|---|---|---|
| id | 船期 id，库列 vessel_schedule.id。visit_no 不返回 | sch-1 |
| voyageStatus | Active 或 Omit。platform_omit 为真时是 Omit，含后续批量里消失、以及 LARA 把 OMIT_FLAG 改成 Y | Active |
| pointCovered | 这个 Point code 是否对接码头接口，即 port.api_covered | true |
| matchingStatus | 服务端计算，请求里不带。取值见下表 | Auto matched |
| candidateCount | 当前待选码头记录条数，没有则为 0 | 2 |
| sharedLaraCount | 共用同一港口、码头和出口航次的船期条数，只有一条时为 1 | 1 |
| terminalPending | 只在 Manual matched 且最近一次码头同步不再是一条时有值。many 仍有多条候选。none 没有记录。其余为 null | many |
| lastModifiedBy | 最新活动日志的操作人，可以是 System。审核读取不返回 | Ann |
| lastModifiedAt | 最新活动日志的时间 | 2026-10-27T02:00:00Z |
| remark | 已保存的用户备注。明细和审核返回。没有时为空字符串 | Confirmed with agent |
| changes | 当前值与最新值的差异。没有差异时为 null，不返回空数组 | 见下 |
| sources | 手工改过的字段在改之前的来源值。只在明细返回。没有时为 null | 见下 |

`matchingStatus` 的取值：

| 值 | 含义 |
|---|---|
| Auto matched | 未审核。正好一条码头记录，进出口航次都有，LARA ETA 与码头 ETA 相差不超过 3 天 |
| Manual matched | 审核确认过，绑定还在。ETA 差超过 3 天时，首次保存和再次保存都改成这个状态。之后的同步不改回 Auto matched |
| Multiple terminal records | 未审核，码头同步返回多条。码头列已清空 |
| No terminal record | 未审核，码头同步没有记录。码头列已清空 |
| No external voyage | 绑着的记录缺少进口或出口航次 |
| ETA gap > 3 days | 尚未审核。绑着一条码头记录，LARA ETA 与码头 ETA 的天数差算不出来，或超过 3 天。审核保存后改为 Manual matched |

同步写入：

| 当前状态 | 这次结果 | 船期行 | changes |
|---|---|---|---|
| 不是 Manual matched | 一条且可自动匹配 | 写入最新码头列，match_method = AUTO | pending 为 false |
| 不是 Manual matched | 一条，但缺航次或 ETA 差超过 3 天 | 写入这条码头记录，状态改为对应值 | pending 为 false |
| 不是 Manual matched | 多条或没有记录 | 清空码头列，match_method 留在 AUTO | pending 为 false |
| Manual matched | 关注字段有差异 | 关注字段保持原值 | 这些字段 pending 为 true，当前值是 previousValue |
| Manual matched | 非关注字段有差异 | 写入最新值 | pending 为 false |
| Manual matched | 下一次一条，且会算出缺航次或 ETA 差超过 3 天 | 确认前状态仍是 Manual matched。保存后状态为 Manual matched，与首次处理相同 | 增加 matchingStatus，确认前 pending 为 true。保存后这项不再待确认 |
| Manual matched | 下一次仍会是 Auto matched | 状态仍是 Manual matched | 不写 matchingStatus 这一项 |
| Manual matched | 下一次仍是多条 | terminalPending 为 many，不整行覆盖 | matchingStatus 从 Manual matched 到 Multiple terminal records，pending 为 true |

同步时压住不覆盖的字段是服务端固定的一组：LARA 的 `etb`、`etd`，码头的 `etb`、`etd`、`atb`、`atd`、`exportVoyage`、`importVoyage`。一般比较里值不相同才算变化。已审核且下一次仍是多条时，这些日期再使用当前用户生效列表方案里的 `dayThreshold`：相差天数不超过阈值的不放进 `changes`。出口航次、进口航次没有天数阈值。用户在方案里另外勾选的字段只用于页面高亮。

已审核且仍是多条时，出口航次和进口航次都有值，并且只有一条候选两个都相同，这一条只是默认比对对象。`terminalPending` 仍为 `many`，选择按钮保留。改选后按新的一条重新比关注字段。

#### changes

一项一个字段。列表、明细、审核只比较当前值和最新值。

| 字段 | 含义 | 示例 |
|---|---|---|
| side | LARA、TERMINAL 或 PLATFORM | LARA |
| field | 该侧对象里的属性名。匹配状态用 matchingStatus | etb |
| previousValue | 写入前的值。pending 为 true 时，页面显示这个值 | 2026-10-27T00:00:00+08:00 |
| incomingValue | 这次入站的值。pending 为 false 时，页面显示这个值 | 2026-10-27T04:00:00+08:00 |
| pending | true：还要人确认。false：已经写入，只作提示，不因此打开审核 | true |

```json
[
  {
    "side": "LARA",
    "field": "etb",
    "previousValue": "2026-10-27T00:00:00+08:00",
    "incomingValue": "2026-10-27T04:00:00+08:00",
    "pending": true
  },
  {
    "side": "PLATFORM",
    "field": "matchingStatus",
    "previousValue": "Auto matched",
    "incomingValue": "ETA gap > 3 days",
    "pending": false
  }
]
```

#### sources

只在明细返回。一项一个字段。

| 字段 | 含义 | 示例 |
|---|---|---|
| side | LARA 或 TERMINAL | TERMINAL |
| field | 属性名 | etd |
| value | 手工修改之前的来源值 | 2026-10-28T16:00:00+08:00 |

#### 分页 page

| 字段 | 含义 | 示例 |
|---|---|---|
| number | 当前页，从 1 起 | 1 |
| size | 本页条数 | 100 |
| totalElements | 命中总条数 | 342 |
| totalPages | 总页数 | 4 |

#### 错误

| HTTP | 何时 |
|---|---|
| 400 | 字段未知、日期非法、Point code 不在所选 Region、排序或分页非法、审核无变化、取值不在允许范围、候选 id 不属于这次结果、列表方案重名、隐藏了 LARA.voyage、去掉了 PLATFORM.matchingStatus |
| 404 | 船期不存在，或列表方案不属于当前用户 |
| 409 | 没有待决定的码头形态、港口未覆盖仍要求同步码头、审核确认时没有选中一条码头记录、删除仍被引用的港口或区域、码头代码冲突、删除当前生效的或仅剩的列表方案 |

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Point code is outside the selected region."
}
```

### 查询船期

| 项 | 内容 |
|---|---|
| 方法 | GET |
| 路径 | /v1/vessel-schedules |
| 说明 | 读取船期列表。筛选、排序和分页都是查询参数。隐藏筛选项的默认值也由前端放进参数。不带筛选参数时不附加筛选。返回当前页。有 pending 为 true 的字段，或 terminalPending 非空，或 matchingStatus 为 Multiple terminal records、ETA gap > 3 days、No external voyage、No terminal record 时，前端可以进入审核 |

| 参数 | 必填 | 含义 |
|---|---|---|
| sort | 否 | 默认 `-LARA.etb` |
| page | 否 | 默认 1 |
| pageSize | 否 | 默认 100，最大 500 |

筛选参数用 `side.field`。多选和多行重复同一个参数。子串只出现一次。日期用 `side.fieldFrom` 和 `side.fieldTo`，包含这一天，可只给一端。

| 参数 | 形态 | 含义 |
|---|---|---|
| PLATFORM.region | 可重复 | 区域代码，精确匹配，区分大小写 |
| PLATFORM.matchingStatus | 可重复 | 上面六个匹配状态 |
| PLATFORM.lastModifiedBy | 单个 | 操作人子串，忽略大小写 |
| LARA.vesselName | 可重复 | 英文船名，精确匹配，忽略大小写 |
| LARA.voyage | 可重复 | 航次，精确匹配，忽略大小写 |
| LARA.pointCode | 可重复 | 港口代码。必须落在所选 Region 内 |
| LARA.poolLocation | 单个 | 子串，忽略大小写 |
| LARA.service | 单个 | 子串，忽略大小写 |
| LARA.vesselOperator | 单个 | 子串，忽略大小写 |
| LARA.brand | 可重复 | 精确匹配 |
| LARA.vesselType | 可重复 | 精确匹配 |
| LARA.terminal | 可重复 | Terminal 9code |
| LARA.etaFrom、LARA.etaTo、LARA.etbFrom、LARA.etbTo、LARA.etdFrom、LARA.etdTo | 单个 | 比较该时刻 |
| TERMINAL.vesselNameCn | 可重复 | 精确匹配，忽略大小写 |
| TERMINAL.exportVoyage | 可重复 | 精确匹配，忽略大小写 |
| TERMINAL.importVoyage | 可重复 | 精确匹配，忽略大小写 |
| TERMINAL.name | 可重复 | 报文 terminal |
| TERMINAL.vesselStatus | 可重复 | 计划、在港、离港 |
| TERMINAL 的 eta、ata、etb、atb、etd、atd、cyOpen、cyCutoff、updateTime，各加 From 或 To | 单个 | 比较该时刻 |

```
GET /v1/vessel-schedules?PLATFORM.region=NEU&LARA.vesselName=CMA%20CGM%20MARCO%20POLO&LARA.service=FAL&LARA.etbFrom=2026-10-20&LARA.etbTo=2026-11-03&sort=-LARA.etb&page=1&pageSize=100
```

`200` 的 `data` 是船期行，字段见公共对象。`page.totalElements` 是本次条件命中的总条数。

```json
{
  "data": [
    {
      "id": "sch-1",
      "voyageStatus": "Active",
      "pointCovered": true,
      "matchingStatus": "Multiple terminal records",
      "candidateCount": 2,
      "sharedLaraCount": 1,
      "terminalPending": null,
      "lara": {
        "voyage": "0MEG1W",
        "pointCode": "FRFOS",
        "poolLocation": "EUROPE",
        "vesselName": "CMA CGM MARCO POLO",
        "vesselOperator": "CMA",
        "brand": "CMA",
        "service": "FAL",
        "eta": "2026-10-26T08:00:00+08:00",
        "etb": "2026-10-27T00:00:00+08:00",
        "etd": "2026-10-28T18:00:00+08:00",
        "vesselType": "Group vsl",
        "terminal": null
      },
      "terminal": null,
      "lastModifiedBy": "System",
      "lastModifiedAt": "2026-10-27T02:00:00Z",
      "changes": [
        {
          "side": "PLATFORM",
          "field": "matchingStatus",
          "previousValue": "Auto matched",
          "incomingValue": "Multiple terminal records",
          "pending": false
        }
      ]
    }
  ],
  "page": { "number": 1, "size": 100, "totalElements": 342, "totalPages": 4 }
}
```

这一行原来是 Auto matched，并绑着 Terminal 9code。最近一次码头同步变成两条，当时不是 Manual matched，所以状态已写成 Multiple terminal records，码头记录和 9code 都是 null。`pending` 为 false。要进审核是因为匹配还没结束。

### 导出船期

| 项 | 内容 |
|---|---|
| 方法 | GET |
| 路径 | /v1/vessel-schedules/export |
| 说明 | 服务端生成 Excel。筛选参数和 sort 与查询船期相同，不带 page、pageSize。数据范围是本次条件命中的全部船期 |

```
GET /v1/vessel-schedules/export?LARA.etbFrom=2026-10-20&LARA.etbTo=2026-11-03&sort=-LARA.etb
```

`200` 的 `Content-Type` 为 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`。`Content-Disposition` 为附件，例如 `attachment; filename="vessel-schedules.xlsx"`。

工作表一行一条船期。列表上 `terminal` 为 null 的格子留空。时刻写成 `YYYY-MM-DD HH:mm`。不包含 visit_no。

| 列 | 取值 | 含义 |
|---|---|---|
| Mapping status | matchingStatus | 匹配状态 |
| Last modified by | lastModifiedBy | 最后修改人 |
| Last modified at | lastModifiedAt | 最后修改时间 |
| Voyage | lara.voyage | 航次 |
| Voyage status | voyageStatus | Active 或 Omit |
| Point code | lara.pointCode | 港口 |
| Pool location | lara.poolLocation | |
| Vessel name | lara.vesselName | 英文船名 |
| Vessel operator | lara.vesselOperator | 船公司代码 |
| Brand | lara.brand | |
| Service | lara.service | |
| LARA ETA | lara.eta | |
| LARA ETB | lara.etb | |
| LARA ETD | lara.etd | |
| Vessel type | lara.vesselType | |
| Terminal 9code | lara.terminal | |
| Export voyage | terminal.exportVoyage | 码头出口航次 |
| Import voyage | terminal.importVoyage | 码头进口航次 |
| Vessel name CN | terminal.vesselNameCn | |
| Terminal name | terminal.name | 报文 terminal |
| Terminal ETA | terminal.eta | |
| Terminal ATA | terminal.ata | |
| Terminal ETB | terminal.etb | |
| Terminal ATB | terminal.atb | |
| Terminal ETD | terminal.etd | |
| Terminal ATD | terminal.atd | |
| CY open | terminal.cyOpen | |
| CY closing | terminal.cyCutoff | |
| Terminal status | terminal.vesselStatus | 计划、在港、离港 |
| Update time | terminal.updateTime | |

示例中的一行：

| Voyage | Voyage status | Point code | Vessel name | Mapping status | LARA ETB | Export voyage | Terminal ETB |
|---|---|---|---|---|---|---|---|
| 0MEG1W | Active | FRFOS | CMA CGM MARCO POLO | Multiple terminal records | 2026-10-27 00:00 |  |  |

排序或筛选字段非法返回 `400`。

### 船期明细

| 项 | 内容 |
|---|---|
| 方法 | GET |
| 路径 | /v1/vessel-schedules/{scheduleId} |
| 说明 | 在船期行之外增加 remark 和 sources。未知 id 返回 404。明细不改数据 |

```json
{
  "id": "sch-1",
  "voyageStatus": "Active",
  "pointCovered": true,
  "matchingStatus": "Manual matched",
  "candidateCount": 0,
  "sharedLaraCount": 2,
  "terminalPending": null,
  "remark": "Confirmed with agent",
  "lara": {},
  "terminal": {},
  "lastModifiedBy": "Ann",
  "lastModifiedAt": "2026-10-27T02:00:00Z",
  "changes": null,
  "sources": [
    { "side": "TERMINAL", "field": "etd", "value": "2026-10-28T16:00:00+08:00" }
  ]
}
```

示例里的 `lara`、`terminal` 与公共字段相同，这里用空对象省略。`terminal.enteredManually` 为 true 时，前端在码头区标题标明手工录入。

### 读取审核

| 项 | 内容 |
|---|---|
| 方法 | GET |
| 路径 | /v1/vessel-schedules/{scheduleId}/review |
| 说明 | 返回当前 LARA、已绑定的码头记录和 changes。不返回候选表，也不返回 lastModifiedBy。remark 是已保存备注，页面上新的备注框从空开始 |

页面根据这些值决定表单：

| 条件 | 表单 |
|---|---|
| No terminal record | 可以新增码头记录，码头字段都可改 |
| No external voyage | 只能改 exportVoyage 和 importVoyage |
| Manual matched 且 enteredManually | 码头字段都可改，可以删掉这条手工记录 |
| terminalPending 为 many | 展示状态变化和选择按钮。有默认比对对象或用户改选之后，再给出超出天数阈值的字段按钮 |
| terminalPending 为 none | 可以保留当前绑定，也可以不带码头记录保存。保存后码头列为空，匹配状态为 No terminal record |
| 其余 | 码头字段只读。pending 为 true 的字段只在 previousValue 和 incomingValue 之间选。LARA 字段不能手输 |

```json
{
  "id": "sch-1",
  "voyageStatus": "Active",
  "pointCovered": true,
  "matchingStatus": "Manual matched",
  "candidateCount": 2,
  "sharedLaraCount": 1,
  "terminalPending": "many",
  "remark": "",
  "lara": {},
  "terminal": {},
  "changes": [
    {
      "side": "PLATFORM",
      "field": "matchingStatus",
      "previousValue": "Manual matched",
      "incomingValue": "Multiple terminal records",
      "pending": true
    }
  ]
}
```

### 保存审核

| 项 | 内容 |
|---|---|
| 方法 | PUT |
| 路径 | /v1/vessel-schedules/{scheduleId}/review |
| 说明 | 没有变化返回 400。需要选中码头记录却没有选中时返回 409，不写入。terminalPending 为 none 时可以不带 terminal、不带 candidateId 保存：清空码头列，terminal_source 为空，match_method 改为 AUTO，matchingStatus 为 No terminal record，活动日志 match 为 cancel。其余成功时绑定保留，match_method 为 USER，matchingStatus 为 Manual matched。首次出现 ETA gap > 3 days 时也是这个结果，保存后不再显示 ETA gap > 3 days。每种成功都写一条活动日志。响应同读取审核 |

| 字段 | 必填 | 含义 |
|---|---|---|
| remark | 是 | 这次的备注，写入活动日志。可以是空字符串 |
| fields | 是 | 这次确认的待确认字段。没出现的待确认字段保持待确认 |
| fields[].side | 是 | 与 changes 相同 |
| fields[].field | 是 | 属性名 |
| fields[].value | 是 | 确认后的值。LARA 必须是 previousValue 或 incomingValue。vesselType 和 Terminal 9code 提交了也忽略 |
| candidateId | 否 | 尚未绑定、用户从候选里选了一条时才带。必须来自这次候选 |
| terminal | 否 | 保存后的码头记录，字段同公共 terminal，但不带 enteredManually。和 candidateId 一起出现时，覆盖该候选上被改过的字段。单独出现时，表示修改当前绑定或新建手工记录。删掉手工记录时为 null。码头没有改动时不要带 terminal 和 candidateId |

缺航次或 ETA 相差超过 3 天不阻止这次提交。terminalPending 为 none 时，不带码头记录也可以提交，状态改为 No terminal record。仍有多条却没有选中时返回 409。

```json
{
  "remark": "Confirmed with agent",
  "fields": [
    { "side": "LARA", "field": "etb", "value": "2026-10-27T00:00:00+08:00" },
    { "side": "TERMINAL", "field": "etd", "value": "2026-10-30T16:00:00+08:00" }
  ],
  "candidateId": "cand-2",
  "terminal": {
    "exportVoyage": "E009",
    "importVoyage": "I009",
    "vesselNameCn": "",
    "name": "YS01",
    "eta": null,
    "ata": null,
    "etb": null,
    "atb": null,
    "etd": "2026-10-30T16:00:00+08:00",
    "atd": null,
    "cyOpen": null,
    "cyCutoff": null,
    "vesselStatus": "",
    "updateTime": null
  }
}
```

`terminalPending` 为 `none` 时，不带 `terminal` 和 `candidateId`：

```json
{
  "remark": "No terminal record this call",
  "fields": [
    { "side": "PLATFORM", "field": "matchingStatus", "value": "No terminal record" }
  ]
}
```

### 码头候选

| 项 | 内容 |
|---|---|
| 方法 | GET |
| 路径 | /v1/vessel-schedules/{scheduleId}/terminal-candidates |
| 说明 | 打开选择框时读取。没有候选时 data 为空数组。id 是 terminal_payload.id |

尚未绑定且状态是 Multiple terminal records 时，选中的 id 留在页面上，跟确认一起提交。`terminalPending` 为 many 时，选中一条后只更换比对对象。

| 字段 | 含义 | 示例 |
|---|---|---|
| id | 候选 id | cand-1 |
| current | true 表示这条就是现在用于比对或绑定的记录 | true |
| 其余 | 与 terminal 相同，没有 enteredManually | E001 |

```json
{
  "data": [
    {
      "id": "cand-1",
      "current": true,
      "exportVoyage": "E001",
      "importVoyage": "I001",
      "vesselNameCn": "",
      "name": "YS01",
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
  ]
}
```

### 决定码头形态

| 项 | 内容 |
|---|---|
| 方法 | POST |
| 路径 | /v1/vessel-schedules/{scheduleId}/terminal-resolution |
| 说明 | 只在 terminalPending 非空时有效，否则 409。不带备注。成功后返回审核 |

| action | 何时 | 其他字段 | 结果 |
|---|---|---|---|
| keep | terminalPending 为 none | 无 | 保留当前绑定。terminal_resolution = keep |
| clear | terminalPending 为 none | 无 | 解除绑定，清空码头列，terminal_source 为空，match_method 改为 AUTO，匹配状态为 No terminal record。terminal_resolution = clear |
| adopt | terminalPending 为 many | candidateId | 已是 Manual matched 时只换比对对象。尚未审核时把这条写入码头列，状态要等保存审核才变成 Manual matched |

```json
{ "action": "keep" }
```

```json
{ "action": "clear" }
```

```json
{ "action": "adopt", "candidateId": "cand-1" }
```

### 单笔同步

审核页的 Sync latest。页面先丢掉未保存编辑再发起。两个操作都没有请求正文。成功后返回审核，不返回运行记录。

| 项 | 内容 |
|---|---|
| 方法 | POST |
| 路径 | /v1/vessel-schedules/{scheduleId}/lara-sync |
| 说明 | 同步这一条的 LARA |

| 项 | 内容 |
|---|---|
| 方法 | POST |
| 路径 | /v1/vessel-schedules/{scheduleId}/terminal-sync |
| 说明 | 用船期上当时的英文船名和 Point code 查询，对应报文 vesselNameEn 和 portCode。港口未覆盖返回 409 |

### 活动日志

| 项 | 内容 |
|---|---|
| 方法 | GET |
| 路径 | /v1/vessel-schedules/{scheduleId}/activity-logs |
| 说明 | 一次保存或一次自动落库一条。changes 是这一次真正写下的原值和新值。未知船期返回 404 |

| 参数 | 必填 | 含义 |
|---|---|---|
| field | 否 | 字段名子串，忽略大小写。从某一列进入时传属性名，不传列标题 |
| triggeredBy | 否 | 操作人子串，忽略大小写 |
| from | 否 | 日期，包含这一天 |
| to | 否 | 日期，包含这一天 |
| sort | 否 | 默认 `-triggeredAt`。还可以排 triggeredBy、remark |
| page | 否 | 默认 1 |
| pageSize | 否 | 默认 100，最大 500 |

`schedule` 只给标题用。

| 字段 | 含义 | 示例 |
|---|---|---|
| schedule.id | 船期 id | sch-1 |
| schedule.vesselName | 英文船名 | CMA CGM MARCO POLO |
| schedule.pointCode | 港口 | FRFOS |
| schedule.voyage | 航次 | 0MEG1W |
| id | 日志 id | log-1 |
| triggeredAt | 发生时间 | 2026-10-27T02:10:00Z |
| triggeredBy | 操作人 | Ann |
| remark | 用户写下的备注。系统写入时为空。为空时前端按 changes 的 side 和 match 生成说明 | Confirmed with agent |
| match | 空：绑定未变。confirm：建立起绑定。switch：从一条改到另一条。cancel：取消绑定 | confirm |
| changes[].side | LARA、TERMINAL 或 PLATFORM | LARA |
| changes[].field | 页面字段名 | etb |
| changes[].original | 写入前的值 | 2026-10-27T00:00:00+08:00 |
| changes[].updated | 写入后的值 | 2026-10-27T04:00:00+08:00 |

```json
{
  "schedule": {
    "id": "sch-1",
    "vesselName": "CMA CGM MARCO POLO",
    "pointCode": "FRFOS",
    "voyage": "0MEG1W"
  },
  "data": [
    {
      "id": "log-1",
      "triggeredAt": "2026-10-27T02:10:00Z",
      "triggeredBy": "Ann",
      "remark": "Confirmed with agent",
      "match": "confirm",
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

### 列表方案

每个登录用户一套方案。只能读写自己的。用户还没有任何方案时，第一次查询会建一份名为 Default 的方案并设为生效。船期搜索不读这些表。页面用生效方案生成筛选默认值和列，相对日期先折成绝对日期，再放进当次查询参数。

`side` 与 `field` 和船期接口相同。页面把 Vessel operator 画在码头区，保存时仍是 `LARA.vesselOperator`。`LARA.voyage` 不能隐藏。`PLATFORM.matchingStatus` 必须留在 `watched` 里。

默认方案：可见筛选项为 `PLATFORM.region`、`LARA.pointCode`、`LARA.vesselName`、`LARA.voyage`、`LARA.service`、`PLATFORM.matchingStatus`、`LARA.etb`。`LARA.etb` 的默认是 relative，`fromDays` 7、`toDays` 7，即今天往前 7 天到往后 7 天。排序是 `LARA.etb` 降序。`watched` 含同步那一组，外加 `PLATFORM.matchingStatus`，日期的 `dayThreshold` 为 0。

#### 字段

方案：

| 字段 | 含义 | 示例 |
|---|---|---|
| id | 方案 id | ls-1 |
| name | 名称 | Default |
| active | 是否为当前生效方案 | true |
| position | 列表中的顺序，从 0 起 | 0 |
| freeze | 左冻结截止列。不冻结时为 null | null |
| freeze.side | LARA、TERMINAL 或 PLATFORM | LARA |
| freeze.field | 截止列，含这一列 | etb |
| filters | 筛选项，顺序即 position | 见下 |
| columns | 列表列，顺序即 position | 见下 |
| sort | 方案自带的默认排序 | 见下 |
| watched | 高亮字段和天数阈值 | 见下 |

筛选项 `filters[]`：

| 字段 | 含义 | 示例 |
|---|---|---|
| side | LARA、TERMINAL 或 PLATFORM | LARA |
| field | 页面字段名 | etb |
| visible | 搜索页是否显示 | true |
| dateMode | 空、fixed 或 relative。不是日期时省略 | relative |
| value | 子串默认值。多选和日期不带 | FAL |
| values | 多选或多行默认值。没有时省略 | ["NEU"] |
| from | fixed 的开始日期 | 2026-10-20 |
| to | fixed 的结束日期 | 2026-11-03 |
| fromDays | relative：从今天往前的天数。这一端不限制时省略 | 7 |
| toDays | relative：从今天往后的天数。这一端不限制时省略 | 7 |

列 `columns[]`：

| 字段 | 含义 | 示例 |
|---|---|---|
| side | LARA、TERMINAL 或 PLATFORM | LARA |
| field | 页面字段名 | voyage |
| hidden | true 表示列表不显示 | false |

排序 `sort[]`：

| 字段 | 含义 | 示例 |
|---|---|---|
| side | LARA、TERMINAL 或 PLATFORM | LARA |
| field | 页面字段名 | etb |
| descending | true 为降序 | true |

高亮 `watched[]`：

| 字段 | 含义 | 示例 |
|---|---|---|
| side | LARA、TERMINAL 或 PLATFORM | LARA |
| field | 页面字段名 | etb |
| dayThreshold | 日期列的天数。0 表示只要不同就算。非日期不带 | 0 |

#### 查询

| 项 | 内容 |
|---|---|
| 方法 | GET |
| 路径 | /v1/list-settings |
| 说明 | 返回当前用户的全部方案。activeId 是生效的那一份 |

```json
{
  "activeId": "ls-1",
  "data": [
    {
      "id": "ls-1",
      "name": "Default",
      "active": true,
      "position": 0,
      "freeze": null,
      "filters": [
        { "side": "PLATFORM", "field": "region", "visible": true, "values": ["NEU"] },
        { "side": "LARA", "field": "service", "visible": true, "value": "FAL" },
        { "side": "LARA", "field": "etb", "visible": true, "dateMode": "relative", "fromDays": 7, "toDays": 7 }
      ],
      "columns": [
        { "side": "LARA", "field": "voyage", "hidden": false },
        { "side": "LARA", "field": "etb", "hidden": false },
        { "side": "TERMINAL", "field": "exportVoyage", "hidden": true }
      ],
      "sort": [
        { "side": "LARA", "field": "etb", "descending": true }
      ],
      "watched": [
        { "side": "LARA", "field": "etb", "dayThreshold": 0 },
        { "side": "TERMINAL", "field": "exportVoyage" },
        { "side": "PLATFORM", "field": "matchingStatus" }
      ]
    }
  ]
}
```

示例里的 `filters`、`columns`、`watched` 只列出几项。保存和读取时带上该方案的全部筛选项和列。

`GET /v1/list-settings/{settingId}` 返回 `data` 里的同一条对象。不是自己的方案返回 404。

#### 新建、复制、改名、生效、删除

| 方法 | 路径 | 请求 | 结果 |
|---|---|---|---|
| POST | /v1/list-settings | `{ "name": "Asia" }` | 201，按默认方案生成，active 为 false |
| POST | /v1/list-settings/{settingId}/duplicate | `{ "name": "Asia copy" }` | 201，复制筛选项、列、排序和高亮，active 为 false |
| PATCH | /v1/list-settings/{settingId} | `{ "name": "Asia peak" }` | 200。名称为空，或和自己的另一份重名，返回 400 |
| POST | /v1/list-settings/{settingId}/activate | 无正文 | 200，返回生效后的方案。原先生效的那份改为 false |
| DELETE | /v1/list-settings/{settingId} | 无 | 204。删的是当前生效方案，或只剩这一份时，返回 409 |

#### 保存

| 项 | 内容 |
|---|---|
| 方法 | PUT |
| 路径 | /v1/list-settings/{settingId} |
| 说明 | 替换这份方案的名称、冻结、筛选项、列、排序和高亮。不改变 active。未知字段返回 400。LARA.voyage 被标成隐藏，或 watched 里没有 PLATFORM.matchingStatus，返回 400 |

请求体与查询返回的单条方案相同，不带 `id` 和 `active`。成功返回保存后的方案。

```json
{
  "name": "Default",
  "position": 0,
  "freeze": { "side": "LARA", "field": "etb" },
  "filters": [
    { "side": "LARA", "field": "etb", "visible": true, "dateMode": "relative", "fromDays": 7, "toDays": 7 }
  ],
  "columns": [
    { "side": "LARA", "field": "voyage", "hidden": false },
    { "side": "LARA", "field": "etb", "hidden": false }
  ],
  "sort": [
    { "side": "LARA", "field": "etb", "descending": true }
  ],
  "watched": [
    { "side": "LARA", "field": "etb", "dayThreshold": 1 },
    { "side": "PLATFORM", "field": "matchingStatus" }
  ]
}
```

### 码头航次

只读已经入库的记录，不现场调用码头接口。一次成功同步替换该港口的旧行。`portCode` 只出现在筛选里，不在行上。region 从港口连接。时刻保留报文原文，例如 `2025-06-13 17:00:00`。值为 null 的字段仍然返回。

#### 查询

| 项 | 内容 |
|---|---|
| 方法 | GET |
| 路径 | /v1/terminal-voyages |
| 说明 | 读取码头航次列表。筛选、排序和分页都是查询参数。不带筛选参数时不附加筛选。已选 region 时，portCode 只能落在这些区域下。sort 默认 `-eta`，可叠多个字段，例如 `-eta,atd` |

| 参数 | 必填 | 含义 |
|---|---|---|
| sort | 否 | 默认 `-eta` |
| page | 否 | 默认 1 |
| pageSize | 否 | 默认 100，最大 500 |

| 参数 | 形态 | 含义 |
|---|---|---|
| vesselName | 可重复 | 精确匹配，忽略大小写，匹配 vesselNameEn 或 vesselNameCn |
| voyage | 可重复 | 精确匹配，忽略大小写，匹配 evoyage 或 ivoyage |
| region | 可重复 | 区域代码 |
| portCode | 可重复 | 同步时使用的港口代码 |
| status | 可重复 | 报文 status，例如计划、在港、离港 |
| etaFrom、etaTo、ataFrom、ataTo、etbFrom、etbTo、atbFrom、atbTo、etdFrom、etdTo、atdFrom、atdTo | 单个 | 日期，包含这一天，可只给一端 |

```
GET /v1/terminal-voyages?vesselName=EVER%20LADEN&voyage=1173069E&region=CC&portCode=CNNGB&status=%E8%AE%A1%E5%88%92&etaFrom=2025-06-01&etaTo=2025-06-30&sort=-eta&page=1&pageSize=100
```

`200` 返回当前页。`GET /v1/terminal-voyages/{voyageId}` 返回 `data` 里的同一条对象。未知 id 返回 404。

| 字段 | 含义 | 示例 |
|---|---|---|
| id | terminal_voyage.id | tv-1 |
| status | 报文 status | 离港 |
| vesselNameEn | 英文船名 | EVER LADEN |
| vesselNameCn | 中文船名 | 长满 |
| shipCode | 船公司代码 | 0EMC |
| shipName | 船公司名称 | 长荣 |
| agentCode | 代理代码 | 0CSISA |
| agentName | 代理名称 | 航华国际 |
| lineCode | 航线代码 | null |
| terminal | 报文 terminal。9code 用港口和它去 terminal_code 连接 | YS01 |
| portsEn | 挂靠英文 | USLAX+CNNGB |
| portsCn | 挂靠中文 | 洛杉矶+宁波 |
| eta、ata、etb、atb、etd、atd | 报文时刻 | 2025-06-13 17:00:00 |
| cyOpen | CY open | 2025-06-13 11:00:00 |
| cyClosing | CY closing | 2025-06-16 10:00:00 |
| portCloseDate | Port close | null |
| customsCloseDate | Customs close | null |
| updateTime | Update time | 2025-06-17 11:48:06 |
| ivoyage | 进口航次 | E068 |
| evoyage | 出口航次 | 1173069E |

```json
{
  "data": [
    {
      "id": "tv-1",
      "status": "离港",
      "vesselNameEn": "EVER LADEN",
      "vesselNameCn": "长满",
      "shipCode": "0EMC",
      "shipName": "长荣",
      "agentCode": "0CSISA",
      "agentName": "航华国际",
      "lineCode": null,
      "terminal": "YS01",
      "portsEn": "USLAX+CNNGB",
      "portsCn": "洛杉矶+宁波",
      "eta": "2025-06-13 17:00:00",
      "ata": "2025-06-13 17:00:00",
      "etb": "2025-06-15 09:30:00",
      "atb": "2025-06-15 10:00:00",
      "etd": "2025-06-16 10:00:00",
      "atd": "2025-06-16 10:00:00",
      "cyOpen": "2025-06-13 11:00:00",
      "cyClosing": "2025-06-16 10:00:00",
      "portCloseDate": null,
      "customsCloseDate": null,
      "updateTime": "2025-06-17 11:48:06",
      "ivoyage": "E068",
      "evoyage": "1173069E"
    }
  ],
  "page": { "number": 1, "size": 100, "totalElements": 1, "totalPages": 1 }
}
```

### 区域

`active` 为 false 时，新建港口不能再选它，已经挂上的港口仍保留原代码。已被港口使用的区域不能删除，返回 409。

| 字段 | 含义 | 示例 |
|---|---|---|
| code | 区域代码，主键 | CC |
| name | 名称。页面可显示成 code (name) | China domestic |
| active | true 可选。false 停用 | true |

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /v1/regions | 返回 `{ "data": [ Region ] }` |
| PUT | /v1/regions/{code} | 已存在则 200，否则 201。路径与正文的 code 必须一致 |
| PATCH | /v1/regions/{code} | 正文 `{ "active": false }`，返回更新后的区域 |
| DELETE | /v1/regions/{code} | 成功 204。仍被港口使用返回 409 |

```json
{ "code": "CC", "name": "China domestic", "active": true }
```

### 港口

查询参数：`portCode`、`portName` 为子串，忽略大小写。`region` 可重复，精确匹配区域代码。`coverage` 为 `covered` 或 `not-covered`，不传表示全部。

码头查询只发给 `active` 和 `apiCovered` 都为 true 的港口。`pointCovered` 就是 `apiCovered`。已被船期引用的港口不能删除，返回 409，可以改为停用。

| 字段 | 含义 | 示例 |
|---|---|---|
| portCode | 主键。LARA 的 POINT_CODE，也是码头查询的 portCode | CNNGB |
| portName | 港口名称 | NINGBO |
| regionCode | 所属区域。停用后仍保留原代码 | CC |
| active | false 时筛选不能再选，历史船期仍显示，也不再发码头查询 | true |
| apiCovered | 是否对接码头接口 | true |
| terminals[].nineCode | Terminal 9code。一个 9 位码可以挂多个 code | CNNGBYAN |
| terminals[].code | 报文 terminal，或矩阵简称 | YS01 |
| terminals[].nameZh | 码头中文名 | 大榭招商 |

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /v1/ports | 返回 `{ "data": [ Port ] }` |
| PUT | /v1/ports/{portCode} | 已存在则 200，否则 201。terminals 整组替换。正文不带 active，已有港口保持原来的 active。代码或 9 位码和其他港口冲突返回 409。region 已停用返回 400 |
| PATCH | /v1/ports/{portCode} | 正文 `{ "active": false }` |
| DELETE | /v1/ports/{portCode} | 成功 204。已被船期引用返回 409 |

```json
{
  "portCode": "CNNGB",
  "portName": "NINGBO",
  "regionCode": "CC",
  "active": true,
  "apiCovered": true,
  "terminals": [
    { "nineCode": "CNNGBYAN", "code": "YS01", "nameZh": "大榭招商" },
    { "nineCode": "CNNGBYAN", "code": "YAN1", "nameZh": "大榭招商" }
  ]
}
```
