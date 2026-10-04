/* ══════════════════════════════════════════════════════════════════════
   §63 ChatModule —— 对话窗口「单例寄宿」模块
   设计（用户：打包封装成任何页面可调用可嵌套的模块，改一处 = 所有位置同步）：
   · 对话窗 #chatPane 全 App **只有一份 DOM**（图文/语音/视频/通话/角色/选项全部功能都随身）
   · attach(host)  = 把这一份整体搬进任意页面的插槽（嵌入态 .chat--embedded 自适应宽高）
   · detach()      = 搬回家（原位置），恢复常规右侧布局
   · 因为物理上只有一份，未来改对话窗 = 只改这一处 HTML/CSS/渲染，所有宿主页面自动同步
   · 任何接管型页面（wiki/model/hermes/finder/monitor）打开前必须 detach —— app.js 各
     setXxxView 顶部有一行钩子
   ══════════════════════════════════════════════════════════════════════ */
window.ChatModule = (() => {
  let home = null;      // { parent, next } 原位置
  let host = null;      // 当前宿主插槽元素
  const node = () => document.getElementById('chatPane');
  return {
    get attached() { return !!host; },
    get host() { return host; },
    /** 把对话窗挂进宿主插槽；重复 attach 同一宿主 = 幂等 */
    attach(el) {
      const chat = node();
      if (!chat || !el) return false;
      if (host === el) { chat.style.display = ''; return true; }
      if (!home) home = { parent: chat.parentNode, next: chat.nextSibling };
      el.appendChild(chat);                       // 搬家（自动从旧宿主摘下）
      chat.classList.add('chat--embedded');
      chat.style.display = '';                    // 接管型页面的 hide 列表可能刚隐藏过它
      host = el;
      if (typeof renderChat === 'function') renderChat();
      if (typeof renderChat2 === 'function') renderChat2();
      return true;
    },
    /** 搬回家；未 attach 时是无害 no-op */
    detach() {
      const chat = node();
      if (!chat || !host) return false;
      if (home && home.parent && home.parent.isConnected) {
        const ref = (home.next && home.next.parentNode === home.parent) ? home.next : null;
        home.parent.insertBefore(chat, ref);
      }
      chat.classList.remove('chat--embedded');
      chat.style.display = '';
      host = null;
      if (typeof renderChat === 'function') renderChat();
      if (typeof renderChat2 === 'function') renderChat2();
      return true;
    },
  };
})();
