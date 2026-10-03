/* ============================================================
   全功能 · 项目工作区 v2
   左栏复刻小米 MiMo（256pt 实测），正文参考 Orca 工具栏与豆包分割线。
   真的：项目栏/菜单/折叠、默认卡片（不加项目=临时对话）、多标签、
        面包屑+搜索+路径复制、md 渲染与点行编辑、HTML/PDF 窗口内预览、
        mermaid 脑图与折叠、每文件 10 条历史与恢复、多选重点参考、
        布局切换（对话右⇄中）、分割线拖拽、骨架首屏计时。
   演示：对话回复=本地规则；文件存浏览器本地；「在访达中显示」=提示。
   ============================================================ */
(() => {
'use strict';

const LS_KEY = 'wanna-workspace-v2';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const now = () => Date.now();
const fmtTime = ts => {
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const escapeHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const extOf = rel => (rel.split('.').pop() || '').toLowerCase();
const iconFor = rel => {
  if (/^(https?:|about:|data:)/i.test(rel || '')) return { cls: 'web', label: 'WEB' };  // §22.14 浏览器标签
  const e = extOf(rel);
  const map = { md:'md', html:'html', htm:'html', pdf:'pdf', js:'js', mjs:'js', json:'json', txt:'txt' };
  const cls = map[e] || 'txt';
  const label = { md:'MD', html:'HTM', pdf:'PDF', js:'JS', json:'{}', txt:'TXT', mmd:'MMD' }[e] || e.slice(0,3).toUpperCase() || 'FILE';
  return { cls, label };
};

/* ── 样例项目 ───────────────────────────────── */
function sampleProject() {
  return {
    id: 'p1', name: '我的笔记项目', path: '/Users/mjm/Documents/SuperAgent/我的笔记项目',
    pinned: false, open: true,
    // §23.4.13 右侧「智能体 · 会话历史」要能真的列出会话 —— 样例项目自带两条
    // （AiVaultSession 从 p.chats 拼出来，一条都没有时面板只有一句「没有匹配的会话」）
    chats: [
      { id: 'c1', sid: 'sess-8f21', title: '竞品对比补一栏价格', ts: Date.now() - 3600e3, msgs: 12,
        sub: 2, model: 'claude-sonnet-4', preview: '价格表还差 Orca 那一列，先记下来别忘了' },
      { id: 'c2', sid: 'sess-3a07', title: '脑图改成左右两栏', ts: Date.now() - 7200e3, msgs: 5,
        sub: 0, model: 'gpt-5-codex', preview: '脑图根节点拆成「内容 / 对话」两支' }
    ],
    files: {
      'README.md': `# 我的笔记项目\n\n每一轮对话都会自动带上项目路径。\n\n## 这个页面怎么用\n\n- 左边点文件 → 自动加进 **重点参考**（可多选），并携带项目绝对路径\n- 中间「正文」可以**点预览的任意一行就地编辑**，按 ESC 回到预览\n- 「脑图」是 mermaid，**代码可以折叠**\n- 右边围绕项目提问，也能让它改脑图 —— **任何一次编辑都会自动备份历史（每文件最近 10 次）**\n\n## 待办\n\n- [ ] 把会议纪要里的三条结论并进脑图\n- [ ] 竞品对比补一栏价格\n`,
      '脑图.mmd': `mindmap\n  root((我的笔记项目))\n    会议\n      09-30 评审\n        结论：先做左 80% 工作区\n      待办清单\n    内容\n      正文 README\n      网页 示例\n      竞品对比\n    对话\n      连续对话\n      临时对话\n      语音\n`,
      'notes/2026-09-30-会议.md': `# 09-30 评审\n\n**结论**：先做「左 80% 工作区 + 右对话」的骨架，脑图用 mermaid。\n\n1. 入口：模式条「视频」右侧的「全功能」按钮\n2. 顶部模式条（图文 / 语音 / 视频）保持不变\n3. 任何一次编辑都要自动备份历史\n`,
      'notes/灵感.md': `# 灵感\n\n- 脑图是**一个文件**，每次对话默认携带**项目文件夹**的绝对路径\n- 点文件 = 重点参考（**可多选**）\n- 对话可以直接改脑图，改完自动留一版历史\n- 不加项目文件夹时，左边只有「临时对话」默认卡片\n`,
      '资料/竞品对比.md': `# 竞品对比\n\n| 产品 | 文件树 | md 编辑 | 窗口内预览 | 对话改图 |\n|---|---|---|---|---|\n| VSCode | ✅ | ✅ | 插件 | — |\n| 小米 MiMo | ✅ | ❌ | 只能外开 | — |\n| Orca | — | ✅ | ✅ | — |\n\n> 我的特点：**自己创建这个功能**，并复用当前软件的内容逻辑。\n`,
      '网页/示例.html': `<!DOCTYPE html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>样例页面</title>\n<style>\n body{font-family:-apple-system,"PingFang SC",sans-serif;background:#0E1116;color:#E6EDF3;margin:0;padding:36px;line-height:1.7}\n h1{color:#58A6FF;font-size:26px} h2{color:#79C0FF;font-size:19px;margin-top:28px}\n .tag{display:inline-block;background:#1F6FEB;color:#fff;border-radius:6px;padding:2px 9px;font-size:12px;margin-right:6px}\n code{background:#161B22;border:1px solid #30363D;border-radius:5px;padding:1px 6px;color:#7EE787}\n .card{background:#161B22;border:1px solid #30363D;border-radius:12px;padding:18px 20px;margin-top:18px}\n</style></head><body>\n <span class="tag">HTML</span><span class="tag">窗口内直接预览</span>\n <h1>示例页面 —— 不用打开浏览器也能看</h1>\n <p>小米 MiMo 的 HTML 只能在浏览器里打开；<b>我们直接在窗口里显示</b>（这是对它的优化）。</p>\n <div class="card"><h2>同一页里还能放</h2><p>标题、列表、<code>行内代码</code>、卡片…… 组件都能显示。</p></div>\n</body></html>`,
      '资料/样例.pdf': '__PDF__'
    },
    tree: [
      { name:'README.md', type:'file' },
      { name:'脑图.mmd', type:'file' },
      { name:'notes', type:'dir', open:true, children:[
        { name:'2026-09-30-会议.md', type:'file' },
        { name:'灵感.md', type:'file' } ] },
      { name:'网页', type:'dir', open:false, children:[ { name:'示例.html', type:'file' } ] },
      { name:'资料', type:'dir', open:true, children:[
        { name:'竞品对比.md', type:'file' },
        { name:'样例.pdf', type:'file' } ] }
    ]
  };
}

/// §35.19 station（图片生成项目，docker 项目）—— 树生成自真实磁盘 /Users/mjm/Documents/SuperAgent/APP/Docker/station
function stationProjectSeed() {
  return {
    id: 'station', name: 'station', path: '/Users/mjm/Documents/SuperAgent/APP/Docker/station',
    files: {
      "docker-compose.local.yml": "# Station 本地模式数据库\n# 本地模式的数据存放在本机 Docker 的 Postgres 中，开箱即用、无需额外配置。\n# 启动：docker compose -f docker-compose.local.yml up -d\n# 端口 5433 避免与常见本地 Postgres(5432) 冲突；数据持久化在 station-local-db 卷中。\nservices:\n  db:\n    image: postgres:16-alpine\n    container_name: station-local-db\n    restart: unless-stopped\n    environment:\n      POSTGRES_USER: station\n      POSTGRES_PASSWORD: station\n      POSTGRES_DB: station\n    ports:\n      - \"5433:5432\"\n    volumes:\n      - station-local-db:/var/lib/postgresql/data\n    healthcheck:\n      test: [\"CMD-SHELL\", \"pg_isready -U station -d station\"]\n      interval: 5s\n      timeout: 3s\n      retries: 20\n\nvolumes:\n  station-local-db:\n"
,
      "index.html": "<!doctype html>\n<html lang=\"zh-CN\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>Station</title>\n  </head>\n  <body class=\"bg-graphite-950\">\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/main.tsx\"></script>\n  </body>\n</html>\n"
,
      "package.json": "{\n  \"name\": \"station\",\n  \"private\": true,\n  \"version\": \"0.1.0\",\n  \"type\": \"module\",\n  \"scripts\": {\n    \"dev\": \"vite --config vite.config.ts\",\n    \"dev:web\": \"vite --config vite.config.ts --host 0.0.0.0 --port 1420\",\n    \"build\": \"tsc -b && vite build --config vite.config.ts\",\n    \"build:web\": \"tsc -b && vite build --config vite.config.ts\",\n    \"preview\": \"vite preview --config vite.config.ts --host 0.0.0.0 --port 4173\"\n  },\n  \"dependencies\": {\n    \"react\": \"^18.3.1\",\n    \"react-dom\": \"^18.3.1\",\n    \"react-router-dom\": \"^6.30.1\",\n    \"recharts\": \"^2.15.3\"\n  },\n  \"devDependencies\": {\n    \"@types/node\": \"^22.15.32\",\n    \"@types/react\": \"^18.3.12\",\n    \"@types/react-dom\": \"^18.3.1\",\n    \"@vitejs/plugin-react\": \"^4.3.4\",\n    \"autoprefixer\": \"^10.4.20\",\n    \"lucide-react\": \"^0.511.0\",\n    \"postcss\": \"^8.5.3\",\n    \"react-icons\": \"^5.5.0\",\n    \"tailwind-merge\": \"^2.5.5\",\n    \"tailwindcss\": \"3.4.17\",\n    \"tailwindcss-animate\": \"^1.0.7\",\n    \"typescript\": \"^5.8.3\",\n    \"vite\": \"^5.4.19\"\n  }\n}\n"
,
      "README.md": "## Station\n\n`Station` 是一个 **面向 Web 部署、纯文件持久化** 的媒体工作台。\n\n### 当前实现\n\n- `Node.js/Fastify` 提供后端接口\n- `React + Vite + Tailwind` 作为前端界面\n- 不使用任何数据库，所有元数据、历史、任务和配置都落到文件系统\n- 图片生成通过 Web 接口链路处理\n\n### 开发命令\n\n```bash\nnpm install\nnpm run dev:web\n```\n\n### 构建命令\n\n```bash\nnpm run build\n```\n\n### 标准部署（唯一推荐）\n\n- 唯一检查清单：`DEPLOY_CHECKLIST.md`\n- 唯一部署脚本：`scripts/deploy_release.sh`\n- 这套脚本已经做过一次真实闭环验证，并会在 PM2 重启后自动等待 `/health` 成功，再判定部署完成\n\n先执行：\n\n```bash\ngit add .\ngit commit -m \"这次修改说明\"\ngit push origin main\n```\n\n再执行：\n\n```bash\nbash scripts/deploy_release.sh\n```\n\n这套方法的核心是：\n\n- 本地代码先 push 到 GitHub\n- 服务器直接从 GitHub 私有仓库拉指定 commit\n- 服务器生成新 release\n- 切换 `/var/www/station/current`\n- 保留 `/var/www/station/shared/server.env`\n- 保留 `/var/www/station/shared/data`\n- 保留 `/var/www/station/shared/logs`\n"
    },
    tree: [
      { name:"dist", type:'dir', open:false, children:[
        { name:"assets", type:'dir', open:false, children:[] },
        { name:"hot-play-cards", type:'dir', open:false, children:[] },
        { name:"hot-play-bg-monitor.jpg", type:'file' },
        { name:"hot-play-bg.jpg", type:'file' },
        { name:"hot-play-hero.png", type:'file' },
        { name:"index.html", type:'file' }
      ] },
      { name:"docs", type:'dir', open:false, children:[
        { name:"architecture.md", type:'file' },
        { name:"enterprise-storage.md", type:'file' },
        { name:"file-persistence.md", type:'file' },
        { name:"performance-budget.md", type:'file' },
        { name:"runtime-checklist.md", type:'file' }
      ] },
      { name:"public", type:'dir', open:false, children:[
        { name:"hot-play-cards", type:'dir', open:false, children:[] },
        { name:"hot-play-bg-monitor.jpg", type:'file' },
        { name:"hot-play-bg.jpg", type:'file' },
        { name:"hot-play-hero.png", type:'file' }
      ] },
      { name:"scripts", type:'dir', open:false, children:[
        { name:"check_tos.sh", type:'file' },
        { name:"configure_tosutil.sh", type:'file' },
        { name:"deploy_release.sh", type:'file' },
        { name:"install_tosutil.sh", type:'file' },
        { name:"python_requirements.txt", type:'file' },
        { name:"station_provider_runner.py", type:'file' },
        { name:"volc_tos_project_storage.py", type:'file' },
        { name:"volc_tos_upload.py", type:'file' }
      ] },
      { name:"server", type:'dir', open:false, children:[
        { name:"data", type:'dir', open:false, children:[] },
        { name:"data-local", type:'dir', open:false, children:[] },
        { name:"sql", type:'dir', open:false, children:[] },
        { name:"src", type:'dir', open:false, children:[] },
        { name:".env", type:'file' },
        { name:"package-lock.json", type:'file' },
        { name:"package.json", type:'file' },
        { name:"tsconfig.json", type:'file' }
      ] },
      { name:"src", type:'dir', open:false, children:[
        { name:"boot", type:'dir', open:false, children:[] },
        { name:"bridge", type:'dir', open:false, children:[] },
        { name:"features", type:'dir', open:false, children:[] },
        { name:"lib", type:'dir', open:false, children:[] },
        { name:"shared", type:'dir', open:false, children:[] },
        { name:"styles", type:'dir', open:false, children:[] },
        { name:"main.tsx", type:'file' },
        { name:"vite-env.d.ts", type:'file' }
      ] },
      { name:"test-inputs", type:'dir', open:false, children:[
        { name:"测试.jpeg", type:'file' }
      ] },
      { name:"test-results", type:'dir', open:false, children:[
        { name:"dev-image-jobs", type:'dir', open:false, children:[] }
      ] },
      { name:".gitignore", type:'file' },
      { name:".mcp.json", type:'file' },
      { name:"a-preview-manual-import-final.yml", type:'file' },
      { name:"after-wait.yml", type:'file' },
      { name:"AGENTS.md", type:'file' },
      { name:"antmoo-homepage.html", type:'file' },
      { name:"b-preview-restored-final.yml", type:'file' },
      { name:"blackpage.yaml", type:'file' },
      { name:"CLAUDE.md", type:'file' },
      { name:"DEPLOY_CHECKLIST.md", type:'file' },
      { name:"docker-compose.local.yml", type:'file' },
      { name:"index.html", type:'file' },
      { name:"optimizer-after-fix.yml", type:'file' },
      { name:"optimizer-area-expanded-final.yml", type:'file' },
      { name:"optimizer-layout-after-scrollbar-fix.yml", type:'file' },
      { name:"optimizer-layout-filled-after-fix.yml", type:'file' },
      { name:"optimizer-layout-final-after-fix.yml", type:'file' },
      { name:"optimizer-ui-after-api.yml", type:'file' },
      { name:"package-lock.json", type:'file' },
      { name:"package.json", type:'file' },
      { name:"page-check.png", type:'file' },
      { name:"postcss.config.cjs", type:'file' },
      { name:"prompt-cloud-tags-final.yml", type:'file' },
      { name:"README.md", type:'file' },
      { name:"station-after-add.yml", type:'file' },
      { name:"station-after-complete.yml", type:'file' },
      { name:"station-after-fix-click-2s.yml", type:'file' },
      { name:"station-after-fix-reload.yml", type:'file' },
      { name:"station-after-generate-2s.yml", type:'file' },
      { name:"station-after-prompt.yml", type:'file' },
      { name:"station-after-refresh-fix.png", type:'file' },
      { name:"station-after-refresh-fix.yml", type:'file' },
      { name:"station-after-remove-refresh-fix.png", type:'file' },
      { name:"station-after-wait.yml", type:'file' },
      { name:"station-audio-after-click.yml", type:'file' },
      { name:"station-audio-before.yml", type:'file' },
      { name:"station-audio-clone.yml", type:'file' },
      { name:"station-audio-system.yml", type:'file' },
      { name:"station-batch-after-click.yml", type:'file' },
      { name:"station-batch-test-before.yml", type:'file' },
      { name:"station-before.yaml", type:'file' },
      { name:"station-fullscreen-check.yaml", type:'file' },
      { name:"station-keyboard-focused-right.yml", type:'file' },
      { name:"station-keyboard-right.yml", type:'file' },
      { name:"tailwind.config.d.ts", type:'file' },
      { name:"tailwind.config.js", type:'file' },
      { name:"tailwind.config.ts", type:'file' },
      { name:"tsconfig.app.json", type:'file' },
      { name:"tsconfig.app.tsbuildinfo", type:'file' },
      { name:"tsconfig.json", type:'file' },
      { name:"tsconfig.node.json", type:'file' },
      { name:"tsconfig.node.tsbuildinfo", type:'file' },
      { name:"users-flat-ui-verified.png", type:'file' },
      { name:"vite.config.d.ts", type:'file' },
      { name:"vite.config.js", type:'file' },
      { name:"vite.config.ts", type:'file' }
    ]
  };
}

/* 最小可渲染 PDF（浏览器会重建 xref） */
function samplePDF() {
  const body = 'BT /F1 26 Tf 72 700 Td (Wanna sample PDF) Tj ET';
  const objs = [
    `<</Type/Catalog/Pages 2 0 R>>`,
    `<</Type/Pages/Kids[3 0 R]/Count 1>>`,
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>`,
    `<</Length ${body.length}>>\nstream\n${body}\nendstream`,
    `<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>`
  ];
  let pdf = '%PDF-1.4\n', offsets = [0];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i+1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) pdf += String(offsets[i]).padStart(10,'0') + ' 00000 n \n';
  pdf += `trailer\n<</Size ${objs.length+1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

/* ── 状态 ───────────────────────────────────── */
let S = load() || {
  projects: [sampleProject(), stationProjectSeed(), defaultProjectSeed()],   // §35.19 station（图片生成·docker 项目）入导航   // §20.9：末尾那个是「默认」项目文件夹
  activeProject: 'p1',
  tempMode: false,                 // 默认卡片（不加项目 = 临时对话）是否选中
  projectMode: true,              // **项目模式**（需求 §12.0）：进来就是项目模式，点「项目」退回对话模式
  plans: [{ id:'t1', title:'规划 · 先做左 80% 工作区', ts: Date.now() }],
  activePlan: null,
  tabs: [{ p:'p1', f:'README.md' }],
  activeTab: 0,
  currentFile: 'README.md',
  focusFiles: [],                 // 重点参考只由 ⌘单击 / Shift单击 决定（§12.2）
  tab: 'md',
  mdVariant: 'preview',           // §22.9.1 默认**预览**（code | preview | split）
  codeFolded: true,                 // §22.9.2 脑图**默认折叠代码**
  collapsed: {},
  mindZoom: 1,
  layout: 'right',                 // 对话在右 ⇄ 对话在中
  navOpen: true,
  recentOpen: true,
  mode: 'imageText',
  chatMode: 'continuous',
  speechRate: 1,                   // §20.5 语速档（0.75 / 1 / 1.25 / 1.5 / 2）
  composerExpanded: false,         // §21.5 输入框展开态（点顶边手柄切换）
  sendPolicy: 'queue',             // §22.13 发送方式：queue=排队（默认）/ interrupt=打断
  dualScreen: false,               // §26 双屏 = 右侧一个**完全独立**的对话界面（默认临时）
  finderOpen: false, finderSide: null, finderSideR: null, finderColsDefault: null,   // §34 访达（开关/左右收藏栏/默认列）
  finderHotkeys: null,             // §41.8 访达快捷键覆盖（null=用 FP_HOTKEY_DEFAULTS；整对象存盘）
  chat2: [],                       // §26 右侧独立会话的消息（与 S.chat 互不相通）
  chat2Mode: 'temporary',          // §26 右侧默认就是「临时」
  speechRate2: 1,                  // §26 右侧独立语速
  soundOn: true,                   // §26 「声音」开关的真实状态（语音模式下回答会朗读）
  permission: 'full',              // §27 审批权限：default / approve / full（照 MiMo 三档）
  protoModel: 'qwen3-vl-plus',     // §27 输入框里切的模型（显示名照当前软件用的那套）
  uiStyle: '',                     // §28 界面风格：''=当前 / 'orca' / 'contrast'（只换 CSS 变量）
  // §22.11 快捷指令：一个按钮替换一行动作（字段照用户那张「添加快捷命令」图）
  quickCommands: [{ id: 'qc_gt', label: 'GT推送', op: 'terminal',
                    cmd: 'git push origin main', append: true, scope: 'global', project: '' }],
  quickCommandActive: 'qc_gt',
  sendQueue: [],                   // §22.13 排队中的消息
  tabsVertical: false,             // §21.2 标签显示方式：false=横向（默认）/ true=垂直
  tabGroups: [],                   // §21.4 标签组：[{ name, color, open }]
  // §23.7 侧栏**项目分组**（Orca 的 ProjectGroup，与标签组/对话分组是三套东西）
  projectGroups: [],               // [{ id, name, color, isCollapsed, createdFrom }]
  splitSide: null,                 // §22.10 拆分半屏在哪一侧（null = 不拆）
  tvWidth: 268,                    // §22.1.2 垂直标签列宽（可拖）
  // §23 左右面板 / 自动化 / ⌘J
  sidePanel: null,                 // null | 'explorer' | 'agents'
  paletteShortcut: 'meta+j',       // §23.6.5 命令面板快捷键（可在 ⚙ 设置 → 快捷键 里改）
  sideView: 'names',               // 资源管理器：Names / Contents（Orca 是两个视图，不是一次分两组）
  sideQuery: '',
  explorerCollapsed: {},
  automationOpen: false,
  automations: [],
  automationFilter: {},
  vaultScope: 'workspace', vaultHost: 'local', vaultAgents: [], vaultGroup: 'project',
  vaultHideEmpty: false, vaultLimit: 100, vaultQuery: '', vaultOpen: {}, vaultGroupsCollapsed: {},
  vaultSort: 'updated', vaultDeleted: [],
  // §22.14 浏览器页 —— 形状照 reference/Orca …/shared/browser-workspace-types.ts:174-180
  browserProfiles: [{ id: 'default', label: 'Default', engine: 'Safari', scope: 'default' },
                    { id: 'google',  label: 'Google',  engine: 'Chrome',  scope: 'isolated' }],
  browserProfile: 'default',
  browserCookies: [],
  browserSettings: { doNotTrack: true, blockPopups: false, homePage: 'https://www.bing.com' },
  searchScope: 'project',          // §20.11 范围：项目区（默认）/ 默认区 / 本地计算机
  searchTypes: { folder: true, file: true, content: false },   // 「文件内容」默认不勾
  history: {},
  gitLog: [],
  chat: [],
  recent: []
};

function load() {
  try {
    const r = JSON.parse(localStorage.getItem(LS_KEY));
    if (!r || !Array.isArray(r.projects)) return null;
    // §20.9：老存档里没有「默认」这个项目文件夹 —— 补一个（放末尾，免得抢走 S.projects[0] 的兜底）
    if (!r.projects.some(p => p && p.isDefault)) r.projects.push(defaultProjectSeed());
    // §35.19 station 入库：seed 只在全新状态生效，老存盘靠这条迁移补（放第 2 位）
    if (!r.projects.some(p => p && p.id === 'station')) r.projects.splice(1, 0, stationProjectSeed());
    if (!Array.isArray(r.focusFiles)) r.focusFiles = [];
    // 老数据是字符串 rel → 迁成 {p,f}（跨项目多选要分清是哪个项目）
    if (r.focusFiles.some(x => typeof x === 'string')) {
      const defP = r.activeProject || (r.projects && r.projects[0] && r.projects[0].id) || null;
      r.focusFiles = r.focusFiles.filter(x => typeof x === 'string').map(x => ({ p: defP, f: x }));
    }
    if (!Array.isArray(r.tabs)) r.tabs = [];
    if (!Array.isArray(r.plans)) r.plans = [];          // v2→v3：补「临时规划」块
    if (typeof r.projectMode !== 'boolean') r.projectMode = !!(r.projects && r.projects.length);
    if (!Array.isArray(r.recent)) r.recent = [];
    if (typeof r.activePlan === 'undefined') r.activePlan = null;
    // §20.3：「查看代码」那颗按钮删了 —— 老存档里的 code 态在屏幕上再没有出口，迁回分栏
    if (r.mdVariant === 'code') r.mdVariant = 'preview';   // §22.9：「查看代码」没了，默认给预览
    if (typeof r.speechRate !== 'number') r.speechRate = 1;   // §20.5 语速档
    // §20.11 搜索：范围默认「项目区」，内容类型默认 文件夹+文件、**文件内容不勾**
    if (r.searchScope !== 'project' && r.searchScope !== 'default' && r.searchScope !== 'computer') r.searchScope = 'project';
    const t = r.searchTypes && typeof r.searchTypes === 'object' ? r.searchTypes : {};
    r.searchTypes = { folder: t.folder !== false, file: t.file !== false, content: !!t.content };
    // §21 新字段
    if (typeof r.composerExpanded !== 'boolean') r.composerExpanded = false;
    if (r.sendPolicy !== 'interrupt') r.sendPolicy = 'queue';
    if (typeof r.dualScreen !== 'boolean') r.dualScreen = false;
    if (typeof r.finderOpen !== 'boolean') r.finderOpen = false;
    if (r.finderSide && !Array.isArray(r.finderSide)) r.finderSide = null;
    if (r.finderSideR && !Array.isArray(r.finderSideR)) r.finderSideR = null;
    if (r.finderColsDefault && !Array.isArray(r.finderColsDefault)) r.finderColsDefault = null;
    if (!Array.isArray(r.chat2)) r.chat2 = [];
    if (r.chat2Mode !== 'continuous') r.chat2Mode = 'temporary';
    if (typeof r.speechRate2 !== 'number') r.speechRate2 = 1;
    if (typeof r.soundOn !== 'boolean') r.soundOn = true;
    if (r.permission !== 'default' && r.permission !== 'approve') r.permission = 'full';
    if (typeof r.protoModel !== 'string' || !r.protoModel) r.protoModel = 'qwen3-vl-plus';
    if (r.uiStyle !== 'orca' && r.uiStyle !== 'contrast') r.uiStyle = '';
    if (r.sidePanel !== 'explorer' && r.sidePanel !== 'agents') r.sidePanel = null;
    if (typeof r.paletteShortcut !== 'string' || !r.paletteShortcut) r.paletteShortcut = 'meta+j';
    if (r.sideView !== 'contents') r.sideView = 'names';
    if (typeof r.sideQuery !== 'string') r.sideQuery = '';
    if (!r.explorerCollapsed || typeof r.explorerCollapsed !== 'object') r.explorerCollapsed = {};
    if (typeof r.automationOpen !== 'boolean') r.automationOpen = false;
    if (!Array.isArray(r.automations)) r.automations = [];
    if (!r.automationFilter || typeof r.automationFilter !== 'object') r.automationFilter = {};
    if (!Array.isArray(r.vaultAgents)) r.vaultAgents = [];
    if (!r.vaultOpen || typeof r.vaultOpen !== 'object') r.vaultOpen = {};
    if (r.vaultSort !== 'created' && r.vaultSort !== 'updated') r.vaultSort = 'updated';
    if (!Array.isArray(r.vaultDeleted)) r.vaultDeleted = [];
    if (!r.vaultGroupsCollapsed || typeof r.vaultGroupsCollapsed !== 'object') r.vaultGroupsCollapsed = {};
    if (!Array.isArray(r.quickCommands)) r.quickCommands = [{ id: 'qc_gt', label: 'GT推送', op: 'terminal',
      cmd: 'git push origin main', append: true, scope: 'global', project: '' }];
    if (!r.quickCommandActive) r.quickCommandActive = 'qc_gt';
    if (!Array.isArray(r.sendQueue)) r.sendQueue = [];
    if (typeof r.tabsVertical !== 'boolean') r.tabsVertical = false;
    if (!Array.isArray(r.tabGroups)) r.tabGroups = [];
    if (!Array.isArray(r.projectGroups)) r.projectGroups = [];
    (r.projects || []).forEach(pp => { if (pp && pp.sleeping === undefined) pp.sleeping = false; });
    (r.projects || []).forEach(pp => { if (pp && !Array.isArray(pp.extraPaths)) pp.extraPaths = []; });
    if (r.splitSide !== 'left' && r.splitSide !== 'right') r.splitSide = null;
    if (typeof r.tvWidth !== 'number') r.tvWidth = 268;
    if (!Array.isArray(r.browserProfiles) || !r.browserProfiles.length) {
      r.browserProfiles = [{ id: 'default', label: 'Default', engine: 'Safari', scope: 'default' },
                           { id: 'google',  label: 'Google',  engine: 'Chrome',  scope: 'isolated' }];
    }
    if (!r.browserProfile) r.browserProfile = 'default';
    if (!Array.isArray(r.browserCookies)) r.browserCookies = [];
    if (!r.browserSettings || typeof r.browserSettings !== 'object') {
      r.browserSettings = { doNotTrack: true, blockPopups: false, homePage: 'https://www.bing.com' };
    }
    // 老提交记录：`files` 曾经存的是**文件数（数字）** —— 归一成对象，否则下面按文件比对会错乱
    (r.gitLog || []).forEach((g, i) => {
      if (typeof g.files !== 'object' || g.files === null) {
        const n = typeof g.files === 'number' ? g.files : 0;
        g.count = g.count ?? n;
        g.files = {};
        g.legacy = true;                       // 老记录：没有内容，只能显示条数
      }
      if (!g.seq) g.seq = (r.gitLog.length - i);
      if (!g.ts) g.ts = Date.now();
    });
    return r;
  } catch { return null; }
}
let saveTimer = null;
function save(immediate = false) {
  clearTimeout(saveTimer);
  const doIt = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch {} };
  immediate ? doIt() : (saveTimer = setTimeout(doIt, 250));
}

/// 当前项目：先看 activeProject；它丢了（历史状态、规划切换…）就跟**当前标签**走 ——
/// 标签永远指向某个项目的文件，所以这条兜底保证 proj() 不会莫名变 null。
const proj = () => S.projects.find(p => p.id === S.activeProject)
  || (S.tabs[S.activeTab] ? S.projects.find(p => p.id === S.tabs[S.activeTab].p) : null)
  || realProjects()[0] || S.projects[0] || null;

/* ── §20.9 默认项目文件夹 ─────────────────────
   「默认」不是一个空壳：它**就是一个项目文件夹**（用户根目录），
   只是被钉在自己的区块里、不进「项目」列表 —— 除了这一点，与项目完全相同（§20.10）。
   ⚠️ `defaultProjectSeed` 会在 `load()` 里被调用（S 初始化那一行），
   所以它**只用字符串字面量**，不能引用下面任何 const —— 那时它们还在 TDZ 里。 */
const realProjects = () => S.projects.filter(p => p && !p.isDefault);
const defaultProject = () => S.projects.find(p => p && p.isDefault) || null;
const defaultFolderPath = () => (defaultProject() || {}).path || '/Users/mjm';
function defaultProjectSeed() {
  return {
    id: 'p_default', isDefault: true, name: '默认', path: '/Users/mjm',
    pinned: false, open: true,
    files: {
      '默认项目文件夹.md': `# 默认项目文件夹\n\n这一格就是**默认的项目文件夹** —— 默认指向计算机用户的根目录\n（\`/Users/mjm\`），可以在左栏点那一行改路径。\n\n## 它什么时候被用上\n\n- **没选任何项目**时（默认卡 / 临时对话），提问与内容参考都用这个文件夹\n- 快捷键触发的那一问，带的就是这个路径\n- 左栏顶部搜索的「**默认区**」搜的就是这里的文件\n\n> 这份文件是原型自带的样例内容（浏览器里没有真正的文件系统）。\n`,
    },
    tree: [{ name: '默认项目文件夹.md', type: 'file' }],
    chats: [],                        // ⚠️ 默认区的对话不放这里，放 S.plans（老数据都在那儿）
  };
}
/// §20.9.4：这一轮该带哪个文件夹 ——
/// 选了真项目（项目模式开着 / 点的是项目里的对话卡）就是那个项目；
/// 其余（默认卡、临时对话、编辑区关着）= **默认项目文件夹**（快捷键那一问带的就是它）。
function contextFolderPath() {
  const p = proj();
  return (p && !S.tempMode && (S.projectMode || !!S.activeProjChat)) ? p.path : defaultFolderPath();
}
const relOfActiveTab = () => (S.tabs[S.activeTab] || {}).f || null;
const fullPath = (rel, p = proj()) => p ? `${p.path}/${rel}` : rel || '';
const fileContent = rel => (proj() && proj().files[rel]) || '';
const MIND_FILE = '脑图.mmd';
const projectById = id => S.projects.find(x => x.id === id) || null;
const focusHas = (pid, rel) => (S.focusFiles || []).some(x => x && x.p === pid && x.f === rel);
function focusToggle(pid, rel) {
  if (focusHas(pid, rel)) S.focusFiles = (S.focusFiles || []).filter(x => !(x.p === pid && x.f === rel));
  else S.focusFiles = [...(S.focusFiles || []), { p: pid, f: rel }];
  save(); renderNav(); renderContext();
}
const histFile = () => S.currentFile || relOfActiveTab();

let toastTimer;
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('[data-jump-history]');
  if (a) { e.preventDefault(); const b = $('#btnHistoryHead'); b && b.click(); }
});
function toast(html) {
  const t = $('#toast'); if (!t) return;
  t.innerHTML = html; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2800);
}

/* ── 本软件风格的模态（§12.3：不许再用系统 prompt / confirm） ── */
// §19.2：「重点 N」展开 —— **document 级委托 + capture**。
// 不绑在按钮身上：按钮的 onclick 可能因为绑定时机/重建而失效（用户报"点了没反应"）；
// capture 先于气泡阶段的"点外面就关"跑，所以不会被自己关掉。
document.addEventListener('click', e => {
  const btn = e.target && e.target.closest && e.target.closest('#btnFocusMore');
  if (btn) { e.stopPropagation(); toggleFocusList(); }
}, true);

// §17.1「点外面就关菜单」只能挂在 **click 的气泡阶段**（bind() 里那条 document click）。
// ⚠️ 这里曾经是 `mousedown` + capture —— capture 先于菜单项收到 mousedown 就把菜单 hidden 掉，
// mouseup 于是落到 body，菜单项的 onclick **一次都不会执行**（实测：设置菜单点「对话在左」，
// 菜单自己关了、布局纹丝不动）。菜单在自己的动作里 closeMenus() 收场，外面那条 click 够用。
window.addEventListener('error', e => {
  // ⚠️ 只处理**脚本异常**。资源加载失败（favicon/图片 404）也会冒到 window.error，
  // 但 e.target 是那个元素、没有 e.message —— 不挡掉的话，任何一个 404 都会让
  // 屏幕上冒出「页面异常」，看起来就像按钮坏了（用户报的"总是页面异常"就有一半是它）。
  if (e && e.target && e.target !== window && e.target.tagName) return;
  const msg = (e && e.message) || '';
  if (!msg) return;
  console.error('[页面异常]', msg, e.error);
  if (typeof toast === 'function') toast('⚠️ 页面异常：' + msg);
});
let modalOnOk = null;
function openModal({ title, text = '', value = null, okText = '确定', onOk }) {
  $('#modalTitle').textContent = title;
  const t = $('#modalText'), i = $('#modalInput');
  t.hidden = !text; t.textContent = text || '';
  i.hidden = value === null; i.value = value === null ? '' : value;
  $('#modalOk').textContent = okText;
  modalOnOk = onOk || null;
  $('#modalBack').hidden = false;
  if (value !== null) { i.focus(); i.select(); }
  else $('#modalOk').focus();
}
function closeModal() { $('#modalBack').hidden = true; modalOnOk = null; }
function askModal(opts) { openModal({ okText: '确定', ...opts }); }
function confirmModal(opts) { openModal({ okText: '确定', ...opts }); }

/* ============================================================
   左栏：MiMo 式项目栏
   ============================================================ */
/// 单击重点参考标签 → 展开并滚到左边那个文件，闪一下（§15.9）
function locateFileInTree(rel, pid) {
  // 两个区块的树都在 #navScroll 下面（§20.9：「默认」也有一棵文件树）
  const row = [...document.querySelectorAll('#navScroll .node-row')]
    .find(x => x.dataset.rel === rel && (!pid || x.dataset.pid === pid));
  if (!row) { toast('这个文件不在当前展开的项目里'); return; }
  let el = row.parentElement;
  while (el && el !== document.getElementById('navScroll')) {
    if (el.classList && el.classList.contains('proj-subs')) { el.classList.remove('closed'); }
    if (el.classList && el.classList.contains('proj')) { el.classList.remove('closed'); }
    if (el.classList && el.classList.contains('proj-tree')) el.style.display = '';
    if (el.classList && el.classList.contains('sub-kids')) el.classList.remove('closed');
    el = el.parentElement;
  }
  $$('#navScroll .proj').forEach(w => w.classList.remove('closed'));
  $$('#navScroll .proj-subs').forEach(w => w.classList.remove('closed'));
  $$('#navScroll .sub-kids').forEach(w => w.classList.remove('closed'));
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 1100);
  toast(`已定位到 <b>${escapeHtml(rel)}</b>`
    + (row.classList.contains('dir') ? '' : '（双击这个标签 = 在编辑区打开）'));
}

/* ============================================================
   §20.10 对话列表的**唯一一份**实现
   —— 「默认」区块与每个项目的「对话」分组都用它，改一处两边同时变。
   两者唯一差别 = pool（S.plans ⇄ p.chats）与 scope（选中谁、工作目录是谁）。
   ============================================================ */
const poolOf = scope => scope.kind === 'default'
  ? S.plans
  : (scope.project.chats = scope.project.chats || []);
const convCount = pool => pool.filter(x => !x.isGroup && !x.archived).length;   // §44 归档的不计数（Archived ≠ 删除）
/// 分组折叠状态的 key：默认区沿用**老的 title key**（不丢你已有的折叠状态），
/// 项目区带项目 id —— 否则两个项目里同名的分组会一起折。
const groupOpenKey = (g, scope) => scope.kind === 'default' ? g.title : `${scope.project.id}|${g.title}`;

/// 子分组头（对话 / 文件）的折叠 —— 项目行和「默认」区块共用同一份
function wireSubHead(root, key) {
  const head = root.querySelector(`.sub-head[data-sub="${key}"]`);
  const kids = root.querySelector(`[data-kids="${key}"]`);
  if (!head || !kids) return;
  head.onclick = ev => {
    if (ev.target.classList.contains('sadd')) return;
    kids.classList.toggle('closed');
    head.querySelector('.tw').classList.toggle('open');
  };
}

function selectProjChat(c, p) {
  S.activeProjChat = c.id; S.activePlan = null; S.tempMode = false;
  S.projectMode = false;                 // ⭐ 点对话 → 编辑区自动折叠、取消选中文件（§18.5）
  S.activeTab = -1; S.currentFile = null;
  save(); renderNav(); renderContent(); renderComposerControls(); renderContext();
  toast(`进入「${escapeHtml(c.title)}」（编辑区已折叠）—— 参考：${escapeHtml(p.name)} + 这段对话自己的上下文`);
}

/// 只有「默认」区块有的一张卡：按主快捷键进来就是它（§20.9）
function defaultCardRow() {
  const el = document.createElement('div');
  el.className = 'plan-row' + (S.activePlan === null || S.activePlan === 'default' ? ' is-on' : '');
  el.innerHTML = `<span class="plan-dot" style="background:var(--ok)"></span>
    <span class="pname">默认</span><span class="pdef">快捷键进的就是它</span>
    <button class="pmore" title="选项">⋯</button>`;
  el.title = `默认对话卡片：按主快捷键进来就是这一张\n项目文件夹 = ${defaultFolderPath()}`;
  el.onclick = () => selectTempCard('default');
  el.querySelector('.pmore').onclick = e => {
    e.stopPropagation(); openConvCardMenu(null, { kind: 'default' }, e.currentTarget);
  };
  return el;
}

/// 一张对话卡 —— 两个区块共用（差别只有"点下去选中谁"）
function convCardRow(item, scope) {
  const isDefault = scope.kind === 'default';
  const selected = isDefault ? (S.activePlan === item.id) : (S.activeProjChat === item.id);
  const el = document.createElement('div');
  el.className = 'plan-row' + (selected ? ' is-on' : '');
  // 没置顶就不画 📌 —— 置顶的入口在 ⋯ 菜单里（§16.4）
  el.innerHTML = `<span class="plan-dot"></span><span class="pname"></span>
    ${item.unread ? '<span class="punread" title="未读"></span>' : ''}
    ${item.handoff && item.handoff.platform ? `<span class="ppin" style="background:none" title="会话已交接（handoff_state=${escapeHtml(item.handoff.state || 'done')}）">→${escapeHtml(hHandoffLabel(item.handoff.platform))}</span>` : ''}
    <button class="pmore" title="选项（含会话 ID）">⋯</button>`
    + (item.pinned ? `<span class="ppin" title="已置顶（点一下取消）">📌</span>` : '');
  el.querySelector('.pname').textContent = item.title;
  const pinEl = el.querySelector('.ppin');
  if (pinEl) pinEl.onclick = e => {
    e.stopPropagation(); item.pinned = false; save(true); renderNav(); toast('已取消置顶');
  };
  el.querySelector('.pmore').onclick = e => {
    e.stopPropagation(); openConvCardMenu(item, scope, e.currentTarget);
  };
  el.oncontextmenu = ev => {
    ev.preventDefault();
    openConvCardMenu(item, scope, ev.currentTarget, { x: ev.clientX + 4, y: ev.clientY + 4 });
  };
  el.onclick = () => isDefault ? selectTempCard(item.id) : selectProjChat(item, scope.project);
  return el;
}

/// 分组菜单（重命名 / 置顶 / 删除）—— 两个区块同一份，pool 由 scope 现取
function groupMenuItems(g, scope) {
  const writePool = rest => { if (scope.kind === 'default') S.plans = rest; else scope.project.chats = rest; };
  return [
    { label: '重命名分组', action: () => askModal({ title: '重命名分组', value: g.title, okText: '重命名',
        onOk: v => { if (v && v.trim()) {
          const old = g.title;
          g.title = v.trim();
          poolOf(scope).forEach(x => { if (x.group === old) x.group = g.title; });
          if (S.groupOpen) {
            const oldKey = groupOpenKey({ title: old }, scope), newKey = groupOpenKey(g, scope);
            if (oldKey in S.groupOpen) { S.groupOpen[newKey] = S.groupOpen[oldKey]; delete S.groupOpen[oldKey]; }
          }
          save(true); renderNav(); toast('已重命名分组'); } } }) },
    { label: g.pinned ? '取消置顶分组' : '置顶分组（放最上面）', action: () => {
        g.pinned = !g.pinned; save(true); renderNav(); } },
    { sep: true },
    { label: '删除分组', danger: true, action: () => confirmModal({ title: '删除这个分组？',
        text: g.title + '\n（组里的对话卡会移到最外层，不会删对话）', okText: '删除', onOk: () => {
          const pool = poolOf(scope);
          pool.forEach(x => { if (x.group === g.title) x.group = null; });
          writePool(pool.filter(x => x.id !== g.id));
          save(true); renderNav(); toast('已删除分组'); } }) }
  ];
}

/// 把一个分组（头 + 组里的卡）挂到 host 上 —— 两处共用
function appendGroup(host, g, pool, scope) {
  const open = (S.groupOpen || {})[groupOpenKey(g, scope)] !== false;
  const kids = pool.filter(x => !x.isGroup && x.group === g.title);
  const head = document.createElement('div');
  head.className = 'plan-group' + (open ? '' : ' closed');
  head.innerHTML = `<span class="gc">▶</span><span class="gname"></span>
    <span class="gcount">${kids.length} 张</span><button class="gmore" title="分组选项">⋯</button>`;
  head.querySelector('.gname').textContent = g.title;
  head.onclick = ev => {
    if (ev.target.classList.contains('gmore')) return;
    const key = groupOpenKey(g, scope);
    S.groupOpen = S.groupOpen || {};
    S.groupOpen[key] = !(S.groupOpen[key] !== false);
    save(); renderNav();
  };
  head.querySelector('.gmore').onclick = ev => {
    ev.stopPropagation();
    showMenu(groupMenuItems(g, scope), ev.currentTarget);
  };
  const box = document.createElement('div');
  box.className = 'plan-children' + (open ? '' : ' closed');
  kids.forEach(k => box.appendChild(convCardRow(k, scope)));
  host.appendChild(head);
  host.appendChild(box);
}

/// ⭐ 对话列表的**唯一实现**：默认区与每个项目的对话分组都走它（§20.10.1）
function renderConvList(host, pool, scope) {
  host.innerHTML = '';
  // §44 归档会话：archived=true 的**不进导航列表**（这正是归档的联动效果），Archived 页里才能看到并恢复
  const items = (Array.isArray(pool) ? pool : []).filter(x => !x.archived);
  if (scope.kind === 'default') host.appendChild(defaultCardRow());
  const groups = items.filter(x => x.isGroup).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const loose = items.filter(x => !x.isGroup && !x.group);
  groups.forEach(g => appendGroup(host, g, items, scope));
  loose.forEach(c => host.appendChild(convCardRow(c, scope)));
  if (!items.length) {
    host.insertAdjacentHTML('beforeend',
      `<div class="plan-empty">还没有对话 —— 点上面的 <b>＋</b>：<b>分组</b> / <b>新建</b>。</div>`);
  }
}

/// ⭐ 「＋」的**唯一实现**：默认区的 ＋、每个项目对话分组的 ＋、输入框上方的「＋新建」都走它
function openConvAddMenu(scope, anchor) {
  const pool = poolOf(scope);
  showMenu([
    { label: '分组', action: () => askModal({ title: '新建分组',
        text: scope.kind === 'default' ? '把几张对话卡归到一个组里（只是分组，不是项目）。'
                                       : `归到「${scope.project.name}」下面（只是分组，不是新项目）。`,
        value: '新分组', okText: '创建', onOk: v => {
          const title = (v || '').trim() || '新分组';
          poolOf(scope).push({ id: 'g' + now(), title, ts: now(), isGroup: true });
          save(true); renderNav(); toast(`已建分组 <b>${escapeHtml(title)}</b> —— 之后「新建」的对话卡会归到它下面`);
        } }) },
    { label: '新建', action: () => askModal({ title: '新建对话',
        text: scope.kind === 'default'
          ? '一张新的对话卡 —— 项目文件夹用默认那个（不另带项目）。'
          : `这一段参考的是**「${scope.project.name}」的内容**（+ 这段对话自己的上下文）。`,
        value: `对话 ${convCount(poolOf(scope)) + 1}`, okText: '新建', onOk: v => {
          const p2 = poolOf(scope);
          const lastGroup = [...p2].reverse().find(x => x.isGroup);
          const id = (scope.kind === 'default' ? 't' : 'c') + now();
          p2.push({ id, sid: newSid(), title: (v || '').trim() || `对话 ${p2.length + 1}`,
                    ts: now(), group: lastGroup ? lastGroup.title : null });
          save(true);
          if (scope.kind === 'default') selectTempCard(id); else renderNav();
          toast(`已新建对话 <b>${escapeHtml((v || '').trim() || '对话')}</b>`);
        } }) }
  ], anchor);
}

/* ============================================================
   §22.9.5–22.9.7 编辑区 ＋ 的下拉 + 终端面板
   ============================================================ */
function newTabAction(act) {
  closeMenus();
  const p = proj();
  switch (act) {
    case 'newFile': {
      if (!p) { toast('先选一个项目，才能在它里面新建文件'); return; }
      askModal({ title: '新建文件', text: `落在「${p.name}」里；写完整文件名（例：notes.md）`,
        value: '新文件.md', okText: '创建', onOk: v => {
          const name = (v || '').trim(); if (!name) return;
          if (name in p.files) { toast('已经有同名文件了'); return; }
          p.files[name] = extOf(name) === 'md' ? `# ${name.replace(/\.md$/, '')}\n\n` : '';
          const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '';
          const pool = dir ? findNode(dir, p.tree, '') : null;
          (pool && pool.children ? pool.children : p.tree).push({ name: name.split('/').pop(), type: 'file' });
          S.projectMode = true; S.tempMode = false;
          save(true); renderNav(); openInTab(p.id, name);
          toast(`已新建 <b>${escapeHtml(name)}</b>`);
        }});
      break; }
    case 'terminal': openTerminal({ title: '终端', seed: ['$ '] }); break;
    case 'browser': openBrowserPage(''); break;
    case 'url': openBrowserPage('', true); break;
    case 'search': $('#navSearch').focus(); toast('用左栏顶部的搜索找文件，点它开新标签'); break;
    case 'folder': addMenuAction('useFolder'); break;
    case 'agentClaude':
      openTerminal({ title: 'Claude Code', agent: 'claude' });
      break;
    case 'agentPi':
      openTerminal({ title: 'Pi', agent: 'pi' });
      break;
  }
}

/// §22.9.7 / §22.11.5 终端面板：先 `cd <项目路径>`，再敲进指令（打字机效果，看得出它跑了什么）
/// §23.9 终端现在**也是一个标签**（`kind:'terminal'`）——每开一次新开一张，形状照 Orca 的
/// createTab + setActiveTabType('terminal')（run-quick-command-in-new-tab.ts:112）。
let termTyping = null;      // { t: 标签, id: 定时器 } —— 打字机跟着**当前这张**终端标签走
function openTerminal({ title = '终端', seed = ['$ '], agent = null, command = null, appendEnter = true } = {}) {
  const path = (proj() || defaultProject() || {}).path || defaultFolderPath();
  const lines = [];
  if (agent || command) {
    lines.push({ cls: 't-dim', text: `启动 ${title} —— 用当前项目文件夹作为路径` });
    lines.push({ cls: 't-cmd', text: `cd ${path}` });
    lines.push({ cls: 't-cmd', text: command || agent });
    lines.push({ cls: 't-agent', text: agent === 'claude' ? '▸ Claude Code 已就绪（原型 · 真机上这里是一个真终端）'
              : agent === 'pi' ? '▸ Pi 已就绪（原型 · 真机上这里是一个真终端）'
              : `▸ 已执行：${command}` });
    // Append Enter 关着 = 只敲进去、不回车（源码的 run 路径写死回车，见 runQuickCommand 的注释）
    lines.push({ cls: 't-dim', text: appendEnter === false ? '$ （Append Enter 关着 —— 命令已敲入，未回车）' : `$ ` });
  } else {
    seed.forEach(x => lines.push({ cls: x.startsWith('$') ? 't-cmd' : 't-dim', text: x }));
  }
  const t = { p: (proj() || {}).id || null, f: '', kind: 'terminal', label: title,
              term: { title, path, lines, split: null, done: '', typing: '', cls: '',
                      buf: '', li: 0, ci: 0, done2: '' } };
  S.tabs.push(t);
  S.activeTab = S.tabs.length - 1;
  S.currentFile = null;
  S.tab = 'terminal';
  S.projectMode = true; S.tempMode = false;     // 同浏览器标签：不进项目模式就看不见这张标签
  save(true); renderTabs(); renderContent(); renderContext(); renderNav();
  runTermSession(t);
}
/// 打字机：状态全部记在**这张标签自己的 term 上**，切走再切回来仍是原文
function runTermSession(t) {
  if (termTyping) clearTimeout(termTyping.id);
  Object.assign(t.term, { buf: '', li: 0, ci: 0, done: '', typing: '', cls: '' });
  termStep(t);
}
function termStep(t) {
  const lines = t.term.lines || [];
  if (t.term.li >= lines.length) { termTyping = null; termPaint(); return; }
  const cur = lines[t.term.li];
  if (t.term.ci === 0) t.term.buf += (t.term.buf ? '\n' : '');
  if (t.term.ci < cur.text.length) {
    t.term.ci++;
    t.term.done = t.term.buf;
    t.term.typing = cur.text.slice(0, t.term.ci);
    t.term.cls = cur.cls;
    termPaint();
    termTyping = { t, id: setTimeout(() => termStep(t), cur.text[t.term.ci - 1] === ' ' ? 12 : 26) };
  } else {
    t.term.buf += cur.text; t.term.li++; t.term.ci = 0;
    t.term.done = t.term.buf; t.term.typing = ''; t.term.cls = '';
    termPaint();
    termTyping = { t, id: setTimeout(() => termStep(t), 180) };
  }
}
function termPaint() {
  const t = S.tabs[S.activeTab];
  if (!t || t.kind !== 'terminal' || !t.term) return;
  const b1 = $('#termBody'); if (!b1) return;
  b1.innerHTML = renderTerm(t.term.done || '', t.term.typing || '', t.term.cls || '');
  b1.scrollTop = b1.scrollHeight;
  const p2 = $('#termPane2');
  if (p2 && !p2.hidden) {
    const b2 = $('#termBody2');
    if (b2) { b2.innerHTML = renderTerm(t.term.done2 || '', '', ''); b2.scrollTop = b2.scrollHeight; }
  }
}
/// §23.9.2 终端面板自己拆成两格（右 = 左右并排，下 = 上下）——
/// 第二格是一条新 shell（Orca 的 split 就是新 pane，不是把一格复制一份）
function splitTerminal(dir) {
  const t = S.tabs[S.activeTab];
  if (!t || t.kind !== 'terminal' || !t.term) { toast('先打开一个终端标签'); return; }
  t.term.split = (t.term.split === dir) ? null : dir;
  if (t.term.split && !t.term.done2) t.term.done2 = `$ cd ${t.term.path}\n$ `;
  save(true); renderTermPanes(); termPaint();
  toast(t.term.split === 'right' ? '终端已<b>左右</b>拆成两格'
        : t.term.split === 'down' ? '终端已<b>上下</b>拆成两格' : '已收回单格终端');
}
function renderTermPanes() {
  const t = S.tabs[S.activeTab];
  const panes = $('#termPanes'), p2 = $('#termPane2');
  if (!panes || !p2) return;
  const split = (t && t.kind === 'terminal' && t.term) ? t.term.split : null;
  panes.classList.toggle('is-right', split === 'right');
  panes.classList.toggle('is-down', split === 'down');
  p2.hidden = !split;
  const sp = $('#termSplit');
  if (sp) sp.classList.toggle('is-on', !!split);
}
function renderTerm(done, typing, cls) {
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 逐行上色：以 `$` 开头当命令，其余按段落最后一行的 class
  const lines = done.split('\n');
  const html = lines.map(l => `<span class="${/^\$|^cd |^claude|^pi\b/.test(l.trim()) ? 't-cmd' : ''}">${esc(l)}</span>`).join('\n');
  return html + (typing ? `<span class="${cls}">${esc(typing)}</span>` : '');
}

/// §20.9.3：点「默认」区块里那条文件夹行 → 改路径
function editDefaultFolderPath() {
  const d = defaultProject(); if (!d) return;
  askModal({ title: '默认项目文件夹',
    text: '默认 = 计算机用户的根目录。快捷键提问、内容参考、搜索里的「默认区」都用它。',
    value: d.path, okText: '保存', onOk: v => {
      const path = (v || '').trim(); if (!path) return;
      d.path = path; save(true); renderNav(); renderContext();
      toast(`默认项目文件夹已改为 <b>${escapeHtml(path)}</b>`);
    }});
}

function renderNav() {
  const inProject = S.projectMode && !!proj();
  // §20.9.4：没选任何项目时，顶栏这一格给的就是**默认项目文件夹**（快捷键提问带的就是它）
  const ctxPath = contextFolderPath();
  const usingDefaultFolder = ctxPath === defaultFolderPath();
  $('#ctxProjectPath').textContent = usingDefaultFolder ? `默认 ${ctxPath}` : ctxPath;
  $('#ctxProjectPath').title = $('#ctxProjectPath').textContent;
  // 编辑区开关 = 项目模式的唯一入口（§15.4 你拍板：不做"项目开关"，做"编辑区开关"）
  const sw = $('#editorSwitch');
  if (sw) {
    sw.classList.toggle('is-on', inProject);
    sw.title = inProject ? '编辑区开着 —— 左 文件夹 ｜ 中 编辑 ｜ 右 对话'
                         : '编辑区关着 —— 只剩 左栏 + 对话（= 临时/对话模式）';
  }

  const planOpen = S.planOpen !== false;
  $('#btnProjSect').classList.toggle('closed', !S.navOpen);
  $('#btnPlanSect').classList.toggle('closed', !planOpen);
  $('#projectList').style.display = S.navOpen ? '' : 'none';
  $('#planList').style.display = planOpen ? '' : 'none';

  // ── 项目块 ──
  const host = $('#projectList'); host.innerHTML = '';
  const active = proj();
  const ordered = [...realProjects()].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  /// 单个项目行（§23.7 抽出来：分组头和"没分组的"都用它）
  const appendProjectRow = (p) => {
    const wrap = document.createElement('div');
    wrap.className = 'proj' + (p.open ? '' : ' closed') + (p.sleeping ? ' is-sleep' : '');
    wrap.innerHTML = `
      <div class="proj-row${active && active.id === p.id && inProject ? ' is-on' : ''}">
        <span class="proj-caret">▶</span>
        <span class="proj-ico"></span>
        <span class="proj-name"></span>
        ${p.sleeping ? '<span class="proj-sleep" title="已 Sleep —— 面板都关了、只留记录">💤</span>' : ''}
        ${p.pinned ? '<span class="proj-pin">📌</span>' : ''}
        <button class="proj-more" title="更多">⋯</button>
      </div>
      </div>`;
    wrap.querySelector('.proj-name').textContent = p.name;
    wrap.querySelector('.proj-name').title = p.path;
    // §22.1：**整行**（左箭头 / 中间名字 / 右侧空白）点下去都是折叠 ⇄ 展开
    wrap.querySelector('.proj-row').onclick = () => {
      if (p.open) { p.open = false; save(); renderNav(); }
      else selectProject(p.id);
    };
    wrap.querySelector('.proj-more').onclick = e => { e.stopPropagation(); openProjMenu(p, e.currentTarget); };

    const sub = document.createElement('div');
    sub.className = 'proj-subs' + (p.open ? '' : ' closed');
    sub.innerHTML = `
      <div class="sub-head" data-sub="chats">
        <span class="tw">▶</span><span class="st">对话</span><span class="sc">${convCount(poolOf({ kind: 'project', project: p }))}</span>
        <button class="sadd" title="给这个项目新建分组 / 对话">＋</button>
      </div>
      <div class="sub-kids" data-kids="chats"></div>
      <div class="sub-head" data-sub="files">
        <span class="tw">▶</span><span class="st">文件</span><span class="sc">${countFiles(p.tree)}</span>
      </div>
      <div class="sub-kids" data-kids="files"></div>`;
    wireSubHead(sub, 'chats');
    wireSubHead(sub, 'files');
    const scope = { kind: 'project', project: p };
    sub.querySelector('.sadd').onclick = ev => { ev.stopPropagation(); openConvAddMenu(scope, ev.currentTarget); };
    renderConvList(sub.querySelector('[data-kids="chats"]'), poolOf(scope), scope);
    renderTreeInto(p, p.tree, sub.querySelector('[data-kids="files"]'), '');
    wrap.appendChild(sub);
    host.appendChild(wrap);
  };

  // §23.7 侧栏项目分组（Orca ProjectGroup）：分组头 + 组里的项目，最后是没有分组的
  const pgroups = (S.projectGroups || []);
  const ungrouped = [];
  const seen = new Set();
  pgroups.forEach(g => {
    const kids = ordered.filter(p => p.projectGroupId === g.id);
    kids.forEach(p => seen.add(p.id));
    if (!kids.length && g.isCollapsed === undefined) return;
    const open = g.isCollapsed !== true;
    const head = document.createElement('div');
    head.className = 'plan-group' + (open ? '' : ' closed');
    head.innerHTML = `<span class="gc">▶</span>
      <span class="pg-dot" style="background:${g.color || '#5A5A62'}"></span>
      <span class="gname"></span><span class="gcount">${kids.length} 个</span>
      <button class="gmore" title="分组选项">⋯</button>`;
    head.querySelector('.gname').textContent = g.name;
    head.onclick = ev => {
      if (ev.target.classList.contains('gmore')) return;
      g.isCollapsed = !open; save(); renderNav();
    };
    head.querySelector('.gmore').onclick = ev => { ev.stopPropagation(); openProjGroupMenu(g, ev.currentTarget); };
    host.appendChild(head);
    if (open) kids.forEach(appendProjectRow);
  });
  ordered.forEach(p => { if (!seen.has(p.id)) ungrouped.push(p); });
  ungrouped.forEach(appendProjectRow);

  if (!realProjects().length) {
    host.innerHTML = `<div style="padding:8px 10px 12px;color:var(--ink3);font-size:12px">
      还没有项目文件夹。点右边 <b style="color:var(--ink2)">＋</b>：
      <b>空白项目（文件夹）</b> / <b>现有项目（文件夹）</b>。</div>`;
  }

  // ── 「默认」块（§20.9：原「临时」）：默认项目文件夹 + 与项目**完全同一套**对话（§20.10） ──
  const ph = $('#planList'); ph.innerHTML = '';
  const defScope = { kind: 'default' };

  // ① 文件夹行 —— 点一下改路径（§20.9.3）
  const folderRow = document.createElement('div');
  folderRow.className = 'def-folder';
  folderRow.innerHTML = `<span class="df-ico">📁</span><code class="df-path"></code>`;
  folderRow.querySelector('.df-path').textContent = defaultFolderPath();
  folderRow.title = `默认项目文件夹\n快捷键提问 / 内容参考都用它\n点一下修改路径`;
  folderRow.onclick = editDefaultFolderPath;
  ph.appendChild(folderRow);

  // ② 对话 —— 与项目区**同一份** renderConvList（pool 不同而已）
  const defConv = document.createElement('div');
  defConv.className = 'conv-block';
  ph.appendChild(defConv);
  renderConvList(defConv, poolOf(defScope), defScope);

  // ③ 文件 —— 与项目区**同一份** renderTreeInto + wireSubHead
  const dp = defaultProject();
  if (dp) {
    const fileWrap = document.createElement('div');
    fileWrap.className = 'proj-subs';
    fileWrap.innerHTML = `
      <div class="sub-head" data-sub="files">
        <span class="tw">▶</span><span class="st">文件</span><span class="sc">${countFiles(dp.tree)}</span>
      </div>
      <div class="sub-kids" data-kids="files"></div>`;
    wireSubHead(fileWrap, 'files');
    renderTreeInto(dp, dp.tree, fileWrap.querySelector('[data-kids="files"]'), '');
    ph.appendChild(fileWrap);
  }

  filterTree($('#navSearch') ? $('#navSearch').value : '', S.searchScope);
  placeModeChips();                         // 项目模式下，模式条并进对话框
}

function selectProject(id) {
  const p = S.projects.find(x => x.id === id); if (!p) return;
  S.activeProject = id;
  S.tempMode = false;
  S.projectMode = true;                      // 点项目 = 进项目模式（§12.0）
  S.activePlan = null;
  p.open = true;
  // 打开项目里第一个文件
  const first = firstFile(p.tree);
  if (first) openInTab(id, first);
  else { S.tabs = []; S.activeTab = 0; S.currentFile = null; S.focusFiles = []; }
  save(); renderNav(); renderTabs(); renderContent(); renderContext();
}
function removeFromTree(nodes, parts) {
  const name = parts[parts.length - 1];
  const i = nodes.findIndex(n => n.name === name && (parts.length === 1 || true));
  if (i < 0) return false;
  if (parts.length === 1) { nodes.splice(i, 1); return true; }
  const n = nodes[i];
  if (n.children && n.name === parts[0]) return removeFromTree(n.children, parts.slice(1));
  return false;
}
/// 按相对路径找目录/文件节点。
/// ⚠️ `renderTreeInto` 里那两处（文件夹内重命名 / 新建文件）**早就调用了它、但从来没定义过**
/// —— 点到二级目录里的行就会 `findNode is not defined` 直接抛。这里补上（纯查找，不改数据）。
function findNode(relPath, nodes, prefix = '') {
  for (const n of nodes || []) {
    const rel = prefix ? `${prefix}/${n.name}` : n.name;
    if (rel === relPath) return n;
    if (n.children) { const hit = findNode(relPath, n.children, rel); if (hit) return hit; }
  }
  return null;
}
function renameInTree(nodes, oldParts, newParts) {
  const name = oldParts[oldParts.length - 1];
  if (oldParts.length === 1) {
    const n = nodes.find(x => x.name === name);
    if (n) { n.name = newParts[newParts.length - 1]; return true; }
    return false;
  }
  const n = nodes.find(x => x.name === oldParts[0]);
  return n && n.children ? renameInTree(n.children, oldParts.slice(1), newParts.slice(1)) : false;
}
function countFiles(nodes) {
  let n = 0;
  nodes.forEach(x => { if (x.type === 'file') n++; else n += countFiles(x.children || []); });
  return n;
}
const newSid = () => 'cs_' + Math.random().toString(16).slice(2, 10);
function firstFile(nodes) {
  for (const n of nodes) { if (n.type === 'file') return n.name; if (n.children) { const f = firstFile(n.children); if (f) return f; } }
  return null;
}

/// 文件夹 / 文件的**线框彩色图标**（按你给的那张图：黄描边文件夹、
/// .md 绿 / .html 红 / .json 青 / .sh 紫 / 其它灰）
function treeIconSVG(rel, isDir) {
  if (isDir) return `<svg class="tico" viewBox="0 0 16 16" fill="none" stroke="#F5B851" stroke-width="1.3"
    stroke-linejoin="round"><path d="M1.6 4.2c0-.7.5-1.2 1.2-1.2h3l1.3 1.4h6.3c.7 0 1.2.5 1.2 1.2v6.6c0 .7-.5 1.2-1.2 1.2H2.8c-.7 0-1.2-.5-1.2-1.2V4.2z"/></svg>`;
  const e = extOf(rel);
  const color = { md:'#4ADE80', mmd:'#4ADE80', html:'#F87171', htm:'#F87171', pdf:'#F87171',
    json:'#22D3EE', sh:'#C084FC', js:'#EAB308', mjs:'#EAB308', css:'#60A5FA', ts:'#38BDF8' }[e] || '#9CA3AF';
  return `<svg class="tico" viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="1.3"
    stroke-linejoin="round"><path d="M3.4 1.9h6l3.2 3.2v9H3.4v-12z"/><path d="M9.4 1.9v3.2h3.2"/></svg>`;
}

/// 项目里所有文件的**扁平顺序**（Shift 范围选择要用这个顺序）
function flatFiles(project, nodes = project.tree, prefix = '', out = []) {
  nodes.forEach(n => {
    const rel = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.type === 'file') out.push(rel);
    else flatFiles(project, n.children || [], rel, out);
  });
  return out;
}

function renderTreeInto(project, nodes, container, prefix) {
  nodes.forEach(n => {
    const rel = prefix ? `${prefix}/${n.name}` : n.name;
    const row = document.createElement('div');
    row.className = 'node-row';
    if (n.type === 'file') {
      if (rel === relOfActiveTab()) row.classList.add('is-sel');
      if (focusHas(project.id, rel)) row.classList.add('is-focus-file');
      row.innerHTML = `<span class="tw"></span>${treeIconSVG(rel, false)}
        <span class="n-name"></span>`;
      row.querySelector('.n-name').textContent = n.name;
      row.title = fullPath(rel, project) + '\n单击=打开 · ⌘单击=选为重点 · Shift单击=范围选';
      // ⭐ 选择语义（§12.2）：单击只打开；⌘ 切换重点；Shift 范围多选
      row.onclick = ev => onFileRowClick(project, rel, ev);
      row.ondblclick = () => {                 // 双击 = 编辑区关着也自动打开
        S.projectMode = true;
        openInTab(project.id, rel);
        save(); renderNav(); renderContent();
      };
      row.dataset.rel = rel;
      row.dataset.pid = project.id;
      row.oncontextmenu = ev => {
        ev.preventDefault();
        showMenu([
          { label: '打开（在编辑区）', action: () => { S.projectMode = true; openInTab(project.id, rel);
              save(); renderNav(); renderContent(); } },
          { label: '定位（只选中不打开）', action: () => locateFileInTree(rel) },
          { sep: true },
          { label: focusHas(project.id, rel) ? '从对话里移出（取消参考）' : '添加到对话（重点参考）',
            action: () => {
              focusToggle(project.id, rel);
              toast(focusHas(project.id, rel) ? `已把 <b>${rel}</b> 加进这次对话的参考`
                                              : `已移出参考 · ${rel}`); } },
          { label: '复制路径', action: () => {
              navigator.clipboard?.writeText(fullPath(rel, project));
              toast('已复制 ' + fullPath(rel, project)); } },
          { label: '在访达中显示', action: () => toast('在访达中显示 ' + fullPath(rel, project)) },
          { sep: true },
          { label: '重命名', action: () => askModal({ title: '重命名文件', text: rel, value: rel.split('/').pop(),
              okText: '重命名', onOk: v => { if (!v || !v.trim()) return;
                const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
                const nn = dir + v.trim();
                if (nn in project.files) { toast('已经有同名文件了'); return; }
                project.files[nn] = project.files[rel]; delete project.files[rel];
                renameInTree(project.tree, rel.split('/'), nn.split('/'));
                S.focusFiles = (S.focusFiles || []).map(x =>
                  x.p === project.id && x.f === rel ? { ...x, f: nn } : x);
                if (relOfActiveTab() === rel) { S.tabs.forEach(t => { if (t.f === rel) t.f = nn; });
                  S.currentFile = nn; S.tab = extViewKind(nn) === 'file' ? 'file' : extViewKind(nn); }
                save(true); renderNav(); renderTabs(); renderContent(); renderContext();
                toast('已重命名为 ' + nn); } }) },
          { label: '删除文件', danger: true, action: () => confirmModal({ title: '删除这个文件？',
              text: rel + '\n（原型只从这棵树里删，不动你磁盘）', okText: '删除', onOk: () => {
                delete project.files[rel];
                removeFromTree(project.tree, rel.split('/'));
                S.tabs = S.tabs.filter(t => !(t.p === project.id && t.f === rel));
                if (S.activeTab >= S.tabs.length) S.activeTab = Math.max(0, S.tabs.length - 1);
                if (relOfActiveTab() !== rel) {} else S.currentFile = relOfActiveTab() || null;
                S.focusFiles = (S.focusFiles || []).filter(x => !(x.p === project.id && x.f === rel));
                save(true); renderNav(); renderTabs(); renderContent(); renderContext();
                toast('已删除 ' + rel); } }) }
        ], ev.currentTarget, { x: ev.clientX + 4, y: ev.clientY + 4 });
      };
    } else {
      row.className += ' dir';
      row.innerHTML = `<span class="tw${n.open ? ' open' : ''}">▶</span>${treeIconSVG(rel, true)}
        <span class="n-name dir"></span>`;
      row.querySelector('.n-name').textContent = n.name;
      // 目录行也要带 rel/pid —— 搜索结果里的「文件夹」靠它定位（§20.11.4）
      row.dataset.rel = rel;
      row.dataset.pid = project.id;
      row.onclick = () => { n.open = !n.open; save(); renderNav(); };
      row.oncontextmenu = ev => {
        ev.preventDefault();
        const dirPath = fullPath(rel, project);
        showMenu([
          { label: n.open ? '折叠' : '展开', action: () => { n.open = !n.open; save(); renderNav(); } },
          { sep: true },
          { label: '重命名文件夹', action: () => askModal({ title: '重命名文件夹', value: n.name,
              okText: '重命名', onOk: v => {
                if (!v || !v.trim()) return;
                const parent = prefix ? findNode(prefix, project.tree, '') : null;
                const pool = parent && parent.children ? parent.children : project.tree;
                const kid = pool.find(c => c.name === n.name && c.type === 'dir');
                if (kid) { kid.name = v.trim(); save(true); renderNav(); toast('已重命名（原型只改树）'); }
              } }) },
          { label: '新建文件', action: () => askModal({ title: `在「${n.name}」里新建文件`,
              text: '写文件名（例如 notes.md）', value: '', okText: '创建', onOk: v => {
                if (!v || !v.trim()) return;
                const parent = prefix ? findNode(prefix, project.tree, '') : null;
                const pool = parent && parent.children ? parent.children : project.tree;
                if (!pool) return;
                const name = v.trim();
                pool.push({ name, type: 'file' });
                const rp = (prefix ? prefix + '/' : '') + n.name + '/' + name;
                project.files[rp] = '# ' + name + '\n';
                n.open = true;
                save(true); renderNav(); toast('已新建 ' + rp);
              } }) },
          { sep: true },
          { label: '复制路径', action: () => { navigator.clipboard?.writeText(dirPath); toast('已复制 ' + dirPath); } },
          { label: '在访达中显示', action: () => toast('在访达中显示 ' + dirPath) },
          { label: '移动位置…', action: () => toast('移动到…（原型先记一笔）') }
        ], ev.currentTarget, { x: ev.clientX + 4, y: ev.clientY + 4 });
      };
      container.appendChild(row);
      const kids = document.createElement('div');
      kids.className = 'proj-tree';
      if (!n.open) kids.style.display = 'none';
      container.appendChild(kids);
      renderTreeInto(project, n.children || [], kids, rel);
      return;
    }
    container.appendChild(row);
  });
}

function onFileRowClick(project, rel, ev) {
  // ⭐ Shift 或 ⌘ 点击 = **点谁选谁**（toggle），不是"中间全选"；
  // 而且可以**跨子文件夹、跨项目**点选（focusFiles 带项目 id，同名文件不会混）。
  if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
    focusToggle(project.id, rel);
    toast(focusHas(project.id, rel)
      ? `已加为重点参考 · ${escapeHtml(project.name)}/${rel}（${(S.focusFiles || []).length} 个）`
      : `已移出重点参考 · ${rel}`);
    return;
  }
  // 普通单击 = 打开文件，**并自动打开编辑区**（唯一三个能自动开编辑区的入口之一，§18.5）
  S.projectMode = true;
  S.tempMode = false;
  S.activeProjChat = null;
  S.activePlan = null;
  openInTab(project.id, rel);
}

/// 侧栏搜索：只过滤树（在侧栏顶部那个框）
/// §20.11.5：范围 = 项目区 / 默认区 时，**照旧实时过滤左边那一棵树**
/// （两个区块各一棵 —— 只过滤当前范围那一棵，另一棵原样显示）
function filterTree(q, scope) {
  const scopeName = scope || S.searchScope || 'project';
  // 本地计算机范围跟左边这棵树无关（它搜的是整机），所以不过滤
  const kw = scopeName === 'computer' ? '' : (q || '').trim().toLowerCase();
  const container = scopeName === 'default' ? $('#planList') : $('#projectList');
  $$('#navScroll .node-row').forEach(row => {
    const inScope = !container || container.contains(row);
    const rel = row.dataset.rel || '';
    const name = (row.querySelector('.n-name')?.textContent || '').toLowerCase();
    const hit = !inScope || !kw || name.includes(kw) || rel.toLowerCase().includes(kw);
    row.style.display = hit ? '' : 'none';
    if (inScope && hit && kw) {
      // 命中的行，把它的祖先文件夹都展开
      let el = row.parentElement;
      while (el && el !== $('#navScroll')) {
        if (el.classList.contains('proj-tree')) el.style.display = '';
        else if (el.classList.contains('proj') || el.classList.contains('proj-subs')
              || el.classList.contains('sub-kids')) el.classList.remove('closed');
        if (el.classList.contains('proj')) break;
        el = el.parentElement;
      }
    }
  });
  if (kw && scopeName !== 'default') $$('#projectList .proj').forEach(w => w.classList.remove('closed'));
  if (kw && scopeName === 'default') $$('#planList .proj-subs').forEach(w => w.classList.remove('closed'));
}

/* ============================================================
   §20.11 顶部搜索：面板（范围 + 内容类型）+ 结果
   ============================================================ */
function searchProjectsFor(scope) {
  return scope === 'default' ? [defaultProject()].filter(Boolean) : realProjects();
}
function walkTreeEntries(nodes, project, prefix, out) {
  (nodes || []).forEach(n => {
    const rel = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.type === 'dir') {
      out.push({ kind: 'folder', project, rel, name: n.name });
      walkTreeEntries(n.children || [], project, rel, out);
    } else {
      out.push({ kind: 'file', project, rel, name: n.name });
    }
  });
  return out;
}
function openSearchPop(open) {
  const p = $('#searchPop');
  if (!p) return;
  p.hidden = !open;
  if (open) renderSearchPop();
}
function renderSearchPop() {
  const scope = S.searchScope || 'project';
  const types = S.searchTypes || { folder: true, file: true, content: false };
  $$('#searchScopes button').forEach(b => b.classList.toggle('is-on', b.dataset.scope === scope));
  // §22.8.2 内容类型是**长方形选项按钮**：高亮 = 选中，和真实过滤同一条数据
  $$('#searchTypes button').forEach(b => b.classList.toggle('is-on', !!types[b.dataset.type]));
  runSearch();
}
function runSearch() {
  const res = $('#searchResults'); if (!res) return;
  const qRaw = ($('#navSearch') && $('#navSearch').value || '').trim();
  const q = qRaw.toLowerCase();
  const scope = S.searchScope || 'project';
  const types = S.searchTypes || { folder: true, file: true, content: false };

  // §22.8.3 **说明文字全部删掉**（范围提示 / 能搜到什么 / 计算机的权限说明都不要）——
  // §22.8.3 空结果就让结果区空着，不再解释。
  if (scope === 'computer' || !qRaw) { res.innerHTML = ''; return; }

  const entries = [];
  searchProjectsFor(scope).forEach(p => walkTreeEntries(p.tree || [], p, '', entries));
  const hits = [];
  entries.forEach(e => {
    const relL = e.rel.toLowerCase(), nameL = e.name.toLowerCase();
    if (e.kind === 'folder') {
      if (types.folder && (nameL.includes(q) || relL.includes(q))) hits.push({ type: 'folder', e });
      return;
    }
    if (types.file && (nameL.includes(q) || relL.includes(q))) hits.push({ type: 'file', e });
    if (types.content) {
      const text = e.project.files[e.rel] || '';
      const idx = text.toLowerCase().indexOf(q);
      if (idx >= 0) {
        const from = Math.max(0, idx - 28);
        hits.push({ type: 'content', e, snippet: (from ? '…' : '') + text.slice(from, idx + qRaw.length + 60).replace(/\s+/g, ' ') });
      }
    }
  });

  if (!hits.length) { res.innerHTML = ''; return; }
  const kindLabel = { folder: '文件夹', file: '文件', content: '内容' };
  res.innerHTML = hits.slice(0, 40).map((h, i) =>
    `<div class="sp-item" data-i="${i}">
       <span class="sp-kind sp-k-${h.type}">${kindLabel[h.type]}</span>
       <span class="sp-body"><span class="sp-name"></span>
         <span class="sp-path"></span>${h.snippet ? `<span class="sp-snip"></span>` : ''}</span>
     </div>`).join('');
  $$('.sp-item', res).forEach((el, i) => {
    const h = hits[i];
    el.querySelector('.sp-name').textContent = h.e.name;
    el.querySelector('.sp-path').textContent = `${h.e.project.name} · ${h.e.project.path}/${h.e.rel}`;
    const sn = el.querySelector('.sp-snip');
    if (sn) sn.textContent = h.snippet;
    el.onclick = () => searchJump(h);
  });
}
/// 点结果 = 跳过去：文件/内容 → 在编辑区打开；文件夹 → 展开定位（§20.11.4）
function searchJump(hit) {
  const p = hit.e.project, rel = hit.e.rel;
  if (hit.type === 'folder') {
    openDirPath(p, rel);
    save(); renderNav();
    locateFileInTree(rel, p.id);
    openSearchPop(false);
    return;
  }
  S.projectMode = true;
  S.tempMode = false;
  S.activeProjChat = null;
  S.activePlan = null;
  openInTab(p.id, rel);
  save(); renderNav(); renderContent(); renderContext();
  openSearchPop(false);
}
/// 把一条目录路径上的每一层都展开（搜索结果是「文件夹」时用）
function openDirPath(project, rel) {
  project.open = true;
  let nodes = project.tree || [];
  for (const part of rel.split('/')) {
    const node = nodes.find(n => n.name === part && n.type === 'dir');
    if (!node) return false;
    node.open = true;
    nodes = node.children || [];
  }
  return true;
}

/* ── 项目菜单（更多…） ───────────────────────── */
let menuProject = null;
function openProjMenu(p, anchor) {
  menuProjXY = { x: anchor.getBoundingClientRect().left, y: anchor.getBoundingClientRect().bottom + 4 };
  // ⚠️ 这里**不做"再点一次就关"**：#menuProj 是**每行一颗 ⋯ 共用同一个菜单元素**，
  // 按"开没开来判"会把"点另一行的 ⋯"误判成"关掉"（那颗菜单不会打开）。右键同理。
  menuProject = p;
  closeMenus();                             // §17.1：任何菜单打开前先关掉别的
  const m = $('#menuProj');
  const r = anchor.getBoundingClientRect();
  m.hidden = false;
  m.style.left = Math.min(r.left, innerWidth - 200) + 'px';
  m.style.top = (r.bottom + 6) + 'px';
  m.querySelector('[data-act="pin"]').textContent = p.pinned ? '取消置顶' : '置顶项目';
  // §23.7 Sleep 是"可逆地关掉面板"，不是删除；文案与 Orca 保持一致
  const sl = m.querySelector('[data-act="sleep"]');
  if (sl) sl.textContent = p.sleeping ? 'Wake（唤醒）' : 'Sleep';
  const mg = m.querySelector('[data-act="moveGroup"]');
  if (mg) mg.disabled = !(S.projectGroups || []).length;
  const rg = m.querySelector('[data-act="removeFromGroup"]');
  if (rg) rg.disabled = !p.projectGroupId;
}
/// §21.4：菜单按**实测尺寸**贴鼠标并夹进屏幕 —— 写死的高度猜不准，
/// 这次 18 项的标签菜单就因为 `innerHeight - 420` 把最后两项顶到了屏幕外。
/// §22.2：**先往上弹**（菜单底边贴按钮顶边），上方放不下才翻下去。
/// 输入框那几个下拉都在屏幕底部，往下弹会把按钮整个盖住。
function placeMenuAbove(m, x, yBottom, flipAt) {
  // yBottom = 贴靠的那条边（要"菜单在按钮上方"就传按钮**顶边** r.top）；
  // flipAt = 上方放不下时**翻下去的起点**（传 r.bottom → 翻下后也不盖按钮）
  m.hidden = false;
  const w = m.offsetWidth, h = m.offsetHeight;
  let top = yBottom - 6 - h;
  if (top < 6) top = Math.min((flipAt !== undefined ? flipAt : yBottom) + 6, innerHeight - h - 6);
  m.style.left = Math.max(6, Math.min(x, innerWidth - w - 8)) + 'px';
  m.style.top = Math.max(6, top) + 'px';
}
function placeMenu(m, x, y) {
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(6, Math.min(x, innerWidth - w - 8)) + 'px';
  m.style.top = Math.max(6, Math.min(y, innerHeight - h - 8)) + 'px';
}
function closeMenus() {
  // 直接按 class 关，不走 id 列表 —— §17.1 实测 id 列表这条路在某些时序下关不干净，
  // 而 `querySelectorAll('.menu')` 这条已经验证过是可靠的（点外面 → 0 个残留）。
  document.querySelectorAll('.menu').forEach(m => { if (m) m.hidden = true; });
  if (menuDyn) menuDyn.hidden = true;
}
/// 打开别的菜单/下拉时，顺手关掉提交面板（免得叠两层）
function closeGitPanel() {
  const gp = document.getElementById('gitPanel'); if (gp) gp.hidden = true;
}

function projMenuAction(act) {
  const p = menuProject; closeMenus(); if (!p) return;
  switch (act) {
    case 'batch': toast(`批量管理：原型里先记一笔（真机版做多选改名/归档）`); break;
    case 'finder': case 'reveal': toast(`在访达中显示 <b>${escapeHtml(p.path)}</b>（原型不落地，接 SwiftUI 后走 NSWorkspace）`); break;
    case 'copyPath':
      navigator.clipboard?.writeText(p.path);
      toast(`已复制工作路径 <b>${escapeHtml(p.path)}</b>`); break;
    case 'rename':
      openProjectModal('edit', p);                 // §22.12.5 显示名 + 主要/其他文件夹一起改
      break;
    case 'pin': p.pinned = !p.pinned; save(true); renderNav(); toast(p.pinned ? '已置顶' : '已取消置顶'); break;
    // ── §23.7 照 Orca WorktreeContextMenuView ──
    case 'newChat':
      askModal({ title: `给「${p.name}」新建对话`, text: '这一段参考的是**当前项目的内容**（+ 这段对话自己的上下文）。',
        value: `对话 ${(p.chats || []).length + 1}`, okText: '新建', onOk: v => {
          p.chats = p.chats || [];
          p.chats.push({ id: 'c' + now(), sid: newSid(), title: (v || '').trim() || '对话', ts: now() });
          save(true); renderNav(); toast('已新建项目内对话（带会话 ID）');
        }});
      break;
    // §32 你拍板「菜单里加两项」：折叠/展开 = 项目区整块的开合（与段头点击同一状态）
    case 'foldProj': S.navOpen = false; save(true); renderNav(); toast('项目区已折叠'); break;
    case 'unfoldProj': S.navOpen = true; save(true); renderNav(); toast('项目区已展开'); break;
    case 'copyName':
      navigator.clipboard?.writeText(p.name); toast(`已复制工作区名 <b>${escapeHtml(p.name)}</b>`); break;
    case 'sleep':
      // Orca 的 sleep = 可逆地关掉这个工作区里所有活着的面板，只留记录（不删）
      p.sleeping = !p.sleeping; save(true); renderNav();
      toast(p.sleeping
        ? `已 <b>Sleep</b>「${escapeHtml(p.name)}」—— 面板全关、记录还在（可再唤醒）<br><span style="opacity:.7">Close all active panels in this workspace to free up memory and CPU.</span>`
        : `已唤醒「${escapeHtml(p.name)}」`);
      break;
    case 'moveGroup': {
      const gs = S.projectGroups || [];
      const x = menuProjXY;
      if (!gs.length) { toast('还没有项目分组 —— 先「来自项目的新组」'); return; }
      showMenu(gs.map(g => ({ label: g.name + (p.projectGroupId === g.id ? '  ✓' : ''),
        action: () => { p.projectGroupId = g.id; save(true); renderNav(); toast(`已移动到分组 <b>${escapeHtml(g.name)}</b>`); } }))
        .concat([{ sep: true }, { label: '移出分组', action: () => { p.projectGroupId = null; save(true); renderNav(); toast('已移出分组'); } }]),
        null, x);
      return; }
    case 'removeFromGroup':
      if (!p.projectGroupId) { toast('这个项目本来就不在任何分组里'); return; }
      p.projectGroupId = null; save(true); renderNav(); toast('已移出分组'); break;
    case 'newGroupFromProject':
      askModal({ title: '来自项目的新组', text: `建一个侧栏分组，并把「${p.name}」放进去。`,
        value: `${p.name} 组`, okText: '创建', onOk: v => {
          const name = (v || '').trim() || '新分组';
          S.projectGroups = S.projectGroups || [];
          const id = 'pg' + now();
          S.projectGroups.push({ id, name, color: null, isCollapsed: false, createdFrom: 'manual' });
          p.projectGroupId = id;
          save(true); renderNav();
          toast(`已建分组 <b>${escapeHtml(name)}</b> 并把「${escapeHtml(p.name)}」放进去`);
        }});
      break;
    case 'unread': p.unread = !p.unread; save(true); renderNav();
      toast(p.unread ? '已标记为未读' : '已标记为已读'); break;
    case 'continue': toast(`在新对话中继续「${escapeHtml(p.name)}」—— 原型新开一张同内容的卡`); break;
    case 'export': toast(`导出「${escapeHtml(p.name)}」的对话记录（原型导 JSON）`); break;
    case 'delete':
      confirmModal({ title: '删除这个项目？', text: `${p.name}\n只删这一侧的记录，不动你磁盘上的文件夹。`,
        okText: '删除', onOk: () => {
          S.projects = S.projects.filter(x => x.id !== p.id);
          if (S.activeProject === p.id) {
            // 兜底要挑**真项目** —— 「默认」那个 isDefault 的项目文件夹永远在，拿它当兜底会把人带进默认区
            const next = realProjects()[0] || null;
            S.activeProject = next ? next.id : null;
            S.tabs = []; S.activeTab = 0; S.currentFile = null; S.focusFiles = [];
            S.projectMode = false;
          }
          save(true); renderAll(); toast('已删除项目');
        }});
      break;
    case 'archive':
      confirmModal({ title: '归档这个项目？', text: `「${p.name}」\n只归档这一侧，不动你磁盘上的文件。`,
        okText: '归档', onOk: () => {
          S.projects = S.projects.filter(x => x.id !== p.id);
          if (S.activeProject === p.id) {
            const next = realProjects()[0] || null;     // 同上：别拿「默认」当兜底
            S.activeProject = next ? next.id : null;
            S.tabs = []; S.activeTab = 0; S.currentFile = null; S.focusFiles = [];
            S.tempMode = true;
            S.projectMode = false;                // 没有项目 → 回到对话模式（§12.0）
            if (next) selectProject(next.id);
          }
          save(true); renderAll();
          toast('已归档 —— 现在是对话模式，右边照常能聊');
        }});
      break;
  }
}

/* ── 两个加号，各两项（§13.2） ─────────────── */
/// 项目 ＋ 的两项（空白项目 / 现有项目）。
/// ⚠️ 分组 / 新建对话**不在这里** —— 那两项归 `openConvAddMenu(scope)`（§20.10.2），
/// 因为它们是"对话层"的动作，两个区块共用一份，与"加一个项目文件夹"不是一回事。
function addMenuAction(act) {
  closeMenus();
  if (act === 'newBlank') {
    askModal({ title: '空白项目', text: '也是一个文件夹 —— 给它起个名字，我在工作目录旁新建。',
      value: '新项目', okText: '创建', onOk: v => {
        const name = (v || '').trim() || '新项目';
        createProject(name, `/Users/mjm/Documents/SuperAgent/${name}`);
      }});
  } else if (act === 'useFolder') {
    openProjectModal('new');                       // §22.12：显示名 + 主要 + 其他文件夹
  }
}

/* ── 对话卡的选项菜单（完全参考小米：重命名/置顶/未读/…/删除，§14.6）
   ⭐ **两个区块共用这一份**（§20.10.3）——「默认」区与每个项目的对话分组
   打开的是同一个菜单、跑的是同一个 action，唯一差别是 `scope`（改哪个池子、工作目录是谁）。 */
let menuCardObj = null;          // null = 默认卡
let menuCardScope = null;        // { kind:'default' } | { kind:'project', project }
/// §23.1 会话右键 —— **骨架照 Orca**（置顶/重命名/归档 › 侧边聊天 › 复制› › 分支 › 删除），
/// 其中 Orca 的「打开侧边聊天」换成**临时聊天**与**临时聊天分屏显示**两个选项；
/// 「复制」收成一个二级菜单 —— 这就是"去重"（原来 复制工作目录 出现在两处）。
function openConvCardMenu(item, scope, anchor, xy) {
  menuCardObj = item;
  menuCardScope = scope;
  menuCardXY = xy || null;
  closeMenus();
  const m = $('#menuCard');
  if (item && !item.sid) { item.sid = newSid(); save(true); }
  const pinLabel = item ? (item.pinned ? '取消置顶' : '置顶对话') : '置顶对话';
  const uname = item && item.unread ? '标记为已读' : '标记为未读';
  m.innerHTML = `
    <button data-act="pin">${pinLabel}</button>
    <button data-act="rename">重命名对话</button>
    <button data-act="archive">归档对话</button>
    <div class="menu-sep"></div>
    <button data-act="tempChat">临时聊天</button>
    <button data-act="tempChatSplit">临时聊天分屏显示</button>
    <div class="menu-sep"></div>
    <button data-act="copyMenu">复制 ›</button>
    <div class="menu-title">会话 ID${item && item.sid ? ' · ' + item.sid : ''}</div>
    <button data-act="sendSid">发送到会话…</button>
    <div class="menu-sep"></div>
    <button data-act="toGroup">放入分组…</button>
    <button data-act="toProject">移动至项目…</button>
    <button data-act="unread">${uname}</button>
    <button data-act="continue">在新对话中继续</button>
    <button data-act="branch">分支</button>
    <div class="menu-sep"></div>
    <button data-act="export">导出对话记录</button>
    <button data-act="delete" class="danger">删除对话</button>`;
  $$('button', m).forEach(b => b.onclick = () => convCardMenuAction(b.dataset.act));
  const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
  // §50 规范 §四：带锚点的菜单一律贴上方（placeMenuAbove：上放不下自动翻下且不盖锚点）；
  // 右键（xy）保持光标处。老的 bottom+4 在菜单超高时被 placeMenu 上提，实测盖住 ⋯ 400px²（D82）。
  if (xy) { m.hidden = false; placeMenu(m, xy.x, xy.y); }
  else if (r) { placeMenuAbove(m, r.left, r.top, r.bottom); }
  else { m.hidden = false; placeMenu(m, 100, 100); }
}
/// 「复制 ›」的二级菜单（四项都收在这里，别在两处重复出现）
function openConvCopyMenu() {
  const item = menuCardObj, scope = menuCardScope;
  const m = $('#menuCardCopy');
  const folder = scope ? (scope.kind === 'default' ? defaultFolderPath() : scope.project.path) : '';
  const link = item && item.sid ? `wanna://session/${item.sid}` : '';
  m.innerHTML = `
    <button data-act="copySid">复制会话 ID</button>
    <button data-act="copyWorkdir">复制工作目录</button>
    <button data-act="copyLink">复制会话链接</button>
    <button data-act="copyMd">复制为 Markdown</button>`;
  $$('#menuCardCopy button').forEach(b => b.onclick = () => {
    const act = b.dataset.act;
    if (act === 'copySid') { navigator.clipboard?.writeText(item && item.sid ? item.sid : ''); toast('已复制会话 ID'); }
    else if (act === 'copyWorkdir') { navigator.clipboard?.writeText(folder); toast(`已复制工作目录 <code>${escapeHtml(folder)}</code>`); }
    else if (act === 'copyLink') { navigator.clipboard?.writeText(link); toast('已复制会话链接'); }
    else if (act === 'copyMd') {
      const md = `# ${item ? item.title : '对话'}\n\n- 会话 ID：${item && item.sid ? item.sid : '-'}\n- 工作目录：${folder}\n- 导出时间：${new Date().toLocaleString()}\n`;
      navigator.clipboard?.writeText(md); toast('已复制为 Markdown');
    }
    closeMenus();
  });
  m.hidden = false;
  const base = $('#menuCard');
  if (!base.hidden) { m.style.left = (base.getBoundingClientRect().right + 4) + 'px'; m.style.top = base.getBoundingClientRect().top + 'px'; }
  else placeMenu(m, (menuCardXY || { x: 200, y: 200 }).x + 120, (menuCardXY || { y: 200 }).y);
}
function convCardMenuAction(act) {
  const pl = menuCardObj, scope = menuCardScope; closeMenus();
  if (!scope) return;
  const name = pl ? pl.title : '默认';
  const folder = scope.kind === 'default' ? defaultFolderPath() : scope.project.path;
  // 所有"从列表里拿掉"的动作都走这一处 —— 改哪个池子由 scope 决定
  const removeFromPool = () => {
    const rest = poolOf(scope).filter(x => x.id !== pl.id);
    if (scope.kind === 'default') S.plans = rest; else scope.project.chats = rest;
  };
  switch (act) {
    case 'rename':
      if (!pl) { toast('默认卡不能重命名'); return; }
      askModal({ title: '重命名对话', value: pl.title, okText: '重命名', onOk: v => {
        if (v && v.trim()) { pl.title = v.trim(); save(true); renderNav(); toast('已重命名'); }
      }});
      break;
    case 'pin':
      if (!pl) { toast('默认卡不用置顶'); return; }
      pl.pinned = !pl.pinned; save(true); renderNav(); toast(pl.pinned ? '已置顶' : '已取消置顶');
      break;
    case 'unread':
      if (!pl) { toast('默认卡没有未读态'); return; }
      pl.unread = !pl.unread; save(true); renderNav();
      toast(pl.unread ? '已标记为未读（行上一个小点）' : '已标记为已读');
      break;
    case 'continue':
      toast(`在新对话中继续「${escapeHtml(name)}」—— 原型里新开一张同内容的卡（落 SwiftUI 接真正的续聊）`);
      break;
    case 'toGroup': {
      if (!pl) { toast('默认卡不参与分组'); return; }
      const gs = poolOf(scope).filter(x => x.isGroup).map(x => x.title);
      if (!gs.length) { toast('还没有分组 —— 上面的 ＋ → 先建一个分组'); return; }
      askModal({ title: '放入分组', text: '可选：' + gs.join(' / ') + '\n（填组名；留空 = 移出分组）',
        value: pl.group || '', okText: '放进去', onOk: v => {
          const gname = (v || '').trim();
          pl.group = gname || null;
          save(true); renderNav();
          toast(gname ? `已把「${escapeHtml(pl.title)}」放入分组 <b>${escapeHtml(gname)}</b>`
                      : `已把「${escapeHtml(pl.title)}」移出分组`);
        }});
      break; }
    case 'toProject': {
      const names = projList(); if (!names) return;
      askModal({ title: '移动至项目', text: '可选：' + names, value: '', okText: '移动', onOk: v => {
        if (!pl) { toast('默认卡不能移动'); return; }
        removeFromPool();
        if (scope.kind === 'default' && S.activePlan === pl.id) S.activePlan = 'default';
        save(true); renderNav();
        toast(`已把「${escapeHtml(pl.title)}」移至项目 ${escapeHtml((v||'').trim())}`);
      }});
      break; }
    case 'archive':
      confirmModal({ title: '归档这段对话？', text: name + '\n（归档后不出现在这个列表里）', okText: '归档', onOk: () => {
        if (!pl) { toast('默认卡不归档'); return; }
        removeFromPool();
        if (scope.kind === 'default' && S.activePlan === pl.id) S.activePlan = 'default';
        if (scope.kind === 'project' && S.activeProjChat === pl.id) S.activeProjChat = null;
        save(true); renderNav(); toast('已归档对话');
      }});
      break;
    case 'copySid':
      if (!pl || !pl.sid) { toast('默认卡没有会话 ID'); return; }
      navigator.clipboard?.writeText(pl.sid);
      toast(`已复制会话 ID <b>${pl.sid}</b>`);
      break;
    case 'sendSid':
      if (!pl || !pl.sid) { toast('默认卡没有会话 ID'); return; }
      askModal({ title: '发送到会话', text: '填目标会话 ID（另一个对话的 ID）。发过去会自动激活那个会话窗口。',
        value: '', okText: '发送', onOk: v => {
          if (!v || !v.trim()) return;
          toast(`已把任务发给 <b>${escapeHtml(v.trim())}</b> —— 那个会话会被自动激活`);
        }});
      break;
    case 'batch': toast('批量管理：多选改名 / 归档（原型先记一笔）'); break;
    // §23.1 Orca「打开侧边聊天」的两个替身
    case 'copyMenu': openConvCopyMenu(); return;
    case 'tempChat':
      S.chatMode = 'temporary'; S.dualScreen = false;
      S.activeTempSessionId = pl ? pl.id : 'default';
      save(true); renderComposerControls(); renderChat();
      toast(`已开<b>临时聊天</b>${pl ? `：${escapeHtml(pl.title)}` : ''}（单屏）`); return;
    case 'tempChatSplit':
      S.chatMode = 'temporary'; S.dualScreen = true;
      S.activeTempSessionId = pl ? pl.id : 'default';
      save(true); renderComposerControls(); renderChat(); renderDualScreen();
      toast(`已开<b>临时聊天 · 分屏</b>${pl ? `：${escapeHtml(pl.title)}` : ''} —— 连续 与 临时 左右并排`); return;
    case 'branch': toast('分支：原型只记一笔（Orca 里是 workspace 的 git branch）'); break;
    case 'copyLink': { const sid = pl && pl.sid ? `wanna://session/${pl.sid}` : '';
      navigator.clipboard?.writeText(sid); toast('已复制会话链接'); break; }
    case 'finder':
      toast(`在 Finder 中显示 <code>${escapeHtml(folder)}</code>`);
      break;
    case 'workdir':
      navigator.clipboard?.writeText(folder);
      toast(`已复制工作目录 <b>${escapeHtml(folder)}</b>`);
      break;
    case 'export':
      toast('导出对话记录：原型导出为 JSON（落 SwiftUI 走 NSPanel 存文件）');
      break;
    case 'delete':
      confirmModal({ title: '删除这段对话？', text: name + '\n不可恢复。', okText: '删除', onOk: () => {
        if (!pl) { toast('默认卡不能删'); return; }
        removeFromPool();
        if (scope.kind === 'default' && S.activePlan === pl.id) S.activePlan = 'default';
        if (scope.kind === 'project' && S.activeProjChat === pl.id) S.activeProjChat = null;
        save(true); renderNav(); toast('已删除对话');
      }});
      break;
  }
}

/* ============================================================
   §22.12 添加 / 编辑项目：**显示名**（不碰文件夹）+ 主要文件夹 + 其他文件夹
   ============================================================ */
let pjMode = 'new';                 // 'new' | 'edit'
let pjTarget = null;                // edit 时指向那个项目
let pjExtras = [];                  // 除主要工作目录以外的文件夹

function openProjectModal(mode, project) {
  pjMode = mode; pjTarget = project || null;
  pjExtras = mode === 'edit' && project ? (project.extraPaths || []).slice() : [];
  $('#pjTitle').textContent = mode === 'edit' ? '编辑项目' : '现有项目（文件夹）';
  $('#pjOk').textContent = mode === 'edit' ? '保存' : '添加';
  const defPath = '/Users/mjm/Documents/SuperAgent/Wanna';
  $('#pjName').value = mode === 'edit' ? project.name : '';
  $('#pjPath').value = mode === 'edit' ? project.path : defPath;
  $('#pjName').placeholder = mode === 'edit' ? '左栏显示的名字（不改文件夹本身）'
                                            : '左栏显示的名字（默认 = 文件夹名）';
  renderProjectFolders();
  $('#projBack').hidden = false;
  $('#pjPath').focus(); $('#pjPath').select();
}
function renderProjectFolders() {
  const host = $('#pjList'); if (!host) return;
  const main = ($('#pjPath').value || '').trim();
  host.innerHTML = '';
  const addRow = (path, isMain) => {
    const row = document.createElement('div');
    row.className = 'pj-row';
    row.innerHTML = `<span class="pj-path"></span>`
      + (isMain ? `<span class="pj-badge">主要</span>`
                : `<button class="pj-set">设为主要</button><button class="pj-x" title="移除">✕</button>`);
    row.querySelector('.pj-path').textContent = path || '（未填）';
    if (!isMain) {
      row.querySelector('.pj-set').onclick = () => {
        // 主要 ⇄ 这个：老的主要降级成普通文件夹
        pjExtras = pjExtras.filter(x => x !== path);
        if (main) pjExtras.unshift(main);
        $('#pjPath').value = path;
        renderProjectFolders();
        toast('已把它设为<b>主要</b>工作目录');
      };
      row.querySelector('.pj-x').onclick = () => {
        pjExtras = pjExtras.filter(x => x !== path);
        renderProjectFolders();
      };
    }
    host.appendChild(row);
  };
  if (main) addRow(main, true);
  pjExtras.filter(x => x && x !== main).forEach(x => addRow(x, false));
  if (!main && !pjExtras.length) {
    host.innerHTML = `<div style="font-size:11.5px;color:var(--ink3);padding:6px 4px">
      还没选文件夹 —— 上面填主要工作目录，或点下面再加一个。</div>`;
  }
}
function saveProjectModal() {
  const main = ($('#pjPath').value || '').trim();
  const name = ($('#pjName').value || '').trim();
  const extras = pjExtras.filter(x => x && x !== main);
  if (!main) { toast('主要工作目录是空的'); $('#pjPath').focus(); return; }
  if (pjMode === 'edit') {
    pjTarget.path = main;
    pjTarget.extraPaths = extras;
    if (name) pjTarget.name = name;                    // §22.12.1 只改显示名
    else pjTarget.name = main.split('/').filter(Boolean).pop() || pjTarget.name;
    save(true); $('#projBack').hidden = true;
    renderNav(); renderContext(); renderCrumbs();
    toast(`已保存 —— 显示名 <b>${escapeHtml(pjTarget.name)}</b>（文件夹本身没动）`);
    return;
  }
  if (!name) {
    askModal({ title: '显示名称', text: '左栏显示这个名字（不改文件夹本身）；留空 = 用文件夹名。',
      value: main.split('/').filter(Boolean).pop() || '项目', okText: '添加', onOk: v => {
        createProject((v || '').trim() || main.split('/').filter(Boolean).pop() || '项目', main, extras);
        $('#projBack').hidden = true;
        toast('已添加项目');
      }});
    return;
  }
  createProject(name, main, extras);
  $('#projBack').hidden = true;
  toast(`已添加项目 <b>${escapeHtml(name)}</b>`);
}

/// §23.7 侧栏项目分组自己的 ⋯ 菜单（Orca：ProjectGroup 没有 type 字段，别造一个）
function openProjGroupMenu(g, anchor) {
  closeMenus();
  const m = $('#menuProjGroup');
  m.innerHTML = `
    <div class="menu-title">${escapeHtml(g.name)}</div>
    <button data-act="rename">重命名分组</button>
    <button data-act="color">颜色…</button>
    <button data-act="collapse">${g.isCollapsed ? '展开分组' : '折叠分组'}</button>
    <div class="menu-sep"></div>
    <button data-act="ungroup">解散分组（项目保留）</button>
    <button data-act="delete" class="danger">删除分组（项目移出）</button>`;
  $$('#menuProjGroup button').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const act = b.dataset.act;
    if (act === 'rename') {
      askModal({ title: '重命名分组', value: g.name, okText: '重命名', onOk: v => {
        if (v && v.trim()) { g.name = v.trim(); save(true); renderNav(); toast('已重命名'); } }});
      return;
    }
    if (act === 'color') {
      showMenu(TAB_ICON_COLORS.map(c => ({ label: `${TAB_COLOR_NAMES[c] || c}  ●`,
        action: () => { g.color = c; save(true); renderNav(); toast('分组颜色已改'); } }))
        .concat([{ sep: true }, { label: '无颜色', action: () => { g.color = null; save(true); renderNav(); } }]),
        null, { x: anchor.getBoundingClientRect().right + 6, y: anchor.getBoundingClientRect().top });
      return;
    }
    closeMenus();
    if (act === 'collapse') { g.isCollapsed = !g.isCollapsed; save(true); renderNav(); }
    else if (act === 'ungroup') { (S.projects || []).forEach(p => { if (p.projectGroupId === g.id) p.projectGroupId = null; });
      S.projectGroups = (S.projectGroups || []).filter(x => x !== g); save(true); renderNav(); toast('已解散分组，项目都还在'); }
    else if (act === 'delete') confirmModal({ title: '删除这个分组？', text: `${g.name}\n项目会移出分组，不会删项目。`,
      okText: '删除', onOk: () => { (S.projects || []).forEach(p => { if (p.projectGroupId === g.id) p.projectGroupId = null; });
        S.projectGroups = (S.projectGroups || []).filter(x => x !== g); save(true); renderNav(); toast('已删除分组'); }});
  });
  m.hidden = false;
  placeMenu(m, anchor.getBoundingClientRect().left, anchor.getBoundingClientRect().bottom + 4);
}

function projList() {
  if (!realProjects().length) { toast('还没有项目可移动'); return null; }
  return realProjects().map(x => x.name).join(' / ');
}

function selectTempCard(id) {
  S.activePlan = id;
  S.activeProjChat = null;          // 选临时卡 = 不再是"项目对话"上下文（§17.4）
  S.tempMode = true;
  S.projectMode = false;            // 选对话 → 编辑区自动折叠（§18.5）
  S.activeTab = -1; S.currentFile = null;   // 同时取消之前选中的文件
  S.projectMode = false;                     // 临时卡不在项目模式里
  // ⚠️ 不要把 activeProject 置空：标签还指着它的文件
  save(); renderNav(); renderContent(); renderComposerControls(); renderContext();
  const pl = id === 'default' ? null : S.plans.find(x => x.id === id);
  // §20.9.4：这一张卡带的项目文件夹 = **默认那个**（不是 activeProject）
  toast(id === 'default' ? `默认对话卡 —— 按快捷键进的就是它<br>项目文件夹：<code>${escapeHtml(defaultFolderPath())}</code>`
    : `对话卡：<b>${escapeHtml(pl ? pl.title : '')}</b><br>项目文件夹：<code>${escapeHtml(defaultFolderPath())}</code>（默认那个）`);
}
function createProject(name, path, extraPaths) {
  const id = 'p' + now();
  S.projects.push({
    id, name, path, pinned: false, open: true,
    extraPaths: Array.isArray(extraPaths) ? extraPaths : [],
    files: {
      'README.md': `# ${name}\n\n绝对路径：\`${path}\`\n\n点左边的文件就能把它设为**重点参考**（可多选）。\n`,
      '脑图.mmd': `mindmap\n  root((${name}))\n    待办\n      先写 README\n`
    },
    tree: [ { name:'README.md', type:'file' }, { name:'脑图.mmd', type:'file' } ]
  });
  S.activeProject = id; S.tempMode = false;
  S.projectMode = true; S.activePlan = null;
  S.tabs = [{ p:id, f:'README.md' }]; S.activeTab = 0;
  S.currentFile = 'README.md'; S.focusFiles = []; S.tab = 'md';
  save(true); renderAll();
  addMsg('sys', `新建项目 <b>${escapeHtml(name)}</b> · <code>${escapeHtml(path)}</code> —— 后续对话默认携带这个绝对路径。`);
  toast(`新项目 <b>${escapeHtml(name)}</b> 已建好`);
}

/* ============================================================
   多标签 + 打开文件
   ============================================================ */
function openInTab(projectId, rel) {
  if (S.activeProject !== projectId) {
    S.activeProject = projectId; S.tempMode = false;
    S.projectMode = true;                      // 打开项目里的文件 = 在项目里工作（进项目模式）
    const p = proj(); if (p) p.open = true;
  }
  const p = S.projects.find(x => x.id === projectId); if (!p) return;
  // ⭐ **单击不再自动加重点参考**（§12.2）—— 重点只由 ⌘单击 / Shift单击 决定，
  // 否则"每点一个就多一个重点"，用户没法自由切换查看别的文件。
  let idx = S.tabs.findIndex(t => t.p === projectId && t.f === rel);
  if (idx < 0) { S.tabs.push({ p: projectId, f: rel }); idx = S.tabs.length - 1; }
  S.activeTab = idx;
  S.currentFile = rel;
  if (rel === MIND_FILE) S.tab = 'mind';
  else if (S.tab === 'mind' || S.tab === 'history') S.tab = (S.tab === 'history' ? 'history' : 'md');
  if (rel !== MIND_FILE) S.tab = S.tab === 'history' ? 'history' : extViewKind(rel) === 'md' ? 'md' : 'file';
  if (rel === MIND_FILE) S.tab = 'mind';
  save(); renderNav(); renderTabs(); renderContent(); renderContext();
}
/// 把某个文件弄成"当前正在看的那一个"（对话改了脑图 / 从历史恢复时用），
/// 否则用户点完只看见标签没变、内容还是别的文件（2026-09-30 实测到的错位）。
function ensureTab(rel) {
  if (!rel) return;
  const p = proj(); if (!p) return;
  if (relOfActiveTab() === rel) { S.currentFile = rel; return; }
  const idx = S.tabs.findIndex(t => t.p === p.id && t.f === rel);
  if (idx >= 0) S.activeTab = idx;
  else { S.tabs.push({ p: p.id, f: rel }); S.activeTab = S.tabs.length - 1; }
  S.currentFile = rel;
}
function extViewKind(rel) {
  const e = extOf(rel);
  if (e === 'md') return 'md';
  if (e === 'mmd') return 'mind';
  return 'file';
}
function closeTab(i) {
  S.tabs.splice(i, 1);
  if (S.activeTab >= S.tabs.length) S.activeTab = S.tabs.length - 1;
  if (S.activeTab < 0) S.activeTab = 0;
  S.currentFile = relOfActiveTab() || null;
  save(); renderTabs(); renderContent(); renderContext();
}
/// §21.4 标签组：颜色取自用户给的那张「为此组命名」图（1 个默认棕 + 8 个色）
const TAB_GROUP_COLORS = ['#8A6A5A', '#4C9BE8', '#E5484D', '#F5A623',
                          '#30A46C', '#E5468A', '#8E4EC6', '#7CB342', '#F76B5A'];
const tabGroupByName = name => (S.tabGroups || []).find(g => g.name === name) || null;
/// §22.1.4 用户自定义的标签图标：`#RRGGBB` 画色块，否则当成 emoji/字符
/// §23.3.4 色板**逐字照 Orca**：…/tab-bar/SortableTabContextMenu.tsx:27-88
/// None(null) / Blue #3b82f6 / Purple #a855f7 / Pink #ec4899 / Red #ef4444 /
/// Orange #f97316 / Yellow #eab308 / Green #22c55e / Teal #14b8a6 / Gray #9ca3af
const TAB_ICON_COLORS = ['#3b82f6', '#a855f7', '#ec4899', '#ef4444',
                         '#f97316', '#eab308', '#22c55e', '#14b8a6', '#9ca3af'];
const TAB_COLOR_NAMES = { '#3b82f6':'Blue', '#a855f7':'Purple', '#ec4899':'Pink', '#ef4444':'Red',
                          '#f97316':'Orange', '#eab308':'Yellow', '#22c55e':'Green',
                          '#14b8a6':'Teal', '#9ca3af':'Gray' };
function customIconHtml(t) {
  if (!t || !t.icon) return null;
  const v = String(t.icon);
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return `<span class="fico" style="background:${v};color:#141416"></span>`;
  return `<span class="fico custom">${escapeHtml(v.slice(0, 2))}</span>`;
}
const tabGroupOf = t => (t && t.group ? tabGroupByName(t.group) : null);
const tabDisplayName = t => t.label || t.f;
/// §23.9 终端标签的图标（不是文件，别拿扩展名去推）
const tabIconFor = t => (t && t.kind === 'terminal') ? { cls: 'term', label: '>_' } : iconFor(t ? t.f : '');
/// 浏览器 / 终端标签都没有「当前文件」——currentFile 只属于文件标签
const fluidTab = t => !!t && (t.kind === 'browser' || t.kind === 'terminal');

function renderTabs() {
  const host = $('#tabs'); host.innerHTML = '';
  S.tabs.forEach((t, i) => {
    const g = tabGroupOf(t);
    const el = document.createElement('div');
    el.className = 'tab' + (i === S.activeTab ? ' is-on' : '') + (t.pinned ? ' is-pin' : '')
      + (g ? ' has-group' : '') + (t.color ? ' has-color' : '');
    if (g) el.style.setProperty('--gc', g.color || TAB_GROUP_COLORS[0]);
    if (t.color) el.style.setProperty('--tc', t.color);
    const ic = tabIconFor(t);
    const ci = customIconHtml(t);
    el.innerHTML = `${ci || `<span class="fico ${ic.cls}"></span>`}<span class="tname"></span><span class="tx" title="关闭标签">×</span>`;
    el.querySelector('.tname').textContent = tabDisplayName(t);
    el.title = tabDisplayName(t) + (t.label && t.f ? `（原名 ${t.f}）` : '')
      + (t.pinned ? '（已固定 · 在最左、按钮变小；右键可取消）' : '')
      + (g ? `\n标签组：${g.name}` : '')
      + '\n右键：分组 / 重命名 / 关闭…';
    el.oncontextmenu = e => { e.preventDefault(); openTabMenu(i, e); };
    // §22.7.2 双击 = 改**显示名**（不碰磁盘文件名）
    el.ondblclick = e => { e.stopPropagation(); renameTabLabel(t); };
    // §22.7.1 按住左右拖动换位
    el.draggable = true;
    el.dataset.ti = i;                     // §25 落点线要按 **S.tabs 索引**落，不是 DOM 序号
    el.ondragstart = e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); };
    el.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
    // §25 标签上**不再自己 drop** —— 落点线和落点必须同一套算法，统一交给容器
    // （标签若也 drop，事件冒泡到容器会执行两次，标签被移两次）
    el.ondragend = () => { el.classList.remove('dragging'); hideDropLine(); };
    el.onclick = e => {
      if (e.target.classList.contains('tx')) { closeTab(i); return; }
      S.activeTab = i; S.currentFile = fluidTab(t) ? null : t.f;
      S.tab = tabViewKind(t);
      save(); renderTabs(); renderContent(); renderContext(); renderNav();
    };
    host.appendChild(el);
  });
  if (S.tabsVertical) renderTabsVertical();
}

/* ============================================================
   §21.2 / §21.3 标签显示方式：横向 ⇄ 垂直
   ============================================================ */
function applyTabsLayout() {
  const vertical = !!S.tabsVertical;
  const btn = $('#btnTabsLayout');
  if (btn) {
    btn.classList.toggle('is-on', vertical);
    btn.textContent = vertical ? '▥' : '▤';
    btn.title = vertical ? '显示方式：垂直（点回横向）' : '显示方式：横向（点看垂直列表）';
  }
  const strip = $('#tabs'); if (strip) strip.hidden = vertical;
  const panel = $('#tabsVertical'); if (panel) panel.hidden = !vertical;
  // §22.1：垂直 = 挪到正文**左边**的一列
  const ws = $('#workspace');
  if (ws) {
    ws.classList.toggle('side-tabs', vertical);
    if (vertical && S.tvWidth) ws.style.setProperty('--tv-w', S.tvWidth + 'px');
    else ws.style.removeProperty('--tv-w');
  }
  if (vertical) renderTabsVertical(); else renderTabs();
}
function toggleTabsLayout() {
  S.tabsVertical = !S.tabsVertical;
  save(true);
  applyTabsLayout();
  toast(S.tabsVertical ? '标签已切成<b>垂直</b>显示 —— 顶部能搜、固定的小图标最多 4 行'
                       : '标签已切回<b>横向</b>显示');
}

/// §21.3 垂直形态：固定的小图标格 + 竖排列表（分组挂在组头下面）
function renderTabsVertical() {
  const panel = $('#tabsVertical'); if (!panel || panel.hidden) return;
  const kw = (($('#tvSearch') && $('#tvSearch').value) || '').trim().toLowerCase();
  const hit = t => !kw || tabDisplayName(t).toLowerCase().includes(kw) || String(t.f || '').toLowerCase().includes(kw);

  // ── ① 固定的：缩成小图标，每行几个由面板宽度算，**最多 4 行** ──
  const grid = $('#tvPinned');
  const pinned = S.tabs.filter(t => t.pinned && hit(t));
  const avail = Math.max(220, panel.clientWidth - 16);
  const cols = Math.max(3, Math.min(14, Math.floor(avail / 44)));
  grid.style.setProperty('--tv-cols', cols);
  grid.hidden = pinned.length === 0;
  grid.innerHTML = '';
  const maxCells = cols * 4;                    // §21.3.3 最多 4 行
  pinned.slice(0, maxCells).forEach(t => {
    const i = S.tabs.indexOf(t);
    const cell = document.createElement('div');
    cell.className = 'tv-cell' + (i === S.activeTab ? ' is-on' : '') + (t.color ? ' has-color' : '');
    const g = tabGroupOf(t);
    if (g) cell.style.setProperty('--gc', g.color || TAB_GROUP_COLORS[0]);
    if (t.color) cell.style.setProperty('--tc', t.color);
    cell.innerHTML = `${customIconHtml(t) || `<span class="fico ${tabIconFor(t).cls}"></span>`}`
      + `<button class="x" title="关闭">×</button>`;
    cell.title = tabDisplayName(t) + '\n右键：分组 / 重命名 / 取消固定';
    cell.querySelector('.x').onclick = e => { e.stopPropagation(); closeTab(i); };
    cell.onclick = () => activateTab(i);
    cell.oncontextmenu = e => { e.preventDefault(); openTabMenu(i, e); };
    grid.appendChild(cell);
  });
  const overflow = pinned.length - Math.min(pinned.length, maxCells);
  if (overflow > 0) {
    const more = document.createElement('div');
    more.className = 'tv-cell more';
    more.textContent = `+${overflow}`;
    more.title = `还有 ${overflow} 个固定标签没画出来（一行装不下超过 4 行）`;
    more.onclick = () => toast(`固定标签太多 —— 面板宽度只够 ${maxCells} 个，还有 <b>${overflow}</b> 个收在这里`);
    grid.appendChild(more);
  }

  // ── ② 竖排列表（保持 tab 原顺序；分组连续出现，组头 + 缩进的组员） ──
  const list = $('#tvList'); list.innerHTML = '';
  const body = S.tabs.filter(t => !t.pinned);
  let idx = 0, drawn = 0;
  while (idx < body.length) {
    const t = body[idx];
    if (!t.group) {
      if (hit(t)) { list.appendChild(tvItemRow(t, false)); drawn++; }
      idx++; continue;
    }
    const name = t.group;
    const members = [];
    while (idx < body.length && body[idx].group === name) { members.push(body[idx]); idx++; }
    const grp = tabGroupByName(name) || { name, color: TAB_GROUP_COLORS[0], open: true };
    const visible = members.filter(hit);
    if (kw && !visible.length) continue;
    list.appendChild(tvGroupRow(grp, members));
    drawn++;
    if (grp.open !== false) { visible.forEach(x => { list.appendChild(tvItemRow(x, true)); drawn++; }); }
  }
  if (!drawn) {
    // 别一律喊「还没有标签」—— 标签可能只是**全被固定到上面那排小图标里**了
    const anyVisiblePinned = pinned.length > 0;
    const allPinned = S.tabs.length > 0 && !S.tabs.some(t => !t.pinned);
    const msg = kw
      ? (anyVisiblePinned ? '匹配的标签都在上面那排固定小图标里'
                          : `没有匹配「${escapeHtml(kw)}」的标签`)
      : (allPinned ? '标签都在上面那排固定小图标里' : '还没有标签 —— 点下面新建');
    list.innerHTML = `<div class="tv-empty">${msg}</div>`;
  }
}
/// §22.7.1 拖动换位（稳定的：同位置直接返回）
function moveTabTo(from, to) {
  if (from === to || from < 0 || from >= S.tabs.length) return;
  const active = S.tabs[S.activeTab];
  const [t] = S.tabs.splice(from, 1);
  S.tabs.splice(to, 0, t);
  const ai = S.tabs.indexOf(active); if (ai >= 0) S.activeTab = ai;
  save(true); renderTabs();
  toast(`已把「${escapeHtml(t.label || t.f)}」移到第 ${to + 1} 位`);
}
function activateTab(i) {
  const t = S.tabs[i]; if (!t) return;
  S.activeTab = i; S.currentFile = fluidTab(t) ? null : t.f;
  S.tab = tabViewKind(t);
  save(); renderTabs(); renderContent(); renderContext(); renderNav();
}
function tvItemRow(t, isChild) {
  const i = S.tabs.indexOf(t);
  const g = tabGroupOf(t);
  const el = document.createElement('div');
  el.className = 'tv-item' + (i === S.activeTab ? ' is-on' : '') + (isChild ? ' is-child' : '')
    + (t.color ? ' has-color' : '');
  if (g) el.style.setProperty('--gc', g.color || TAB_GROUP_COLORS[0]);
  if (t.color) el.style.setProperty('--tc', t.color);
  el.innerHTML = `${customIconHtml(t) || `<span class="fico ${tabIconFor(t).cls}"></span>`}
    <span class="nm"></span><button class="x" title="关闭">×</button>`;
  el.querySelector('.nm').textContent = tabDisplayName(t);
  el.title = tabDisplayName(t) + (t.label && t.f ? `（原名 ${t.f}）` : '');
  el.querySelector('.x').onclick = e => { e.stopPropagation(); closeTab(i); };
  el.onclick = () => activateTab(i);
  el.ondblclick = e => { e.stopPropagation(); renameTabLabel(t); };
  el.oncontextmenu = e => { e.preventDefault(); openTabMenu(i, e); };
  el.draggable = true;
  el.dataset.ti = i;                       // §25 同上：落点按 S.tabs 索引
  el.ondragstart = e => { e.dataTransfer.setData('text/plain', String(i)); el.classList.add('dragging'); };
  el.ondragover = e => { e.preventDefault(); };
  el.ondragend = () => { el.classList.remove('dragging'); hideDropLine(); };
  return el;
}
function tvGroupRow(grp, members) {
  const el = document.createElement('div');
  const open = grp.open !== false;
  el.className = 'tv-group' + (open ? '' : ' closed');
  el.style.setProperty('--gc', grp.color || TAB_GROUP_COLORS[0]);
  el.innerHTML = `<span class="dot"></span><span class="nm"></span>
    <span class="ct">${members.length}</span><span class="cv">▼</span>`;
  el.querySelector('.nm').textContent = grp.name;
  el.title = `标签组「${grp.name}」· ${members.length} 个标签\n点 = 折叠/展开，右键 = 改名/换颜色/解散…`;
  el.onclick = () => { grp.open = !grp.open; save(true); renderTabsVertical(); };
  el.oncontextmenu = e => { e.preventDefault(); openTabGroupMenu(grp, { x: e.clientX, y: e.clientY }); };
  return el;
}

/* ============================================================
   内容区
   ============================================================ */
function renderAll() { renderNav(); renderTabs(); renderContext(); renderContent(); renderModes(); renderChatModes(); renderChat(); renderSendPolicy(); renderQuickCommandBar(); }

function focusChipEl(entry) {
  const rel = entry.f, pr = projectById(entry.p);
  const el = document.createElement('span');
  el.className = 'fchip';
  const full = pr ? `${pr.path}/${rel}` : rel;
  el.title = full + '\n单击=定位到左边的文件 · 双击=在编辑区打开';
  el.innerHTML = `${treeIconSVG(rel, false)}<span class="fname"></span>
    <span class="fproj"></span><button class="x" title="取消参考">×</button>`;
  el.querySelector('.fname').textContent = rel;
  el.querySelector('.fproj').textContent = pr && pr.name ? pr.name : '';   // 跨项目标出处
  el.querySelector('.fname').onclick = ev => {
    ev.stopPropagation();
    if (pr && S.activeProject !== pr.id) { S.activeProject = pr.id; pr.open = true; renderNav(); }
    locateFileInTree(rel, entry.p);
  };
  el.querySelector('.fname').ondblclick = ev => {
    ev.stopPropagation();
    if (pr) { S.projectMode = true; S.activeProject = pr.id; openInTab(pr.id, rel);
      save(); renderNav(); renderContent(); }
  };
  el.querySelector('.x').onclick = ev => {
    ev.stopPropagation();
    S.focusFiles = (S.focusFiles || []).filter(x => !(x.p === entry.p && x.f === entry.f));
    save(); renderNav(); renderContext();
    toast(`已取消参考 · ${rel}`);
  };
  return el;
}

/// 重点参考：**必须同一行**（§13.3）—— 放不下的收到**最左侧那个 +** 里
function renderContext() {
  const focuses = S.focusFiles || [], n = focuses.length;
  const chips = $('#focusChips'), more = $('#btnFocusMore'), list = $('#focusList');
  chips.innerHTML = ''; list.innerHTML = ''; list.hidden = true;
  more.textContent = n ? `重点 ${n}` : '重点';
  more.classList.toggle('is-zero', !n);
  if (n) buildFocusList();          // 内容准备好；**开关的 onclick 绑在 bind 里**（更稳）

  // 行里最多露 3 枚（横向放不下就靠 overflow 截断），其余去 + 里
  focuses.slice(0, 3).forEach(e => chips.appendChild(focusChipEl(e)));

  const inProject = S.projectMode && proj();
  const card = S.activePlan && S.activePlan !== 'default'
    ? (S.plans.find(x => x.id === S.activePlan) || null) : null;
  // §20.9.4：不在项目里时，这一行给的就是**默认项目文件夹**
  const ctxPath = contextFolderPath();
  const isDefaultCtx = ctxPath === defaultFolderPath() && !inProject;
  $('#chatCtxProject').textContent = inProject ? proj().path
    : `${isDefaultCtx ? '默认 · ' : ''}${ctxPath}` + (card ? ` · ${card.title}` : '');
  $('#chatCtxProject').title = $('#chatCtxProject').textContent;
  renderCrumbs();
}
function buildFocusList() {
  const list = $('#focusList');
  const focuses = S.focusFiles || [];
  {
    list.innerHTML = '';
    if (!focuses.length) {
      list.innerHTML = `<div style="padding:10px;color:var(--ink3);font-size:12px">
        还没有重点参考。<br><b>Shift / ⌘ + 单击</b> 文件加入（可跨项目）。</div>`;
      return;
    }
    focuses.forEach(entry => {
      const rel = entry.f, pr = projectById(entry.p);
      const it = document.createElement('div');
      it.className = 'focus-item';
      it.innerHTML = `${treeIconSVG(rel, false)}<span class="fname"></span>
        <span class="fproj"></span><button class="x" title="取消参考">×</button>`;
      it.querySelector('.fname').textContent = rel;
      it.querySelector('.fproj').textContent = pr ? pr.name : '';
      it.querySelector('.fname').title = pr ? `${pr.path}/${rel}` : rel;
      it.querySelector('.x').onclick = e => {
        e.stopPropagation();
        S.focusFiles = (S.focusFiles || []).filter(x => !(x.p === entry.p && x.f === entry.f));
        save(); renderNav(); renderContext();
      };
      list.appendChild(it);
    });
  }
}
function toggleFocusList() {
  const list = $('#focusList'); if (!list) return;
  const willOpen = list.hidden;
  if (willOpen) buildFocusList();
  list.hidden = !willOpen;
}


/// §22.10 拆分半屏：只读显示那一个标签的内容（md 渲染成 HTML，其它给原文）
function renderSplitPane() {
  const el = $('#wsSplit'); if (!el) return;
  const side = S.splitSide;
  const t = (side && typeof S.splitIndex === 'number') ? S.tabs[S.splitIndex] : null;
  if (!side || !t) { el.hidden = true; return; }
  el.hidden = false;
  el.dataset.side = side;
  $('#wsSplitName').textContent = t.label || t.f;
  const ic = tabIconFor(t);
  const ico = $('#wsSplitIco'); ico.className = `fico ${ic.cls}`;
  const pr = projectById(t.p);
  const body = $('#wsSplitBody');
  if (t.kind === 'browser') { body.innerHTML = `<p>浏览器标签不参与拆分（原型只拆文件）。</p>`; return; }
  if (t.kind === 'terminal') { body.innerHTML = `<p>终端标签用右键菜单里的<b>拆分终端</b>（拆的是终端自己，不是这个预览半屏）。</p>`; return; }
  const content = (pr && pr.files[t.f]) || '';
  const e = extOf(t.f);
  if (e === 'md') body.innerHTML = mdToHtml(content);
  else if (e === 'html' || e === 'htm') body.innerHTML = `<p style="color:var(--ink3)">HTML 页面在主视图里预览；拆分这一侧只给源码：</p><pre>${escapeHtml(content)}</pre>`;
  else if (content === '__PDF__') body.innerHTML = `<p style="color:var(--ink3)">PDF 不参与拆分（主视图里已经是渲染后的页面）。</p>`;
  else body.innerHTML = `<pre>${escapeHtml(content)}</pre>`;
}

function renderCrumbs() {
  const at = S.tabs[S.activeTab];
  if (at && at.kind === 'browser') {
    const c = $('#crumbs'); c.innerHTML = '';
    const a = document.createElement('span'); a.className = 'c-proj'; a.textContent = '浏览器';
    const s2 = document.createElement('span'); s2.className = 'c-sep'; s2.textContent = '›';
    const f = document.createElement('span'); f.className = 'c-file'; f.textContent = at.label || '新标签页';
    c.append(a, s2, f);
    $('#fullPathLabel').textContent = at.url || '（新标签页）';
    return;
  }
  const rel = relOfActiveTab(), p = proj();
  $('#crumbs').innerHTML = '';
  if (!p || !rel) { $('#crumbs').innerHTML = `<span class="c-proj">临时对话</span>`; $('#fullPathLabel').textContent = '—'; return; }
  const a = document.createElement('span'); a.className = 'c-proj'; a.textContent = p.name;
  const s = document.createElement('span'); s.className = 'c-sep'; s.textContent = '›';
  const f = document.createElement('span'); f.className = 'c-file'; f.textContent = rel;
  $('#crumbs').append(a, s, f);
  $('#fullPathLabel').textContent = fullPath(rel);
  $('#fullPathLabel').title = fullPath(rel);
}

/// §15.4：一个滑块 = 编辑区开/关。开 = 项目三栏；关 = 只剩 左栏 + 对话。
function applyWorkspaceVisibility() {
  const main = $('#main');
  if (!main) return;
  main.classList.toggle('no-workspace', !S.projectMode);
  const sw = $('#editorSwitch');
  if (sw) sw.classList.toggle('is-on', !!S.projectMode);
}

function renderContent() {
  applyWorkspaceVisibility();
  const rel = relOfActiveTab(), p = proj();
  const activeTab = S.tabs[S.activeTab];
  const hasFile = !!(p && rel);
  ['#viewMd','#viewFile','#viewMind','#viewHistory','#viewBrowser'].forEach(s => $(s).classList.remove('is-on'));
  const vb = $('#viewBrowser'); if (vb) vb.hidden = true;
  // §23.9 终端标签：不是 .view，靠 hidden + is-tab 两态；切到别的标签就收回去
  const tp = $('#termPanel');
  if (tp && !(activeTab && activeTab.kind === 'terminal')) { tp.hidden = true; tp.classList.remove('is-tab'); }

  // §23.9 终端标签：同一块 .term-panel 铺满内容区（双击/点标签 = 切到这一张终端）
  if (activeTab && activeTab.kind === 'terminal' && tp) {
    $('#viewEmpty').classList.add('is-off');
    $('#tabbar').style.display = '';
    $('#fileHead').style.display = 'none';
    $('#mdBar').style.display = 'none';
    tp.hidden = false; tp.classList.add('is-tab');
    $('#termTitle').textContent = activeTab.term?.title || activeTab.label || '终端';
    $('#termPath').textContent = activeTab.term?.path || '';
    // 打字机一次只为**看得见的那张**终端跑：切过来就把上一张的定时器收掉，再接着这张往下敲
    if (termTyping && termTyping.t !== activeTab) { clearTimeout(termTyping.id); termTyping = null; }
    if (!termTyping) {
      const L = activeTab.term?.lines || [];
      if (activeTab.term && activeTab.term.li < L.length) termStep(activeTab);
    }
    renderTermPanes(); termPaint();
    renderSplitPane();
    renderHistoryBadge();
    return;
  }

  // §22.14 浏览器标签：不走「项目 / 文件」那套门槛 —— 它自己就是一整页
  if (activeTab && activeTab.kind === 'browser') {
    $('#viewEmpty').classList.add('is-off');
    $('#tabbar').style.display = '';
    $('#fileHead').style.display = 'none';
    $('#mdBar').style.display = 'none';
    vb.hidden = false; vb.classList.add('is-on');
    renderBrowser();
    renderSplitPane();
    renderHistoryBadge();
    return;
  }

  // 没进项目模式 = **对话模式**（§12.0）：中间不显示工作区，右边还是原来那个对话窗口
  if (!S.projectMode) {
    $('#emptyTitle').textContent = '对话模式';
    $('#emptySub').innerHTML = '上面的 <b>图文 / 语音 / 视频</b> 就是原来的对话窗口，功能与历史完全不变。<br>'
      + '点顶部 <b>项目</b> 进入项目模式 —— 上下文换成项目文件夹、选中的文件，以及这个项目自己的 claude.md / hooks。<br>'
      + '左侧还有 <b>临时规划</b>：不带项目，单独一段规划。';
    $('#viewEmpty').classList.remove('is-off');
    $('#tabbar').style.display = 'none'; $('#fileHead').style.display = 'none'; $('#mdBar').style.display = 'none';
    renderHistoryBadge(); return;
  }
  if (S.tempMode || !p) {
    $('#emptyTitle').textContent = '临时规划 / 临时对话';
    $('#emptySub').innerHTML = '没有项目文件夹 —— 就在这里和 AI 简单聊，或从左边 ＋ 选一种添加方式。<br>'
      + '添加时有三项：<b>添加空白项目 · 添加临时规划 · 添加现有项目</b>。';
    $('#viewEmpty').classList.remove('is-off');
    $('#tabbar').style.display = 'none'; $('#fileHead').style.display = 'none'; $('#mdBar').style.display = 'none';
    renderHistoryBadge(); return;
  }
  if (!hasFile) {
    $('#emptyTitle').textContent = '这个项目还没有打开文件';
    $('#emptySub').innerHTML = '在左边点一个文件打开它。<br><b>⌘+单击</b> 才会把它加成「重点参考」，<b>Shift+单击</b> 范围多选。';
    $('#viewEmpty').classList.remove('is-off');
    $('#mdBar').style.display = 'none';
    renderHistoryBadge(); return;
  }
  $('#viewEmpty').classList.add('is-off');

  const kind = extViewKind(rel);
  $('#tabbar').style.display = ''; $('#fileHead').style.display = '';
  $('#mdBar').style.display = kind === 'md' ? '' : 'none';
  $('#viewModes').style.display = kind === 'md' ? '' : 'none';

  renderSplitPane();                     // §22.10 有拆分就画那半边

  if (S.tab === 'history') {
    $('#viewHistory').classList.add('is-on'); renderHistory();
  } else if (kind === 'md') {
    $('#viewMd').classList.add('is-on');
    $('#viewMd').dataset.variant = S.mdVariant;
    renderMd(); renderMdToolbar();
  } else if (kind === 'mind') {
    $('#viewMind').classList.add('is-on'); renderMind();
  } else {
    $('#viewFile').classList.add('is-on'); renderFilePreview(rel);
  }
  renderHistoryBadge();
}

function renderMdToolbar() {
  const vm = { edit: S.mdVariant === 'edit', preview: S.mdVariant === 'preview' };
  $$('#viewModes .vm').forEach(b => b.classList.toggle('is-on',
    S.mdVariant === 'split' ? b.dataset.vm === 'preview' : vm[b.dataset.vm]));
  // §22.9.3 折叠按钮只剩一颗、恒在 .mind-bar 最左 —— 这里不再藏/露它
}

/// 工具栏上那颗「历史 N」的数字（§12.9：历史恢复按钮要看得见）
function renderHistoryBadge() {
  const n = (S.history[histFile()] || []).length;
  const head = $('#histCountHead'); if (head) head.textContent = n;
  $('#histFile').textContent = histFile() ? fullPath(histFile()) : '—';
}

/* ── Markdown 渲染 ──────────────────────────── */
function mdToHtml(src) {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inline = s => s
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img src="$2" alt="$1" style="max-width:100%">');
  const lines = esc(src).split('\n');
  let html = '', inCode = false, list = null, para = [], table = false;
  const flushPara = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const closeTable = () => { if (table) { html += `</table>`; table = false; } };
  for (const raw of lines) {
    if (/^```/.test(raw)) { flushPara(); closeList(); closeTable();
      if (!inCode) { html += '<pre><code>'; inCode = true; } else { html += '</code></pre>'; inCode = false; } continue; }
    if (inCode) { html += raw + '\n'; continue; }
    if (/^\|.*\|$/.test(raw.trim())) {
      flushPara(); closeList();
      if (/^\|[\s:-]+\|/.test(raw.replace(/\s/g,''))) continue;       // 分隔行
      if (!table) { html += '<table>'; table = true; }
      const cells = raw.trim().replace(/^\||\|$/g,'').split('|').map(c => c.trim());
      html += '<tr>' + cells.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>';
      continue;
    }
    closeTable();
    if (!raw.trim()) { flushPara(); closeList(); continue; }
    let m;
    if ((m = raw.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); closeList();
      html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue; }
    if (/^(-{3,}|\*{3,})$/.test(raw.trim())) { flushPara(); closeList(); html += '<hr>'; continue; }
    if ((m = raw.match(/^&gt;\s?(.*)$/))) { flushPara(); closeList(); html += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    if ((m = raw.match(/^[-*]\s+\[( |x)\]\s+(.*)$/i))) { flushPara();
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${m[1].toLowerCase()==='x'?'✅':'⬜'} ${inline(m[2])}</li>`; continue; }
    if ((m = raw.match(/^[-*]\s+(.*)$/))) { flushPara();
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = raw.match(/^\d+\.\s+(.*)$/))) { flushPara();
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inline(m[1])}</li>`; continue; }
    closeList(); para.push(raw);
  }
  flushPara(); closeList(); closeTable();
  if (inCode) html += '</code></pre>';
  return html || '<div class="md-empty">（空文件）</div>';
}

let mdDebounce;
function renderMd() {
  const rel = relOfActiveTab(); if (!rel) return;
  const ta = $('#mdSource');
  const content = fileContent(rel);
  if (ta.value !== content) ta.value = content;
  $('#mdPreview').innerHTML = mdToHtml(ta.value);
}
function onMdEdit() {
  const rel = relOfActiveTab(); if (!rel || !proj()) return;
  proj().files[rel] = $('#mdSource').value;
  $('#mdPreview').innerHTML = mdToHtml(proj().files[rel]);
  clearTimeout(mdDebounce);
  mdDebounce = setTimeout(() => {
    pushHistory(rel, '手改', proj().files[rel], '正文编辑'); save();
    const n = (S.history[rel] || []).length;
    // 存完立刻告诉他，并给一个**可点的**跳转 —— 他两次都找不到恢复入口（§13.6）
    toast(`已自动存一版历史（共 <b>${n}</b> 版） · <a href="#" data-jump-history>点这里恢复</a>`);
  }, 700);
  if (previewEditSession) armPreviewIdleReturn();
  save();
}

/* 点预览 → 进编辑（落在你点的那一行）；ESC / 停手 → 回预览 */
let previewEditSession = false, previewIdleTimer = null;
function lineIndexAtPoint(ev) {
  const root = $('#mdPreview');
  let range = null;
  if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(ev.clientX, ev.clientY);
  if (!range && document.caretPositionFromPoint) {
    const cp = document.caretPositionFromPoint(ev.clientX, ev.clientY);
    if (cp) { range = document.createRange(); range.setStart(cp.offsetNode, cp.offset); }
  }
  if (!range) return 0;
  let offset = 0, found = false;
  const walk = n => { if (found) return;
    if (n === range.startContainer) { offset += range.startOffset; found = true; return; }
    if (n.nodeType === 3) { offset += n.nodeValue.length; return; }
    for (const c of n.childNodes) { walk(c); if (found) return; } };
  walk(root);
  return root.textContent.slice(0, offset).split('\n').length - 1;
}
function lineStartOffset(text, i) {
  const lines = text.split('\n'); let off = 0;
  for (let k = 0; k < i && k < lines.length; k++) off += lines[k].length + 1;
  return Math.min(off, text.length);
}
function focusEditorAtLine(line) {
  const ta = $('#mdSource');
  requestAnimationFrame(() => {
    ta.focus({ preventScroll: false });
    try { const p = lineStartOffset(ta.value, line); ta.setSelectionRange(p, p); } catch {}
  });
}
function onPreviewClick(ev) {
  if (S.tab !== 'md') return;
  const line = lineIndexAtPoint(ev);
  if (S.mdVariant === 'split') { S.mdSource_focus = true; focusEditorAtLine(line); return; }
  S.mdVariant = 'edit'; previewEditSession = true;
  save(); renderContent(); focusEditorAtLine(line); armPreviewIdleReturn();
  toast('已进入编辑 —— 按 <b>ESC</b> 或停手一会儿，回到实时预览');
}
function armPreviewIdleReturn() {
  clearTimeout(previewIdleTimer);
  previewIdleTimer = setTimeout(() => leavePreviewEditSession(true), 1400);
}
function leavePreviewEditSession(toPreview) {
  if (!previewEditSession) return;
  previewEditSession = false; clearTimeout(previewIdleTimer);
  if (toPreview && S.mdVariant === 'edit') { S.mdVariant = 'preview'; save(); renderContent(); }
}

/* Orca 式工具栏插入 */
function mdInsert(kind) {
  const ta = $('#mdSource'); if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e);
  const wrap = (pre, post) => pre + (sel || '文字') + post;
  const line = pre => {
    const start = ta.value.lastIndexOf('\n', s - 1) + 1;
    ta.setRangeText(pre, start, start, 'end');
  };
  switch (kind) {
    case 'h1': line('# '); break;
    case 'h2': line('## '); break;
    case 'h3': line('### '); break;
    case 'bold': ta.setRangeText(wrap('**','**'), s, e, 'select'); break;
    case 'italic': ta.setRangeText(wrap('*','*'), s, e, 'select'); break;
    case 'list': line('- '); break;
    case 'quote': line('> '); break;
    case 'link': ta.setRangeText(wrap('[','](https://)'), s, e, 'select'); break;
    case 'image': ta.setRangeText(wrap('![','](https://)'), s, e, 'select'); break;
    case 'code': ta.setRangeText(wrap('`','`'), s, e, 'select'); break;
  }
  ta.focus(); onMdEdit();
}

/* ── 其它文件：HTML / PDF / 代码 —— 窗口内直接显示 ── */
function renderFilePreview(rel) {
  const e = extOf(rel), content = fileContent(rel);
  const frame = $('#previewFrame'), code = $('#codeView');
  if (e === 'html' || e === 'htm') {
    frame.hidden = false; code.hidden = true;
    frame.removeAttribute('src');
    frame.srcdoc = content;
  } else if (e === 'pdf') {
    frame.hidden = false; code.hidden = true;
    frame.removeAttribute('srcdoc');
    const raw = content === '__PDF__' ? samplePDF() : content;
    const b64 = btoa(raw);
    frame.src = `data:application/pdf;base64,${b64}#toolbar=0&view=FitH`;
  } else {
    frame.hidden = true; code.hidden = false;
    code.textContent = content || '（空文件）';
  }
}

/* ============================================================
   历史（每文件最近 10 次）
   ============================================================ */
function pushHistory(rel, source, content, summary, force = false) {
  if (!rel) return;
  const list = S.history[rel] || (S.history[rel] = []);
  const last = list[0];
  if (!force && last && last.content === content) return;
  list.unshift({ ts: now(), source, content, summary });
  if (list.length > 10) list.length = 10;              // 每文件留最近 10 次
  save();
  renderHistoryBadge();                             // 文件头那颗「历史 N」跟着变
}
function renderHistory() {
  const rel = histFile(), list = S.history[rel] || [];
  const host = $('#histList'); host.innerHTML = '';
  $('#histFile').textContent = rel ? fullPath(rel) : '—';
  if (!list.length) {
    host.innerHTML = `<div class="hist-empty">这个文件还没有历史。<br>改一次正文、改一次脑图，或让对话动它一下 —— 都会自动出现在这里。</div>`;
    return;
  }
  list.forEach((h, i) => {
    const older = list[i + 1];
    const li = document.createElement('li');
    li.className = 'hist-item' + (i === 0 ? ' is-new' : '');
    li.innerHTML = `
      <div class="hi-top">
        <span class="hist-when">${fmtTime(h.ts)}</span>
        <span class="hist-src src-${h.source}">${h.source}</span>
        <span class="hist-sum">${escapeHtml(h.summary || '')}</span>
      </div>
      <div class="hi-acts">
        <button class="btn btn-mini" data-a="diff">改了什么</button>
        <button class="btn btn-mini" data-a="view">查看这一版</button>
        <button class="btn btn-mini" data-a="loc">定位文件</button>
        <button class="btn btn-mini hi-restore" data-a="restore">恢复到这一版</button>
      </div>
      <div class="hi-diff" hidden></div>`;
    li.querySelector('[data-a="diff"]').onclick = () => {
      const pane = li.querySelector('.hi-diff');
      if (!pane.hidden) { pane.hidden = true; return; }
      const prev = older ? older.content : '';
      const d = lineDiff(prev, h.content);
      const st = diffStat(d);
      pane.hidden = false;
      pane.innerHTML = `<div class="hi-diff-head">相对上一版 <b>+${st.add}</b> / <b>−${st.del}</b> 行</div>` +
        d.slice(0, 200).map(l =>
          `<div class="dl ${l.t === '+' ? 'add' : l.t === '-' ? 'del' : 'ctx'}">` +
          `<span class="dl-t">${l.t === '+' ? '+' : l.t === '-' ? '−' : ' '}</span>` +
          `<span class="dl-s">${escapeHtml(l.s) || ' '}</span></div>`).join('') +
        (d.length > 200 ? '<div class="dl-more">（只显示前 200 行）</div>' : '');
    };
    li.querySelector('[data-a="view"]').onclick = () => viewHistory(rel, h);
    li.querySelector('[data-a="loc"]').onclick = () => locateFileInTree(rel, proj() ? proj().id : null);
    li.querySelector('[data-a="restore"]').onclick = () => restore(rel, i);
    host.appendChild(li);
  });
}
function restore(rel, index) {
  const h = (S.history[rel] || [])[index]; if (!h) return;
  proj().files[rel] = h.content;
  pushHistory(rel, '恢复', h.content, `恢复到 ${fmtTime(h.ts)} 那一版（改前内容已备份）`, true);
  ensureTab(rel);
  if (extViewKind(rel) === 'mind') { $('#mindSource').value = h.content; S.tab = 'mind'; }
  else { $('#mdSource').value = h.content; $('#mdPreview').innerHTML = mdToHtml(h.content); S.tab = 'md'; }
  save(); renderNav(); renderTabs(); renderContent(); renderContext();
  toast(`已恢复 <b>${fmtTime(h.ts)}</b> 那一版；改前内容仍在历史里`);
}

/* ============================================================
   脑图（mermaid）
   ============================================================ */
function parseMindmap(text) {
  const errors = [];
  const rows = text.split('\n').map(l => ({ indent: l.match(/^[\t ]*/)[0].replace(/\t/g,'  ').length, text: l.trim() }))
    .filter(r => r.text.length);
  if (!rows.length) throw new Error('脑图是空的');
  if (!/^mindmap\b/i.test(rows[0].text)) errors.push('第一行应以 mindmap 开头（仍按缩进解析）');
  else rows.shift();
  if (!rows.length) throw new Error('脑图里没有节点');
  rows[0].text = rows[0].text.replace(/^root\s*/i, '');          // `root((…))` 的 root 是关键字
  const clean = t => t.replace(/^\(\((.*)\)\)$/,'$1').replace(/^\((.*)\)$/,'$1')
    .replace(/^\[\[(.*)\]\]$/,'$1').replace(/^\{\{(.*)\}\}$/,'$1').replace(/^\[(.*)\]$/,'$1').trim();
  const shapeOf = t => /^\(\(.*\)\)$/.test(t) ? 'root' : /^\(.*\)$/.test(t) ? 'round'
    : /^\[\[.*\]\]$/.test(t) ? 'rect' : /^\{\{.*\}\}$/.test(t) ? 'hex' : 'plain';
  const rootIndent = rows[0].indent;
  const root = { id:'n0', text: clean(rows[0].text), shape: shapeOf(rows[0].text), children: [] };
  const stack = [{ indent: rootIndent, node: root }];
  let uid = 1;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.indent <= rootIndent) { errors.push(`第 ${i+2} 行缩进回到根级，已忽略：${r.text.slice(0,24)}`); continue; }
    while (stack.length > 1 && r.indent <= stack[stack.length-1].indent) stack.pop();
    const node = { id:'n'+uid++, text: clean(r.text), shape: shapeOf(r.text), children: [], parent: stack[stack.length-1].node };
    stack[stack.length-1].node.children.push(node);
    stack.push({ indent: r.indent, node });
  }
  return { root, errors };
}
const measurer = (() => { const c = document.createElement('canvas').getContext('2d');
  return t => { c.font = '12px -apple-system,"PingFang SC",sans-serif'; return c.measureText(t).width; }; })();

function layoutMind(root) {
  const ROW = 34, COL = 178, PAD = 26, NODE_H = 26;
  let cursor = PAD;
  const place = (n, depth) => {
    n.x = PAD + depth * COL;
    const maxW = 240;
    let w = Math.max(70, measurer(n.text) + 28);
    if (w > maxW) { let t = n.text; while (t.length > 2 && measurer(t + '…') + 28 > maxW) t = t.slice(0, -1);
      n.text = t + '…'; w = maxW; }
    n.w = w;
    if (!n.children.length || S.collapsed[n.id]) { n.y = cursor; cursor += ROW; }
    else { n.children.forEach(k => place(k, depth + 1)); n.y = (n.children[0].y + n.children[n.children.length-1].y) / 2; }
  };
  place(root, 0);
  let maxX = 0, maxY = cursor;
  (function walk(n) { maxX = Math.max(maxX, n.x + n.w + PAD); maxY = Math.max(maxY, n.y + NODE_H + 10);
    if (!S.collapsed[n.id]) n.children.forEach(walk); })(root);
  return { maxX, maxY, NODE_H };
}
function renderMind() {
  const src = $('#mindSource'), content = fileContent(MIND_FILE);
  if (src.value !== content) src.value = content;
  let parsed;
  try { parsed = parseMindmap(src.value); }
  catch (e) {
    $('#mindErr').textContent = '解析失败：' + e.message; $('#mindErr').classList.add('show');
    $('#mindCanvas').innerHTML = '<div class="hist-empty">脑图画不出来 —— 看看左边的代码？</div>'; return;
  }
  $('#mindErr').classList.toggle('show', parsed.errors.length > 0);
  $('#mindErr').textContent = parsed.errors.join('　·　');

  const { maxX, maxY, NODE_H } = layoutMind(parsed.root);
  const k = S.mindZoom || 1, NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
  svg.setAttribute('width', maxX * k); svg.setAttribute('height', maxY * k);
  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `<linearGradient id="rootGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0A84FF"/><stop offset="1" stop-color="#7A5CFF"/></linearGradient>`;
  svg.appendChild(defs);
  const linkLayer = document.createElementNS(NS, 'g'), nodeLayer = document.createElementNS(NS, 'g');
  svg.append(linkLayer, nodeLayer);
  const countDesc = n => n.children.reduce((a, c) => a + 1 + countDesc(c), 0);
  (function draw(n) {
    if (n.parent) {
      const p = n.parent, x1 = p.x + p.w, y1 = p.y + NODE_H/2, x2 = n.x, y2 = n.y + NODE_H/2, mid = x1 + (x2-x1)/2;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'mn-link'); path.setAttribute('d', `M${x1} ${y1} H${mid} V${y2} H${x2}`);
      linkLayer.appendChild(path);
    }
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', `mn-g ${n.depth === 0 ? 'mn-root' : n.depth === 1 ? 'mn-lvl1' : ''}${S.collapsed[n.id] ? ' is-collapsed' : ''}`);
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('class', 'mn-box'); rect.setAttribute('width', n.w); rect.setAttribute('height', NODE_H);
    rect.setAttribute('rx', n.depth === 0 ? 13 : 7); g.appendChild(rect);
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('class', 'mn-label'); label.setAttribute('x', 12); label.setAttribute('y', NODE_H/2 + 4);
    label.textContent = n.text; g.appendChild(label);
    if (n.children.length) {
      const cnt = document.createElementNS(NS, 'text');
      cnt.setAttribute('class', 'mn-cnt'); cnt.setAttribute('x', n.w - 8); cnt.setAttribute('y', NODE_H/2 + 3.5);
      cnt.setAttribute('text-anchor', 'end');
      cnt.textContent = S.collapsed[n.id] ? `▸${countDesc(n)}` : `▾${n.children.length}`;
      g.appendChild(cnt);
      g.onclick = () => { if (S.collapsed[n.id]) delete S.collapsed[n.id]; else S.collapsed[n.id] = true;
        save(); renderMind(); };
    }
    nodeLayer.appendChild(g);
    if (!S.collapsed[n.id]) n.children.forEach(draw);
  })(parsed.root);
  const fb = $('#btnFoldCode');
  if (fb) { fb.hidden = false; fb.textContent = S.codeFolded ? '展开代码' : '折叠代码'; }
  const wrap = $('#mindCanvas'); wrap.innerHTML = ''; wrap.appendChild(svg);
  $('#mindLayout').classList.toggle('code-folded', S.codeFolded);
  renderMdToolbar();
}
function toggleCodeFold() { S.codeFolded = !S.codeFolded; save(); renderMind();
  toast(S.codeFolded ? '已折叠 mermaid 代码 —— 只显示脑图' : '已展开 mermaid 代码'); }

function mindAddBranch(label) {
  const lines = ($('#mindSource').value || fileContent(MIND_FILE)).split('\n');
  let best = -1, bestIndent = -1;
  lines.forEach((l, i) => { if (!l.trim() || /^mindmap/i.test(l.trim())) return;
    const ind = l.match(/^[\t ]*/)[0].replace(/\t/g,'  ').length;
    if (ind > bestIndent) { bestIndent = ind; best = i; } });
  const rootIndent = (lines[1] || '  ').match(/^[\t ]*/)[0].length;
  const indent = ' '.repeat(Math.max(rootIndent + 2, best >= 0 ? bestIndent : rootIndent + 2));
  lines.splice(best >= 0 ? best + 1 : lines.length, 0, indent + label);
  const text = lines.join('\n');
  $('#mindSource').value = text; proj().files[MIND_FILE] = text;
  pushHistory(MIND_FILE, '对话', text, `脑图新增分支「${label}」`);
  save(); renderMind();
}
function mindRemoveNode(keyword) {
  const lines = ($('#mindSource').value || '').split('\n');
  const idx = lines.findIndex(l => l.includes(keyword) && !/^mindmap/i.test(l.trim()));
  if (idx < 0) return false;
  const removed = lines.splice(idx, 1)[0].trim();
  const text = lines.join('\n');
  $('#mindSource').value = text; proj().files[MIND_FILE] = text;
  pushHistory(MIND_FILE, '对话', text, `脑图删除「${removed.replace(/[()[\]{}]/g,'')}」`);
  save(); renderMind(); return true;
}

/* ============================================================
   对话
   ============================================================ */
function addMsg(role, html, meta) {
  S.chat.push({ role, html, meta, ts: now(), temp: S.chatMode === 'temporary' || S.tempMode });
  if (S.chat.length > 60) S.chat.shift();
  const title = (S.recent[0] && Date.now() - S.recent[0].ts < 60000)
    ? S.recent[0] : null;
  if (role === 'user') S.recent.unshift({ title: String(html).slice(0, 26), ts: now(), temp: S.tempMode });
  void title;
  if (S.recent.length > 30) S.recent.pop();
  save(); renderChat(); renderNav();
  // §26 主会话发声：**只在语音模式**且「声音」开着时朗读 —— 这样才有「主会话在发声 → 右侧静音」
  if (role === 'ai' && S.mode === 'voice' && S.soundOn !== false) speakText(html, 'main');
}
/// §23.2 单屏 / 双屏：双屏把「连续会话」和「临时会话」左右并排，**一条消息都没改、功能不变**
function renderScreenToggle() {
  const b = $('#ccScreen'); if (!b) return;
  b.innerHTML = S.dualScreen ? '<b>双屏</b>｜单屏' : '双屏｜<b>单屏</b>';
  b.classList.toggle('is-dual', !!S.dualScreen);
  b.title = S.dualScreen
    ? '双屏中 —— 左=连续会话、右=临时会话，同时显示。点一下收回单屏'
    : '单屏（默认，只有一个会话窗口）。点一下切成双屏';
}
/// §26 双屏 = 中间一条分割线 + 右侧一个**完全独立**的对话界面（默认临时）
function applyDualScreen() {
  const on = !!S.dualScreen;
  const div = $('#chatDiv'), sec = $('#chatSecond');
  if (div) div.hidden = !on;
  if (sec) sec.hidden = !on;
  if (on) renderChat2();
}
/// ══ §28 风格切换：只给 body 挂 data-style，全靠 CSS 变量覆盖（布局/功能一个字不动）══
function applyUiStyle() {
  const v = S.uiStyle || '';
  if (v) document.body.dataset.style = v; else document.body.removeAttribute('data-style');
  $$('#styleBar .sb[data-style]').forEach(b => b.classList.toggle('on', (b.dataset.style || '') === v));
}

/// ══ §27 输入框工具行 —— **模块级**（renderChat 末尾要调 updateComposerTools 刷上下文 %）══
  const PERM = { default: '默认权限', approve: '帮我审批', full: '完全访问' };
const MODELS = ['qwen3-vl-plus', 'qwen3-vl-max', 'deepseek-v4-flash', 'glm-5.3-flash'];
function updateComposerTools() {
  const pl = $('#ctPermLabel'); if (pl) pl.textContent = PERM[S.permission] || '完全访问';
  const mn = $('#ctModelName'); if (mn) mn.textContent = S.protoModel;
  // 上下文占用：消息总字符 / 8000（原型用的估算上限，够看出变化即可）
  const chars = (S.chat || []).reduce((n, m) => n + String(m.html || '').length, 0);
  const pct = Math.max(0, Math.min(99, Math.round(chars / 8000 * 100)));
  // §35.12 百分比数字已删 —— 只有环；颜色 白(低占用)→黄(高占用) 按占用插值，数值看 title
  const arc = $('#ctxArc');
  if (arc) {
    arc.style.strokeDashoffset = String(45.24 * (1 - pct / 100));
    const t = Math.max(0, Math.min(1, pct / 100));
    const mix = (a, b) => Math.round(a + (b - a) * t);
    arc.style.stroke = pct > 80
      ? 'var(--warn)'
      : `rgb(${mix(237, 255)},${mix(237, 214)},${mix(240, 10)})`;   // #EDEDF0 白 → #FFD60A 黄
    const wrap = $('#ctCtx');
    if (wrap) wrap.title = `上下文占用 ${pct}%`;
  }
}

function toggleDualScreen() {
  S.dualScreen = !S.dualScreen;
  if (S.dualScreen) {
    if (!Array.isArray(S.chat2)) S.chat2 = [];
    S.chat2Mode = 'temporary';                 // ★ 你的原话：右边**默认选择临时**
  }
  save(true);
  renderScreenToggle(); applyDualScreen(); renderChat();
  toast(S.dualScreen ? '已切到<b>双屏</b> —— 右侧是**完全独立**的会话（默认临时），中间一条分割线'
                     : '已收回<b>单屏</b> —— 只有一个会话窗口');
}
/// 会话右键「临时聊天分屏显示」用：直接开双屏并把当前流切到临时
function renderDualScreen() { renderScreenToggle(); applyDualScreen(); renderChat(); }

/* ══════════════════════════════════════════════════════════════
   §26 右侧独立会话 —— 渲染 / 发送 / **语音互斥**
   互斥规则（你的原话）：主会话在语音状态、通话、或正在发声 → 右侧不发声；
   只有主会话三者皆空闲，才允许右侧播放。
   ══════════════════════════════════════════════════════════════ */
let voiceOwner = null;                 // 'main' | 'second' —— 谁在发声
function mainIsVoicing() {
  return replyBusy || voiceOwner === 'main';     // 主会话「在忙」或「正在朗读」
}
function updateVoiceLock() {
  const lock = $('#voiceLock2');
  if (lock) lock.hidden = !(S.dualScreen && mainIsVoicing());
}
/// 发声。**主会话永远优先**：右侧想发声时若主会话在语音/忙，直接拒绝并亮 🔇
function speakText(text, who) {
  const clean = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!clean) return false;
  if (who === 'second' && mainIsVoicing()) {
    updateVoiceLock();
    return false;                                  // ★ 被主会话占着 —— 静音
  }
  try {
    if (!('speechSynthesis' in window)) return false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'zh-CN';
    u.rate = who === 'second' ? (S.speechRate2 || 1) : (S.speechRate || 1);
    voiceOwner = who;
    u.onend = u.onerror = () => { if (voiceOwner === who) { voiceOwner = null; updateVoiceLock(); } };
    window.speechSynthesis.speak(u);
    updateVoiceLock();
    return true;
  } catch (e) { voiceOwner = null; return false; }
}

function renderChat2() {
  const host = $('#msgs2');
  if (!host) return;
  if (!S.dualScreen) return;                      // 单屏不渲染，省一次 DOM
  host.innerHTML = '';
  const msgs = S.chat2 || [];
  if (!msgs.length) {
    host.innerHTML = `<div class="msg msg-sys"><div class="bubble">
      右侧是**完全独立**的会话，默认<b>临时</b> —— 内容、输入框、语速都与左边互不相通。<br>
      中间那条细线是两个会话唯一的分界。</div></div>`;
    return;
  }
  msgs.forEach((m, i) => host.appendChild(mkMsg(m, i, m.role === 'ai' ? 'AI · 临时对话' : undefined)));
  host.lastElementChild?.classList.add('is-new');   // §29.7 同上，只弹最后一条
  host.scrollTop = host.scrollHeight;
}
function sendChat2() {
  const ta = $('#chatInput2');
  const text = (ta.value || '').trim();
  if (!text) return;
  ta.value = ''; ta.focus();
  S.chat2 = S.chat2 || [];
  S.chat2.push({ role: 'user', html: escapeHtml(text), meta: '', ts: now(),
                 temp: S.chat2Mode !== 'continuous' });
  save(true); renderChat2();
  const wasVoicing = mainIsVoicing();             // 记下发送那一刻主会话在不在发声
  setTimeout(() => {
    S.chat2.push({ role: 'ai',
      html: `（右侧独立会话 · ${S.chat2Mode === 'continuous' ? '连续' : '临时'}）收到：<b>${escapeHtml(text.slice(0, 40))}</b><br>`
        + `<span style="opacity:.7">${wasVoicing ? '主会话当时在发声 → 这次右侧不播（互斥）' : '主会话空闲 → 右侧可以发声'}</span>`,
      meta: '', ts: now(), temp: S.chat2Mode !== 'continuous' });
    save(true); renderChat2();
    speakText(`收到，${text.slice(0, 30)}`, 'second');   // ★ 会话发声前先过互斥
    updateVoiceLock();
  }, 620);
}

/// §26.4 消息元素 —— **提到模块级**，主会话与右侧独立会话两个 pane 都要用它
function mkMsg(m, i, who) {
  const el = document.createElement('div');
  el.className = `msg msg-${m.role}` + (m.temp ? ' msg-temp' : '');
  el.dataset.i = i;                          // §24 轨道与消息靠这个索引对齐，不能靠 $$(...)[i]
  const w = who || (m.role === 'user' ? '你' : m.role === 'ai' ? (m.temp ? 'AI · 临时对话' : 'AI') : '系统');
  el.innerHTML = `<div class="msg-who">${w}</div><div class="bubble">${m.html}</div>`
    + (m.meta ? `<div class="msg-meta">${m.meta}</div>` : '');
  return el;
}
function renderChat() {
  const host = $('#msgs'); host.innerHTML = '';
  renderScreenToggle();
  const emptyHtml = `<div class="msg msg-sys"><div class="bubble">
      ${proj()
        ? '围绕项目提问，或直接让它改脑图 —— 每次改动都会自动备份历史。'
        : '这是<b>临时对话</b>：没有项目文件，直接和 AI 聊。想要围绕项目，点左边 ＋ 添加文件夹。'}
      </div></div>`;
  if (!S.chat.length) {
    host.innerHTML = emptyHtml;
    rebuildHistOffsets();
    renderHistRail();          // §30 空对话 → 轨道自己隐藏
    renderChat2();             // §26 右侧也跟着刷
    return;
  }
  // §26 双屏不再是「一列消息分两栏」——改成**两个独立对话界面**（右边那个有自己的 #msgs2）
  host.classList.remove('dual');
  S.chat.forEach((m, i) => host.appendChild(mkMsg(m, i)));
  host.lastElementChild?.classList.add('is-new');   // §29.7 pop 只给最后一条（全量重绘不再整屏闪）
  host.scrollTop = host.scrollHeight;
  rebuildHistOffsets();        // §24.12 缓存每个消息的位置（spine 的可见区/平移都读它）
  renderHistRail();            // §30 画轨道（render 内部做一次 .active + 平移）
  requestAnimationFrame(() => { spineUpdateActive(); spinePanning(); });
  renderChat2();               // §26
  if (typeof updateComposerTools === 'function') updateComposerTools();   // §27 上下文 % 跟着消息变
}
/* ══════════════════════════════════════════════════════════════
   §30 对话记录轨道 —— **1:1 照搬 Xiaomi MiMo Desktop 的 SessionSpine**
   出处（本机 /Applications/Xiaomi MiMo.app/Contents/Resources/app.asar 解包）：
     /out/renderer/assets/SessionSpine-AmYLx0IV.js  —— 组件 Qe、分组 Be、音效模块 K、
         速度闸门 He/je、波浪宽度 B()、预览卡 JSX、点击平滑滚动 ne、可见区 De、平移 Ge
     /out/renderer/assets/index-BPeiqRdG.css        —— .spine* / .spine-preview 全套样式
     /out/renderer/assets/index-bo_Ccbdb.js         —— 工具→图标（Eme/_me/$D）+ 16 个 SVG
   ⚠️ asar 的 json offset 相对**数据区**：绝对 = 506192(header) + offset（不加会错位 506KB）。
   逐项对照（全部来自 source，没有自己发明的）：
     · 一根刻度 = 一个「用户回合组」（Be：user 开新组；q=用户原话；a=首句 ≤140（ce）；tools 收集）
     · 刻度几何：容器 h4 + gap6（周期 10）、线 9×2 圆角999；active 白、clicked h4
     · 波浪：目标宽 = 9 + exp(-v²/0.8)[v≤3] × 15，弹簧 lerp 0.3/帧，闲置回弹后清空
     · 声音：五声阶 [C4 D4 E4 G4 A4] ×3.6 八度按位置取音（K 的 c），三角波 f / 泛音拨弦 i，
       彩蛋 5%（_=.05）+ 3 分钟冷却（W=180s）随机旋律 H，hover 推进音符（X）
     · 发声闸门：进轨 ≥100ms（_e）+ 指针速度 <600px/s（Pe）+ 80ms 采样窗（Ie）
     · 预览卡：fixed 300 宽、q 单行省略、a 3 行 line-clamp、tools ≤6 带图标（source JSX 原样）
     · 点击：ease-out-expo 平滑滚动、时长 min(900, 340+|Δ|×.28)、刻度 .clicked 亮 200ms
     · 显示门：组数 ≥3（Fe）
   （§24/§26′/§29 的轨道实现被本节整体取代 —— 抽样、压扁、wav 轮换、单行 hr-tip 全部作废。）
   ══════════════════════════════════════════════════════════════ */

/// source 常量：Ie=80 速度采样窗、_e=100 进轨延迟、Pe=600 px/s 速度上限、
/// Ye=10 近邻半径、Z=9 基础宽、Ve=24 波峰宽、Fe=3 最小组数
const SPINE_SPEED_WIN_MS = 80, SPINE_ENTRY_MS = 100, SPINE_MAX_SPEED = 600;
const SPINE_NEAREST_PX = 10, SPINE_WAVE_BASE = 9, SPINE_WAVE_PEAK = 24, SPINE_MIN_GROUPS = 3;

/// source He/le：指针进入轨道后的速度采样（决定这一下响不响 —— 快速甩过去不响，就是「卡点」的门）
let spineSpeedState = { entryAt: null, samples: [] };
function spineSpeedSample(x, y, t) {
  if (spineSpeedState.entryAt == null) spineSpeedState.entryAt = t;
  spineSpeedState.samples.push({ x, y, t });
  while (spineSpeedState.samples.length && t - spineSpeedState.samples[0].t > SPINE_SPEED_WIN_MS)
    spineSpeedState.samples.shift();
}
function spineSpeedReset() { spineSpeedState.entryAt = null; spineSpeedState.samples.length = 0; }
function spineSpeedOK(t) {
  const st = spineSpeedState;
  if (st.entryAt == null || t - st.entryAt < SPINE_ENTRY_MS) return false;
  if (st.samples.length < 2) return true;
  const a = st.samples[0], b = st.samples[st.samples.length - 1], dt = b.t - a.t;
  if (dt <= 0) return true;
  return Math.hypot(b.x - a.x, b.y - a.y) / dt * 1000 < SPINE_MAX_SPEED;
}
/// source fe()：localStorage 'mimo.spineSound' !== '0' 才响（沿用同一个 key，照搬）
function spineSoundEnabled() { try { return localStorage.getItem('mimo.spineSound') !== '0'; } catch (e) { return true; } }

/// source K —— 音效模块**逐字照搬**（五声阶 / 三角波 / 泛音拨弦 / 旋律彩蛋），只改名 SpineSound
const SpineSound = (()=>{let e=null;const t=[261.63,293.66,329.63,392,440],c=(d,m)=>{const R=Math.round(d/Math.max(1,m-1)*(t.length*3.6));return t[R%t.length]*Math.pow(2,Math.floor(R/t.length)-1)},l=()=>(e||(e=new AudioContext),e.state==="suspended"&&e.resume(),e),f=(d,m)=>{const R=l(),h=R.currentTime,x=R.createGain(),B=R.createOscillator();B.type="triangle",B.frequency.value=d,x.gain.setValueAtTime(1e-4,h),x.gain.exponentialRampToValueAtTime(m?.3:.13,h+.008),x.gain.exponentialRampToValueAtTime(1e-4,h+(m?.9:.42)),B.connect(x).connect(R.destination),B.start(h),B.stop(h+(m?.95:.46))},i=(d,m,R=1.1)=>{if(!d.length)return;const h=l(),x=h.currentTime,B=Math.min(2.6,Math.max(.4,.25+R)),D=h.createGain();D.gain.setValueAtTime(1e-4,x),D.gain.exponentialRampToValueAtTime((m?.3:.13)/Math.sqrt(d.length),x+.006),D.gain.exponentialRampToValueAtTime(1e-4,x+B);const q=h.createBiquadFilter();q.type="lowpass",q.frequency.setValueAtTime(4200,x),q.frequency.exponentialRampToValueAtTime(1400,x+B*.85),D.connect(q).connect(h.destination);const J=[[1,1,"triangle"],[2,.42,"sine"],[3,.22,"sine"],[4,.12,"sine"],[6,.06,"sine"]],ee=x+B+.05;d.forEach(te=>J.forEach(([ne,re,Q],se)=>{const P=h.createOscillator(),M=h.createGain();P.type=Q,P.frequency.value=te*ne,se===0&&(P.detune.value=1.5),M.gain.value=re,P.connect(M).connect(D),P.start(x),P.stop(ee)}))},u={C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11},A=d=>{const m=d.match(/^([A-G][#b]?)(\d)$/),R=(parseInt(m[2],10)+1)*12+u[m[1]];return 440*Math.pow(2,(R-69)/12)},C=(d,m)=>m.map(R=>{const h=R.match(/\{(\d+)(?:\/(\d+))?\}$/);return{freqs:Array.from(R.matchAll(/\(([A-G][#b]?\d)\)/g),x=>A(x[1])),ring:parseInt(h[1],10)/(h[2]?parseInt(h[2],10):1)*(60/d)}}),p=["2(B4){1/4}","1(A4){1/4}","♯7(G#4){1/4}","1(A4){1/4}","3(C5){1/2}","休{1/2}","4(D5){1/4}","3(C5){1/4}","2(B4){1/4}","3(C5){1/4}","5(E5){1/2}","休{1/2}","6(F5){1/4}","5(E5){1/4}","♯4(D#5){1/4}","5(E5){1/4}","2(B5){1/4}","1(A5){1/4}","♯7(G#5){1/4}","1(A5){1/4}","2(B5){1/4}","1(A5){1/4}","♯7(G#5){1/4}","1(A5){1/4}","3(C6){1}"],O=["1(A5){1/2}","3(C6){1/2}","2(B5){1/2}","1(A5){1/2}","7(G5){1/2}","1(A5){1/2}","2(B5){1/2}","1(A5){1/2}","7(G5){1/2}","1(A5){1/2}","2(B5){1/2}","1(A5){1/2}","7(G5){1/2}","♯6(F#5){1/2}","5(E5){1}"],H=[C(76,["5(E5){1/2}","♯4(D#5){1/2}","5(E5){1/2}","♯4(D#5){1/2}","5(E5){1/2}","2(B4){1/2}","4(D5){1/2}","3(C5){1/2}","1(A4){3/2}","休{1/2}","3(C4){1/2}","5(E4){1/2}","1(A4){1/2}","2(B4){1}","休{1/2}","5(E4){1/2}","♯7(G#4){1/2}","2(B4){1/2}","3(C5){1}","休{1/2}","5(E4){1/2}","5(E5){1/2}","♯4(D#5){1/2}","5(E5){1/2}","♯4(D#5){1/2}","5(E5){1/2}","2(B4){1/2}","4(D5){1/2}","3(C5){1/2}","1(A4){3/2}","休{1/2}","3(C4){1/2}","5(E4){1/2}","1(A4){1/2}","2(B4){1}","休{1/2}","5(E4){1/2}","3(C5){1/2}","2(B4){1/2}","1(A4){2}"]),C(150,["5(C#4){3/2}","1(F#4){1/2}","3(A4){3/2}","1(F#4){1/2}","♭1(F4){3/2}","1(F#4){1/4}","2(G#4){1/4}","1(F#4){2}","6(D4){3/2}","7(E4){1/4}","1(F#4){1/4}","5(C#4){2}","4(B3){1/4}","3(A3){1/4}","3(A3){1/4}","2(G#3){1/4}","2(G#3){3/4}","5(C#4){1/4}","1(F#3){2}","5(C#5){3/2}","1(F#5){1/4}","3(A5){1/4}","5(C#6){3/2}","3(A5){1/2}","[2(G#5) + ♭1(F5) + 6(D5)]{3/2}","3(A5){1/4}","4(B5){1/4}","[3(A5) + 1(F#5) + 5(C#5)]{2}","6(D5){1/4}","7(E5){1/4}","1(F#5){1/4}","6(D5){1/4}","5(C#5){1/4}","6(D5){1/4}","7(E5){1/4}","5(C#5){1/4}","4(B4){1/4}","5(C#5){1/4}","6(D5){1/4}","4(B4){1/4}","3(A4){1/4}","4(B4){1/4}","5(C#5){1/4}","3(A4){1/4}","4(B4){1/4}","3(A4){1/4}","3(A4){1/4}","2(G#4){1/4}","2(G#4){3/4}","5(C#5){1/4}","1(F#4){2}","休{1}","5(C#5){3/2}","1(F#5){1/2}","3(A5){3/2}","1(F#5){1/2}","♭1(F5){3/2}","1(F#5){1/4}","2(G#5){1/4}","1(F#5){2}","6(D5){3/2}","7(E5){1/4}","1(F#5){1/4}","5(C#5){2}","4(B4){1/4}","3(A4){1/4}","3(A4){1/4}","2(G#4){1/4}","2(G#4){3/4}","5(C#5){1/4}","1(F#4){2}","5(C#5){3/4}","1(F#5){1/4}","3(A5){1/4}","5(C#6){1/4}","1(F#6){1/4}","3(A6){1/4}"]),C(120,[...p,...O,...p,...O,...p]),C(72,["5(Bb4){1/2}","3(G5){2}","2(F5){1/2}","3(G5){1/2}","2(F5){3/2}","1(Eb5){1}","5(Bb4){1/2}","3(G5){1}","6(C5){1/12}","♯6(C#5){1/12}","6(C5){1/12}","♯5(B4){1/12}","6(C5){1/6}","6(C6){1}","3(G5){1/2}","5(Bb5){3/2}","4(Ab5){1}","3(G5){1/2}","2(F5){3/2}","3(G5){1}","7(D5){1/2}","1(Eb5){3/2}","6(C5){3/2}","5(Bb4){1/2}","7(D6){1/2}","6(C6){1/2}","5(Bb5){1/4}","4(Ab5){1/4}","3(G5){1/4}","4(Ab5){1/4}","6(C5){1/4}","7(D5){1/4}","1(Eb5){3/2}","休{1}"]),C(72,["1(G5){1/4}","1(G5){1/4}","2(A5){1/4}","2(A5){1/4}","3(Bb5){1/4}","3(Bb5){1/4}","2(A5){1/4}","2(A5){1/4}","1(G5){1/4}","1(G5){1/4}","5(D5){1/4}","5(D5){1/4}","3(Bb4){1/4}","3(Bb4){1/4}","1(G4){1/4}","1(G4){1/4}","7(F5){1/4}","7(F5){1/4}","6(Eb5){1/4}","6(Eb5){1/4}","5(D5){1/4}","6(Eb5){1/4}","7(F5){1/4}","6(Eb5){1/2}","休{1/2}","休{1/2}","休{1/4}","6(Eb5){1/4}","6(Eb5){1/4}","7(F5){1/4}","7(F5){1/4}","1(G5){1/4}","1(G5){1/4}","2(A5){1/4}","2(A5){1/4}","7(F5){1/4}","7(F5){1/4}","4(C5){1/4}","4(C5){1/4}","6(Eb5){1/4}","6(Eb5){1/4}","5(D5){1/4}","5(D5){1/4}","4(C5){1/4}","4(C5){1/4}","6(Eb5){1/4}","5(D5){1/2}","5(D6){1/8}","5(D7){7/8}","5(D5){1/2}","1(G4){1/4}","3(Bb4){1/4}","5(D5){1/4}","4(C5){1/4}","5(D5){1/2}","1(G4){1/4}","3(Bb4){1/4}","5(D5){1/4}","4(C5){1/4}","5(D5){1/2}","1(G4){1/4}","3(Bb4){1/4}","6(Eb5){1/4}","5(D5){1/4}","6(Eb5){1/2}","1(G4){1/4}","3(Bb4){1/4}","6(Eb5){1/4}","5(D5){1/4}","6(Eb5){1/2}","6(Eb5){1/4}","5(D5){1/4}","6(Eb5){1/4}","♯6(E5){1/4}","7(F5){1/2}","7(F5){1/4}","1(G5){1/4}","7(F5){1/4}","1(G5){1/4}","5(D5){1/2}","休{1/2}","休{1/2}"])],Y=["G4","G4","A4","G4","C5","B4","G4","G4","A4","G4","D5","C5","G4","G4","G5","E5","C5","B4","A4","F5","F5","E5","C5","D5","C5"].map(A);let I=0;const j=()=>!1,G=d=>{i([Y[I]],d),I=(I+1)%Y.length},_=.05,z=1,W=180*1e3;let w=null,F=0,$=0,k=!1,L=0;const X=d=>{if(!w)return;const m=w[F];i(m.freqs,d,m.ring),F+=1,F>=w.length&&(F=0,$+=1,$>=z&&(w=null,L=Date.now()))};return{hover:(d,m)=>{if(j()){G(!1);return}if(w){X(!1);return}if(!k&&(k=!0,Date.now()-L>=W&&Math.random()<_)){w=H[Math.floor(Math.random()*H.length)],F=0,$=0,X(!1);return}f(c(d,m),!1)},hit:(d,m)=>{if(j()){i([Y[I]],!0);return}if(w){i(w[F].freqs,!0,w[F].ring);return}f(c(d,m),!0)},endEngagement:()=>{k=!1},resetEgg:()=>{w&&(L=Date.now()),w=null,F=0,$=0,I=0,k=!1}}})();

/// source Ee/_me/Eme —— 工具名 → 图标名（known 表 + 启发式兜底）
const SPINE_KNOWN_TOOLS = {
  read: 'tool-read', edit: 'tool-edit', write: 'tool-write', bash: 'tool-bash', exec_command: 'tool-bash',
  grep: 'tool-search', glob: 'tool-search', codesearch: 'tool-search', list: 'tool-list',
  webfetch: 'tool-websearch', websearch: 'tool-websearch', skill: 'quill-pen-ai', skill_search: 'quill-pen-ai',
  todowrite: 'tool-todo', actor: 'tool-actor', contacts: 'tool-actor', memory: 'tool-memory',
  invalid: 'tool-invalid', pdf_locate: 'tool-search', tts_speech: 'tool-fallback',
  asr_transcribe: 'tool-fallback', image_gen: 'tool-fallback', image_edit: 'tool-fallback',
};
function spineToolIconName(name) {
  const t = String(name || '').toLowerCase();
  if (SPINE_KNOWN_TOOLS[t]) return SPINE_KNOWN_TOOLS[t];
  if (t.includes('terminal')) return 'tool-bash';
  if (/browser|page|inspect/.test(t)) return 'tool-browser';
  if (/search|grep/.test(t)) return 'tool-search';
  if (t.includes('fetch')) return 'tool-websearch';
  if (t.includes('read')) return 'tool-read';
  if (/edit|write/.test(t)) return 'tool-edit';
  return 'tool-fallback';
}
/// source index-bo_Ccbdb.js 里 Be() 包着的 16 个 SVG（stroke/fill 已换成 currentColor）
const SPINE_TOOL_SVGS = {"tool-read": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M8.40033 7.1999H15.6003M8.40033 10.7999H15.6003M8.40033 14.3999H12.0003M6.60004 2.3999H17.4003C18.7258 2.3999 19.8003 3.47445 19.8003 4.79995L19.8 19.2C19.8 20.5254 18.7254 21.5999 17.4 21.5999L6.59994 21.5998C5.27446 21.5998 4.19994 20.5253 4.19995 19.1998L4.20004 4.79989C4.20005 3.47441 5.27457 2.3999 6.60004 2.3999Z\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> </svg>", "tool-edit": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M11.9999 22.1999H21.5999M14.9999 4.7999L19.1999 8.3999M4.1999 15.5999L16.0313 3.35533C17.3052 2.08143 19.3706 2.08143 20.6445 3.35533C21.9184 4.62923 21.9184 6.69463 20.6445 7.96853L8.3999 19.7999L2.3999 21.5999L4.1999 15.5999Z\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> </svg>", "tool-write": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M11.0984 3.80369H5.4119C3.52756 3.80369 2 5.3312 2 7.21548V18.5882C2 20.4725 3.52756 22 5.4119 22H16.7849C18.6692 22 20.1968 20.4725 20.1968 18.5882L20.1968 12.9018M7.68649 16.3136L11.8244 15.4799C12.044 15.4356 12.2457 15.3274 12.4041 15.1689L21.6671 5.90116C22.1112 5.45682 22.1109 4.73657 21.6664 4.2926L19.7042 2.33264C19.2599 1.88886 18.54 1.88916 18.0961 2.33332L8.8321 11.6021C8.674 11.7602 8.56605 11.9615 8.52175 12.1807L7.68649 16.3136Z\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> </svg>", "tool-bash": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M7.1999 11.3999L10.1999 14.3999L7.1999 17.3999M2.9999 7.7999H20.9999M4.7999 21.5999C3.47442 21.5999 2.3999 20.5254 2.3999 19.1999V4.7999C2.3999 3.47442 3.47442 2.3999 4.7999 2.3999H19.1999C20.5254 2.3999 21.5999 3.47442 21.5999 4.7999V19.1999C21.5999 20.5254 20.5254 21.5999 19.1999 21.5999H4.7999Z\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> </svg>", "tool-search": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M16.927 17.0401L20.4001 20.4001M19.2801 11.4401C19.2801 15.77 15.77 19.2801 11.4401 19.2801C7.11019 19.2801 3.6001 15.77 3.6001 11.4401C3.6001 7.11019 7.11019 3.6001 11.4401 3.6001C15.77 3.6001 19.2801 7.11019 19.2801 11.4401Z\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/> </svg>", "tool-list": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M8.7201 6H21.6001M8.7201 12.48H21.6001M8.7201 18.96H21.6001M3.6001 6V6.0128M3.6001 12.48V12.4928M3.6001 18.96V18.9728\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> </svg>", "tool-webfetch": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M4 15.2044L4 18.8925C4 19.4514 4.21071 19.9875 4.58579 20.3827C4.96086 20.778 5.46957 21 6 21H18C18.5304 21 19.0391 20.778 19.4142 20.3827C19.7893 19.9875 20 19.4514 20 18.8925V15.2044M12.0011 3V14.9425M7.42969 10.3793L12.0011 14.9425L16.5725 10.3793\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> </svg>", "tool-websearch": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M20.4375 13C20.9898 13 21.4375 12.5523 21.4375 12C21.4375 11.4477 20.9898 11 20.4375 11V12V13ZM21 12H20C20 16.4183 16.4183 20 12 20V21V22C17.5228 22 22 17.5228 22 12H21ZM12 21V20C7.58172 20 4 16.4183 4 12H3H2C2 17.5228 6.47715 22 12 22V21ZM3 12H4C4 7.58172 7.58172 4 12 4V3V2C6.47715 2 2 6.47715 2 12H3ZM12 3V4C16.4183 4 20 7.58172 20 12H21H22C22 6.47715 17.5228 2 12 2V3ZM12 21V20C11.7872 20 11.5057 19.9056 11.1624 19.5738C10.8143 19.2373 10.4552 18.7021 10.1319 17.9631C9.48665 16.4882 9.0625 14.3807 9.0625 12H8.0625H7.0625C7.0625 14.5898 7.51979 16.9823 8.29961 18.7648C8.68887 19.6545 9.1782 20.4373 9.77228 21.0117C10.3712 21.5907 11.1255 22 12 22V21ZM8.0625 12H9.0625C9.0625 9.61928 9.48665 7.51177 10.1319 6.03686C10.4552 5.29792 10.8143 4.76272 11.1624 4.42621C11.5057 4.09436 11.7872 4 12 4V3V2C11.1255 2 10.3712 2.40931 9.77228 2.98832C9.1782 3.56266 8.68887 4.34548 8.29961 5.23522C7.51979 7.01767 7.0625 9.41015 7.0625 12H8.0625ZM12 21V22C12.8745 22 13.6288 21.5907 14.2277 21.0117C14.8218 20.4373 15.3111 19.6545 15.7004 18.7648C16.4802 16.9823 16.9375 14.5898 16.9375 12H15.9375H14.9375C14.9375 14.3807 14.5133 16.4882 13.8681 17.9631C13.5448 18.7021 13.1857 19.2373 12.8376 19.5738C12.4943 19.9056 12.2128 20 12 20V21ZM15.9375 12H16.9375C16.9375 9.41015 16.4802 7.01767 15.7004 5.23522C15.3111 4.34548 14.8218 3.56266 14.2277 2.98832C13.6288 2.40931 12.8745 2 12 2V3V4C12.2128 4 12.4943 4.09436 12.8376 4.42621C13.1857 4.76272 13.5448 5.29792 13.8681 6.03686C14.5133 7.51177 14.9375 9.61928 14.9375 12H15.9375ZM3 12L3 13L20.4375 13V12V11L3 11L3 12Z\" fill=\"currentColor\"/> </svg>", "tool-todo": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M6.50008 6C7.32851 6 8.00008 6.67157 8.00008 7.5C8.00008 8.32843 7.32851 9 6.50008 9C5.67165 9 5.00008 8.32843 5.00008 7.5C5.00008 6.67157 5.67165 6 6.50008 6ZM5.00008 4C3.89551 4 3.00008 4.89543 3.00008 6V9C3.00008 10.1046 3.89551 11 5.00008 11H8.0001C9.10467 11 10.0001 10.1046 10.0001 9V6C10.0001 4.89543 9.10467 4 8.0001 4H5.00008ZM13.0001 5C13.0001 4.44772 13.4478 4 14.0001 4H20.0001C20.5524 4 21.0001 4.44772 21.0001 5C21.0001 5.55228 20.5524 6 20.0001 6H14.0001C13.4478 6 13.0001 5.55228 13.0001 5ZM13.0001 12C13.0001 11.4477 13.4478 11 14.0001 11H20.0001C20.5524 11 21.0001 11.4477 21.0001 12C21.0001 12.5523 20.5524 13 20.0001 13H14.0001C13.4478 13 13.0001 12.5523 13.0001 12ZM13.0001 19C13.0001 18.4477 13.4478 18 14.0001 18H20.0001C20.5524 18 21.0001 18.4477 21.0001 19C21.0001 19.5523 20.5524 20 20.0001 20H14.0001C13.4478 20 13.0001 19.5523 13.0001 19ZM10.0001 16.9142C10.3906 16.5237 10.3906 15.8905 10.0001 15.5C9.60955 15.1095 8.97639 15.1095 8.58587 15.5L6.70719 17.3787C6.31666 17.7692 5.6835 17.7692 5.29297 17.3787L4.91428 17C4.52376 16.6095 3.8906 16.6095 3.50008 17C3.10955 17.3905 3.10955 18.0237 3.50008 18.4142L5.29297 20.2071C5.6835 20.5976 6.31666 20.5976 6.70718 20.2071L10.0001 16.9142Z\" fill=\"currentColor\"/> </svg>", "tool-actor": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <rect x=\"2.5\" y=\"2.5\" width=\"19\" height=\"19\" rx=\"5.75\" stroke=\"currentColor\" stroke-width=\"2.5\"/> <path d=\"M9.25 9.75V14.25M14.75 9.75V14.25\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\"/> </svg>", "tool-memory": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M12 16.8028V6.4006M12 16.8028C12.0005 17.2402 12.0906 17.673 12.2648 18.0743C12.4391 18.4756 12.6937 18.8368 13.013 19.1358C13.3323 19.4348 13.7095 19.6652 14.1213 19.8127C14.5331 19.9601 14.9708 20.0216 15.4073 19.9933C15.8438 19.965 16.2698 19.8474 16.6591 19.648C17.0484 19.4485 17.3927 19.1713 17.6707 18.8335C17.9487 18.4958 18.1545 18.1046 18.2754 17.6842C18.3963 17.2637 18.4298 16.8229 18.3737 16.3891M12 16.8028C11.9995 17.2402 11.9094 17.673 11.7352 18.0743C11.5609 18.4756 11.3063 18.8368 10.987 19.1358C10.6677 19.4348 10.2905 19.6652 9.87867 19.8127C9.46687 19.9601 9.02921 20.0216 8.59272 19.9933C8.15623 19.965 7.73019 19.8474 7.34089 19.648C6.9516 19.4485 6.60732 19.1713 6.32933 18.8335C6.05133 18.4958 5.84552 18.1046 5.7246 17.6842C5.60368 17.2637 5.57022 16.8229 5.62629 16.3891M12 6.4006C12 6.03239 12.0847 5.6691 12.2475 5.33885C12.4103 5.00861 12.6469 4.72025 12.9389 4.49608C13.231 4.27192 13.5707 4.11797 13.9318 4.04613C14.2929 3.97429 14.6656 3.98649 15.0212 4.0818C15.3768 4.1771 15.7057 4.35295 15.9825 4.59573C16.2593 4.83852 16.4765 5.14174 16.6174 5.48193C16.7583 5.82212 16.819 6.19016 16.7949 6.55759C16.7708 6.92502 16.6626 7.28198 16.4785 7.60085M12 6.4006C12 6.03239 11.9153 5.6691 11.7525 5.33885C11.5897 5.00861 11.3531 4.72025 11.0611 4.49608C10.769 4.27192 10.4293 4.11797 10.0682 4.04613C9.70713 3.97429 9.33438 3.98649 8.97877 4.0818C8.62317 4.1771 8.29426 4.35295 8.01747 4.59573C7.74069 4.83852 7.52346 5.14174 7.38258 5.48193C7.24171 5.82212 7.18097 6.19016 7.20506 6.55759C7.22915 6.92502 7.33743 7.28198 7.52152 7.60085M14.4 12.8019C13.7079 12.5996 13.0999 12.1783 12.6672 11.6013C12.2345 11.0243 12.0004 10.3225 12 9.60126C11.9996 10.3225 11.7655 11.0243 11.3328 11.6013C10.9001 12.1783 10.2921 12.5996 9.59996 12.8019M16.7977 6.50062C17.2679 6.62156 17.7045 6.84793 18.0743 7.16261C18.4441 7.47728 18.7375 7.87201 18.9322 8.31688C19.127 8.76175 19.2179 9.24511 19.1982 9.73034C19.1785 10.2156 19.0487 10.69 18.8185 11.1176M16.8001 16.8028C17.5045 16.8027 18.1892 16.5702 18.7481 16.1413C19.3069 15.7124 19.7086 15.111 19.891 14.4305C20.0733 13.75 20.026 13.0283 19.7564 12.3773C19.4869 11.7264 19.0101 11.1826 18.4001 10.8303M7.19992 16.8028C6.4955 16.8027 5.81078 16.5702 5.25193 16.1413C4.69309 15.7124 4.29136 15.111 4.10904 14.4305C3.92672 13.75 3.97401 13.0283 4.24356 12.3773C4.51311 11.7264 4.98986 11.1826 5.59989 10.8303M7.20232 6.50062C6.73207 6.62156 6.2955 6.84793 5.92568 7.16261C5.55586 7.47728 5.26247 7.87201 5.06775 8.31688C4.87303 8.76175 4.78208 9.24511 4.80179 9.73034C4.82149 10.2156 4.95133 10.69 5.18148 11.1176\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> </svg>", "tool-fallback": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M14.428 6.87242C14.2632 7.04062 14.1708 7.26675 14.1708 7.50227C14.1708 7.7378 14.2632 7.96393 14.428 8.13213L15.8677 9.57179C16.0359 9.73666 16.2621 9.829 16.4976 9.829C16.7331 9.829 16.9593 9.73666 17.1275 9.57179L19.9223 6.77794C20.2102 6.48821 20.6988 6.57999 20.8068 6.9741C21.0787 7.96285 21.0633 9.00859 20.7625 9.98893C20.4617 10.9693 19.8879 11.8437 19.1083 12.5098C18.3287 13.176 17.3755 13.6063 16.3602 13.7505C15.3449 13.8947 14.3095 13.7467 13.3753 13.3239L6.25774 20.4413C5.89977 20.7991 5.41431 21.0001 4.90816 21C4.402 20.9999 3.9166 20.7988 3.55875 20.4408C3.20091 20.0829 2.99992 19.5974 3 19.0913C3.00008 18.5851 3.20124 18.0997 3.5592 17.7419L10.6767 10.6245C10.2539 9.69031 10.106 8.65498 10.2502 7.63972C10.3943 6.62445 10.8247 5.67125 11.4908 4.89164C12.157 4.11202 13.0314 3.53826 14.0118 3.23747C14.9922 2.93668 16.0379 2.92132 17.0267 3.19318C17.4208 3.30115 17.5126 3.78884 17.2238 4.07857L14.428 6.87242Z\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> </svg>", "tool-invalid": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M12 12.9V8.41447M12 16.2248V16.2642M17.6699 20H6.33007C4.7811 20 3.47392 18.9763 3.06265 17.5757C2.88709 16.9778 3.10281 16.3551 3.43276 15.8249L9.10269 5.60102C10.4311 3.46632 13.5689 3.46633 14.8973 5.60103L20.5672 15.8249C20.8972 16.3551 21.1129 16.9778 20.9373 17.5757C20.5261 18.9763 19.2189 20 17.6699 20Z\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> </svg>", "tool-skill": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M14.8234 2.3999L16.6537 7.34611L21.5999 9.17637L16.6537 11.0066L14.8234 15.9528L12.9932 11.0066L8.04696 9.17637L12.9932 7.34611L14.8234 2.3999Z\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/> <path d=\"M6.35284 13.694L7.95167 16.0481L10.3058 17.647L7.95167 19.2458L6.35284 21.5999L4.75402 19.2458L2.3999 17.647L4.75402 16.0481L6.35284 13.694Z\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linejoin=\"round\"/> </svg>", "tool-browser": "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M4.5 9.5H19.5M6 20C4.89543 20 4 19.1046 4 18V6C4 4.89543 4.89543 4 6 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H6Z\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/> <circle cx=\"7\" cy=\"7\" r=\"1\" fill=\"currentColor\"/> <circle cx=\"10\" cy=\"7\" r=\"1\" fill=\"currentColor\"/> <circle cx=\"13\" cy=\"7\" r=\"1\" fill=\"currentColor\"/> </svg>", "quill-pen-ai": "<svg width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"> <path d=\"M3.14227 4.75207L2.97788 5.12919C2.85758 5.40528 2.47571 5.40528 2.35541 5.12919L2.19104 4.75207C1.89804 4.07965 1.3703 3.54427 0.71178 3.25139L0.205365 3.02615C-0.0684548 2.90435 -0.0684548 2.50587 0.205365 2.38408L0.683467 2.17143C1.35892 1.87101 1.89611 1.31582 2.18408 0.620552L2.35288 0.213023C2.47052 -0.0710075 2.86278 -0.0710075 2.98042 0.213023L3.14921 0.620552C3.43718 1.31582 3.97439 1.87101 4.64987 2.17143L5.12792 2.38408C5.40181 2.50587 5.40181 2.90435 5.12792 3.02615L4.62152 3.25139C3.96301 3.54427 3.43525 4.07965 3.14227 4.75207ZM4.22281 10.5436C4.34021 10.1553 4.47147 9.7708 4.62608 9.35513C5.99656 5.67091 8.2798 3.38781 12.0086 2.80986C11.6667 3.57225 11.3434 4.10201 11.0572 4.38825C10.8347 4.61069 10.6123 4.83329 10.3899 5.05605L9.44807 5.99919L10.4186 6.969C9.66507 8.35893 8.1768 9.46527 6.50129 9.67467C5.62363 9.7844 4.8623 10.0792 4.22281 10.5436ZM12 6.66439L11.3333 5.99819C11.5554 5.77581 11.7775 5.55359 12.0018 5.32927C12.6679 4.66202 13.3339 3.32928 14 1.33105C4.20737 1.33105 2.72569 10.2813 2.04241 14.4088C2.02793 14.4962 2.01383 14.5815 2 14.6644H3.33216C3.77614 12.4423 4.88764 11.2201 6.66667 10.9977C9.33333 10.6644 11.3333 8.6644 12 6.66439Z\" fill=\"currentColor\" fill-opacity=\"0.7\"/> </svg>"};
function spineSvgFor(name) {
  return SPINE_TOOL_SVGS[spineToolIconName(name)] || SPINE_TOOL_SVGS['tool-fallback'] || '';
}

/// source ce：首句（中英文句读切分）≤140 字
function spineFirstSentence(text) {
  const t = String(text || '').trim();
  const first = t.split(/(?<=[。！？])|(?<=[.!?])(?=\s|$)/)[0] || t;
  return first.slice(0, 140);
}
/// 消息 html → 纯文本（保留换行；顺手收掉源码换行留下的「换行+缩进」，source 是 ReactMarkdown 渲染，我们纯文本）
function spinePlainText(html) {
  const raw = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const ta = document.createElement('textarea'); ta.innerHTML = raw;
  return ta.value.replace(/\n[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
/// source Be：user 开新组；非 user 挂进当前组 —— a=首段非空文本的首句、tools 去重收集
let spineGroups = [];
function buildSpineGroups(msgs) {
  const groups = [];
  msgs.forEach((m, i) => {
    if (m.role === 'user') { groups.push({ start: i, q: spinePlainText(m.html), a: '', tools: [] }); return; }
    let g = groups[groups.length - 1];
    if (!g) { g = { start: i, q: '', a: '', tools: [] }; groups.push(g); }
    const html = String(m.html || '');
    for (const mm of html.matchAll(/<div class="tools">([\s\S]*?)<\/div>/g))
      for (const t of mm[1].matchAll(/<i>([^<]+)<\/i>/g))
        if (!g.tools.includes(t[1])) g.tools.push(t[1]);
    if (!g.a) { const txt = spinePlainText(m.html); if (txt) g.a = spineFirstSentence(txt); }
  });
  return groups;
}

/// source B()/D()：波浪宽度 —— 目标 = 9 + exp(-v²/0.8)×15（±3 根衰减），弹簧 lerp 0.3
let waveRAF = 0, waveWidths = [], waveHover = -1;
function spineWaveFrame() {
  const lines = $$('#spineTicks .spine-tick i');
  let animating = false;
  lines.forEach((el, gi) => {
    const v = waveHover < 0 ? 99 : Math.abs(gi - waveHover);
    const b = v <= 3 ? Math.exp(-(v * v) / 0.8) : 0;
    const target = SPINE_WAVE_BASE + b * (SPINE_WAVE_PEAK - SPINE_WAVE_BASE);
    const cur = waveWidths[gi] ?? SPINE_WAVE_BASE;
    const next = cur + (target - cur) * 0.3;
    waveWidths[gi] = next;
    el.style.width = next.toFixed(2) + 'px';
    if (Math.abs(target - next) > 0.15) animating = true;
  });
  if (!animating && waveHover < 0) {           // 回到基线 → 清空内联宽，交给 CSS 的 9px
    lines.forEach(el => { el.style.width = ''; });
    waveWidths = []; waveRAF = 0; return;
  }
  waveRAF = animating ? requestAnimationFrame(spineWaveFrame) : 0;
}
function spineWaveStart() { if (!waveRAF) waveRAF = requestAnimationFrame(spineWaveFrame); }
function spineResetWidths() {
  waveHover = -1; waveWidths = [];
  if (waveRAF) { cancelAnimationFrame(waveRAF); waveRAF = 0; }
  $$('#spineTicks .spine-tick i').forEach(el => { el.style.width = ''; });
}

/// source ve/Ge/ie：刻度总高 / 平移量 / 渐隐透明度（轨道内容高过可视区时才平移）
function spineTicksHeight(n) { return n <= 0 ? 0 : n * 4 + (n - 1) * 6; }
function spinePanOffset(total, railH, scrollTop, maxScroll) {
  const overflow = total - railH;
  if (overflow <= 0 || maxScroll <= 0) return 0;
  const u = Math.min(1, Math.max(0, scrollTop / maxScroll));
  const fade = Math.min(64, railH / 3), c = railH - 2 * fade;
  if (c <= 0) return u * overflow;
  return Math.min(1, Math.max(0, (u * railH - fade) / c)) * overflow;
}
function spineFadeOpacity(dist) { return Math.min(1, Math.max(0, dist) / 64); }
function spinePanning() {
  const rail = $('#histRail'), ticksEl = $('#spineTicks'), msgs = $('#msgs');
  if (!rail || rail.hidden || !ticksEl) return;
  const n = spineGroups.length, total = spineTicksHeight(n), railH = rail.clientHeight;
  const pan = total > railH;
  rail.classList.toggle('panning', pan);
  let b = 0;
  if (pan && msgs) {
    const max = Math.max(0, msgs.scrollHeight - msgs.clientHeight);
    b = spinePanOffset(total, railH, msgs.scrollTop, max);
  }
  ticksEl.style.transform = b > 0 ? `translateY(${-b}px)` : '';
  const ft = $('#spineFadeTop'), fb = $('#spineFadeBot');
  if (ft) ft.style.opacity = String(pan ? spineFadeOpacity(b) : 0);
  if (fb) fb.style.opacity = String(pan ? spineFadeOpacity(total - railH - b) : 0);
}

/// source De + .active：可见范围里的组亮成白（滚动时更新）
function spineUpdateActive() {
  const rail = $('#histRail'), msgs = $('#msgs');
  if (!rail || rail.hidden || !msgs || !spineGroups.length) return;
  const st = msgs.scrollTop, sb = st + msgs.clientHeight;
  const ticks = $$('.spine-tick', rail);
  let first = -1, last = -1;
  spineGroups.forEach((g, gi) => {
    const top = histOffsetFor(g.start); if (top == null) return;
    const next = gi + 1 < spineGroups.length ? histOffsetFor(spineGroups[gi + 1].start) : Infinity;
    const nextTop = next == null ? Infinity : next;
    if (top < sb && nextTop > st) { if (first < 0) first = gi; last = gi; }
  });
  ticks.forEach((el, gi) => el.classList.toggle('active', first >= 0 && gi >= first && gi <= last));
}
function histOffsetFor(msgIndex) {
  const hit = histOffsetMap.get(msgIndex);
  if (hit != null) return hit;
  const o = histOffsets.find(x => x.i === msgIndex);   // 双屏/时序兜底
  return o ? o.top : null;
}

/// source q：最近刻度（近邻半径 10px —— 缝里也算命中）
function spineNearestTick(clientY) {
  const rail = $('#histRail'); if (!rail || rail.hidden) return -1;
  const ticks = $$('.spine-tick', rail);
  let best = -1, dist = Infinity;
  ticks.forEach((el, gi) => {
    const r = el.getBoundingClientRect();
    const d = Math.abs((r.top + r.height / 2) - clientY);
    if (d < dist) { dist = d; best = gi; }
  });
  return dist <= SPINE_NEAREST_PX ? best : -1;
}

/// source ne + qe：点击后的平滑滚动（ease-out-expo，时长 min(900, 340+|Δ|×.28)）
let spineScrollRAF = 0;
function spineEaseOutExpo(p) { return p === 1 ? 1 : 1 - Math.pow(2, -10 * p); }
function spineSmoothToMsg(msgIndex) {
  const msgs = $('#msgs');
  const el = document.querySelector(`#msgs .msg[data-i="${msgIndex}"]`);
  if (!msgs || !el) return;
  const max = Math.max(0, msgs.scrollHeight - msgs.clientHeight);
  const rowTop = el.getBoundingClientRect().top - msgs.getBoundingClientRect().top;
  const target = Math.max(0, Math.min(max, msgs.scrollTop + rowTop - 14));
  const from = msgs.scrollTop, delta = target - from;
  if (Math.abs(delta) < 1) return;
  const dur = Math.min(900, 340 + Math.abs(delta) * 0.28);
  const t0 = performance.now();
  cancelAnimationFrame(spineScrollRAF);
  const step = t => {
    const p = Math.min(1, (t - t0) / dur);
    msgs.scrollTop = from + delta * spineEaseOutExpo(p);
    if (p < 1) spineScrollRAF = requestAnimationFrame(step);
  };
  spineScrollRAF = requestAnimationFrame(step);
}

/// source xe：预览卡 top（贴光标、夹在窗口与轨道底之间、下限 12）
function spinePreviewTop(mouseY, cardH, railBottom, winH) {
  const upper = Math.min(winH - cardH - 12, railBottom - cardH);
  return Math.max(12, Math.min(upper, mouseY - cardH / 2));
}

/// 预览卡（source spine-preview JSX：q 单行 + a 3 行 + tools ≤6 带图标）
let spinePreviewGI = -1;
function spinePreviewHTML(g) {
  const tools = g.tools.slice(0, 6)
    .map(t => `<span class="sp-badge">${spineSvgFor(t)}<span>${escapeHtml(t)}</span></span>`).join('');
  return `<div class="sp-q">${escapeHtml(g.q || '—')}</div>`
    + (g.a ? `<div class="sp-a">${escapeHtml(g.a)}</div>` : '')
    + (tools ? `<div class="sp-tools">${tools}</div>` : '');
}
function ensureSpinePreview() {
  let el = document.querySelector('.spine-preview');
  if (!el) {
    el = document.createElement('div');
    el.className = 'spine-preview';
    document.body.appendChild(el);
    el.addEventListener('click', () => {                 // source P：点卡 = 点那根刻度
      if (spinePreviewGI >= 0) { spineActivateGroup(spinePreviewGI); spineHidePreview(true); }
    });
  }
  return el;
}
function spineHidePreview() {
  const el = document.querySelector('.spine-preview');
  if (el) el.classList.remove('show');
  spinePreviewGI = -1;
}
function spineShowPreview(gi, mouseY) {
  const g = spineGroups[gi]; if (!g) return;
  const el = ensureSpinePreview();
  el.innerHTML = spinePreviewHTML(g);
  spinePreviewGI = gi;
  el.classList.add('show');
  spinePositionPreview(mouseY);
}
function spinePositionPreview(mouseY) {
  const rail = $('#histRail'), el = ensureSpinePreview();
  if (!rail || rail.hidden) return;
  const rr = rail.getBoundingClientRect();
  el.style.left = (rr.right + 14) + 'px';                 // source x()：轨道右缘 +14
  el.style.top = spinePreviewTop(mouseY, el.offsetHeight || 140, rr.bottom, window.innerHeight) + 'px';
}

/// source Q：点刻度 —— .clicked 亮 200ms + hit 声 + 平滑滚到该组
function spineActivateGroup(gi) {
  const g = spineGroups[gi]; if (!g) return;
  if (spineSoundEnabled()) SpineSound.hit(gi, spineGroups.length);
  const el = $$('#spineTicks .spine-tick')[gi];
  if (el) { el.classList.add('clicked'); setTimeout(() => el.classList.remove('clicked'), 200); }
  spineSmoothToMsg(g.start);
}

/// source J/ee/te + 窗口级清除：一次移动 = 一次处理（rAF 节流），换组才响/才重建卡
function spineHandleMove(x, y) {
  const now = performance.now();
  spineSpeedSample(x, y, now);
  const gi = spineNearestTick(y);
  if (gi < 0) {
    if (waveHover >= 0 || spinePreviewGI >= 0) {
      waveHover = -1; spineHidePreview(); spineSpeedReset(); SpineSound.endEngagement(); spineWaveStart();
    }
    return;
  }
  if (gi !== waveHover) {
    waveHover = gi;
    if (spineSoundEnabled() && spineSpeedOK(now)) SpineSound.hover(gi, spineGroups.length);
    spineShowPreview(gi, y);
  } else {
    spinePositionPreview(y);
  }
  spineWaveStart();
}
function spineClearHover() {
  if (waveHover < 0 && spinePreviewGI < 0) return;
  waveHover = -1; spineHidePreview(); spineSpeedReset(); SpineSound.endEngagement(); spineWaveStart();
}
let spineMoveRAF = 0, spineMoveXY = [0, 0], spinePointerInRail = false;
function bindSpineRail() {
  const rail = $('#histRail'); if (!rail || rail._spineBound) return;
  rail._spineBound = true;
  const preview = ensureSpinePreview();
  rail.addEventListener('pointermove', e => {
    spinePointerInRail = true;
    spineMoveXY = [e.clientX, e.clientY];
    if (!spineMoveRAF) spineMoveRAF = requestAnimationFrame(() => {
      spineMoveRAF = 0;
      if (spinePointerInRail) spineHandleMove(spineMoveXY[0], spineMoveXY[1]);
    });
  });
  rail.addEventListener('pointerleave', e => {
    // source te：指针滑进预览卡不算离开（卡在轨道右边 14px，中间有缝）
    if (preview.contains(e.relatedTarget)) return;
    spinePointerInRail = false;
    spineClearHover();
  });
  rail.addEventListener('click', e => {
    const gi = waveHover >= 0 ? waveHover : spineNearestTick(e.clientY);
    if (gi >= 0) spineActivateGroup(gi);
  });
  window.addEventListener('pointermove', e => {           // source 窗口级 r：出了轨道+卡 → 清
    if (waveHover < 0) return;
    const t = e.target;
    if (rail.contains(t) || preview.contains(t)) return;
    spinePointerInRail = false;
    spineClearHover();
  }, { passive: true });
  window.addEventListener('blur', () => { spinePointerInRail = false; spineClearHover(); });
}

/// 渲染：每根刻度 = 一个组（source JSX 的 spine-tick 结构），组数 <3 整条不显示（Fe）
function renderHistRail() {
  const rail = $('#histRail'); if (!rail) return;
  const msgs = S.chat || [];
  const ticksEl = $('#spineTicks');
  if (!msgs.length) {
    rail.hidden = true; if (ticksEl) ticksEl.innerHTML = '';
    spineGroups = []; spineHidePreview(); spineResetWidths(); return;
  }
  spineGroups = buildSpineGroups(msgs);
  if (spineGroups.length < SPINE_MIN_GROUPS) { rail.hidden = true; spineHidePreview(); return; }
  rail.hidden = false;
  ticksEl.innerHTML = spineGroups
    .map((g, gi) => `<div class="spine-tick" data-gi="${gi}"><i></i></div>`).join('');
  spineResetWidths();
  spineHidePreview();
  bindSpineRail();
  spineUpdateActive();
  spinePanning();
}
/// §24.10 造几十/几百条示例对话 —— 用户要「能滑动它、听到声音变化」才好判断轨道对不对。
/// 内容照在 MiMo Desktop 里真实看到的那几类：GitHub 推送 / CI / 文件提交 / 工具调用 / 普通问答。
function seedDemoChat(n = 200, silent = false) {
  const REPO = 'github.com/nash-aigc/wanna';
  const FILES = ['app.js', 'app.css', 'index.html', '需求/07-项目工作区（左80%工作区+右对话）.md',
                 '需求/90-实现映射.md', 'Wanna/CompanionManager.swift', '开发经验/10-踩过的坑.md',
                 '设计框架/00-目录地图.md'];
  const SHAs = ['b6dd24b', '204e1ac', '1fc6dcb', 'cab98f6', 'a3650b6', '8f6cb00', 'bc19478', '009aa49'];
  const Q = ['这段代码为什么要这样写？', '把宽度再收窄一点', '这个 bug 的根因是什么',
             '加一个按钮，点一下能回放', '声音怎么跟原项目保持一致', '这条判据算通过吗',
             '把 200 条数据造出来给我滑', '左侧那个轨道为什么不融合进背景', '换个思路再试一次'];
  const A = ['按判据量了一遍，数字在上面的表里。', '已经改完并推送，等你验收。',
             '根因是缓存：规则在磁盘上、浏览器拿的是旧文件。', '照源码里的写法改的，没有自己发明。',
             '实测上下留白 246 / 246，居中成立。', '这条 ✅ 已验，另外两条只有代码依据。',
             '零副作用：.msgs 内边距仍是 12px。', '先加一个能测的入口，再看数字说话。'];
  const TOOLS = [['bash'], ['bash', 'read'], ['bash', 'write', 'edit'], ['read'], ['edit', 'read'], ['actor']];
  const mk = (role, html, meta) => ({ role, html, meta: meta || '', ts: now(), temp: false });
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = i % 10;
    if (k === 0) {   // GitHub 推送
      out.push(mk('sys', `<div class="gh">🔀 <b>${REPO}</b> pushed ${1 + (i % 5)} commits to
        <span class="sha">main</span><br><span class="dim">${SHAs[i % SHAs.length]}</span>
        · ${escapeHtml(FILES[i % FILES.length])} <span class="ok">+${20 + (i % 90)}</span> -${i % 40}`));
    } else if (k === 1) {   // CI
      out.push(mk('sys', `<div class="gh">✅ CI <span class="ok">passed</span> on
        <span class="sha">main</span> <span class="dim">(${1 + (i % 9)}m ${i % 60}s) · build #${300 + i}</span></div>`));
    } else if (k === 2) {   // 文件提交 + 处理状态（MiMo 里那类）
      out.push(mk('sys', `<div class="gh">📦 <b>${escapeHtml(FILES[i % FILES.length])}</b>
        <span class="ok">+${10 + (i % 300)}</span> -${i % 120}
        <span class="dim">· 已处理 ${1 + (i % 30)}m ${i % 60}s</span></div>`));
    } else if (k === 3) {   // 工具调用行（带 bash/read/edit 标签）
      const tl = TOOLS[i % TOOLS.length];
      out.push(mk('ai', `已按判据跑完这一轮回归，第 ${i + 1} 条给个可核对的数字：命中 ${7 + (i % 20)} 条、
        报错 0。<div class="tools">${tl.map(t => `<i>${t}</i>`).join('')}</div>`));
    } else if (k % 2 === 0) {
      out.push(mk('user', `${escapeHtml(Q[i % Q.length])}（第 ${i + 1} 轮）`));
    } else {
      out.push(mk('ai', `${escapeHtml(A[i % A.length])} 这是第 ${i + 1} 条。`));
    }
  }
  S.chat = (S.chat || []).concat(out);
  save();
  renderChat();
  if (silent) return;
  toast(`已生成 <b>${n}</b> 条示例对话 —— 现在共 ${S.chat.length} 条，
    滑左侧轨道试试（每划过一条响一声，pulse-a/b/c 轮换）`);
}

/// §25 拖动落点指示线 —— 用户：「拖动过程中应该有一条竖线光标跟随拖动位置显示，
/// 让用户知道落点在哪里，松手后就是鼠标的落点」。横向条画竖线、纵向列画横线。
function ensureDropLine(container, horizontal) {
  let line = container.querySelector(horizontal ? '.drop-line' : '.drop-line-h');
  if (!line) {
    line = document.createElement('div');
    line.className = horizontal ? 'drop-line' : 'drop-line-h';
    container.appendChild(line);            // 绝对定位，不进 flex 布局
  }
  return line;
}
/// 算落点：返回 **S.tabs 索引**（与 moveTabTo 的 to 同一语义）
function tabDropIndex(container, e, horizontal) {
  const items = [...container.querySelectorAll(horizontal ? '.tab' : '.tv-item')];
  let idx = items.length;
  for (let k = 0; k < items.length; k++) {
    const r = items[k].getBoundingClientRect();
    const mid = horizontal ? r.left + r.width / 2 : r.top + r.height / 2;
    const v = horizontal ? e.clientX : e.clientY;
    if (v < mid) { idx = +items[k].dataset.ti; break; }   // 鼠标在它左/上半 → 插它前面
  }
  return idx;
}
function showDropLineAt(container, e, horizontal) {
  const idx = tabDropIndex(container, e, horizontal);
  const items = [...container.querySelectorAll(horizontal ? '.tab' : '.tv-item')];
  const line = ensureDropLine(container, horizontal);
  if (!items.length) { line.classList.remove('on'); return idx; }
  // 找「idx 这个标签」在哪一项后面画线
  let anchor = items.find(x => +x.dataset.ti === idx);
  const cr = container.getBoundingClientRect();
  if (horizontal) {
    if (anchor) { const r = anchor.getBoundingClientRect(); line.style.left = Math.max(0, r.left - cr.left - 2) + 'px'; }
    else { const r = items[items.length - 1].getBoundingClientRect(); line.style.left = Math.max(0, r.right - cr.left) + 'px'; }
  } else {
    if (anchor) { const r = anchor.getBoundingClientRect(); line.style.top = Math.max(0, r.top - cr.top - 3) + 'px'; }
    else { const r = items[items.length - 1].getBoundingClientRect(); line.style.top = Math.max(0, r.bottom - cr.top) + 'px'; }
  }
  line.classList.add('on');
  return idx;
}
function hideDropLine() { $$('.drop-line, .drop-line-h').forEach(x => x.classList.remove('on')); }

/// 清空对话（示例数据用完就清，避免 300 条把真实对话淹掉）
function clearDemoChat() {
  S.chat = [];
  save(true);
  renderChat();
  toast('已清空对话');
}

/// 当前可视的那一条 —— 用**视口距离**判断，单屏 / 双屏都对
/// （双屏两列的 offsetTop 会重复，所以不能靠 offsetTop 排序）
/// §24.12 消息相对 #msgs 顶部的位置缓存 —— **滚动高亮只读这里的数字**。
/// 上一版每次滚动都对 80 个 msg 调 getBoundingClientRect（每帧几十次布局查询），
/// 这是「非常卡顿」的主因之一。重建只在 renderChat 之后。
let histOffsets = [], histOffsetMap = new Map();
function rebuildHistOffsets() {
  histOffsets = $$('#msgs .msg')
    .map(m => ({ i: +m.dataset.i, top: m.offsetTop }))     // offsetParent = #msgs（position:relative）
    .sort((a, b) => a.top - b.top);                        // 双屏两列时 DOM 顺序 ≠ 视觉顺序，按 top 排
  histOffsetMap = new Map(histOffsets.map(o => [o.i, o.top]));  // §30 spine 可见区/点击滚动读这份
}
/// 旧的 histCurIndex / syncHistCur / histGoto / railTipHtml / bindRailTip / clearScrub
/// 已随 §30 整体删除 —— 轨道现在是 source 的 SessionSpine：可见区高亮（.active）、
/// ease-out-expo 点击滚动、.spine-preview 卡，全部在上面那一节。

/// §22.13 —— replyBusy 模拟"上一条还没答完"（原型没有真模型，用一个定时器当生成窗口）
let replyBusy = false, replyTimer = null;
function renderSendPolicy() {
  const pol = S.sendPolicy || 'queue';
  $$('#qRow .q-opt').forEach(b => b.classList.toggle('is-on', b.dataset.policy === pol));
  // §32 发送方式的唯一入口在设置菜单 —— 打开时高亮当前项
  $('#menuSettings [data-act="policyQueue"]')?.classList.toggle('is-on', pol === 'queue');
  $('#menuSettings [data-act="policyInterrupt"]')?.classList.toggle('is-on', pol === 'interrupt');
  const q = S.sendQueue || [];
  const badge = $('#qBadge');
  if (badge) { badge.hidden = q.length === 0; badge.textContent = String(q.length); }
}
function setSendPolicy(p) {
  S.sendPolicy = p; save(true); renderSendPolicy();
  toast(p === 'queue' ? '发送方式：<b>排队</b> —— 上一条答完再发' : '发送方式：<b>打断</b> —— 直接顶掉上一条');
}
function dispatchReply(text) {
  addMsg('user', escapeHtml(text));
  replyBusy = true;
  replyTimer = setTimeout(() => {
    reply(text);
    replyTimer = setTimeout(() => {
      replyBusy = false;
      const q = S.sendQueue || [];
      if (q.length) { const next = q.shift(); save(true); renderSendPolicy(); dispatchReply(next); }
    }, 900);
  }, 360);
}
function sendChat() {
  const ta = $('#chatInput'), text = ta.value.trim();
  if (!text) return;
  ta.value = ''; ta.focus();                    // 发送后清空，光标留在框里
  if (replyBusy && (S.sendPolicy || 'queue') === 'queue') {
    S.sendQueue = S.sendQueue || []; S.sendQueue.push(text);
    save(true); renderSendPolicy();
    toast(`已排队 —— 上一条答完自动发（队列 <b>${S.sendQueue.length}</b> 条）`);
    return;
  }
  if (replyBusy && S.sendPolicy === 'interrupt') {
    clearTimeout(replyTimer); replyBusy = false;
    toast('已<b>打断</b>上一条，改发这一条');
  }
  dispatchReply(text);
}
/// §22.13.6 队列徽标：点开看列表，可单条取消
function openQueueMenu(anchor) {
  const q = S.sendQueue || [];
  if (!q.length) return;
  showMenu(
    [{ title: `排队中 ${q.length} 条` }]
      .concat(q.map((text, i) => ({ label: `取消第 ${i + 1} 条 · ${String(text).slice(0, 14)}`,
        action: () => { S.sendQueue.splice(i, 1); save(true); renderSendPolicy(); toast('已取消一条排队消息'); } })))
      .concat([{ sep: true }, { label: '清空队列', danger: true,
        action: () => { S.sendQueue = []; save(true); renderSendPolicy(); toast('已清空队列'); } }]),
    anchor);
}
function reply(q) {
  const p = proj(), focuses = S.focusFiles || [], focus = focuses[0];
  const fp = e => { const pr = projectById(e.p); return pr ? `${pr.path}/${e.f}` : e.f; };
  // §20.9.4：没选真项目时（默认卡 / 临时对话 / 编辑区关着），拼给模型的就是**默认项目文件夹**
  const inProjectCtx = p && !S.tempMode && (S.projectMode || !!S.activeProjChat);
  const ctx = inProjectCtx ? `<code>${p.path}</code>`
    : `<code>${defaultFolderPath()}</code>`
      + (focuses.length ? ` · 重点参考 ${focuses.map(fp).map(x => `<code>${x}</code>`).join(' ')}` : '');
  const demo = '本地演示回复 · 未接模型';

  if (p && /(脑图|思维导图|mindmap|分支|节点)/.test(q) && /(加|新增|添加|插入|来一个|来条)/.test(q)) {
    const m = q.match(/[「"'"']([^「」"'"']+)[」"'"']/) || q.match(/[:：]\s*(\S+)$/);
    const label = (m ? m[1] : q.replace(/.*(?:加|新增|添加)/, '').trim()).slice(0, 16) || '新分支';
    mindAddBranch(label);
    ensureTab(MIND_FILE); S.tab = 'mind';
    save(); renderNav(); renderTabs(); renderContent(); renderContext();
    addMsg('ai', `改好了 —— 脑图多了一支 <b>${escapeHtml(label)}</b>。\n\n`
      + `· 文件：<code>${fullPath(MIND_FILE)}</code>\n`
      + `· 已自动备份一版历史（来源＝对话）→ 「历史」能看见、能恢复\n· 上下文：${ctx}`, demo);
    return;
  }
  if (p && /(脑图|思维导图)/.test(q) && /(删|去掉|移除|不要)/.test(q)) {
    const kw = (q.match(/[「"'"']([^「」"'"']+)[」"'"']/) || [, q.split(/[删去掉移除]/).pop()])[1] || '';
    if (kw && mindRemoveNode(kw.trim())) {
      S.tab = 'mind'; ensureTab(MIND_FILE); save(); renderNav(); renderTabs(); renderContent();
      addMsg('ai', `已从脑图删掉「${escapeHtml(kw.trim())}」，并自动备份了一版（来源＝对话）。`, demo); return;
    }
    addMsg('ai', `没在脑图里找到「${escapeHtml(kw)}」。告诉我准确的分支名。`, demo); return;
  }
  if (!p) {
    addMsg('ai', `收到 —— 现在是**临时对话**（没有项目文件夹），所以我只按你这一句回答。\n\n`
      + `想围绕项目工作：点左边 <b>＋</b> → 新建空白项目 / 使用现有文件夹。`, demo);
    return;
  }
  if (/(路径|目录|项目在哪|绝对路径)/.test(q)) {
    addMsg('ai', `当前项目：<code>${p.path}</code>\n`
      + (focuses.length ? `重点参考（${focuses.length} 个）：${focuses.map(fp).map(x => `<code>${x}</code>`).join(' ｜ ')}\n`
                        : '（还没选重点文件，点左边任意文件即可）')
      + `\n每一轮对话都会自动带上这些路径。`, demo); return;
  }
  if (/(总结|讲讲|说了什么|概览|README)/i.test(q) && focus) {
    const fpRel = focus.f, fpProj = projectById(focus.p) || p;
    const body = (fpProj.files[fpRel] || '').split('\n').filter(l => l.trim() && !/^```/.test(l)).slice(0, 5).join('\n');
    addMsg('ai', `重点参考是 <code>${escapeHtml(fpRel)}</code>，开头这些：\n\n${escapeHtml(body)}\n\n`
      + `要我把它并进脑图吗？说「给脑图加一个 …」就行。`, demo); return;
  }
  if (/(历史|备份|恢复|版本)/.test(q)) {
    const n = (S.history[histFile()] || []).length;
    addMsg('ai', `<code>${escapeHtml(histFile() || '—')}</code> 目前有 <b>${n}</b> 版历史。\n`
      + `任何一次编辑（手改 / 对话改 / 恢复）都会自动存一版，**每个文件只留最近 10 次**；`
      + `点「恢复」随时回去 —— 恢复本身也会留一版。`, demo); return;
  }
  addMsg('ai', `收到。我按这个上下文来答：${ctx}\n\n`
    + `（演示回复：真机上这里走当前卡片的管线 —— 图文带截图、语音走朗读、`
    + `连续/临时对话按你选的那颗走。）\n\n可以试试：\n`
    + `· 「给脑图加一个「定价」分支」\n· 「讲讲 README 开头」\n· 「项目路径是多少」`, demo);
}

/* ============================================================
   搜索 / 路径 / 编辑按钮 / 工具栏
   ============================================================ */
/// 选项面板：音色在这一层（§15.3）。三种模式内容不同 —— 照你两张截图的排布。
function renderOptPanel() {
  const p = $('#optPanel'); if (!p) return;
  const row = (k, v, sub) => `<div class="opt-row"><span class="ok">${k}</span>
    <span class="ov">${v}</span>${sub ? `<span class="os">${sub}</span>` : ''}<span class="oc">⌄</span></div>`;
  let html = '';
  if (S.mode === 'voice') {
    html += row('模式', '全双工', '全双工 3.0 Flash');
    html += row('模式', '三段式', '标准三段式');
    html += row('音色', 'longanqian', '随所选模式');
  } else if (S.mode === 'video') {
    html += row('模型', 'deepseek-flash', '视频');
    html += row('音色', '默认');
    html += row('摄像头', '已开启', '跟当前软件一致');
  } else {
    html += row('模型', 'deepseek-flash');
    html += row('音色', '默认', '在这一层选');
    html += row('语速', rateLabelOf(S.speechRate));
    html += row('工具', '21 个');
  }
  p.innerHTML = `<div class="opt-head">选项 · ${S.mode === 'voice' ? '语音' : S.mode === 'video' ? '视频' : '图文'}</div>${html}
    <div class="opt-note">音色放在这一层（页头右侧只有 角色 与 选项）。</div>`;
  $$('.opt-row', p).forEach(r => r.onclick = () => toast('原型只记状态 —— 落 SwiftUI 接真实选择器'));
}

function setLayout(layout) {
  S.layout = layout;
  const main = $('#main');
  main.classList.toggle('center-layout', layout === 'center');
  main.classList.toggle('left-layout', layout === 'left');
  const label = layout === 'center' ? '对话·中' : layout === 'left' ? '对话·左' : '对话·右';
  $('#btnLayout').textContent = label;
  save();
  const say = { center: '对话放中间 —— 对话内容更大', left: '对话放左侧', right: '对话放右侧 —— 正文居中显示' };
  toast(say[layout]);
}
function cycleLayout() {
  // §22.6.2 推翻 §15.4「编辑区关着只有 左/右」—— 编辑区关着也照样能切 左/中/右
  setLayout(S.layout === 'right' ? 'center' : S.layout === 'center' ? 'left' : 'right');
}
/// 进项目模式：把导航栏那排 图文/语音/视频 **搬进对话框**（§12.0.5）
/// ⭐ 图文/语音/视频 **永远画在对话窗里**（§14.3）：对话窗在哪，它们就在哪。
/// 项目模式和对话模式都一样 —— 顶栏不再放它们（#modesSlotTop 被 CSS 藏掉）。
function placeModeChips() { /* 模式条本来就在对话窗页头里，不需要搬 */ }
function toggleFullscreen() {
  const app = $('.app');
  app.classList.toggle('fs');
  const on = app.classList.contains('fs');
  // 退出入口**必须常驻**：预览是 iframe 时焦点在里面，document 收不到 ESC（§12.5）
  $('#btnFsExit').hidden = !on;
  toast(on ? '已进入全屏 —— 右上角按钮 / ESC / ⌘⇧F 都能退出' : '已退出全屏');
}

/// §35.18 编辑区全屏 = **不是系统全屏**：导航栏以下全给编辑区 ——
/// 隐藏 项目栏 / 两根分隔线 / 会话区 / 右 rail / 侧板（顶栏保留），workspace 撑满；
/// 再点一次恢复三段。CSS 规则在 body.editor-full。
function toggleEditorFull() {
  const on = !document.body.classList.contains('editor-full');
  document.body.classList.toggle('editor-full', on);
  toast(on ? '编辑区全屏 —— 左右栏和会话区已藏起，⛶ 再点一次退出'
           : '已退出编辑区全屏 —— 三段布局回来了');
}

/* ── 分割线拖拽 ─────────────────────────────── */
function dragSplit(el, apply) {
  el.addEventListener('mousedown', e => {
    e.preventDefault(); el.classList.add('drag');
    apply(e);                              // §32 按住那一秒先把线定位到光标下（消除抓取点→线的固定偏差），之后 1:1
    const move = ev => apply(ev);
    const up = () => { el.classList.remove('drag');
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

let menuTabIndex = null;
let menuDyn = null;
let menuTabXY = null;              // §21.4A 菜单要贴着鼠标（二级「加入标签组…」也从这里接）
let menuTabGroupObj = null;
let menuCardXY = null;
let menuProjXY = null;      // §23.7 项目菜单贴鼠标（二级「移动到分组」要靠它）         // §23.1 会话菜单贴鼠标（二级复制菜单要靠它定位）
/// §41.9 子菜单元素池：menuDyn=root，menuSubs[0]=第 1 层子菜单……
///   为什么不能像从前那样「action 里再调一次 showMenu」：showMenu 复用同一个 DOM 并
///   `innerHTML=''` —— 一点开子菜单父菜单就没了（你：「自动就把右键菜单给删掉了」）。
let menuSubs = [];
function menuElAt(depth) {
  if (depth === 0) {
    if (!menuDyn) {
      menuDyn = document.createElement('div');
      menuDyn.className = 'menu'; menuDyn.id = 'menuDyn';
      document.body.appendChild(menuDyn);
    }
    return menuDyn;
  }
  while (menuSubs.length < depth) {
    const d = document.createElement('div');
    d.className = 'menu menu-sub';
    document.body.appendChild(d);
    menuSubs.push(d);
  }
  return menuSubs[depth - 1];
}
/// 收起「深度 > depth」的所有子菜单（深度 d 的元素在 menuSubs[d-1]）
function hideMenusDeeperThan(depth) {
  menuSubs.forEach((m, i) => { if (i + 1 > depth) m.hidden = true; });
}
/// 把一串菜单项画进某个菜单元素（root 与子菜单共用同一套渲染，递归深度即层级）
function renderMenuItems(container, items, depth) {
  container.innerHTML = '';
  items.forEach(it => {
    if (it.sep) { container.insertAdjacentHTML('beforeend', '<div class="menu-sep"></div>'); return; }
    if (it.title) { container.insertAdjacentHTML('beforeend', `<div class="menu-title">${escapeHtml(it.title)}</div>`); return; }
    // §37.13 图1 色点行：横排 6 色（showMenu 原本只会竖排按钮）
    if (Array.isArray(it.swatches)) {
      const wrap = document.createElement('div');
      wrap.className = 'menu-swatches';
      it.swatches.forEach((c, i) => {
        const s = document.createElement('button');
        s.className = 'mi-dot-btn'; s.style.background = c; s.title = c;
        s.onclick = e => { e.stopPropagation(); closeMenus(); it.action && it.action(i); };
        wrap.appendChild(s);
      });
      container.appendChild(wrap);
      return;
    }
    const b = document.createElement('button');
    // §37.13 图1/图3 项左小图标（icon=emoji/字形，16px 位）
    b.innerHTML = (it.icon ? `<span class="mi-ico">${it.icon}</span>` : '')
      + escapeHtml(it.label || '');
    if (it.danger) b.className = 'danger';
    if (it.sub) {
      // §41.9 有子项：悬停/点击都在**父菜单右侧**开一层，父菜单留着
      b.classList.add('has-sub');
      b.insertAdjacentHTML('beforeend', '<span class="mi-arrow">›</span>');
      const openSub = () => {
        hideMenusDeeperThan(depth);
        const sub = menuElAt(depth + 1);
        renderMenuItems(sub, it.sub, depth + 1);
        sub.hidden = false;
        const pr = container.getBoundingClientRect(), br = b.getBoundingClientRect();
        const w = sub.offsetWidth, h = sub.offsetHeight;
        let left = pr.right - 6;                                  // 贴父菜单右缘（叠 6px 消除缝）
        if (left + w > innerWidth - 6) left = Math.max(6, br.left - w + 6);   // 右边放不下 → 翻到左边
        let top = br.top;
        if (top + h > innerHeight - 6) top = Math.max(6, innerHeight - h - 6);
        sub.style.left = left + 'px'; sub.style.top = top + 'px';
      };
      b.onmouseenter = openSub;
      b.onclick = e => { e.stopPropagation(); openSub(); };        // 点击=展开，不关父菜单
    } else {
      b.onmouseenter = () => hideMenusDeeperThan(depth);           // 划到普通项 → 收掉已开的子层
      // 必须拦冒泡：点菜单项会冒到 document 的「点外面就关菜单」—— 若 action 里又开了
      // 别的菜单，旧按钮已 detach → closest('.menu')=null → 新菜单在同一击里被关掉（§36 实测）
      b.onclick = e => { e.stopPropagation(); closeMenus(); it.action && it.action(); };
    }
    container.appendChild(b);
  });
}
/// 通用弹出菜单：给一串 {label, danger?, action? | sub?} 就画出来（分组菜单 / 卡片附加项都用它）
function showMenu(items, anchor, xy) {
  closeMenus();                              // 任何菜单打开前先关掉其它（含分组/卡片/项目）
  closeGitPanel();
  const menu = menuElAt(0);
  renderMenuItems(menu, items, 0);
  const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
  if (xy) { menu.hidden = false; placeMenu(menu, xy.x, xy.y); }
  else if (r) {
    // §35.11 带按钮锚点一律**贴按钮上方**（底边=按钮顶边）；上方放不下 placeMenuAbove 自动翻下 ——
    // 权限/审批/左右两列的＋原来都从下方弹、把按钮整个盖住（你点名的"覆盖按钮不对"）
    placeMenuAbove(menu, r.left, r.top, r.bottom);
  } else { menu.hidden = false; placeMenu(menu, 100, 100); }
}
/// §41.3 菜单「点外面自动收起」——只绑 click 拦不住两条真实路径（基线实测两种都还开着）：
///   ① 访达的行 / 左栏组头 onclick 里有 stopPropagation，click 根本冒不到 document；
///   ② 右键点别处**不产生 click**（右键只发 mousedown/contextmenu）。
/// 所以挂在 **capture 阶段的 mousedown**：任何在菜单外的按下（左/右键都算）当场收。
/// 两条放行是硬要求：菜单**内部**放行（否则菜单项的 click 永远不会发生 —— 见 449 行那段历史）；
/// 锚点按钮放行（否则 openMenuAt 的「再点一下=收起」会退化成「永远收不起」）。
const MENU_ANCHOR_SEL = '#btnAddProject,#btnAddPlan,.proj-more,#btnSettings,#btnTabsCollapse,'
  + '.pmore,.gmore,#fpGroupBtn,.fp-add-group,#fpHotkeys';
document.addEventListener('mousedown', e => {
  if (!e.target || typeof e.target.closest !== 'function') return;
  if (e.target.closest('.menu') || e.target.closest(MENU_ANCHOR_SEL)) return;
  closeMenus();
  // §41.3 ⋮ 的「显示设置」面板同理（它不在 .menu 里，原来只绑 click → 点组头也关不掉）
  const vp = document.getElementById('fpViewPanel');
  if (vp && !vp.hidden && !e.target.closest('[data-fa="more"]')) vp.hidden = true;
}, true);
/// 标签条最左的 ☰：**纵向列出全部标签**（横向看不全时用，§13.4）
function openTabsPopover() {
  const m = $('#tabsPopover');
  if (!m.hidden) { m.hidden = true; return; }
  closeMenus();                             // §17.1：开它之前先把别的菜单收掉
  closeGitPanel();
  m.innerHTML = '';
  S.tabs.forEach((t, i) => {
    const it = document.createElement('div');
    it.className = 'mt-item' + (i === S.activeTab ? ' is-on' : '');
    it.innerHTML = `${treeIconSVG(t.f, false)}<span class="nm"></span>
      <span class="pin">${t.pinned ? '📌' : ''}</span>`;
    it.querySelector('.nm').textContent = `${(projectById(t.p) || {}).name || t.p} · ${tabDisplayName(t)}`;
    it.onclick = () => { m.hidden = true; S.activeTab = i; S.currentFile = fluidTab(t) ? null : t.f;
      S.tab = tabViewKind(t);
      save(); renderTabs(); renderContent(); renderContext(); renderNav(); };
    m.appendChild(it);
  });
  if (!S.tabs.length) m.innerHTML = '<div class="mt-item">还没有标签</div>';
  const r = $('#btnTabsCollapse').getBoundingClientRect();
  m.hidden = false;
  m.style.left = r.left + 'px'; m.style.top = (r.bottom + 6) + 'px';
}
/// §22.10 右键标签页 = 用户给的那张图（拆分/改名/固定/关闭一族/预览/路径）
///          + §21.4A 保留下来的全部条目。UI 仍是本项目 .menu。
function openTabMenu(index, ev) {
  menuTabIndex = index;
  menuTabXY = { x: ev.clientX, y: ev.clientY };
  closeMenus();
  const t = S.tabs[index]; if (!t) return;
  const m = $('#menuTabs');
  const groups = S.tabGroups || [];
  const last = index >= S.tabs.length - 1;
  const isBrowser = t.kind === 'browser';
  const isTerm = t.kind === 'terminal';          // §23.9.1 同一条入口，文案随标签类型变
  const rel = (isBrowser || isTerm) ? null : t.f;
  const isMd = rel && extOf(rel) === 'md';
  m.innerHTML = `
    <div class="menu-title">${escapeHtml(t.label || t.f)}</div>
    <button data-act="splitTo">${isTerm ? '拆分终端' : '将标签页移至拆分'} ›</button>
    <button data-act="renameFile">重命名</button>
    <button data-act="pin">${t.pinned ? '取消固定标签' : '固定标签'}</button>
    <div class="menu-sep"></div>
    <button data-act="close">关闭</button>
    <button data-act="closeOthers"${S.tabs.length < 2 ? ' disabled' : ''}>关闭其他</button>
    <button data-act="closeAll"${S.tabs.length < 1 ? ' disabled' : ''}>关闭所有编辑器选项卡</button>
    <button data-act="closeRight"${last ? ' disabled' : ''}>关闭右侧的选项卡</button>
    <button data-act="closeLeft"${index <= 0 ? ' disabled' : ''}>关闭左侧的选项卡</button>
    <div class="menu-sep"></div>
    ${isMd ? '<button data-act="openPreview">打开 Markdown 预览</button>' : ''}
    ${rel ? `<button data-act="copyPath">复制路径</button>
             <button data-act="copyRelPath">复制相对路径</button>
             <button data-act="reveal">在 Finder 中显示</button>` : ''}
    <div class="menu-sep"></div>
    <button data-act="openBelow">在下方新增标签页</button>
    <button data-act="splitView">使用当前标签页创建新的拆分视图</button>
    <button data-act="toNewGroup">移动至新标签组</button>
    ${groups.length ? `<button data-act="joinGroup">加入标签组…</button>` : ''}
    ${t.group ? `<button data-act="leaveGroup">移出当前标签组</button>
                 <button data-act="groupOptions">标签组选项…</button>` : ''}
    <button data-act="toWindow">将标签页移至新窗口</button>
    <div class="menu-sep"></div>
    <button data-act="reload">重新加载</button>
    <button data-act="dup">复制标签页</button>
    <button data-act="renameLabel">重命名标签页</button>
    <button data-act="customIcon">自定义图标…</button>
    <button data-act="tabColor">修改标签颜色…</button>
    <button data-act="mute">将这个网站静音</button>
    <div class="menu-sep"></div>
    <button data-act="layout">${S.tabsVertical ? '水平显示标签页' : '垂直显示标签页'}</button>`;
  $$('button', m).forEach(b => b.onclick = () => tabMenuAction(b.dataset.act));
  m.hidden = false;
  placeMenu(m, ev.clientX, ev.clientY);
}
function tabMenuAction(act) {
  const i = menuTabIndex;
  const xy = menuTabXY;
  closeMenus();
  if (i === null || !S.tabs[i]) return;
  const t = S.tabs[i];
  const activeBefore = S.tabs[S.activeTab];      // 增删/排序之后"当前打开的"还得是它

  switch (act) {
    case 'openBelow': openTabAfter(i); return;
    case 'splitView': toast('拆分视图：原型先记一笔（落 SwiftUI 走双栏）'); return;
    case 'splitTo': {
      const x = menuTabXY;
      // §23.9.1 终端标签上这一条叫「拆分终端」，拆的是**终端自己**的两格
      //（源码 TerminalTabSplitMenuSection.tsx:53 'Split terminal' → right / down）
      if (S.tabs[i] && S.tabs[i].kind === 'terminal') {
        if (S.activeTab !== i) activateTab(i);
        showMenu([
          { label: '拆分终端向右', action: () => splitTerminal('right') },
          { label: '拆分终端向下', action: () => splitTerminal('down') },
        ], null, x);
        return;
      }
      showMenu([
        { label: '拆分到左侧', action: () => setSplitSide('left', i) },
        { label: '拆分到右侧', action: () => setSplitSide('right', i) },
      ], null, x);
      return; }
    case 'renameFile': renameTabFile(t); return;
    case 'copyPath': {
      const pr = projectById(t.p); if (!pr) return;
      navigator.clipboard?.writeText(`${pr.path}/${t.f}`);
      toast(`已复制路径 <b>${escapeHtml(pr.path + '/' + t.f)}</b>`); return; }
    case 'copyRelPath':
      navigator.clipboard?.writeText(t.f);
      toast(`已复制相对路径 <b>${escapeHtml(t.f)}</b>`); return;
    case 'reveal': {
      const pr = projectById(t.p);
      toast(pr ? `在 Finder 中显示 <b>${escapeHtml(pr.path + '/' + t.f)}</b>` : '没有项目路径'); return; }
    case 'openPreview':
      S.tab = 'md'; S.mdVariant = 'preview';
      save(); renderContent(); toast('已切到 Markdown 预览'); return;
    case 'closeAll': S.tabs = []; S.activeTab = 0; S.currentFile = null; S.projectMode = false;
      save(); renderTabs(); renderContent(); renderContext(); toast('已关闭所有标签'); return;
    case 'toNewGroup': moveToNewTabGroup(t); return;
    case 'joinGroup': {
      const groups = S.tabGroups || [];
      if (!groups.length) { toast('还没有标签组 —— 先「移动至新标签组」'); return; }
      showMenu(groups.map(g => ({ label: `加入「${g.name}」`, action: () => {
        t.group = g.name; moveTabBesideItsGroup(t);
        save(true); renderTabs(); toast(`已加入标签组 <b>${escapeHtml(g.name)}</b>`);
      } })), null, xy);
      return; }
    case 'leaveGroup': t.group = null; save(true); renderTabs(); toast('已移出标签组'); return;
    case 'groupOptions': {
      const g = tabGroupByName(t.group); if (!g) return;
      openTabGroupMenu(g, xy); return; }
    case 'toWindow': toast('移至新窗口：原型先记一笔（落 SwiftUI 走新 NSWindow）'); return;
    case 'reload': save(); renderContent(); renderTabs(); toast(`已重新加载 <b>${escapeHtml(t.f)}</b>`); return;
    case 'rename': renameTabLabel(t); return;
    case 'tabColor': {
      const x = menuTabXY;
      showMenu([{ title: '标签颜色' }]
        .concat(TAB_ICON_COLORS.map(c => ({ label: `${TAB_COLOR_NAMES[c] || c}  ●`,
          action: () => { t.color = c; save(true); renderTabs(); toast(`标签颜色已改为 <b>${TAB_COLOR_NAMES[c] || c}</b>`); } })))
        .concat([{ sep: true },
          { label: '清除颜色', action: () => { delete t.color; save(true); renderTabs(); toast('已清除标签颜色'); } }]),
        null, x);
      return; }
    case 'customIcon': {
      const x = menuTabXY;
      showMenu([{ title: '图标' }]
        .concat(TAB_ICON_COLORS.map(c => ({ label: `${c}  ●`, action: () => { t.icon = c; save(true); renderTabs(); toast('图标已改'); } })))
        .concat([{ sep: true },
          { label: '输入 emoji / 字符…', action: () => askModal({ title: '自定义图标',
              text: '填 1–2 个字符当标签图标；留空 = 恢复成文件类型图标。',
              value: (t.icon && !String(t.icon).startsWith('#')) ? t.icon : '', okText: '用它',
              onOk: v => { const s2 = (v || '').trim();
                if (s2) { t.icon = s2.slice(0, 2); toast('图标已改'); }
                else { delete t.icon; toast('已恢复文件类型图标'); }
                save(true); renderTabs(); } }) },
          { label: '恢复默认（文件类型图标）', action: () => { delete t.icon; save(true); renderTabs(); } }]),
        null, x);
      return; }
    case 'mute': toast('这个标签没有音频可静音（原型先记一笔）'); return;
    case 'layout': toggleTabsLayout(); return;
    case 'pin': t.pinned = !t.pinned;
      toast(t.pinned ? '已固定 —— 跑到最左侧、按钮变小' : '已取消固定'); break;
    case 'dup': S.tabs.splice(i + 1, 0, { ...t }); break;
    case 'close': S.tabs.splice(i, 1); break;
    case 'closeOthers': S.tabs = [t]; break;
    case 'closeLeft': S.tabs = S.tabs.slice(i); break;
    case 'closeRight': S.tabs = S.tabs.slice(0, i + 1); break;
    case 'closeBelow': S.tabs = S.tabs.slice(0, i + 1); break;
    default: return;
  }
  // §20.6 固定 = **移动到最左侧**：Array.sort 是稳定的 ——
  // 固定的排前、未固定的排后，两组**内部**都保持原来的相对顺序。
  S.tabs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const stillThere = S.tabs.indexOf(activeBefore);
  if (stillThere >= 0) S.activeTab = stillThere;
  if (S.activeTab >= S.tabs.length) S.activeTab = S.tabs.length - 1;
  if (S.activeTab < 0) S.activeTab = 0;
  S.currentFile = (S.tabs[S.activeTab] || {}).f || null;
  save(); renderTabs(); renderContent(); renderContext();
}

/* ── §21.4 标签组的四个动作（菜单 / 分组菜单共用） ───────── */
/// 在这个标签**后面**插一个新标签（项目里还没打开的文件）
function openTabAfter(i) {
  const seen = new Set(S.tabs.map(x => `${x.p}|${x.f}`));
  const pool = [...realProjects(), defaultProject()].filter(Boolean);
  let found = null;
  for (const p of pool) {
    for (const rel of flatFiles(p)) {
      if (!seen.has(`${p.id}|${rel}`)) { found = { p, rel }; break; }
    }
    if (found) break;
  }
  if (!found) { toast('所有项目的文件都已经打开了'); return; }
  S.tabs.splice(i + 1, 0, { p: found.p.id, f: found.rel });
  S.activeTab = i + 1; S.currentFile = found.rel;
  S.tab = extViewKind(found.rel) === 'file' ? 'file' : extViewKind(found.rel);
  save(); renderTabs(); renderContent(); renderContext(); renderNav();
  toast(`已在下方新增标签：<b>${escapeHtml(found.rel)}</b>`);
}
/// §22.7.3 右键「重命名」= **重命名这个文件**（与文件树右键那一套同一语义）
function renameTabFile(t) {
  if (t.kind === 'browser') { renameTabLabel(t); return; }
  const pr = projectById(t.p); if (!pr) return;
  askModal({ title: '重命名文件', text: t.f, value: t.f.split('/').pop(), okText: '重命名', onOk: v => {
    const nn = (v || '').trim(); if (!nn || nn === t.f.split('/').pop()) return;
    const dir = t.f.includes('/') ? t.f.slice(0, t.f.lastIndexOf('/') + 1) : '';
    const target = dir + nn;
    if (target in pr.files) { toast('已经有同名文件了'); return; }
    pr.files[target] = pr.files[t.f]; delete pr.files[t.f];
    renameInTree(pr.tree, t.f.split('/'), target.split('/'));
    S.focusFiles = (S.focusFiles || []).filter(x => !(x.p === pr.id && x.f === t.f));
    S.tabs.forEach(x => { if (x.p === pr.id && x.f === t.f) x.f = target; });
    if (S.currentFile === t.f) S.currentFile = target;
    save(true); renderNav(); renderTabs(); renderContent(); renderContext();
    toast(`已重命名为 <b>${escapeHtml(target)}</b>`);
  }});
}

/// §22.10 「将标签页移至拆分」—— 内容区横向劈成两半，这一半显示那个标签
function setSplitSide(side, index) {
  const t = S.tabs[index]; if (!t) return;
  if (S.splitSide === side && S.splitIndex === index) {
    S.splitSide = null; S.splitIndex = undefined;
    toast('已退出拆分');
  } else {
    S.splitSide = side; S.splitIndex = index;
    toast(`已把「${escapeHtml(t.label || t.f)}」放到${side === 'left' ? '左' : '右'}半边（原型只做只读预览）`);
  }
  save(true); renderContent();
}

/// 改的是**显示名**，不碰磁盘上的文件名；留空 = 恢复原名
function renameTabLabel(t) {
  const isTerm = t.kind === 'terminal';
  askModal({ title: '重命名标签页',
    text: isTerm ? '改的只是这一栏显示的名字，不会动终端本身。留空 = 恢复成原来的名字。'
                 : `改的只是这一栏显示的名字，不会动磁盘上的文件。留空 = 恢复成 ${t.f}`,
    value: t.label || '', okText: '重命名', onOk: v => {
      const s = (v || '').trim();
      if (s) t.label = s;
      else if (isTerm) t.label = (t.term && t.term.title) || '终端';   // 终端没有"原文件名"可回落
      else delete t.label;
      if (isTerm && t.term) t.term.title = t.label;
      save(true); renderTabs(); renderContent();
      toast(s ? `标签已改名为 <b>${escapeHtml(s)}</b>` : '已恢复原名');
    }});
}
/// 同组的标签必须**连着排**，否则垂直形态里组头和组员会被别的标签隔开
function moveTabBesideItsGroup(t) {
  const idx = S.tabs.indexOf(t); if (idx < 0) return;
  const last = S.tabs.map(x => x.group || null).lastIndexOf(t.group);
  if (last > idx) { S.tabs.splice(idx, 1); S.tabs.splice(last, 0, t); }
}
function moveToNewTabGroup(t) {
  askModal({ title: '移动至新标签组',
    text: '给这个组起个名字；写已有的组名就并进那个组。',
    value: '新标签组', okText: '移动', onOk: v => {
      const name = (v || '').trim() || '新标签组';
      if (!tabGroupByName(name)) S.tabGroups.push({ name, color: TAB_GROUP_COLORS[0], open: true });
      t.group = name; moveTabBesideItsGroup(t);
      save(true); renderTabs();
      toast(`已移动到标签组 <b>${escapeHtml(name)}</b>`);
    }});
}

/// §21.4B 右键**标签组**（功能类型照「为此组命名 + 8 个颜色点」那张图）
function openTabGroupMenu(grp, xy) {
  menuTabGroupObj = grp;
  closeMenus();
  const m = $('#menuTabGroup');
  const cur = grp.color || TAB_GROUP_COLORS[0];
  m.innerHTML = `
    <button data-act="rename">为此组命名</button>
    <div class="gcolors">${TAB_GROUP_COLORS.map(c =>
      `<button data-color="${c}" class="${c === cur ? 'is-on' : ''}" style="background:${c}" title="换成这个颜色"></button>`).join('')}</div>
    <div class="menu-sep"></div>
    <button data-act="addTab">在分组内添加新标签页</button>
    <button data-act="toWindow">将分组移至新窗口</button>
    <button data-act="bookmark">全部保存到收藏夹</button>
    <div class="menu-sep"></div>
    <button data-act="ungroup">解散标签组</button>
    <button data-act="collapse">${grp.open === false ? '展开标签组' : '关闭标签组'}</button>
    <button data-act="delete" class="danger">关闭并删除标签组</button>`;
  $$('.gcolors button', m).forEach(b => b.onclick = () => {
    grp.color = b.dataset.color; save(true); closeMenus();
    renderTabs(); toast('标签组换色了');
  });
  $$('button[data-act]', m).forEach(b => b.onclick = () => tabGroupAction(b.dataset.act));
  m.hidden = false;
  const r = xy || menuTabXY || { x: 200, y: 200 };
  placeMenu(m, r.x, r.y);
}
function tabGroupAction(act) {
  const grp = menuTabGroupObj;
  const x = menuTabXY;
  closeMenus();
  if (!grp) return;
  const members = S.tabs.filter(t => t.group === grp.name);
  switch (act) {
    case 'rename':
      askModal({ title: '为此组命名', value: grp.name, okText: '命名', onOk: v => {
        const name = (v || '').trim(); if (!name || name === grp.name) return;
        S.tabs.forEach(t => { if (t.group === grp.name) t.group = name; });
        if (S.tabGroups) S.tabGroups.forEach(g => { if (g === grp) g.name = name; });
        save(true); renderTabs(); toast(`标签组已改名为 <b>${escapeHtml(name)}</b>`);
      }});
      break;
    case 'addTab': {
      const lastMember = members[members.length - 1];
      const at = lastMember ? S.tabs.indexOf(lastMember) : S.tabs.length - 1;
      openTabAfter(at < 0 ? S.tabs.length - 1 : at);
      const added = S.tabs[Math.min(S.tabs.length - 1, at + 1)];
      if (added) { added.group = grp.name; moveTabBesideItsGroup(added); save(true); renderTabs(); }
      break; }
    case 'toWindow': toast('将分组移至新窗口：原型先记一笔（落 SwiftUI 走新 NSWindow）'); break;
    case 'bookmark': toast('全部保存到收藏夹：原型先记一笔'); break;
    case 'ungroup':
      // 解散 = **组记录没了、标签全部留着**（只是不再分组）
      members.forEach(t => { t.group = null; });
      S.tabGroups = (S.tabGroups || []).filter(g => g !== grp);
      save(true); renderTabs();
      toast(`已解散标签组「${escapeHtml(grp.name)}」—— ${members.length} 个标签都还在`);
      break;
    case 'collapse':
      grp.open = grp.open === false; save(true); renderTabsVertical();
      toast(grp.open === false ? '已关闭（折叠）这个标签组' : '已展开这个标签组');
      break;
    case 'delete':
      // 关闭并删除 = **组里所有标签一起关掉** + 组记录删掉
      confirmModal({ title: '关闭并删除这个标签组？',
        text: `${grp.name}\n会关掉里面的 ${members.length} 个标签（文件还在项目里，随时能再开）。`,
        okText: '关闭并删除', onOk: () => {
          members.forEach(t => { const k = S.tabs.indexOf(t); if (k >= 0) S.tabs.splice(k, 1); });
          S.tabGroups = (S.tabGroups || []).filter(g => g !== grp);
          if (S.activeTab >= S.tabs.length) S.activeTab = S.tabs.length - 1;
          if (S.activeTab < 0) S.activeTab = 0;
          S.currentFile = (S.tabs[S.activeTab] || {}).f || null;
          save(true); renderTabs(); renderContent(); renderContext();
          toast('已关闭并删除这个标签组');
        }});
      break;
  }
  void x;
}
/// 设置：默认对话位置（§13.5）
/* ── §23.6.5 命令面板快捷键：设置里能看到、也能改（原型没有整页设置，放在 ⚙ 菜单的「快捷键」组）──
   键位格式与 Orca 的 keybinding 一致：`meta+j` / `meta+shift+j`（修饰键 + 最后一个实体键） */
const SHORTCUT_KEYS = { meta: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' };
function shortcutLabel(spec) {
  return String(spec || '').split('+').map(x => SHORTCUT_KEYS[x] || (x.length === 1 ? x.toUpperCase() : x)).join('');
}
/// 从一次按键里组装键位；**光一个字母不算**（那会抢走正常输入，和 Orca 的 recorder 一样要修饰键）
function shortcutFromEvent(e) {
  const k = String(e.key || '').toLowerCase();
  if (['meta', 'control', 'alt', 'shift'].includes(k)) return null;
  const parts = [];
  if (e.metaKey) parts.push('meta');
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  if (!parts.length) return null;
  parts.push(k === ' ' ? 'space' : k);
  return parts.join('+');
}
function shortcutMatches(spec, e) {
  const parts = String(spec || '').split('+').filter(Boolean);
  const wantKey = parts[parts.length - 1];
  if (!wantKey) return false;
  const got = String(e.key || '').toLowerCase();
  const keyOk = wantKey === 'space' ? got === ' ' : got === wantKey;
  return keyOk
    && !!e.metaKey === parts.includes('meta')
    && !!e.ctrlKey === parts.includes('ctrl')
    && !!e.altKey === parts.includes('alt')
    && !!e.shiftKey === parts.includes('shift');
}
let paletteShortcutArmed = false;
function armPaletteShortcut() {
  paletteShortcutArmed = true;
  toast('按下<b>新的快捷键</b>来打开命令面板（Esc 取消）');
}
function refreshPaletteShortcutLabel() {
  const el = $('#paletteKbd');
  if (el) el.textContent = shortcutLabel(S.paletteShortcut || 'meta+j');
}
function settingsAction(act, btn) {
  closeMenus();
  if (act === 'defLeft') { S.defaultLayout = 'left'; setLayout('left'); }
  else if (act === 'defCenter') { S.defaultLayout = 'center'; setLayout('center'); }
  else if (act === 'defRight') { S.defaultLayout = 'right'; setLayout('right'); }
  else if (act === 'policyQueue') { setSendPolicy('queue'); return; }
  else if (act === 'policyInterrupt') { setSendPolicy('interrupt'); return; }
  else if (act === 'paletteShortcut') { armPaletteShortcut(); return; }
  // §32 对话模式（原输入框 连续/临时 显示已删，控件收进设置）
  else if (act === 'convContinuous') { S.chatMode = 'continuous'; save(true); renderComposerControls(); toast('对话模式：<b>连续</b>'); return; }
  else if (act === 'convTemporary') { S.chatMode = 'temporary'; save(true); renderComposerControls(); toast('对话模式：<b>临时</b>'); return; }
  else if (act === 'monitor') { setMonitorMode(!monitorOpen); return; }
  // §24.10 示例数据
  else if (act === 'seedChat') { seedDemoChat(200); return; }
  else if (act === 'clearChat') { confirmModal({ title: '清空全部对话？',
      text: '示例数据和已有对话都会清掉（原型数据，刷新也回不来）。', okText: '清空',
      onOk: clearDemoChat }); return; }
  else if (act === 'resetHist') {
    const rel = histFile(); if (!rel) return;
    confirmModal({ title: '清空这个文件的全部历史？', text: rel, okText: '清空', onOk: () => {
      delete S.history[rel]; save(true); renderHistory(); renderHistoryBadge();
    }});
    return;
  }
  save();
  toast('默认对话位置已设为 ' + btn.textContent.trim() + '（下次进来用它）');
}
/// 历史开关（文件头那颗 + 工具栏那颗共用）
function toggleHistoryView() {
  if (!histFile()) { toast('先打开一个文件'); return; }
  // 历史是**项目/编辑区**这一侧的东西：点它就切回项目上下文
  //（对话模式下编辑区是藏的、临时卡下整块是空的 —— 不切的话这一下"看起来没反应"）
  if (!S.projectMode || S.tempMode) {
    S.projectMode = true; S.tempMode = false; S.activePlan = null; S.activeProjChat = null;
    save(); renderNav();
  }
  ensureTab(histFile());
  S.tab = S.tab === 'history' ? (extViewKind(relOfActiveTab()) === 'mind' ? 'mind' : extViewKind(relOfActiveTab() === 'file' ? 'x' : 'md')) : 'history';
  save(); renderNav(); renderTabs(); renderContent(); renderContext();
}

/* ============================================================
   绑定
   ============================================================ */
function bind() {
  // ⭐ **先绑这两颗**（2026-09-30 用户报「提交、恢复完全无效」）：
  // bind() 后面任何一行抛错，都会让排在它后面的绑定全部失效 —— 那就是"点了没反应"。
  // 所以提交/恢复放在最前，整段再套 try/catch：宁可别的功能残废，这两颗必须活着。
  try {
    $('#btnCommitGit').onclick = commitGit;
    $('#btnGitHist').onclick = e => {
      e.stopPropagation(); closeMenus(); openGitPanel(e.currentTarget);
    };
    // §35.9 文件头那颗「恢复」已删（与顶栏历史重复；历史面板里有「恢复到提交…」）
  } catch (e) { console.error('[bind] 提交/恢复 绑定失败', e); }


  try {
  $$('#modeChips .chip').forEach(c => c.onclick = () => {
    S.mode = c.dataset.mode; save();
    renderComposerControls();          // 必须重建右组 —— 三种模式右上角内容不同（§13.1）
    renderContext();
    toast(`${c.textContent}模式：右上角换成这一套按钮（连续/临时/新建不变，历史也不重建）`);
  });
  $$('#ccLeft .cc[data-conv]').forEach(c => c.onclick = () => {
    S.chatMode = c.dataset.conv; save(); renderComposerControls();
    toast(c.dataset.conv === 'temporary' ? '临时对话 —— 这一段不写进任何会话'
                                        : '连续对话 —— 接着这条会话往下聊');
  });
  // 「＋新建」按你选中的地方走（§17.4）—— 走的是**那一份** openConvAddMenu（§20.10.2）：
  //  · 选的是**项目里的对话卡** → scope = 那个项目（分组/新建都落在它下面）
  //  · 否则（默认区 / 默认卡）   → scope = 默认
  $('#ccNew').onclick = e => {
    e.stopPropagation();                    // 不挡住 document 的"点外面关菜单"
    const p = proj();
    if (S.activeProjChat && p) openConvAddMenu({ kind: 'project', project: p }, e.currentTarget);
    else openConvAddMenu({ kind: 'default' }, e.currentTarget);
  };
  // 左栏顶部快捷入口（保留你旧项目那排）
  $$('#navQuick button').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const q = b.dataset.q;
    if (q === 'settings') { $('#btnSettings').click(); }
    else if (q === 'history') toggleHistoryView();
    else if (q === 'add') openMenuAt('#menuAddProject', b);
    else if (q === 'roles') toast('角色：进入角色设置（落 SwiftUI 打开 设置 → 角色）');
    else if (q === 'record') toast('录音：进入录音页（落 SwiftUI 打开 设置 → 录音）');
    else if (q === 'monitor') setMonitorMode(!monitorOpen);   // §31 监控：再点一次退出
  });
  // 段头折叠（§22.4：整张**卡片**可点，不只是那行字）
  // 绑在 .nav-head 上，点卡片任意位置（含字、含留白）都算；＋ 自己 stopPropagation，不会串。
  const headOf = el => el && el.closest('.nav-head');
  headOf($('#btnProjSect')).onclick = e => {
    if (e.target.closest('.plus')) return;
    S.navOpen = !S.navOpen; save(); renderNav();
  };
  headOf($('#btnPlanSect')).onclick = e => {
    if (e.target.closest('.plus')) return;
    S.planOpen = S.planOpen === false; save(); renderNav();
  };

  const openMenuAt = (id, btn) => {
    const m = $(id);
    const wasOpen = !m.hidden;             // 下面的 closeMenus 会先关掉它，所以要**先记**
    closeMenus();                            // 互斥：不允许两个菜单同时开（§17.1）
    closeGitPanel();
    if (wasOpen) return;                     // 同一颗再点 = 关掉（否则永远关不上）
    const r = btn.getBoundingClientRect();
    // §35.11 静态菜单同样贴按钮上方（左栏两个＋在屏幕中上，上方放不下自动翻下）
    placeMenuAbove(m, r.left, r.top, r.bottom);
  };
  $('#btnAddProject').onclick = e => { e.stopPropagation(); openMenuAt('#menuAddProject', e.currentTarget); };
  $('#btnAddPlan').onclick = e => { e.stopPropagation(); openConvAddMenu({ kind: 'default' }, e.currentTarget); };
  $('#btnEmptyAdd').onclick = () => addMenuAction('newBlank');
  $('#btnEmptyPlan').onclick = e => { e.stopPropagation(); openConvAddMenu({ kind: 'default' }, e.currentTarget); };
  $('#btnEmptyFolder').onclick = () => addMenuAction('useFolder');
  $$('#menuAddProject button').forEach(b => b.onclick = () => addMenuAction(b.dataset.act));
  $$('#menuProj button').forEach(b => b.onclick = () => projMenuAction(b.dataset.act));
  $$('#menuTabs button').forEach(b => b.onclick = () => tabMenuAction(b.dataset.act));
  $$('#menuSettings button').forEach(b => b.onclick = () => settingsAction(b.dataset.act, b));
  // 点外面必须关掉选项面板（§16.3 那个 bug：点外面不隐藏、会叠出两个）
  document.addEventListener('click', e => {
    const op = $('#optPanel');
    if (op && !op.hidden && !e.target.closest('#optPanel') && !e.target.closest('#hcOptions')) {
      op.hidden = true;
      const h = $('#hcOptions'); if (h) h.classList.remove('is-on');
    }
  }, true);
  document.addEventListener('click', e => {
    if (!e.target.closest('.menu') && !e.target.closest('#btnAddProject') && !e.target.closest('#btnAddPlan')
        && !e.target.closest('.proj-more') && !e.target.closest('#btnSettings')
        && !e.target.closest('#btnTabsCollapse') && !e.target.closest('.pmore') && !e.target.closest('.gmore')) closeMenus();
    if (!e.target.closest('.focus-row')) $('#focusList').hidden = true;
    if (!e.target.closest('#optPanel') && !e.target.closest('#hcOptions')) {
      const op = $('#optPanel'); if (op) { op.hidden = true; $('#hcOptions')?.classList.remove('is-on'); }
    }
    if (!e.target.closest('#gitPanel') && !e.target.closest('#btnGitHist')
        && !e.target.closest('#btnCommitGit')) {
      const gp = document.getElementById('gitPanel'); if (gp) gp.hidden = true;
    }
    // §20.11.7：点面板外面就关掉搜索面板
    if (!e.target.closest('.nav-search-wrap')) openSearchPop(false);
  });

  // 页头右组：只有 角色 + 选项（音色在选项里，通话在顶栏固定格）
  $('#hcRole').onclick = () => toast('角色：这一段对话里它扮演的角色（照搬当前软件的角色清单）');
  const toggleOptPanel = () => {
    const p = $('#optPanel');
    p.hidden = !p.hidden;
    $('#hcOptions').classList.toggle('is-on', !p.hidden);
    if (!p.hidden) renderOptPanel();
  };
  $('#hcOptions').onclick = e => { e.stopPropagation(); toggleOptPanel(); };
  // 选项的第二种触发方式：**右键**（§17.3）
  $('#hcOptions').oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); toggleOptPanel(); };

  // 本软件风格的模态（§12.3：不许再用系统 prompt / confirm）
  $('#modalCancel').onclick = closeModal;
  $('#modalOk').onclick = () => {
    const v = $('#modalInput').value;
    const fn = modalOnOk;
    closeModal();
    if (fn) fn(v);
  };
  $('#modalBack').onclick = e => { if (e.target.id === 'modalBack') closeModal(); };
  $('#modalInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#modalOk').click(); }
    if (e.key === 'Escape') e.stopPropagation();
  });

  // §20.11：点输入框 → 下面弹出「范围 + 内容类型 + 结果」；打字 → 跑搜索 + 照旧过滤树
  $('#navSearch').addEventListener('focus', () => openSearchPop(true));
  $('#navSearch').oninput = () => {
    runSearch();
    filterTree($('#navSearch').value, S.searchScope);
  };
  $('#navSearch').onkeydown = e => { if (e.key === 'Escape') { openSearchPop(false); e.stopPropagation(); } };
  $$('#searchScopes button').forEach(b => b.onclick = e => {
    e.stopPropagation();
    S.searchScope = b.dataset.scope; save(true);
    renderSearchPop();
    filterTree($('#navSearch').value, S.searchScope);
  });
  $$('#searchTypes button').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const t = S.searchTypes || { folder: true, file: true, content: false };
    S.searchTypes = { ...t, [b.dataset.type]: !t[b.dataset.type] };   // 点中=开、再点=关
    save(true);
    renderSearchPop();
    filterTree($('#navSearch').value, S.searchScope);
  });

  // §22.9.5 ＋ 改成**下拉**（显示在按钮正下方）
  $('#btnNewTab').onclick = e => { e.stopPropagation(); openMenuAt('#menuNewTab', e.currentTarget); };
  $$('#menuNewTab button').forEach(b => b.onclick = () => newTabAction(b.dataset.act));
  // §23.9 关掉 = 关这张终端标签（终端已经是一等公民的标签，不再是浮在底上的面板）
  $('#termClose').onclick = () => {
    const active = S.tabs[S.activeTab];
    if (active && active.kind === 'terminal') { closeTab(S.activeTab); toast('已关掉终端标签'); return; }
    $('#termPanel').hidden = true;
  };
  // §23.9.2 面板自己也能拆 —— 不用非得去标签右键
  $('#termSplit').onclick = e => {
    e.stopPropagation();
    const t = S.tabs[S.activeTab];
    const cur = (t && t.kind === 'terminal' && t.term) ? t.term.split : null;
    showMenu([
      { label: (cur === 'right' ? '✓ ' : '') + '拆分终端向右', action: () => splitTerminal('right') },
      { label: (cur === 'down' ? '✓ ' : '') + '拆分终端向下', action: () => splitTerminal('down') },
    ], e.currentTarget);
  };
  // §22.11 快捷指令
  $('#qcRun').onclick = () => { const id = $('#qcRun').dataset.id; if (id) runQuickCommand(id); else openQuickCommandModal(null); };
  $('#qcPick').onclick = e => { e.stopPropagation(); openQuickCommandMenu(e.currentTarget); };
  $('#qcCancel').onclick = closeQuickCommandModal;
  $('#qcSave').onclick = saveQuickCommand;
  $('#qcBack').onclick = e => { if (e.target.id === 'qcBack') closeQuickCommandModal(); };
  $('#qcCmd').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveQuickCommand(); }
    if (e.key === 'Escape') e.stopPropagation();
  });
  $('#qcLabel').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#qcCmd').focus(); }
    if (e.key === 'Escape') e.stopPropagation(); });
  $$('#qcOp button').forEach(b => b.onclick = () => { if (qcDraft) { qcDraft.op = b.dataset.op; paintQcModal(); } });
  $$('#qcScope button').forEach(b => b.onclick = () => { if (qcDraft) { qcDraft.scope = b.dataset.scope; paintQcModal(); } });
  $('#qcAdvBtn').onclick = () => { const b = $('#qcAdvBody'); b.hidden = !b.hidden; };
  $('#qcProjBtn').onclick = e => {
    e.stopPropagation();                       // 不让 document 的"点外面关菜单"当场关掉刚开的那个
    if (!qcDraft) return;
    const names = realProjects().map(p => p.name);
    if (!names.length) { toast('还没有项目可选'); return; }
    showMenu(names.map(n => ({ label: n + (qcDraft.project === n ? '  ✓' : ''), action: () => {
      qcDraft.project = n; paintQcModal();
    } })).concat([{ sep: true }, { label: '（未选，对所有项目生效）', action: () => { qcDraft.project = ''; paintQcModal(); } }]),
      $('#qcProjBtn'));
  };
  renderQuickCommandBar();
  // §22.12 项目添加/编辑模态
  $('#pjCancel').onclick = () => { $('#projBack').hidden = true; };
  $('#pjOk').onclick = saveProjectModal;
  $('#projBack').onclick = e => { if (e.target.id === 'projBack') $('#projBack').hidden = true; };
  $('#pjPath').addEventListener('input', renderProjectFolders);
  $('#pjPath').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveProjectModal(); } if (e.key === 'Escape') e.stopPropagation(); });
  $('#pjName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveProjectModal(); } if (e.key === 'Escape') e.stopPropagation(); });
  $('#pjAddFolder').onclick = e => {
    e.stopPropagation();
    askModal({ title: '添加本地文件夹', text: '这个项目还会参考的其它文件夹（绝对路径；原型不弹系统选择器）',
      value: '/Users/mjm/Documents/SuperAgent/', okText: '添加', onOk: v => {
        const p2 = (v || '').trim(); if (!p2) return;
        if (!pjExtras.includes(p2)) pjExtras.push(p2);
        renderProjectFolders();
      }});
  };
  $('#wsSplitClose').onclick = () => { S.splitSide = null; S.splitIndex = undefined; save(true); renderContent(); toast('已退出拆分'); };
  // §22.14 浏览器 chrome
  $('#brUrl').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); navigateBrowser($('#brUrl').value); } });
  $('#brBack').onclick = () => toast('后退：原型只记录一次（真机走 webview.navigationHistory）');
  $('#brFwd').onclick = () => toast('前进：原型只记录一次（真机走 webview.navigationHistory）');
  $('#brReload').onclick = () => { const t = activeTabObj(); if (t && t.url) { const f = $('#brFrame'); f.dataset.src = ''; renderBrowser(); } };
  $('#brGrab').onclick = () => setBrMode('grab');
  $('#brNote').onclick = () => setBrMode('note');
  $('#brDraw').onclick = () => setBrMode('draw');
  $('#brImport').onclick = e => { e.stopPropagation(); openBrCookie(e.currentTarget); };
  $('#brMore').onclick = e => { e.stopPropagation(); openBrMore(e.currentTarget); };
  $('#brCode').onclick = () => toast('&lt;&gt; 开发者工具：真机走 `guest.openDevTools()`（reference/Orca …/browser-manager-viewport.ts:16）');
  $('#brExt').onclick = () => { const t = activeTabObj(); if (t && t.url) window.open(t.url, '_blank', 'noopener'); else toast('还没有网址'); };
  $('#btnPath').onclick = () => {
    const t = $('#fullPathLabel').textContent;
    if (t === '—') return;
    navigator.clipboard?.writeText(t);
    toast(`已复制完整路径 <b>${escapeHtml(t)}</b>`);
  };
  $('#btnEdit').onclick = () => {
    const rel = relOfActiveTab(); if (!rel) return;
    const kind = extViewKind(rel);
    if (kind === 'md') { S.mdVariant = 'edit'; S.tab = 'md'; }
    else if (kind === 'mind') { S.tab = 'mind'; }
    else { toast('这个文件在下方直接显示，原型里没有内置编辑器（落 SwiftUI 接文本编辑）'); return; }
    save(); renderContent();
    if (kind === 'md') focusEditorAtLine(0);
  };
  $('#btnFinder').onclick = () => toast(`在访达中显示 <b>${escapeHtml($('#fullPathLabel').textContent)}</b>（原型不落地）`);

  $('#btnFs').onclick = toggleFullscreen;
  $('#btnFs2').onclick = toggleEditorFull;   // §35.18 编辑区全屏（非系统全屏）
  $('#btnFsExit').onclick = toggleFullscreen;
  $('#btnLayout').onclick = cycleLayout;
  // ⭐ 编辑区开关（一个按钮带滑块，点一下开、点一下关）—— 放顶栏最左
  $('#editorSwitch').onclick = () => {
    if (!S.projectMode) {
      if (typeof finderOpen !== 'undefined' && finderOpen) setFinderOpen(false);   // §37.8 编辑区⇄访达互斥
      if (!realProjects().length) { addMenuAction('newBlank'); return; }
      S.projectMode = true; S.tempMode = false;
      save(); renderNav(); renderContent(); renderContext();
      toast('编辑区已开 —— 左 文件夹 ｜ 中 编辑 ｜ 右 对话');
    } else {
      S.projectMode = false;
      save(); renderNav(); renderContent(); renderContext();
      toast('编辑区已关 —— 只剩 左栏 + 对话（就是临时模式）');
    }
  };
  $('#btnCallFixed').onclick = () => {
    const m = S.mode === 'imageText' ? '图文' : S.mode === 'voice' ? '语音' : '视频';
    toast(`通话 = 当前<b>${m}</b>模式的通话（§35.8：在模式条「视频」右侧，带分隔线）`);
  };

  // md 工具栏
  $$('#mdBar .md-tools button').forEach(b => b.onclick = () => mdInsert(b.dataset.md));
  $$('#viewModes .vm').forEach(b => b.onclick = () => {
    const vm = b.dataset.vm;
    previewEditSession = false; clearTimeout(previewIdleTimer);
    if (vm === 'edit') S.mdVariant = 'edit';
    else S.mdVariant = 'preview';
    if (S.tab === 'mind') { S.tab = 'md'; }
    save(); renderContent();
    if (vm === 'edit') focusEditorAtLine(0);
  });
  // 「分栏」由 ⌥ 点预览按钮切换：这里用双击预览模式切 split
  $('#viewModes').addEventListener('dblclick', () => {
    S.mdVariant = S.mdVariant === 'split' ? 'preview' : 'split';
    save(); renderContent();
  });

  $('#mdSource').addEventListener('input', onMdEdit);
  $('#mdPreview').addEventListener('click', onPreviewClick);
  $('#mdSource').addEventListener('keydown', e => { if (e.key === 'Escape') leavePreviewEditSession(true); });
  $('#mindSource').addEventListener('input', () => {
    proj().files[MIND_FILE] = $('#mindSource').value; save();
    clearTimeout(window.__mindT);
    window.__mindT = setTimeout(() => { pushHistory(MIND_FILE, '手改', $('#mindSource').value, '脑图源码编辑'); renderMind(); }, 700);
  });
  $('#btnFoldCode').onclick = toggleCodeFold;
  $('#btnFit').onclick = () => {
    const wrap = $('#mindCanvas'), svg = wrap.querySelector('svg'); if (!svg) return;
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const k = Math.min(1, (wrap.clientWidth - 16) / vb[2], (wrap.clientHeight - 16) / vb[3]);
    S.mindZoom = Math.max(0.3, k); save(); renderMind();
    toast(`已适应窗口 · ${Math.round(S.mindZoom * 100)}%`);
  };

  const hg = $('#btnHistRestoreGit');
  if (hg) hg.onclick = e => { e.stopPropagation(); closeMenus(); openGitPanel(e.currentTarget, true); };
  $('#btnHistClear').onclick = () => {
    const rel = histFile(); if (!rel) return;
    confirmModal({ title: '清空这个文件的全部历史？', text: rel, okText: '清空', onOk: () => {
      delete S.history[rel]; save(true); renderHistory(); renderHistoryBadge();
    }});
  };
  $('#btnHistBack').onclick = () => {
    const kind = extViewKind(relOfActiveTab() || '');
    S.tab = kind === 'mind' ? 'mind' : kind === 'file' ? 'file' : 'md';
    save(); renderContent();
  };
  $('#btnHistoryHead').onclick = toggleHistoryView;   // 文件头那颗常驻的（§13.6 / §20.2：工具栏那颗已删）
  $('#btnTabsCollapse').onclick = e => { e.stopPropagation(); openTabsPopover(); };
  // §21.2 最左那颗：横向 ⇄ 垂直
  $('#btnTabsLayout').onclick = e => { e.stopPropagation(); toggleTabsLayout(); };
  // §21.3 垂直形态里的搜索 / 新建
  $('#tvSearch').oninput = () => renderTabsVertical();
  $('#tvNew').onclick = e => { e.stopPropagation(); $('#navSearch').focus();
    toast('用左栏顶部的搜索找文件，点它开新标签'); };
  // §22.1.2 拖标签列宽（只改原点不动窗口，和 .split 手柄同一套手感）
  dragSplit($('#tvGutter'), e => {
    const ws = $('#workspace').getBoundingClientRect();
    const w = Math.max(170, Math.min(460, e.clientX - ws.left));
    S.tvWidth = Math.round(w);
    $('#workspace').style.setProperty('--tv-w', S.tvWidth + 'px');
  });
  window.addEventListener('resize', () => { if (S.tabsVertical) applyTabsLayout(); });
  $('#btnSettings').onclick = e => {
    e.stopPropagation();
    const m = $('#menuSettings');
    const wasOpen = !m.hidden;             // 同上：先记再关
    closeMenus();
    if (wasOpen) return;
    const r = e.currentTarget.getBoundingClientRect();
    m.hidden = false;
    // §32 打开即标当前项：对话模式两颗 + 发送方式两颗（renderSendPolicy 会刷菜单里的高亮）
    $$('#menuSettings [data-act="convContinuous"],#menuSettings [data-act="convTemporary"]')
      .forEach(b => b.classList.toggle('is-on',
        (b.dataset.act === 'convTemporary') === (S.chatMode === 'temporary')));
    renderSendPolicy();
    m.style.left = Math.max(8, Math.min(r.left - 120, innerWidth - 220)) + 'px';
    m.style.top = (r.bottom + 6) + 'px';
    m.querySelector('[data-act="defLeft"]').classList.toggle('is-on', S.defaultLayout === 'left');
    m.querySelector('[data-act="defCenter"]').classList.toggle('is-on', S.defaultLayout === 'center');
    m.querySelector('[data-act="defRight"]').classList.toggle('is-on', S.defaultLayout === 'right');
    // §22.13.3 发送方式也在设置里能选
    m.querySelector('[data-act="policyQueue"]').classList.toggle('is-on', (S.sendPolicy || 'queue') === 'queue');
    m.querySelector('[data-act="policyInterrupt"]').classList.toggle('is-on', S.sendPolicy === 'interrupt');
  };

/* ══════════════════════════════════════════════════════════════
   §35.14–16 录音按钮（原右下角发送位）
   点击=开始：圆点动画（真实麦克风音量驱动——说话起伏、不说话静止）
             + 录音计时 + 流式实时转写进输入框（SpeechRecognition；
             环境不可用 → 降级演示流式并说明）
   再点=停止保留转写；Esc=取消清空（恢复到按下时的内容）
   ══════════════════════════════════════════════════════════════ */
const recState = {
  on: false, gen: 0, t0: 0, timer: null, raf: null,
  stream: null, actx: null, analyser: null,
  sr: null, srRestart: false, base: '', typedTimer: null, fallbackShown: false,
};
function recFormat(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function recWaveDots() {
  const wave = $('#recWave'); if (!wave) return;
  wave.innerHTML = Array.from({ length: 32 }, () => '<i></i>').join('');
}
function startRecording() {
  const ta = $('#chatInput'), btn = $('#btnRec'), strip = $('#recStrip');
  if (!ta || !btn || recState.on) return;
  recState.on = true; recState.gen++;
  const gen = recState.gen;
  recState.base = ta.value;
  recState.t0 = now();
  btn.classList.add('rec-on'); btn.textContent = '⏹'; btn.title = '停止并保留转写（Esc 取消）';
  strip.hidden = false;
  recWaveDots();
  $('#recWave').classList.remove('live');
  $('#recTimer').textContent = '00:00';
  recState.timer = setInterval(() => {
    if (!recState.on || recState.gen !== gen) return;
    const el = $('#recTimer'); if (el) el.textContent = recFormat(now() - recState.t0);
  }, 250);

  // ① 真实音量驱动动画：说话起伏、不说话回落静止
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    if (recState.gen !== gen) { stream.getTracks().forEach(t => t.stop()); return; }
    recState.stream = stream;
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    recState.actx = actx;
    const src = actx.createMediaStreamSource(stream);
    const analyser = actx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    recState.analyser = analyser;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const dots = () => $$('#recWave i');
    let slow = 0;
    const loop = () => {
      if (!recState.on || recState.gen !== gen) return;
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
      const live = peak > 0.04;
      slow = live ? Math.min(1, slow + 0.35) : Math.max(0, slow - 0.12);   // 平滑：停口后动画渐停
      $('#recWave')?.classList.toggle('live', slow > 0.12);
      const ds = dots();
      for (let i = 0; i < ds.length; i++) {
        const center = 1 - Math.abs(i - ds.length / 2) / (ds.length / 2);  // 中间亮两端渐隐（图6）
        const jitter = 0.55 + 0.45 * Math.abs(Math.sin((i * 1.7) + now() / 90));
        const sc = 1 + slow * jitter * center * 2.6;
        ds[i].style.transform = `scaleY(${sc.toFixed(2)})`;
      }
      recState.raf = requestAnimationFrame(loop);
    };
    loop();
  }).catch(() => { /* 无麦克风权限：动画保持静止，计时与转写照走 */ });

  // ② 流式转写：能用真识别就真，不行降级演示流式
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    try {
      const sr = new SR();
      recState.sr = sr; recState.srRestart = true;
      sr.lang = 'zh-CN'; sr.continuous = true; sr.interimResults = true;
      sr.onresult = e => {
        if (recState.gen !== gen) return;
        let heard = '';
        for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
        ta.value = recState.base + heard;
      };
      sr.onerror = ev => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          recState.srRestart = false; recFallbackTranscribe(gen, ta);
        }
        // network / no-speech → 等 onend 再重启，连不上再降级
      };
      sr.onend = () => {
        if (recState.gen !== gen || !recState.on) return;
        if (recState.srRestart) { try { sr.start(); return; } catch (e) { /* fallthrough */ } }
        recFallbackTranscribe(gen, ta);
      };
      sr.start();
      return;
    } catch (e) { /* 掉到降级 */ }
  }
  recFallbackTranscribe(gen, ta);
}
/// 降级：浏览器识别不可用 → 把一句演示文本**逐字流式**吐进输入框（并说明是演示）
function recFallbackTranscribe(gen, ta) {
  if (recState.typedTimer || recState.gen !== gen) return;
  if (!recState.fallbackShown) {
    recState.fallbackShown = true;
    toast('当前浏览器实时语音识别不可用 —— 转写按<b>演示流式</b>吐字（动画与计时仍是真实麦克风驱动）');
  }
  const text = '（演示转写）这是一段实时显示在输入框里的文字，停止录音后会保留，Esc 会取消。';
  let i = 0;
  recState.typedTimer = setInterval(() => {
    if (recState.gen !== gen || !recState.on || i >= text.length) {
      clearInterval(recState.typedTimer); recState.typedTimer = null; return;
    }
    ta.value = recState.base + text.slice(0, ++i);
  }, 90);
}
function stopRecording(cancel) {
  if (!recState.on) return;
  recState.on = false; recState.gen++;
  clearInterval(recState.timer); recState.timer = null;
  clearInterval(recState.typedTimer); recState.typedTimer = null;
  if (recState.raf) cancelAnimationFrame(recState.raf);
  recState.raf = null;
  recState.srRestart = false;
  try { recState.sr && recState.sr.stop(); } catch (e) { /* 已停 */ }
  recState.sr = null;
  if (recState.stream) { recState.stream.getTracks().forEach(t => t.stop()); recState.stream = null; }
  if (recState.actx) { try { recState.actx.close(); } catch (e) { /* 已关 */ } recState.actx = null; }
  recState.analyser = null;
  const ta = $('#chatInput');
  if (cancel && ta) ta.value = recState.base;              // Esc 取消：恢复按下时的内容
  const btn = $('#btnRec');
  if (btn) { btn.classList.remove('rec-on'); btn.textContent = '⏺'; btn.title = '录音（Esc 取消）'; }
  const strip = $('#recStrip'); if (strip) strip.hidden = true;
  if (!cancel && ta && ta.value !== recState.base) toast('已停止录音 —— 转写留在输入框里，回车即发送');
}
/* §35.14 绑定：原右下角发送位（元素 HTML 已换成 #btnRec） */
$('#btnRec').onclick = () => (recState.on ? stopRecording(false) : startRecording());


  // §22.13 排队 ⇄ 打断 + 队列徽标
  $$('#qRow .q-opt').forEach(b => b.onclick = e => { e.stopPropagation(); setSendPolicy(b.dataset.policy); });
  // §23.2 单屏 ⇄ 双屏（在 连续/临时 左边）
  $('#ccScreen').onclick = e => { e.stopPropagation(); toggleDualScreen(); };
  $('#qBadge').onclick = e => { e.stopPropagation(); openQueueMenu(e.currentTarget); };
  renderSendPolicy();
  // §21.5.6/8 展开 ⇄ 收起：点**输入框顶边那条手柄**（旧的 ⤢ 是死按钮，连同那行说明一起删了）
  const applyComposerExpand = () => $('#composer').classList.toggle('is-expanded', !!S.composerExpanded);
  applyComposerExpand();
  const toggleComposerExpand = () => {
    S.composerExpanded = !S.composerExpanded;
    save(true); applyComposerExpand();
    const ta = $('#chatInput');
    if (S.composerExpanded) ta.focus();
    toast(S.composerExpanded ? '输入框已展开' : '输入框已收起');
  };
  $('#composerGrip').onclick = toggleComposerExpand;
  $('#composerGrip').onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleComposerExpand(); }
  };
  $('#chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });

  dragSplit($('#vSplit'), e => {
    // §34 按下零跳变的唯一正确锚点 = **nav 自己的左缘**（不是 main.left）：
    // main.left 只有在 nav 是第一个可见元素时才等于 nav.left —— 自动化面板开着、
    // 或对话·左布局时都会把宽度多算进去 → 按下瞬间线向右跳（用户报的现象）。
    // nav 在所有布局里都紧贴 vSplit 左侧，所以 宽 = 光标 − 半缝 − nav.left 恒成立。
    const nav = $('#navPane'), split = $('#vSplit');
    if (!nav || !split) return;
    const n = nav.getBoundingClientRect();
    const half = (split.offsetWidth || 16) / 2;
    const w = Math.max(170, Math.min(innerWidth * 0.42, e.clientX - half - n.left));
    document.documentElement.style.setProperty('--nav-w', w + 'px');
  });
  dragSplit($('#hSplit'), e => {
    // §34 对话区可能在线的**任意一侧**（对话·右=右侧 / 对话·中·左=左侧），
    // 必须先判方向再算宽。老代码用 body.right 当基准：右边还站着右 rail（~36px），
    // 恒偏 36+8=44px → 按下瞬间线向左跳（用户报的现象）。
    const chat = document.querySelector('.chat'), split = $('#hSplit');
    if (!chat || !split) return;
    const c = chat.getBoundingClientRect(), s = split.getBoundingClientRect();
    const half = (split.offsetWidth || 16) / 2;
    const chatOnLeft = c.right <= s.left + 1;
    // 上限必须等于 CSS 的 max-width:52vw（§32 给 nav 对齐 42vw 的同一先例）：
    // 曾经这里写 0.5，比 CSS 的 0.52 紧 8px —— 拖到 50vw 线就停住，且若当前已 >50vw
    // 按下那一秒会被夹回去 = 又是一种「按下跳变」。
    const w = Math.max(250, Math.min(innerWidth * 0.52,
      chatOnLeft ? e.clientX - half - c.left : c.right - e.clientX - half));
    document.documentElement.style.setProperty('--chat-w', w + 'px');
  });
  // 源码 ｜ 预览 中间那条也能拖（§12.7：笔记这块之前调不了）
  dragSplit($('#mdGutter'), e => {
    const box = $('#mdSplit').getBoundingClientRect();
    const half = ($('#mdGutter')?.offsetWidth || 7) / 2;
    const w = Math.max(160, Math.min(box.width - 180, e.clientX - box.left - half));
    document.documentElement.style.setProperty('--md-src-w', w + 'px');
  });

  document.addEventListener('keydown', e => {
    const meta = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      if (recState.on) { stopRecording(true); return; }   // §35.16 录音中 Esc=取消（清转写）
      if (previewEditSession) { leavePreviewEditSession(true); return; }
      if ($('.app').classList.contains('fs')) { toggleFullscreen(); return; }
    }
    if (meta && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFullscreen(); }
    if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
  });
  // §23 左右 rail / 面板 / ⌘J —— 函数定义在文件后面，靠 function 声明提升，这里调得到
  try { bindRails(); }
  catch (e) { console.error('[bind] rail/面板绑定失败：', e); }

  } catch (e) {
    console.error('[bind] 后半段出错（提交/恢复已在最前面保底绑定）：', e);
    toast('部分控件没绑上：' + e.message);
  }
}

/// 提交 = 一个**可恢复的快照**：第几次 + 时间 + 改了哪些文件 + 整份内容（§16.1）
function commitGit() {
 try {
  const p = proj(); if (!p) { toast('还没有项目可提交'); return; }
  const id = Math.random().toString(16).slice(2, 9);
  const files = JSON.parse(JSON.stringify(p.files));
  const seq = (S.gitLog[0] && S.gitLog[0].seq ? S.gitLog[0].seq : S.gitLog.length) + 1;
  S.gitLog.unshift({ id, seq, ts: now(), projectId: p.id, name: p.name, path: p.path,
                     files, count: Object.keys(files).length });
  if (S.gitLog.length > 30) S.gitLog.pop();
  save(true); renderNav();
  // 提交完**直接把记录摊开** —— 你说点提交却看不到时间
  const btn = $('#btnCommitGit');
  openGitPanel(btn, true);
  toast(`已提交 第 <b>${seq}</b> 次 · ${fmtTime(now())}`);
 } catch (e) {
   console.error('[提交失败]', e);
   toast('⚠️ 提交失败：' + e.message);
 }
}

/// 行级 diff（红 = 上一版的行，绿 = 这一版的行）
function lineDiff(oldText, newText) {
  const cap = 400;
  const a = String(oldText ?? '').split('\n').slice(0, cap);
  const b = String(newText ?? '').split('\n').slice(0, cap);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ t: '=', s: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: '-', s: a[i] }); i++; }
    else { out.push({ t: '+', s: b[j] }); j++; }
  }
  while (i < m) out.push({ t: '-', s: a[i++] });
  while (j < n) out.push({ t: '+', s: b[j++] });
  return out;
}
/// 这一次提交**改了哪些文件**（相对上一次；首次 = 全部算新增）
function changedFilesOf(index) {
  const g = S.gitLog[index];
  const prev = S.gitLog[index + 1];
  if (!g || typeof g.files !== 'object' || g.files === null) return [];
  const keys = Object.keys(g.files);
  if (!prev) return keys.map(k => ({ file: k, kind: 'new', diff: lineDiff('', g.files[k]) }));
  return keys.filter(k => prev.files[k] !== g.files[k])
    .map(k => ({ file: k, kind: k in prev.files ? 'edit' : 'new',
                 diff: lineDiff(prev.files[k] ?? '', g.files[k]) }));
}
function diffStat(diff) {
  let add = 0, del = 0;
  diff.forEach(l => { if (l.t === '+') add++; else if (l.t === '-') del++; });
  return { add, del };
}

/// 提交记录面板（§16.1 卡片化 + §16.2 排版重心在时间与文件数）
function openGitPanel(anchor, force) {
 try {
  let el = document.getElementById('gitPanel');
  if (!el) { el = document.createElement('div'); el.className = 'git-panel'; el.id = 'gitPanel'; document.body.appendChild(el); }
  if (!force && !el.hidden) { el.hidden = true; return; }
  const rows = S.gitLog.length ? S.gitLog.map((g, i) => {
    const seq = g.seq || (S.gitLog.length - i);
    const changed = changedFilesOf(i);
    const files = changed.map(c => {
      const st = diffStat(c.diff);
      return `<button class="gc-file" data-i="${i}" data-f="${escapeHtml(c.file)}" title="点开看改了哪几行">
        <span class="gf-n">${escapeHtml(c.file.split('/').pop())}</span>
        <span class="gf-add">+${st.add}</span><span class="gf-del">−${st.del}</span></button>`;
    }).join('');
    return `
    <div class="git-card" data-i="${i}">
      <div class="gc-top">
        <b>第 ${seq} 次</b>
        <span class="gc-time">${fmtTime(g.ts)}</span>
        <span class="gc-count">${changed.length ? `改了 ${changed.length} 个文件` : `快照 ${g.count} 个文件`}</span>
      </div>
      <div class="gc-id"><code>${g.id}</code>
        <button class="gc-copy" data-copy="${g.id}" title="复制 ID">⧉ 复制</button></div>
      <div class="gc-files">${files || '<span class="gf-none">与上一版内容相同</span>'}</div>
      <div class="gc-diff" hidden></div>
      <div class="gc-acts">
        <button data-a="file" data-i="${i}">恢复文件</button>
        <button data-a="proj" data-i="${i}">恢复整个项目</button>
      </div>
    </div>`;
  }).join('') : '<div class="git-empty">还没有提交 —— 点「提交」存一版（存完这里就列出来）。</div>';

  el.innerHTML = `
    <div class="git-head">提交记录 · 恢复<button class="git-x" id="gitX">✕</button></div>
    <div class="git-hint">每张卡片：<b>第几次 · 时间 · 改了几个文件</b>（重点），
      ID 只是给你复制用的。点文件看<b>红绿 diff</b>（绿=这一版，红=上一版）。
      小改 → 恢复文件；改了代码要整体回退 → 恢复整个项目。</div>
    <div class="git-list">${rows}</div>`;

  $('#gitX').onclick = () => { el.hidden = true; };
  $$('.gc-copy', el).forEach(b => b.onclick = () => {
    navigator.clipboard?.writeText(b.dataset.copy);
    toast(`已复制 ID <b>${b.dataset.copy}</b>`);
  });
  // 点文件 → 展开红绿 diff + 可一键在左侧定位
  $$('.gc-file', el).forEach(b => b.onclick = () => {
    const card = b.closest('.git-card');
    const pane = card.querySelector('.gc-diff');
    if (!pane.hidden && pane.dataset.f === b.dataset.f) { pane.hidden = true; return; }
    const i = +b.dataset.i, file = b.dataset.f;
    const changed = changedFilesOf(i).find(c => c.file === file);
    if (!changed) { pane.hidden = false; pane.innerHTML = '（这个文件在这一版没有变化）'; return; }
    const lines = changed.diff.slice(0, 300).map(l =>
      `<div class="dl ${l.t === '+' ? 'add' : l.t === '-' ? 'del' : 'ctx'}">` +
      `<span class="dl-t">${l.t === '+' ? '+' : l.t === '-' ? '−' : ' '}</span>` +
      `<span class="dl-s">${escapeHtml(l.s) || ' '}</span></div>`).join('');
    pane.dataset.f = file;
    pane.hidden = false;
    pane.innerHTML = `<div class="dl-head">
        <span class="dl-file">${escapeHtml(file)}</span>
        <button class="dl-loc" data-loc="${escapeHtml(file)}">在左侧定位</button>
        <button class="dl-close">收起</button>
      </div>${lines}` +
      (changed.diff.length > 300 ? '<div class="dl-more">（只显示前 300 行）</div>' : '');
    pane.querySelector('.dl-close').onclick = () => { pane.hidden = true; };
    pane.querySelector('.dl-loc').onclick = () => { locateFileInTree(file); };
  });
  // 恢复
  $$('.gc-acts button', el).forEach(b => b.onclick = () => {
    const g = S.gitLog[+b.dataset.i]; if (!g) return;
    const p = S.projects.find(x => x.id === g.projectId) || proj();
    if (!p) { toast('这个项目已经不在了'); return; }
    if (b.dataset.a === 'proj') {
      p.files = JSON.parse(JSON.stringify(g.files));
      const rel = relOfActiveTab();
      if (rel && rel in p.files) pushHistory(rel, '恢复', p.files[rel], `恢复整个项目到 ${g.id}`, true);
      save(true); renderNav(); renderContent();
      el.hidden = true;
      toast(`已把整个项目恢复到 <b>第 ${g.seq || '?'} 次</b>（${fmtTime(g.ts)}）`);
    } else {
      const rel = relOfActiveTab();
      if (!rel || !(rel in g.files)) { toast('当前文件不在这一版里 —— 先点开它，或用「恢复整个项目」'); return; }
      p.files[rel] = g.files[rel];
      pushHistory(rel, '恢复', g.files[rel], `恢复到提交 ${g.id}`, true);
      save(true); renderNav(); renderContent();
      el.hidden = true;
      toast(`已把 <b>${rel}</b> 恢复到 <b>${g.id}</b>（${fmtTime(g.ts)}）`);
    }
  });
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    el.hidden = false;
    el.style.left = Math.max(8, Math.min(r.left - 340, innerWidth - 440)) + 'px';
    el.style.top = (r.bottom + 6) + 'px';
  } else {
    el.hidden = false;
  }
 } catch (e) {
   console.error('[恢复面板失败]', e);
   toast('⚠️ 恢复面板打不开：' + e.message);
 }
}

function renderModes() {
  $$('#modeChips .chip').forEach(c => c.classList.toggle('is-on', c.dataset.mode === S.mode));
  // §21.5.5 输入框里那行「回车发送…」说明连同 ⤢ 一起删了 —— 这里不再写任何东西
}

/// ⭐ 输入框上方那一行（§13.1 完全照搬）：**左组恒定、右组随模式变**。
/// 这就是他说的"图文右上角跟语音不一样、语音跟视频不一样" —— 三种模式各一套右组。

/// §20.5：语速的档位与它的展开菜单（原项目有，之前只复现了按钮位置）
const SPEECH_RATES = [0.75, 1, 1.25, 1.5, 2];
const rateLabelOf = v => `${v}×`;
/// §26 key='speechRate2' 时改的是**右侧独立会话**的语速（两个会话各管各的）
function openRateMenu(anchor, key = 'speechRate') {
  const m = $('#menuRate');
  const wasOpen = !m.hidden;              // 关掉别人的菜单会顺手关掉自己 —— 先记再关，否则永远关不上
  closeMenus();
  closeGitPanel();
  if (wasOpen) return;
  const cur = S[key] || 1;
  const isSecond = key === 'speechRate2';
  m.innerHTML = `<div class="menu-title">语速${isSecond ? ' · 右侧独立会话' : ''}</div>`
    + SPEECH_RATES.map(v => `<button data-rate="${v}"${cur === v ? ' class="is-on"' : ''}>`
        + `${cur === v ? '✓ ' : ''}${rateLabelOf(v)}</button>`).join('');
  $$('button', m).forEach(b => b.onclick = () => {
    S[key] = parseFloat(b.dataset.rate);
    save(true);
    closeMenus();
    if (!isSecond) renderComposerControls();
    else { const rb = $('#chatSecond [data-rate2]'); if (rb) rb.textContent = S[key] === 1 ? '语速' : `语速 ${rateLabelOf(S[key])}`; }
    toast(`语速已设为 <b>${rateLabelOf(S[key])}</b>${isSecond ? '（右侧独立）' : ''}`);
  });
  const r = anchor.getBoundingClientRect();
  // §22.2：**弹在按钮上方**（下方会被按钮自己挡住）
  placeMenuAbove(m, r.left, r.top);
}

function renderComposerControls() {
  // 左组：连续 ｜ 临时 ｜ ＋新建（连续=绿，临时=琥珀；与当前软件同一套极简竖线）
  $$('#ccLeft .cc[data-conv]').forEach(b => {
    const on = (b.dataset.conv === 'temporary') === (S.chatMode === 'temporary');
    b.classList.toggle('is-on', on);
    b.classList.toggle('temp', on && b.dataset.conv === 'temporary');
  });

  // 右组：按模式给（屏幕只在临时对话下出现 —— 与 NotchHomeView 同一条规则）
  // §20.4：**三种模式都没有「角色」** —— 原项目的那一行右组是 新建·屏幕·声音·语速，
  //         角色的入口在对话窗页头的 👤 角色，不在这里。
  const conv = S.chatMode;
  const right = $('#ccRight');
  const item = (label, on = false) =>
    `<button class="cc${on ? ' is-on' : ''}" data-right="${label}">${label}</button><i class="vr"></i>`;
  // §20.5：语速是**多档**，按钮文案在非默认档时带上当前档
  const rateText = S.speechRate === 1 ? '语速' : `语速 ${rateLabelOf(S.speechRate)}`;
  const rateBtn = `<button class="cc" data-rate-btn="1">${rateText}</button><i class="vr"></i>`;
  let html = '';
  if (S.mode === 'imageText') {
    if (conv === 'temporary') html += item('屏幕', true);
    html += item('声音', true) + rateBtn;
  } else if (S.mode === 'voice') {
    html += item('声音', true) + rateBtn;
  } else {                          // video
    html += item('摄像', true) + item('屏幕', true) + rateBtn;
  }
  right.innerHTML = html.replace(/<i class="vr"><\/i>$/, '');
  $$('#ccRight .cc').forEach(b => {
    if (b.dataset.rateBtn) { b.onclick = e => { e.stopPropagation(); openRateMenu(b); }; return; }
    b.onclick = () => {
      b.classList.toggle('is-on');
      toast(`${b.textContent}：${b.classList.contains('is-on') ? '开' : '关'}（原型只记状态）`);
    };
  });

  // §21.5.2 这一行左边 = **当前模式**（连续/临时那两颗按钮就在同一行右侧，再写一遍是重复）
  const modeLabel = $('#composerModeLabel');   // §32 模式显示已从输入框删除（进设置菜单），留守卫防空引用
  if (modeLabel) modeLabel.textContent =
    S.mode === 'imageText' ? '图文' : S.mode === 'voice' ? '语音' : '视频';
  // 选项面板开着时，切模式要跟着换内容（音色/模型那一层是按模式给的）
  const op = $('#optPanel');
  if (op && !op.hidden) renderOptPanel();
  renderModes();
}
/// 旧名字保留：所有调用点（切模式 / 选卡 / 进项目）都走同一处
function renderChatModes() { renderComposerControls(); }

/* ── 启动：骨架先出、内容后到 ───────────────── */
function boot() {
  // §24.11.4 首屏必须自带数据 —— 用户：「你说你提供了，但是我没有看到任何的数据」。
  // 只有 1 条（出厂那条系统消息）时自动造 80 条；⚙ 里仍可手动加 200 / 清空。
  if ((S.chat || []).length <= 1) { try { seedDemoChat(50, true); } catch (e) {} }   // 80→50：「太密」
  try { applyDualScreen(); } catch (e) {}   // §26 刷新后恢复双屏状态
  try { applyUiStyle(); } catch (e) {}       // §28 刷新后恢复风格
  const t0 = performance.now();
  const app = $('.app');
  app.classList.add('is-booting');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const tSkeleton = Math.round(performance.now() - t0);
    bind(); renderAll(); applyTabsLayout();
    $('#main').classList.toggle('center-layout', S.layout === 'center');
    $('#main').classList.toggle('left-layout', S.layout === 'left');
    if (!S.chat.length) {
      S.chat.push({ role:'sys', ts: now(),
        html: `已进入<b>全功能</b>：左栏是项目（不加项目就是「临时对话」），中间正文，右边对话。`
            + (proj() ? `当前项目 <code>${proj().path}</code>` : ''),
        meta: '' });
      save(); renderChat();
    }
    requestAnimationFrame(() => {
      const tDone = Math.round(performance.now() - t0);
      app.classList.remove('is-booting');
    });
  }));
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();


/* ============================================================
   §22.11 快捷指令 —— 一个按钮替换一行动作（终端 / 智能体 + 范围）
   ============================================================ */
let qcEditing = null;          // 正在编辑的那条（null = 新建）
let qcDraft = null;            // { label, op, cmd, append, scope, project }

function quickCommandsVisible() {
  const pname = (proj() || {}).name || '';
  return (S.quickCommands || []).filter(c => c.scope !== 'project' || !c.project || c.project === pname);
}
function renderQuickCommandBar() {
  const list = quickCommandsVisible();
  const cur = list.find(c => c.id === S.quickCommandActive) || list[0];
  const name = $('#qcName'), run = $('#qcRun'), split = $('#qcSplit');
  if (!name) return;
  split.hidden = list.length === 0 && !(S.quickCommands || []).length;
  if (!cur) { name.textContent = '新建快捷指令'; run.title = '点右边 ⌄ 新建一条'; run.dataset.id = ''; return; }
  S.quickCommandActive = cur.id;
  name.textContent = cur.label;
  run.title = `执行「${cur.label}」（${cur.op === 'agent' ? '智能体' : '终端'}）`;
  run.dataset.id = cur.id;
}
function openQuickCommandMenu(anchor) {
  closeMenus();
  const m = $('#menuQc');
  const list = quickCommandsVisible();
  m.innerHTML = (list.length
    ? list.map(c => `<button data-run="${c.id}">▶ ${escapeHtml(c.label)}<span class="mi-sub">${c.op === 'agent' ? '智能体' : '终端'}</span></button>`).join('')
    : `<div class="menu-title">还没有快捷指令</div>`)
    + `<div class="menu-sep"></div>
       <button data-new="1">＋ 新建快捷指令…</button>`;
  $$('#menuQc button').forEach(b => b.onclick = e => {
    e.stopPropagation(); closeMenus();
    if (b.dataset.new) { openQuickCommandModal(null); return; }
    runQuickCommand(b.dataset.run);
  });
  m.hidden = false;
  placeMenu(m, anchor.getBoundingClientRect().left - 60, anchor.getBoundingClientRect().bottom + 6);
}
function openQuickCommandModal(cmd) {
  qcEditing = cmd;
  qcDraft = cmd ? { ...cmd } : { label: '', op: 'terminal', agent: 'claude', cmd: '',
                                 append: true, scope: 'global', project: '' };
  if (!qcDraft.agent) qcDraft.agent = 'claude';
  $('#qcLabel').value = qcDraft.label;
  $('#qcCmd').value = qcDraft.cmd;
  $('#qcAppend').checked = qcDraft.append !== false;
  $('#qcAgent').value = qcDraft.agent;
  $('#qcAdvBody').hidden = true;
  paintQcModal();
  $('#qcBack').hidden = false;
  $('#qcLabel').focus();
}
function paintQcModal() {
  $$('#qcOp button').forEach(b => b.classList.toggle('is-on', b.dataset.op === qcDraft.op));
  $$('#qcScope button').forEach(b => b.classList.toggle('is-on', b.dataset.scope === qcDraft.scope));
  $('#qcProjWrap').hidden = qcDraft.scope !== 'project';
  $('#qcAgentWrap').hidden = qcDraft.op !== 'agent';   // §23.8.2 源码的 agent 字段：只有智能体动作要选
  $('#qcProjBtn').textContent = '▾ ' + (qcDraft.project || '（未选，对所有项目生效）');
}
function closeQuickCommandModal() { $('#qcBack').hidden = true; qcEditing = null; qcDraft = null; }
function saveQuickCommand() {
  if (!qcDraft) return;
  qcDraft.label = ($('#qcLabel').value || '').trim();
  qcDraft.cmd = $('#qcCmd').value || '';
  qcDraft.append = $('#qcAppend').checked;
  qcDraft.agent = $('#qcAgent').value || 'claude';
  if (!qcDraft.label) { toast('先给它起个「标签」'); $('#qcLabel').focus(); return; }
  if (!qcDraft.cmd.trim()) { toast('命令是空的'); $('#qcCmd').focus(); return; }
  S.quickCommands = S.quickCommands || [];
  if (qcEditing) Object.assign(qcEditing, qcDraft);
  else { const id = 'qc' + now(); S.quickCommands.push({ id, ...qcDraft }); S.quickCommandActive = id; }
  save(true); renderQuickCommandBar();
  closeQuickCommandModal();
  toast(`已保存快捷指令 <b>${escapeHtml(qcDraft ? qcDraft.label : '')}</b>`);
}
/// 点它 = **真的跑**：终端 → 终端面板逐字敲入；智能体 → 同时把命令当首条指令发进对话
/// 点它 = **真的跑**。执行动作逐条对过 reference/Orca 的 run-quick-command-in-new-tab.ts:56-142：
///   ① 空白命令直接拒绝（源码同款 `if (!command.command.trim()) return null`，免得开出一张空白标签）
///   ② 每跑一次 = **新开一个终端标签**，不是反复复用同一块面板
///   ③ 智能体动作 = agent + prompt（源码 launchAgentInNewTab）；我们这里 = 终端标签先 cd，再把 prompt 当首条指令
function runQuickCommand(id) {
  const c = (S.quickCommands || []).find(x => x.id === id) || quickCommandsVisible()[0];
  if (!c) { toast('还没有快捷指令 —— 点 ⌄ 新建一条'); return; }
  if (!String(c.cmd || '').trim()) { toast('这条命令是空的，先编辑一下'); return; }
  S.quickCommandActive = c.id; save(true); renderQuickCommandBar();
  if (c.op === 'agent') {
    addMsg('sys', `智能体 <b>${escapeHtml(c.agent || 'claude')}</b> 收到指令：<code>${escapeHtml(c.cmd)}</code>`
      + `<br><span style="opacity:.7">原型 · 真机上这里起一个 ${escapeHtml(c.agent || 'claude')} 进程，把命令当首条指令</span>`);
    openTerminal({ title: `🤖 ${c.label}`, agent: c.agent || 'claude', command: c.cmd,
                   appendEnter: c.append !== false });
  } else {
    openTerminal({ title: `⌨ ${c.label}`, command: c.cmd, appendEnter: c.append !== false });
  }
}

/* ============================================================
   §22.14 浏览器页 —— 细节从 reference/Orca 取，不是照截图猜
   视口预设照 reference/Orca/src/shared/browser-viewport-presets.ts:13-68
   工具栏顺序照 …/assemble-chrome/browser-chrome-toolbar.tsx:212-267
   ⋯ 菜单照 …/assemble-chrome/BrowserToolbarMenu.tsx:99-252
   ============================================================ */
const BROWSER_VIEWPORT_PRESETS = [
  { id: 'mobile-s',  label: 'Mobile S',  w: 320,  h: 568,  dsf: 2, mobile: true },
  { id: 'mobile-m',  label: 'Mobile M',  w: 375,  h: 667,  dsf: 2, mobile: true },
  { id: 'mobile-l',  label: 'Mobile L',  w: 425,  h: 812,  dsf: 2, mobile: true },
  { id: 'tablet',    label: 'Tablet',    w: 768,  h: 1024, dsf: 2, mobile: true },
  { id: 'laptop',    label: 'Laptop',    w: 1024, h: 768,  dsf: 1, mobile: false },
  { id: 'laptop-l',  label: 'Laptop L',  w: 1440, h: 900,  dsf: 1, mobile: false },
  { id: 'desktop',   label: 'Desktop',   w: 1920, h: 1080, dsf: 1, mobile: false },
];
const BROWSER_COOKIE_SOURCES = ['Safari', 'Google Chrome', 'Firefox', '从文件导入…'];
let brMode = null;                 // null | 'grab' | 'note' | 'draw'
let brDrawing = null;              // 正在画的这一笔
let brStrokes = [];                // 本次绘制累计的笔迹（导出时一起带走）
let brStrokeColor = '#FF4D4F';
let brStrokeWidth = 4;
const activeTabObj = () => S.tabs[S.activeTab] || null;
const tabViewKind = t => (t && (t.kind === 'browser' || t.kind === 'terminal')) ? (t.kind || 'file') : extViewKind(t.f);
const hostOf = u => { try { return u ? new URL(u).host : ''; } catch { return ''; } };

/// 开一张浏览器标签（§22.0.1 / §22.9.5）
function openBrowserPage(url, focusUrl) {
  const t = { p: (proj() || {}).id || null, f: url || '', kind: 'browser',
              label: url ? (hostOf(url) || '网页') : '新标签页', url: url || '' };
  S.tabs.push(t);
  S.activeTab = S.tabs.length - 1;
  S.currentFile = null;
  S.tab = 'browser';
  S.projectMode = true; S.tempMode = false;
  save(true); renderTabs(); renderContent(); renderContext(); renderNav();
  if (focusUrl !== false) { const i = $('#brUrl'); if (i) { i.focus(); i.select(); } }
}

function renderBrowser() {
  const t = activeTabObj(); if (!t || t.kind !== 'browser') return;
  const url = t.url || '';
  const urlInput = $('#brUrl');
  if (document.activeElement !== urlInput) urlInput.value = url;
  const empty = $('#brEmpty'), frame = $('#brFrame');
  const preset = BROWSER_VIEWPORT_PRESETS.find(p => p.id === t.viewportId);
  const body = $('#brBody');
  body.classList.toggle('vp-frame', !!preset);
  if (preset) body.style.setProperty('--vp-w', preset.w + 'px');
  if (preset) body.style.setProperty('--vp-h', preset.h + 'px');
  if (url) {
    empty.hidden = true; frame.hidden = false;
    if (frame.dataset.src !== url) { frame.src = url; frame.dataset.src = url; }
  } else {
    empty.hidden = false; frame.hidden = true; frame.removeAttribute('src'); frame.dataset.src = '';
  }
  $('#brImport').textContent = `⬇ 导入`;
  $('#brGrab').classList.toggle('is-on', brMode === 'grab');
  $('#brNote').classList.toggle('is-on', brMode === 'note');
  $('#brDraw').classList.toggle('is-on', brMode === 'draw');
}

function navigateBrowser(raw) {
  const t = activeTabObj(); if (!t || t.kind !== 'browser') return;
  const v = (raw || '').trim(); if (!v) return;
  const url = /^(https?:|about:|data:)/i.test(v) ? v
           : (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v) ? 'https://' + v : 'https://www.bing.com/search?q=' + encodeURIComponent(v));
  t.url = url; t.f = url; t.label = hostOf(url) || '网页';
  save(true); renderTabs(); renderBrowser(); renderContext();
}

/// 抓取/注释/绘制 三个工具共用一块画布（跨域读不到 DOM，所以走坐标 + 提示词，见 §22.0 的边界）
function setBrMode(mode) {
  const body = $('#brBody'), cv = $('#brCanvas');
  if (brMode === mode) mode = null;
  brMode = mode; brDrawing = null;
  if (!mode) { cv.hidden = true; cv.style.pointerEvents = 'none'; $('#brHint').hidden = true; renderBrowser(); return; }
  const r = body.getBoundingClientRect();
  cv.width = Math.max(1, Math.round(r.width)); cv.height = Math.max(1, Math.round(r.height));
  cv.style.pointerEvents = 'auto'; cv.hidden = false;
  const hint = { grab: '点页面上任意位置 —— 记下坐标与视口，生成可直接粘给 agent 的提示词',
                 note: '拖一个框选中元素 → 写一句你要它改什么（会进提示词）',
                 draw: '直接画。画完点 ⓘ 导出（笔迹 + 视口 + 提示词进剪贴板）' }[mode];
  $('#brHint').textContent = hint; $('#brHint').hidden = false;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  brStrokes = [];
  const pt = e => { const b = cv.getBoundingClientRect(); return { x: Math.round(e.clientX - b.left), y: Math.round(e.clientY - b.top) }; };
  cv.onmousedown = e => {
    const p0 = pt(e);
    if (mode === 'grab') { brMode = null; cv.hidden = true; $('#brHint').hidden = true; renderBrowser();
      copyText(brGrabPrompt(p0, { w: cv.width, h: cv.height }), '已抓取坐标并把提示词复制到剪贴板'); return; }
    brDrawing = { color: brStrokeColor, width: brStrokeWidth, pts: [p0] };
    cv.onmousemove = ev => {
      if (!brDrawing) return;
      const p = pt(ev); brDrawing.pts.push(p);
      ctx.strokeStyle = brDrawing.color; ctx.lineWidth = brDrawing.width;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const a = brDrawing.pts[brDrawing.pts.length - 2];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    };
    cv.onmouseup = () => {
      cv.onmousemove = null;
      if (brDrawing && brDrawing.pts.length > 1) brStrokes.push(brDrawing);
      brDrawing = null;
    };
  };
  cv.onmouseup = () => {};
  renderBrowser();
}
function brBounds(strokes) {
  const xs = strokes.flatMap(s => s.pts.map(p => p.x)), ys = strokes.flatMap(s => s.pts.map(p => p.y));
  if (!xs.length) return null;
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
/// 提示词模板照 reference/Orca …/annotate/browser-annotation-output.ts:162-224 的骨架
function brPrompt({ title, kind, items, strokes }) {
  const t = activeTabObj() || {};
  const body = $('#brBody').getBoundingClientRect();
  const lines = [
    `## Design Feedback: ${title || '当前页面'}`, '',
    `**URL:** ${t.url || '(新标签页)'}`,
    `**Viewport:** ${Math.round(body.width)}x${Math.round(body.height)}`,
    `**Source:** Wanna 浏览器页 · 抓取模式=${kind}`, ''
  ];
  items.forEach((it, i) => {
    lines.push(`### ${i + 1}. ${it.label}`);
    lines.push(`**Intent:** ${it.intent || '（未填）'}`);
    const noDom = '_（跨域读不到 DOM；真机上走 Electron 的 guest.executeJavaScript(buildGuestOverlayScript("extractHover"))'
                + ' —— reference/Orca/src/main/browser/browser-manager-grab.ts:111-125）_';
    lines.push(`**Selector:** ${it.selector || noDom}`);
    lines.push(`**Bounds:** x=${it.x}, y=${it.y}, ${it.w}x${it.h}`);
    if (it.comment) lines.push(`**Feedback:** ${it.comment}`);
    lines.push('');
  });
  if (strokes && strokes.length) {
    const b = brBounds(strokes);
    lines.push(`### 绘制标注（${strokes.length} 笔）`);
    lines.push(`**Bounds:** x=${b.x}, y=${b.y}, ${b.w}x${b.h}`);
    lines.push(`**Colors:** ${[...new Set(strokes.map(s => s.color))].join(', ')}`);
    lines.push('_底图截图需要 Electron 的 `webview.capturePage()`（reference/Orca …/markup-base-image.ts:29）—— 原型里没有，所以只带笔迹与坐标。_');
    lines.push('');
  }
  return lines.join('\n');
}
function brGrabPrompt(p, vp) {
  return brPrompt({ title: hostOf((activeTabObj() || {}).url) || '当前页面', kind: 'grab',
    items: [{ label: '用户点选的位置', intent: '定位到这个坐标处的元素', selector: '', x: p.x, y: p.y, w: 1, h: 1 }] });
}
function copyText(text, ok) {
  navigator.clipboard?.writeText(text);
  toast(ok + `<br><code style="font-size:11px">${escapeHtml(text.split('\\n')[0])}…</code>`);
}
function finishDrawing(withComment) {
  if (brDrawing) { brStrokes.push(brDrawing); brDrawing = null; }
  if (!brStrokes.length) { toast('先画点什么'); return; }
  const strokes = brStrokes;
  const commit = comment => {
    const prompt = brPrompt({ title: hostOf((activeTabObj() || {}).url) || '当前页面',
      kind: withComment ? 'annotate' : 'draw',
      items: withComment ? [{ label: '框选区域', intent: '按这条反馈改这里', selector: '',
                              ...(brBounds(strokes) || { x: 0, y: 0, w: 0, h: 0 }), comment }] : [],
      strokes });
    copyText(prompt, withComment ? '已把这条标注写成提示词并复制' : '已把绘制标注复制到剪贴板');
    brMode = null; $('#brCanvas').hidden = true; $('#brHint').hidden = true; renderBrowser();
  };
  if (withComment) askModal({ title: '这条标注要说什么？', value: '', okText: '生成提示词', onOk: commit });
  else commit();
}

/// ⋯ 下拉：档案 / 新档案 / 导入 Cookie / 视口尺寸 / 浏览器设置（结构照 BrowserToolbarMenu.tsx）
function openBrMore(anchor) {
  closeMenus();
  const m = $('#menuBrMore');
  const profiles = S.browserProfiles || [];
  const cur = S.browserProfile || 'default';
  m.innerHTML = `<div class="menu-title">档案</div>`
    + profiles.map(p => `<button data-act="profile" data-id="${p.id}">${p.id === cur ? '✓ ' : ''}${escapeHtml(p.label)}<span class="mi-sub">${escapeHtml(p.engine)}</span></button>`).join('')
    + `<div class="menu-sep"></div>
       <button data-act="newProfile">＋ 新档案…</button>
       <button data-act="cookie">⬇ 导入 Cookie ›</button>
       <button data-act="viewport">🖥 视口尺寸 ›</button>
       <button data-act="settings">⚙ 浏览器设置…</button>`;
  $$('#menuBrMore button').forEach(b => b.onclick = e => { e.stopPropagation(); brMoreAction(b.dataset.act, b.dataset.id, b); });
  m.hidden = false; placeMenu(m, anchor.getBoundingClientRect().left - 150, anchor.getBoundingClientRect().bottom + 6);
}
function brMoreAction(act, id, btn) {
  if (act === 'profile') {
    S.browserProfile = id; save(true); closeMenus();
    const p = (S.browserProfiles || []).find(x => x.id === id);
    toast(`已切到档案 <b>${escapeHtml(p ? p.label : id)}</b>`);
    renderBrowser(); return;
  }
  if (act === 'newProfile') {
    closeMenus();
    askModal({ title: '＋ 新档案', text: '给这个档案起个名字（Orca 里对应 `createBrowserSessionProfile(\'isolated\', name)`）。',
      value: `档案 ${(S.browserProfiles || []).length + 1}`, okText: '创建', onOk: v => {
        const label = (v || '').trim() || '新档案';
        S.browserProfiles = S.browserProfiles || [];
        S.browserProfiles.push({ id: 'p' + now(), label, engine: 'Safari', scope: 'isolated' });
        save(true); toast(`已新建档案 <b>${escapeHtml(label)}</b>`);
      }});
    return;
  }
  if (act === 'cookie') { openBrCookie(btn); return; }
  if (act === 'viewport') { openBrViewport(btn); return; }
  if (act === 'settings') { closeMenus(); openBrSettings(); return; }
}
function openBrCookie(anchor) {
  closeMenus();
  const m = $('#menuBrCookie');
  m.innerHTML = `<div class="menu-title">导入 Cookie</div>`
    + BROWSER_COOKIE_SOURCES.map(s => `<button data-src="${escapeHtml(s)}">${escapeHtml(s)} ›</button>`).join('');
  $$('#menuBrCookie button').forEach(b => b.onclick = e => {
    e.stopPropagation(); closeMenus();
    const src = b.dataset.src;
    const n = 10 + Math.floor(Math.random() * 40);
    S.browserCookies = S.browserCookies || [];
    S.browserCookies.push({ from: src, count: n, at: now() });
    save(true);
    toast(`已从 <b>${escapeHtml(src)}</b> 导入 ${n} 条 cookie<br><code style="font-size:11px">真机走 reference/Orca/src/main/browser/browser-cookie-import-pipeline.ts</code>`);
  });
  m.hidden = false; placeMenu(m, anchor.getBoundingClientRect().right + 6, anchor.getBoundingClientRect().top);
}
function openBrViewport(anchor) {
  closeMenus();
  const m = $('#menuBrViewport');
  const t = activeTabObj() || {};
  m.innerHTML = `<div class="menu-title">视口尺寸</div>`
    + `<button data-vp="">${!t.viewportId ? '✓ ' : ''}Default</button>`
    + BROWSER_VIEWPORT_PRESETS.map(p => `<button data-vp="${p.id}">${t.viewportId === p.id ? '✓ ' : ''}${p.label}<span class="mi-sub">${p.w}×${p.h}</span></button>`).join('');
  $$('#menuBrViewport button').forEach(b => b.onclick = e => {
    e.stopPropagation(); closeMenus();
    const i = S.tabs.indexOf(activeTabObj());
    if (i >= 0) { S.tabs[i].viewportId = b.dataset.vp || undefined; save(true); }
    renderBrowser();
    const p = BROWSER_VIEWPORT_PRESETS.find(x => x.id === b.dataset.vp);
    toast(p ? `视口已设为 <b>${p.label} ${p.w}×${p.h}</b>（dsf ${p.dsf}${p.mobile ? ', mobile' : ''}）` : '视口已恢复 Default');
  });
  m.hidden = false; placeMenu(m, anchor.getBoundingClientRect().right - 200, anchor.getBoundingClientRect().bottom + 6);
}
function openBrSettings() {
  const st = S.browserSettings || { doNotTrack: true, blockPopups: false, homePage: 'https://www.bing.com' };
  openModal({ title: '浏览器设置',
    text: `隐私追踪（Do Not Track）：${st.doNotTrack ? '开' : '关'}\n拦截弹窗：${st.blockPopups ? '开' : '关'}\n主页：${st.homePage}\n\n（点「保存」在两者之间切换 Do Not Track；更多项落 SwiftUI 的设置页）`,
    value: st.homePage, okText: '保存',
    onOk: v => { S.browserSettings = { ...st, homePage: (v || '').trim() || st.homePage, doNotTrack: !st.doNotTrack };
      save(true); toast('浏览器设置已保存'); } });
}

/* ============================================================
   §23.4 右侧边栏（资源管理器 + 智能体会话历史）
   结构与字段照 reference/Orca：
     Explorer  …/right-sidebar/FileExplorer.tsx（Names / Contents 两个视图）
     Agents    …/right-sidebar/AiVaultPanel.tsx + AiVaultPanelHeader/Controls
     类型      src/shared/ai-vault-types.ts:96-139、ai-vault-session-filters.ts:31-56
   ============================================================ */
const VAULT_AGENTS = ['claude', 'codex', 'pi', 'gemini', 'kiro', 'cursor'];
const VAULT_SCOPES = [['workspace', '工作区'], ['project', '项目'], ['all', '全部']];
const VAULT_HOSTS = [['local', 'local'], ['all', '全部主机']];
const VAULT_GROUPS = [['project', '按项目'], ['folder', '按文件夹'], ['agent', '按智能体']];

/// 会话历史的数据**从现有会话派生**（原型没有真磁盘会话），字段名照 AiVaultSession
function buildVaultSessions() {
  const out = [];
  let n = 0;
  // AiVaultSession 字段照 src/shared/ai-vault-types.ts:96-139（子集，原型有数据的那几个）
  const push = (o) => { out.push({ id: o.id, executionHostId: 'local', agent: o.agent || VAULT_AGENTS[(n++) % VAULT_AGENTS.length],
    sessionId: o.sid || o.id, title: o.title, cwd: o.cwd, branch: null, model: o.model || 'claude-sonnet-4',
    filePath: o.cwd, createdAt: o.ts, updatedAt: o.ts, modifiedAt: new Date(o.ts || Date.now()).toISOString(),
    messageCount: o.msgs || 0, totalTokens: 0, previewMessages: [], resumeCommand: `claude --resume ${o.sid || o.id}`,
    subagentCount: o.sub || 0, preview: o.preview || '',
    projectLabel: o.projectLabel, projectKey: o.cwd, kind: o.kind, ref: o.ref }); };
  realProjects().forEach(p => (p.chats || []).forEach(c => push({
    id: 'vs_' + c.id, sid: c.sid || c.id, title: c.title, cwd: p.path, ts: c.ts || now(),
    msgs: c.msgs || 0, sub: c.sub || 0, model: c.model, preview: c.preview || '',   // §30：预览/子智能体/模型原来漏传
    projectLabel: p.name, kind: 'project', ref: { p: p.id, id: c.id } })));
  (S.plans || []).filter(x => !x.isGroup).forEach(pl => push({
    id: 'vs_' + pl.id, sid: pl.sid || pl.id, title: pl.title, cwd: defaultFolderPath(),
    ts: pl.ts || now(), msgs: 0, projectLabel: '默认', kind: 'default', ref: { id: pl.id } }));
  const deleted = S.vaultDeleted || [];                    // §30 ⋯菜单的删除：真删（从列表里除名）
  return out.filter(x => !deleted.includes(x.id));
}
function vaultFilterState() {
  return { query: (S.vaultQuery || '').trim(), agents: S.vaultAgents || [], scope: S.vaultScope || 'workspace',
    group: S.vaultGroup || 'project', hideEmpty: !!S.vaultHideEmpty, limit: S.vaultLimit || 100 };
}
/// 过滤 + 分组 —— 形状照 src/shared/ai-vault-session-filters.ts:73/129
function vaultFilteredGroups() {
  const f = vaultFilterState();
  const cur = (proj() || {}).path;
  let list = buildVaultSessions();
  if (f.scope === 'workspace' && cur) list = list.filter(x => x.cwd === cur);
  else if (f.scope === 'project') list = list.filter(x => x.projectLabel && x.projectLabel !== '默认');
  if (f.agents.length) list = list.filter(x => f.agents.includes(x.agent));
  if (f.hideEmpty) list = list.filter(x => x.messageCount > 0);
  if (f.query) { const q = f.query.toLowerCase();
    list = list.filter(x => (x.title || '').toLowerCase().includes(q)
      || (x.agent || '').includes(q) || (x.projectLabel || '').toLowerCase().includes(q)); }
  if (S.vaultSort === 'created') list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  else list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));   // 默认：最后更新（源码 Last updated）
  list = list.slice(0, f.limit);
  const keyOf = x => f.group === 'agent' ? x.agent : (f.group === 'folder' ? (x.cwd || '') : (x.projectLabel || ''));
  const map = new Map();
  list.forEach(x => { const k = keyOf(x) || '（无）'; if (!map.has(k)) map.set(k, []); map.get(k).push(x); });
  return [...map.entries()].map(([key, sessions]) => ({ key, sessions }));
}

function renderSidePanel() {
  const panel = $('#panelSide'); if (!panel) return;
  const sumEl = $('#sideSum');
  if (sumEl) sumEl.hidden = true;              // 汇总条只属于 Contents 视图（23.4.4），其余一律收起
  const which = S.sidePanel;
  panel.hidden = which !== 'explorer' && which !== 'agents';
  $$('#railRight .rail-btn').forEach(b => b.classList.toggle('is-on',
    (b.dataset.open === 'explorer' && which === 'explorer') || (b.dataset.open === 'agents' && which === 'agents')));
  $('#panelAutomation').hidden = !S.automationOpen;
  // §30 自动化按钮已并入最右侧 rail
  $('#railRight .rail-btn[data-open="automation"]')?.classList.toggle('is-on', !!S.automationOpen);
  // 面板开着就要有内容 —— 只在「点开」那条路上调过 renderAutomation 的话，刷新一回来就是空列表
  if (S.automationOpen) renderAutomation();
  if (panel.hidden) return;
  $$('#sideTabs button').forEach(b => b.classList.toggle('is-on', b.dataset.side === which));
  const refresh = $('#sideRefresh'), collapse = $('#sideCollapse'), locate = $('#sideLocate');
  if (which === 'explorer') {
    refresh.title = '刷新'; collapse.title = '折叠全部'; collapse.hidden = false;
    if (locate) { locate.hidden = false; locate.title = '定位到当前打开的文件（右栏 + 左栏一起展开）'; }
  } else {
    refresh.title = '刷新（强制重扫）'; collapse.hidden = true;
    if (locate) locate.hidden = true;
  }
  if (which === 'explorer') renderSideExplorer(); else renderSideVault();
}
function openSidePanel(which) {
  S.sidePanel = (S.sidePanel === which) ? null : which;
  save(true); renderSidePanel();
}

/* ── 23.4.A 资源管理器：Names / Contents 两个视图 ── */
function explorerRows() {
  // Orca 的 explorer 跟着**当前 worktree** 走 —— 我们就是跟着当前项目
  const p = proj() || realProjects()[0] || defaultProject();
  const out = [];
  if (p) walkTreeRows(p, p.tree, '', 0, out);
  return out;
}
function walkTreeRows(p, nodes, prefix, depth, out) {
  (nodes || []).forEach(n => {
    const rel = prefix ? `${prefix}/${n.name}` : n.name;
    out.push({ project: p, rel, name: n.name, dir: n.type === 'dir', depth, node: n });
    if (n.type === 'dir' && n.open) walkTreeRows(p, n.children || [], rel, depth + 1, out);
  });
}
/// §23.4.2 名称过滤 = **按空白切成多个 token、全部 includes、不分大小写**
/// （照 reference/Orca/src/shared/file-name-filter-tokens.ts:51-61）
function nameFilterTokens(q) { return String(q || '').toLowerCase().split(/\s+/).filter(Boolean); }
function pathMatchesNameFilter(rel, tokens) {
  if (!tokens.length) return true;
  const hay = rel.toLowerCase();
  return tokens.every(t => hay.includes(t));          // locale-independent，与 Orca 逐字一致
}
/// §23.4.6 定位 = 把**当前打开的文件**在面板的树里展开并高亮，
/// 同时调现有的 locateFileInTree 把左栏那棵树也带过去（两棵树一次都落到同一个文件）
function locateActiveFileInSidePanel() {
  const rel = relOfActiveTab(), p = proj();
  if (!p || !rel) { toast('先在编辑区打开一个文件'); return; }
  S.sidePanel = 'explorer'; S.sideView = 'names'; S.sideQuery = ''; S.automationOpen = false;
  const parts = rel.split('/');
  let nodes = p.tree;
  for (let i = 0; i < parts.length - 1 && Array.isArray(nodes); i++) {
    const d = nodes.find(n => n.type === 'dir' && n.name === parts[i]);
    if (!d) break;
    d.open = true;                              // 祖先目录逐级打开，否则这一行根本不渲染
    nodes = d.children || [];
  }
  save(true); renderSidePanel();
  const row = [...document.querySelectorAll('#sideBody .sp-row')]
    .find(x => x.dataset.rel === rel && x.dataset.pid === p.id);
  if (!row) { toast('这个文件不在当前项目的树里'); return; }
  row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 1100);
  locateFileInTree(rel, p.id);
  toast(`已定位 <b>${escapeHtml(rel)}</b> —— 右侧资源管理器与左栏都展开到它`);
}
function renderSideExplorer() {
  const sub = $('#sideSub'), body = $('#sideBody');
  const view = S.sideView || 'names';
  const sumEl = $('#sideSum'); if (sumEl) sumEl.hidden = true;   // Contents 分支里再按结果放出来
  sub.innerHTML = `
    <div class="sp-view" style="padding:0">
      <button data-view="names" class="${view === 'names' ? 'is-on' : ''}">Names</button>
      <button data-view="contents" class="${view === 'contents' ? 'is-on' : ''}">Contents</button>
    </div>
    <input class="sp-input" style="margin:6px 0 0" id="sideQuery"
      placeholder="${view === 'names' ? '按名称过滤…' : '按内容搜索…'}" spellcheck="false"
      value="${escapeHtml(S.sideQuery || '')}">`;
  $$('#sideSub .sp-view button').forEach(b => b.onclick = () => {
    S.sideView = b.dataset.view; save(true); renderSideExplorer();
  });
  const qEl = $('#sideQuery');
  qEl.oninput = () => { S.sideQuery = qEl.value; save(true); renderSideExplorer();
    const n = $('#sideQuery'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } };

  const tokens = view === 'names' ? nameFilterTokens(S.sideQuery) : [];
  const rows = explorerRows().filter(r => view !== 'names' || pathMatchesNameFilter(r.rel, tokens));

  if (view === 'contents') { renderSideContents(body); return; }

  if (!rows.length) {
    body.innerHTML = `<div class="sp-empty">${tokens.length
      ? '名称里没有匹配的文件' : '还没有可显示的文件 —— 先在左边打开一个项目'}</div>`;
    return;
  }
  body.innerHTML = '';
  rows.forEach(r => {
    const el = document.createElement('div');
    el.className = 'sp-row' + (r.dir ? ' is-dir' : '');
    el.style.paddingLeft = (7 + r.depth * 12) + 'px';
    el.innerHTML = `<span class="ic">${r.dir ? (r.node.open ? '▾' : '▸') : treeIconSVG(r.rel, false)}</span>
      <span class="bd"><span class="t1">${escapeHtml(r.name)}</span></span>`;
    el.dataset.rel = r.rel; el.dataset.pid = r.project.id;   // §23.4.6 定位靠它找行
    el.title = `${r.project.path}/${r.rel}`;
    el.onclick = () => {
      if (r.dir) { r.node.open = !r.node.open; save(true); renderSideExplorer(); renderNav(); }
      else { S.projectMode = true; S.tempMode = false; S.activeProject = r.project.id;
             openInTab(r.project.id, r.rel); save(); renderNav(); renderSideExplorer(); }
    };
    el.oncontextmenu = ev => { ev.preventDefault();
      // §23.4.7 沿用左栏那一份：打开 / 定位 / 重点参考 / 复制路径 / 重命名 / 删除
      const fileItems = r.dir ? [] : [
        { label: '定位到左栏', action: () => locateFileInTree(r.rel, r.project.id) },
        { label: focusHas(r.project.id, r.rel) ? '从对话里移出（取消参考）' : '添加到对话（重点参考）',
          action: () => { focusToggle(r.project.id, r.rel);
            toast(focusHas(r.project.id, r.rel) ? `已把 <b>${escapeHtml(r.rel)}</b> 加进这次对话的参考`
                                                : `已移出参考 · ${escapeHtml(r.rel)}`);
            renderSideExplorer(); } },
        { label: '复制路径', action: () => { navigator.clipboard?.writeText(`${r.project.path}/${r.rel}`);
            toast('已复制 ' + r.project.path + '/' + r.rel); } },
        { label: '重命名', action: () => renameFileNode(r.project, r.rel) },
        { label: '删除文件', danger: true, action: () => confirmModal({ title: '删除这个文件？',
            text: r.rel + '\n（原型只从这棵树里删，不动你磁盘）', okText: '删除', onOk: () => {
              delete r.project.files[r.rel];
              removeFromTree(r.project.tree, r.rel.split('/'));
              S.tabs = S.tabs.filter(t => !(t.p === r.project.id && t.f === r.rel));
              S.focusFiles = (S.focusFiles || []).filter(x => !(x.p === r.project.id && x.f === r.rel));
              if (S.activeTab >= S.tabs.length) S.activeTab = Math.max(0, S.tabs.length - 1);
              if (S.currentFile === r.rel && S.activeProject === r.project.id) { S.currentFile = null; S.activeTab = 0; }
              save(true); renderNav(); renderTabs(); renderContent(); renderSideExplorer();
              toast('已删除 ' + escapeHtml(r.rel));
            }}) },
      ];
      showMenu([
        { label: r.dir ? '展开 / 折叠这个目录' : '打开（在编辑区）', action: () => {
            if (r.dir) { r.node.open = !r.node.open; save(true); renderSideExplorer(); renderNav(); }
            else { S.projectMode = true; S.activeProject = r.project.id;
                   openInTab(r.project.id, r.rel); save(); renderNav(); } } },
        ...(r.dir ? [{ label: '定位到左栏', action: () => locateFileInTree(r.rel, r.project.id) }] : fileItems),
      ], null, { x: ev.clientX + 4, y: ev.clientY + 4 }); };
    body.appendChild(el);
  });
}
/// §23.4.3 Contents 视图：**文件组（可折叠）+ 命中行**，形状照 search-rows.ts:13 buildSearchRows
function renderSideContents(body) {
  const sumEl = $('#sideSum');
  const setSum = text => { if (!sumEl) return; sumEl.hidden = !text; sumEl.textContent = text || ''; };
  const q = (S.sideQuery || '').trim().toLowerCase();
  if (!q) { setSum(''); body.innerHTML = `<div class="sp-empty">输入关键字，在文件内容里搜</div>`; return; }
  const files = [];
  searchFilesInProjects([...realProjects(), defaultProject()].filter(Boolean), q, files);
  if (!files.length) { setSum('0 results in 0 files'); body.innerHTML = ''; return; }
  let total = 0; files.forEach(f => total += f.matches.length);
  // §23.4.4 汇总条在**列表外面**（#sideSum），所以列表滚到底也不会把它卷走
  setSum(`${total} results in ${files.length} files`);
  body.innerHTML = '';
  files.forEach(f => {
    const key = `${f.project.id}|${f.rel}`;
    const collapsed = !!(S.explorerCollapsed || {})[key];
    const head = document.createElement('div');
    head.className = 'sp-group';
    head.innerHTML = `<span class="cv" style="${collapsed ? '' : 'transform:rotate(90deg)'}">▶</span>
      <span class="lb">${escapeHtml(f.rel)}</span><span class="ct">${f.matches.length}</span>`;
    head.onclick = () => { S.explorerCollapsed = S.explorerCollapsed || {};
      S.explorerCollapsed[key] = !collapsed; save(true); renderSideExplorer(); };
    body.appendChild(head);
    if (collapsed) return;
    f.matches.forEach(m => {
      const line = document.createElement('div');
      line.className = 'sp-match';
      line.textContent = `${m.line}: ${m.lineContent.trim()}`;
      line.title = `${f.project.path}/${f.rel}:${m.line}`;
      line.onclick = () => { S.projectMode = true; S.activeProject = f.project.id;
        openInTab(f.project.id, f.rel); save(); renderNav();
        toast(`跳到 ${escapeHtml(f.rel)}:${m.line}`); };
      body.appendChild(line);
    });
  });
}
function searchFilesInProjects(projects, q, out) {
  projects.forEach(p => Object.keys(p.files || {}).forEach(rel => {
    const text = p.files[rel] || ''; if (text === '__PDF__') return;
    const lines = text.split('\n'); const matches = [];
    lines.forEach((line, i) => {
      const at = line.toLowerCase().indexOf(q);
      if (at >= 0) matches.push({ line: i + 1, column: at + 1, lineContent: line });
    });
    if (matches.length) out.push({ project: p, rel, matches });
  }));
  return out;
}
function renameFileNode(project, rel) {
  askModal({ title: '重命名文件', text: rel, value: rel.split('/').pop(), okText: '重命名', onOk: v => {
    const nn = (v || '').trim(); if (!nn) return;
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
    const target = dir + nn;
    if (target in project.files) { toast('已经有同名文件了'); return; }
    project.files[target] = project.files[rel]; delete project.files[rel];
    renameInTree(project.tree, rel.split('/'), target.split('/'));
    S.tabs.forEach(x => { if (x.p === project.id && x.f === rel) x.f = target; });
    if (S.currentFile === rel) S.currentFile = target;
    save(true); renderNav(); renderTabs(); renderContent(); renderSideExplorer();
    toast('已重命名为 ' + target);
  }});
}

/* ── 23.4.B 智能体会话历史（Agents / Ai Vault） ── */
/// §30 会话历史 —— 结构 1:1 照 Orca（reference/Orca/src/renderer/src/components/right-sidebar/）：
///   标题+副标题     AiVaultPanelHeader.tsx:81-97（智能体会话历史 / 索引历史记录）
///   工作区分段+搜索 AiVaultPanelHeader.tsx:141-189 · 主机/过滤菜单 AiVaultPanelControls.tsx:154-365
///   计数+排序条     AiVaultSessionListBar.tsx:22-87（X 次（共 Y 次）+ 最后更新/创建）
///   行内 hover 按钮  SessionRowTrailingActions.tsx:30-40/95-282（⌖ ▶ ⊕ ∨ ⋯，hover 才浮现）
///   ⋯/右键菜单      AiVaultSessionActionMenuItems.tsx:59-194（5+3+2+1 分组、删除红色）
///   展开态          AiVaultSessionDetails.tsx:71-241（按钮条 → 首次提示 → 最近轮次）
///   恢复门          ai-vault-session-resume.ts:236-245（messageCount>0 才能恢复）
/// 行内小图用字形（⌖▶⊕∨⋯），菜单/展开结构与条目顺序逐条对齐源码。
function vaultRelTime(ts) {
  const d = Date.now() - Number(ts || 0);
  if (d < 60e3) return '刚刚';
  if (d < 3600e3) return Math.floor(d / 60e3) + ' 分钟前';
  if (d < 86400e3) return Math.floor(d / 3600e3) + ' 小时前';
  if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + ' 天前';
  return new Date(ts).toLocaleDateString();
}

function renderSideVault() {
  const sub = $('#sideSub'), body = $('#sideBody');
  if (!sub || !body) return;
  const f = vaultFilterState();
  const all = buildVaultSessions();
  const groups = vaultFilteredGroups();
  const shown = groups.reduce((n, g) => n + g.sessions.length, 0);
  const sortLabel = (S.vaultSort === 'created') ? '创建' : '最后更新';
  // 标题区（照 AiVaultPanelHeader：主/副标题在左，主机+过滤在右），然后分段 → 搜索 → 计数条
  sub.innerHTML = `
    <div class="vault-head">
      <div class="vh-txt">
        <div class="vh-t">智能体会话历史</div>
        <div class="vh-s">索引历史记录</div>
      </div>
      <div class="vh-ctrls">
        <button class="sp-chip" data-vmenu="host" title="执行主机">🖥 ${escapeHtml(S.vaultHost || 'local')}</button>
        <button class="sp-chip" data-vmenu="filter" title="过滤：智能体 / 分组 / 隐藏空会话 / 条数">⚙ 过滤</button>
      </div>
    </div>
    <div class="sp-filters vault-scope">
      ${VAULT_SCOPES.map(([v, l]) => `<button class="sp-chip ${f.scope === v ? 'is-on' : ''}" data-vscope="${v}">${l}</button>`).join('')}
    </div>
    <input class="sp-input" style="margin:0 0 6px" id="vaultQuery"
      placeholder="搜索会话…" spellcheck="false" value="${escapeHtml(f.query)}">
    <div class="vault-countbar">
      <span class="vc-num">${shown} 次（共 ${all.length} 次）</span>
      <button class="vc-sort" data-vmenu="sort" title="排序">${sortLabel} ▾</button>
    </div>`;
  const q = $('#vaultQuery');
  q.oninput = () => { S.vaultQuery = q.value; save(true); renderSideVault();
    const n = $('#vaultQuery'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } };
  $$('#sideSub [data-vscope]').forEach(b => b.onclick = () => { S.vaultScope = b.dataset.vscope;
    save(true); renderSideVault(); });
  $$('#sideSub [data-vmenu]').forEach(b => b.onclick = e => { e.stopPropagation();
    if (b.dataset.vmenu === 'host') {
      showMenu(VAULT_HOSTS.map(([v, l]) => ({ label: (S.vaultHost || 'local') === v ? `✓ ${l}` : l,
        action: () => { S.vaultHost = v; save(true); renderSideVault(); toast('执行主机：' + l); } })), b);
    } else if (b.dataset.vmenu === 'sort') {
      showMenu([
        { label: (S.vaultSort !== 'created' ? '✓ ' : '  ') + '最后更新', action: () => { S.vaultSort = 'updated'; save(true); renderSideVault(); } },
        { label: (S.vaultSort === 'created' ? '✓ ' : '  ') + '创建', action: () => { S.vaultSort = 'created'; save(true); renderSideVault(); } },
      ], b);
    } else {
      const present = [...new Set(all.map(x => x.agent))];
      showMenu(
        [{ title: '选择智能体（多选）' }]
          .concat(present.map(a => ({ label: (f.agents.includes(a) ? '✓ ' : '  ') + a,
            action: () => { const set = new Set(f.agents); set.has(a) ? set.delete(a) : set.add(a);
              S.vaultAgents = [...set]; save(true); renderSideVault(); } })))
          .concat([{ sep: true }, { title: '分组' }])
          .concat(VAULT_GROUPS.map(([v, l]) => ({ label: (f.group === v ? '✓ ' : '  ') + l,
            action: () => { S.vaultGroup = v; save(true); renderSideVault(); } })))
          .concat([{ sep: true },
            { label: (f.hideEmpty ? '✓ ' : '  ') + '隐藏空会话', action: () => { S.vaultHideEmpty = !S.vaultHideEmpty;
                save(true); renderSideVault(); } },
            { label: '恢复默认过滤', action: () => { S.vaultAgents = []; S.vaultScope = 'workspace';
                S.vaultGroup = 'project'; S.vaultHideEmpty = false; S.vaultLimit = 100;
                save(true); renderSideVault(); toast('已恢复默认过滤'); } }]),
        b);
    }
  });

  if (!groups.length) { body.innerHTML = `<div class="sp-empty">没有匹配的会话<br><span style="opacity:.7">刷新可强制重扫</span></div>`; return; }
  body.innerHTML = '';
  groups.forEach(g => {
    const collapsed = !!(S.vaultGroupsCollapsed || {})[g.key];
    const head = document.createElement('div');
    head.className = 'sp-group' + (collapsed ? ' closed' : '');
    head.innerHTML = `<span class="cv">▶</span><span class="lb">${escapeHtml(g.key)}</span>
      <span class="ct">${g.sessions.length}</span>`;
    head.onclick = () => { S.vaultGroupsCollapsed = S.vaultGroupsCollapsed || {};
      S.vaultGroupsCollapsed[g.key] = !collapsed; save(true); renderSideVault(); };
    body.appendChild(head);
    if (collapsed) return;
    g.sessions.forEach(x => body.appendChild(vaultRow(x)));
  });
}

/// 行 —— 照 AiVaultSessionRow.tsx:30-249：标题行右侧 hover 浮现 5 颗按钮（TrailingActions），
/// 右键 = ⋯ 同一份菜单（AiVaultSessionRow.tsx:248-269 ContextMenu），点行 = 展开（:144-153）
function vaultRow(x) {
  const open = !!(S.vaultOpen || {})[x.id];
  const canResume = x.messageCount > 0;          // isAiVaultSessionResumableContent 的子集门
  const wrap = document.createElement('div');
  wrap.className = 'vrow-wrap';
  const row = document.createElement('div');
  row.className = 'sp-row vrow' + (open ? ' is-on' : '');
  const worktree = String(x.cwd || '').split('/').filter(Boolean).pop() || '—';
  row.innerHTML = `<span class="ic">${escapeHtml(x.agent.slice(0, 2))}</span>
    <span class="bd"><span class="t1">${escapeHtml(x.title || x.sessionId)}
      <span class="vrow-acts">
        <button class="va" data-a="locate" title="跳转到原始窗格">⌖</button>
        <button class="va" data-a="resume" title="在工作树中恢复" ${canResume ? '' : 'disabled'}>▶</button>
        <button class="va" data-a="cont" title="在新会话中继续">⊕</button>
        <button class="va va-chev" data-a="toggle" title="展开 / 收起" aria-expanded="${open}">${open ? '∧' : '∨'}</button>
        <button class="va" data-a="more" title="更多">⋯</button>
      </span></span>
      <span class="t2">${escapeHtml(x.agent)} · ${x.messageCount} 条消息 · ${x.subagentCount ? x.subagentCount + ' 个子智能体 · ' : ''}${vaultRelTime(x.updatedAt)} · ${escapeHtml(x.model || '-')}</span>
      <span class="t3"><b class="vtree" title="${escapeHtml(x.cwd || '')}">${escapeHtml(worktree)}</b>${
        x.preview ? `<span class="vpv">${escapeHtml(x.preview)}</span>` : ''}</span></span>`;
  row.oncontextmenu = e => { e.preventDefault(); vaultRowMenu(x, null, { x: e.clientX, y: e.clientY }); };
  row.onclick = e => {
    if (e.target.closest('.va')) return;        // 按钮自己处理，别冒泡成展开
    S.vaultOpen = S.vaultOpen || {}; S.vaultOpen[x.id] = !open;
    save(true); renderSideVault();
  };
  $$('.va', row).forEach(btn => btn.onclick = e => {
    e.stopPropagation();
    const a = btn.dataset.a;
    if (a === 'locate') vaultLocate(x);
    else if (a === 'resume') canResume ? vaultResume(x) : toast('这条会话还没有消息，不能恢复');
    else if (a === 'cont') vaultContinueNew(x);
    else if (a === 'toggle') { S.vaultOpen = S.vaultOpen || {}; S.vaultOpen[x.id] = !open; save(true); renderSideVault(); }
    else if (a === 'more') vaultRowMenu(x, btn);
  });
  wrap.appendChild(row);
  if (open) wrap.appendChild(vaultExpand(x, canResume));
  return wrap;
}

/// 展开态 —— 照 AiVaultSessionDetails.tsx:71-241 的四段：按钮条 → 首次提示 → 最近轮次 → 元信息
function vaultExpand(x, canResume) {
  const ex = document.createElement('div');
  ex.className = 'sp-vexp';
  const firstPrompt = x.preview
    ? `<div class="vcard"><div class="vc-top"><span class="vc-role">你</span>
         <button class="vc-copy" data-a="copyPreview">⧉ 复制</button></div>
         <div class="vc-body">${escapeHtml(x.preview)}</div></div>`
    : `<div class="vnotice">这条会话没有缓存的首次提示</div>`;
  const turns = (x.previewMessages && x.previewMessages.length)
    ? x.previewMessages.slice(-3).map(m =>
        `<div class="vcard${m.role === 'user' ? ' is-user' : ''}"><div class="vc-top">
           <span class="vc-role">${m.role === 'user' ? '你' : '智能体'}</span></div>
           <div class="vc-body">${escapeHtml(m.text || '')}</div></div>`).join('')
    : `<div class="vnotice">没有缓存的轮次正文 —— 真机上由会话日志提供（源码 SessionUnsavedConversationNotice 的同款空态）</div>`;
  ex.innerHTML = `
    <div class="vexp-btns">
      <button class="vxb primary" data-a="resume" ${canResume ? '' : 'disabled'}>▶ 在工作树中恢复</button>
      <button class="vxb" data-a="resume2" ${canResume ? '' : 'disabled'}>💬 在新聊天中继续</button>
      <button class="vxb" data-a="cont">⊕ 在新会话中继续…</button>
      <button class="vxb ghost" data-a="log">📄 查看日志</button>
    </div>
    <div class="vexp-sec"><div class="ves-h">💬 首次提示</div>${firstPrompt}</div>
    <div class="vexp-sec"><div class="ves-h">🗨 最近轮次</div>${turns}</div>
    <div class="vexp-meta"><code>${escapeHtml(x.resumeCommand)}</code></div>`;
  $$('.vxb, .vc-copy', ex).forEach(btn => btn.onclick = e => {
    e.stopPropagation();
    const a = btn.dataset.a;
    if (a === 'resume' || a === 'resume2') canResume ? vaultResume(x) : toast('这条会话还没有消息，不能恢复');
    else if (a === 'cont') vaultContinueNew(x);
    else if (a === 'log') toast('原型没有会话日志 —— 真机上这一项打开该会话的日志文件');
    else if (a === 'copyPreview') { navigator.clipboard?.writeText(x.preview || ''); toast('已复制首次提示'); }
  });
  ex.onclick = e => e.stopPropagation();        // 点展开区不折叠
  return ex;
}

/// ⋯ / 右键菜单 —— 条目、顺序、分隔线照 AiVaultSessionActionMenuItems.tsx:59-194（11 项 3 条线）
function vaultRowMenu(x, anchor, xy) {
  const canResume = x.messageCount > 0;
  const noLog = '原型没有会话日志 —— 真机上这一项读该会话的日志文件';
  const gate = ok => ok ? undefined : () => toast('这条会话还没有消息，不能恢复');
  showMenu([
    { label: '跳转到原始窗格', action: () => vaultLocate(x) },
    { label: '在工作树中恢复', action: gate(canResume) || (() => vaultResume(x)) },
    { label: '在新聊天中继续', action: gate(canResume) || (() => vaultResume(x)) },
    { label: '在新会话中继续…', action: () => vaultContinueNew(x) },
    { label: '复制恢复命令', action: () => { navigator.clipboard?.writeText(x.resumeCommand); toast('已复制恢复命令'); } },
    { sep: true },
    { label: '打开日志', action: () => toast(noLog) },
    { label: '显示日志', action: () => toast(noLog) },
    { label: '打开工作目录', action: () => toast(`工作目录：<code>${escapeHtml(x.cwd || '-')}</code>（原型不开访达）`) },
    { sep: true },
    { label: '复制会话 ID', action: () => { navigator.clipboard?.writeText(x.sessionId); toast('已复制会话 ID'); } },
    { label: '复制日志路径', action: () => toast(noLog) },
    { sep: true },
    { label: '删除', danger: true, action: () => {
        S.vaultDeleted = [...(S.vaultDeleted || []), x.id];
        S.vaultOpen = S.vaultOpen || {}; delete S.vaultOpen[x.id];
        save(true); renderSideVault(); toast('已删除这条会话记录');
      } },
  ], anchor, xy);
}

/// 在新会话中继续 —— 克隆一条新记录再进去，**原会话不动**（Continue in New Session 语义）
function vaultContinueNew(x) {
  if (x.kind === 'project') {
    const p = projectById(x.ref.p);
    if (!p) { toast('这条会话的项目已经不在了'); return; }
    const c = { id: 'c' + now(), sid: newSid(), title: (x.title || '对话') + '（续）', ts: now(), msgs: 0 };
    p.chats.push(c); save(true); renderNav(); selectProjChat(c, p);
    toast('已在<b>新会话</b>中继续，原会话保持原样');
  } else {
    const c = { id: 'c' + now(), sid: newSid(), title: (x.title || '对话') + '（续）', ts: now(), msgs: 0 };
    S.plans.push(c); save(true); renderNav(); selectTempCard(c.id);
    toast('已在<b>新会话</b>中继续，原会话保持原样');
  }
}

/// 恢复（照 ai-vault-session-launch-actions.ts:86 handleResume 的语义：没内容就不给点）
function vaultResume(x) {
  if (x.kind === 'project') {
    const p = projectById(x.ref.p); const c = (p && p.chats || []).find(z => z.id === x.ref.id);
    if (!c) { toast('这条会话已经不在了'); return; }
    S.activeProject = p.id; S.tempMode = false; S.activePlan = null;
    selectProjChat(c, p);
    toast(`已恢复会话 <b>${escapeHtml(c.title)}</b>（接回当前对话）`);
  } else {
    selectTempCard(x.ref.id);
    toast(`已恢复会话 <b>${escapeHtml(x.title)}</b>`);
  }
}

/// 定位（照 ai-vault-original-pane-actions.ts:72 jumpToOriginalPane：先定位内容、再切工作区）
function vaultLocate(x) {
  if (x.kind === 'project') {
    const p = projectById(x.ref.p);
    if (p) { S.activeProject = p.id; p.open = true; save(true); renderNav();
      const row = [...document.querySelectorAll('#projectList .proj')]
        .find(el => el.querySelector('.proj-name') && el.querySelector('.proj-name').textContent === p.name);
      if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); row.classList.add('flash');
        setTimeout(() => row.classList.remove('flash'), 1100); } }
    toast(`已定位到 <b>${escapeHtml(x.projectLabel)}</b> / ${escapeHtml(x.title)}`);
  } else {
    locateFileInTree('', null);
    toast(`已定位到默认区的 <b>${escapeHtml(x.title)}</b>`);
  }
}

/* ============================================================
   §23.5 自动化 + §23.6 ⌘J 命令面板 + 全部接线
   字段照 reference/Orca：
     AutomationDraft — Automations/AutomationEditorDialog.tsx:37-59
     搜索/筛选      — automations/automation-list-search.ts:97、automation-list-view.ts:184-198
     ⌘J 键位        — shared/keybindings/definitions-core-1.ts:35（darwin: Mod+J）
     选中分发       — use-worktree-jump-palette-selection-actions.ts:235（按 item.type switch）
   ============================================================ */
const PALETTE_SETTINGS = [
  { id: 'layout-left',     title: '默认对话位置：对话在左',   sub: '设置' },
  { id: 'layout-center',   title: '默认对话位置：对话在中',   sub: '设置' },
  { id: 'layout-right',    title: '默认对话位置：对话在右',   sub: '设置' },
  { id: 'policy-queue',    title: '发送方式：排队',           sub: '设置' },
  { id: 'policy-interrupt',title: '发送方式：打断',           sub: '设置' },
  { id: 'editor-on',       title: '编辑区：打开',             sub: '设置' },
  { id: 'editor-off',      title: '编辑区：关闭',             sub: '设置' },
  { id: 'reset-hist',      title: '清空当前文件历史',          sub: '设置 · 危险' },
];
const PALETTE_ACTIONS = [
  { id: 'new-markdown-file',    title: '新建 Markdown 文件',   sub: '动作' },
  { id: 'new-terminal-tab',     title: '新建终端',             sub: '动作' },
  { id: 'new-browser-tab',      title: '新建浏览器选项卡',      sub: '动作' },
  { id: 'open-project-folder',  title: '打开项目文件夹…',      sub: '动作' },
  { id: 'search',               title: '打开搜索',             sub: '动作' },
  { id: 'add-quick-command',    title: '添加快捷命令…',        sub: '动作' },
  // §48 Hermes 斜杠命令面（cli.py:1159 _SLASH_DISPATCH 的动词子集，sub 标 'Hermes' 便于分组识别）
  { id: 'h-new',     title: '/new 新建对话',     sub: 'Hermes' },
  { id: 'h-model',   title: '/model 切换模型',   sub: 'Hermes' },
  { id: 'h-skills',  title: '/skills 打开技能',  sub: 'Hermes' },
  { id: 'h-compress',title: '/compress 压缩历史', sub: 'Hermes' },
  { id: 'h-status',  title: '/status 运行状态',  sub: 'Hermes' },
  { id: 'h-retry',   title: '/retry 重发上一条', sub: 'Hermes' },
  { id: 'h-stop',    title: '/stop 停止分发',    sub: 'Hermes' },
];

/// §23.6.3 结果**按来源分组**；质量梯度照 match-field.ts:86 —— exact > 前缀 > 子串
function paletteQuality(text, q) {
  const t = String(text || '').toLowerCase();
  if (!q) return 3;
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  return t.includes(q) ? 2 : -1;
}
function paletteItems() {
  const q = (S.paletteQuery || '').trim().toLowerCase();
  const empty = !q;                          // §23.6.4 空输入 = 最近/常用，不是把全部一股脑摊开
  const quota = empty ? { chat: 5, terminal: 4, worktree: 3, branch: 2, settings: 4, action: 4 } : null;
  const used = {};
  const out = [];
  const push = it => {
    if (quota) {
      const n = used[it.type] || 0;
      if (n >= (quota[it.type] || 0)) return;   // 每类给个上限，来源顺序就是「最近在前」
      used[it.type] = n + 1;
    }
    const tq = paletteQuality(it.title, q), sq = paletteQuality(it.sub || '', q);
    if (Math.max(tq, sq) < 0) return;
    out.push({ ...it, score: Math.min(tq < 0 ? 9 : tq, sq < 0 ? 9 : sq) });
  };
  // 聊天（最近的在后 —— 先倒着取再按原顺序放回，保证显示仍是时间正序）
  (S.chat || []).map((m, i) => ({ m, i })).reverse().slice(0, empty ? 5 : Infinity)
    .reverse().forEach(({ m, i }) => {
    if (m.role !== 'user' && m.role !== 'ai') return;
    const txt = String(m.html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!txt) return;
    push({ type: 'chat', id: 'chat' + i, icon: '💬', title: txt.slice(0, 70), sub: m.temp ? '临时对话' : '连续对话',
      run: () => { openPaletteClose(); toast('已定位到这条消息（原型里只跳转，不重放）'); } });
  });
  // 终端 / 快捷命令
  (S.quickCommands || []).forEach(c => push({ type: 'terminal', id: c.id, icon: '⌨',
    title: c.label, sub: c.cmd, run: () => { openPaletteClose(); runQuickCommand(c.id); } }));
  // 最近的工作区
  [...realProjects()].reverse().forEach(p => push({ type: 'worktree', id: p.id, icon: '📁',
    title: p.name, sub: p.path, run: () => { openPaletteClose(); selectProject(p.id); } }));
  // 分支（Orca 没有独立分支源 —— 分支是工作区文档的一个字段，见 worktree-palette-document.ts:28）
  realProjects().forEach(p => push({ type: 'branch', id: p.id + '#main', icon: '⑂',
    title: `main — ${p.name}`, sub: p.path, run: () => { openPaletteClose(); selectProject(p.id);
      toast('已跳到 <b>main</b> 分支对应的工作区'); } }));
  // 设置
  PALETTE_SETTINGS.forEach(x => push({ type: 'settings', id: x.id, icon: '⚙', title: x.title, sub: x.sub,
    run: () => { openPaletteClose(); paletteRunSetting(x.id); } }));
  // 快捷动作
  PALETTE_ACTIONS.forEach(x => push({ type: 'action', id: x.id, icon: '⚡', title: x.title, sub: x.sub,
    run: () => { openPaletteClose(); paletteRunAction(x.id); } }));
  out.sort((a, b) => a.score - b.score);
  return out;
}
function paletteRunSetting(id) {
  if (id.startsWith('layout-')) { setLayout(id.slice(7)); S.defaultLayout = id.slice(7); save(); toast('默认对话位置已改'); }
  else if (id === 'policy-queue') setSendPolicy('queue');
  else if (id === 'policy-interrupt') setSendPolicy('interrupt');
  else if (id === 'editor-on') { S.projectMode = true; S.tempMode = false; save(); renderNav(); renderContent(); renderContext(); toast('编辑区已开'); }
  else if (id === 'editor-off') { S.projectMode = false; save(); renderNav(); renderContent(); renderContext(); toast('编辑区已关'); }
  else if (id === 'reset-hist') { const rel = histFile(); if (!rel) { toast('先打开一个文件'); return; }
    confirmModal({ title: '清空这个文件的全部历史？', text: rel, okText: '清空',
      onOk: () => { delete S.history[rel]; save(true); renderHistory(); renderHistoryBadge(); } }); }
}
function paletteRunAction(id) {
  const map = { 'new-markdown-file': 'newFile', 'new-terminal-tab': 'terminal',
    'new-browser-tab': 'browser', 'open-project-folder': 'folder', 'search': 'search' };
  if (id === 'add-quick-command') { openQuickCommandModal(null); return; }
  // ── §48 Hermes 斜杠命令执行（每个动词都是真动作，不是跳转占位）──
  if (id.startsWith('h-')) { paletteRunHermes(id.slice(2)); return; }
  if (map[id]) newTabAction(map[id]);
}
/// /new /model /skills /compress /status /retry /stop —— 照 cli.py:1159 的动词语义
function paletteRunHermes(verb) {
  if (verb === 'new') {
    const p2 = S.plans;
    const lastGroup = [...p2].reverse().find(x => x.isGroup);
    const nid = 't' + now();
    p2.push({ id: nid, sid: newSid(), title: `对话 ${p2.filter(x => !x.isGroup).length + 1}`,
      ts: now(), group: lastGroup ? lastGroup.title : null, msgs: 0 });
    save(true); selectTempCard(nid); renderNav();
    toast('已新建对话卡（/new）'); return;
  }
  if (verb === 'model') { if (!hermesView) setHermesView('providers'); else setHermesView('providers');
    toast('/model → 提供商页，点卡片即切换'); return; }
  if (verb === 'skills') { setHermesView('skills'); return; }
  if (verb === 'compress') {
    const before = (S.chat || []).length;
    if (before <= 6) { toast(`/compress：只有 ${before} 条，不用压`); return; }
    S.chat = S.chat.slice(-6);              // 压到最近 6 条（其余进"摘要"= 本原型只截断，如实标注）
    save(true); renderContent();
    toast(`/compress：历史 ${before} → ${S.chat.length} 条（原型=截断保留最近，真 LLM 摘要属引擎期）`); return;
  }
  if (verb === 'status') {
    const H0 = hState2();
    toast(`/status：会话 ${S.plans.filter(x => !x.isGroup).length} · 看板未完 ${H0.tasks.filter(t => t.status !== 'done' && t.status !== 'archived').length}`
      + ` · 技能 ${H0.skills.filter(s => s.state !== 'archived').length} · 定时 ${H0.cronJobs.filter(j => j.enabled).length} 活跃`); return;
  }
  if (verb === 'retry') {
    const lastUser = [...(S.chat || [])].reverse().find(m => m.role === 'user');
    if (!lastUser) { toast('/retry：没有可重发的'); return; }
    const txt = String(lastUser.html || '').replace(/<[^>]+>/g, '');
    dispatchReply(txt); toast('/retry：已重发最后一条用户消息'); return;
  }
  if (verb === 'stop') {
    const H0 = hState();
    const wasOn = H0.cfg.dispatchInterval > 0;
    H0.cfg.dispatchInterval = 0; hSave();
    toast(wasOn ? '/stop：已停看板 dispatcher（dispatch_interval_seconds=0）' : '/stop：dispatcher 本来就是关的'); return;
  }
}
function openPalette() {
  S.paletteQuery = ''; S.paletteSel = 0;
  $('#paletteBack').hidden = false;
  const i = $('#paletteInput'); i.value = ''; i.focus();
  renderPalette();
}
function openPaletteClose() { $('#paletteBack').hidden = true; }
function renderPalette() {
  const list = $('#paletteList');
  const items = paletteItems();
  S.paletteItems = items;
  if (S.paletteSel >= items.length) S.paletteSel = Math.max(0, items.length - 1);
  if (!items.length) { list.innerHTML = `<div class="sp-empty">没有匹配的结果</div>`; return; }
  let html = '', lastType = null;
  const secName = { chat: '聊天', terminal: '终端', worktree: '最近的工作区', branch: '分支',
                    settings: '设置', action: '快捷动作' };
  items.forEach((it, idx) => {
    if (it.type !== lastType) { html += `<div class="palette-sec">${secName[it.type] || it.type}</div>`; lastType = it.type; }
    const t = escapeHtml(it.title);
    const q = (S.paletteQuery || '').trim();
    const hl = q && t.toLowerCase().includes(q.toLowerCase())
      ? t.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<em>$1</em>') : t;
    html += `<div class="pitem${idx === S.paletteSel ? ' is-sel' : ''}" data-i="${idx}">
      <span class="ic">${it.icon}</span><span class="tt">${hl}</span>
      <span class="sub">${escapeHtml(String(it.sub || '').slice(0, 42))}</span></div>`;
  });
  list.innerHTML = html;
  $$('#paletteList .pitem').forEach(el => el.onclick = () => {
    const it = items[+el.dataset.i]; if (it) it.run();
  });
  const sel = list.querySelector('.is-sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
}

/* ── §23.5 自动化 ─────────────────────────────── */
let autoEditing = null;
function renderAutomation() {
  const list = $('#autoList'); if (!list) return;
  const q = (($('#autoSearch') && $('#autoSearch').value) || '').trim().toLowerCase();
  const f = S.automationFilter || {};
  let rows = (S.automations || []).slice();
  // 索引字段照 automation-list-search.ts:14（name/project/workspace/agent/host/prompt），逐字段 includes
  if (q) rows = rows.filter(a => [a.name, a.prompt, a.agentId, a.host, a.workspaceId, a.baseBranch]
    .some(v => String(v || '').toLowerCase().includes(q)));
  if (f.agent && f.agent !== 'all') rows = rows.filter(a => a.agentId === f.agent);
  if (f.host && f.host !== 'all') rows = rows.filter(a => a.host === f.host);
  if (f.status && f.status !== 'all') rows = rows.filter(a => (a.enabled ? 'on' : 'off') === f.status);
  // 过滤条
  $('#autoFilters').innerHTML =
    `<button class="sp-chip ${!f.agent || f.agent === 'all' ? 'is-on' : ''}" data-f="agent">智能体</button>
     <button class="sp-chip ${!f.host || f.host === 'all' ? 'is-on' : ''}" data-f="host">主机</button>
     <button class="sp-chip ${!f.status || f.status === 'all' ? 'is-on' : ''}" data-f="status">状态</button>
     <button class="sp-chip" data-f="clear">清除筛选</button>`;
  $$('#autoFilters .sp-chip').forEach(b => b.onclick = e => { e.stopPropagation(); autoFilterMenu(b.dataset.f, b); });
  if (!rows.length) {
    list.innerHTML = `<div class="sp-empty">${q || f.agent || f.host || f.status ? '没有匹配的自动化' : '还没有自动化<br>点右上角 ＋ 新建'}</div>`;
    return;
  }
  list.innerHTML = '';
  rows.forEach(a => {
    const el = document.createElement('div');
    el.className = 'sp-row';
    const preset = ({ hourly: '每小时', daily: '每天', weekdays: '工作日', weekly: '每周', custom: 'cron' })[a.preset] || a.preset;
    el.innerHTML = `<span class="ic">⚡</span>
      <span class="bd"><span class="t1">${escapeHtml(a.name)}</span>
        <span class="t2">${escapeHtml(a.agentId)} · ${escapeHtml(preset)} ${escapeHtml(a.time || '')} · grace ${a.missedRunGraceMinutes}m</span></span>
      <span class="st ${a.enabled ? 'on' : 'off'}">${a.enabled ? 'on' : 'off'}</span>
      <span class="sp-acts"><button class="auto-run" title="立即运行">运行</button></span>`;
    el.querySelector('.auto-run').onclick = e => { e.stopPropagation(); runAutomation(a); };
    el.onclick = () => openAutomationDialog(a);
    list.appendChild(el);
  });
}
function autoFilterMenu(kind, anchor) {
  if (kind === 'clear') { S.automationFilter = {}; save(true); renderAutomation(); toast('已清除筛选'); return; }
  const f = S.automationFilter || {};
  const opts = kind === 'agent' ? [...new Set((S.automations || []).map(a => a.agentId))].map(v => [v, v])
    : kind === 'host' ? [...new Set((S.automations || []).map(a => a.host))].map(v => [v, v])
    : [['all', '全部'], ['on', '启用'], ['off', '停用']];
  const cur = f[kind] || 'all';
  showMenu([{ title: kind === 'agent' ? '按智能体' : kind === 'host' ? '按主机' : '按状态' }]
    .concat([[kind === 'status' ? 'all' : 'all', '全部']].map(([v, l]) =>
      ({ label: (cur === v || (!f[kind] && v === 'all') ? '✓ ' : '  ') + l,
         action: () => { S.automationFilter = { ...f, [kind]: v }; save(true); renderAutomation(); } })))
    .concat(opts.filter(([v]) => v !== 'all').map(([v, l]) =>
      ({ label: (cur === v ? '✓ ' : '  ') + l,
         action: () => { S.automationFilter = { ...f, [kind]: v }; save(true); renderAutomation(); } }))),
    anchor);
}
function runAutomation(a) {
  a.lastRunAt = now(); a.runCount = (a.runCount || 0) + 1; a.trigger = 'manual';
  save(true); renderAutomation();
  // 预检查先跑（照 automation-precheck.ts：命令 + 超时，非 0 就 skipped_precheck）
  const pre = a.precheckCommand ? `预检查 \`${a.precheckCommand}\`（超时 ${a.precheckTimeoutSeconds || 60}s）→ 通过` : '';
  toast(`已触发运行 <b>${escapeHtml(a.name)}</b>${pre ? '<br>' + escapeHtml(pre) : ''}<br>
    <span style="opacity:.7">trigger=manual · 落地走 RPC automation.runNow</span>`);
}
function openAutomationDialog(item) {
  autoEditing = item || null;
  $('#autoTitle').textContent = item ? '编辑自动化' : '新建自动化';
  const v = item || { name: '', prompt: '', agentId: 'claude', host: 'local', projectId: (realProjects()[0] || {}).id,
    workspaceMode: 'existing', baseBranch: 'main', reuseSession: false, preset: 'daily', time: '09:00',
    missedRunGraceMinutes: 720, precheckCommand: '', precheckTimeoutSeconds: 60 };
  $('#aName').value = v.name || ''; $('#aPrompt').value = v.prompt || '';
  $('#aAgent').value = v.agentId || 'claude'; $('#aHost').value = v.host || 'local';
  $('#aWorkspace').value = v.workspaceMode || 'existing';
  $('#aBranch').value = v.baseBranch || 'main';
  $('#aPreset').value = v.preset || 'daily'; $('#aTime').value = v.time || '09:00';
  $('#aGrace').value = String(v.missedRunGraceMinutes || 720);
  $('#aPreCmd').value = v.precheckCommand || ''; $('#aPreTimeout').value = String(v.precheckTimeoutSeconds || 60);
  $$('#aSession button').forEach(b => b.classList.toggle('is-on', String(!!v.reuseSession) === b.dataset.reuse));
  const sel = $('#aProject');
  sel.innerHTML = realProjects().map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  if (v.projectId) sel.value = v.projectId;
  $('#autoBack').hidden = false;
  $('#aName').focus();
}
function saveAutomation() {
  const name = ($('#aName').value || '').trim();
  if (!name) { toast('先给它起个名字'); $('#aName').focus(); return; }
  const reuse = $$('#aSession button').find(b => b.classList.contains('is-on'));
  const data = {
    name, prompt: $('#aPrompt').value || '', agentId: $('#aAgent').value, host: $('#aHost').value,
    projectId: $('#aProject').value, workspaceMode: $('#aWorkspace').value, baseBranch: $('#aBranch').value,
    reuseSession: !!(reuse && reuse.dataset.reuse === '1'),
    preset: $('#aPreset').value, time: $('#aTime').value,
    missedRunGraceMinutes: parseInt($('#aGrace').value, 10) || 720,
    precheckCommand: $('#aPreCmd').value || '',
    precheckTimeoutSeconds: parseInt($('#aPreTimeout').value, 10) || 60,
  };
  S.automations = S.automations || [];
  if (autoEditing) Object.assign(autoEditing, data);
  else S.automations.push({ id: 'au' + now(), enabled: true, runCount: 0, ...data });
  save(true); $('#autoBack').hidden = true; autoEditing = null;
  renderAutomation();
  toast(`已保存自动化 <b>${escapeHtml(name)}</b>`);
}

/* ── 接线（bind() 末尾会调一次） ────────────────── */
function bindRails() {
  const open = which => {
    if (which === 'automation') { S.automationOpen = !S.automationOpen; S.sidePanel = null; save(true); renderSidePanel();
      if (S.automationOpen) { renderAutomation(); $('#autoSearch') && $('#autoSearch').focus(); } }
    else { S.automationOpen = false; openSidePanel(which); }
  };
  $$('.rail-btn').forEach(b => b.onclick = e => { e.stopPropagation(); open(b.dataset.open); });
  $$('[data-close]').forEach(b => b.onclick = () => {
    const id = b.dataset.close;
    if (id === 'panelAutomation') S.automationOpen = false;
    if (id === 'panelSide') S.sidePanel = null;
    save(true); renderSidePanel();
  });
  $$('#sideTabs button').forEach(b => b.onclick = () => { S.sidePanel = b.dataset.side; save(true); renderSidePanel(); });
  $('#sideRefresh').onclick = e => {
    e.stopPropagation();
    if (S.sidePanel === 'agents') { toast('已强制重扫会话（refresh force:true）'); renderSideVault(); }
    else { toast('已刷新目录树'); renderSideExplorer(); }
  };
  $('#sideLocate').onclick = e => { e.stopPropagation(); locateActiveFileInSidePanel(); };
  $('#sideCollapse').onclick = e => {
    e.stopPropagation();
    // FileExplorer.tsx:144 handleCollapseAll → collapseAllDirs
    S.explorerCollapsed = {}; 
    (defaultProject() ? [defaultProject()] : []).concat(realProjects()).forEach(p => {
      const walk = ns => (ns || []).forEach(n => { if (n.type === 'dir') { n.open = false; walk(n.children); } });
      walk(p.tree);
    });
    save(true); renderSideExplorer(); renderNav(); toast('已折叠全部目录');
  };
  $('#autoSearch').oninput = renderAutomation;
  $('#autoNew').onclick = e => { e.stopPropagation(); openAutomationDialog(null); };
  $('#autoCancel').onclick = () => { $('#autoBack').hidden = true; autoEditing = null; };
  $('#autoSave').onclick = saveAutomation;
  $('#autoBack').onclick = e => { if (e.target.id === 'autoBack') { $('#autoBack').hidden = true; autoEditing = null; } };
  $('#aName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveAutomation(); }
    if (e.key === 'Escape') e.stopPropagation(); });
  $('#aPrompt').addEventListener('keydown', e => { if (e.key === 'Escape') e.stopPropagation(); });
  $$('#aSession button').forEach(b => b.onclick = () =>
    $$('#aSession button').forEach(x => x.classList.toggle('is-on', x === b)));

  // §23.6 ⌘J
  const pin = $('#paletteInput');
  pin.oninput = () => { S.paletteQuery = pin.value; S.paletteSel = 0; renderPalette(); };
  pin.onkeydown = e => {
    const items = S.paletteItems || [];
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); openPaletteClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); S.paletteSel = Math.min(items.length - 1, (S.paletteSel || 0) + 1); renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); S.paletteSel = Math.max(0, (S.paletteSel || 0) - 1); renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[S.paletteSel]; if (it) it.run(); }
  };
  $('#paletteBack').onclick = e => { if (e.target.id === 'paletteBack') openPaletteClose(); };
  document.addEventListener('keydown', e => {
    // §23.6.5 正在录新的快捷键 —— 这一次按键只用来录，不再触发命令面板
    if (paletteShortcutArmed) {
      if (e.key === 'Escape') { paletteShortcutArmed = false; toast('已取消修改快捷键'); return; }
      const spec = shortcutFromEvent(e);
      if (!spec) return;                       // 只按修饰键 / 裸字母都不算
      e.preventDefault();
      paletteShortcutArmed = false;
      S.paletteShortcut = spec; save(true);
      refreshPaletteShortcutLabel();
      toast(`命令面板快捷键已改成 <b>${escapeHtml(shortcutLabel(spec))}</b>`);
      return;
    }
    // §23.6.1 键位照 definitions-core-1.ts:35（darwin Mod+J），默认 meta+j、可在设置里改
    if (shortcutMatches(S.paletteShortcut || 'meta+j', e)) {
      e.preventDefault();
      if ($('#paletteBack').hidden) openPalette(); else openPaletteClose();
    }
  });
  refreshPaletteShortcutLabel();
  renderSidePanel();

  // §25 落点线绑在**容器**上 —— 标签之间的空隙不触发标签的 dragover，
  // 只有容器能覆盖「鼠标移到哪、线就到哪」。drop 也在这里，保证线与落点同一套算法。
  const tabsBox = $('#tabs');
  if (tabsBox) {
    tabsBox.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; showDropLineAt(tabsBox, e, true); };
    tabsBox.ondragleave = e => { if (!tabsBox.contains(e.relatedTarget)) hideDropLine(); };
    tabsBox.ondrop = e => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/plain');
      hideDropLine();
      if (from === '') return;
      moveTabTo(+from, tabDropIndex(tabsBox, e, true));
    };
  }
  const tvBox = $('#tabsVertical');
  if (tvBox) {
    tvBox.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; showDropLineAt(tvBox, e, false); };
    tvBox.ondragleave = e => { if (!tvBox.contains(e.relatedTarget)) hideDropLine(); };
    tvBox.ondrop = e => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/plain');
      hideDropLine();
      if (from === '') return;
      moveTabTo(+from, tabDropIndex(tvBox, e, false));
    };
  }


  // ══ §28 风格条 ══
  $$('#styleBar .sb[data-style]').forEach(b => b.onclick = () => {
    S.uiStyle = b.dataset.style || ''; save(true); applyUiStyle();
    toast(`界面风格：<b>${b.textContent}</b>（只换颜色，功能与位置完全不变）`);
  });
  $('#styleHide') && ($('#styleHide').onclick = () => {
    $('#styleBar').hidden = true; $('#styleDot').hidden = false;
  });
  $('#styleDot') && ($('#styleDot').onclick = () => {
    $('#styleBar').hidden = false; $('#styleDot').hidden = true;
  });
  applyUiStyle();

  // ══ §27 输入框工具行：事件绑定（函数本身在模块级）══
  $('#ctMore') && ($('#ctMore').onclick = e => { e.stopPropagation();
    showMenu([
      { title: '更多' },
      { label: '新建文件', action: () => newTabAction('newFile') },
      { label: '终端', action: () => newTabAction('terminal') },
      { label: '新浏览器选项卡', action: () => newTabAction('browser') },
      { label: '搜索文件', action: () => newTabAction('search') },
      { label: '输入网址', action: () => newTabAction('url') },
      { sep: true },
      { label: 'Claude Code', action: () => newTabAction('claude') },
      { label: 'Pi', action: () => newTabAction('pi') },
    ], e.currentTarget);
  });
  $('#ctPerm') && ($('#ctPerm').onclick = e => { e.stopPropagation();
    showMenu([
      { title: '审批权限' },
      { label: (S.permission === 'default' ? '✓ ' : '　') + '✋ 默认权限', action: () => setPermission('default') },
      { label: (S.permission === 'approve' ? '✓ ' : '　') + '✎ 帮我审批', action: () => setPermission('approve') },
      { label: (S.permission === 'full' ? '✓ ' : '　') + '⊙ 完全访问权限', action: () => setPermission('full') },
    ], e.currentTarget);
  });
  function setPermission(v) { S.permission = v; save(true); updateComposerTools();
    toast(`审批权限：<b>${PERM[v]}</b>`); }
  $('#ctModel') && ($('#ctModel').onclick = e => { e.stopPropagation();
    showMenu([{ title: '模型' }].concat(
      MODELS.map(m => ({ label: (S.protoModel === m ? '✓ ' : '　') + m,
        action: () => { S.protoModel = m; save(true); updateComposerTools(); toast(`模型已切到 <b>${m}</b>`); } })),
      [{ sep: true }, { label: '⚙ 去设置里配模型…', action: () => { toast('真机这里进 设置 → 模型'); } }]
    ), e.currentTarget);
  });
  $('#ctMic') && ($('#ctMic').onclick = () => {
    S.mode = 'voice'; save(true); renderChatModes();
    toast('语音输入 —— 已切到<b>语音</b>模式（原型：真机上这里按住说话、直接听写）');
  });

  // §26 右侧独立会话的控件（与左边完全分开，只共享 S.dualScreen 这一个开关）
  const ta2 = $('#chatInput2');
  if (ta2) ta2.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat2(); }
  });
  $('#btnSend2') && ($('#btnSend2').onclick = () => sendChat2());
  $$('#chatSecond [data-conv2]').forEach(b2 => b2.onclick = () => {
    S.chat2Mode = b2.dataset.conv2; save(true);
    $$('#chatSecond [data-conv2]').forEach(x => {
      const on = x.dataset.conv2 === S.chat2Mode;
      x.classList.toggle('is-on', on);
      x.classList.toggle('temp', on && x.dataset.conv2 === 'temporary');
    });
    const lbl = $('#composerModeLabel2');
    if (lbl) lbl.textContent = S.chat2Mode === 'continuous' ? '连续会话' : '临时会话';
    renderChat2();
    toast(`右侧已切到<b>${S.chat2Mode === 'continuous' ? '连续' : '临时'}</b>（只影响这一侧）`);
  });
  $('#ccNew2') && ($('#ccNew2').onclick = () => {
    S.chat2 = []; save(true); renderChat2();
    toast('右侧已新建 —— 独立会话，与左边无关');
  });
  $$('#chatSecond [data-rate2]').forEach(b3 =>
    b3.onclick = e => { e.stopPropagation(); openRateMenu(b3, 'speechRate2'); });
  $('#hcOptions2') && ($('#hcOptions2').onclick = () =>
    toast('右侧选项：语速在这一行；发声受「主会话优先」互斥约束（见 🔇）'));

  // §24 滚动 → 高亮跟着走。★ rAF 节流：滚动事件一秒几十次，
  // 不节流的话每次都要遍历所有条目改 class，滑动时必卡。
  let histScrollRaf = 0;
  $('#msgs')?.addEventListener('scroll', () => {
    if (histScrollRaf) return;
    histScrollRaf = requestAnimationFrame(() => {
      histScrollRaf = 0;
      if (typeof spineUpdateActive === 'function') { spineUpdateActive(); spinePanning(); }   // §30
    });
  }, { passive: true });
}


/* ══════════════════════════════════════════════════════════════
   §31 监控 —— 从 Docker 项目 Monitor 完整移植三张表（费用 / 软件 / Debate）
   出处（explore 报告，全部带 文件:行号）：
     /Users/mjm/Documents/SuperAgent/APP/Docker/Monitor/public/index.html
       三栏布局 :1092 · 费用表 :1188（SSR 由 server.mjs:1752-1784 注入）
       软件表 :1200 + renderSw :2039-2088 · Debate :1211（静态 7 笔 :1221-1227）
       倒计时：Debate :1854-1864 / 欧云VPS :1869+ / Infer :1887+，每 60s 刷
       样式：styles/base.css:67-135（表头绿 #4ade80/列竖线）+ 内联 :31-107（26px 行高）
   中间的 health-table（最近调用/中转健康）与 自动化/Agents 两块**按你的要求剔除**。
   数据 = 删除容器前抓的运行时快照（费用 SSR 行、Debate 静态 7 笔、软件 4 app）——
   容器删除后页面照常：倒计时/渲染是纯前端逻辑，数值来自快照（顶栏如实标注）。
   布局按你的规矩：选项（全部/费用/软件/debate）在左栏，表格在右侧整页；
   「全部」= 三表从上到下排列、中间分隔线。
   ══════════════════════════════════════════════════════════════ */
const MONITOR_BAL_TABLE = "<table class=\"bal-table\" id=\"bal-table\">\n        <colgroup><col class=\"fee-col\"><col class=\"fee-col\"></colgroup>\n        <thead>\n          <tr><th colspan=\"4\">费用</th></tr>\n        </thead>\n        <tbody><tr><td>2硒鼓</td><td>6000张A4</td></tr><tr id=\"tr-volc-probe\"><td class=\"td-volc-near\">15天</td><td class=\"td-volc-probe\"><span class=\"volc-num ok\">138</span><span class=\"volc-num ok\">137</span></td></tr><tr id=\"tr-vps\"><td class=\"td-time td-vps-days\" data-deadline=\"2026-09-22\">--</td><td class=\"td-body\">欧云VPS</td></tr><tr id=\"tr-mem0\"><td class=\"td-mem0-add\">5%写入</td><td class=\"td-mem0-retrieval\">14%检索</td></tr><tr id=\"tr-codex\"><td class=\"td-codex-remaining\">剩--</td><td class=\"td-body td-codex-reset\" data-reset-at=\"\">--GPT</td></tr><tr id=\"tr-infer\"><td class=\"td-time td-infer-days\" data-deadline=\"2026-09-08T21:38\">--</td><td class=\"td-body\">Infer</td></tr></tbody>\n      </table>";
const MONITOR_DEBATE_TABLE = "<table class=\"bal-table\" id=\"debate-table\">\n        <colgroup>\n          <col class=\"debate-countdown\">\n          <col class=\"debate-amount\">\n          <col class=\"debate-name\">\n        </colgroup>\n        <thead>\n          <tr><th colspan=\"3\" class=\"debate-head\"><span class=\"debate-title\">Debt</span><span class=\"debate-total\">5676元</span></th></tr>\n        </thead>\n        <tbody>\n          <tr><td data-deadline=\"2026-10-03\">--</td><td>405元</td><td>贷款优选</td></tr>\n          <tr><td data-deadline=\"2026-10-10\">--</td><td>158元</td><td>花呗</td></tr>\n          <tr><td data-deadline=\"2026-10-10\">--</td><td>1826元</td><td>金条</td></tr>\n          <tr><td data-deadline=\"2026-10-10\">--</td><td>969元</td><td>月付</td></tr>\n          <tr><td data-deadline=\"2026-10-13\">--</td><td>1412元</td><td>放心借</td></tr>\n          <tr><td data-deadline=\"2026-10-16\">--</td><td>361元</td><td>借呗</td></tr>\n          <tr><td data-deadline=\"2026-10-28\">--</td><td>545元</td><td>白条</td></tr>\n        </tbody>\n      </table>";
const MONITOR_SW_TABLE = "<table class=\"bal-table\" id=\"sw-table\">\n        <thead><tr><th>软件</th></tr></thead>\n        <tbody id=\"sw-tbody\"><tr><td>加载中…</td></tr></tbody>\n      </table>";
const MONITOR_SW_DATA = {"updatedAt": "2026-09-23 19:51:55", "apps": [{"name": "Orca", "running": true, "startedAt": "23日18:56"}, {"name": "Things", "running": true, "startedAt": "22日23:51"}, {"name": "TG", "running": true, "startedAt": "22日23:51", "eagleToday": 0}, {"name": "一号录播", "running": true, "startedAt": "22日23:51"}], "live": []};

let monitorOpen = false;
let monitorSel = 'all';
let monitorTimer = 0;
const MONITOR_OPTS = [['all', '全部'], ['bal', '费用'], ['sw', '软件'], ['deb', 'debate']];
const MONITOR_SW_ALLOW = ['Orca', 'Things', 'TG', '一号录播'];   // renderSw 白名单（源码 :2038）

function renderMonitorNav() {
  const el = $('#monitorNav'); if (!el) return;
  el.innerHTML = `<div class="nav-head"><span class="sect" style="cursor:default">监控 <span class="caret">⌄</span></span></div>`
    + MONITOR_OPTS.map(([v, l]) =>
      `<div class="proj-row monitor-opt${monitorSel === v ? ' is-on' : ''}" data-mon="${v}">${l}</div>`).join('');
  $$('#monitorNav [data-mon]').forEach(b => b.onclick = () => {
    monitorSel = b.dataset.mon;
    renderMonitorNav(); renderMonitorPane();
  });
}
function monitorSectionsHTML() {
  const parts = [];
  if (monitorSel === 'all' || monitorSel === 'bal') parts.push(`<section class="mon-sec">${MONITOR_BAL_TABLE}</section>`);
  if (monitorSel === 'all' || monitorSel === 'sw') parts.push(`<section class="mon-sec">${MONITOR_SW_TABLE}</section>`);
  if (monitorSel === 'all' || monitorSel === 'deb') parts.push(`<section class="mon-sec">${MONITOR_DEBATE_TABLE}</section>`);
  return parts.join('<div class="mon-sep"></div>');          // 全部视图：三表竖排 + 分隔线
}
function renderMonitorPane() {
  const pane = $('#monitorPane'); if (!pane) return;
  pane.innerHTML = `<div class="mon-bar"><span class="mon-title">监控</span>
      <span class="mon-snap">数据快照 2026-10-01（原 Monitor 容器已按约定删除 —— 倒计时与渲染逻辑照原版实时跑，数值为快照）</span></div>`
    + monitorSectionsHTML();
  renderMonitorSw(MONITOR_SW_DATA);
  monitorCountdowns();
}
/// renderSw 逐字移植（源码 index.html:2039-2088）：白名单 + 红绿点 + 计数徽章；
/// 去掉两处容器依赖 —— openApp → toast（原版 /api/app/open 会真开软件）、renderLive → 无（health 表已剔）
function renderMonitorSw(data) {
  const swTbody = document.querySelector('#monitorPane #sw-tbody');
  if (!swTbody) return;
  const apps = ((data && data.apps) || []).filter(a => MONITOR_SW_ALLOW.includes(a.name));
  const live = (data && data.live) || [];
  swTbody.innerHTML = '';
  apps.forEach(a => {
    const tr = document.createElement('tr');
    const tdN = document.createElement('td'); tdN.className = 'td-mg-sw';
    const dot = document.createElement('span');
    dot.className = 'health-dot' + (a.running ? '' : ' st-down');
    tdN.appendChild(dot);
    const link = document.createElement('a');
    link.className = 'app-name-link';
    link.textContent = a.name;
    link.title = '原型不打开本机软件（原版走容器 /api/app/open，已随 monitor 删除）';
    link.onclick = () => toast('原型不打开本机软件 —— 原版走 Monitor 容器的 /api/app/open');
    tdN.appendChild(link);
    if (a.eagleToday != null) {
      const cnt = document.createElement('span');
      cnt.className = 'mg-count';
      cnt.textContent = a.eagleToday;
      tdN.appendChild(cnt);
    }
    if (a.name === '一号录播' && live.length) {
      const btn = document.createElement('span');
      btn.className = 'live-count-btn';
      btn.textContent = live.length;
      btn.title = '正在直播的主播数（health 表已按要求剔除，仅显示数量）';
      tdN.appendChild(btn);
    }
    tr.appendChild(tdN);
    swTbody.appendChild(tr);
  });
  if (!apps.length) swTbody.innerHTML = '<tr><td>加载中…</td></tr>';
}
/// 三个倒计时 1:1 移植（源码 :1854-1864 Debate / :1869+ 欧云VPS / :1887+ Infer）——
/// 每 60s 重算；data-deadline 是快照里的真实日期，所以删容器后照样跳数
function monitorCountdowns() {
  const root = document.querySelector('#monitorPane');
  if (!root || root.hidden) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  root.querySelectorAll('#debate-table [data-deadline]').forEach(td => {
    const end = new Date(td.dataset.deadline + 'T23:59:59');
    const days = Math.ceil((end - today) / 86400000);
    td.textContent = days > 0 ? days + '天' : (days === 0 ? '今天' : '已到期');
  });
  const vps = root.querySelector('#tr-vps .td-vps-days');
  if (vps) {
    const end = new Date(vps.dataset.deadline + 'T23:59:59');
    const days = Math.ceil((end - today) / 86400000);
    vps.textContent = days > 0 ? days + '天' : (days === 0 ? '今天' : '已到期' + (-days) + '天');
  }
  const inf = root.querySelector('#tr-infer .td-infer-days');
  if (inf) {
    const rem = new Date(inf.dataset.deadline) - new Date();
    inf.textContent = rem <= 0 ? '已到期'
      : (rem >= 86400000 ? '剩' + Math.ceil(rem / 86400000) + '天'
        : '剩' + Math.max(1, Math.ceil(rem / 3600000)) + '时');
  }
}
/// 监控模式开关 —— 左栏：搜索+项目/默认列表 ⇄ 监控选项；右栏：编辑区+对话+分隔+右 rail
/// 全部换成监控页；nav-quick（设置/历史/添加/角色/录音）原样保留（你点名的"设置部分保留不变"）
function setMonitorMode(on) {
  if (on && typeof finderOpen !== 'undefined' && finderOpen) setFinderOpen(false);   // §34 两个独立页互斥
  monitorOpen = on;
  document.querySelectorAll('#navQuick button[data-q="monitor"]')
    .forEach(b => b.classList.toggle('is-on', on));
  const sw = document.querySelector('.nav-search-wrap'), ns = $('#navScroll'), mn = $('#monitorNav');
  if (sw) sw.hidden = on;
  if (ns) ns.hidden = on;
  if (mn) mn.hidden = !on;
  ['.workspace', '.chat', '.split-v', '.split-h', '#railRight', '#panelSide', '#panelAutomation']
    .forEach(sel => document.querySelectorAll(sel).forEach(el => {
      if (on) { el.dataset.monHide = '1'; el.style.display = 'none'; }
      else if (el.dataset.monHide) { delete el.dataset.monHide; el.style.display = ''; }
    }));
  const pane = $('#monitorPane');
  if (pane) pane.hidden = !on;
  clearInterval(monitorTimer); monitorTimer = 0;
  if (on) {
    renderMonitorNav();
    renderMonitorPane();
    monitorTimer = setInterval(monitorCountdowns, 60 * 1000);   // 源码同款 60s
  } else {
    // 退出后让侧面板按自己的状态重算显隐（renderSidePanel/renderAutomation 幂等）
    if (typeof renderSidePanel === 'function') renderSidePanel();
  }
}

/* ══════════════════════════════════════════════════════════════
   §34 访达 —— 独立文件浏览器（顶栏最左开关）
   你的原话：关闭=现状；打开时「对话区域完整保留放最右侧」，左侧是完整访达：
   视图（图标/列表/分栏）· 各种形式分组 · 窗口分屏（单/左右/上下/3/四宫格）·
   窗口内容交换（⇄ 左→右）· 路径栏（点击跳转 / 点击输入 / ⌘L）·
   左侧收藏栏（多分组、组名可改、条目上下移动+拖动、可加标签）·
   中间列 名称/大小/修改日期/添加日期 + 表头右键选列（照 Finder 图：16 项含多媒体/其他/恢复默认）·
   分栏视图中缝可拖宽。
   虚拟 FS 数据为演示数据（样例项目 + 常见目录），不碰磁盘。
   ══════════════════════════════════════════════════════════════ */

/// 虚拟文件系统：path → 子项数组（{d:目录名,m,a} / {f:文件名,s,m,a,t}）
const FP_FS = {
  '/': [{ d: 'Applications', m: '2026/1/4', a: '2024/3/2' }, { d: 'Users', m: '2026/9/1', a: '2024/3/2' },
        { d: 'System', m: '2026/8/18', a: '2024/3/2' }, { d: 'Library', m: '2026/9/28', a: '2024/3/2' }],
  '/Users': [{ d: 'mjm', m: '2026/10/1', a: '2024/3/2' }],
  '/Users/mjm': [{ d: 'Desktop', m: '2026/9/30', a: '2026/8/30' }, { d: 'Documents', m: '2026/9/28', a: '2026/8/30' },
    { d: 'Downloads', m: '2026/9/27', a: '2026/8/30' }, { d: 'Movies', m: '2026/9/12', a: '2026/8/30' },
    { d: 'Pictures', m: '2026/9/18', a: '2026/8/30' },
    { f: '.zshrc', s: '4KB', m: '2026/8/12', a: '2026/8/12', t: 'txt' }],
  '/Users/mjm/Desktop': [{ d: '【课件】', m: '2026/9/19', a: '2026/9/19' }, { d: 'AI【工具】', m: '2026/9/18', a: '2026/9/15' },
    { d: 'Wanna 临时目录', m: '2026/9/23', a: '2026/9/23' },
    { f: 'AI-Agent-功能脑图-2026.md', s: '128KB', m: '2026/9/26', a: '2026/9/20', t: 'md' },
    { f: 'pdoom.mp3', s: '3.2MB', m: '2026/8/30', a: '2026/8/30', t: 'mp3' },
    { f: '屏幕快照 2026-10-01.png', s: '1.8MB', m: '2026/10/1', a: '2026/10/1', t: 'png' },
    { f: '出口四测试', s: '—', m: '2026/9/24', a: '2026/9/24' }],
  '/Users/mjm/Documents': [{ d: 'SuperAgent', m: '2026/10/1', a: '2026/8/30' }, { d: 'WeChat Files', m: '2026/9/10', a: '2026/8/30' },
    { f: '发票-9月.pdf', s: '212KB', m: '2026/9/30', a: '2026/9/30', t: 'pdf' }],
  '/Users/mjm/Downloads': [{ f: 'install.dmg', s: '420MB', m: '2026/9/27', a: '2026/9/27', t: 'dmg' },
    { f: '数据.csv', s: '86KB', m: '2026/9/26', a: '2026/9/26', t: 'csv' }],
  '/Users/mjm/Movies': [{ f: '录屏 2026-09-24.mov', s: '1.2GB', m: '2026/9/24', a: '2026/9/24', t: 'mov' }],
  '/Users/mjm/Pictures': [{ f: '屏幕快照.png', s: '980KB', m: '2026/9/18', a: '2026/9/18', t: 'png' }],
  '/Users/mjm/Documents/SuperAgent': [
    { d: 'Wanna', m: '2026/10/1', a: '2026/8/30' }, { d: 'Agent', m: '2026/10/1', a: '2026/8/30' },
    { d: 'APP', m: '2026/9/29', a: '2026/8/30' }, { d: '架构说明', m: '2026/9/20', a: '2026/9/1' },
    { d: '我的笔记项目', m: '2026/10/1', a: '2026/9/16' }],
  '/Users/mjm/Documents/SuperAgent/我的笔记项目': [
    { d: 'notes', m: '2026/9/30', a: '2026/9/16' }, { d: '网页', m: '2026/9/20', a: '2026/9/16' },
    { d: '资料', m: '2026/9/24', a: '2026/9/16' },
    { f: 'README.md', s: '7KB', m: '2026/9/22', a: '2026/9/16', t: 'md' },
    { f: '脑图.mmd', s: '12KB', m: '2026/9/30', a: '2026/9/16', t: 'mmd' },
    { f: '新文件.md', s: '2KB', m: '2026/10/1', a: '2026/10/1', t: 'md' },
    { f: 'platform.xiaomimimo.com', s: '—', m: '2026/9/28', a: '2026/9/28', t: 'web' }],
  '/Users/mjm/Documents/SuperAgent/我的笔记项目/notes': [
    { f: '2026-09-30-会议.md', s: '9KB', m: '2026/9/30', a: '2026/9/30', t: 'md' },
    { f: '灵感.md', s: '3KB', m: '2026/9/28', a: '2026/9/16', t: 'md' }],
  '/Users/mjm/Documents/SuperAgent/我的笔记项目/网页': [
    { f: '示例.html', s: '6KB', m: '2026/9/20', a: '2026/9/16', t: 'html' }],
  '/Users/mjm/Documents/SuperAgent/我的笔记项目/资料': [
    { f: '竞品对比.md', s: '5KB', m: '2026/9/24', a: '2026/9/16', t: 'md' },
    { f: '样例.pdf', s: '1.1MB', m: '2026/9/18', a: '2026/9/16', t: 'pdf' }],
  '/Users/mjm/Documents/SuperAgent/Wanna': [
    { f: 'index.html', s: '96KB', m: '2026/10/1', a: '2026/9/16', t: 'html' },
    { f: 'app.js', s: '312KB', m: '2026/10/1', a: '2026/9/16', t: 'js' },
    { f: 'app.css', s: '88KB', m: '2026/10/1', a: '2026/9/16', t: 'css' }],
  // §39.3 演示数据补树深度（对照图2：目录→子→孙→文件，多层缩进可见）
  '/Users/mjm/Desktop/【课件】': [
    { d: '01-数学', m: '2026/9/19', a: '2026/9/19' },
    { d: '02-语文', m: '2026/9/19', a: '2026/9/19' },
    { f: '课件说明.md', s: '2KB', m: '2026/9/19', a: '2026/9/19', t: 'md' }],
  '/Users/mjm/Desktop/【课件】/01-数学': [
    { f: '公式表.md', s: '5KB', m: '2026/9/20', a: '2026/9/19', t: 'md' },
    { f: '例题集.pdf', s: '820KB', m: '2026/9/18', a: '2026/9/19', t: 'pdf' }],
  '/Users/mjm/Desktop/【课件】/02-语文': [{ f: '古诗清单.txt', s: '3KB', m: '2026/9/19', a: '2026/9/19', t: 'txt' }],
  '/Users/mjm/Desktop/AI【工具】': [
    { d: '脚本', m: '2026/9/18', a: '2026/9/15' },
    { f: '工具清单.md', s: '6KB', m: '2026/9/18', a: '2026/9/15', t: 'md' }],
  '/Users/mjm/Desktop/AI【工具】/脚本': [{ f: '一键部署.sh', s: '4KB', m: '2026/9/18', a: '2026/9/15', t: 'sh' }],
  '/Users/mjm/Desktop/Wanna 临时目录': [{ f: '临时笔记.txt', s: '1KB', m: '2026/9/23', a: '2026/9/23', t: 'txt' }],
  // §36.12 位置（外置磁盘）与 iCloud 的演示目录 —— 侧栏点这些条目要能落到真实列表
  '/Volumes/ExtSSD-Backup': [
    { d: 'TimeMachine', m: '2026/9/30', a: '2026/1/4' },
    { d: '项目备份', m: '2026/9/28', a: '2026/3/12' },
    { f: '备份-2026-09.tar.gz', s: '1.4GB', m: '2026/9/30', a: '2026/9/30', t: 'gz' }],
  '/Volumes/DATA': [
    { d: '素材', m: '2026/9/20', a: '2026/5/2' },
    { f: '资料.xlsx', s: '86KB', m: '2026/9/21', a: '2026/5/2', t: 'xlsx' },
    { f: 'U盘说明.txt', s: '1KB', m: '2026/8/2', a: '2026/8/2', t: 'txt' }],
  '/Users/mjm/Library/Mobile Documents/com~apple~CloudDocs': [
    { d: 'Shortcuts', m: '2026/9/12', a: '2026/3/2' },
    { d: '下载', m: '2026/9/29', a: '2026/3/2' },
    { f: 'iCloud备忘.txt', s: '3KB', m: '2026/9/29', a: '2026/9/1', t: 'txt' }],
  '/Users/mjm/Library/Mobile Documents/com~apple~Shared': [
    { d: '家庭共享', m: '2026/9/10', a: '2026/4/8' },
    { f: '共享清单.md', s: '2KB', m: '2026/9/10', a: '2026/4/8', t: 'md' }],
};

const FP_COL_DEFS = [['size', '大小'], ['mtime', '修改日期'], ['ctime', '创建日期'], ['atime', '上次打开日期'],
  ['added', '添加日期'], ['kind', '种类'], ['editor', '上次修改者'], ['owner', '共享者'],
  ['version', '版本'], ['comment', '注释'], ['tag', '标签']];
const FP_COLS_DEFAULT = ['size', 'mtime', 'added'];       // 照 Finder 照片勾选（名称恒显）
const FP_GROUP_OPTS = [['none', '不分组'], ['kind', '种类'], ['name', '名称首字母'], ['added', '添加日期'], ['mtime', '修改日期']];
const FP_COL_LABEL = { name: '名称', size: '大小', mtime: '修改日期', ctime: '创建日期', atime: '上次打开日期',
  added: '添加日期', kind: '种类', editor: '上次修改者', owner: '共享者', version: '版本', comment: '注释', tag: '标签' };
const FP_DEFAULT_SIDE = [
  // §36.12 位置（磁盘）与 iCloud 置顶 —— 你：「左侧边要显示外置磁盘、iCloud」（老存盘由 fpSide 迁移补）
  { id: 'loc', name: '位置', items: [
    { name: 'Macintosh HD', path: '/' },
    { name: 'ExtSSD-Backup', path: '/Volumes/ExtSSD-Backup' },
    { name: 'U盘-DATA', path: '/Volumes/DATA' }] },
  { id: 'icloud', name: 'iCloud', items: [
    { name: 'iCloud 云盘', path: '/Users/mjm/Library/Mobile Documents/com~apple~CloudDocs' },
    { name: '与我共享', path: '/Users/mjm/Library/Mobile Documents/com~apple~Shared' }] },
  { id: 'fav', name: '收藏', items: [
    { name: '桌面', path: '/Users/mjm/Desktop' }, { name: '下载', path: '/Users/mjm/Downloads' },
    { name: 'SuperAgent', path: '/Users/mjm/Documents/SuperAgent' }] },
  { id: 'tag', name: '标签', items: [
    { name: '红色', tag: '#FF5F57' }, { name: '蓝色', tag: '#54A2FF' }, { name: '绿色', tag: '#2CCB6E' }] },
  { id: 'recent', name: '最近', items: [{ name: '我的笔记项目', path: '/Users/mjm/Documents/SuperAgent/我的笔记项目' }] },
];
/// 右收藏栏默认分组（照你照片右侧那列：Harness / Agents / APP / Data…，条目给演示路径）
const FP_DEFAULT_SIDE_R = [
  { id: 'r-harness', name: 'Harness', items: [{ name: 'Harness' }] },
  { id: 'r-agents', name: 'Agents', items: [
    { name: 'Agent', path: '/Users/mjm/Documents/SuperAgent/Agent' },
    { name: 'Wanna', path: '/Users/mjm/Documents/SuperAgent/Wanna' },
    { name: 'Skill' }] },
  { id: 'r-app', name: 'APP', items: [
    { name: 'APP', path: '/Users/mjm/Documents/SuperAgent/APP' }, { name: 'Docker' }, { name: 'Test' }] },
  { id: 'r-data', name: 'Data', items: [{ name: 'Data' }, { name: 'Sync' }, { name: 'Wiki' }] },
];

let finderOpen = false;
const FP = {
  view: 'list', group: 'none',
  cols: (Array.isArray(S.finderColsDefault) && S.finderColsDefault.length) ? [...S.finderColsDefault] : [...FP_COLS_DEFAULT],
  layout: 'single', active: 0, split: '50%', colW: 220,
  sortKey: null, sortDir: 'asc',            // §35.4 列头点击排序（null=原序：目录前+原顺序）
  lastClick: null,                          // §35.2 自维护双击检测 {pi,name,t}（单击重绘后 dblclick 事件会断）
  drag: null,                               // §36 统一拖拽状态：{kind:'file'|'group'|'item', …}（跨侧栏/窗格作用域）
  // §37.12 ⋮显示设置面板（图标尺寸32 / 文字14 / 斑马✓ / 文件夹置顶✓ / 隐藏文件off —— 基准取自图5）
  iconSize: (S.finderView && S.finderView.iconSize) || 32,
  fontSize: (S.finderView && S.finderView.fontSize) || 14,
  zebraOn: !(S.finderView && S.finderView.zebraOn === false),
  dirsTop: !(S.finderView && S.finderView.dirsTop === false),
  showHidden: !!(S.finderView && S.finderView.showHidden),
  sidePreview: !!(S.finderView && S.finderView.sidePreview),
  nameSort: !!(S.finderView && S.finderView.nameSort),
  panes: [{ path: '/Users/mjm', sel: null, expanded: [] }],
  sides: { L: null, R: null },     // 懒加载自 S.finderSide / S.finderSideR（左右两栏各自独立）
  clipboard: null,                 // §41.7 Cmd+C/X 的内容 {mode:'copy'|'cut', items:[{dir,name}]}
  hkRecording: null,               // §41.8 正在录制键位的动作 id（null=没在录）
  hkPanelOpen: false,              // §41.8 快捷键设置面板开合
};
/// §41.7/41.8 访达快捷键 —— 默认键位里 ⌘D/⌥D 两条是 QSpace 的**真值**
/// （reference/QSpacePro-DISSECT.md §9.3 `hotkey.json`：go_desktop=⌘D、go_downloads=⌥D），
/// 其余四条是你点名的系统惯例。存 S.finderHotkeys（localStorage 整对象序列化 → 改了就存得住）。
const FP_HOTKEY_DEFAULTS = {
  selectAll: 'Cmd+A', copy: 'Cmd+C', cut: 'Cmd+X', paste: 'Cmd+V',
  goDesktop: 'Cmd+D', goDownloads: 'Alt+D',
};
const FP_HOTKEY_LABELS = {
  selectAll: '全选', copy: '复制', cut: '剪切', paste: '粘贴',
  goDesktop: '前往桌面', goDownloads: '前往下载',
};
function fpHotkeys() {
  const out = { ...FP_HOTKEY_DEFAULTS };
  const saved = S.finderHotkeys;
  if (saved && typeof saved === 'object') {
    Object.keys(out).forEach(id => {
      if (typeof saved[id] === 'string' && saved[id].trim()) out[id] = saved[id].trim();
    });
  }
  return out;
}
/// 事件 → 组合串（与录制时用的是同一条，保证"录下来的就是按出来的"）
/// 字母/数字一律取 e.code（⌥D 在 macOS 上 e.key 是 '∂'，读 key 必错）
function fpComboFromEvent(e) {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null;   // 只按了修饰键
  let k;
  if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) k = e.code.slice(5);
  else if (e.key && e.key.length === 1) k = e.key.toUpperCase();
  else k = (e.key || '').replace('Arrow', '');
  if (!k) return null;
  const parts = [];
  if (e.metaKey) parts.push('Cmd');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}
const fpSideStoreKey = k => k === 'R' ? 'finderSideR' : 'finderSide';
/// §36 侧栏数据形状 = { groups: [...], ungrouped: [...] }（36.5 不分组收藏区）；
/// 老存盘是纯数组 → 迁移；左栏若无「位置/iCloud」组 → 头部补（36.12）
function fpSideNormalize(raw, isLeft) {
  let data = Array.isArray(raw) ? { groups: raw, ungrouped: [] }
    : (raw && Array.isArray(raw.groups)) ? { groups: raw.groups, ungrouped: Array.isArray(raw.ungrouped) ? raw.ungrouped : [] }
    : { groups: [], ungrouped: [] };
  data.groups = data.groups.filter(g => g && Array.isArray(g.items));
  data.groups.forEach(g => { if (typeof g.collapsed !== 'boolean') g.collapsed = false; });
  if (isLeft && !data.groups.some(g => g.id === 'loc')) {
    const def = JSON.parse(JSON.stringify(FP_DEFAULT_SIDE));
    data.groups.unshift(def[0], def[1]);           // 位置 + iCloud（老存盘迁移）
  }
  return data;
}
function fpSide(k) {
  if (!FP.sides[k]) {
    const raw = S[fpSideStoreKey(k)];
    const seed = (raw && (Array.isArray(raw) || (raw && Array.isArray(raw.groups))))
      ? raw : JSON.parse(JSON.stringify(k === 'R' ? FP_DEFAULT_SIDE_R : FP_DEFAULT_SIDE));
    FP.sides[k] = fpSideNormalize(seed, k !== 'R');
  }
  return FP.sides[k];
}
function fpSaveSide(k) { S[fpSideStoreKey(k)] = FP.sides[k]; save(true); }
function fpEntries(path) {
  const arr = FP_FS[path] || [];
  // §37.12 「显示隐藏文件」开关（默认关 → 过滤 . 开头，如 .zshrc）
  const base = FP.showHidden ? arr : arr.filter(x => !(x.d || x.f || '').startsWith('.'));
  const dirs = base.filter(x => x.d).map(x => ({ name: x.d, dir: true, s: '—', m: x.m || '—', a: x.a || '—', kind: '文件夹', tag: x.tag }));
  const files = base.filter(x => x.f).map(x => ({ name: x.f, dir: false, s: x.s || '—', m: x.m || '—', a: x.a || '—',
    kind: (x.f.includes('.') ? x.f.split('.').pop() : '') || '—', t: x.t, tag: x.tag }));
  return [...dirs, ...files];
}
function fpJoin(base, name) { return base === '/' ? '/' + name : base + '/' + name; }
/// §38.3 文件类型色（照你图6/图7：代码文本类蓝、图片青、音视频橙紫、压缩绿、pdf 红）
const FP_FILE_COLORS = {
  md: '#3E8FE8', js: '#3E8FE8', mjs: '#3E8FE8', ts: '#3E8FE8', css: '#3E8FE8', json: '#3E8FE8',
  py: '#3E8FE8', sh: '#3E8FE8', swift: '#3E8FE8', yml: '#3E8FE8', yaml: '#3E8FE8', txt: '#6E7681',
  png: '#45ACE6', jpg: '#45ACE6', jpeg: '#45ACE6', gif: '#45ACE6', webp: '#45ACE6', heic: '#45ACE6',
  mp3: '#F7A23B', wav: '#F7A23B', m4a: '#F7A23B', aac: '#F7A23B',
  mov: '#BF5AF2', mp4: '#BF5AF2', mkv: '#BF5AF2',
  zip: '#2CCB6E', gz: '#2CCB6E', tgz: '#2CCB6E', rar: '#2CCB6E', '7z': '#2CCB6E',
  pdf: '#E5484D',
};
/// §37.3 图标 = macOS 蓝文件夹 / 白折角文档（SVG，色值取自你图4：#57BEF0→#45ACE6）
function fpIco(entry) {
  if (entry.dir) {
    return `<span class="fp-ico fp-dir"><svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.2 6.2c0-1 .8-1.8 1.8-1.8h5c.5 0 1 .2 1.4.6l1.1 1.1H20c1 0 1.8.8 1.8 1.8v9.9c0 1-.8 1.8-1.8 1.8H4c-1 0-1.8-.8-1.8-1.8V6.2z" fill="#57BEF0"/>
      <path d="M2.2 9.2h19.6v8.7c0 1-.8 1.8-1.8 1.8H4c-1 0-1.8-.8-1.8-1.8V9.2z" fill="#45ACE6"/>
      <path d="M2.2 9.2h19.6v1.6H2.2z" fill="#6AC7F5" opacity=".85"/></svg></span>`;
  }
  const rawExt = (entry.name.includes('.') ? entry.name.split('.').pop() : '').toLowerCase();
  const ext = (rawExt || '?').slice(0, 2).toUpperCase();
  // html 保留白页（图7 实证）；其余按类型上色（图6/图7 实证：md/js/css 蓝、png 青、mp3 橙…）
  if (rawExt === 'html' || rawExt === 'htm' || !rawExt) {
    return `<span class="fp-ico"><svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 3.5h9l4.5 4.5v12.5c0 .8-.7 1.5-1.5 1.5h-12c-.8 0-1.5-.7-1.5-1.5v-15c0-.8.7-1.5 1.5-1.5z" fill="#F4F6F7" stroke="#B8C0C4" stroke-width=".8"/>
      <path d="M14.5 3.5L19 8h-4.5V3.5z" fill="#D3DADD"/>
      <text x="12" y="16.5" text-anchor="middle" font-size="6.5" font-weight="700" fill="#6A747A">${escapeHtml(ext)}</text>
      <rect x="6" y="18.5" width="7" height="1.4" rx=".7" fill="#C6CDD1"/>
      <rect x="6" y="20.8" width="5" height="1.4" rx=".7" fill="#D8DEE1"/></svg></span>`;
  }
  const color = FP_FILE_COLORS[rawExt] || '#8E959B';
  return `<span class="fp-ico" style="background:${color};color:#fff;border-radius:5px;
    display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:800">${escapeHtml(ext)}</span>`;
}
function fpColValue(entry, key) {
  if (key === 'name') return '';
  if (key === 'size') return entry.s;
  if (key === 'mtime') return entry.m;
  if (key === 'added') return entry.a;
  if (key === 'kind') return entry.kind;
  return '—';                                       // 数据里没有的列如实显示 —
}
function fpGroupValue(entry, g) {
  if (g === 'kind') return entry.dir ? '文件夹' : entry.kind;
  if (g === 'name') { const c = entry.name[0] || '#'; return /^[A-Za-z]/.test(c) ? c.toUpperCase() : '#'; }
  if (g === 'added') { const p = entry.a.split('/'); return p.length >= 2 ? p[0] + '/' + p[1] : entry.a; }
  if (g === 'mtime') { const p = entry.m.split('/'); return p.length >= 2 ? p[0] + '/' + p[1] : entry.m; }
  return '';
}

function setFinderOpen(on) {
  if (on && monitorOpen) setMonitorMode(false);          // 两个独立页互斥
  finderOpen = on;
  S.finderOpen = on; save(true);
  $('#finderToggle')?.classList.toggle('is-on', on);
  document.body.classList.toggle('finder-on', on);
  const pane = $('#finderPane');
  if (pane) pane.hidden = !on;
  if (on) {
    // §37.5 访达住编辑区位：先收起编辑区（互斥），并临时回落到默认三段序
    // （center/left 的 order 表没有访达位，开着会让访达跑到对话右边）
    S.projectMode = false; save(); renderNav();
    const main = document.querySelector('.main');
    main && main.classList.remove('center-layout', 'left-layout');
    document.body.classList.remove('finder-hide-left', 'finder-hide-right');   // 每次打开复位三态=三段全显
    fpApplyFinderView();                                 // §37.1 图标/字号/斑马变量
    renderFinder();
  } else {
    const main = document.querySelector('.main');        // 关闭时恢复用户的对话位置
    if (main) {
      main.classList.toggle('center-layout', S.layout === 'center');
      main.classList.toggle('left-layout', S.layout === 'left');
    }
    syncThreeStateBtns();
  }
}
/// §37.6 三态按钮同步（is-off = 该侧被藏）
function syncThreeStateBtns() {
  const l = document.body.classList.contains('finder-hide-left');
  const r = document.body.classList.contains('finder-hide-right');
  $('#fpShowLeft')?.classList.toggle('is-off', l);
  $('#fpShowRight')?.classList.toggle('is-off', r);
  $('#fpFull')?.classList.toggle('is-on', l && r);
}
function renderFinder() {
  if (!finderOpen) return;
  // 工具栏状态
  $$('#fpViews button').forEach(b => b.classList.toggle('is-on', b.dataset.view === FP.view));
  $$('#fpLayouts button').forEach(b => b.classList.toggle('is-on', b.dataset.layout === FP.layout));
  // §35.6 全局路径行已删 —— 路径长在每个窗格顶上（fpPathRowHTML）
  renderFinderSide('L'); renderFinderSide('R'); renderFinderMain();
}
/// §35.6 每个窗格自带一行路径（QSpace 图7 的每窗格导航行）：点击跳该层、双击/⌘L 输入
function fpPathRowHTML(pane, pi) {
  const parts = pane.path.split('/').filter(Boolean);
  let cum = '';
  const crumbs = [`<button class="fp-crumb" data-p="/" data-pi="${pi}" title="/">Macintosh HD</button>`]
    .concat(parts.map(p => {
      cum += '/' + p;
      return `<span class="fp-crumb-sep">▸</span><button class="fp-crumb" data-p="${escapeHtml(cum)}" data-pi="${pi}">${escapeHtml(p)}</button>`;
    }));
  // §37.9 照图2：左 [‹›⌃↻] 圆钮 + 胶囊路径 + 右 [🔍⋮]；搜索态重绘后仍保持输入框
  const searchHTML = pane.searching
    ? `<input id="fpSearchInput" spellcheck="false" placeholder="搜索此窗格…" value="${escapeHtml(pane.q || '')}">`
    : crumbs.join('');
  return `<div class="fp-addr" data-pi="${pi}">
    <div class="fa-nav">
      <button class="fa-ico" data-fa="back" title="后退">‹</button>
      <button class="fa-ico" data-fa="fwd" title="前进">›</button>
      <button class="fa-ico" data-fa="up" title="上一层">⌃</button>
      <button class="fa-ico" data-fa="reload" title="刷新">↻</button>
    </div>
    <div class="fa-pill" title="点段落跳转 · 点空白输入路径">${searchHTML}</div>
    <div class="fa-right">
      <button class="fa-ico" data-fa="search" title="搜索此窗格">🔍</button>
      <button class="fa-ico" data-fa="more" title="显示设置">⋮</button>
    </div>
  </div>`;
}
/// §37.9 窗格级路径导航（‹› 记历史；⌃ 上一层；所有跳转统一走这里以便记历史）
function fpNavTo(pi, path, pushHistory) {
  const p = FP.panes[pi]; if (!p) return;
  if (!Array.isArray(p.hist)) { p.hist = [p.path]; p.hi = 0; }
  if (pushHistory) {
    p.hist = p.hist.slice(0, p.hi + 1);
    if (p.hist[p.hi] !== path) { p.hist.push(path); p.hi = p.hist.length - 1; }
  }
  p.path = path; fpClearSel(p);
  renderFinder();
}
function fpBindPathRow(root) {
  root.querySelectorAll('.fp-addr .fp-crumb').forEach(b => b.onclick = e => {
    e.stopPropagation();                       // 段落点击=跳级，不触发"整条进输入"
    fpNavTo(+b.dataset.pi, b.dataset.p, true);
  });
  root.querySelectorAll('.fp-addr').forEach(row => {
    const pi = +row.dataset.pi;
    const pill = row.querySelector('.fa-pill');
    // 胶囊空白 = 立即输入（§36.10）；段落点击在上面已拦
    pill.onclick = e => { if (e.target.closest('.fp-crumb') || e.target.tagName === 'INPUT') return; fpStartPathEdit(pi); };
    row.oncontextmenu = e => {
      if (e.target.tagName === 'INPUT') return;
      e.preventDefault(); e.stopPropagation();
      fpAddressMenu(e.clientX, e.clientY, pi);
    };
    if (FP.panes[pi] && FP.panes[pi].searching) fpBindSearchInput(pi, true);   // 重绘后重绑（保持焦点/过滤）
    row.querySelectorAll('.fa-ico[data-fa]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const act = b.dataset.fa;
      const pane = FP.panes[pi];
      if (act === 'back') {
        if (Array.isArray(pane.hist) && pane.hi > 0) { pane.hi--; pane.path = pane.hist[pane.hi]; fpClearSel(pane); renderFinder(); }
        else toast('没有更早的位置');
      } else if (act === 'fwd') {
        if (Array.isArray(pane.hist) && pane.hi < pane.hist.length - 1) { pane.hi++; pane.path = pane.hist[pane.hi]; fpClearSel(pane); renderFinder(); }
        else toast('没有更晚的位置');
      } else if (act === 'up') {
        const parent = pane.path === '/' ? null : (pane.path.split('/').slice(0, -1).join('/') || '/');
        if (parent) fpNavTo(pi, parent, true); else toast('已经在根目录');
      } else if (act === 'reload') { renderFinder(); toast('已刷新'); }
      else if (act === 'search') fpStartSearch(pi);
      else if (act === 'more') fpToggleViewPanel(b);
    });
  });
}
/// §37.11 窗格内搜索：胶囊变输入、实时过滤（Enter/Esc 收起）
function fpBindSearchInput(pi, focusIt) {
  // §37.11 搜索框每次重绘都是**新节点**——绑定必须在渲染后重挂（否则 Escape 失效、搜索态残留：
  // 实测 Escape 后 pill 变空、行全被滤掉，就是这个漏绑）
  const inp = document.querySelector(`#fpPanes .fp-cell[data-pi="${pi}"] #fpSearchInput`);
  if (!inp) return null;
  const close = clear => {
    FP.panes[pi].searching = false;
    if (clear) FP.panes[pi].q = '';
    renderFinderMain();
  };
  inp.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Enter') close(false);      // Enter=收起但保留过滤
    else if (e.key === 'Escape') close(true); // Esc=清过滤并恢复全部
  };
  inp.oninput = () => {
    FP.panes[pi].q = inp.value;
    renderFinderMain();
    fpBindSearchInput(pi, true);              // 重建后重绑 + 焦点回输入框
  };
  if (focusIt) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  return inp;
}
function fpStartSearch(pi) {
  FP.panes[pi].searching = true;
  FP.panes[pi].q = FP.panes[pi].q || '';
  renderFinderMain();
  const inp = fpBindSearchInput(pi, false);
  if (inp) { inp.focus(); inp.select(); }
}
function fpStartPathEdit(pi) {
  const cell = document.querySelector(`#fpPanes .fp-cell[data-pi="${pi}"]`); if (!cell) return;
  const bar = cell.querySelector('.fp-addr .fa-pill') || cell.querySelector('.fp-cellpath'); if (!bar) return;
  const pane = FP.panes[pi]; if (!pane) return;
  bar.innerHTML = `<input id="fpPathInput" spellcheck="false" value="${escapeHtml(pane.path)}">`;
  const inp = bar.querySelector('#fpPathInput');
  inp.focus(); inp.select();
  inp.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      let v = (inp.value || '').trim();
      if (v.startsWith('~')) v = '/Users/mjm' + v.slice(1);
      if (!v.startsWith('/')) v = '/' + v;
      const target = v.replace(/\/+$/, '') || '/';
      inp.onblur = null;
      fpNavTo(pi, target, true);
      toast(`窗格 ${pi + 1} 已跳到 <code>${escapeHtml(target)}</code>`);
    } else if (e.key === 'Escape') { inp.onblur = null; renderFinder(); }
  };
  inp.onblur = () => renderFinder();
}
/// §37.12 ⋮ 显示设置面板（照你图5：分组/排序/升序/图标尺寸/文字大小/显示列11项/
/// 多媒体/其他/侧边预览/文件夹置顶/始终按文件名排序/交替行背景色/显示隐藏文件/用作默认）
function fpApplyFinderView() {
  const pane = document.querySelector('.finder-pane');
  if (pane) {
    const icon = Math.round(FP.iconSize * 0.75);          // 32 → 24（基准），16→12，48→36
    pane.style.setProperty('--fp-icon', icon + 'px');
    pane.style.setProperty('--fp-row', Math.max(36, icon + 12) + 'px');
    pane.style.setProperty('--fp-font', FP.fontSize + 'px');
  }
  document.body.classList.toggle('fp-nozebra', !FP.zebraOn);
}
function fpSaveFinderView() {
  S.finderView = { iconSize: FP.iconSize, fontSize: FP.fontSize, zebraOn: FP.zebraOn,
    dirsTop: FP.dirsTop, showHidden: FP.showHidden, sidePreview: FP.sidePreview, nameSort: FP.nameSort };
  save(true);
}
function fpToggleViewPanel(anchorBtn) {
  let p = document.getElementById('fpViewPanel');
  if (!p) {
    p = document.createElement('div'); p.id = 'fpViewPanel'; p.className = 'fp-viewpanel';
    p.hidden = true; document.body.appendChild(p);
  }
  if (!p.hidden) { p.hidden = true; return; }
  const colBox = FP_COL_DEFS.map(([k, l]) =>
    `<div class="fvp-row"><label style="flex:1"><input type="checkbox" data-col="${k}"
      ${FP.cols.includes(k) ? 'checked' : ''}> ${l}</label></div>`).join('');
  p.innerHTML = `
    <div class="fvp-title">显示设置</div>
    <div class="fvp-row"><label>分组方式:</label><select id="fvpGroup">
      ${FP_GROUP_OPTS.map(([v, l]) => `<option value="${v}" ${FP.group === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select></div>
    <div class="fvp-row"><label>排序方式:</label><select id="fvpSort">
      ${[['name', '名称'], ['size', '大小'], ['mtime', '修改日期'], ['added', '添加日期']].map(([v, l]) =>
        `<option value="${v}" ${FP.sortKey === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select></div>
    <div class="fvp-row"><label></label><span class="fvp-check"><input type="checkbox" id="fvpAsc"
      ${FP.sortDir === 'asc' ? 'checked' : ''}> 升序</span></div>
    <div class="fvp-sec"></div>
    <div class="fvp-row"><label>图标尺寸:</label><input type="range" class="fvp-slider" id="fvpIcon"
      min="16" max="48" step="4" value="${FP.iconSize}"><span id="fvpIconVal">${FP.iconSize}×${FP.iconSize}</span></div>
    <div class="fvp-row"><label>文字大小:</label><select id="fvpFont">
      ${[12, 13, 14, 15, 16].map(n => `<option ${FP.fontSize === n ? 'selected' : ''}>${n}</option>`).join('')}
    </select></div>
    <div class="fvp-title">显示列:</div>
    <div class="fvp-cols">${colBox}</div>
    <div class="fvp-row"><select id="fvpMedia"><option>多媒体</option><option>时长</option><option>艺术家</option></select></div>
    <div class="fvp-row"><select id="fvpOther"><option>其他</option><option>所有者</option><option>位置</option></select></div>
    <div class="fvp-sec"></div>
    <div class="fvp-row"><label style="flex:1"><input type="checkbox" id="fvpPreview"
      ${FP.sidePreview ? 'checked' : ''}> 侧边预览</label></div>
    <div class="fvp-row"><label style="flex:1"><input type="checkbox" id="fvpDirsTop"
      ${FP.dirsTop ? 'checked' : ''}> 文件夹置顶</label></div>
    <div class="fvp-row"><label style="flex:1;padding-left:20px"><input type="checkbox" id="fvpNameSort"
      ${FP.nameSort ? 'checked' : ''}> 始终按文件名排序</label></div>
    <div class="fvp-row"><label style="flex:1"><input type="checkbox" id="fvpZebra"
      ${FP.zebraOn ? 'checked' : ''}> 交替行背景色</label></div>
    <div class="fvp-row"><label style="flex:1"><input type="checkbox" id="fvpHidden"
      ${FP.showHidden ? 'checked' : ''}> 显示隐藏文件</label></div>
    <button class="fvp-btn" id="fvpDefault">用作默认</button>`;
  // —— 绑定：全部真联动 ——
  const rerender = () => { fpApplyFinderView(); renderFinderMain(); };
  p.querySelector('#fvpGroup').onchange = e => { FP.group = e.target.value; rerender(); };
  p.querySelector('#fvpSort').onchange = e => { FP.sortKey = e.target.value; rerender(); };
  p.querySelector('#fvpAsc').onchange = e => { FP.sortDir = e.target.checked ? 'asc' : 'desc'; rerender(); };
  p.querySelector('#fvpIcon').oninput = e => {
    FP.iconSize = +e.target.value;
    p.querySelector('#fvpIconVal').textContent = `${FP.iconSize}×${FP.iconSize}`;
    fpApplyFinderView();                       // 图标尺寸实时生效（不整表重绘，只动 CSS 变量）
  };
  p.querySelector('#fvpIcon').onchange = fpSaveFinderView;
  p.querySelector('#fvpFont').onchange = e => { FP.fontSize = +e.target.value; fpApplyFinderView(); fpSaveFinderView(); };
  p.querySelectorAll('.fvp-cols input[data-col]').forEach(cb => cb.onchange = () => {
    const k = cb.dataset.col;
    if (cb.checked) { if (!FP.cols.includes(k)) FP.cols.push(k); }
    else FP.cols = FP.cols.filter(c => c !== k);
    rerender();
  });
  p.querySelector('#fvpMedia').onchange = () => toast('多媒体列（时长/艺术家）需要媒体元数据，原型数据如实显示 —');
  p.querySelector('#fvpOther').onchange = () => toast('「其他」列同上 —');
  p.querySelector('#fvpPreview').onchange = e => { FP.sidePreview = e.target.checked; fpSaveFinderView();
    toast(e.target.checked ? '侧边预览已开（原型仅记录状态）' : '侧边预览已关'); };
  p.querySelector('#fvpDirsTop').onchange = e => { FP.dirsTop = e.target.checked; fpSaveFinderView(); rerender(); };
  p.querySelector('#fvpNameSort').onchange = e => {
    FP.nameSort = e.target.checked;
    if (FP.nameSort) { FP.sortKey = 'name'; FP.sortDir = 'asc'; }
    fpSaveFinderView(); rerender();
  };
  p.querySelector('#fvpZebra').onchange = e => { FP.zebraOn = e.target.checked; fpSaveFinderView(); fpApplyFinderView(); };
  p.querySelector('#fvpHidden').onchange = e => { FP.showHidden = e.target.checked; fpSaveFinderView(); rerender(); };
  p.querySelector('#fvpDefault').onclick = () => { fpSaveFinderView(); toast('当前显示设置已存为默认'); };
  // 定位：贴 ⋮ 下方、不盖按钮（放不下时夹进屏幕）
  const r = anchorBtn.getBoundingClientRect();
  p.hidden = false;
  p.style.left = Math.max(8, Math.min(r.right - 252, innerWidth - 262)) + 'px';
  p.style.top = Math.min(r.bottom + 6, innerHeight - p.offsetHeight - 8) + 'px';
}
/// §36 收藏条目 HTML（ungrouped 用 data-g="ungrouped"）
/// §38.3 侧栏条目图标：标签彩点 / 磁盘银 / iCloud云 / 目录蓝文件夹 / 文件类型色块（不再灰方块）
function fpSideIconHTML(it) {
  if (it.tag) return `<span class="fp-side-ico" style="background:${escapeHtml(it.tag)}"></span>`;
  if (!it.path) return `<span class="fp-side-ico is-dot"></span>`;
  if (it.path === '/' || it.path.startsWith('/Volumes')) {
    return `<span class="fp-side-ico" style="background:linear-gradient(180deg,#D8DEE3,#9AA4AC)">
      <svg viewBox="0 0 17 17"><rect x="2" y="4.5" width="13" height="8.5" rx="1.6" fill="#5A646C"/>
      <circle cx="12" cy="11" r="1.1" fill="#8EE06B"/></svg></span>`;
  }
  if (/Mobile Documents/i.test(it.path)) {
    return `<span class="fp-side-ico" style="background:#57BEF0">
      <svg viewBox="0 0 17 17"><path d="M4.5 12h8a2.7 2.7 0 0 0 .3-5.4A4 4 0 0 0 5 6.2 2.9 2.9 0 0 0 4.5 12z" fill="#fff"/></svg></span>`;
  }
  if (FP_FS[it.path] !== undefined && !it.file) {
    return `<span class="fp-side-ico" style="background:#45ACE6">
      <svg viewBox="0 0 17 17"><path d="M2.5 4.6c0-.7.6-1.3 1.3-1.3h3.4l1 1H13c.7 0 1.3.6 1.3 1.3v6.5c0 .7-.6 1.3-1.3 1.3H3.8c-.7 0-1.3-.6-1.3-1.3V4.6z" fill="#fff" opacity=".92"/></svg></span>`;
  }
  // 文件条目：类型色块
  const ext = (it.name.includes('.') ? it.name.split('.').pop() : '').toLowerCase();
  const c = FP_FILE_COLORS[ext] || '#8E959B';
  return `<span class="fp-side-ico" style="background:${c};color:#fff">${escapeHtml((ext || '?').slice(0, 2).toUpperCase())}</span>`;
}
function fpFItemHTML(gKey, ii, it) {
  return `<div class="fp-fitem" data-g="${gKey}" data-i="${ii}" draggable="true">
    ${fpSideIconHTML(it)}
    <span class="fi-name" title="${escapeHtml(it.path || it.name)}">${escapeHtml(it.name)}</span>
    <span class="fi-mv"><button data-ia="up" data-g="${gKey}" data-i="${ii}" title="上移">▲</button>
      <button data-ia="down" data-g="${gKey}" data-i="${ii}" title="下移">▼</button></span></div>`;
}
function renderFinderSide(k) {
  const side = $(k === 'R' ? '#fpSideR' : '#fpSide'); if (!side) return;
  const data = fpSide(k);
  const groups = data.groups;
  const rerender = () => renderFinderSide(k);          // 重绘自己这一栏（左右互不影响）
  const save = () => fpSaveSide(k);
  let html = `<div class="fp-side-head"><span>收藏 / 分组</span>
    <button class="fp-add-group" title="添加分组">＋</button></div>`;
  // §36.5 不分组收藏区（有条目才显示，置顶于各组之上）
  if (data.ungrouped && data.ungrouped.length) {
    html += `<div class="fp-fgroup fp-ungrouped" data-g="ungrouped">
      <div class="fg-name"><span class="fg-caret">▾</span><b>不分组</b></div>
      ${data.ungrouped.map((it, ii) => fpFItemHTML('ungrouped', ii, it)).join('')}
    </div>`;
  }
  groups.forEach((g, gi) => {
    html += `<div class="fp-fgroup${g.collapsed ? ' is-collapsed' : ''}" data-g="${gi}">
      <div class="fg-name" title="点击折叠/展开 · 右键=编辑菜单 · 按住可拖动换序">
        <span class="fg-caret">${g.collapsed ? '▸' : '▾'}</span><b data-gi="${gi}">${escapeHtml(g.name)}</b>
        <span class="fg-acts"><button data-ga="add" data-gi="${gi}" title="添加条目">＋</button></span></div>
      ${g.collapsed ? '' : g.items.map((it, ii) => fpFItemHTML(String(gi), ii, it)).join('')}
    </div>`;
  });
  side.innerHTML = html;

  /* §36.1/36.2 组头：单击=折叠⇄展开（右键=编辑菜单；▲▼ 已删，换序只靠按住拖动） */
  side.querySelectorAll('.fp-fgroup').forEach(gEl => {
    const rawG = gEl.dataset.g;
    const isUng = rawG === 'ungrouped';
    const gi = isUng ? -1 : +rawG;
    const handle = gEl.querySelector('.fg-name');
    if (handle) {
      handle.onclick = e => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        if (isUng) return;                          // 不分组区不折叠（它本就按需显示）
        e.stopPropagation();
        const gs = fpSide(k).groups;
        gs[gi].collapsed = !gs[gi].collapsed;
        save(); rerender();
      };
      handle.oncontextmenu = e => {
        e.preventDefault(); e.stopPropagation();
        if (isUng) return;
        fpGroupMenu(e.clientX, e.clientY, k, gi);
      };
      handle.draggable = !isUng;
      handle.ondragstart = e => {
        if (isUng) return;
        FP.drag = { kind: 'group', k, g: gi };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'group');
        e.stopPropagation();
      };
    }
    // 组容器 = 拖放目标：文件拖进来=收藏进该组；组=换序；条目=跨组
    gEl.ondragover = e => {
      e.preventDefault(); e.stopPropagation();
      // §41.5 拖的是**分组** → 只画"上下换位"的落点线，不画整组框（整组框看起来像"要塞进这个文件夹"）
      const isGroupDrag = FP.drag && FP.drag.kind === 'group';
      gEl.classList.toggle('drag-insert', isGroupDrag);
      gEl.classList.toggle('drag-over-top', !isGroupDrag);
    };
    gEl.ondragleave = () => gEl.classList.remove('drag-over-top', 'drag-insert');
    gEl.ondrop = e => {
      e.preventDefault(); e.stopPropagation();
      gEl.classList.remove('drag-over-top', 'drag-insert');
      const d = FP.drag; if (!d) return;
      const sd = fpSide(k);
      if (d.kind === 'file') {                     // §36.6 文件拖到侧栏 = 收藏
        fpFavoriteInto(k, isUng ? 'ungrouped' : gi, d.name, d.full, d.isDir);
        FP.drag = null; return;
      }
      if (d.kind === 'group') {
        if (isUng || d.g === gi || d.k !== k) { FP.drag = null; return; }
        const gs = sd.groups;
        const moved = gs.splice(d.g, 1)[0];
        gs.splice(gi, 0, moved);
        FP.drag = null; save(); rerender();
        toast(`分组「${escapeHtml(moved.name)}」已移动`);
        return;
      }
      if (d.kind === 'item') {
        if (d.k !== k) { FP.drag = null; return; }
        if (d.g === 'ungrouped' && !isUng) {       // 未分组条目拖进组
          const it = sd.ungrouped.splice(d.i, 1)[0];
          if (it) sd.groups[gi].items.push(it);
          FP.drag = null; save(); rerender(); return;
        }
        if (d.g !== 'ungrouped' && isUng) {        // 组内条目拖到不分组区
          const it = sd.groups[d.g].items.splice(d.i, 1)[0];
          if (it) sd.ungrouped.push(it);
          FP.drag = null; save(); rerender(); return;
        }
        if (d.g === 'ungrouped') { FP.drag = null; return; }
        if (d.g !== gi) {                          // 跨组
          const it = sd.groups[d.g].items.splice(d.i, 1)[0];
          if (it) sd.groups[gi].items.splice(0, 0, it);
          FP.drag = null; save(); rerender(); return;
        }
        FP.drag = null; return;
      }
      FP.drag = null;
    };
    // 落到组内条目 = 同样按组处理（落点常在条目上）
    gEl.querySelectorAll('.fp-fitem').forEach(el => {
      el.ondragover = e => {
        // §41.5 拖**分组**经过条目：条目一律不接（不描边、不 preventDefault）——
        //  描边会被读成"这个文件夹被选中/分组要塞进它"（你图3 圈的就是 Docker 那格蓝框）。
        //  不拦冒泡 → 事件继续走到组容器，那里画换位线并接受落点。
        if (FP.drag && FP.drag.kind === 'group') return;
        e.preventDefault(); e.stopPropagation(); el.classList.add('drag-over');
      };
      el.ondragleave = () => el.classList.remove('drag-over');
      el.ondrop = e => { e.stopPropagation(); el.classList.remove('drag-over'); gEl.ondrop(e); };
    });
  });
  /* §41.6 侧栏**分组之外**的空白 = 落成"不分组"单独显示。
     修前侧栏整片都被组容器占着，落到哪都进组 ——「不分组」区永远建不出来（你第 7 条）。
     组容器自己 stopPropagation，所以这条只会在"没落在任何组上"时命中。 */
  side.ondragover = e => {
    if (!FP.drag || FP.drag.kind !== 'file') return;
    if (e.target.closest && e.target.closest('.fp-fgroup')) return;
    e.preventDefault();
    side.classList.add('drag-ungrouped');
  };
  side.ondragleave = e => {
    if (!side.contains(e.relatedTarget)) side.classList.remove('drag-ungrouped');
  };
  side.ondrop = e => {
    side.classList.remove('drag-ungrouped');
    if (!FP.drag || FP.drag.kind !== 'file') return;
    if (e.target.closest && e.target.closest('.fp-fgroup')) return;
    e.preventDefault();
    const d = FP.drag; FP.drag = null;
    fpFavoriteInto(k, 'ungrouped', d.name, d.full, d.isDir);
  };
  side.querySelector('.fp-add-group').onclick = e => { e.stopPropagation();
    // §38.1 ＋ = 添加分组 / 添加单个文件（无分组，直接进本栏「不分组」区）
    showMenu([
      { icon: '📁', label: '添加分组', action: () => askModal({ title: '新建分组',
          text: '收藏栏里的一个分组（名字可随时改）', value: '新分组', okText: '添加',
          onOk: v => { if (!v.trim()) return;
            fpSide(k).groups.push({ id: 'g' + now(), name: v.trim(), items: [], collapsed: false });
            save(); rerender(); toast('已添加分组 <b>' + escapeHtml(v.trim()) + '</b>'); } }) },
      { icon: '📄', label: '添加单个文件（不分组）', action: () => askModal({ title: '添加单个文件',
          text: `无分组，直接显示在${k === 'R' ? '右' : '左'}侧栏顶部的「不分组」区。格式：名称|绝对路径`,
          value: '文件名|/Users/mjm/…', okText: '添加',
          onOk: v => { if (!v.trim()) return;
            const [name, path] = v.split('|').map(x => x.trim());
            if (!name) return;
            const sd = fpSide(k);
            sd.ungrouped.push(path ? { name, path, file: true } : { name });
            fpSaveSide(k); renderFinderSide(k);
            toast(`已添加单个文件（不分组）：<b>${escapeHtml(name)}</b>`); } }) },
    ], e.currentTarget);
  };
  // 「＋添加条目」
  side.querySelectorAll('[data-ga]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const gi = +b.dataset.gi, gs = fpSide(k).groups;
    askModal({ title: `往「${gs[gi].name}」添加条目`,
      text: '格式：名称 或 名称|绝对路径（标签分组可以只写名称）', value: '新条目', okText: '添加',
      onOk: v => {
        if (!v.trim()) return;
        const [name, path] = v.split('|').map(x => x.trim());
        gs[gi].items.push(path ? { name, path } : { name });
        save(); rerender();
      } });
  });
  // 条目 ▲▼（组内与不分组区共用；按 gk 分流到各自数组）
  side.querySelectorAll('[data-ia]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const gk = b.dataset.g, sd = fpSide(k);
    const arr = gk === 'ungrouped' ? sd.ungrouped : (sd.groups[+gk] ? sd.groups[+gk].items : null);
    if (!arr) return;
    const i = +b.dataset.i;
    if (b.dataset.ia === 'up' && i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; fpSaveSide(k); renderFinderSide(k); }
    else if (b.dataset.ia === 'down' && i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; fpSaveSide(k); renderFinderSide(k); }
  });
  // 条目：点击=导航（文件→父目录+选中）；拖动=组内/跨组/进不分组/文件源（统一 FP.drag）
  side.querySelectorAll('.fp-fitem').forEach(el => {
    el.onclick = () => {
      const gk = el.dataset.g;
      const sd = fpSide(k);
      const it = gk === 'ungrouped' ? sd.ungrouped[+el.dataset.i] : sd.groups[+gk].items[+el.dataset.i];
      if (!it) return;
      side.querySelectorAll('.fp-fitem').forEach(x => x.classList.remove('on'));
      el.classList.add('on');
      if (!it.path) return;
      const pi = FP.active;
      if (it.file) {                               // §36.6 收藏的是文件 → 进父目录并选中
        const parts = it.path.split('/');
        const nm = parts.pop();
        FP.panes[pi].path = parts.join('/') || '/';
        FP.panes[pi].sel = nm;
        FP.panes[pi].selFull = it.path; FP.panes[pi].selSet = new Set([it.path]);
        renderFinder();
      } else { fpNavTo(pi, it.path, true); }       // §37.9 目录跳转记历史
    };
    el.ondragstart = e => {
      const gk = el.dataset.g;
      FP.drag = { kind: 'item', k, g: gk === 'ungrouped' ? 'ungrouped' : +gk, i: +el.dataset.i };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'side-item');
    };
    el.oncontextmenu = e => {                       // §37.15 图3 长菜单
      e.preventDefault(); e.stopPropagation();
      fpSideItemMenu(e.clientX, e.clientY, k, el.dataset.g, +el.dataset.i,
        el.dataset.g === 'ungrouped' ? fpSide(k).ungrouped[+el.dataset.i] : fpSide(k).groups[+el.dataset.g].items[+el.dataset.i]);
    };
  });
}
/// §37.15 侧栏条目右键 = 你图3 的长菜单（33 项逐字；✓ 项可切换，其余演示）
const FP_SIDE_ITEM_CHECKS = { start: true, loc: true, drop: false, sidebarBelow: true };
function fpSideItemMenu(x, y, k, gk, ii, it) {
  const ck = FP_SIDE_ITEM_CHECKS;
  const mark = b => (b ? '✓ ' : '　');
  showMenu([
    { label: '在新标签页中打开', action: () => toast(`新标签页打开「${escapeHtml(it.name)}」（演示）`) },
    { label: '在新窗口中打开', action: () => toast(`新窗口打开「${escapeHtml(it.name)}」（演示）`) },
    { label: '在上层文件夹中显示', action: () => {
        if (it.path) { const p = it.path.split('/').slice(0, -1).join('/') || '/'; fpNavTo(FP.active, p, true); }
        else toast('该条目没有路径');
      } },
    { sep: true },
    { label: '编辑显示名称', action: () => fpEditSideItemName(k, gk, ii) },
    { label: '编辑位置', action: () => toast(`编辑「${escapeHtml(it.name)}」的位置（演示）`) },
    { sep: true },
    { label: '移除书签', danger: true, action: () => askModal({ title: '移除书签',
        text: `从侧栏移除「${escapeHtml(it.name)}」（不删文件本身）`, okText: '移除',
        onOk: () => {
          const sd = fpSide(k);
          const arr = gk === 'ungrouped' ? sd.ungrouped : (sd.groups[+gk] ? sd.groups[+gk].items : null);
          if (arr) { arr.splice(ii, 1); fpSaveSide(k); renderFinderSide(k); toast('已移除书签'); }
        } }) },
    { sep: true },
    { label: '显示简介', action: () => toast(`简介（演示）：${escapeHtml(it.name)}`) },
    { label: '在访达中显示', action: () => toast(`在系统访达中显示（演示）：${escapeHtml(it.name)}`) },
    { sep: true },
    { label: '速览', sub: [
      { label: '图标', action: () => toast('速览 · 图标（演示）') },
      { label: '列表', action: () => toast('速览 · 列表（演示）') },
      { label: '分栏', action: () => toast('速览 · 分栏（演示）') }] },
    { sep: true },
    { label: '常用', sub: [
      { label: '桌面', action: () => fpNavTo(FP.active, '/Users/mjm/Desktop', true) },
      { label: '下载', action: () => fpNavTo(FP.active, '/Users/mjm/Downloads', true) },
      { label: '文档', action: () => fpNavTo(FP.active, '/Users/mjm/Documents', true) }] },
    { label: '最近', sub: [
      { label: '（最近打开的目录演示）', action: () => toast('最近：原型里按访问顺序列目录（演示）') }] },
    { label: '标签', sub: fpTagsItems(it.name) },
    { label: 'iCloud', sub: [
      { label: 'iCloud 云盘', action: () => fpNavTo(FP.active, '/Users/mjm/Library/Mobile Documents/com~apple~CloudDocs', true) },
      { label: '与我共享', action: () => fpNavTo(FP.active, '/Users/mjm/Library/Mobile Documents/com~apple~Shared', true) }] },
    { label: '添加分隔符', action: () => toast('已在侧栏加一条分隔符（演示）') },
    { sep: true },
    { label: '新建分组', action: () => askModal({ title: '新建分组', value: '新分组', okText: '添加',
        onOk: v => { if (!v.trim()) return;
          fpSide(k).groups.push({ id: 'g' + now(), name: v.trim(), items: [], collapsed: false });
          fpSaveSide(k); renderFinderSide(k); toast('已新建分组'); } }) },
    { label: '推出所有安装包', action: () => toast('推出所有安装包（演示）') },
    { sep: true },
    { label: '暂存架 (扩展功能)', action: () => toast('暂存架（QSpace 扩展，演示）') },
    { sep: true },
    { label: '起始位置', action: () => { ck.start = !ck.start; fpSideItemMenu(x, y, k, gk, ii, it); } },
    { label: '服务器', action: () => toast('服务器（演示）') },
    { label: '位置', action: () => { ck.loc = !ck.loc; fpSideItemMenu(x, y, k, gk, ii, it); } },
    { label: '访达标签', action: () => toast('访达标签（演示）') },
    { label: '智能文件夹', action: () => toast('智能文件夹（演示）') },
    { label: '工作区', action: () => toast('工作区（演示）') },
    { label: '快速重命名', action: () => toast('快速重命名已启用（演示）') },
    { label: '最近位置', action: () => toast('最近位置（演示）') },
    { label: '最近文件', action: () => toast('最近文件（演示）') },
    { label: '访达收藏', action: () => toast('访达收藏（演示）') },
    { label: '窗口标签', action: () => toast('窗口标签（演示）') },
    { label: '窗格标签', action: () => toast('窗格标签（演示）') },
    { sep: true },
    { label: '与左侧同步', action: () => toast('与左侧同步（演示）') },
    { label: '分配到同侧窗格', action: () => toast('分配到同侧窗格（演示）') },
    { sep: true },
    { label: mark(ck.drop) + '拖放更改时确认', action: () => { ck.drop = !ck.drop; fpSideItemMenu(x, y, k, gk, ii, it); } },
    { label: '记住书签状态', action: () => toast('已记住书签状态（演示）') },
    { label: mark(ck.sidebarBelow) + '左边栏始终在工具栏下方', action: () => { ck.sidebarBelow = !ck.sidebarBelow; fpSideItemMenu(x, y, k, gk, ii, it); } },
  ], null, { x, y });
}
/// 图3「编辑显示名称」：条目行内改名
function fpEditSideItemName(k, gk, ii) {
  const side = $(k === 'R' ? '#fpSideR' : '#fpSide');
  const el = side && side.querySelector(`.fp-fitem[data-g="${gk}"][data-i="${ii}"] .fi-name`);
  if (!el) return;
  const sd = fpSide(k);
  const it = gk === 'ungrouped' ? sd.ungrouped[+ii] : sd.groups[+gk].items[+ii];
  if (!it) return;
  el.innerHTML = `<input value="${escapeHtml(it.name)}">`;
  const inp = el.querySelector('input'); inp.focus(); inp.select();
  inp.onkeydown = e => { e.stopPropagation();
    if (e.key === 'Enter') { it.name = inp.value.trim() || it.name; fpSaveSide(k); inp.onblur = null; renderFinderSide(k); }
    else if (e.key === 'Escape') { inp.onblur = null; renderFinderSide(k); } };
  inp.onblur = () => { it.name = inp.value.trim() || it.name; fpSaveSide(k); renderFinderSide(k); };
}
/// §40.3 行内重命名（Enter / 慢点 / 右键菜单共用）：默认选中=名称部分（图6：.ext 不选中）
/// §41.4 只替换**名字那一段**：整格 innerHTML 会把 chevron+图标一起吃掉（你：「图标消失了」），
///        换进来的 input 还带着 intrinsic 宽度，把右边几列一起推走（你：「向右偏移了一下」）。
function fpStartRename(pi, full) {
  // 列表行 / 图标格 / 分栏行都能进（data-full 统一锚点）
  const tr = document.querySelector(`#fpPanes [data-full="${CSS.escape(full)}"]`);
  if (!tr) return;
  const pane = FP.panes[pi];
  const oldName = tr.dataset.name;
  const dot = oldName.lastIndexOf('.');
  const extLen = dot > 0 ? oldName.length - dot : 0;          // 「.md」等后缀长度（含点）
  const cell = tr.querySelector('.fp-c-name') || tr.querySelector('.gc-name') || tr;
  // 找到「名字那一段」：列表行里是无 class 的直接子 span（twisty / fp-ico / tag-dot 都带 class）；
  // 图标格里 .gc-name 自己就是名字容器；找不到才退回整格替换（保底不比旧行为差）
  let nameEl = null;
  if (cell.classList.contains('gc-name')) nameEl = cell;
  else nameEl = [...cell.children].find(el => el.tagName === 'SPAN' && !el.className) || null;
  const nameRect = nameEl ? nameEl.getBoundingClientRect() : null;
  const input = document.createElement('input');
  input.className = 'fp-rename'; input.spellcheck = false; input.value = oldName;
  if (nameRect && nameRect.width > 20) input.style.width = Math.round(nameRect.width) + 'px';
  if (nameEl) nameEl.replaceWith(input); else cell.innerHTML = '';
  if (!nameEl) cell.appendChild(input);
  const inp = input;
  inp.focus();
  inp.setSelectionRange(0, Math.max(0, oldName.length - extLen));   // 默认只选名称
  let done = false;
  const commit = ok => {
    if (done) return; done = true;
    inp.onblur = null;
    const v = (inp.value || '').trim();
    if (ok && v && v !== oldName) fpRenameEntry(pi, full, v);
    else renderFinderMain();
  };
  inp.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Enter') commit(true);
    else if (e.key === 'Escape') commit(false);
  };
  inp.onblur = () => commit(true);
}
/// §40.3 真改：FP_FS 条目改名 + 目录子树 key 迁移 + 侧栏收藏/展开集/选中同步
function fpRenameEntry(pi, full, newName) {
  const parts = full.split('/');
  const oldName = parts.pop();
  const dir = parts.join('/') || '/';
  const arr = FP_FS[dir];
  const ent = arr && arr.find(x => (x.d || x.f) === oldName);
  if (!ent) { toast('演示数据中没有这个条目'); renderFinderMain(); return; }
  if (arr.some(x => (x.d || x.f) === newName)) { toast(`同名「${escapeHtml(newName)}」已存在`); renderFinderMain(); return; }
  const wasDir = !!ent.d;
  if (wasDir) { delete ent.d; ent.d = newName; } else { delete ent.f; ent.f = newName; }
  const newFull = (parts.concat(newName)).join('/') || newName;
  if (wasDir) {                                   // 目录子树整体迁移 key
    const fromPref = full, toPref = newFull;
    Object.keys(FP_FS).filter(k => k === fromPref || k.startsWith(fromPref + '/'))
      .forEach(k => { FP_FS[toPref + k.slice(fromPref.length)] = FP_FS[k]; delete FP_FS[k]; });
  }
  // 侧栏收藏里引用旧路径的同步
  ['L', 'R'].forEach(k => {
    const sd = fpSide(k);
    const touch = it => { if (it.path === full) it.path = newFull;
      else if (it.path && it.path.startsWith(full + '/')) it.path = newFull + it.path.slice(full.length); };
    (sd.ungrouped || []).forEach(touch);
    (sd.groups || []).forEach(g => g.items.forEach(touch));
    fpSaveSide(k);
  });
  // 展开集与选中同步
  const pane = FP.panes[pi];
  if (Array.isArray(pane.expanded)) {
    pane.expanded = pane.expanded.map(f => f === full ? newFull
      : (f.startsWith(full + '/') ? newFull + f.slice(full.length) : f));
  }
  pane.selFull = newFull;
  pane.sel = newName;
  if (pane.selSet) pane.selSet = new Set([...pane.selSet].map(f => f === full ? newFull
    : (f.startsWith(full + '/') ? newFull + f.slice(full.length) : f)));
  if (pane.rangeAnchor === full) pane.rangeAnchor = newFull;
  renderFinder();
  toast(`已重命名为 <b>${escapeHtml(newName)}</b>`);
}
/// §36.1 分组右键编辑菜单
function fpGroupMenu(x, y, k, gi) {
  const gs = fpSide(k).groups, g = gs[gi];
  if (!g) return;
  showMenu([
    { label: '重命名（编辑）', action: () => fpEditGroupName(k, gi) },
    { label: '添加条目…', action: () => askModal({ title: `往「${g.name}」添加条目`,
        text: '格式：名称 或 名称|绝对路径', value: '新条目', okText: '添加',
        onOk: v => { if (!v.trim()) return;
          const [name, path] = v.split('|').map(x => x.trim());
          g.items.push(path ? { name, path } : { name });
          fpSaveSide(k); renderFinderSide(k); } }) },
    { label: g.collapsed ? '展开' : '折叠', action: () => { g.collapsed = !g.collapsed; fpSaveSide(k); renderFinderSide(k); } },
    { sep: true },
    { label: '删除分组', danger: true, action: () => askModal({ title: '删除分组',
        text: `「${g.name}」及其 ${g.items.length} 个条目（收藏本身不删文件）`, okText: '删除',
        onOk: () => { gs.splice(gi, 1); fpSaveSide(k); renderFinderSide(k); toast('分组已删除'); } }) },
  ], null, { x, y });
}
/// 行内改组名（右键「重命名」走到这里）
function fpEditGroupName(k, gi) {
  const side = $(k === 'R' ? '#fpSideR' : '#fpSide');
  const b = side && side.querySelector(`.fp-fgroup[data-g="${gi}"] .fg-name b`);
  if (!b) return;
  const gs = fpSide(k).groups;
  b.innerHTML = `<input value="${escapeHtml(gs[gi].name)}">`;
  const inp = b.querySelector('input'); inp.focus(); inp.select();
  inp.onkeydown = e => { e.stopPropagation();
    if (e.key === 'Enter') { gs[gi].name = inp.value.trim() || gs[gi].name; fpSaveSide(k); inp.onblur = null; renderFinderSide(k); }
    else if (e.key === 'Escape') { inp.onblur = null; renderFinderSide(k); } };
  inp.onblur = () => { gs[gi].name = inp.value.trim() || gs[gi].name; fpSaveSide(k); renderFinderSide(k); };
}
/// §36.4/36.6 收藏进侧栏（右键收藏与拖放共用）
function fpFavoriteInto(k, gKey, name, full, isDir) {
  const sd = fpSide(k);
  const item = { name, path: full };
  if (isDir) item.file = false; else item.file = true;
  const pool = gKey === 'ungrouped' ? sd.ungrouped : sd.groups[gKey] && sd.groups[gKey].items;
  if (!pool) return;
  if (pool.some(x => x.path === full)) { toast('已在收藏里'); return; }
  pool.push(item);
  fpSaveSide(k); renderFinderSide(k);
  const where = gKey === 'ungrouped' ? '不分组' : `「${sd.groups[gKey].name}」`;
  toast(`已收藏到 ${where}：<b>${escapeHtml(name)}</b>`);
}
/// §36.7 窗格之间 / 文件夹之间拖动 = 移动（改虚拟 FP_FS；目录连同其子树 key 一起搬）
function fpMoveEntry(fromDir, name, toDir) {
  if (!FP_FS[fromDir] || fromDir === toDir) return false;
  const src = FP_FS[fromDir];
  const idx = src.findIndex(x => (x.d || x.f) === name);
  if (idx < 0) return false;
  const entry = src[idx];
  if (!FP_FS[toDir]) FP_FS[toDir] = [];
  const nm = entry.d || entry.f;
  if (FP_FS[toDir].some(x => (x.d || x.f) === nm)) { toast(`目标已有同名「${escapeHtml(nm)}」`); return false; }
  src.splice(idx, 1);
  FP_FS[toDir].push(entry);
  if (entry.d) {                                   // 目录子树一起搬（FP_FS 按全路径做 key）
    const fromPref = (fromDir === '/' ? '' : fromDir) + '/' + nm;
    const toPref = (toDir === '/' ? '' : toDir) + '/' + nm;
    Object.keys(FP_FS).filter(pk => pk === fromPref || pk.startsWith(fromPref + '/'))
      .forEach(pk => { FP_FS[toPref + pk.slice(fromPref.length)] = FP_FS[pk]; delete FP_FS[pk]; });
  }
  return true;
}
/// §41.7 复制 = 深拷贝（源不动）；同名自动加 " copy" / " copy 2"…（Finder 惯例）
function fpCopyEntry(fromDir, name, toDir) {
  const src = FP_FS[fromDir];
  if (!src) return false;
  const idx = src.findIndex(x => (x.d || x.f) === name);
  if (idx < 0) return false;
  const entry = src[idx];
  if (!FP_FS[toDir]) FP_FS[toDir] = [];
  let nm = entry.d || entry.f;
  if (FP_FS[toDir].some(x => (x.d || x.f) === nm)) {
    const base = nm.replace(/ copy( \d+)?$/, '');
    let n = 1, cand;
    do { n++; cand = `${base} copy${n > 2 ? ' ' + (n - 1) : ''}`; }
    while (FP_FS[toDir].some(x => (x.d || x.f) === cand) && n < 30);
    nm = cand;
  }
  const clone = entry.d ? { d: nm } : { f: nm };
  ['s', 'm', 'a', 't', 'tag'].forEach(k => { if (entry[k] !== undefined) clone[k] = entry[k]; });
  FP_FS[toDir].push(clone);
  if (entry.d) {                                   // 子树整棵**复制**（键改写、原树保留）
    const fromPref = (fromDir === '/' ? '' : fromDir) + '/' + (entry.d || '');
    const toPref = (toDir === '/' ? '' : toDir) + '/' + nm;
    Object.keys(FP_FS).filter(pk => pk === fromPref || pk.startsWith(fromPref + '/'))
      .forEach(pk => {
        FP_FS[toPref + pk.slice(fromPref.length)] = FP_FS[pk].map(e2 => ({ ...e2 }));
      });
  }
  return true;
}
/// §41.7 当前选中的全部 full path（多选走 selSet，只有单选时退回 selFull）
function fpSelectedFulls(pane) {
  if (pane.selSet && pane.selSet.size) return [...pane.selSet].filter(Boolean);
  return pane.selFull ? [pane.selFull] : [];
}
/// §41.7 六个快捷键的真正动作
function fpRunHotkey(id) {
  const pane = FP.panes[FP.active];
  if (!pane) return;
  if (id === 'selectAll') {
    const rows = [...document.querySelectorAll('#fpPanes .fp-row:not(.fp-row-ph)')].map(r => r.dataset.full);
    if (!rows.length) { toast('当前没有可选的行'); return; }
    pane.selSet = new Set(rows);
    pane.selFull = rows[rows.length - 1];
    pane.sel = rows[rows.length - 1].split('/').pop();
    pane.rangeAnchor = rows[0];
    renderFinderMain();
    toast(`已全选 <b>${rows.length}</b> 项`);
    return;
  }
  if (id === 'goDesktop' || id === 'goDownloads') {
    const p = id === 'goDesktop' ? '/Users/mjm/Desktop' : '/Users/mjm/Downloads';
    if (FP_FS[p] === undefined) { toast('演示数据里没有这个目录'); return; }
    fpNavTo(FP.active, p, true);
    toast(id === 'goDesktop' ? '已前往 <b>桌面</b>' : '已前往 <b>下载</b>');
    return;
  }
  if (id === 'copy' || id === 'cut') {
    const sel = fpSelectedFulls(pane);
    if (!sel.length) { toast('先选中几项，再' + (id === 'copy' ? '复制' : '剪切')); return; }
    FP.clipboard = {
      mode: id === 'copy' ? 'copy' : 'cut',
      items: sel.map(f => { const i = f.lastIndexOf('/'); return { dir: f.slice(0, i) || '/', name: f.slice(i + 1) }; }),
    };
    try { navigator.clipboard && navigator.clipboard.writeText(sel.join('\n')); } catch (_) { /* 浏览器限制：内部状态仍在 */ }
    toast(`${id === 'copy' ? '已复制' : '已剪切'} <b>${sel.length}</b> 项`);
    return;
  }
  if (id === 'paste') {
    const cb = FP.clipboard;
    if (!cb || !cb.items || !cb.items.length) { toast('剪贴板是空的（先 ⌘C / ⌘X）'); return; }
    const to = pane.path;
    let ok = 0, fail = 0;
    cb.items.forEach(it => {
      const done = cb.mode === 'cut' ? fpMoveEntry(it.dir, it.name, to) : fpCopyEntry(it.dir, it.name, to);
      done ? ok++ : fail++;
    });
    if (cb.mode === 'cut') FP.clipboard = null;
    renderFinderMain();
    toast(`已粘贴 <b>${ok}</b> 项到 <code>${escapeHtml(to)}</code>${fail ? `（${fail} 项未成功）` : ''}`);
    return;
  }
}
/// §36.4 文件右键「收藏 ›」子菜单内容：各分组 + 不分组 + 新建分组并收藏（§41.9 改为子菜单数组）
function fpFavoriteItems(name, full, isDir) {
  const mk = (label, gKey) => ({ label, action: () => fpFavoriteInto('L', gKey, name, full, isDir) });
  const items = fpSide('L').groups.map((g, gi) => mk(`到分组「${g.name}」`, gi));
  items.push({ sep: true });
  items.push(mk('不分组（只显示这个文件）', 'ungrouped'));
  items.push({ label: '新建分组并收藏…', action: () => askModal({ title: '新建分组并收藏',
    text: `把「${name}」收进一个新分组`, value: '新分组', okText: '创建并收藏',
    onOk: v => { if (!v.trim()) return;
      const sd = fpSide('L');
      sd.groups.push({ id: 'g' + now(), name: v.trim(), collapsed: false,
        items: [{ name, path: full, file: !isDir }] });
      fpSaveSide('L'); renderFinderSide('L');
      toast(`已新建分组「${escapeHtml(v.trim())}」并收藏`); } }) });
  return [{ title: `收藏「${name}」` }].concat(items);
}
/// §36.11 地址栏右键（QSpace 惯例；你给的图未附）
function fpAddressMenu(x, y, pi) {
  const path = FP.panes[pi].path;
  showMenu([
    { label: '拷贝路径', action: () => fpCopy(path, `已拷贝路径：<code>${escapeHtml(path)}</code>`) },
    { label: '编辑地址', action: () => fpStartPathEdit(pi) },
    { label: '粘贴并前往', action: () => {
        (navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText() : Promise.reject())
          .then(t => {
            let v = (t || '').trim();
            if (!v) return toast('剪贴板是空的');
            if (v.startsWith('~')) v = '/Users/mjm' + v.slice(1);
            if (!v.startsWith('/')) return toast(`剪贴板不是路径：${escapeHtml(v.slice(0, 40))}`);
            FP.panes[pi].path = v.replace(/\/+$/, '') || '/'; fpClearSel(FP.panes[pi]);
            renderFinder(); toast(`已前往 <code>${escapeHtml(FP.panes[pi].path)}</code>`);
          }).catch(() => toast('读不到剪贴板（浏览器限制）'));
      } },
    { sep: true },
    { label: '刷新该窗格', action: () => { renderFinder(); toast('已刷新'); } },
  ], null, { x, y });
}
function renderFinderMain() {
  const main = $('#fpMain'); if (!main) return;
  const n = FP.layout === 'single' ? 1 : FP.layout === 'three' ? 3 : FP.layout === 'quad' ? 4 : 2;
  while (FP.panes.length < n) FP.panes.push({ path: FP.panes[FP.panes.length - 1].path, sel: null, expanded: [] });
  FP.panes.length = n;
  if (FP.active >= FP.panes.length) FP.active = 0;
  const cells = (from, to) => FP.panes.slice(from, to).map((p, k) => {
    const i = from + k;
    return `<div class="fp-cell${i === FP.active ? ' act' : ''}${(FP.view === 'columns' && FP.layout === 'single') ? ' fp-cell-cols' : ''}" data-pi="${i}">${fpCellHTML(p, i)}</div>`;
  }).join('<div class="fp-gap" data-gap="1"></div>');
  let inner = '';
  if (FP.layout === 'single') inner = cells(0, 1);
  else if (FP.layout === 'h2') inner = cells(0, 2);
  else if (FP.layout === 'v2') inner = cells(0, 2);
  else if (FP.layout === 'three') inner = cells(0, 1) + `<div class="fp-r2">${cells(1, 3)}</div>`;
  else inner = `<div class="fp-r2">${cells(0, 2)}</div><div class="fp-r2">${cells(2, 4)}</div>`;
  main.innerHTML = `<div class="fp-panes l-${FP.layout}" id="fpPanes" style="--fp-split:${FP.split};--fp-colw:${FP.colW}px">${inner}</div>`;
  fpBindPathRow(main);                       // §35.6 各窗格路径行：点击跳层、双击进输入
  // 窗格点击 = 激活。**只切 class 不重绘** —— 重建 DOM 会把紧接着的 dblclick 断在两个节点上
  $$('#fpPanes .fp-cell').forEach(c => c.addEventListener('mousedown', () => {
    const i = +c.dataset.pi;
    if (i !== FP.active) {
      FP.active = i;
      $$('#fpPanes .fp-cell').forEach(x => x.classList.toggle('act', +x.dataset.pi === i));
    }
  }, true));
  // 布局分屏中缝（左右/上下）
  $$('#fpPanes .fp-gap').forEach(g => {
    g.onmousedown = e => {
      e.preventDefault(); g.classList.add('drag');
      const box = $('#fpPanes').getBoundingClientRect();
      const vertical = FP.layout === 'v2';
      const move = ev => {
        const pct = vertical
          ? (ev.clientY - box.top) / box.height : (ev.clientX - box.left) / box.width;
        FP.split = Math.round(Math.min(85, Math.max(15, pct * 100))) + '%';
        $('#fpPanes').style.setProperty('--fp-split', FP.split);
      };
      const up = () => { g.classList.remove('drag');
        document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    };
  });
  /* §35.2 QSpace 核心交互：**单击=选中、双击=进入/打开**；§36 全员可拖（文件→侧栏=收藏、→其他行/窗格=移动） */
  $$('#fpPanes .fp-row, #fpPanes .fp-gcell, #fpPanes .fp-colrow').forEach(row => {
    row.addEventListener('click', ev => {
      ev.stopPropagation();
      if (ev.target.closest('.fp-twisty')) return;          // twisty 自己处理（不选中）
      if (row.dataset.kind === 'ph') return;                // §39.3 空占位行不响应
      const pi = +row.dataset.pi, name = row.dataset.name, full = row.dataset.full;
      const pane = FP.panes[pi];
      const t = Date.now();
      const last = FP.lastClick;
      const same = last && last.pi === pi && last.name === name;
      // §40.6 修饰键点击（Cmd/Shift）**不参与**双击/慢点时间线 —— 否则 Cmd 连点两次(<400ms)
      // 会被当成双击直接进目录（实测 cmd toggle 打开的行数为 0 就是这个原因）
      const plain = !ev.metaKey && !ev.ctrlKey && !ev.shiftKey;
      const isDouble = plain && same && t - last.t < 400;
      // §40.4 慢速二次单击 = 重命名（≥700ms 且非双击、非修饰键点击）
      const isSlowRename = plain && same && t - last.t >= 700 && t - last.t < 5000;
      FP.lastClick = plain && !isDouble ? { pi, name, t } : null;
      if (isDouble) {                       // 双击=进入目录 / 打开文件（自检测）
        if (row.dataset.kind === 'dir') {
          fpNavTo(pi, full || fpJoin(pane.path, name), true);   // §37.9 记历史
        } else {
          toast(`打开文件（演示）：<b>${escapeHtml(name)}</b> —— 真机上双击用系统默认应用打开`);
        }
        return;
      }
      FP.active = pi;
      const rowsAll = [...document.querySelectorAll('#fpPanes .fp-row:not(.fp-row-ph)')]
        .map(r => r.dataset.full);
      if (ev.shiftKey && pane.selFull && rowsAll.includes(pane.selFull)) {
        // §40.5 Shift=范围：锚点(上次普通单击) → 本次，含中间全部
        const a = rowsAll.indexOf(pane.rangeAnchor || pane.selFull);
        const b = rowsAll.indexOf(full);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          pane.selSet = new Set(rowsAll.slice(lo, hi + 1));
          pane.selFull = full; pane.sel = name;    // primary=最后点的
        }
      } else if (ev.metaKey || ev.ctrlKey) {
        // §40.6 Cmd=点选 toggle
        const set = pane.selSet || new Set();
        if (set.has(full)) set.delete(full); else set.add(full);
        pane.selSet = set;
        if (set.has(full)) { pane.selFull = full; pane.sel = name; }
        else if (set.size) {
          const first = [...set][set.size - 1];
          pane.selFull = first;
          pane.sel = (rowsAll.includes(first) ? first.split('/').pop() : pane.sel);
        } else { pane.selFull = null; pane.sel = null; }
      } else {
        // §40 普通单击=单选 + 记范围锚点
        pane.selSet = new Set([full]);
        pane.selFull = full; pane.sel = name;
        pane.rangeAnchor = full;               // §40.5 Shift 范围的锚点
      }
      renderFinderMain();
      if (isSlowRename) { FP.lastClick = null; fpStartRename(pi, full); }   // §40.4 慢点=重命名
    });
    row.addEventListener('contextmenu', ev => {
      ev.preventDefault(); ev.stopPropagation();
      if (row.dataset.kind === 'ph') return;              // §39.3 占位行无右键
      const pi = +row.dataset.pi;
      FP.active = pi;
      // §40.7 右键落在选区外 → 选区塌缩为该行；在选区内 → 保持多选
      if (!fpIsSel(FP.panes[pi], row.dataset.full, row.dataset.name)) {
        FP.panes[pi].sel = row.dataset.name;
        FP.panes[pi].selFull = row.dataset.full;
        FP.panes[pi].selSet = new Set([row.dataset.full]);
      }
      renderFinderMain();
      fpRowMenu(ev.clientX, ev.clientY, pi, row.dataset.name, row.dataset.kind, row.dataset.full);
    });
    /* §36.6/36.7 拖拽源：拖到侧栏=收藏、拖到别的行/窗格=移动 */
    row.setAttribute('draggable', 'true');
    row.ondragstart = e => {
      if (row.dataset.kind === 'ph') { e.preventDefault(); return; }   // §39.3 占位行不拖
      const pi = +row.dataset.pi;
      const full = row.dataset.full || fpJoin(FP.panes[pi].path, row.dataset.name);
      FP.drag = { kind: 'file', pi, name: row.dataset.name, full,
        from: FP.panes[pi].path, isDir: row.dataset.kind === 'dir' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.name);
    };
    row.ondragover = e => {
      // §38.4 只有「文件」拖拽能进窗格 —— 分组是标签不是路径，拖组经过不高亮不接受
      if (!FP.drag || FP.drag.kind !== 'file') return;
      e.preventDefault(); row.classList.add('drag-over-row');
    };
    row.ondragleave = () => row.classList.remove('drag-over-row');
    row.ondrop = e => {
      e.preventDefault(); row.classList.remove('drag-over-row');
      const d = FP.drag; if (!d || d.kind !== 'file') return;
      const pi = +row.dataset.pi;
      const targetDir = row.dataset.kind === 'dir'
        ? (row.dataset.full || fpJoin(FP.panes[pi].path, row.dataset.name))
        : FP.panes[pi].path;
      if (d.from === targetDir) { FP.drag = null; return; }
      if (fpMoveEntry(d.from, d.name, targetDir)) {
        FP.drag = null;
        renderFinder();
        toast(`已移动 <b>${escapeHtml(d.name)}</b> → <code>${escapeHtml(targetDir)}</code>`);
      } else { FP.drag = null; }
    };
  });
  /* §36.8 行首 ▸：原地展开/折叠（不进入不选中）；展开集跟窗格走 */
  $$('#fpPanes .fp-twisty').forEach(b => {
    b.onclick = ev => {
      ev.stopPropagation(); ev.preventDefault();
      const tr = b.closest('.fp-row'); if (!tr) return;
      const pi = +tr.dataset.pi, full = b.dataset.tw;
      const pane = FP.panes[pi];
      if (!Array.isArray(pane.expanded)) pane.expanded = [];
      const i = pane.expanded.indexOf(full);
      if (i >= 0) pane.expanded.splice(i, 1); else pane.expanded.push(full);
      renderFinderMain();
    };
  });
  // 空白区：单击清选中、右键=新建那套（QSpace 空白右键）
  $$('#fpPanes .fp-cell').forEach(cell => {
    const body = cell.querySelector('.fp-cellbody') || cell;
    body.addEventListener('click', ev => {
      if (ev.target.closest('.fp-row,.fp-gcell,.fp-colrow,.fp-cellpath,.fp-twisty')) return;
      const pi = +cell.dataset.pi;
      fpClearSel(FP.panes[pi]); FP.active = pi;
      renderFinderMain();
    });
    body.addEventListener('contextmenu', ev => {
      if (ev.target.closest('.fp-row,.fp-gcell,.fp-colrow,.fp-cellpath')) return;
      ev.preventDefault(); ev.stopPropagation();
      FP.active = +cell.dataset.pi;
      fpBlankMenu(ev.clientX, ev.clientY, +cell.dataset.pi);
    });
    // 拖到空白 = 放进该窗格目录（行 drop 冒泡到这里时 FP.drag 已清，天然只算一次）
    body.ondragover = e => { if (FP.drag && FP.drag.kind === 'file') e.preventDefault(); };
    body.ondrop = e => {
      const d = FP.drag; if (!d || d.kind !== 'file') return;
      const pi = +cell.dataset.pi, toDir = FP.panes[pi].path;
      if (d.from === toDir) { FP.drag = null; return; }
      if (fpMoveEntry(d.from, d.name, toDir)) {
        FP.drag = null; renderFinder();
        toast(`已移动 <b>${escapeHtml(d.name)}</b> → <code>${escapeHtml(toDir)}</code>`);
      } else { FP.drag = null; }
    };
  });
  /* §35.4 列头：点击=排序（升降序箭头）、右键=选列菜单（QSpace/Finder 惯例；
     取代 34.19 的「点击也开列菜单」） */
  $$('#fpPanes th[data-col]').forEach(th => {
    th.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); fpColumnMenu(e.clientX, e.clientY); };
    th.onclick = e => {
      e.stopPropagation();
      const key = th.dataset.col;
      if (FP.sortKey === key) FP.sortDir = FP.sortDir === 'asc' ? 'desc' : 'asc';
      else { FP.sortKey = key; FP.sortDir = 'asc'; }
      renderFinderMain();
      toast(`按<b>${FP_COL_LABEL[key] || key}</b> ${FP.sortDir === 'asc' ? '升序' : '降序'}排列`);
    };
  });
  // 分栏视图中缝：拖宽左栏
  $$('#fpPanes .fp-cols-gutter').forEach(g => {
    g.onmousedown = e => {
      e.preventDefault(); g.classList.add('drag');
      const left0 = $('#fpPanes .fp-cols-left').getBoundingClientRect().left;
      const move = ev => {
        FP.colW = Math.round(Math.min(Math.max(120, ev.clientX - left0), g.parentElement.clientWidth - 160));
        $('#fpPanes').style.setProperty('--fp-colw', FP.colW + 'px');
      };
      const up = () => { g.classList.remove('drag');
        document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    };
  });
}
/// §40 多选状态：pane.selSet(Set of full) + pane.selFull(primary) + pane.sel(primary name，兼容旧引用)
function fpClearSel(p) { p.sel = null; p.selFull = null; p.selSet = null; }
function fpIsSel(pane, full, name) {
  if (pane.selSet) return pane.selSet.has(full);
  return pane.sel === name;                                  // 兼容无 selSet 的旧状态
}
/// §35.4 排序：目录恒在前（Finder 惯例），目录内按当前列升/降序
function fpSorted(arr) {
  const k = FP.sortKey, desc = FP.sortDir === 'desc';
  const dirs = arr.filter(x => x.dir), files = arr.filter(x => !x.dir);
  if (!FP.dirsTop) {                            // §37.12 「文件夹置顶」关 → 混排（按名字）
    return [...arr].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hans') * (desc ? -1 : 1));
  }
  if (!k) return [...dirs, ...files];
  const sizeNum = v => {
    const m = /^([\d.]+)\s*(KB|MB|GB|B)?$/i.exec(String(v).trim());
    if (String(v).includes('字节')) return parseFloat(v) || 0;
    if (!m) return -1;
    const n = parseFloat(m[1]); const u = (m[2] || 'B').toUpperCase();
    return n * (u === 'GB' ? 1073741824 : u === 'MB' ? 1048576 : u === 'KB' ? 1024 : 1);
  };
  const dateNum = v => {
    const s = String(v).trim();
    if (s === '昨天') return 99999999; if (s === '前天') return 99999998;
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
    return m ? (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]) : -1;
  };
  const val = e => k === 'name' ? e.name.toLowerCase()
    : k === 'size' ? sizeNum(e.s)
    : (k === 'mtime' || k === 'added') ? dateNum(k === 'mtime' ? e.m : e.a)
    : String(fpColValue(e, k) || '').toLowerCase();
  const cmp = (a, b) => {
    const va = val(a), vb = val(b);
    const r = typeof va === 'number' && typeof vb === 'number'
      ? va - vb : String(va).localeCompare(String(vb), 'zh-Hans');
    return desc ? -r : r;
  };
  return [...dirs.sort(cmp), ...files.sort(cmp)];
}
/* ══ §42.7–42.9 聚焦搜索：语法（或 / 且 / 排除）按设置真的生效 ══
   QSpace「聚焦搜索」页把分隔符做成勾选（图3 实拍：或者=☑空格、并且=☑&、排除=☑-），
   同一个搜索框因此能表达不同的搜索方式 —— 这里照同一套语义实现。 */
const FP_SEARCH_DEF = {
  or: { space: true, bar: false, semi: false, comma: false },
  and: { space: false, amp: true, semi: false, comma: false },
  excl: { minus: true, caret: false, bang: false },
};
const FP_SEARCH_OR_CH = { space: ' ', bar: '|', semi: ';', comma: ',' };
const FP_SEARCH_AND_CH = { space: ' ', amp: '&', semi: ';', comma: ',' };
const FP_SEARCH_EXCL_CH = { minus: '-', caret: '^', bang: '!' };
function fpSearchSyntax() {
  const out = JSON.parse(JSON.stringify(FP_SEARCH_DEF));
  const s = S.finderSearchSyntax;
  if (s && typeof s === 'object') {
    ['or', 'and', 'excl'].forEach(k => { if (s[k] && typeof s[k] === 'object') Object.assign(out[k], s[k]); });
  }
  return out;
}
/// 查询串 → { groups: [[或-词…], …]（组间=并且）, excluded: [排除词] }
function fpParseSearch(raw) {
  const cfg = fpSearchSyntax();
  const andCh = [], orCh = [], exclCh = [];
  Object.keys(FP_SEARCH_AND_CH).forEach(k => { const c = FP_SEARCH_AND_CH[k]; if (cfg.and[k] && andCh.indexOf(c) < 0) andCh.push(c); });
  Object.keys(FP_SEARCH_OR_CH).forEach(k => { const c = FP_SEARCH_OR_CH[k]; if (cfg.or[k] && orCh.indexOf(c) < 0) orCh.push(c); });
  Object.keys(FP_SEARCH_EXCL_CH).forEach(k => { if (cfg.excl[k]) exclCh.push(FP_SEARCH_EXCL_CH[k]); });
  orCh.slice().forEach(c => { const i = orCh.indexOf(c), j = andCh.indexOf(c); if (j >= 0) orCh.splice(i, 1); });  // 两边都勾 → 按"并且"
  const s = String(raw || '').trim();
  if (!s) return { groups: [], excluded: [] };
  if (!andCh.length && !orCh.length) {
    if (exclCh.length && exclCh.indexOf(s[0]) >= 0 && s.length > 1) return { groups: [], excluded: [s.slice(1).toLowerCase()] };
    return { groups: [[s.toLowerCase()]], excluded: [] };
  }
  const groups = [];
  let cur = [], buf = '', excluded = [];
  const flushTok = () => {
    const t = buf; buf = '';
    if (!t) return;
    if (exclCh.indexOf(t[0]) >= 0) { const w = t.slice(1).toLowerCase(); if (w) excluded.push(w); return; }
    cur.push(t.toLowerCase());
  };
  const flushGroup = () => { flushTok(); if (cur.length) { groups.push(cur); cur = []; } };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (andCh.indexOf(ch) >= 0) { flushGroup(); continue; }
    if (orCh.indexOf(ch) >= 0) { flushTok(); continue; }
    buf += ch;
  }
  flushGroup();
  return { groups, excluded };
}
/// 一个名字过不过搜索（大小写不敏感子串）
function fpSearchPass(name, raw) {
  const q = String(raw || '').trim();
  if (!q) return true;
  const p = fpParseSearch(q);
  const n = name.toLowerCase();
  if (p.excluded.some(w => n.indexOf(w) >= 0)) return false;
  if (!p.groups.length) return true;                     // 只写了排除项 → 除它们之外全过
  return p.groups.every(g => g.some(w => n.indexOf(w) >= 0));
}
function fpCellHTML(pane, pi) {
  const entries = fpSorted(fpEntries(pane.path));
  const wrap = inner => fpPathRowHTML(pane, pi) + `<div class="fp-cellbody">${inner}</div>`;
  if (FP.layout === 'single' && FP.view === 'columns') {
    // 分栏视图：左 = 当前目录的子目录（点选），右 = 选中目录内容（Finder 经典钻取）
    const subs = entries.filter(x => x.dir);
    const selName = pane.sel && subs.some(x => x.name === pane.sel) ? pane.sel : (subs[0] ? subs[0].name : null);
    const rightPath = selName ? fpJoin(pane.path, selName) : pane.path;
    const right = fpSorted(fpEntries(rightPath));
    const rowOf = (e2, basePath) => `<div class="fp-row fp-colrow${fpIsSel(pane, fpJoin(basePath, e2.name), e2.name) ? ' sel' : ''}"
        data-kind="${e2.dir ? 'dir' : 'file'}" data-name="${escapeHtml(e2.name)}" data-full="${escapeHtml(fpJoin(basePath, e2.name))}" data-pi="${pi}"
        style="display:flex;gap:7px;align-items:center;padding:6px 10px;font-size:13px;cursor:pointer;
        color:${e2.dir ? 'var(--ink)' : 'var(--ink2)'};${fpIsSel(pane, fpJoin(basePath, e2.name), e2.name) ? 'background:rgba(10,132,255,.28)' : ''}">
        ${fpIco(e2)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e2.name)}</span></div>`;
    return wrap(`<div class="fp-cols">
      <div class="fp-cols-left">${subs.length ? subs.map(x => rowOf(x, pane.path)).join('') : '<div class="fp-empty">没有子文件夹</div>'}</div>
      <div class="fp-cols-gutter" title="拖动调宽"></div>
      <div class="fp-cols-right">${right.length ? right.map(x => rowOf(x, rightPath)).join('') : '<div class="fp-empty">空文件夹</div>'}</div>
    </div>`);
  }
  if (FP.layout === 'single' && FP.view === 'icon') {
    return wrap(`<div class="fp-grid">${entries.map(e2 => `<div class="fp-gcell${fpIsSel(pane, fpJoin(pane.path, e2.name), e2.name) ? ' sel' : ''}"
      data-kind="${e2.dir ? 'dir' : 'file'}" data-name="${escapeHtml(e2.name)}" data-full="${escapeHtml(fpJoin(pane.path, e2.name))}" data-pi="${pi}">
      <span class="gc-ico ${e2.dir ? 'fp-dir' : ''}" style="${e2.dir ? '' : 'background:#8E8E93'}">${e2.dir ? '▸' : escapeHtml((e2.name.split('.').pop() || '?').slice(0, 2).toUpperCase())}</span>
      <span class="gc-name">${escapeHtml(e2.name)}</span></div>`).join('')}</div>`);
  }
  // 列表视图（单/多窗格通用）—— §36.8 树形：group=none 时展开目录原地缩进（▸ 不进入）
  const cols = ['name', ...FP.cols];
  const head = `<tr>${cols.map(c => {
    const sk = c === FP.sortKey ? (FP.sortDir === 'asc' ? ' sort-asc' : ' sort-desc') : '';
    return `<th data-col="${c}" class="${sk}" title="点击按此列排序 · 右键选择显示哪些列">${FP_COL_LABEL[c]}</th>`;
  }).join('')}</tr>`;
  let body = '';
  if (FP.group === 'none') {
    // §36.8/36.9 树形 flatten + 斑马纹序号（交替底色跨层级连续）
    const rows = [];
    let alt = 0;
    const walk = (pth, depth) => {
      // §42.8 窗格内搜索走「聚焦搜索」的语法（或/且/排除），不再是裸 includes
      const list = fpSorted(fpEntries(pth)).filter(e2 => fpSearchPass(e2.name, pane.q));
      list.forEach(e2 => {
        const full = fpJoin(pth, e2.name);
        const exp = e2.dir && (pane.expanded || []).includes(full);
        rows.push({ e: e2, depth, alt: alt % 2 === 1, full, expanded: exp });
        alt++;
        if (exp) {
          const kids = fpSorted(fpEntries(full)).filter(k => fpSearchPass(k.name, pane.q));
          if (!kids.length) {
            // §39.3 无内容目录展开必须有反馈 —— 占位行（原来 0 行=「点了没反应」）
            rows.push({ e: { name: '（空文件夹）', dir: false, placeholder: true }, depth: depth + 1,
              alt: alt % 2 === 1, full: full + '/~empty', expanded: false });
            alt++;
          } else walk(full, depth + 1);
        }
      });
    };
    walk(pane.path, 0);
    body = rows.map(r => fpRowHTML(r, cols, pane, pi)).join('');
  } else {
    const entries = fpSorted(fpEntries(pane.path));
    const map = new Map();
    const dirs = entries.filter(x => x.dir), files = entries.filter(x => !x.dir);
    [...dirs, ...files].forEach(e2 => {
      const gk = fpGroupValue(e2, FP.group) || '—';
      if (!map.has(gk)) map.set(gk, []);
      map.get(gk).push(e2);
    });
    [...map.entries()].forEach(([gk, list]) => {
      body += `<tr class="fp-gh"><td colspan="${cols.length}">${escapeHtml(gk)}（${list.length}）</td></tr>`;
      body += list.map(e2 => fpRowHTML(
        { e: e2, depth: 0, alt: false, full: fpJoin(pane.path, e2.name), expanded: false },
        cols, pane, pi)).join('');
    });
  }
  return wrap(`<table class="fp-table"><thead>${head}</thead><tbody>${body || ''}</tbody></table>`
    + (entriesLen(pane) ? '' : '<div class="fp-empty">空文件夹</div>'));
}
function entriesLen(pane) { return fpEntries(pane.path).length; }
function fpRowHTML(row, cols, pane, pi) {
  const e2 = row.e;
  if (e2.placeholder) {                            // §39.3 空文件夹占位行（不可点不可拖）
    const padP = 6 + row.depth * 22;
    return `<tr class="fp-row fp-row-ph${row.alt ? ' alt' : ''}" data-kind="ph" data-pi="${pi}">`
      + `<td class="fp-c-name" style="padding-left:${padP}px"><span class="fp-twisty-sp"></span>`
      + `<span class="fp-ico" style="background:transparent"></span>`
      + `<span style="color:#5F6A70;font-style:italic">（空文件夹）</span></td>`
      + `<td class="fp-c-mono"></td>`.repeat(cols.length - 1) + `</tr>`;
  }
  const twisty = e2.dir
    ? `<button class="fp-twisty${row.expanded ? ' open' : ''}" data-tw="${escapeHtml(row.full)}" title="展开/折叠（不进入）"><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M4.5 2.5 L8 6 L4.5 9.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`
    : `<span class="fp-twisty-sp"></span>`;
  const pad = 6 + row.depth * 22;                       // §39.1 每层 22px（对照图2 层级感）
  const tds = cols.map(c => c === 'name'
    ? `<td class="fp-c-name" style="padding-left:${pad}px">${twisty}${fpIco(e2)}<span>${escapeHtml(e2.name)}</span>${e2.tag ? `<span class="tag-dot" style="background:${escapeHtml(e2.tag)}"></span>` : ''}</td>`
    : `<td class="fp-c-mono">${escapeHtml(String(fpColValue(e2, c)))}</td>`).join('');
  const isSel = fpIsSel(pane, row.full, e2.name);
  return `<tr class="fp-row${isSel ? ' sel' : ''}${pane.selFull === row.full ? ' sel-primary' : ''}${row.alt ? ' alt' : ''}" draggable="true"
    data-kind="${e2.dir ? 'dir' : 'file'}" data-name="${escapeHtml(e2.name)}"
    data-full="${escapeHtml(row.full)}" data-depth="${row.depth}" data-pi="${pi}">${tds}</tr>`;
}
/// 表头菜单 —— 条目/顺序照 Finder 照片（修改日期…标签 + 多媒体 › + 其他 › + 恢复/设置默认）
function fpColumnMenu(x, y) {
  const items = FP_COL_DEFS.map(([k, l]) => ({
    label: (FP.cols.includes(k) ? '✓ ' : '  ') + l,
    action: () => {
      if (FP.cols.includes(k)) FP.cols = FP.cols.filter(c => c !== k);
      else FP.cols.push(k);
      renderFinderMain();
    },
  }));
  items.push({ sep: true });
  items.push({ label: '多媒体', sub: [
     { label: '时长', action: () => toast('「时长」需要媒体文件的元数据（原型数据里没有，如实显示 —）') },
     { label: '艺术家', action: () => toast('同上：媒体元数据列，原型显示 —') } ] });
  items.push({ label: '其他', sub: [
      { label: '所有者', action: () => fpToggleCol('owner') },
      { label: '位置', action: () => toast('「位置」列原型数据没有，显示 —') },
      { label: '注释', action: () => fpToggleCol('comment') } ] });
  items.push({ sep: true });
  items.push({ label: '恢复到默认', action: () => { FP.cols = [...FP_COLS_DEFAULT]; renderFinderMain(); toast('列已恢复默认'); } });
  items.push({ label: '设置为默认', action: () => { S.finderColsDefault = [...FP.cols]; save(true); toast('当前列组合已存为默认'); } });
  showMenu(items, null, { x, y });
}
function fpToggleCol(k) {
  if (FP.cols.includes(k)) FP.cols = FP.cols.filter(c => c !== k); else FP.cols.push(k);
  renderFinderMain();
}
/* ══ §35.3 右键菜单三套 —— 文案 1:1 取自 QSpace Pro 的 Localizable.strings（本机实读）。
   动作 = 原型演示（toast/剪贴板/排序真生效）；真执行（压缩/重命名落盘）属 Swift 侧。══ */
function fpCopy(text, say) {
  try { navigator.clipboard.writeText(text); toast(say); } catch (e) { toast('复制失败（浏览器限制）'); }
}
/// §41.9 三个「›」的**内容**都改成返回数组（由父菜单以子菜单形式挂在右侧），不再自己开一屏
function fpTagsItems(name) {
  const colors = [['红', '#FF5F57'], ['橙', '#F7A23B'], ['黄', '#FFD60A'], ['绿', '#2CCB6E'], ['蓝', '#54A2FF'], ['紫', '#BF5AF2']];
  return [{ title: `给「${name}」添加标签` }].concat(
    colors.map(([n, c]) => ({ label: `${n}`, action: () => toast(`标签「${n}」已标上（演示）：${escapeHtml(name)}`) })),
    [{ sep: true }, { label: '移除标签', action: () => toast('已移除标签（演示）') }]);
}
function fpOpenWithItems(name) {
  return [{ title: '打开方式' },
    { label: '默认应用', action: () => toast(`用系统默认应用打开（演示）：<b>${escapeHtml(name)}</b>`) },
    { label: '文本编辑', action: () => toast(`用「文本编辑」打开（演示）：${escapeHtml(name)}`) },
    { label: 'Visual Studio Code', action: () => toast(`用 VS Code 打开（演示）：${escapeHtml(name)}`) },
    { label: '选择其他应用…', action: () => toast('打开方式选择器（落 SwiftUI 用 NSWorkspace）') }];
}
function fpAlwaysOpenWithItems(name) {
  return [{ title: '始终以此方式打开' }].concat(fpOpenWithItems(name).slice(1).map(it =>
    ({ label: it.label, action: () => toast(`默认打开方式已改为「${escapeHtml(it.label)}」（演示）：${escapeHtml(name)}`) })));
}
/* ══ §42.3–42.6 右键菜单 = **配置清单驱动**（QSpace 的 JHSContextMenuConf 模型）══
   以前 fpRowMenu 是一串写死的 items；现在：S.finderCtxMenu = 已启用项 id 顺序，
   设置窗拖拽改的就是它，右键渲染读的也是它 —— 两边不可能不同步。 */
const FP_CTX_DEFAULT = ['showInFinder', 'newFolderSel', 'copyTo', 'sep',
  'rename', 'quickRename', 'copy', 'openWith', 'alwaysOpenWith', 'sep',
  'compress', 'alias', 'imgJoin', 'paneLeft', 'sep',
  'swatches', 'sep', 'favorite', 'customFolder'];
const FP_CTX_FINDER_MODE = ['showInFinder', 'sep', 'rename', 'sep', 'copy', 'cut', 'sep', 'openWith', 'sep', 'getInfo'];
/// 静态文案（设置窗左列显示用）+ type 标签 + 快捷键（照 QSpace hotkey.json / 图2）
const FP_CTX_META = {
  showInFinder: { l: '在访达中显示', i: '👁', t: 'function', k: '⌘↩' },
  newFolderSel: { l: '用所选项目新建文件夹', i: '📁', t: 'function', k: '^⌘N' },
  copyTo: { l: '复制到…', i: '⧉', t: 'function' },
  moveTo: { l: '移动到…', i: '✂', t: 'function' },
  rename: { l: '重命名', i: '✏️', t: 'function', k: '⇧⌘R' },
  quickRename: { l: '快速重命名', i: '☰', t: 'function' },
  copy: { l: '拷贝', i: '📋', t: 'function', k: '⌘C' },
  copyPath: { l: '拷贝路径', i: '/…', t: 'function', k: '⇧⌘L' },
  copyTermPath: { l: '拷贝终端路径', i: '/..', t: 'function' },
  copyWinPath: { l: '拷贝 Windows 路径', i: '\\W', t: 'function' },
  copyURL: { l: '拷贝 URL', i: '://', t: 'function' },
  copyFileName: { l: '拷贝文件名', i: '📄', t: 'function' },
  openWith: { l: '打开方式', i: '↗', t: 'function' },
  alwaysOpenWith: { l: '始终以此方式打开', i: '', t: 'function' },
  compress: { l: '压缩', i: '🗜', t: 'function' },
  compressAlone: { l: '单独压缩', i: '⇊', t: 'function' },
  decompress: { l: '解压', i: '⇕', t: 'function' },
  decompressTo: { l: '解压到…', i: '', t: 'function' },
  alias: { l: '制作替身', i: '🔗', t: 'function' },
  imgJoin: { l: '图片拼接', i: '🖼', t: 'quicklaunch' },
  setWallpaper: { l: '设为桌面背景', i: '🏞', t: 'function' },
  convertImage: { l: '转换图像', i: '🔄', t: 'function' },
  rotateRight: { l: '向右旋转', i: '↻', t: 'function', k: '⌥R' },
  paneLeft: { l: '将窗格向左移', i: '⇤', t: 'function' },
  paneRight: { l: '将窗格向右移', i: '⇥', t: 'function' },
  tags: { l: '标签', i: '🏷', t: 'function' },
  swatches: { l: '标签色点', i: '🎨', t: 'function' },
  favorite: { l: '收藏', i: '📁', t: 'function' },
  customFolder: { l: '自定义文件夹…', i: '🏷', t: 'function' },
  getInfo: { l: '显示简介', i: 'ⓘ', t: 'function', k: '⇧⌘I' },
  cut: { l: '剪切', i: '✂', t: 'function', k: '⌘X' },
  dup: { l: '复制', i: '⧉', t: 'function' },
  invertSel: { l: '反向选择', i: '⇄', t: 'function' },
  selectByCond: { l: '按条件选择', i: '☑', t: 'function' },
  addBookmark: { l: '添加书签', i: '⭐', t: 'function' },
  copyToHere: { l: '复制到此处…', i: '', t: 'function' },
  moveToHere: { l: '移动到此处…', i: '', t: 'function' },
  copyToPaneUp: { l: '复制到上方窗格', i: '', t: 'function' },
  copyToPaneDown: { l: '复制到下方窗格', i: '', t: 'function' },
  copyToPaneLeft: { l: '复制到左侧窗格', i: '', t: 'function' },
  copyToPaneRight: { l: '复制到右侧窗格', i: '', t: 'function' },
  moveToPaneUp: { l: '移动到上方窗格', i: '', t: 'function' },
  moveToPaneDown: { l: '移动到下方窗格', i: '', t: 'function' },
  moveToPaneLeft: { l: '移动到左侧窗格', i: '', t: 'function' },
  moveToPaneRight: { l: '移动到右侧窗格', i: '', t: 'function' },
  extractBetterZip: { l: 'Extract with BetterZip*', i: '📦', t: 'service' },
  sep: { l: '—— 分割线 ——', i: '', t: 'separator' },
};
function fpCtxEnabled() {
  const v = S.finderCtxMenu;
  // ⚠️ 只在「压根不是数组」时才回落默认：`[]` 是用户按了「清空」的**真实状态**，
  //    写成 `&& v.length` 会让清空按钮看起来按了没反应（42.6 实测踩到）。
  return Array.isArray(v) ? [...v] : [...FP_CTX_DEFAULT];
}
function fpCtxShowSelection() { return S.finderCtxShowSelection !== false; }   // 图2 底部开关，默认开
/// 一个已启用的 id → showMenu 的一个 item（ctx = {pi,name,path,kind}）
function fpCtxItem(id, ctx, showSel) {
  if (id === 'sep') return { sep: true };
  if (id.indexOf('group:') === 0) return { title: id.slice(6) };
  const nm = showSel ? `“${ctx.name}”` : '';          // 42.5 关掉「显示选择项」→ 所有 “X” 后缀消失
  switch (id) {
    case 'showInFinder': return { icon: '👁', label: '在访达中显示', action: () => toast(`在系统访达中显示（演示）：<b>${escapeHtml(ctx.name)}</b>`) };
    case 'newFolderSel': return { icon: '📁', label: '用所选项目新建文件夹', action: () => askModal({ title: '用所选项目新建文件夹',
        text: `选中：${ctx.name} · 位置：${ctx.path}`, value: '新建文件夹', okText: '创建',
        onOk: v => { if (v && v.trim()) toast(`已新建「${escapeHtml(v.trim())}」并放入所选项目（演示）`); } }) };
    case 'copyTo': return { icon: '⧉', label: '复制到…', sub: [
        { label: '到左侧窗格', action: () => toast(`复制到左侧窗格（演示）：${escapeHtml(ctx.name)}`) },
        { label: '到右侧窗格', action: () => toast(`复制到右侧窗格（演示）：${escapeHtml(ctx.name)}`) },
        { label: '到桌面', action: () => toast(`复制到桌面（演示）：${escapeHtml(ctx.name)}`) }] };
    case 'moveTo': return { icon: '✂', label: '移动到…', sub: [
        { label: '到左侧窗格', action: () => toast(`移动到左侧窗格（演示）：${escapeHtml(ctx.name)}`) },
        { label: '到桌面', action: () => toast(`移动到桌面（演示）：${escapeHtml(ctx.name)}`) }] };
    case 'rename': return { icon: '✏️', label: `重命名${nm}`, action: () => fpStartRename(ctx.pi, ctx.path) };
    case 'quickRename': return { icon: '☰', label: '快速重命名', sub: [
        { label: '添加前缀…', action: () => toast('快速重命名 · 前缀（演示）') },
        { label: '添加后缀…', action: () => toast('快速重命名 · 后缀（演示）') },
        { label: '替换文本…', action: () => toast('快速重命名 · 替换（演示）') }] };
    case 'copy': return { icon: '📋', label: `拷贝${nm}`, action: () => fpCopy(ctx.path, `已拷贝「${escapeHtml(ctx.name)}」的路径到剪贴板`) };
    case 'copyPath': return { icon: '/…', label: '拷贝路径', action: () => fpCopy(ctx.path, `已拷贝路径：<code>${escapeHtml(ctx.path)}</code>`) };
    case 'copyTermPath': return { icon: '/..', label: '拷贝终端路径', action: () => fpCopy(ctx.path, '已按终端格式拷贝路径（演示）') };
    case 'copyWinPath': return { icon: '\\W', label: '拷贝 Windows 路径', action: () => fpCopy(ctx.path, '已按 Windows 格式拷贝路径（演示）') };
    case 'copyURL': return { icon: '://', label: '拷贝 URL', action: () => fpCopy('file://' + ctx.path, '已拷贝 URL') };
    case 'copyFileName': return { icon: '📄', label: '拷贝文件名', action: () => fpCopy(ctx.name, `已拷贝文件名：${escapeHtml(ctx.name)}`) };
    case 'openWith': return { icon: '↗', label: '打开方式', sub: fpOpenWithItems(ctx.name) };
    case 'alwaysOpenWith': return { label: '始终以此方式打开', sub: fpAlwaysOpenWithItems(ctx.name) };
    case 'compress': return { icon: '🗜', label: `压缩${nm}`, action: () => toast(`已压缩为 ${escapeHtml(ctx.name)}.zip（演示）`) };
    case 'compressAlone': return { icon: '⇊', label: '单独压缩', action: () => toast(`单独压缩（演示）：${escapeHtml(ctx.name)}`) };
    case 'decompress': return { icon: '⇕', label: '解压', action: () => toast(`解压「${escapeHtml(ctx.name)}」（演示）`) };
    case 'decompressTo': return { label: '解压到…', sub: [{ label: '到当前窗格', action: () => toast('解压到当前窗格（演示）') }] };
    case 'alias': return { icon: '🔗', label: '制作替身', action: () => toast(`已制作替身（演示）：${escapeHtml(ctx.name)}`) };
    case 'imgJoin': return { icon: '🖼', label: '图片拼接', action: () => toast('图片拼接（QSpace 扩展功能，演示）') };
    case 'setWallpaper': return { icon: '🏞', label: '设为桌面背景', action: () => toast(`已设为桌面背景（演示）：${escapeHtml(ctx.name)}`) };
    case 'convertImage': return { icon: '🔄', label: '转换图像', action: () => toast('转换图像（演示）') };
    case 'rotateRight': return { icon: '↻', label: '向右旋转', action: () => toast('已向右旋转 90°（演示）') };
    case 'paneLeft': return { icon: '⇤', label: '将窗格向左移', action: () => toast('已将本窗格内容移向左侧窗格（演示）') };
    case 'paneRight': return { icon: '⇥', label: '将窗格向右移', action: () => toast('已将本窗格内容移向右侧窗格（演示）') };
    case 'tags': return { icon: '🏷', label: '标签', sub: fpTagsItems(ctx.name) };
    case 'swatches': return { swatches: ['#FF5F57', '#F7A23B', '#FFD60A', '#2CCB6E', '#54A2FF', '#BF5AF2'],
        action: i => fpSetTag(ctx.path, ['#FF5F57', '#F7A23B', '#FFD60A', '#2CCB6E', '#54A2FF', '#BF5AF2'][i]) };
    case 'favorite': return { icon: '📁', label: '收藏', sub: fpFavoriteItems(ctx.name, ctx.path, ctx.kind === 'dir') };
    case 'customFolder': return { icon: '🏷', label: '自定义文件夹…', action: () => toast('自定义文件夹（QSpace 扩展，演示）') };
    case 'getInfo': return { icon: 'ⓘ', label: '显示简介', action: () => toast(`简介（演示）：${escapeHtml(ctx.name)}`) };
    case 'cut': return { icon: '✂', label: '剪切', action: () => toast(`已剪切（演示）：${escapeHtml(ctx.name)}`) };
    case 'dup': return { icon: '⧉', label: '复制', action: () => toast(`已复制副本（演示）：${escapeHtml(ctx.name)}`) };
    case 'invertSel': return { icon: '⇄', label: '反向选择', action: () => toast('已反向选择（演示）') };
    case 'selectByCond': return { icon: '☑', label: '按条件选择', sub: [
        { label: '按名称…', action: () => toast('按条件选择 · 名称（演示）') },
        { label: '按修改日期…', action: () => toast('按条件选择 · 日期（演示）') }] };
    case 'addBookmark': return { icon: '⭐', label: '添加书签', action: () => toast(`已添加书签（演示）：${escapeHtml(ctx.name)}`) };
    case 'copyToHere': return { label: '复制到此处…', action: () => toast('复制到此处（演示）') };
    case 'moveToHere': return { label: '移动到此处…', action: () => toast('移动到此处（演示）') };
    case 'copyToPaneUp': case 'copyToPaneDown': case 'copyToPaneLeft': case 'copyToPaneRight':
    case 'moveToPaneUp': case 'moveToPaneDown': case 'moveToPaneLeft': case 'moveToPaneRight': {
      const m = FP_CTX_META[id];
      return { label: m.l, action: () => toast(`${m.l}（演示）：${escapeHtml(ctx.name)}`) };
    }
    case 'extractBetterZip': return { icon: '📦', label: 'Extract with BetterZip*', action: () => toast('BetterZip 解压（服务，演示）') };
    default: return null;
  }
}
function fpRowMenu(x, y, pi, name, kind, fullPath) {
  const path = fullPath || fpJoin(FP.panes[pi].path, name);
  const ctx = { pi, name, path, kind };
  const showSel = fpCtxShowSelection();
  const items = fpCtxEnabled().map(id => fpCtxItem(id, ctx, showSel)).filter(Boolean);
  // §37.14 添加到项目：文件夹专属，钉在收藏上面（与配置无关 —— 它是本项目自己的联动）
  if (kind === 'dir' && !items.some(it => it.label === '添加到项目')) {
    const fi = items.findIndex(it => it.icon === '📁' && String(it.label).startsWith('收藏'));
    const entry = { icon: '⭐', label: '添加到项目', action: () => fpAddToProject(path, name) };
    items.splice(fi < 0 ? items.length : fi, 0, entry);
  }
  showMenu(items, null, { x, y });
}
/// §37.13 色点 = 贴标签（真改数据，行首名称后显示圆点）
function fpSetTag(full, color) {
  const parts = full.split('/'); const nm = parts.pop();
  const dir = parts.join('/') || '/';
  const ent = (FP_FS[dir] || []).find(x => (x.d || x.f) === nm);
  if (ent) { ent.tag = ent.tag === color ? null : color; renderFinderMain(); toast('标签已更新'); }
}
/// §37.14 右键文件夹 → 添加到项目（左侧项目区出一张新卡）
function fpAddToProject(full, name) {
  if (S.projects.some(p => p && p.path === full)) { toast('这个文件夹已经在项目里了'); return; }
  const tree = (FP_FS[full] || []).map(e => e.d
    ? { name: e.d, type: 'dir', open: false, children: [] }
    : { name: e.f, type: 'file' });
  const proj = Object.assign(sampleProject(), {
    id: 'p' + now(), name, path: full, files: {}, tree,
    convs: [], activeProjChat: null, sleeping: false, extraPaths: [],
  });
  const di = S.projects.findIndex(p => p && p.isDefault);
  S.projects.splice(di < 0 ? S.projects.length : di, 0, proj);
  save(true); renderNav();
  toast(`已添加到项目：<b>${escapeHtml(name)}</b> —— 左侧项目区可见，点它即可对这个文件夹开发`);
}
function fpBlankMenu(x, y, pi) {
  const path = FP.panes[pi].path;
  const newFile = ext => () => toast(`新建文件 untitled.${ext}（演示）—— 将落在 <code>${escapeHtml(path)}</code>`);
  showMenu([
    { label: '新建文件夹', action: () => askModal({ title: '新建文件夹', text: `位置：${path}`, value: '未命名文件夹',
        okText: '创建', onOk: v => { if (v && v.trim()) toast(`已新建文件夹「${escapeHtml(v.trim())}」（演示）`); } }) },
    { label: '新建文件', sub: [
      { label: '纯文本 .txt', action: newFile('txt') },
      { label: 'Markdown .md', action: newFile('md') },
      { label: 'Shell 脚本 .sh', action: newFile('sh') },
      { label: '网页 .html', action: newFile('html') },
      { label: 'Python .py', action: newFile('py') },
    ] },
    { sep: true },
    { label: '粘贴', action: () => toast('粘贴（演示）') },
    { sep: true },
    { label: '排序方式', sub:
      [['name', '名称'], ['size', '大小'], ['mtime', '修改日期'], ['added', '添加日期']].map(([k, l]) => ({
        label: (FP.sortKey === k ? '✓ ' : '　') + l,
        action: () => { FP.sortKey = k; FP.sortDir = 'asc'; renderFinderMain(); toast(`已按<b>${l}</b>排序`); },
      })).concat([{ sep: true }, { label: '↑ 升序 / ↓ 降序（再点表头切换）', action: () => {} }]) },
    { label: '刷新', action: () => { renderFinder(); toast('已刷新'); } },
    { sep: true },
    { label: '显示简介', action: () => toast(`当前文件夹简介（演示）：<code>${escapeHtml(path)}</code>`) },
  ], null, { x, y });
}

/* —— 访达接线（脚本尾部，DOM 已就绪）—— */
(function bindFinder() {
  const t = $('#finderToggle');
  if (t) t.onclick = () => setFinderOpen(!finderOpen);
  /* §37.6 三态：藏左 / 藏右 / 全屏访达 */
  const sync = () => syncThreeStateBtns();
  $('#fpShowLeft').onclick = () => { document.body.classList.toggle('finder-hide-left'); sync(); };
  $('#fpShowRight').onclick = () => { document.body.classList.toggle('finder-hide-right'); sync(); };
  $('#fpFull').onclick = () => {
    const both = document.body.classList.contains('finder-hide-left')
      && document.body.classList.contains('finder-hide-right');
    document.body.classList.toggle('finder-hide-left', !both);
    document.body.classList.toggle('finder-hide-right', !both);
    sync();
    toast(both ? '已退出全屏访达 —— 项目与对话都回来了' : '全屏访达 —— 只剩访达');
  };
  /* §38.2 QSpace 工具栏三钮（实证 id：share_airdrop / set_as_desktop_background / open_in_terminal） */
  const selInfo = pi => {
    const pane = FP.panes[pi] || FP.panes[FP.active];
    return { sel: pane.sel, path: pane.path };
  };
  const activeInfo = () => selInfo(FP.active);
  $('#fpAirDrop').onclick = () => {
    const { sel, path } = activeInfo();
    toast(sel ? `隔空投送「<b>${escapeHtml(sel)}</b>」（演示——真机走系统共享面板）`
              : `隔空投送当前路径（演示）：<code>${escapeHtml(path)}</code>`);
  };
  $('#fpWallpaper').onclick = () => {
    const { sel } = activeInfo();
    if (!sel) return toast('先选中一张图片，再点「设为壁纸」');
    if (!/\.(png|jpe?g|gif|webp|heic|tiff?)$/i.test(sel)) return toast(`「${escapeHtml(sel)}」不是图片 —— 选中图片再试`);
    toast(`已设为桌面背景（演示）：<b>${escapeHtml(sel)}</b> —— 真机走 set_as_desktop_background`);
  };
  $('#fpTerminal').onclick = () => {
    const { sel, path } = activeInfo();
    const dir = sel && FP_FS[fpJoin(path, sel)] !== undefined ? fpJoin(path, sel) : path;
    toast(`已在终端打开（演示）：<code>${escapeHtml(dir)}</code> —— 真机走 open_in_terminal`);
  };
  // ⋮ 面板：点外面关（面板与 ⋮ 本身除外）
  document.addEventListener('click', e => {
    const p = document.getElementById('fpViewPanel');
    if (p && !p.hidden && !e.target.closest('#fpViewPanel') && !e.target.closest('[data-fa="more"]')) p.hidden = true;
  });
  // §42 「⌨ 快捷键」并入 QSpace 设置窗的快捷键页（同一个 S.finderHotkeys，同一套录制/恢复/存盘）
  const hkBtn = $('#fpHotkeys');
  if (hkBtn) hkBtn.onclick = e => { e.stopPropagation(); qspOpenPage('hotkeys'); };
  // 视图 / 分组 / 分屏 / 交换
  $$('#fpViews button').forEach(b => b.onclick = () => { FP.view = b.dataset.view; renderFinder(); });
  $$('#fpLayouts button').forEach(b => b.onclick = () => { FP.layout = b.dataset.layout; renderFinder(); });
  const gb = $('#fpGroupBtn');
  if (gb) gb.onclick = e => {
    // 必须拦住冒泡：bind() 里那条文档级「点外面就关菜单」会把刚开的菜单在同一击里关掉
    e.stopPropagation();
    showMenu(FP_GROUP_OPTS.map(([v, l]) => ({
      label: (FP.group === v ? '✓ ' : '  ') + l,
      action: () => { FP.group = v; renderFinder(); },
    })), gb);
  };
  const sw = $('#fpSwap');
  if (sw) sw.onclick = () => {
    if (FP.panes.length < 2) { toast('先切到多窗口分屏（左右/上下/3/4）才有可交换的窗口'); return; }
    [FP.panes[0], FP.panes[1]] = [FP.panes[1], FP.panes[0]];
    renderFinder(); toast('已把左边窗口的内容移到右侧');
  };
  // §35.6 路径在每个窗格顶上（双击窗格路径行空白进输入）；⌘L / Ctrl+L 作用于**活动窗格**
  window.addEventListener('keydown', e => {
    if (!finderOpen) return;
    if ((e.metaKey || e.ctrlKey) && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault(); fpStartPathEdit(FP.active);
      return;
    }
    if (e.target && e.target.closest && e.target.closest('input,textarea,select')) return;
    // §41.7 六条访达快捷键（⌘A/C/X/V · ⌘D · ⌥D）—— 组合串与设置面板「录制」用同一条 fpComboFromEvent
    const combo41 = fpComboFromEvent(e);
    if (combo41) {
      const hk = fpHotkeys();
      const hit = Object.keys(hk).find(id => hk[id].toLowerCase() === combo41.toLowerCase());
      if (hit) { e.preventDefault(); e.stopPropagation(); fpRunHotkey(hit); return; }
    }
    const pane0 = FP.panes[FP.active];
    // §40.2 ↑↓ 移动选中（跳过空占位行）
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && pane0) {
      const list = [...document.querySelectorAll('#fpPanes .fp-row:not(.fp-row-ph)')];
      if (!list.length) return;
      let idx = list.findIndex(r => r.dataset.full === pane0.selFull);
      if (idx < 0) idx = e.key === 'ArrowDown' ? -1 : list.length;
      const next = e.key === 'ArrowDown' ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx - 1);
      const tr = list[next];
      pane0.selFull = tr.dataset.full; pane0.sel = tr.dataset.name;
      pane0.selSet = new Set([tr.dataset.full]); pane0.rangeAnchor = tr.dataset.full;
      renderFinderMain();
      const el = document.querySelector(`#fpPanes .fp-row[data-full="${CSS.escape(tr.dataset.full)}"]`);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      e.preventDefault(); e.stopPropagation();
      return;
    }
    // §40.3 Enter=重命名（primary 行；输入框/编辑态不抢）
    if (e.key === 'Enter' && pane0 && pane0.selFull && finderOpen) {
      const tr = document.querySelector(`#fpPanes [data-full="${CSS.escape(pane0.selFull)}"]`);
      if (tr && tr.dataset.kind !== 'ph') {
        fpStartRename(FP.active, pane0.selFull);
        e.preventDefault(); e.stopPropagation();
        return;
      }
    }
    // §39.4 → 展开 / ← 折叠（Finder 惯例）：仅当选中的是目录行；输入框内不抢
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const pane = FP.panes[FP.active];
    if (!pane || !pane.selFull) return;
    const tr = document.querySelector(`#fpPanes .fp-row[data-full="${CSS.escape(pane.selFull)}"]`);
    if (!tr || tr.dataset.kind !== 'dir') return;
    const full = tr.dataset.full;
    if (!Array.isArray(pane.expanded)) pane.expanded = [];
    const idx = pane.expanded.indexOf(full);
    if (e.key === 'ArrowRight') {
      if (idx < 0) { pane.expanded.push(full); renderFinderMain(); }
    } else if (idx >= 0) {
      pane.expanded.splice(idx, 1); renderFinderMain();
    }
    e.preventDefault(); e.stopPropagation();
  });
  // 启动恢复
  if (S.finderOpen) setFinderOpen(true);
})();


/* ══ §42 QSpace 偏好设置窗 —— 只保留用户点名的 7 页 ══
   有截图的两页（右键菜单 / 聚焦搜索）按 PIL 实测像素基准 100% 复刻；
   另外 5 页按 reference/QSpacePro-DISSECT.md 的逐字文案与字段（无截图可对像素）。 */
const QSP_PAGES = [
  { g: 0, id: 'connections', l: '连接', ico: '🌐', c: '#2E7CF6' },
  { g: 0, id: 'icloud', l: 'iCloud', ico: '☁', c: '#3B9BF5' },
  { g: 1, id: 'search', l: '聚焦搜索', ico: '⌕', c: '#5A6165' },
  { g: 2, id: 'context_menu', l: '右键菜单', ico: '☰', c: '#2E7CF6' },
  { g: 2, id: 'hotkeys', l: '快捷键', ico: '⌘', c: '#5A6165' },
  { g: 2, id: 'newfiles', l: '新建文件', ico: '＋', c: '#33B158' },
  { g: 3, id: 'batch_rename', l: '批量重命名', ico: '↻', c: '#33B158' },
];
const QSP = {
  open: false, page: 'context_menu',
  hist: ['context_menu'], hIdx: 0,
  filter: '',
  ctxSel: -1,            // 右键菜单页左列选中（"自动选择"）
  ctxQuery: '',
  kindSel: -1,           // 聚焦搜索 种类表选中
  drag: null,            // {from:'left'|'right', idx?, id}
  hkRec: null,           // {id, fpKey?, def}
  newSel: 0, batchSel: 0,
};
const QSP_PREFS_DEFAULT = {
  showSelection: true,
  searchRememberDomain: true, searchRecentCount: 10, searchShowIn: 'new_window',
  searchKinds: [
    { n: '文件夹', e: '', u: 'public.folder' },
    { n: '归档', e: 'zip, 7z, rar, tar, gz, bz2,…', u: '' },
    { n: '应用', e: '', u: 'com.apple.application' },
    { n: '视频', e: '', u: 'public.movie' },
    { n: '图像', e: '', u: 'public.image' },
    { n: '文稿', e: '', u: 'public.data' },
    { n: '文稿', e: 'doc, docx, pages, xls, x…', u: '' },
  ],
  newfileExpanded: true, newfileIcon: false,
  batchMode: 'lite', batchEnterConfirm: true, batchLog: true, batchFormat: '$n',
  batchReplace: '', batchAdd: '',
  // 43.3 连接 = 左右两栏：左列表 + 右详情（条目自己带字段）
  connType: 'FTP', connSSL: true, connProxy: false, connOnDemand: true, connAtLaunch: false, connAskUpload: true,
  connList: [], connSel: -1, connEnc: 'UTF-8',
  // 43.5 iCloud：下拉三态 + 应用文件夹列表（演示数据，结构照真图）
  icloudApps: 'auto',
  icloudAppsList: [
    { n: '文本编辑', t: 'app' }, { n: 'Shortcuts', t: 'app' },
    { n: '脚本编辑器 (空)', t: 'app' }, { n: '图书 (空)', t: 'app' },
    { n: '预览 (空)', t: 'app' }, { n: '自动操作 (空)', t: 'app' },
    { n: 'Dropover (空)', t: 'app' }, { n: 'Obsidian (空)', t: 'app' },
    { n: 'Surge', t: 'dir' }, { n: 'Quantumult X', t: 'dir' },
    { n: 'Documents by Readdle', t: 'dir' }, { n: 'Numbers', t: 'dir' },
    { n: 'Shadowrocket', t: 'dir' }, { n: 'MarginNote 4', t: 'dir' },
    { n: 'PastePal', t: 'dir' },
  ],
};
function qspPrefs() {
  if (!S.qspPrefs || typeof S.qspPrefs !== 'object') S.qspPrefs = {};
  const p = S.qspPrefs;
  // 逐键回填：老存盘没有的新键也拿得到默认值（不整块覆盖，用户改过的保留）
  Object.keys(QSP_PREFS_DEFAULT).forEach(k => {
    if (p[k] === undefined) p[k] = JSON.parse(JSON.stringify(QSP_PREFS_DEFAULT[k]));
  });
  if (!Array.isArray(p.newfiles)) p.newfiles = JSON.parse(JSON.stringify(QSP_NEWFILES));
  return p;
}
/* ── 开 / 关 ── */
function qspOpenPage(page) {
  const win = document.getElementById('qspWin');
  if (!win) return;
  QSP.open = true; win.hidden = false;
  if (page && page !== QSP.page) { QSP.hist = [page]; QSP.hIdx = 0; QSP.page = page; }
  qspRenderNav(); qspRenderBody();
}
function qspClose() {
  QSP.open = false; QSP.hkRec = null;
  const win = document.getElementById('qspWin'); if (win) win.hidden = true;
}
function qspGo(page) {
  if (page === QSP.page) return;
  QSP.hist = QSP.hist.slice(0, QSP.hIdx + 1);
  QSP.hist.push(page); QSP.hIdx = QSP.hist.length - 1;
  QSP.page = page; QSP.ctxSel = -1; QSP.hkRec = null;
  qspRenderNav(); qspRenderBody();
}
function qspNavStep(d) {
  const i = QSP.hIdx + d;
  if (i < 0 || i >= QSP.hist.length) return;
  QSP.hIdx = i; QSP.page = QSP.hist[i];
  qspRenderNav(); qspRenderBody();
}
/* ── 左栏 ── */
function qspRenderNav() {
  const nav = document.getElementById('qspNav');
  if (!nav) return;
  const f = (QSP.filter || '').trim().toLowerCase();
  let html = '', lastG = -1;
  QSP_PAGES.forEach(p => {
    const hit = !f || p.l.toLowerCase().indexOf(f) >= 0 || p.id.indexOf(f) >= 0;
    if (!hit) return;
    if (lastG >= 0 && p.g !== lastG) html += '<div class="qsp-group"></div>';
    lastG = p.g;
    html += `<div class="qsp-item${QSP.page === p.id ? ' is-on' : ''}" data-qsp="${p.id}">
      <span class="qsp-ico" style="background:${p.c}">${p.ico}</span>
      <span class="qsp-lb">${p.l}</span></div>`;
  });
  nav.innerHTML = html || '<div class="qsp-group"></div>';
  nav.querySelectorAll('[data-qsp]').forEach(el => el.onclick = () => qspGo(el.dataset.qsp));
  const ti = QSP_PAGES.find(p => p.id === QSP.page);
  const tt = document.getElementById('qspTitle'); if (tt && ti) tt.textContent = ti.l;
  const bk = document.getElementById('qspBack'), fw = document.getElementById('qspFwd');
  if (bk) bk.disabled = QSP.hIdx <= 0;
  if (fw) fw.disabled = QSP.hIdx >= QSP.hist.length - 1;
}
function qspRenderBody() {
  const body = document.getElementById('qspBody');
  if (!body) return;
  const map = {
    context_menu: qspRenderContextMenuPage, search: qspRenderSearchPage,
    hotkeys: qspRenderHotkeysPage, newfiles: qspRenderNewfilesPage,
    batch_rename: qspRenderBatchRenamePage, connections: qspRenderConnectionsPage,
    icloud: qspRenderICloudPage,
  };
  (map[QSP.page] || (() => { body.innerHTML = ''; }))(body);
}
/* ── 42.3/42.4 右键菜单页（图2 逐段照抄） ── */
function qspCtxAllIds() { return Object.keys(FP_CTX_META); }
function qspCtxLeft() { return fpCtxEnabled(); }
function qspCtxRightGroups() {
  const left = qspCtxLeft();
  const q = (QSP.ctxQuery || '').trim().toLowerCase();
  const out = [
    { t: 'function', l: '功能', items: [] },
    { t: 'service', l: '服务', items: [] },
    { t: 'quicklaunch', l: '快捷启动', items: [] },
  ];
  qspCtxAllIds().forEach(id => {
    const m = FP_CTX_META[id]; if (!m) return;
    if (left.indexOf(id) >= 0 && id !== 'sep') return;   // 分割线可以加多条（照 QSpace）
    if (q && m.l.toLowerCase().indexOf(q) < 0) return;
    const g = out.find(x => x.t === m.t) || out[0];
    g.items.push(id);
  });
  return out.filter(g => g.items.length);
}
function qspRenderContextMenuPage(body) {
  const left = qspCtxLeft();
  const sel = QSP.ctxSel;
  const leftHtml = left.length ? left.map((id, i) => {
    const m = FP_CTX_META[id] || { l: id, i: '', t: 'function', k: '' };
    if (id.indexOf('group:') === 0) {
      return `<div class="qsp-cm-item${sel === i ? ' is-sel' : ''}" draggable="true" data-side="left" data-idx="${i}">
        <span class="nm">${escapeHtml(id.slice(6))}</span><span class="tp">[群组]</span></div>`;
    }
    if (id === 'sep') {
      return `<div class="qsp-cm-item${sel === i ? ' is-sel' : ''}" draggable="true" data-side="left" data-idx="${i}">
        <span class="nm">—— 分割线 ——</span><span class="tp"></span></div>`;
    }
    return `<div class="qsp-cm-item${sel === i ? ' is-sel' : ''}" draggable="true" data-side="left" data-idx="${i}">
      <span style="width:16px;text-align:center;flex:0 0 16px">${m.i || ''}</span>
      <span class="nm">${escapeHtml(m.l)}</span>
      ${m.k ? `<span class="kw">${escapeHtml(m.k)}</span>` : ''}
      <span class="tp">[${m.t === 'function' ? '功能' : m.t === 'service' ? '服务' : m.t === 'quicklaunch' ? '快捷启动' : ''}]</span></div>`;
  }).join('') : '<div class="qsp-cm-empty">拖到此处以禁用...</div>';

  const groups = qspCtxRightGroups().map(g =>
    `<div class="qsp-cm-grouphd">▼ ${g.l}</div>` + g.items.map(id => {
      const m = FP_CTX_META[id];
      return `<div class="qsp-cm-item" draggable="true" data-side="right" data-id="${id}">
        <span style="width:16px;text-align:center;flex:0 0 16px">${m.i || ''}</span>
        <span class="nm">${escapeHtml(m.l)}</span>
        ${m.k ? `<span class="kw">${escapeHtml(m.k)}</span>` : ''}</div>`;
    }).join('')).join('') || '<div class="qsp-cm-empty">没有匹配的菜单项</div>';

  body.innerHTML = `
    <div class="qsp-sec">菜单项</div>
    <div class="qsp-desc">将菜单项从“功能”或“服务”列表中拖拽到左侧列表，即可启用菜单项。拖回可以删除菜单项。你还可以通过拖拽对菜单项进行排序。</div>
    <div class="qsp-cm">
      <div class="qsp-cm-l"><div class="qsp-cm-list" id="qspCtxLeft" data-side="left">${leftHtml}</div>
        <div class="qsp-cm-tools">
          <button class="qsp-btn sm" id="qspCtxRemove">移除</button>
          <button class="qsp-btn sm" id="qspCtxAddGroup">添加群组</button>
        </div></div>
      <div class="qsp-cm-r">
        <div class="qsp-cm-head">
          <div class="qsp-cm-search">
            <svg viewBox="0 0 16 16" width="12" height="12"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5 L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            <input id="qspCtxQuery" placeholder="搜索" value="${escapeHtml(QSP.ctxQuery)}">
          </div>
        </div>
        <div class="qsp-cm-list" id="qspCtxRight" data-side="right">${groups}</div>
      </div>
    </div>
    <div class="qsp-cm-foot">
      <button class="qsp-btn" id="qspCtxClear">清空</button>
      <button class="qsp-btn" id="qspCtxDefault">默认值</button>
      <button class="qsp-btn primary" id="qspCtxFinder">访达模式</button>
    </div>
    <div class="qsp-sec"></div>
    <div class="qsp-card">
      <div class="qsp-row"><span class="qsp-lab">在菜单项中显示选择项</span>
        <button class="qsp-sw ${fpCtxShowSelection() ? 'on' : ''}" id="qspCtxShowSel"></button></div>
    </div>`;

  // 点左列 = 自动选中（再点同一项不取消）
  body.querySelectorAll('#qspCtxLeft .qsp-cm-item').forEach(el => {
    el.onclick = () => { QSP.ctxSel = +el.dataset.idx; qspRenderBody(); };
    el.ondragstart = e => {
      QSP.drag = { from: 'left', idx: +el.dataset.idx, id: qspCtxLeft()[+el.dataset.idx] };
      el.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', el.dataset.idx);
    };
    el.ondragend = () => { el.classList.remove('is-dragging'); qspClearDropHints(); };
  });
  body.querySelectorAll('#qspCtxRight .qsp-cm-item').forEach(el => {
    el.ondragstart = e => {
      QSP.drag = { from: 'right', id: el.dataset.id };
      el.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', el.dataset.id);
    };
    el.ondragend = () => { el.classList.remove('is-dragging'); qspClearDropHints(); };
  });
  const leftBox = document.getElementById('qspCtxLeft');
  const rightBox = document.getElementById('qspCtxRight');
  qspBindDropZone(leftBox, 'left');
  qspBindDropZone(rightBox, 'right');

  document.getElementById('qspCtxRemove').onclick = () => {
    if (QSP.ctxSel < 0 || QSP.ctxSel >= left.length) return toast('先点左边要移除的那一项');
    left.splice(QSP.ctxSel, 1); QSP.ctxSel = -1;
    S.finderCtxMenu = left; save(true); qspRenderBody();
  };
  document.getElementById('qspCtxAddGroup').onclick = () => {
    askModal({ title: '添加群组', text: '右键菜单里显示的一个分组标题（分组只是标签）', value: '新群组',
      okText: '添加', onOk: v => { if (!v.trim()) return;
        left.push('group:' + v.trim()); S.finderCtxMenu = left; save(true); qspRenderBody(); } });
  };
  document.getElementById('qspCtxClear').onclick = () => {
    askModal({ title: '清空', text: '您确定要清除所有项目吗?', okText: '清空', onOk: () => {
      S.finderCtxMenu = []; QSP.ctxSel = -1; save(true); qspRenderBody(); toast('右键菜单已清空'); } });
  };
  document.getElementById('qspCtxDefault').onclick = () => {
    S.finderCtxMenu = [...FP_CTX_DEFAULT]; QSP.ctxSel = -1; save(true); qspRenderBody(); toast('已恢复默认菜单');
  };
  document.getElementById('qspCtxFinder').onclick = () => {
    askModal({ title: '访达模式', text: '您确定要设置为访达样式吗?', okText: '设置', onOk: () => {
      S.finderCtxMenu = [...FP_CTX_FINDER_MODE]; QSP.ctxSel = -1; save(true); qspRenderBody(); toast('已切到访达样式'); } });
  };
  document.getElementById('qspCtxShowSel').onclick = () => {
    S.finderCtxShowSelection = !fpCtxShowSelection(); save(true); qspRenderBody();
  };
  const qi = document.getElementById('qspCtxQuery');
  if (qi) {
    qi.oninput = () => { QSP.ctxQuery = qi.value; const p = qi.selectionStart; qspRenderBody();
      const n = document.getElementById('qspCtxQuery'); if (n) { n.focus(); n.setSelectionRange(p, p); } };
  }
}
function qspClearDropHints() {
  document.querySelectorAll('.qsp-cm-item').forEach(el =>
    el.classList.remove('drop-above', 'drop-below'));
  document.querySelectorAll('.qsp-cm-dropzone').forEach(el => el.classList.remove('qsp-cm-dropzone'));
}
/// 三向拖放（42.4）：右→左=启用 / 左内=排序 / 左→右=删除
function qspBindDropZone(box, side) {
  if (!box) return;
  box.ondragover = e => {
    if (!QSP.drag) return;
    if (side === 'right' && QSP.drag.from !== 'left') return;   // 右列内部不排序
    e.preventDefault();
    qspClearDropHints();
    if (side === 'right') { box.classList.add('qsp-cm-dropzone'); return; }
    const rows = [...box.querySelectorAll('.qsp-cm-item')];
    if (!rows.length) return;
    let idx = rows.length, above = false;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { idx = i; above = true; break; }
    }
    if (rows.length) {
      const t = above ? rows[idx] : rows[rows.length - 1];
      t.classList.add(above ? 'drop-above' : 'drop-below');
      box.dataset.dropIdx = String(idx);
    }
  };
  box.ondragleave = e => { if (!box.contains(e.relatedTarget)) qspClearDropHints(); };
  box.ondrop = e => {
    e.preventDefault();
    const d = QSP.drag; QSP.drag = null; qspClearDropHints();
    if (!d) return;
    const left = qspCtxLeft();
    if (side === 'left') {
      const at = box.dataset.dropIdx !== undefined ? +box.dataset.dropIdx : left.length;
      delete box.dataset.dropIdx;
      if (d.from === 'right') {
        if (left.indexOf(d.id) >= 0) return;
        const insertAt = Math.max(0, Math.min(at, left.length));
        left.splice(insertAt, 0, d.id);
        QSP.ctxSel = insertAt;
      } else {
        const from = d.idx;
        if (isNaN(from)) return;
        let to = at;
        if (to > from) to -= 1;
        if (to === from) return;
        const [moved] = left.splice(from, 1);
        left.splice(Math.max(0, Math.min(to, left.length)), 0, moved);
        QSP.ctxSel = Math.max(0, Math.min(to, left.length - 1));
      }
      S.finderCtxMenu = left; save(true); qspRenderBody();
      return;
    }
    // 拖到右列 = 从已启用移除
    if (d.from === 'left' && !isNaN(d.idx)) {
      left.splice(d.idx, 1);
      if (QSP.ctxSel >= left.length) QSP.ctxSel = left.length - 1;
      S.finderCtxMenu = left; save(true); qspRenderBody();
    }
  };
}
/* ── 42.7–42.9 聚焦搜索页（图3 逐段照抄） ── */
function qspSearchChk(rowKey, optKey) {
  const cfg = fpSearchSyntax();
  return !!cfg[rowKey][optKey];
}
function qspToggleSearchChk(rowKey, optKey) {
  const s = S.finderSearchSyntax;
  const cur = (s && s[rowKey]) ? { ...s[rowKey] } : { ...FP_SEARCH_DEF[rowKey] };
  cur[optKey] = !qspSearchChk(rowKey, optKey);
  S.finderSearchSyntax = Object.assign({}, s || {}, { [rowKey]: cur });
  save(true);
}
function qspRenderSearchPage(body) {
  const p = qspPrefs();
  const chk = (row, key, label) =>
    `<label class="qsp-opt"><span class="qsp-chk${qspSearchChk(row, key) ? ' on' : ''}"
      data-srow="${row}" data-sopt="${key}"></span>${label}</label>`;
  const kinds = p.searchKinds;
  body.innerHTML = `
    <div class="qsp-sec">搜索语法</div>
    <div class="qsp-card">
      <div class="qsp-row"><span class="qsp-lab">「或者」分隔符</span>
        ${chk('or', 'space', '[空格]')}${chk('or', 'bar', '|')}${chk('or', 'semi', ';')}${chk('or', 'comma', ',')}</div>
      <div class="qsp-row"><span class="qsp-lab">「并且」分隔符</span>
        ${chk('and', 'space', '[空格]')}${chk('and', 'amp', '&amp;')}${chk('and', 'semi', ';')}${chk('and', 'comma', ',')}</div>
      <div class="qsp-row"><span class="qsp-lab">「排除」前缀符</span>
        ${chk('excl', 'minus', '-')}${chk('excl', 'caret', '^')}${chk('excl', 'bang', '!')}</div>
    </div>
    <div class="qsp-sec">选项</div>
    <div class="qsp-card">
      <div class="qsp-row"><span class="qsp-lab">记住搜索域</span>
        <button class="qsp-sw ${p.searchRememberDomain ? 'on' : ''}" data-pref="searchRememberDomain"></button></div>
      <div class="qsp-row"><span class="qsp-lab">记录最近搜索位置</span>
        <span class="qsp-steps"><button data-steps="-1">−</button>
          <span id="qspRecentCount">${p.searchRecentCount} 项</span>
          <button data-steps="1">＋</button></span></div>
    </div>
    <div class="qsp-card" style="margin-top:12px">
      <div class="qsp-row"><span class="qsp-lab">显示项目</span>
        ${[['cur_window', '当前窗口'], ['new_window', '新窗口'], ['tab', '标签页']].map(([k, l]) =>
          `<label class="qsp-opt"><span class="qsp-radio${p.searchShowIn === k ? ' on' : ''}" data-showin="${k}"></span>${l}</label>`).join('')}
      </div>
    </div>
    <div class="qsp-sec">种类</div>
    <div class="qsp-card">
      <table class="qsp-table"><thead><tr><th style="width:26%">名称</th><th style="width:37%">扩展名</th><th>UTI</th></tr></thead>
      <tbody>${kinds.map((k, i) => `<tr data-kind-i="${i}" class="${QSP.kindSel === i ? 'is-sel' : ''}">
        <td><input value="${escapeHtml(k.n)}" data-kf="n" data-ki="${i}"></td>
        <td><input value="${escapeHtml(k.e)}" data-kf="e" data-ki="${i}"></td>
        <td><input value="${escapeHtml(k.u)}" data-kf="u" data-ki="${i}"></td></tr>`).join('')}
      </tbody></table>
      <div class="qsp-tablebar"><button class="qsp-btn sm" id="qspKindAdd">＋</button>
        <button class="qsp-btn sm" id="qspKindDel">−</button></div>
    </div>`;
  body.querySelectorAll('[data-srow]').forEach(el =>
    el.onclick = () => { qspToggleSearchChk(el.dataset.srow, el.dataset.sopt); qspRenderBody(); });
  body.querySelectorAll('[data-pref]').forEach(el => el.onclick = () => {
    const k = el.dataset.pref; p[k] = !p[k]; save(true); qspRenderBody();
  });
  body.querySelectorAll('[data-steps]').forEach(el => el.onclick = () => {
    const d = +el.dataset.steps;
    p.searchRecentCount = Math.max(5, Math.min(100, p.searchRecentCount + d * (p.searchRecentCount === 5 && d < 0 ? 0 : 5)));
    if (d > 0 && p.searchRecentCount % 5 !== 0) p.searchRecentCount = 10;
    save(true); qspRenderBody();
  });
  body.querySelectorAll('[data-showin]').forEach(el => el.onclick = () => {
    p.searchShowIn = el.dataset.showin; save(true); qspRenderBody();
  });
  body.querySelectorAll('[data-kind-i]').forEach(tr => tr.onclick = e => {
    if (e.target.tagName === 'INPUT') return;
    QSP.kindSel = +tr.dataset.kindI; qspRenderBody();
  });
  body.querySelectorAll('[data-kf]').forEach(inp => inp.oninput = () => {
    const i = +inp.dataset.ki; kinds[i][inp.dataset.kf] = inp.value; save(true);
  });
  document.getElementById('qspKindAdd').onclick = () => {
    kinds.push({ n: '', e: '', u: '' }); QSP.kindSel = kinds.length - 1; save(true); qspRenderBody();
  };
  document.getElementById('qspKindDel').onclick = () => {
    if (QSP.kindSel < 0 || QSP.kindSel >= kinds.length) return toast('先点表格里要删的那一行');
    kinds.splice(QSP.kindSel, 1); QSP.kindSel = -1; save(true); qspRenderBody();
  };
}
/* ── 42.10 快捷键页（QSpace 形制 + hotkey.json 真值） ── */
const QSP_HK_GROUPS = [
  { g: '操作', items: [
    { id: 'rename', l: '重命名', d: '⇧⌘R' },
    { id: 'search', l: '搜索', d: '⌘F' },
    { id: 'show_in_finder', l: '在访达中显示', d: '⌘↩' },
    { id: 'copy_path', l: '拷贝路径', d: '⇧⌘L' },
    { id: 'getinfo', l: '显示简介', d: '⇧⌘I' },
    { id: 'show_view_options', l: '查看显示选项', d: '⌘J' },
    { id: 'go_desktop', l: '前往桌面', d: '⌘D', fp: 'goDesktop' },
    { id: 'go_downloads', l: '前往下载', d: '⌥D', fp: 'goDownloads' },
    { id: 'select_all', l: '全选', d: '⌘A', fp: 'selectAll' },
    { id: 'copy_sel', l: '拷贝选中', d: '⌘C', fp: 'copy' },
    { id: 'cut_sel', l: '剪切选中', d: '⌘X', fp: 'cut' },
    { id: 'paste_sel', l: '粘贴', d: '⌘V', fp: 'paste' },
  ] },
  { g: '工作区', items: [
    { id: 'new_workspace_tab', l: '新建标签页', d: '⌘T' },
    { id: 'close_tab', l: '关闭', d: '⌘W' },
    { id: 'go_enclosing_folder', l: '前往上层文件夹', d: '⌘↑' },
  ] },
  { g: '视图样式', items: [
    { id: 'as_list_view', l: '列表视图', d: '⌘2' },
    { id: 'zoom_in', l: '放大', d: '⌘=' },
    { id: 'zoom_out', l: '缩小', d: '⌘-' },
  ] },
];
/// 存盘用 'Cmd+Shift+D'，显示要照 QSpace 的 '⇧⌘D' —— 只在**显示**这一层换符号，
/// 匹配与录制仍走 fpComboFromEvent 的原始串（否则设了又认不出来）。
function qspHKDisplay(combo) {
  if (!combo) return '';
  return combo.split('+').map(part => {
    if (part === 'Cmd') return '⌘';
    if (part === 'Alt') return '⌥';
    if (part === 'Shift') return '⇧';
    if (part === 'Ctrl') return '⌃';
    return part;
  }).join('');
}
function qspHKValue(it) {
  const raw = it.fp ? (fpHotkeys()[it.fp] || it.d) : ((S.qspHotkeys && S.qspHotkeys[it.id]) || it.d);
  return qspHKDisplay(raw);
}
function qspRenderHotkeysPage(body) {
  let rows = '';
  QSP_HK_GROUPS.forEach(g => {
    rows += `<div class="qsp-hk-sec">${g.g}</div>`;
    g.items.forEach(it => {
      const rec = QSP.hkRec && QSP.hkRec.id === it.id;
      rows += `<div class="qsp-row"><span class="qsp-lab">${it.l}</span>
        <span class="qsp-hk-key ${rec ? 'is-rec' : ''}" data-hkid="${it.id}">${rec ? '请按组合键…' : escapeHtml(qspHKValue(it))}</span>
        <span class="qsp-hk-key" style="opacity:.45">—</span>
        <button class="qsp-btn sm" data-hkrec="${it.id}">${rec ? '取消' : '录制'}</button>
        <button class="qsp-btn sm" data-hkreset="${it.id}">恢复</button></div>`;
    });
  });
  body.innerHTML = `
    <div class="qsp-sec">快捷键</div>
    <div class="qsp-card">
      <div class="qsp-row" style="background:#273134;color:#95A0A4;font-size:12.5px">
        <span class="qsp-lab" style="flex:1">操作</span><span>主快捷键</span><span>副快捷键</span><span style="width:112px"></span></div>
      ${rows}
    </div>
    <div class="qsp-cm-foot"><button class="qsp-btn primary" id="qspHkResetAll">恢复默认</button></div>
    <div class="qsp-hint">提示：已保存的工作区窗口可以分配快捷键。对于同一操作，可以分配两个不同的快捷键。
修饰键：⌃ (control)、⌥ (option)、⌘ (command)、⇧ (shift)、⇥ (tab)</div>`;
  body.querySelectorAll('[data-hkrec]').forEach(b => b.onclick = () => {
    const id = b.dataset.hkrec;
    let it = null; QSP_HK_GROUPS.forEach(g => g.items.forEach(x => { if (x.id === id) it = x; }));
    QSP.hkRec = (QSP.hkRec && QSP.hkRec.id === id) ? null : { id, fpKey: it && it.fp, def: it && it.d };
    qspRenderBody();
    if (QSP.hkRec) toast('按新的组合键完成录制 · Esc 取消');
  });
  body.querySelectorAll('[data-hkreset]').forEach(b => b.onclick = () => {
    const id = b.dataset.hkreset;
    let it = null; QSP_HK_GROUPS.forEach(g => g.items.forEach(x => { if (x.id === id) it = x; }));
    if (it && it.fp) { const o = { ...S.finderHotkeys }; delete o[it.fp]; S.finderHotkeys = o; }
    else if (S.qspHotkeys) { delete S.qspHotkeys[id]; }
    save(true); qspRenderBody();
  });
  document.getElementById('qspHkResetAll').onclick = () => {
    S.finderHotkeys = null; S.qspHotkeys = null; QSP.hkRec = null; save(true);
    qspRenderBody(); toast('快捷键已全部恢复默认');
  };
}
/* ── 42.11 新建文件页（XS:JHSNewfileSettingsView 逐字） ── */
const QSP_NEWFILES = [
  { k: '', n: '文本.txt', c: '0 B', t: '' },
  { k: '', n: 'Bash.sh', c: '0 B', t: '' },
  { k: '', n: 'HTML.html', c: '0 B', t: '' },
  { k: '', n: 'Swift.swift', c: '0 B', t: '' },
  { k: '', n: 'python.py', c: '0 B', t: '' },
  { k: '', n: 'As.applescript', c: '0 B', t: '' },
  { k: '', n: '—— 分割线 ——', c: '', t: '', sep: true },
];
function qspRenderNewfilesPage(body) {
  const p = qspPrefs();
  const files = p.newfiles;
  body.innerHTML = `
    <div class="qsp-sec">文件模板</div>
    <div class="qsp-card">
      <table class="qsp-table"><thead><tr><th style="width:16%">快捷键</th><th style="width:34%">名称</th><th style="width:24%">内容</th><th>模板</th></tr></thead>
      <tbody>${files.map((f, i) => `<tr data-nf="${i}" class="${QSP.newSel === i ? 'is-sel' : ''}">
        <td style="color:#7C8B90">${escapeHtml(f.k || 'A')}</td><td>${escapeHtml(f.n)}</td>
        <td style="color:#7C8B90">${f.c || '—'}</td><td style="color:#7C8B90">${f.t || '使用空“' + escapeHtml((f.n.split('.').pop() || '') + '”') }</td></tr>`).join('')}
      </tbody></table>
      <div class="qsp-tablebar"><button class="qsp-btn sm" id="qspNfAdd">＋</button>
        <button class="qsp-btn sm" id="qspNfDel">−</button></div>
    </div>
    <div class="qsp-sec">功能</div>
    <div class="qsp-card">
      <div class="qsp-row"><span class="qsp-lab">在右键菜单中展开显示</span>
        <button class="qsp-sw ${p.newfileExpanded ? 'on' : ''}" data-pref="newfileExpanded"></button></div>
      <div class="qsp-row"><span class="qsp-lab">显示右键菜单项图标</span>
        <button class="qsp-sw ${p.newfileIcon ? 'on' : ''}" data-pref="newfileIcon"></button></div>
    </div>
    <div class="qsp-hint">文件名支持格式化的日期表达式：$date(format)
示例：$date(yyyy-MM-dd)-会议记录.md</div>`;
  body.querySelectorAll('[data-nf]').forEach(tr => tr.onclick = () => {
    QSP.newSel = +tr.dataset.nf; qspRenderBody();
  });
  body.querySelectorAll('[data-pref]').forEach(el => el.onclick = () => {
    const k = el.dataset.pref; p[k] = !p[k]; save(true); qspRenderBody();
  });
  // 43.2 添加 / 删除（真的增删行）
  document.getElementById('qspNfAdd').onclick = () => {
    askModal({ title: '添加模板', text: '名称（含扩展名）', value: '未命名.txt', okText: '添加',
      onOk: v => { if (!v || !v.trim()) return;
        files.push({ k: '', n: v.trim(), c: '0 B', t: '' });
        QSP.newSel = files.length - 1; save(true); qspRenderBody(); } });
  };
  document.getElementById('qspNfDel').onclick = () => {
    if (QSP.newSel < 0 || QSP.newSel >= files.length) return toast('先点表格里要删除的那一行');
    const nm = files[QSP.newSel].n;
    if (nm === '—— 分割线 ——') return toast('分割线不能删');
    files.splice(QSP.newSel, 1); QSP.newSel = -1; save(true); qspRenderBody();
    toast(`已删除「${escapeHtml(nm)}」`);
  };
}
/* ── 42.12 批量重命名页（XS:JHSBatchRenameSettingsView 逐字） ── */
function qspRenderBatchRenamePage(body) {
  const p = qspPrefs();
  body.innerHTML = `
    <div class="qsp-sec">启动模式</div>
    <div class="qsp-card">
      <div class="qsp-row"><span class="qsp-lab">启动模式</span>
        <span class="qsp-seg"><button data-bm="lite" class="${p.batchMode === 'lite' ? 'on' : ''}">简洁</button>
          <button data-bm="pro" class="${p.batchMode === 'pro' ? 'on' : ''}">高级</button></span></div>
      <div class="qsp-row"><span class="qsp-lab">按下回车确认重命名</span>
        <button class="qsp-sw ${p.batchEnterConfirm ? 'on' : ''}" data-pref="batchEnterConfirm"></button></div>
      <div class="qsp-row"><span class="qsp-lab">日志记录</span>
        <button class="qsp-sw ${p.batchLog ? 'on' : ''}" data-pref="batchLog"></button></div>
    </div>
    <div class="qsp-sec">预置</div>
    <div class="qsp-card">
      <div class="qsp-row"><span class="qsp-lab">加载预置</span><button class="qsp-btn sm" id="qspBrLoad">加载预置</button>
        <button class="qsp-btn sm" id="qspBrSave">保存预置</button></div>
    </div>
    <div class="qsp-sec">规则</div>
    <div class="qsp-card">
      <div class="qsp-row"><span class="qsp-lab">格式</span>
        <span class="qsp-seg">${['$n', '($n)', '_$n'].map(f =>
          `<button data-bf="${f}" class="${p.batchFormat === f ? 'on' : ''}">${escapeHtml(f)}</button>`).join('')}</span></div>
      <div class="qsp-row"><span class="qsp-lab">替换文本</span>
        <input class="qsp-inp" style="flex:1;max-width:320px" data-prefi="batchReplace" value="${escapeHtml(p.batchReplace)}" placeholder="要被替换掉的文字"></div>
      <div class="qsp-row"><span class="qsp-lab">添加文本</span>
        <input class="qsp-inp" style="flex:1;max-width:320px" data-prefi="batchAdd" value="${escapeHtml(p.batchAdd)}" placeholder="前缀或后缀"></div>
    </div>
    <div class="qsp-hint">在高级模式下，您可以将重命名规则保存为预置。并在右键菜单项“快速重命名”中执行预置。</div>`;
  body.querySelectorAll('[data-bm]').forEach(b => b.onclick = () => { p.batchMode = b.dataset.bm; save(true); qspRenderBody(); });
  body.querySelectorAll('[data-bf]').forEach(b => b.onclick = () => { p.batchFormat = b.dataset.bf; save(true); qspRenderBody(); });
  body.querySelectorAll('[data-pref]').forEach(el => el.onclick = () => { const k = el.dataset.pref; p[k] = !p[k]; save(true); qspRenderBody(); });
  body.querySelectorAll('[data-prefi]').forEach(inp => inp.oninput = () => { p[inp.dataset.prefi] = inp.value; save(true); });
  document.getElementById('qspBrLoad').onclick = () => toast('已加载预置「默认规则」（演示）');
  document.getElementById('qspBrSave').onclick = () => askModal({ title: '保存预置', text: '请输入预置项名称',
    value: '我的预置', okText: '保存', onOk: v => { if (v && v.trim()) toast(`已保存预置「${escapeHtml(v.trim())}」`); } });
}
/* ── 42.13 连接页（XS:JHSServerConnSettingsView 字段节选） ── */
const QSP_CONN_TYPES = ['FTP', 'SFTP', 'WebDAV', 'WebDAVS', '阿里云OSS', '亚马逊S3', '腾讯云COS', '七牛云KODO'];
function qspRenderConnectionsPage(body) {
  const p = qspPrefs();
  const list = p.connList;
  const sel = p.connSel;
  const cur = (sel >= 0 && sel < list.length) ? list[sel] : null;
  const inp = (k, ph) => `<input class="qsp-inp" style="flex:1;max-width:360px" data-cf="${k}"
    value="${escapeHtml(cur ? (cur[k] || '') : '')}" placeholder="${ph}" ${cur ? '' : 'disabled'}>`;
  const sw = k => `<button class="qsp-sw ${cur && cur[k] ? 'on' : ''}" data-csw="${k}" ${cur ? '' : 'disabled'}></button>`;
  body.innerHTML = `
    <div class="qsp-conn-cols">
      <div class="qsp-conn-list">
        <div class="qsp-conn-rows" id="qspConnRows">
          ${list.length ? list.map((c, i) => `<div class="qsp-conn-item${sel === i ? ' is-sel' : ''}" data-ci="${i}">
              <span>${escapeHtml(c.name || '未命名连接')}</span><span class="ty">${escapeHtml(c.type || 'FTP')}</span></div>`).join('')
            : '<div class="qsp-conn-empty">还没有连接。<br>点下面的 <b>＋</b> 添加一个（FTP · SFTP · WebDAV · 云存储）。</div>'}
        </div>
        <div class="qsp-tablebar"><button class="qsp-btn sm" id="qspConnAdd">＋</button>
          <button class="qsp-btn sm" id="qspConnDel">−</button></div>
      </div>
      <div class="qsp-conn-detail">
        ${!cur ? '<div class="qsp-conn-placeholder">在左侧选择一个连接查看/编辑。<br>还没有连接就先点左下角的 <b>＋</b>。</div>' : `
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${QSP_CONN_TYPES.map(t => `<button class="qsp-btn sm ${cur.type === t ? 'primary' : ''}" data-ctype="${t}">${t}</button>`).join('')}
        </div>
        <div class="qsp-card">
          <div class="qsp-row"><span class="qsp-lab">名称</span>${inp('name', '我的服务器')}</div>
          <div class="qsp-row"><span class="qsp-lab">地址</span>${inp('addr', 'ftp.example.com')}</div>
          <div class="qsp-row"><span class="qsp-lab">端口</span>${inp('port', '21')}</div>
          <div class="qsp-row"><span class="qsp-lab">用户名</span>${inp('user', '')}</div>
          <div class="qsp-row"><span class="qsp-lab">密码</span>${inp('pass', '')}</div>
          <div class="qsp-row"><span class="qsp-lab">字符编码</span>
            <span class="qsp-seg">${['UTF-8', 'GBK', 'ISO-8859-1'].map(e =>
              `<button data-enc="${e}" class="${(cur.enc || 'UTF-8') === e ? 'on' : ''}">${e}</button>`).join('')}</span></div>
        </div>
        <div class="qsp-card">
          <div class="qsp-row"><span class="qsp-lab">启用SSL</span>${sw('ssl')}</div>
          <div class="qsp-row"><span class="qsp-lab">私钥文件</span>${inp('key', '未选择')}</div>
          <div class="qsp-row"><span class="qsp-lab">代理</span>${sw('proxy')}</div>
          <div class="qsp-row"><span class="qsp-lab">按需连接</span>${sw('onDemand')}</div>
          <div class="qsp-row"><span class="qsp-lab">应用启动时连接</span>${sw('atLaunch')}</div>
          <div class="qsp-row"><span class="qsp-lab">上传前确认</span>${sw('askUpload')}</div>
        </div>`}
      </div>
    </div>`;
  // 左：选中 / 添加 / 删除
  body.querySelectorAll('[data-ci]').forEach(el => el.onclick = () => {
    p.connSel = +el.dataset.ci; save(true); qspRenderBody();
  });
  document.getElementById('qspConnAdd').onclick = () => {
    askModal({ title: '新建连接', text: '连接名称', value: '我的服务器', okText: '添加',
      onOk: v => { if (!v || !v.trim()) return;
        list.push({ name: v.trim(), type: p.connType || 'FTP', addr: '', port: '21',
          user: '', pass: '', enc: 'UTF-8', ssl: true, key: '', proxy: false,
          onDemand: true, atLaunch: false, askUpload: true });
        p.connSel = list.length - 1; save(true); qspRenderBody();
        toast(`已添加连接「${escapeHtml(v.trim())}」`); } });
  };
  document.getElementById('qspConnDel').onclick = () => {
    if (sel < 0 || sel >= list.length) return toast('先在左侧选中要删除的连接');
    const nm = list[sel].name;
    list.splice(sel, 1); p.connSel = list.length ? 0 : -1; save(true); qspRenderBody();
    toast(`已删除连接「${escapeHtml(nm)}」`);
  };
  if (!cur) return;
  body.querySelectorAll('[data-ctype]').forEach(b => b.onclick = () => { cur.type = b.dataset.ctype; save(true); qspRenderBody(); });
  body.querySelectorAll('[data-enc]').forEach(b => b.onclick = () => { cur.enc = b.dataset.enc; save(true); qspRenderBody(); });
  body.querySelectorAll('[data-csw]').forEach(b => b.onclick = () => { const k = b.dataset.csw; cur[k] = !cur[k]; save(true); qspRenderBody(); });
  body.querySelectorAll('[data-cf]').forEach(i => i.oninput = () => { cur[i.dataset.cf] = i.value; save(true); });
}
/* ── 42.14 iCloud 页（XS:JHSiCloudSettingsView 逐字） ── */
function qspRenderICloudPage(body) {
  const p = qspPrefs();
  const IC_MODES = [['auto', '自动'], ['hidden', '自定义隐藏项'], ['visible', '自定义可见项']];
  const modeLabel = (IC_MODES.find(m => m[0] === p.icloudApps) || IC_MODES[0])[1];
  const list = p.icloudAppsList;
  body.innerHTML = `
    <div class="qsp-card">
      <div class="qsp-ic-row"><span style="flex:1">在 iCloud云盘 中显示应用文件夹</span>
        <button class="qsp-drop" id="qspIcMode">${escapeHtml(modeLabel)}<span class="cv">⇕</span></button></div>
      <table class="qsp-table qsp-ic-list"><tbody>
      ${list.map((a, i) => `<tr data-ic="${i}">
        <td style="width:40%"><span class="qsp-ic-ico" style="background:${a.t === 'dir' ? '#45ACE6' : '#8E959B'};${a.t === 'dir' ? '' : 'color:#fff'}">${a.t === 'dir' ? '📁' : 'A'}</span>
          <span style="margin-left:8px">${escapeHtml(a.n)}</span></td>
        <td class="qsp-ic-empty">${/\(空\)/.test(a.n) ? '(空)' : ''}</td>
        <td style="width:70px;text-align:right"><button class="qsp-ic-view" data-icv="${i}">查看</button></td>
      </tr>`).join('')}
      </tbody></table>
    </div>`;
  document.getElementById('qspIcMode').onclick = e => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(IC_MODES.map(([k, l]) => ({
      label: (p.icloudApps === k ? '✓ ' : '　') + l,
      action: () => { p.icloudApps = k; save(true); qspRenderBody(); },
    })), null, { x: r.left, y: r.bottom + 4 });
  };
  body.querySelectorAll('[data-icv]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const a = list[+b.dataset.icv];
    toast(`在 iCloud云盘 中查看「${escapeHtml(a.n)}」的应用文件夹（演示）`);
  });
}
/* ── 42.15 关窗三条路径 + 快捷键录制（与 §41.8 共用捕获监听） ── */
document.addEventListener('keydown', e => {
  if (!QSP.hkRec) return;
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { QSP.hkRec = null; qspRenderBody(); return; }
  const combo = fpComboFromEvent(e);
  if (!combo) return;
  const r = QSP.hkRec;
  if (r.fpKey) { S.finderHotkeys = Object.assign({}, fpHotkeys(), { [r.fpKey]: combo }); }
  else { S.qspHotkeys = Object.assign({}, S.qspHotkeys || {}, { [r.id]: combo }); }
  QSP.hkRec = null;
  save(true); qspRenderBody();
  toast(`已改为 <b>${escapeHtml(combo)}</b>`);
}, true);
(function bindQSP() {
  const btn = document.getElementById('fpPrefs');
  if (btn) btn.onclick = e => { e.stopPropagation(); QSP.open ? qspClose() : qspOpenPage(); };
  const cl = document.getElementById('qspClose');
  if (cl) cl.onclick = () => qspClose();
  const bk = document.getElementById('qspBack'), fw = document.getElementById('qspFwd');
  if (bk) bk.onclick = () => qspNavStep(-1);
  if (fw) fw.onclick = () => qspNavStep(1);
  const fi = document.getElementById('qspFilterInput');
  if (fi) fi.oninput = () => { QSP.filter = fi.value; qspRenderNav(); };
  // 43.4 点设置窗**外面**（遮罩上）= 自动隐藏；点窗体内部不关
  document.addEventListener('mousedown', e => {
    if (!QSP.open) return;
    if (!e.target || typeof e.target.closest !== 'function') return;
    if (e.target.closest('.qsp-win')) return;
    qspClose();
  }, true);
  // 42.15 Esc 关窗（录制键位时 Esc 由录制监听先吃掉）
  document.addEventListener('keydown', e => {
    if (!QSP.open || QSP.hkRec) return;
    if (e.key !== 'Escape') return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;   // 输入框里打字的 Esc 归输入框
    e.preventDefault(); qspClose();
  });
})();


/* ══ §44 Hermes 还原 —— 数据面照 reference/Hermes-DISSECT.md §13「A 批：纯数据/纯逻辑」══
   本块做三件事：① 房间（hosted room）事件日志与幂等追加  ② 成员校验 2~6  ③ plan_next_task 决策机
   三者的规则全部从 Hermes 源码逐条移植（见每条注释里的 Hermes 出处），不是我自己的设计。
   需要真进程/真渠道的部分（B 批）在下一批，这里只做数据与决策。 */

const H_MIN_DISC = 2, H_MAX_DISC = 6;          // hosted_room_discussion.py:25-26
const H_MAX_ROUNDS = 3, H_MAX_MSGS = 10;       // hosted_room_discussion.py:27-28
const H_MAX_ROOMS = 256, H_MAX_MEMBERS = 128;  // hosted_rooms.py:30
const H_STATUSES = ['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done', 'archived'];
                                                     // kanban_db.py:103 VALID_STATUSES（顺序即泳道顺序）
const H_STATUS_ZH = { triage: '待分诊', todo: '待办', scheduled: '已排期', ready: '可认领', running: '进行中',
  blocked: '受阻', review: '待评审', done: '完成', archived: '已归档' };
const H_FAILURE_LIMIT = 2;                     // kanban_db_dispatch.py:36 DEFAULT_FAILURE_LIMIT
const H_DISPATCH_INTERVAL = 60;                // config_defaults.py:1897 dispatch_interval_seconds

/// Hermes 侧的全部状态（rooms / profiles / 看板 / 归档会话 / 配置）—— 存 S.hermes
function hState() {
  if (!S.hermes || typeof S.hermes !== 'object') S.hermes = {};
  const H0 = S.hermes;
  if (!Array.isArray(H0.rooms)) H0.rooms = [];
  if (!Array.isArray(H0.profiles) || !H0.profiles.length) {
    // §7 多角色隔离的**最小可用种子**：每个角色一份独立配置（模型/提供商/绑定项目/系统提示词）
    H0.profiles = [
      { id: 'p-arch', name: '架构师', handle: 'arch', model: 'qwen3-vl-plus', provider: 'bailian',
        projectPath: '/Users/mjm/Documents/SuperAgent', persona: '负责拆需求、定边界，回答偏结构化。' },
      { id: 'p-code', name: '编码手', handle: 'code', model: 'deepseek-chat', provider: 'deepseek',
        projectPath: '/Users/mjm/Documents/SuperAgent/Wanna', persona: '直接给可运行的代码与命令。' },
      { id: 'p-qa', name: '验收员', handle: 'qa', model: 'qwen3-vl-plus', provider: 'bailian',
        projectPath: '', persona: '只挑毛病：缺判据、没实测、漏边界。' },
      { id: 'p-doc', name: '文档官', handle: 'doc', model: 'deepseek-chat', provider: 'deepseek',
        projectPath: '', persona: '把讨论收成可入库的中文文档。' },
    ];
  }
  if (!Array.isArray(H0.tasks)) H0.tasks = [];
  if (!Array.isArray(H0.taskComments)) H0.taskComments = [];
  if (!Array.isArray(H0.taskEvents)) H0.taskEvents = [];
  if (!Array.isArray(H0.taskRuns)) H0.taskRuns = [];
  if (!Array.isArray(H0.taskLinks)) H0.taskLinks = [];
  if (!H0.cfg || typeof H0.cfg !== 'object') H0.cfg = {};
  const c = H0.cfg;
  if (typeof c.autoArchive !== 'boolean') c.autoArchive = false;   // config_defaults.py:2275 sessions.auto_archive=false
  if (typeof c.autoArchiveDays !== 'number') c.autoArchiveDays = 3; // :2276 auto_archive_days=3
  if (typeof c.dispatchInterval !== 'number') c.dispatchInterval = H_DISPATCH_INTERVAL;
  if (typeof c.failureLimit !== 'number') c.failureLimit = H_FAILURE_LIMIT;
  if (typeof c.defaultAssignee !== 'string') c.defaultAssignee = H0.profiles[0].id;
  if (typeof c.groupSessionsPerUser !== 'boolean') c.groupSessionsPerUser = true; // cli-config.yaml.example:1037
  if (H0.view === undefined) H0.view = null;
  if (H0.activeRoom === undefined) H0.activeRoom = null;
  if (H0.activeTask === undefined) H0.activeTask = null;
  return H0;
}
const hProfiles = () => hState().profiles;
const hProfile = id => hProfiles().find(p => p.id === id) || null;
const hProfileName = id => (hProfile(id) || {}).name || id || '—';
function hSave() { save(true); }
const hNewId = pfx => pfx + '-' + Math.random().toString(36).slice(2, 10);

/* ── 房间（§2.1 / hosted_rooms.py）──────────────────────────────── */
/// 成员校验：2~6 个、handle 唯一且不能占 @all/@everyone（hosted_room_discussion.py:253 validate_roster）
function hValidateRoster(members) {
  if (!Array.isArray(members)) return { ok: false, err: 'members must be a list' };
  if (members.length < H_MIN_DISC || members.length > H_MAX_DISC) {
    return { ok: false, err: `成员必须在 ${H_MIN_DISC}~${H_MAX_DISC} 个之间（当前 ${members.length}）` };
  }
  const seenTarget = new Set(), seenHandle = new Set(['all', 'everyone']);
  for (const m of members) {
    if (!m || !m.profile) return { ok: false, err: '每个成员都要有 profile' };
    const t = String(m.profile).toLowerCase();
    if (seenTarget.has(t)) return { ok: false, err: '成员的 profile 不能重复' };
    seenTarget.add(t);
    const h = String(m.handle || '').toLowerCase();
    if (!h) return { ok: false, err: '每个成员都要有 handle（@名字）' };
    if (seenHandle.has(h)) return { ok: false, err: 'handle 必须唯一，且不能用 @all / @everyone' };
    seenHandle.add(h);
  }
  return { ok: true };
}
/// 事件种类 → 允许的 actor（hosted_rooms.py:49-57 逐条照搬）
const H_EVENT_KINDS_BY_ACTOR = {
  user: ['message.user'],
  member: ['message.member'],
  gateway: ['member.unavailable', 'room.activity', 'room.stop_requested', 'turn.deferred', 'turn.reassigned',
    'turn.cancelled', 'turn.failed', 'turn.settled', 'turn.started'],
  system: ['authority.claimed', 'authority.lost', 'room.created', 'room.disbanded', 'room.members_changed',
    'room.renamed'],
};
const H_CONTROL_KINDS = ['authority.claimed', 'authority.lost', 'room.disbanded', 'room.stop_requested'];
/// 幂等追加（hosted_rooms.py:942 append_event）：同 event_id 同内容 → 返回原事件；内容不同 → 失败
function hAppendEvent(room, { eventId, kind, actor, payload }) {
  const actorKind = (actor && actor.kind) || 'system';
  if (!H_EVENT_KINDS_BY_ACTOR[actorKind] || !H_EVENT_KINDS_BY_ACTOR[actorKind].includes(kind)) {
    return { ok: false, err: `kind「${kind}」不允许 actor=${actorKind}` };
  }
  const dup = room.events.find(e => e.event_id === eventId);
  if (dup) {
    const same = JSON.stringify({ kind: dup.kind, actor: dup.actor, payload: dup.payload })
             === JSON.stringify({ kind, actor, payload });
    return same ? { ok: true, event: dup, idempotent: true }
                : { ok: false, err: 'event_id 冲突且内容不同（fail closed）' };
  }
  const ev = { seq: room.events.length + 1, event_id: eventId, kind, actor, payload: payload || {},
    created_at: Date.now() };
  room.events.push(ev);
  room.rev = (room.rev || 0) + 1;
  return { ok: true, event: ev };
}
/// 幂等创建房间（hosted_rooms.py:857 create_room）：同 room_id 已存在则原样返回
function hCreateRoom({ name, members, profiles }) {
  const H0 = hState();
  if (H0.rooms.length >= H_MAX_ROOMS) return { ok: false, err: `活跃房间上限 ${H_MAX_ROOMS}` };
  const v = hValidateRoster(members);
  if (!v.ok) return v;
  const roomId = hNewId('room');
  const room = { id: roomId, name: String(name || '未命名群聊').slice(0, 60), members,
    authority_gateway_id: 'local', authority_epoch: 1, rev: 0, events: [], created_at: Date.now(),
    disbanded_at: null, watermarks: {} };
  H0.rooms.unshift(room);
  hAppendEvent(room, { eventId: 'system:room.created', kind: 'room.created',
    actor: { kind: 'system', id: 'local' }, payload: { name: room.name,
      members: members.map(m => ({ profile: m.profile, handle: m.handle })) } });
  H0.activeRoom = roomId;
  hSave();
  return { ok: true, room };
}
/// 成员变化控制事件 + 重写清单（group-chat-view-members.tsx:49 commitGroupChatRoster 的语义）
function hSetRoomMembers(roomId, members) {
  const H0 = hState();
  const room = H0.rooms.find(r => r.id === roomId);
  if (!room) return { ok: false, err: 'room not found' };
  const v = hValidateRoster(members);
  if (!v.ok) return v;
  const before = room.members.map(m => m.handle).join(',');
  room.members = members;
  room.rev = (room.rev || 0) + 1;
  hAppendEvent(room, { eventId: hNewId('ev'), kind: 'room.members_changed',
    actor: { kind: 'system', id: 'local' },
    payload: { before: before.split(',').filter(Boolean), after: members.map(m => m.handle) } });
  hSave();
  return { ok: true };
}
function hDisbandRoom(roomId) {
  const H0 = hState();
  const room = H0.rooms.find(r => r.id === roomId);
  if (!room) return;
  room.disbanded_at = Date.now();
  hAppendEvent(room, { eventId: hNewId('ev'), kind: 'room.disbanded',
    actor: { kind: 'system', id: 'local' }, payload: {} });
  if (H0.activeRoom === roomId) H0.activeRoom = (H0.rooms.find(r => !r.disbanded_at) || {}).id || null;
  hSave();
}

/* ── 讨论决策机（§2.5a / hosted_room_discussion.py:617 plan_next_task）────────
   Hermes 的**纯函数**：重放整个房间日志，返回「下一个成员任务」或 idle/settled/bounded。
   三条硬上限与轮次规则照搬：
   · 3 轮（:27）、每轮 10 条消息（:28）
   · 第 0 轮 = 用户消息里的 @mention 选 responder，没人 @ 就全员（:639-645）
   · 后续轮只给「被某个 Bot 点名且此后没发言」的成员（_unaddressed_member_mentions）
   · 一轮全员沉默 → settled；轮次耗尽 → bounded
*/
function hResolveMentions(texts, members, defaultAll = true) {
  const byHandle = new Set(members.map(m => String(m.handle).toLowerCase()));
  const mentioned = new Set();
  let everyone = false;
  for (const t of texts) {
    const re = /@([A-Za-z0-9_一-龥-]+)/g;
    let m;
    while ((m = re.exec(String(t || '')))) {
      const h = m[1].toLowerCase();
      if (h === 'all' || h === 'everyone') everyone = true;
      else if (byHandle.has(h)) mentioned.add(h);
    }
  }
  if (everyone || (defaultAll && !mentioned.size)) return members.slice();
  return members.filter(m => mentioned.has(String(m.handle).toLowerCase()));
}
/// 某轮之后，「被 Bot 点名且此后没发言」的成员（= 下一轮的 responder 池）
function hUnaddressedMembers(discussionMessages, members) {
  const lastSaid = new Set();
  for (const e of discussionMessages) {
    if (e.kind === 'message.member') lastSaid.add(e.payload.member_id);
  }
  const cited = new Set();
  for (const e of discussionMessages) {
    if (e.kind !== 'message.member') continue;
    hResolveMentions([e.payload.text || ''], members, false).forEach(m => {
      if (m.member_id !== e.payload.member_id) cited.add(m.member_id);
    });
  }
  return members.filter(m => cited.has(m.member_id) && !lastSaid.has(m.member_id));
}
function hPlanNextTask(roomId) {
  const H0 = hState();
  const room = H0.rooms.find(r => r.id === roomId);
  if (!room || room.disbanded_at) return { status: 'idle', reason: 'no_room' };
  // 成员带 member_id（Hermes 的 DiscussionMember：member_id / profile / handle / display_name）
  const members = room.members.map((m, i) => ({ ...m, member_id: `${m.handle}#${i}`,
    display_name: m.display_name || hProfileName(m.profile) }));
  const events = room.events;
  // _pending_discussion：最后一条尚未被成员消息终结过的 message.user
  let discussion = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === 'message.user') {
      const settled = events.some(x => x.kind === 'message.member'
        && x.payload.discussion_event_id === e.event_id && x.payload.settled === true);
      if (!settled) { discussion = e; }
      break;
    }
  }
  if (!discussion) return { status: 'idle', reason: 'no_pending_user_event' };
  const threadId = discussion.payload.thread_id;
  const threadMessages = events.filter(e => e.payload.thread_id === threadId);
  const discussionMessages = threadMessages.filter(e => e.payload.discussion_event_id === discussion.event_id
    || e.kind === 'message.user');
  const memberMessages = discussionMessages.filter(e => e.kind === 'message.member');
  if (memberMessages.length >= H_MAX_MSGS) return { status: 'bounded', reason: 'max_messages' };
  // 已终结的 (round, member)
  const terminals = new Set(memberMessages.map(e => `${e.payload.round_index}|${e.payload.member_id}`));
  // watermark：每 (thread, member) 已读到的最大 seq（_effective_watermarks 的派生部分）
  const wm = { ...(room.watermarks || {}) };
  memberMessages.forEach(e => {
    const k = `${threadId}|${e.payload.member_id}`;
    wm[k] = Math.max(wm[k] || 0, e.seq);
  });
  const seenThrough = threadMessages.reduce((a, e) => Math.max(a, e.seq), 0);
  for (let round = 0; round < H_MAX_ROUNDS; round++) {
    const responders = round === 0
      ? hResolveMentions([discussion.payload.text || ''], members, true)
      : hUnaddressedMembers(discussionMessages, members);
    // _rotate(responders, round)
    const rot = responders.slice(round % Math.max(responders.length, 1))
      .concat(responders.slice(0, round % Math.max(responders.length, 1)));
    for (let mi = 0; mi < rot.length; mi++) {
      const member = rot[mi];
      if (terminals.has(`${round}|${member.member_id}`)) continue;
      const w = wm[`${threadId}|${member.member_id}`] || 0;
      const hasDelta = threadMessages.some(e => w < e.seq && e.seq <= seenThrough);
      if (!hasDelta) continue;
      const delta = threadMessages.filter(e => w < e.seq && e.seq <= seenThrough);
      return { status: 'task', reason: 'member_turn', discussionEventId: discussion.event_id,
        sourceEventSeq: discussion.seq, threadId, member, memberIndex: mi, roundIndex: round,
        seenThroughSeq: seenThrough, watermark: w,
        prompt: hBuildPrompt({ room, member, delta, discussion }) };
    }
    if (!memberMessages.some(e => Number(e.payload.round_index) === round)) {
      return { status: 'settled', reason: 'silent_round' };
    }
    if (round === H_MAX_ROUNDS - 1) return { status: 'bounded', reason: 'max_rounds' };
  }
  return { status: 'bounded', reason: 'exhausted' };
}
/// _build_prompt（:519）的等价物：控制帧 + 增量 transcript + 任务指令
function hBuildPrompt({ room, member, delta, discussion }) {
  const lines = [];
  lines.push('[control] 这是房间讨论的一轮；你是被点名的成员。只回答这一轮，不要重复别人已说过的。');
  lines.push(`[room] ${room.name}`);
  lines.push('[transcript-delta]');
  delta.forEach(e => {
    const who = e.kind === 'message.user' ? '用户'
      : hProfileName((room.members.find(m => m.handle === e.payload.handle) || {}).profile);
    lines.push(`${e.seq > discussion.seq ? '' : ''}${who}: ${e.payload.text}`);
  });
  // §45 记忆注入：用**冻结快照**（会话开始那一刻），不是盘上最新 —— Hermes memory.md:57 的纪律
  const snap = typeof hSnapshotBlock === 'function' ? hSnapshotBlock(member.profile) : '';
  if (snap) { lines.push('[memory-frozen]'); lines.push(snap); }
  lines.push(`[your-turn] 成员 @${member.handle}（${member.display_name}）请给出你的回复。`);
  return lines.join('\n');
}
/// 用户在房间里发一条消息（= 起一个 discussion）
function hRoomSend(roomId, text) {
  const H0 = hState();
  const room = H0.rooms.find(r => r.id === roomId);
  if (!room || !String(text || '').trim()) return { ok: false };
  const evId = hNewId('ev');
  const isFirst = !room.events.some(e => e.kind === 'message.user');
  hAppendEvent(room, { eventId: evId, kind: 'message.user', actor: { kind: 'user', id: 'me' },
    payload: { thread_id: evId, text: String(text) } });
  // §45 会话开始 = 冻结快照（此后盘上再改记忆也不影响这一场的 prompt）
  if (isFirst) room.members.forEach(m => hFreezeMemory(m.profile));
  hSave();
  return { ok: true };
}
/// 按 plan_next_task 的决策产出一条成员回复（原型里 = 假 worker 的"生成结果"）
function hRunNextTurn(roomId) {
  const plan = hPlanNextTask(roomId);
  if (plan.status !== 'task') return plan;
  const H0 = hState();
  const room = H0.rooms.find(r => r.id === roomId);
  const prof = hProfile(plan.member.profile);
  const text = hFakeMemberReply(prof, plan);
  hAppendEvent(room, { eventId: hNewId('ev'), kind: 'message.member',
    actor: { kind: 'member', id: plan.member.member_id, profile: plan.member.profile },
    payload: { discussion_event_id: plan.discussionEventId, thread_id: plan.threadId,
      member_id: plan.member.member_id, handle: plan.member.handle,
      round_index: plan.roundIndex, task_id: hNewId('dtask'), text } });
  // 一轮全员回复完 → 标 settled（Hermes 里由 turn.settled 控制事件表达）
  const after = hPlanNextTask(roomId);
  if (after.status === 'settled' || after.status === 'bounded') {
    hAppendEvent(room, { eventId: hNewId('ev'), kind: 'turn.settled',
      actor: { kind: 'gateway', id: 'local' },
      payload: { thread_id: plan.threadId, discussion_event_id: plan.discussionEventId,
        status: after.status, reason: after.reason } });
  }
  hSave();
  return after;
}
/// 假 worker 的回复文本（数据面演示用；真回复属 B 批"真子进程"）
function hFakeMemberReply(prof, plan) {
  const p = prof || {};
  const head = `【${p.name || plan.member.handle}】@${plan.member.handle} 第 ${plan.roundIndex + 1} 轮：`;
  const body = p.persona
    ? `${p.persona} 我这条只处理 @${plan.member.handle} 该负责的那一段（水位 ${plan.watermark} → ${plan.seenThroughSeq}）。`
    : `收到（轮次 ${plan.roundIndex}，增量 ${plan.deltaCount || 1} 条）。`;
  return head + body;
}

/* ══ §44b 任务看板（§3 / kanban_db.py 7 表 + 状态机 + dispatcher）══
   数据表字段照 kanban_db.py:875-1055 的核心列；状态机照 :103；
   认领是 CAS（ready→running，:2269 claim_task）；dispatcher 是"单写者 tick"（:1953 dispatch_once）。
   原型里 worker 是**模拟的**（B 批才起真子进程）—— 所有假日志都标了「模拟」。 */
function hTask(id) { return hState().tasks.find(t => t.id === id) || null; }
function hTaskEvents(id) { return hState().taskEvents.filter(e => e.task_id === id); }
function hTaskComments(id) { return hState().taskComments.filter(c => c.task_id === id); }
function hAddTaskEvent(taskId, kind, payload) {
  const H0 = hState();
  H0.taskEvents.push({ id: hNewId('te'), task_id: taskId, kind, payload: payload || {}, created_at: Date.now() });
}
function hCreateTask({ title, body, assignee, priority, projectId, parents }) {
  const H0 = hState();
  const t = {
    id: hNewId('task'), title: String(title || '未命名任务').slice(0, 120), body: String(body || ''),
    assignee: assignee || H0.cfg.defaultAssignee, status: 'triage',
    priority: priority || 'P2', created_by: 'user', created_at: Date.now(),
    started_at: null, completed_at: null, project_id: projectId || (proj() && proj().id) || '',
    workspace_kind: 'scratch', workspace_path: '', branch_name: '',
    claim_lock: null, claim_expires: null, result: '', idempotency_key: null,
    consecutive_failures: 0, worker_pid: null, last_failure_error: '', max_runtime_seconds: 900,
    last_heartbeat_at: null, current_run_id: null, session_id: '', model_override: null, provider_override: null,
    max_retries: 2, archived: false,
  };
  H0.tasks.push(t);
  hAddTaskEvent(t.id, 'task.created', { title: t.title, assignee: t.assignee });
  (parents || []).forEach(pid => hState().taskLinks.push({ parent_id: pid, child_id: t.id }));
  // triage → todo（Hermes 的自动分诊在原型里只做一步；kanban_decompose.py 的 LLM 分解属 B 批）
  t.status = 'todo';
  hAddTaskEvent(t.id, 'status.changed', { from: 'triage', to: 'todo' });
  hSave();
  return t;
}
function hSetTaskStatus(id, status, extra) {
  const t = hTask(id);
  if (!t) return { ok: false, err: 'task not found' };
  if (!H_STATUSES.includes(status)) return { ok: false, err: `非法状态 ${status}` };
  const from = t.status;
  t.status = status;
  if (status === 'running' && !t.started_at) t.started_at = Date.now();
  if (status === 'done') { t.completed_at = Date.now(); if (extra && extra.result) t.result = extra.result; }
  hAddTaskEvent(t.id, 'status.changed', { from, to: status, ...(extra || {}) });
  hSave();
  return { ok: true };
}
/// CAS 认领（kanban_db.py:2269 claim_task 的两条规则）：
/// ① 只有 ready 能变 running；② 父任务没完成 → 降回 todo 并记 claim_rejected
function hClaimTask(id) {
  const t = hTask(id);
  if (!t) return { ok: false, err: 'task not found' };
  const parents = hState().taskLinks.filter(l => l.child_id === id).map(l => l.parent_id);
  const openParent = parents.find(pid => { const p = hTask(pid); return p && p.status !== 'done' && p.status !== 'archived'; });
  if (openParent) {
    if (t.status === 'ready') hSetTaskStatus(id, 'todo');
    hAddTaskEvent(id, 'claim_rejected', { parent: openParent });
    hSave();
    return { ok: false, err: '父任务未完成', parent: openParent };
  }
  if (t.status !== 'ready') return { ok: false, err: `状态 ${t.status} 不能被认领（只能 ready）` };
  t.claim_lock = t.assignee; t.claim_expires = Date.now() + t.max_runtime_seconds * 1000;
  t.current_run_id = hNewId('run');
  hSetTaskStatus(id, 'running');
  const run = { id: t.current_run_id, task_id: id, status: 'running', outcome: null,
    claimed_at: Date.now(), profile: t.assignee, progress: 0, summary: '' };
  hState().taskRuns.push(run);
  hAddTaskEvent(id, 'task.claimed', { worker: t.assignee, run_id: run.id, simulated: true });
  hSave();
  hScheduleWorker(run.id);
  return { ok: true, run };
}
/// 模拟 worker（B 批才是真子进程 kanban_db_dispatch.py:2831 _default_spawn）
function hScheduleWorker(runId) {
  const H0 = hState();
  const run = H0.taskRuns.find(r => r.id === runId);
  if (!run) return;
  const step = () => {
    const H = hState();
    const r = H.taskRuns.find(x => x.id === runId);
    if (!r || r.status !== 'running') return;
    const t = hTask(r.task_id);
    if (!t || t.status !== 'running') { r.status = 'released'; return; }
    r.progress = Math.min(100, (r.progress || 0) + 12 + Math.floor(Math.random() * 14));
    t.last_heartbeat_at = Date.now();
    if (r.progress >= 100) {
      if (r.failNext) {
        r.status = 'done'; r.outcome = 'failed';
        t.consecutive_failures += 1;
        t.last_failure_error = '模拟 worker 报错（演示熔断）';
        hAddTaskEvent(t.id, 'run.failed', { failures: t.consecutive_failures, simulated: true });
        if (t.consecutive_failures >= H.cfg.failureLimit) {
          hSetTaskStatus(t.id, 'blocked', { reason: `连续失败 ${t.consecutive_failures} 次（failure_limit=${H.cfg.failureLimit}）` });
        } else hSetTaskStatus(t.id, 'ready');
        t.current_run_id = null; t.claim_lock = null;
      } else {
        r.status = 'done'; r.outcome = 'completed';
        t.consecutive_failures = 0;
        hSetTaskStatus(t.id, 'done', { result: `模拟 worker 完成（run ${r.id}）` });
        t.current_run_id = null; t.claim_lock = null;
      }
      hSave(); renderHermes();
      return;
    }
    hSave();
    if (hState().view === 'kanban') renderHermes();
    setTimeout(step, 700);
  };
  setTimeout(step, 700);
}
/// dispatcher 单写者 tick（kanban_db_dispatch.py:1953；网关版每 60s 一次 kanban_watchers.py:251）
function hDispatchTick() {
  const H0 = hState();
  let claimed = 0;
  const capPerProfile = 1;
  for (const t of H0.tasks) {
    if (t.status !== 'ready') continue;
    if (H0.cfg.failureLimit > 0 && t.consecutive_failures >= H0.cfg.failureLimit) continue; // 熔断
    const running = H0.tasks.filter(x => x.status === 'running' && x.assignee === t.assignee).length;
    if (running >= capPerProfile) continue;
    const res = hClaimTask(t.id);
    if (res.ok) claimed++;
  }
  if (claimed) { hSave(); if (H0.view === 'kanban') renderHermes(); }
  return claimed;
}
function hAddTaskComment(id, author, body) {
  if (!String(body || '').trim()) return;
  hState().taskComments.push({ id: hNewId('c'), task_id: id, author, body: String(body), created_at: Date.now() });
  hAddTaskEvent(id, 'comment.added', { author });
  hSave();
}

/* ══ §44c Archived Chats（§10 / hermes_state_sessions.py:923-958 双标记）══
   原型里"会话" = 「默认」区的 S.plans + 每个项目 p.chats（同一份 poolOf(scope)）。
   两列软删：archived（归档了没有）+ autoArchived（是自动扫的还是人归的）；pinned 豁免自动归档。 */
function hAllConvPools() {
  const out = [];
  out.push({ scope: { kind: 'default' }, pool: S.plans });
  S.projects.forEach(p => { if (p && p.chats) out.push({ scope: { kind: 'project', project: p }, pool: p.chats }); });
  return out;
}
function hFindConv(id) {
  for (const { scope, pool } of hAllConvPools()) {
    const c = pool.find(x => x.id === id);
    if (c) return { conv: c, scope };
  }
  return null;
}
/// 人归档（hermes_state_sessions.py:923 set_session_archived：**清掉 auto_archived** —— 这是人归的）
function hArchiveConv(id, { manual = true } = {}) {
  const f = hFindConv(id); if (!f) return false;
  f.conv.archived = true;
  if (manual) f.conv.autoArchived = false;
  // 选中态被归档 → 让位
  if (f.scope.kind === 'default' && S.activePlan === id) S.activePlan = null;
  if (f.scope.kind === 'project' && S.activeProjChat === id) S.activeProjChat = null;
  hSave();
  return true;
}
/// 空闲扫描自动归档（:930 _auto_archive_lineage：打 auto_archived=1；pinned 永不自动归档）
function hAutoArchiveScan() {
  const H0 = hState();
  if (!H0.cfg.autoArchive) return 0;
  const cutoff = Date.now() - H0.cfg.autoArchiveDays * 86400000;
  let n = 0;
  hAllConvPools().forEach(({ pool }) => {
    pool.forEach(c => {
      if (c.isGroup || c.archived || c.pinned) return;          // pinned 豁免
      const ts = c.ts || 0;
      if (ts && ts < cutoff) { c.archived = true; c.autoArchived = true; n++; }
    });
  });
  if (n) hSave();
  return n;
}
/// 恢复：从归档视图恢复 = 清 archived；若当初是自动归档的，顺带清 autoArchived（人归的永远不动别人的标记）
function hUnarchiveConv(id) {
  const f = hFindConv(id); if (!f || !f.conv.archived) return false;
  f.conv.archived = false;
  if (f.conv.autoArchived) f.conv.autoArchived = false;
  hSave();
  return true;
}
function hArchivedConvs() {
  const out = [];
  hAllConvPools().forEach(({ scope, pool }) => {
    pool.forEach(c => { if (c.archived) out.push({ conv: c, scope }); });
  });
  return out.sort((a, b) => (b.conv.ts || 0) - (a.conv.ts || 0));
}

/* ══ §44d 视图：导航分区 + 三个页面 ══ */
let hermesView = null;      // null | 'rooms' | 'kanban' | 'archived'
function setHermesView(v) {
  if (v && typeof finderOpen !== 'undefined' && finderOpen) setFinderOpen(false);   // 与访达互斥
  if (v && typeof monitorOpen !== 'undefined' && monitorOpen) setMonitorMode(false);
  if (v && typeof wikiView !== 'undefined' && wikiView) setWikiView(null);          // §53 与知识库互斥
  hermesView = v;
  const on = !!v;
  ['.workspace', '.chat', '.split-v', '.split-h', '#railRight', '#panelSide', '#panelAutomation', '#tabsVertical']
    .forEach(sel => document.querySelectorAll(sel).forEach(el => {
      if (on) { el.dataset.hHide = '1'; el.style.display = 'none'; }
      else if (el.dataset.hHide) { delete el.dataset.hHide; el.style.display = ''; }
    }));
  const pane = $('#hermesPane');
  if (pane) pane.hidden = !on;
  if (on) renderHermes(); else renderNav();
  renderHermesNav();
}
function renderHermesNav() {
  const host = $('#hermesList');
  if (!host) return;
  const H0 = hState();
  const activeRooms = H0.rooms.filter(r => !r.disbanded_at).length;
  const openTasks = H0.tasks.filter(t => ['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review'].includes(t.status)).length;
  const archived = hArchivedConvs().length;
  const H2 = hState2();
  const memEntries = Object.values(H2.memory || {})
    .reduce((a, b) => a + ((b.memory || []).length + (b.user || []).length), 0);
  const rows = [
    { v: 'rooms', label: '群聊', badge: activeRooms ? `${activeRooms}` : '' },
    { v: 'kanban', label: '任务看板', badge: openTasks ? `${openTasks}` : '' },
    { v: 'archived', label: '归档会话', badge: archived ? `${archived}` : '' },
    { v: 'profiles', label: '角色', badge: hProfiles().length > 1 ? `${hProfiles().length}` : '' },
    { v: 'memory', label: '记忆', badge: memEntries ? `${memEntries}` : '' },
    { v: 'providers', label: '提供商', badge: `${H2.providers.length}` },
    { v: 'gateways', label: '网关', badge: `${H2.gateways.connections.length}` },
    { v: 'channels', label: '渠道', badge: (typeof H_CHANNELS !== 'undefined' && H_CHANNELS) ? `${H_CHANNELS.length}` : '16' },
    { v: 'quickEntry', label: '快捷输入', badge: (S.quickEntry && S.quickEntry.enabled) ? 'on' : 'off' },
    { v: 'skills', label: '技能', badge: `${(H2.skills || []).filter(s => s.state !== 'archived').length}` },
    { v: 'cron', label: '定时任务', badge: `${(H2.cronJobs || []).filter(j => j.enabled).length}/${(H2.cronJobs || []).length}` },
    { v: 'tools', label: '工具', badge: (H2.toolsTab || 'disclose') === 'disclose' ? '披露' : '后端' },
    { v: 'delegates', label: '子代理', badge: `${(H2.delegates || []).filter(d => d.status === 'running').length || ''}` },
  ];
  host.innerHTML = rows.map(r => `<div class="plan-row${hermesView === r.v ? ' is-on' : ''}" data-hv="${r.v}">
      <span class="plan-dot" style="background:#3B82F6"></span><span class="pname">${r.label}</span>
      ${r.badge ? `<span class="sc" style="margin-left:auto;font-size:10.5px;color:var(--ink3,#8A8F96)">${r.badge}</span>` : ''}
    </div>`).join('');
  host.querySelectorAll('[data-hv]').forEach(el => el.onclick = () => setHermesView(el.dataset.hv));
  const sect = $('#btnHermesSect');
  if (sect) sect.classList.toggle('closed', !hermesView);
}
function renderHermes() {
  const pane = $('#hermesPane');
  if (!pane) return;
  renderHermesNav();
  const v = (hState().view = hermesView);
  if (v === 'rooms') hermesRoomsHTML(pane);
  else if (v === 'kanban') hermesKanbanHTML(pane);
  else if (v === 'archived') hermesArchivedHTML(pane);
  else if (v === 'profiles') hermesProfilesHTML(pane);
  else if (v === 'memory') hermesMemoryHTML(pane);
  else if (v === 'providers') hermesProvidersHTML(pane);
  else if (v === 'gateways') hermesGatewaysHTML(pane);
  else if (v === 'channels') hermesChannelsHTML(pane);
  else if (v === 'quickEntry') hermesQuickEntryHTML(pane);
  else if (v === 'skills') hermesSkillsHTML(pane);
  else if (v === 'cron') hermesCronHTML(pane);
  else if (v === 'tools') hermesToolsHTML(pane);
  else if (v === 'delegates') hermesDelegatesHTML(pane);
  else pane.innerHTML = '';
}
/// 顶部条（三个页面共用）：标题 + 返回
function hBar(title, sub, actions) {
  return `<div class="hbar"><span class="htitle">${escapeHtml(title)}</span>
    <span class="hsub">${escapeHtml(sub || '')}</span><span class="spacer"></span>
    ${actions || ''}
    <button class="hbtn ghost" data-hact="exit" title="回到工作区">← 返回工作区</button></div>`;
}
function hBindCommon(root) {
  const ex = root.querySelector('[data-hact="exit"]');
  if (ex) ex.onclick = () => setHermesView(null);
}

/// 通用弹层（新建房间 / 新建任务）—— 原型里已有的 askModal 只吃单个输入，这里要多字段
function hOpenModal({ title, sub, body, okText, onOk }) {
  let m = document.getElementById('hModal');
  if (!m) {
    m = document.createElement('div');
    m.className = 'hmodal'; m.id = 'hModal'; m.hidden = true;
    document.body.appendChild(m);
    m.addEventListener('mousedown', e => { if (e.target === m) m.hidden = true; });
  }
  m.innerHTML = `<div class="card"><h3>${escapeHtml(title)}</h3>
    ${sub ? `<div class="sub">${sub}</div>` : ''}${body}
    <div class="foot"><button class="hbtn ghost" data-hm="cancel">取消</button>
      <button class="hbtn primary" data-hm="ok">${escapeHtml(okText || '确定')}</button></div></div>`;
  m.hidden = false;
  m.querySelector('[data-hm="cancel"]').onclick = () => { m.hidden = true; };
  m.querySelector('[data-hm="ok"]').onclick = () => { if (onOk && onOk(m) !== false) m.hidden = true; };
  const first = m.querySelector('input,textarea,select');
  if (first) setTimeout(() => first.focus(), 30);
  return m;
}

/* ── §44.1 群聊页（§2 hosted room） ── */
function hermesRoomsHTML(pane) {
  const H0 = hState();
  const rooms = H0.rooms;
  if (!H0.activeRoom && rooms.length) H0.activeRoom = rooms[0].id;
  const room = rooms.find(r => r.id === H0.activeRoom) || null;

  const left = `<div class="hcol" style="width:230px;flex:0 0 230px">
      <div class="hcol-head">房间<span style="margin-left:auto"></span>
        <button class="hbtn primary" data-hact="new-room">＋ 新建群聊</button></div>
      <div class="hcol-body">${rooms.length ? rooms.map(r => `
        <div class="hitem${r.id === H0.activeRoom ? ' is-on' : ''}" data-room="${r.id}">
          <span class="dot" style="background:${r.disbanded_at ? '#6B7280' : '#22C55E'}"></span>
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.name)}</span>
          <span class="sub">${r.members.length}人 · ${r.events.length}ev</span>
        </div>`).join('') : '<div class="hempty">还没有房间。<br>点右上「＋ 新建群聊」创建（2~6 个成员）。</div>'}
      </div></div>`;

  let mid, right;
  if (!room) {
    mid = `<div class="hcol" style="flex:1"><div class="hempty">先创建一个房间，把几个 Bot 放进去讨论。</div></div>`;
    right = `<div class="hcol" style="width:250px;flex:0 0 250px"><div class="hcol-head">成员</div>
      <div class="hempty">—</div></div>`;
  } else {
    const plans = hPlanNextTask(room.id);
    const log = room.events.slice(-60).map(e => hEventHTML(e, room)).join('');
    mid = `<div class="hcol" style="flex:1">
      <div class="hcol-head">${escapeHtml(room.name)}
        <span class="hsub" style="margin-left:8px">rev ${room.rev} · epoch ${room.authority_epoch} · 权威 ${escapeHtml(room.authority_gateway_id)}</span>
        <span style="margin-left:auto"></span>
        <button class="hbtn" data-hact="peek" title="查看下一轮要发给成员的完整 prompt（含 [memory-frozen] 注入）">🔍 prompt</button>
        <button class="hbtn" data-hact="run-turn" title="${escapeHtml(plans.status)}">▶ 跑一轮</button>
        <button class="hbtn" data-hact="run-all">⏩ 跑到结束</button>
        <button class="hbtn danger" data-hact="disband">解散</button>
      </div>
      <div class="hcol-body" id="hLog" style="padding:0"><div class="hlog">${log || '<div class="hempty">日志为空 —— 发一条消息开始讨论。</div>'}</div></div>
      <div class="hcomposer">
        <input id="hSend" placeholder="发一条消息（可用 @handle 点名，@all 或不点名 = 全员）" spellcheck="false">
        <button class="hbtn primary" data-hact="send">发送</button>
      </div>
      <div class="hcheck ${plans.status === 'task' ? 'ok' : plans.status === 'idle' ? '' : 'err'}">
        plan_next_task → <b>${plans.status}</b>（${plans.reason}）
        ${plans.status === 'task' ? `　下一位：<b>@${escapeHtml(plans.member.handle)}</b>（${escapeHtml(plans.member.display_name)}）· 第 ${plans.roundIndex + 1} 轮`
          : ''}
        <span style="float:right">上限 ${H_MAX_ROUNDS} 轮 × ${H_MAX_MSGS} 条</span>
      </div></div>`;

    right = `<div class="hcol" style="width:250px;flex:0 0 250px">
      <div class="hcol-head">成员 <span class="hsub">（${room.members.length}/${H_MAX_DISC}）</span>
        <span style="margin-left:auto"></span><button class="hbtn" data-hact="edit-members">编辑</button></div>
      <div class="hcol-body">
        ${room.members.map((m, i) => `<div class="hitem" style="cursor:default">
            <span class="hchip on">@${escapeHtml(m.handle)}</span>
            <span style="min-width:0;overflow:hidden">${escapeHtml(hProfileName(m.profile))}</span>
            <button class="hbtn ghost sm" data-hrm="${i}" title="移出" style="margin-left:auto">×</button>
          </div>`).join('') || '<div class="hempty">无成员</div>'}
        <div class="hsec">房间属性</div>
        <div class="hnote">成员上限 ${H_MAX_MEMBERS} · 活跃房间上限 ${H_MAX_ROOMS}<br>
        群会话按人分开（group_sessions_per_user=${H0.cfg.groupSessionsPerUser}）</div>
      </div></div>`;
  }

  pane.innerHTML = hBar('群聊 · 多 Bot 讨论房间',
    'hosted room：事件日志 + 2~6 成员 + plan_next_task 决策机（Hermes §2）',
    `<button class="hbtn" data-hact="new-room">＋ 新建群聊</button>`)
    + `<div class="hbody">${left}${mid}${right}</div>`;
  hBindCommon(pane);
  pane.querySelectorAll('[data-room]').forEach(el => el.onclick = () => { H0.activeRoom = el.dataset.room; hSave(); renderHermes(); });
  pane.querySelectorAll('[data-hrm]').forEach(b => b.onclick = () => {
    const i = +b.dataset.hrm;
    const ms = room.members.slice(); ms.splice(i, 1);
    const res = hSetRoomMembers(room.id, ms);
    if (!res.ok) { toast(`移出失败：${escapeHtml(res.err)}`); return; }
    renderHermes();
  });
  pane.querySelectorAll('[data-hact="new-room"]').forEach(b => b.onclick = () => hNewRoomModal());
  const send = () => { const i = pane.querySelector('#hSend'); if (!i) return;
    const v = i.value; if (!v.trim()) return; hRoomSend(room.id, v); i.value = ''; renderHermes();
    const lg = pane.querySelector('#hLog'); if (lg) lg.scrollTop = lg.scrollHeight; };
  const sendBtn = pane.querySelector('[data-hact="send"]');
  if (sendBtn) sendBtn.onclick = send;
  const input = pane.querySelector('#hSend');
  if (input) input.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') send(); };
  const pk = pane.querySelector('[data-hact="peek"]');
  if (pk) pk.onclick = () => {
    const p = hPlanNextTask(room.id);
    if (p.status !== 'task') return toast(`当前没有待发的轮次：${p.status}（${p.reason}）`);
    hOpenModal({ title: '下一轮 prompt（原样）',
      sub: '含 [control] / [transcript-delta] / [memory-frozen] / [your-turn] 四段 —— 记忆注入用的是**冻结快照**',
      body: `<div class="hfiles" style="max-height:52vh">${escapeHtml(p.prompt)}</div>`,
      okText: '关闭', onOk: () => true });
  };
  const rt = pane.querySelector('[data-hact="run-turn"]');
  if (rt) rt.onclick = () => {
    const p = hRunNextTurn(room.id);
    renderHermes();
    if (p.status === 'task') toast(`@${escapeHtml(p.member.handle)} 领取了一轮（${p.status}/${p.reason}）`);
    else toast(`讨论结束：${p.status}（${p.reason}）`);
  };
  const ra = pane.querySelector('[data-hact="run-all"]');
  if (ra) ra.onclick = () => {
    // 每次 hRunNextTurn = 真跑了一位成员的一轮；用 plan 先探再跑，计数才是"跑了几个"
    let n = 0, last = hPlanNextTask(room.id);
    while (last.status === 'task' && n < H_MAX_ROUNDS * H_MAX_DISC) {
      last = hRunNextTurn(room.id);
      n++;
    }
    renderHermes();
    toast(n ? `${n} 位成员依次领完了各自的轮次 → ${last.status}（${last.reason}）` : `没有可跑的轮次 → ${last.status}`);
  };
  const db = pane.querySelector('[data-hact="disband"]');
  if (db) db.onclick = () => hOpenModal({ title: '解散房间', sub: '解散后房间进入 disbanded（事件日志保留）。',
    okText: '解散', onOk: () => { hDisbandRoom(room.id); renderHermes(); toast('房间已解散'); } });
  pane.querySelectorAll('[data-hact="edit-members"]').forEach(b => b.onclick = () => hMembersModal(room));
  const lg = pane.querySelector('#hLog'); if (lg) lg.scrollTop = lg.scrollHeight;
}
function hEventHTML(e, room) {
  const ctrl = !['message.user', 'message.member'].includes(e.kind);
  if (ctrl) {
    const label = { 'room.created': '房间创建', 'room.members_changed': '成员变更', 'room.renamed': '改名',
      'room.disbanded': '房间解散', 'turn.settled': '讨论结束', 'room.stop_requested': '停止请求',
      'authority.claimed': '权威接管', 'authority.lost': '权威丢失' }[e.kind] || e.kind;
    return `<div class="hev ctrl">${label} · ${escapeHtml(e.event_id)}<div class="meta">seq ${e.seq} · ${new Date(e.created_at).toLocaleTimeString()}${e.payload.status ? ` · ${e.payload.status}(${e.payload.reason || ''})` : ''}</div></div>`;
  }
  if (e.kind === 'message.user') {
    return `<div class="hev"><span class="who user">用户</span>：${escapeHtml(e.payload.text || '')}
      <div class="meta">${escapeHtml(e.event_id)} · seq ${e.seq} · thread ${escapeHtml((e.payload.thread_id || '').slice(0, 14))}…</div></div>`;
  }
  const m = room.members.find(x => x.handle === e.payload.handle) || {};
  return `<div class="hev"><span class="who">${escapeHtml(hProfileName(m.profile))}</span>
    <span class="hsub">@${escapeHtml(e.payload.handle || '')}</span>
    <span class="round">R${(e.payload.round_index ?? 0) + 1}</span>：${escapeHtml(e.payload.text || '')}
    <div class="meta">${escapeHtml(e.event_id)} · seq ${e.seq} · ${e.payload.task_id ? 'task ' + e.payload.task_id : ''}</div></div>`;
}
function hNewRoomModal() {
  const H0 = hState();
  const picks = new Set(H0.profiles.slice(0, H_MIN_DISC).map(p => p.id));
  const body = `<div class="hform">
    <label>房间名称<input id="hName" value="需求讨论 ${H0.rooms.length + 1}"></label>
    <label>成员（勾选 2~6 个角色；handle 唯一、@all/@everyone 保留）
      <div class="hchips" id="hPicks">${H0.profiles.map(p => `<span class="hchip${picks.has(p.id) ? ' on' : ''}"
        data-pid="${p.id}">${escapeHtml(p.name)}</span>`).join('')}</div></label>
    <div id="hRosterMsg" class="hcheck ok"></div></div>`;
  const m = hOpenModal({ title: '新建群聊（hosted room）',
    sub: '对应 Hermes <code>groups.create</code> → <code>validate_roster(2~6)</code> → <code>create_room</code>（幂等）',
    body, okText: '创建',
    onOk: root => {
      const name = root.querySelector('#hName').value.trim() || '未命名群聊';
      const members = [...root.querySelectorAll('.hchip[data-pid].on')].map(el => {
        const p = hProfile(el.dataset.pid);
        return { profile: p.id, handle: p.handle };
      });
      const res = hCreateRoom({ name, members });
      if (!res.ok) { root.querySelector('#hRosterMsg').className = 'hcheck err'; root.querySelector('#hRosterMsg').textContent = res.err; return false; }
      renderHermes(); toast(`已创建房间「${escapeHtml(name)}」`);
      return true;
    } });
  const sync = () => {
    const n = m.querySelectorAll('.hchip[data-pid].on').length;
    const msg = m.querySelector('#hRosterMsg');
    const ok = n >= H_MIN_DISC && n <= H_MAX_DISC;
    msg.className = 'hcheck ' + (ok ? 'ok' : 'err');
    msg.textContent = ok ? `✓ ${n} 个成员（${H_MIN_DISC}~${H_MAX_DISC} 通过）` : `成员数 ${n} —— 必须 ${H_MIN_DISC}~${H_MAX_DISC} 个`;
    m.querySelector('[data-hm="ok"]').disabled = !ok;
  };
  m.querySelectorAll('.hchip[data-pid]').forEach(el => el.onclick = () => { el.classList.toggle('on'); sync(); });
  sync();
}
function hMembersModal(room) {
  const H0 = hState();
  const picks = new Set(room.members.map(m => m.profile));
  const body = `<div class="hform">
    <label>成员（2~6）<div class="hchips">${H0.profiles.map(p => `<span class="hchip${picks.has(p.id) ? ' on' : ''}"
      data-pid="${p.id}">${escapeHtml(p.name)} · @${escapeHtml(p.handle)}</span>`).join('')}</div></label>
    <div id="hRosterMsg" class="hcheck"></div></div>`;
  const m = hOpenModal({ title: 'Manage members', sub: '对应 <code>group-chat-view-members.tsx:49 commitGroupChatRoster</code>（改清单 + 抬 revision）',
    body, okText: '保存成员',
    onOk: root => {
      const members = [...root.querySelectorAll('.hchip[data-pid].on')].map(el => {
        const p = hProfile(el.dataset.pid);
        const old = room.members.find(x => x.profile === p.id);
        return { profile: p.id, handle: old ? old.handle : p.handle };
      });
      const res = hSetRoomMembers(room.id, members);
      if (!res.ok) { const el = root.querySelector('#hRosterMsg'); el.className = 'hcheck err'; el.textContent = res.err; return false; }
      renderHermes(); toast('成员已更新（room.members_changed 已入日志）');
      return true;
    } });
  const sync = () => {
    const n = m.querySelectorAll('.hchip[data-pid].on').length;
    const msg = m.querySelector('#hRosterMsg');
    const ok = n >= H_MIN_DISC && n <= H_MAX_DISC;
    msg.className = 'hcheck ' + (ok ? 'ok' : 'err');
    msg.textContent = ok ? `✓ ${n} 个成员` : `成员数 ${n} —— 必须 ${H_MIN_DISC}~${H_MAX_DISC}`;
    m.querySelector('[data-hm="ok"]').disabled = !ok;
  };
  m.querySelectorAll('.hchip[data-pid]').forEach(el => el.onclick = () => { el.classList.toggle('on'); sync(); });
  sync();
}

/* ── §44.2 任务看板页（§3：泳道 + 认领 + dispatcher + 详情） ── */
function hermesKanbanHTML(pane) {
  const H0 = hState();
  const active = hTask(H0.activeTask);
  const lanes = H_STATUSES.filter(s => s !== 'archived').map(st => {
    const list = H0.tasks.filter(t => t.status === st);
    return `<div class="hlane"><div class="hlane-head">
        <span class="hst" style="background:${hStatusColor(st)}"></span>${H_STATUS_ZH[st]}
        <span class="cnt">${list.length}</span></div>
      <div class="hlane-body" data-lane="${st}">
        ${list.map(t => hTaskCard(t, H0.activeTask)).join('') || '<div class="hempty" style="padding:10px">—</div>'}
      </div></div>`;
  }).join('');
  const archived = H0.tasks.filter(t => t.status === 'archived');
  const autoOn = H0.cfg.dispatchInterval > 0;
  pane.innerHTML = hBar('任务看板（插件）',
    `kanban_db 7 表 → JSON · 状态机 9 态 · dispatcher 每 ${H0.cfg.dispatchInterval}s · 熔断 failure_limit=${H0.cfg.failureLimit}`,
    `<button class="hbtn primary" data-hact="new-task">＋ 新建任务</button>
     <button class="hbtn" data-hact="dispatch">立即分发</button>
     <button class="hbtn${autoOn ? ' primary' : ''}" data-hact="toggle-auto" title="模拟 dispatcher 常驻循环">${autoOn ? '⏸ 关自动分发' : '▶ 开自动分发'}</button>`)
    + `<div class="hbody"><div style="flex:1;min-width:0;display:flex;overflow:hidden">
        <div style="flex:1;min-width:0;overflow:auto"><div class="hboard">${lanes}</div>
          ${archived.length ? `<div style="padding:0 12px 14px"><div class="hsec">已归档 ${archived.length}</div>
            <div class="hrow">${archived.map(t => `<span class="hchip" data-open="${t.id}">${escapeHtml(t.title.slice(0, 18))}</span>`).join('')}</div></div>` : ''}
        </div>
        ${active ? hTaskDetail(active) : ''}
      </div></div>`;
  hBindCommon(pane);
  pane.querySelectorAll('[data-hact="new-task"]').forEach(b => b.onclick = () => hNewTaskModal());
  pane.querySelectorAll('[data-hact="dispatch"]').forEach(b => b.onclick = () => {
    const n = hDispatchTick(); toast(n ? `分发：认领了 ${n} 个 ready 任务（模拟 worker）` : '没有可认领的 ready 任务');
  });
  pane.querySelector('[data-hact="toggle-auto"]').onclick = () => {
    H0.cfg.dispatchInterval = autoOn ? 0 : H_DISPATCH_INTERVAL; hSave(); renderHermes();
    toast(autoOn ? '自动分发已关（只手动分发）' : `自动分发已开：每 ${H_DISPATCH_INTERVAL}s 一次`);
  };
  pane.querySelectorAll('.htask').forEach(el => el.onclick = () => { H0.activeTask = el.dataset.t; hSave(); renderHermes(); });
  pane.querySelectorAll('[data-open]').forEach(el => el.onclick = () => { H0.activeTask = el.dataset.open; hSave(); renderHermes(); });
  if (active) hBindTaskDetail(pane, active);
}
function hStatusColor(st) {
  return { triage: '#A78BFA', todo: '#60A5FA', scheduled: '#38BDF8', ready: '#34D399', running: '#22C55E',
    blocked: '#F87171', review: '#FBBF24', done: '#4ADE80', archived: '#6B7280' }[st] || '#6B7280';
}
function hTaskCard(t, activeId) {
  const fails = t.consecutive_failures >= hState().cfg.failureLimit;
  return `<div class="htask${t.id === activeId ? ' is-on' : ''}" data-t="${t.id}">
    <div class="t">${escapeHtml(t.title)}</div>
    <div class="m">
      <span class="tag">${escapeHtml(t.priority)}</span>
      <span class="tag">${escapeHtml(hProfileName(t.assignee))}</span>
      ${t.status === 'running' ? '<span class="tag run">运行中</span>' : ''}
      ${fails ? `<span class="tag fail">连败 ${t.consecutive_failures}</span>` : ''}
      ${t.project_id ? `<span class="tag">${escapeHtml((projById(t.project_id) || {}).name || '项目')}</span>` : ''}
    </div></div>`;
}
function projById(id) { return (S.projects || []).find(p => p && p.id === id) || null; }
function hTaskDetail(t) {
  const H0 = hState();
  const comments = hTaskComments(t.id);
  const events = hTaskEvents(t.id).slice(-20);
  const runs = H0.taskRuns.filter(r => r.task_id === t.id);
  const links = H0.taskLinks.filter(l => l.parent_id === t.id || l.child_id === t.id);
  const cur = runs[runs.length - 1];
  return `<div class="hdetail">
    <h4>${escapeHtml(t.title)}</h4>
    <div class="hkv"><span class="k">id</span><span class="v">${escapeHtml(t.id)}</span></div>
    <div class="hkv"><span class="k">状态</span><span class="v"><span class="hst" style="display:inline-block;background:${hStatusColor(t.status)}"></span> ${H_STATUS_ZH[t.status]}（${t.status}）</span></div>
    <div class="hkv"><span class="k">负责人</span><span class="v">${escapeHtml(hProfileName(t.assignee))}</span></div>
    <div class="hkv"><span class="k">优先级</span><span class="v">${escapeHtml(t.priority)}</span></div>
    <div class="hkv"><span class="k">连败</span><span class="v">${t.consecutive_failures} / ${H0.cfg.failureLimit}</span></div>
    <div class="hkv"><span class="k">创建</span><span class="v">${new Date(t.created_at).toLocaleString()}</span></div>
    ${cur ? `<div class="hkv"><span class="k">本次 run</span><span class="v">${escapeHtml(cur.status)} · 进度 ${cur.progress || 0}%${cur.outcome ? ' · ' + cur.outcome : ''}${cur.simulated ? '（模拟 worker）' : ''}</span></div>` : ''}
    ${t.result ? `<div class="hkv"><span class="k">结果</span><span class="v">${escapeHtml(t.result)}</span></div>` : ''}
    <div class="hsec">正文</div>
    <div class="hnote">${escapeHtml(t.body || '（空）')}</div>
    <div class="hsec">操作</div>
    <div class="hrow">
      <select class="hbtn" data-act="status" style="padding:5px 8px">
        ${H_STATUSES.map(s => `<option value="${s}"${s === t.status ? ' selected' : ''}>${H_STATUS_ZH[s]} (${s})</option>`).join('')}
      </select>
      <button class="hbtn primary" data-act="claim" ${t.status === 'ready' ? '' : 'disabled'}>认领（CAS ready→running）</button>
      <button class="hbtn" data-act="ready">置为可认领</button>
      <button class="hbtn" data-act="failnext" title="让当前/下次 run 失败，用来演示熔断">下次失败</button>
      <button class="hbtn" data-act="archive">归档</button>
      ${t.project_id ? `<button class="hbtn ghost" data-act="openproj">打开所在项目</button>` : ''}
    </div>
    <div class="hsec">依赖链（task_links）</div>
    <div class="hnote">${links.length ? links.map(l => `${l.parent_id === t.id ? '→ 子 ' : '← 父 '}${escapeHtml((hTask(l.parent_id === t.id ? l.child_id : l.parent_id) || {}).title || '')}`).join('<br>') : '（无）'}</div>
    <div class="hsec">评论（${comments.length}）</div>
    <div class="hlog-list">${comments.map(c => `<div class="hev"><span class="who">${escapeHtml(c.author)}</span>：${escapeHtml(c.body)}
      <div class="meta">${new Date(c.created_at).toLocaleString()}</div></div>`).join('') || '<div class="hnote">（无）</div>'}</div>
    <div class="hrow" style="margin-top:8px">
      <input id="hCmt" placeholder="加一条评论…" style="flex:1;background:#101418;border:1px solid #2A2E33;border-radius:8px;color:#EDEEF0;padding:7px 9px;outline:none">
      <button class="hbtn" data-act="comment">发送</button>
    </div>
    <div class="hsec">事件（task_events，最后 ${events.length} 条）</div>
    <div class="hlog-list">${events.slice().reverse().map(e => `<div class="hev ctrl">${escapeHtml(e.kind)}
      <div class="meta">${escapeHtml(JSON.stringify(e.payload).slice(0, 110))} · ${new Date(e.created_at).toLocaleTimeString()}</div></div>`).join('') || '<div class="hnote">（无）</div>'}</div>
    ${cur ? '' : ''}
  </div>`;
}
function hBindTaskDetail(pane, t) {
  const sel = pane.querySelector('[data-act="status"]');
  if (sel) sel.onchange = () => { hSetTaskStatus(t.id, sel.value); renderHermes(); };
  const act = name => pane.querySelector(`[data-act="${name}"]`);
  if (act('claim')) act('claim').onclick = () => {
    const r = hClaimTask(t.id);
    toast(r.ok ? '已认领（模拟 worker 开跑）' : `认领失败：${escapeHtml(r.err)}`);
    renderHermes();
  };
  if (act('ready')) act('ready').onclick = () => { hSetTaskStatus(t.id, 'ready'); hAddTaskEvent(t.id, 'status.changed', { to: 'ready', by: 'user' }); hSave(); renderHermes(); };
  if (act('failnext')) act('failnext').onclick = () => {
    const run = hState().taskRuns.filter(r => r.task_id === t.id && r.status === 'running').pop();
    if (run) run.failNext = true; else t._failNext = true;
    hSave(); toast('已标记：这次 run 会失败（用来演示 failure_limit 熔断）');
    if (!run) { hSetTaskStatus(t.id, 'ready'); renderHermes(); }
  };
  if (act('archive')) act('archive').onclick = () => { hSetTaskStatus(t.id, 'archived'); renderHermes(); };
  if (act('openproj')) act('openproj').onclick = () => { const p = projById(t.project_id); if (p) { setHermesView(null); selectProject(p.id); } };
  if (act('comment')) act('comment').onclick = () => {
    const i = pane.querySelector('#hCmt'); if (!i || !i.value.trim()) return;
    hAddTaskComment(t.id, '用户', i.value.trim()); renderHermes();
  };
  const ci = pane.querySelector('#hCmt');
  if (ci) ci.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') act('comment').click(); };
}
function hNewTaskModal() {
  const H0 = hState();
  const cur = proj();
  const body = `<div class="hform">
    <label>标题<input id="htTitle" placeholder="要做的事"></label>
    <label>正文<textarea id="htBody" rows="3" placeholder="验收判据 / 边界…"></textarea></label>
    <label>负责人（profile）
      <select id="htAssignee">${H0.profiles.map(p => `<option value="${p.id}"${p.id === (typeof hCurProfileId === 'function' && hCurProfileId() ? hCurProfileId() : H0.cfg.defaultAssignee) ? ' selected' : ''}>${escapeHtml(p.name)} · ${escapeHtml(p.model)}</option>`).join('')}</select></label>
    <label>优先级
      <select id="htPri">${['P0', 'P1', 'P2', 'P3'].map(p => `<option${p === 'P2' ? ' selected' : ''}>${p}</option>`).join('')}</select></label>
    <label>关联项目
      <select id="htProj"><option value="">（不关联）</option>${(S.projects || []).filter(p => p && !p.isDefault)
        .map(p => `<option value="${p.id}"${cur && p.id === cur.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></label>
    <div class="hnote">新建后落 <b>triage → todo</b>；置为「可认领」后 dispatcher 才会认领（CAS）。</div></div>`;
  hOpenModal({ title: '新建任务', sub: '对应 <code>POST /api/plugins/kanban/tasks</code>（plugin_api.py:423）', body, okText: '创建',
    onOk: root => {
      const title = root.querySelector('#htTitle').value.trim();
      if (!title) return false;
      hCreateTask({ title, body: root.querySelector('#htBody').value, assignee: root.querySelector('#htAssignee').value,
        priority: root.querySelector('#htPri').value, projectId: root.querySelector('#htProj').value });
      renderHermes(); toast('任务已创建（triage → todo）');
      return true;
    } });
}

/* ── §44.3 归档会话页（§10 双标记 + pinned 豁免 + 恢复 + 设置） ── */
function hermesArchivedHTML(pane) {
  const H0 = hState();
  const arch = hArchivedConvs();
  const all = [];
  hAllConvPools().forEach(({ scope, pool }) => pool.forEach(c => { if (!c.isGroup && !c.archived) all.push({ conv: c, scope }); }));
  const badge = c => `${c.pinned ? '<span class="hbadge pin">置顶</span>' : ''}`
    + (c.archived ? (c.autoArchived ? '<span class="hbadge auto">自动归档</span>' : '<span class="hbadge human">手动归档</span>') : '')
    + (c.handoff && c.handoff.platform ? `<span class="hbadge" style="background:rgba(10,132,255,.18);color:#BFDBFE">→${escapeHtml(hHandoffLabel(c.handoff.platform))}</span>` : '');
  const row = (it, archivedView) => `<div class="harc">
      <div class="body"><div class="t">${badge(it.conv)}${escapeHtml(it.conv.title || '未命名对话')}</div>
      <div class="d">${it.scope.kind === 'default' ? '默认区' : '项目 · ' + escapeHtml(it.scope.project.name)}
        · ${it.conv.ts ? new Date(it.conv.ts).toLocaleString() : '—'}
        ${it.conv.group ? ' · 分组 ' + escapeHtml(it.conv.group) : ''}</div></div>
      <div class="hrow">
        ${archivedView ? `<button class="hbtn" data-un="${it.conv.id}">恢复</button>` : `<button class="hbtn" data-ar="${it.conv.id}">归档</button>`}
        <button class="hbtn ghost" data-pin="${it.conv.id}" title="${it.conv.pinned ? '取消置顶（置顶豁免自动归档）' : '置顶（豁免自动归档）'}">${it.conv.pinned ? '📌' : '📍'}</button>
      </div></div>`;
  pane.innerHTML = hBar('Archived Chats', '两列软删 archived + autoArchived · pinned 豁免 · 人归与自归不混（Hermes §10）')
    + `<div class="hbody"><div class="hcol" style="flex:1">
        <div class="hcol-head">全局搜索（FTS 形态 · session_search_tool.py:619）
          <span style="margin-left:auto"></span>
          <input id="hGSearch" placeholder="跨会话搜标题与最近消息…" style="width:230px;background:#101418;border:1px solid var(--line,#2A2E33);border-radius:8px;color:var(--ink,#EDEEF0);padding:5px 10px;font-size:12.5px"></div>
        <div id="hGResults" style="display:none"></div>
        <div class="hcol-head">已归档 <span class="hsub">（${arch.length}）</span>
          <span style="margin-left:auto"></span>
          <button class="hbtn" data-hact="scan">立即扫描自动归档</button></div>
        <div class="hcol-body">
          ${arch.length ? arch.map(it => row(it, true)).join('') : '<div class="hempty">没有归档的对话。</div>'}
          <div class="hsec">未归档（${all.length}）—— 可手动归档，归档后从左侧对话列表消失</div>
          ${all.slice(0, 40).map(it => row(it, false)).join('') || '<div class="hempty">（无）</div>'}
        </div></div>
        <div class="hcol" style="width:300px;flex:0 0 300px">
          <div class="hcol-head">自动归档设置</div>
          <div class="hcol-body">
            <div class="hform">
              <button type="button" class="hchk${H0.cfg.autoArchive ? ' is-on' : ''}" id="hAutoArc">sessions.auto_archive（默认 false）</button>
              <label>空闲天数 sessions.auto_archive_days
                <input type="number" id="hAutoDays" min="1" max="90" value="${H0.cfg.autoArchiveDays}"></label>
              <label>分发间隔 dispatch_interval_seconds（0=关）
                <input type="number" id="hDispInt" min="0" max="600" value="${H0.cfg.dispatchInterval}"></label>
              <label>熔断 failure_limit
                <input type="number" id="hFailLim" min="1" max="10" value="${H0.cfg.failureLimit}"></label>
            </div>
            <div class="hnote">归档 ≠ 删除：真删除只有 <code>purge</code>（本页不提供）。<br>
              人归的永远不会被自动扫描撤销；自动归档的恢复时才清 <code>autoArchived</code>。</div>
            <div class="hset-sec" style="margin-left:0">轨迹实验室（batch_runner / trajectory_compressor）</div>
            <div class="hform">
              <label>选会话<select id="tjConv">${all.slice(0, 10).map(it =>
                `<option value="${it.conv.id}"${H0.trajectory && H0.trajectory.convId === it.conv.id ? ' selected' : ''}>${escapeHtml(it.conv.title || '未命名')}</option>`).join('')}
                ${arch.slice(0, 5).map(it =>
                `<option value="${it.conv.id}"${H0.trajectory && H0.trajectory.convId === it.conv.id ? ' selected' : ''}>[归档] ${escapeHtml(it.conv.title || '未命名')}</option>`).join('')}</select></label>
              <div class="hrow">
                <button class="hbtn" data-tjact="gen">生成轨迹</button>
                <button class="hbtn" data-tjact="compress">压缩</button>
              </div>
            </div>
            <div id="tjOut" class="hnote" style="margin-top:6px">${hTrajectoryHTML(H0.trajectory)}</div>
            <div class="hnote" style="margin-top:8px">轨迹 = 会话的步骤回放；压缩把 N 步收成 3 行（首/合并/尾），真 LLM 摘要属引擎期。</div>
          </div></div></div>`;
  hBindCommon(pane);
  // §48 全局会话搜索：title + preview 跨会话匹配，带命中片段与 mock 摘要行
  const gs = pane.querySelector('#hGSearch');
  const gr = pane.querySelector('#hGResults');
  const renderSearch = () => {
    const q = (gs.value || '').trim();
    if (!q) { gr.style.display = 'none'; gr.innerHTML = ''; return; }
    const hits = hGlobalSearch(q);
    gr.style.display = '';
    gr.innerHTML = `<div class="hcol-body">${hits.length
      ? hits.map(h => `<div class="harc"><div class="body">
          <div class="t">${badge(h.conv)}${escapeHtml(h.conv.title || '未命名对话')}</div>
          <div class="d">…${escapeHtml(h.frag)}…</div>
          <div class="d" style="color:#9FD0FF;font-family:var(--mono,monospace);font-size:11px">摘要(mock)：${escapeHtml(h.summary)}</div>
        </div><div class="hrow">${h.conv.archived ? `<button class="hbtn" data-un="${h.conv.id}">恢复</button>` : `<button class="hbtn" data-ar="${h.conv.id}">归档</button>`}</div></div>`).join('')
      : `<div class="hempty">没有命中「${escapeHtml(q)}」的会话。</div>`}<div class="hnote" style="padding:6px 2px">命中 ${hits.length} 条 · 源 = 会话标题 + 最近消息（preview）；摘要行为 mock LLM，真摘要属引擎期。</div></div>`;
    gr.querySelectorAll('[data-ar]').forEach(b => b.onclick = () => { hArchiveConv(b.dataset.ar, { manual: true }); renderHermes(); renderNav(); toast('已归档'); });
    gr.querySelectorAll('[data-un]').forEach(b => b.onclick = () => { hUnarchiveConv(b.dataset.un); renderHermes(); renderNav(); toast('已恢复'); });
  };
  if (gs) { gs.oninput = renderSearch; gs.onkeydown = e => e.stopPropagation(); }
  pane.querySelectorAll('[data-ar]').forEach(b => b.onclick = () => { hArchiveConv(b.dataset.ar, { manual: true }); renderHermes(); renderNav(); toast('已归档（手动：autoArchived=false）'); });
  pane.querySelectorAll('[data-un]').forEach(b => b.onclick = () => { hUnarchiveConv(b.dataset.un); renderHermes(); renderNav(); toast('已恢复'); });
  pane.querySelectorAll('[data-pin]').forEach(b => b.onclick = () => { const f = hFindConv(b.dataset.pin); if (f) { f.conv.pinned = !f.conv.pinned; hSave(); renderHermes(); renderNav(); } });
  const scan = pane.querySelector('[data-hact="scan"]');
  if (scan) scan.onclick = () => { const n = hAutoArchiveScan(); renderHermes(); renderNav(); toast(n ? `自动归档了 ${n} 个` : '没有可自动归档的（开关关着 / 没有超期 / 置顶豁免）'); };
  const bind = (id, key, num) => { const el = pane.querySelector(id); if (!el) return;
    el.onchange = () => { H0.cfg[key] = num ? Math.max(0, parseInt(el.value, 10) || 0) : el.checked; hSave(); renderHermes(); }; };
  const hArc = pane.querySelector('#hAutoArc');
  if (hArc) hArc.onclick = () => {
    const on = !hArc.classList.contains('is-on');
    hArc.classList.toggle('is-on', on);
    H0.cfg.autoArchive = on; hSave();
    toast(on ? '自动归档已开（空闲超期且非置顶才归）' : '自动归档已关');
  };
  bind('#hAutoDays', 'autoArchiveDays', true);
  bind('#hDispInt', 'dispatchInterval', true); bind('#hFailLim', 'failureLimit', true);
  // §49 轨迹实验室
  pane.querySelectorAll('[data-tjact]').forEach(b => b.onclick = () => {
    const sel = pane.querySelector('#tjConv');
    const cid = sel ? sel.value : null;
    if (!cid) { toast('先选一个会话'); return; }
    if (b.dataset.tjact === 'gen') {
      H0.trajectory = hGenTrajectory(cid);
      hSave(); renderHermes();
      toast(`已生成轨迹：${H0.trajectory.steps.length} 步（${escapeHtml(H0.trajectory.title)}）`);
    } else {
      if (!H0.trajectory || H0.trajectory.convId !== cid) { toast('先生成这条会话的轨迹'); return; }
      const before = H0.trajectory.steps.length;
      H0.trajectory.compressed = hCompressTrajectory(H0.trajectory.steps);
      hSave(); renderHermes();
      toast(`压缩：${before} 步 → ${H0.trajectory.compressed.length} 行`);
    }
  });
}

/* ── §44e 接线：退出路径 + 启动 ── */
(function bindHermes() {
  // 「项目 / 默认」两个段头点击 = 回工作区（保留 bind() 里原来的行为）
  ['btnProjSect', 'btnPlanSect'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    const orig = b.onclick;
    b.onclick = e => { if (hermesView) setHermesView(null); if (orig) orig(e); };
  });
  const sect = document.getElementById('btnHermesSect');
  if (sect) sect.onclick = () => {
    if (hermesView) setHermesView(null);
    else setHermesView(hState().view || 'rooms');
  };
  renderHermesNav();
  // 启动时跑一次自动归档扫描（开关默认关，所以默认不动作）
  if (hState().cfg.autoArchive) hAutoArchiveScan();
  // 自动分发常驻 tick（interval=0 = 关）
  setInterval(() => {
    const c = hState().cfg;
    if (!c.dispatchInterval || c.dispatchInterval <= 0) return;
    hDispatchTick();
  }, 15000);
  // §48 cron 假 timer：每 15s 检查到期任务（真调度与真投递属 Swift 期）
  setInterval(() => {
    const H0 = hState2();
    if (!Array.isArray(H0.cronJobs)) return;
    let fired = 0;
    H0.cronJobs.forEach(j => {
      if (!j.enabled || !j.nextRun || j.nextRun > Date.now()) return;
      j.runs++; j.lastRun = Date.now();
      j.nextRun = hcScheduleNext(j.schedule);
      fired++;
    });
    if (fired) {
      hSave();
      if (typeof hermesView !== 'undefined' && hermesView === 'cron') renderHermes();
      toast(`⏰ 定时任务到期触发 ${fired} 个（假 timer · 每 15s 检查）`);
    }
  }, 15000);
})();


/* ══ §45 Hermes 第二批：角色(Profiles §7) · 记忆(Memory §8) · 提供商(Providers §9) · 网关(Gateways §5.3) ══
   四页全是"纯数据/纯逻辑"（DISSECT §13 A 批），字段照各自 schema，切换只改状态不发真请求。 */

/* ── 状态回填（挂在 hState() 后面，避免改坏第一批的初始化顺序） ── */
function hState2() {
  const H0 = hState();
  if (H0.activeProfile === undefined) H0.activeProfile = (H0.profiles[0] || {}).id || null;
  if (H0.viewProfile === undefined) H0.viewProfile = H0.activeProfile;   // 正在查看的角色（≠当前角色）
  if (!H0.memory || typeof H0.memory !== 'object') H0.memory = {};
  if (!H0.memorySnapshots || typeof H0.memorySnapshots !== 'object') H0.memorySnapshots = {};
  if (!H0.memoryCfg || typeof H0.memoryCfg !== 'object') {
    // cli-config.yaml.example:1003-1016 逐键默认
    H0.memoryCfg = { enabled: true, userEnabled: true, memoryLimit: 2200, userLimit: 1375, nudge: 10 };
  }
  if (H0.memoryCfg.provider === undefined) H0.memoryCfg.provider = 'builtin';   // §47 记忆提供方（真图下拉）
  if (H0.provTab === undefined) H0.provTab = 'keys';                             // §47 提供方子导航：keys/endpoints/local
  if (!Array.isArray(H0.localModels)) {
    // §47 本地模型（照真图「提供方 › 本地模型」的模式；网络 mock）
    H0.localModels = [
      { name: 'Ollama', url: 'http://localhost:11434', up: true, models: ['qwen3:8b', 'llama3.2:3b'] },
      { name: 'llama.cpp', url: 'http://127.0.0.1:8080', up: false, models: [] },
    ];
  }
  // ── §48 技能闭环（curator 语义：状态 active/review/archived + 使用计数 + 最后使用时间）──
  if (!Array.isArray(H0.skills)) {
    const DAY = 86400000, now0 = Date.now();
    H0.skills = [
      { id: 'sk-fig', name: 'figure-write', description: '画图技能：描述 → .geom → 校验 → SVG 落盘', body: '按 Geometry-DSL 的语法把用户的描述编译成分层几何定义，校验失败让模型修，最多 3 轮。', usage: 12, lastUsedAt: now0 - 2 * DAY, state: 'active', source: 'local' },
      { id: 'sk-exec', name: 'shell-exec', description: '执行技能：argv 数组直跑，不经 shell', body: '工具目录挑一条，{参数} 占位符逐项替换后交 Process.arguments；模型给的参数带分号/管道也不会变成命令。', usage: 8, lastUsedAt: now0 - 5 * DAY, state: 'active', source: 'local' },
      { id: 'sk-text', name: 'text-polish', description: '文本润色：转写 → 风格提示词 → 成稿', body: '勾选中的风格提示词 + 转写原文（+ 可选截图）拼一次请求，失败就用原文。', usage: 5, lastUsedAt: now0 - 20 * DAY, state: 'active', source: 'local' },
      { id: 'sk-stale', name: 'legacy-import', description: '旧数据导入（已很久没用）', body: '一次性迁移脚本，早期版本用。', usage: 1, lastUsedAt: now0 - 120 * DAY, state: 'active', source: 'local' },
      { id: 'sk-node', name: 'nameless-skill', description: '', body: '缺 description 的坏样例——体检会抓它。', usage: 0, lastUsedAt: now0 - 40 * DAY, state: 'active', source: 'local' },
    ];
  }
  // ── §48 Cron 定时任务（cron/jobs.py:1800 create_job 字段形状；执行为假 timer）──
  if (!Array.isArray(H0.cronJobs)) {
    const t0 = Date.now();
    H0.cronJobs = [
      { id: 'cj-1', name: '技能策展巡检', schedule: 'every 4h', target: '当前会话', enabled: true, nextRun: t0 + 4 * 3600e3, lastRun: 0, runs: 3 },
      { id: 'cj-2', name: '每日中午复盘', schedule: '0 12 * * *', target: '渠道 · 飞书（mock）', enabled: true, nextRun: (() => { const d = new Date(t0); d.setHours(12, 0, 0, 0); if (d.getTime() <= t0) d.setDate(d.getDate() + 1); return d.getTime(); })(), lastRun: t0 - 12 * 3600e3, runs: 17 },
    ];
  }
  if (H0.cronJobs.some(j => j.nextRun === undefined)) H0.cronJobs.forEach(j => { if (j.nextRun === undefined) j.nextRun = Date.now() + 3600e3; });
  // ── §49 工具披露 / 终端后端 / 子代理 ──
  if (H0.toolsTab === undefined) H0.toolsTab = 'disclose';                  // disclose | terminal | stream
  if (H0.toolDisclosure === undefined) H0.toolDisclosure = 'full';          // full | progressive（tool_search 三桥）
  if (H0.termBackend === undefined) H0.termBackend = 'local';
  if (!Array.isArray(H0.delegates)) H0.delegates = [];
  if (H0.trajectory === undefined) H0.trajectory = null;
  if (H0.handoffs === undefined || typeof H0.handoffs !== 'object') H0.handoffs = {};
  if (!Array.isArray(H0.providers) || !H0.providers.length) H0.providers = hDefaultProviders();
  if (!H0.modelCfg || typeof H0.modelCfg !== 'object') {
    // §9.3：persist_switch_by_default 默认 false（不持久化）
    H0.modelCfg = { provider: 'bailian', model: 'qwen3-vl-plus', persist: false };
  }
  if (!H0.gateways || typeof H0.gateways !== 'object') H0.gateways = hDefaultGateways();
  hProfiles().forEach(p => {
    if (p.display_name === undefined) p.display_name = p.name;
    if (p.description === undefined) p.description = '';
    if (p.descAuto === undefined) p.descAuto = false;
    if (!Array.isArray(p.previousNames)) p.previousNames = [];
    if (p.soul === undefined) p.soul = p.persona || '';
    if (!p.uiMeta || typeof p.uiMeta !== 'object') p.uiMeta = { title: p.name, avatar: '', section: 'Agents', hidden: false };
  });
  return H0;
}
const hCurProfile = () => { const H0 = hState2(); return hProfile(H0.activeProfile) || hProfiles()[0] || null; };
const hCurProfileId = () => { const p = hCurProfile(); return p ? p.id : null; };
/// 顶栏的「当前角色」徽标（群聊/看板/记忆页共用 —— 这就是"主页面可选角色"的可见面）
function hCurChip() {
  const p = hCurProfile();
  if (!p) return '';
  return `<span class="hchip on" title="当前角色（在「角色」页切换）">🎭 ${escapeHtml(p.display_name || p.name)} · ${escapeHtml(p.provider)}/${escapeHtml(p.model)}</span>`;
}
const H_PROVIDER_COLORS = { bailian: '#FF6A00', deepseek: '#4D6BFE', openrouter: '#6467F2',
  anthropic: '#D97757', openai: '#10A37F', gemini: '#4285F4', xiaomi: '#FF6900',
  kimi: '#1F6FEB', minimax: '#7C3AED', zai: '#2563EB', ollama: '#9CA3AF', custom: '#6B7280' };
function hDefaultProviders() {
  const mk = (name, display, mode, auth, base, vision, models, desc) =>
    ({ name, display_name: display, api_mode: mode, auth_type: auth, base_url: base,
       supports_vision: !!vision, models, aliases: [], description: desc });
  return [
    mk('bailian', '阿里云百炼 DashScope', 'chat_completions', 'api_key', 'https://dashscope.aliyuncs.com/compatible-mode/v1', true,
      ['qwen3-vl-plus', 'qwen-plus', 'qwen-audio-3.1-tts-flash'], '国内直连；本项目默认 🧠 用它'),
    mk('deepseek', 'DeepSeek', 'chat_completions', 'api_key', 'https://api.deepseek.com', false,
      ['deepseek-chat', 'deepseek-reasoner'], 'OpenAI 形状但路由无 /v1 前缀'),
    mk('openrouter', 'OpenRouter（200+ 模型）', 'chat_completions', 'api_key', 'https://openrouter.ai/api/v1', true,
      ['anthropic/claude-opus-4.6', 'openai/gpt-5'], '一个端点走多家；Jev 决策模型也走它'),
    mk('anthropic', 'Anthropic', 'anthropic_messages', 'oauth_device_code', 'https://api.anthropic.com', true,
      ['claude-opus-4.6', 'claude-sonnet-4.6'], '原生 messages 形状'),
    mk('openai-codex', 'OpenAI', 'chat_completions', 'api_key', 'https://api.openai.com/v1', true,
      ['gpt-5', 'o4-mini'], '含 codex_responses 形状'),
    mk('gemini', 'Google Gemini', 'chat_completions', 'api_key', 'https://generativelanguage.googleapis.com/v1beta', true,
      ['gemini-2.5-pro'], ''),
    mk('xiaomi', '小米 MiMo', 'chat_completions', 'api_key', 'https://api.xiaomi.com/v1', true,
      ['mimo-vl'], '小米自研'),
    mk('kimi-coding', 'Kimi / Moonshot', 'chat_completions', 'api_key', 'https://api.moonshot.cn/v1', false,
      ['kimi-k2.5'], ''),
    mk('minimax', 'MiniMax', 'chat_completions', 'api_key', 'https://api.minimax.chat/v1', true,
      ['MiniMax-Text-01'], ''),
    mk('zai', 'z.ai / GLM', 'chat_completions', 'api_key', 'https://open.bigmodel.cn/api/paas/v4', false,
      ['glm-4.6'], ''),
    mk('ollama-cloud', 'Ollama（本地/云）', 'chat_completions', 'api_key', 'http://127.0.0.1:11434/v1', false,
      ['qwen3:8b'], '自托管；原型只存配置'),
    mk('custom', '自定义端点', 'chat_completions', 'api_key', '', false, [], 'ollama|vllm|llamacpp 别名'),
  ];
}
function hDefaultGateways() {
  // connection-registry.ts:49-107 字段 1:1；样例两条 + 一条被隔离的坏条目
  // mode/keychain = 真图「设置 › 网关 › 当前窗口」的连接模式卡与钥匙串开关（§47）
  return {
    version: 2, primary: 'gw-local', launchMode: 'last-used', lastUsed: Date.now(),
    mode: 'local', keychain: false,
    connections: [
      { id: 'gw-local', kind: 'local', label: '本地 · App 托管', authMode: null, token: '', url: '',
        host: '', user: '', port: 0, keyPath: '', remoteHermesPath: '', remoteProfile: '', org: '' },
      { id: 'gw-remote', kind: 'remote', label: '家里服务器', authMode: 'token', token: 'env:HERMES_GATEWAY_TOKEN',
        url: 'https://gw.example.com:8642', host: 'gw.example.com', user: '', port: 8642,
        keyPath: '', remoteHermesPath: '', remoteProfile: '', org: '' },
    ],
    quarantined: [{ id: 'gw-bad', kind: 'ssh', label: '坏掉的 SSH（探不通）', url: 'ssh://old-host:22',
      reason: 'HTTP + WS 双探失败', at: Date.now() - 86400000 }],
  };
}
const H_GW_KINDS = ['cloud', 'local', 'remote', 'ssh'];

/* ── §8 记忆：两文件 + § 分隔 + 有界 + 冻结快照 ── */
function hMemBucket(pid, target) {
  const H0 = hState2();
  if (!H0.memory[pid]) H0.memory[pid] = { memory: [], user: [] };
  const b = H0.memory[pid];
  if (!Array.isArray(b[target])) b[target] = [];
  return b[target];
}
const hMemLimit = target => target === 'user' ? hState2().memoryCfg.userLimit : hState2().memoryCfg.memoryLimit;
function hMemUsage(pid, target) {
  const arr = hMemBucket(pid, target);
  const chars = arr.join('\n§\n').length;
  const lim = hMemLimit(target);
  return { chars, limit: lim, pct: Math.min(100, Math.round(chars / lim * 100)), entries: arr.length };
}
/// 满了就报错让 agent 自己腾位（memory.md:25-33，不自动压缩）
function hMemAdd(pid, target, text) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, err: '内容为空' };
  const arr = hMemBucket(pid, target);
  const add = arr.concat([t]).join('\n§\n').length;
  if (add > hMemLimit(target)) {
    return { ok: false, err: `已达上限 ${hMemLimit(target)} 字符（当前 ${hMemUsage(pid, target).chars}）—— 先腾位再写` };
  }
  arr.push(t);
  hSave();
  return { ok: true, usage: hMemUsage(pid, target) };
}
function hMemReplace(pid, target, idx, text) {
  const arr = hMemBucket(pid, target);
  if (idx < 0 || idx >= arr.length) return { ok: false, err: '条目不存在' };
  const t = String(text || '').trim();
  if (!t) return hMemRemove(pid, target, idx);
  const others = arr.filter((_, i) => i !== idx);
  if (others.concat([t]).join('\n§\n').length > hMemLimit(target)) {
    return { ok: false, err: '替换后会超上限，请先精简' };
  }
  arr[idx] = t;
  hSave();
  return { ok: true, usage: hMemUsage(pid, target) };
}
function hMemRemove(pid, target, idx) {
  const arr = hMemBucket(pid, target);
  if (idx < 0 || idx >= arr.length) return { ok: false };
  arr.splice(idx, 1);
  hSave();
  return { ok: true, usage: hMemUsage(pid, target) };
}
/// format_for_system_prompt（memory_tool_store.py:463）：带占用头的块
function hMemFormat(pid, target) {
  const u = hMemUsage(pid, target);
  const label = target === 'user' ? 'USER PROFILE (what you know about the user)' : 'MEMORY (your personal notes)';
  const arr = hMemBucket(pid, target);
  if (!arr.length) return '';
  return `${label} [${u.pct}% — ${u.chars.toLocaleString()}/${u.limit.toLocaleString()} chars]\n§\n` + arr.join('\n§\n');
}
/// 冻结快照（memory.md:57：会话中途写盘立即生效于工具回显，但系统提示词下一会话才更新）
function hFreezeMemory(pid) {
  const H0 = hState2();
  H0.memorySnapshots[pid] = { memory: hMemBucket(pid, 'memory').slice(), user: hMemBucket(pid, 'user').slice(),
    at: Date.now() };
  hSave();
}
function hSnapshotBlock(pid) {
  const H0 = hState2();
  const snap = H0.memorySnapshots[pid];
  if (!snap) return '';
  const fmt = (arr, target) => {
    if (!arr || !arr.length) return '';
    const lim = target === 'user' ? H0.memoryCfg.userLimit : H0.memoryCfg.memoryLimit;
    const chars = arr.join('\n§\n').length;
    const label = target === 'user' ? 'USER PROFILE (what you know about the user)' : 'MEMORY (your personal notes)';
    return `${label} [${Math.min(100, Math.round(chars / lim * 100))}% — ${chars}/${lim} chars]\n§\n` + arr.join('\n§\n');
  };
  const a = fmt(snap.memory, 'memory'), b = fmt(snap.user, 'user');
  return [a, b].filter(Boolean).join('\n\n');
}
/// 盘上最新 vs 已冻结快照 是否有差（"冻结快照"这条纪律的可见证据）
function hMemSnapDiff(pid) {
  const H0 = hState2();
  const snap = H0.memorySnapshots[pid];
  if (!snap) return { hasSnap: false, dirty: true };
  const cur = hMemBucket(pid, 'memory').join('\n§\n') + '||' + hMemBucket(pid, 'user').join('\n§\n');
  const sk = (snap.memory || []).join('\n§\n') + '||' + (snap.user || []).join('\n§\n');
  return { hasSnap: true, dirty: cur !== sk, at: snap.at };
}

/* ── 网关注册表操作（connection-registry.ts 规则） ── */
function hGwValidate(g, editId) {
  const G = hState2().gateways;
  const label = String(g.label || '').trim();
  if (!label) return { ok: false, err: 'label 必填' };
  if (label.length > 64) return { ok: false, err: 'label 最长 64 字符' };
  if (G.connections.some(c => c.label === label && c.id !== editId)) return { ok: false, err: 'label 必须唯一' };
  if (g.kind !== 'local') {
    const url = String(g.url || '').trim();
    if (g.kind === 'remote' || g.kind === 'cloud') {
      if (!/^https?:\/\//.test(url)) return { ok: false, err: 'remote/cloud 需要 http(s):// 地址' };
      const norm = url.replace(/\/+$/, '').toLowerCase();
      if (G.connections.some(c => c.id !== editId && c.url && c.url.replace(/\/+$/, '').toLowerCase() === norm)) {
        return { ok: false, err: '按规范化 URL 去重：已有同地址连接' };
      }
    }
    if (g.kind === 'ssh') {
      if (!g.host) return { ok: false, err: 'ssh 需要 host' };
      const key = `${g.user || ''}@${g.host}:${g.port || 22}`;
      if (G.connections.some(c => c.id !== editId && c.kind === 'ssh'
        && `${c.user || ''}@${c.host}:${c.port || 22}` === key)) {
        return { ok: false, err: '按 user@host:port 去重：已有同主机连接' };
      }
    }
  }
  return { ok: true };
}
function hGwAdd(g) {
  const v = hGwValidate(g);
  if (!v.ok) return v;
  const G = hState2().gateways;
  if (G.connections.length >= 20) return { ok: false, err: '连接数达到上限 20' };
  const c = { id: hNewId('gw'), kind: g.kind, label: g.label.trim(), url: g.url || '', authMode: g.authMode || null,
    token: g.token || '', host: g.host || '', user: g.user || '', port: +(g.port || 0), keyPath: g.keyPath || '',
    remoteHermesPath: g.remoteHermesPath || '', remoteProfile: g.remoteProfile || '', org: g.org || '' };
  G.connections.push(c);
  hSave();
  return { ok: true, conn: c };
}
function hGwRemove(id) {
  const G = hState2().gateways;
  const c = G.connections.find(x => x.id === id);
  if (!c) return { ok: false, err: '不存在' };
  if (c.kind === 'local') return { ok: false, err: 'local（App 托管）不可删除' };
  if (G.primary === id) {
    const fallback = G.connections.find(x => x.id !== id);
    if (!fallback) return { ok: false, err: '删掉后没有兜底连接' };
    G.primary = fallback.id;
  }
  G.connections = G.connections.filter(x => x.id !== id);
  hSave();
  return { ok: true };
}
function hGwTest(id) {
  const G = hState2().gateways;
  const c = G.connections.find(x => x.id === id);
  if (!c) return { ok: false, err: '不存在' };
  // B 批：真探测要发 HTTP + WebSocket；原型只做假探测（如实标注）
  const bad = c.kind === 'remote' && !/^https?:\/\//.test(c.url || '');
  if (bad) {
    G.quarantined = G.quarantined.filter(q => q.id !== id);
    G.quarantined.unshift({ id, kind: c.kind, label: c.label, url: c.url,
      reason: '地址格式非法（探不通）', at: Date.now() });
    if (G.quarantined.length > 20) G.quarantined.length = 20;   // REGISTRY_QUARANTINE_CAP=20
    G.connections = G.connections.filter(x => x.id !== id);
    hSave();
    return { ok: false, err: 'HTTP + WS 双探失败 → 已隔离进 quarantined（坏条目保全不丢）' };
  }
  G.lastUsed = Date.now();
  hSave();
  return { ok: true, msg: `HTTP ✓ · WS ✓（假探测，B 批才发真请求）` };
}

/* ── 渲染分发扩展 ── */
function renderHermes2() {
  const pane = $('#hermesPane');
  if (!pane) return;
  const v = hermesView;
  if (v === 'profiles') return hermesProfilesHTML(pane);
  if (v === 'memory') return hermesMemoryHTML(pane);
  if (v === 'providers') return hermesProvidersHTML(pane);
  if (v === 'gateways') return hermesGatewaysHTML(pane);
  return false;
}

/* ── 角色页（§7） ── */
function hermesProfilesHTML(pane) {
  const H0 = hState2();
  const cur = hProfile(H0.viewProfile) || hCurProfile();
  const list = hProfiles();
  const left = `<div class="hprof-list">
      <div class="hcol-head" style="padding:2px 2px 8px">角色（Profile）
        <span style="margin-left:auto"></span></div>
      ${list.map(p => `<div class="hprof-item${p.id === (H0.viewProfile || H0.activeProfile) ? ' is-on' : ''}" data-pfv="${p.id}">
        <span class="av" style="background:${H_PROVIDER_COLORS[p.provider] || '#6B7280'}">${escapeHtml((p.display_name || p.name || '?').slice(0, 1))}</span>
        <span style="min-width:0"><span style="display:block;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.display_name || p.name)}</span>
        <span class="sub">${escapeHtml(p.handle)} · ${escapeHtml(p.model)}</span></span></div>`).join('')}
      <div class="hrow" style="margin-top:8px">
        <button class="hbtn" data-pfact="new" style="flex:1">＋ 新建</button>
        <button class="hbtn" data-pfact="clone" title="复制当前角色（--clone 语义：拷 config/SOUL/记忆，不拷会话）">⧉ 复制</button>
      </div>
    </div>`;
  const p = cur;
  const body = p ? `<div class="hprof-body">
      <div class="hrow"><span class="htitle">${escapeHtml(p.display_name || p.name)}</span>
        ${p.id === H0.activeProfile ? '<span class="hprof-cur">✓ 当前角色</span>' : ''}
        <span class="spacer" style="flex:1"></span>
        <button class="hbtn primary" data-pfact="use">设为当前</button>
        <button class="hbtn" data-pfact="rename">改名</button>
        <button class="hbtn danger" data-pfact="del">删除</button></div>
      <div class="hnote" style="margin-top:4px">一个 profile = 一个独立 Hermes home（自己的 config / 密钥 / SOUL / 记忆 / 会话）。
        角色（Bot Mode）就是 profile 的一层展示。</div>
      <div class="hsec">profile.yaml</div>
      <div class="hform">
        <div class="hrow">
          <label style="flex:1">display_name<input data-pf="display_name" value="${escapeHtml(p.display_name || '')}"></label>
          <label style="flex:1">handle（群聊 @名）<input data-pf="handle" value="${escapeHtml(p.handle || '')}"></label>
        </div>
        <label>description（1-2 句；看板 decomposer 按它路由任务）
          <input data-pf="description" value="${escapeHtml(p.description || '')}"
            placeholder="例：负责拆需求、定边界，回答偏结构化。"></label>
        <div class="hrow">
          <label style="flex:1">model
            <select data-pf="model">${['qwen3-vl-plus','qwen-plus','deepseek-chat','deepseek-reasoner','gpt-5','claude-opus-4.6']
              .map(m => `<option${m === p.model ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
          <label style="flex:1">provider（与「提供商」页联动）
            <select data-pf="provider">${hState2().providers.map(x => `<option value="${x.name}"${x.name === p.provider ? ' selected' : ''}>${escapeHtml(x.display_name)}</option>`).join('')}</select></label>
        </div>
        <label>绑定项目文件夹（看板任务默认带它）
          <select data-pf="projectPath"><option value="">（不绑定）</option>
            ${(S.projects || []).filter(x => x && !x.isDefault).map(x =>
              `<option value="${escapeHtml(x.path)}"${x.path === p.projectPath ? ' selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}
          </select></label>
        <div class="hrow">
          <label style="flex:1">description_auto（AI 生成徽标）
            <select data-pf="descAuto"><option value="0"${!p.descAuto ? ' selected' : ''}>false</option>
              <option value="1"${p.descAuto ? ' selected' : ''}>true</option></select></label>
          <label style="flex:1">previous_names（改名历史，群聊旧 handle 同步用）
            <input value="${escapeHtml((p.previousNames || []).join(', '))}" disabled></label>
        </div>
        <label>SOUL.md（人格与常驻指令）
          <textarea data-pf="soul" rows="3" placeholder="这个角色说话的方式、底线、常用口癖…">${escapeHtml(p.soul || '')}</textarea></label>
        <div class="hrow">
          <label style="flex:1">ui_meta.hermes-bots.title（Bot 名）
            <input data-pf="ui.title" value="${escapeHtml(p.uiMeta.title || '')}"></label>
          <label style="flex:1">section（分组）
            <input data-pf="ui.section" value="${escapeHtml(p.uiMeta.section || '')}"></label>
          <label style="flex:1">hidden
            <select data-pf="ui.hidden"><option value="0"${!p.uiMeta.hidden ? ' selected' : ''}>false</option>
              <option value="1"${p.uiMeta.hidden ? ' selected' : ''}>true</option></select></label>
        </div>
      </div>
      <div class="hsec">独立 home 目录（<code>~/.hermes/profiles/${escapeHtml(p.name)}/</code>）</div>
      <div class="hfiles">├── <b>config.yaml</b>    全部行为设置（model/toolsets/gateway…）
├── <b>.env</b>           该角色的密钥（可覆盖 shell 环境）
├── <b>SOUL.md</b>        人格与常驻指令
├── <b>profile.yaml</b>   角色元数据（上面这张表）
├── <b>auth.json</b>      OAuth 登录
├── <b>state.db</b>       会话库（Archived Chats 的底层）
├── <b>memories/</b>      MEMORY.md + USER.md（本角色独享 → 「记忆」页）
├── skills/  cron/jobs.json  logs/  plugins/  attachments/  cache/</div>
      <div class="hnote">克隆语义：<b>⧉ 复制</b> = <code>--clone</code>（拷 config/SOUL/记忆），
        <b>永不拷</b>会话历史 / cron / 单次 OAuth / bot token（一个 token 只能归一个 profile）。</div>
    </div>` : '<div class="hprof-body"><div class="hempty">没有角色 —— 左下「＋ 新建」。</div></div>';

  pane.innerHTML = hBar('角色 · 多角色隔离（Profiles）',
    '一个 profile = 一个独立 home · 角色就是 profile 的一层展示（Hermes §7）', hCurChip())
    + `<div class="hbody"><div class="hprof">${left}${body}</div></div>`;
  hBindCommon(pane);
  pane.querySelectorAll('[data-pfv]').forEach(el => el.onclick = () => {
    H0.viewProfile = el.dataset.pfv;                 // 点行 = 切换"正在查看的角色"
    renderHermes();
  });
  pane.querySelectorAll('[data-pf]').forEach(el => {
    const key = el.dataset.pf;
    el.onchange = () => {
      const prof = hCurProfile(); if (!prof) return;
      let v = el.value;
      if (key.endsWith('.hidden') || key.endsWith('.descAuto') || key === 'descAuto') v = v === '1' || v === 'true';
      if (key.startsWith('ui.')) prof.uiMeta[key.slice(3)] = v;
      else prof[key] = v;
      if (key === 'display_name') prof.name = v || prof.name;
      hSave(); renderHermes(); renderHermesNav();
      toast('已保存（写入 profile.yaml）');
    };
  });
  const act = k => pane.querySelector(`[data-pfact="${k}"]`);
  if (act('use')) act('use').onclick = () => {
    if (!p) return;
    H0.activeProfile = p.id;
    H0.viewProfile = p.id;
    H0.cfg.defaultAssignee = p.id;                       // 看板 dispatcher 的默认负责人跟着角色走
    H0.modelCfg.provider = p.provider; H0.modelCfg.model = p.model;
    hSave(); renderHermes(); renderHermesNav();
    toast(`当前角色 → <b>${escapeHtml(p.display_name || p.name)}</b>（群聊/看板/记忆都跟着它）`);
  };
  if (act('rename')) act('rename').onclick = () => {
    if (!p) return;
    askModal({ title: '改名（profile id）', text: '旧名会进 previous_names（群聊旧 handle 同步用）',
      value: p.name, okText: '改名', onOk: v => {
        const nv = (v || '').trim();
        if (!nv || nv === p.name) return;
        p.previousNames.push(p.name);
        p.name = nv; hSave(); renderHermes(); renderHermesNav(); toast('已改名（previous_names 已记录）');
      } });
  };
  if (act('del')) act('del').onclick = () => {
    if (!p) return;
    if (hProfiles().length <= 1) return toast('至少保留一个角色');
    askModal({ title: '删除角色', text: `将删除 ${p.name}（含它的记忆与配置，会话历史一并不保留）`, okText: '删除', onOk: () => {
      hState2().profiles = hProfiles().filter(x => x.id !== p.id);
      delete H0.memory[p.id]; delete H0.memorySnapshots[p.id];
      if (H0.activeProfile === p.id) H0.activeProfile = hProfiles()[0].id;
      hSave(); renderHermes(); renderHermesNav(); toast('角色已删除');
    } });
  };
  if (act('new')) act('new').onclick = () => askModal({ title: '新建角色',
    text: '会创建一个独立 home（config / .env / SOUL / memories…）', value: '新角色', okText: '创建',
    onOk: v => {
      const nm = (v || '').trim(); if (!nm) return;
      const id = hNewId('pf');
      hProfiles().push({ id, name: nm, display_name: nm, handle: nm.toLowerCase().replace(/[^a-z0-9_一-龥]/g, '').slice(0, 12) || 'bot',
        model: H0.modelCfg.model, provider: H0.modelCfg.provider, projectPath: '', persona: '',
        description: '', descAuto: false, previousNames: [], soul: '',
        uiMeta: { title: nm, avatar: '', section: 'Agents', hidden: false } });
      H0.activeProfile = id; hSave(); renderHermes(); renderHermesNav(); toast(`已创建角色「${escapeHtml(nm)}」`);
    } });
  if (act('clone')) act('clone').onclick = () => {
    if (!p) return;
    const id = hNewId('pf');
    const copy = JSON.parse(JSON.stringify(p));
    copy.id = id; copy.name = p.name + '-copy'; copy.display_name = (p.display_name || p.name) + ' 副本';
    copy.previousNames = [];   // --clone 拷 config/SOUL/记忆，但会话与登录态不拷
    hProfiles().push(copy);
    H0.memory[id] = { memory: hMemBucket(p.id, 'memory').slice(), user: hMemBucket(p.id, 'user').slice() };
    H0.activeProfile = id;
    hSave(); renderHermes(); renderHermesNav(); toast('已复制（--clone：含 config/SOUL/记忆，不含会话）');
  };
}

/* ── 记忆页（§8） ── */
function hermesMemoryHTML(pane) {
  const H0 = hState2();
  const p = hCurProfile();
  if (!p) { pane.innerHTML = hBar('记忆', '没有角色') + '<div class="hempty">先在「角色」页建一个角色。</div>'; return; }
  const pid = p.id;
  const snap = hMemSnapDiff(pid);
  const card = (target, title, limit) => {
    const u = hMemUsage(pid, target);
    const arr = hMemBucket(pid, target);
    const cls = u.pct >= 100 ? 'full' : u.pct >= 85 ? 'warn' : '';
    return `<div class="hmem-card" data-mem="${target}">
      <div class="hmem-head">${title}
        <span class="hmem-usage ${cls}">${u.chars}/${limit} chars · ${u.pct}%</span></div>
      <div class="hmem-entries">
        ${arr.length ? arr.map((t, i) => `<div class="hmem-entry">
            <span class="txt">${escapeHtml(t)}</span>
            <span class="ops"><button data-memact="edit" data-t="${target}" data-i="${i}" title="替换">✎</button>
            <button data-memact="del" data-t="${target}" data-i="${i}" title="删除">✕</button></span>
          </div>${i < arr.length - 1 ? '<div class="hmem-delim">§</div>' : ''}`).join('')
          : '<div class="hempty" style="padding:14px">（空）—— 下面输入第一条</div>'}
      </div>
      <div class="hmem-foot"><input data-memnew="${target}" placeholder="新增一条（分隔符 §，上限 ${limit} 字符）…">
        <button class="hbtn" data-memact="add" data-t="${target}">加</button></div>
    </div>`;
  };
  pane.innerHTML = hBar('记忆 · 两文件有界存储（Memory）',
    `MEMORY.md ≤${H0.memoryCfg.memoryLimit} · USER.md ≤${H0.memoryCfg.userLimit} · 条目分隔 \\n§\\n（Hermes §8）`, hCurChip())
    + `<div class="hbody" style="flex-direction:column;overflow:auto">
      <div class="hmem">
        ${card('memory', 'MEMORY.md — agent 自己的笔记', H0.memoryCfg.memoryLimit)}
        ${card('user', 'USER.md — 用户画像', H0.memoryCfg.userLimit)}
      </div>
      <div class="hset-sec">记忆设置（memory.yaml · 照真图「记忆与上下文 › 持久记忆」排版）</div>
      <div class="hset-group">
        <div class="hset">
          <div class="tx"><div class="tt">持久记忆</div><div class="ds">保存有助于未来会话的持久记忆。</div></div>
          <div class="ct"><label class="hsw"><input type="checkbox" id="mEnabled"${H0.memoryCfg.enabled ? ' checked' : ''}><span class="tr"><span class="kb"></span></span></label></div>
        </div>
        <div class="hset">
          <div class="tx"><div class="tt">用户画像</div><div class="ds">维护一份精简的用户偏好画像。</div></div>
          <div class="ct"><label class="hsw"><input type="checkbox" id="mUserEnabled"${H0.memoryCfg.userEnabled ? ' checked' : ''}><span class="tr"><span class="kb"></span></span></label></div>
        </div>
        <div class="hset">
          <div class="tx"><div class="tt">记忆预算</div><div class="ds">MEMORY.md 的字符上限（${hMemUsage(pid, 'memory').chars}/${H0.memoryCfg.memoryLimit} · ${hMemUsage(pid, 'memory').pct}%）。满了<b>拒写</b>，不自动压缩。</div></div>
          <div class="ct"><input type="number" id="mLimit" value="${H0.memoryCfg.memoryLimit}" min="200" max="8000"></div>
        </div>
        <div class="hset">
          <div class="tx"><div class="tt">画像预算</div><div class="ds">USER.md 的字符上限（${hMemUsage(pid, 'user').chars}/${H0.memoryCfg.userLimit} · ${hMemUsage(pid, 'user').pct}%）。</div></div>
          <div class="ct"><input type="number" id="mUserLimit" value="${H0.memoryCfg.userLimit}" min="200" max="8000"></div>
        </div>
        <div class="hset">
          <div class="tx"><div class="tt">写记忆提醒</div><div class="ds">每 N 个用户轮提醒写记忆，0 = 关。</div></div>
          <div class="ct"><input type="number" id="mNudge" value="${H0.memoryCfg.nudge}" min="0" max="100" style="width:80px"></div>
        </div>
        <div class="hset">
          <div class="tx"><div class="tt">记忆提供方</div><div class="ds">Memory provider plugin —— 决定记忆怎么存取（真图同款行）。</div></div>
          <div class="ct"><select id="mProvider">
            <option value="builtin"${H0.memoryCfg.provider === 'builtin' ? ' selected' : ''}>仅内置</option>
            <option value="mem0"${H0.memoryCfg.provider === 'mem0' ? ' selected' : ''}>mem0（plugin）</option>
            <option value="vector"${H0.memoryCfg.provider === 'vector' ? ' selected' : ''}>向量库（plugin）</option>
          </select></div>
        </div>
        <div class="hset">
          <div class="tx"><div class="tt">冻结快照</div>
            <div class="ds">${snap.hasSnap
              ? (snap.dirty
                  ? `❌ 与盘上最新<b>不一致</b>（快照 ${new Date(snap.at).toLocaleString()}）—— 写盘立刻生效于工具回显，但系统提示词下一会话才更新（保前缀缓存）。下一场讨论仍用旧快照。`
                  : `❄️ 与盘上一致（${new Date(snap.at).toLocaleString()}）—— 下一场讨论注入的就是这份。`)
              : '❄️ 还没有冻结快照 —— 下一场房间讨论开始时会自动冻结一次。'}</div></div>
          <div class="ct"><button class="hbtn" data-memact="freeze"${snap.hasSnap && !snap.dirty ? ' disabled' : ''}>以当前记忆冻结快照</button></div>
        </div>
      </div></div>`;
  hBindCommon(pane);
  const add = (target) => {
    const i = pane.querySelector(`[data-memnew="${target}"]`);
    if (!i || !i.value.trim()) return;
    const res = hMemAdd(pid, target, i.value);
    if (!res.ok) { toast(escapeHtml(res.err)); return; }
    renderHermes();
  };
  pane.querySelectorAll('[data-memact]').forEach(b => b.onclick = () => {
    const act = b.dataset.memact;
    if (act === 'add') return add(b.dataset.t);
    if (act === 'freeze') { hFreezeMemory(pid); renderHermes(); toast('已冻结快照（下一场讨论注入这份）'); return; }
    const t = b.dataset.t, idx = +b.dataset.i;
    if (act === 'del') { hMemRemove(pid, t, idx); renderHermes(); toast('已删除（removal）'); return; }
    if (act === 'edit') {
      const cur = hMemBucket(pid, t)[idx];
      askModal({ title: '替换条目（replace）', text: '满了会拒写，不自动压缩', value: cur, okText: '替换',
        onOk: v => { const r = hMemReplace(pid, t, idx, v); if (!r.ok) { toast(escapeHtml(r.err)); return false; }
          renderHermes(); toast('已替换'); } });
    }
  });
  pane.querySelectorAll('[data-memnew]').forEach(i => i.onkeydown = e => {
    e.stopPropagation(); if (e.key === 'Enter') add(i.dataset.memnew);
  });
  const bindChk = (id, key) => { const el = pane.querySelector(id); if (!el) return;
    el.onchange = () => { H0.memoryCfg[key] = el.checked; hSave(); renderHermes(); }; };
  const bindNum = (id, key) => { const el = pane.querySelector(id); if (!el) return;
    el.onchange = () => { H0.memoryCfg[key] = Math.max(0, parseInt(el.value, 10) || 0); hSave(); renderHermes(); }; };
  bindChk('#mEnabled', 'enabled'); bindChk('#mUserEnabled', 'userEnabled');
  bindNum('#mLimit', 'memoryLimit'); bindNum('#mUserLimit', 'userLimit'); bindNum('#mNudge', 'nudge');
  const mProv = pane.querySelector('#mProvider');
  if (mProv) mProv.onchange = () => { H0.memoryCfg.provider = mProv.value; hSave();
    toast(`记忆提供方 → <b>${escapeHtml(mProv.options[mProv.selectedIndex].text)}</b>`); };
}

/* ── 提供商页（§9） ── */
function hermesProvidersHTML(pane) {
  const H0 = hState2();
  const p = hCurProfile();
  const curProv = p ? p.provider : H0.modelCfg.provider;
  const curModel = p ? p.model : H0.modelCfg.model;
  const tab = H0.provTab || 'keys';
  /// 左子导航（照真图「提供方 › 账号/API 密钥/自定义端点/本地模型」；「账号」= OAuth 登录，按要求忽略不做）
  const side = `<div class="hprof-list">
      <div class="hcol-head" style="padding:2px 2px 8px">提供方（Provider）</div>
      <div class="hside">
        <div class="hside-item${tab === 'keys' ? ' is-on' : ''}" data-ptab="keys"><span class="ic">🔑</span>API 密钥</div>
        <div class="hside-item${tab === 'endpoints' ? ' is-on' : ''}" data-ptab="endpoints"><span class="ic">🌐</span>自定义端点</div>
        <div class="hside-item${tab === 'local' ? ' is-on' : ''}" data-ptab="local"><span class="ic">🖥️</span>本地模型</div>
      </div>
      <div class="hnote" style="padding:12px 4px 0;line-height:1.8">三种模式 = 三种凭据/地址来源：<br>
        <b>API 密钥</b>：注册表 12 家，key 进 config 的 provider 块<br>
        <b>自定义端点</b>：自己家的 base_url（命名条目）<br>
        <b>本地模型</b>：Ollama / llama.cpp 等本机服务<br>
        <span style="opacity:.6">（真图还有「账号」= OAuth 登录，本批按要求忽略）</span></div>
    </div>`;

  const cards = H0.providers.map(x => `
    <div class="hprov-card${x.name === curProv ? ' is-on' : ''}" data-prov="${x.name}">
      <span class="badge${x.name === curProv ? '' : ' off'}">${x.name === curProv ? '当前' : '可切换'}</span>
      <div class="nm">${escapeHtml(x.display_name)}</div>
      <div class="ds">${escapeHtml(x.description || '')}</div>
      <div class="kv"><span>name</span> ${escapeHtml(x.name)}
        <br><span>api_mode</span> ${escapeHtml(x.api_mode)}
        <br><span>auth_type</span> ${escapeHtml(x.auth_type)}
        <br><span>base_url</span> ${escapeHtml(x.base_url || '—')}
        ${x.models.length ? '<br><span>models</span> ' + escapeHtml(x.models.slice(0, 3).join(' / ')) : ''}</div>
      <div class="hcap">
        <i class="${x.supports_vision ? 'yes' : ''}">vision ${x.supports_vision ? '✓' : '—'}</i>
        <i>health ${x.name === 'custom' ? '—' : '✓'}</i>
        <i>model_list ${x.models.length ? '✓' : '—'}</i>
        ${x.aliases.length ? '<i>aliases ✓</i>' : ''}
      </div>
    </div>`).join('');

  let body = '';
  if (tab === 'keys') {
    body = `<div class="hcrumb"><b>设置</b><span class="sep">›</span><b>提供方</b><span class="sep">›</span>API 密钥</div>
      <div class="hgw-note" style="padding-top:4px">当前：<b>${escapeHtml(curProv)}</b> / <b>${escapeHtml(curModel)}</b>
        　→ 切换会写进<b>当前角色</b>的 provider/model（每请求重解析，保存即生效）。
        　持久化开关 <code>model.persist_switch_by_default</code>（默认 <b>false</b> = 只对本会话生效）。</div>
      <div class="hprov">${cards}</div>
      <div class="hset-sec">切换行为</div>
      <div class="hset-group">
        <div class="hset">
          <div class="tx"><div class="tt">persist_switch_by_default</div>
            <div class="ds">开启后 /model 切换会写回 config（默认关闭 = 只对本会话生效）。</div></div>
          <div class="ct"><label class="hsw"><input type="checkbox" id="provPersist"${H0.modelCfg.persist ? ' checked' : ''}><span class="tr"><span class="kb"></span></span></label></div>
        </div>
        <div class="hset">
          <div class="tx"><div class="tt">当前模型</div>
            <div class="ds">跟着所选 provider 的 model_list 走（切换即写进当前角色）。</div></div>
          <div class="ct"><select id="provModel">
            ${(H0.providers.find(x => x.name === curProv) || { models: [curModel] }).models.concat([curModel])
              .filter((v, i, a) => a.indexOf(v) === i)
              .map(m => `<option${m === curModel ? ' selected' : ''}>${escapeHtml(m)}</option>`).join('')}
          </select></div>
        </div>
      </div>`;
  } else if (tab === 'endpoints') {
    body = `<div class="hcrumb"><b>设置</b><span class="sep">›</span><b>提供方</b><span class="sep">›</span>自定义端点</div>
      <div class="hset-sec">命名 provider 条目（config.yaml 的 <code>providers:</code> 块）</div>
      <div style="padding:0 16px 16px">
        <div class="hcard" style="background:rgba(255,255,255,.035);border:1px solid var(--line,#26292C);border-radius:11px;padding:11px 12px">
          <div class="hform">
            <div class="hrow">
              <label style="flex:1">key（条目名）<input id="npKey" placeholder="my-proxy"></label>
              <label style="flex:1">base_url（必填）<input id="npUrl" placeholder="https://llm.internal.example.com/v1"></label>
            </div>
            <div class="hrow">
              <label style="flex:1">key_env / api_key<input id="npKeyEnv" placeholder="MY_PROXY_API_KEY"></label>
              <label style="flex:1">api_mode
                <select id="npMode"><option>chat_completions</option><option>codex_responses</option>
                  <option>anthropic_messages</option></select></label>
              <label style="flex:1">model<input id="npModel" placeholder="databricks-claude-sonnet-4-6"></label>
            </div>
            <div class="hrow"><button class="hbtn primary" data-pact="addnamed">＋ 添加命名条目</button>
              <span class="hsub">（key_cmd 支持每请求重取短时令牌；extra_headers 值按密钥处理、永不入日志）</span></div>
          </div>
          <div id="npList" style="margin-top:8px">${(H0.namedProviders || []).map((n, i) =>
            `<div class="hchip" style="margin:4px 6px 0 0">${escapeHtml(n.key)} → ${escapeHtml(n.base_url)}
              <button data-npdel="${i}" style="border:0;background:transparent;color:#F87171;cursor:pointer">×</button></div>`).join('')
            || '<span class="hsub">（还没有命名条目）</span>'}</div>
        </div>
      </div>`;
  } else {
    body = `<div class="hcrumb"><b>设置</b><span class="sep">›</span><b>提供方</b><span class="sep">›</span>本地模型</div>
      <div class="hrow" style="padding:8px 16px 0">
        <span class="hsub">本机推理服务 —— 不进 12 条注册表，按 base_url 直连；检测为 mock。</span>
        <span style="flex:1"></span>
        <button class="hbtn" data-lmact="scan">🔍 检测本机</button>
      </div>
      <div class="hgw" style="padding:10px 16px 4px">
        ${(H0.localModels || []).map((m, i) => `
          <div class="hgw-card${m.up ? ' is-primary' : ''}">
            <div class="hgw-top">
              <span class="hgw-kind local">local</span>
              <span class="hgw-label">${escapeHtml(m.name)}</span>
              <span class="hchip${m.up ? ' on' : ''}" style="margin-left:auto">${m.up ? '在线' : '离线'}</span>
            </div>
            <div class="hgw-fields"><span><b>url</b>${escapeHtml(m.url)}</span>
              <span><b>models</b>${m.models.length ? escapeHtml(m.models.join(' / ')) : '—'}</span></div>
            <div class="hgw-ops">
              <button class="hbtn" data-lmact="probe" data-i="${i}">检测</button>
              <button class="hbtn" data-lmact="use" data-i="${i}" ${m.up ? '' : 'disabled title="离线"'}>设为当前</button>
              <button class="hbtn danger" data-lmact="del" data-i="${i}">删除</button>
            </div>
          </div>`).join('')
          || '<div class="hempty">没有本地端点。</div>'}
      </div>
      <div class="hset-sec">添加本地端点</div>
      <div style="padding:0 16px 16px" class="hrow">
        <label class="hrow" style="gap:6px">名称 <input id="lmName" placeholder="Ollama" style="width:130px"></label>
        <label class="hrow" style="gap:6px">url <input id="lmUrl" placeholder="http://localhost:11434" style="width:250px"></label>
        <button class="hbtn primary" data-lmact="add">＋ 添加</button>
      </div>`;
  }

  pane.innerHTML = hBar('提供方 · 多 Provider 切换（Providers）',
    `${H0.providers.length} 个注册表条目 · 三模式（API 密钥 / 自定义端点 / 本地模型）· /model 语义（Hermes §9）`, hCurChip())
    + `<div class="hbody"><div class="hprof">${side}<div class="hprof-body">${body}</div></div></div>`;
  hBindCommon(pane);
  pane.querySelectorAll('[data-ptab]').forEach(el => el.onclick = () => {
    H0.provTab = el.dataset.ptab; hSave(); renderHermes();
  });
  pane.querySelectorAll('[data-prov]').forEach(el => el.onclick = () => {
    const name = el.dataset.prov;
    const prof = hCurProfile();
    const prov = H0.providers.find(x => x.name === name);
    if (prof) { prof.provider = name;
      if (prov && prov.models.length && prov.models.indexOf(prof.model) < 0) prof.model = prov.models[0]; }
    H0.modelCfg.provider = name;
    if (prov && prov.models.length) H0.modelCfg.model = prov.models[0];
    hSave(); renderHermes(); renderHermesNav();
    toast(`已切换到 <b>${escapeHtml(prov ? prov.display_name : name)}</b>（/model · ${H0.modelCfg.persist ? '已写回 config' : '仅本会话'}）`);
  });
  const pm = pane.querySelector('#provModel');
  if (pm) pm.onchange = () => {
    const prof = hCurProfile();
    if (prof) prof.model = pm.value;
    H0.modelCfg.model = pm.value;
    hSave(); renderHermes(); renderHermesNav();
    toast(`模型 → ${escapeHtml(pm.value)}`);
  };
  const pp = pane.querySelector('#provPersist');
  if (pp) pp.onchange = () => { H0.modelCfg.persist = pp.checked; hSave();
    toast(pp.checked ? 'persist_switch_by_default = true（切换会写回 config）' : 'persist_switch_by_default = false（默认，不持久化）'); };
  const addNp = pane.querySelector('[data-pact="addnamed"]');
  if (addNp) addNp.onclick = () => {
    const key = pane.querySelector('#npKey').value.trim();
    const url = pane.querySelector('#npUrl').value.trim();
    if (!key || !url) return toast('key 与 base_url 都必填');
    if ((H0.namedProviders || []).some(n => n.key === key)) return toast('条目名已存在');
    H0.namedProviders = H0.namedProviders || [];
    H0.namedProviders.push({ key, base_url: url, key_env: pane.querySelector('#npKeyEnv').value.trim(),
      api_mode: pane.querySelector('#npMode').value, model: pane.querySelector('#npModel').value.trim() });
    hSave(); renderHermes(); toast(`已添加命名条目「${escapeHtml(key)}」`);
  };
  pane.querySelectorAll('[data-npdel]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    H0.namedProviders.splice(+b.dataset.npdel, 1); hSave(); renderHermes(); toast('已删除命名条目');
  });
  pane.querySelectorAll('[data-lmact]').forEach(b => b.onclick = () => {
    const act = b.dataset.lmact, i = +b.dataset.i;
    const list = H0.localModels;
    if (act === 'scan') { renderHermes();
      toast('已扫描 11434 / 8080 / 1234 —— Ollama ✓ 在线 · llama.cpp ✗ 无响应（mock）'); return; }
    if (act === 'probe') { list[i].up = !list[i].up;
      if (list[i].up && !list[i].models.length) list[i].models = ['qwen3:8b'];
      hSave(); renderHermes(); toast(list[i].up ? `${escapeHtml(list[i].name)} ✓ 在线（mock probe）` : `${escapeHtml(list[i].name)} ✗ 离线`); return; }
    if (act === 'use') { hSave(); toast(`当前端点 → <b>${escapeHtml(list[i].name)}</b>（${escapeHtml(list[i].url)} · mock）`); return; }
    if (act === 'del') { list.splice(i, 1); hSave(); renderHermes(); toast('已删除本地端点'); return; }
    if (act === 'add') {
      const name = pane.querySelector('#lmName').value.trim();
      const url = pane.querySelector('#lmUrl').value.trim();
      if (!name || !url) return toast('名称与 url 都必填');
      list.push({ name, url, up: false, models: [] });
      hSave(); renderHermes(); toast(`已添加本地端点「${escapeHtml(name)}」`);
    }
  });
}

/* ── 网关页（§5.3 connection-registry） ── */
function hermesGatewaysHTML(pane) {
  const H0 = hState2();
  const G = H0.gateways;
  const cardOf = c => {
    const isQ = G.quarantined.some(q => q.id === c.id);
    return `<div class="hgw-card${G.primary === c.id ? ' is-primary' : ''}${isQ ? ' is-quar' : ''}" data-gw="${c.id}">
      <div class="hgw-top">
        <span class="hgw-kind ${c.kind}">${c.kind}</span>
        <span class="hgw-label">${escapeHtml(c.label)}</span>
        ${G.primary === c.id ? '<span class="hchip on" style="margin-left:auto">primary</span>' : ''}
        ${G.lastUsed && c.id === G.lastUsed ? '' : ''}
        <span class="hsub" style="margin-left:auto">${G.primary === c.id ? '' : ''}</span>
      </div>
      <div class="hgw-fields">
        ${c.url ? `<span><b>url</b>${escapeHtml(c.url)}</span>` : ''}
        ${c.kind === 'ssh' ? `<span><b>host</b>${escapeHtml(c.host || '—')}</span><span><b>user</b>${escapeHtml(c.user || '—')}</span><span><b>port</b>${c.port || 22}</span><span><b>key</b>${escapeHtml(c.keyPath || '—')}</span>` : ''}
        ${c.authMode ? `<span><b>auth</b>${escapeHtml(c.authMode)}</span>` : ''}
        ${c.token ? `<span><b>token</b>${escapeHtml(c.token)}</span>` : ''}
        ${c.remoteHermesPath ? `<span><b>remote_path</b>${escapeHtml(c.remoteHermesPath)}</span>` : ''}
        ${c.remoteProfile ? `<span><b>remote_profile</b>${escapeHtml(c.remoteProfile)}</span>` : ''}
      </div>
      <div class="hgw-ops">
        <button class="hbtn" data-gwact="test" data-id="${c.id}">Test（HTTP + WS）</button>
        <button class="hbtn" data-gwact="primary" data-id="${c.id}" ${G.primary === c.id ? 'disabled' : ''}>设为 primary</button>
        <button class="hbtn danger" data-gwact="del" data-id="${c.id}" ${c.kind === 'local' ? 'disabled title="local 不可删"' : ''}>删除</button>
      </div></div>`;
  };
  /// 连接模式四卡（照真图「设置 › 网关 › 当前窗口」：图标+标题+描述，选中 accent 边+✓）
  const GW_MODES = [
    { k: 'local', ic: '🖥️', t: '本地网关', d: '在 localhost 启动私有 Hermes 后端。这是默认方式，并且可离线工作。' },
    { k: 'cloud', ic: '☁️', t: 'Hermes Cloud', d: '只需登录 Hermes Cloud 一次，即可从你账户下的智能体中选择——无需粘贴 URL。' },
    { k: 'remote', ic: '📡', t: '远程网关', q: true, d: '将此桌面外壳连接到远程 Hermes 后端。' },
    { k: 'ssh', ic: '🖳', t: '通过 SSH 连接', q: true, d: 'Hermes 会通过 SSH 在远程启动并以隧道连接到本应用——无需自行启动或暴露任何服务。前提：已具备到该主机的密钥 SSH 访问。' },
  ];
  pane.innerHTML = hBar('网关 · Gateways',
    `连接模式 + 已保存的连接 · connections.json v${G.version} · 隔离区 ${G.quarantined.length}/20（Hermes §5.3）`)
    + `<div class="hbody" style="flex-direction:column;overflow:auto">
      <div class="hcrumb"><b>设置</b><span class="sep">›</span><b>网关</b><span class="sep">›</span>当前窗口</div>
      <div class="hset-sec">连接模式</div>
      <div class="hmode">${GW_MODES.map(m => `
        <button class="hmode-card${G.mode === m.k ? ' is-on' : ''}" data-gwmode="${m.k}">
          <span class="tick">✓</span>
          <div class="mi">${m.ic}</div>
          <div class="mt">${m.t}${m.q ? ' <span style="opacity:.45;font-size:11px">?</span>' : ''}</div>
          <div class="md">${m.d}</div>
        </button>`).join('')}</div>
      <div class="hmode-ops">
        <button class="hbtn ghost" data-gwact="savelater">保存到下次重启</button>
        <button class="hbtn primary" data-gwact="savereconnect">保存并重连</button>
      </div>
      <div class="hset-group" style="margin-top:8px">
        <div class="hset">
          <div class="tx"><div class="tt">使用系统钥匙串加密已保存的机密</div>
            <div class="ds">默认关闭。开启后，网关 token 和登录凭据将使用系统钥匙串（Keychain Access、GNOME Keyring 或 Windows DPAPI）加密——系统可能会请求授权或密码。关闭时，它们以仅当前用户可读的普通文件形式存储。</div></div>
          <div class="ct"><label class="hsw"><input type="checkbox" id="gwKeychain"${G.keychain ? ' checked' : ''}><span class="tr"><span class="kb"></span></span></label></div>
        </div>
        <div class="hset">
          <div class="tx"><div class="tt">诊断</div>
            <div class="ds">在文件管理器中显示 desktop.log，网关启动失败时很有用。</div></div>
          <div class="ct"><button class="hbtn ghost" data-gwact="openlog">📄 打开日志</button></div>
        </div>
      </div>
      <div class="hset-sec">已保存的连接 —— connections.json · lastUsed：${G.lastUsed ? new Date(G.lastUsed).toLocaleString() : '—'}</div>
      <div class="hgw-note" style="padding-top:0">三个入口：Settings → Gateways · 侧栏 profile 轨的插头 · Cmd+K 命令面板。
        规则：<b>label 唯一且 ≤64</b> · <b>local 不可删</b> · <b>primary 兜底</b> ·
        去重按规范化 URL 或 <code>user@host:port</code> · Test 同时探 HTTP + WebSocket · 隔离区上限 20（坏条目保全不丢）。</div>
      <div class="hrow" style="padding:4px 14px 0">
        <label class="hrow" style="gap:6px">launchMode
          <select id="gwLaunch">
            <option value="last-used"${G.launchMode === 'last-used' ? ' selected' : ''}>last-used</option>
            <option value="primary"${G.launchMode === 'primary' ? ' selected' : ''}>primary</option>
          </select></label>
        <span style="flex:1"></span>
        <button class="hbtn primary" data-gwact="add">＋ 添加连接</button>
      </div>
      <div class="hgw">
        ${G.connections.map(cardOf).join('')}
        ${G.quarantined.length ? `<div class="hsec">隔离区 quarantined（${G.quarantined.length}/20）—— 坏条目保全不丢</div>` +
          G.quarantined.map(q => `<div class="hgw-card is-quar"><div class="hgw-top">
            <span class="hgw-kind ${q.kind}">${q.kind}</span><span class="hgw-label">${escapeHtml(q.label)}</span>
            <span class="hsub" style="margin-left:auto">${escapeHtml(q.reason || '')}</span></div>
            <div class="hgw-fields"><span><b>url</b>${escapeHtml(q.url || '—')}</span>
            <span><b>at</b>${new Date(q.at).toLocaleString()}</span></div>
            <div class="hgw-ops"><button class="hbtn" data-gwact="unq" data-id="${q.id}">恢复</button></div></div>`).join('') : ''}
        ${!G.connections.length ? '<div class="hempty">没有连接。</div>' : ''}
      </div></div>`;
  hBindCommon(pane);
  pane.querySelectorAll('[data-gwmode]').forEach(b => b.onclick = () => {
    G.mode = b.dataset.gwmode; hSave(); renderHermes();
    const m = GW_MODES.find(x => x.k === G.mode);
    toast(`连接模式 → <b>${escapeHtml(m ? m.t : G.mode)}</b>（点「保存并重连」立即生效，否则下次启动生效）`);
  });
  const gk = pane.querySelector('#gwKeychain');
  if (gk) gk.onchange = () => { G.keychain = gk.checked; hSave();
    toast(gk.checked ? '钥匙串加密已开启（token/凭据进 Keychain）' : '钥匙串加密已关闭（普通文件，仅当前用户可读）'); };
  const lm = pane.querySelector('#gwLaunch');
  if (lm) lm.onchange = () => { G.launchMode = lm.value; hSave(); renderHermes();
    toast(`launchMode = ${lm.value}`); };
  pane.querySelectorAll('[data-gwact]').forEach(b => b.onclick = () => {
    const act = b.dataset.gwact, id = b.dataset.id;
    if (act === 'add') return hGwAddModal();
    if (act === 'savelater') { hSave(); toast('已保存 —— 连接模式的变更下次启动时生效'); return; }
    if (act === 'savereconnect') { G.lastUsed = Date.now(); hSave(); renderHermes();
      toast('已保存并重连（mock：desktop.log 已记录一次 reconnect）'); return; }
    if (act === 'openlog') { toast('已在访达中显示 <code>~/Library/Application Support/Hermes/desktop.log</code>（mock）'); return; }
    if (act === 'test') { const r = hGwTest(id); renderHermes(); toast(r.ok ? r.msg : escapeHtml(r.err)); return; }
    if (act === 'primary') { G.primary = id; G.lastUsed = Date.now(); hSave(); renderHermes();
      toast('primary 已切换（删连接时它兜底）'); return; }
    if (act === 'del') { const r = hGwRemove(id); renderHermes(); toast(r.ok ? '已删除' : escapeHtml(r.err)); return; }
    if (act === 'unq') { const q = G.quarantined.find(x => x.id === id);
      if (q) { G.quarantined = G.quarantined.filter(x => x.id !== id); hSave(); renderHermes(); toast('已移出隔离区（未自动加回连接）'); } }
  });
}
function hGwAddModal() {
  askModal({ title: '添加连接', text: 'kind = cloud / local / remote / ssh；label 唯一（≤64）',
    value: 'remote|新连接|https://', okText: '添加', onOk: v => {
      const parts = String(v || '').split('|');
      const kind = (parts[0] || '').trim();
      if (H_GW_KINDS.indexOf(kind) < 0) { toast('kind 必须是 cloud / local / remote / ssh'); return false; }
      const label = (parts[1] || '').trim();
      const url = (parts[2] || '').trim();
      const r = hGwAdd({ kind, label, url });
      if (!r.ok) { toast(escapeHtml(r.err)); return false; }
      renderHermes(); toast(`已添加连接「${escapeHtml(label)}」`);
      return true;
    } });
}


/* ══ §46 Hermes 第三批：快捷输入（§6）· 多渠道（§4.1）· 飞书一键建 bot（§4.2）══ */

/* ── §6 快捷输入：accelerator 词表 + 校验（quick-entry.ts:31-86 / :282 sanitize） ── */
const QE_MODS = { cmd: 'Cmd', command: 'Cmd', commandorcontrol: 'Cmd', ctrl: 'Control', control: 'Control',
  alt: 'Alt', option: 'Alt', shift: 'Shift', none: '' };
const QE_MOD_ALIAS = { cmd: 'CommandOrControl', command: 'CommandOrControl', commandorcontrol: 'CommandOrControl',
  ctrl: 'Control', control: 'Control', alt: 'Option', option: 'Option', shift: 'Shift' };
const QE_KEYS = ['backspace','enter','tab','space','escape','delete','up','down','left','right','home','end',
  'pageup','pagedown','f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12','plus','minus','equal',
  'comma','period','slash','backslash','bracketleft','bracketright','quote','backquote','0','1','2','3','4',
  '5','6','7','8','9','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u',
  'v','w','x','y','z'];
/// 浏览器/系统已占的组合（Hermes 的 taken 分支；输入法冲突不模拟）
const QE_TAKEN = ['commandorcontrol+t', 'commandorcontrol+w', 'commandorcontrol+n', 'commandorcontrol+q',
  'commandorcontrol+l', 'commandorcontrol+r', 'commandorcontrol+shift+3', 'commandorcontrol+shift+4'];
const QE_DEFAULT = 'CommandOrControl+Shift+Space';       // quick-entry.ts:19
/// normalize：接受多种写法 → 规范 Electron accelerator 形（quick-entry.ts:282 sanitizeQuickEntrySettings 等价）
function qeNormalize(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const parts = s.split('+').map(x => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  const mods = [], keys = [];
  for (const p of parts) {
    const low = p.toLowerCase();
    if (QE_MODS[low] !== undefined) { if (QE_MOD_ALIAS[low]) mods.push(QE_MOD_ALIAS[low]); continue; }
    let k = low;
    if (k === 'esc') k = 'escape';
    if (k === 'del') k = 'delete';
    if (k === 'arrowup') k = 'up'; if (k === 'arrowdown') k = 'down';
    if (k === 'arrowleft') k = 'left'; if (k === 'arrowright') k = 'right';
    if (QE_KEYS.indexOf(k) >= 0) keys.push(k);
    else if (/^f([1-9]|1[0-2])$/.test(k)) keys.push(k);
    else return { error: 'invalid', why: `不认识的键「${p}」（词表见 quick-entry.ts:50-86）` };
  }
  if (keys.length !== 1) return { error: 'invalid', why: keys.length ? '只能有一个主键' : '只有修饰键，缺主键' };
  const isFn = /^f\d+$/.test(keys[0]);
  if (!mods.length && !isFn) return { error: 'invalid', why: '必须至少带一个修饰键（或 F1–F12）' };
  const order = ['CommandOrControl', 'Control', 'Option', 'Shift'];
  mods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const cand = mods.concat([keys[0].length === 1 ? keys[0].toUpperCase() : capitalize(keys[0])]).join('+');
  if (QE_TAKEN.indexOf(cand.toLowerCase()) >= 0) return { error: 'taken', value: cand, why: '已被系统/浏览器占用' };
  return { value: cand };
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function qeDisplay(acc) {
  if (!acc) return '';
  return acc.split('+').map(p => ({ CommandOrControl: '⌘', Control: '⌃', Option: '⌥', Shift: '⇧' }[p] || p)).join('');
}
function qeState() {
  if (!S.quickEntry || typeof S.quickEntry !== 'object') {
    S.quickEntry = { enabled: true, shortcut: QE_DEFAULT, target: 'current', recentCount: 5,
      registered: false, error: '' };
  }
  const q = S.quickEntry;
  if (typeof q.recentCount !== 'number') q.recentCount = 5;   // 近期会话固定 5 条（use-quick-entry-bridge.ts:21）
  const v = qeNormalize(q.shortcut);
  if (v && v.error) { q.registered = false; q.error = v.why; }
  else if (v && v.value !== q.shortcut) { q.shortcut = v.value; }
  else if (v) { q.error = ''; q.registered = !!q.enabled; }
  return q;
}
/// 与主输入框**完全同一条提交管线**（use-quick-entry-bridge.ts:42: one submit pipeline）
function qeSubmit(text) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, err: '内容为空' };
  const q = qeState();
  if (q.target === 'new') {
    // 照「＋新建对话」那条路（openConvAddMenu 的新建分支）：建卡 + 选中，**不清空历史**
    const p2 = S.plans;
    const lastGroup = [...p2].reverse().find(x => x.isGroup);
    const nid = 't' + now();
    p2.push({ id: nid, sid: newSid(), title: `对话 ${p2.filter(x => !x.isGroup).length + 1}`,
      ts: now(), group: lastGroup ? lastGroup.title : null });
    save(true); selectTempCard(nid);
  }
  else if (q.target && q.target !== 'current') {
    const pl = (S.plans || []).find(x => x.id === q.target);
    if (pl) selectTempCard(pl.id);                 // 切到那张对话卡（= 指定近期会话）
  }
  const ta = $('#chatInput');
  if (ta) { ta.value = t; sendChat(); }
  else dispatchReply(t);                            // 兜底：没有 composer 也走同一条
  return { ok: true };
}
function qeToggle() {
  const q = qeState();
  const bar = document.querySelector('.qe-bar');
  if (!bar) return;
  const show = bar.hidden;
  if (show && !q.enabled) { toast('快捷输入已关闭（去「快捷输入」页打开）'); return; }
  if (show) {
    const v = qeNormalize(q.shortcut);
    if (v && v.error) { toast(`快捷键不可用：${escapeHtml(v.why)}`); return; }
  }
  bar.hidden = !show;
  if (show) { const ta = bar.querySelector('textarea'); if (ta) { ta.value = ''; setTimeout(() => ta.focus(), 20); } }
}
function qeRenderBar() {
  let bar = document.querySelector('.qe-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'qe-bar'; bar.hidden = true;
    bar.innerHTML = `<div class="qe-top"><span class="qe-dot"></span>
        <span class="qe-title">快捷输入 · Quick Entry</span>
        <span class="qe-esc">Esc 关闭</span></div>
      <textarea rows="3" placeholder="直接输入，Enter 发送（走与主输入框完全相同的提交管线）"></textarea>
      <div class="qe-bot">
        <button class="qe-target" id="qeTargetBtn">目标：当前会话</button>
        <span class="qe-hint" id="qeHint"></span>
        <button class="qe-send" id="qeSend">发送</button></div>`;
    document.body.appendChild(bar);
    const ta = bar.querySelector('textarea');
    ta.onkeydown = e => {
      e.stopPropagation();
      if (e.key === 'Escape') { bar.hidden = true; return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); qeDoSend(); }
    };
    bar.querySelector('#qeSend').onclick = () => qeDoSend();
    bar.querySelector('#qeTargetBtn').onclick = e => { e.stopPropagation(); qeTargetMenu(e.currentTarget); };
    // blur 即隐藏（quick-entry.ts blur 隐藏语义）
    document.addEventListener('mousedown', ev => {
      if (bar.hidden) return;
      if (ev.target && ev.target.closest && ev.target.closest('.qe-bar')) return;
      bar.hidden = true;
    }, true);
  }
  const q = qeState();
  const v = qeNormalize(q.shortcut);
  bar.querySelector('#qeHint').textContent =
    (v && v.value ? qeDisplay(v.value) : '—') + ' 唤起 · Enter 发送 · Esc 关闭';
  const labels = { current: '当前会话', new: '新建会话' };
  bar.querySelector('#qeTargetBtn').textContent = '目标：' + (labels[q.target] || (S.plans.find(x => x.id === q.target) || {}).title || q.target);
}
function qeDoSend() {
  const bar = document.querySelector('.qe-bar');
  const ta = bar.querySelector('textarea');
  const text = ta.value;
  const res = qeSubmit(text);
  if (!res.ok) { toast(escapeHtml(res.err)); return; }
  ta.value = ''; bar.hidden = true;
  toast('已从快捷输入发出（同一提交管线）');
}
function qeTargetMenu(anchor) {
  const q = qeState();
  const recent = (S.plans || []).filter(x => !x.isGroup).slice(0, q.recentCount || 5);
  showMenu([
    { title: '发送目标（use-quick-entry-bridge.ts:21 近期会话固定 5 条）' },
    { label: (q.target === 'current' ? '✓ ' : '　') + '当前会话', action: () => { q.target = 'current'; save(true); qeRenderBar(); } },
    { label: (q.target === 'new' ? '✓ ' : '　') + '新建会话', action: () => { q.target = 'new'; save(true); qeRenderBar(); } },
    { sep: true },
    ...recent.map(pl => ({ label: (q.target === pl.id ? '✓ ' : '　') + pl.title,
      action: () => { q.target = pl.id; save(true); qeRenderBar(); } })),
  ], anchor);
}

/* ── §46.2 快捷输入设置页 ── */
function hermesQuickEntryHTML(pane) {
  const q = qeState();
  const v = qeNormalize(q.shortcut);
  const stateCls = !q.enabled ? 'off' : (v && v.error) ? 'err' : 'ok';
  const stateTxt = !q.enabled ? '已关闭（disabled 从不注册）'
    : (v && v.error) ? (v.error === 'taken' ? '被占用（taken）' : `非法（invalid）：${v.why}`)
    : '已注册（registered）';
  const recent = (S.plans || []).filter(x => !x.isGroup).slice(0, q.recentCount || 5);
  const labels = { current: '当前会话', new: '新建会话' };
  pane.innerHTML = hBar('快捷输入 · Quick Entry',
    '全局热键唤起的迷你窗：无边框常驻置顶、不带自己的网关连接，文本转发给主 renderer（Hermes §6）')
    + `<div class="hbody" style="flex-direction:column;overflow:auto">
      <div class="qe-set">
        <div class="hrow">
          <button type="button" class="hchk${q.enabled ? ' is-on' : ''}" id="qeEnabled">启用快捷输入</button>
          <span class="qe-state ${stateCls}">${stateTxt}</span>
          <span style="flex:1"></span>
          <span class="qe-hint" style="font-size:11.5px;color:#6B7680">页面内唤起：按下面这个组合（真·全局热键属 B 批，Swift 期用 RegisterEventHotKey + NSPanel）</span>
        </div>
        <div class="hrow">
          <span class="qe-hint">快捷键</span>
          <span class="qe-key${q.hkRecording ? ' rec' : ''}" id="qeKey">${q.hkRecording ? '请按组合键…' : escapeHtml(q.shortcut)}</span>
          <button class="hbtn" id="qeRec">${q.hkRecording ? '取消' : '录制'}</button>
          <span class="qe-hint">默认 <code>${QE_DEFAULT}</code>（对齐 Claude Desktop / ChatGPT Quick Chat 的 ⌘⇧ 肌肉记忆）</span>
          <span style="flex:1"></span>
          <button class="hbtn" id="qeReset">恢复默认</button>
          <button class="hbtn primary" id="qeOpen">打开浮条</button>
        </div>
        <div class="hrow">
          <span class="qe-hint">窗口几何（quick-entry.ts:24-28）：</span>
          <span class="qe-key">640×168</span><span class="qe-key">水平居中</span><span class="qe-key">顶部 22%</span>
          <span style="flex:1"></span>
          <label class="hrow" style="gap:7px">发送目标
            <select id="qeTarget" class="hbtn" style="padding:5px 8px">
              <option value="current"${q.target === 'current' ? ' selected' : ''}>当前会话</option>
              <option value="new"${q.target === 'new' ? ' selected' : ''}>新建会话</option>
              ${recent.map(pl => `<option value="${pl.id}"${q.target === pl.id ? ' selected' : ''}>${escapeHtml(pl.title)}</option>`).join('')}
            </select></label>
          <label class="hrow" style="gap:7px">近期会话
            <input type="number" id="qeRecent" value="${q.recentCount}" min="1" max="20" style="width:64px"></label>
        </div>
        <div class="hnote" style="font-size:12px;color:#8B96A0;line-height:1.8">
          <b>提交管线</b>：浮条 → 写入主输入框 → <code>sendChat()</code> —— 与手动输入**完全同一条**（one submit pipeline，无第二套 RPC）。<br>
          <b>注册状态</b>：仅主窗口注册（副窗口注册会一键发 N 条）；本页 <code>registered/error</code> 是实况。<br>
          <b>macOS 侧</b>（B 批）：Electron <code>globalShortcut</code> → RegisterEventHotKey；窗口 <code>type:'panel'</code>（NSPanel 不抢 ⌘Tab 焦点）、
          常驻置顶、blur 即隐藏、每次唤起重定位到光标所在显示器。
        </div>
      </div></div>`;
  hBindCommon(pane);
  const en = pane.querySelector('#qeEnabled');
  en.onclick = () => {
    q.enabled = !en.classList.contains('is-on');
    save(true); hermesQuickEntryHTML(pane);
    toast(q.enabled ? '快捷输入已启用' : '快捷输入已关闭（disabled 从不注册）');
  };
  pane.querySelector('#qeRec').onclick = () => { q.hkRecording = !q.hkRecording; save(true); hermesQuickEntryHTML(pane);
    if (q.hkRecording) toast('按新的组合键完成录制 · Esc 取消'); };
  pane.querySelector('#qeReset').onclick = () => { q.shortcut = QE_DEFAULT; q.hkRecording = false; save(true);
    hermesQuickEntryHTML(pane); toast('已恢复默认 ' + QE_DEFAULT); };
  pane.querySelector('#qeOpen').onclick = () => { qeRenderBar(); qeToggle(); };
  pane.querySelector('#qeTarget').onchange = e => { q.target = e.target.value; save(true); };
  pane.querySelector('#qeRecent').onchange = e => { q.recentCount = Math.max(1, Math.min(20, +e.target.value || 5));
    save(true); hermesQuickEntryHTML(pane); };
}

/* ── §46.3 多渠道（§4.1 总表）+ MessageEvent mock ── */
var H_CHANNELS = [
  { p: 'feishu', n: '飞书 / Lark', f: 'plugins/platforms/feishu/adapter.py', cn: true,
    proto: '官方 lark-oapi SDK · WebSocket（默认）/ webhook 双模', env: 'FEISHU_APP_ID · FEISHU_APP_SECRET', fs: true },
  { p: 'weixin', n: '微信（个人号）', f: 'gateway/platforms/weixin.py', cn: true,
    proto: '腾讯 iLink Bot API · 长轮询 getupdates + context_token 回信 + AES-128-ECB 媒体', env: 'WEIXIN_TOKEN · account_id',
    qr: 'qr_login 扫码登录（weixin.py:594）' },
  { p: 'qqbot', n: 'QQ 机器人', f: 'gateway/platforms/qqbot/adapter.py + onboard.py', cn: true,
    proto: 'QQ Bot API v2 · WebSocket 收 + REST(api.sgroup.qq.com) 发', env: 'app_id · client_secret',
    qr: '扫码 onboard（onboard.py:85 qr_register）' },
  { p: 'wecom', n: '企业微信', f: 'plugins/platforms/wecom/adapter.py', cn: true,
    proto: '回调/webhook + 加密（wecom_crypto.py）+ 发送队列', env: 'WECOM_*' },
  { p: 'dingtalk', n: '钉钉', f: 'plugins/platforms/dingtalk/adapter.py', cn: true,
    proto: '钉钉开放平台', env: 'DINGTALK_*' },
  { p: 'telegram', n: 'Telegram', f: 'plugins/platforms/telegram/adapter.py',
    proto: 'python-telegram-bot · 长轮询（可切 webhook）', env: 'TELEGRAM_BOT_TOKEN' },
  { p: 'discord', n: 'Discord', f: 'plugins/platforms/discord/adapter.py',
    proto: 'discord.py 网关（语音 / 线程 / 历史回填）', env: 'DISCORD_BOT_TOKEN' },
  { p: 'slack', n: 'Slack', f: 'plugins/platforms/slack/adapter.py',
    proto: 'slack-bolt Socket Mode（免公网）+ 原生流式 + slash 命令', env: 'SLACK_BOT_TOKEN · SLACK_APP_TOKEN' },
  { p: 'whatsapp', n: 'WhatsApp（个人）', f: 'plugins/platforms/whatsapp/adapter.py',
    proto: '本地 Node.js Baileys 桥 · HTTP 轮询', env: 'WHATSAPP_ENABLED' },
  { p: 'signal', n: 'Signal', f: 'gateway/platforms/signal.py',
    proto: 'signal-cli daemon HTTP · SSE 收 + JSON-RPC 2.0 发', env: 'SIGNAL_HTTP_URL · SIGNAL_ACCOUNT' },
  { p: 'email', n: 'Email', f: 'plugins/platforms/email/', proto: 'IMAP 收 / SMTP 发', env: 'EMAIL_*' },
  { p: 'sms', n: 'SMS（Twilio）', f: 'plugins/platforms/sms/', proto: 'Twilio', env: 'TWILIO_*' },
  { p: 'webhook', n: 'Webhook（通用入站）', f: 'gateway/platforms/webhook.py',
    proto: '用户脚本路由 · 30s 超时', env: 'WEBHOOK_SECRET' },
  { p: 'api_server', n: 'API Server', f: 'gateway/platforms/api_server.py',
    proto: 'OpenAI 兼容 http://localhost:8642/v1 + REST/WS', env: 'API_SERVER_KEY（≥16 字符）' },
  { p: 'relay', n: 'Relay（实验）', f: 'gateway/relay/', proto: '网关主动外拨 connector · CapabilityDescriptor 握手', env: 'GATEWAY_RELAY_*' },
  { p: 'matrix', n: 'Matrix', f: 'plugins/platforms/matrix/adapter.py', proto: 'Matrix 协议', env: 'MATRIX_*' },
];
const H_PLATFORM_ENUM = ['local', 'telegram', 'discord', 'whatsapp', 'whatsapp_cloud', 'slack', 'signal',
  'mattermost', 'matrix', 'homeassistant', 'email', 'sms', 'dingtalk', 'api_server', 'webhook',
  'msgraph_webhook', 'feishu', 'wecom', 'wecom_callback', 'weixin', 'bluebubbles', 'qqbot', 'yuanbao', 'relay'];
/// MessageEvent / SessionSource 形状（event.py:36、session.py:66）—— mock 入站用
function hMockMessageEvent(platform, text) {
  const rid = Math.random().toString(36).slice(2, 12);
  return { platform, chat_id: `oc_${rid}`, chat_type: 'p2p', thread_id: null,
    user_id: `ou_${Math.random().toString(36).slice(2, 12)}`, role: 'user',
    text, ts: Date.now(), source: { platform, chat_type: 'p2p' } };
}
const H_FS_STEP = ['未开始', '① init', '② begin（二维码）', '③ poll 轮询', '④ probe 校验', '✓ 完成'];
function hermesChannelsHTML(pane) {
  const H0 = hState2();
  const fs = H0.feishu || (H0.feishu = { step: 0, appId: '', appSecret: '', domain: '', openId: '', botName: '',
    connMode: 'websocket', auth: 'pairing', groupPolicy: 'open', err: '', busy: false, userCode: '',
    qrUrl: '', deviceCode: '', interval: 2, expireIn: 600, manual: false, log: [] });
  pane.innerHTML = hBar('多渠道通讯 · Channels',
    `Platform 枚举 ${H_PLATFORM_ENUM.length} 个 · 适配器 ${H_CHANNELS.length} 条（Hermes §4.1）`)
    + `<div class="hbody" style="flex-direction:column;overflow:auto">
      <div class="hch-enums"><b>Platform 枚举</b>（gateway/config.py:217-241，插件平台经 _missing_ 动态补）：<br>
        ${H_PLATFORM_ENUM.join(' · ')}</div>
      <div class="hch-grid">
        ${H_CHANNELS.map(c => `<div class="hch-card${c.fs ? ' hl' : ''}" data-ch="${c.p}">
          <div class="pn">${escapeHtml(c.n)}${c.cn ? '<span class="flag">中文渠道</span>' : ''}
            ${c.fs ? '<span class="flag" style="background:rgba(59,130,246,.25);color:#BFDBFE">可一键创建</span>' : ''}</div>
          <div class="meta"><b>adapter</b> ${escapeHtml(c.f)}<br>
            <b>接入</b> ${escapeHtml(c.proto)}<br>
            <b>凭据</b> ${escapeHtml(c.env)}${c.qr ? '<br><b>扫码</b> ' + escapeHtml(c.qr) : ''}</div>
          <div class="ops">
            ${c.fs ? `<button class="hbtn primary" data-chact="fs">🤖 一键创建飞书机器人</button>` : ''}
            <button class="hbtn" data-chact="inject" data-p="${c.p}">📨 注入一条入站消息</button>
          </div>
          ${c.fs ? hFeishuWizardHTML(fs) : ''}
        </div>`).join('')}
      </div>
      <div class="hset-sec">会话交接 handoff（sessions 表 handoff_state / handoff_platform）</div>
      <div class="hset-group"><div class="hset">
        <div class="tx"><div class="tt">把当前会话交接给一个渠道</div>
          <div class="ds">跨平台会话连续：交接后这条会话标记目标平台，侧栏行带「→平台」徽标；真投递与继续对话属 B 批（需要真渠道连接）。</div></div>
        <div class="ct">
          <select id="hoTarget"><option value="feishu">飞书</option><option value="telegram">Telegram</option>
            <option value="discord">Discord</option><option value="slack">Slack</option></select>
          <button class="hbtn primary" id="hoGo">交接</button>
          <button class="hbtn danger" id="hoUndo"${(() => {
            const id = (S.activePlan && S.activePlan !== 'default') ? S.activePlan : ((S.plans.find(x => !x.isGroup) || {}).id);
            const c = id ? S.plans.find(x => x.id === id) : null;
            return c && c.handoff ? '' : ' hidden';
          })()}>撤销交接</button>
        </div></div></div>
      <div class="hgw-note">协议层与真凭证属 B 批（真 WebSocket / 长轮询 / 扫码端点）—— 本页的注入与建号向导
        <b>网络全部 mock</b>，但请求/响应形状照 <code>adapter.py</code> 的端点与字段（§4.2 步骤行号写在步骤里）。</div>
    </div>`;
  hBindCommon(pane);
  // §49 handoff：给当前会话打交接标记（字段照 hermes_state_common sessions.handoff_*）
  const hoGo = pane.querySelector('#hoGo');
  if (hoGo) hoGo.onclick = () => {
    const target = pane.querySelector('#hoTarget').value;
    const id = (S.activePlan && S.activePlan !== 'default') ? S.activePlan : (S.plans.find(x => !x.isGroup) || {}).id;
    const conv = id ? (S.plans.find(x => x.id === id) || null) : null;
    if (!conv) { toast('没有可交接的会话（先在侧栏点一张对话卡）'); return; }
    conv.handoff = { platform: target, state: 'done', at: Date.now() };
    H0.handoffs[conv.id] = conv.handoff;
    hSave(); renderHermes(); renderNav();
    toast(`「${escapeHtml(conv.title)}」→ <b>${escapeHtml(hHandoffLabel(target))}</b>（handoff_state=done · 侧栏行已带徽标）`);
  };
  const hoUndo = pane.querySelector('#hoUndo');
  if (hoUndo) hoUndo.onclick = () => {
    const id = (S.activePlan && S.activePlan !== 'default') ? S.activePlan : (S.plans.find(x => !x.isGroup) || {}).id;
    const conv = id ? (S.plans.find(x => x.id === id) || null) : null;
    if (!conv || !conv.handoff) { toast('当前会话没有交接标记'); return; }
    const was = hHandoffLabel(conv.handoff.platform);
    delete conv.handoff; delete H0.handoffs[conv.id];
    hSave(); renderHermes(); renderNav();
    toast(`已撤销交接（原 → ${escapeHtml(was)}），会话回到本机`);
  };
  // ── §48 注入入站消息（mock，形状照真源码）──
  pane.querySelectorAll('[data-chact="inject"]').forEach(b => b.onclick = () => {
    const p = b.dataset.p;
    hMockInboundModal(p);
  });
  const fsBtn = pane.querySelector('[data-chact="fs"]');
  if (fsBtn) fsBtn.onclick = () => hFeishuWizardStep();
  const fsResetBtn = pane.querySelector('[data-chact="fsreset"]');
  if (fsResetBtn) fsResetBtn.onclick = () => {
    const fs = hState2().feishu;
    fs.step = 0; fs.err = ''; fs.busy = false; fs.log = [];
    hSave(); renderHermes(); toast('向导已重置');
  };
  const fsManualBtn = pane.querySelector('[data-chact="fsmanual"]');
  if (fsManualBtn) fsManualBtn.onclick = () => hFeishuManual();
}
/// 飞书一键创建：三步设备码流（§4.2 的 init / begin / poll，网络 mock）
function hFeishuWizardHTML(fs) {
  const s = fs.step;
  const step = (i, label) => `<span class="hfs-step${s === i ? ' on' : ''}${s > i ? ' done' : ''}">${label}</span>`;
  return `<div class="hfs">
    <div class="hfs-steps">${step(0, '准备')}<span>→</span>${step(1, '扫码授权')}<span>→</span>
      ${step(2, '轮询取凭证')}<span>→</span>${step(3, '校验 bot')}<span>→</span>${step(4, '接入配置')}
      <span style="flex:1"></span>
      <span class="qe-state ${fs.err ? 'err' : s >= 4 ? 'ok' : 'off'}">${fs.err ? escapeHtml(fs.err) : (s >= 4 ? '✓ 已就绪' : H_FS_STEP[s])}</span>
      ${s > 0 ? '<button class="hbtn sm" data-chact="fsreset">重来</button>' : ''}</div>
    <div class="hfs-body">
      ${s === 0 ? `入口 <code>hermes gateway setup</code> → 飞书 → <b>“Scan QR code to create a new bot automatically (recommended)”</b>
          （adapter.py:4361-4364）。端点 <code>POST accounts.feishu.cn/oauth/v1/app/registration</code>（:203-208）。`
        : s === 1 ? `<code>action=init</code> 确认环境支持 client_secret 认证（:4102）<br>
          <code>action=begin</code> archetype=<code>PersonalAgent</code> · auth_method=<code>client_secret</code> ·
          request_user_info=<code>open_id</code>（:4113）→ 拿 device_code / qr_url / user_code<br>
          <div class="qr">▛▀▀▀▀▀▀▀▀▜<br>▌ 📷 扫码授权 ▐<br>▙▄▄▄▄▄▄▄▄▟</div>
          user_code <code>${escapeHtml(fs.userCode || '—')}</code> · interval <code>${fs.interval}s</code> ·
          expire_in <code>${fs.expireIn}s</code>`
        : s === 2 ? `<code>action=poll</code> 按 interval 轮询（:4129）… ${fs.busy ? '等待手机飞书扫码…' : '（mock 3 次 pending 后成功）'}<br>
          ${fs.appId ? `app_id <code>${escapeHtml(fs.appId)}</code><br>app_secret <code>${escapeHtml(maskSecret(fs.appSecret))}</code><br>
            domain <code>${escapeHtml(fs.domain)}</code> · open_id <code>${escapeHtml(fs.openId)}</code>` : ''}`
        : s === 3 ? `<code>GET /bot/v3/info</code> probe_bot（:4197）→ bot 名 <code>${escapeHtml(fs.botName || '—')}</code><br>
          凭证写入 env：<code>FEISHU_APP_ID</code> / <code>FEISHU_APP_SECRET</code> / <code>FEISHU_DOMAIN</code>（:4405-4407）`
        : `凭证（已写入 env：FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_DOMAIN，:4405-4407）：
          <div class="hfs-cfg">
            <span class="hchip">bot ${escapeHtml(fs.botName || '—')}</span>
            <span class="hchip">app_id ${escapeHtml(fs.appId || '—')}</span>
            <span class="hchip">secret ${escapeHtml(maskSecret(fs.appSecret))}</span>
            <span class="hchip">domain ${escapeHtml(fs.domain || '—')}</span>
          </div>
          连接方式（:4409-4424，QR 路径固定 websocket）：
          <div class="hfs-cfg">
            <label><input type="radio" name="fscm" value="websocket" ${fs.connMode === 'websocket' ? 'checked' : ''}> WebSocket（推荐，免公网）</label>
            <label><input type="radio" name="fscm" value="webhook" ${fs.connMode === 'webhook' ? 'checked' : ''}> Webhook（默认 127.0.0.1:8765/feishu/webhook）</label>
          </div>
          <div class="hfs-cfg">
            <label>DM 授权：<select data-fs="auth" style="background:#161B20;color:#C7D2DA;border-radius:7px;padding:3px 7px;border:1px solid #333A41">
              <option value="pairing"${fs.auth === 'pairing' ? ' selected' : ''}>pairing 配对</option>
              <option value="allow-all"${fs.auth === 'allow-all' ? ' selected' : ''}>allow-all 全放行</option>
              <option value="allowlist"${fs.auth === 'allowlist' ? ' selected' : ''}>allowlist 白名单</option></select></label>
            <label>群策略 FEISHU_GROUP_POLICY=<select data-fs="gp" style="background:#161B20;color:#C7D2DA;border-radius:7px;padding:3px 7px;border:1px solid #333A41">
              <option value="open"${fs.groupPolicy === 'open' ? ' selected' : ''}>open（只在被 @ 时响应）</option>
              <option value="closed"${fs.groupPolicy === 'closed' ? ' selected' : ''}>closed</option></select></label>
            <button class="hbtn" data-chact="fsmanual">改用手输 App ID / Secret</button>
          </div>`}
    </div>
    ${s === 4 ? `<div class="hrow" style="margin-top:9px"><span class="qe-hint">事件订阅（:1429-1444，WS 模式无需在平台配回调）：</span>
      <span class="hchip">im.message.receive_v1</span><span class="hchip">message_read</span>
      <span class="hchip">reaction.created</span><span class="hchip">bot_p2p_chat_entered</span>
      <span class="hchip">drive.notice.comment_add_v1</span><span class="hchip">vc.bot.meeting_invited_v1</span></div>` : ''}
    ${fs.log.length ? `<div class="hme">${escapeHtml(fs.log.slice(-8).join('\n'))}</div>` : ''}
  </div>`;
}
function maskSecret(s) { return s ? s.slice(0, 4) + '••••' + s.slice(-4) : ''; }
function hFeishuWizardStep() {
  const H0 = hState2();
  const fs = H0.feishu;
  if (fs.busy) return;
  fs.err = ''; fs.busy = true;
  const log = m => { fs.log.push(`[${new Date().toLocaleTimeString()}] ${m}`); };
  if (fs.step === 0) {
    log('→ POST /oauth/v1/app/registration {action:"init"}');
    log('← 200 {"supported_client_secret_auth":true}（mock）');
    fs.step = 1;
    fs.userCode = 'HM-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    fs.qrUrl = 'https://accounts.feishu.cn/qr/' + Math.random().toString(36).slice(2, 10);
    fs.deviceCode = 'dc_' + Math.random().toString(36).slice(2, 14);
    fs.interval = 2; fs.expireIn = 600;
    log('→ {action:"begin", archetype:"PersonalAgent", auth_method:"client_secret", request_user_info:"open_id"}');
    log(`← device_code=${fs.deviceCode} qr_url=… user_code=${fs.userCode} interval=2 expire_in=600`);
    fs.busy = false; hSave(); renderHermes(); return;
  }
  if (fs.step === 1) {
    fs.step = 2; log('→ {action:"poll"}（每 2s 一次）'); fs.busy = false;
    hSave(); renderHermes();
    // mock：3 次 pending 后成功（real: adapter.py:4129 按 interval 轮询）
    let n = 0;
    const tick = () => {
      n++;
      if (n < 3) { log(`← {"status":"pending"} 第 ${n}/3 次（mock）`); hSave(); if (H0.view === 'channels') renderHermes(); setTimeout(tick, 650); return; }
      fs.appId = 'cli_a' + Math.random().toString(36).slice(2, 10);
      fs.appSecret = 'S3cr' + Math.random().toString(36).slice(2, 18);
      fs.domain = 'feishu.cn';
      fs.openId = 'ou_' + Math.random().toString(36).slice(2, 12);
      log(`← 200 app_id=${fs.appId} app_secret=${maskSecret(fs.appSecret)} domain=${fs.domain} open_id=${fs.openId}`);
      fs.step = 3; hSave(); if (H0.view === 'channels') renderHermes();
      setTimeout(() => { hFeishuWizardStep(); }, 700);
    };
    setTimeout(tick, 650);
    return;
  }
  if (fs.step === 3) {
    log('→ GET /bot/v3/info');
    fs.botName = 'Wanna 小助 · ' + Math.random().toString(36).slice(2, 5);
    log(`← 200 bot_name="${fs.botName}"`);
    fs.step = 4;
    fs.busy = false; hSave(); renderHermes();
    toast(`飞书机器人已创建：<b>${escapeHtml(fs.botName)}</b>（凭证已写入 FEISHU_APP_ID / SECRET / DOMAIN — mock）`);
    return;
  }
  fs.busy = false; hSave(); renderHermes();
}
function hFeishuManual() {
  const H0 = hState2();
  const fs = H0.feishu;
  askModal({ title: '手输 App ID / Secret', text: '（QR 路径失败时的回落：adapter.py:4371-4390）',
    value: `${fs.appId || 'cli_…'}|${fs.appSecret || '…'}`, okText: '保存并 probe',
    onOk: v => {
      const [id, sec] = String(v || '').split('|');
      if (!id || !sec) return false;
      fs.appId = id.trim(); fs.appSecret = sec.trim(); fs.domain = 'feishu.cn';
      fs.log.push(`[${new Date().toLocaleTimeString()}] 手输 app_id=${fs.appId}（回落路径）`);
      fs.log.push(`→ GET /bot/v3/info（手输路径 :4391 同样 probe）`);
      fs.step = 4; fs.botName = fs.botName || '手输接入的 bot';
      hSave(); renderHermes(); toast('已手输并完成 probe');
      return true;
    } });
}
function hMockInboundModal(platform) {
  const ch = H_CHANNELS.find(c => c.p === platform) || { n: platform };
  askModal({ title: `注入入站消息（${ch.n}）`,
    text: '会生成 MessageEvent / SessionSource 形状（event.py:36、session.py:66），并走主输入框同一条提交管线',
    value: `${ch.n} 收到：请总结一下当前看板状态`, okText: '注入并发送',
    onOk: v => {
      const text = String(v || '').trim();
      if (!text) return false;
      const ev = hMockMessageEvent(platform, text);
      const res = qeSubmit(text);
      if (!res.ok) { toast(escapeHtml(res.err)); return false; }
      setTimeout(() => toast(`<div style="font-family:var(--mono,monospace);font-size:11.5px;text-align:left">
        ${escapeHtml(JSON.stringify({ platform: ev.platform, chat_id: ev.chat_id, chat_type: ev.chat_type,
          thread_id: ev.thread_id, user_id: ev.user_id }))}</div>`), 120);
      return true;
    } });
}

/* ── 页面内唤起浮条的键位监听（真·全局热键属 B 批） ── */
function qeComboFromEvent(e) {
  const mods = [];
  if (e.metaKey) mods.push('CommandOrControl');      // macOS 的 ⌘ = CommandOrControl
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Option');
  if (e.shiftKey) mods.push('Shift');
  let k = null;
  if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) k = e.code.slice(5);
  else if (e.code === 'Space') k = 'Space';
  else if (/^F[0-9]{1,2}$/.test(e.code)) k = e.code;
  else if (e.key && e.key.length === 1) k = e.key.toUpperCase();
  else if (e.key) k = capitalize(e.key.replace('Arrow', '').toLowerCase());
  if (!k || ['Meta', 'Control', 'Alt', 'Shift', 'OS'].indexOf(k) >= 0) return null;
  const order = ['CommandOrControl', 'Control', 'Option', 'Shift'];
  mods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return mods.concat([k]).join('+');
}
(function bindQE() {
  qeRenderBar();
  document.addEventListener('keydown', e => {
    const q = S.quickEntry;
    // ── 录制态：吃掉这次按键并落盘（Esc 取消） ──
    if (q && q.hkRecording) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { q.hkRecording = false; save(true);
        if (hermesView === 'quickEntry') renderHermes(); return; }
      if (['Meta', 'Control', 'Alt', 'Shift', 'OS'].indexOf(e.key) >= 0) return;   // 只按了修饰键
      const combo = qeComboFromEvent(e);
      if (!combo) return;
      q.shortcut = combo; q.hkRecording = false; save(true);
      if (hermesView === 'quickEntry') renderHermes();
      const v = qeNormalize(combo);
      toast(v && v.error ? `已记录，但不可用：<b>${escapeHtml(v.why)}</b>` : `快捷键已改为 <b>${escapeHtml(combo)}</b>`);
      return;
    }
    if (!q || !q.enabled) return;
    const v = qeNormalize(q.shortcut);
    if (!v || v.error) return;
    const combo = qeComboFromEvent(e);
    if (!combo || combo.toLowerCase() !== String(v.value).toLowerCase()) return;
    e.preventDefault(); e.stopPropagation();
    qeToggle();
  }, true);
})();

/* ══ §48 Hermes 第四批：技能闭环（curator）· 全局会话搜索 · 命令面板动词 · Cron 定时 ══
   真值来源：agent/curator.py（技能生命周期/报表）、tools/session_search_tool.py:619（搜索形）、
   cron/jobs.py:773 parse_schedule（四写法）+ :1800 create_job（job 字段）、
   gateway/delivery.py:155 DeliveryRouter（投递目标）、cli.py:1159 _SLASH_DISPATCH（斜杠动词）。
   原型边界：策展/体检/解析 = 纯函数真逻辑；投递与定时执行 = 假 timer + mock（真调度属 Swift 期）。 */

/* ── 纯函数区 ── */
/// 全局会话搜索：标题 + preview 跨会话，带命中片段与 mock 摘要（session_search_tool.py:619 形态）
function hGlobalSearch(q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return [];
  const out = [];
  hAllConvPools().forEach(({ scope, pool }) => pool.forEach(c => {
    if (c.isGroup) return;
    const title = c.title || '', prev = c.preview || '';
    const hay = (title + ' ' + prev).toLowerCase();
    if (hay.indexOf(needle) < 0) return;
    const src = prev.toLowerCase().indexOf(needle) >= 0 ? prev : title;
    const at = src.toLowerCase().indexOf(needle);
    const frag = at < 0 ? src.slice(0, 60)
      : (at > 24 ? '…' : '') + src.slice(Math.max(0, at - 24), at + needle.length + 40);
    let hits = 0, p = 0;
    while ((p = hay.indexOf(needle, p)) >= 0) { hits++; p += needle.length; }
    const when = c.ts ? new Date(c.ts).toLocaleString() : '时间未知';
    out.push({ conv: c, scope, frag, hits,
      summary: `${when} · 命中 ${hits} 处 · 最近消息「${(prev || title).slice(0, 38)}」与「${q}」相关` });
  }));
  return out.sort((a, b) => (b.conv.ts || 0) - (a.conv.ts || 0));
}
/// 技能 frontmatter（agentskills.io 兼容形：name + description + 正文）
function hSkillFrontmatter(sk) {
  return `---\nname: ${sk.name}\ndescription: ${sk.description || ''}\n---\n\n${sk.body || ''}`;
}
/// curator 策展（curator.py 语义）：90 天未用 → review，180 天 → archived；
/// 报表 added = 上次策展以来新建的技能数（照 curator.py:781 的 Added/Reviewed/Archived 三行）
function hCurateSkills() {
  const H0 = hState2();
  const now = Date.now(), DAY = 86400000;
  const since = H0.lastSkillCurate || 0;
  const rep = { added: H0.skills.filter(s => (s.created || 0) > since).length, reviewed: 0, archived: 0 };
  H0.skills.forEach(s => {
    if (s.state === 'archived') return;
    const idle = (now - (s.lastUsedAt || now)) / DAY;
    if (idle > 180) { s.state = 'archived'; rep.archived++; }
    else if (idle > 90 && s.state !== 'review') { s.state = 'review'; rep.reviewed++; }
  });
  H0.lastSkillCurate = now;
  hSave();
  return rep;
}
/// 技能体检（skill_linter 语义）：缺 description / 正文过短
function hLintSkills() {
  const issues = [];
  hState2().skills.forEach(s => {
    if (!s.description) issues.push({ name: s.name, why: '缺 description（frontmatter 必填）' });
    if (!s.body || s.body.length < 20) issues.push({ name: s.name, why: '正文过短（<20 字）' });
  });
  return issues;
}
/// schedule 解析（cron/jobs.py:773 四写法）：30m · every 2h · crontab「0 12 * * *」· ISO
function hcParseSchedule(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, err: '空' };
  const now = Date.now();
  const unit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
  let m = s.match(/^(\d+)([smhd])$/i);
  if (m) {
    const ms = +m[1] * unit[m[2].toLowerCase()];
    if (!ms) return { ok: false, err: '数值必须 > 0' };
    return { ok: true, kind: 'duration', next: now + ms };
  }
  m = s.match(/^every\s+(\d+)([smhd])$/i);
  if (m) {
    const ms = +m[1] * unit[m[2].toLowerCase()];
    if (!ms) return { ok: false, err: '数值必须 > 0' };
    return { ok: true, kind: 'every', next: now + ms };
  }
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(s)) {
    const t = Date.parse(s.replace(' ', 'T'));
    if (isNaN(t)) return { ok: false, err: 'ISO 时间解析失败' };
    if (t <= now) return { ok: false, err: 'ISO 时间已过去' };
    return { ok: true, kind: 'iso', next: t };
  }
  const parts = s.split(/\s+/);
  if (parts.length === 5) {
    const fields = parts.map(hcCronField);
    if (fields.some(f => !f)) return { ok: false, err: 'crontab 字段不合法（支持 * / */n / 数字 / a-b / a,b）' };
    const t = hcCronNext(fields, now);
    if (!t) return { ok: false, err: '未来 7 天内无匹配' };
    return { ok: true, kind: 'crontab', next: t };
  }
  return { ok: false, err: '不认识。支持：30m · every 2h · crontab「0 12 * * *」· ISO「2026-10-04T12:00」' };
}
function hcCronField(f) {
  if (f === '*') return { any: true };
  const st = f.match(/^\*\/(\d+)$/);
  if (st) return { step: +st[1] };
  const set = new Set();
  for (const part of f.split(',')) {
    const r = part.match(/^(\d+)-(\d+)$/);
    if (r) { for (let i = +r[1]; i <= +r[2]; i++) set.add(i); continue; }
    if (/^\d+$/.test(part)) { set.add(+part); continue; }
    return null;
  }
  if (set.has(7)) set.add(0);                 // dow 7 = 周日
  return { set };
}
function hcCronFieldHas(f, v) {
  if (f.any) return true;
  if (f.step) return v % f.step === 0;
  return f.set.has(v);
}
function hcCronNext(fields, from) {
  const [min, hour, dom, mon, dow] = fields;
  let t = Math.floor(from / 60000) * 60000 + 60000;
  const limit = t + 7 * 86400000;
  while (t <= limit) {
    const d = new Date(t);
    if (hcCronFieldHas(min, d.getMinutes()) && hcCronFieldHas(hour, d.getHours())
      && hcCronFieldHas(dom, d.getDate()) && hcCronFieldHas(mon, d.getMonth() + 1)
      && hcCronFieldHas(dow, d.getDay())) return t;
    t += 60000;
  }
  return 0;
}
/// 重算某任务的下次运行（新增/触发后 re-arm 用）
function hcScheduleNext(schedule) {
  const r = hcParseSchedule(schedule);
  return r.ok ? r.next : (Date.now() + 3600e3);
}

/* ── 技能页（curator / linter / skills_hub / 存成技能） ── */
function hermesSkillsHTML(pane) {
  const H0 = hState2();
  const skills = H0.skills;
  const stateBadge = s => s.state === 'archived' ? '<span class="hbadge" style="background:rgba(255,255,255,.08);color:var(--ink3)">已归档</span>'
    : s.state === 'review' ? '<span class="hbadge" style="background:rgba(251,191,36,.18);color:#FDE68A">待回顾</span>'
    : '<span class="hbadge pin">active</span>';
  // 可沉淀轮次 = 当前对话的用户消息（真数据，不造假）
  const drafts = (S.chat || []).filter(m => m.role === 'user')
    .map(m => String(m.html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter(t => t.length >= 6).slice(-3).reverse();
  pane.innerHTML = hBar('技能 · 闭环学习（Skills）',
    `${skills.length} 个 · curator 策展 + 体检 + skills_hub 安装（agent/curator.py · README「闭环学习」）`, hCurChip())
    + `<div class="hbody" style="flex-direction:column;overflow:auto">
      <div class="hset-sec">从最近轮次沉淀技能（复杂任务后自动建技能 —— 原型由你点确认，门面照 skill_manage action=create）</div>
      <div class="hset-group">${drafts.length ? drafts.map((t, i) => `
        <div class="hset"><div class="tx"><div class="tt" style="font-weight:400">${escapeHtml(t.slice(0, 90))}${t.length > 90 ? '…' : ''}</div>
          <div class="ds">来源：当前会话第 ${i + 1} 条用户消息</div></div>
          <div class="ct"><button class="hbtn primary" data-skact="draft" data-i="${i}">存成技能</button></div></div>`).join('')
        : '<div class="hset"><div class="tx"><div class="ds">（当前会话还没有可沉淀的用户消息 —— 先聊几句）</div></div></div>'}</div>
      <div class="hrow" style="padding:8px 16px 0">
        <button class="hbtn" data-skact="curate">🧰 立即策展（curator）</button>
        <button class="hbtn" data-skact="lint">🩺 技能体检（linter）</button>
        <span style="flex:1"></span>
        <input id="skHub" placeholder="github.com/user/repo 或技能名" style="width:230px;background:#101418;border:1px solid var(--line,#2A2E33);border-radius:8px;color:var(--ink,#EDEEF0);padding:6px 10px;font-size:12.5px">
        <button class="hbtn primary" data-skact="hub">从 skills_hub 安装</button>
      </div>
      <div id="skReport" class="hnote" style="padding:8px 16px 0"></div>
      <div class="hset-sec">技能清单</div>
      <div class="hgw" style="padding:0 16px 16px">${skills.map(sk => `
        <div class="hgw-card${sk.state === 'archived' ? ' is-quar' : ''}">
          <div class="hgw-top"><span class="hgw-label" style="font-weight:600">${escapeHtml(sk.name)}</span>
            ${stateBadge(sk)}
            <span class="hchip on" style="margin-left:auto" title="skill_usage 计数">用过 ${sk.usage} 次</span></div>
          <div class="hgw-fields" style="display:block;font-size:12px;line-height:1.7;color:#C7D2DA">
            ${sk.description ? escapeHtml(sk.description) : '<span style="color:#FDE68A">⚠ 缺 description</span>'}
            <br><span style="color:var(--ink3);font-size:11px">最后使用：${sk.lastUsedAt ? new Date(sk.lastUsedAt).toLocaleDateString() : '—'} · 来源 ${escapeHtml(sk.source || 'local')}</span></div>
          <div class="hgw-ops">
            <button class="hbtn ghost sm" data-skact="editdesc" data-id="${sk.id}">编辑描述</button>
            <button class="hbtn" data-skact="use" data-id="${sk.id}"${sk.state === 'archived' ? ' disabled' : ''}>引用一次（[SKILL:]）</button>
            ${sk.state === 'archived'
              ? `<button class="hbtn" data-skact="restore" data-id="${sk.id}">恢复</button>`
              : `<button class="hbtn" data-skact="archive" data-id="${sk.id}">归档</button>`}
            <button class="hbtn ghost" data-skact="view" data-id="${sk.id}">SKILL.md</button>
            <button class="hbtn danger" data-skact="del" data-id="${sk.id}">删除</button>
          </div></div>`).join('') || '<div class="hempty">没有技能。</div>'}</div>
    </div>`;
  hBindCommon(pane);
  // ⚠️ report 必须现查：curate/hub 都会 renderHermes() 整页重绘，捕获的旧节点会游离（§48 实测踩到）
  const say = html => { const el = pane.querySelector('#skReport'); if (el) el.innerHTML = html; };
  pane.querySelectorAll('[data-skact]').forEach(b => b.onclick = () => {
    const act = b.dataset.skact, id = b.dataset.id;
    if (act === 'draft') {
      const text = drafts[+b.dataset.i];
      const slug = (String(text).toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)) || 'new-skill';
      askModal({ title: '存成技能（skill_manage action=create）', text: '会生成 frontmatter（name + description）+ 正文；description 可稍后在列表里补',
        value: slug, okText: '创建', onOk: v => {
          const nm = (v || '').trim(); if (!nm) return false;
          if (H0.skills.some(s => s.name === nm)) { toast('同名技能已存在'); return false; }
          H0.skills.push({ id: hNewId('sk'), name: nm, description: text.slice(0, 60),
            body: text, usage: 0, lastUsedAt: Date.now(), created: Date.now(), state: 'active', source: 'draft' });
          hSave(); renderHermes(); renderHermesNav();
          toast(`已创建 <b>${escapeHtml(nm)}</b>（frontmatter name+description 已生成）`);
          return true;
        } });
      return;
    }
    if (act === 'curate') {
      const rep = hCurateSkills(); renderHermes(); renderHermesNav();
      say(`<b>curator 报表</b>（curator.py:781 形状）：<br>
        Added（本轮新建）${rep.added} · Reviewed（转待回顾）${rep.reviewed} · Archived（归档）${rep.archived}
        <br>规则：闲置 &gt;90 天 → 待回顾；&gt;180 天 → 归档。`);
      toast(`策展完成：新建 ${rep.added} · 回顾 ${rep.reviewed} · 归档 ${rep.archived}`);
      return;
    }
    if (act === 'lint') {
      const iss = hLintSkills();
      say(iss.length ? `<b>体检 ${iss.length} 处问题</b>：` + iss.map(x => `<br>⚠ <code>${escapeHtml(x.name)}</code> — ${escapeHtml(x.why)}`).join('')
        : '<b>体检通过</b>：所有技能都有 description 且正文不短。');
      toast(iss.length ? `体检发现 ${iss.length} 处问题` : '体检通过');
      return;
    }
    if (act === 'hub') {
      const slug = (pane.querySelector('#skHub').value || '').trim();
      if (!slug) { toast('先填 github.com/user/repo 或技能名'); return; }
      say(`skills_hub：正在从 <code>${escapeHtml(slug)}</code> 拉取…（mock：网络安装属 B 批）`);
      setTimeout(() => {
        const nm = slug.split('/').pop().replace(/\.git$/, '') || 'hub-skill';
        if (H0.skills.some(s => s.name === nm)) { say(`skills_hub：<b>${escapeHtml(nm)}</b> 已存在，跳过`); toast('已存在同名技能'); return; }
        H0.skills.push({ id: hNewId('sk'), name: nm, description: `从 skills_hub 安装（${slug}）`,
          body: `hub 源：${slug}\n\n安装于 ${new Date().toLocaleString()}。`, usage: 0, lastUsedAt: Date.now(),
          created: Date.now(), state: 'active', source: 'hub' });
        hSave(); renderHermes(); renderHermesNav();
        say(`skills_hub：✓ 已安装 <b>${escapeHtml(nm)}</b>（source=hub）`);
        toast(`已安装「${escapeHtml(nm)}」`);
      }, 400);
      return;
    }
    const sk = H0.skills.find(x => x.id === id); if (!sk) return;
    if (act === 'use') { sk.usage++; sk.lastUsedAt = Date.now();
      if (sk.state === 'review') sk.state = 'active';           // 用过就从待回顾拉回 active
      hSave(); renderHermes(); renderHermesNav();
      toast(`[SKILL:${escapeHtml(sk.name)}] → 正文已注入本轮（usage=${sk.usage}）`); return; }
    if (act === 'archive') { sk.state = 'archived'; hSave(); renderHermes(); renderHermesNav(); toast('已归档'); return; }
    if (act === 'restore') { sk.state = 'active'; hSave(); renderHermes(); renderHermesNav(); toast('已恢复 active'); return; }
    if (act === 'editdesc') {
      askModal({ title: `编辑描述 — ${sk.name}`,
        text: 'frontmatter 的 description（linter 报「缺 description」就是补这里）',
        value: sk.description || '', okText: '保存', onOk: v => {
          sk.description = String(v || '').trim(); hSave(); renderHermes();
          toast('描述已保存（SKILL.md frontmatter 已更新）');
        } });
      return;
    }
    if (act === 'view') { askModal({ title: `SKILL.md — ${sk.name}`, text: hSkillFrontmatter(sk), okText: '关闭' }); return; }
    if (act === 'del') { confirmModal({ title: '删除技能', text: `将删除 ${sk.name}（含正文）`, okText: '删除',
      onOk: () => { H0.skills = H0.skills.filter(x => x.id !== id); hSave(); renderHermes(); renderHermesNav(); toast('已删除'); } }); return; }
  });
}

/* ── Cron 定时任务页（cron/jobs.py 字段 + delivery.py 投递目标；执行=假 timer） ── */
function hermesCronHTML(pane) {
  const H0 = hState2();
  const jobs = H0.cronJobs;
  const targets = ['当前会话', '默认对话卡', '渠道 · 飞书（mock）', '渠道 · Telegram（mock）'];
  const fmt = t => t ? new Date(t).toLocaleString() : '—';
  pane.innerHTML = hBar('定时任务 · Cron',
    `${jobs.filter(j => j.enabled).length}/${jobs.length} 活跃 · schedule 四写法（cron/jobs.py:773）· 投递（delivery.py:155）· 执行=假 timer`, '')
    + `<div class="hbody" style="flex-direction:column;overflow:auto">
      <div class="hset-sec">新建任务</div>
      <div class="hset-group"><div class="hform" style="padding:10px 14px">
        <div class="hrow">
          <label style="flex:1">任务名<input id="cjName" placeholder="例如：每晚总结"></label>
          <label style="flex:1.5">schedule（30m · every 2h · crontab「0 12 * * *」· ISO「2026-10-04T12:00」）
            <input id="cjSched" placeholder="every 2h"></label>
          <label style="flex:1">投递到<select id="cjTarget">${targets.map(t => `<option>${t}</option>`).join('')}</select></label>
        </div>
        <div class="hrow"><span class="hnote" id="cjParse" style="margin:0">输入 schedule 即时解析…</span>
          <span style="flex:1"></span>
          <button class="hbtn primary" data-cjact="add">＋ 添加任务</button></div>
      </div></div>
      <div class="hset-sec">任务列表</div>
      <div class="hset-group">${jobs.map(j => `
        <div class="hset">
          <div class="tx"><div class="tt">${escapeHtml(j.name)}${j.enabled ? '' : ' <span style="color:var(--ink3);font-weight:400">（已停）</span>'}</div>
            <div class="ds"><code>${escapeHtml(j.schedule)}</code>
              → 下次 ${fmt(j.nextRun)} · 上次 ${fmt(j.lastRun)} · 已跑 ${j.runs} 次 · 投递 ${escapeHtml(j.target)}</div></div>
          <div class="ct">
            <button class="hbtn primary" data-cjact="run" data-id="${j.id}">立即触发</button>
            <button class="hbtn" data-cjact="edit" data-id="${j.id}">编辑</button>
            <button class="hbtn" data-cjact="toggle" data-id="${j.id}">${j.enabled ? '停用' : '启用'}</button>
            <button class="hbtn danger" data-cjact="del" data-id="${j.id}">删除</button>
          </div></div>`).join('') || '<div class="hset"><div class="tx"><div class="ds">还没有定时任务。</div></div></div>'}</div>
      <div class="hnote" style="padding:4px 16px 16px">执行 = 每 15 秒一次的假 timer 检查 <code>nextRun</code>（真调度与真投递属 Swift 期）；
        解析器是<b>真逻辑</b>：duration / every / crontab（7 天内逐分扫）/ ISO 四种写法都能算出 nextRun。</div>
    </div>`;
  hBindCommon(pane);
  const sched = pane.querySelector('#cjSched');
  const parseEl = pane.querySelector('#cjParse');
  const showParse = () => {
    const r = hcParseSchedule(sched.value);
    parseEl.innerHTML = r.ok
      ? `<span style="color:#86EFAC">✓ ${r.kind}</span> → ${new Date(r.next).toLocaleString()}`
      : `<span style="color:#FCA5A5">✗ ${escapeHtml(r.err)}</span>`;
  };
  if (sched) { sched.oninput = showParse; sched.onkeydown = e => e.stopPropagation(); }
  pane.querySelectorAll('[data-cjact]').forEach(b => b.onclick = () => {
    const act = b.dataset.cjact, id = b.dataset.id;
    if (act === 'add') {
      const name = (pane.querySelector('#cjName').value || '').trim();
      const sc = (pane.querySelector('#cjSched').value || '').trim();
      if (!name) return toast('先填任务名');
      const r = hcParseSchedule(sc);
      if (!r.ok) return toast('schedule 不合法：' + r.err);
      jobs.push({ id: hNewId('cj'), name, schedule: sc, target: pane.querySelector('#cjTarget').value,
        enabled: true, nextRun: r.next, lastRun: 0, runs: 0 });
      hSave(); renderHermes(); renderHermesNav();
      toast(`已添加「${escapeHtml(name)}」（${r.kind} → ${new Date(r.next).toLocaleString()}）`);
      return;
    }
    const j = jobs.find(x => x.id === id); if (!j) return;
    if (act === 'run') {
      j.runs++; j.lastRun = Date.now(); j.nextRun = hcScheduleNext(j.schedule);
      hSave(); renderHermes(); renderHermesNav();
      toast(`⏰ 「${escapeHtml(j.name)}」已触发 → 投递到 ${escapeHtml(j.target)}（mock）· 下次 ${new Date(j.nextRun).toLocaleString()}`);
      return;
    }
    if (act === 'edit') {
      askModal({ title: '编辑任务', text: '格式：任务名|schedule（如 每晚总结|every 6h）',
        value: `${j.name}|${j.schedule}`, okText: '保存', onOk: v => {
          const [nm, sc] = String(v || '').split('|');
          const name = (nm || '').trim(), schedule = (sc || '').trim();
          if (!name || !schedule) { toast('两个字段都要填'); return false; }
          const r = hcParseSchedule(schedule);
          if (!r.ok) { toast('schedule 不合法：' + r.err); return false; }
          j.name = name; j.schedule = schedule; j.nextRun = r.next;
          hSave(); renderHermes(); renderHermesNav();
          toast(`已更新「${escapeHtml(name)}」→ 下次 ${new Date(r.next).toLocaleString()}`);
        } });
      return;
    }
    if (act === 'toggle') { j.enabled = !j.enabled;
      if (j.enabled && (!j.nextRun || j.nextRun < Date.now())) j.nextRun = hcScheduleNext(j.schedule);
      hSave(); renderHermes(); renderHermesNav(); toast(j.enabled ? '已启用' : '已停用'); return; }
    if (act === 'del') { confirmModal({ title: '删除定时任务', text: j.name, okText: '删除',
      onOk: () => { H0.cronJobs = jobs.filter(x => x.id !== id); hSave(); renderHermes(); renderHermesNav(); toast('已删除'); } }); return; }
  });
}

/* ══ §49 Hermes 第五批：tool_search 渐进披露 · 终端后端 · 流式编辑 · 子代理 delegate · handoff · 轨迹 ══
   真值来源：tools/tool_search.py:1-12（三桥与不变量）、tools/terminal_tool_backends.py:54（7 后端）、
   tools/delegate_tool.py:440（隔离子代理）、原生流四不变量（DISSECT B 批）、
   hermes_state_common.py sessions.handoff_state/handoff_platform、batch_runner/trajectory_compressor。
   原型边界：披露=展示层（真接入用官方 defer_loading+ToolSearchTool / tool_filter）；终端后端=只存配置；
   delegate=mock 进度；轨迹压缩=纯函数截断；handoff=状态与徽标（真投递属 B 批）。 */

/* ── §49 辅助纯函数 ── */
function hHandoffLabel(platform) {
  return { feishu: '飞书', telegram: 'Telegram', discord: 'Discord', slack: 'Slack' }[platform] || platform;
}
/// 轨迹 = 会话的步骤回放（batch_runner 的极简形；数据取 title/msgs/preview 真字段）
function hGenTrajectory(convId) {
  const f = hFindConv(convId);
  if (!f) return null;
  const c = f.conv;
  return {
    convId, title: c.title || '未命名', generatedAt: Date.now(), compressed: null,
    steps: [
      { t: '收到请求', d: c.title || '（无标题）' },
      { t: '会话上下文', d: `${f.scope.kind === 'default' ? '默认区' : '项目 ' + (f.scope.project || {}).name} · msgs≈${c.msgs || 0}${c.sid ? ' · ' + c.sid : ''}` },
      { t: '最近消息', d: (c.preview || '（没有 preview）').slice(0, 100) },
      { t: '终态', d: c.archived ? '已归档' : '进行中/未归档' },
    ],
  };
}
/// 轨迹压缩（trajectory_compressor 的极简形）：N 步 → 3 行（首 / 中间合并 / 尾）
function hCompressTrajectory(steps) {
  if (steps.length <= 3) return steps.map(s => `${s.t}：${s.d}`);
  const head = `${steps[0].t}：${steps[0].d}`;
  const tail = `${steps[steps.length - 1].t}：${steps[steps.length - 1].d}`;
  const mid = `中间 ${steps.length - 2} 步合并：` + steps.slice(1, -1).map(s => s.t).join(' → ');
  return [head, mid, tail];
}
function hTrajectoryHTML(tj) {
  if (!tj) return '（还没生成轨迹 —— 选个会话点「生成轨迹」）';
  const body = tj.compressed
    ? `<b>压缩 ${tj.steps.length} 步 → ${tj.compressed.length} 行</b><br>` + tj.compressed.map((l, i) => `${i + 1}. ${escapeHtml(l)}`).join('<br>')
    : `<b>${tj.steps.length} 步</b> · ${escapeHtml(tj.title)}<br>` + tj.steps.map((s, i) => `${i + 1}. <b>${escapeHtml(s.t)}</b> ${escapeHtml(s.d)}`).join('<br>');
  return body;
}

/* ── 工具页（三个 tab：披露 / 终端后端 / 流式编辑） ── */
/// 代表清单：core = 模型侧 tag/内建工具；mcp = MCP 直连工具。
/// 真值锚点（AGENTS.md 2026-09-29 实测）：全量 18 个工具 / 8 020 字符；删 firecrawl 前 45 个 / 54 624 字符。
const H_TOOL_CATALOG = [
  { n: 'point', g: 'core', c: 210 }, { n: 'click', g: 'core', c: 480 }, { n: 'scroll', g: 'core', c: 320 },
  { n: 'type', g: 'core', c: 350 }, { n: 'press', g: 'core', c: 410 }, { n: 'open', g: 'core', c: 260 },
  { n: 'wait', g: 'core', c: 180 }, { n: 'ax_tree', g: 'core', c: 520 }, { n: 'shape', g: 'core', c: 440 },
  { n: 'skill', g: 'core', c: 390 }, { n: 'run', g: 'core', c: 560 }, { n: 'search', g: 'core', c: 300 },
  { n: 'anysearch.search', g: 'mcp', c: 640 }, { n: 'anysearch.extract', g: 'mcp', c: 580 },
  { n: 'notion.create_page', g: 'mcp', c: 720 }, { n: 'notion.search', g: 'mcp', c: 510 },
  { n: 'image.generate', g: 'mcp', c: 470 }, { n: 'tts.speech', g: 'mcp', c: 390 },
];
const H_BRIDGE_TOOLS = [
  { n: 'tool_search', d: '按自然语言/关键词查工具目录，返回匹配的名字与一句话说明（每次最多 7 个查询）', schema: '{ queries: string[] } → { matches: [{name, summary}] }' },
  { n: 'tool_describe', d: '取指定工具的完整描述与参数 schema（每次最多 10 个名字）', schema: '{ names: string[] } → { tools: [{name, description, input_schema}] }' },
  { n: 'tool_call', d: '调用一个已 describe 过的工具，参数按 schema 校验', schema: '{ name: string, args: object } → { result }' },
];
const H_TERM_BACKENDS = [
  { k: 'local', n: 'local 本地', fields: [['cwd', '/Users/you/project']] },
  { k: 'docker', n: 'docker', fields: [['image', 'python:3.12-slim'], ['volumes', '.:/work'], ['workdir', '/work']] },
  { k: 'ssh', n: 'ssh 远程主机', fields: [['host', 'gpu-01.internal'], ['user', 'root'], ['key_path', '~/.ssh/id_ed25519']] },
  { k: 'singularity', n: 'singularity', fields: [['image', './env.sif']] },
  { k: 'modal', n: 'modal 云沙箱', fields: [['image', 'ghcr.io/you/env:latest'], ['cpu', '4']] },
  { k: 'daytona', n: 'daytona', fields: [['snapshot', 'base-python@v2']] },
  { k: 'vercel_sandbox', n: 'vercel_sandbox', fields: [['project', 'you/sandbox-env']] },
];

function hermesToolsHTML(pane) {
  const H0 = hState2();
  const tab = H0.toolsTab || 'disclose';
  const mode = H0.toolDisclosure || 'full';
  const side = `<div class="hprof-list">
      <div class="hcol-head" style="padding:2px 2px 8px">工具（Tools）</div>
      <div class="hside">
        <div class="hside-item${tab === 'disclose' ? ' is-on' : ''}" data-ttab="disclose"><span class="ic">🔍</span>工具披露</div>
        <div class="hside-item${tab === 'terminal' ? ' is-on' : ''}" data-ttab="terminal"><span class="ic">🖥️</span>终端后端</div>
        <div class="hside-item${tab === 'stream' ? ' is-on' : ''}" data-ttab="stream"><span class="ic">🌊</span>流式编辑</div>
      </div>
      <div class="hnote" style="padding:12px 4px 0;line-height:1.8">
        <b>披露</b>：全量清单 vs tool_search 三桥（展示层）<br>
        <b>后端</b>：7 种执行环境，只存配置<br>
        <b>流式</b>：四不变量 demo<br>
        <span style="opacity:.6">真接入走官方口子（defer_loading + ToolSearchTool / tool_filter），不自造机制。</span></div>
    </div>`;

  let body = '';
  if (tab === 'disclose') {
    const fullChars = 8020, bridgeChars = 700;
    body = `<div class="hcrumb"><b>工具</b><span class="sep">›</span>工具披露</div>
      <div class="hrow" style="padding:6px 16px 0">
        <span class="hsub">披露模式：</span>
        <button class="hbtn${mode === 'full' ? ' primary' : ''}" data-tact="mode-full">全量披露（18 个 / 8 020 字符，实测）</button>
        <button class="hbtn${mode === 'progressive' ? ' primary' : ''}" data-tact="mode-prog">渐进披露（3 桥 ≈700 字符，估算）</button>
        <span style="flex:1"></span>
        <span class="hsub">省下 ≈ <b>${mode === 'full' ? '0' : (fullChars - bridgeChars).toLocaleString()}</b> 字符上下文</span>
      </div>
      ${mode === 'full' ? `
        <div class="hset-sec">模型可见数组 —— 全量（tool_search.py:9：核心工具与门控工具集永不延迟）</div>
        <div class="hgw" style="padding:0 16px 8px">${H_TOOL_CATALOG.map(t => `
          <div class="hgw-card" style="padding:9px 11px"><div class="hgw-top">
            <span class="hgw-kind ${t.g === 'core' ? 'local' : 'cloud'}">${t.g}</span>
            <span class="hgw-label">${escapeHtml(t.n)}</span>
            <span class="hsub" style="margin-left:auto">≈${t.c} 字符</span></div></div>`).join('')}
        </div>
        <div class="hnote" style="padding:0 16px 14px">合计口径按实测：<b>18 个工具 / 8 020 字符</b>（2026-09-29 删 firecrawl 后）；
          上表为等量级的代表清单（逐条字符数为示意，总数锚在实测值上）。历史极值 45 个 / 54 624 字符（含 MCP 全挂时）。</div>`
      : `
        <div class="hset-sec">渐进披露 —— 模型只见三座桥（tool_search.py:1-12）</div>
        <div class="hgw" style="padding:0 16px 8px">${H_BRIDGE_TOOLS.map(b => `
          <div class="hgw-card is-primary"><div class="hgw-top">
            <span class="hgw-label">${b.n}</span><span class="hchip on" style="margin-left:auto">bridge</span></div>
            <div class="hgw-fields" style="display:block;font-size:12px;line-height:1.7;color:#C7D2DA">${escapeHtml(b.d)}
              <br><code style="font-size:11px;color:#9FD0FF">${escapeHtml(b.schema)}</code></div></div>`).join('')}
        </div>
        <div class="hset-sec">桥上试一把（本地过滤，不出网）</div>
        <div style="padding:0 16px 8px" class="hrow">
          <input id="tsQuery" placeholder="搜工具：点 / notion / 搜索…" style="width:240px;background:#101418;border:1px solid var(--line,#2A2E33);border-radius:8px;color:var(--ink,#EDEEF0);padding:6px 10px;font-size:12.5px">
          <button class="hbtn primary" data-tact="tsearch">tool_search</button>
        </div>
        <div id="tsOut" class="hnote" style="padding:0 16px 14px">（点 tool_search 看匹配结果；每条可 describe / call）</div>
        <div class="hnote" style="padding:0 16px 14px">不变量（tool_search.py:9-11）：核心工具永不延迟 · <b>catalog 无状态</b>（每次从 live tool-defs 重建，
          带状态的缓存会漂移并静默丢工具）· 桥调用经 handle_function_call 统一路由。本页是<b>展示层</b>，真接入用官方口子。</div>`}`;
  } else if (tab === 'terminal') {
    const be = H0.termBackend || 'local';
    const cur = H_TERM_BACKENDS.find(b => b.k === be) || H_TERM_BACKENDS[0];
    body = `<div class="hcrumb"><b>工具</b><span class="sep">›</span>终端后端</div>
      <div class="hset-sec">七种执行后端（terminal_tool_backends.py:54 _BUILTIN_BACKENDS）—— 只存配置，不执行（B 批）</div>
      <div class="hmode">${H_TERM_BACKENDS.map(b => `
        <button class="hmode-card${b.k === be ? ' is-on' : ''}" data-tact="be" data-k="${b.k}">
          <span class="tick">✓</span><div class="mi">🖥️</div>
          <div class="mt">${escapeHtml(b.n)}</div>
          <div class="md">terminal.backend = <code>${b.k}</code></div></button>`).join('')}</div>
      <div class="hset-sec">「${escapeHtml(cur.n)}」配置样例（cli-config.yaml.example 形状）</div>
      <div class="hset-group"><div class="hset"><div class="tx">
        <div class="ds" style="font-family:var(--mono,monospace);font-size:12px;line-height:2">
          terminal:<br>&nbsp;&nbsp;backend: <b style="color:#9FD0FF">${cur.k}</b><br>
          ${cur.fields.map(([k, v]) => `&nbsp;&nbsp;${k}: <span style="color:#86EFAC">${escapeHtml(v)}</span>`).join('<br>')}
        </div></div>
        <div class="ct"><span class="hchip">只存配置</span></div></div></div>
      <div class="hnote" style="padding:4px 16px 14px">Docker/SSH/Modal 等真沙箱属 B 批；本页保证换后端时配置形状与官方一致，Swift 期直接落 yaml。</div>`;
  } else {
    body = `<div class="hcrumb"><b>工具</b><span class="sep">›</span>流式编辑</div>
      <div class="hset-sec">四不变量 demo（原生流：前缀稳定 · 只在尾部续 · finish 由消费者宣布 · 不重排）</div>
      <div style="padding:0 16px 8px">
        <div class="hrow" style="margin-bottom:8px">
          <button class="hbtn primary" data-tact="st-start">开始流式</button>
          <button class="hbtn" data-tact="st-append">尾部追加一段</button>
          <button class="hbtn" data-tact="st-finish">宣布完成（消费者）</button>
          <span class="qe-state off" id="stState">idle</span>
        </div>
        <div class="hme" id="stText" style="min-height:96px;margin-top:0">（点「开始流式」）</div>
        <div class="hnote" id="stCheck" style="padding:6px 2px">断言区：生成中每次 append 都不改动已有前缀；自然生成停了也不自动 done。</div>
      </div>`;
  }

  pane.innerHTML = hBar('工具 · Tools',
    `披露 / 终端后端 / 流式编辑 —— tool_search 三桥 + 7 后端 + 四不变量（Hermes tools/ 族）`, hCurChip())
    + `<div class="hbody"><div class="hprof">${side}<div class="hprof-body">${body}</div></div></div>`;
  hBindCommon(pane);
  pane.querySelectorAll('[data-ttab]').forEach(el => el.onclick = () => {
    H0.toolsTab = el.dataset.ttab; hSave(); renderHermes(); renderHermesNav();
  });
  pane.querySelectorAll('[data-tact]').forEach(b => b.onclick = () => {
    const act = b.dataset.tact;
    if (act === 'mode-full' || act === 'mode-prog') {
      H0.toolDisclosure = act === 'mode-full' ? 'full' : 'progressive';
      hSave(); renderHermes(); return;
    }
    if (act === 'be') { H0.termBackend = b.dataset.k; hSave(); renderHermes();
      toast(`terminal.backend → <b>${escapeHtml(b.dataset.k)}</b>（配置已存，不执行）`); return; }
    if (act === 'tsearch') {
      const q = (pane.querySelector('#tsQuery').value || '').trim().toLowerCase();
      const out = pane.querySelector('#tsOut');
      if (!q) { out.innerHTML = '输入关键词再搜。'; return; }
      const hits = H_TOOL_CATALOG.filter(t => t.n.toLowerCase().includes(q) || t.g.includes(q));
      out.innerHTML = hits.length
        ? `<b>tool_search → ${hits.length} 个匹配</b>（单次上限 7 组查询，tool_search.py:31）：<br>` +
          hits.slice(0, 7).map(t => `• <code>${escapeHtml(t.n)}</code> <span style="opacity:.75">（${t.g === 'core' ? '核心' : 'MCP'}）</span>
            <button class="hbtn ghost sm" data-tsact="describe" data-n="${escapeHtml(t.n)}">describe</button>
            <button class="hbtn ghost sm" data-tsact="call" data-n="${escapeHtml(t.n)}">call</button>
            <span data-tsout="${escapeHtml(t.n)}"></span>`).join('<br>')
        : `0 个匹配「${escapeHtml(q)}」。`;
      out.querySelectorAll('[data-tsact]').forEach(btn => btn.onclick = () => {
        const n = btn.dataset.n;
        const slot = out.querySelector(`[data-tsout="${CSS.escape(n)}"]`);
        if (btn.dataset.tsact === 'describe') {
          const t = H_TOOL_CATALOG.find(x => x.n === n);
          slot.innerHTML = ` <span style="color:#9FD0FF">→ schema：{ type:"function", name:"${escapeHtml(n)}", ≈${t.c} chars }</span>`;
        } else {
          slot.innerHTML = ` <span style="color:#86EFAC">→ {ok:true, result:"${escapeHtml(n)} mock 执行"}</span>`;
        }
      });
      return;
    }
    if (act === 'st-start') {
      const el = pane.querySelector('#stText'), st = pane.querySelector('#stState');
      if (el.dataset.timer) { toast('已经在生成了'); return; }
      el.textContent = ''; st.className = 'qe-state err'; st.textContent = 'streaming（生成器停了也不 done）';
      let tick = 0; let last = '';
      const chunk = '模型正在边生成边把已输出的前缀固定下来，'.split('');
      const timer = setInterval(() => {
        const before = el.textContent;
        if (before && !el.textContent.startsWith(before)) { /* 结构上不可能：只 append */ }
        el.textContent = before + (chunk[tick % chunk.length] || '·');
        tick++;
        if (tick >= 40) { clearInterval(timer); el.dataset.timer = '';
          pane.querySelector('#stCheck').innerHTML =
            `<b>前缀稳定 ✓</b>（40 次 append，每次都 startsWith 上一拍文本）· 生成器已停但状态仍 <b>streaming</b> —— finish 必须由消费者宣布。`; }
      }, 60);
      el.dataset.timer = String(timer);
      last = el.textContent;
      return;
    }
    if (act === 'st-append') {
      const el = pane.querySelector('#stText');
      const before = el.textContent;
      if (before === '（点「开始流式」）' || !before) { toast('先点开始流式'); return; }
      el.textContent = before + '【消费者在尾部追加】';
      const ok = el.textContent.startsWith(before);
      pane.querySelector('#stCheck').innerHTML =
        `尾部追加 → 前缀稳定 <b style="color:${ok ? '#86EFAC' : '#FCA5A5'}">${ok ? '✓' : '✗'}</b>（新文本 startsWith 旧文本）；不重排、不改中段。`;
      return;
    }
    if (act === 'st-finish') {
      const el = pane.querySelector('#stText'), st = pane.querySelector('#stState');
      if (el.dataset.timer) { clearInterval(+el.dataset.timer); el.dataset.timer = ''; }
      st.className = 'qe-state ok'; st.textContent = 'done（消费者宣布）';
      pane.querySelector('#stCheck').innerHTML = `<b>finish ✓</b> —— 由消费者按钮宣布，不是生成器自己到点关掉（四不变量之三）。`;
      return;
    }
  });
}

/* ── 子代理页（delegate_task：一次性、隔离、只回结果） ── */
function hermesDelegatesHTML(pane) {
  const H0 = hState2();
  const list = H0.delegates;
  const TOOL_CHOICES = ['point', 'click', 'type', 'press', 'run', 'skill', 'ax_tree', 'search'];
  const badgeOf = d => d.status === 'running' ? '<span class="hbadge" style="background:rgba(59,130,246,.22);color:#BFDBFE">运行中</span>'
    : d.status === 'done' ? '<span class="hbadge pin">完成</span>'
    : '<span class="hbadge auto" style="background:rgba(248,113,113,.18);color:#FECACA">已中断</span>';
  pane.innerHTML = hBar('子代理 · Delegate',
    `一次性隔离子代理：预算 + 工具白名单 + 只回结果（delegate_tool.py:440 delegate_task）`, hCurChip())
    + `<div class="hbody" style="flex-direction:column;overflow:auto">
      <div class="hset-sec">委派一个任务</div>
      <div class="hset-group"><div class="hform" style="padding:10px 14px">
        <label>任务描述<textarea id="dlTask" rows="2" placeholder="例：把这 5 个文件按类型分到子目录"></textarea></label>
        <div class="hrow">
          <span class="hsub" style="flex:0 0 auto">工具白名单：</span>
          ${TOOL_CHOICES.map(t => `<button type="button" class="hchk${['point', 'click', 'run'].includes(t) ? ' is-on' : ''}" data-dlt="${t}">${t}</button>`).join('')}
        </div>
        <div class="hrow">
          <label class="hrow" style="gap:6px">预算 tokens <input type="number" id="dlBudget" value="8000" min="500" max="100000" style="width:110px"></label>
          <button type="button" class="hchk is-on" id="dlIso">上下文隔离（父代理只收结果）</button>
          <span style="flex:1"></span>
          <button class="hbtn primary" data-dlact="spawn">委派</button>
        </div>
      </div></div>
      <div class="hset-sec">子代理列表（${list.length}）
        <span style="float:right"><button class="hbtn primary sm" data-dlact="add">＋ 添加子代理</button></span></div>
      <div class="hgw" style="padding:0 16px 16px">${list.map(d => `
        <div class="hgw-card${d.status === 'running' ? ' is-primary' : ''}">
          <div class="hgw-top"><span class="hgw-label">${escapeHtml(d.task.slice(0, 40))}${d.task.length > 40 ? '…' : ''}</span>
            ${badgeOf(d)}<span class="hsub" style="margin-left:auto">${d.tokensUsed}/${d.budget} tokens</span></div>
          <div class="hgw-fields"><span><b>tools</b>${escapeHtml(d.tools.join(' / ') || '（无）')}</span>
            <span><b>隔离</b>${d.isolate ? 'on' : 'off'}</span><span><b>创建</b>${new Date(d.created).toLocaleTimeString()}</span></div>
          ${d.steps.length ? `<div class="hme" style="margin-top:8px;font-size:11.5px">${d.steps.map((s, i) => `${i + 1}. ${escapeHtml(s)}`).join('\n')}</div>` : ''}
          ${d.result ? `<div class="hgw-fields" style="margin-top:8px;color:#86EFAC"><b>结果</b>${escapeHtml(d.result)}</div>` : ''}
          <div class="hgw-ops">${d.status === 'running'
            ? `<button class="hbtn danger" data-dlact="stop" data-id="${d.id}">中断</button>`
            : `<button class="hbtn ghost" data-dlact="del" data-id="${d.id}">移除</button>`}</div>
        </div>`).join('') || '<div class="hempty">还没有子代理 —— 上面粉一个任务点「委派」。</div>'}</div>
      <div class="hnote" style="padding:0 16px 16px">与已撤掉的常驻子 agent 的区别：delegate 是<b>一次性</b>的 ——
        带预算与工具白名单跑完就退，父代理只收结果，不接力多轮（delegate_tool_dispatch / _progress 一族）。
        进度为 mock（B 批才起真子进程）。</div>
    </div>`;
  hBindCommon(pane);
  // §52：白名单与隔离 = 按钮式（.hchk），点击只切 is-on，不整页重绘
  pane.querySelectorAll('[data-dlt]').forEach(b => b.onclick = () => b.classList.toggle('is-on'));
  const isoBtn = pane.querySelector('#dlIso');
  if (isoBtn) isoBtn.onclick = () => isoBtn.classList.toggle('is-on');
  pane.querySelectorAll('[data-dlact]').forEach(b => b.onclick = () => {
    const act = b.dataset.dlact, id = b.dataset.id;
    if (act === 'add') {
      const t = pane.querySelector('#dlTask');
      if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => t.focus(), 250); }
      return;
    }
    if (act === 'spawn') {
      const task = (pane.querySelector('#dlTask').value || '').trim();
      const budget = Math.max(0, parseInt(pane.querySelector('#dlBudget').value, 10) || 0);
      const tools = [...pane.querySelectorAll('[data-dlt].is-on')].map(c => c.dataset.dlt);
      if (!task) return toast('先写任务描述');
      if (budget < 500) return toast('预算太小：至少 500 tokens');
      if (!tools.length) return toast('至少选一个工具');
      const isolate = pane.querySelector('#dlIso').classList.contains('is-on');
      const d = { id: hNewId('dl'), task, budget, tools, isolate,
        status: 'running', steps: [], tokensUsed: 0, result: '', created: Date.now() };
      list.unshift(d); hSave(); renderHermes(); renderHermesNav();
      toast(`已委派（隔离=${isolate ? 'on' : 'off'} · 预算 ${budget} · 白名单 ${tools.length} 个）`);
      // mock 进度：3 步，每步消耗 tokens；中断（status≠running）时自然停
      const stepTexts = [`分析任务：${task.slice(0, 30)}`, `调用白名单工具：${tools.slice(0, 3).join(' → ')}`, '汇总结果并退出'];
      let i = 0;
      const adv = () => {
        const live = H0.delegates.find(x => x.id === d.id);
        if (!live || live.status !== 'running') return;
        if (i < stepTexts.length) {
          live.steps.push(stepTexts[i]);
          live.tokensUsed = Math.min(live.budget, live.tokensUsed + 900 + Math.floor(Math.random() * 1400));
          i++; hSave();
          if (typeof hermesView !== 'undefined' && hermesView === 'delegates') renderHermes();
          setTimeout(adv, 700);
        } else {
          live.status = 'done';
          live.result = `完成：${live.task.slice(0, 36)}（用 ${live.tokensUsed}/${live.budget} tokens${live.isolate ? ' · 上下文隔离' : ''}）`;
          hSave();
          if (typeof hermesView !== 'undefined' && hermesView === 'delegates') renderHermes();
          toast(`子代理完成：${escapeHtml(live.task.slice(0, 24))}…`);
        }
      };
      setTimeout(adv, 700);
      return;
    }
    const d = list.find(x => x.id === id); if (!d) return;
    if (act === 'stop') { d.status = 'failed'; d.result = `已中断（用了 ${d.tokensUsed}/${d.budget} tokens）`;
      hSave(); renderHermes(); toast('已中断（部分步骤保留在卡上）'); return; }
    if (act === 'del') { H0.delegates = list.filter(x => x.id !== id); hSave(); renderHermes(); toast('已移除'); return; }
  });
}

/* ══ §53 知识库：LLM Wiki 多实例控制台（不修改 LLM_Wiki 项目，只做驾驶舱）══
   真值来源：llm_wiki_skill（SKILL.md 关键路径 / API_REFERENCE）+
   03-多实例与部署/multi-instance.md（HOME隔离·克隆·sync-config·autostart 全套已存在）+
   源码查证：src-tauri/src/api_server.rs:23 `const PORT: u16 = 19828` **硬编码**——
   不改项目就无法每实例独立端口 → 采用「API 归属切换」模型（19828 唯一入口 + 归属实时标注）。
   四层模型：实例(进程) → 配置(app-state) → 项目(Data/Wiki/<名> 注册表认领·互斥锁) → 文件。
   原型边界：探测=真 fetch /health 失败降级；实例启停/同步/创建=真机 llm-wiki-instance 命令，
   原型只改状态并显示将执行的命令；不读写真实 apiKey（脱敏样例）。 */

let wikiView = null;   // null | 'instances' | 'projects' | 'sync' | 'create'

function wikiState() {
  if (!S.wiki || typeof S.wiki !== 'object') {
    const ROOT = '/Users/mjm/Documents/SuperAgent/Data/Wiki/';
    const MULTI = '~/Library/Application Support/LLM-Wiki-Multi/instances/';
    S.wiki = {
      // ── 实例：main=官方原版(真实HOME) · b=克隆（贴本机现状 llm-wiki-instance status）──
      instances: [
        { name: 'main', form: 'official', bundle: '/Applications/LLM Wiki.app',
          home: '(真实 HOME)', running: true, autostart: true, autoResume: true },
        { name: 'b', form: 'clone', bundle: '/Applications/LLM Wiki b.app',
          home: MULTI + 'b/home', running: false, autostart: true, autoResume: false },
      ],
      apiOwner: 'main',                       // 19828 当前归属（真机=lsof→pid→HOME 反查）
      probe: { status: 'unknown', at: 0 },    // online | blocked | offline | unknown
      // ── 项目：Data/Wiki/ 真实目录（磁盘共享，实例靠 registry 认领，互斥锁）──
      projects: [
        { name: 'Memory', path: ROOT + 'Memory', owner: null, queue: { pending: 0, failed: 0 } },
        { name: '产品经理', path: ROOT + '产品经理', owner: 'main', queue: { pending: 0, failed: 0 } },
        { name: '产品经理】Source', path: ROOT + '产品经理】Source', owner: null, queue: { pending: 0, failed: 0 } },
        { name: '技能设计', path: ROOT + '技能设计', owner: null, queue: { pending: 1, failed: 0 } },
        { name: '技能设计】Source', path: ROOT + '技能设计】Source', owner: null, queue: { pending: 0, failed: 0 } },
        { name: '编程', path: ROOT + '编程', owner: 'main', queue: { pending: 3, failed: 1 } },
        { name: '营销销售', path: ROOT + '营销销售', owner: 'b', queue: { pending: 0, failed: 2 } },
        { name: '营销销售】Sources', path: ROOT + '营销销售】Sources', owner: null, queue: { pending: 0, failed: 0 } },
      ],
      // ── 主配置（权威源=主实例 app-state.json；原型只放脱敏样例，真机由 Swift 读入）──
      mainConfig: {
        endpoint: 'https://inferaiapi.com/v1',
        apiKey: 'sk-••••••••••••••••••••••••••••540d',
        model: 'deepseek-chat',
        embed: 'text-embedding-v3',
        search: '内置关键词+语义',
        theme: 'dark',
      },
      syncLog: [],                            // 一键下发的结果行
      createdCmd: '',                         // 新建实例将执行的命令
      settingsTab: 'general',                 // §54 同步设置当前 section
      diffTarget: null, diffOnly: false, diffAt: 0,
      graph: null, graphProject: null, graphQ: '', graphLoading: false,
    };
  }
  // §54 运行时回填（老状态文件没有这些键）
  const W = S.wiki;
  if (W.settingsTab === undefined) W.settingsTab = 'general';
  if (W.diffOnly === undefined) W.diffOnly = false;
  if (W.diffTarget === undefined || !W.instances.some(i => i.name === W.diffTarget)) W.diffTarget = W.apiOwner;
  if (W.graph === undefined) W.graph = null;
  if (W.graphProject === undefined) W.graphProject = null;
  if (W.graphQ === undefined) W.graphQ = '';
  // ⚠️ 不在这里调 wikiCfgEnsure：它引用的 const WIKI_SETTINGS 在 §54 块里，
  // bindWiki（§53 块）先于它求值会触发 TDZ。sections 的 ensure 由各使用点自理（wikiCfgFlat/syncHTML/export）。
  return W;
}

/// 自动检测①：真探测 /health（失败如实降级——浏览器 CORS 拦截时显示 blocked）
async function wikiProbe() {
  const W = wikiState();
  W.probe = { status: 'probing', at: Date.now() };
  renderWiki();
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch('http://127.0.0.1:19828/health', { signal: ctrl.signal });
    const j = await r.json();
    W.probe = { status: j && j.ok ? 'online' : 'weird', at: Date.now() };
  } catch (e) {
    // CORS / 网络拒 —— 不是"离线"，如实标注（真机由 llm-wiki-instance status / lsof 探）
    W.probe = { status: 'blocked', at: Date.now(), why: String(e && e.message || e).slice(0, 60) };
  }
  save(true);
  renderWiki();
}

/// 自动检测②：API 归属（真机：lsof -i :19828 → pid → ps eww HOME → 映射实例；原型=状态字段）
function wikiOwnerLabel() {
  const W = wikiState();
  const inst = W.instances.find(i => i.name === W.apiOwner);
  return inst ? inst.name : W.apiOwner;
}

function setWikiView(v) {
  if (v && typeof finderOpen !== 'undefined' && finderOpen) setFinderOpen(false);
  if (v && typeof monitorOpen !== 'undefined' && monitorOpen) setMonitorMode(false);
  if (v && hermesView) {                       // 与 Hermes 互斥（不走 setHermesView(null) 免得闪一下工作区）
    hermesView = null;
    const hp = $('#hermesPane'); if (hp) hp.hidden = true;
    renderHermesNav();
  }
  wikiView = v;
  const on = !!v;
  ['.workspace', '.chat', '.split-v', '.split-h', '#railRight', '#panelSide', '#panelAutomation', '#tabsVertical']
    .forEach(sel => document.querySelectorAll(sel).forEach(el => {
      if (on) { el.dataset.wHide = '1'; el.style.display = 'none'; }
      else if (el.dataset.wHide && !el.dataset.hHide) { delete el.dataset.wHide; el.style.display = ''; }
    }));
  const pane = $('#wikiPane');
  if (pane) pane.hidden = !on;
  if (on) renderWiki(); else renderNav();
  renderWikiNav();
}

function renderWikiNav() {
  const host = $('#wikiList');
  if (!host) return;
  const W = wikiState();
  const rows = [
    { v: 'instances', label: '实例', badge: `${W.instances.filter(i => i.running).length}/${W.instances.length}` },
    { v: 'projects', label: '知识库', badge: `${W.projects.length}` },
    { v: 'sync', label: '同步设置', badge: W.syncLog.length ? `${W.syncLog.length}` : '' },
    { v: 'create', label: '新建实例', badge: '' },
    { v: 'graph', label: '关系图', badge: (W.graph && !W.graphLoading) ? `${W.graph.nodes.length}` : '' },
  ];
  host.innerHTML = rows.map(r => `<div class="plan-row${wikiView === r.v ? ' is-on' : ''}" data-wv="${r.v}">
      <span class="plan-dot" style="background:#10B981"></span><span class="pname">${r.label}</span>
      ${r.badge ? `<span class="sc" style="margin-left:auto;font-size:10.5px;color:var(--ink3,#8A8F96)">${r.badge}</span>` : ''}
    </div>`).join('');
  host.querySelectorAll('[data-wv]').forEach(el => el.onclick = () => setWikiView(el.dataset.wv));
  const sect = $('#btnWikiSect');
  if (sect) sect.classList.toggle('closed', !wikiView);
}

function renderWiki() {
  const pane = $('#wikiPane');
  if (!pane) return;
  renderWikiNav();
  const v = wikiView;
  if (v === 'instances') wikiInstancesHTML(pane);
  else if (v === 'projects') wikiProjectsHTML(pane);
  else if (v === 'sync') wikiSyncHTML(pane);
  else if (v === 'create') wikiCreateHTML(pane);
  else if (v === 'graph') wikiGraphHTML(pane);
  else pane.innerHTML = '';
}

/// 顶部探测条（实例/项目/同步/新建 四页共用）
function wikiProbeBar() {
  const W = wikiState();
  const p = W.probe;
  const cls = p.status === 'online' ? 'ok' : p.status === 'blocked' || p.status === 'weird' ? 'err' : 'off';
  const txt = { online: '19828 在线 ✓', offline: '19828 离线', probing: '探测中…',
    blocked: '浏览器被 CORS 拦（真机用 lsof 探）', weird: '有响应但异常', unknown: '未探测' }[p.status] || p.status;
  return `<div class="hset-group" style="margin:10px 16px 0"><div class="hset" style="padding:10px 14px">
    <div class="tx"><div class="tt">自动检测</div>
      <div class="ds">API 唯一入口 <code>127.0.0.1:19828</code>（源码硬编码，不改项目则无法分端口）·
        当前归属：<b style="color:#93C5FD">${escapeHtml(wikiOwnerLabel())}</b>
        —— 所有调用只打 19828，调用前核对归属 = 结构上不会读错实例。</div></div>
    <div class="ct">
      <span class="qe-state ${cls}">${txt}</span>
      <button class="hbtn" id="wpProbe">重新探测</button>
    </div></div></div>`;
}
function wikiBindProbe(pane) {
  const b = pane.querySelector('#wpProbe');
  if (b) b.onclick = () => wikiProbe();
}

/* ── 页1：实例总览 ── */
function wikiInstancesHTML(pane) {
  const W = wikiState();
  pane.innerHTML = hBar('知识库 · 实例（LLM Wiki Console）',
    'HOME 隔离 + 克隆 App + launchd 自启 = 复用现成 llm-wiki-instance，本页只做驾驶舱（multi-instance.md）')
    + `<div class="hbody" style="flex-direction:column;overflow:auto">
      ${wikiProbeBar()}
      <div class="hset-sec">实例（${W.instances.length}）</div>
      <div class="hgw" style="padding:0 16px 8px">${W.instances.map(i => `
        <div class="hgw-card${i.name === W.apiOwner ? ' is-primary' : ''}">
          <div class="hgw-top">
            <span class="hgw-label">LLM Wiki ${i.name === 'main' ? '（主）' : escapeHtml(i.name)}</span>
            <span class="hchip${i.running ? ' on' : ''}">${i.running ? '运行中' : '未运行'}</span>
            ${i.name === W.apiOwner ? '<span class="hchip on">API 归属 · 19828</span>' : ''}
          </div>
          <div class="hgw-fields">
            <span><b>形态</b>${i.form === 'clone' ? '克隆（独立 Dock 图标）' : '官方原版（真实 HOME）'}</span>
            <span><b>bundle</b>${escapeHtml(i.bundle)}</span>
            <span><b>home</b>${escapeHtml(i.home)}</span>
          </div>
          <div class="hrow" style="margin-top:8px;gap:8px;align-items:center">
            <button class="hchk${i.autostart ? ' is-on' : ''}" data-wact="autostart" data-n="${i.name}">开机自启</button>
            <button class="hchk${i.autoResume ? ' is-on' : ''}" data-wact="resume" data-n="${i.name}">自动继续任务</button>
          </div>
          <div class="hgw-ops">
            <button class="hbtn" data-wact="start" data-n="${i.name}"${i.running ? ' disabled' : ''}>启动</button>
            <button class="hbtn" data-wact="stop" data-n="${i.name}"${i.running ? '' : ' disabled'}>停止</button>
            <button class="hbtn primary" data-wact="own" data-n="${i.name}"${i.name === W.apiOwner ? ' disabled' : ''}>设为 API 归属</button>
            <button class="hbtn ghost" data-wact="log" data-n="${i.name}">日志</button>
          </div>
        </div>`).join('')}</div>
      <div class="hset-sec">语义与命令（真机执行处）</div>
      <div class="hnote" style="padding:0 16px 16px;line-height:1.9">
        <b>开机自启</b> = <code>llm-wiki-instance autostart &lt;名&gt; on|off</code>（no-autostart 标记，LaunchAgent 的 all 跳过它）<br>
        <b>自动继续任务</b> = 实例启动后检查 <code>&lt;项目&gt;/.llm-wiki/ingest-queue.json</code> 的 pending/failed →
          调 queue-watcher / <code>QUEUE_MANAGE</code> 恢复（App 自带队列持久化+崩溃恢复，此项=Wanna 主动兜底）<br>
        <b>切换 API 归属</b> = stop 当前持有者 → start 目标 → 等 19828 /health（19828 是单例，先启动者得；
          这就是「防调错实例读错库」的机制——入口永远唯一，Wanna 永远标明归属）<br>
        <b>启动/停止/日志</b> = <code>llm-wiki-instance &lt;名&gt; / stop &lt;名&gt; / tail launcher.log</code>
      </div>
    </div>`;
  wikiBindProbe(pane);
  pane.querySelectorAll('[data-wact]').forEach(b => b.onclick = () => {
    const act = b.dataset.wact, n = b.dataset.n;
    const inst = W.instances.find(x => x.name === n); if (!inst) return;
    if (act === 'autostart') { inst.autostart = !inst.autostart; save(true); renderWiki();
      toast(`llm-wiki-instance autostart ${n} ${inst.autostart ? 'on' : 'off'}`); return; }
    if (act === 'resume') { inst.autoResume = !inst.autoResume; save(true); renderWiki();
      toast(inst.autoResume ? `${n}：启动后自动恢复队列（pending/failed → QUEUE_MANAGE resume）`
        : `${n}：不自动续跑（队列保留，手动恢复）`); return; }
    if (act === 'start') { inst.running = true; save(true); renderWiki();
      toast(`llm-wiki-instance ${n}${n !== 'main' ? ' --seed' : ''}（真机执行；归 ${inst.autoResume ? '自动续跑' : '不动队列'}）`); return; }
    if (act === 'stop') { inst.running = false; if (W.apiOwner === n) W.apiOwner = null;
      save(true); renderWiki(); toast(`llm-wiki-instance stop ${n}`); return; }
    if (act === 'own') {
      const cur = W.instances.find(x => x.name === W.apiOwner);
      if (cur && cur.running) cur.running = false;          // 端口单例：先停持有者
      inst.running = true; W.apiOwner = n; save(true); renderWiki();
      toast(`API 归属 → <b>${escapeHtml(n)}</b>（stop ${cur ? cur.name : '—'} → start ${n} → 等 19828 health；后续调用只打 19828）`);
      return;
    }
    if (act === 'log') { toast(`<code>${escapeHtml(inst.home.replace(/\/home$/, ''))}/launcher.log</code>（真机 tail -50）`); return; }
  });
}

/* ── 页2：知识库项目 ── */
function wikiProjectsHTML(pane) {
  const W = wikiState();
  const instOpts = sel => `<option value="">（未绑定）</option>` + W.instances.map(i =>
    `<option value="${escapeHtml(i.name)}"${sel === i.name ? ' selected' : ''}>${escapeHtml(i.name)}</option>`).join('');
  pane.innerHTML = hBar('知识库 · 项目（Data/Wiki/）',
    '磁盘共享 · 实例靠 registry 认领 · 同一项目同时只许一个实例打开（互斥锁）', '')
    + `<div class="hbody" style="flex-direction:column;overflow:auto">
      ${wikiProbeBar()}
      <div class="hrow" style="padding:6px 16px 0">
        <span class="hsub">根目录 <code>/Users/mjm/Documents/SuperAgent/Data/Wiki/</code></span>
        <span style="flex:1"></span>
        <button class="hbtn primary" data-wact="importDir">＋ 导入文件夹</button>
        <button class="hbtn" data-wact="importFile">＋ 导入文件</button>
      </div>
      <div class="hset-sec">导入语义（API 无 create-project 端点 → 文件层是正确路径）</div>
      <div class="hnote" style="padding:0 16px 8px;line-height:1.85">
        导入 = ① 建 <code>Data/Wiki/&lt;名&gt;/</code> 并放入文件 → ② 写<b>目标实例</b> home 里
        app-state.json 的 <code>projectRegistry</code>（{UUID,name,path}）—— 目标实例须停止时写
        （与 sync-config 同约束，运行中写回会被覆盖）。绑定实例 = 声明"以后谁打开它"，防互斥锁撞车。
      </div>
      <div class="hgw" style="padding:0 16px 16px">${W.projects.map((p, idx) => `
        <div class="hgw-card${p.queue.failed ? ' is-quar' : ''}">
          <div class="hgw-top"><span class="hgw-label">${escapeHtml(p.name)}</span>
            ${p.queue.pending || p.queue.failed
              ? `<span class="hchip${p.queue.failed ? '' : ' on'}">队列 ${p.queue.pending} pending${p.queue.failed ? ` · ${p.queue.failed} failed` : ''}</span>`
              : '<span class="hchip">队列空</span>'}
            ${p.owner ? `<span class="hchip on" style="margin-left:auto">绑定 ${escapeHtml(p.owner)}</span>` : ''}</div>
          <div class="hgw-fields"><span><b>path</b>${escapeHtml(p.path.replace('/Users/mjm/Documents/SuperAgent', '…'))}</span></div>
          <div class="hrow" style="margin-top:8px;gap:8px;align-items:center">
            <span class="hsub">绑定实例</span>
            <select data-wact="bind" data-i="${idx}">${instOpts(p.owner)}</select>
            <span style="flex:1"></span>
            <button class="hbtn primary" data-wact="open" data-i="${idx}">在绑定实例打开</button>
            <button class="hbtn" data-wact="queue" data-i="${idx}">队列详情</button>
          </div>
        </div>`).join('')}</div>
    </div>`;
  wikiBindProbe(pane);
  pane.querySelectorAll('[data-wact]').forEach(el => {
    const act = el.dataset.wact;
    if (act === 'bind') { el.onchange = () => {
      const p = W.projects[+el.dataset.i];
      const v = el.value;
      if (v) {  // 互斥检查：别的项目不能绑到同一实例？—— 一个实例可开多项目（不同时打开即可）
        const clash = W.projects.find(x => x !== p && x.owner === v && x.opened);
        if (clash) { toast(`${v} 正打开着「${clash.name}」—— 项目互斥锁：先关再开这个`); el.value = p.owner || ''; return; }
      }
      p.owner = v || null; save(true); renderWiki();
      toast(v ? `「${escapeHtml(p.name)}」→ 绑定 ${escapeHtml(v)}（registry 写入该实例）` : '已解绑');
    }; return; }
    if (act === 'open') { el.onclick = () => {
      const p = W.projects[+el.dataset.i];
      if (!p.owner) { toast('先选绑定实例 —— 不知道开在哪个实例上'); return; }
      const inst = W.instances.find(i => i.name === p.owner);
      if (!inst) { toast('绑定的实例不存在'); return; }
      if (!inst.running) { toast(`${p.owner} 未运行 —— 真机：llm-wiki-instance ${p.owner} 然后打开 ${p.path}`); return; }
      if (p.owner !== W.apiOwner) { toast(`⚠ ${p.owner} 不是 API 归属（19828 在 ${W.apiOwner}）—— UI 打开可以，但检索 API 打到的将是 ${W.apiOwner}`); return; }
      toast(`在 <b>${escapeHtml(p.owner)}</b> 打开「${escapeHtml(p.name)}」（真机：registry lastProject → App 打开）`);
    }; return; }
    if (act === 'queue') { el.onclick = () => {
      const p = W.projects[+el.dataset.i];
      askModal({ title: `队列详情 — ${p.name}`,
        text: `<code>${escapeHtml(p.path)}/.llm-wiki/ingest-queue.json\npending ${p.queue.pending} · failed ${p.queue.failed}\nwarnings 见 ingest-warnings.log\n\n恢复: QUEUE_MANAGE resume "${p.name}"（真机）</code>`,
        okText: '关闭' });
    }; return; }
    if (act === 'importDir' || act === 'importFile') { el.onclick = () => {
      const isDir = act === 'importDir';
      askModal({ title: isDir ? '导入文件夹（= 新建项目）' : '导入文件到已有项目',
        text: isDir
          ? '将创建 Data/Wiki/<名>/ 并放入文件，然后写入所选实例的 projectRegistry（须实例停止）'
          : '格式：目标项目名|文件绝对路径 —— 复制文件进该项目（真机）',
        value: isDir ? '新知识库' : '编程|/Users/mjm/Documents/SuperAgent/Data/xxx.md',
        okText: isDir ? '创建并导入' : '导入', onOk: v => {
          const s = String(v || '').trim();
          if (!s) return false;
          if (isDir) {
            if (W.projects.some(p => p.name === s)) { toast('同名项目已存在'); return false; }
            W.projects.push({ name: s, path: '/Users/mjm/Documents/SuperAgent/Data/Wiki/' + s,
              owner: null, queue: { pending: 0, failed: 0 } });
            save(true); renderWiki(); renderWikiNav();
            toast(`已创建 <b>${escapeHtml(s)}</b>（+ 绑定实例后写 registry）`);
          } else {
            const [pn, fp] = s.split('|').map(x => (x || '').trim());
            if (!pn || !fp) { toast('格式：项目名|路径'); return false; }
            const p = W.projects.find(x => x.name === pn);
            if (!p) { toast('项目不存在'); return false; }
            p.queue.pending++; save(true); renderWiki();
            toast(`已导入 →「${escapeHtml(pn)}」摄取队列 pending+1（真机：复制 ${escapeHtml(fp)} → 触发 rescan）`);
          }
          return true;
        } });
    }; }
  });
}

/* ──页3：同步设置 ── */
function wikiSyncHTML(pane) {
  const W = wikiState();
  const c = W.mainConfig;
  pane.innerHTML = hBar('知识库 · 同步设置（主配置 → 全部实例）',
    '主实例 app-state.json 是权威源 · 下发= sync-config 语义：剥项目指针 + 目标须停')
    + `<div class="hbody" style="flex-direction:column;overflow:auto">
      ${wikiProbeBar()}
      <div class="hset-sec">主配置（编辑后先保存，再下发）</div>
      <div class="hset-group">
        <div class="hset"><div class="tx"><div class="tt">LLM endpoint</div>
          <div class="ds">llmConfig.customEndpoint</div></div>
          <div class="ct"><input type="text" id="wsEp" value="${escapeHtml(c.endpoint)}" style="width:280px"></div></div>
        <div class="hset"><div class="tx"><div class="tt">API Key</div>
          <div class="ds">脱敏显示 · 真机直读主实例 app-state（本页不落真实密钥）</div></div>
          <div class="ct"><input type="text" id="wsKey" value="${escapeHtml(c.apiKey)}" style="width:280px"></div></div>
        <div class="hset"><div class="tx"><div class="tt">默认模型</div><div class="ds">llmConfig.model</div></div>
          <div class="ct"><input type="text" id="wsModel" value="${escapeHtml(c.model)}" style="width:200px"></div></div>
        <div class="hset"><div class="tx"><div class="tt">嵌入 / 搜索 / 主题</div>
          <div class="ds">embeddingConfig · searchApiConfig · theme</div></div>
          <div class="ct"><span class="hchip">${escapeHtml(c.embed)}</span><span class="hchip">${escapeHtml(c.search)}</span>
            <span class="hchip">${escapeHtml(c.theme)}</span></div></div>
        <div class="hset"><div class="tx"><div class="tt">下发</div>
          <div class="ds">剥离 lastProject / recentProjects / projectRegistry / scheduledImportConfig:* ——
            防止新实例启动即撞主实例占用的项目（互斥锁）。<b>运行中的实例会被拒绝</b>（退出时写回会覆盖）。</div></div>
          <div class="ct">
            <button class="hbtn" data-wact="saveCfg">保存主配置</button>
            <button class="hbtn primary" data-wact="syncAll">一键下发全部实例</button>
          </div></div>
      </div>
      ${W.syncLog.length ? `<div class="hset-sec">上次下发结果</div>
        <div class="hset-group">${W.syncLog.map(l => `<div class="hset" style="padding:9px 14px">
          <div class="tx"><div class="tt" style="font-size:12.5px">${escapeHtml(l.target)}</div></div>
          <div class="ct"><span class="qe-state ${l.ok ? 'ok' : 'err'}">${escapeHtml(l.msg)}</span></div>
        </div>`).join('')}</div>` : ''}
      <div class="hnote" style="padding:4px 16px 16px">真机：<code>llm-wiki-instance stop &lt;名&gt; && sync-config &lt;名&gt; && &lt;名&gt;</code>
        或 <code>sync-config --all</code>（逐个只对停止状态生效）。首次继承 = <code>clone &lt;名&gt; --seed</code>。</div>
    </div>`;
  wikiBindProbe(pane);
  pane.querySelectorAll('[data-wact]').forEach(b => b.onclick = () => {
    if (b.dataset.wact === 'saveCfg') {
      c.endpoint = pane.querySelector('#wsEp').value.trim();
      c.apiKey = pane.querySelector('#wsKey').value.trim();
      c.model = pane.querySelector('#wsModel').value.trim();
      save(true); renderWiki(); toast('主配置已保存（权威源）');
      return;
    }
    // syncAll：跑一遍 sync 语义（运行中的非源实例 → 拒绝）
    const targets = W.instances.filter(i => i.name !== W.apiOwner);
    W.syncLog = targets.map(t => t.running
      ? { target: t.name, ok: false, msg: '跳过：运行中（先 stop，防写回覆盖）' }
      : { target: t.name, ok: true, msg: '✓ 已写入 app-state（剥项目指针）' });
    save(true); renderWiki();
    const okN = W.syncLog.filter(x => x.ok).length;
    toast(`下发完成：${okN}/${W.syncLog.length} 成功${W.syncLog.length - okN ? `，${W.syncLog.length - okN} 个需先停止` : ''}`);
  });
}

/* ── 页4：新建实例 ── */
function wikiCreateHTML(pane) {
  const W = wikiState();
  pane.innerHTML = hBar('知识库 · 新建实例', '一键 = llm-wiki-instance clone <名> --seed（克隆 App + 独立 HOME + 继承主配置）')
    + `<div class="hbody" style="flex-direction:column;overflow:auto">
      ${wikiProbeBar()}
      <div class="hset-sec">创建参数</div>
      <div class="hset-group"><div class="hset">
        <div class="tx"><div class="tt">实例名</div><div class="ds">仅 [A-Za-z0-9_-] —— 决定克隆 App 名「LLM Wiki &lt;名&gt;.app」与数据目录</div></div>
        <div class="ct"><input type="text" id="wcName" placeholder="例如 research" style="width:160px"></div>
      </div>
      <div class="hset"><div class="tx"><div class="tt">形态</div>
        <div class="ds">克隆 = 独立 Dock 图标（+116MB，日常多开推荐）；轻量 = 共用图标省磁盘（临时/后台）</div></div>
        <div class="ct"><select id="wcForm"><option value="clone">克隆（独立图标）</option>
          <option value="light">轻量（共用图标）</option></select></div></div>
      <div class="hset"><div class="tx"><div class="tt">开机自启</div>
        <div class="ds">登录后 LaunchAgent 拉起（no-autostart 标记的反面）</div></div>
        <div class="ct"><button type="button" class="hchk is-on" id="wcAuto">开机自启</button></div></div>
      <div class="hset"><div class="tx"><div class="tt">自动继续之前停止/失败的任务</div>
        <div class="ds">启动后扫该实例项目的 ingest-queue，有 pending/failed 即 QUEUE_MANAGE resume（queue-watcher 语义）</div></div>
        <div class="ct"><button type="button" class="hchk is-on" id="wcResume">自动续跑</button></div></div>
      <div class="hset"><div class="tx"><div class="tt">继承主配置（--seed）</div>
        <div class="ds">复制主实例 LLM/嵌入/搜索配置并剥项目指针</div></div>
        <div class="ct"><button type="button" class="hchk is-on" id="wcSeed">--seed</button></div></div>
      <div class="hset"><div class="tx"><div class="tt">创建</div>
        <div class="ds">端口注意：19828 是单例——新实例不抢端口，UI 照常；要用它的 API 需先「设为 API 归属」</div></div>
        <div class="ct"><button class="hbtn primary" data-wact="create">创建并启动</button></div></div>
      </div>
      ${W.createdCmd ? `<div class="hset-sec">将执行（真机）</div>
        <div class="wiki-cmd">${escapeHtml(W.createdCmd)}</div>` : ''}
      <div class="hset-sec">现有实例</div>
      <div class="hrow" style="padding:0 16px 16px;gap:7px;flex-wrap:wrap">
        ${W.instances.map(i => `<span class="hchip${i.running ? ' on' : ''}">${escapeHtml(i.name)}${i.name === 'main' ? '·主' : ''}</span>`).join('')}
      </div>
    </div>`;
  wikiBindProbe(pane);
  ['wcAuto', 'wcResume', 'wcSeed'].forEach(id => {
    const el = pane.querySelector('#' + id);
    if (el) el.onclick = () => el.classList.toggle('is-on');
  });
  const createBtn = pane.querySelector('[data-wact="create"]');
  if (createBtn) createBtn.onclick = () => {
    const name = (pane.querySelector('#wcName').value || '').trim();
    if (!/^[A-Za-z0-9_-]+$/.test(name)) { toast('非法实例名（仅字母/数字/横线/下划线）'); return; }
    if (name === 'main' || W.instances.some(i => i.name === name)) { toast('实例名已存在'); return; }
    const form = pane.querySelector('#wcForm').value;
    const seed = pane.querySelector('#wcSeed').classList.contains('is-on');
    const auto = pane.querySelector('#wcAuto').classList.contains('is-on');
    const resume = pane.querySelector('#wcResume').classList.contains('is-on');
    const MULTI = '~/Library/Application Support/LLM-Wiki-Multi/instances/';
    W.instances.push({ name, form, bundle: form === 'clone' ? `/Applications/LLM Wiki ${name}.app` : '/Applications/LLM Wiki.app',
      home: MULTI + name + '/home', running: true, autostart: auto, autoResume: resume });
    W.createdCmd = [
      form === 'clone' ? `llm-wiki-instance clone ${name}${seed ? ' --seed' : ''}` : `llm-wiki-instance ${name}${seed ? ' --seed' : ''}`,
      auto ? '' : `llm-wiki-instance autostart ${name} off`,
      resume ? `# 自动续跑已开（启动后扫 ingest-queue → QUEUE_MANAGE resume）` : '',
    ].filter(Boolean).join('\n');
    save(true); renderWiki(); renderWikiNav();
    toast(`实例 <b>${escapeHtml(name)}</b> 已创建并启动（克隆约 116MB · 首启会弹文档权限一次）`);
  };
}

/* §53 侧栏分区与退出路径接线 */
(function bindWiki() {
  const sect = document.getElementById('btnWikiSect');
  if (sect) sect.onclick = () => { if (wikiView) setWikiView(null); else setWikiView('instances'); };
  ['btnProjSect', 'btnPlanSect'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    const orig = b.onclick;
    b.onclick = e => { if (wikiView) setWikiView(null); if (orig) orig(e); };
  });
  renderWikiNav();
  // ⚠️ 推迟到宏任务：wikiDiffTimer/WIKI_SETTINGS 是 §54 块里的 let/const，
  // 本 IIFE 在脚本求值期执行，直接调会 TDZ 抛错并中断整个脚本（实测两连炸）。
  setTimeout(() => wikiDiffStartPolling(), 0);
})();
/* ══ §54A 知识库 · 同步设置 100% 复刻 LLM Wiki 全部 16 个设置 section + 导入/导出 + 参数对比（轮询/事件）══
   字段真值：reference/LLM_Wiki/src/i18n/zh.json settings.sections（16 组全量）+ app-state.json 顶层 keys。
   对比模型：主配置 sections 为权威源，每实例持 cfgSnapshot；wikiDiff() 扁平逐参比对；
   轮询 8s + 保存事件即时刷新（只更新 #wikiDiffBox，不整页重绘——保护正在编辑的输入焦点）。 */

const WIKI_SETTINGS = [
  { id: 'general', t: '通用', d: '启动和窗口关闭行为', f: [
    { k: 'autostart', l: '登录系统后自动启动', type: 'switch', def: false },
    { k: 'closeBehavior', l: '关闭窗口时', type: 'select', opts: ['每次询问', '隐藏窗口', '退出应用'], def: '隐藏窗口' } ] },
  { id: 'interface', t: '界面', d: '语言与外观（切换即生效）', f: [
    { k: 'uiLanguage', l: 'UI 语言', type: 'select', opts: ['简体中文', 'English', '日本語'], def: '简体中文' },
    { k: 'theme', l: '主题', type: 'select', opts: ['浅色', '深色', '跟随系统'], def: '深色' },
    { k: 'zoom', l: '界面缩放（%）', type: 'num', def: 100, min: 70, max: 150 } ] },
  { id: 'output', t: '输出偏好', d: '生成语言与历史长度', f: [
    { k: 'aiLanguage', l: 'AI 输出语言', type: 'select', opts: ['Auto', '简体中文', 'English'], def: 'Auto' },
    { k: 'historyLength', l: '对话历史长度（条）', type: 'num', def: 20, min: 0, max: 200 } ] },
  { id: 'llm', t: 'LLM 模型', d: 'Provider 凭据与模型（启用一个自动停用其他）', f: [
    { k: 'activeProvider', l: '活跃 Provider', type: 'select', opts: ['OpenAI', 'Anthropic', 'DeepSeek', '自定义端点', 'Ollama 本地'], def: '自定义端点' },
    { k: 'apiMode', l: 'API 模式', type: 'select', opts: ['openai_compat', 'anthropic_messages'], def: 'openai_compat' },
    { k: 'endpoint', l: 'Endpoint', type: 'text', def: 'https://inferaiapi.com/v1' },
    { k: 'apiKey', l: 'API Key', type: 'text', def: 'sk-••••••••••••••••••••540d' },
    { k: 'model', l: '默认模型', type: 'text', def: 'deepseek-chat' },
    { k: 'contextWindow', l: '上下文窗口', type: 'num', def: 128000, min: 1000, max: 1000000 },
    { k: 'requestTimeout', l: '请求超时（分钟）', type: 'num', def: 30, min: 1, max: 120 },
    { k: 'streamingOutput', l: '启用流式输出', type: 'switch', def: true },
    { k: 'customHeaders', l: '自定义请求头（每行一条 Name: value）', type: 'text', def: '' },
    { k: 'chatModel', l: 'Chat 模型（任务路由）', type: 'text', def: '' },
    { k: 'ingestModel', l: 'Ingest 模型（任务路由）', type: 'text', def: '' },
    { k: 'projectOverride', l: '为当前项目使用独立模型', type: 'switch', def: false },
    { k: 'localCliIsolation', l: '隔离本地 CLI 配置（Claude/Codex）', type: 'switch', def: false },
    { k: 'codexCliTimeout', l: 'Codex CLI 超时（分钟）', type: 'num', def: 30, min: 1, max: 240 } ] },
  { id: 'embedding', t: '向量嵌入', d: '语义搜索', f: [
    { k: 'enabled', l: '启用向量搜索', type: 'switch', def: true },
    { k: 'endpoint', l: 'Endpoint（/v1/embeddings）', type: 'text', def: '' },
    { k: 'apiKey', l: 'API Key（可选）', type: 'text', def: '' },
    { k: 'model', l: 'Model', type: 'text', def: 'text-embedding-v3' },
    { k: 'outputDimensionality', l: '输出维度（仅 Gemini）', type: 'num', def: 0, min: 0, max: 3072 },
    { k: 'maxChunkChars', l: '每块最大字符数', type: 'num', def: 800, min: 100, max: 8000 },
    { k: 'overlapChunkChars', l: '重叠字符数', type: 'num', def: 120, min: 0, max: 2000 },
    { k: 'concurrency', l: '并发请求数（1–64）', type: 'num', def: 4, min: 1, max: 64 },
    { k: 'batchSize', l: '单次请求输入数（1–64）', type: 'num', def: 16, min: 1, max: 64 },
    { k: 'extraHeaders', l: '自定义请求头', type: 'text', def: '' } ] },
  { id: 'multimodal', t: '图片描述', d: '导入时为图片生成 caption', f: [
    { k: 'enabled', l: '导入时生成图片描述', type: 'switch', def: false },
    { k: 'useMain', l: '使用主 LLM 生成 caption', type: 'switch', def: true },
    { k: 'provider', l: '独立视觉 Provider', type: 'select', opts: ['主 LLM', 'OpenAI 兼容', 'Ollama', 'Azure'], def: '主 LLM' },
    { k: 'endpoint', l: '端点 URL', type: 'text', def: '' },
    { k: 'model', l: '模型（须支持视觉）', type: 'text', def: '' },
    { k: 'apiKey', l: 'API Key', type: 'text', def: '' },
    { k: 'concurrency', l: '并发 caption 请求数', type: 'num', def: 4, min: 1, max: 16 } ] },
  { id: 'webSearch', t: '外部信息源', d: 'Deep Research 的搜索来源', f: [
    { k: 'sources', l: '深度研究来源', type: 'select', opts: ['网页搜索', 'AnyTXT', '两者都用'], def: '网页搜索' },
    { k: 'webProvider', l: '网页搜索 Provider', type: 'select', opts: ['Ollama', 'Bocha 博查', 'Firecrawl', 'SearXNG', 'SerpApi'], def: 'Bocha 博查' },
    { k: 'instanceUrl', l: '实例 URL', type: 'text', def: '' },
    { k: 'anytxtEndpoint', l: 'AnyTXT 端点', type: 'text', def: 'http://127.0.0.1:13000' },
    { k: 'anytxtFilterDir', l: 'AnyTXT 搜索文件夹', type: 'text', def: '' },
    { k: 'anytxtFilterExt', l: 'AnyTXT 扩展名过滤', type: 'text', def: '' },
    { k: 'anytxtLimit', l: 'AnyTXT 最多本地结果数', type: 'num', def: 20, min: 1, max: 200 } ] },
  { id: 'network', t: '网络', d: '外部 HTTP 请求代理（保存即生效）', f: [
    { k: 'enabled', l: '启用代理', type: 'switch', def: false },
    { k: 'url', l: '代理地址（须带协议头，不支持 SOCKS5）', type: 'text', def: '' },
    { k: 'bypassLocal', l: '本地地址不走代理（推荐）', type: 'switch', def: true },
    { k: 'acceptInvalidCerts', l: '忽略 TLS 证书错误', type: 'switch', def: false } ] },
  { id: 'apiServer', t: 'API + MCP', d: '本地 HTTP API 与 MCP 访问', f: [
    { k: 'enabled', l: '启用本地 HTTP API', type: 'switch', def: true },
    { k: 'allowUnauthenticated', l: '允许无 token 访问', type: 'switch', def: true },
    { k: 'allowLanAccess', l: '允许局域网访问（0.0.0.0，重启生效）', type: 'switch', def: false },
    { k: 'mcpEnabled', l: '启用 MCP 访问', type: 'switch', def: true },
    { k: 'token', l: '访问令牌（Bearer）', type: 'text', def: 'PAke••••••••••••••••ch3q' } ] },
  { id: 'mineru', t: 'MinerU PDF 解析', d: '云端/自托管高质量 PDF 解析', f: [
    { k: 'enabled', l: '启用 MinerU', type: 'switch', def: false },
    { k: 'backend', l: '解析后端', type: 'select', opts: ['云端 mineru.net', '自托管 mineru-api'], def: '云端 mineru.net' },
    { k: 'localEndpoint', l: '本地服务地址', type: 'text', def: '' },
    { k: 'localToken', l: '本地 API Key（可选）', type: 'text', def: '' },
    { k: 'parsingBackend', l: '解析引擎', type: 'select', opts: ['Hybrid', 'Pipeline', 'VLM'], def: 'Hybrid' },
    { k: 'effort', l: 'Hybrid 精度', type: 'select', opts: ['Medium', 'High'], def: 'Medium' },
    { k: 'ocrLanguage', l: 'OCR 语言', type: 'text', def: 'ch' },
    { k: 'parseMethod', l: '解析方式', type: 'select', opts: ['自动', '文本提取', '强制 OCR'], def: '自动' },
    { k: 'token', l: 'API Token（mineru.net）', type: 'text', def: '' },
    { k: 'formulaParsing', l: '公式解析', type: 'switch', def: true },
    { k: 'tableParsing', l: '表格解析', type: 'switch', def: true },
    { k: 'imageAnalysis', l: '图片分析', type: 'switch', def: true } ] },
  { id: 'sourceWatch', t: '资料文件夹自动监控', d: 'raw/sources 变化 → 提取队列', f: [
    { k: 'enabled', l: '监控项目资料文件夹', type: 'switch', def: false },
    { k: 'allProjects', l: '监控所有最近项目', type: 'switch', def: false },
    { k: 'autoIngest', l: '自动提取允许的原始资料文件', type: 'switch', def: true },
    { k: 'persistExtractedMarkdown', l: '保留解析后的 Markdown（raw/parsed）', type: 'switch', def: false },
    { k: 'parsingConcurrency', l: '文档解析并发数', type: 'num', def: 2, min: 1, max: 16 },
    { k: 'ingestConcurrency', l: '资料提取并发数', type: 'num', def: 2, min: 1, max: 16 },
    { k: 'maxSize', l: '自动提取最大文件（MB）', type: 'num', def: 50, min: 1, max: 2000 },
    { k: 'excludeDirs', l: '排除的文件夹', type: 'text', def: '.git, node_modules' },
    { k: 'excludeExtensions', l: '排除的扩展名', type: 'text', def: 'tmp, bak, exe' },
    { k: 'excludeGlobs', l: '排除的文件名模式', type: 'text', def: '' } ] },
  { id: 'scheduledImport', t: '定时导入', d: '按间隔监控外部目录并导入', f: [
    { k: 'enabled', l: '启用定时导入', type: 'switch', def: false },
    { k: 'directory', l: '监控目录（须在项目之外）', type: 'text', def: '' },
    { k: 'interval', l: '扫描间隔（分钟，最小 1）', type: 'num', def: 30, min: 1, max: 1440 } ] },
  { id: 'skills', t: 'Skills', d: '扫描并选择对话可用的 Skill', f: [
    { k: 'paths', l: '扫描目录（只读）', type: 'text', def: '.llm-wiki/skills, ~/.claude/skills, ~/.codex/skills' },
    { k: 'enabledCount', l: '已启用 / 共发现', type: 'num', def: 5, min: 0, max: 999 },
    { k: 'autoRefresh', l: '打开设置时自动重新扫描', type: 'switch', def: false } ] },
  { id: 'maintenance', t: '维护', d: '索引重建 / 导入导出 / 版本历史 / 去重', f: [
    { k: 'historyEnabled', l: '记录文件版本历史（.llm-wiki/history）', type: 'switch', def: false },
    { k: 'historyKeep', l: '每个文件保留版本数（0–30）', type: 'num', def: 10, min: 0, max: 30 } ],
    actions: [ '重建索引', '导出项目', '导入项目', '扫描重复实体/概念', '清空版本历史' ] },
  { id: 'changelog', t: '更新日志', d: '版本可见功能改动（只读）', f: [], readonly: true },
  { id: 'about', t: '关于', d: '构建信息与运行时状态', f: [
    { k: 'autoUpdateCheck', l: '启动时自动检查更新（≤6h 一次）', type: 'switch', def: true },
    { k: 'version', l: '版本（只读）', type: 'text', def: 'v0.6.11', ro: true } ] },
];

function wikiCfgDefaults() {
  const sections = {};
  WIKI_SETTINGS.forEach(s => {
    sections[s.id] = {};
    (s.f || []).forEach(f => { sections[s.id][f.k] = f.def; });
  });
  return sections;
}
function wikiCfgEnsure(mc) {
  if (!mc.sections || typeof mc.sections !== 'object') mc.sections = wikiCfgDefaults();
  WIKI_SETTINGS.forEach(s => {
    if (!mc.sections[s.id]) mc.sections[s.id] = {};
    (s.f || []).forEach(f => { if (mc.sections[s.id][f.k] === undefined) mc.sections[s.id][f.k] = f.def; });
  });
  return mc.sections;
}
/// 扁平化：{general.autostart: false, …}
function wikiCfgFlat(sec) {
  const out = {};
  Object.keys(sec).forEach(g => Object.keys(sec[g] || {}).forEach(k => { out[`${g}.${k}`] = sec[g][k]; }));
  return out;
}
/// 参数对比：主配置 vs 某实例快照 → 差异数组
function wikiDiffSnapshot(snap) {
  const main = wikiCfgFlat(wikiCfgEnsure(wikiState().mainConfig));
  const inst = wikiCfgFlat(snap && snap.sections ? snap : { sections: {} });
  const keys = [...new Set([...Object.keys(main), ...Object.keys(inst)])];
  return keys.filter(k => String(main[k]) !== String(inst[k]))
    .map(k => ({ key: k, main: main[k], inst: inst[k] }));
}
function wikiSnapOf(i) {
  // 回填：实例快照缺 → 从主配置拷贝（b 预置两处漂移，供对比演示真实差异）
  if (!i.cfgSnapshot || !i.cfgSnapshot.sections) {
    const sections = JSON.parse(JSON.stringify(wikiCfgEnsure(wikiState().mainConfig)));
    if (i.name === 'b') { sections.llm.model = 'gpt-5'; sections.interface.theme = '浅色'; }
    i.cfgSnapshot = { sections };
  }
  return i.cfgSnapshot;
}
/// 只更新对比区 DOM —— 轮询与事件共用，绝不整页重绘（保护输入焦点）
function wikiDiffRefresh() {
  const box = document.getElementById('wikiDiffBox');
  if (!box) return;
  const W = wikiState();
  const inst = W.instances.find(x => x.name === (W.diffTarget || W.apiOwner)) || W.instances[0];
  if (!inst) { box.innerHTML = '<div class="hempty">没有实例</div>'; return; }
  const diffs = wikiDiffSnapshot(wikiSnapOf(inst));
  W.diffAt = Date.now(); save(true);
  const only = !!W.diffOnly;
  const rows = (only ? diffs : (() => {
    const main = wikiCfgFlat(wikiCfgEnsure(W.mainConfig));
    return Object.keys(main).map(k => ({ key: k, main: main[k], inst: wikiCfgFlat(wikiSnapOf(inst).sections)[k] }));
  })()).slice(0, 400);
  box.innerHTML = `<div class="hrow" style="padding:0 2px 8px">
      <span class="hsub">对比 <b>${escapeHtml(inst.name)}</b> · ${diffs.length} 处漂移 ·
        上次对比 ${new Date(W.diffAt).toLocaleTimeString()} · 每 8s 轮询 + 保存事件即时刷新</span>
      <span style="flex:1"></span>
      <select id="wikiDiffTarget">${W.instances.map(x =>
        `<option value="${escapeHtml(x.name)}"${x.name === inst.name ? ' selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}</select>
      <button class="hchk${only ? ' is-on' : ''}" id="wikiDiffOnly">仅显示差异</button>
      <button class="hbtn" id="wikiDiffNow">立即对比</button>
      <button class="hbtn" id="wikiDiffAlign">拉齐到主配置</button>
    </div>
    <table class="wiki-diff-table"><thead><tr><th>参数</th><th>主配置（权威源）</th><th>实例 ${escapeHtml(inst.name)}</th><th></th></tr></thead>
    <tbody>${rows.length ? rows.map(r => {
      const same = String(r.main) === String(r.inst);
      return `<tr class="${same ? '' : 'diff'}"><td><code>${escapeHtml(r.key)}</code></td>
        <td>${escapeHtml(String(r.main ?? '—'))}</td><td>${escapeHtml(String(r.inst ?? '—'))}</td>
        <td>${same ? '<span style="color:#4ADE80">✓</span>' : '<span style="color:#FBBF24">≠</span>'}</td></tr>`;
    }).join('') : '<tr><td colspan="4" style="color:#4ADE80;padding:8px">✓ 完全一致</td></tr>'}</tbody></table>`;
  const t = box.querySelector('#wikiDiffTarget');
  if (t) t.onchange = () => { W.diffTarget = t.value; save(true); wikiDiffRefresh(); };
  const ob = box.querySelector('#wikiDiffOnly');
  if (ob) ob.onclick = () => { W.diffOnly = !W.diffOnly; save(true); wikiDiffRefresh(); };
  const nb = box.querySelector('#wikiDiffNow');
  if (nb) nb.onclick = () => { wikiDiffRefresh(); toast('已对比'); };
  const ab = box.querySelector('#wikiDiffAlign');
  if (ab) ab.onclick = () => {
    if (inst.running) { toast(`${inst.name} 运行中 —— 先停止再拉齐（写回会覆盖）`); return; }
    inst.cfgSnapshot = { sections: JSON.parse(JSON.stringify(wikiCfgEnsure(W.mainConfig))) };
    save(true); wikiDiffRefresh();
    toast(`「${escapeHtml(inst.name)}」已拉齐到主配置（同步语义）`);
  };
}
/// 导出全部设置（含 formatIdentifier，防导错文件）
function wikiExportSettings() {
  const W = wikiState();
  wikiCfgEnsure(W.mainConfig);
  const doc = {
    formatIdentifier: 'llm-wiki-settings', formatVersion: 1,
    exportedAt: new Date().toISOString(),
    source: 'Wanna 知识库 · 同步设置（16 sections 全量）',
    sections: W.mainConfig.sections,
  };
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date().toISOString().slice(0, 10);
  a.download = `llm-wiki-settings-${d}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`已导出 ${Object.keys(doc.sections).length} 个 section → llm-wiki-settings-${d}.json`);
}
/// 导入：校验 formatIdentifier → 替换 sections → 事件触发即时对比
function wikiImportSettings(file) {
  const rd = new FileReader();
  rd.onload = () => {
    let doc;
    try { doc = JSON.parse(rd.result); } catch (e) { toast('JSON 解析失败'); return; }
    if (!doc || doc.formatIdentifier !== 'llm-wiki-settings') { toast('不是 LLM Wiki 设置文件（formatIdentifier 不符）'); return; }
    if ((doc.formatVersion || 0) > 1) { toast('文件版本更新，拒绝导入（防半应用）'); return; }
    const W = wikiState();
    W.mainConfig.sections = doc.sections;
    wikiCfgEnsure(W.mainConfig);
    save(true);
    renderWiki();          // 导入是显式动作，允许整页重绘
    wikiDiffRefresh();
    toast(`已导入 ${Object.keys(W.mainConfig.sections).length} 个 section，并触发对比`);
  };
  rd.readAsText(file);
}

/* ── 同步设置页重构：16 section 子导航 + 全字段 + 导入导出 + 对比 ── */
function wikiSyncHTML(pane) {
  const W = wikiState();
  const secs = wikiCfgEnsure(W.mainConfig);
  const tab = W.settingsTab && WIKI_SETTINGS.some(s => s.id === W.settingsTab) ? W.settingsTab : 'general';
  const sec = WIKI_SETTINGS.find(s => s.id === tab);
  const fieldRow = f => {
    const v = secs[tab][f.k];
    let ct = '';
    if (f.type === 'switch') ct = `<button type="button" class="hchk${v ? ' is-on' : ''}" data-wf="${f.k}">${v ? '开' : '关'}</button>`;
    else if (f.type === 'num') ct = `<input type="number" data-wf="${f.k}" value="${Number(v) || 0}"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}${f.ro ? ' disabled' : ''}>`;
    else if (f.type === 'select') ct = `<select data-wf="${f.k}">${(f.opts || []).map(o =>
      `<option${o === v ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
    else ct = `<input type="text" data-wf="${f.k}" value="${escapeHtml(String(v ?? ''))}"${f.ro ? ' readonly' : ''} style="min-width:230px">`;
    return `<div class="hset"><div class="tx"><div class="tt">${escapeHtml(f.l)}</div>
      <div class="ds"><code>${escapeHtml(tab)}.${escapeHtml(f.k)}</code></div></div>
      <div class="ct">${ct}</div></div>`;
  };
  pane.innerHTML = hBar('知识库 · 同步设置（LLM Wiki 全部 16 组设置）',
    '主实例 app-state.json 为权威源 · 导出/导入全量 · 对比轮询保证 100% 同步 · 下发= sync-config 语义',
    `<button class="hbtn" id="wsExport">导出全部设置</button>
     <button class="hbtn" id="wsImportBtn">导入设置</button>
     <input type="file" id="wsImportFile" accept="application/json,.json" hidden>`)
    + `<div class="hbody"><div class="hprof">
        <div class="hprof-list" style="width:170px;flex:0 0 170px">
          <div class="hcol-head" style="padding:2px 2px 8px">设置（${WIKI_SETTINGS.length} 组）</div>
          <div class="hside">${WIKI_SETTINGS.map(s => `
            <div class="hside-item${s.id === tab ? ' is-on' : ''}" data-wsec="${s.id}">
              <span class="ic">${s.readonly ? '📜' : '⚙️'}</span>${escapeHtml(s.t)}</div>`).join('')}</div>
        </div>
        <div class="hprof-body">
          <div class="hcrumb"><b>知识库</b><span class="sep">›</span><b>同步设置</b><span class="sep">›</span>${escapeHtml(sec.t)}</div>
          <div class="hnote" style="padding:0 2px 8px">${escapeHtml(sec.d)}</div>
          <div class="hset-group">${(sec.f || []).map(fieldRow).join('') ||
            '<div class="hset"><div class="tx"><div class="ds">本组为只读展示。</div></div></div>'}</div>
          ${sec.actions ? `<div class="hrow" style="padding:8px 2px;gap:8px">${sec.actions.map(a =>
            `<button class="hbtn" data-wact2="${escapeHtml(a)}">${escapeHtml(a)}</button>`).join('')}
            <span class="hsub" style="margin-left:6px">（真机动作，原型 mock 反馈）</span></div>` : ''}
          ${sec.id === 'changelog' ? `<div class="hset-group"><div class="hset"><div class="tx">
            <div class="ds">v0.6.11 — 多实例/队列恢复/图谱等以本仓库 reference/LLM_Wiki CHANGELOG 为准（原型不复制长文）。</div></div></div></div>` : ''}

          <div class="hset-sec">参数对比（轮询 · 事件双保险）</div>
          <div class="hset-group" style="padding:10px 14px"><div id="wikiDiffBox"></div></div>

          <div class="hset-sec">下发到全部实例</div>
          <div class="hset-group"><div class="hset">
            <div class="tx"><div class="tt">保存与下发</div>
              <div class="ds">先「保存主配置」（触发即时对比），再「一键下发」——剥 lastProject/recentProjects/projectRegistry/
                scheduledImportConfig:*；运行中的实例拒绝（退出写回会覆盖）。导出/导入含全部 16 组，文件带
                formatIdentifier=llm-wiki-settings 防导错。</div></div>
            <div class="ct" style="gap:8px">
              <button class="hbtn" data-wact="saveCfg">保存主配置</button>
              <button class="hbtn" data-wact="syncAll">一键下发全部实例</button>
            </div></div>
          </div>
          <div class="hnote" style="padding:4px 2px 16px">真机：<code>llm-wiki-instance stop &lt;名&gt; && sync-config &lt;名&gt;</code>
            或 <code>sync-config --all</code>；首次继承 <code>clone &lt;名&gt; --seed</code>。</div>
        </div>
      </div></div>`;
  // 子导航
  pane.querySelectorAll('[data-wsec]').forEach(el => el.onclick = () => {
    W.settingsTab = el.dataset.wsec; save(true); renderWiki();
  });
  // 字段绑定（switch 点击切、其余 change 落盘）
  pane.querySelectorAll('[data-wf]').forEach(el => {
    const k = el.dataset.wf;
    if (el.classList.contains('hchk')) {
      el.onclick = () => { secs[tab][k] = !secs[tab][k]; save(true); renderWiki(); };
    } else {
      el.onchange = () => {
        const f = (sec.f || []).find(x => x.k === k);
        let v = el.value;
        if (f && f.type === 'num') { v = Number(v) || 0; if (f.min !== undefined) v = Math.max(f.min, v); if (f.max !== undefined) v = Math.min(f.max, v); }
        secs[tab][k] = v; save(true);
        wikiDiffRefresh();          // 事件：参数一变立即对比
        toast(`已保存 ${tab}.${k}（对比已刷新）`);
      };
    }
  });
  pane.querySelectorAll('[data-wact2]').forEach(b => b.onclick = () =>
    toast(`${escapeHtml(b.dataset.wact2)} —— 真机动作（原型 mock：如重建索引走 API/本地任务）`));
  // 导出 / 导入
  pane.querySelector('#wsExport').onclick = () => wikiExportSettings();
  const fi = pane.querySelector('#wsImportFile');
  pane.querySelector('#wsImportBtn').onclick = () => fi.click();
  fi.onchange = () => { if (fi.files && fi.files[0]) wikiImportSettings(fi.files[0]); fi.value = ''; };
  // 保存 / 下发
  pane.querySelectorAll('[data-wact]').forEach(b => b.onclick = () => {
    if (b.dataset.wact === 'saveCfg') { save(true); wikiDiffRefresh(); toast('主配置已保存（权威源）· 对比已刷新'); return; }
    const W2 = wikiState();
    const targets = W2.instances.filter(i => i.name !== W2.apiOwner);
    W2.syncLog = targets.map(t => t.running
      ? { target: t.name, ok: false, msg: '跳过：运行中（先 stop，防写回覆盖）' }
      : { target: t.name, ok: true, msg: '✓ 已写入 app-state（剥项目指针）' });
    // 成功的实例拉齐快照 → 对比差异归零
    targets.forEach(t => { if (!t.running) t.cfgSnapshot = { sections: JSON.parse(JSON.stringify(wikiCfgEnsure(W2.mainConfig))) }; });
    save(true); wikiDiffRefresh();
    const okN = W2.syncLog.filter(x => x.ok).length;
    toast(`下发完成：${okN}/${W2.syncLog.length} 成功${W2.syncLog.length - okN ? `，${W2.syncLog.length - okN} 个需先停止` : '（对比差异已清零）'}`);
  });
  wikiDiffRefresh();
}
/// 8s 轮询（全局一次；只在同步页刷对比区，不整页重绘）
let wikiDiffTimer = null;
function wikiDiffStartPolling() {
  if (wikiDiffTimer) return;
  wikiDiffTimer = setInterval(() => {
    if (wikiView === 'sync' && document.getElementById('wikiDiffBox')) wikiDiffRefresh();
  }, 8000);
}

/* ══ §54B 知识库 · 关系图（真 API 直连 + Canvas 高速渲染 + 点节点读文章）══
   API（实测全通）：
     GET /api/v1/projects                      → [{id,name,path}…]
     GET /api/v1/projects/{id}/graph?limit=1000[&q=] → {nodes:[{id,label,linkCount,nodeType,path}], edges:[{source,target,weight}], hasMore}
     GET /api/v1/projects/{id}/files/content?path=    → {content}
   高速加载设计（不卡顿的五条，全部落在代码里）：
     ① 数据 limit=1000 一次拉齐、旧图保留到新数据到达（切换项目无白屏）
     ② **Canvas 单层渲染**（不是 SVG/DOM 节点 —— 千级节点 DOM 必卡）
     ③ **确定性分层布局**（按 nodeType 分列，坐标由 label hash 生成）—— O(n) 出图、无迭代力导、打开即定形
     ④ 只在交互（缩放/平移/拖动）时重绘；滚轮/拖拽只改 {scale,tx,ty} 三个数
     ⑤ 文章正文**懒加载**（点节点才 fetch content）
   失败降级：CORS/网络失败 → seeded mock 图 + 演示正文，状态行如实标注「演示数据」。 */

function wikiGraphMock(projectName) {
  // 确定性伪随机（同项目每次一样）
  let seed = 0; for (const ch of projectName) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const types = ['entity', 'concept', 'finding', 'source'];
  const nodes = [];
  types.forEach(t => {
    for (let i = 0; i < 10; i++) {
      const label = `${t}-${i + 1}·${projectName.slice(0, 4)}`;
      nodes.push({ id: label, label, linkCount: 1 + Math.floor(rnd() * 8), nodeType: t, path: `wiki/${t}s/${label}.md` });
    }
  });
  const edges = [];
  for (let i = 0; i < 55; i++) {
    const a = nodes[Math.floor(rnd() * nodes.length)], b = nodes[Math.floor(rnd() * nodes.length)];
    if (a !== b) edges.push({ source: a.id, target: b.id, weight: 1 });
  }
  return { nodes, edges, hasMore: false, mock: true };
}

async function wikiGraphLoad() {
  const W = wikiState();
  const proj = (W.apiProjects || []).find(p => p.name === W.graphProject)
    || W.projects.find(p => p.name === W.graphProject);
  const t0 = performance.now();
  W.graphLoading = true; wikiGraphStatsRefresh();
  try {
    if (!proj || !proj.id) throw new Error('no-uuid');     // 本地清单无 UUID → 必须 mock
    const q = W.graphQ ? `&q=${encodeURIComponent(W.graphQ)}` : '';
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(`http://127.0.0.1:19828/api/v1/projects/${proj.id}/graph?limit=1000${q}`,
      { signal: ctrl.signal });
    const j = await r.json();
    if (!j || !Array.isArray(j.nodes)) throw new Error('bad shape');
    W.graph = { nodes: j.nodes, edges: j.edges || [], hasMore: !!j.hasMore, mock: false,
      project: W.graphProject, fetchedAt: Date.now(), fetchMs: Math.round(performance.now() - t0) };
  } catch (e) {
    const g = wikiGraphMock(W.graphProject || 'demo');
    W.graph = { ...g, project: W.graphProject, fetchedAt: Date.now(),
      fetchMs: Math.round(performance.now() - t0), degrade: String(e && e.message || e).slice(0, 40) };
  }
  W.graphLoading = false;
  save(true);
  renderWiki();                 // 新数据到达才整页换（旧图期间 stats 局部刷新）
}

function wikiGraphStatsRefresh() {
  const el = document.getElementById('wgStats');
  if (!el) return;
  const W = wikiState();
  const g = W.graph;
  if (W.graphLoading) { el.innerHTML = '<span class="qe-state off">加载中…</span>'; return; }
  if (!g) { el.innerHTML = '<span class="qe-state off">未加载</span>'; return; }
  el.innerHTML = `<span class="qe-state ${g.mock ? 'err' : 'ok'}">${g.mock ? '演示数据（真 API 不可达）' : '真数据'}</span>
    <span class="hchip">节点 ${g.nodes.length}</span><span class="hchip">边 ${g.edges.length}</span>
    <span class="hchip">拉取 ${g.fetchMs}ms</span><span class="hchip">渲染 ${g.drawMs || 0}ms</span>
    ${g.hasMore ? '<span class="hchip">hasMore</span>' : ''}`;
}

const WG_TYPE_COLOR = { entity: '#60A5FA', concept: '#34D399', source: '#FBBF24',
  finding: '#F472B6', query: '#A78BFA', synthesis: '#A78BFA' };
let wgView = { scale: 1, tx: 40, ty: 40, drag: null, moved: 0, positions: [] };

function wgLayout(g, w, h) {
  // 确定性分层：nodeType 分列，列内按 y 均匀分布 + label hash 抖动（O(n)，一次成形）
  const types = [...new Set(g.nodes.map(n => n.nodeType || 'concept'))];
  const cols = Math.max(types.length, 1);
  const colW = Math.max(160, (w - 80) / cols);
  const pos = new Map();
  types.forEach((t, ci) => {
    const list = g.nodes.filter(n => (n.nodeType || 'concept') === t);
    const rowH = Math.max(36, (h - 80) / Math.max(list.length, 1));
    list.forEach((n, ri) => {
      let hash = 0; for (const ch of n.label) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
      const jitter = (hash % 40) - 20;
      pos.set(n.id, { x: 40 + ci * colW + colW / 2 + jitter, y: 50 + ri * rowH + rowH / 2,
        r: 5 + Math.min(n.linkCount || 1, 8), t: n.nodeType || 'concept', n });
    });
  });
  return pos;
}

function wgDraw() {
  const canvas = document.getElementById('wgCanvas');
  if (!canvas) return;
  const W = wikiState();
  const g = W.graph;
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const cw = wrap.clientWidth, ch = wrap.clientHeight;
  if (canvas.width !== Math.round(cw * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
  const t0 = performance.now();
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  if (!g) { ctx.fillStyle = '#6B7680'; ctx.font = '13px sans-serif';
    ctx.fillText('选项目后点「加载图谱」', 24, 34); return; }
  if (!wgView.positions || wgView.forGraph !== g) {
    wgView.positions = wgLayout(g, Math.max(cw, 600), Math.max(ch, 400));
    wgView.forGraph = g;
  }
  const pos = wgView.positions;
  ctx.save();
  ctx.translate(wgView.tx, wgView.ty);
  ctx.scale(wgView.scale, wgView.scale);
  // 边
  ctx.strokeStyle = 'rgba(148,163,184,.28)';
  ctx.lineWidth = 1 / wgView.scale;
  ctx.beginPath();
  for (const e of g.edges) {
    const a = pos.get(e.source), b = pos.get(e.target);
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  // 节点 + 标签
  const showLabel = wgView.scale >= 0.55;
  for (const [id, p] of pos) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = WG_TYPE_COLOR[p.t] || '#A78BFA';
    ctx.fill();
    if (showLabel) {
      ctx.fillStyle = '#C7D2DA';
      ctx.font = `${11 / Math.max(wgView.scale, .6)}px sans-serif`;
      const label = p.n.label.length > 16 ? p.n.label.slice(0, 15) + '…' : p.n.label;
      ctx.fillText(label, p.x + p.r + 4, p.y + 3);
    }
  }
  ctx.restore();
  const ms = Math.round(performance.now() - t0);
  if (g.drawMs !== ms) { g.drawMs = ms; wikiGraphStatsRefresh(); }
  // 可达性钩子：记录首节点的屏幕坐标（自动化/辅助功能定位用）
  const first = wgView.positions && wgView.positions.values().next().value;
  if (first) canvas.dataset.first = `${Math.round(first.x * wgView.scale + wgView.tx)},${Math.round(first.y * wgView.scale + wgView.ty)}`;
}

function wgBindCanvas(pane) {
  const canvas = pane.querySelector('#wgCanvas');
  if (!canvas) return;
  const redraw = () => requestAnimationFrame(wgDraw);
  canvas.onwheel = e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const ns = Math.min(4, Math.max(0.25, wgView.scale * factor));
    // 以光标为锚点缩放（改 scale + 平移补偿，一次重绘）
    wgView.tx = mx - (mx - wgView.tx) * (ns / wgView.scale);
    wgView.ty = my - (my - wgView.ty) * (ns / wgView.scale);
    wgView.scale = ns;
    redraw();
  };
  canvas.onmousedown = e => {
    wgView.drag = { x: e.clientX, y: e.clientY, tx: wgView.tx, ty: wgView.ty };
    wgView.moved = 0;
  };
  canvas.onmousemove = e => {
    if (!wgView.drag) return;
    const dx = e.clientX - wgView.drag.x, dy = e.clientY - wgView.drag.y;
    wgView.moved = Math.max(wgView.moved, Math.abs(dx) + Math.abs(dy));
    wgView.tx = wgView.drag.tx + dx; wgView.ty = wgView.drag.ty + dy;
    redraw();
  };
  window.addEventListener('mouseup', () => { wgView.drag = null; });
  canvas.onclick = e => {
    if (wgView.moved > 4) return;               // 拖过就不算点击
    const W = wikiState();
    const g = W.graph; if (!g || !wgView.positions) return;
    const rect = canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left - wgView.tx) / wgView.scale;
    const wy = (e.clientY - rect.top - wgView.ty) / wgView.scale;
    let best = null, bestD = 14 / wgView.scale + 8;   // 命中半径随缩放反比
    for (const [, p] of wgView.positions) {
      const d = Math.hypot(p.x - wx, p.y - wy) - p.r;
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) wgOpenArticle(best.n);
  };
  redraw();
  // 视口变化跟随重绘
  if (!wgBindCanvas._ro) {
    wgBindCanvas._ro = new ResizeObserver(() => requestAnimationFrame(wgDraw));
  }
  wgBindCanvas._ro.observe(canvas.parentElement);
}

async function wgOpenArticle(node) {
  const W = wikiState();
  const panel = document.getElementById('wgArticle');
  if (!panel) return;
  panel.style.display = '';
  panel.innerHTML = `<div class="hrow" style="justify-content:space-between">
      <b>${escapeHtml(node.label)}</b><button class="hbtn sm" id="wgClose">✕</button></div>
    <div class="hsub" style="margin:4px 0 8px">${escapeHtml(node.nodeType)} · ${escapeHtml(node.path || '')} · 度 ${node.linkCount || 0}</div>
    <div class="hsub">加载正文…</div>`;
  panel.querySelector('#wgClose').onclick = () => { panel.style.display = 'none'; };
  const W2 = wikiState();
  const proj = (W2.apiProjects || []).find(p => p.name === W2.graphProject)
    || W2.projects.find(p => p.name === W2.graphProject);
  try {
    if (!proj || !proj.id || !node.path) throw new Error('no-path');
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`http://127.0.0.1:19828/api/v1/projects/${proj.id}/files/content?path=${encodeURIComponent(node.path)}`,
      { signal: ctrl.signal });
    const j = await r.json();
    const text = String(j.content || '').slice(0, 12000);
    panel.innerHTML = `<div class="hrow" style="justify-content:space-between">
        <b>${escapeHtml(node.label)}</b><button class="hbtn sm" id="wgClose">✕</button></div>
      <div class="hsub" style="margin:4px 0 8px">${escapeHtml(node.path || '')}</div>
      <pre class="wg-doc">${escapeHtml(text || '（空文件）')}</pre>`;
  } catch (e) {
    panel.innerHTML = `<div class="hrow" style="justify-content:space-between">
        <b>${escapeHtml(node.label)}</b><button class="hbtn sm" id="wgClose">✕</button></div>
      <div class="hsub" style="margin:4px 0 8px">${escapeHtml(node.path || '')} · 真正文不可达（${escapeHtml(String(e && e.message || e))}）</div>
      <pre class="wg-doc"># ${escapeHtml(node.label)}

（演示正文 · 降级模式）
本图当前为${W.graph && W.graph.mock ? '演示数据' : '真数据但正文请求失败'}。
真机通道：GET /api/v1/projects/{id}/files/content?path=${escapeHtml(node.path || '')}</pre>`;
  }
  panel.querySelector('#wgClose').onclick = () => { panel.style.display = 'none'; };
}

function wikiGraphHTML(pane) {
  const W = wikiState();
  const projects = (W.apiProjects && W.apiProjects.length ? W.apiProjects : W.projects);
  if (!W.graphProject || !projects.some(p => p.name === W.graphProject)) W.graphProject = projects[0] && projects[0].name;
  pane.innerHTML = hBar('知识库 · 关系图（Graph）',
    '真 API：graph limit=1000 · Canvas 分层渲染 · 点节点读原文（files/content）',
    `<span id="wgStats"><span class="qe-state off">未加载</span></span>`)
    + `<div class="hbody" style="position:relative">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column">
        <div class="hrow" style="padding:8px 12px;gap:8px;align-items:center;border-bottom:1px solid var(--line,#26292C)">
          <span class="hsub">知识库</span>
          <select id="wgProject">${projects.map(p =>
            `<option${p.name === W.graphProject ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select>
          <input type="text" id="wgQ" placeholder="过滤 q（节点标签）…" value="${escapeHtml(W.graphQ || '')}" style="width:180px">
          <button class="hbtn primary" id="wgLoad">加载图谱</button>
          <span class="hsub">滚轮缩放 · 拖拽平移 · 点节点看文章</span>
        </div>
        <div style="flex:1;position:relative;min-height:0" id="wgWrap">
          <canvas id="wgCanvas" style="position:absolute;inset:0;width:100%;height:100%;cursor:grab"></canvas>
          ${!W.graph ? `<div class="hempty" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
            选知识库 → 点「加载图谱」（真 API 失败自动降级演示图）</div>` : ''}
        </div>
      </div>
      <div id="wgArticle" style="display:none;width:320px;flex:0 0 320px;border-left:1px solid var(--line,#26292C);
        overflow:auto;padding:10px 12px;background:rgba(255,255,255,.02)"></div>
    </div>`;
  // 顺手拉一次真实项目清单（UUID 才能调 graph；失败保持本地清单）
  if (!W.apiProjects) {
    fetch('http://127.0.0.1:19828/api/v1/projects').then(r => r.json()).then(j => {
      if (j && Array.isArray(j.projects) && j.projects.length) {
        const W2 = wikiState();
        W2.apiProjects = j.projects;
        // 当前选择不在真清单（本地目录名 ≠ registry 项目）→ 自动切到第一个真项目，保证 graph 走真数据
        if (!j.projects.some(p => p.name === W2.graphProject)) W2.graphProject = j.projects[0].name;
        save(true);
        if (wikiView === 'graph') renderWiki();
      }
    }).catch(() => {});
  }
  pane.querySelector('#wgLoad').onclick = () => {
    const W2 = wikiState();
    W2.graphProject = pane.querySelector('#wgProject').value;
    W2.graphQ = pane.querySelector('#wgQ').value.trim();
    save(true);
    wikiGraphLoad();
  };
  pane.querySelector('#wgProject').onchange = () => {
    // 切换知识库：旧图保留到新数据到达（无白屏）
    const W2 = wikiState();
    W2.graphProject = pane.querySelector('#wgProject').value;
    save(true);
    wikiGraphLoad();
  };
  wgBindCanvas(pane);
  wikiGraphStatsRefresh();
}

})();
