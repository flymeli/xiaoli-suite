/* 校哩原型第一批：认证与学校状态。只模拟本地状态，不请求微信、支付宝、学信网或短信。 */
(function (global) {
  const SCHOOLS = [
    { id: "sch-nanchuan", name: "南川大学", phase: "open" },
    { id: "sch-beiyu", name: "北屿理工大学", phase: "preparing" },
    { id: "sch-chengjiang", name: "澄江学院", phase: "closed" },
    { id: "sch-wanghu", name: "望湖大学", phase: "paused" }
  ];

  const PRESETS = {
    none: { loggedIn: false, studentMark: "none", schoolMatch: "unconfirmed", schoolId: "", qualification: "none", authPath: "", material: "" },
    reviewing: { loggedIn: true, studentMark: "reviewing", schoolMatch: "unconfirmed", schoolId: "", qualification: "none", authPath: "wechat", material: "" },
    supplement: { loggedIn: true, studentMark: "supplement", schoolMatch: "unconfirmed", schoolId: "", qualification: "none", authPath: "manual", material: "other" },
    rejected: { loggedIn: true, studentMark: "rejected", schoolMatch: "unconfirmed", schoolId: "", qualification: "none", authPath: "wechat", material: "" },
    student_only: { loggedIn: true, studentMark: "confirmed", schoolMatch: "unconfirmed", schoolId: "", qualification: "active", authPath: "wechat", material: "" },
    preparing: { loggedIn: true, studentMark: "confirmed", schoolMatch: "confirmed", schoolId: "sch-beiyu", qualification: "active", authPath: "manual", material: "report_note" },
    not_open: { loggedIn: true, studentMark: "confirmed", schoolMatch: "confirmed", schoolId: "sch-chengjiang", qualification: "active", authPath: "manual", material: "report_note" },
    paused: { loggedIn: true, studentMark: "confirmed", schoolMatch: "confirmed", schoolId: "sch-wanghu", qualification: "active", authPath: "manual", material: "report_note" },
    open_member: { loggedIn: true, studentMark: "confirmed", schoolMatch: "confirmed", schoolId: "sch-nanchuan", qualification: "active", authPath: "manual", material: "report_note" },
    expired: { loggedIn: true, studentMark: "confirmed", schoolMatch: "confirmed", schoolId: "sch-nanchuan", qualification: "expired", authPath: "manual", material: "report_note" },
    renewing: { loggedIn: true, studentMark: "confirmed", schoolMatch: "confirmed", schoolId: "sch-nanchuan", qualification: "renewing", authPath: "manual", material: "report_note" },
    graduate_blocked: { loggedIn: true, studentMark: "graduate_blocked", schoolMatch: "unconfirmed", schoolId: "", qualification: "none", authPath: "wechat", material: "graduate" }
  };

  const PATHS = {
    wechat: { title: "微信学生认证", hint: "使用微信确认你的学生身份。" },
    alipay: { title: "支付宝学生认证", hint: "使用支付宝确认你的学生身份。" },
    zsdx: { title: "掌上大学", hint: "使用掌上大学确认你的学生身份。" }
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  function schoolById(id) {
    return SCHOOLS.find((item) => item.id === id) || null;
  }

  function phaseOf(state) {
    if (state.schoolMatch !== "confirmed") return "unconfirmed";
    const school = schoolById(state.schoolId);
    return school ? school.phase : "unconfirmed";
  }

  function allowSchoolFeed(state) {
    return state.studentMark === "confirmed" && state.schoolMatch === "confirmed" && phaseOf(state) === "open" && (state.qualification === "active" || state.qualification === "renewing");
  }

  function allowPublish(state) {
    return allowSchoolFeed(state);
  }

  function allowPlaza(state) {
    if (state.studentMark !== "confirmed" || state.schoolMatch !== "confirmed") return false;
    if (state.qualification === "expired") return false;
    return phaseOf(state) === "open" || phaseOf(state) === "preparing" || phaseOf(state) === "closed" || phaseOf(state) === "paused";
  }

  function allowNewDm(state) {
    return allowSchoolFeed(state);
  }

  function studentLabel(mark) {
    return {
      none: "未开始",
      reviewing: "审核中",
      supplement: "需补充",
      rejected: "未通过，可重试",
      confirmed: "已确认",
      graduate_blocked: "未能确认在读"
    }[mark] || mark;
  }

  function phaseLabel(phase) {
    return { open: "开放", preparing: "筹备", closed: "未开通", paused: "暂停", unconfirmed: "未确认" }[phase] || phase;
  }

  function qualLabel(qual) {
    return {
      none: "未生效",
      active: "有效",
      renewing: "复核中",
      expired: "已过期"
    }[qual] || qual;
  }

  function shortStatus(state) {
    if (state.qualification === "expired") return "资格已失效";
    if (state.studentMark === "graduate_blocked") return "未能确认在读";
    if (state.studentMark === "reviewing") return "审核中";
    if (state.studentMark === "supplement") return "需补充";
    if (state.studentMark === "rejected") return "未通过";
    if (state.studentMark !== "confirmed") return "未认证";
    if (state.schoolMatch !== "confirmed") return "学校未确认";
    const phase = phaseOf(state);
    if (phase === "preparing") return "学校筹备";
    if (phase === "closed") return "学校未开通";
    if (phase === "paused") return "学校暂停";
    if (state.qualification === "renewing") return "续验中";
    return "已认证学生";
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function rememberServer(state) {
    state.server = {
      studentMark: state.studentMark,
      schoolMatch: state.schoolMatch,
      schoolId: state.schoolId,
      qualification: state.qualification,
      authPath: state.authPath,
      qr: clone(state.qr)
    };
  }

  function derive(state) {
    state.registered = Boolean(state.loggedIn);
    state.verified = allowSchoolFeed(state);
  }

  function applyFields(state, fields) {
    Object.assign(state, fields);
    state.qr = null;
    state.declaredSchoolId = state.declaredSchoolId || "";
    derive(state);
    rememberServer(state);
  }

  function applyPreset(state, id) {
    const preset = PRESETS[id];
    if (!preset) return false;
    state.preset = id;
    applyFields(state, preset);
    return true;
  }

  function resetSession(state) {
    state.phone = "";
    state.code = "";
    state.agreed = false;
    state.preset = "none";
    state.declaredSchoolId = "";
    applyFields(state, PRESETS.none);
  }

  function newQr() {
    const stamp = Date.now().toString(36).slice(-4).toUpperCase();
    return {
      id: "XS-" + stamp,
      status: "created",
      expiresAt: Date.now() + 90 * 1000,
      consumed: false,
      wechatConfirmed: false,
      appConfirmed: false
    };
  }

  function expireIfNeeded(qr) {
    if (!qr) return qr;
    if (["created", "scanned", "wechat_confirmed"].includes(qr.status) && Date.now() > qr.expiresAt) qr.status = "expired";
    return qr;
  }

  function row(label, copy, route) {
    return `<button class="list-row" data-go="${route}"><div class="grow"><strong>${esc(label)}</strong><span class="support">${esc(copy)}</span></div><span aria-hidden="true">›</span></button>`;
  }

  function cards(state) {
    const school = schoolById(state.schoolId);
    const schoolName = state.schoolMatch === "confirmed" && school ? school.name : "尚未确认";
    const phase = state.schoolMatch === "confirmed" ? phaseLabel(phaseOf(state)) : "尚未确认";
    return `<div class="split-status" data-student-mark="${esc(state.studentMark)}" data-school-match="${esc(state.schoolMatch)}" data-school-phase="${esc(phaseOf(state))}" data-qualification="${esc(state.qualification)}">
      <div class="school-card"><div class="grow"><strong>学生身份</strong><p class="meta">${esc(studentLabel(state.studentMark))}</p></div><span class="badge">${esc(studentLabel(state.studentMark))}</span></div>
      <div class="school-card"><div class="grow"><strong>学校</strong><p class="meta">${esc(schoolName)}</p></div><span class="badge">${state.schoolMatch === "confirmed" ? "已确认" : "未确认"}</span></div>
      <div class="school-card"><div class="grow"><strong>学校状态</strong><p class="meta">${esc(phase)}</p></div><span class="badge">${esc(phase)}</span></div>
      <div class="school-card"><div class="grow"><strong>资格</strong><p class="meta">${esc(qualLabel(state.qualification))} · 大约一年后需要再次确认</p></div><span class="badge">${esc(qualLabel(state.qualification))}</span></div>
    </div>`;
  }

  function reason(state) {
    if (state.studentMark === "graduate_blocked") return ["未能确认在读", "已毕业或结业的材料不能作为在读证明。请换一份在读材料后重新提交。"];
    if (state.studentMark === "reviewing") return ["正在审核", "审核完成前，还不能使用本校的内容和发布。"];
    if (state.studentMark === "supplement") return ["需要补充材料", "请回到认证，按页面提示重新提交。不需要身份证号或人脸。"];
    if (state.studentMark === "rejected") return ["这次没有通过", "你可以重新选择认证方式后再试一次。"];
    if (state.studentMark !== "confirmed") return ["请先完成学生认证", "登录之后，还需要完成学生认证，才能使用校园和私信。"];
    if (state.qualification === "expired") return ["资格已过期", "请重新认证。过期后不能发布，也不能使用本校功能。帮助和账号服务仍然可以进入。"];
    if (state.schoolMatch !== "confirmed") return ["学校尚未确认", "学生身份已经确认。在学校确认之前，不能看本校内容，也不能发布或发私信。"];
    const school = schoolById(state.schoolId);
    const name = school ? school.name : "当前学校";
    const phase = phaseOf(state);
    if (phase === "preparing") return ["学校还在筹备", name + " 还没开放本校内容。你现在还不能发布，可以先看全站已认证学生的内容。"];
    if (phase === "closed") return ["学校尚未开通", name + " 还没开通。现在不能发布，也不能进入本校内容。可以先看全站已认证学生的内容。"];
    if (phase === "paused") return ["学校已暂停", name + " 暂停期间不能发布，也不能进入本校内容。可以先看全站已认证学生的内容。"];
    return ["暂时不能使用", "请先完成学生认证和学校确认。"];
  }

  function gate(state, where) {
    const [title, body] = reason(state);
    const extra = (where === "messages" || where === "messageRequest" || where === "chat")
      ? `<p class="support">当前不能发起新的私信。对方接受请求之后，才能继续聊天。</p>`
      : where === "create"
        ? `<p class="support">发布会记在已确认的学校名下。学校还没确认，或学校未开放时，先不能发布。</p>`
        : "";
    const actions = [`<button class="button primary full" data-go="auth">去学生认证</button>`];
    if (state.qualification === "expired" || state.qualification === "renewing") actions.push(`<button class="button ghost full" data-go="renewal">去续验</button>`);
    if (state.studentMark === "confirmed" && state.schoolMatch !== "confirmed") actions.push(`<button class="button ghost full" data-go="authManual">提交材料确认学校</button>`);
    if (state.studentMark === "rejected" || state.studentMark === "supplement" || state.studentMark === "graduate_blocked") actions.push(`<button class="button ghost full" data-go="authGuide">重新认证</button>`);
    if (allowPlaza(state) && where !== "plaza") actions.push(`<button class="button ghost full" data-go="plaza">看看全站内容</button>`);
    actions.push(`<button class="button ghost full" data-go="help">帮助</button>`);
    return `<div class="page" data-auth-screen="gate-${esc(where)}"><section class="status warning"><span class="status-icon">!</span><h2>${esc(title)}</h2><p class="support">${esc(body)}</p></section>${extra}${actions.join("")}</div>`;
  }

  function renderWelcome() {
    return `<section class="splash-page" data-auth-screen="welcome"><img class="splash-media" src="assets/stock/campus-building.jpg" width="1200" height="798" alt="大学校园建筑与庭院"><span class="splash-shade" aria-hidden="true"></span><div class="splash-content"><div class="splash-brand"><strong>校哩</strong><p class="splash-lead">在校学生的校园社区。登录并完成认证后，进入你的学校。</p></div><button type="button" class="splash-action" data-go="login">登录</button><button type="button" class="splash-help" data-go="help">帮助</button></div></section>`;
  }

  function renderLogin(state) {
    return `<section class="auth-page" data-auth-screen="login"><div><h1>手机号登录</h1><p class="lead" style="margin-top:8px">登录后还需要完成学生认证。</p></div><div class="auth-form"><label class="field"><span>手机号</span><input class="input" data-field="phone" value="${esc(state.phone)}" inputmode="tel" autocomplete="tel" placeholder="请输入手机号"></label><label class="field field-code"><span>验证码</span><input class="input" data-field="code" value="${esc(state.code)}" inputmode="numeric" autocomplete="one-time-code" placeholder="请输入 6 位验证码"><button type="button" class="login-code" data-action="send-code">获取验证码</button></label><label class="agreement-compact"><input type="checkbox" data-field="agreed" ${state.agreed ? "checked" : ""}><span class="agreement-check" aria-hidden="true"></span><span class="support">我已阅读并同意协议与认证说明</span></label><button type="button" class="button ghost full" data-go="agreements">查看协议与隐私说明</button><button type="button" class="button primary full auth-action" data-action="login">登录并进入认证</button></div><p class="meta">不会要求填写身份证号，也不会做人脸识别。</p></section>`;
  }

  function renderBoundary(kind) {
    const title = kind === "register" ? "请直接登录" : "请使用手机号登录";
    const copy = kind === "register"
      ? "使用手机号和验证码即可登录。登录后继续完成学生认证。"
      : "当前请使用手机号登录。学生认证在登录后的下一步完成。";
    return `<div class="page" data-auth-screen="${esc(kind)}"><section class="status"><span class="status-icon">!</span><h2>${title}</h2><p class="support">${copy}</p></section><button class="button primary full" data-go="login">返回手机号登录</button></div>`;
  }

  function renderAgreements() {
    return `<div class="page" data-auth-screen="agreements"><p class="lead">请阅读下面的说明。返回后，已填写的手机号和验证码会保留。</p><section class="card"><h2>用户协议</h2><p class="support" style="margin-top:8px">用手机号登录。你发布的内容默认只有本校同学能看到，不会对未登录的人公开。</p></section><section class="card"><h2>隐私说明</h2><p class="support" style="margin-top:8px">认证不会要求你提供身份证号、人脸或学信网密码。手机号只用于登录。</p></section><section class="card"><h2>认证说明</h2><p class="support" style="margin-top:8px">认证用来确认你是学生，以及你属于哪所学校。只确认学生身份时，还不能使用本校功能。</p></section><button class="button primary full" data-action="accept-agreement">同意并返回</button></div>`;
  }

  function renderAuth(state) {
    return `<div class="page" data-auth-screen="auth"><h1>学生认证</h1><p class="lead">先看学生身份和学校是否都已确认。只完成登录，还不能使用本校。</p>${cards(state)}<button class="button primary full" data-go="authGuide">选择认证方式</button><button class="button ghost full" data-go="schoolCatalog">查看学校</button><button class="button ghost full" data-go="renewal">资格续验</button><button class="button ghost full" data-auth="enter-shell">去校园看看</button></div>`;
  }

  function renderGuide() {
    return `<div class="page" data-auth-screen="guide"><h1>选择认证方式</h1><p class="lead">选一种方式完成认证。我们不会向你收取身份证或人脸信息。</p><div class="path-list"><button class="path-card" data-auth="pick-path" data-path="wechat"><strong>微信学生认证</strong><span>使用微信确认你的学生身份。</span></button><button class="path-card" data-auth="pick-path" data-path="alipay"><strong>支付宝学生认证</strong><span>使用支付宝确认你的学生身份。</span></button><button class="path-card" data-auth="pick-path" data-path="zsdx"><strong>掌上大学</strong><span>使用掌上大学确认你的学生身份。</span></button><button class="path-card" data-auth="pick-path" data-path="qr"><strong>微信扫码认证</strong><span>生成认证码，在微信里完成后回到这里查看。</span></button><button class="path-card" data-auth="pick-path" data-path="manual"><strong>人工审核</strong><span>提交在读证明，等待审核确认。</span></button></div></div>`;
  }

  function renderCandidate(state) {
    const path = PATHS[state.authPath] || PATHS.wechat;
    return `<div class="page" data-auth-screen="candidate" data-auth-path="${esc(state.authPath || "wechat")}"><h1>${esc(path.title)}</h1><p class="lead">${esc(path.hint)} 不会要求身份证号或人脸。</p><button class="button primary full" data-auth="complete-auth">完成认证</button><button class="button ghost full" data-go="authResult">查看认证结果</button><button class="button ghost full" data-go="authGuide">换一种方式</button></div>`;
  }

  function renderManual(state) {
    const schoolButtons = SCHOOLS.map((school) => `<button class="chip" data-auth="declare-school" data-school-id="${school.id}" aria-pressed="${state.declaredSchoolId === school.id}">${esc(school.name)}</button>`).join("");
    const materials = [["report_note", "在读证明"], ["other", "其他证明"], ["graduate", "已毕业或结业"]];
    return `<div class="page" data-auth-screen="manual"><h1>提交材料认证</h1><p class="lead">选择材料类型和学校后提交。不需要上传身份证或人脸。提交后由审核确认，不会马上改变你的学校。</p><section class="card"><h2>材料</h2><div class="choice-row" style="margin-top:10px">${materials.map(([id, label]) => `<button class="chip" data-auth="material" data-material="${id}" aria-pressed="${state.material === id}">${label}</button>`).join("")}</div><p class="meta" style="margin-top:8px">已毕业或结业的材料不能确认为在读。</p></section><section class="card"><h2>学校</h2><p class="support" style="margin-top:8px">请选择材料上的学校。</p><div class="choice-row" style="margin-top:10px">${schoolButtons}</div></section><button class="button primary full" data-auth="manual-submit">提交审核</button></div>`;
  }

  function qrStatusLabel(status) {
    return { created: "待认证", scanned: "已打开，等待确认", wechat_confirmed: "请在本页确认", completed: "已完成", cancelled: "已取消", expired: "已失效" }[status] || "未开始";
  }

  function renderQr(state) {
    const qr = state.qr;
    const remain = qr ? Math.max(0, Math.ceil((qr.expiresAt - Date.now()) / 1000)) : 0;
    const confirm = qr && qr.status === "wechat_confirmed" ? `<button class="button primary full" data-auth="qr-app">确认绑定到当前账号</button>` : "";
    const body = !qr
      ? `<section class="status"><span class="status-icon">i</span><h2>生成认证码</h2><p class="support">生成后请在微信中完成认证，再回到这里刷新结果。码会很快失效。</p></section><button class="button primary full" data-auth="qr-create">生成认证码</button>`
      : `<div class="demo-code" role="img" aria-label="预览占位，不是微信二维码"><div><strong>预览占位</strong><span>不是微信二维码，不能扫描</span></div></div><section class="card"><p class="meta">编号 ${esc(qr.id)} · ${esc(qrStatusLabel(qr.status))}</p><p class="support" style="margin-top:8px">一次性使用。大约还剩 <span data-qr-remain>${remain}</span> 秒，失效后请重新生成。</p><p class="meta" style="margin-top:8px">学生身份：${esc(studentLabel(state.studentMark))}。学校：${state.schoolMatch === "confirmed" ? "已确认" : "尚未确认"}。</p></section><ol class="auth-steps"><li>生成认证码</li><li>在微信中完成认证</li><li>回到这里确认并刷新结果</li></ol>${confirm}<button class="button primary full" data-auth="qr-refresh">刷新结果</button><button class="button ghost full" data-auth="qr-cancel">取消</button><button class="button ghost full" data-auth="qr-create">重新生成</button>`;
    return `<div class="page" data-auth-screen="qr"><h1>扫码认证</h1><p class="lead">请用当前登录的账号生成认证码。别人扫到你的码，也不会直接改你的认证状态。</p>${body}</div>`;
  }

  function renderCatalog() {
    const rows = SCHOOLS.map((school) => `<div class="school-card"><div class="grow"><strong>${esc(school.name)}</strong><p class="meta">${esc(phaseLabel(school.phase))}</p></div><span class="badge">${esc(phaseLabel(school.phase))}</span></div>`).join("");
    return `<div class="page" data-auth-screen="catalog"><h1>学校</h1><p class="lead">查看学校是否已经开放。看一所学校，不会把你改成那所学校的学生。</p><div class="split-status">${rows}</div><button class="button primary full" data-go="auth">返回认证</button></div>`;
  }

  function renderRenewal(state) {
    const school = schoolById(state.schoolId);
    const headline = state.qualification === "expired" ? "资格已过期" : state.qualification === "renewing" ? "正在复核" : "资格有效";
    const detail = state.qualification === "renewing"
      ? "新的结果出来之前，你仍可以按原来的资格使用。"
      : state.qualification === "expired"
        ? "请重新认证。过期后不能发布，也不能使用本校功能。"
        : "大约一年后需要再次确认。如果毕业或学籍变化，也可能提前失效。";
    return `<div class="page" data-auth-screen="renewal"><div class="school-card"><div class="grow"><strong>${esc(headline)}</strong><p class="meta">${esc(school && state.schoolMatch === "confirmed" ? school.name : "学校尚未确认")}</p></div><span class="badge">${esc(qualLabel(state.qualification))}</span></div><p class="lead">${esc(detail)}</p>${cards(state)}<button class="button primary full" data-go="authGuide">重新认证</button><button class="button ghost full" data-auth="enter-shell">查看校园</button><button class="button ghost full" data-go="help">帮助</button></div>`;
  }

  function identity(state) {
    return `<div class="page" data-auth-screen="identity"><h1>学生资格</h1>${cards(state)}<div class="list">${row("认证结果", "查看这次认证的结果", "authResult")}${row("资格续验", "大约一年确认一次", "renewal")}${row("学校", "查看学校是否开放", "schoolCatalog")}${row("学校信息有误", "提交说明，不能自己改学校", "help")}</div></div>`;
  }

  function limitedMine(state) {
    return `<div class="page" data-auth-screen="mine-limited"><section class="panel profile-head"><span class="avatar large">林</span><h1>林同学</h1><p class="support">${esc(shortStatus(state))}</p><p class="lead" style="margin-top:10px">完成学生认证和学校确认后，才能使用本校功能。</p></section>${cards(state)}<div class="list">${row("学生认证", "查看认证进度", "auth")}${row("学校", "查看学校是否开放", "schoolCatalog")}${row("资格续验", "重新确认资格", "renewal")}${row("帮助与反馈", "认证和使用说明", "help")}${row("设置", "显示与退出", "settings")}</div></div>`;
  }

  function renderResult(state) {
    const [title, body] = reason(state);
    const passed = allowSchoolFeed(state);
    const waiting = state.studentMark === "none";
    const headline = passed ? "可以进入校园" : waiting ? "还没有认证结果" : title;
    const copy = passed ? "学生身份和学校都已确认，可以进入本校。" : waiting ? "请先完成所选的认证方式，再回到这里查看。" : body;
    return `<div class="page" data-auth-screen="result">${cards(state)}<section class="status ${passed ? "" : "warning"}"><span class="status-icon">${passed ? "✓" : "!"}</span><h2>${esc(headline)}</h2><p class="support">${esc(copy)}</p></section><button class="button primary full" data-auth="enter-shell">${passed ? "进入校园" : "查看当前权限"}</button>${passed ? "" : `<button class="button ghost full" data-go="authGuide">重新认证</button>`}<button class="button ghost full" data-go="auth">返回认证</button></div>`;
  }

  function ensureServer(state) {
    if (!state.server) rememberServer(state);
  }

  function toastNeed(api, message) {
    api.toast(message);
  }

  function onAction(state, action, dataset, api) {
    ensureServer(state);
    if (action === "preset") {
      if (!applyPreset(state, dataset.preset)) toastNeed(api, "没有这个状态");
      api.render();
      return;
    }
    if (action === "enter-shell") {
      api.go("campus");
      return;
    }
    if (action === "complete-auth") {
      state.loggedIn = true;
      state.studentMark = "confirmed";
      state.schoolMatch = "confirmed";
      state.schoolId = "sch-nanchuan";
      state.qualification = "active";
      state.authPath = state.authPath || "wechat";
      state.preset = "open_member";
      derive(state);
      rememberServer(state);
      api.toast("认证已完成");
      api.go("authResult");
      return;
    }
    if (action === "pick-path") {
      state.authPath = dataset.path;
      if (dataset.path === "manual") api.go("authManual");
      else if (dataset.path === "qr") {
        if (!state.loggedIn) {
          api.toast("请先登录");
          api.go("login");
          return;
        }
        api.go("authQr");
      } else api.go("authCandidate");
      return;
    }
    if (action === "outcome") {
      const outcome = dataset.outcome;
      state.schoolMatch = "unconfirmed";
      state.schoolId = "";
      state.qualification = "none";
      if (outcome === "reviewing") state.studentMark = "reviewing";
      if (outcome === "supplement") state.studentMark = "supplement";
      if (outcome === "rejected") state.studentMark = "rejected";
      if (outcome === "student_only") {
        state.studentMark = "confirmed";
        state.qualification = "active";
      }
      if (outcome === "graduate") state.studentMark = "graduate_blocked";
      state.preset = "";
      derive(state);
      rememberServer(state);
      api.toast("认证结果已更新");
      api.go("authResult");
      return;
    }
    if (action === "declare-school") {
      state.declaredSchoolId = dataset.schoolId;
      api.toast("已选择学校");
      api.render();
      return;
    }
    if (action === "material") {
      state.material = dataset.material;
      api.render();
      return;
    }
    if (action === "manual-submit") {
      state.authPath = "manual";
      if (!state.material) state.material = "report_note";
      if (state.material === "graduate") {
        state.studentMark = "graduate_blocked";
        state.schoolMatch = "unconfirmed";
        state.schoolId = "";
        state.qualification = "none";
        derive(state);
        rememberServer(state);
        api.toast("已毕业或结业的材料不能确认为在读");
        api.go("authResult");
        return;
      }
      if (!state.declaredSchoolId) {
        api.toast("请先选择学校");
        api.render();
        return;
      }
      state.studentMark = "confirmed";
      state.schoolMatch = "confirmed";
      state.schoolId = state.declaredSchoolId;
      state.qualification = "active";
      derive(state);
      rememberServer(state);
      api.toast("学校已确认");
      api.go("authResult");
      return;
    }
    if (action === "manual-result") {
      const result = dataset.result;
      state.authPath = "manual";
      if (result === "match") {
        if (state.material === "graduate") {
          state.studentMark = "graduate_blocked";
          state.schoolMatch = "unconfirmed";
          state.schoolId = "";
          state.qualification = "none";
          api.toast("已毕业或结业的材料不能确认为在读");
        } else if (!state.declaredSchoolId) {
          api.toast("请先选择学校");
          api.render();
          return;
        } else {
          state.studentMark = "confirmed";
          state.schoolMatch = "confirmed";
          state.schoolId = state.declaredSchoolId;
          state.qualification = "active";
          api.toast("学校已确认");
        }
      } else if (result === "student_only") {
        state.studentMark = "confirmed";
        state.schoolMatch = "unconfirmed";
        state.schoolId = "";
        state.qualification = "active";
      } else if (result === "reviewing") {
        state.studentMark = "reviewing";
        state.schoolMatch = "unconfirmed";
        state.qualification = "none";
      } else if (result === "supplement") {
        state.studentMark = "supplement";
        state.schoolMatch = "unconfirmed";
        state.qualification = "none";
      } else if (result === "rejected") {
        state.studentMark = "rejected";
        state.schoolMatch = "unconfirmed";
        state.qualification = "none";
      }
      state.preset = "";
      derive(state);
      rememberServer(state);
      api.go("authResult");
      return;
    }
    if (action === "qr-create") {
      if (!state.loggedIn) {
        api.toast("请先登录");
        api.go("login");
        return;
      }
      const qr = newQr();
      state.qr = clone(qr);
      state.server.qr = qr;
      state.authPath = "qr";
      api.toast("认证码已生成");
      api.render();
      return;
    }
    if (action === "qr-refresh") {
      expireIfNeeded(state.server.qr);
      state.studentMark = state.server.studentMark;
      state.schoolMatch = state.server.schoolMatch;
      state.schoolId = state.server.schoolId;
      state.qualification = state.server.qualification;
      state.authPath = state.server.authPath || state.authPath;
      state.qr = clone(state.server.qr);
      derive(state);
      api.toast("已更新");
      api.render();
      return;
    }
    if (action === "qr-replay") {
      api.toast("这个码已经用过，请重新生成");
      return;
    }
    if (action === "qual") {
      if (state.studentMark !== "confirmed" || state.schoolMatch !== "confirmed") {
        api.toast("还没有可以续验的资格");
        return;
      }
      state.qualification = dataset.qual;
      if (dataset.qual === "expired") api.toast("资格已过期");
      if (dataset.qual === "renewing") api.toast("正在复核，原资格仍然有效");
      derive(state);
      rememberServer(state);
      api.render();
      return;
    }
    const qr = state.server.qr;
    if (!qr) {
      api.toast("请先生成认证码");
      return;
    }
    expireIfNeeded(qr);
    if (action === "qr-expire") {
      qr.status = "expired";
      api.toast("认证码已失效");
      return;
    }
    if (action === "qr-cancel") {
      qr.status = "cancelled";
      api.toast("已取消");
      return;
    }
    if (action === "qr-reject") {
      qr.status = "cancelled";
      api.toast("已拒绝，账号没有变更");
      return;
    }
    if (qr.status === "expired" || qr.status === "cancelled" || qr.status === "completed") {
      api.toast(qr.status === "completed" ? "请重新生成认证码" : "这个码已结束，请重新生成");
      return;
    }
    if (action === "qr-scan") {
      qr.status = "scanned";
      api.toast("已打开认证，账号尚未变更");
      return;
    }
    if (action === "qr-wechat") {
      if (qr.status !== "scanned" && qr.status !== "wechat_confirmed") {
        api.toast("请先在微信中打开认证");
        return;
      }
      qr.status = "wechat_confirmed";
      qr.wechatConfirmed = true;
      api.toast("请回到 App 确认绑定");
      return;
    }
    if (action === "qr-app") {
      if (!qr.wechatConfirmed || qr.status !== "wechat_confirmed") {
        api.toast("请先在微信中完成认证");
        return;
      }
      qr.status = "completed";
      qr.appConfirmed = true;
      qr.consumed = true;
      state.server.studentMark = "confirmed";
      state.server.schoolMatch = "unconfirmed";
      state.server.schoolId = "";
      state.server.qualification = "active";
      state.server.authPath = "qr";
      api.toast("已确认。请刷新结果");
    }
  }


  function mountPreview(state) {
    const root = document.getElementById("preview-panel");
    if (!root) return;
    const presets = [
      ["none", "未开始"], ["reviewing", "审核中"], ["supplement", "需补充"], ["rejected", "未通过"],
      ["student_only", "仅学生身份"], ["preparing", "学校筹备"], ["not_open", "学校未开通"], ["paused", "学校暂停"],
      ["open_member", "本校可用"], ["expired", "资格过期"], ["renewing", "复核中"], ["graduate_blocked", "未能确认在读"]
    ];
    root.innerHTML = `<h2>预览说明</h2><p>这是交互原型。认证和短信尚未正式开通，不会采集真实身份信息，也不会连接微信、支付宝或学信网。下面的按钮只在预览里切换状态，学生页面里不会出现。</p><p data-preview-status>当前：${esc(shortStatus(state))}</p><div class="preset-grid">${presets.map(([id, label]) => `<button type="button" data-preview="preset" data-preset="${id}">${label}</button>`).join("")}<button type="button" data-preview="reset">重置预览数据</button></div><h2 style="margin-top:14px">扫码预览</h2><div class="preset-grid"><button type="button" data-preview="qr-scan">对方已打开</button><button type="button" data-preview="qr-wechat">微信侧已确认</button><button type="button" data-preview="qr-app">本页确认绑定</button><button type="button" data-preview="qr-reject">他人拒绝</button><button type="button" data-preview="qr-expire">认证码过期</button><button type="button" data-preview="qr-replay">再次使用旧码</button><button type="button" data-preview="outcome" data-outcome="student_only">结果：仅学生</button><button type="button" data-preview="outcome" data-outcome="reviewing">结果：审核中</button><button type="button" data-preview="manual-result" data-result="match">结果：学校已确认</button></div>`;
  }

  function boot(state, routes) {
    const query = new URLSearchParams(global.location.search);
    const frame = query.get("frame");
    if (frame && /^[0-9]{3}$/.test(frame)) {
      const width = Number(frame);
      document.documentElement.style.setProperty("--phone-screen-width", width + "px");
      document.documentElement.style.setProperty("--phone-screen-height", Math.round(width * 844 / 390) + "px");
    }
    if (!state.server) rememberServer(state);
    if (query.get("preset")) applyPreset(state, query.get("preset"));
    const route = query.get("route");
    if (route && routes[route]) state.route = route;
  }

  let qrTimer = null;
  function afterRender(state) {
    mountPreview(state);
    clearInterval(qrTimer);
    if (state.route !== "authQr" || !state.qr) return;
    qrTimer = setInterval(() => {
      const node = document.querySelector("[data-qr-remain]");
      if (!node || !state.qr) return;
      node.textContent = String(Math.max(0, Math.ceil((state.qr.expiresAt - Date.now()) / 1000)));
    }, 500);
  }

  global.XiaoliAuth = {
    SCHOOLS, PRESETS, allowSchoolFeed, allowPublish, allowPlaza, allowNewDm, shortStatus,
    applyPreset, resetSession, gate, renderWelcome, renderLogin, renderBoundary, renderAgreements,
    renderAuth, renderGuide, renderCandidate, renderManual, renderQr, renderCatalog, renderRenewal,
    identity, limitedMine, renderResult, onAction, boot, afterRender
  };
})(window);
