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
    pinned: true, open: true,
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
  projects: [sampleProject()],
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
  mdVariant: 'split',              // code | preview | split
  codeFolded: false,
  collapsed: {},
  mindZoom: 1,
  layout: 'right',                 // 对话在右 ⇄ 对话在中
  navOpen: true,
  recentOpen: true,
  mode: 'imageText',
  chatMode: 'continuous',
  history: {},
  gitLog: [],
  chat: [],
  recent: []
};

function load() {
  try {
    const r = JSON.parse(localStorage.getItem(LS_KEY));
    if (!r || !Array.isArray(r.projects)) return null;
    if (!Array.isArray(r.focusFiles)) r.focusFiles = [];
    if (!Array.isArray(r.tabs)) r.tabs = [];
    if (!Array.isArray(r.plans)) r.plans = [];          // v2→v3：补「临时规划」块
    if (typeof r.projectMode !== 'boolean') r.projectMode = !!(r.projects && r.projects.length);
    if (!Array.isArray(r.recent)) r.recent = [];
    if (typeof r.activePlan === 'undefined') r.activePlan = null;
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
  || S.projects[0] || null;
const relOfActiveTab = () => (S.tabs[S.activeTab] || {}).f || null;
const fullPath = (rel, p = proj()) => p ? `${p.path}/${rel}` : rel || '';
const fileContent = rel => (proj() && proj().files[rel]) || '';
const MIND_FILE = '脑图.mmd';
const histFile = () => S.currentFile || relOfActiveTab();

let toastTimer;
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('[data-jump-history]');
  if (a) { e.preventDefault(); const b = $('#btnHistoryHead') || $('#btnHistory'); b && b.click(); }
});
function toast(html) {
  const t = $('#toast'); t.innerHTML = html; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2800);
}

/* ── 本软件风格的模态（§12.3：不许再用系统 prompt / confirm） ── */
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
function renderNav() {
  const inProject = S.projectMode && !!proj();
  $('#ctxProjectPath').textContent = inProject ? proj().path
    : (S.projects.length ? `对话模式 · 已有 ${S.projects.length} 个项目` : '对话模式（没有项目）');
  $('#ctxProjectPath').title = $('#ctxProjectPath').textContent;
  $('#brandName').textContent = inProject ? '项目' : '对话';
  $('#brandSub').textContent = inProject ? (proj() ? proj().name : '') : '连续 · 历史对话';
  $('#btnProjectMode').classList.toggle('is-active', inProject);
  $('#btnProjectMode').textContent = inProject ? '项目 · 开' : '项目';

  const planOpen = S.planOpen !== false;
  $('#btnProjSect').classList.toggle('closed', !S.navOpen);
  $('#btnPlanSect').classList.toggle('closed', !planOpen);
  $('#projectList').style.display = S.navOpen ? '' : 'none';
  $('#planList').style.display = planOpen ? '' : 'none';

  // ── 项目块 ──
  const host = $('#projectList'); host.innerHTML = '';
  const active = proj();
  const ordered = [...S.projects].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  ordered.forEach(p => {
    const wrap = document.createElement('div');
    wrap.className = 'proj' + (p.open ? '' : ' closed');
    wrap.innerHTML = `
      <div class="proj-row${active && active.id === p.id && inProject ? ' is-on' : ''}">
        <span class="proj-caret">▶</span>
        <span class="proj-ico"></span>
        <span class="proj-name"></span>
        ${p.pinned ? '<span class="proj-pin">📌</span>' : ''}
        <button class="proj-more" title="更多">⋯</button>
      </div>
      <div class="proj-tree"></div>`;
    wrap.querySelector('.proj-name').textContent = p.name;
    wrap.querySelector('.proj-name').title = p.path;
    wrap.querySelector('.proj-caret').onclick = e => { e.stopPropagation(); p.open = !p.open; save(); renderNav(); };
    wrap.querySelector('.proj-row').onclick = () => selectProject(p.id);
    wrap.querySelector('.proj-more').onclick = e => { e.stopPropagation(); openProjMenu(p, e.currentTarget); };
    renderTreeInto(p, p.tree, wrap.querySelector('.proj-tree'), '');
    host.appendChild(wrap);
  });
  if (!S.projects.length) {
    host.innerHTML = `<div style="padding:8px 10px 12px;color:var(--ink3);font-size:12px">
      还没有项目文件夹。点右边 <b style="color:var(--ink2)">＋</b>：
      <b>空白项目（文件夹）</b> / <b>现有项目（文件夹）</b>。</div>`;
  }

  // ── 「临时」块：加载的是**对话**不是文件夹（§13.2）；分组可展开/折叠（§14.1） ──
  const ph = $('#planList'); ph.innerHTML = '';
  const defCard = document.createElement('div');
  defCard.className = 'plan-row' + (S.activePlan === null || S.activePlan === 'default' ? ' is-on' : '');
  defCard.innerHTML = `<span class="plan-dot" style="background:var(--ok)"></span>
    <span class="pname">默认</span><span class="pdef">快捷键进的就是它</span>
    <button class="pmore" title="选项">⋯</button>`;
  defCard.title = '默认对话卡片：按主快捷键进来就是这一张';
  defCard.onclick = () => selectTempCard('default');
  defCard.querySelector('.pmore').onclick = e => { e.stopPropagation(); openCardMenu(null, e.currentTarget); };
  ph.appendChild(defCard);

  const groups = S.plans.filter(x => x.isGroup);
  const loose = S.plans.filter(x => !x.isGroup && !x.group);
  const renderCard = pl => {
    const el = document.createElement('div');
    el.className = 'plan-row' + (S.activePlan === pl.id ? ' is-on' : '');
    el.innerHTML = `<span class="plan-dot"></span><span class="pname"></span>
      ${pl.pinned ? '<span class="ppin" title="已置顶">📌</span>' : ''}
      ${pl.unread ? '<span class="punread" title="未读"></span>' : ''}
      <button class="pmore" title="选项">⋯</button>
      <button class="ppin-btn" title="置顶">📌</button>`;
    el.querySelector('.pname').textContent = pl.title;
    el.querySelector('.pname').onclick = () => selectTempCard(pl.id);
    el.querySelector('.pmore').onclick = e => { e.stopPropagation(); openCardMenu(pl, e.currentTarget); };
    el.querySelector('.ppin-btn').onclick = e => {
      e.stopPropagation(); pl.pinned = !pl.pinned; save(true); renderNav();
      toast(pl.pinned ? '已置顶' : '已取消置顶');
    };
    el.onclick = () => selectTempCard(pl.id);
    return el;
  };
  // 分组：头行可点折叠，卡在 children 里
  groups.forEach(g => {
    const open = (S.groupOpen || {})[g.title] !== false;
    const kids = S.plans.filter(x => !x.isGroup && x.group === g.title);
    const head = document.createElement('div');
    head.className = 'plan-group' + (open ? '' : ' closed');
    head.innerHTML = `<span class="gc">▶</span><span class="gname"></span>
      <span class="gcount">${kids.length} 张</span>`;
    head.querySelector('.gname').textContent = g.title;
    head.onclick = () => {
      S.groupOpen = S.groupOpen || {};
      S.groupOpen[g.title] = !(S.groupOpen[g.title] !== false);
      save(); renderNav();
    };
    ph.appendChild(head);
    const box = document.createElement('div');
    box.className = 'plan-children' + (open ? '' : ' closed');
    kids.forEach(k => box.appendChild(renderCard(k)));
    ph.appendChild(box);
  });
  loose.forEach(c => ph.appendChild(renderCard(c)));

  if (!S.plans.length) {
    ph.insertAdjacentHTML('beforeend',
      `<div class="plan-empty">还没有别的对话卡 —— 点右边 ＋：<b>分组</b> / <b>新建</b>。</div>`);
  }

  $('#gitLogCount').textContent = `${S.gitLog.length} 次提交`;
  filterTree($('#navSearch') ? $('#navSearch').value : '');
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
      if (S.focusFiles.includes(rel)) row.classList.add('is-focus-file');
      row.innerHTML = `<span class="tw"></span>${treeIconSVG(rel, false)}
        <span class="n-name"></span>`;
      row.querySelector('.n-name').textContent = n.name;
      row.title = fullPath(rel, project) + '\n单击=打开 · ⌘单击=选为重点 · Shift单击=范围选';
      // ⭐ 选择语义（§12.2）：单击只打开；⌘ 切换重点；Shift 范围多选
      row.onclick = ev => onFileRowClick(project, rel, ev);
      row.dataset.rel = rel;
    } else {
      row.className += ' dir';
      row.innerHTML = `<span class="tw${n.open ? ' open' : ''}">▶</span>${treeIconSVG(rel, true)}
        <span class="n-name dir"></span>`;
      row.querySelector('.n-name').textContent = n.name;
      row.onclick = () => { n.open = !n.open; save(); renderNav(); };
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

let lastClickedFile = null;      // Shift 范围的锚点
function onFileRowClick(project, rel, ev) {
  const meta = ev.metaKey || ev.ctrlKey;
  if (ev.shiftKey && lastClickedFile) {
    const order = flatFiles(project);
    const a = order.indexOf(lastClickedFile), b = order.indexOf(rel);
    if (a >= 0 && b >= 0) {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      for (let i = lo; i <= hi; i++) if (!S.focusFiles.includes(order[i])) S.focusFiles.push(order[i]);
      save(); renderNav(); renderContext();
      toast(`范围选中 <b>${hi - lo + 1}</b> 个文件（重点参考）`);
      return;
    }
  }
  lastClickedFile = rel;
  openInTab(project.id, rel);                    // 单击 = 打开
  if (meta) {                                     // ⌘ 单击 = 加入 / 移出重点参考
    S.focusFiles = S.focusFiles.includes(rel)
      ? S.focusFiles.filter(x => x !== rel)
      : [...S.focusFiles, rel];
    save(); renderNav(); renderContext();
    toast(S.focusFiles.includes(rel) ? `已加为重点参考 · ${rel}` : `已移出重点参考 · ${rel}`);
  }
}

/// 侧栏搜索：只过滤树（在侧栏顶部那个框）
function filterTree(q) {
  const kw = (q || '').trim().toLowerCase();
  $$('#projectList .node-row').forEach(row => {
    const rel = row.dataset.rel || '';
    const name = (row.querySelector('.n-name')?.textContent || '').toLowerCase();
    const hit = !kw || name.includes(kw) || rel.toLowerCase().includes(kw);
    row.style.display = hit ? '' : 'none';
    if (hit && kw && rel) {
      // 命中的行，把它的祖先文件夹都展开
      let el = row.parentElement;
      while (el && el !== $('#projectList')) {
        if (el.classList.contains('proj')) { el.classList.remove('closed'); break; }
        el = el.parentElement;
      }
    }
  });
  if (kw) $$('#projectList .proj').forEach(w => w.classList.remove('closed'));
}

/* ── 项目菜单（更多…） ───────────────────────── */
let menuProject = null;
function openProjMenu(p, anchor) {
  menuProject = p;
  const m = $('#menuProj');
  const r = anchor.getBoundingClientRect();
  m.hidden = false;
  m.style.left = Math.min(r.left, innerWidth - 200) + 'px';
  m.style.top = (r.bottom + 6) + 'px';
  m.querySelector('[data-act="pin"]').textContent = p.pinned ? '取消置顶' : '置顶项目';
}
function closeMenus() {
  ['#menuAddProject','#menuAddTemp','#menuProj','#menuTabs','#menuSettings','#tabsPopover','#menuCard']
    .forEach(id => { const el = $(id); if (el) el.hidden = true; });
}

function projMenuAction(act) {
  const p = menuProject; closeMenus(); if (!p) return;
  switch (act) {
    case 'batch': toast(`批量管理：原型里先记一笔（真机版做多选改名/归档）`); break;
    case 'finder': case 'reveal': toast(`在访达中显示 <b>${escapeHtml(p.path)}</b>（原型不落地，接 SwiftUI 后走 NSWorkspace）`); break;
    case 'copyPath':
      navigator.clipboard?.writeText(p.path);
      toast(`已复制工作路径 <b>${escapeHtml(p.path)}</b>`); break;
    case 'rename': {
      askModal({ title: '重命名项目', value: p.name, okText: '重命名', onOk: v => {
        if (v && v.trim()) { p.name = v.trim(); save(true); renderNav(); renderCrumbs(); toast('已重命名'); }
      }});
      break; }
    case 'pin': p.pinned = !p.pinned; save(true); renderNav(); toast(p.pinned ? '已置顶' : '已取消置顶'); break;
    case 'unread': p.unread = !p.unread; save(true); renderNav();
      toast(p.unread ? '已标记为未读' : '已标记为已读'); break;
    case 'continue': toast(`在新对话中继续「${escapeHtml(p.name)}」—— 原型新开一张同内容的卡`); break;
    case 'export': toast(`导出「${escapeHtml(p.name)}」的对话记录（原型导 JSON）`); break;
    case 'delete':
      confirmModal({ title: '删除这个项目？', text: `${p.name}\n只删这一侧的记录，不动你磁盘上的文件夹。`,
        okText: '删除', onOk: () => {
          S.projects = S.projects.filter(x => x.id !== p.id);
          if (S.activeProject === p.id) {
            S.activeProject = S.projects[0] ? S.projects[0].id : null;
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
            S.activeProject = S.projects[0] ? S.projects[0].id : null;
            S.tabs = []; S.activeTab = 0; S.currentFile = null; S.focusFiles = [];
            S.tempMode = true;
            S.projectMode = false;                // 没有项目 → 回到对话模式（§12.0）
            if (S.projects[0]) selectProject(S.projects[0].id);
          }
          save(true); renderAll();
          toast('已归档 —— 现在是对话模式，右边照常能聊');
        }});
      break;
  }
}

/* ── 两个加号，各两项（§13.2） ─────────────── */
function addMenuAction(act) {
  closeMenus();
  if (act === 'newBlank') {
    askModal({ title: '空白项目', text: '也是一个文件夹 —— 给它起个名字，我在工作目录旁新建。',
      value: '新项目', okText: '创建', onOk: v => {
        const name = (v || '').trim() || '新项目';
        createProject(name, `/Users/mjm/Documents/SuperAgent/${name}`);
      }});
  } else if (act === 'useFolder') {
    askModal({ title: '现有项目（文件夹）', text: '填这个文件夹的绝对路径（原型不弹系统选择器）',
      value: '/Users/mjm/Documents/SuperAgent/Wanna', okText: '添加', onOk: v => {
        const path = (v || '').trim(); if (!path) return;
        createProject(path.split('/').filter(Boolean).pop() || '项目', path);
      }});
  } else if (act === 'newCard') {
    askModal({ title: '新建对话', text: '一张新的对话卡 —— 不带任何项目、不参考任何文件夹。',
      value: `对话 ${S.plans.filter(x => !x.isGroup).length + 1}`, okText: '新建', onOk: v => {
        const title = (v || '').trim() || `对话 ${S.plans.length + 1}`;
        const lastGroup = [...S.plans].reverse().find(x => x.isGroup);
        const id = 't' + now();
        S.plans.push({ id, title, ts: now(), group: lastGroup ? lastGroup.title : null });
        save(true); selectTempCard(id); toast(`已新建对话卡 <b>${escapeHtml(title)}</b>`);
      }});
  } else if (act === 'newGroup') {
    askModal({ title: '新建分组', text: '把几张对话卡归到一个组里（只是分组，不是项目）。',
      value: '新分组', okText: '创建', onOk: v => {
        const title = (v || '').trim() || '新分组';
        S.plans.push({ id: 'g' + now(), title, ts: now(), isGroup: true });
        save(true); renderNav(); toast(`已建分组 <b>${escapeHtml(title)}</b> —— 之后「新建」的对话卡会归到它下面`);
      }});
  }
}

/* ── 对话卡的选项菜单（完全参考小米：重命名/置顶/未读/…/删除，§14.6） ── */
let menuCardObj = null;          // null = 默认卡
function openCardMenu(pl, anchor) {
  menuCardObj = pl;
  closeMenus();
  const m = $('#menuCard');
  const pinLabel = pl ? (pl.pinned ? '取消置顶' : '置顶对话') : '置顶对话';
  m.innerHTML = `
    <button data-act="rename">重命名</button>
    <button data-act="pin">${pinLabel}</button>
    <button data-act="unread">标记为未读</button>
    <button data-act="continue">在新对话中继续</button>
    <div class="menu-sep"></div>
    <button data-act="toGroup">放入分组</button>
    <button data-act="toProject">移动至项目</button>
    <button data-act="archive">归档对话</button>
    <button data-act="batch">批量管理</button>
    <div class="menu-sep"></div>
    <button data-act="finder">在 Finder 中显示</button>
    <button data-act="workdir">复制工作目录</button>
    <button data-act="export">导出对话记录</button>
    <div class="menu-sep"></div>
    <button data-act="delete" class="danger">删除对话</button>`;
  $$('button', m).forEach(b => b.onclick = () => cardMenuAction(b.dataset.act));
  const r = anchor.getBoundingClientRect();
  m.hidden = false;
  m.style.left = Math.min(r.left, innerWidth - 230) + 'px';
  m.style.top = (r.bottom + 4) + 'px';
}
function cardMenuAction(act) {
  const pl = menuCardObj; closeMenus();
  const name = pl ? pl.title : '默认';
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
      const gs = (S.plans || []).filter(x => x.isGroup).map(x => x.title);
      if (!gs.length) { toast('还没有分组 —— 左栏 ＋ → 先建一个分组'); return; }
      askModal({ title: '放入分组', text: '可选：' + gs.join(' / ') + '\n（填组名；留空 = 移出分组）',
        value: pl.group || '', okText: '放进去', onOk: v => {
          const name = (v || '').trim();
          pl.group = name || null;
          save(true); renderNav();
          toast(name ? `已把「${escapeHtml(pl.title)}」放入分组 <b>${escapeHtml(name)}</b>`
                     : `已把「${escapeHtml(pl.title)}」移出分组`);
        }});
      break; }
    case 'toProject': {
      const names = projList(); if (!names) return;
      askModal({ title: '移动至项目', text: '可选：' + names, value: '', okText: '移动', onOk: v => {
        if (!pl) { toast('默认卡不能移动'); return; }
        S.plans = S.plans.filter(x => x.id !== pl.id);
        save(true); renderNav();
        toast(`已把「${escapeHtml(pl.title)}」移至项目 ${escapeHtml((v||'').trim())}`);
      }});
      break; }
    case 'archive':
      confirmModal({ title: '归档这段对话？', text: name + '\n（归档后不出现在这个列表里）', okText: '归档', onOk: () => {
        if (!pl) { toast('默认卡不归档'); return; }
        S.plans = S.plans.filter(x => x.id !== pl.id);
        if (S.activePlan === pl.id) S.activePlan = 'default';
        save(true); renderNav(); toast('已归档对话');
      }});
      break;
    case 'batch': toast('批量管理：多选改名 / 归档（原型先记一笔）'); break;
    case 'finder':
      toast(pl && proj() ? `在 Finder 中显示 <code>${escapeHtml(proj().path)}</code>`
                         : '这段对话没有工作目录（临时对话不带项目文件夹）');
      break;
    case 'workdir':
      if (proj()) { navigator.clipboard?.writeText(proj().path); toast(`已复制工作目录 <b>${escapeHtml(proj().path)}</b>`); }
      else toast('这段对话没有工作目录（不带任何项目文件夹）');
      break;
    case 'export':
      toast('导出对话记录：原型导出为 JSON（落 SwiftUI 走 NSPanel 存文件）');
      break;
    case 'delete':
      confirmModal({ title: '删除这段对话？', text: name + '\n不可恢复。', okText: '删除', onOk: () => {
        if (!pl) { toast('默认卡不能删'); return; }
        S.plans = S.plans.filter(x => x.id !== pl.id);
        if (S.activePlan === pl.id) S.activePlan = 'default';
        save(true); renderNav(); toast('已删除对话');
      }});
      break;
  }
}
function projList() {
  if (!S.projects.length) { toast('还没有项目可移动'); return null; }
  return S.projects.map(x => x.name).join(' / ');
}

function selectTempCard(id) {
  S.activePlan = id;
  S.tempMode = true;
  S.projectMode = false;                     // 临时卡不在项目模式里
  // ⚠️ 不要把 activeProject 置空：标签还指着它的文件
  save(); renderNav(); renderContent(); renderComposerControls();
  const pl = id === 'default' ? null : S.plans.find(x => x.id === id);
  toast(id === 'default' ? '默认对话卡 —— 就是按快捷键进的那张'
    : `对话卡：<b>${escapeHtml(pl ? pl.title : '')}</b> —— 不带项目、不参考文件夹`);
}
function createProject(name, path) {
  const id = 'p' + now();
  S.projects.push({
    id, name, path, pinned: false, open: true,
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
function renderTabs() {
  const host = $('#tabs'); host.innerHTML = '';
  S.tabs.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'tab' + (i === S.activeTab ? ' is-on' : '');
    const ic = iconFor(t.f);
    el.innerHTML = `<span class="fico ${ic.cls}"></span><span class="tname"></span><span class="tx" title="关闭标签">×</span>`;
    el.querySelector('.tname').textContent = t.f;
    if (t.pinned) el.querySelector('.tname').classList.add('pinned');
    el.title = t.f + (t.pinned ? '（已固定）' : '') + '\n右键：固定 / 复制 / 关闭…';
    el.oncontextmenu = e => { e.preventDefault(); openTabMenu(i, e); };
    el.onclick = e => {
      if (e.target.classList.contains('tx')) { closeTab(i); return; }
      S.activeTab = i; S.currentFile = t.f;
      const kind = extViewKind(t.f);
      S.tab = kind === 'file' ? 'file' : kind;
      save(); renderTabs(); renderContent(); renderContext(); renderNav();
    };
    host.appendChild(el);
  });
}

/* ============================================================
   内容区
   ============================================================ */
function renderAll() { renderNav(); renderTabs(); renderContext(); renderContent(); renderModes(); renderChatModes(); renderChat(); }

function focusChipEl(rel) {
  const el = document.createElement('span');
  el.className = 'fchip';
  el.title = fullPath(rel) + '（点 × 取消参考）';
  el.innerHTML = `${treeIconSVG(rel, false)}<span class="fname"></span>
    <button class="x" title="取消参考">×</button>`;
  el.querySelector('.fname').textContent = rel;
  el.querySelector('.x').onclick = () => {
    S.focusFiles = S.focusFiles.filter(x => x !== rel);
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
  more.onclick = () => {
    list.hidden = !list.hidden;
    if (list.hidden) return;
    if (!n) {
      list.innerHTML = `<div style="padding:10px;color:var(--ink3);font-size:12px">
        还没有重点参考。<br><b>⌘+单击</b> 文件加入，<b>Shift+单击</b> 范围多选。</div>`;
      return;
    }
    focuses.forEach(rel => {
      const it = document.createElement('div');
      it.className = 'focus-item';
      it.innerHTML = `${treeIconSVG(rel, false)}<span class="fname"></span>
        <button class="x" title="取消参考">×</button>`;
      it.querySelector('.fname').textContent = rel;
      it.querySelector('.fname').title = fullPath(rel);
      it.querySelector('.x').onclick = e => {
        e.stopPropagation();
        S.focusFiles = S.focusFiles.filter(x => x !== rel);
        save(); renderNav(); renderContext();
      };
      list.appendChild(it);
    });
  };
  // 行里最多露 3 枚（横向放不下就靠 overflow 截断），其余去 + 里
  focuses.slice(0, 3).forEach(rel => chips.appendChild(focusChipEl(rel)));

  const inProject = S.projectMode && proj();
  const card = S.activePlan && S.activePlan !== 'default'
    ? (S.plans.find(x => x.id === S.activePlan) || null) : null;
  $('#chatCtxProject').textContent = inProject ? proj().path
    : (card ? `对话卡 · ${card.title}` : '对话模式（无项目文件）');
  $('#chatCtxProject').title = $('#chatCtxProject').textContent;
  renderCrumbs();
}

function renderCrumbs() {
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

/// §14.4 / §14.5：对话模式天然没有编辑区；项目模式可以把它藏起来（按钮在顶栏「提交」旁）
function applyWorkspaceVisibility() {
  const main = $('#main'), btn = $('#btnToggleEditor');
  if (!main) return;
  const hide = !S.projectMode || S.hideEditor;
  main.classList.toggle('no-workspace', hide);
  if (!btn) return;
  btn.disabled = !S.projectMode;
  btn.style.opacity = S.projectMode ? '' : '.4';
  btn.textContent = S.projectMode && S.hideEditor ? '＋ 编辑区' : '◫ 编辑区';
  btn.title = S.projectMode
    ? (S.hideEditor ? '把中间的编辑区打开' : '收起中间编辑区 —— 只留 文件夹 + 对话')
    : '对话模式本来就没有编辑区（左栏 + 对话，两栏）';
}

function renderContent() {
  applyWorkspaceVisibility();
  const rel = relOfActiveTab(), p = proj();
  const hasFile = !!(p && rel);
  ['#viewMd','#viewFile','#viewMind','#viewHistory'].forEach(s => $(s).classList.remove('is-on'));

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
  $('#btnHistory').style.display = '';

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
  const vm = { code: S.mdVariant === 'code', edit: S.mdVariant === 'edit', preview: S.mdVariant === 'preview' };
  $$('#viewModes .vm').forEach(b => b.classList.toggle('is-on',
    S.mdVariant === 'split' ? b.dataset.vm === 'preview' : vm[b.dataset.vm]));
  $('#btnFoldCode').hidden = S.codeFolded;
  $('#btnShowCode').hidden = !S.codeFolded;
}

/// 工具栏上那颗「历史 N」的数字（§12.9：历史恢复按钮要看得见）
function renderHistoryBadge() {
  const n = (S.history[histFile()] || []).length;
  $('#histCount').textContent = n;
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
  if (document.body.contains($('#histCount'))) renderHistoryBadge();   // 工具栏那颗「历史 N」跟着变
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
    const li = document.createElement('li');
    li.className = 'hist-item' + (i === 0 ? ' is-new' : '');
    li.innerHTML = `<span class="hist-when">${fmtTime(h.ts)}</span>
      <span class="hist-src src-${h.source}">${h.source}</span>
      <span class="hist-sum">${escapeHtml(h.summary || '')}</span>
      <span class="hist-acts"><button class="btn btn-mini" data-a="view">查看</button>
      <button class="btn btn-mini" data-a="restore">恢复</button></span>`;
    li.querySelector('[data-a="view"]').onclick = () => viewHistory(rel, h);
    li.querySelector('[data-a="restore"]').onclick = () => restore(rel, i);
    host.appendChild(li);
  });
}
function viewHistory(rel, h) {
  ensureTab(rel);
  if (extViewKind(rel) === 'mind') { $('#mindSource').value = h.content; S.tab = 'mind'; }
  else if (extViewKind(rel) === 'md') { $('#mdSource').value = h.content; $('#mdPreview').innerHTML = mdToHtml(h.content); S.tab = 'md'; }
  save(); renderContent(); renderContext();
  toast(`查看 <b>${fmtTime(h.ts)}</b> 那一版（未写回）`);
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
function renderChat() {
  const host = $('#msgs'); host.innerHTML = '';
  if (!S.chat.length) {
    host.innerHTML = `<div class="msg msg-sys"><div class="bubble">
      ${proj()
        ? '围绕项目提问，或直接让它改脑图 —— 每次改动都会自动备份历史。'
        : '这是<b>临时对话</b>：没有项目文件，直接和 AI 聊。想要围绕项目，点左边 ＋ 添加文件夹。'}
      </div></div>`;
  }
  S.chat.forEach(m => {
    const el = document.createElement('div');
    el.className = `msg msg-${m.role}` + (m.temp ? ' msg-temp' : '');
    const who = m.role === 'user' ? '你' : m.role === 'ai' ? (m.temp ? 'AI · 临时对话' : 'AI') : '系统';
    el.innerHTML = `<div class="msg-who">${who}</div><div class="bubble">${m.html}</div>`
      + (m.meta ? `<div class="msg-meta">${m.meta}</div>` : '');
    host.appendChild(el);
  });
  host.scrollTop = host.scrollHeight;
}
function sendChat() {
  const ta = $('#chatInput'), text = ta.value.trim();
  if (!text) return;
  ta.value = ''; ta.focus();                    // 发送后清空，光标留在框里
  addMsg('user', escapeHtml(text));
  setTimeout(() => reply(text), 360);
}
function reply(q) {
  const p = proj(), focuses = S.focusFiles || [], focus = focuses[0];
  const ctx = p ? `<code>${p.path}</code>` : '临时对话（不带项目）'
    + (focuses.length ? ` · 重点参考 ${focuses.map(f => `<code>${fullPath(f)}</code>`).join(' ')}` : '');
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
      + (focuses.length ? `重点参考（${focuses.length} 个）：${focuses.map(f => `<code>${fullPath(f)}</code>`).join(' ｜ ')}\n`
                        : '（还没选重点文件，点左边任意文件即可）')
      + `\n每一轮对话都会自动带上这些路径。`, demo); return;
  }
  if (/(总结|讲讲|说了什么|概览|README)/i.test(q) && focus) {
    const body = fileContent(focus).split('\n').filter(l => l.trim() && !/^```/.test(l)).slice(0, 5).join('\n');
    addMsg('ai', `重点参考是 <code>${escapeHtml(focus)}</code>，开头这些：\n\n${escapeHtml(body)}\n\n`
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
  setLayout(S.layout === 'right' ? 'center' : S.layout === 'center' ? 'left' : 'right');
}
/// 进项目模式：把导航栏那排 图文/语音/视频 **搬进对话框**（§12.0.5）
/// ⭐ 图文/语音/视频 **永远画在对话窗里**（§14.3）：对话窗在哪，它们就在哪。
/// 项目模式和对话模式都一样 —— 顶栏不再放它们（#modesSlotTop 被 CSS 藏掉）。
function placeModeChips() {
  const chips = $('#modeChips'), target = $('#modesSlotChat');
  if (!chips || !target) return;
  if (chips.parentElement !== target) target.appendChild(chips);
}
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
/// 标签条最左的 ☰：**纵向列出全部标签**（横向看不全时用，§13.4）
function openTabsPopover() {
  const m = $('#tabsPopover');
  if (!m.hidden) { m.hidden = true; return; }
  m.innerHTML = '';
  S.tabs.forEach((t, i) => {
    const it = document.createElement('div');
    it.className = 'mt-item' + (i === S.activeTab ? ' is-on' : '');
    it.innerHTML = `${treeIconSVG(t.f, false)}<span class="nm"></span>
      <span class="pin">${t.pinned ? '📌' : ''}</span>`;
    it.querySelector('.nm').textContent = `${t.p}${t.f}`;
    it.onclick = () => { m.hidden = true; S.activeTab = i; S.currentFile = t.f;
      S.tab = extViewKind(t.f) === 'file' ? 'file' : extViewKind(t.f);
      save(); renderTabs(); renderContent(); renderContext(); renderNav(); };
    m.appendChild(it);
  });
  if (!S.tabs.length) m.innerHTML = '<div class="mt-item">还没有标签</div>';
  const r = $('#btnTabsCollapse').getBoundingClientRect();
  m.hidden = false;
  m.style.left = r.left + 'px'; m.style.top = (r.bottom + 6) + 'px';
}
function openTabMenu(index, ev) {
  menuTabIndex = index;
  closeMenus();
  const m = $('#menuTabs'); m.hidden = false;
  m.style.left = Math.min(ev.clientX, innerWidth - 240) + 'px';
  m.style.top = Math.min(ev.clientY, innerHeight - 280) + 'px';
  const t = S.tabs[index];
  m.querySelector('[data-act="pin"]').textContent = t && t.pinned ? '取消固定' : '固定标签页';
}
function tabMenuAction(act) {
  const i = menuTabIndex; closeMenus();
  if (i === null || !S.tabs[i]) return;
  const t = S.tabs[i];
  switch (act) {
    case 'pin': t.pinned = !t.pinned; break;
    case 'dup': S.tabs.splice(i + 1, 0, { ...t }); break;
    case 'close': S.tabs.splice(i, 1); break;
    case 'closeOthers': S.tabs = [t]; break;
    case 'closeLeft': S.tabs = S.tabs.slice(i); break;
    case 'closeRight': S.tabs = S.tabs.slice(0, i + 1); break;
    case 'moveGroup': toast('移动到分组：原型里只记这次操作（落 SwiftUI 接标签分组）'); break;
  }
  if (S.activeTab >= S.tabs.length) S.activeTab = S.tabs.length - 1;
  if (S.activeTab < 0) S.activeTab = 0;
  S.currentFile = (S.tabs[S.activeTab] || {}).f || null;
  save(); renderTabs(); renderContent(); renderContext();
}
/// 设置：默认对话位置（§13.5）
function settingsAction(act, btn) {
  closeMenus();
  if (act === 'defLeft') { S.defaultLayout = 'left'; setLayout('left'); }
  else if (act === 'defCenter') { S.defaultLayout = 'center'; setLayout('center'); }
  else if (act === 'defRight') { S.defaultLayout = 'right'; setLayout('right'); }
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
  ensureTab(histFile());
  S.tab = S.tab === 'history' ? (extViewKind(relOfActiveTab()) === 'mind' ? 'mind' : extViewKind(relOfActiveTab() === 'file' ? 'x' : 'md')) : 'history';
  save(); renderNav(); renderTabs(); renderContent(); renderContext();
}

/* ============================================================
   绑定
   ============================================================ */
function bind() {
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
  $('#ccNew').onclick = () => toast('新建 —— 原型里等价于左栏「临时 ＋ → 新建」');
  // 页头右组
  ['#hcCall','#hcRole','#hcOptions','#hcVoice'].forEach(id => {
    const el = $(id); if (!el) return;
    el.onclick = () => {
      if (id === '#hcVoice') { toast('音色面板：照搬当前软件（按音色选）'); return; }
      el.classList.toggle('is-on');
      toast(({ '#hcCall':'通话', '#hcRole':'角色', '#hcOptions':'选项' })[id]
        + (el.classList.contains('is-on') ? ' · 开' : ' · 关'));
    };
  });

  // 段头折叠（§12.4：项目 / 临时规划 各一块，各有一个 ＋）
  $('#btnProjSect').onclick = () => { S.navOpen = !S.navOpen; save(); renderNav(); };
  $('#btnPlanSect').onclick = () => { S.planOpen = S.planOpen === false; save(); renderNav(); };

  const openMenuAt = (id, btn) => {
    const m = $(id), r = btn.getBoundingClientRect();
    m.hidden = !m.hidden;
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - 230)) + 'px';
    m.style.top = (r.bottom + 6) + 'px';
  };
  $('#btnAddProject').onclick = e => { e.stopPropagation(); openMenuAt('#menuAddProject', e.currentTarget); };
  $('#btnAddPlan').onclick = e => { e.stopPropagation(); openMenuAt('#menuAddTemp', e.currentTarget); };
  $('#btnEmptyAdd').onclick = () => addMenuAction('newBlank');
  $('#btnEmptyPlan').onclick = () => addMenuAction('newCard');
  $('#btnEmptyFolder').onclick = () => addMenuAction('useFolder');
  $$('#menuAddProject button, #menuAddTemp button').forEach(b => b.onclick = () => addMenuAction(b.dataset.act));
  $$('#menuProj button').forEach(b => b.onclick = () => projMenuAction(b.dataset.act));
  // 标签页右键菜单
  $$('#menuTabs button').forEach(b => b.onclick = () => tabMenuAction(b.dataset.act));
  // 设置（默认对话位置）
  $$('#menuSettings button').forEach(b => b.onclick = s => settingsAction(b.dataset.act, b));
  document.addEventListener('click', e => {
    if (!e.target.closest('.menu') && !e.target.closest('#btnAddProject') && !e.target.closest('#btnAddPlan')
        && !e.target.closest('.proj-more') && !e.target.closest('#btnSettings')
        && !e.target.closest('#btnTabsCollapse')) closeMenus();
    if (!e.target.closest('.focus-row')) $('#focusList').hidden = true;
  });

  // 本软件风格的模态（§12.3）
  $('#modalCancel').onclick = closeModal;
  $('#modalOk').onclick = () => { const v = $('#modalInput').value; const fn = modalOnOk; closeModal(); fn && fn(v); };
  $('#modalBack').onclick = e => { if (e.target.id === 'modalBack') closeModal(); };
  $('#modalInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#modalOk').click(); }
    if (e.key === 'Escape') e.stopPropagation();
  });

  // 侧栏搜索（在侧栏顶部，过滤树）
  $('#navSearch').oninput = e => filterTree(e.target.value);

  $('#btnNewTab').onclick = () => { $('#navSearch').focus(); toast('用左栏顶部的搜索找文件，点它开新标签'); };
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
  $('#btnLayout2').onclick = cycleLayout;
  // ⭐ 「项目」= 进入 / 退出**项目模式**（§12.0）：不是新页面，是同一个界面的两种状态
  $('#btnProjectMode').onclick = () => {
    if (S.projectMode) {
      S.projectMode = false;
      save(); renderNav(); renderContent(); renderContext();
      toast('已退出项目模式 —— 回到对话模式（连续对话 / 历史对话，功能不变）');
    } else if (proj()) {
      S.projectMode = true; S.tempMode = false;
      save(); renderNav(); renderContent(); renderContext();
      toast('进入项目模式 —— 上下文换成这个项目文件夹与选中的文件');
    } else {
      addMenuAction('newBlank');
    }
  };
  $('#btnToggleEditor').onclick = () => {
    if (!S.projectMode) { toast('对话模式本来就没有编辑区 —— 就是 左栏 + 对话 两栏'); return; }
    S.hideEditor = !S.hideEditor;
    save(); renderContent();
    toast(S.hideEditor ? '编辑区已收起 —— 只剩 文件夹 + 对话（像小米客户端）'
                       : '编辑区已打开');
  };
  $('#btnClose').onclick = () => toast('（原型）关闭 = 回到原来的会话页');
  $('#btnCommitGit').onclick = commitGit;

  // md 工具栏
  $$('#mdBar .md-tools button').forEach(b => b.onclick = () => mdInsert(b.dataset.md));
  $$('#viewModes .vm').forEach(b => b.onclick = () => {
    const vm = b.dataset.vm;
    previewEditSession = false; clearTimeout(previewIdleTimer);
    if (vm === 'code') S.mdVariant = 'code';
    else if (vm === 'edit') S.mdVariant = 'edit';
    else S.mdVariant = S.mdVariant === 'split' ? 'preview' : 'preview';
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
  $('#btnShowCode').onclick = toggleCodeFold;
  $('#btnFit').onclick = () => {
    const wrap = $('#mindCanvas'), svg = wrap.querySelector('svg'); if (!svg) return;
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const k = Math.min(1, (wrap.clientWidth - 16) / vb[2], (wrap.clientHeight - 16) / vb[3]);
    S.mindZoom = Math.max(0.3, k); save(); renderMind();
    toast(`已适应窗口 · ${Math.round(S.mindZoom * 100)}%`);
  };

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
  $('#btnHistory').onclick = toggleHistoryView;
  $('#btnHistoryHead').onclick = toggleHistoryView;   // 文件头常驻那颗（§13.6）
  $('#btnTabsCollapse').onclick = e => { e.stopPropagation(); openTabsPopover(); };
  $('#btnSettings').onclick = e => {
    e.stopPropagation(); closeMenus();
    const m = $('#menuSettings'), r = e.currentTarget.getBoundingClientRect();
    m.hidden = !m.hidden;
    m.style.left = Math.max(8, Math.min(r.left - 120, innerWidth - 220)) + 'px';
    m.style.top = (r.bottom + 6) + 'px';
    m.querySelector('[data-act="defLeft"]').classList.toggle('is-on', S.defaultLayout === 'left');
    m.querySelector('[data-act="defCenter"]').classList.toggle('is-on', S.defaultLayout === 'center');
    m.querySelector('[data-act="defRight"]').classList.toggle('is-on', S.defaultLayout === 'right');
  };

  $('#btnSend').onclick = sendChat;
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
}

function commitGit() {
  const p = proj(); if (!p) { toast('还没有项目'); return; }
  S.gitLog.unshift({ ts: now(), path: p.path, files: Object.keys(p.files).length });
  save(true); renderNav();
  const rel = histFile();
  if (rel) pushHistory(rel, '提交', fileContent(rel), `提交快照（${S.gitLog.length}）`);
  addMsg('sys', `已提交一次快照：<code>${p.path}</code> · ${Object.keys(p.files).length} 个文件 · 第 ${S.gitLog.length} 次`);
  toast(`提交成功 · 第 <b>${S.gitLog.length}</b> 次（原型记快照，落 SwiftUI 后接真 git）`);
}

function renderModes() {
  $$('#modeChips .chip').forEach(c => c.classList.toggle('is-on', c.dataset.mode === S.mode));
  $('#composerHint').textContent = S.mode === 'voice' ? '语音模式 · 回车发送文字'
    : S.mode === 'video' ? '视频模式 · 回车发送' : '回车发送 · Shift+回车换行';
}

/// ⭐ 输入框上方那一行（§13.1 完全照搬）：**左组恒定、右组随模式变**。
/// 这就是他说的"图文右上角跟语音不一样、语音跟视频不一样" —— 三种模式各一套右组。
function renderComposerControls() {
  // 左组：连续 ｜ 临时 ｜ ＋新建（连续=绿，临时=琥珀；与当前软件同一套极简竖线）
  $$('#ccLeft .cc[data-conv]').forEach(b => {
    const on = (b.dataset.conv === 'temporary') === (S.chatMode === 'temporary');
    b.classList.toggle('is-on', on);
    b.classList.toggle('temp', on && b.dataset.conv === 'temporary');
  });

  // 右组：按模式给（屏幕只在临时对话下出现 —— 与 NotchHomeView 同一条规则）
  const conv = S.chatMode;
  const right = $('#ccRight');
  const item = (label, on = false) =>
    `<button class="cc${on ? ' is-on' : ''}" data-right="${label}">${label}</button><i class="vr"></i>`;
  let html = '';
  if (S.mode === 'imageText') {
    if (conv === 'temporary') html += item('屏幕', true);
    html += item('声音', true) + item('语速');
  } else if (S.mode === 'voice') {
    html += item('声音', true) + item('语速') + item('角色');
  } else {                          // video
    html += item('摄像', true) + item('屏幕', true) + item('语速') + item('角色');
  }
  right.innerHTML = html.replace(/<i class="vr"><\/i>$/, '');
  $$('#ccRight .cc').forEach(b => b.onclick = () => {
    b.classList.toggle('is-on');
    toast(`${b.textContent}：${b.classList.contains('is-on') ? '开' : '关'}（原型只记状态）`);
  });

  // 页头：音色只在图文页画（其余页没有这颗）
  $('#hcVoice').hidden = S.mode !== 'imageText';
  $('#composerModeLabel').textContent =
    `${S.mode === 'imageText' ? '图文' : S.mode === 'voice' ? '语音' : '视频'} · ${conv === 'temporary' ? '临时对话' : '连续对话'}`;
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
    bind(); renderAll();
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
      $('#loadStat').textContent = `骨架 ${tSkeleton}ms · 内容 ${tDone}ms`;
    });
  }));
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
