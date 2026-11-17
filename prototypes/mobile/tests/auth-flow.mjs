import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = "/opt/cursor/artifacts/xiaoli-prototype-batch1";
const chrome = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
const widths = [360, 390, 430];
const results = [];
const shots = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) console.error("FAIL", name, detail);
  else console.log("OK", name);
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml"
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }
      const filePath = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      const target = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory() ? path.join(filePath, "index.html") : filePath;
      fs.readFile(target, (error, data) => {
        if (error) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        res.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream" });
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
  const screen = await page.$(".phone-screen");
  await screen.screenshot({ path: file });
  shots.push(file);
  return file;
}

async function open(browser, base, search, viewport) {
  const page = await browser.newPage();
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (text.includes("favicon.ico")) return;
      errors.push(text);
    });
    page.on("response", (response) => {
      const url = response.url();
      if (response.status() >= 400 && !url.endsWith("/favicon.ico")) errors.push(`${response.status()} ${url}`);
    });
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    const host = new URL(url).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") external.push(url);
  });
  await page.setViewport(viewport);
  await page.goto(base + search, { waitUntil: "networkidle0" });
  await page.waitForSelector("#app[data-route]");
  return { page, errors, external };
}

async function bodyText(page) {
  return page.$eval("#app", (node) => node.innerText);
}

async function clickText(page, label) {
  const found = await page.evaluate((wanted) => {
    const node = [...document.querySelectorAll("button, summary")].find((item) => item.textContent.includes(wanted));
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
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function stateOf(page) {
  return page.evaluate(() => {
    const state = window.__xiaoli.state;
    return {
      route: state.route,
      studentMark: state.studentMark,
      schoolMatch: state.schoolMatch,
      schoolId: state.schoolId,
      qualification: state.qualification,
      loggedIn: state.loggedIn,
      qr: state.qr && { status: state.qr.status, id: state.qr.id, consumed: state.qr.consumed },
      serverQr: state.server && state.server.qr && { status: state.server.qr.status, consumed: state.server.qr.consumed },
      serverStudent: state.server && state.server.studentMark
    };
  });
}

async function overflow(page) {
  return page.evaluate(() => {
    const screen = document.querySelector(".phone-screen");
    const nodes = [...document.querySelectorAll("#screen-scroll, .auth-page, .splash-page")].map((node) => ({
      id: node.id || node.className.slice(0, 48),
      delta: node.scrollWidth - node.clientWidth
    }));
    return { screen: screen.scrollWidth - screen.clientWidth, page: Math.max(0, ...nodes.map((item) => item.delta)), nodes, width: Math.round(screen.getBoundingClientRect().width) };
  });
}

async function login(page) {
  await clickText(page, "登录");
  if ((await page.$eval("#app", (node) => node.dataset.route)) !== "login") throw new Error("没有进入登录");
  await fill(page, "phone", "13800138000");
  await fill(page, "code", "123456");
  await page.click("[data-field=agreed]");
  await clickText(page, "登录并进入认证");
  await page.waitForSelector("[data-auth-screen=auth]");
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/index.html`;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required"]
  });
  try {
    const desktop = { width: 1280, height: 1000 };
    const home = await open(browser, base, "?frame=390", desktop);
    record("无页面错误", home.errors.length === 0, home.errors.join(" | "));
    record("无外部认证请求", home.external.length === 0, home.external.join(" | "));
    let text = await bodyText(home.page);
    record("欢迎页说明资格", text.includes("校哩") && text.includes("是不是学生") && text.includes("是不是这所学校的学生"), text.slice(0, 180));
    record("欢迎页不再把注册放在主按钮", !text.includes("登录 / 注册") && !text.includes("其他方式登录"));
    await shot(home.page, "390-welcome");

    await clickText(home.page, "认证与帮助");
    text = await bodyText(home.page);
    record("帮助可从欢迎页进入", text.includes("如何完成学生认证") && text.includes("演示 / 待验证"), text.slice(0, 240));
    await home.page.click("[aria-label=返回]");
    record("帮助返回欢迎页", (await home.page.$eval("#app", (node) => node.dataset.route)) === "welcome");

    await login(home.page);
    text = await bodyText(home.page);
    record("登录后进入认证而不是校园", text.includes("学生身份") && text.includes("学校归属") && text.includes("未开始"));
    record("登录页没有密码和第三方入口", !(await bodyText(home.page)).includes("设置密码"));
    await shot(home.page, "390-auth-home");
    const loginPage = await open(browser, base, "?frame=390", desktop);
    await clickText(loginPage.page, "登录");
    const loginText = await bodyText(loginPage.page);
    record("登录文案写明仍需认证且未接短信", loginText.includes("登录后仍需学生认证") && loginText.includes("未接入短信") && loginText.includes("不设 18 岁门槛"));
    const loginButtons = await loginPage.page.$$eval("button", (nodes) => nodes.map((node) => node.innerText));
    record("登录没有密码框和第三方按钮", (await loginPage.page.$$("input[type=password]")).length === 0 && !loginButtons.some((label) => /微信|QQ|支付宝|其他方式登录|注册账号/.test(label)), loginButtons.join(" | "));
    await clickText(loginPage.page, "查看协议与隐私说明");
    record("协议是示意正文", (await bodyText(loginPage.page)).includes("不是已经生效的用户协议"));
    await shot(loginPage.page, "390-agreements");
    await clickText(loginPage.page, "同意并返回");
    record("同意后回到登录并保留勾选", (await loginPage.page.$eval("#app", (node) => node.dataset.route)) === "login" && await loginPage.page.$eval("[data-field=agreed]", (node) => node.checked));
    await loginPage.page.close();

    await clickText(home.page, "选择认证路径");
    text = await bodyText(home.page);
    for (const label of ["微信学生身份快速验证", "支付宝学生 / 校园身份", "掌上大学", "扫码认证小程序", "人工兜底"]) {
      record(`路径可见：${label}`, text.includes(label) && text.includes("演示 / 待验证"));
    }
    await shot(home.page, "390-auth-guide");

    await clickText(home.page, "微信学生身份快速验证");
    text = await bodyText(home.page);
    record("微信路径标明不返回学校且不调用接口", text.includes("不返回学校") && text.includes("不调用微信接口"));
    await clickText(home.page, "模拟：审核中");
    record("审核中不会放行", (await bodyText(home.page)).includes("审核中") && (await stateOf(home.page)).studentMark === "reviewing");
    await shot(home.page, "390-reviewing");
    await clickText(home.page, "返回认证");
    await clickText(home.page, "选择认证路径");
    await clickText(home.page, "微信学生身份快速验证");
    await clickText(home.page, "模拟：需要补充");
    record("需补充可回到路径", (await bodyText(home.page)).includes("需要补充"));
    await clickText(home.page, "重新选择路径");
    await clickText(home.page, "支付宝学生 / 校园身份");
    await clickText(home.page, "模拟：未通过，可重试");
    record("拒绝后可以重试", (await bodyText(home.page)).includes("未通过，可以重试"));
    await clickText(home.page, "重新选择路径");
    await clickText(home.page, "掌上大学");
    record("掌上大学保持未知", (await bodyText(home.page)).includes("未知") && (await bodyText(home.page)).includes("不是已选定供应商"));
    await clickText(home.page, "模拟：已毕业 / 结业，不默认通过");
    record("毕业不默认通过", (await stateOf(home.page)).studentMark === "graduate_blocked" && (await bodyText(home.page)).includes("不默认通过"));
    await shot(home.page, "390-graduate");
    await home.page.close();

    const qrFlow = await open(browser, base, "?frame=390", desktop);
    await login(qrFlow.page);
    await clickText(qrFlow.page, "选择认证路径");
    await clickText(qrFlow.page, "扫码认证小程序");
    await clickText(qrFlow.page, "生成短时演示会话");
    text = await bodyText(qrFlow.page);
    record("演示码明确不可当微信码", text.includes("演示码 / 占位") && text.includes("不是微信小程序码"), text.slice(0, 240));
    await shot(qrFlow.page, "390-qr-created");
    const beforeScan = await stateOf(qrFlow.page);
    await clickText(qrFlow.page, "模拟对方扫码（不绑定）");
    const afterScan = await stateOf(qrFlow.page);
    record("首次扫码不改账号", beforeScan.studentMark === "none" && afterScan.studentMark === "none" && afterScan.serverQr.status === "scanned" && afterScan.serverStudent === "none");
    await clickText(qrFlow.page, "从演示后台刷新");
    record("刷新后仍是待确认", (await bodyText(qrFlow.page)).includes("已扫码待确认") && (await stateOf(qrFlow.page)).studentMark === "none");
    await shot(qrFlow.page, "390-qr-scanned");
    await clickText(qrFlow.page, "模拟微信侧确认");
    await clickText(qrFlow.page, "从演示后台刷新");
    record("只完成一侧确认时不写学生标记", (await bodyText(qrFlow.page)).includes("等待 App") && (await stateOf(qrFlow.page)).studentMark === "none");
    await clickText(qrFlow.page, "模拟 App 内再次确认");
    record("刷新前界面不提前改标记", (await stateOf(qrFlow.page)).studentMark === "none" && (await stateOf(qrFlow.page)).serverStudent === "confirmed");
    await clickText(qrFlow.page, "从演示后台刷新");
    const snapshot = await stateOf(qrFlow.page);
    text = await bodyText(qrFlow.page);
    record("双方确认并刷新后只确认学生", snapshot.studentMark === "confirmed" && snapshot.schoolMatch === "unconfirmed" && text.includes("未确认"));
    await shot(qrFlow.page, "390-qr-confirmed");
    await clickText(qrFlow.page, "重放已消费凭证");
    record("消费后的凭证不能再改状态", (await stateOf(qrFlow.page)).qr.consumed === true && (await stateOf(qrFlow.page)).studentMark === "confirmed");
    await clickText(qrFlow.page, "重新生成");
    await clickText(qrFlow.page, "模拟过期");
    await clickText(qrFlow.page, "从演示后台刷新");
    record("过期后要重新生成", (await bodyText(qrFlow.page)).includes("已过期"));
    await clickText(qrFlow.page, "模拟对方扫码（不绑定）");
    record("过期会话不能继续扫码绑定", (await stateOf(qrFlow.page)).serverQr.status === "expired");
    await clickText(qrFlow.page, "重新生成");
    await clickText(qrFlow.page, "取消会话");
    await clickText(qrFlow.page, "从演示后台刷新");
    record("取消会话不绑定", (await bodyText(qrFlow.page)).includes("已取消") && (await stateOf(qrFlow.page)).schoolMatch === "unconfirmed");
    await clickText(qrFlow.page, "重新生成");
    await clickText(qrFlow.page, "模拟对方扫码（不绑定）");
    await clickText(qrFlow.page, "模拟他人扫到后拒绝");
    await clickText(qrFlow.page, "从演示后台刷新");
    record("他人拒绝不会绑定学校", (await bodyText(qrFlow.page)).includes("已取消") && (await stateOf(qrFlow.page)).schoolMatch === "unconfirmed" && (await stateOf(qrFlow.page)).serverQr.status === "cancelled");
    await qrFlow.page.close();

    const manual = await open(browser, base, "?frame=390", desktop);
    await login(manual.page);
    await clickText(manual.page, "选择认证路径");
    await clickText(manual.page, "人工兜底");
    text = await bodyText(manual.page);
    record("人工兜底不采集证件", text.includes("没有身份证号、人脸或学信网密码") && (await manual.page.$$("input")).length === 0);
    await clickText(manual.page, "毕业 / 结业 / 肄业");
    await clickText(manual.page, "南川大学");
    await clickText(manual.page, "模拟：人工确认学校匹配");
    record("毕业材料不能匹配放行", (await stateOf(manual.page)).studentMark === "graduate_blocked");
    await clickText(manual.page, "返回认证");
    await clickText(manual.page, "选择认证路径");
    await clickText(manual.page, "人工兜底");
    await clickText(manual.page, "官方材料说明");
    await clickText(manual.page, "北屿理工大学");
    await clickText(manual.page, "模拟：人工确认学校匹配");
    await clickText(manual.page, "查看当前权限");
    text = await bodyText(manual.page);
    record("筹备学校不能进本校信息流", text.includes("学校筹备中") && !text.includes("图书馆周末有哪些安静座位"));
    await shot(manual.page, "390-school-preparing");
    await clickText(manual.page, "浏览全站已认证学生可见");
    record("筹备学校仍可看全站已认证内容", (await bodyText(manual.page)).includes("机器人社开放体验"));
    await manual.page.evaluate(() => window.__xiaoli.go("authManual"));
    await clickText(manual.page, "澄江学院");
    await clickText(manual.page, "模拟：人工确认学校匹配");
    await clickText(manual.page, "查看当前权限");
    record("未开通学校不可发布", (await bodyText(manual.page)).includes("学校未开通"));
    await clickText(manual.page, "发布");
    record("发布入口被本校权限挡住", (await bodyText(manual.page)).includes("都不能发到本校"));
    await manual.page.evaluate(() => window.__xiaoli.go("authManual"));
    await clickText(manual.page, "望湖大学");
    await clickText(manual.page, "模拟：人工确认学校匹配");
    await clickText(manual.page, "查看当前权限");
    const pausedText = await bodyText(manual.page);
    record("暂停学校没有本校信息流", pausedText.includes("学校已暂停") && !pausedText.includes("图书馆周末有哪些安静座位"));
    await shot(manual.page, "390-school-paused");
    await manual.page.close();

    const member = await open(browser, base, "?frame=390", desktop);
    await login(member.page);
    await clickText(member.page, "选择认证路径");
    await clickText(member.page, "人工兜底");
    await clickText(member.page, "官方材料说明");
    await clickText(member.page, "南川大学");
    await clickText(member.page, "模拟：人工确认学校匹配");
    await clickText(member.page, "进入校园");
    text = await bodyText(member.page);
    record("本校开放后原校园流还在", text.includes("校园生活") && text.includes("图书馆周末有哪些安静座位") && text.includes("20 秒校园采访片段"));
    await shot(member.page, "390-campus-open");
    await clickText(member.page, "广场");
    record("广场仍在且不是互联网公开", (await bodyText(member.page)).includes("不是互联网公开") && (await bodyText(member.page)).includes("精选"));
    await shot(member.page, "390-plaza");
    await clickText(member.page, "发布");
    record("发布说明还在", (await bodyText(member.page)).includes("新作品默认仅本校可见"));
    await member.page.evaluate(() => window.__xiaoli.go("publishOptions"));
    record("可见范围写成全站已认证学生", (await bodyText(member.page)).includes("全站已认证学生") && (await bodyText(member.page)).includes("作品不会互联网公开"));
    await member.page.evaluate(() => window.__xiaoli.go("messages"));
    text = await bodyText(member.page);
    record("消息主路径还在且没有群聊", text.includes("赞和收藏") && text.includes("阿澈") && !text.includes("群聊") && !text.includes("钱包"));
    await shot(member.page, "390-messages");
    await clickText(member.page, "我的");
    record("我的页保留作品入口", (await bodyText(member.page)).includes("林同学") && (await bodyText(member.page)).includes("学生与学校分开显示"));
    await shot(member.page, "390-mine");
    await member.page.evaluate(() => window.__xiaoli.go("videoDetail"));
    const video = await member.page.$eval("#campus-video", (node) => ({ src: node.getAttribute("src"), poster: node.getAttribute("poster") }));
    record("视频仍用本地文件和原控件", video.src === "assets/video/campus-life-20s.mp4" && video.poster === "assets/video/campus-life-poster.jpg" && (await member.page.$$("[data-action=native-video]")).length > 0);
    await shot(member.page, "390-video");
    await member.page.click("[data-action=native-video]");
    await member.page.waitForFunction(() => {
      const node = document.querySelector("#campus-video");
      return node && (!node.paused || node.currentTime > 0 || document.querySelector("[data-video-error]:not([hidden])"));
    }, { timeout: 4000 }).catch(() => {});
    const videoState = await member.page.evaluate(() => {
      const node = document.querySelector("#campus-video");
      const error = document.querySelector("[data-video-error]");
      return { paused: node.paused, time: node.currentTime, errorHidden: error ? error.hidden : true };
    });
    record("视频可以开始播放", videoState.errorHidden && (!videoState.paused || videoState.time > 0), JSON.stringify(videoState));
    await member.page.evaluate(() => window.__xiaoli.go("renewal"));
    await clickText(member.page, "模拟：资格失效");
    await clickText(member.page, "查看当前权限");
    record("资格失效后失去本校权限", (await bodyText(member.page)).includes("资格已失效") && !(await bodyText(member.page)).includes("图书馆周末有哪些安静座位"));
    await shot(member.page, "390-expired");
    await member.page.evaluate(() => window.__xiaoli.go("renewal"));
    await clickText(member.page, "模拟：进入续验，旧资格先保留");
    await clickText(member.page, "查看当前权限");
    record("续验处理中旧资格仍可进校园", (await bodyText(member.page)).includes("图书馆周末有哪些安静座位"));
    await member.page.close();

    const only = await open(browser, base, "?frame=390&preset=student_only&route=campus", desktop);
    text = await bodyText(only.page);
    record("学生已确认但学校未确认没有本校内容", text.includes("学生已确认，学校未确认") && !text.includes("图书馆周末有哪些安静座位"));
    await clickText(only.page, "消息");
    record("学校未确认不开放新私信", (await bodyText(only.page)).includes("新的私信不在这个状态开放") && (await bodyText(only.page)).includes("未成年人保护还没定"));
    await shot(only.page, "390-student-only");
    await only.page.evaluate(() => window.__xiaoli.go("schoolCatalog"));
    text = await bodyText(only.page);
    record("学校配置多于两所且不写死四川名单", ["南川大学", "北屿理工大学", "澄江学院", "望湖大学", "四川", "不能在逻辑里写死"].every((item) => text.includes(item)));
    await shot(only.page, "390-school-catalog");
    record("目录页没有把浏览者改成该校学生", (await stateOf(only.page)).schoolMatch === "unconfirmed");
    await only.page.close();

    for (const width of widths) {
      const framed = await open(browser, base, `?frame=${width}&preset=open_member&route=campus`, { width: 1280, height: 1100 });
      const box = await overflow(framed.page);
      record(`${width} 宽手机框没有横向溢出`, box.page <= 2 && box.screen <= 2, JSON.stringify(box));
      await shot(framed.page, `${width}-campus-frame`);
      await framed.page.evaluate(() => window.__xiaoli.go("authGuide"));
      const guideBox = await overflow(framed.page);
      record(`${width} 宽认证路径没有横向溢出`, guideBox.page <= 2, JSON.stringify(guideBox));
      await shot(framed.page, `${width}-guide-frame`);
      await framed.page.close();

      const narrow = await open(browser, base, `?preset=student_only&route=authQr`, { width, height: 900 });
      await clickText(narrow.page, "生成短时演示会话");
      const narrowBox = await overflow(narrow.page);
      record(`${width} 视口扫码页没有横向溢出`, narrowBox.screen <= 2 && narrowBox.page <= 2, JSON.stringify(narrowBox));
      await shot(narrow.page, `${width}-qr-viewport`);
      await narrow.page.close();
    }

    const direct = await open(browser, base, "?preset=open_member&route=messages", desktop);
    record("直接打开消息不退化", (await bodyText(direct.page)).includes("评论和@"));
    await direct.page.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const failed = results.filter((item) => !item.ok);
  const summary = {
    ranAt: new Date().toISOString(),
    chrome,
    total: results.length,
    failed: failed.length,
    results,
    screenshots: shots
  };
  fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
  fs.writeFileSync(path.join(root, "test-results", "results.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(artifactDir, "results.json"), JSON.stringify(summary, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
