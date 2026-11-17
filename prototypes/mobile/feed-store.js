/* 本地预览内容：不上传，不保存手机号或证件。 */
(function (global) {
  const KEY = "xiaoli-preview-v1";

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  function parseBlocks(text) {
    const blocks = [];
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    let list = null;
    const pushList = () => {
      if (list && list.items.length) blocks.push(list);
      list = null;
    };
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        pushList();
        return;
      }
      if (trimmed.startsWith("> ")) {
        pushList();
        blocks.push({ type: "quote", text: trimmed.slice(2) });
        return;
      }
      if (trimmed.startsWith("- ")) {
        if (!list) list = { type: "list", items: [] };
        list.items.push(trimmed.slice(2));
        return;
      }
      pushList();
      blocks.push({ type: "p", text: trimmed });
    });
    pushList();
    return blocks;
  }

  function renderBlocks(blocks) {
    if (!blocks || !blocks.length) return "";
    return `<div class="rich">${blocks.map((block) => {
      if (block.type === "quote") return `<blockquote>${esc(block.text)}</blockquote>`;
      if (block.type === "list") return `<ul>${(block.items || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
      if (block.type === "h") return `<h2>${esc(block.text)}</h2>`;
      return `<p>${esc(block.text)}</p>`;
    }).join("")}</div>`;
  }

  function enrich(post) {
    if (post.blocks) return post;
    if (post.title === "图书馆周末有哪些安静座位") {
      post.blocks = [
        { type: "p", text: "三楼东侧下午比较安静，靠窗的位置要早一点去。" },
        { type: "quote", text: "插座在靠窗那一排，周六晚上十点闭馆。" },
        { type: "list", items: ["带校园卡", "下午四点前更稳妥", "不想晒太阳可以去北侧"] }
      ];
    }
    if (post.title === "校园交换书单") {
      post.images = [
        { src: "assets/stock/book-exchange.jpg", alt: "桌上的书本" },
        { src: "assets/stock/library-study.jpg", alt: "图书馆自习区" },
        { src: "assets/stock/campus-building.jpg", alt: "校园庭院" }
      ];
      post.image = post.images[0].src;
      post.blocks = [
        { type: "p", text: "整理了最近读完的三本书，想和同学交换阅读。" },
        { type: "list", items: ["《看不见的城市》", "一本校园建筑笔记", "线性代数习题"] }
      ];
    }
    return post;
  }

  function loadInto(state) {
    state.published = state.published || [];
    state.threads = state.threads || {};
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!saved) return;
      state.published = Array.isArray(saved.published) ? saved.published : [];
      state.postReactions = saved.postReactions || {};
      state.threads = saved.threads || {};
    } catch (error) {
      state.published = [];
    }
  }

  function save(state) {
    const published = (state.published || []).map((post) => {
      const copy = { ...post };
      if (Array.isArray(copy.images)) {
        copy.images = copy.images.map((image) => ({ ...image, src: String(image.src || "").slice(0, 1500000) }));
      }
      return copy;
    });
    localStorage.setItem(KEY, JSON.stringify({
      published,
      postReactions: state.postReactions || {},
      threads: state.threads || {}
    }));
  }

  function reset(state) {
    localStorage.removeItem(KEY);
    state.published = [];
    state.postReactions = {};
    state.threads = {};
    state.createdComments = [];
  }

  function merge(base, state) {
    const extras = state.published || [];
    return extras.concat(base).map(enrich);
  }

  function article(post) {
    const blocks = post.blocks && post.blocks.length ? post.blocks : parseBlocks(post.copy || "");
    const gallery = post.images && post.images.length > 1
      ? `<div class="gallery">${post.images.map((image) => `<img src="${esc(image.src)}" alt="${esc(image.alt || post.title)}">`).join("")}</div>`
      : "";
    return `${gallery}${renderBlocks(blocks)}`;
  }

  global.XiaoliFeed = { esc, parseBlocks, renderBlocks, loadInto, save, reset, merge, article, enrich };
})(window);
