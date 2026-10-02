// app.js —— 数学岛·点亮灯塔：一道题 × 7 种难度
// 数据：data-kps.js (KPS) + data-questions.js (getQuestion / LEVELS)
(function () {
  "use strict";

  const DOMAIN = { number: "数与运算", geo: "图形几何", measure: "量与计量", stat: "统计与概率", think: "综合实践" };
  const GRADE_LABEL = { 1: "一年级", 2: "二年级", 3: "三年级", 4: "四年级", 5: "五年级", 6: "六年级" };
  const STORE_KEY = "wanna-learn-math-paper-v2";

  const KP_BY_ID = Object.fromEntries(KPS.map((k) => [k.id, k]));

  // 每档一道题：懒加载缓存
  const qCache = {};
  function question(level) {
    if (!qCache[level]) qCache[level] = getQuestion(level);
    return qCache[level];
  }

  // ───────── 状态（每道题独立作答）─────────
  function freshState() { return { v: 2, current: 1, a: {}, r: {}, done: {}, demo: false }; }
  function loadState() {
    try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.v === 2) return s; } catch (e) {}
    return freshState();
  }
  let state = loadState();
  let saveTimer = null;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => localStorage.setItem(STORE_KEY, JSON.stringify(state)), 200); }
  function saveNow() { clearTimeout(saveTimer); localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  function ansOf(level) { return (state.a[level] = state.a[level] || {}); }
  function resOf(level) { return (state.r[level] = state.r[level] || {}); }

  const ui = { mapTab: "stage", openHints: new Set(), selectedKp: null, selectedItem: null };
  function cur() { return question(state.current); }

  // ───────── 判分 ─────────
  function norm(s) { return String(s == null ? "" : s).trim().replace(/\s+/g, " ").replace(/：/g, ":"); }
  function parseNumeric(raw) {
    if (raw == null) return null;
    let s = String(raw).trim().replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    s = s.replace(/(平方厘米|立方厘米|平方分米|立方分米|平方米|立方米|平方千米|平方公里|千米|公里|分米|厘米|毫米|千克|公斤|分钟|米|元|角|件|个|人|本|袋|箱|块|颗|张|度|秒|次|组|万)$/, "");
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    return null;
  }
  function parseFrac(raw) {
    const m = String(raw == null ? "" : raw).trim().match(/^(\d+)\s*[\/／]\s*(\d+)$/);
    return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
  }
  function isCorrect(step, val) {
    if (step.options) return val === step.ans;
    if (Array.isArray(step.ans)) {
      if (!Array.isArray(val)) return false;
      return step.ans.every((a, i) => {
        const n = parseNumeric(val[i]);
        if (n !== null) return Math.abs(n - a) < 1e-6;
        return norm(val[i]) === norm(String(a));
      });
    }
    const s = norm(val);
    if (s === "") return false;
    if (typeof step.ans === "number") {
      const n = parseNumeric(s);
      if (n !== null) return Math.abs(n - step.ans) < 1e-6;
      const f = parseFrac(s);
      if (f && f[1] && Math.abs(f[0] / f[1] - step.ans) < 1e-6) return true;
      return false;
    }
    // 文本答案（分数串 / 时刻 / 中文）
    const acc = [String(step.ans)].concat(step.ans === String(step.ans) ? extraAccepts(step.ans) : []).map(norm);
    if (acc.includes(s)) return true;
    const f1 = parseFrac(s), f2 = parseFrac(String(step.ans));
    if (f1 && f2 && f1[1] && f2[1] && f1[0] * f2[1] === f2[0] * f1[1]) return true;
    return false;
  }
  function extraAccepts(ans) {
    // 时刻与常见中文写法
    const m = String(ans).match(/^(\d{1,2}):(\d{2})$/);
    if (m) return [`${m[1]}：${m[2]}`, `${m[1]}点`, `${m[1]}时`];
    if (["十", "百", "千"].includes(ans)) return [ans + "位"];
    if (["周四", "周三", "周二", "周一"].includes(ans)) return ["星期" + ans[1], "礼拜" + ans[1]];
    return [];
  }
  function answered(val) {
    if (val === undefined || val === null) return false;
    if (Array.isArray(val)) return val.every((x) => norm(x) !== "");
    if (typeof val === "number") return true;
    return norm(val) !== "";
  }

  // 知识点状态（跨七道题聚合）：任一步答错 → 待巩固；任一步答对且无错 → 已掌握
  function kpStatusAll(kid) {
    let ok = false;
    for (let L = 1; L <= 7; L++) {
      const q = question(L);
      for (const st of q.steps) {
        if (!st.kp.includes(kid)) continue;
        const r = resOf(L)[st.id];
        if (r === "err") return "weak";
        if (r === "ok") ok = true;
      }
    }
    return ok ? "ok" : "todo";
  }
  function stats() {
    const t = { ok: 0, weak: 0, todo: 0 };
    for (const k of KPS) t[kpStatusAll(k.id)]++;
    return t;
  }

  // ───────── DOM helpers ─────────
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function $(sel) { return document.querySelector(sel); }
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ───────── 顶栏：难度切换（第 1~7 道题）─────────
  function renderSwitcher() {
    $("#progress").innerHTML = LEVELS.map((lv) => {
      const done = !!state.done[lv.n];
      const curFlag = lv.n === state.current;
      const cls = ["pnode", done ? "done" : "", curFlag ? "cur" : "", lv.n === 7 ? "finale" : ""].join(" ");
      return `<button class="${cls}" data-q="${lv.n}" title="第 ${lv.n} 道题 · ${lv.name} —— ${lv.note}">
        <span class="dot">${done ? "✓" : lv.n}</span><span class="cap">${lv.name}</span></button>`;
    }).join("");
  }
  function renderMastery() {
    const st = stats();
    $("#mastery").innerHTML =
      `掌握 <b>${st.ok}</b>/${KPS.length}` +
      (st.weak ? ` · <span class="weak">待巩固 ${st.weak}</span>` : "") +
      ` · 第 ${state.current}/7 道`;
  }

  // ───────── 左栏知识地图 ─────────
  function renderKpMap() {
    let html = "";
    for (let g = 1; g <= 6; g++) {
      const list = KPS.filter((k) => k.g === g);
      html += `<div class="grade-block"><div class="grade-head"><span>${GRADE_LABEL[g]}</span><span>${list.length}</span></div>`;
      for (const k of list) {
        const st = kpStatusAll(k.id);
        html += `<span class="kp-chip ${st === "todo" ? "" : st} ${ui.selectedKp === k.id ? "hl-kp" : ""}" data-kp="${k.id}" title="${esc(k.tip)}">
          <span class="st"></span>${esc(k.name)}</span>`;
      }
      html += `</div>`;
    }
    $("#kpList").innerHTML = html;
  }

  // ───────── 中栏：一道题 ─────────
  function stepHTML(step) {
    const level = state.current;
    const res = resOf(level)[step.id];
    const val = ansOf(level)[step.id];
    const hintOpen = ui.openHints.has(level + ":" + step.id);
    const kps = step.kp.map((id) =>
      `<span class="mini ${ui.selectedKp === id ? "hl-kp" : ""}" data-kp="${id}">${esc(KP_BY_ID[id].name)}</span>`).join("");
    const refs = (step.refs || []).map((rid) => {
      const t = cur().steps.find((s) => s.id === rid);
      return `<button class="ref-chip" data-jump="${rid}">→ 取 (${t ? t.no : "?"}) 的结果</button>`;
    }).join("");
    const bchip = step.styleB ? `<span class="bstyle-chip" title="这一档换了问法：不直问，绕了一步">换法</span>` : "";

    let controls = "";
    if (step.options) {
      controls = `<div class="mc-opts">` + step.options.map((o, i) => {
        let cls = "mc-opt";
        if (val === i) cls += " sel";
        if (res === "ok" && i === step.ans) cls += " right";
        if (res === "err" && val === i && i !== step.ans) cls += " wrong";
        return `<button class="${cls}" data-act="mc" data-step="${step.id}" data-opt="${i}">${String.fromCharCode(65 + i)}. ${esc(o)}</button>`;
      }).join("") + `</div>`;
    } else if (Array.isArray(step.ans)) {
      const arr = Array.isArray(val) ? val : ["", ""];
      controls = `<input class="ans-input w-2" data-step="${step.id}" data-slot="0" value="${esc(arr[0] || "")}" placeholder="箱子" >
        <input class="ans-input w-2" data-step="${step.id}" data-slot="1" value="${esc(arr[1] || "")}" placeholder="余数" >`;
    } else {
      controls = `<input class="ans-input" data-step="${step.id}" value="${esc(val === undefined || val === null ? "" : val)}" placeholder="你的答案">`;
    }

    let badge = "";
    if (res === "ok") badge = `<span class="badge ok">✓ 答对了</span>`;
    else if (res === "err") badge = `<span class="badge err">✗ 再想想</span>`;

    const hintBtn = `<button class="hint-btn" data-act="hint" data-step="${step.id}">${hintOpen ? "收起提示" : "提示"}</button>`;
    const showAns = state.demo ? `<button class="hint-btn" data-act="showans" data-step="${step.id}">看答案</button>` : "";

    const hintBox = hintOpen
      ? `<div class="hint-box">${step.kp.map((id) => `<div><b>${esc(KP_BY_ID[id].name)}</b>（${GRADE_LABEL[KP_BY_ID[id].g]}）：${esc(KP_BY_ID[id].tip)}</div>`).join("")}</div>`
      : `<div class="hint-box" hidden></div>`;

    let errBox = `<div class="err-box" hidden></div>`;
    if (res === "err") {
      const badRefs = (step.refs || []).filter((rid) => {
        const rs = resOf(level)[rid];
        return rs === "err" || rs === undefined;
      }).map((rid) => {
        const t = cur().steps.find((s) => s.id === rid);
        return t ? `(${t.no})` : rid;
      });
      errBox = `<div class="err-box"><b>这题考察：</b>${step.kp.map((id) => esc(KP_BY_ID[id].name)).join("、")}。
        点「提示」先看讲解再改。${
          badRefs.length ? `<br><b>注意连锁：</b>它依赖的第 ${badRefs.join("、")} 步还没有答对 —— 先回去改那一步。` : ""
        }</div>`;
    }

    return `<div class="item ${ui.selectedItem === step.id ? "hl" : ""}" data-item="${step.id}" data-kps="${step.kp.join(" ")}">
      <div class="item-no">(${step.no})</div>
      <div class="item-body">
        <div class="prompt">${esc(step.prompt)}${bchip}${refs ? `<span class="kprefs">${refs}</span>` : ""}<span class="kprefs">${kps}</span></div>
        <div class="controls">
          ${controls}
          <div class="act">
            <button class="check-btn" data-act="check" data-step="${step.id}">检查</button>
            ${hintBtn}${showAns}${badge}
          </div>
        </div>
        ${hintBox}${errBox}
      </div>
    </div>`;
  }

  function renderPaper() {
    const q = cur();
    const finished = !!state.done[q.level];
    const nextBtn = q.level < 7
      ? `<button class="next-q-btn" data-q="${q.level + 1}">${finished ? "挑战下一道 →" : "直接看第 " + (q.level + 1) + " 道题 →"}</button>`
      : "";
    $("#stages").innerHTML = `
      <section class="stage paper" id="paper">
        <div class="stage-head">
          <span class="stage-no">第 ${q.level} 道题</span>
          <h2>${esc(q.title)}</h2>
          <span class="grade-tag">${esc(q.difficultyLabel)}</span>
          <span class="paper-head-note">${esc(q.note)}</span>
          ${finished ? `<span class="stage-state clear">🗼 已点亮</span>` : `<span class="stage-state run">● 做题中（共 ${q.steps.length} 步）</span>`}
          ${nextBtn}
        </div>
        <p class="story">${esc(q.story).replace(/\n\n/g, "<br><br>")}</p>
        <div class="items">${q.steps.map(stepHTML).join("")}</div>
      </section>`;
  }

  // ───────── 右栏对照关系（当前这道题）─────────
  function kpChipCls(kid) { const s = kpStatusAll(kid); return s === "todo" ? "" : s; }
  function renderMapping() {
    const q = cur();
    const box = $("#mapBody");
    if (ui.mapTab === "stage") {
      box.innerHTML = `
        <div class="map-sec">
          <h3>第 ${q.level} 道题 · ${esc(q.name)}（${q.steps.length} 步 ↔ 知识点）</h3>
          ${q.steps.map((st) => `
            <div class="map-row ${ui.selectedItem === st.id ? "hl" : ""}" data-mrow="${st.id}">
              <div class="qpart" data-act="sel-item" data-item="${st.id}">
                <span class="qid">(${st.no})</span>${esc(st.prompt.slice(0, 30))}${st.prompt.length > 30 ? "…" : ""}
              </div>
              <div class="arrow">→</div>
              <div class="kpart">${st.kp.map((k) =>
                `<span class="kmini ${kpChipCls(k)} ${ui.selectedKp === k ? "hl-kp" : ""}" data-kp="${k}">${esc(KP_BY_ID[k].name)}</span>`).join("")}</div>
            </div>`).join("")}
        </div>`;
    } else {
      box.innerHTML = Array.from({ length: 6 }, (_, i) => i + 1).map((g) => `
        <div class="map-sec">
          <h3>${GRADE_LABEL[g]}</h3>
          ${KPS.filter((k) => k.g === g).map((k) => {
            const uses = q.steps.filter((s) => s.kp.includes(k.id));
            return `<div class="map-row ${ui.selectedKp === k.id ? "hl" : ""}" data-mkp="${k.id}">
              <div class="qpart" data-act="sel-kp" data-kp="${k.id}">
                <span class="qid">${uses.map((u) => "(" + u.no + ")").join(" ") || "—"}</span>${esc(k.name)}
              </div>
              <div class="arrow">→</div>
              <div class="kpart"><span class="kmini ${kpChipCls(k.id)}">${DOMAIN[k.domain]}</span>
                <span class="kmini ${kpChipCls(k.id)}" data-act="sel-kp" data-kp="${k.id}">讲解</span></div>
            </div>`;
          }).join("")}
        </div>`).join("");
    }
  }

  // ───────── 高亮与跳转 ─────────
  function clearHighlights() {
    document.querySelectorAll(".item.hl").forEach((el) => el.classList.remove("hl"));
    document.querySelectorAll(".map-row.hl").forEach((el) => el.classList.remove("hl"));
    document.querySelectorAll(".hl-kp").forEach((el) => el.classList.remove("hl-kp"));
  }
  function applyHighlights() {
    clearHighlights();
    if (ui.selectedKp) {
      document.querySelectorAll(`[data-kp="${ui.selectedKp}"]`).forEach((el) => el.classList.add("hl-kp"));
      document.querySelectorAll(`.item[data-kps~="${ui.selectedKp}"]`).forEach((el) => el.classList.add("hl"));
      document.querySelectorAll(`.map-row[data-mkp="${ui.selectedKp}"]`).forEach((el) => el.classList.add("hl"));
    }
    if (ui.selectedItem) {
      const st = cur().steps.find((s) => s.id === ui.selectedItem);
      if (st) {
        st.kp.forEach((k) => document.querySelectorAll(`[data-kp="${k}"]`).forEach((el) => el.classList.add("hl-kp")));
        document.querySelectorAll(`.item[data-item="${ui.selectedItem}"]`).forEach((el) => el.classList.add("hl"));
        document.querySelectorAll(`.map-row[data-mrow="${ui.selectedItem}"]`).forEach((el) => el.classList.add("hl"));
      }
    }
  }
  function flash(el) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  function scrollToStep(id) {
    const el = document.querySelector(`.item[data-item="${id}"]`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); flash(el); }
  }

  // ───────── 知识点弹卡 ─────────
  function openKpCard(kid, anchor) {
    const k = KP_BY_ID[kid];
    const card = $("#kpCard");
    const uses = cur().steps.filter((s) => s.kp.includes(kid));
    const status = kpStatusAll(kid);
    const statusText = status === "ok" ? "✓ 已掌握" : status === "weak" ? "✗ 待巩固" : "○ 未作答";
    card.innerHTML = `
      <button class="close" data-act="close-card">✕</button>
      <h3>${esc(k.name)}</h3>
      <div class="meta">${GRADE_LABEL[k.g]} · ${DOMAIN[k.domain]} · ${statusText} · 本题中 ${uses.length} 处</div>
      <div class="tip">${esc(k.tip)}</div>
      <div class="jumps">${uses.map((u) =>
        `<button class="jump" data-act="jump" data-item="${u.id}">(${u.no}) 去这一步 →</button>`).join("")}</div>`;
    card.hidden = false;
    const r = anchor ? anchor.getBoundingClientRect() : { left: 80, bottom: 80, top: 0 };
    let left = Math.min(r.left, window.innerWidth - 340);
    let top = r.bottom + 8;
    if (top + 260 > window.innerHeight) top = Math.max(60, r.top - 260);
    card.style.left = Math.max(8, left) + "px";
    card.style.top = top + "px";
  }
  function closeKpCard() { $("#kpCard").hidden = true; }

  function selectKp(kid, anchor) {
    ui.selectedItem = null;
    ui.selectedKp = ui.selectedKp === kid ? null : kid;
    renderKpMap();
    if (!$("#mapping").hidden) renderMapping();
    applyHighlights();
    if (ui.selectedKp) {
      openKpCard(kid, anchor);
      const first = document.querySelector(`.item[data-kps~="${kid}"]`);
      if (first) { first.scrollIntoView({ behavior: "smooth", block: "center" }); flash(first); }
    } else closeKpCard();
  }
  function selectItem(itemId) {
    ui.selectedKp = null;
    ui.selectedItem = ui.selectedItem === itemId ? null : itemId;
    closeKpCard();
    renderKpMap();
    if (!$("#mapping").hidden) renderMapping();
    applyHighlights();
    if (ui.selectedItem) scrollToStep(ui.selectedItem);
  }

  // ───────── 作答动作 ─────────
  function refreshAfterResult(stepId) {
    const st = cur().steps.find((s) => s.id === stepId);
    const el = document.querySelector(`.item[data-item="${stepId}"]`);
    if (el && st) {
      const fresh = document.createElement("div");
      fresh.innerHTML = stepHTML(st);
      el.replaceWith(fresh.firstElementChild);
    }
    renderKpMap();
    renderMastery();
    renderSwitcher();
    if (!$("#mapping").hidden) renderMapping();
    applyHighlights();
  }
  function checkStep(stepId) {
    const st = cur().steps.find((s) => s.id === stepId);
    if (!st) return;
    const level = state.current;
    const val = ansOf(level)[stepId];
    if (!answered(val)) { toast("先作答，再点检查"); return; }
    const ok = isCorrect(st, val);
    resOf(level)[stepId] = ok ? "ok" : "err";
    saveNow();
    refreshAfterResult(stepId);
    if (st.isFinal && ok) {
      state.done[level] = true;
      saveNow();
      renderSwitcher();
      showFinale(level);
      return;
    }
    if (ok) toast("✓ 答对了，对应知识点已点亮");
    else toast("✗ 还不对 —— 点「提示」看这个知识点的讲解");
  }

  // ───────── 点亮 ─────────
  function showFinale(level) {
    const q = question(level);
    const fin = q.steps.find((s) => s.isFinal);
    $("#finale .pw").textContent = "第 " + level + " 道 · 密码 " + fin.ans;
    $("#finale h2").textContent = level === 7 ? "七道题全部点亮！" : `第 ${level} 道题 · 灯塔被你点亮了！`;
    $("#finale p").textContent = level === 7
      ? "同一副 92 个知识点，七种难度你全部走完 —— 每一种用法都难不倒你。"
      : `同一个知识点集合的更难走法在下一道题里（${LEVELS[level - 1].name} → ${LEVELS[level].name}）。`;
    $("#finale").hidden = false;
  }
  function hideFinale() { $("#finale").hidden = true; }

  // ───────── 诊断报告 ─────────
  function renderDiag() {
    const st = stats();
    $("#diagStats").innerHTML = `
      <div class="dstat ok"><b>${st.ok}</b><span>已掌握知识点</span></div>
      <div class="dstat weak"><b>${st.weak}</b><span>待巩固（答错过）</span></div>
      <div class="dstat todo"><b>${st.todo}</b><span>还没作答</span></div>`;
    let html = "";
    const weakKps = KPS.filter((k) => kpStatusAll(k.id) === "weak");
    if (!weakKps.length) {
      html += `<div class="dgroup"><h4>当前没有薄弱点</h4><div class="drow"><div class="dtip">${
        st.ok === KPS.length ? "🎉 92 个知识点全部掌握！" : "还没有答错的步。继续做，作答即诊断。"
      }</div></div></div>`;
    }
    for (let g = 1; g <= 6; g++) {
      const list = weakKps.filter((k) => k.g === g);
      if (!list.length) continue;
      html += `<div class="dgroup"><h4>${GRADE_LABEL[g]} · ${list.length} 个待巩固</h4>`;
      for (const k of list) {
        // 找到一个正在答错的所在步（优先当前题）
        let target = null;
        for (const L of [state.current, 1, 2, 3, 4, 5, 6, 7]) {
          const q = question(L);
          const hit = q.steps.find((s) => s.kp.includes(k.id) && resOf(L)[s.id] === "err");
          if (hit) { target = { L, s: hit }; break; }
        }
        html += `<div class="drow">
          <div class="dname">${esc(k.name)}</div>
          <div class="dtip">${esc(k.tip)}</div>
          ${target ? `<button class="djump" data-act="jump" data-level="${target.L}" data-item="${target.s.id}">第 ${target.L} 道 (${target.s.no}) 去重做 →</button>` : ""}
        </div>`;
      }
      html += `</div>`;
    }
    $("#diagBody").innerHTML = html;
  }
  function openDiag() { renderDiag(); $("#diag").hidden = false; }
  function closeDiag() { $("#diag").hidden = true; }

  // ───────── 导出 / 重置 / 演示 ─────────
  function exportRecord() {
    const out = {
      v: 2, exportedAt: new Date().toISOString(),
      subject: "小学数学 · 数学岛·点亮灯塔（一道题 × 7 种难度）",
      knowledgePoints: KPS.length,
      mastery: stats(),
      doneLevels: state.done,
      questions: LEVELS.map((lv) => {
        const q = question(lv.n);
        return {
          level: lv.n, name: lv.name, difficulty: q.difficultyLabel,
          steps: q.steps.map((s) => {
            const a = ansOf(lv.n)[s.id];
            if (a === undefined) return null;
            return {
              no: s.no, id: s.id, prompt: s.prompt, yourAnswer: a,
              result: resOf(lv.n)[s.id] || "unchecked",
              knowledgePoints: s.kp.map((k) => ({ id: k, name: KP_BY_ID[k].name, status: kpStatusAll(k) })),
            };
          }).filter(Boolean),
        };
      }),
      weakKnowledgePoints: KPS.filter((k) => kpStatusAll(k.id) === "weak").map((k) => ({ id: k.id, name: k.name, grade: k.g, tip: k.tip })),
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    a.href = URL.createObjectURL(blob);
    a.download = `学习记录-数学岛-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出学习记录（七道题全部作答与诊断）");
  }
  function resetAll() {
    if (!confirm("清空七道题的全部作答记录？此操作不可恢复。")) return;
    state = freshState();
    ui.openHints.clear(); ui.selectedKp = null; ui.selectedItem = null;
    saveNow();
    closeKpCard();
    renderAll();
    toast("已重置");
  }
  function toggleDemo() {
    state.demo = !state.demo;
    saveNow();
    $("#btnDemo").classList.toggle("on", state.demo);
    renderPaper();
    toast(state.demo ? "演示模式开：每步都有「看答案」" : "演示模式关");
  }

  // ───────── 渲染总入口 ─────────
  function renderAll() {
    renderSwitcher();
    renderMastery();
    renderKpMap();
    renderPaper();
    if (!$("#mapping").hidden) renderMapping();
    applyHighlights();
    $("#btnDemo").classList.toggle("on", !!state.demo);
  }
  function switchQuestion(n) {
    if (n < 1 || n > 7 || n === state.current) return;
    state.current = n;
    ui.selectedKp = null; ui.selectedItem = null;
    closeKpCard();
    saveNow();
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast(`切换到第 ${n} 道题（${LEVELS[n - 1].name}）—— 同样的 92 个知识点，换一种走法`);
  }

  // ───────── 事件 ─────────
  document.addEventListener("click", (e) => {
    const qEl = e.target.closest("[data-q]");
    const kpEl = e.target.closest("[data-kp]");
    const actEl = e.target.closest("[data-act]");
    const jumpEl = e.target.closest("[data-jump]");

    if (qEl && qEl.dataset.q) { switchQuestion(Number(qEl.dataset.q)); return; }
    if (jumpEl && jumpEl.dataset.jump) {
      ui.selectedItem = jumpEl.dataset.jump;
      applyHighlights();
      scrollToStep(jumpEl.dataset.jump);
      return;
    }

    if (actEl) {
      const act = actEl.dataset.act;
      if (act === "close-card") { closeKpCard(); return; }
      if (act === "jump") {
        const lvl = actEl.dataset.level ? Number(actEl.dataset.level) : state.current;
        closeKpCard(); closeDiag(); hideFinale();
        if (lvl !== state.current) { state.current = lvl; saveNow(); renderAll(); }
        ui.selectedItem = actEl.dataset.item; ui.selectedKp = null;
        renderKpMap();
        if (!$("#mapping").hidden) renderMapping();
        applyHighlights();
        scrollToStep(actEl.dataset.item);
        return;
      }
      if (act === "check") { checkStep(actEl.dataset.step); return; }
      if (act === "showans") {
        const st = cur().steps.find((s) => s.id === actEl.dataset.step);
        const holder = actEl.closest(".act");
        const old = holder.querySelector(".badge");
        if (old) old.remove();
        holder.insertAdjacentHTML("beforeend", `<span class="badge showans">答案：${esc(st.ansText)}</span>`);
        return;
      }
      if (act === "hint") {
        const key = state.current + ":" + actEl.dataset.step;
        if (ui.openHints.has(key)) ui.openHints.delete(key); else ui.openHints.add(key);
        refreshAfterResult(actEl.dataset.step);
        return;
      }
      if (act === "mc") {
        const id = actEl.dataset.step;
        ansOf(state.current)[id] = Number(actEl.dataset.opt);
        save();
        refreshAfterResult(id);
        return;
      }
      if (act === "sel-item") { selectItem(actEl.dataset.item); return; }
      if (act === "sel-kp") { selectKp(actEl.dataset.kp, actEl); return; }
    }

    if (kpEl && kpEl.dataset.kp) { selectKp(kpEl.dataset.kp, kpEl); return; }
    if (!e.target.closest("#kpCard")) closeKpCard();
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.step && t.tagName === "INPUT") {
      const id = t.dataset.step;
      if (t.dataset.slot !== undefined) {
        const arr = Array.isArray(ansOf(state.current)[id]) ? ansOf(state.current)[id].slice() : ["", ""];
        arr[Number(t.dataset.slot)] = t.value;
        ansOf(state.current)[id] = arr;
      } else {
        ansOf(state.current)[id] = t.value;
      }
      save();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const t = e.target;
    if (t.dataset && t.dataset.step && t.tagName === "INPUT") {
      e.preventDefault();
      checkStep(t.dataset.step);
    }
  });

  $("#btnMapping").addEventListener("click", () => {
    const m = $("#mapping");
    m.hidden = !m.hidden;
    $("#btnMapping").classList.toggle("on", !m.hidden);
    if (!m.hidden) {
      ui.mapTab = "stage";
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.mtab === "stage"));
      renderMapping();
    }
  });
  $("#btnCloseMapping").addEventListener("click", () => {
    $("#mapping").hidden = true;
    $("#btnMapping").classList.remove("on");
  });
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      ui.mapTab = t.dataset.mtab;
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === t));
      renderMapping();
    })
  );
  $("#btnDiag").addEventListener("click", openDiag);
  $("#btnDiagClose").addEventListener("click", closeDiag);
  $("#diag").addEventListener("click", (e) => { if (e.target.id === "diag") closeDiag(); });
  $("#btnDiagExport").addEventListener("click", exportRecord);
  $("#btnExport").addEventListener("click", exportRecord);
  $("#btnReset").addEventListener("click", resetAll);
  $("#btnDemo").addEventListener("click", toggleDemo);
  $("#btnCollapseKp").addEventListener("click", () => $("#kpmap").classList.add("collapsed"));
  $("#btnOpenKp").addEventListener("click", () => $("#kpmap").classList.remove("collapsed"));
  $("#btnFinaleClose").addEventListener("click", hideFinale);
  $("#btnFinaleDiag").addEventListener("click", () => { hideFinale(); openDiag(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeKpCard(); closeDiag(); hideFinale(); }
  });

  renderAll();
  // 已点亮过的题，弹出的结算层可从 done 恢复提示 —— 这里不再自动弹（避免每次打开都遮屏）
})();
