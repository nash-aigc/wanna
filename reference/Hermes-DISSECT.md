# Hermes 100% 拆解

日期：2026-10-01
源码：`/Users/mjm/Documents/SuperAgent/Wanna/reference/Hermes/`（Nous Research，MIT，本地完整 clone）
证据约定：所有机制均带 `文件路径:行号`；文档性结论（README 宣称）标注来源行号；我自己的推断一律写「推断」。

---

## 目录

1. [架构总览](#1-架构总览)
2. [群聊 Bot](#2-群聊-bot)
3. [任务看板（插件）](#3-任务看板插件)
4. [多渠道通讯](#4-多渠道通讯)
5. [多网关连接（Gateways）](#5-多网关连接gateways)
6. [快捷输入](#6-快捷输入)
7. [多角色隔离（Profiles）](#7-多角色隔离profiles)
8. [记忆设计（Memory）](#8-记忆设计memory)
9. [多提供商（Providers）](#9-多提供商providers)
10. [Archived Chats](#10-archived-chats)
11. [Gateways / Providers 完整配置 Schema](#11-gateways--providers-完整配置-schema)
12. [README 宣称 ↔ 代码实现对照](#12-readme-宣称--代码实现对照)
13. [可移植清单（供 HTML 原型分批还原）](#13-可移植清单供-html-原型分批还原)

---

## 1. 架构总览

### 1.1 一句话定位

Hermes 是一个**同一个 AIAgent 内核跑在多种外壳上**的个人 AI 代理：CLI/TUI、消息网关（25+ 平台）、Electron 桌面、Web dashboard、ACP（编辑器）、批处理。两条设计不变量：**会话级 prompt 缓存神圣不可破坏**、**内核是细腰、能力长在边缘**（根 `AGENTS.md` "What Hermes Is" 节，`AGENTS.md:10-24`）。

系统总图与数据流的权威描述在 `website/docs/developer-guide/architecture.md:11`（System Overview 图）、`:51`（Directory Structure）、`:138`（Data Flow 三条链：CLI / Gateway / Cron）、`:190`（Major Subsystems）、`:256`（Design Principles）、`:267`（文件依赖链）。

### 1.2 目录树 → 每个目录/关键文件的职责

以仓库根为基准（行数为实测 `wc -l`）：

| 目录/文件 | 行数/规模 | 职责 | 证据 |
|---|---|---|---|
| `run_agent.py` | 1582 | **AIAgent 门面**；真正的回合循环在 `agent/conversation_loop.py` + `agent/turn_*.py`（约 30 个同名兄弟文件） | `run_agent.py:241` `class AIAgent`；`agent/conversation_loop.py:1695` `run_conversation`；`AGENTS.md` Project Structure |
| `model_tools.py` | 993 | 工具编排：`discover_builtin_tools()` 发现、`handle_function_call()` 分发；插件 hook 的调用点之一 | `AGENTS.md` Dependency chain；`plugins/AGENTS.md:63-66` |
| `toolsets.py` | 492 | `TOOLSETS` 字典 + `_HERMES_CORE_TOOLS`（每个平台基座继承的默认工具包） | `toolsets.py:12` `_HERMES_CORE_TOOLS`；`toolsets.py:77` `TOOLSETS` |
| `cli.py` | 1799 | `HermesCLI` REPL 门面（16 个 `hermes_cli/cli_*_mixin.py` 混入）+ 斜杠命令分发表 | `cli.py:887` `class HermesCLI`；`cli.py:1159` `_SLASH_DISPATCH`；`cli.py:1668` `main` |
| `hermes_state.py` + `hermes_state_*.py`（30 个） | 门面 1685 | SQLite 会话/消息/状态库门面 + 主题兄弟（schema、fts、search、sessions、gateway、compression、wal…） | `hermes_state.py:451` `class SessionDB`；`hermes_state_common.py:366` `SCHEMA_SQL` |
| `hermes_constants.py` | ~2000+ | `get_hermes_home()` / `display_hermes_home()` — **profile 感知的路径解析，全仓唯一真相**；禁止硬编码 `~/.hermes` | `hermes_constants.py:111`、`:578`；`AGENTS.md` "Never hardcode ~/.hermes" |
| `hermes_logging.py` | — | profile 感知的 `agent.log / errors.log / gateway.log` | `AGENTS.md` Project Structure |
| `batch_runner.py` | ~48k 字节 | 并行批量轨迹生成（研究用途） | `AGENTS.md` 顶部结构表 |
| `cli.py` 入口链 | — | `hermes` 启动器 → `hermes_bootstrap.py`（26k 字节，PM 环境激活、UTF-8 stdio）→ argparse 子命令 | `hermes:1-6`；`hermes_bootstrap.py:7` |
| `hermes_cli/`（481 项） | — | 子命令、setup 向导、config 系统、插件加载器、skins、更新器、profiles、kanban、web server | `hermes_cli/AGENTS.md` |
| `hermes_cli/web_routers/` | 24 个 router | Dashboard FastAPI 路由，一个界面一个文件，由 `web_server.py` 挂载 | `web/AGENTS.md:3-5` |
| `agent/`（250 个 .py） | — | 回合循环各阶段（`turn_*.py`）、providers、memory、compression、prompt builder、skills、curator | `agent/AGENTS.md`；`architecture.md:63`（目录行）、`:192-212`（子系统） |
| `tools/`（267 个 .py） | — | 70+ 工具实现，**导入即自注册**到 `tools/registry.py`；`tools/environments/` 是 7 种终端后端 | `tools/AGENTS.md:7-14`；`tools/terminal_tool_backends.py:54` |
| `gateway/`（`run.py` 6154 行 + 25 个 `run_*.py`） | — | 消息网关门面 + 主题兄弟（startup/inbound/turn/busy/notifications/shutdown）、`session*.py` 会话、`platforms/` 内置适配器、`builtin_hooks/` | `gateway/AGENTS.md:6-18` |
| `gateway/platforms/`（34 项） | — | **内置**适配器：`signal` `weixin` `bluebubbles` `qqbot` `whatsapp_cloud` `yuanbao` `webhook` `api_server` `msgraph_webhook` `tcp_site` + `base.py` 基类 | `architecture.md:120-121`；目录实测 |
| `plugins/platforms/`（22 目录） | — | **插件化**适配器：`telegram` `discord` `slack` `whatsapp` `matrix` `mattermost` `email` `sms` `dingtalk` `feishu` `wecom` `homeassistant` `irc` `line` `teams` `google_chat` `buzz` `ntfy` `photon` `raft` `simplex` `a2a` | `architecture.md:123-127`；目录实测 |
| `plugins/`（其它） | — | `memory/`（7 个记忆提供方）、`model-providers/`（39 个）、`context_engine/`、`image_gen/`、`kanban/`（看板 dashboard 插件）、`cron_providers/`、`browser/`、`web/`… | `plugins/AGENTS.md:53-62` 插件种类表 |
| `plugin-catalog/`（352 项） | — | 树外插件唯一发现系统（每个 YAML 钉 40 位 SHA） | `plugins/AGENTS.md:35-51` |
| `skills/`（14 类）+ `optional-skills/`（24 类） | — | 内置技能（默认可载）+ 可选技能（`hermes skills install` 才装）；`SKILL.md` frontmatter 规范 | `skills/AGENTS.md:16-51`（frontmatter + HARDLINE 标准） |
| `cron/`（36 项） | — | `jobs.py`（jobs.json 存储）+ `scheduler.py`（tick 循环）+ `scheduler_*.py` | `cron/AGENTS.md:8-15` |
| `acp_adapter/` | — | ACP server（VS Code / Zed / JetBrains，stdio JSON-RPC） | `architecture.md:128` |
| `tui_gateway/`（85 项） | — | TUI/桌面/dashboard 共用的 **Python JSON-RPC 后端**；`server.py` 门面 + `methods_*.py` | `tui_gateway/AGENTS.md:7-32` |
| `ui-tui/` | — | Ink（React）终端 UI，`hermes --tui` | `tui_gateway/AGENTS.md:9-14` |
| `apps/desktop/` | — | Electron 桌面 App（`electron/main.ts` ~18k 行 + `src/` React）；`apps/shared/` 是共用 JSON-RPC 客户端 | `apps/desktop/AGENTS.md:12` |
| `web/` | — | Dashboard SPA（嵌真实 TUI 的 PTY，不重写聊天界面） | `web/AGENTS.md:7-24` |
| `evals/`（71 项） | — | 离线基准：compaction、gateway、memory、providers、delegation… | 目录实测 |
| `tests/`（103 项） | ~39k 测试 | pytest 套件，必须用 `scripts/run_tests.sh` 跑 | `AGENTS.md` Testing |
| `website/` | — | Docusaurus 文档（本报告大量引用其 developer-guide） | `architecture.md:134` |
| `docker/` `Dockerfile` `docker-compose.yml` | — | 容器部署（s6-overlay 多 profile 网关） | `Dockerfile:1` 起 |
| `cli-config.yaml.example` | 123982 字节 | **全量配置样例**（`_config_version: 49`），第 11 章的 schema 来源 | `cli-config.yaml.example:10` |
| `.env.example` | 26k 字节 | 全量环境变量样例（**只放密钥**，行为设置一律进 config.yaml） | `.env.example:374-420` 渠道段（Slack→Telegram→WhatsApp→Email→全局开关） |
| `hermes_state_*.py` 顶层 30 个 | — | 会话库按主题拆分的兄弟文件（facade 模式） | `AGENTS.md` Facade + siblings |
| `model_tools.py` / `toolsets.py` / `registration_lifecycle.py` / `trajectory_compressor.py` | — | 工具编排 / 工具组 / 注册生命周期 / 轨迹压缩 | 顶部结构 |

### 1.3 启动 / 主循环

**CLI 路径**：`hermes`（shell 包装）→ `hermes_bootstrap.py`（环境激活）→ `hermes_cli/main.py` argparse → `cli.py:1668 main()` → `HermesCLI` REPL → 每轮 `AIAgent.run_conversation()`（`agent/conversation_loop.py:1695`）：

```
User input → HermesCLI.process_input()
  → AIAgent.run_conversation()
    → prompt_builder.build_system_prompt()
    → runtime_provider.resolve_runtime_provider()
    → API call（chat_completions / codex_responses / anthropic_messages 三选一）
    → 有 tool_calls → model_tools.handle_function_call() → 继续循环
    → 最终回复 → 显示 → SessionDB 落盘
```
证据：`website/docs/developer-guide/architecture.md:140-150`（CLI Session 数据流原文）。

**网关路径**：`hermes gateway start` → `hermes_cli/gateway.py:4639` 导入 `gateway.run.start_gateway` → `hermes_cli/gateway.py:4671` `asyncio.run(start_gateway(...))` → `gateway/run.py:5818 async def start_gateway()` → `GatewayRunner`（`run.py` 门面 + `run_startup.py` / `run_inbound.py` / `run_turn.py` 等 MRO 混入）。单条消息的链：

```
平台事件 → adapter.handle_message()（gateway/platforms/base.py:3987）
  → GatewayRunner._handle_message()（gateway/run_inbound.py:1312）
    → _hm_admit_event()（run_inbound.py:205，身份 canonicalize → 忽略频道 → 授权 → bot 环路守卫）
    → 授权判定 _is_user_authorized()（gateway/authz_mixin.py:614）
    → build_session_key()（gateway/session.py:682）解析会话
    → TurnRunner（gateway/run_turn_runner.py:80）→ _handle_message_with_agent()（run_turn.py:2142）
    → AIAgent 回合 → adapter.send()（base.py:2684）回投平台
```
数据流原文：`architecture.md:152-162`。

**Cron 路径**：scheduler tick → 从 `~/.hermes/cron/jobs.json` 取到期 job → 起新 AIAgent（无历史）→ 注入技能 → 跑 prompt → 投递目标平台 → 更新状态。原文 `architecture.md:164-175`；不变量清单 `cron/AGENTS.md:17-44`（tick 锁、at-most-once、跨 profile scope 绑定等）。

**TUI/桌面路径**：`hermes --tui` → Node(Ink) ──stdio JSON-RPC── Python `tui_gateway` → 同一个 AIAgent；桌面经 WebSocket 连同一后端（`apps/shared` 的 `JsonRpcGatewayClient`）。进程模型与传输协议原文：`tui_gateway/AGENTS.md:7-32`。

### 1.4 配置加载链

三层，且**CLI 与网关用的是两条不同 loader**（这是官方点名的坑）：

1. **默认值**：`hermes_cli/config_defaults.py` 的 `DEFAULT_CONFIG`（被 `hermes_cli/config.py:592` 导入）。
2. **用户配置**：`hermes_cli/config.py:2123 load_config()` = `DEFAULT_CONFIG` 深合并 + `config.yaml` + managed scope + 环境变量展开。保存时把与默认值相同的键剥掉（`save_config`，`config.py:2509`）。
3. **网关**：**读用户 YAML 原文**，不走 `DEFAULT_CONFIG` —— `gateway/config_loader.py:379 read_yaml_layers()`（legacy `gateway.json` 打底 → config.yaml 覆盖 → 顶层键/`gateway.<key>` 嵌套桥接）→ `gateway/config.py:840 load_gateway_config()` → `GatewayConfig.from_dict()`。**"CLI 看得见而网关看不见的键 = 你用错了 loader"**（`gateway/AGENTS.md:12-14`）。
4. **密钥**：`~/.hermes/.env`（只放密钥；`AGENTS.md` 明令非密钥行为设置不许进 `.env`）。profile 隔离层是 `agent/secret_scope.get_secret()`，multiplex 模式下**失败关闭**（`gateway/AGENTS.md:185-201`）。

配置键样例与注释的完整清单即 `cli-config.yaml.example`（`model:` 在 `:72`、`kanban:` 在 `:402`、`cron:` 在 `:418`、`memory:` 在 `:1003`、`gateway:` 在 `:1349`、`platform_toolsets:` 在 `:1411`）。

---

## 2. 群聊 Bot

Hermes 里有**两套"群聊"**，别混：

- **A. 平台群聊**（Telegram 群、Discord 频道…）：消息进已存在的平台群，授权由 group policy 决定。
- **B. Bot Mode 群聊（hosted room）**：用户在桌面端新建的"几个 Bot 互相讨论"的房间，**Hermes 自己持久化房间与事件日志**。用户问的"群聊创建/成员添加/bot 领任务"主要指这套。

### 2.1 群聊如何创建（B 套：hosted room）

- **数据层**：`gateway/hosted_rooms.py:857 create_room(db_path, *, room_id, name, members, authority_gateway_id)` —— 幂等创建；房间行含 `members_json`（`hosted_rooms.py:91` 建表列）；活跃房上限 `MAX_ACTIVE_ROOMS = 256`、成员上限 `MAX_MEMBERS = 128`（`hosted_rooms.py:30`）。
- **成员校验**：`gateway/hosted_room_discussion.py:253 validate_roster()` —— **2~6 个成员**（`hosted_room_discussion.py:25-26` `MAX_DISCUSSION_MEMBERS = 6` / `MIN_DISCUSSION_MEMBERS = 2`）。
- **RPC 入口**：`tui_gateway/methods_groups.py:358` `groups.create` → `tui_gateway/hosted_room_service.py:440 create_room()`（先 `validate_roster`，再调数据层，再 `runtime.wakeup()` 启动驱动）。完整方法线序表在 `methods_groups.py:19-22`：`groups.capabilities / list / create / state / send / rename / log / disband / replicate / replica_state / promote / demote / stop / retry / approve / peer.*`。
- **UI 入口**：桌面「New Group Chat」选择器（`apps/desktop/src/plugins/hermes-bots/group-chat-view-members.tsx:134` 注释：the New Group Chat picker）；房间持久化与跨端镜像在 `group-chat.ts:49` `GROUP_CHAT_SYNC_META_KEY = 'hermes-bots-groups'`（写入默认 profile 的 `ui_meta`，48000 字节上限、16 条消息、1200 字/条 —— `group-chat.ts:50-57`）。
- **房间生命周期事件**：`room.created / room.renamed / room.members_changed / room.disbanded / authority.claimed / authority.lost` 是控制事件种类（`gateway/hosted_rooms.py:56`）；追加事件走 `gateway/hosted_rooms.py:942 append_event()`（幂等：同 `event_id` 同内容返回原事件、异内容 fail closed）。
- **产品语义**（文档）：房间跟随网关不跟随某台桌面；跨机房间靠 Desktop relay；权威网关可 `groups.promote/demote` 切换（`website/docs/user-guide/bot-mode.md:158-163`、`:286-349`）。

### 2.2 消息如何路由到 bot

**平台群聊（A 套）**：

1. 适配器把平台事件归一成 `MessageEvent`（`gateway/platforms/event.py:36`），携带 `SessionSource`（`gateway/session.py:66`：platform/chat_id/chat_type/thread_id/user_id…）。
2. **身份先 canonicalize**：每个入站事件先经 `resolve_identity()`（`gateway/session_identity.py:191`）钉一个 `RoutingIdentity`（`:42`），适配器侧 `_canonicalize`（`gateway/platforms/base.py:2403`）与 runner 侧各入站路径都过这道缝 —— multiplex 下解析不出的直接丢弃（`gateway/AGENTS.md:136-151`）。
3. **入站闸门** `_hm_admit_event()`（`gateway/run_inbound.py:205`）：重置会话上下文变量 → 忽略频道 → `pre_gateway_dispatch` 插件 hook → **授权** → bot 环路守卫。
4. **授权** `_is_user_authorized()`（`gateway/authz_mixin.py:614`）顺序：受信上游委托 → 群聊范围 allowlist → `{PLATFORM}_ALLOW_BOTS` → 平台 allow-all → 适配器角色授权（如 Discord roles）→ pairing store → env allowlist（`GATEWAY_ALLOWED_USERS` 等）→ 默认拒绝。未授权 DM 的行为可配 `pair / ignore / decline`（`:697`）。群聊判据 `is_group = source.chat_type in _GROUP_CHAT_TYPES`（`:636`）。
5. **会话键** `build_session_key()`（`gateway/session.py:682`）：布局 `<ns>:<platform>:<chat_type>[:scope_id][:chat_id][:thread_id][:user]`；**`group_sessions_per_user` 默认 true**（`cli-config.yaml.example:1037`）—— 群里每个参与者一个独立会话；false 才是"一个房间一个大脑"。这直接决定"消息进哪个 bot 的哪段记忆"。
6. **profile 路由**（同一 bot 凭据分给多个 profile / 同平台不同 chat 给不同 profile）：`gateway/profile_routing.py:56 ProfileRoute`（字段 name/platform/profile/guild_id/chat_id/thread_id/enabled/bot_profile/user_id，`:74 matches()` 按特异度评分），存于 `GatewayConfig.profile_routes`（`gateway/config.py:644`），解析器 `profile_routing.py:133 parse_profile_routes`。

**忙碌守卫（两道）**：agent 正在跑时，入站消息先被基类适配器排进 `_pending_messages`（`base.py`），runner 再拦截 `/stop /new /queue /status /approve /deny`（`gateway/AGENTS.md:20-28`）—— 新增必须到达 runner 的命令要绕过两道守卫。

### 2.3 bot 如何回复

- 统一出口 `BasePlatformAdapter.send()`（`gateway/platforms/base.py:2684`），另有 `send_image/voice/video/document` 等；流式回复经 `gateway/stream_consumer*.py`（编辑式流、`draft_stream_is_message` 原生流四不变量见 `gateway/AGENTS.md:30-57`）。
- 回合执行在 `gateway/run_turn.py:2142 _handle_message_with_agent()`（会话解析、turn lease、卫生压缩计划、技能自动加载…），投递契约与后台通知在 `gateway/AGENTS.md:59-89`。
- 出站还有一层 `gateway/delivery.py`（`DeliveryRouter.deliver()`，`:155-165`）负责 cron/通知类多目标投递。
- **有意沉默**：bot 可用 `[SILENT]`/`NO_REPLY` 结束回合不回复（`bot-mode.md:177`）；`filter_silence_narration` 配置专门丢弃会乒乓的沉默旁白（`gateway/config.py:600`）。

### 2.4 成员添加

三个入口，全部收敛到同一份成员清单：

1. **房间侧「Manage members」**：`apps/desktop/src/plugins/hermes-bots/group-chat-view-members.tsx:84 setGroupChatMembers()`（校验 2~6）→ `:49 commitGroupChatRoster()` 重写房间记录（清掉被移除成员的 hold/stranded/session/watermark 状态并 `syncRevision+1`，注释说明 gateway 镜像在 revision 平手时会合并成员，所以必须抬 revision）。
2. **Bot 侧「Manage groups」**：右键 Bot → 加入/退出若干群（`bot-mode.md:127`）；本地成员存在 Bot profile 的 `ui_meta`，跨桌面同步。
3. **创建时给 members**：`groups.create` 的 `members` 参数 → `validate_roster`（2~6）。
4. **底层落库**：`members_json` 列 + `room.members_changed` 控制事件（`hosted_rooms.py:56`）；跨网关复制走 `gateway/hosted_room_replicas.py:144 ingest_page()`（副本表也存 `members_json`，`:39`）。

### 2.5 不同 bot 之间自动领取任务

两条独立机制，**都要看**：

**(a) 房间内的轮流发言（discussion 驱动）** —— 纯函数、无 I/O 的策略机：

- `gateway/hosted_room_discussion.py:617 plan_next_task(room, events, *, local_profiles, ...)`：**重放整个房间事件日志**，返回"下一个成员任务"或 `idle/settled/bounded`。
- 硬上限：3 轮（`:27`）、每轮 10 条消息（`:28`）、增量 24 行（`:29`）。
- 轮次规则（`:637-661`）：**第 0 轮由用户消息里的 @mention 选 responder，没人 @ 就全员**；后续轮只给"被某个 Bot 点名且此后没发言"的成员再一轮；一轮全员沉默 → `settled`。
- `resolve_mentions()`（`:302`）解析 `@name`；`_build_prompt()`（`:519`）按 watermark（每成员每线程的已读水位）拼增量 transcript，控制帧防伪装（`:44-51`）。
- 谁来跑：`tui_gateway/hosted_room_service.py:409 prepare_room()` → `discussion.plan_next_task()` → `driver.admit_task()` 写入**耐久任务表**（`gateway/hosted_room_driver.py:199` `hosted_room_driver_tasks` 建表），由持有 driver lease 的 worker 执行；桌面关掉房间也继续跑（`bot-mode.md:158`）。

**(b) Kanban 看板的自动领取（跨 profile 的任务队列）** —— 见第 3 章：dispatcher 每 60 秒原子认领 `ready` 任务并**以 assignee 的 profile 起一个 `hermes -p <profile>` 子进程**当 worker（`hermes_cli/kanban_db_dispatch.py:2831 _default_spawn`）。

**(c) Bot 直接点名派活**：`message_agent(target=, message=)` 工具（`tools/bot_mode_dm.py:39`），授权门 `:120 message_agent_authorized()`（仅 canonical Bot Chat + Bot-Mode-managed 安装），注入 `:137 ensure_message_agent_tool()`；跨机经 Desktop relay 或 `hermes peer`（`bot-mode.md:166-241`）。

---

## 3. 任务看板（插件）

### 3.1 插件机制本身怎么工作

**插件种类与发现系统**（权威表：`plugins/AGENTS.md:53-62`）：

| 种类 | 位置 | 发现方式 |
|---|---|---|
| 通用插件 | `plugins/<name>/`、`~/.hermes/plugins/`、`./.hermes/plugins/`、pip entry points | `PluginManager`（`hermes_cli/plugins.py:1824 discover_plugins()`），**后者覆盖前者** |
| 记忆提供方 | `plugins/memory/<name>/` | `plugins/memory/__init__.py`，**内置优先**（与通用相反），激活键 `memory.provider` |
| 模型提供方 | `plugins/model-providers/<name>/` | `providers/__init__.py:556 _discover_providers()`，懒加载、last-writer-wins |
| 平台适配器 | `plugins/platforms/<name>/adapter.py` | 网关 `platform_registry`（`gateway/platform_registry.py:42 PlatformEntry`、`:281 register()`） |
| 上下文引擎/图像生成等 | `plugins/context_engine/`、`plugins/image_gen/` | ABC + orchestrator |

**目录插件最小形态**：`plugin.yaml` manifest + `__init__.py` 暴露 `register(ctx)`（`hermes_cli/plugins.py:1-8` 模块 docstring）。`PluginContext`（`plugins.py:231`）可注册：hook、工具（`register_tool :457`）、CLI 子命令（`:664`）、平台（`:808`）、语言包（`:931/:956`）、记忆提供方（`:754`）、系统提示词段（`:998`）等。

**hook 表**：`VALID_HOOKS`（`hermes_cli/plugins.py:109`）——`pre/post_tool_call`、`pre/post_llm_call`、`on_session_start/end/finalize/reset`、`pre_gateway_dispatch`、`on_room_member_activity`、kanban 观察者（`:163` `kanban_task_claimed/completed/blocked`、`:177` `on_kanban_worker_spawned/exited/stale_claim`、`on_kanban_dispatch_tick`…）。**载荷只增不改**（keyword fields + 签名内省），兼容契约见 `plugins/AGENTS.md:87-104`。

**发现时机坑**：`discover_plugins()` 只作为导入 `model_tools.py` 的副作用运行（`plugins/AGENTS.md:63-66`）。

**任务看板在这个体系里的位置**：核心（DB、dispatcher、CLI、工具）是**内建**的，不是插件；`plugins/kanban/` 装的是 **dashboard 前端插件 + systemd 单元**（`plugins/kanban/dashboard/manifest.json`：`kind` 由 tab + `entry: dist/index.js` + `api: plugin_api.py` 构成；systemd 件在 `plugins/kanban/systemd/hermes-kanban-dispatcher.service`）。官方自己把它列为"已在树内的先例，不是邀请"（`plugins/AGENTS.md:25-30`）。

### 3.2 看板数据结构（SQLite，`~/.hermes/kanban.db`）

Schema 权威位置：`hermes_cli/kanban_db.py:874 SCHEMA_SQL`。7 张表：

| 表 | 行 | 关键列 |
|---|---|---|
| `tasks` | `kanban_db.py:875` | `id, title, body, assignee, status, priority, created_by, created_at, started_at, completed_at, workspace_kind(scratch/worktree), workspace_path, branch_name, project_id, claim_lock, claim_expires, tenant, result, idempotency_key, consecutive_failures, worker_pid, worker_started_at(进程指纹), last_failure_error, max_runtime_seconds, last_heartbeat_at, current_run_id, workflow_template_id, current_step_key, skills, model_override, provider_override, reasoning_effort, max_retries, goal_mode, goal_max_turns, session_id, block_kind, block_recurrences` |
| `task_links` | `:978` | `parent_id, child_id`（依赖边） |
| `task_comments` | `:984` | `id, task_id, author, body, created_at` |
| `task_events` | `:992` | `id, task_id, run_id, kind, payload(JSON), created_at` —— 事件溯源/通知源 |
| `task_runs` | `:1008` | 每次认领一行：`status(running/done/blocked/crashed/timed_out/failed/released)`、`outcome(completed/blocked/crashed/timed_out/spawn_failed/gave_up/reclaimed)`、claim/PID/心跳/摘要 |
| `task_attachments` | `:1040` | 文件附件（blob 在 `attachments_root(board)/<task_id>/`） |
| `kanban_notify_subs` | `:1055` | 网关订阅：`task_id, platform, chat_id, thread_id, user_id, chat_type, notifier_profile, delivery_mode, last_event_id…` —— 任务完成/阻塞回推到原始聊天 |

**状态机**：`VALID_STATUSES = {triage, todo, scheduled, ready, running, blocked, review, done, archived}`（`kanban_db.py:103`）。Python 数据类 `Task`（`kanban_db.py:695`）与表一一对应。

**并发原语**：WAL + `BEGIN IMMEDIATE` + 对 `status/claim_lock` 的 CAS（`kanban_db.py:7` 模块 docstring）。`claim_task()`（`kanban_db.py:2269`）原子 `ready → running`：父任务未完成则降回 `todo`（`claim_rejected` 事件），成功即 `_fire_task_hook("kanban_task_claimed", ...)`。

### 3.3 任务发布 / 认领 / 分发（自动领取的完整闭环）

**发布（四个入口）**：
1. CLI `hermes kanban create`（parser：`hermes_cli/kanban_parser.py:160`；`create_task` 实现 `kanban_db.py:1255`）。
2. 模型工具 `kanban_create`（工具集注册 `tools/kanban_tools.py:1221`，全套 12 个工具在 `cron/AGENTS.md:104-110`）。
3. Dashboard REST `POST /tasks`（`plugins/kanban/dashboard/plugin_api.py:423`）。
4. Triage 自动分解：`hermes_cli/kanban_decompose.py:1-18` —— 辅助 LLM 读 profile 花名册 + 描述，产出子任务图，原子建子任务 + 挂链 + `triage → todo`；`auto_decompose` 默认开（`hermes_cli/config_defaults.py:1937`）。更轻的是 `kanban_specify`（收紧标题正文）与 `kanban_swarm`（`hermes_cli/kanban_swarm.py:1-16`：root → 并行 workers → verifier → synthesizer 的薄拓扑，黑板是 root 任务上的结构化 JSON 评论）。

**认领（dispatcher 单写者）**：
- 单次 tick：`dispatch_once()`（`hermes_cli/kanban_db_dispatch.py:1953`）持 board 单写锁 → `_dispatch_once_locked()`（`:2328`）。
- 每行任务走 `_dispatch_lane_task()`（`:2025`）：profile 存在性检查 → 每 profile 并发上限 → **respawn guard**（`check_respawn_guard :1525`：配额/认证错误正则、1 小时内成功、24h 内有 GitHub PR 链接、限流冷却 300s —— 常量 `:66-90`）→ `claim_task()` 原子认领 → 解析 workspace（scratch 或 git worktree）→ spawn。
- **worker = 真子进程**：`_default_spawn()`（`:2831`）用 `_worker_argv()`（`:2743`）构造 `hermes -p <profile> --cli … chat -q …`，注入 `HERMES_KANBAN_TASK / HERMES_KANBAN_WORKSPACE / HERMES_KANBAN_BOARD / HERMES_KANBAN_DB`（`:2888-2929`）并**清洗启动 profile 的密钥**（`:2855-2870`），board 是硬隔离边界（`cron/AGENTS.md:117-127`）。
- 心跳：`heartbeat_worker()`（`:610`）；崩溃/过期回收：`_reclaim_dead_workers :1146`、`detect_stale_running :748`、`enforce_max_runtime :648`；**PID + 启动时间指纹双证**防 PID 回收误杀（`cron/AGENTS.md:124-127`）。
- 连续失败熔断：`DEFAULT_FAILURE_LIMIT = 2`（`:36`），配置键 `kanban.failure_limit`（`hermes_cli/config_defaults.py:1900`）。
- 长驻循环：`run_daemon()`（`:2979`）。

**网关内置分发（默认开）**：`gateway/kanban_watchers.py:251 _kanban_dispatcher_watcher()` 每 `dispatch_interval_seconds`（默认 60，`config_defaults.py:1897`）tick 一次；notifier watcher 每 5 秒（`kanban_watchers.py:60`）尾随 `task_events` 推给订阅者。配置块 `config_defaults.py:1882-1940`：`auto_subscribe_on_create / notify_in_gateway / dispatch_in_gateway(默认 true) / review_dispatch / dispatch_interval_seconds / failure_limit / orchestrator_profile / default_assignee / auto_decompose…`。**多网关部署只有一个网关跑 dispatcher**（`kanban.dispatch_in_gateway: false`，`website/docs/user-guide/features/kanban-multi-gateway.md:19-46`）。

**worker 完成**：worker 进程内调 `kanban_complete / kanban_request_review / kanban_block` 收尾；CLI 动词全集 54 个（`hermes_cli/kanban_parser.py:150 _SPECS`，parser `:457`）：`init create list show assign link unlink comment attach complete request-review request-changes reopen-review block unblock archive tail watch stats runs log assignees heartbeat notify-* dispatch daemon gc repair promote schedule reclaim reassign set-model diagnostics…`。

### 3.4 看板 UI / API

**Dashboard 插件 REST**（全部挂 `/api/plugins/kanban/`，表：`website/docs/user-guide/features/kanban.md:871-894`；实现 `plugins/kanban/dashboard/plugin_api.py`）：

| 方法 | 路由 | 实现行 |
|---|---|---|
| GET | `/board?tenant=&include_archived=` 整板按状态列 + 过滤器 | `plugin_api.py:347` |
| GET | `/tasks/:id` 任务 + 评论 + 事件 + 链接 | `:367` |
| POST | `/tasks` 创建（可带 `triage`/`parents`） | `:423` |
| PATCH | `/tasks/:id` 状态/负责人/优先级/标题/正文/结果 | `:680` |
| POST | `/tasks/bulk`、`/tasks/:id/comments`、`/specify`、`/decompose`、`/links`、`/profiles/:name/describe-auto`、`/orchestration`、`/dispatch` | `kanban.md:879-892` |
| WS | `/events?since=<event_id>` 实时 `task_events` 流 | `plugin_api.py:1769` |

前端是打包好的 `plugins/kanban/dashboard/dist/index.js + style.css`（manifest `entry`），看板特性（拖拽列、评论线程、谁在跑什么、按 profile 分泳道、Run History）见 `kanban.md:784`、`:1382`。**通知 API**：`hermes kanban notify-subscribe`（parser `kanban_parser.py:389`）+ `/kanban` 斜杠命令自动订阅（`kanban.md:1258`、`:1295` 的 `--chat-type/--delivery-mode`）。

---

## 4. 多渠道通讯

### 4.1 总表：适配器 → 协议 → 接入方式

`Platform` 枚举（内置成员 + 插件动态成员）：`gateway/config.py:217-241` —— `local, telegram, discord, whatsapp, whatsapp_cloud, slack, signal, mattermost, matrix, homeassistant, email, sms, dingtalk, api_server, webhook, msgraph_webhook, feishu, wecom, wecom_callback, weixin, bluebubbles, qqbot, yuanbao, relay`，插件平台经 `_missing_` 动态补（`:243-260`）。

| 渠道 | 适配器文件 | 协议 / 接入方式 | 凭据 |
|---|---|---|---|
| **微信（个人号）** | `gateway/platforms/weixin.py`（1243 行） | 腾讯 **iLink Bot API**：长轮询 `getupdates` 收、回信必须带对端 `context_token`、媒体走 AES-128-ECB 加密 CDN；`qr_login` 扫码登录（`weixin.py:594`），基址 `ILINK_BASE_URL = https://ilinkai.weixin.qq.com`（`:49`） | `WEIXIN_TOKEN + account_id`（`gateway/config.py:564` checker） |
| **企业微信** | `plugins/platforms/wecom/adapter.py`（`register :834`）+ `callback_adapter.py` | 回调/webhook + 加密（`wecom_crypto.py`）、发送队列、流式 | `WECOM_*` |
| **飞书/Lark** | `plugins/platforms/feishu/adapter.py`（4494 行） | 官方 **lark-oapi SDK**，**WebSocket（默认）或 webhook** 双模；事件、表情回应、卡片按钮、评论、会议邀请 | `FEISHU_APP_ID / APP_SECRET`（`plugin.yaml` requires_env） |
| **QQ** | `gateway/platforms/qqbot/adapter.py` + `onboard.py` | 官方 **QQ Bot API v2**：WebSocket 网关收事件，REST（`api.sgroup.qq.com`）发消息/传媒体；扫码 onboard（`onboard.py:85 qr_register`） | `app_id + client_secret`（`config.py:571`） |
| Telegram | `plugins/platforms/telegram/adapter.py`（7380 行） | `python-telegram-bot`，长轮询默认、`TELEGRAM_WEBHOOK_URL` 切 webhook（`.env.example:397-400`） | `TELEGRAM_BOT_TOKEN` |
| Discord | `plugins/platforms/discord/adapter.py` | `discord.py` 网关（语音、线程、历史回填） | `DISCORD_BOT_TOKEN` |
| Slack | `plugins/platforms/slack/adapter.py` | **slack-bolt Socket Mode**（免公网地址），含原生流式、slash 命令 | `SLACK_BOT_TOKEN + SLACK_APP_TOKEN`（`.env.example:374-384`） |
| WhatsApp（个人） | `plugins/platforms/whatsapp/adapter.py` | 本地 **Node.js Baileys 桥**，HTTP 轮询（`hermes whatsapp` 配对） | `WHATSAPP_ENABLED` |
| WhatsApp Cloud | `gateway/platforms/whatsapp_cloud.py` | Meta Cloud API webhook | `phone_number_id + access_token`（`config.py:565`） |
| Signal | `gateway/platforms/signal.py` | **signal-cli daemon HTTP 模式**：SSE 收、JSON-RPC 2.0 发（文件头 `signal.py:1-2`） | `SIGNAL_HTTP_URL + SIGNAL_ACCOUNT` |
| Email | `plugins/platforms/email/` | IMAP 收 / SMTP 发（`.env.example:406-416`） | `EMAIL_*` |
| SMS | `plugins/platforms/sms/` | Twilio | `TWILIO_*` |
| 钉钉 | `plugins/platforms/dingtalk/adapter.py`（`register :849`） | 钉钉开放平台 | `DINGTALK_*` |
| Teams | `plugins/platforms/teams/` | Bot Framework webhook（`TEAMS_PORT=3978`，`.env.example:493-507`） | `TEAMS_CLIENT_ID/SECRET` |
| Google Chat | `plugins/platforms/google_chat/` | **Pub/Sub 拉订阅**（免公网，`.env.example:509-527`） | GCP service account |
| Home Assistant | `plugins/platforms/homeassistant/` | HA 事件（授权特例：`authz_mixin.py:632` 直接过） | `HASS_TOKEN` |
| Matrix / Mattermost / IRC / LINE / ntfy / SMS / buzz / photon / raft / simplex / a2a | `plugins/platforms/<name>/adapter.py` | 各自协议 | 各自 env |
| Webhook（通用入站） | `gateway/platforms/webhook.py` | 用户脚本路由，30s 超时（`cli-config.yaml.example:1474`） | `WEBHOOK_SECRET` |
| API Server | `gateway/platforms/api_server.py` | **OpenAI 兼容前端 `http://localhost:8642/v1` + REST/WS**，`API_SERVER_KEY` 鉴权（文件头 `api_server.py:5`；key ≥16 字符 `config.py:545`） | `API_SERVER_KEY` |
| Relay（实验） | `gateway/relay/`（`transport.py` 协议、`ws_transport.py` WebSocket 客户端） | 网关**主动外拨** connector；握手交 `CapabilityDescriptor` | `GATEWAY_RELAY_*` |
| BlueBubbles | `gateway/platforms/bluebubbles.py` | iMessage 桥（`server_url + password`，`config.py:570`） | — |
| 腾讯元宝 | `gateway/platforms/yuanbao.py` | `app_id + app_secret`（`config.py:572`） | — |

**平台无关的公共层**（新适配器按 `gateway/platforms/ADDING_A_PLATFORM.md` 写）：基类 `gateway/platforms/base.py:1866 BasePlatformAdapter`、事件 `event.py:36`、访问策略 mixin `access_policy_mixin.py`、媒体缓存 `media_cache.py`、去抖 `webhook_coalesce.py`、注册表 `gateway/platform_registry.py:42`（`check_fn` 被动探测 / `ensure_deps_fn` 主动装依赖 —— 两者分离的原因 `platform_registry.py:52-66`）。

### 4.2 飞书机器人的一键创建（用户点名，重点）

**结论：Hermes 有飞书"扫码一键建 bot"，实现完整，缺的只是飞书开放平台自身的前置（手机飞书 App 扫码授权）。**

流程（全在 `plugins/platforms/feishu/adapter.py`）：

1. **入口**：`hermes gateway setup` → 飞书项 → `interactive_setup()`（`:4348`）。菜单第一项即 *"Scan QR code to create a new bot automatically (recommended)"*（`:4361-4364`），失败自动回落到手输 App ID/Secret（`:4371-4390`）。
2. **端点**：`POST {accounts.feishu.cn|accounts.larksuite.com}/oauth/v1/app/registration`（常量 `:203-208`：`_ONBOARD_ACCOUNTS_URLS`、`_ONBOARD_OPEN_URLS`、`_REGISTRATION_PATH = "/oauth/v1/app/registration"`）。
3. **三步设备码流**：
   - `_init_registration()`（`:4102`）：`action=init`，确认环境支持 `client_secret` 认证；
   - `_begin_registration()`（`:4113`）：`action=begin, archetype=PersonalAgent, auth_method=client_secret, request_user_info=open_id` → 拿 `device_code / qr_url / user_code / interval / expire_in`（`:4116-4127`）；
   - 终端渲染二维码（`_render_qr`，无 `qrcode` 库则打印 URL）；
   - `_poll_registration()`（`:4129`）：按 interval 轮询 `action=poll`，成功返回 **`app_id + app_secret + domain + open_id`**，拒绝/超时返回 None（默认 600s，`qr_register :4258`）。
4. **凭证落盘**：`save_env_value("FEISHU_APP_ID"/"FEISHU_APP_SECRET"/"FEISHU_DOMAIN", ...)`（`:4405-4407`）；再 `probe_bot()`（`:4197`）调 `/bot/v3/info` 验证并取 bot 名（手输路径调用点 `:4391`）。
5. **连接方式**：手动路径让选 **WebSocket（推荐，免公网）/ Webhook**（`:4409-4424`，webhook 默认 `127.0.0.1:8765/feishu/webhook`，签名用 `FEISHU_ENCRYPT_KEY + FEISHU_VERIFICATION_TOKEN`）；QR 路径固定 websocket（`:4409-4410`）。运行时校验 `connection_mode ∈ {websocket, webhook}`（`:1499-1503`）、webhook 模式必须有 verification/encrypt（`:1505`）、**同一 app_id 只允许一个本地网关起 WS**（`:1513-1522` 锁身份）。
6. **事件订阅**：`_build_event_handler()`（`:1429-1444`）注册 `im.message.receive_v1`、`message_read`、`reaction.created/deleted`、`bot_p2p_chat_entered`、云文档评论 `drive.notice.comment_add_v1`、会议邀请 `vc.bot.meeting_invited_v1`、卡片按钮 —— **WebSocket 模式下无需在平台上配回调 URL**。
7. **授权与群策略**：DM 三选一（pairing / allow-all / allowlist，`:4427-4444` 写 `FEISHU_ALLOW_ALL_USERS`、`FEISHU_ALLOWED_USERS`）；群聊只在被 @ 时响应（`FEISHU_GROUP_POLICY=open`，`:4444-4450`；运行时读 `:1397`）；home channel 给 cron/通知（`:4452-4459`）。`FEISHU_ALLOWED_USERS` 在 multiplex 下按 profile secret scope 读（`gateway/AGENTS.md:190-193` 点名）。
8. **manifest 声明**：`plugins/platforms/feishu/plugin.yaml` —— `requires_env: FEISHU_APP_ID（url: https://open.feishu.cn/）、FEISHU_APP_SECRET`；`optional_env: FEISHU_DOMAIN/ALLOWED_USERS/ALLOW_ALL_USERS/HOME_CHANNEL…`。向导按 manifest 提问（`hermes_cli/gateway_setup_wizard.py:704` 注明 feishu 的 setup_fn 来自插件）。
9. **register(ctx)**：`:4482-4494` —— `adapter_factory=FeishuAdapter`、`max_message_length=8000`、独立发送器 `_standalone_send`（cron 无网关也能发）、`emoji=🪽`。

**缺什么（如实）**：QR 建号依赖飞书账号体系的 device-code 端点（企业内部应用建 bot 的官方入口之一）；若你的企业关闭该端点，`_init_registration` 会报 "does not support client_secret auth"（`:4106-4110`）并回落手输。QQ 有同款扫码 onboard（`gateway/platforms/qqbot/onboard.py:1-2`，`q.qq.com` bind-task 端点，QR 模板 `constants.py:16`）；微信有 `qr_login`（`weixin.py:594`）—— **三个中文渠道都支持一键/扫码接入**。

---

## 5. 多网关连接（Gateways）

Hermes 的"网关"有四个层次，配置与协议各不同：

### 5.1 单机多 profile 网关（进程级）

每个 profile 一个网关进程、一个 bot token（`website/docs/user-guide/profiles.md:254-269`）：`coder gateway start`，token 冲突由 **token lock** 拦（`gateway/status.py` 的 `acquire_scoped_lock`，`gateway/AGENTS.md:181-184`），`gateway install` 装 systemd/launchd（`profiles.md:279-284`）。运行状态落 `<home>/gateway_state.json`（`gateway/status.py:34`），字段含 `served_profiles`、`code_sha/code_version`（`status.py:909-913`、`:1230-1268`）。

### 5.2 Multiplex 网关（默认：一个进程服务所有 profile）

- 配置键 `gateway.multiplex_profiles`（默认 true，boot 时由 `hermes_cli/gateway_multiplex_mode.resolve_multiplex_mode` 判定）；env 覆盖 `GATEWAY_MULTIPLEX_PROFILES`（`gateway/config.py:46-66`）。
- 隔离机制：每个入站事件组合 home + secret + terminal 三个 context-local scope；密钥读失败关闭（`gateway/AGENTS.md:185-201`）；cron ticker 单线程顺序遍历所有 profile（`cron/AGENTS.md:31-44`）。设计文档：`website/docs/developer-guide/multiplexing-gateway.md:13-90`。

### 5.3 桌面端多网关注册表（用户视角的"多网关连接"）

- **存储**：`connections.json`（`apps/desktop/electron/main.ts:1165` `DESKTOP_CONNECTIONS_REGISTRY_PATH = <userData>/connections.json`）。
- **Schema**（`apps/desktop/electron/connection-registry.ts`）：
  - `ConnectionKind = 'cloud' | 'local' | 'remote' | 'ssh'`（`:47`）；
  - `RegistryConnection`（`:49-77`）：`id, kind, label(唯一, ≤64), url?, authMode?('oauth'|'token')?, token?(加密信封), headers?(额外网关头), org?, name?, host?/user?/port?/keyPath?/remoteHermesPath?/remoteProfile?`；
  - `ConnectionRegistry`（`:94-107`）：`version=2, primary, launchMode('last-used'|'primary'), lastUsed, connections[], quarantined[]`（坏条目保全不丢，`:81-92`，上限 20 条 `REGISTRY_QUARANTINE_CAP` `:92`）。
- **四种连接与鉴权**（文档表：`website/docs/user-guide/multi-connection-desktop.md:34-45`）：Local（App 托管）、Remote gateway（HTTP(S) + session token/OAuth）、SSH（App 开隧道起 dashboard）、Hermes Cloud（portal 发现）。规则：label 唯一、local 不可删、primary 兜底、去重按规范化 URL / `user@host:port`（`:48-74`）、Test 同时探 HTTP + WebSocket（`Test probes` 行同段）。
- **切换**：Sessions 侧栏切换 gateway；启动回到上次使用的开关（`multi-connection-desktop.md:61`）。三个入口（`:18-31`）：Settings → Gateways、侧栏 profile 轨的插头按钮、Cmd+K 命令面板。

### 5.4 网关间协议（数据结构）

| 协议 | 位置 | 数据结构 |
|---|---|---|
| **TUI/Desktop JSON-RPC** | `tui_gateway/server.py` + `methods_*.py` | 换行分隔 JSON-RPC over stdio/WebSocket，**双向**（client→server 方法、server→client 请求如 approval/clarify、server→client event）；wire 由 Pydantic 契约生成 TS（`tui_gateway/AGENTS.md:19-46`，`contracts/` + `apps/shared/src/gateway-contract.generated.ts:4993` `'groups.create'`） |
| **Relay（网关↔connector）** | `gateway/relay/transport.py:28 RelayTransport` 协议、`descriptor.py:21 CapabilityDescriptor` | 握手交换能力描述：`contract_version=1`（`descriptor.py:17`）、`platform, label, max_message_length, supports_draft_streaming/edit/threads, markdown_dialect, len_unit, pii_safe, supports_context…`（`descriptor.py:24-46`）；出站 `send_outbound(action)` |
| **Peer（网关↔网关，bot 主动 DM 跨机）** | `hermes_cli/subcommands/peer.py:36 _load_peers()` | 注册表在 `config.yaml` 的 `bot_peers`（`peer.py:8`、`:40`），密钥 `HERMES_PEER_<NAME>_KEY` 在 `.env`；命令 `hermes peer add/list/dm/run/status/stop`（`bot-mode.md:242-285`）；对端需 `api_server` 平台 + 强 `API_SERVER_KEY` |
| **profile_routes** | `gateway/profile_routing.py:56` | 平台 scope → profile 的路由规则表（见 §2.2） |
| **API Server** | `gateway/platforms/api_server.py:5` | OpenAI 兼容 `:8642/v1` + 管理 REST/WS，Bearer `API_SERVER_KEY`；跨机机器人的底层通道之一 |

**部署拓扑结论**（推断自上文）：HTML 原型要复刻的"多网关"交互面是 5.3 的注册表 + 切换 + 状态徽标；5.4 的协议层在原型里只需 mock 数据结构。

---

## 6. 快捷输入

**定位**（文件头原文 `apps/desktop/electron/quick-entry.ts:1-17`）：全局热键唤起的**迷你输入窗**——无边框、常驻置顶，**不带自己的网关连接**，把文本转发给主 renderer，由主窗口走**与普通输入框完全相同的提交路径**。默认快捷键 `CommandOrControl+Shift+Space`（`:19`，注释：对齐 Claude Desktop quick entry / ChatGPT Quick Chat 的 Cmd+Shift 肌肉记忆）。

### 组成（6 个文件）

| 文件 | 行号 | 职责 |
|---|---|---|
| `apps/desktop/electron/quick-entry.ts` | 421 行 | **纯逻辑**：accelerator 校验与规范化（修饰键表 `:31-48`、键表 `:50-86`、`sanitizeQuickEntrySettings :282`）、`createQuickEntryShortcut`（`:330`，封装 `globalShortcut` register/unregister，处理 "disabled 从不注册"、"被别的应用占用 → taken"、"非法 → invalid"）、`quickEntryWindowBounds`（`:401`，640×168、水平居中、顶部 22% 处 —— 常量 `:24-28`） |
| `apps/desktop/electron/main.ts` | `:15018-15232` | **窗口与 OS 注册**：配置持久化 `quick-entry.json`（`:15018`）、`spawnQuickEntryWindow()`（`:15052`：frameless + transparent + alwaysOnTop + macOS `type:'panel'` `:15079` + `setVisibleOnAllWorkspaces` `:15096` + blur 即隐藏 `:15114-15118` + 无阴影 `:15077`）、`show/hide/toggle`（`:15152/:15176/:15184`，热键双向切换）、`quickEntryShortcut = createQuickEntryShortcut(globalShortcut, toggle)`（`:15194`）、`applyQuickEntrySettings`（`:15196`，off 时关窗） |
| `main.ts` IPC | `:18302/:18316/:18333/:18359/:18367` | `settings:get / settings:set / submit / state / dismiss` 五个通道 |
| `apps/desktop/electron/preload.ts` | `:220-238` | 暴露 `getSettings/setSettings/submit/dismiss/pushState/onState` |
| `apps/desktop/src/store/quick-entry.ts` | 310 行 | renderer 状态：默认快捷键常量（`:38` `QUICK_ENTRY_DEFAULT_SHORTCUT`）与 atom `$quickEntry`（`:40-46`），`QuickEntryState {enabled, registered, error, shortcut}`（`:20-26`）；权威在 main 进程（冷启动即恢复热键，`:3-17` 注释） |
| `apps/desktop/src/app/contrib/hooks/use-quick-entry-bridge.ts` | `:53` | **双向桥**：入向——文本按目标（当前会话/指定近期会话/新建会话）经主窗口**同一 `submitText` 管线**发出（`:42` 注释：one submit pipeline, no bespoke RPC），近期会话固定 5 条（`:21`）；出向——网关连接状态 + 会话列表推给 quick 窗；**仅主窗口注册**（`:49-51` 注释，副窗口注册会一键发 N 条） |
| `apps/desktop/src/app/settings/quick-entry-settings.tsx` | 107 行 | 设置页：开关 + 录制快捷键（`SETTING_IDS.advanced.quickEntry*`，`:67/:102`），显示 `registered/error` 实况 |
| `apps/desktop/src/app/quick-entry/quick-entry-root.tsx` `quick-entry-app.tsx` | — | quick 窗自己的 React 根（`?win=quick` 路由，`main.ts:15044 quickEntryUrl`） |

### macOS 侧怎么做的

- 热键 = **Electron `globalShortcut`**（跨平台 API，底层 macOS RegisterEventHotKey）——`quick-entry.ts:293-297` 注入的 `GlobalShortcutLike` 接口（`isRegistered/register/unregister`）就是为了可单测（`:293-295` 注释）。
- 窗口 = `BrowserWindow` + macOS **`type:'panel'`**（NSPanel，不抢 Cmd+Tab 焦点，`:15079`）、`skipTaskbar: !IS_MAC`、`hasShadow: !IS_MAC`（`:15066-15077`，macOS 透明窗阴影坑 #99172）、`hiddenInMissionControl`、`setVisibleOnAllWorkspaces(visibleOnFullScreen)`（`:15096-15101`）。
- 显示位置：每次唤起**重定位到光标所在显示器**（`repositionQuickEntryWindow :15143`）；blur 即隐藏；主窗状态缓存 `quickEntryLastState` 在 `did-finish-load` 回放（`:15129-15133`）。

**README 对照**：README 的功能表**没有**单列快捷输入（`README.md:23-31`），它是桌面 App 的隐藏能力 —— 即"README 未宣称但代码存在"（正向差异，不构成缺失）。

---

## 7. 多角色隔离（Profiles）

**一个 profile = 一个独立 Hermes home 目录**（`website/docs/user-guide/profiles.md:9-14`）：自己的 `config.yaml`、`.env`、`SOUL.md`、记忆、会话、技能、cron、state.db。**角色（Bot Mode）就是 profile 的一层展示**（`bot-mode.md:12-16`："A Bot **is** a Hermes profile" tip 块）。

### 7.1 路径与识别

- 默认 home：`get_hermes_home()`（`hermes_constants.py:111`）—— context override → `HERMES_HOME` env → 平台默认（`~/.hermes` 或 Windows `%LOCALAPPDATA%/hermes`）。**禁止硬编码**（`AGENTS.md` "Never hardcode ~/.hermes"）。
- profile 根：`hermes_cli/profiles.py:220 _get_profiles_root()` = `<default root>/profiles`（HOME 锚定，故意的，`AGENTS.md` profile scope 节）。
- **什么算 profile**：目录必须带身份文件之一（`config.yaml / .env / SOUL.md / profile.yaml / auth.json / state.db`），光秃目录被忽略（`profiles.md:11-12`；判定函数 `hermes_constants.py:242 _is_hermes_profiles_root`、`:264` `named_profile_home`）。
- profile 专属命令别名：创建 `coder` 即有 `coder chat` 等（`profiles.md:47-53`）；sticky 默认 `hermes profile use`（`hermes_cli/subcommands/profile.py:15-16`，落盘文件 `hermes_cli/profiles.py:233-234 active_profile`）。

### 7.2 每个角色的独立配置文件（全字段）

```
~/.hermes/profiles/<name>/
├── config.yaml     # 全部行为设置（model: / toolsets / gateway… 同 DEFAULT_CONFIG 结构，§1.4）
├── .env            # 该角色的密钥（API key、bot token），可覆盖 shell 环境
├── SOUL.md         # 人格与常驻指令
├── profile.yaml    # 角色元数据（见下）
├── auth.json       # OAuth 登录（Anthropic/Codex/xAI 等）
├── state.db        # 会话库（§10）
├── memories/MEMORY.md + memories/USER.md   # 记忆（§8）
├── skills/ cron/jobs.json logs/ plugins/ attachments/ cache/ …
```
字段来源：`profiles.md:9-14`、`292-316`（Configuring profiles）；`hermes_cli/profiles.py:35-77`（--clone 拷什么/不拷什么的清单）。

**`profile.yaml` schema**（读写：`hermes_cli/profiles.py:857 read_profile_meta()` / `:900 write_profile_meta()`）：

| 字段 | 类型 | 语义 |
|---|---|---|
| `description` | str | 1-2 句角色描述（Kanban decomposer 按它路由任务；`profiles.md:69-73`） |
| `description_auto` | bool | 是否 AI 生成（dashboard 显示 review 徽标） |
| `display_name` | str | 显示名（空=回退 id） |
| `previous_names` | list[str] | 改名历史（群聊旧 handle 同步用，`profiles.py:927-931` 注释 #110200） |
| `role` | enum | 后端能力位（`PROFILE_ROLES = {SETUP_ROLE}`，`profiles.py:97`；复制件会剥掉 `:942 drop_profile_role`） |
| `ui_meta.hermes-bots` | dict | **Bot Mode 展示元数据**：`title`（Bot 名，`hermes_cli/profiles.py:863-868`）、avatar、section（分组）、hidden —— 由桌面写，无 CLI 命令（`bot-mode.md:191`） |
| `ui_meta.hermes-bots-groups`（在**默认** profile 上） | dict | 群聊镜像（§2.4，`group-chat.ts:49`） |

缺失文件 = 空默认、**绝不抛错**（`profiles.py:854-856` 注释：一个坏 profile 不许弄崩 `hermes profile list`）。

### 7.3 主界面如何选择角色

- **桌面侧栏 profile 轨**：`apps/desktop/src/app/chat/sidebar/profile-switcher.tsx`（拖拽排序的头像列表）、`profile-dropdown-switcher.tsx`（下拉切换）、`profile-rail-connect.tsx`（"连接另一个网关"插头，`multi-connection-desktop.md:27`）、`profile-launch-menu.tsx`、`use-profile-prewarm.ts`（暖后端预热）。
- **Bot Mode 名册**：Bots 页签一行一 profile（`bot-mode.md:19-33`）；点行进 canonical Bot Chat；右键可 Open recent / Hide / Edit / Duplicate / Manage groups。
- **CLI**：`hermes -p <name>`、`hermes profile use <name>`（§7.1）、提示符前缀显示当前 profile（`profiles.md:220-225`）。
- **Dashboard**：侧栏 profile switcher 管任意 profile 的 config/keys/skills（`profiles.md:311-318`）。
- **网关路由**：同一进程里按 `profile_routes`（§5.4）把不同 chat 分给不同角色。

**克隆语义**（隔离的关键）：`--clone`（config/skills/SOUL/记忆）、`--clone-all`（全量，但**永不拷**会话历史/cron/单次 OAuth）、`--clone-channels` 默认**不拷** bot token（一个 token 只能归一个 profile，`profiles.md:120-175`）。

---

## 8. 记忆设计（Memory）

### 8.1 存储格式

**内置记忆 = 两个有界文件**（`website/docs/user-guide/features/memory.md:11-34`）：

| 文件 | 用途 | 字符上限 |
|---|---|---|
| `<home>/memories/MEMORY.md` | agent 自己的笔记（环境事实、约定、学到的东西） | 2200（≈800 token） |
| `<home>/memories/USER.md` | 用户画像（偏好、沟通风格、期望） | 1375（≈500 token） |

- 路径解析：`tools/memory_tool.py:38 get_memory_dir()` = `get_hermes_home() / "memories"`（**按调用时解析**，profile 切换有效）。
- **条目分隔符 `ENTRY_DELIMITER = "\n§\n"`**（`tools/memory_tool_store.py:23`）；`MemoryStore` 类（`:88`）：`load_from_disk()`（`:133`）读两文件 + 冻结系统提示词快照、`format_for_system_prompt(target)`（`:463`）渲染带 `MEMORY (your personal notes) [67% — 1,474/2,200 chars]` 头的块（文档示例 `memory.md:39-53`）。
- 写保护：威胁扫描（`memory_tool_store.py:26 _scan_memory_content`，strict scope）、外部漂移拒写（`:36-47`，#26045）、不可读拒写（`:49-57`）—— 防静默丢记忆。
- 配置块：`cli-config.yaml.example:1003-1016`：`memory_enabled / user_profile_enabled / memory_char_limit: 2200 / user_char_limit: 1375 / nudge_interval: 10`（每 10 个用户轮提醒写记忆，0=关）。

### 8.2 检索

1. **会话内主动读写**：`memory` 工具（`tools/memory_tool.py:207 memory_tool(action, target, content, old_text, ...)`)，目标 `memory|user`，动作 add/replace/remove/consensus 等，**满则报错让 agent 自己腾位**（`memory.md:25-33`，不自动压缩）。
2. **跨会话检索**：`session_search` 工具（`tools/session_search_tool.py:619`，toolset 注册 `toolsets.py:134`）—— SQLite **FTS5** 全文索引（`messages_fts` + trigram + `messages_fts_cjk`（CJK 分词，`hermes_state_fts.py:46` 建表））+ LLM 摘要（README 宣称 `README.md:26`）。底层 `hermes_state_search.py:1062 search_messages()`、`:1237 search_sessions_by_id`。
3. **外部记忆提供方**（单选）：ABC `agent/memory_provider.py:84 class MemoryProvider`，编排器 `agent/memory_manager.py:336 class MemoryManager`。内置 7 个：honcho、mem0、supermemory、byterover、holographic、openviking、retaindb（`plugins/memory/` 目录 + `plugins/AGENTS.md:19-24`；**新后端只许做成树外插件**）。激活键 `memory.provider`；发现顺序 bundled → `$HERMES_HOME/plugins/` → `./.hermes/plugins/` → entry points（`plugins/AGENTS.md:58`）。
4. **Learning graph**：记忆条目 + 技能也能进图谱（`agent/learning_graph.py:149-155` 把 MEMORY/USER 条目变卡）。

### 8.3 注入时机

三个时机，两条纪律：

1. **系统提示词冻结快照（会话开始）**：`agent/agent_init.py:1311 _init_memory()` 从盘加载 `MemoryStore` → `agent/system_prompt.py:516 _memory_parts()` 渲染进 system prompt 的 volatile 层。**"冻结快照模式"**：会话中途写盘立即生效于工具回显，但系统提示词**下一会话才更新** —— 保前缀缓存（`memory.md:57`；根 `AGENTS.md` "Per-conversation prompt caching is sacred"）。层级次序 stable→context→volatile 见 `agent/system_prompt.py:7`。
2. **每轮 prefetch（外部提供方）**：`agent/turn_context.py:862 _memory_turn_start_and_prefetch()` → `MemoryManager.prefetch_all(query, session_id)`（`memory_manager.py:447`），结果包成 `[System note: The following is recalled memory context, NOT new user input…]` 块（`:328`）挂在用户消息旁，同一轮内复用（`ext_prefetch_cache`，`turn_context.py:472`）。去重行 `_drop_repeated_recall_lines`（`:271`）。
3. **每轮收尾 sync**：`MemoryManager.sync_all(user_content, assistant_content, ...)`（`memory_manager.py:533`）写回提供方；内置 store 由 `memory` 工具直接写盘。记忆提供方的生命周期 hook 在**绑定 profile scope** 后调用（`plugins/AGENTS.md:75-85`）。

会话结束/压缩时的权威性声明：压缩摘要绝不能盖过记忆（`agent/context_compressor.py:680`："persistent memory … is ALWAYS authoritative"），压缩后重注入（`:5182` 压缩注记同样声明）。

---

## 9. 多提供商（Providers）

### 9.1 支持哪些

- **注册表三层发现**（`providers/__init__.py:1-35` 模块 docstring）：bundled `plugins/model-providers/<name>/` → `$HERMES_HOME/plugins/model-providers/` → pip entry points；旧式 `providers/<name>.py` 单文件仍兼容。**用户插件覆盖内置**（last-writer-wins）。入口：`:121 register_provider()`、`:158 get_provider_profile()`、`:215 list_providers()`、`:556 _discover_providers()`（懒加载，按 home 分层缓存 `:70-80`）。
- **内置 39 个提供方插件**（目录实测）：`actual ai-gateway alibaba alibaba-coding-plan anthropic arcee azure-foundry bedrock commandcode copilot copilot-acp custom deepinfra deepseek fireworks gemini gmi huggingface kilocode kimi-coding meta-ai minimax nebius-token-factory nous novita nvidia ollama-cloud openai-codex opencode-zen openrouter qwen-oauth router stepfun upstage vertex xai xiaomi zai`。
- README 宣称面（`README.md:21`、`README.zh-CN.md:18`）：Nous Portal、OpenRouter（200+）、NVIDIA NIM、小米 MiMo、z.ai/GLM、Kimi/Moonshot、MiniMax、Hugging Face、OpenAI、自定义端点 —— 与上表一一对应（另有 DeepSeek、Bedrock、Vertex、xAI、Copilot 等）。
- 配置样例的 provider 枚举（`cli-config.yaml.example:76-104`）：`auto / openrouter / nous / nous-api / anthropic / openai-codex / copilot / gemini / zai / kimi-coding / minimax(-cn) / huggingface / nvidia / xiaomi / arcee / ollama-cloud / deepinfra / kilocode / ai-gateway / azure-foundry / lmstudio / custom(=ollama|vllm|llamacpp 别名)`。

### 9.2 配置方式

见 §11.2（`model:` 块 + 命名 `providers:` 条目）。要点：**每请求重解析** —— 三个客户端每次请求都从 `ModelConfigurationStore`/config 现取（对应 Hermes 的 `runtime_provider.resolve_runtime_provider()`，`architecture.md:208-212`），保存即生效；`key_cmd` 支持短时令牌命令（`cli-config.yaml.example:223-256`）；OAuth 经 `hermes auth add <provider>`（`hermes_cli/auth.py` PROVIDER_REGISTRY）。

### 9.3 切换机制

- **CLI/网关共用一套**：`/model [provider:model]`、`hermes model`（parser `hermes_cli/subcommands/model.py:8-10`）→ `hermes_cli/model_switch.py:1741 switch_model()`。流水线："parse flags → alias resolution → provider resolution → credential resolution → normalize → metadata → result"（`model_switch.py:1-4`）。
- 作用域：`--once / --session / --global`；**默认不持久化**，`model.persist_switch_by_default`（默认 false）才写回 config（`model_switch.py:525-543`）；`persist_model_selection()`（`:1824`）。
- 辅助任务（标题/压缩/视觉/MoA）可各自钉 `auxiliary.<task>.provider/model`，默认 `"main"` 跟随主模型（`website/docs/user-guide/configuration.md:1390`）。
- 失败转移：`fallback_providers:` 链 + 每 aux 任务 `fallback_chain`（`configuration.md:1632-1637`）；错误分类 hook `transform_api_error_classification`（`plugins.py:125-132`）。
- Nous Portal 一键：`hermes setup --portal`（`hermes_cli/portal_cli.py:136-183`，`portal info` 等价 `status`，`:151`）。

### 9.4 ProviderProfile schema（`providers/base.py:42` 起，核心字段）

| 分组 | 字段 |
|---|---|
| 身份 | `name, api_mode(chat_completions/codex_responses/anthropic_messages), aliases` |
| 展示 | `display_name, description, signup_url` |
| 认证/端点 | `env_vars, base_url, models_url, auth_type(api_key/oauth_device_code/oauth_external/copilot/aws_sdk), supports_health_check, supports_model_listing` |
| 提供方自持认证 | `auth_handler, refresh_credential, classify_api_error`（`base.py:64-76`） |
| 能力 | `supports_vision, supports_vision_tool_messages, supports_prompt_cache_key, native_reasoning_details_type` |
| 外部进程型 | `process_command, process_args, process_command_env_vars, process_args_env_var`（`base.py:105-114`） |
| 模型目录 | `fallback_models, model_aliases, …`（`base.py:116-120`） |

---

## 10. Archived Chats

**存储**：会话级两列 soft-delete —— `sessions.archived` + `sessions.auto_archived`（`hermes_state_common.py:433-434`），相邻 `pinned`（`:435`，pin 豁免自动归档）、`hidden`（Bot Mode 用）。

**两个归档来源**（严格区分，`hermes_state_sessions.py:923-958`）：

1. **故意归档**（用户/CLI/API）：`set_session_archived(session_id, archived)`（`:923`）—— **清掉 `auto_archived` 标记**（"这是人归的"）。
2. **空闲扫描自动归档**：`_auto_archive_lineage()`（`:930`）—— 打 `auto_archived=1`，按血统（压缩父子链）整链归档；恢复时 `_unarchive_auto_archived_lineage()`（`:940`）只撤自动的、**永不撤人归的**（`:944-951` 判定）。

**开关与配置**：`sessions.auto_archive`（默认 **false**）、`sessions.auto_archive_days`（默认 3 天）—— `hermes_cli/config_defaults.py:2275-2279`；另有**保留期剪枝**（与归档正交）：`sessions.auto_prune: true / retention_days: 90`（`cli-config.yaml.example:1044-1060`，剪**已结束**的会话，开着/pinned/进行中永不删）。

**读取**（`hermes_state_sessions.py:126` 的过滤参数）：`archived_only=True` → `WHERE s.archived = 1`（`:158-161`）；默认列表排除归档；`list_sessions_rich()`（`:1317`）带 `include_archived / archived_only / include_subagents`；**归档+隐藏的行是"归档视图"专供的恢复面**（`:1337-1341`）。恢复一个可恢复事故归档：`unarchive_recoverable_session()`（`:965`）。

**各表面的 Archived Chats**：

| 表面 | 位置 |
|---|---|
| REST | `hermes_cli/web_routers/sessions.py:180` `?archived=exclude|only|include`（`:189-203` 校验/换算）；PATCH 标志映射 `:796-798`（`("archived", db.set_session_archived)`） |
| Desktop 侧栏 | 独立归档视图：store `apps/desktop/src/store/sidebar-archive.ts:11-14`（`$archivedSessions` + `loadArchivedSessions`）；侧栏模式切换 `app/chat/sidebar/index.tsx:602-608`、`:1550-1553`（`sessionsMode: 'archived'|…`）；行菜单归档/恢复 `session-actions-menu.tsx:495-502` |
| Desktop 设置 | `app/settings/sessions-settings.tsx:55 ArchivedSessionsSettings` —— 列表 + 恢复（`:79-93 unarchive` → `setSessionArchived(id,false,profile)`，API `api/sessions.ts:374`）+ **自动归档开关**（`:209-258`，读写 `sessions.auto_archive/auto_archive_days`） |
| CLI | `hermes sessions archive`（批量软隐藏，`hermes_cli/subcommands/sessions.py:123-126`，`--older-than`）、`pin`（`:272-274`）、`prune --include-archived`（`:111-112`） |
| Bot Chat 特例 | 显式归档 Bot Chat = **退役 canonical chat**，下次点击开新会话；**自动归档扫描永不退役 Bot Chat**（`bot-mode.md:32`） |

**Archived ≠ 删除**：真正删除只有 `purgeSession` / `sessions prune`（`ConversationSessionsStore` 对应物见本项目自身架构；Hermes 侧即 web router 的 delete-all-empty `web_routers/sessions.py:474-509`）。

---

## 11. Gateways / Providers 完整配置 Schema

来源：`gateway/config.py`（dataclass 定义）+ `cli-config.yaml.example`（用户可写样例）+ `.env.example`（密钥样例）。**只放密钥进 `.env`** 是硬规矩（`AGENTS.md` "New HERMES_* env vars for non-secret config" 节）。

### 11.1 GatewayConfig（`gateway/config.py:586` 起）

| 字段 | 类型/默认 | 语义与样例 |
|---|---|---|
| `platforms` | `Dict[Platform, PlatformConfig]` | 每平台一块，见 11.1a |
| `reset_triggers` | `["/new", "/reset"]` | 会话重置命令 |
| `quick_commands` | dict | 绕过 agent 循环的斜杠快捷命令 |
| `sessions_dir` | `<home>/sessions` | 会话目录 |
| `write_sessions_json` | true | 兼容用 sessions.json 镜像（主副本在 state.db `gateway_routing`） |
| `always_log_local` | true | cron 输出总落本地文件 |
| `filter_silence_narration` | true | 丢弃沉默旁白防 bot 乒乓 |
| `stt_enabled` / `stt_echo_transcripts` | true/true | 入站语音自动转写 |
| `group_sessions_per_user` | **true** | 群聊每人一会话（安全默认） |
| `thread_sessions_per_user` | false | 线程默认共享 |
| `max_concurrent_sessions` | null | 并发活跃会话上限（顶层同名键优先，`config.py:605` 字段 + `config_loader.py:5-9` 优先级说明） |
| `multiplex_profiles` | None→boot 判定 | 一进程服务全部 profile；env `GATEWAY_MULTIPLEX_PROFILES` 覆盖（`:46-66`） |
| `room_link_url` | null | RoomLink 公网 HTTPS 端点（`HERMES_ROOM_LINK_URL` 可覆盖） |
| `systemd_watchdog_seconds` | 0 | systemd watchdog |
| `loop_watchdog` + 3 个探测参数 | true + ~90-120s | 事件循环卡死自检硬退（`config.py:618-631` 注释含事故史） |
| `on_all_adapters_down` | `"exit"` \| `"stay_alive"` | 最后一个适配器挂掉的行为（env `GATEWAY_ON_ALL_ADAPTERS_DOWN`） |
| `unauthorized_dm_behavior` | `"pair"` | `pair / ignore / decline`（每平台可 `extra` 覆盖，`:826-833`；email 默认 ignore `:832`） |
| `unauthorized_dm_decline_message` | "" | 拒绝语 |
| `streaming` | `StreamingConfig` | 见 11.1b |
| `session_store_max_age_days` | 90 | 会话条目老化 |
| `profile_routes` | `List[ProfileRoute]` | 平台 scope → profile 路由（§5.4），解析 `profile_routing.py:133` |

**11.1a PlatformConfig（`gateway/config.py:410`）**：
`enabled(false) / token / api_key / home_channel(HomeChannel: platform, chat_id, name, thread_id?, user_id?, scope_id? — `:341`) / reply_to_mode("first"∈off|first|all) / gateway_restart_notification(true) / typing_indicator(true) / typing_status_text / channel_overrides(Dict[str, ChannelOverride{model, provider, system_prompt} — `:380`]) / extra(dict，一切平台专有键)**。
非类型化的顶层键自动升入 `extra`（`from_dict :444-452`，#10206）。凭据 env 名映射 `PLATFORM_TOKEN_ENV_NAMES`（`:399`：telegram/discord/slack/mattermost/matrix/weixin）；"已配置"判据 `_PLATFORM_CONNECTED_CHECKERS`（`:563`，如 weixin 需 `account_id+token`、qqbot 需 `app_id+client_secret`、api_server 需 ≥16 字 key）。

**11.1b StreamingConfig（`gateway/config.py:488`）**：`enabled(false) / transport("auto"∈auto|draft|edit|off) / edit_interval(0.8s) / buffer_threshold(24) / cursor(" ▉") / fresh_final_after_seconds(0)`。

**11.1c 用户写法样例**（`cli-config.yaml.example`）：
```yaml
gateway:                    # :1349（嵌套键与顶层键二选一，见 config_loader 优先级）
  trust_env: true           # :1360
platform_toolsets:          # :1411 —— 每平台工具集预设/自组
  cli: [hermes-cli]
  telegram: [hermes-telegram]
platforms:                  # :1430 起（注释样例）
  telegram:
    reply_to_mode: "first"
    guest_mode: false
    allowed_chats: ["-1001234567890"]
    extra: { drop_pending_on_cold_boot: true }
discord: { require_mention: true, auto_thread: true, reactions: true }   # :1476 起
profile_routes:             # gateway/profile_routing.py:56
  - { name: work-chat, platform: discord, chat_id: "123", profile: coder }
```

### 11.2 Providers / Model 配置 Schema

**主块 `model:`（`cli-config.yaml.example:72` 起）**：

| 键 | 样例/默认 | 行 |
|---|---|---|
| `default`（=`model`） | `"anthropic/claude-opus-4.6"` | :74 |
| `provider` | `"auto"`（枚举见 §9.1） | :108 |
| `base_url` | `"https://openrouter.ai/api/v1"` | :111 |
| `api_key` | （推荐放 `.env`） | :114 |
| `streaming` | true（流式主回合） | :117-123 |
| `context_length` / `ollama_num_ctx` | 自动 / 手动上限 | :134-150 |
| `default_headers`（别名 `extra_headers`） | 覆盖 OpenAI SDK UA 等 | :154-176 |

**命名 provider 条目 `providers:`（每条一个端点，样例 :178-300）**：

```yaml
providers:
  my-proxy:
    base_url: "https://llm.internal.example.com/v1"   # 必填
    key_env: "MY_PROXY_API_KEY"        # 或 api_key: / key_cmd:（每请求重取短时令牌 :240-256）
    api_mode: chat_completions         # chat_completions | codex_responses | anthropic_messages（可自动探测）
    extra_headers: { CF-Access-Client-Id: "xxxx" }   # 值按密钥处理、永不入日志
    extra_body: { service_tier: priority }           # 并入每个请求
    session_affinity_header: x-litellm-session-id    # 会话感知代理
    request_timeout_seconds: 300       # 命名条目的超时覆盖 :283-298
    stale_timeout_seconds: 900
    model: databricks-claude-sonnet-4-6 # 该端点的默认模型（key_cmd 工作例 :296-300）
```

**相关块**：`auxiliary.*`（每辅助任务 provider/model/fallback_chain，`configuration.md:1390`）、`fallback_providers:`（`configuration.md:1632`）、`compression:` + `auxiliary.compression:`（`cli-config.yaml.example:661` 起）、`stt:`（`:1649` 起，provider local|groq|openai|mistral|xai|elevenlabs）、`tts`/`voice`、`kanban:`（`:402`，`review_dispatch`）、`cron:`（`:418`，`catch_up_missed`）、`memory:`（`:1003`，§8.1）、`agent:`（`:1170`，`max_turns`/`bot_mode_protocol` 等）、`bot_mode:`（`envelope_ttl_seconds: 900`，`hermes_cli/config_defaults.py:1955-1959`）、`bot_peers:`（§5.4）。

**密钥 env 样例**（`.env.example`）：Telegram `:387-400`、Slack `:374-384`、WhatsApp `:403-405`、Email `:406-416`、`GATEWAY_ALLOW_ALL_USERS` `:420`、Teams `:493-507`、Google Chat `:509-527`、GitHub/STT keys `:456-470`。飞书/QQ/钉钉的 env 由各自 plugin.yaml `requires_env` 声明并在 setup 向导里写入（不在 `.env.example` 顶层）。

---

## 12. README 宣称 ↔ 代码实现对照

以 `README.md:23-31`（英文功能表）+ `README.zh-CN.md:20-28` 为宣称清单，逐条落码：

| # | README 宣称 | 代码实现 | 结论 |
|---|---|---|---|
| 1 | 真终端界面：完整 TUI、多行编辑、斜杠补全、历史、中断重定向、流式工具输出（`README.md:24`） | `ui-tui/`（Ink）+ `tui_gateway/`（JSON-RPC 后端）；`tui_gateway/AGENTS.md:9-46` | ✅ 实现 |
| 2 | 随你所在：Telegram、Discord、Slack、WhatsApp、Signal、CLI，单一网关进程；语音备忘转写；跨平台会话连续（`README.md:25`） | 25+ 适配器（§4.1 表）；STT `tools/transcription_*.py` + `stt:` 配置（`cli-config.yaml.example:1649`）；`build_session_key` + handoff 字段（`hermes_state_common.py` sessions 表 `handoff_state/handoff_platform`） | ✅ 实现（渠道数远超宣称） |
| 3 | 闭环学习：记忆策展+定期提醒；复杂任务后自动建技能；技能自改进；FTS5 会话搜索+LLM 摘要；Honcho 辩证建模；agentskills.io 兼容（`README.md:26`） | 记忆 §8（`nudge_interval`）；curator `agent/curator.py`；FTS5 `hermes_state_fts.py:46` + `session_search`（`tools/session_search_tool.py:619`）；`plugins/memory/honcho/`；`skills/` frontmatter 规范 | ✅ 实现 |
| 4 | 定时自动化：内置 cron，投递任意平台；自然语言描述（`README.md:27`） | `cron/jobs.py`（schedule 解析 `:773`、job 字段 `:1800 create_job`）+ `scheduler.py`；投递 `gateway/delivery.py:155-165`（`DeliveryRouter`）；`cronjob` 工具（`cli-config.yaml.example:1509`） | ✅ 实现 |
| 5 | 委派与并行：隔离子代理；Python 脚本经 RPC 调工具（`README.md:28`） | `tools/delegate_tool.py:440 delegate_task`；`tools/code_execution_rpc.py:1-12`（UDS/TCP + 远程文件轮询双传输，token→allowlist→预算→分发） | ✅ 实现 |
| 6 | 随处运行：**七种终端后端** local/Docker/SSH/Singularity/Modal/Daytona/Vercel Sandbox（`README.md:29`） | `tools/terminal_tool_backends.py:54 _BUILTIN_BACKENDS = "local, docker, singularity, modal, daytona, vercel_sandbox, ssh"` | ✅ 实现（7 种）。⚠️ **中文 README `README.zh-CN.md:26` 写"六种"且漏 Vercel —— 本地化过期，非代码缺失** |
| 7 | 研究就绪：批量轨迹生成、轨迹压缩（`README.md:30`） | `batch_runner.py`（顶部结构表）、`trajectory_compressor.py`（44k 字节） | ✅ 实现 |
| 8 | 支持任意模型：Nous Portal / OpenRouter / NIM / MiMo / z.ai / Kimi / MiniMax / HF / OpenAI / 自定义；`hermes model` 切换（`README.md:21`） | 39 个 provider 插件（§9.1）+ `switch_model`（`model_switch.py:1741`） | ✅ 实现 |
| 9 | Nous Portal 一键（`hermes setup --portal`、Tool Gateway、`hermes portal info`）（`README.md:136-141`） | `hermes_cli/portal_cli.py:174-183`（`portal info` 别名 `:151`）；`model_setup_flows.py:283-364` offer；`nous_account.py:126` entitlement | ✅ 实现 |
| 10 | CLI vs 消息平台命令对照表（`/new /model /personality /retry /compress /skills /stop /status`…）（`README.md:149-159`） | `_SLASH_DISPATCH`（`cli.py:1159`）+ 网关 `_command_handler_table` / `_IDLE_COMMANDS`/`_PLAIN_COMMANDS`（`gateway/run_busy.py:910`、`gateway/AGENTS.md:16-18`） | ✅ 实现 |
| 11 | OpenClaw 迁移（`hermes claw migrate`，导入 SOUL/记忆/技能/白名单/消息设置/密钥/TTS 资产/AGENTS.md）（`README.md:189-215`） | `hermes_cli/subcommands/claw.py:13-26` parser + `hermes_cli/claw.py` 实现；`openclaw-migration` 技能 | ✅ 实现 |
| 12 | 快速安装脚本（Linux/macOS/WSL2/Windows/Termux APT）（`README.md:35-61`） | `setup-hermes.sh`（12k）、`setup-hermes.ps1`、`install.sh` 由官网发布（仓内有 `flake.nix`/`nix/`、`docker/`） | ✅ 实现 |
| 13 | 社区：HermesClaw **社区**微信桥接（`README.md:235`） | 外链独立仓库；本仓**自带** `gateway/platforms/weixin.py`（iLink）——两者不冲突 | ✅ 如宣称（外部项目） |
| 14 | `hermes model/tools/config set/gateway/setup/update/doctor` 快速入门（`README.md:109-119`） | `hermes_cli/subcommands/`：`model.py tools.py config.py gateway.py setup.py update.py doctor.py` 全在 | ✅ 实现 |
| 15 | （中文 README）语音备忘录转写（`README.zh-CN.md:22`） | `stt:` 配置 + `transcription_*.py`（local faster-whisper / groq / openai / mistral / xai / elevenlabs） | ✅ 实现 |
| 16 | 文档站 15 个章节（`README.md:165-185`） | `website/docs/` 目录实测齐全（user-guide / developer-guide / reference / integrations） | ✅ 实现 |
| — | **快捷输入**（README 未列） | `apps/desktop/electron/quick-entry.ts` 全套（§6） | 代码有、README 未宣称（正向） |
| — | **看板/群聊/Bot Mode/多网关**（README 表格未列，但文档站有专页） | `plugins/kanban/`、`gateway/hosted_rooms*`、`bot-mode.md`、`multi-connection-desktop.md` | 代码有、README 主表未宣称（正向） |

**"README 宣称、未见实现"结论：0 条。** 唯一的不一致是中文 README 的"六种后端"过期（英文 7 种、代码 7 种）。README 未宣称但存在的功能多条（快捷输入、看板、Bot Mode 群聊、多网关注册表）。

---

## 13. 可移植清单（供 HTML 原型分批还原）

判据：**纯数据/纯逻辑 = 可直接搬进 HTML 原型**（JSON 数据结构 + JS 等价逻辑 + React/DOM UI）；**依赖系统能力 = 需模拟或 Swift 实现**（全局热键、真实渠道协议、子进程、OS 集成）。

### A 批：纯数据/纯逻辑 —— 可直接搬（高保真）

| 功能 | Hermes 依据 | 原型形态 | 备注 |
|---|---|---|---|
| 任务看板数据模型 | `hermes_cli/kanban_db.py:875-1075`（7 表 DDL）+ `:695 Task` + `:103 状态机` | JSON/IndexedDB 表 + 状态机（JS） | 字段 1:1 映射；`claim_task` CAS 可用乐观锁模拟 |
| 看板 dispatcher 逻辑 | `kanban_db_dispatch.py:1953/2025/1525`（tick、lane、respawn guard、熔断） | setInterval tick + 纯函数 guard | 不 spawn 真子进程，改"假装认领+模拟进度" |
| 看板 REST/WS API 面 | `plugin_api.py:347/367/423/680/1769`、`kanban.md:871-894` | mock 同形 API（MSW/fake） | 路由与载荷照抄 |
| Kanban CLI 动词面 | `kanban_parser.py:150`（54 动词） | 命令面板/右键菜单项 | 纯 UI 映射 |
| 群聊房间事件模型 | `gateway/hosted_rooms.py:56/857/942`（事件种类、幂等追加、控制事件） | 事件溯源 array + reducer | 幂等规则（同 id 同容=回执）易实现 |
| 房间轮次策略 | `gateway/hosted_room_discussion.py:617 plan_next_task`（**纯函数无 I/O**，3 轮×10 消息、@mention 选人、watermark 增量） | **原样移植成 JS**（最高价值件之一） | 可直接单测；prompt 拼接 `_build_prompt :519` 同搬 |
| 成员管理（2~6 校验、双入口收敛） | `group-chat-view-members.tsx:49/84` + `validate_roster :253` | React 组件 + 校验函数 | 原型现有 React 栈直接对口 |
| 会话键/路由规则 | `gateway/session.py:682 build_session_key`、`profile_routing.py:56/74`（特异度评分） | 纯函数 | `group_sessions_per_user` 语义照搬 |
| 授权判定链 | `gateway/authz_mixin.py:614-697`（顺序逻辑本身） | 纯函数链（假凭据） | UI 上可做成"权限配置预览" |
| Profiles 目录结构 + `profile.yaml` schema | `profiles.md:9-14`、`profiles.py:857-945` | 侧栏角色列表 + 表单 schema | 隔离=原型里的"角色切换器"，选中态存 localStorage |
| 记忆文件格式与渲染 | `memory_tool_store.py:23/88/463`（§ 分隔、% 占用头）、`memory.md:39-53` | 文本存储 + 渲染器 | 字符上限/条目增删改查全可搬 |
| 注入时机语义 | 冻结快照（`memory.md:57`）+ 每轮 prefetch 块（`turn_context.py:862`） | 会话开始拼 prompt / 轮旁挂 context 标签 | 纯 prompt 工程 |
| 会话搜索（FTS 结果形态） | `session_search_tool.py:619` 返回形 + `hermes_state_search.py:1062` | mock 搜索 + 摘要 | 原型可对历史 JSON 直接做 includes/分词 |
| Archived Chats 全语义 | §10（双标记、人归/自归不可混、pin 豁免、恢复面） | 列表过滤 + 两枚布尔 + 恢复按钮 | 完全纯数据 |
| Providers 注册表与切换 | `providers/base.py:42 ProviderProfile`、`model_switch.py:1741` 流水线、39 provider 目录 | 设置页 provider 卡片 + `/model` 命令面板 | 字段照 §9.4；切换只改状态不发真请求（或 mock） |
| Gateway/Model 配置 schema 与编辑器 | §11 全部表 + `cli-config.yaml.example` | 设置页表单生成器 | 样例值直接可填 |
| 多网关注册表 | `connection-registry.ts:40-116`（version/kind/label/primary/launchMode/quarantine） | 设置 → Gateways 列表页 | 加删改、去重规则、四类卡片全可搬 |
| 平台能力矩阵/工具集 | `platform_toolsets` 样例（`cli-config.yaml.example:1411-1424`、预设注释 `:1385-1410`）、`TOOLSETS`（`toolsets.py:77`） | 平台配置页的 chips | 纯数据 |
| Cron schedule 解析与 job 字段 | `cron/jobs.py:773 parse_schedule`（duration/every/5-field/ISO）+ `:1800 create_job` 字段 | 定时任务表单 + 解析器（可移植） | 执行用假 timer |
| 插件 manifest/hook 面 | `plugins/AGENTS.md:55-62` 表、`VALID_HOOKS`（`plugins.py:109-200`） | 插件页：开关 + hook 列表（只读展示） | 原型可做"插件卡"UI |
| 快捷输入**设置与校验逻辑** | `quick-entry.ts:31-207`（accelerator 词表+规范化）、`store/quick-entry.ts` | 设置页录制器 + 校验纯函数 | 键位表可 1:1 移植 |

### B 批：依赖系统能力 —— 需模拟或 Swift 实现

| 功能 | 为什么搬不动 | 原型策略 |
|---|---|---|
| **快捷输入本体**（全局热键 + 置顶浮窗） | Electron `globalShortcut` + NSPanel（§6）—— 浏览器内无全局热键 | HTML 内：⌘K/自定义键唤起**页内浮条**（模拟）；真·全局热键 → Swift 侧实现（`RegisterEventHotKey`/`NSEvent` 全局监听 + `NSPanel`），对齐 `quick-entry.ts` 的 640×168/顶部 22%/blur 隐藏语义 |
| **真实渠道收发**（微信 iLink 长轮询、飞书 WS/webhook、QQ WebSocket、Telegram、Slack Socket…） | 全是服务端协议 + 常驻连接 + 密钥（§4.1） | 原型用**mock 渠道适配器**：照 `MessageEvent/SessionSource`（`event.py:36`、`session.py:66`）造事件注入；Swift 期再接真协议 |
| **飞书/QQ/微信扫码一键建 bot** | 依赖官方 device-code 端点 + 真凭证（§4.2） | UI 流程可 1:1 复刻（三步卡：init→二维码→poll），网络层 mock；真实接入留给 Swift/后端 |
| 网关进程与 dispatcher 落子 | `hermes -p … chat -q` 真子进程（`kanban_db_dispatch.py:2831`） | 原型把"worker"变成**进度动画/假日志**；或 Swift 后期真起进程 |
| Bot-to-bot `message_agent` 投递 | 跨进程/跨机投递（`tools/bot_mode_dm.py`） | 原型内 = 会话间写一条消息（纯数据），无需真投递 |
| 终端后端 7 种 | Docker/SSH/Modal… 真沙箱 | 原型只做**配置表单**（`cli-config.yaml.example:421-530` 样例照抄），不执行 |
| 记忆外部提供方（Honcho/mem0…） | 真网络 + OAuth | 展示层：卡片 + 连接状态 mock |
| 流式回复编辑（`streaming.*`、原生流四不变量） | 依赖平台 edit API | 原型用本地 setInterval 模拟"边生成边改"，语义（前缀稳定、finish 由消费者宣布）可保留 |
| Token locks / token 冲突检测 | 跨进程 OS 锁（`gateway/status.py`） | 原型存标记位即可 |
| macOS 系统集成（Dock/通知/钥匙串 token 信封 `connection-registry.ts:60-66`） | 系统 API | 浏览器：localStorage/假加密；真信封留给 Swift |
| Cron 真投递到平台 | 需渠道+进程 | 原型：到点弹 toast（纯 UI） |

### 建议批次

1. **第一批（纯还原）**：看板（表+状态机+dispatcher 逻辑+API 形状）→ 群聊房间（事件模型+`plan_next_task`+成员管理）→ 归档会话。
2. **第二批（纯还原）**：Profiles/角色切换（目录结构+`profile.yaml` 表单）→ 记忆（两文件+冻结快照注入）→ Providers/`/model` 切换 → Gateway/Model 配置 schema 编辑器。
3. **第三批（模拟）**：多网关注册表页 → 快捷输入页内浮条（+设置录制器）→ mock 渠道消息流 → 飞书/QQ/微信"扫码建 bot"向导（网络 mock）。
4. **Swift 期**：真全局热键浮窗、真渠道适配器、真子进程 worker。

### 自查（用户点名 12 项 → 章节与行号证据）

1. 架构总览 → §1（`architecture.md:11/51/138`，`cli.py:1668`，`gateway/run.py:5818`，`hermes_cli/config.py:2123`，`gateway/config_loader.py:379`）
2. 群聊 bot → §2（`hosted_rooms.py:857`，`session.py:682`，`authz_mixin.py:614`，`hosted_room_discussion.py:617`，`group-chat-view-members.tsx:84`，`kanban_db_dispatch.py:2831`）
3. 任务看板（插件）→ §3（`kanban_db.py:875/2269`，`kanban_db_dispatch.py:1953`，`plugin_api.py:347/1769`，`plugins/AGENTS.md:53`）
4. 多渠道通讯 + 飞书一键创建 → §4（`config.py:217`，`feishu/adapter.py:4348/4258/4113/1429`，`weixin.py:594`，`qqbot/onboard.py:85`）
5. 多网关 Gateways → §5（`connection-registry.ts:47/49/94`，`main.ts:1165`，`relay/descriptor.py:21`，`peer.py:36`，`multiplexing-gateway.md`）
6. 快捷输入 → §6（`quick-entry.ts:19/330/401`，`main.ts:15052/15194/18302`，`use-quick-entry-bridge.ts:53`）
7. 多角色隔离 → §7（`hermes_constants.py:111`，`profiles.py:857/900`，`profiles.md:9-14`，`profile-switcher.tsx`）
8. 记忆设计 → §8（`memory_tool_store.py:23/88/463`，`system_prompt.py:516`，`turn_context.py:862`，`memory_manager.py:336/447/533`）
9. 多提供商 → §9（`providers/__init__.py:121/158/556`，`base.py:42`，`model_switch.py:1741`）
10. Archived Chats → §10（`hermes_state_common.py:433`，`hermes_state_sessions.py:923/1791`，`config_defaults.py:2275-2279`，`web_routers/sessions.py:180/796-798`）
11. 配置 schema → §11（`gateway/config.py:586/410/341/488`，`cli-config.yaml.example:72/1003/1349`，`.env.example:387+`）
12. 可移植清单 → §13（A/B 两批 + 4 批次建议）
