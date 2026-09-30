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
  projects: [sampleProject(), defaultProjectSeed()],   // §20.9：末尾那个是「默认」项目文件夹
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
  dualScreen: false,               // §23.2 会话窗口：单屏（默认）/ 双屏（连续 ｜ 临时 并排）
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
const convCount = pool => pool.filter(x => !x.isGroup).length;
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
  const items = Array.isArray(pool) ? pool : [];
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
function placeMenuAbove(m, x, yBottom) {
  m.hidden = false;
  const w = m.offsetWidth, h = m.offsetHeight;
  let top = yBottom - 6 - h;
  if (top < 6) top = Math.min(yBottom + 6, innerHeight - h - 6);
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
  const left = xy ? xy.x : (r ? r.left : 100), top = xy ? xy.y : (r ? r.bottom + 4 : 100);
  m.hidden = false;
  placeMenu(m, left, top);
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
    el.ondragstart = e => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); };
    el.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
    el.ondrop = e => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'); moveTabTo(from, i); };
    el.ondragend = () => el.classList.remove('dragging');
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
  el.ondragstart = e => { e.dataTransfer.setData('text/plain', String(i)); el.classList.add('dragging'); };
  el.ondragover = e => { e.preventDefault(); };
  el.ondrop = e => { e.preventDefault(); moveTabTo(+e.dataTransfer.getData('text/plain'), i); };
  el.ondragend = () => el.classList.remove('dragging');
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
function toggleDualScreen() {
  S.dualScreen = !S.dualScreen; save(true);
  renderScreenToggle(); renderChat();
  toast(S.dualScreen ? '已切到<b>双屏</b> —— 连续 与 临时 左右并排（功能不变）'
                     : '已收回<b>单屏</b> —— 只有一个会话窗口');
}
/// 会话右键「临时聊天分屏显示」用：直接开双屏并把当前流切到临时
function renderDualScreen() { renderScreenToggle(); renderChat(); }

function renderChat() {
  const host = $('#msgs'); host.innerHTML = '';
  renderScreenToggle();
  const mk = m => {
    const el = document.createElement('div');
    el.className = `msg msg-${m.role}` + (m.temp ? ' msg-temp' : '');
    const who = m.role === 'user' ? '你' : m.role === 'ai' ? (m.temp ? 'AI · 临时对话' : 'AI') : '系统';
    el.innerHTML = `<div class="msg-who">${who}</div><div class="bubble">${m.html}</div>`
      + (m.meta ? `<div class="msg-meta">${m.meta}</div>` : '');
    return el;
  };
  const emptyHtml = `<div class="msg msg-sys"><div class="bubble">
      ${proj()
        ? '围绕项目提问，或直接让它改脑图 —— 每次改动都会自动备份历史。'
        : '这是<b>临时对话</b>：没有项目文件，直接和 AI 聊。想要围绕项目，点左边 ＋ 添加文件夹。'}
      </div></div>`;
  if (!S.chat.length) {
    if (S.dualScreen) {
      host.classList.add('dual');
      const l = document.createElement('div'); l.className = 'msg-col';
      l.innerHTML = `<div class="msg-col-head">连续会话</div>` + emptyHtml;
      const r = document.createElement('div'); r.className = 'msg-col';
      r.innerHTML = `<div class="msg-col-head is-temp">临时会话</div>`;
      host.append(l, r);
    } else {
      host.classList.remove('dual');
      host.innerHTML = emptyHtml;
    }
    return;
  }
  if (S.dualScreen) {
    host.classList.add('dual');
    const l = document.createElement('div'); l.className = 'msg-col';
    l.innerHTML = `<div class="msg-col-head">连续会话</div>`;
    const r = document.createElement('div'); r.className = 'msg-col';
    r.innerHTML = `<div class="msg-col-head is-temp">临时会话</div>`;
    S.chat.forEach(m => (m.temp ? r : l).appendChild(mk(m)));
    host.append(l, r);
  } else {
    host.classList.remove('dual');
    S.chat.forEach(m => host.appendChild(mk(m)));
  }
  host.scrollTop = host.scrollHeight;
}
/// §22.13 —— replyBusy 模拟"上一条还没答完"（原型没有真模型，用一个定时器当生成窗口）
let replyBusy = false, replyTimer = null;
function renderSendPolicy() {
  const pol = S.sendPolicy || 'queue';
  $$('#qRow .q-opt').forEach(b => b.classList.toggle('is-on', b.dataset.policy === pol));
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

/* ── 分割线拖拽 ─────────────────────────────── */
function dragSplit(el, apply) {
  el.addEventListener('mousedown', e => {
    e.preventDefault(); el.classList.add('drag');
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
/// 通用弹出菜单：给一串 {label, danger?, action?} 就画出来（分组菜单 / 卡片附加项都用它）
function showMenu(items, anchor, xy) {
  closeMenus();                              // 任何菜单打开前先关掉其它（含分组/卡片/项目）
  closeGitPanel();
  if (!menuDyn) {
    menuDyn = document.createElement('div');
    menuDyn.className = 'menu'; menuDyn.id = 'menuDyn';
    document.body.appendChild(menuDyn);
  }
  menuDyn.innerHTML = '';
  items.forEach(it => {
    if (it.sep) { menuDyn.insertAdjacentHTML('beforeend', '<div class="menu-sep"></div>'); return; }
    if (it.title) { menuDyn.insertAdjacentHTML('beforeend', `<div class="menu-title">${escapeHtml(it.title)}</div>`); return; }
    const b = document.createElement('button');
    b.textContent = it.label;
    if (it.danger) b.className = 'danger';
    b.onclick = () => { menuDyn.hidden = true; it.action && it.action(); };
    menuDyn.appendChild(b);
  });
  const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
  const left = xy ? xy.x : (r ? r.left : 100);
  const top = xy ? xy.y : (r ? r.bottom + 4 : 100);
  menuDyn.hidden = false;
  placeMenu(menuDyn, left, top);
}
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
    // 文件头那颗「恢复」= 同一个提交恢复面板（§18.2：文件位置上必须有恢复入口）
    $('#btnRestoreFile').onclick = e => { e.stopPropagation(); closeMenus(); openGitPanel(e.currentTarget, true); };
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
    m.hidden = false;
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - 230)) + 'px';
    m.style.top = (r.bottom + 6) + 'px';
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
  $('#btnFs2').onclick = toggleFullscreen;
  $('#btnFsExit').onclick = toggleFullscreen;
  $('#btnLayout').onclick = cycleLayout;
  // ⭐ 编辑区开关（一个按钮带滑块，点一下开、点一下关）—— 放顶栏最左
  $('#editorSwitch').onclick = () => {
    if (!S.projectMode) {
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
    toast(`通话 = 当前<b>${m}</b>模式的通话（位置固定在刘海右侧，不随模式条移动）`);
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
    m.style.left = Math.max(8, Math.min(r.left - 120, innerWidth - 220)) + 'px';
    m.style.top = (r.bottom + 6) + 'px';
    m.querySelector('[data-act="defLeft"]').classList.toggle('is-on', S.defaultLayout === 'left');
    m.querySelector('[data-act="defCenter"]').classList.toggle('is-on', S.defaultLayout === 'center');
    m.querySelector('[data-act="defRight"]').classList.toggle('is-on', S.defaultLayout === 'right');
    // §22.13.3 发送方式也在设置里能选
    m.querySelector('[data-act="policyQueue"]').classList.toggle('is-on', (S.sendPolicy || 'queue') === 'queue');
    m.querySelector('[data-act="policyInterrupt"]').classList.toggle('is-on', S.sendPolicy === 'interrupt');
  };

  $('#btnSend').onclick = sendChat;
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
    const r = $('#main').getBoundingClientRect();
    const w = Math.max(170, Math.min(r.width * 0.42, e.clientX - r.left));
    document.documentElement.style.setProperty('--nav-w', w + 'px');
  });
  dragSplit($('#hSplit'), e => {
    const r = document.body.getBoundingClientRect();
    const w = Math.max(250, Math.min(r.width * 0.5, r.right - e.clientX));
    document.documentElement.style.setProperty('--chat-w', w + 'px');
  });
  // 源码 ｜ 预览 中间那条也能拖（§12.7：笔记这块之前调不了）
  dragSplit($('#mdGutter'), e => {
    const box = $('#mdSplit').getBoundingClientRect();
    const w = Math.max(160, Math.min(box.width - 180, e.clientX - box.left));
    document.documentElement.style.setProperty('--md-src-w', w + 'px');
  });

  document.addEventListener('keydown', e => {
    const meta = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
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
function openRateMenu(anchor) {
  const m = $('#menuRate');
  const wasOpen = !m.hidden;              // 关掉别人的菜单会顺手关掉自己 —— 先记再关，否则永远关不上
  closeMenus();
  closeGitPanel();
  if (wasOpen) return;
  m.innerHTML = `<div class="menu-title">语速</div>`
    + SPEECH_RATES.map(v => `<button data-rate="${v}"${S.speechRate === v ? ' class="is-on"' : ''}>`
        + `${S.speechRate === v ? '✓ ' : ''}${rateLabelOf(v)}</button>`).join('');
  $$('button', m).forEach(b => b.onclick = () => {
    S.speechRate = parseFloat(b.dataset.rate);
    save(true);
    closeMenus();
    renderComposerControls();
    toast(`语速已设为 <b>${rateLabelOf(S.speechRate)}</b>`);
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
  $('#composerModeLabel').textContent =
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
    msgs: c.msgs || 0, projectLabel: p.name, kind: 'project', ref: { p: p.id, id: c.id } })));
  (S.plans || []).filter(x => !x.isGroup).forEach(pl => push({
    id: 'vs_' + pl.id, sid: pl.sid || pl.id, title: pl.title, cwd: defaultFolderPath(),
    ts: pl.ts || now(), msgs: 0, projectLabel: '默认', kind: 'default', ref: { id: pl.id } }));
  return out;
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
  list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
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
  $('#railLeft')?.classList.toggle('has-open', !!S.automationOpen);
  $('#railLeft .rail-btn')?.classList.toggle('is-on', !!S.automationOpen);
  $('#panelAutomation').hidden = !S.automationOpen;
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
function renderSideVault() {
  const sub = $('#sideSub'), body = $('#sideBody');
  const f = vaultFilterState();
  sub.innerHTML = `
    <input class="sp-input" style="margin:0 0 6px" id="vaultQuery"
      placeholder="搜索会话…" spellcheck="false" value="${escapeHtml(f.query)}">
    <div class="sp-filters" style="padding:0">
      ${VAULT_SCOPES.map(([v, l]) => `<button class="sp-chip ${f.scope === v ? 'is-on' : ''}" data-vscope="${v}">${l}</button>`).join('')}
      <button class="sp-chip" data-vmenu="host" title="执行主机">🖥 ${escapeHtml(S.vaultHost || 'local')}</button>
      <button class="sp-chip" data-vmenu="filter" title="过滤：智能体 / 分组 / 隐藏空会话">⚙ 过滤</button>
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
    } else {
      const present = [...new Set(buildVaultSessions().map(x => x.agent))];
      showMenu(
        [{ title: '选择智能体（多选）' }]
          .concat(present.map(a => ({ label: (f.agents.includes(a) ? '✓ ' : '  ') + a,
            action: () => { const set = new Set(f.agents); set.has(a) ? set.delete(a) : set.add(a);
              S.vaultAgents = [...set]; save(true); renderSideVault(); } })))
          .concat([{ sep: true }, { title: '分组' }])
          .concat(VAULT_GROUPS.map(([v, l]) => ({ label: (f.group === v ? '✓ ' : '  ') + l,
            action: () => { S.vaultGroup = v; save(true); renderSideVault(); } })))
          .concat([{ sep: true },
            { label: (f.hideEmpty ? '✓ ' : '  ') + '隐藏空会话', action: () => { S.vaultHideEmpty = !f.hideEmpty;
                save(true); renderSideVault(); } },
            { label: '恢复默认过滤', action: () => { S.vaultAgents = []; S.vaultScope = 'workspace';
                S.vaultGroup = 'project'; S.vaultHideEmpty = false; S.vaultLimit = 100;
                save(true); renderSideVault(); toast('已恢复默认过滤'); } }]),
        b);
    }
  });

  const groups = vaultFilteredGroups();
  if (!groups.length) { body.innerHTML = `<div class="sp-empty">没有匹配的会话<br><span style="opacity:.7">刷新可强制重扫</span></div>`; return; }
  body.innerHTML = '';
  let shown = 0;
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
    g.sessions.forEach(x => { body.appendChild(vaultRow(x)); shown++; });
  });
  const sum = document.createElement('div');
  sum.className = 'sp-sum';
  sum.textContent = `${shown} sessions · group by ${f.group}${f.agents.length ? ' · agents: ' + f.agents.join(',') : ''}`;
  body.appendChild(sum);
}
function vaultRow(x) {
  const open = !!(S.vaultOpen || {})[x.id];
  const wrap = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'sp-row' + (open ? ' is-on' : '');
  // §23.4.13 字段照 ai-vault-session-row-display.tsx SessionMetadata：
  // title ｜ agent + N msgs + N subagents + model ｜ worktree 徽章 + 最近一轮 preview ｜ 时间
  const worktree = String(x.cwd || '').split('/').filter(Boolean).pop() || '—';
  row.innerHTML = `<span class="ic">${escapeHtml(x.agent.slice(0, 2))}</span>
    <span class="bd"><span class="t1">${escapeHtml(x.title || x.sessionId)}</span>
      <span class="t2">${escapeHtml(x.agent)} · ${x.messageCount} msgs · ${x.subagentCount} subagents · ${escapeHtml(x.model || '-')}</span>
      <span class="t3"><b class="vtree" title="${escapeHtml(x.cwd || '')}">${escapeHtml(worktree)}</b>${
        x.preview ? `<span class="vpv">${escapeHtml(x.preview)}</span>` : ''}</span></span>
    <span class="rt">${new Date(x.updatedAt).toLocaleDateString()}</span>`;
  row.onclick = () => { S.vaultOpen = S.vaultOpen || {}; S.vaultOpen[x.id] = !open;
    save(true); renderSideVault(); };
  wrap.appendChild(row);
  if (open) {
    const canResume = x.messageCount > 0;
    const kv = document.createElement('div');
    kv.className = 'sp-kv';
    kv.innerHTML = `<div><b>agent</b> <code>${escapeHtml(x.agent)}</code>　<b>model</b> <code>${escapeHtml(x.model || '-')}</code></div>
      <div><b>host</b> <code>${escapeHtml(x.executionHostId)}</code>　<b>cwd</b> <code>${escapeHtml(x.cwd || '-')}</code></div>
      <div><b>branch</b> <code>${x.branch || '-'}</code>　<b>msgs</b> <code>${x.messageCount}</code></div>
      <div><b>resume</b> <code>${escapeHtml(x.resumeCommand)}</code></div>
      <div class="sp-acts" style="margin-top:6px">
        <button class="sp-act ok" data-a="resume" ${canResume ? '' : 'disabled'}>恢复</button>
        <button class="sp-act" data-a="locate">定位</button>
        <button class="sp-act" data-a="copy">复制 resume</button>
      </div>`;
    kv.querySelector('[data-a="resume"]').onclick = e => { e.stopPropagation(); vaultResume(x); };
    kv.querySelector('[data-a="locate"]').onclick = e => { e.stopPropagation(); vaultLocate(x); };
    kv.querySelector('[data-a="copy"]').onclick = e => { e.stopPropagation();
      navigator.clipboard?.writeText(x.resumeCommand); toast('已复制 resume 命令'); };
    wrap.appendChild(kv);
  }
  return wrap;
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
  if (map[id]) newTabAction(map[id]);
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
}

})();
