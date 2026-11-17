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
    wechat: {
      title: "微信学生身份快速验证",
      kind: "官方候选",
      note: "公开文档写了 is_student 和 bind_status，不返回学校。用途多为学生优惠，校园社区能否开通仍待申请。本页不调用微信接口。"
    },
    alipay: {
      title: "支付宝学生 / 校园身份",
      kind: "官方候选",
      note: "面向开发者、能返回「是否学生」和学校的现行接口，公开材料里仍是未知。不把已取消字段或校园付名录当成可用认证。"
    },
    zsdx: {
      title: "掌上大学",
      kind: "官方候选",
      note: "隐私政策提到权威机构核验，但没有公开接口、字段或申请入口。记为未知，不是已选定供应商。"
    }
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
      graduate_blocked: "毕业等状态，不默认通过"
    }[mark] || mark;
  }

  function phaseLabel(phase) {
    return { open: "开放", preparing: "筹备", closed: "未开通", paused: "暂停", unconfirmed: "未确认" }[phase] || phase;
  }

  function qualLabel(qual) {
    return {
      none: "尚无平台资格",
      active: "示意有效",
      renewing: "续验处理中",
      expired: "已失效"
    }[qual] || qual;
  }

  function shortStatus(state) {
    if (state.qualification === "expired") return "资格已失效";
    if (state.studentMark === "graduate_blocked") return "不默认通过";
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

  function flag(text) {
    return `<p class="demo-flag">${esc(text || "演示 / 待验证 · 未接入 · 不采集真实身份信息")}</p>`;
  }

  function row(label, copy, route) {
    return `<button class="list-row" data-go="${route}"><div class="grow"><strong>${esc(label)}</strong><span class="support">${esc(copy)}</span></div><span aria-hidden="true">›</span></button>`;
  }

  function cards(state) {
    const school = schoolById(state.schoolId);
    const schoolName = state.schoolMatch === "confirmed" && school ? school.name : "尚未核验";
    return `<div class="split-status" data-student-mark="${esc(state.studentMark)}" data-school-match="${esc(state.schoolMatch)}" data-school-phase="${esc(phaseOf(state))}" data-qualification="${esc(state.qualification)}">
      <div class="school-card"><div class="grow"><strong>学生身份</strong><p class="meta">${esc(studentLabel(state.studentMark))}</p></div><span class="badge">${esc(studentLabel(state.studentMark))}</span></div>
      <div class="school-card"><div class="grow"><strong>学校归属</strong><p class="meta">${esc(schoolName)} · ${state.schoolMatch === "confirmed" ? "已确认" : "未确认"}</p></div><span class="badge">${state.schoolMatch === "confirmed" ? "已确认" : "未确认"}</span></div>
      <div class="school-card"><div class="grow"><strong>学校开通</strong><p class="meta">${esc(phaseLabel(phaseOf(state)))}。筹备、未开通、暂停都不是本校成员权。</p></div><span class="badge">${esc(phaseLabel(phaseOf(state)))}</span></div>
      <div class="school-card"><div class="grow"><strong>平台资格</strong><p class="meta">${esc(qualLabel(state.qualification))}。复核暂定一年，日期未冻结，也可提前失效。</p></div><span class="badge">${esc(qualLabel(state.qualification))}</span></div>
    </div>`;
  }

  function reason(state) {
    if (state.studentMark === "graduate_blocked") return ["不默认通过", "已毕业、结业或肄业不会自动获得在校社区权。哪些学籍状态可以放行，白名单还没定，原型不替你放行。"];
    if (state.studentMark === "reviewing") return ["审核中", "还在处理。审核中不能使用本校能力，放着不管也不会自动通过。"];
    if (state.studentMark === "supplement") return ["需要补充", "这次材料还不够。可以回到认证入口重试。这里不采集身份证、人脸或学信网密码。"];
    if (state.studentMark === "rejected") return ["未通过，可以重试", "这次没有通过，账号也不会被写成已认证。可以重新选择路径。"];
    if (state.studentMark !== "confirmed") return ["尚未完成学生认证", "登录只建立演示账号。没有学生资格，就没有本校信息流、发布和私信。"];
    if (state.qualification === "expired") return ["资格已失效", "复核暂定一年，毕业、撤销或状态变化也可以提前收回。失效后不能使用本校权限，仍可以续验、看帮助和数据权利。"];
    if (state.schoolMatch !== "confirmed") return ["学生已确认，学校未确认", "现在只能记下学生身份。学校未确认时，不能进本校信息流，不能发布，也没有本校成员权。自己选的学校不能当成已核验归属。只确认了学生、还没确认学校的人，能不能看全站已认证内容，产品还没定，这个演示不默认放开。"];
    const school = schoolById(state.schoolId);
    const name = school ? school.name : "当前学校";
    const phase = phaseOf(state);
    if (phase === "preparing") return ["学校筹备中", name + " 还在筹备。本校信息流和发布先不要用。人已经通过学生和学校核验时，可以先看全站已认证学生可见的内容。"];
    if (phase === "closed") return ["学校未开通", name + " 还没开通。不能发布，也不能进本校成员信息流。可以浏览全站已认证学生可见的内容。"];
    if (phase === "paused") return ["学校已暂停", name + " 当前暂停。暂停期间不能发布，也不能使用本校信息流。全站已认证学生可见的浏览还保留。"];
    return ["当前不可用", "这个演示状态没有对应的本校权限。"];
  }

  function gate(state, where) {
    const [title, body] = reason(state);
    const extra = (where === "messages" || where === "messageRequest" || where === "chat")
      ? `<p class="support">新的私信不在这个状态开放。首版只有受控私信，群聊往后放。未成年人保护还没定，取消年龄门槛不等于把私信全部放开。</p>`
      : where === "create"
        ? `<p class="support">发布学校必须来自已核验归属。学校未确认、筹备、未开通、暂停，或者资格失效，都不能发到本校。</p>`
        : "";
    const actions = [`<button class="button primary full" data-go="auth">返回学生认证</button>`];
    if (state.qualification === "expired" || state.qualification === "renewing") actions.push(`<button class="button ghost full" data-go="renewal">去资格续验</button>`);
    if (state.studentMark === "confirmed" && state.schoolMatch !== "confirmed") actions.push(`<button class="button ghost full" data-go="authManual">人工兜底补充学校证据（演示）</button>`);
    if (state.studentMark === "rejected" || state.studentMark === "supplement" || state.studentMark === "graduate_blocked") actions.push(`<button class="button ghost full" data-go="authGuide">重新选择路径</button>`);
    if (allowPlaza(state) && where !== "plaza") actions.push(`<button class="button ghost full" data-go="plaza">浏览全站已认证学生可见</button>`);
    actions.push(`<button class="button ghost full" data-go="help">帮助</button>`);
    return `<div class="page" data-auth-screen="gate-${esc(where)}">${flag()}<section class="status warning"><span class="status-icon">!</span><h2>${esc(title)}</h2><p class="support">${esc(body)}</p></section>${extra}${actions.join("")}</div>`;
  }

  function presets(state) {
    const items = [
      ["none", "未开始"],
      ["reviewing", "审核中"],
      ["supplement", "需补充"],
      ["rejected", "拒绝可重试"],
      ["student_only", "学生已确认"],
      ["preparing", "学校筹备"],
      ["not_open", "学校未开通"],
      ["paused", "学校暂停"],
      ["open_member", "本校可用"],
      ["expired", "资格失效"],
      ["renewing", "续验中"],
      ["graduate_blocked", "毕业不通过"]
    ];
    return `<details><summary>原型演示：直接查看各状态</summary><p class="support" style="margin-top:8px">这些按钮只改本机演示状态，不是运营后台，也不会把示例日期写成政策。</p><div class="preset-grid" style="margin-top:10px">${items.map(([id, label]) => `<button class="chip" data-auth="preset" data-preset="${id}" aria-pressed="${state.preset === id}">${esc(label)}</button>`).join("")}</div></details>`;
  }

  function renderWelcome() {
    return `<section class="splash-page" data-auth-screen="welcome"><img class="splash-media" src="assets/stock/campus-building.jpg" width="1200" height="798" alt="大学校园建筑与庭院"><span class="splash-shade" aria-hidden="true"></span><div class="splash-content"><div class="splash-brand"><strong>校哩</strong><p class="splash-lead">给能够核验学生资格的同学。登录以后，还要分开确认「是不是学生」和「是不是这所学校的学生」。</p></div><button type="button" class="splash-action" data-go="login">登录</button><button type="button" class="splash-help" data-go="help">认证与帮助</button></div></section>`;
  }

  function renderLogin(state) {
    return `<section class="auth-page" data-auth-screen="login"><div><p class="demo-flag">演示 / 待验证 · 未接入短信</p><h1 style="margin-top:12px">手机号登录</h1><p class="lead" style="margin-top:8px">登录后仍需学生认证。首期只用手机验证码建立账号，不设密码注册，也不把微信、QQ 或支付宝登录当成学生认证。</p></div><div class="auth-form"><label class="field"><span>演示手机号</span><input class="input" data-field="phone" value="${esc(state.phone)}" inputmode="tel" autocomplete="tel" placeholder="11 位演示号码，不会真正发短信"></label><label class="field field-code"><span>验证码</span><input class="input" data-field="code" value="${esc(state.code)}" inputmode="numeric" autocomplete="one-time-code" placeholder="任意 6 位数字"><button type="button" class="login-code" data-action="send-code">获取验证码</button></label><label class="agreement-compact"><input type="checkbox" data-field="agreed" ${state.agreed ? "checked" : ""}><span class="agreement-check">✓</span><span class="support">我已阅读并同意协议与认证说明</span></label><button type="button" class="button ghost full" data-go="agreements">查看协议与隐私说明</button><button type="button" class="button primary full auth-action" data-action="login">登录并进入认证</button></div><p class="meta">不采集身份证、人脸或学信网密码。不设 18 岁门槛。未成年人保护仍未单独设计，这里不因此放开私信。</p></section>`;
  }

  function renderBoundary(kind) {
    const copy = kind === "register"
      ? "首期不单独做密码注册。登录成功就会建立演示账号，然后进入学生认证。"
      : "微信、QQ、支付宝登录不在首期，也不能代替学生认证。学生资格要走认证里的候选路径或人工兜底。";
    return `<div class="page" data-auth-screen="${esc(kind)}">${flag("超出首期 · 已从登录页移出")}<section class="status warning"><span class="status-icon">!</span><h2>${kind === "register" ? "不做密码注册" : "不做第三方登录"}</h2><p class="support">${esc(copy)}</p></section><button class="button primary full" data-go="login">返回手机号登录</button></div>`;
  }

  function renderAgreements() {
    return `<div class="page" data-auth-screen="agreements"><p class="lead">下面是可滚动的示意正文，用来走通「点开协议再回来」。它不是已经生效的用户协议或隐私政策。</p><section class="card"><h2>用户协议（示意）</h2><p class="support" style="margin-top:8px">账号用手机验证码建立。社区内容默认只在有权限的学生之间可见，不是互联网公开。</p></section><section class="card"><h2>隐私说明（示意）</h2><p class="support" style="margin-top:8px">原型不上传手机号，不保存证件影像。正式环境的保留期限还没评估完，不能把某一天写成已批准政策。</p></section><section class="card"><h2>认证专项告知（示意）</h2><p class="support" style="margin-top:8px">目标是确认当前用户是不是某校学生。学生身份和学校归属分开。平台接口都还没开通，页面上的结果全部是演示。不索取学信网账号密码，不把身份证或人脸设成必填。</p></section><button class="button primary full" data-action="accept-agreement">同意并返回</button></div>`;
  }

  function renderAuth(state) {
    return `<div class="page" data-auth-screen="auth">${flag()}<h1>学生认证</h1><p class="lead">先看两个状态：你是不是学生，以及学校有没有被确认、有没有开通。只完成登录，还不能使用本校。</p>${cards(state)}<p class="support">不设 18 岁门槛，也不采集年龄来挡人。未成年人保护怎么做还没定，所以不会在这里把私信全部打开。</p><button class="button primary full" data-go="authGuide">选择认证路径</button><button class="button ghost full" data-go="schoolCatalog">查看学校开通配置</button><button class="button ghost full" data-go="renewal">资格与续验</button><button class="button ghost full" data-auth="enter-shell">按当前状态看看校园</button>${presets(state)}</div>`;
  }

  function renderGuide() {
    return `<div class="page" data-auth-screen="guide">${flag()}<h1>选择认证路径</h1><p class="lead">可以选官方候选，也可以走人工兜底。没有一条已经开通。扫码小程序是备用演示，不是已接入的微信能力。</p><div class="path-list"><button class="path-card" data-auth="pick-path" data-path="wechat"><strong>微信学生身份快速验证</strong><span>官方候选 · 演示 / 待验证。不返回学校。</span></button><button class="path-card" data-auth="pick-path" data-path="alipay"><strong>支付宝学生 / 校园身份</strong><span>官方候选 · 演示 / 待验证。公开字段仍未知。</span></button><button class="path-card" data-auth="pick-path" data-path="zsdx"><strong>掌上大学</strong><span>官方候选 · 演示 / 待验证。无公开接口证据。</span></button><button class="path-card" data-auth="pick-path" data-path="qr"><strong>扫码认证小程序</strong><span>备用方案 · 演示 / 待验证。短时会话，扫码不立刻绑定。</span></button><button class="path-card" data-auth="pick-path" data-path="manual"><strong>人工兜底</strong><span>演示。不上传证件，也不把完整学籍报告当成唯一材料。</span></button></div><section class="card"><h2>不会单独放行的东西</h2><p class="support" style="margin-top:8px">学生证、学校邮箱、录取通知书、姓名相同，都不能单独通过。已毕业、结业、肄业不默认有在校权利。自考和休学、退学等状态还没列入可执行白名单，演示里也不默认通过。</p></section></div>`;
  }

  function renderCandidate(state) {
    const path = PATHS[state.authPath] || PATHS.wechat;
    return `<div class="page" data-auth-screen="candidate" data-auth-path="${esc(state.authPath || "wechat")}">${flag(path.kind + " · 演示 / 待验证")}<h1>${esc(path.title)}</h1><p class="lead">${esc(path.note)}</p><section class="card"><h2>模拟一个结果</h2><p class="support" style="margin-top:8px">下面的按钮只改本机状态。不会打开外部认证，也不能理解成接口已经返回。</p></section><button class="button ghost full" data-auth="outcome" data-outcome="reviewing">模拟：审核中</button><button class="button ghost full" data-auth="outcome" data-outcome="supplement">模拟：需要补充</button><button class="button ghost full" data-auth="outcome" data-outcome="rejected">模拟：未通过，可重试</button><button class="button primary full" data-auth="outcome" data-outcome="student_only">模拟：学生已确认，学校仍未确认</button><button class="button ghost full" data-auth="outcome" data-outcome="graduate">模拟：已毕业 / 结业，不默认通过</button><button class="button ghost full" data-go="authGuide">换一条路径</button></div>`;
  }

  function renderManual(state) {
    const schoolButtons = SCHOOLS.map((school) => `<button class="chip" data-auth="declare-school" data-school-id="${school.id}" aria-pressed="${state.declaredSchoolId === school.id}">${esc(school.name)}</button>`).join("");
    const materials = [["report_note", "官方材料说明"], ["other", "其他可核验说明"], ["graduate", "毕业 / 结业 / 肄业"]];
    return `<div class="page" data-auth-screen="manual">${flag("人工兜底 · 演示 / 待验证")}<h1>人工兜底</h1><p class="lead">审核仍要分别看本人是否对应、资格是否还在、学校是否匹配。这一页不上传文件，没有身份证号、人脸或学信网密码。</p><section class="card"><h2>材料类型（示意）</h2><div class="choice-row" style="margin-top:10px">${materials.map(([id, label]) => `<button class="chip" data-auth="material" data-material="${id}" aria-pressed="${state.material === id}">${label}</button>`).join("")}</div><p class="meta" style="margin-top:8px">不必人人上传完整学籍报告。选毕业类材料不会自动通过。</p></section><section class="card"><h2>声明学校</h2><p class="support" style="margin-top:8px">自己点选的学校只是声明，不能变成已核验归属。名单是演示配置，试点意向是四川两校，但校名未锁定，也不能只写死两所。</p><div class="choice-row" style="margin-top:10px">${schoolButtons}</div></section><button class="button ghost full" data-auth="manual-result" data-result="reviewing">提交人工审核（演示）</button><button class="button ghost full" data-auth="manual-result" data-result="supplement">模拟：需要补充</button><button class="button ghost full" data-auth="manual-result" data-result="rejected">模拟：未通过，可重试</button><button class="button ghost full" data-auth="manual-result" data-result="student_only">模拟：只确认学生，学校仍未确认</button><button class="button primary full" data-auth="manual-result" data-result="match">模拟：人工确认学校匹配</button></div>`;
  }

  function qrStatusLabel(status) {
    return { created: "已创建", scanned: "已扫码待确认", wechat_confirmed: "微信侧已确认，等待 App", completed: "已完成", cancelled: "已取消", expired: "已过期" }[status] || status;
  }

  function renderQr(state) {
    const qr = state.qr;
    const remain = qr ? Math.max(0, Math.ceil((qr.expiresAt - Date.now()) / 1000)) : 0;
    const body = !qr
      ? `<section class="status"><span class="status-icon">i</span><h2>还没有认证会话</h2><p class="support">需要先处于登录后的演示账号。会话由原型里的「后台」签发，不生成可扫描的微信码。</p></section><button class="button primary full" data-auth="qr-create">生成短时演示会话</button>`
      : `<div class="demo-code" role="img" aria-label="演示占位码，不是微信二维码"><div><strong>演示码 / 占位</strong><span>不是微信小程序码，不能扫描</span></div></div><section class="card"><p class="meta">会话 ${esc(qr.id)} · 界面状态 ${esc(qrStatusLabel(qr.status))}</p><p class="support" style="margin-top:8px">短时一次性。剩余约 <span data-qr-remain>${remain}</span> 秒，过期后要重新生成。凭证不包含姓名、手机号或账号。</p><p class="meta" style="margin-top:8px">刷新后的学生身份：${esc(studentLabel(state.studentMark))}。学校：${state.schoolMatch === "confirmed" ? "已确认" : "未确认"}。</p></section><ol class="auth-steps"><li>已登录后生成会话</li><li>对方扫码只进入待确认，不改原账号</li><li>微信侧确认这是要绑定的账号</li><li>发起方在 App 里再确认一次</li><li>点刷新，才从演示后台写入学生标记</li></ol><button class="button ghost full" data-auth="qr-scan">模拟对方扫码（不绑定）</button><button class="button ghost full" data-auth="qr-wechat">模拟微信侧确认</button><button class="button ghost full" data-auth="qr-app">模拟 App 内再次确认</button><button class="button ghost full" data-auth="qr-reject">模拟他人扫到后拒绝</button><button class="button ghost full" data-auth="qr-cancel">取消会话</button><button class="button ghost full" data-auth="qr-expire">模拟过期</button><button class="button primary full" data-auth="qr-refresh">从演示后台刷新</button><button class="button ghost full" data-auth="qr-create">重新生成</button><button class="button ghost full" data-auth="qr-replay">重放已消费凭证</button>`;
    return `<div class="page" data-auth-screen="qr">${flag("备用扫码方案 · 演示 / 待验证 · 未接入微信")}<h1>扫码认证</h1><p class="lead">这是已登录 App 里的备用路径演示。平台用途和小程序能力都还没验证，不能说已经接入。</p>${body}</div>`;
  }

  function renderCatalog() {
    const rows = SCHOOLS.map((school) => `<div class="school-card"><div class="grow"><strong>${esc(school.name)}</strong><p class="meta">${esc(phaseLabel(school.phase))} · 演示配置</p></div><span class="badge">${esc(phaseLabel(school.phase))}</span></div>`).join("");
    return `<div class="page" data-auth-screen="catalog">${flag("学校配置可扩展")}<h1>学校开通</h1><p class="lead">试点打算先在四川选大约两所学校，具体校名、负责人和预算都还没定。配置要能增删，不能在逻辑里写死只能两所。下面四所是虚构演示，用来看见开放、筹备、未开通和暂停，不是上线名单。</p><div class="split-status">${rows}</div><section class="card"><h2>开通状态不等于学生归属</h2><p class="support" style="margin-top:8px">看着一所学校，不会把你改成那所学校的学生。未开通的学校不能发本校内容。封闭试点以后也只是名单限制，不另造一种可见范围。</p></section><button class="button primary full" data-go="auth">返回认证</button></div>`;
  }

  function renderRenewal(state) {
    const school = schoolById(state.schoolId);
    const headline = state.qualification === "expired" ? "资格已失效" : state.qualification === "renewing" ? "旧资格仍有效" : "资格仍是示意有效";
    const detail = state.qualification === "renewing"
      ? "新的核验还在处理。处理中不会自动把旧资格再延长。"
      : state.qualification === "expired"
        ? "失效后不能发布，也不能使用本校权限。续验、帮助和数据权利还在。"
        : "可以继续使用当前演示权限。到期、毕业或状态变化时要重新核验。";
    return `<div class="page" data-auth-screen="renewal">${flag("复核周期未冻结")}<div class="school-card"><div class="grow"><strong>${esc(headline)}</strong><p class="meta">${esc(school && state.schoolMatch === "confirmed" ? school.name : "学校未确认")} · ${esc(qualLabel(state.qualification))}</p></div><span class="badge">${esc(qualLabel(state.qualification))}</span></div><p class="lead">${esc(detail)} 复核暂定一年，示例里不写死某一天，这还不是已批准政策。</p>${cards(state)}<button class="button primary full" data-go="authGuide">按认证路径重新核验</button><button class="button ghost full" data-auth="enter-shell">查看当前权限</button><button class="button ghost full" data-auth="qual" data-qual="renewing">模拟：进入续验，旧资格先保留</button><button class="button ghost full" data-auth="qual" data-qual="expired">模拟：资格失效</button><button class="button ghost full" data-go="help">帮助与数据权利</button></div>`;
  }

  function identity(state) {
    return `<div class="page" data-auth-screen="identity">${flag("学生与学校分开")}<h1>学生资格</h1>${cards(state)}<div class="list">${row("认证记录", "看当前演示结果", "authResult")}${row("资格续验", "暂定一年，未冻结", "renewal")}${row("学校开通配置", "可扩展，不写死两校", "schoolCatalog")}${row("学校信息纠错", "不能自己改归属", "help")}</div>${presets(state)}</div>`;
  }

  function limitedMine(state) {
    return `<div class="page" data-auth-screen="mine-limited"><section class="panel profile-head"><span class="avatar large">林</span><h1>林同学</h1><p class="support">${esc(shortStatus(state))}</p><p class="lead" style="margin-top:10px">演示人物。没有本校成员权时，不展示本校作品墙。</p></section>${cards(state)}<div class="list">${row("学生认证", "学生和学校两个状态", "auth")}${row("学校开通配置", "演示目录，可扩展", "schoolCatalog")}${row("资格续验", "暂定一年，未冻结", "renewal")}${row("帮助与反馈", "受限时仍可进入", "help")}${row("设置", "文字显示与退出", "settings")}</div></div>`;
  }

  function renderResult(state) {
    const [title, body] = reason(state);
    const passed = allowSchoolFeed(state);
    return `<div class="page" data-auth-screen="result">${flag()}${cards(state)}<section class="status ${passed ? "" : "warning"}"><span class="status-icon">${passed ? "✓" : "!"}</span><h2>${passed ? "可以进入本校演示" : esc(title)}</h2><p class="support">${passed ? "学生、学校和开通状态都满足当前演示。资格复核仍是暂定一年，没有冻结具体日期。" : esc(body)}</p></section><button class="button primary full" data-auth="enter-shell">${passed ? "进入校园" : "查看当前权限"}</button>${passed ? "" : `<button class="button ghost full" data-go="authGuide">重新选择路径</button>`}<button class="button ghost full" data-go="auth">返回认证</button></div>`;
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
      if (!applyPreset(state, dataset.preset)) toastNeed(api, "没有这个演示状态");
      api.render();
      return;
    }
    if (action === "enter-shell") {
      api.go("campus");
      return;
    }
    if (action === "pick-path") {
      state.authPath = dataset.path;
      if (dataset.path === "manual") api.go("authManual");
      else if (dataset.path === "qr") {
        if (!state.loggedIn) {
          api.toast("请先登录，再生成认证会话");
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
      api.toast("这是模拟结果，没有请求外部认证");
      api.go("authResult");
      return;
    }
    if (action === "declare-school") {
      state.declaredSchoolId = dataset.schoolId;
      api.toast("已记下声明学校，还不是已核验归属");
      api.render();
      return;
    }
    if (action === "material") {
      state.material = dataset.material;
      api.render();
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
          api.toast("毕业、结业、肄业不默认通过");
        } else if (!state.declaredSchoolId) {
          api.toast("先选择声明学校。声明本身不会自动匹配成功");
          api.render();
          return;
        } else {
          state.studentMark = "confirmed";
          state.schoolMatch = "confirmed";
          state.schoolId = state.declaredSchoolId;
          state.qualification = "active";
          api.toast("模拟人工确认了学校匹配，不是接口返回");
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
        api.toast("认证会话只发给已登录的演示账号");
        api.go("login");
        return;
      }
      const qr = newQr();
      state.qr = clone(qr);
      state.server.qr = qr;
      state.authPath = "qr";
      api.toast("已生成短时一次性演示会话");
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
      api.toast("已从演示后台刷新。没有接收微信回调");
      api.render();
      return;
    }
    if (action === "qr-replay") {
      api.toast("凭证已作废或已消费，不会再次变更学生标记");
      return;
    }
    if (action === "qual") {
      if (state.studentMark !== "confirmed" || state.schoolMatch !== "confirmed") {
        api.toast("还没有可续验的学生加学校资格");
        return;
      }
      state.qualification = dataset.qual;
      if (dataset.qual === "expired") api.toast("资格已按演示失效，本校权限收回");
      if (dataset.qual === "renewing") api.toast("续验处理中，旧资格先保留，不会自动加时");
      derive(state);
      rememberServer(state);
      api.render();
      return;
    }
    const qr = state.server.qr;
    if (!qr) {
      api.toast("请先生成演示会话");
      return;
    }
    expireIfNeeded(qr);
    if (action === "qr-expire") {
      qr.status = "expired";
      api.toast("会话已在演示后台过期。刷新后界面才会跟上，账号标记不变");
      return;
    }
    if (action === "qr-cancel") {
      qr.status = "cancelled";
      api.toast("会话已取消。刷新前账号标记不变");
      return;
    }
    if (action === "qr-reject") {
      qr.status = "cancelled";
      api.toast("这是他人发起的会话，已拒绝。首次扫到不会绑定");
      return;
    }
    if (qr.status === "expired" || qr.status === "cancelled" || qr.status === "completed") {
      api.toast(qr.status === "completed" ? "会话已完成，请重新生成，不能复用旧凭证" : "会话已结束，请重新生成");
      return;
    }
    if (action === "qr-scan") {
      qr.status = "scanned";
      api.toast("后台记为已扫码待确认。学生标记还没变，请刷新查看");
      return;
    }
    if (action === "qr-wechat") {
      if (qr.status !== "scanned" && qr.status !== "wechat_confirmed") {
        api.toast("要先模拟扫码。扫码本身不会绑定");
        return;
      }
      qr.status = "wechat_confirmed";
      qr.wechatConfirmed = true;
      api.toast("微信侧已确认。还要 App 内再确认，刷新前也不写账号");
      return;
    }
    if (action === "qr-app") {
      if (!qr.wechatConfirmed || qr.status !== "wechat_confirmed") {
        api.toast("还缺微信侧确认，不能由 App 单方面绑上");
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
      api.toast("双方已确认。请刷新后才会看到学生标记，学校仍然未确认");
    }
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
