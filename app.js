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
  tabs: [{ p:'p1', f:'README.md' }],
  activeTab: 0,
  currentFile: 'README.md',
  focusFiles: ['README.md'],
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
    if (r.projects.some(p => p.files && p.files['资料/样例.pdf'] === undefined)) { /* 老数据补样例 */ }
    return r;
  } catch { return null; }
}
let saveTimer = null;
function save(immediate = false) {
  clearTimeout(saveTimer);
  const doIt = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch {} };
  immediate ? doIt() : (saveTimer = setTimeout(doIt, 250));
}

const proj = () => S.projects.find(p => p.id === S.activeProject) || null;
const relOfActiveTab = () => (S.tabs[S.activeTab] || {}).f || null;
const fullPath = (rel, p = proj()) => p ? `${p.path}/${rel}` : rel || '';
const fileContent = rel => (proj() && proj().files[rel]) || '';
const MIND_FILE = '脑图.mmd';
const histFile = () => S.currentFile || relOfActiveTab();

let toastTimer;
function toast(html) {
  const t = $('#toast'); t.innerHTML = html; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2800);
}

/* ============================================================
   左栏：MiMo 式项目栏
   ============================================================ */
function renderNav() {
  $('#ctxProjectPath').textContent = proj() ? proj().path : '未添加项目（可直接临时对话）';
  $('#ctxProjectPath').title = $('#ctxProjectPath').textContent;
  $('#defaultCard').classList.toggle('is-on', S.tempMode || !proj());
  $('#btnProjSect').classList.toggle('closed', !S.navOpen);
  $('#btnRecentSect').classList.toggle('closed', !S.recentOpen);
  $('#projectList').style.display = S.navOpen ? '' : 'none';
  $('#recentList').style.display = S.recentOpen ? '' : 'none';

  const host = $('#projectList'); host.innerHTML = '';
  const active = proj();
  const ordered = [...S.projects].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  ordered.forEach(p => {
    const wrap = document.createElement('div');
    wrap.className = 'proj' + (p.open ? '' : ' closed') + (active && active.id === p.id ? ' is-on' : '');
    wrap.innerHTML = `
      <div class="proj-row${active && active.id === p.id ? ' is-on' : ''}">
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
    const more = wrap.querySelector('.proj-more');
    more.onclick = e => { e.stopPropagation(); openProjMenu(p, more); };
    // 文件树
    const treeHost = wrap.querySelector('.proj-tree');
    renderTreeInto(p, p.tree, treeHost, '');
    host.appendChild(wrap);
  });
  if (!S.projects.length) {
    host.innerHTML = `<div style="padding:10px 10px;color:var(--ink3);font-size:12px">
      还没有项目文件夹。<br>点右上角 <b style="color:var(--ink2)">＋</b> 添加一个，
      或者先用上面的「临时对话」。</div>`;
  }

  // 最近
  const rh = $('#recentList'); rh.innerHTML = '';
  if (!S.recent.length) {
    rh.innerHTML = `<div style="padding:6px 10px;color:var(--ink3);font-size:12px">还没有对话</div>`;
  } else {
    S.recent.slice(0, 8).forEach((r, i) => {
      const el = document.createElement('div');
      el.className = 'recent-item' + (i === 0 && !S.tempMode ? ' is-on' : '');
      el.innerHTML = `<span class="recent-dot"></span><span class="rname"></span>`;
      el.querySelector('.rname').textContent = r.title;
      el.title = r.title;
      el.onclick = () => { S.tempMode = !!r.temp; save(); renderNav(); renderChatModes(); };
      rh.appendChild(el);
    });
  }
  $('#gitLogCount').textContent = `${S.gitLog.length} 次提交`;
}

function selectProject(id) {
  const p = S.projects.find(x => x.id === id); if (!p) return;
  S.activeProject = id;
  S.tempMode = false;
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

function renderTreeInto(project, nodes, container, prefix) {
  nodes.forEach(n => {
    const rel = prefix ? `${prefix}/${n.name}` : n.name;
    const row = document.createElement('div');
    row.className = 'node-row';
    if (n.type === 'file') {
      if (rel === relOfActiveTab()) row.classList.add('is-sel');
      if (S.focusFiles.includes(rel)) row.classList.add('is-focus-file');
      const ic = iconFor(rel);
      row.innerHTML = `<span class="tw"></span><span class="fico ${ic.cls}"></span>
        <span class="n-name"></span>` + (S.focusFiles.includes(rel) ? `<span class="n-badge">重点</span>` : '');
      row.querySelector('.n-name').textContent = n.name;
      row.title = fullPath(rel, project);
      row.onclick = () => openInTab(project.id, rel);
    } else {
      row.innerHTML = `<span class="tw${n.open ? ' open' : ''}">▶</span>
        <span class="fico dir">DIR</span><span class="n-name dir"></span>`;
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
function closeMenus() { $('#menuAdd').hidden = true; $('#menuProj').hidden = true; }

function projMenuAction(act) {
  const p = menuProject; closeMenus(); if (!p) return;
  switch (act) {
    case 'batch': toast(`批量管理：原型里先记一笔（真机版做多选改名/归档）`); break;
    case 'finder': case 'reveal': toast(`在访达中显示 <b>${escapeHtml(p.path)}</b>（原型不落地，接 SwiftUI 后走 NSWorkspace）`); break;
    case 'copyPath':
      navigator.clipboard?.writeText(p.path);
      toast(`已复制工作路径 <b>${escapeHtml(p.path)}</b>`); break;
    case 'rename': {
      const name = prompt('重命名项目', p.name);
      if (name) { p.name = name.trim() || p.name; save(true); renderNav(); renderCrumbs(); toast('已重命名'); }
      break; }
    case 'pin': p.pinned = !p.pinned; save(true); renderNav(); toast(p.pinned ? '已置顶' : '已取消置顶'); break;
    case 'archive':
      if (!confirm(`归档「${p.name}」？（只归档这一侧，不动你磁盘上的文件）`)) return;
      S.projects = S.projects.filter(x => x.id !== p.id);
      if (S.activeProject === p.id) {
        S.activeProject = S.projects[0] ? S.projects[0].id : null;
        S.tabs = []; S.activeTab = 0; S.currentFile = null; S.focusFiles = [];
        S.tempMode = true;                       // 归档完 → 回到「不加项目 = 临时对话」
        if (S.projects[0]) selectProject(S.projects[0].id);
      }
      save(true); renderAll(); toast('已归档 —— 左边只剩「临时对话」，右边照常能聊');
      break;
  }
}

/* ── 添加项目 ───────────────────────────────── */
function addMenuAction(act) {
  closeMenus();
  if (act === 'newBlank') {
    const name = prompt('新建空白项目的名字', '新项目');
    if (!name) return;
    createProject(name.trim() || '新项目', `/Users/mjm/Documents/SuperAgent/${name.trim() || '新项目'}`);
  } else {
    const path = prompt('使用现有文件夹 —— 填它的绝对路径', '/Users/mjm/Documents/SuperAgent/Wanna');
    if (!path) return;
    createProject(path.split('/').filter(Boolean).pop() || '项目', path);
  }
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
  S.tabs = [{ p:id, f:'README.md' }]; S.activeTab = 0;
  S.currentFile = 'README.md'; S.focusFiles = ['README.md']; S.tab = 'md';
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
    const p = proj(); if (p) p.open = true;
  }
  const p = S.projects.find(x => x.id === projectId); if (!p) return;
  if (!S.focusFiles.includes(rel)) S.focusFiles.push(rel);      // 点 = 加进重点参考（可多选）
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
    el.title = t.f;
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

function renderContext() {
  const focuses = S.focusFiles || [], has = focuses.length > 0;
  const chips = $('#focusChips'); chips.innerHTML = '';
  if (!has) chips.innerHTML = `<span class="fchip-empty">${proj() ? '点左边文件加入重点参考' : '未加项目 —— 临时对话中'}</span>`;
  focuses.forEach(rel => {
    const el = document.createElement('span');
    el.className = 'fchip'; el.title = fullPath(rel) + '（点 × 取消）';
    el.innerHTML = `<code></code><button class="x" title="取消这一项重点参考">×</button>`;
    el.querySelector('code').textContent = rel;
    el.querySelector('.x').onclick = () => {
      S.focusFiles = S.focusFiles.filter(x => x !== rel);
      save(); renderNav(); renderContext();
      toast(`已取消重点参考 · ${rel}`);
    };
    chips.appendChild(el);
  });
  $('#chatCtxProject').textContent = proj() ? proj().path : '临时对话（无项目）';
  $('#chatCtxProject').title = $('#chatCtxProject').textContent;
  $('#chatCtxFocus').textContent = has ? focuses.map(f => fullPath(f)).join(' ｜ ') : '未选重点文件';
  $('#chatCtxFocus').title = has ? focuses.map(f => fullPath(f)).join('\n') : '';
  $('#chatCtxFocusWrap').classList.toggle('has-focus', has);
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

function renderContent() {
  const rel = relOfActiveTab(), p = proj();
  const hasFile = !!(p && rel);
  $('#viewEmpty').classList.toggle('is-off', hasFile);
  ['#viewMd','#viewFile','#viewMind','#viewHistory'].forEach(s => $(s).classList.remove('is-on'));

  if (S.tempMode || !p) {
    $('#emptyTitle').textContent = '临时对话';
    $('#emptySub').innerHTML = '没有添加任何项目文件夹 —— 就在这里和 AI 简单聊。<br>想要围绕项目工作，点上面的 <b>＋ 添加项目文件夹</b>。';
    $('#viewEmpty').classList.remove('is-off');
    $('#tabbar').style.display = 'none'; $('#fileHead').style.display = 'none'; $('#mdBar').style.display = 'none';
    renderHistoryBadge(); return;
  }
  if (!hasFile) {
    $('#emptyTitle').textContent = '这个项目还没有打开文件';
    $('#emptySub').textContent = '在左边点一个文件，它会同时成为「重点参考」。';
    $('#mdBar').style.display = 'none';
    renderHistoryBadge(); return;
  }

  const kind = extViewKind(rel);
  $('#tabbar').style.display = ''; $('#fileHead').style.display = '';
  // md 工具栏只给 md；脑图有自己的「折叠代码」条
  $('#mdBar').style.display = kind === 'md' ? '' : 'none';
  $('#viewModes').style.display = kind === 'md' ? '' : 'none';

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
  // 分栏态：三个都不高亮预览？→ 分栏时「编辑」与「预览」同时可点，用 split 标记
  $$('#viewModes .vm').forEach(b => b.classList.toggle('is-on',
    S.mdVariant === 'split' ? b.dataset.vm === 'preview' : vm[b.dataset.vm]));
  $('#btnFoldCode').hidden = S.codeFolded;
  $('#btnShowCode').hidden = !S.codeFolded;
}

function renderHistoryBadge() {
  const n = (S.history[histFile()] || []).length;
  const t = $$('#contentTabs .tab'); void t;
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
  const rel = relOfActiveTab(); if (!rel) return;
  proj().files[rel] = $('#mdSource').value;
  $('#mdPreview').innerHTML = mdToHtml(proj().files[rel]);
  clearTimeout(mdDebounce);
  mdDebounce = setTimeout(() => { pushHistory(rel, '手改', proj().files[rel], '正文编辑'); save(); }, 700);
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
function searchFiles(q) {
  const p = proj(); if (!p || !q.trim()) return [];
  const out = [];
  const walk = (nodes, prefix) => nodes.forEach(n => {
    const rel = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.type === 'file' && rel.toLowerCase().includes(q.toLowerCase())) out.push(rel);
    if (n.children) walk(n.children, rel);
  });
  walk(p.tree, '');
  return out.slice(0, 40);
}
function renderSearch(q) {
  const drop = $('#searchDrop');
  const hits = searchFiles(q);
  if (!q.trim()) { drop.hidden = true; return; }
  drop.hidden = false;
  drop.innerHTML = hits.length
    ? hits.map(r => `<div class="fs-item" data-rel="${escapeHtml(r)}"><span class="fico ${iconFor(r).cls}"></span>
        <div style="min-width:0"><div>${escapeHtml(r)}</div><div class="path">${escapeHtml(fullPath(r))}</div></div></div>`).join('')
    : `<div style="padding:10px;color:var(--ink3);font-size:12px">没有匹配的文件</div>`;
  $$('.fs-item', drop).forEach(el => el.onclick = () => {
    openInTab(S.activeProject, el.dataset.rel);
    drop.hidden = true; $('#fileSearch').value = '';
  });
}

function setLayout(layout) {
  S.layout = layout;
  $('#main').classList.toggle('center-layout', layout === 'center');
  const label = layout === 'center' ? '对话·中' : '对话·右';
  $('#btnLayout').textContent = label;
  save();
  toast(layout === 'center' ? '对话放中间 —— 对话内容更大' : '对话放右侧 —— 正文居中显示');
}
function toggleFullscreen() {
  const app = $('.app');
  app.classList.toggle('fs');
  const on = app.classList.contains('fs');
  toast(on ? '已进入全屏（ESC 或 ⌘⇧F 退出）' : '已退出全屏');
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

/* ============================================================
   绑定
   ============================================================ */
function bind() {
  $$('#modeChips .chip').forEach(c => c.onclick = () => { S.mode = c.dataset.mode; save(); renderModes(); });
  $$('#chatModes .dchip').forEach(c => c.onclick = () => { S.chatMode = c.dataset.chat; save(); renderChatModes(); });

  $('#btnProjSect').onclick = () => { S.navOpen = !S.navOpen; save(); renderNav(); };
  $('#btnRecentSect').onclick = () => { S.recentOpen = !S.recentOpen; save(); renderNav(); };

  $('#btnAddProject').onclick = e => {
    e.stopPropagation();
    const m = $('#menuAdd'), r = e.currentTarget.getBoundingClientRect();
    m.hidden = !m.hidden;
    m.style.left = r.left + 'px'; m.style.top = (r.bottom + 6) + 'px';
  };
  $('#btnEmptyAdd').onclick = () => $('#btnAddProject').click();
  $$('#menuAdd button').forEach(b => b.onclick = () => addMenuAction(b.dataset.act));
  $$('#menuProj button').forEach(b => b.onclick = () => projMenuAction(b.dataset.act));
  document.addEventListener('click', e => {
    if (!e.target.closest('.menu') && !e.target.closest('#btnAddProject') && !e.target.closest('.proj-more')) closeMenus();
    if (!e.target.closest('.fsearch')) $('#searchDrop').hidden = true;
  });

  $('#defaultCard').onclick = () => {
    S.tempMode = true; save(); renderNav(); renderContent(); renderChatModes();
    $('#chatInput').focus();
    toast('临时对话 —— 没有项目文件，直接在右边聊');
  };
  $('#btnEmptyTemp').onclick = () => $('#defaultCard').click();

  $('#btnNewTab').onclick = () => { $('#fileSearch').focus(); toast('用左边的搜索找文件，点它就开一个新标签'); };

  $('#fileSearch').oninput = e => renderSearch(e.target.value);
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
  $('#btnHistory').onclick = () => {
    if (!histFile()) return;
    ensureTab(histFile());                     // 历史是"当前文件"的，先把那个文件的标签切出来
    S.tab = S.tab === 'history' ? (extViewKind(relOfActiveTab()) === 'mind' ? 'mind' : 'md') : 'history';
    save(); renderNav(); renderTabs(); renderContent(); renderContext();
  };

  $('#btnFs').onclick = toggleFullscreen;
  $('#btnFs2').onclick = toggleFullscreen;
  $('#btnLayout').onclick = () => setLayout(S.layout === 'right' ? 'center' : 'right');
  $('#btnLayout2').onclick = () => $('#btnLayout').click();
  $('#btnFullFeature').onclick = () => toast('当前就在「全功能」页');
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
    if (!confirm(`清空 ${rel} 的全部历史？`)) return;
    delete S.history[rel]; save(true); renderHistory();
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
  const map = { imageText:'围绕当前项目', voice:'语音模式', video:'视频模式' };
  $('#chatStatus').textContent = S.tempMode ? '临时对话（无项目）' : map[S.mode];
  $('#composerHint').textContent = S.mode === 'voice' ? '语音模式 · 回车发送文字'
    : S.mode === 'video' ? '视频模式 · 回车发送' : '回车发送 · Shift+回车换行';
}
function renderChatModes() {
  $$('#chatModes .dchip').forEach(c => c.classList.toggle('is-on', c.dataset.chat === S.chatMode));
  renderModes();
}

/* ── 启动：骨架先出、内容后到 ───────────────── */
function boot() {
  const t0 = performance.now();
  const app = $('.app');
  app.classList.add('is-booting');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const tSkeleton = Math.round(performance.now() - t0);
    bind(); renderAll();
    if (S.layout === 'center') $('#main').classList.add('center-layout');
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
