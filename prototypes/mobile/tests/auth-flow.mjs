import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = "/opt/cursor/artifacts/xiaoli-prototype-batch2";
const chrome = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
const results = [];
const shots = [];
const forbidden = ["不会单独放行", "官方候选", "待验证", "不返回学校", "无公开接口", "人工兜底", "可执行白名单", "白名单", "bind_status", "is_student", "模拟：", "原型演示", "未调用短信", "选择路径", "未成年人保护还没定"];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(ok ? "OK" : "FAIL", name, detail);
}

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4" };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; }
      const filePath = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
      if (!filePath.startsWith(root)) { res.writeHead(403); res.end("forbidden"); return; }
      const target = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory() ? path.join(filePath, "index.html") : filePath;
      fs.readFile(target, (error, data) => {
        if (error) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function shot(page, name) {
  await page.waitForFunction(() => document.getElementById("toast").hidden, { timeout: 4000 }).catch(() => {});
  fs.mkdirSync(artifactDir, { recursive: true });
  const file = path.join(artifactDir, `${name}.png`);
  await page.$(".phone-screen").then((node) => node.screenshot({ path: file }));
  shots.push(file);
}

async function open(browser, base, search, viewport) {
  const page = await browser.newPage();
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    const host = new URL(url).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") external.push(url);
  });
  await page.setViewport(viewport);
  await page.goto(base + search, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#app[data-route]");
  return { page, errors, external };
}

const textOf = (page) => page.$eval("#app", (node) => node.innerText);
async function clickText(page, label) {
  const found = await page.evaluate((wanted) => {
    const node = [...document.querySelectorAll("button, summary, [data-preview]")].find((item) => item.textContent.includes(wanted));
    if (!node) return false;
    node.click();
    return true;
  }, label);
  if (!found) throw new Error(`找不到「${label}」`);
}
async function fill(page, field, value) {
  await page.$eval(`[data-field="${field}"]`, (node, next) => {
    node.value = next;
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
async function tabMetrics(page) {
  return page.evaluate(() => {
    const bar = document.querySelector(".tabbar");
    const scroll = document.getElementById("screen-scroll");
    if (!bar) return { present: false, scrollTop: scroll ? scroll.scrollTop : 0 };
    const box = bar.getBoundingClientRect();
    const button = bar.querySelector("button").getBoundingClientRect();
    const icon = bar.querySelector(".od-icon");
    return {
      present: true,
      barHeight: Math.round(box.height),
      buttonHeight: Math.round(button.height),
      icon: icon ? Math.round(icon.getBoundingClientRect().height) : 0,
      stroke: icon ? icon.getAttribute("stroke-width") : "",
      viewBox: icon ? icon.getAttribute("viewBox") : "",
      scrollTop: scroll.scrollTop
    };
  });
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const png = path.join(artifactDir, "tiny.png");
  fs.writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/index.html`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required"] });
  try {
    const desktop = { width: 1280, height: 1000 };
    const home = await open(browser, base, "?frame=390", desktop);
    await home.page.evaluate(() => localStorage.clear());
    await home.page.reload({ waitUntil: "domcontentloaded" });
    record("打开时没有脚本错误", home.errors.length === 0, home.errors.join(" | "));
    record("资源都在本地", home.external.length === 0, home.external.join(" | "));
    const brand = await home.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--brand").trim());
    record("主题色是已调整的灰蓝", brand.toLowerCase() === "#4b6cb7", brand);

    const routes = await home.page.evaluate(() => Object.keys(window.__xiaoli.routes));
    record("路由数量", routes.length >= 40, String(routes.length));
    let rendered = 0;
    const leaks = [];
    for (const route of routes) {
      await home.page.goto(`${base}?frame=390&preset=open_member&route=${route}`, { waitUntil: "domcontentloaded" });
      const info = await home.page.evaluate((banned) => {
        const app = document.querySelector("#app");
        const scroll = document.getElementById("screen-scroll");
        const text = app.innerText;
        const box = scroll.getBoundingClientRect();
        const head = scroll.querySelector("h1, h2, .splash-brand, .auth-page");
        return {
          unavailable: text.includes("页面暂不可用"),
          leaks: banned.filter((item) => text.includes(item)),
          scrollTop: scroll ? scroll.scrollTop : 0,
          clipped: head ? head.getBoundingClientRect().top < box.top - 1 : false,
          overflow: scroll ? scroll.scrollWidth - scroll.clientWidth : 0
        };
      }, forbidden);
      if (!info.unavailable && info.leaks.length === 0 && info.overflow <= 2 && !info.clipped) rendered += 1;
      else leaks.push(`${route}:${JSON.stringify(info)}`);
    }
    record("全部路由可渲染且没有内部文案和顶栏裁切", rendered === routes.length, leaks.slice(0, 6).join(" || ") || `${rendered}/${routes.length}`);

    await home.page.goto(`${base}?frame=390&preset=student_only&route=campus`, { waitUntil: "domcontentloaded" });
    const gateBar = await tabMetrics(home.page);
    const gateText = await textOf(home.page);
    record("未确认学校时不放行本校且没有底栏", gateText.includes("学校尚未确认") && !gateText.includes("图书馆周末有哪些安静座位") && gateBar.present === false, JSON.stringify(gateBar));
    await shot(home.page, "390-school-unconfirmed");

    await clickText(home.page, "去学生认证");
    await home.page.goto(`${base}?frame=390`, { waitUntil: "domcontentloaded" });
    await home.page.evaluate(() => localStorage.clear());
    await home.page.reload({ waitUntil: "domcontentloaded" });
    record("欢迎页是给学生看的", (await textOf(home.page)).includes("在校学生的校园社区"));
    await shot(home.page, "390-welcome");
    await clickText(home.page, "登录");
    await fill(home.page, "phone", "13800138000");
    await fill(home.page, "code", "123456");
    await home.page.click("[data-field=agreed]");
    await clickText(home.page, "登录并进入认证");
    await shot(home.page, "390-auth-center");
    await clickText(home.page, "选择认证方式");
    const guide = await textOf(home.page);
    record("认证方式只有名称和短提示", guide.includes("微信学生认证") && guide.includes("人工审核") && !guide.includes("不会单独放行"));
    const guideClip = await home.page.evaluate(() => {
      const scroll = document.getElementById("screen-scroll");
      const title = scroll.querySelector("h1");
      return { scrollTop: scroll.scrollTop, titleTop: Math.round(title.getBoundingClientRect().top), scrollTopEdge: Math.round(scroll.getBoundingClientRect().top) };
    });
    record("认证方式页从顶部开始且标题没被裁切", guideClip.scrollTop === 0 && guideClip.titleTop >= guideClip.scrollTopEdge, JSON.stringify(guideClip));
    await shot(home.page, "390-auth-methods");
    await clickText(home.page, "微信学生认证");
    await clickText(home.page, "完成认证");
    const passed = await textOf(home.page);
    record("一种方式可以同时通过学生和学校", passed.includes("可以进入校园") && passed.includes("已确认"));
    await shot(home.page, "390-auth-success");
    await clickText(home.page, "进入校园");
    const campus = await textOf(home.page);
    record("进入校园后能看到笔记、多图和视频", campus.includes("图书馆周末有哪些安静座位") && campus.includes("校园交换书单") && campus.includes("20 秒校园采访片段"));
    let bar = await tabMetrics(home.page);
    record("本校页底栏高度稳定", bar.present && bar.barHeight <= 84 && bar.barHeight >= 56 && bar.buttonHeight <= 56 && bar.icon === 24 && bar.stroke === "2", JSON.stringify(bar));
    await shot(home.page, "390-campus-tabbar");
    await home.page.evaluate(() => { document.getElementById("screen-scroll").scrollTop = 240; });
    const afterScroll = await tabMetrics(home.page);
    record("滚动后底栏高度不变", afterScroll.barHeight === bar.barHeight, JSON.stringify(afterScroll));

    await home.page.evaluate(() => window.__xiaoli.go("postDetail"));
    await home.page.evaluate(() => { window.__xiaoli.state.selectedPostKey = "林同学|图书馆周末有哪些安静座位"; window.__xiaoli.render(); });
    const detail = await textOf(home.page);
    record("笔记详情有引用和列表", detail.includes("周六晚上十点闭馆") && detail.includes("带校园卡"), detail.slice(0, 180));
    await shot(home.page, "390-note-detail");
    await home.page.evaluate(() => { window.__xiaoli.state.selectedPostKey = "林同学|校园交换书单"; window.__xiaoli.go("postDetail"); });
    const gallery = await home.page.$$eval(".gallery img", (nodes) => nodes.map((node) => node.getAttribute("src")));
    record("多图详情使用本地图片", gallery.length === 3 && gallery.every((src) => src.startsWith("assets/")), gallery.join(","));
    await shot(home.page, "390-gallery");

    await home.page.evaluate(() => window.__xiaoli.go("videoDetail"));
    const video = await home.page.$eval("#campus-video", (node) => ({ src: node.getAttribute("src"), poster: node.getAttribute("poster") }));
    record("视频使用本地文件和原控件", video.src.includes("campus-life-20s.mp4") && video.poster.includes("campus-life-poster.jpg"));
    await home.page.click("[data-action=native-video]");
    await home.page.waitForFunction(() => {
      const node = document.querySelector("#campus-video");
      return node && (node.currentTime > 0 || !node.paused);
    }, { timeout: 4000 }).catch(() => {});
    const played = await home.page.evaluate(() => {
      const node = document.querySelector("#campus-video");
      return { paused: node.paused, time: node.currentTime };
    });
    record("视频可以播放", played.time > 0 || played.paused === false, JSON.stringify(played));
    await shot(home.page, "390-video");

    await home.page.evaluate(() => window.__xiaoli.go("create"));
    await clickText(home.page, "图文或纯文字");
    await fill(home.page, "draftTitle", "晚风笔记<script>");
    await fill(home.page, "draft", "操场边很安静。\n> 记得带水。\n- 东门出发");
    await clickText(home.page, "示例图片");
    await clickText(home.page, "下一步");
    const scopeText = await textOf(home.page);
    record("发布范围默认本校且不是互联网公开", scopeText.includes("仅本校") && scopeText.includes("不会互联网公开"), scopeText.slice(0, 180));
    await shot(home.page, "390-publish-scope");
    await clickText(home.page, "确认发布");
    await home.page.click("#dialog-confirm");
    await home.page.waitForFunction(() => document.body.innerText.includes("刷新状态"), { timeout: 5000 });
    await clickText(home.page, "刷新状态");
    await clickText(home.page, "刷新审核结果");
    record("发布成功", (await textOf(home.page)).includes("作品已发布"));
    await clickText(home.page, "查看作品");
    const own = await textOf(home.page);
    record("详情按安全格式显示引用和列表", own.includes("记得带水") && own.includes("东门出发") && !(await home.page.$(".rich script")));
    await shot(home.page, "390-published-detail");
    const before = await home.page.$eval("[data-action=like] span", (node) => node.textContent);
    await home.page.click("[data-action=like]");
    const liked = await home.page.$eval("[data-action=like]", (node) => ({ pressed: node.getAttribute("aria-pressed"), count: node.querySelector("span").textContent }));
    await home.page.click("[data-action=like]");
    const unliked = await home.page.$eval("[data-action=like] span", (node) => node.textContent);
    record("点赞和取消会改数量", liked.pressed === "true" && Number(liked.count) === Number(before) + 1 && unliked === before, `${before} -> ${liked.count} -> ${unliked}`);
    await home.page.click("[data-action=like]");
    await home.page.click("[data-action=save]");
    await home.page.evaluate(() => window.__xiaoli.go("myFavorites"));
    record("收藏会出现在我的收藏", (await textOf(home.page)).includes("晚风笔记"));
    await home.page.evaluate(() => window.__xiaoli.go("myWorks"));
    record("发布后能在我的作品里看到", (await textOf(home.page)).includes("晚风笔记"));
    await shot(home.page, "390-my-works");
    await home.page.evaluate(() => window.__xiaoli.go("comments"));
    await fill(home.page, "commentDraft", "我也觉得安静");
    await home.page.click("[data-action=send-comment]");
    await home.page.waitForFunction(() => document.body.innerText.includes("我也觉得安静"));
    record("评论会写进当前作品", (await textOf(home.page)).includes("我也觉得安静"));
    await shot(home.page, "390-comment");

    await home.page.click("[data-preview=reset]");
    await home.page.evaluate(() => window.__xiaoli.go("myWorks"));
    record("重置后本机发布被清掉", !(await textOf(home.page)).includes("晚风笔记"));

    await home.page.goto(`${base}?frame=390&preset=open_member&route=editorPost`, { waitUntil: "domcontentloaded" });
    const input = await home.page.$("#pick-images");
    await input.uploadFile(png);
    await home.page.waitForFunction(() => window.__xiaoli.state.editorImages.some((item) => String(item.src).startsWith("data:image")));
    record("本地图片可以选择并预览", true);

    for (const width of [360, 390, 430]) {
      const framed = await open(browser, base, `?frame=${width}&preset=open_member&route=campus`, { width: 1280, height: 1100 });
      const metrics = await tabMetrics(framed.page);
      const overflow = await framed.page.evaluate(() => {
        const scroll = document.getElementById("screen-scroll");
        return scroll.scrollWidth - scroll.clientWidth;
      });
      record(`${width} 宽底栏不膨胀且无横向溢出`, metrics.present && metrics.barHeight <= 84 && metrics.buttonHeight <= 56 && overflow <= 2, JSON.stringify({ ...metrics, overflow }));
      await shot(framed.page, `${width}-campus`);
      await framed.page.close();
      const short = await open(browser, base, `?preset=open_member&route=campus`, { width, height: 700 });
      const shortBar = await tabMetrics(short.page);
      record(`${width}x700 底栏仍然紧凑`, shortBar.present && shortBar.barHeight <= 84, JSON.stringify(shortBar));
      await short.page.close();
    }

    await home.page.goto(`${base}?frame=390&preset=open_member&route=messages`, { waitUntil: "domcontentloaded" });
    await shot(home.page, "390-messages");
    await home.page.goto(`${base}?frame=390&preset=open_member&route=mine`, { waitUntil: "domcontentloaded" });
    await shot(home.page, "390-mine");
    await home.page.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  const failed = results.filter((item) => !item.ok);
  const summary = { ranAt: new Date().toISOString(), total: results.length, failed: failed.length, results, screenshots: shots };
  fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
  fs.writeFileSync(path.join(root, "test-results", "results.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(artifactDir, "results.json"), JSON.stringify(summary, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
