# 船期中心：表与接口

时刻用 ISO-8601，筛选日期用 `YYYY-MM-DD`。空业务值用 `null`。错误使用 `application/problem+json`。创建返回 `201`，读取和替换返回 `200`。响应里是资源 `id`，不返回 URL。`page` 从 1 起，`pageSize` 默认 100、最大 500。

一次 LARA 调用的身份是 `lara_voyage` + `lara_point_code` + `lara_visit_no`。`omit_flag` 不入库：导入只取 `OMIT_FLAG = 'N'`。之后这条从批量里消失，或 LARA 把 `OMIT_FLAG` 改成 `Y`，则 `platform_omit` 为真，页面对应 `platformVoyageStatus` 为 Omit。

查询参数、排序和返回字段都直接用字段名。LARA 字段以 `lara` 开头，码头字段以 `terminal` 开头，平台字段以 `platform` 开头，变量名用驼峰。

## 表

### vessel_schedule

作用：一条船期的身份、两个当前指针，以及列表用的五列投影。LARA 当前值在 `lara_version`，当前码头绑定在 `match`。列表和明细里的 LARA 列、码头列、`terminalManual` 按这两个指针读出来。`platformMatchingStatus`、`platformLastSyncStatus`、`lastSyncAt`、`lastModifiedBy`、`lastModifiedAt` 存在这一行，供筛选、排序和分页。版本、匹配或码头查询变化时，同一事务里按同一套规则重写这五列。请求里提交的匹配状态忽略。

主键：`id`

外键：`lara_point_code` → `port.port_code`；`lara_version_id` → `lara_version.id`；`match_id` → `match.id`

| 列 | 说明 |
|---|---|
| id | 主键。接口里的船期 id |
| created_from | 来源。目前为 LARA |
| lara_voyage | 身份里的 LARA 航次。与 lara_point_code、lara_visit_no 一起识别同一次挂靠。成功同步时随这次报文更新 |
| lara_point_code | 身份里的港口。外键，指向 port.port_code |
| lara_visit_no | 同一次挂靠的访问序号。只在船期上，同步不覆盖。不返回 |
| lara_pool_location | 身份里的 pool location。成功同步时随这次报文更新 |
| platform_omit | true 时接口 platformVoyageStatus 为 Omit |
| lara_version_id | 当前 LARA 版本。没有版本时为空 |
| match_id | 当前匹配。没有匹配时为空 |
| platform_matching_status | 列表上的 Mapping status。没有匹配结果时为空 |
| platform_last_sync_status | 最近一次已结束的码头查询本身的结果。还没有查询时为空。不用 Manual matched 和 Pending match |
| last_sync_at | 最近一次码头查询的发出时间，含尚未返回的查询。没有查询时为空。接口 lastSyncAt |
| last_modified_by | 最近一次写入的人。来自当前 LARA 版本、当前匹配，以及该匹配指向的码头版本中最晚的一条。没有这些行时为空。接口 platformLastModifiedBy |
| last_modified_at | 与 last_modified_by 同一条的时间。接口 platformLastModifiedAt |

读取时，LARA 列取 `lara_version_id` 指向的那一版。码头列取 `match_id` 指向的 `match.terminal_version_id`；该指针为空时，码头列为空。列表筛选、排序和分页直接用上面五列，不再对全表重算。

`platformMatchingStatus` 取值：

| 值 | 含义 |
|---|---|
| Auto matched | 正好一条码头记录，进出口航次都有，LARA ETA 与码头 ETA 相差不超过 3 天 |
| Manual matched | 人确认后正好绑着一条码头记录。已保存的码头值与后来的同步相同、绑定也仍是这一条时，保持这个值 |
| Pending match | 已经是 Manual matched 或 Pending match，这次仍有未确认差异。不覆盖已保存的码头字段。确认前列表和明细的码头格子显示 —。LARA 始终是最新值 |
| Multiple terminal records | 尚未按人工结果处理，码头同步返回多条。码头列已清空 |
| No terminal record | 尚未按人工结果处理，码头同步没有记录。码头列已清空。审核确认不能写成这个值，必须选择或新建一条码头记录 |
| No external voyage | 绑着的记录缺少进口或出口航次 |
| ETA gap > 3 days | 绑着一条码头记录，LARA ETA 与码头 ETA 的天数差算不出来，或超过 3 天 |

`terminalManual` 为 true 表示当前码头版本是手工录入（`terminal_version.entered_manually`）。采用同步候选时为 false。

### lara_version

作用：一条船期的一份 LARA 值。只追加，不改旧行。`vessel_schedule.lara_version_id` 指向当前这份。字段相对上一版没有变化时不追加。

主键：`id`

外键：`schedule_id` → `vessel_schedule.id`；`payload_id` → `lara_payload.id`，手工改写且不对照某次报文时为空

| 列 | 说明 |
|---|---|
| id | 主键 |
| schedule_id | 所属船期 |
| seq | 这条船期上的版本序号，从 1 起 |
| source | SYNC：这次写入来自同步或整份采纳报文。USER：人改过的版本 |
| payload_id | 这份值采纳自哪一条 LARA 报文。没有对照报文时为空 |
| reason | 写入原因。同步写入时为空 |
| updated_by | 写入人。系统写入时为 System |
| updated_at | 写入时间 |
| lara_voyage、point_code、lara_pool_location、vessel_name、vessel_operator、brand、service、vessel_type、lara_eta、lara_etb、lara_etd、voyage_status | 这一版的 LARA 快照 |

### terminal_version

作用：一条船期的一份码头值。只追加，不改旧行。当前用的是 `match.terminal_version_id` 指向的那一版，不是序号最大的那一版。手工补录也写在这里，不写 `terminal_payload`。

主键：`id`

外键：`schedule_id` → `vessel_schedule.id`；`payload_id` → `terminal_payload.id`，手工补录时为空

| 列 | 说明 |
|---|---|
| id | 主键 |
| schedule_id | 所属船期 |
| seq | 这条船期上的版本序号，从 1 起 |
| source | SYNC 或 USER |
| payload_id | 这份值采纳自哪一条码头候选。手工补录为空 |
| entered_manually | true：整份由页面新建，不是从候选采纳。接口 terminalManual 用它 |
| reason | 写入原因 |
| updated_by | 写入人 |
| updated_at | 写入时间 |
| vessel_operator、export_voyage、import_voyage、vessel_name_cn、terminal_name、eta、ata、etb、atb、etd、atd、cy_open、cy_cutoff、vessel_status、update_time | 这一版的码头快照 |

### match

作用：某一次 LARA 版本和码头版本的绑定，也是对一次码头查询的整份确认。只追加。`vessel_schedule.match_id` 指向当前这次。`terminal_version_id` 为空表示当前没有绑定码头记录。版本、方法、LARA 版本和 `query_id` 都与上一次相同则不追加。确认时要么整份保留当前码头版本，要么整份采用一条码头候选，不按字段混用。

主键：`id`

外键：`schedule_id` → `vessel_schedule.id`；`lara_version_id` → `lara_version.id`；`terminal_version_id` → `terminal_version.id`；`query_id` → `terminal_query.id`

| 列 | 说明 |
|---|---|
| id | 主键 |
| schedule_id | 所属船期 |
| seq | 这条船期上的匹配序号，从 1 起 |
| lara_version_id | 绑定时的当前 LARA 版本 |
| terminal_version_id | 绑上的码头版本。解开或尚未绑定时为空 |
| query_id | 这次匹配所回答的码头查询。不是在回答某一次查询时为空。当前匹配的 `query_id` 等于最近一次查询时，这次查询已经确认过 |
| method | AUTO：同步建立。USER：人确认后的绑定。Manual matched 与 Pending match 都要求 method 为 USER，再看最近一次查询是否已由当前匹配回答 |
| reason | 写入原因 |
| updated_by | 写入人 |
| updated_at | 写入时间 |

### lara_sync_run

作用：一次 LARA 同步运行。失败的运行不写 payload，船期上保留上次成功的 LARA 值。

主键：`id`

外键：`schedule_id` → `vessel_schedule.id`。批量运行为空

| 列 | 说明 |
|---|---|
| id | 主键 |
| schedule_id | 单笔同步时指向这条船期。批量时为空 |
| started_at | 开始时间 |
| finished_at | 结束时间 |
| status | SUCCESS 或 FAILED |
| error | 失败原因。成功时为空 |

### lara_payload

作用：一次成功 LARA 同步里、属于一条船期的报文。只追加，不覆盖。一条船期有多行。页面上的 LARA 值读当前 `lara_version`，不直接读这张表。失败的运行不插入行。

主键：`id`

外键：`run_id` → `lara_sync_run.id`；`schedule_id` → `vessel_schedule.id`

| 列 | 说明 |
|---|---|
| id | 主键 |
| run_id | 写出这一行的成功运行 |
| schedule_id | 所属船期。可重复 |
| captured_at | 抓到的时间，等于这次运行的结束时间 |
| lara_voyage、point_code、lara_pool_location、vessel_name、vessel_operator、brand、service、vessel_type、lara_eta、lara_etb、lara_etd、voyage_status | 这次报文的原样 |

### terminal_sync_run

作用：一次码头同步运行。审核页上的单笔码头同步不写这张表。失败时不替换已有候选。

主键：`id`

外键：无

| 列 | 说明 |
|---|---|
| id | 主键 |
| started_at | 开始时间 |
| finished_at | 结束时间 |
| status | SUCCESS 或 FAILED |
| error | 失败原因。成功时为空 |

### terminal_query

作用：一条船期的一次码头查询。候选只追加，不删除更早的查询留下的行。选择框和审核读最近一次已结束且不是 FAILED 的查询。FAILED 不产生新候选，读取时仍用上一次成功查询的候选。

主键：`id`

外键：`sync_run_id` → `terminal_sync_run.id`，单笔查询为空；`schedule_id` → `vessel_schedule.id`；`lara_version_id` → `lara_version.id`

| 列 | 说明 |
|---|---|
| id | 主键 |
| sync_run_id | 批量运行。审核页单笔查询为空 |
| schedule_id | 所属船期 |
| lara_version_id | 发出这次查询时船期上的当前 LARA 版本 |
| port_code | 这次查询使用的港口。码头航次筛选用它，不作为航次列表的列 |
| status | PENDING、FOUND、NOT_FOUND 或 FAILED |

### terminal_payload

作用：某一次码头查询返回的一条候选。只追加。选择框里的 id 就是最近一次成功查询下这些行的 id。手工补录不插入这张表，只追加 `terminal_version`。同一港口、英文船名、出口航次、进口航次在码头航次列表里合成一行，id 取其中一条。

主键：`id`

外键：`query_id` → `terminal_query.id`；`schedule_id` → `vessel_schedule.id`

| 列 | 说明 |
|---|---|
| id | 主键。候选 id，也是码头航次 id |
| query_id | 所属查询 |
| schedule_id | 所属船期。同一次查询的多条候选都指向同一条船期 |
| vessel_name_en | 英文船名 |
| vessel_name_cn | 中文船名 |
| evoyage | 出口航次 |
| ivoyage | 进口航次 |
| terminal | 报文 terminal |
| status | 报文 status |
| ship_code | 船公司代码 |
| ship_name | 船公司名称 |
| agent_code | 代理代码 |
| agent_name | 代理名称 |
| line_code | 航线代码 |
| ports_en | 挂靠英文 |
| ports_cn | 挂靠中文 |
| eta、ata、etb、atb、etd、atd | 报文时刻，保留原文 |
| cy_open | CY open |
| cy_closing | CY closing |
| port_close_date | Port close |
| customs_close_date | Customs close |
| update_time | Update time |

### activity_log

作用：一次保存或一次自动落库一条。人工确认的备注是用户写下的文字。系统落库时，remark 由服务端写成这次事件。

主键：`id`

外键：`schedule_id` → `vessel_schedule.id`

| 列 | 说明 |
|---|---|
| id | 主键 |
| schedule_id | 所属船期 |
| triggered_at | 发生时间 |
| triggered_by | 操作人。系统写入时为 System |
| remark | 人工确认时是用户备注，可以为空。系统写入时由服务端描述这次事件，例如系统同步 LARA、系统同步码头、系统自动建立匹配 |
| match | 空：绑定未变。confirm：确认后绑着一条。switch：从一条改到另一条。确认必须带上一条码头记录 |

### activity_log_change

作用：一条活动日志里真正写下的一个字段，记录写入前和写入后的值。

主键：`log_id`、`field`

外键：`log_id` → `activity_log.id`

| 列 | 说明 |
|---|---|
| log_id | 所属日志。主键之一 |
| field | 字段名，例如 laraEtb、terminalEtd、platformMatchingStatus。主键之一 |
| original | 写入前的值 |
| updated | 写入后的值 |

### region

作用：区域。停用后不能再挂到新建港口上，已经挂上的港口仍保留原代码。

主键：`code`

外键：无

| 列 | 说明 |
|---|---|
| code | 主键。区域代码 |
| name | 名称 |
| active | true：新建港口可以选。false：停用。已经挂在港口上的代码仍显示 |

### port

作用：港口。船期用 `lara_point_code` 连到这里取得区域。码头查询只发给 active 且 api_covered 都为 true 的港口。

主键：`port_code`

外键：`region_code` → `region.code`

| 列 | 说明 |
|---|---|
| port_code | 主键。LARA 的 POINT_CODE，也是码头查询的 portCode |
| port_name | 港口名称 |
| region_code | 所属区域。外键。区域停用后这列仍保留原代码 |
| active | true：筛选里可以选。false：停用。历史船期仍显示，新建筛选不能再选，也不发码头查询 |
| api_covered | true：对接码头接口，审核页可以发码头同步。页面 pointCovered 用它 |

### terminal

作用：一个 Terminal 9code。由船期的港口和报文 terminal 经 `terminal_code` 连到这里。

主键：`nine_code`

外键：`port_code` → `port.port_code`

| 列 | 说明 |
|---|---|
| nine_code | 主键。例如 CNSHADT17 |
| port_code | 所属港口。外键 |
| name_zh | 码头中文名 |

### terminal_code

作用：把报文里的码头代码和简称对到同一个 9code。YS01 与 YAN1 可以指向同一条码头。

主键：`port_code`、`code`

外键：`port_code` → `port.port_code`；`nine_code` → `terminal.nine_code`

| 列 | 说明 |
|---|---|
| port_code | 港口。主键之一，外键 |
| code | 报文 terminal，或矩阵里的简称。主键之一。例如 YS01、YAN1、WGQ2 |
| nine_code | 对到的码头。外键 |

### list_setting

作用：一个登录用户的一份列表方案。每个用户恰好有一份生效。第一次读取时如果还没有方案，建一份名为 Default 并设为生效。筛选项、列、排序、关注项和冻结列整份放在 `config`，不拆子表。

物理表名：`vsc_list_setting`。主键：`id`。外键：无。`owner` 是登录名，不指向别的表。

| 列 | 说明 |
|---|---|
| id | 主键 |
| owner | 登录名。只能读写自己的方案 |
| name | 方案名称。同一 owner 下不重复 |
| position | 在该用户方案列表中的顺序，从 0 起 |
| active | true：当前生效。每个 owner 恰好一行是 true |
| config | JSON。含 `freeze`、`filters`、`columns`、`sort`、`watched`，形状与列表方案接口正文相同。改名和切换生效不改这列 |

`filters` 含是否显示和默认值。相对日期存在这里，提交船期搜索前由前端折成绝对日期。隐藏项的默认值仍会提交。`platformRegion` 只有筛选项，不是列表列。`columns` 里 `laraVoyage` 不能隐藏。`sort` 是方案自带的默认排序，搜索页临时改的排序不写回这里。`watched` 只决定高亮和提示，`platformMatchingStatus` 必须保留。日期列的 `dayThreshold` 为空或 0 时，只要不同就提示。

## 系统关键逻辑

当前 LARA 值和码头值通过 `vessel_schedule.lara_version_id` 和 `match_id` 读取。同步和审核追加 `lara_version`、`terminal_version`、`match`，再把指针移到新行。旧版本不改。报文只追加 `lara_payload`、`terminal_payload`。页面上的选择在确认前不落这些表。`platformTerminalPending` 和 `changes` 不入库。`platform_matching_status`、`platform_last_sync_status`、`last_sync_at`、`last_modified_by`、`last_modified_at` 在同一次写入结束时重写到 `vessel_schedule`。审核确认整份保留或整份采用，不按字段各取一边。

下面的「码头列」指当前 `match.terminal_version_id` 那一版；「LARA 列」指当前 `lara_version`。接口仍返回摊平后的字段。

### 同步

按 `lara_voyage` + `lara_point_code` + `lara_visit_no` 找到 `vessel_schedule` 就用原行，找不到就插入。成功同步时更新身份列 `lara_voyage`、`lara_point_code`、`lara_pool_location`。`lara_visit_no` 不覆盖。之后从批量里消失，或 LARA 把 `OMIT_FLAG` 改成 `Y`，不删行，只把 `platform_omit` 置为 true。

LARA：

| 步骤 | 表 |
|---|---|
| 开始一次运行 | 插入 `lara_sync_run`。单笔填 `schedule_id`，批量为空 |
| 成功 | 为每条命中的船期追加一行 `lara_payload`。相对当前 `lara_version` 有字段变化时，再追加 `lara_version`，`payload_id` 指向这行报文，`source` 为 SYNC，并把 `lara_version_id` 指到新版本。`lara_sync_run.status` 为 SUCCESS |
| 失败 | 只把 `lara_sync_run.status` 写成 FAILED，并写 `error`。不插入 `lara_payload`，不追加版本，不改 `lara_version_id` |
| 版本有变化 | 插入一条 `activity_log`：`triggered_by` 为 System，`remark` 由服务端写成这次事件，`match` 为空。每个变化的字段插入 `activity_log_change`，`original` 是上一版的值，`updated` 是新版本的值 |
| 版本没有变化 | 不追加 `lara_version`，不写 `activity_log` 和 `activity_log_change` |

码头：

| 步骤 | 表 |
|---|---|
| 批量运行 | 插入 `terminal_sync_run`。每条船期插入 `terminal_query`，`sync_run_id` 指向这次运行，`lara_version_id` 是发出时的当前 LARA 版本 |
| Review 页单笔查询 | 不插入 `terminal_sync_run`。`terminal_query.sync_run_id` 为空 |
| FOUND 或 NOT_FOUND | `terminal_query.status` 写成对应值。不删除更早的 `terminal_payload`。FOUND 为这次查询追加候选，每行的 `schedule_id` 都是这条船期。NOT_FOUND 追加零行 |
| FAILED | `terminal_query.status` 为 FAILED。不插入 `terminal_payload`。`match_id` 和已有 `terminal_version` 保持不变 |
| 要把码头结果写上当前值 | 追加 `terminal_version`，`payload_id` 指向被采纳的候选，`entered_manually` 为 false，`source` 为 SYNC。再追加 `match`，`method` 为 AUTO，`terminal_version_id` 指向新版本，`vessel_schedule.match_id` 指向这条 match。同时重写船期上的五列投影 |
| 版本或匹配有变化 | 与 LARA 相同，写 `activity_log` 和 `activity_log_change` |
| 手工补录 | 不插入 `terminal_payload`。追加 `terminal_version`，`payload_id` 为空，`entered_manually` 为 true，`source` 为 USER。再追加 `match`，`method` 为 USER |

码头当前值是否换成这次查询，按下表。LARA 在成功且字段有变化时始终追加新版本，不受这张表限制。没有被采纳的候选只留在 `terminal_payload`。

| 当前状态 | 这次结果 | 写入 |
|---|---|---|
| 不是 Manual matched，也不是 Pending match | 一条且可自动匹配 | 追加 terminal_version 和 method 为 AUTO 的 match。读取为 Auto matched |
| 不是 Manual matched，也不是 Pending match | 一条，但缺航次或 ETA 差超过 3 天 | 追加这条候选对应的 terminal_version 和 AUTO match。读取为 No external voyage 或 ETA gap > 3 days |
| 不是 Manual matched，也不是 Pending match | 多条或没有记录 | 追加一条 match，`terminal_version_id` 为空。读取为 Multiple terminal records 或 No terminal record |
| Manual matched 或 Pending match | 多条，且只有一条的出口航次和进口航次都与当前绑定相同，这条的其余码头字段也与已保存值完全相同 | 不追加 terminal_version，不换 match。读取的匹配状态不变。platformTerminalPending 为空。不进入 Review |
| Manual matched 或 Pending match，且当前码头记录不是人工写入 | 已保存的码头字段与这次同步有差异，或这次会变成缺航次、ETA gap、多条且不能按上一行跳过 | 不追加 terminal_version，不换 match。读取为 Pending match |
| Manual matched | 没有记录 | 不追加 terminal_version，不换 match，匹配状态仍是 Manual matched。不进入 Review。不看这条码头记录是不是人工写入 |
| Manual matched 或 Pending match | 已保存的每个码头字段都和这次同步相同，绑定仍是这一条 | 不追加 terminal_version。匹配状态保持 Manual matched。若方法仍需要从 USER 回到 AUTO，只追加 method 为 AUTO 的 match，码头版本沿用当前这份 |

已是 Manual matched 或 Pending match、下一次仍是多条时，不换当前码头版本。出口航次和进口航次都有值、并且只有一条 `terminal_payload` 两个都相同：这条的其余码头字段也与已保存值完全相同时，匹配状态保持不变，`platformTerminalPending` 为空，不进入 Review。其余字段有任何不同时，这一条才是比对对象，读取时 `platformTerminalPending` 为 `many`，状态写成 Pending match。当前是 Manual matched、下一次查询是 NOT_FOUND 时，不换当前码头版本，匹配状态不变，`platformTerminalPending` 为空，不进入 Review。不看当前码头记录是不是人工写入。

`changes` 用当前版本的值、`activity_log_change` 里该字段上一笔，以及这条船期最新的 `lara_payload`、最近一次成功查询的 `terminal_payload` 算出。没有差异时为 `null`。`pending` 为 false 表示已经写进当前版本；`pending` 为 true 表示还在 `terminal_payload` 里、当前 `terminal_version` 没被换掉。LARA 的差异 `pending` 为 false。

`Multiple terminal records`、`ETA gap > 3 days`、没有绑定、以及港口未覆盖且不是手工补录时，列表和明细的码头字段返回 `null`。这时当前 `match.terminal_version_id` 为空，已有的 `terminal_version` 行仍保留。Pending match 返回当前 `terminal_version` 上已保存的码头字段。

### 高亮

不写版本和报文。对比当前版本已经写入的值，和 `activity_log_change` 里该字段上一笔 `updated`。只取该用户当前生效方案 `config.watched` 中的字段，日期再按 `dayThreshold` 过滤。关注项不决定版本写不写，也不决定是否进入 Review。LARA 只要和上一笔不同就参与，不要求已经绑上码头。人工确认后留在当前 `terminal_version` 上的码头值，和上一笔不同且被关注时，同样参与。列表行在任一这样的差异上高亮。提示图标只出现在关注的列上。Review 页上这个字段已经展开上一版和这次同步时，不再另放提示图标。`platformMatchingStatus` 本身没有这个提示。

### Review

确认前不追加版本、不改 `match_id`，也不写 `activity_log`。候选仍是最近一次成功查询已有的 `terminal_payload`。页面上的选择、新建，确认前都不插入 `terminal_payload`。

读取出的匹配状态为 Pending match、Multiple terminal records、ETA gap > 3 days、No external voyage、No terminal record，或 `platformTerminalPending` 非空，或 `changes` 里有 `pending` 为 true 的字段时，可以进入 Review。当前是 Manual matched、这次码头同步没有记录时，不进入 Review，下表不适用。

| 条件 | 确认前 | 确认时写入 |
|---|---|---|
| platformTerminalPending 为 many，且已有保存的码头记录，并有唯一航次相同、但其余字段并不完全相同的 `terminal_payload` | 页面码头区在选定前不显示已保存列，只提供对照。对照里右边先选定一条，再按整份比较。必须选择 Keep current 或 Use this sync。航次相同且其余字段也完全相同的那条不产生 `many`，不进入本行 | Keep current 则不追加 terminal_version，追加一条 match，码头版本不变，query_id 为这次查询。Use this sync 则按所选候选整份追加 terminal_version，entered_manually 为 false，再追加 method 为 USER 的 match，query_id 为这次查询。读取都是 Manual matched |
| platformTerminalPending 为 many，已有保存的码头记录，且没有一条的出口航次和进口航次同时与当前绑定相同 | 页面码头区在选定前不显示已保存列。对照里右边先选定一条。必须选择 Keep current，或对选中记录使用 Use this sync。两者都没做不能确认 | Keep current 则码头版本不变。Use this sync 则追加所选候选的 terminal_version，entered_manually 为 false，match.method 为 USER。读取都是 Manual matched |
| platformTerminalPending 为 many，且还没有绑定 | 码头区为空，直到选中一条 `terminal_payload`。不能在页面上新建 | 追加选中候选的 terminal_version，entered_manually 为 false，match.method 为 USER |
| No terminal record | 必须在页面上新建一条 | 追加 terminal_version，payload_id 为空，entered_manually 为 true，match.method 为 USER |
| Multiple terminal records，且还没有绑定 | 必须选中一条 `terminal_payload`。不能新建 | 追加选中候选的 terminal_version，entered_manually 为 false，match.method 为 USER |
| 已是 Manual matched，存在 pending 为 true 的码头字段 | 页面码头区在选定前不显示已保存列。对照左边是已保存记录，右边是这次同步。必须选择 Keep current 或 Use this sync，同一次确认整份采用一边 | Keep current 则码头版本不变，追加 match，query_id 为这次查询。Use this sync 则按这次候选整份追加 terminal_version，match.method 为 USER，query_id 为这次查询。读取为 Manual matched |
| 已是 Manual matched，这次只返回一条，且这条不是自动匹配 | 不换当前码头版本。页面码头区在选定前不显示已保存列。对照后必须选择 Keep current 或 Use this sync | Keep current 则码头版本不变。Use this sync 则追加这条候选的 terminal_version，entered_manually 为 false，match.method 为 USER。读取都是 Manual matched |

其余码头字段只读。LARA 不能手输，始终是当前 `lara_version`。Pending match 时，列表和明细把码头格子画成 —。Review 的码头区在对照里选定一边之前不显示码头列；选定后显示所选整条，确认之后列表和明细才画出这些值。还不是 Manual matched 的 Multiple terminal records、No terminal record、ETA gap > 3 days、No external voyage 仍用选择或新建，不走这套对照。

确认必须带上一条码头记录。没有这条时返回 409，版本、匹配和报文都不改。有这条时：

| 表 | 写入 |
|---|---|
| vessel_schedule | 追加了新 match 时把 `match_id` 指到它。不写码头字段。确认结束时重写五列投影，绑上一条后 `platform_matching_status` 为 Manual matched |
| terminal_version、match | 按上表追加。采纳候选时 `entered_manually` 为 false；只有页面新建才为 true。请求里的 `platformMatchingStatus` 忽略，确认绑上一条后读取为 Manual matched |
| lara_sync_run、lara_payload、terminal_sync_run、terminal_query、terminal_payload | 不写。新建的手工记录也不插入 `terminal_payload` |
| activity_log | 插入一条。`remark` 是用户备注，可以为空。保留当前绑定时 `match` 为 confirm。从一条改到另一条时 `match` 为 switch |
| activity_log_change | 每个实际变化的字段一行，包括匹配状态。`original` 为确认前的值，`updated` 为确认后的值。没有变化的字段不插 |

缺航次或 ETA 相差超过 3 天不阻止确认。Cancel 恢复页面，不写版本、匹配和活动日志。Review 页上的单笔同步走上面的同步规则。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /v1/vessel-schedules | 按本次查询参数查询船期 |
| GET | /v1/vessel-schedules/export | 按本次查询参数导出全部命中船期 |
| GET | /v1/vessel-schedules/{scheduleId} | 船期明细 |
| GET | /v1/vessel-schedules/{scheduleId}/review | 读取审核 |
| PUT | /v1/vessel-schedules/{scheduleId}/review | 保存审核 |
| GET | /v1/vessel-schedules/{scheduleId}/terminal-candidates | 码头候选 |
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

`lara_sync_run`、`lara_payload`、`terminal_sync_run`、`terminal_query` 供同步和审核使用，不单独提供查询。`terminal_payload` 同时给出码头航次列表。

GET 没有正文。下面的请求 JSON 是路径参数和查询参数的完整结构，实际放在 URL 上。多选和多行用数组，URL 上重复同一个参数名。POST、PUT、PATCH 的请求 JSON 是正文。错误使用 `application/problem+json`。

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Point code is outside the selected region."
}
```

`400` 是参数或取值不合法、审核没有变化、列表方案重名、隐藏了 `laraVoyage`、或去掉了 `platformMatchingStatus`。`404` 是船期不存在，或方案不属于当前用户。`409` 是港口未覆盖仍要求同步码头、审核没有选择或新建一条码头记录、删除仍被引用的港口或区域、码头代码冲突、删除当前生效或仅剩的方案。

### 查询船期

GET `/v1/vessel-schedules`

读取船期列表。筛选、排序和分页都是查询参数。隐藏筛选项的默认值也由前端放进参数。不带筛选参数时不附加筛选。返回当前页。船期是一层字段。`laraVesselOperator` 来自 LARA 的 `OPERATOR_CODE`。`laraBrand` 由航次末两位算出，MA/NC/PL/NL 对应 CMA/CNC/APL/ANL。`laraVesselType` 由航次数字、`laraBrand`、`laraVesselOperator` 算出，3 为 3PF，9 再分 Group vsl 与 Partner vsl。`laraTerminal` 是 Terminal 9code。这三项由服务端计算，提交了也忽略。`platformCandidateCount` 是当前待选码头记录条数。`platformSharedLaraCount` 是共用同一港口、码头和出口航次的船期条数。`platformLastSyncStatus` 读 `vessel_schedule.platform_last_sync_status`。取值与匹配状态里由同步直接得出的五项相同，另加 Failed。不使用 Manual matched 和 Pending match，这两项是人工确认之后的匹配状态。FOUND 且一条：进出口航次都有、到港时间都有且相差不超过 3 天为 Auto matched，缺航次为 No external voyage，到港时间为空或相差超过 3 天为 ETA gap > 3 days。FOUND 且多条为 Multiple terminal records。NOT_FOUND 为 No terminal record。FAILED 为 Failed。还没有查询时为 null。当前已是人工匹配、这次没有记录时，`platformMatchingStatus` 仍是 Manual matched，这一列是 No terminal record。何时进入 Review 见系统关键逻辑。

| 参数 | 必填 | 含义 |
|---|---|---|
| sort | 否 | 默认 `-laraEtb` |
| page | 否 | 默认 1 |
| pageSize | 否 | 默认 100，最大 500 |

筛选参数用字段名。多选和多行重复同一个参数。子串只出现一次。日期用字段名加 `From` 或 `To`，包含这一天，可只给一端。`platformMatchingStatus`、`platformLastSyncStatus`、`platformLastModifiedBy`、`lastSyncAt` 以及按修改时间的排序，都用 `vessel_schedule` 上已写入的列，先筛选、排序、计数，再分页。

| 参数 | 形态 | 含义 |
|---|---|---|
| platformRegion | 可重复 | 区域代码，精确匹配，区分大小写 |
| platformMatchingStatus | 可重复 | 七个匹配状态 |
| platformLastSyncStatus | 可重复 | Auto matched、Multiple terminal records、ETA gap > 3 days、No external voyage、No terminal record、Failed |
| platformLastModifiedBy | 单个 | 操作人子串，忽略大小写 |
| laraVesselName | 可重复 | 英文船名，精确匹配，忽略大小写 |
| laraVoyage | 可重复 | 航次，精确匹配，忽略大小写 |
| laraPointCode | 可重复 | 港口代码。必须落在所选 Region 内 |
| laraPoolLocation | 单个 | 子串，忽略大小写 |
| laraService | 单个 | 子串，忽略大小写 |
| laraVesselOperator | 单个 | 子串，忽略大小写 |
| laraBrand | 可重复 | 精确匹配 |
| laraVesselType | 可重复 | 精确匹配 |
| laraTerminal | 可重复 | Terminal 9code |
| laraEtaFrom、laraEtaTo、laraEtbFrom、laraEtbTo、laraEtdFrom、laraEtdTo | 单个 | 比较该时刻 |
| terminalVesselNameCn | 可重复 | 精确匹配，忽略大小写 |
| terminalExportVoyage | 可重复 | 精确匹配，忽略大小写 |
| terminalImportVoyage | 可重复 | 精确匹配，忽略大小写 |
| terminalName | 可重复 | 报文 terminal |
| terminalVesselStatus | 可重复 | 计划、在港、离港 |
| terminalEta、terminalAta、terminalEtb、terminalAtb、terminalEtd、terminalAtd、terminalCyOpen、terminalCyCutoff、terminalUpdateTime，各加 From 或 To | 单个 | 比较该时刻 |

请求：

```json
{
  "platformRegion": [
    "NEU"
  ],
  "laraVesselName": [
    "CMA CGM MARCO POLO"
  ],
  "laraService": "FAL",
  "laraEtbFrom": "2026-10-20",
  "laraEtbTo": "2026-11-03",
  "sort": "-laraEtb",
  "page": 1,
  "pageSize": 100
}
```

正常返回 `200`。这一行是 Pending match：响应里带已保存的码头记录，页面把码头格子画成 —。LARA ETB 相对上一版已写入，所以有一项 `pending` 为 false。

```json
{
  "data": [
    {
      "id": "sch-1",
      "platformVoyageStatus": "Active",
      "platformPointCovered": true,
      "platformMatchingStatus": "Pending match",
      "platformLastSyncStatus": "ETA gap > 3 days",
      "platformCandidateCount": 1,
      "platformSharedLaraCount": 1,
      "platformTerminalPending": null,
      "laraVoyage": "0MEG1W",
      "laraPointCode": "FRFOS",
      "laraPoolLocation": "EUROPE",
      "laraVesselName": "CMA CGM MARCO POLO",
      "laraVesselOperator": "CMA",
      "laraBrand": "CMA",
      "laraService": "FAL",
      "laraEta": "2026-10-26T08:00:00+08:00",
      "laraEtb": "2026-10-27T04:00:00+08:00",
      "laraEtd": "2026-10-28T18:00:00+08:00",
      "laraVesselType": "Group vsl",
      "laraTerminal": "FRFOSFOS",
      "terminalManual": false,
      "terminalExportVoyage": "E001",
      "terminalImportVoyage": "I001",
      "terminalVesselNameCn": "",
      "terminalName": "YS01",
      "terminalEta": null,
      "terminalAta": null,
      "terminalEtb": "2026-10-27T02:00:00+08:00",
      "terminalAtb": null,
      "terminalEtd": "2026-10-28T16:00:00+08:00",
      "terminalAtd": null,
      "terminalCyOpen": null,
      "terminalCyCutoff": null,
      "terminalVesselStatus": "计划",
      "terminalUpdateTime": "2026-10-27T01:00:00+08:00",
      "platformLastModifiedBy": "Ann",
      "platformLastModifiedAt": "2026-10-27T02:00:00Z",
      "changes": [
        {
          "field": "laraEtb",
          "previousValue": "2026-10-27T00:00:00+08:00",
          "incomingValue": "2026-10-27T04:00:00+08:00",
          "pending": false
        },
        {
          "field": "terminalEtd",
          "previousValue": "2026-10-28T16:00:00+08:00",
          "incomingValue": "2026-10-30T16:00:00+08:00",
          "pending": true
        }
      ]
    }
  ],
  "page": {
    "number": 1,
    "size": 100,
    "totalElements": 342,
    "totalPages": 4
  }
}
```

`platformMatchingStatus` 为 Multiple terminal records 或 ETA gap > 3 days、没有绑定、或港口未覆盖且不是手工补录时，该行的 terminal 字段为 `null`，`laraTerminal` 在没有 9code 时也为 `null`。没有差异时 `changes` 为 `null`。

### 导出船期

GET `/v1/vessel-schedules/export`

服务端生成 Excel。筛选参数和 sort 与查询船期相同，不带 page、pageSize。数据范围是本次条件命中的全部船期。Pending match 的码头格子在页面上是 —，导出为空字符串。

请求：

```json
{
  "laraEtbFrom": "2026-10-20",
  "laraEtbTo": "2026-11-03",
  "sort": "-laraEtb"
}
```

正常返回 `200`。正文是 Excel，不是 JSON。`Content-Type` 为 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`。`Content-Disposition` 为 `attachment; filename="vessel-schedules.xlsx"`。

工作表一行一条船期。列表上没有值的格子留空。时刻写成 `YYYY-MM-DD HH:mm`。不包含 visit_no。

| 列 | 取值 |
|---|---|
| Mapping status | platformMatchingStatus |
| Last sync status | platformLastSyncStatus |
| Last modified by | platformLastModifiedBy |
| Last modified at | platformLastModifiedAt |
| Voyage | laraVoyage |
| Voyage status | platformVoyageStatus |
| Point code | laraPointCode |
| Pool location | laraPoolLocation |
| Vessel name | laraVesselName |
| Vessel operator | laraVesselOperator |
| Brand | laraBrand |
| Service | laraService |
| LARA ETA | laraEta |
| LARA ETB | laraEtb |
| LARA ETD | laraEtd |
| Vessel type | laraVesselType |
| Terminal 9code | laraTerminal |
| Export voyage | terminalExportVoyage |
| Import voyage | terminalImportVoyage |
| Vessel name CN | terminalVesselNameCn |
| Terminal name | terminalName |
| Terminal ETA | terminalEta |
| Terminal ATA | terminalAta |
| Terminal ETB | terminalEtb |
| Terminal ATB | terminalAtb |
| Terminal ETD | terminalEtd |
| Terminal ATD | terminalAtd |
| CY open | terminalCyOpen |
| CY closing | terminalCyCutoff |
| Terminal status | terminalVesselStatus |
| Update time | terminalUpdateTime |

排序或筛选字段非法返回 `400`。

### 船期明细

GET `/v1/vessel-schedules/{scheduleId}`

在船期行之外增加 sources。未知 id 返回 404。明细不改数据。用户备注在活动日志里，不在船期行上。Pending match 时响应仍带已保存的码头字段，页面码头区全部显示 —，并隐藏字段下的来源行。

请求：

```json
{
  "scheduleId": "sch-1"
}
```

正常返回 `200`：

```json
{
  "id": "sch-1",
  "platformVoyageStatus": "Active",
  "platformPointCovered": true,
  "platformMatchingStatus": "Pending match",
  "platformLastSyncStatus": "ETA gap > 3 days",
  "platformCandidateCount": 1,
  "platformSharedLaraCount": 1,
  "platformTerminalPending": null,
  "laraVoyage": "0MEG1W",
  "laraPointCode": "FRFOS",
  "laraPoolLocation": "EUROPE",
  "laraVesselName": "CMA CGM MARCO POLO",
  "laraVesselOperator": "CMA",
  "laraBrand": "CMA",
  "laraService": "FAL",
  "laraEta": "2026-10-26T08:00:00+08:00",
  "laraEtb": "2026-10-27T04:00:00+08:00",
  "laraEtd": "2026-10-28T18:00:00+08:00",
  "laraVesselType": "Group vsl",
  "laraTerminal": "FRFOSFOS",
  "terminalManual": false,
  "terminalExportVoyage": "E001",
  "terminalImportVoyage": "I001",
  "terminalVesselNameCn": "",
  "terminalName": "YS01",
  "terminalEta": null,
  "terminalAta": null,
  "terminalEtb": "2026-10-27T02:00:00+08:00",
  "terminalAtb": null,
  "terminalEtd": "2026-10-28T16:00:00+08:00",
  "terminalAtd": null,
  "terminalCyOpen": null,
  "terminalCyCutoff": null,
  "terminalVesselStatus": "计划",
  "terminalUpdateTime": "2026-10-27T01:00:00+08:00",
  "platformLastModifiedBy": "Ann",
  "platformLastModifiedAt": "2026-10-27T02:00:00Z",
  "changes": [
    {
      "field": "laraEtb",
      "previousValue": "2026-10-27T00:00:00+08:00",
      "incomingValue": "2026-10-27T04:00:00+08:00",
      "pending": false
    },
    {
      "field": "terminalEtd",
      "previousValue": "2026-10-28T16:00:00+08:00",
      "incomingValue": "2026-10-30T16:00:00+08:00",
      "pending": true
    }
  ],
  "sources": [
    {
      "field": "terminalEtd",
      "value": "2026-10-28T16:00:00+08:00"
    }
  ]
}
```

没有手工来源时 `sources` 为 `null`。`terminalManual` 为 true 时，前端在码头区标题标明手工录入。

### 读取审核

GET `/v1/vessel-schedules/{scheduleId}/review`

返回当前 LARA、已绑定的码头记录和 changes。不返回候选表，也不返回 lastModifiedBy。用户备注不在这个响应里。处理见系统关键逻辑里的 Review。

请求：

```json
{
  "scheduleId": "sch-1"
}
```

正常返回 `200`。下面是多条、已有保存记录的审核。码头 ETD 相对上一版已写入，匹配状态仍待确认。

```json
{
  "id": "sch-1",
  "platformVoyageStatus": "Active",
  "platformPointCovered": true,
  "platformMatchingStatus": "Pending match",
  "platformCandidateCount": 2,
  "platformSharedLaraCount": 1,
  "platformTerminalPending": "many",
  "laraVoyage": "0MEG1W",
  "laraPointCode": "FRFOS",
  "laraPoolLocation": "EUROPE",
  "laraVesselName": "CMA CGM MARCO POLO",
  "laraVesselOperator": "CMA",
  "laraBrand": "CMA",
  "laraService": "FAL",
  "laraEta": "2026-10-26T08:00:00+08:00",
  "laraEtb": "2026-10-27T04:00:00+08:00",
  "laraEtd": "2026-10-28T18:00:00+08:00",
  "laraVesselType": "Group vsl",
  "laraTerminal": "FRFOSFOS",
  "terminalManual": false,
  "terminalExportVoyage": "E001",
  "terminalImportVoyage": "I001",
  "terminalVesselNameCn": "",
  "terminalName": "YS01",
  "terminalEta": null,
  "terminalAta": null,
  "terminalEtb": "2026-10-27T02:00:00+08:00",
  "terminalAtb": null,
  "terminalEtd": "2026-10-28T16:00:00+08:00",
  "terminalAtd": null,
  "terminalCyOpen": null,
  "terminalCyCutoff": null,
  "terminalVesselStatus": "计划",
  "terminalUpdateTime": "2026-10-27T01:00:00+08:00",
  "changes": [
    {
      "field": "terminalEtd",
      "previousValue": "2026-10-28T12:00:00+08:00",
      "incomingValue": "2026-10-28T16:00:00+08:00",
      "pending": false
    }
  ]
}
```

### 保存审核

PUT `/v1/vessel-schedules/{scheduleId}/review`

没有变化返回 400。没有选择或新建一条码头记录时返回 409，不写入。缺航次或 ETA 相差超过 3 天不阻止提交。`platformMatchingStatus` 由服务端写入：同步按匹配规则计算，审核确认绑上一条码头记录时写成 Manual matched。请求不带这个字段，带了也忽略。已有保存的码头记录、请求不带 terminal 字段时，码头列保持不变。新建或改选时带上码头字段。码头字段不能全部为 null。每种成功都写一条活动日志。`terminal_source` 在确认同步记录时仍是 SYNC，只有新建手工记录才是 USER。

| 字段 | 必填 | 含义 |
|---|---|---|
| remark | 是 | 这次的备注，只写入活动日志。可以是空字符串。为空时前端按 changes 生成说明 |
| fields | 是 | 这次要写入的码头字段最终值。页面上的选择在确认前不落库。没出现的字段保持船期上已保存的值。可以是空数组 |
| fields[].field | 是 | 船期字段名。不包括 platformMatchingStatus |
| fields[].value | 是 | 确认后的值。必须是 previousValue 或 incomingValue。laraVesselType、laraTerminal、platformMatchingStatus 提交了也忽略。LARA 字段不在这里选择 |
| candidateId | 否 | 从候选里改选另一条时才带。必须来自这次候选。确认当前记录时不带 |
| terminal 字段 | 否 | 码头字段，不带 terminalManual。和 candidateId 一起出现时，写入这条候选。单独出现时，表示修改当前绑定或新建手工记录。已有码头记录且没有改动时不要带。不能全部为 null |

确认当前绑定，请求：

```json
{
  "remark": "Confirmed with agent",
  "fields": [
    {
      "field": "terminalEtd",
      "value": "2026-10-28T16:00:00+08:00"
    }
  ]
}
```

正常返回 `200`，结构同读取审核：

```json
{
  "id": "sch-1",
  "platformVoyageStatus": "Active",
  "platformPointCovered": true,
  "platformMatchingStatus": "Manual matched",
  "platformCandidateCount": 1,
  "platformSharedLaraCount": 1,
  "platformTerminalPending": null,
  "laraVoyage": "0MEG1W",
  "laraPointCode": "FRFOS",
  "laraPoolLocation": "EUROPE",
  "laraVesselName": "CMA CGM MARCO POLO",
  "laraVesselOperator": "CMA",
  "laraBrand": "CMA",
  "laraService": "FAL",
  "laraEta": "2026-10-26T08:00:00+08:00",
  "laraEtb": "2026-10-27T04:00:00+08:00",
  "laraEtd": "2026-10-28T18:00:00+08:00",
  "laraVesselType": "Group vsl",
  "laraTerminal": "FRFOSFOS",
  "terminalManual": false,
  "terminalExportVoyage": "E001",
  "terminalImportVoyage": "I001",
  "terminalVesselNameCn": "",
  "terminalName": "YS01",
  "terminalEta": null,
  "terminalAta": null,
  "terminalEtb": "2026-10-27T02:00:00+08:00",
  "terminalAtb": null,
  "terminalEtd": "2026-10-28T16:00:00+08:00",
  "terminalAtd": null,
  "terminalCyOpen": null,
  "terminalCyCutoff": null,
  "terminalVesselStatus": "计划",
  "terminalUpdateTime": "2026-10-27T01:00:00+08:00",
  "changes": null
}
```

改选另一条候选时，请求另带 `candidateId` 和覆盖后的码头字段：

```json
{
  "remark": "Use the other call",
  "fields": [],
  "candidateId": "tp-2",
  "terminalExportVoyage": "E009",
  "terminalImportVoyage": "I009",
  "terminalVesselNameCn": "",
  "terminalName": "YS01",
  "terminalEta": null,
  "terminalAta": null,
  "terminalEtb": "2026-10-27T06:00:00+08:00",
  "terminalAtb": null,
  "terminalEtd": "2026-10-28T20:00:00+08:00",
  "terminalAtd": null,
  "terminalCyOpen": null,
  "terminalCyCutoff": null,
  "terminalVesselStatus": "计划",
  "terminalUpdateTime": "2026-10-27T01:00:00+08:00"
}
```

### 码头候选

GET `/v1/vessel-schedules/{scheduleId}/terminal-candidates`

打开选择框时读取。没有候选时 data 为空数组。id 是 `terminal_payload.id`。点一行选中并高亮。已有当前记录时，再点这一行仍是当前记录，不会把表单清空。首次尚未绑定、没有当前记录时，选择框可以先不选。多条码头记录时确认前必须选中一条，不能新建。没有码头记录时必须新建一条。

请求：

```json
{
  "scheduleId": "sch-1"
}
```

正常返回 `200`：

```json
{
  "data": [
    {
      "id": "tp-1",
      "current": true,
      "terminalExportVoyage": "E001",
      "terminalImportVoyage": "I001",
      "terminalVesselNameCn": "",
      "terminalName": "YS01",
      "terminalEta": null,
      "terminalAta": null,
      "terminalEtb": "2026-10-27T02:00:00+08:00",
      "terminalAtb": null,
      "terminalEtd": "2026-10-28T16:00:00+08:00",
      "terminalAtd": null,
      "terminalCyOpen": null,
      "terminalCyCutoff": null,
      "terminalVesselStatus": "计划",
      "terminalUpdateTime": null
    },
    {
      "id": "tp-2",
      "current": false,
      "terminalExportVoyage": "E009",
      "terminalImportVoyage": "I009",
      "terminalVesselNameCn": "",
      "terminalName": "YS01",
      "terminalEta": null,
      "terminalAta": null,
      "terminalEtb": "2026-10-27T06:00:00+08:00",
      "terminalAtb": null,
      "terminalEtd": "2026-10-28T20:00:00+08:00",
      "terminalAtd": null,
      "terminalCyOpen": null,
      "terminalCyCutoff": null,
      "terminalVesselStatus": "计划",
      "terminalUpdateTime": null
    }
  ]
}
```

`current` 为 true 表示这条就是现在用于比对或绑定的记录。其余字段与船期上的码头字段相同，没有 `terminalManual`。选中后留在页面上，跟保存审核一起提交。

### 单笔同步 LARA

POST `/v1/vessel-schedules/{scheduleId}/lara-sync`

审核页的 Sync latest。页面先丢掉未保存编辑再发起。没有请求正文。成功后返回审核，不返回运行记录。失败不写 payload。

请求：无正文。

正常返回 `200`，结构同读取审核。LARA 字段是这次成功同步的最新值。

### 单笔同步码头

POST `/v1/vessel-schedules/{scheduleId}/terminal-sync`

用船期上当时的英文船名和 Point code 查询，对应报文 vesselNameEn 和 portCode。港口未覆盖返回 409。不写 `terminal_sync_run`。没有请求正文。成功后返回审核。

请求：无正文。

正常返回 `200`，结构同读取审核。

### 活动日志

GET `/v1/vessel-schedules/{scheduleId}/activity-logs`

一次保存或一次自动落库一条。changes 是这一次真正写下的原值和新值。未知船期返回 404。

| 参数 | 必填 | 含义 |
|---|---|---|
| field | 否 | 字段名子串，忽略大小写。从某一列进入时传属性名 |
| triggeredBy | 否 | 操作人子串，忽略大小写 |
| from | 否 | 日期，包含这一天 |
| to | 否 | 日期，包含这一天 |
| sort | 否 | 默认 `-triggeredAt`。还可以排 triggeredBy、remark |
| page | 否 | 默认 1 |
| pageSize | 否 | 默认 100，最大 500 |

请求：

```json
{
  "scheduleId": "sch-1",
  "field": "etd",
  "triggeredBy": "Ann",
  "from": "2026-10-01",
  "to": "2026-10-31",
  "sort": "-triggeredAt",
  "page": 1,
  "pageSize": 100
}
```

正常返回 `200`。`schedule` 只给标题用。

```json
{
  "schedule": {
    "id": "sch-1",
    "laraVesselName": "CMA CGM MARCO POLO",
    "laraPointCode": "FRFOS",
    "laraVoyage": "0MEG1W"
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
          "field": "terminalEtd",
          "original": "2026-10-28T16:00:00+08:00",
          "updated": "2026-10-30T16:00:00+08:00"
        },
        {
          "field": "platformMatchingStatus",
          "original": "Pending match",
          "updated": "Manual matched"
        }
      ]
    }
  ],
  "page": {
    "number": 1,
    "size": 100,
    "totalElements": 1,
    "totalPages": 1
  }
}
```

系统写入的 `remark` 已是事件说明，前端直接显示。用户 `remark` 为空时，前端按 changes 的 field 和 match 生成说明。`match` 为空表示绑定未变。

### 列表方案

每个登录用户一套方案。只能读写自己的。用户还没有任何方案时，第一次查询会建一份名为 Default 的方案并设为生效。船期搜索不读这些表。页面用生效方案生成筛选默认值和列，相对日期先折成绝对日期，再放进当次查询参数。

`field` 用船期字段名。页面把 Vessel operator 画在码头区，保存时仍是 `laraVesselOperator`。`laraVoyage` 不能隐藏。`platformMatchingStatus` 必须留在 `watched` 里。

默认方案：可见筛选项为 `platformRegion`、`laraPointCode`、`laraVesselName`、`laraVoyage`、`laraService`、`platformMatchingStatus`、`laraEtb`。`laraEtb` 的默认是 relative，`fromDays` 7、`toDays` 7。排序是 `laraEtb` 降序。`watched` 为 `laraEtb`、`laraEtd`、`terminalEtb`、`terminalEtd`、`terminalAtb`、`terminalAtd`、`terminalExportVoyage`、`terminalImportVoyage`，以及 `platformMatchingStatus`。日期的 `dayThreshold` 为 0。

方案字段：

| 字段 | 含义 | 示例 |
|---|---|---|
| id | 方案 id | ls-1 |
| name | 名称 | Default |
| active | 是否为当前生效方案 | true |
| position | 列表中的顺序，从 0 起 | 0 |
| freeze | 左冻结截止列。不冻结时为 null。值为字段名 | laraEtb |
| filters | 筛选项，顺序即 position | 见下 |
| columns | 列表列，顺序即 position | 见下 |
| sort | 方案自带的默认排序 | 见下 |
| watched | 该用户要看到的已写入差异 | 见下 |

筛选项 `filters[]`：`field`、`visible`。不是日期时不带 `dateMode`。子串用 `value`。多选或多行用 `values`。fixed 用 `from`、`to`。relative 用 `fromDays`、`toDays`，不限制的一端省略。

列 `columns[]`：`field`、`hidden`。

排序 `sort[]`：`field`、`descending`。

高亮 `watched[]`：`field`。日期列带 `dayThreshold`，0 表示只要不同就算。非日期不带。

#### 查询列表方案

GET `/v1/list-settings`

请求：无查询参数，无正文。

正常返回 `200`。`filters`、`columns`、`watched` 在真实响应里是该方案的全部项。下面按默认方案列出可见筛选项、默认排序和默认关注项，并列出自这几列。

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
        {
          "field": "platformRegion",
          "visible": true
        },
        {
          "field": "laraPointCode",
          "visible": true
        },
        {
          "field": "laraVesselName",
          "visible": true
        },
        {
          "field": "laraVoyage",
          "visible": true
        },
        {
          "field": "laraService",
          "visible": true
        },
        {
          "field": "platformMatchingStatus",
          "visible": true
        },
        {
          "field": "laraEtb",
          "visible": true,
          "dateMode": "relative",
          "fromDays": 7,
          "toDays": 7
        }
      ],
      "columns": [
        {
          "field": "laraVoyage",
          "hidden": false
        },
        {
          "field": "laraEtb",
          "hidden": false
        },
        {
          "field": "terminalExportVoyage",
          "hidden": false
        },
        {
          "field": "platformMatchingStatus",
          "hidden": false
        }
      ],
      "sort": [
        {
          "field": "laraEtb",
          "descending": true
        }
      ],
      "watched": [
        {
          "field": "laraEtb",
          "dayThreshold": 0
        },
        {
          "field": "laraEtd",
          "dayThreshold": 0
        },
        {
          "field": "terminalEtb",
          "dayThreshold": 0
        },
        {
          "field": "terminalEtd",
          "dayThreshold": 0
        },
        {
          "field": "terminalAtb",
          "dayThreshold": 0
        },
        {
          "field": "terminalAtd",
          "dayThreshold": 0
        },
        {
          "field": "terminalExportVoyage"
        },
        {
          "field": "terminalImportVoyage"
        },
        {
          "field": "platformMatchingStatus"
        }
      ]
    }
  ]
}
```

#### 读取一份方案

GET `/v1/list-settings/{settingId}`

请求：

```json
{
  "settingId": "ls-1"
}
```

正常返回 `200`，对象与查询结果 `data` 里的同一条相同。不是自己的方案返回 404。

#### 新建方案

POST `/v1/list-settings`

按默认方案生成，`active` 为 false。

请求：

```json
{
  "name": "Asia"
}
```

正常返回 `201`，结构同读取一份方案，`name` 为 `Asia`，`active` 为 false。

#### 复制方案

POST `/v1/list-settings/{settingId}/duplicate`

复制筛选项、列、排序和关注项，`active` 为 false。

请求：

```json
{
  "name": "Asia copy"
}
```

正常返回 `201`，结构同读取一份方案。

#### 改名

PATCH `/v1/list-settings/{settingId}`

名称为空，或和自己的另一份重名，返回 400。

请求：

```json
{
  "name": "Asia peak"
}
```

正常返回 `200`，结构同读取一份方案，`name` 为 `Asia peak`。

#### 设为当前生效

POST `/v1/list-settings/{settingId}/activate`

请求：无正文。

正常返回 `200`，结构同读取一份方案，`active` 为 true。原先生效的那份改为 false。

#### 删除方案

DELETE `/v1/list-settings/{settingId}`

请求：无正文。

正常返回 `204`，无正文。删的是当前生效方案，或只剩这一份时，返回 409。

#### 保存方案

PUT `/v1/list-settings/{settingId}`

替换这份方案的名称、冻结、筛选项、列、排序和关注项。不改变 active。未知字段返回 400。`laraVoyage` 被标成隐藏，或 `watched` 里没有 `platformMatchingStatus`，返回 400。请求体不带 `id` 和 `active`。真实请求带上该方案的全部筛选项和列。

请求：

```json
{
  "name": "Default",
  "position": 0,
  "freeze": "laraEtb",
  "filters": [
    {
      "field": "platformRegion",
      "visible": true
    },
    {
      "field": "laraPointCode",
      "visible": true
    },
    {
      "field": "laraVesselName",
      "visible": true
    },
    {
      "field": "laraVoyage",
      "visible": true
    },
    {
      "field": "laraService",
      "visible": true
    },
    {
      "field": "platformMatchingStatus",
      "visible": true
    },
    {
      "field": "laraEtb",
      "visible": true,
      "dateMode": "relative",
      "fromDays": 7,
      "toDays": 7
    }
  ],
  "columns": [
    {
      "field": "laraVoyage",
      "hidden": false
    },
    {
      "field": "laraEtb",
      "hidden": false
    },
    {
      "field": "terminalExportVoyage",
      "hidden": false
    },
    {
      "field": "platformMatchingStatus",
      "hidden": false
    }
  ],
  "sort": [
    {
      "field": "laraEtb",
      "descending": true
    }
  ],
  "watched": [
    {
      "field": "laraEtb",
      "dayThreshold": 0
    },
    {
      "field": "laraEtd",
      "dayThreshold": 0
    },
    {
      "field": "terminalEtb",
      "dayThreshold": 0
    },
    {
      "field": "terminalEtd",
      "dayThreshold": 0
    },
    {
      "field": "terminalAtb",
      "dayThreshold": 0
    },
    {
      "field": "terminalAtd",
      "dayThreshold": 0
    },
    {
      "field": "terminalExportVoyage"
    },
    {
      "field": "terminalImportVoyage"
    },
    {
      "field": "platformMatchingStatus"
    }
  ]
}
```

正常返回 `200`，在请求体上增加 `id` 和 `active`，结构同读取一份方案。`freeze` 为请求中的 `"laraEtb"`。

### 码头航次

读 `terminal_payload`，不现场调用码头接口。一条船期最近一次成功查询为 FOUND 时，这次的候选进入列表。NOT_FOUND 时该船期没有候选。FAILED 时列表里仍是上一次成功查询的候选。`portCode` 取 `terminal_query.port_code`，只出现在筛选里，不在行上。region 从 `port` 连接。同一 `port_code`、`vessel_name_en`、`evoyage`、`ivoyage` 只返回一行，`id` 是其中一条 `terminal_payload.id`。时刻保留报文原文，例如 `2025-06-13 17:00:00`。值为 null 的字段仍然返回。

#### 查询码头航次

GET `/v1/terminal-voyages`

筛选、排序和分页都是查询参数。不带筛选参数时不附加筛选。已选 region 时，portCode 只能落在这些区域下。sort 默认 `-eta`，可叠多个字段，例如 `-eta,atd`。

| 参数 | 必填 | 含义 |
|---|---|---|
| sort | 否 | 默认 `-eta` |
| page | 否 | 默认 1 |
| pageSize | 否 | 默认 100，最大 500 |
| vesselName | 可重复 | 精确匹配，忽略大小写，匹配 vesselNameEn 或 vesselNameCn |
| voyage | 可重复 | 精确匹配，忽略大小写，匹配 evoyage 或 ivoyage |
| region | 可重复 | 区域代码 |
| portCode | 可重复 | 同步时使用的港口代码 |
| status | 可重复 | 报文 status |
| etaFrom、etaTo、ataFrom、ataTo、etbFrom、etbTo、atbFrom、atbTo、etdFrom、etdTo、atdFrom、atdTo | 单个 | 日期，包含这一天，可只给一端 |

请求：

```json
{
  "vesselName": [
    "EVER LADEN"
  ],
  "voyage": [
    "1173069E"
  ],
  "region": [
    "CC"
  ],
  "portCode": [
    "CNNGB"
  ],
  "status": [
    "计划"
  ],
  "etaFrom": "2025-06-01",
  "etaTo": "2025-06-30",
  "sort": "-eta",
  "page": 1,
  "pageSize": 100
}
```

正常返回 `200`：

```json
{
  "data": [
    {
      "id": "tp-1",
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
  "page": {
    "number": 1,
    "size": 100,
    "totalElements": 1,
    "totalPages": 1
  }
}
```

#### 一条码头航次

GET `/v1/terminal-voyages/{voyageId}`

请求：

```json
{
  "voyageId": "tp-1"
}
```

正常返回 `200`，对象与列表 `data` 里的同一条相同。未知 id 返回 404。

### 区域

`active` 为 false 时，新建港口不能再选它，已经挂上的港口仍保留原代码。已被港口使用的区域不能删除，返回 409。

| 字段 | 含义 | 示例 |
|---|---|---|
| code | 区域代码，主键 | CC |
| name | 名称。页面可显示成 code (name) | China domestic |
| active | true 可选。false 停用 | true |

#### 查询区域

GET `/v1/regions`

请求：无查询参数，无正文。

正常返回 `200`：

```json
{
  "data": [
    {
      "code": "CC",
      "name": "China domestic",
      "active": true
    }
  ]
}
```

#### 保存区域

PUT `/v1/regions/{code}`

已存在则 200，否则 201。路径与正文的 code 必须一致。

请求：

```json
{
  "code": "CC",
  "name": "China domestic",
  "active": true
}
```

正常返回：与请求相同的对象。新建为 `201`，更新为 `200`。

#### 停用或启用区域

PATCH `/v1/regions/{code}`

请求：

```json
{
  "active": false
}
```

正常返回 `200`：

```json
{
  "code": "CC",
  "name": "China domestic",
  "active": false
}
```

#### 删除区域

DELETE `/v1/regions/{code}`

请求：无正文。

正常返回 `204`，无正文。仍被港口使用返回 409。

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

#### 查询港口

GET `/v1/ports`

请求：

```json
{
  "portCode": "CNNGB",
  "portName": "NING",
  "region": [
    "CC"
  ],
  "coverage": "covered"
}
```

正常返回 `200`：

```json
{
  "data": [
    {
      "portCode": "CNNGB",
      "portName": "NINGBO",
      "regionCode": "CC",
      "active": true,
      "apiCovered": true,
      "terminals": [
        {
          "nineCode": "CNNGBYAN",
          "code": "YS01",
          "nameZh": "大榭招商"
        },
        {
          "nineCode": "CNNGBYAN",
          "code": "YAN1",
          "nameZh": "大榭招商"
        }
      ]
    }
  ]
}
```

#### 保存港口

PUT `/v1/ports/{portCode}`

已存在则 200，否则 201。`terminals` 整组替换。正文不带 `active`，已有港口保持原来的 active。代码或 9 位码和其他港口冲突返回 409。region 已停用返回 400。

请求：

```json
{
  "portCode": "CNNGB",
  "portName": "NINGBO",
  "regionCode": "CC",
  "apiCovered": true,
  "terminals": [
    {
      "nineCode": "CNNGBYAN",
      "code": "YS01",
      "nameZh": "大榭招商"
    },
    {
      "nineCode": "CNNGBYAN",
      "code": "YAN1",
      "nameZh": "大榭招商"
    }
  ]
}
```

正常返回：在请求上增加 `active`。新建为 `201`，更新为 `200`。

```json
{
  "portCode": "CNNGB",
  "portName": "NINGBO",
  "regionCode": "CC",
  "active": true,
  "apiCovered": true,
  "terminals": [
    {
      "nineCode": "CNNGBYAN",
      "code": "YS01",
      "nameZh": "大榭招商"
    },
    {
      "nineCode": "CNNGBYAN",
      "code": "YAN1",
      "nameZh": "大榭招商"
    }
  ]
}
```

#### 停用或启用港口

PATCH `/v1/ports/{portCode}`

请求：

```json
{
  "active": false
}
```

正常返回 `200`，结构同查询结果里的一条，`active` 为 false。

#### 删除港口

DELETE `/v1/ports/{portCode}`

请求：无正文。

正常返回 `204`，无正文。已被船期引用返回 409。
