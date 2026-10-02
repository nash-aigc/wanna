// 学习方案 · 方案三可视化 —— 同一道题（守灯人手记）的图形化交互
(function () {
  "use strict";

  const W = 118, H = 48; // 节点芯片尺寸

  // 场景节点：数据 = 方案二题面原句的精简；kps = 这个物件混合承载的知识点（3~5 个）
  const NODES = [
    { id: "pack",  x: 70,  y: 505, icon: "🎒", name: "背包",
      data: "背包里有 8 瓶水和 5 块面包。", link: "水与面包的数量并入账本第一行。",
      kps: ["20 以内进位加法", "加法的意义"], val: "13 件", work: "8 + 5 = 13", need: [] },
    { id: "rope",  x: 165, y: 575, icon: "🪢", name: "绳与板",
      data: "码头绳长 9 米，木板长 6 米。", link: "绳比木板「多出的部分」并入第一行。",
      kps: ["比多少（减法）", "长度单位·米"], val: "3 米", work: "9 − 6 = 3", need: [] },
    { id: "money", x: 265, y: 505, icon: "👛", name: "钱包",
      data: "1 张 10 元、1 张 5 元、3 枚 1 元硬币。", link: "合计并入第一行。",
      kps: ["认识人民币", "100 以内加法", "数的组成"], val: "18 元", work: "10 + 5 + 3 = 18", need: [] },
    { id: "note",  x: 175, y: 435, icon: "📋", name: "交接单",
      data: "我到岗时排第 7，前面还有 6 个人。", link: "「前面的人数」并入第一行。",
      kps: ["基数与序数", "第几"], val: "6 人", work: "直接读出：6", need: [] },
    { id: "cans",  x: 400, y: 490, icon: "🥫", name: "罐头架",
      data: "上层摆 12 个，下层摆 9 个。", link: "合计并入第一行。",
      kps: ["100 以内进位加法", "位置·上下"], val: "21 个", work: "12 + 9 = 21", need: [] },
    { id: "tiles", x: 490, y: 585, icon: "🔶", name: "地砖刻数",
      data: "刻着 2、4、6、8，下一块该轮到后一位。", link: "刻数的后一位并入第一行。",
      kps: ["找规律（等差数列）", "数序"], val: "10", work: "2, 4, 6, 8 → 10", need: [] },
    { id: "ledger", x: 615, y: 480, icon: "📒", name: "账本第一行",
      data: "把这些零碎统统并进账本第一行。", link: "补给员留下的包裹「恰好是」这个数。",
      kps: ["多位数连加", "信息合并"], val: "71", work: "13 + 3 + 18 + 21 + 10 + 6 = 71",
      need: ["pack", "rope", "money", "cans", "tiles", "note"] },
    { id: "boxes", x: 725, y: 585, icon: "📦", name: "包裹与箱",
      data: "每 8 个装一箱，零头搁在一边；每箱连箱压舱 24 千克。", link: "压舱总重交给集市。",
      kps: ["有余数除法", "表内乘法", "除法的意义"], val: "192 千克", work: "71 ÷ 8 = 8 箱……余 7（搁置）→ 8 × 24 = 192",
      need: ["ledger"] },
    { id: "scale", x: 830, y: 505, icon: "⚖️", name: "集市秤",
      data: "整批货按每千克 2.5 元卖掉。", link: "卖货所得全部用来买灯罩。",
      kps: ["小数乘法", "单价 × 数量 = 总价"], val: "480 元", work: "192 × 2.5 = 480",
      need: ["boxes"] },
    { id: "lamp",  x: 915, y: 445, icon: "💡", name: "灯罩价签",
      data: "标价 300 元，正赶上打八折。", link: "折后价计入密码。",
      kps: ["百分数·折扣", "小数乘法"], val: "240 元", work: "300 × 0.8 = 240",
      need: ["scale"] },
    { id: "found", x: 875, y: 625, icon: "📐", name: "地基与时钟",
      data: "8:15 铺绳到 9:00，每分钟 4 米；地基长 12 宽 5，绕了整整 5 圈还剩一截。",
      link: "剩绳长计入密码。",
      kps: ["钟表与经过时间", "速度 × 时间", "长方形周长", "混合运算（连减）"],
      val: "10 米", work: "45×4 = 180；(12+5)×2 = 34；180 − 34×5 = 10", need: [] },
    { id: "bricks", x: 1010, y: 575, icon: "🧱", name: "砖堆",
      data: "三趟共搬 180 块，第二趟比第一趟多 15，第三趟又多 15。",
      link: "第一趟的块数计入密码。",
      kps: ["简易方程", "等量关系"], val: "45 块", work: "x + (x+15) + (x+30) = 180 → x = 45", need: [] },
    { id: "room",  x: 1060, y: 500, icon: "🏠", name: "灯室",
      data: "长方体小屋：长 6 米、宽 4 米、高 3 米。", link: "容积计入密码。",
      kps: ["长方体体积", "体积单位"], val: "72 立方米", work: "6 × 4 × 3 = 72", need: [] },
    { id: "circle", x: 975, y: 415, icon: "⭕", name: "圆底座",
      data: "灯塔底座是圆，半径正好 10 米（π 取 3.14）。", link: "占地面积计入密码。",
      kps: ["圆面积", "π 的应用"], val: "314 平方米", work: "3.14 × 10² = 314", need: [] },
  ];

  const Lighthouse = { id: "lighthouse", x: 1035, y: 330, w: 140 };
  const ACCOUNT_IDS = ["ledger", "boxes", "scale", "lamp", "found", "bricks", "room", "circle"];
  const PASSWORD = 1424;

  const DEPS = [
    { from: "pack", to: "ledger" }, { from: "rope", to: "ledger" }, { from: "money", to: "ledger" },
    { from: "cans", to: "ledger" }, { from: "tiles", to: "ledger" }, { from: "note", to: "ledger" },
    { from: "ledger", to: "boxes", label: "恰好等于它" },
    { from: "boxes", to: "scale", label: "整批货" },
    { from: "scale", to: "lamp", label: "全部付账" },
  ];
  const FINALS = ACCOUNT_IDS.map((id) => ({ from: id, to: "lighthouse" }));

  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

  // ───────── 状态 ─────────
  const STORE = "wanna-scheme3-viz-v1";
  let state = { revealed: [], edges: true, done: false };
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && s.v === 1) state = Object.assign(state, s); } catch (e) {}
  function save() { localStorage.setItem(STORE, JSON.stringify(Object.assign({ v: 1 }, state))); }
  const revealed = new Set(state.revealed);
  let selected = null;

  const $ = (s) => document.querySelector(s);
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  // ───────── 场景：画节点 ─────────
  function renderNodes() {
    const ns = "http://www.w3.org/2000/svg";
    const g = $("#nodes");
    g.innerHTML = "";
    for (const n of NODES) {
      const grp = document.createElementNS(ns, "g");
      grp.setAttribute("class", "node" + (revealed.has(n.id) ? " lit" : "") + (selected === n.id ? " sel" : ""));
      grp.setAttribute("data-id", n.id);
      grp.setAttribute("transform", `translate(${n.x},${n.y})`);
      const r = document.createElementNS(ns, "rect");
      r.setAttribute("width", W); r.setAttribute("height", H); r.setAttribute("rx", 8);
      const icon = document.createElementNS(ns, "text");
      icon.setAttribute("class", "n-icon"); icon.setAttribute("x", 14); icon.setAttribute("y", 29);
      icon.textContent = n.icon;
      const name = document.createElementNS(ns, "text");
      name.setAttribute("class", "n-name"); name.setAttribute("x", 38); name.setAttribute("y", 29);
      name.textContent = n.name;
      const dot = document.createElementNS(ns, "circle");
      dot.setAttribute("class", "n-dot"); dot.setAttribute("cx", W - 11); dot.setAttribute("cy", H / 2); dot.setAttribute("r", 4);
      grp.append(r, icon, name, dot);
      g.appendChild(grp);
    }
    // 灯塔（最终节点）
    const fin = document.createElementNS(ns, "g");
    fin.setAttribute("class", "node final" + (state.done ? " lit" : "") + (selected === "lighthouse" ? " sel" : ""));
    fin.setAttribute("data-id", "lighthouse");
    fin.setAttribute("transform", `translate(${Lighthouse.x},${Lighthouse.y})`);
    const fr = document.createElementNS(ns, "rect");
    fr.setAttribute("width", Lighthouse.w); fr.setAttribute("height", H); fr.setAttribute("rx", 8);
    const ft = document.createElementNS(ns, "text");
    ft.setAttribute("class", "n-name"); ft.setAttribute("x", Lighthouse.w / 2); ft.setAttribute("y", 29);
    ft.setAttribute("text-anchor", "middle"); ft.textContent = state.done ? "🗼 灯塔已点亮" : "🗼 输入灯塔密码";
    fin.append(fr, ft);
    g.appendChild(fin);
  }

  // ───────── 场景：画连线 ─────────
  function center(n) {
    const w = n.id === "lighthouse" ? Lighthouse.w : W;
    return { x: n.x + w / 2, y: n.y + H / 2 };
  }
  function nodeBox(id) { return id === "lighthouse" ? Lighthouse : byId[id]; }
  function edgePath(a, b) {
    const p = center(a), q = center(b);
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx - (dy / len) * 18, cy = my + (dx / len) * 18;
    return `M ${p.x} ${p.y} Q ${cx} ${cy} ${q.x} ${q.y}`;
  }
  function renderEdges() {
    const ns = "http://www.w3.org/2000/svg";
    const g = $("#edges");
    g.innerHTML = "";
    g.classList.toggle("show", !!state.edges);
    const draw = (e, cls) => {
      const from = nodeBox(e.from), to = nodeBox(e.to);
      if (!from || !to) return;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("class", cls + (selected && (e.from === selected || e.to === selected) ? " hl" : ""));
      path.setAttribute("d", edgePath(from, to));
      path.setAttribute("data-from", e.from);
      path.setAttribute("data-to", e.to);
      g.appendChild(path);
      if (e.label && cls === "dep") {
        const p = center(from), q = center(to);
        const lx = (p.x + q.x) / 2, ly = (p.y + q.y) / 2 - 8;
        const tw = e.label.length * 11 + 10;
        const bg = document.createElementNS(ns, "rect");
        bg.setAttribute("class", "elabel-bg");
        bg.setAttribute("x", lx - tw / 2); bg.setAttribute("y", ly - 11);
        bg.setAttribute("width", tw); bg.setAttribute("height", 16); bg.setAttribute("rx", 8);
        const tx = document.createElementNS(ns, "text");
        tx.setAttribute("x", lx); tx.setAttribute("y", ly + 1);
        tx.setAttribute("text-anchor", "middle");
        tx.textContent = e.label;
        g.append(bg, tx);
      }
    };
    DEPS.forEach((e) => draw(e, "dep"));
    FINALS.forEach((e) => draw(e, "fin"));
  }

  // ───────── 进度 ─────────
  function accountCount() { return ACCOUNT_IDS.filter((id) => revealed.has(id)).length; }
  function renderProgress() { $("#progressCount").textContent = accountCount(); }

  // ───────── 右栏面板 ─────────
  function upstreamMissing(n) { return n.need.filter((id) => !revealed.has(id)); }

  function renderPanel() {
    const p = $("#panel");
    if (!selected) {
      p.innerHTML = `
        <h2>这是一道题，不是一堆题</h2>
        <div class="meta">方案二《守灯人手记 · 第七夜》的图形化版本 —— 数据都长在场景里</div>
        <div class="sec">怎么玩</div>
        <ul class="intro-list">
          <li>点任意<b>物件</b>：看到它的场景数据、要处理的<b>关联</b>，以及它混合承载的 <b>3~5 个知识点</b>。</li>
          <li>点「处理这条关联」：揭示这个数，物件点亮 —— 有上下游的物件必须<b>先点亮上游</b>。</li>
          <li>顶栏「<b>关联</b>」：显示/隐藏全局连线（实线 = 数据依赖，虚线 = 计入密码）。</li>
          <li>集齐 <b>8 个账面数</b> → 点右上灯塔输入密码 → <b>整座岛就是这道题的题面</b>。</li>
        </ul>
        <div class="sec">目标</div>
        <div class="link">把我这一夜的八个折算数加成一个和 —— 这个和就是灯塔密码。</div>
        <div class="meta" style="margin-top:14px">当前进度：${accountCount()} / 8 个账面数</div>`;
      return;
    }
    if (selected === "lighthouse") {
      const ready = accountCount() === 8;
      p.innerHTML = `
        <h2>🗼 灯塔 · 唯一的一问</h2>
        <div class="meta">整道题只有这一个输入框</div>
        <div class="data">把我这一夜亲手记进账本的八个折算数 —— 加成一个和。<br>这个和，就是灯塔密码。</div>
        <div class="sec">账面数进度</div>
        <div class="link">${accountCount()} / 8 已处理${ready ? " —— 可以开灯了" : " —— 先把场景里的物件点亮"}</div>
        <div class="sec">密码</div>
        <div class="pw-row">
          <input class="pw-input" id="pwInput" inputmode="numeric" placeholder="灯塔密码" ${state.done ? "value=1424 disabled" : ""}>
          <button class="btn primary" id="pwGo" ${state.done ? "disabled" : ""}>开灯</button>
        </div>
        <button class="act-btn" id="pwLedger" style="background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.45);color:#FDE68A">对照层：核对八个账面数</button>`;
      return;
    }
    const n = byId[selected];
    const isLit = revealed.has(n.id);
    const missing = upstreamMissing(n);
    const chips = n.kps.map((k) => `<span class="chip ${n.kps.length >= 3 ? "multi" : ""}">${esc(k)}</span>`).join("");
    let revealUI = "";
    if (isLit) {
      revealUI = `
        <div class="reveal-box">
          <div class="val">${esc(n.val)}</div>
          <div class="work">${esc(n.work)}</div>
        </div>
        <button class="act-btn" disabled>✓ 这条关联已处理</button>`;
    } else if (missing.length) {
      const names = missing.map((id) => byId[id].name).join("、");
      revealUI = `
        <div class="lock-hint">依赖上游：请先处理 <b>${esc(names)}</b> —— 这就是题目里「谁引用谁」的关联。</div>
        <button class="act-btn" disabled>处理这条关联</button>`;
    } else {
      revealUI = `<button class="act-btn" id="revealBtn">处理这条关联 → 揭示这个数</button>`;
    }
    p.innerHTML = `
      <h2>${n.icon} ${esc(n.name)}</h2>
      <div class="meta">${n.kps.length} 个知识点混合在这一个物件里（不是一句一点）</div>
      <div class="sec">场景数据</div>
      <div class="data">${esc(n.data)}</div>
      <div class="sec">要处理的关联</div>
      <div class="link">${esc(n.link)}</div>
      <div class="sec">这句话背后的知识点</div>
      <div class="chips">${chips}</div>
      ${revealUI}`;
  }

  // ───────── 交互 ─────────
  function select(id) {
    selected = id;
    renderNodes();
    renderEdges();
    renderPanel();
  }

  function reveal(id) {
    const n = byId[id];
    if (!n || revealed.has(id)) return;
    if (upstreamMissing(n).length) return;
    revealed.add(id);
    state.revealed = Array.from(revealed);
    save();
    renderNodes();
    renderProgress();
    renderPanel();
    toast(`✓ ${n.name} → ${n.val}`);
    if (accountCount() === 8) toast("八个账面数集齐了 —— 去灯塔输入密码");
  }

  function checkPassword() {
    const input = $("#pwInput");
    if (!input) return;
    const v = parseInt(String(input.value).trim(), 10);
    if (v === PASSWORD) {
      state.done = true;
      save();
      renderNodes();
      renderPanel();
      $("#finale").hidden = false;
    } else if (Number.isNaN(v)) {
      toast("输入一个数");
    } else {
      toast(`不对（${v}）—— ${accountCount() < 8 ? "还有账面数没处理" : "打开对照层逐个核对，第一个对不上的就是断点"}`);
    }
  }

  function openLedger() {
    const rows = ACCOUNT_IDS.map((id) => {
      const n = byId[id];
      const seen = revealed.has(id);
      return `<tr>
        <td>${n.icon} ${esc(n.name)}</td>
        <td>${seen ? esc(n.work) : "<span style='color:#8A8A93'>未处理（点场景物件去处理）</span>"}</td>
        <td class="v">${seen ? esc(n.val) : "—"}</td>
      </tr>`;
    }).join("");
    $("#modalBox").innerHTML = `
      <h2>对照层 · 八个账面数</h2>
      <div class="meta" style="font-size:12px;color:var(--ink3);margin-bottom:10px">
        这就是方案二文档里的验算账本 —— 用来定位「第一个对不上的数 = 断裂的关联 = 知识点薄弱处」。
      </div>
      <table class="ledger-tbl">
        <tr><th>账面数</th><th>算链</th><th>值</th></tr>
        ${rows}
        <tr class="sum"><td>灯塔密码</td><td>八个数加成一个和</td><td class="v">1424</td></tr>
      </table>
      <div class="mfoot"><button class="btn primary" id="ledgerClose">关闭</button></div>`;
    $("#modal").hidden = false;
  }

  // ───────── 事件 ─────────
  $("#scene").addEventListener("click", (e) => {
    const g = e.target.closest(".node");
    if (!g) return;
    select(g.getAttribute("data-id"));
  });
  $("#panel").addEventListener("click", (e) => {
    if (e.target.id === "revealBtn" && selected) reveal(selected);
    if (e.target.id === "pwGo") checkPassword();
    if (e.target.id === "pwLedger") openLedger();
  });
  $("#panel").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "pwInput") checkPassword();
  });
  $("#btnEdges").addEventListener("click", () => {
    state.edges = !state.edges;
    save();
    $("#btnEdges").classList.toggle("on", state.edges);
    renderEdges();
    toast(state.edges ? "关联已显示" : "关联已隐藏");
  });
  $("#btnLedger").addEventListener("click", openLedger);
  $("#modal").addEventListener("click", (e) => {
    if (e.target.id === "modal" || e.target.id === "ledgerClose") $("#modal").hidden = true;
  });
  $("#btnFinaleClose").addEventListener("click", () => { $("#finale").hidden = true; });
  $("#btnReset").addEventListener("click", () => {
    if (!confirm("清空点亮进度？")) return;
    state = { revealed: [], edges: state.edges, done: false };
    save();
    selected = null;
    renderNodes(); renderEdges(); renderProgress(); renderPanel();
    toast("已重置");
  });

  // ───────── 启动 ─────────
  $("#btnEdges").classList.toggle("on", !!state.edges);
  renderNodes();
  renderEdges();
  renderProgress();
  renderPanel();
})();
