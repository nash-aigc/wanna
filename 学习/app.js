// app.js —— 数学岛·点亮灯塔 原型逻辑
// 数据来自 data-kps.js (KPS) 与 data-questions.js (STAGES)
(function () {
  "use strict";

  const DOMAIN = { number: "数与运算", geo: "图形几何", measure: "量与计量", stat: "统计与概率", think: "综合实践" };
  const GRADE_LABEL = { 1: "一年级", 2: "二年级", 3: "三年级", 4: "四年级", 5: "五年级", 6: "六年级" };
  const STAGE_CAPS = ["清点", "安营", "架桥", "铺路", "装仓", "图纸", "点亮"];
  const STORE_KEY = "wanna-learn-math-island-v1";

  const KP_BY_ID = Object.fromEntries(KPS.map((k) => [k.id, k]));
  const usage = {}; // kpId -> [{stage, item}]
  const itemIndex = {}; // itemId -> {stage, item}
  for (const s of STAGES) {
    s.items.forEach((it, i) => {
      it._no = s.id + "-" + (i + 1);
      itemIndex[it.id] = { stage: s, item: it };
      it.kps.forEach((k) => (usage[k] = usage[k] || []).push({ stage: s, item: it }));
    });
  }

  // ───────── 状态 ─────────
  function freshState() { return { v: 1, answers: {}, results: {}, energyOk: {}, demo: false }; }
  function loadState() {
    try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.v === 1) return s; } catch (e) {}
    return freshState();
  }
  let state = loadState();
  let saveTimer = null;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => localStorage.setItem(STORE_KEY, JSON.stringify(state)), 200); }
  function saveNow() { clearTimeout(saveTimer); localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  const ui = { mapTab: "stage", openHints: new Set(), selectedKp: null, selectedItem: null };

  function unlockedStage() {
    if (state.demo) return 7;
    let n = 1;
    while (n < 7 && state.energyOk[n]) n++;
    return n;
  }

  // ───────── 判分 ─────────
  function norm(s) { return String(s == null ? "" : s).trim().replace(/\s+/g, " ").replace(/：/g, ":"); }
  function parseNumeric(raw) {
    if (raw == null) return null;
    let s = String(raw).trim().replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    s = s.replace(/(平方厘米|立方厘米|平方分米|立方分米|平方米|立方米|平方千米|平方公里|千米|公里|分米|厘米|毫米|千克|公斤|分钟|剩下|米|元|角|件|个|人|本|袋|箱|块|颗|张|度|秒|次|组|万)$/, "");
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    return null;
  }
  function parseFrac(raw) {
    const m = String(raw == null ? "" : raw).trim().match(/^(\d+)\s*[\/／]\s*(\d+)$/);
    return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
  }
  function isCorrect(item, val) {
    if (item.type === "mc") return val === item.answer;
    if (item.type === "input2") {
      if (!Array.isArray(val)) return false;
      return item.answer.every((a, i) => {
        const n = parseNumeric(val[i]);
        if (n !== null) return Math.abs(n - a) < 1e-9;
        return norm(val[i]) === norm(String(a));
      });
    }
    const s = norm(val);
    if (s === "") return false;
    if (typeof item.answer === "number") {
      const n = parseNumeric(s);
      if (n !== null) return Math.abs(n - item.answer) < 1e-9;
    } else {
      const acc = (item.accept || [String(item.answer)]).map(norm);
      if (acc.includes(s)) return true;
      const f1 = parseFrac(s), f2 = parseFrac(String(item.answer));
      if (f1 && f2 && f1[1] && f2[1] && f1[0] * f2[1] === f2[0] * f1[1]) return true;
      if (f1 && typeof item.answer === "number" && f1[1]) {
        if (Math.abs(f1[0] / f1[1] - item.answer) < 1e-9) return true;
      }
    }
    const n = parseNumeric(s);
    if (n !== null && typeof item.answer === "number") return Math.abs(n - item.answer) < 1e-9;
    return false;
  }
  function answerText(item) {
    if (item.type === "mc") return item.options[item.answer];
    if (item.type === "input2") return item.answer.join(" 和 ");
    return String(item.answer);
  }
  function answered(val) {
    if (val === undefined || val === null) return false;
    if (Array.isArray(val)) return val.every((x) => norm(x) !== "");
    if (typeof val === "number") return true;
    return norm(val) !== "";
  }
  function kpStatus(kid) {
    const uses = usage[kid] || [];
    if (!uses.length) return "todo";
    let anyErr = false, allOk = true;
    for (const u of uses) {
      const r = state.results[u.item.id];
      if (r === "err") anyErr = true;
      if (r !== "ok") allOk = false;
    }
    if (anyErr) return "weak";
    if (allOk) return "ok";
    return "todo";
  }
  function stats() {
    let ok = 0, weak = 0, todo = 0;
    for (const k of KPS) { const st = kpStatus(k.id); if (st === "ok") ok++; else if (st === "weak") weak++; else todo++; }
    return { ok, weak, todo };
  }

  // ───────── 工具 ─────────
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
  function itemById(id) { return itemIndex[id]; }

  // ───────── 顶栏进度 / 掌握度 ─────────
  function renderProgress() {
    const unlocked = unlockedStage();
    $("#progress").innerHTML = STAGES.map((s) => {
      const done = !!state.energyOk[s.id];
      const cur = s.id === unlocked && !done;
      const cls = ["pnode", done ? "done" : "", cur ? "cur" : "", s.id > unlocked ? "lock" : "", s.id === 7 ? "finale" : ""].join(" ");
      const mark = done ? "✓" : s.id > unlocked ? "锁" : s.id;
      return `<button class="${cls}" data-goto="${s.id}" title="第${s.id}关 ${esc(s.title)}">
        <span class="dot">${mark}</span><span class="cap">${STAGE_CAPS[s.id - 1]}</span></button>`;
    }).join("");
  }
  function renderMastery() {
    const st = stats();
    $("#mastery").innerHTML =
      `掌握 <b>${st.ok}</b>/${KPS.length}` +
      (st.weak ? ` · <span class="weak">待巩固 ${st.weak}</span>` : "") +
      ` · 关卡 ${Math.min(unlockedStage(), 7)}/7`;
  }

  // ───────── 左栏知识地图 ─────────
  function renderKpMap() {
    let html = "";
    for (let g = 1; g <= 6; g++) {
      const list = KPS.filter((k) => k.g === g);
      html += `<div class="grade-block"><div class="grade-head"><span>${GRADE_LABEL[g]}</span><span>${list.length}</span></div>`;
      for (const k of list) {
        const st = kpStatus(k.id);
        html += `<span class="kp-chip ${st === "todo" ? "" : st} ${ui.selectedKp === k.id ? "hl-kp" : ""}" data-kp="${k.id}" title="${esc(k.tip)}">
          <span class="st"></span>${esc(k.name)}</span>`;
      }
      html += `</div>`;
    }
    $("#kpList").innerHTML = html;
  }

  // ───────── 中栏关卡 ─────────
  function itemHTML(stage, item) {
    const locked = stage.id > unlockedStage();
    const res = state.results[item.id];
    const val = state.answers[item.id];
    const hintOpen = ui.openHints.has(item.id);
    const kps = item.kps.map((id) =>
      `<span class="mini ${ui.selectedKp === id ? "hl-kp" : ""}" data-kp="${id}">${esc(KP_BY_ID[id].name)}</span>`).join("");

    let controls = "";
    if (item.type === "mc") {
      controls = `<div class="mc-opts">` + item.options.map((o, i) => {
        let cls = "mc-opt";
        if (val === i) cls += " sel";
        if (res === "ok" && i === item.answer) cls += " right";
        if (res === "err" && val === i && i !== item.answer) cls += " wrong";
        return `<button class="${cls}" data-act="mc" data-item="${item.id}" data-opt="${i}">${String.fromCharCode(65 + i)}. ${esc(o)}</button>`;
      }).join("") + `</div>`;
    } else if (item.type === "input2") {
      const arr = Array.isArray(val) ? val : ["", ""];
      controls = `<input class="ans-input w-2" data-item="${item.id}" data-slot="0" value="${esc(arr[0] || "")}" placeholder="箱数" ${locked ? "disabled" : ""}>
        <input class="ans-input w-2" data-item="${item.id}" data-slot="1" value="${esc(arr[1] || "")}" placeholder="余数" ${locked ? "disabled" : ""}>`;
    } else {
      controls = `<input class="ans-input" data-item="${item.id}" value="${esc(val || "")}" placeholder="你的答案" ${locked ? "disabled" : ""}>`;
    }

    let badge = "";
    if (res === "ok") badge = `<span class="badge ok">✓ 答对了</span>`;
    else if (res === "err") badge = `<span class="badge err">✗ 再想想</span>`;

    const hintBtn = `<button class="hint-btn" data-act="hint" data-item="${item.id}">${hintOpen ? "收起提示" : "提示"}</button>`;
    const showAns = state.demo ? `<button class="hint-btn" data-act="showans" data-item="${item.id}">看答案</button>` : "";

    const hintBox = hintOpen
      ? `<div class="hint-box">${item.kps.map((id) => `<div><b>${esc(KP_BY_ID[id].name)}</b>（${GRADE_LABEL[KP_BY_ID[id].g]}）：${esc(KP_BY_ID[id].tip)}</div>`).join("")}</div>`
      : `<div class="hint-box" hidden></div>`;

    const errBox = res === "err"
      ? `<div class="err-box"><b>这题对应的知识点：</b>${item.kps.map((id) => esc(KP_BY_ID[id].name)).join("、")} ——
           先把上面「提示」里的讲解看懂，再改答案重试。标准答案在「演示模式 → 看答案」里可查。</div>`
      : `<div class="err-box" hidden></div>`;

    return `<div class="item ${ui.selectedItem === item.id ? "hl" : ""}" data-item="${item.id}" data-kps="${item.kps.join(" ")}">
      <div class="item-no">${item._no}</div>
      <div class="item-body">
        <div class="prompt">${esc(item.prompt)}<span class="kprefs">${kps}</span></div>
        <div class="controls">
          ${controls}
          <div class="act">
            <button class="check-btn" data-act="check" data-item="${item.id}" ${locked ? "disabled" : ""}>检查</button>
            ${hintBtn}${showAns}${badge}
          </div>
        </div>
        ${hintBox}${errBox}
      </div>
    </div>`;
  }

  function energyHTML(stage) {
    const unlocked = stage.id <= unlockedStage();
    const done = !!state.energyOk[stage.id];
    const e = stage.energy;
    const val = state.answers["e" + stage.id] || "";
    let res = "";
    if (done) res = `<div class="eres good">⚡ ${esc(e.label)} ＝ <b>${e.answer}</b> ${e.isFinal ? "—— 密码正确！" : "—— 下一关已解锁！"}</div>`;
    else if (e._lastWrong !== undefined) res = `<div class="eres bad">${e._lastWrong}</div>`;

    const demoNote = state.demo ? `<span class="note">（演示：标准能量数 ${e.answer}）</span>` : "";
    return `<div class="energy" data-energy="${stage.id}">
      <div class="etitle">⚡ 能量合成 · ${esc(e.label)} ${done ? "✓" : ""}</div>
      <div class="formula">${esc(e.formulaText)} &nbsp;=&nbsp; ? &nbsp; ${demoNote}</div>
      <div class="erow">
        <input class="ans-input" data-einput="${stage.id}" value="${esc(val)}" placeholder="算出能量数" ${unlocked && !done ? "" : "disabled"}>
        <button class="check-btn" data-act="energy" data-stage="${stage.id}" ${unlocked && !done ? "" : "disabled"}>${done ? "已铸造" : e.isFinal ? "嵌入石门 · 点亮灯塔" : "铸造能量石"}</button>
        <span class="note">引用题号：${e.referenced.map((r) => itemById(r).item._no).join("、")}（都要先答对）</span>
      </div>
      ${res}
    </div>`;
  }

  function stageHTML(stage) {
    const unlocked = stage.id <= unlockedStage();
    const done = !!state.energyOk[stage.id];
    let stateHtml;
    if (done) stateHtml = `<span class="stage-state clear">🔓 ${esc(stage.energy.label)} · ${stage.energy.answer}</span>`;
    else if (!unlocked) stateHtml = `<span class="stage-state lock">🔒 完成第 ${stage.id - 1} 关后解锁</span>`;
    else stateHtml = `<span class="stage-state run">● 进行中</span>`;

    return `<section class="stage ${unlocked ? "" : "locked"}" id="stage-${stage.id}">
      <div class="stage-head">
        <span class="stage-no">第 ${stage.id} 关</span>
        <h2>${esc(stage.title)}</h2>
        <span class="grade-tag">${esc(stage.gradeLabel)}</span>
        ${stateHtml}
      </div>
      <p class="story">${esc(stage.intro)}</p>
      <div class="items">${stage.items.map((it) => itemHTML(stage, it)).join("")}</div>
      ${energyHTML(stage)}
    </section>`;
  }
  function renderStages() { $("#stages").innerHTML = STAGES.map(stageHTML).join(""); }

  // ───────── 右栏对照关系 ─────────
  function kpChipCls(kid) { const st = kpStatus(kid); return st === "todo" ? "" : st; }
  function renderMapping() {
    const box = $("#mapBody");
    if (ui.mapTab === "stage") {
      box.innerHTML = STAGES.map((s) => `
        <div class="map-sec">
          <h3>第 ${s.id} 关 · ${esc(s.title)}（${esc(s.gradeLabel)}）</h3>
          ${s.items.map((it) => `
            <div class="map-row ${ui.selectedItem === it.id ? "hl" : ""}" data-mrow="${it.id}">
              <div class="qpart" data-act="sel-item" data-item="${it.id}">
                <span class="qid">${it._no}</span>${esc(it.prompt.slice(0, 30))}${it.prompt.length > 30 ? "…" : ""}
              </div>
              <div class="arrow">→</div>
              <div class="kpart">${it.kps.map((k) =>
                `<span class="kmini ${kpChipCls(k)} ${ui.selectedKp === k ? "hl-kp" : ""}" data-kp="${k}">${esc(KP_BY_ID[k].name)}</span>`).join("")}</div>
            </div>`).join("")}
          <div class="map-row" style="border-top:1px dashed var(--line2);border-radius:0">
            <div class="qpart"><span class="qid">⚡</span>${esc(s.energy.formulaText.slice(0, 30))}…</div>
            <div class="arrow">→</div>
            <div class="kpart"><span class="kmini">能量合成（${esc(s.energy.label)}＝${s.energy.answer}）</span></div>
          </div>
        </div>`).join("");
    } else {
      box.innerHTML = Array.from({ length: 6 }, (_, i) => i + 1).map((g) => `
        <div class="map-sec">
          <h3>${GRADE_LABEL[g]}</h3>
          ${KPS.filter((k) => k.g === g).map((k) => {
            const uses = usage[k.id] || [];
            return `<div class="map-row ${ui.selectedKp === k.id ? "hl" : ""}" data-mkp="${k.id}">
              <div class="qpart" data-act="sel-kp" data-kp="${k.id}">
                <span class="qid">${uses.map((u) => u.item._no).join(" ") || "—"}</span>${esc(k.name)}
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
      const rec = itemById(ui.selectedItem);
      if (rec) {
        rec.item.kps.forEach((k) => document.querySelectorAll(`[data-kp="${k}"]`).forEach((el) => el.classList.add("hl-kp")));
        document.querySelectorAll(`.item[data-item="${ui.selectedItem}"]`).forEach((el) => el.classList.add("hl"));
        document.querySelectorAll(`.map-row[data-mrow="${ui.selectedItem}"]`).forEach((el) => el.classList.add("hl"));
      }
    }
  }
  function flash(el) {
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
  }
  function scrollToItem(itemId) {
    const el = document.querySelector(`.item[data-item="${itemId}"]`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); flash(el); }
  }
  function scrollToStage(id) {
    const el = document.getElementById("stage-" + id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ───────── 知识点弹卡 ─────────
  function openKpCard(kid, anchor) {
    const k = KP_BY_ID[kid];
    const card = $("#kpCard");
    const uses = usage[kid] || [];
    card.innerHTML = `
      <button class="close" data-act="close-card">✕</button>
      <h3>${esc(k.name)}</h3>
      <div class="meta">${GRADE_LABEL[k.g]} · ${DOMAIN[k.domain]} · ${
        uses.map((u) => u.item._no).join("、")
      }</div>
      <div class="tip">${esc(k.tip)}</div>
      <div class="jumps">${uses.map((u) =>
        `<button class="jump" data-act="jump" data-item="${u.item.id}">${u.item._no} 去这题 →</button>`).join("")}</div>`;
    card.hidden = false;
    const r = anchor ? anchor.getBoundingClientRect() : { left: 80, bottom: 80, top: 0 };
    let left = Math.min(r.left, window.innerWidth - 340);
    let top = r.bottom + 8;
    if (top + 260 > window.innerHeight) top = Math.max(60, r.top - 260);
    card.style.left = Math.max(8, left) + "px";
    card.style.top = top + "px";
  }
  function closeKpCard() { $("#kpCard").hidden = true; }

  function selectKp(kid, anchor, opts) {
    ui.selectedItem = null;
    ui.selectedKp = ui.selectedKp === kid ? null : kid;
    renderKpMap();
    if (!$("#mapping").hidden) renderMapping();
    applyHighlights();
    if (ui.selectedKp) {
      openKpCard(kid, anchor);
      if (!opts || opts.scroll !== false) {
        const first = document.querySelector(`.item[data-kps~="${kid}"]`);
        if (first) { first.scrollIntoView({ behavior: "smooth", block: "center" }); flash(first); }
      }
    } else closeKpCard();
  }
  function selectItem(itemId) {
    ui.selectedKp = null;
    ui.selectedItem = ui.selectedItem === itemId ? null : itemId;
    closeKpCard();
    renderKpMap();
    if (!$("#mapping").hidden) renderMapping();
    applyHighlights();
    if (ui.selectedItem) scrollToItem(ui.selectedItem);
  }

  // ───────── 作答动作 ─────────
  function renderAfterResult(itemId) {
    const rec = itemById(itemId);
    const el = document.querySelector(`.item[data-item="${itemId}"]`);
    if (el && rec) {
      const fresh = document.createElement("div");
      fresh.innerHTML = itemHTML(rec.stage, rec.item);
      el.replaceWith(fresh.firstElementChild);
    }
    renderKpMap();
    renderMastery();
    if (!$("#mapping").hidden) renderMapping();
    applyHighlights();
  }
  function checkItem(itemId) {
    const rec = itemById(itemId);
    if (!rec) return;
    const item = rec.item;
    if (rec.stage.id > unlockedStage()) { toast("先解锁这一关"); return; }
    const val = state.answers[itemId];
    if (!answered(val)) { toast("先作答，再点检查"); return; }
    const ok = isCorrect(item, val);
    state.results[itemId] = ok ? "ok" : "err";
    saveNow();
    renderAfterResult(itemId);
    if (ok) toast("✓ 答对了，对应知识点已点亮");
    else toast("✗ 还不对 —— 点「提示」看这个知识点的讲解");
  }

  function numericAnswersFor(stage) {
    const m = {};
    for (const id of stage.energy.referenced) {
      const rec = itemById(id);
      const raw = state.answers[id];
      if (rec.item.type === "input2") m[id] = Array.isArray(raw) ? raw.map((x) => parseNumeric(x)) : [NaN, NaN];
      else { const n = parseNumeric(raw); m[id] = n !== null ? n : NaN; }
    }
    return m;
  }
  function checkEnergy(stageId) {
    const stage = STAGES.find((s) => s.id === stageId);
    if (!stage || stage.id > unlockedStage()) return;
    if (state.energyOk[stage.id]) return;
    const missing = stage.energy.referenced.filter((id) => !answered(state.answers[id]));
    if (missing.length) {
      toast("先完成引用的题：" + missing.map((id) => itemById(id).item._no).join("、"));
      return;
    }
    const rawInput = state.answers["e" + stage.id];
    if (!answered(rawInput)) { toast("先算出能量数"); return; }
    const mine = parseNumeric(rawInput);
    const computed = stage.energy.compute(numericAnswersFor(stage));

    if (mine !== null && Math.abs(mine - stage.energy.answer) < 1e-9 && Math.abs(computed - stage.energy.answer) < 1e-9) {
      state.energyOk[stage.id] = true;
      saveNow();
      stage.energy._lastWrong = undefined;
      renderProgress();
      renderMastery();
      renderStages();
      applyHighlights();
      if (stage.energy.isFinal) { showFinale(); }
      else toast(`⚡ 获得${stage.energy.label}！第 ${stage.id + 1} 关已解锁`);
      return;
    }
    // 失败：诊断引用题的状态，不泄露标准答案
    const lines = stage.energy.referenced.map((id) => {
      const it = itemById(id).item;
      const r = state.results[id];
      const a = it.type === "input2" ? (state.answers[id] || []).join(",") : (state.answers[id] ?? "");
      const mark = r === "ok" ? "✓" : r === "err" ? "✗ 未通过" : "（未检查）";
      return `${it._no} 你填的 ${a} ${mark}`;
    });
    stage.energy._lastWrong =
      `能量数对不上（你算出 ${mine === null ? rawInput : mine}）。<br>` +
      `先核对引用题：${lines.join("；")}。<br>` +
      `引用题全 ✓ 还不对 → 把公式重新算一遍（先乘除、后加减）。`;
    const box = document.querySelector(`[data-energy="${stage.id}"] .eres`);
    const holder = document.querySelector(`[data-energy="${stage.id}"]`);
    if (holder) {
      const old = holder.querySelector(".eres");
      if (old) old.remove();
      holder.insertAdjacentHTML("beforeend", `<div class="eres bad">${stage.energy._lastWrong}</div>`);
    }
    toast("能量数对不上，检查引用题与运算顺序");
  }

  // ───────── 点亮 ─────────
  function showFinale() { $("#finale").hidden = false; }
  function hideFinale() { $("#finale").hidden = true; }

  // ───────── 诊断报告 ─────────
  function renderDiag() {
    const st = stats();
    $("#diagStats").innerHTML = `
      <div class="dstat ok"><b>${st.ok}</b><span>已掌握知识点</span></div>
      <div class="dstat weak"><b>${st.weak}</b><span>待巩固（答错过）</span></div>
      <div class="dstat todo"><b>${st.todo}</b><span>还没作答</span></div>`;
    let html = "";
    const weakKps = KPS.filter((k) => kpStatus(k.id) === "weak");
    if (!weakKps.length) {
      html += `<div class="dgroup"><h4>当前没有薄弱点</h4><div class="drow"><div class="dtip">${
        st.ok === KPS.length ? "🎉 92 个知识点全部掌握，灯塔为你长明！" : "还没有答错的题。继续闯关，作答即诊断。"
      }</div></div></div>`;
    }
    for (let g = 1; g <= 6; g++) {
      const list = weakKps.filter((k) => k.g === g);
      if (!list.length) continue;
      html += `<div class="dgroup"><h4>${GRADE_LABEL[g]} · ${list.length} 个待巩固</h4>`;
      for (const k of list) {
        const wrong = (usage[k.id] || []).find((u) => state.results[u.item.id] === "err");
        const target = wrong || (usage[k.id] || [])[0];
        html += `<div class="drow">
          <div class="dname">${esc(k.name)}</div>
          <div class="dtip">${esc(k.tip)}</div>
          <button class="djump" data-act="jump" data-item="${target ? target.item.id : ""}">${target ? target.item._no + " 去重做 →" : ""}</button>
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
      v: 1,
      exportedAt: new Date().toISOString(),
      subject: "小学数学 · 数学岛·点亮灯塔",
      knowledgePoints: KPS.length,
      items: STAGES.reduce((n, s) => n + s.items.length, 0),
      progress: {
        unlockedStage: unlockedStage(),
        energyOk: state.energyOk,
        mastery: stats(),
      },
      answers: Object.keys(state.answers).map((id) => {
        if (id.startsWith("e")) return { energyStage: Number(id.slice(1)), value: state.answers[id] };
        const rec = itemById(id);
        return rec ? {
          item: rec.item._no,
          id,
          prompt: rec.item.prompt,
          yourAnswer: state.answers[id],
          result: state.results[id] || "unchecked",
          knowledgePoints: rec.item.kps.map((k) => ({ id: k, name: KP_BY_ID[k].name, status: kpStatus(k) })),
        } : { id, value: state.answers[id] };
      }),
      weakKnowledgePoints: KPS.filter((k) => kpStatus(k.id) === "weak").map((k) => ({ id: k.id, name: k.name, grade: k.g, tip: k.tip })),
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    a.href = URL.createObjectURL(blob);
    a.download = `学习记录-数学岛-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出学习记录（含作答、判分、薄弱知识点）");
  }
  function resetAll() {
    if (!confirm("清空全部作答记录与解锁进度？此操作不可恢复。")) return;
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
    renderAll();
    toast(state.demo ? "演示模式开：全部关卡可浏览，每题有「看答案」" : "演示模式关");
  }

  // ───────── 渲染总入口 ─────────
  function renderAll() {
    renderProgress();
    renderMastery();
    renderKpMap();
    renderStages();
    if (!$("#mapping").hidden) renderMapping();
    applyHighlights();
    $("#btnDemo").classList.toggle("on", !!state.demo);
  }

  // ───────── 事件 ─────────
  document.addEventListener("click", (e) => {
    const kpEl = e.target.closest("[data-kp]");
    const actEl = e.target.closest("[data-act]");
    const gotoEl = e.target.closest("[data-goto]");

    if (gotoEl && gotoEl.dataset.goto) { scrollToStage(Number(gotoEl.dataset.goto)); return; }

    if (actEl) {
      const act = actEl.dataset.act;
      if (act === "close-card") { closeKpCard(); return; }
      if (act === "jump") {
        const id = actEl.dataset.item;
        closeKpCard(); closeDiag(); hideFinale();
        if (id) { ui.selectedItem = id; ui.selectedKp = null; renderKpMap(); if (!$("#mapping").hidden) renderMapping(); applyHighlights(); scrollToItem(id); }
        return;
      }
      if (act === "check") { checkItem(actEl.dataset.item); return; }
      if (act === "showans") {
        const rec = itemById(actEl.dataset.item);
        const el = actEl.closest(".act");
        const old = el.querySelector(".badge");
        if (old) old.remove();
        el.insertAdjacentHTML("beforeend", `<span class="badge showans">答案：${esc(answerText(rec.item))}</span>`);
        return;
      }
      if (act === "hint") {
        const id = actEl.dataset.item;
        if (ui.openHints.has(id)) ui.openHints.delete(id); else ui.openHints.add(id);
        renderAfterResult(id);
        return;
      }
      if (act === "mc") {
        const id = actEl.dataset.item;
        const rec = itemById(id);
        if (rec.stage.id > unlockedStage()) return;
        state.answers[id] = Number(actEl.dataset.opt);
        save();
        renderAfterResult(id);
        return;
      }
      if (act === "energy") { checkEnergy(Number(actEl.dataset.stage)); return; }
      if (act === "sel-item") { selectItem(actEl.dataset.item); return; }
      if (act === "sel-kp") { selectKp(actEl.dataset.kp, actEl, { scroll: true }); return; }
    }

    if (kpEl && kpEl.dataset.kp) {
      selectKp(kpEl.dataset.kp, kpEl, { scroll: true });
      return;
    }

    if (!e.target.closest("#kpCard")) closeKpCard();
  });

  // 输入同步
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.item !== undefined && t.tagName === "INPUT") {
      const id = t.dataset.item;
      if (t.dataset.slot !== undefined) {
        const arr = Array.isArray(state.answers[id]) ? state.answers[id].slice() : ["", ""];
        arr[Number(t.dataset.slot)] = t.value;
        state.answers[id] = arr;
      } else {
        state.answers[id] = t.value;
      }
      save();
    }
    if (t.dataset.einput !== undefined) {
      state.answers["e" + t.dataset.einput] = t.value;
      save();
    }
  });
  // 回车即检查
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const t = e.target;
    if (t.dataset && t.dataset.item && t.tagName === "INPUT") {
      e.preventDefault();
      const rec = itemById(t.dataset.item);
      if (rec && rec.item.type !== "input2") checkItem(t.dataset.item);
      else if (rec) checkItem(t.dataset.item);
    } else if (t.dataset && t.dataset.einput !== undefined) {
      e.preventDefault();
      checkEnergy(Number(t.dataset.einput));
    }
  });

  // 顶栏工具
  $("#btnMapping").addEventListener("click", () => {
    const m = $("#mapping");
    m.hidden = !m.hidden;
    $("#btnMapping").classList.toggle("on", !m.hidden);
    if (!m.hidden) { ui.mapTab = "stage"; document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.mtab === "stage")); renderMapping(); }
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
  if (state.energyOk[7]) showFinale();
})();
