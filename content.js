(() => {
  const ROOT_ID = "bah-root";
  const STORAGE_PROFILE = "bossApplyHelper.profile";
  const STORAGE_STATUS = "bossApplyHelper.status";
  const STORAGE_SETTINGS = "bossApplyHelper.settings";
  const STORAGE_GREETING_LOG = "bossApplyHelper.greetingLog";
  const SESSION_PENDING_SEND = "bossApplyHelper.pendingSend";
  const SESSION_BATCH_SEND = "bossApplyHelper.batchSend";
  const SESSION_SEND_GUARD = "bossApplyHelper.sendGuard";
  const SESSION_AUTO_START = "bossApplyHelper.autoStart";
  const STAGNANT_LOAD_LIMIT = 3;
  const DEFAULT_QUICK_TEMPLATE = "{salutation}，我对贵公司的{title}岗位很感兴趣，经验和岗位要求比较匹配，保证出勤率和实习时间。希望贵公司可以给我一个机会！";
  const LEGACY_QUICK_TEMPLATES = [
    "您好，我对{company}的{title}岗位很感兴趣，经验和岗位要求比较匹配，方便的话希望进一步沟通，谢谢。",
    "您好，我对{company}的{title}岗位很感兴趣，经验和岗位要求比较匹配，保证出勤率和实习时间。方便的话希望进一步沟通，谢谢。",
    "您好，我对贵公司的{title}岗位很感兴趣，经验和岗位要求比较匹配，保证出勤率和实习时间。希望贵公司可以给我一个机会！",
  ];

  const state = {
    allJobs: [],
    jobs: [],
    selectedIndex: 0,
    replyCount: 0,
    lastMessage: "",
    preparing: false,
    prepareToken: "",
    greetingLog: {},
    profile: {
      name: "",
      target: "",
      skills: "",
      highlights: "",
      resume: "",
    },
    status: {},
    settings: {
      collapsed: false,
      mode: "intro",
      quickTemplate: DEFAULT_QUICK_TEMPLATE,
      filterInclude: "AI,算法,实习生",
      filterExclude: "",
      filterCity: "上海",
      minSalary: "",
      autoBatchLimit: "0",
      resumeReplyTemplate: "您好，感谢回复。我把简历发您，麻烦查收，期待进一步沟通。",
    },
    root: null,
  };

  init();

  async function init() {
    if (document.getElementById(ROOT_ID)) return;
    await loadStorage();
    state.preparing = Boolean(readAutoStartAfterReturn());
    createPanel();
    bindRuntimeMessages();
    if (isBossJobListPage() || readPendingSend() || readBatchSend()?.running) scanJobs();
    scanReplies(true);
    resumeAutoStartAfterReturn();
    resumePendingSend();
    resumeBatchSend();
    window.addEventListener("popstate", () => window.setTimeout(resumeAutoStartAfterReturn, 500));
    window.setInterval(() => scanReplies(true), 20000);
  }

  function loadStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_PROFILE, STORAGE_STATUS, STORAGE_SETTINGS, STORAGE_GREETING_LOG], (items) => {
        const savedSettings = items[STORAGE_SETTINGS] || {};
        state.profile = { ...state.profile, ...(items[STORAGE_PROFILE] || {}) };
        state.status = items[STORAGE_STATUS] || {};
        state.settings = { ...state.settings, ...savedSettings };
        state.settings.filterInclude = state.settings.filterInclude || "AI,算法,实习生";
        state.settings.filterCity = state.settings.filterCity || "上海";
        if (!cleanText(savedSettings.quickTemplate) || LEGACY_QUICK_TEMPLATES.includes(cleanText(savedSettings.quickTemplate))) {
          state.settings.quickTemplate = DEFAULT_QUICK_TEMPLATE;
          chrome.storage.local.set({ [STORAGE_SETTINGS]: state.settings });
        }
        state.greetingLog = items[STORAGE_GREETING_LOG] || {};
        resolve();
      });
    });
  }

  function saveProfile() {
    chrome.storage.local.set({ [STORAGE_PROFILE]: state.profile });
  }

  function saveStatus() {
    chrome.storage.local.set({ [STORAGE_STATUS]: state.status });
  }

  function saveSettings() {
    chrome.storage.local.set({ [STORAGE_SETTINGS]: state.settings });
  }

  function saveGreetingLog() {
    chrome.storage.local.set({ [STORAGE_GREETING_LOG]: state.greetingLog });
  }

  function bindRuntimeMessages() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "BAH_TOGGLE_PANEL") {
        state.settings.collapsed = !state.settings.collapsed;
        saveSettings();
        render();
        sendResponse({ ok: true, collapsed: state.settings.collapsed });
      }
      if (message?.type === "BAH_SCAN") {
        scanJobs();
        sendResponse({ ok: true, count: state.jobs.length });
      }
      return true;
    });
  }

  function createPanel() {
    state.root = document.createElement("div");
    state.root.id = ROOT_ID;
    document.documentElement.appendChild(state.root);
    render();
  }

  function render() {
    const selected = getSelectedJob();
    const batch = readBatchSend();
    const running = Boolean(batch?.running);
    const busy = running || state.preparing;
    const remaining = state.jobs.filter((job) => !hasSentGreeting(job)).length;
    state.root.innerHTML = `
      <div class="bah-panel ${state.settings.collapsed ? "bah-collapsed" : ""}">
        <div class="bah-header">
          <div class="bah-title">
            <strong>BOSS 投递助手</strong>
            <span data-status-line>${escapeHtml(statusLine())}</span>
          </div>
          <div class="bah-row">
            <button class="bah-button" data-action="collapse" type="button">${state.settings.collapsed ? "展开" : "收起"}</button>
          </div>
        </div>
        <div class="bah-body">
          <div class="bah-simple-form">
            <div class="bah-grid">
              <label class="bah-label">关键词（用 , 隔开）
                <input class="bah-input" data-setting="filterInclude" value="${escapeAttr(state.settings.filterInclude)}" placeholder="AI,算法,实习生">
              </label>
              <label class="bah-label">城市（用 , 隔开）
                <input class="bah-input" data-setting="filterCity" value="${escapeAttr(state.settings.filterCity)}" placeholder="上海,南通,北京,苏州">
              </label>
            </div>
            <label class="bah-label">招呼语
              <textarea class="bah-textarea bah-template" data-setting="quickTemplate" placeholder="{salutation}，我对贵公司的{title}岗位很感兴趣。">${escapeHtml(state.settings.quickTemplate)}</textarea>
            </label>
            <div class="bah-grid bah-compact-grid">
              <label class="bah-label">发送上限（0 = 全部）
                <input class="bah-input" data-setting="autoBatchLimit" value="${escapeAttr(state.settings.autoBatchLimit)}" inputmode="numeric" placeholder="0">
              </label>
              <div class="bah-current">
                <span class="bah-label">当前识别</span>
                <strong>${escapeHtml(selected?.title || "暂无匹配岗位")}</strong>
                <small>${escapeHtml(selected ? [selected.company, selected.location].filter(Boolean).join(" · ") : `待处理 ${remaining} 个`)}</small>
              </div>
            </div>
            <div class="bah-row">
              <button class="bah-button bah-button-success bah-grow" data-action="startAuto" type="button" ${busy ? "disabled" : ""}>${state.preparing ? "正在准备" : "开始全自动"}</button>
              <button class="bah-button bah-button-danger" data-action="stopBatch" type="button" ${busy ? "" : "disabled"}>停止</button>
            </div>
            <div class="bah-action-status" data-action-status>${escapeHtml(state.lastMessage || (running ? `全自动运行中：已发送 ${batch.sentCount || 0}/${batchLimitLabel(batch)}` : "就绪"))}</div>
          </div>
        </div>
      </div>
      <div class="bah-toast" role="status"></div>
    `;
    bindPanelEvents();
    highlightSelected();
  }

  function bindPanelEvents() {
    state.root.querySelectorAll("[data-action]").forEach((button) => {
      const action = button.dataset.action;
      if (action === "mode") {
        button.addEventListener("change", () => {
          state.settings.mode = button.value;
          saveSettings();
          render();
        });
        return;
      }
      button.addEventListener("click", () => handleAction(action));
    });

    state.root.querySelectorAll("[data-profile]").forEach((input) => {
      input.addEventListener("input", () => {
        state.profile[input.dataset.profile] = input.value.trim();
        saveProfile();
        refreshDraftOnly();
      });
    });

    state.root.querySelectorAll("[data-setting]").forEach((input) => {
      input.addEventListener("input", () => {
        state.settings[input.dataset.setting] = input.value.trim();
        saveSettings();
        refreshDraftOnly();
      });
    });

    state.root.querySelectorAll("[data-index]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedIndex = Number(button.dataset.index);
        render();
        scrollSelectedIntoView();
      });
    });

    const draft = state.root.querySelector("[data-draft]");
    draft?.addEventListener("input", () => {
      markSelected("drafted", false);
    });
  }

  function handleAction(action) {
    if (action === "collapse") {
      state.settings.collapsed = !state.settings.collapsed;
      saveSettings();
      render();
      return;
    }
    if (action === "scan") {
      scanJobs();
      return;
    }
    if (action === "next") {
      selectNext();
      return;
    }
    if (action === "copy") {
      copyDraft();
      return;
    }
    if (action === "fill") {
      fillVisibleInput();
      return;
    }
    if (action === "sendGreeting") {
      sendCurrentGreeting();
      return;
    }
    if (action === "startAuto") {
      startKeywordAutoApply();
      return;
    }
    if (action === "startBatch") {
      startBatchSend();
      return;
    }
    if (action === "stopBatch") {
      stopBatchSend();
      return;
    }
    if (action === "fillResume") {
      fillResumeReply();
      return;
    }
    if (action === "sendResumeReply") {
      sendResumeReply();
      return;
    }
    if (action === "copyResume") {
      copyResumeReply();
      return;
    }
    if (action === "scanReplies") {
      scanReplies(false);
      return;
    }
    if (action === "highlightResume") {
      highlightResumeControls();
      return;
    }
    if (action === "open") {
      openSelectedJob();
      return;
    }
    if (action === "applied") {
      markSelected("applied", true);
      selectNext();
      return;
    }
    if (action === "skip") {
      markSelected("skipped", true);
      selectNext();
    }
  }

  function scanJobs() {
    const extracted = extractJobs();
    const existingKey = getSelectedJob() ? jobKey(getSelectedJob()) : "";
    state.allJobs = extracted;
    state.jobs = extracted.filter(matchesFilters);
    const selectedIndex = state.jobs.findIndex((job) => jobKey(job) === existingKey);
    state.selectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
    render();
    showToast(extracted.length ? `已识别 ${extracted.length} 条，匹配 ${state.jobs.length} 条` : "未识别到职位，进入职位列表页后再试");
  }

  function extractJobs() {
    const links = Array.from(document.querySelectorAll('a[href*="/job_detail/"], a[href*="job_detail"]'));
    const cards = links.map((link) => {
      const card = closestCard(link);
      return extractFromCard(card || link, link);
    });

    const detail = extractDetailPage();
    if (detail) cards.unshift(detail);

    const unique = new Map();
    cards.forEach((job) => {
      if (!job || (!job.title && !job.company && !job.url)) return;
      unique.set(jobKey(job), job);
    });
    return Array.from(unique.values());
  }

  function closestCard(link) {
    const selectors = [
      ".job-card-wrapper",
      ".job-card-body",
      ".job-primary",
      ".job-list-box li",
      ".job-list li",
      "li",
      "[class*='job-card']",
      "[class*='job-primary']",
    ];
    for (const selector of selectors) {
      const found = link.closest(selector);
      if (found) return found;
    }
    return link.parentElement;
  }

  function extractFromCard(card, link) {
    const text = cleanText(card.innerText || link.innerText || "");
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const title = readText(card, [
      ".job-name",
      ".job-title",
      "[class*='job-name']",
      "[class*='job-title']",
      "a[href*='/job_detail/']",
    ]) || lines[0] || "";
    const company = readText(card, [
      ".company-name",
      "[class*='company-name']",
      ".company-text",
      "[class*='company'] a",
    ]) || guessCompany(lines, title);
    const hr = readText(card, [
      ".boss-name",
      ".recruiter-name",
      ".user-name",
      "[class*='boss-name']",
      "[class*='recruiter'] [class*='name']",
      "[class*='recruiter-name']",
      "[class*='user-name']",
    ]);
    const salary = readText(card, [".salary", "[class*='salary']", ".red", "[class*='red']"]) || guessSalary(lines);
    const location = readText(card, [
      ".job-area",
      ".job-location",
      ".job-address",
      "[class*='job-area']",
      "[class*='location']",
      "[class*='address']",
    ]) || guessLocation(lines);
    return {
      title,
      company,
      hr,
      salary,
      location,
      url: normalizeUrl(link.getAttribute("href") || location.href),
      text,
      element: card,
    };
  }

  function extractDetailPage() {
    if (!location.href.includes("job_detail")) return null;
    const title = readText(document, [".job-title", ".name", "h1", "[class*='job-title']"]);
    const company = readText(document, [".company-name", "[class*='company-name']", ".sider-company .name"]);
    const hr = readText(document, [
      ".boss-name",
      ".recruiter-name",
      ".job-boss-info .name",
      ".detail-op .name",
      "[class*='boss-name']",
      "[class*='recruiter'] [class*='name']",
    ]);
    const salary = readText(document, [".salary", "[class*='salary']", ".job-banner .red"]);
    const area = readText(document, [".job-area", ".location-address", "[class*='location']"]);
    const text = cleanText(document.querySelector(".job-detail, .job-sec, .job-detail-section, main")?.innerText || document.body.innerText || "");
    if (!title && !company) return null;
    return {
      title,
      company,
      hr,
      salary,
      location: area,
      url: normalizeUrl(location.href),
      text,
      element: document.querySelector("main") || document.body,
    };
  }

  function readText(root, selectors) {
    for (const selector of selectors) {
      const element = root.querySelector?.(selector);
      const value = cleanText(element?.innerText || element?.textContent || "");
      if (value) return value.split("\n")[0].trim();
    }
    return "";
  }

  function guessCompany(lines, title) {
    return lines.find((line) => line !== title && !line.includes("K") && !line.includes("薪")) || "";
  }

  function guessSalary(lines) {
    return lines.find((line) => /\d+\s*-\s*\d+\s*K|薪|面议/i.test(line)) || "";
  }

  function guessLocation(lines) {
    return lines.find((line) => /北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|远程/.test(line)) || "";
  }

  function matchesFilters(job) {
    return matchesKeywordAutoTarget(job);
  }

  function matchesKeywordAutoTarget(job, searchTarget = null) {
    const text = normalizeIdentityText([job.title, job.company, job.location, job.text].filter(Boolean).join(" "));
    const keywords = searchTarget?.keyword ? [searchTarget.keyword] : splitList(state.settings.filterInclude);
    const cities = searchTarget?.cityName
      ? [normalizeIdentityText(searchTarget.cityName)]
      : splitList(state.settings.filterCity).map(normalizeIdentityText);
    const keywordsOk = keywords.length > 0 && keywords.some((keyword) => keywordGroupMatches(keyword, text));
    const cityOk = cities.length > 0 && cities.some((city) => text.includes(city));
    return keywordsOk && cityOk && isActiveRecruitingJob(job);
  }

  function keywordGroupMatches(keyword, text) {
    const alternatives = String(keyword || "")
      .split(/[\/|｜、]/)
      .map(normalizeIdentityText)
      .filter(Boolean);
    return alternatives.some((item) => {
      if (/^(ai|人工智能|算法|机器学习|深度学习)$/.test(item)) {
        return /(^|[^a-z])ai([^a-z]|$)|aigc|人工智能|大模型|llm|算法|机器学习|深度学习|nlp|自然语言|计算机视觉|推荐|搜索|数据挖掘/.test(text);
      }
      if (/^(实习|实习生|intern|internship)$/.test(item)) {
        return /实习|实习生|intern|internship|校招/.test(text);
      }
      return text.includes(item);
    });
  }

  function matchesShanghaiAiAlgorithmIntern(job) {
    const text = normalizeIdentityText([job.title, job.company, job.location, job.text].filter(Boolean).join(" "));
    const cityOk = /上海|shanghai/.test(text);
    const internOk = /实习|实习生|intern|校招/.test(text);
    const aiOk = /(^|[^a-z])ai([^a-z]|$)|人工智能|大模型|llm|算法|机器学习|深度学习|nlp|自然语言|计算机视觉|推荐算法|搜索算法|数据挖掘/.test(text);
    return cityOk && internOk && aiOk && isActiveRecruitingJob(job);
  }

  function isActiveRecruitingJob(job) {
    const text = normalizeIdentityText([job.title, job.company, job.location, job.text, job.element?.innerText].filter(Boolean).join(" "));
    return !/停招|暂停招聘|停止招聘|已关闭|已下线|已结束|招满|不招|暂不招聘|职位关闭|停止招募|暂停招募/.test(text);
  }

  function buildMessage(job) {
    if (state.settings.mode === "intro" && state.settings.quickTemplate) {
      return renderTemplate(state.settings.quickTemplate, job);
    }

    const skills = splitList(state.profile.skills).slice(0, 5);
    const highlights = splitList(state.profile.highlights).slice(0, 3);
    const keywords = extractKeywords(job).slice(0, 5);
    const name = state.profile.name || "我";
    const target = state.profile.target || job.title || "相关岗位";
    const company = job.company || "贵公司";
    const title = job.title || target;

    if (state.settings.mode === "email") {
      return [
        `主题：应聘${company}${title} - ${state.profile.name || "候选人"}`,
        "",
        "您好，",
        "",
        `我想应聘${company}的${title}。我的目标方向是${target}，和岗位匹配的点包括：`,
        ...toBullets([...keywords, ...skills].slice(0, 6)),
        ...toBullets(highlights),
        "",
        state.profile.resume ? `简历文件：${state.profile.resume}` : "",
        "期待进一步沟通，谢谢。",
      ].filter((line) => line !== "").join("\n");
    }

    if (state.settings.mode === "followup") {
      return [
        `您好，我是${name}，之前关注了${company}的${title}岗位。`,
        `我对这个方向仍然很感兴趣，尤其是${joinReadable(keywords.slice(0, 3)) || "岗位职责"}。`,
        "如果需要补充简历、作品集或项目细节，我可以随时提供。谢谢。",
      ].join("\n");
    }

    return [
      `您好，我想应聘${company}的${title}。`,
      `我的目标方向是${target}，匹配点包括：${joinReadable([...keywords, ...skills].slice(0, 6)) || "相关项目经验"}。`,
      highlights.length ? `相关经历：${joinReadable(highlights)}。` : "",
      state.profile.resume ? `简历文件：${state.profile.resume}。` : "",
      "期待有机会进一步沟通，谢谢。",
    ].filter(Boolean).join("\n");
  }

  function renderTemplate(template, job) {
    const hr = safeHrForJob(job.hr, job);
    const values = {
      company: job.company || "贵公司",
      hr,
      title: job.title || state.profile.target || "相关岗位",
      location: job.location || "",
      salary: job.salary || "",
      salutation: buildHrSalutation(hr),
      name: state.profile.name || "",
      target: state.profile.target || job.title || "相关岗位",
      resume: state.profile.resume || "",
    };
    return template.replace(/\{(company|hr|title|location|salary|salutation|name|target|resume)\}/g, (_match, key) => values[key]);
  }

  function buildHrSalutation(value) {
    const label = safeHrDisplayName(value);
    if (!label) return "您好，招聘负责人";
    if (/(女士|先生|HR|经理|老师)$/i.test(label)) return `您好，${label}`;
    return `您好，${label}老师`;
  }

  function safeHrForJob(value, job = {}) {
    const label = safeHrDisplayName(value);
    if (!label) return "";
    const candidate = normalizeIdentityText(label);
    const company = normalizeIdentityText(job.company || "");
    const title = normalizeIdentityText(job.title || job.jobTitle || "");
    const overlapsCompany = company && candidate.length >= 2 && (company.includes(candidate) || candidate.includes(company));
    const overlapsTitle = title && candidate.length >= 2 && (title.includes(candidate) || candidate.includes(title));
    if (overlapsCompany || overlapsTitle) return "";
    return label;
  }

  function safeHrDisplayName(value) {
    let label = cleanText(value)
      .split(/[\n·|｜]/)[0]
      .replace(/\s*(?:刚刚活跃|今日活跃|本周活跃|在线|活跃|刚刚回复|已回复).*$/i, "")
      .replace(/\s+[Vv]\d*$/, "")
      .trim();
    if (!label) return "";

    const genderTitle = label.match(/^(.{1,20}?)(女士|先生|小姐)/);
    if (genderTitle) {
      const name = cleanHrName(genderTitle[1]);
      if (isPlausibleHrName(name)) return `${name}${genderTitle[2] === "小姐" ? "女士" : genderTitle[2]}`;
    }

    const spacedHr = label.match(/^(.{1,20}?)\s*HR(?:\b|$)/i);
    if (spacedHr) {
      const name = cleanHrName(spacedHr[1]);
      if (isPlausibleHrName(name)) return `${name}HR`;
    }
    const prefixedHr = label.match(/^HR\s*(.{1,20})$/i);
    if (prefixedHr) {
      const name = cleanHrName(prefixedHr[1]);
      if (isPlausibleHrName(name)) return `${name}HR`;
    }
    const professionalTitle = label.match(/^(.{1,8}?)(经理|老师)$/);
    if (professionalTitle) {
      const name = cleanHrName(professionalTitle[1]);
      if (isPlausibleHrName(name)) return `${name}${professionalTitle[2]}`;
    }

    label = label
      .replace(/\s+(?:招聘者|招聘经理|招聘专员|人事经理|人事专员|人力资源|猎头|顾问).*$/i, "")
      .trim();
    const tokens = label.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && /^[\u3400-\u9fff]{1,6}$/.test(tokens[0])) label = tokens[0];
    const compact = normalizeIdentityText(label);
    if (!compact || /^(boss|hr|hrbp|hrd|招聘者|招聘经理|招聘专员|人事|人事经理|人事专员|人力资源|猎头|顾问)$/.test(compact)) return "";
    if (!isPlausibleHrName(label)) return "";
    return cleanHrName(label);
  }

  function cleanHrName(value) {
    return cleanText(value)
      .replace(/^[：:，,。\s]+|[：:，,。\s]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function isPlausibleHrName(value) {
    const name = cleanHrName(value);
    const compact = normalizeIdentityText(name);
    if (!compact || /招聘|人事|人力|猎头|顾问|公司|科技|集团|岗位|职位|课程|产品|项目|运营|算法|工程师/.test(compact)) return false;
    return /^[\u3400-\u9fff]{1,6}$/.test(name) || /^[a-z][a-z ._'-]{0,23}$/i.test(name);
  }

  function enrichPendingGreeting(pending, discoveredHr = "") {
    if (!pending || pending.kind !== "greeting") return pending;
    const job = {
      company: pending.company || "",
      hr: discoveredHr || pending.hr || "",
      location: pending.location || "",
      salary: pending.salary || "",
      title: pending.jobTitle || "",
    };
    const hr = safeHrForJob(job.hr, job);
    const template = pending.template || state.settings.quickTemplate;
    if (!template) return pending;
    const text = renderTemplate(template, { ...job, hr });
    if (hr === (pending.hr || "") && text === pending.text && pending.template) return pending;
    return { ...pending, hr, template, text };
  }

  function refreshDraftOnly() {
    const draft = state.root.querySelector("[data-draft]");
    const selected = getSelectedJob();
    if (draft && selected) draft.value = buildMessage(selected);
  }

  async function copyDraft() {
    const text = getDraftText();
    if (!text) {
      showToast("没有可复制文案");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      fallbackCopy(text);
    }
    markSelected("drafted", true);
    showToast("文案已复制");
  }

  async function copyResumeReply() {
    const text = buildResumeReply();
    if (!text) {
      showToast("没有可复制的简历回复文案");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      fallbackCopy(text);
    }
    showToast("简历回复文案已复制");
  }

  function fillResumeReply() {
    const text = buildResumeReply();
    if (!text) {
      showToast("没有可填入的简历回复文案");
      return;
    }
    fillTextIntoMessageInput(text, "已填入简历回复，请手动上传/发送简历");
  }

  function sendResumeReply() {
    const text = buildResumeReply();
    if (!text) {
      showToast("没有可发送的简历回复文案");
      return;
    }
    sendTextMessage(text, "已点击发送简历回复，请手动处理简历文件", "resumeReply");
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function fillVisibleInput() {
    const text = getDraftText();
    if (!text) {
      showToast("没有可填入文案");
      return;
    }
    fillTextIntoMessageInput(text, "已填入输入框，请确认后手动发送");
  }

  function sendCurrentGreeting() {
    const selected = getSelectedJob();
    if (!selected) {
      showToast("没有选中的职位");
      return;
    }
    if (hasSentGreeting(selected)) {
      markSelected("applied", true);
      showToast("该岗位已经发过打招呼消息，已阻止重复发送");
      return;
    }
    const text = getDraftText();
    if (!text) {
      showToast("没有可发送文案");
      return;
    }
    sendTextMessage(text, "已点击发送按钮", "greeting");
  }

  async function startKeywordAutoApply() {
    if (!cleanText(state.settings.filterInclude) || !cleanText(state.settings.filterCity)) {
      showToast("请先填写关键词和城市，已阻止无条件批量发送");
      return;
    }
    if (!cleanText(state.settings.quickTemplate)) {
      showToast("请先填写招呼语");
      return;
    }
    state.settings.mode = "intro";
    state.settings.autoBatchLimit = state.settings.autoBatchLimit || "0";
    saveSettings();
    const prepareToken = `prepare-${Date.now()}`;
    state.prepareToken = prepareToken;
    state.preparing = true;
    render();
    showToast("正在读取 BOSS 城市并准备搜索");
    try {
      const searchTargets = await buildBossSearchTargets();
      if (state.prepareToken !== prepareToken) return;
      const options = {
        autoNextPage: true,
        maxPages: 0,
        preset: "keywordAuto",
        searchIndex: 0,
        searchTargets,
        strictTarget: true,
      };
      scheduleAutoStartAfterReturn(options);
      const firstTarget = searchTargets[0];
      if (searchTargetMatchesLocation(firstTarget)) {
        window.sessionStorage.removeItem(SESSION_AUTO_START);
        state.preparing = false;
        state.prepareToken = "";
        startBatchSend(options);
        return;
      }
      showToast(`正在搜索 ${firstTarget.cityName}：${firstTarget.query}`);
      location.assign(firstTarget.url);
    } catch (error) {
      if (state.prepareToken !== prepareToken) return;
      state.preparing = false;
      state.prepareToken = "";
      render();
      showToast(error?.message || "无法准备 BOSS 搜索");
    }
  }

  function isJobDetailPage() {
    return /\/job_detail\//i.test(location.pathname || location.href);
  }

  function isBossJobListPage() {
    try {
      return ["/web/geek/job", "/web/geek/jobs"].includes(new URL(location.href, location.origin).pathname.replace(/\/$/, ""));
    } catch {
      return /\/web\/geek\/jobs?(?:[?#]|$)/i.test(location.href);
    }
  }

  async function buildBossSearchTargets() {
    const keywords = uniqueStrings(splitList(state.settings.filterInclude));
    const cityNames = uniqueStrings(splitList(state.settings.filterCity));
    if (!keywords.length || !cityNames.length) throw new Error("请填写关键词和城市");
    const cityMap = await fetchBossCityMap();
    const unresolved = cityNames.filter((cityName) => !cityMap.has(normalizeCityName(cityName)));
    if (unresolved.length) throw new Error(`BOSS 未识别这些城市：${unresolved.join(",")}`);
    return expandBossSearchTargets(keywords, cityNames, cityMap);
  }

  function expandBossSearchTargets(keywords, cityNames, cityMap) {
    return cityNames.flatMap((cityName) => {
      const city = cityMap.get(normalizeCityName(cityName));
      return keywords.map((keyword) => ({
        cityCode: String(city.code),
        cityName: city.name,
        keyword,
        query: keyword,
        url: buildBossSearchUrl(keyword, city.code),
      }));
    });
  }

  async function fetchBossCityMap() {
    const response = await fetch(new URL("/wapi/zpCommon/data/cityGroup.json", location.origin).href, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("读取 BOSS 城市失败");
    const payload = await response.json();
    if (payload?.code !== 0) throw new Error(payload?.message || "读取 BOSS 城市失败");
    const cities = [];
    collectCityEntries(payload?.zpData, cities);
    const map = new Map();
    cities.forEach((city) => {
      const key = normalizeCityName(city.name);
      if (key && city.code && !map.has(key)) map.set(key, city);
    });
    return map;
  }

  function collectCityEntries(value, output) {
    if (Array.isArray(value)) {
      value.forEach((item) => collectCityEntries(item, output));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (value.name && value.code) output.push({ code: value.code, name: value.name });
    Object.values(value).forEach((item) => {
      if (item && typeof item === "object") collectCityEntries(item, output);
    });
  }

  function normalizeCityName(value) {
    return normalizeIdentityText(value).replace(/市$/, "");
  }

  function buildBossSearchUrl(query, cityCode) {
    const url = new URL("/web/geek/jobs", location.origin);
    url.searchParams.set("query", query);
    url.searchParams.set("city", String(cityCode));
    return url.href;
  }

  function searchTargetMatchesLocation(target) {
    if (!target || !isBossJobListPage()) return false;
    try {
      const current = new URL(location.href, location.origin);
      return current.searchParams.get("city") === String(target.cityCode)
        && normalizeIdentityText(current.searchParams.get("query")) === normalizeIdentityText(target.query);
    } catch {
      return false;
    }
  }

  function scheduleAutoStartAfterReturn(options) {
    window.sessionStorage.setItem(SESSION_AUTO_START, JSON.stringify({
      createdAt: Date.now(),
      options,
    }));
  }

  function readAutoStartAfterReturn() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_AUTO_START);
      if (!raw) return null;
      const request = JSON.parse(raw);
      if (!request?.createdAt || Date.now() - request.createdAt > 2 * 60 * 1000) {
        window.sessionStorage.removeItem(SESSION_AUTO_START);
        return null;
      }
      return request;
    } catch {
      window.sessionStorage.removeItem(SESSION_AUTO_START);
      return null;
    }
  }

  function resumeAutoStartAfterReturn() {
    const request = readAutoStartAfterReturn();
    if (!request) return;
    const options = request.options || {};
    const target = options.searchTargets?.[options.searchIndex || 0];
    if (!target) {
      window.sessionStorage.removeItem(SESSION_AUTO_START);
      showToast("没有可执行的 BOSS 搜索城市");
      return;
    }
    if (!searchTargetMatchesLocation(target)) {
      location.assign(target.url);
      return;
    }
    window.sessionStorage.removeItem(SESSION_AUTO_START);
    state.preparing = false;
    state.prepareToken = "";
    render();
    window.setTimeout(() => startBatchSend(options), 1000);
  }

  function startBatchSend(options = {}) {
    if (readBatchSend()?.running) {
      showToast("全自动已经在运行");
      return;
    }
    if (readPendingSend()) {
      showToast("当前发送还没结束，请稍等或点停止连续");
      return;
    }
    scanJobs();
    const queue = buildBatchQueue(options);
    const searchTargets = Array.isArray(options.searchTargets) ? options.searchTargets : [];
    if (!queue.length && !searchTargets.length) {
      showToast(options.preset === "keywordAuto" ? "没有找到符合关键词、城市且未沟通过的在招岗位" : "没有可连续发送的匹配岗位，请调整筛选条件");
      return;
    }
    const limit = readBatchLimit(queue.length, Boolean(options.autoNextPage));
    const unlimited = isUnlimitedBatchLimit();
    const configuredMaxPages = Number(options.maxPages);
    updateBatchSend({
      autoNextPage: Boolean(options.autoNextPage),
      awaitingMore: false,
      completedKeys: [],
      createdAt: Date.now(),
      failedCount: 0,
      failedKeys: [],
      id: `batch-${Date.now()}`,
      limit,
      maxPages: Number.isFinite(configuredMaxPages) ? Math.max(0, Math.floor(configuredMaxPages)) : 1,
      observedJobKeys: [],
      pageStartedAt: Date.now(),
      pageTurns: 0,
      preset: options.preset || "",
      queue,
      returnAttempts: 0,
      running: true,
      searchIndex: Number(options.searchIndex || 0),
      searchTargets,
      stagnantLoads: 0,
      strictTarget: Boolean(options.strictTarget),
      sentCount: 0,
      unlimited,
    });
    state.preparing = false;
    state.prepareToken = "";
    render();
    const currentSearch = searchTargets[Number(options.searchIndex || 0)];
    const limitText = unlimited ? "发送全部匹配岗位" : `最多发送 ${limit} 个岗位`;
    showToast(currentSearch
      ? `开始搜索 ${currentSearch.cityName} · ${currentSearch.keyword || currentSearch.query}：${limitText}`
      : `连续发送已开始：${limitText}`);
    continueBatchSend(300);
  }

  function stopBatchSend(message = "已停止连续发送") {
    state.preparing = false;
    state.prepareToken = "";
    window.sessionStorage.removeItem(SESSION_AUTO_START);
    clearBatchSend();
    clearPendingSend();
    showToast(message);
    render();
  }

  function resumeBatchSend() {
    const batch = readBatchSend();
    if (!batch?.running || readPendingSend()) return;
    showToast(`继续连续发送：已发 ${batch.sentCount || 0}/${batchLimitLabel(batch)}`);
    continueBatchSend(1000);
  }

  function continueBatchSend(delay = 0) {
    if (delay > 0) {
      window.setTimeout(runBatchStep, delay);
      return;
    }
    runBatchStep();
  }

  function runBatchStep() {
    const batch = readBatchSend();
    if (!batch?.running) return;
    if (batch.returning && location.href.includes("job_detail") && Date.now() - (batch.returnStartedAt || 0) < 8000) {
      continueBatchSend(800);
      return;
    }
    if (readPendingSend()) {
      continueBatchSend(800);
      return;
    }
    if (batchHasReachedLimit(batch)) {
      stopBatchSend(`已达到本轮上限，连续发送停止：${batch.sentCount || 0}/${batchLimitLabel(batch)}`);
      return;
    }
    if (isBossJobListPage()
      && !document.querySelector('a[href*="/job_detail/"], a[href*="job_detail"]')
      && Date.now() - (batch.pageStartedAt || batch.createdAt || 0) < 10000) {
      continueBatchSend(800);
      return;
    }

    scanJobs();
    const observedBatch = observeBatchSearchResults(readBatchSend() || batch);
    const latestBatch = extendBatchQueueFromCurrentPage(observedBatch);
    const selected = selectCurrentPageBatchJob(latestBatch) || selectNextBatchJob(latestBatch);
    if (!selected) {
      const latest = readBatchSend() || batch;
      if (shouldReturnForBatch(latest)) {
        updateBatchSend({
          ...latest,
          pageStartedAt: Date.now(),
          returnAttempts: (latest.returnAttempts || 0) + 1,
          returnStartedAt: Date.now(),
          returning: true,
        });
        showToast("正在返回岗位列表，准备发送下一条");
        window.history.back();
        continueBatchSend(2600);
        return;
      }
      if (shouldOpenNextPageForBatch(latest) && tryOpenNextJobListPage()) {
        updateBatchSend({
          ...latest,
          awaitingMore: true,
          pageStartedAt: Date.now(),
          pageTurns: (latest.pageTurns || 0) + 1,
          returnAttempts: 0,
          returning: false,
        });
        showToast(`当前结果已处理，正在继续查找新岗位（第 ${(latest.pageTurns || 0) + 1} 次加载）`);
        continueBatchSend(3500);
        return;
      }
      if (tryOpenNextSearchTarget(latest)) return;
      stopBatchSend(`全自动完成：已发送 ${latest.sentCount || 0} 个岗位`);
      return;
    }

    const text = buildMessage(selected);
    if (!text) {
      stopBatchSend("连续发送停止：当前岗位没有可发送文案");
      return;
    }
    if (hasSentGreeting(selected)) {
      markSelected("applied", true);
      showToast("当前岗位已经发过打招呼消息，跳过并继续下一条");
      continueBatchSend(500);
      return;
    }
    showToast(`连续发送中：第 ${(batch.sentCount || 0) + 1}/${batchLimitLabel(batch)}`);
    sendTextMessage(text, "已点击发送按钮", "greeting");
  }

  function buildBatchQueue(options = {}) {
    return state.jobs
      .filter((job) => isBatchCandidate(job, options))
      .map(batchEntryFromJob);
  }

  function readBatchLimit(queueLength, allowQueueGrowth = false) {
    const configured = Number(String(state.settings.autoBatchLimit || "").replace(/[^\d]/g, ""));
    if (!Number.isFinite(configured) || configured <= 0) {
      return allowQueueGrowth ? 0 : Math.max(0, queueLength);
    }
    const limit = Math.max(1, Math.floor(configured));
    return allowQueueGrowth ? limit : Math.min(Math.max(0, queueLength), limit);
  }

  function isUnlimitedBatchLimit() {
    const configured = Number(String(state.settings.autoBatchLimit || "").replace(/[^\d]/g, ""));
    return !Number.isFinite(configured) || configured <= 0;
  }

  function batchIsUnlimited(batch) {
    return Boolean(batch?.unlimited || Number(batch?.limit) === 0);
  }

  function batchHasReachedLimit(batch) {
    if (!batch || batchIsUnlimited(batch)) return false;
    return Number(batch.limit) > 0 && (batch.sentCount || 0) >= Number(batch.limit);
  }

  function batchLimitLabel(batch) {
    if (batchIsUnlimited(batch)) return "全部";
    return String(batch?.limit || batch?.queue?.length || 0);
  }

  function extendBatchQueueFromCurrentPage(batch) {
    if (!batch?.running) return batch;
    const activeSearchTarget = batch.searchTargets?.[batch.searchIndex || 0] || null;
    const additions = buildBatchQueue({
      activeSearchTarget,
      preset: batch.preset,
      strictTarget: batch.strictTarget,
    });
    if (!additions.length) return batch;
    const known = new Set((batch.queue || []).flatMap((entry) => [entry.key, ...(entry.aliases || [])]));
    const newEntries = additions.filter((entry) => ![entry.key, ...(entry.aliases || [])].some((key) => known.has(key)));
    if (!newEntries.length) return batch;
    const nextBatch = { ...batch, queue: [...(batch.queue || []), ...newEntries] };
    updateBatchSend(nextBatch);
    return nextBatch;
  }

  function observeBatchSearchResults(batch) {
    if (!batch?.running || !isBossJobListPage()) return batch;
    const observed = new Set(batch.observedJobKeys || []);
    const visibleKeys = uniqueStrings(state.allJobs.map(jobKey));
    const newKeys = visibleKeys.filter((key) => !observed.has(key));
    const stagnantLoads = batch.awaitingMore
      ? (newKeys.length ? 0 : (batch.stagnantLoads || 0) + 1)
      : (batch.stagnantLoads || 0);
    const nextBatch = {
      ...batch,
      awaitingMore: false,
      observedJobKeys: uniqueStrings([...(batch.observedJobKeys || []), ...visibleKeys]),
      stagnantLoads,
    };
    updateBatchSend(nextBatch);
    return nextBatch;
  }

  function isBatchCandidate(job, options = {}) {
    if (!job || hasSentGreeting(job)) return false;
    if (!isActiveRecruitingJob(job)) return false;
    if (options.preset === "keywordAuto") {
      const searchTarget = options.activeSearchTarget || options.searchTargets?.[options.searchIndex || 0] || null;
      return matchesKeywordAutoTarget(job, searchTarget);
    }
    if (options.preset === "shanghaiAiAlgorithmIntern") return matchesShanghaiAiAlgorithmIntern(job);
    return true;
  }

  function batchEntryFromJob(job) {
    return {
      aliases: greetingAliases(job),
      company: job.company || "",
      hr: job.hr || "",
      key: jobKey(job),
      title: job.title || "",
      url: job.url || "",
    };
  }

  function selectNextBatchJob(batch) {
    const entry = nextBatchEntry(batch);
    if (!entry) return null;
    const index = state.jobs.findIndex((job) => batchJobMatches(job, entry));
    if (index < 0) return null;
    state.selectedIndex = index;
    const selected = getSelectedJob();
    updateBatchSend({
      ...batch,
      currentJobKey: jobKey(selected),
      currentJobUrl: selected.url || entry.url || "",
      returnAttempts: 0,
      returning: false,
    });
    render();
    scrollSelectedIntoView();
    return selected;
  }

  function selectCurrentPageBatchJob(batch) {
    if (!batch?.running || !location.href.includes("job_detail")) return null;
    const entry = (batch.queue || []).find((item) => item.url && isSameJobUrl(location.href, item.url));
    const currentMatches = batch.currentJobUrl && isSameJobUrl(location.href, batch.currentJobUrl);
    if (!entry && !currentMatches) return null;
    let index = state.jobs.findIndex((job) => job.url && isSameJobUrl(location.href, job.url));
    if (index < 0 && state.jobs.length === 1) index = 0;
    if (index < 0) return null;
    const selected = state.jobs[index];
    if (hasSentGreeting(selected)) return null;
    state.selectedIndex = index;
    updateBatchSend({
      ...batch,
      currentJobKey: jobKey(selected),
      currentJobUrl: selected.url || batch.currentJobUrl || "",
      returnAttempts: 0,
      returning: false,
    });
    render();
    return selected;
  }

  function nextBatchEntry(batch) {
    const completed = new Set(batch?.completedKeys || []);
    const failed = new Set(batch?.failedKeys || []);
    return (batch?.queue || []).find((entry) => {
      const status = state.status[entry.key];
      return status !== "applied" && !entryAlreadyGreeted(entry) && !completed.has(entry.key) && !failed.has(entry.key);
    }) || null;
  }

  function batchJobMatches(job, entry) {
    if (!job || !entry) return false;
    if (jobKey(job) === entry.key) return true;
    return Boolean(job.url && entry.url && isSameJobUrl(job.url, entry.url));
  }

  function shouldReturnForBatch(batch) {
    if (!batch?.running || (batch.returnAttempts || 0) >= 3) return false;
    if (!location.href.includes("job_detail") || window.history.length <= 1) return false;
    return Boolean(nextBatchEntry(batch) || batch.autoNextPage);
  }

  function shouldOpenNextPageForBatch(batch) {
    if (!batch?.running || !batch.autoNextPage) return false;
    if (Number(batch.maxPages) > 0 && (batch.pageTurns || 0) >= Number(batch.maxPages)) return false;
    if ((batch.stagnantLoads || 0) >= STAGNANT_LOAD_LIMIT) return false;
    if (hasNoMoreJobResults()) return false;
    if (location.href.includes("job_detail")) return false;
    return !nextBatchEntry(batch);
  }

  function tryOpenNextJobListPage() {
    const candidateNodes = Array.from(document.querySelectorAll(
      "button, a, [role='button'], [class*='next'], [class*='arrow-right']",
    ));
    const candidates = uniqueElements(candidateNodes.map((element) => (
      element.closest?.("button, a, [role='button']") || element
    )))
      .filter(isVisibleOutsideHelper)
      .filter((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true")
      .filter((element) => {
        const pager = element.closest?.("[class*='pagination'], [class*='pager'], [class*='options-pages'], [class*='page-turn']");
        const childClass = element.querySelector?.("[class*='next'], [class*='arrow-right']")?.className || "";
        const label = cleanText(
          element.innerText ||
          element.textContent ||
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          `${element.className || ""} ${childClass}` ||
          "",
        );
        if (/上一页|prev|previous/i.test(label)) return false;
        if (/下一页|下页|next page/i.test(label)) return true;
        return Boolean(pager && /next|pager-next|pagination-next|ui-icon-arrow-right|arrow-right/i.test(label));
      });
    const next = candidates[0];
    if (next) {
      next.scrollIntoView({ behavior: "smooth", block: "center" });
      next.click();
      return true;
    }
    const scrollRoot = findJobListScrollRoot();
    if (!scrollRoot || scrollRoot.scrollHeight <= scrollRoot.clientHeight) return false;
    const links = Array.from(scrollRoot.querySelectorAll?.('a[href*="/job_detail/"], a[href*="job_detail"]') || []);
    links.at(-1)?.scrollIntoView({ behavior: "smooth", block: "end" });
    scrollRoot.scrollTop = scrollRoot.scrollHeight;
    scrollRoot.dispatchEvent(new Event("scroll", { bubbles: true }));
    window.dispatchEvent(new Event("scroll"));
    return true;
  }

  function findJobListScrollRoot() {
    const links = Array.from(document.querySelectorAll?.('a[href*="/job_detail/"], a[href*="job_detail"]') || []);
    const candidates = new Set();
    links.slice(0, 10).forEach((link) => {
      let parent = link.parentElement;
      while (parent && parent !== document.body && parent !== document.documentElement) {
        if (parent.scrollHeight > parent.clientHeight + 20) candidates.add(parent);
        parent = parent.parentElement;
      }
    });
    const ranked = Array.from(candidates)
      .filter((element) => {
        const overflowY = window.getComputedStyle?.(element)?.overflowY || "";
        return /auto|scroll/i.test(overflowY);
      })
      .sort((a, b) => {
        const bLinks = b.querySelectorAll?.('a[href*="/job_detail/"], a[href*="job_detail"]')?.length || 0;
        const aLinks = a.querySelectorAll?.('a[href*="/job_detail/"], a[href*="job_detail"]')?.length || 0;
        return bLinks - aLinks;
      });
    return ranked[0] || document.scrollingElement || document.documentElement;
  }

  function hasNoMoreJobResults() {
    const nodes = Array.from(document.querySelectorAll?.(
      "[class*='load-more'], [class*='no-more'], [class*='empty'], [class*='pagination'], [class*='pager'], p, span",
    ) || []);
    return nodes
      .filter(isVisibleOutsideHelper)
      .some((element) => {
        const text = cleanText(element.innerText || element.textContent || "").replace(/\s+/g, "");
        return text.length <= 24 && /^(没有更多(?:职位|岗位|结果)?|暂无更多(?:职位|岗位|结果)?|已加载全部(?:职位|岗位|结果)?|没有更多了|到底了)$/.test(text);
      });
  }

  function tryOpenNextSearchTarget(batch) {
    if (!batch?.running || !isBossJobListPage()) return false;
    const targets = Array.isArray(batch.searchTargets) ? batch.searchTargets : [];
    const nextIndex = Number(batch.searchIndex || 0) + 1;
    const target = targets[nextIndex];
    if (!target) return false;
    updateBatchSend({
      ...batch,
      currentJobKey: "",
      currentJobUrl: "",
      awaitingMore: false,
      observedJobKeys: [],
      pageStartedAt: Date.now(),
      pageTurns: 0,
      returnAttempts: 0,
      returning: false,
      searchIndex: nextIndex,
      stagnantLoads: 0,
    });
    showToast(`正在搜索 ${target.cityName} · ${target.keyword || target.query}（${nextIndex + 1}/${targets.length}）`);
    location.assign(target.url);
    return true;
  }

  function handleBatchSendSuccess(pending) {
    if (!isBatchPending(pending)) return;
    const batch = readBatchSend();
    if (!batch?.running) return;
    const key = pending.jobKey || batch.currentJobKey || "";
    const completedKeys = uniqueStrings([...(batch.completedKeys || []), key].filter(Boolean));
    const sentCount = (batch.sentCount || 0) + 1;
    const nextBatch = {
      ...batch,
      completedKeys,
      currentJobKey: "",
      currentJobUrl: "",
      returnAttempts: 0,
      sentCount,
    };
    updateBatchSend(nextBatch);
    if (batchHasReachedLimit(nextBatch)) {
      stopBatchSend(`已达到本轮上限，连续发送停止：${sentCount}/${batchLimitLabel(nextBatch)}`);
      return;
    }
    showToast(`已发送 ${sentCount}/${batchLimitLabel(nextBatch)}，准备下一条`);
    continueBatchSend(1200);
  }

  function handleBatchSendFailure(pending, reason = "") {
    if (!isBatchPending(pending)) return false;
    const batch = readBatchSend();
    if (!batch?.running) return false;
    const key = pending.jobKey || batch.currentJobKey || "";
    const nextBatch = {
      ...batch,
      currentJobKey: "",
      currentJobUrl: "",
      failedCount: (batch.failedCount || 0) + 1,
      failedKeys: uniqueStrings([...(batch.failedKeys || []), key].filter(Boolean)),
    };
    updateBatchSend(nextBatch);
    showToast(reason
      ? `当前岗位未能自动发送：${reason}；已跳过并继续下一个`
      : "当前岗位未能自动发送，本轮暂时跳过并继续下一条");
    const searchTarget = nextBatch.searchTargets?.[nextBatch.searchIndex || 0];
    if (pending.requireTargetOpen && searchTarget && (pending.chatOpened || pending.detailOpened || !isBossJobListPage())) {
      window.setTimeout(() => location.assign(searchTarget.url), 500);
      return true;
    }
    continueBatchSend(1200);
    return true;
  }

  function isBatchPending(pending) {
    const batch = readBatchSend();
    return Boolean(batch?.running && pending?.kind === "greeting" && (!pending.batchId || pending.batchId === batch.id));
  }

  function readBatchSend() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_BATCH_SEND);
      if (!raw) return null;
      const batch = JSON.parse(raw);
      const lastActivityAt = batch?.updatedAt || batch?.createdAt || 0;
      if (!batch?.running || !Array.isArray(batch.queue) || Date.now() - lastActivityAt > 24 * 60 * 60 * 1000) {
        clearBatchSend();
        return null;
      }
      if (batch.preset === "keywordAuto") batch.maxPages = 0;
      return batch;
    } catch {
      clearBatchSend();
      return null;
    }
  }

  function updateBatchSend(batch) {
    window.sessionStorage.setItem(SESSION_BATCH_SEND, JSON.stringify({ ...batch, updatedAt: Date.now() }));
    updateStatusLineView();
  }

  function clearBatchSend() {
    window.sessionStorage.removeItem(SESSION_BATCH_SEND);
    updateStatusLineView();
  }

  function uniqueStrings(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function hasSentGreeting(job) {
    if (!job) return false;
    if (state.status[jobKey(job)] === "applied") return true;
    if (looksAlreadyContacted(job)) return true;
    return greetingAliases(job).some((alias) => Boolean(state.greetingLog[alias]));
  }

  function entryAlreadyGreeted(entry) {
    if (!entry) return false;
    if (state.status[entry.key] === "applied") return true;
    return uniqueStrings([entry.key, ...(entry.aliases || [])]).some((alias) => Boolean(state.greetingLog[alias]));
  }

  function hasAlreadyGreetedPending(pending) {
    if (pending?.kind !== "greeting") return false;
    if (pending.jobKey && state.status[pending.jobKey] === "applied") return true;
    return uniqueStrings([pending.jobKey, ...(pending.aliases || []), ...greetingAliasesFromParts(pending)])
      .some((alias) => Boolean(state.greetingLog[alias]));
  }

  function recordGreetingSent(pending) {
    if (pending?.kind !== "greeting") return;
    const record = {
      company: pending.company || "",
      hr: pending.hr || "",
      jobKey: pending.jobKey || "",
      sentAt: Date.now(),
      title: pending.jobTitle || "",
      url: pending.jobUrl || "",
    };
    uniqueStrings([pending.jobKey, ...(pending.aliases || []), ...greetingAliasesFromParts(pending)]).forEach((alias) => {
      state.greetingLog[alias] = record;
    });
    saveGreetingLog();
  }

  function recordGreetingSentForJob(job) {
    if (!job) return;
    recordGreetingSent({
      aliases: greetingAliases(job),
      company: job.company || "",
      hr: job.hr || "",
      jobKey: jobKey(job),
      jobTitle: job.title || "",
      jobUrl: job.url || "",
      kind: "greeting",
    });
  }

  function greetingAliases(job) {
    return greetingAliasesFromParts({
      company: job.company || "",
      hr: job.hr || "",
      jobKey: jobKey(job),
      jobTitle: job.title || "",
      jobUrl: job.url || "",
    });
  }

  function greetingAliasesFromParts(source) {
    const title = normalizeIdentityText(source.jobTitle || source.title || "");
    const company = normalizeIdentityText(source.company || "");
    const hr = normalizeIdentityText(source.hr || "");
    const url = source.jobUrl || source.url || "";
    return uniqueStrings([
      source.jobKey || "",
      url ? `url:${normalizeUrlForIdentity(url)}` : "",
      company && title ? `company-title:${company}|${title}` : "",
      company && hr && title ? `company-hr-title:${company}|${hr}|${title}` : "",
    ]);
  }

  function looksAlreadyContacted(job) {
    const text = cleanText([
      job.text,
      job.element?.innerText,
      job.element?.textContent,
    ].filter(Boolean).join(" "));
    return /继续沟通|已沟通|沟通过|已联系|已投递|已打招呼|已开聊|沟通中/.test(text);
  }

  function verifyPendingRecipient(pending, target) {
    if (pending?.kind !== "greeting") return { ok: true, reason: "" };
    if (!target) return { ok: false, reason: "没有聊天输入框" };
    if (hasAlreadyGreetedPending(pending)) return { ok: false, reason: "该岗位已发过打招呼" };
    if (targetInsideSelectedJob(target, pending)) return { ok: true, reason: "输入框在当前岗位区域内" };
    if (recipientContextMatchesPending(pending, target)) return { ok: true, reason: "聊天上下文匹配" };
    if (pending.chatOpened && pending.openedContextOk && !pending.hadVisibleInputBeforeOpen) {
      return { ok: true, reason: "已从当前岗位打开新的沟通入口" };
    }
    return { ok: false, reason: expectedRecipientText(pending) };
  }

  function recipientContextMatchesPending(pending, target) {
    const context = normalizeIdentityText(recipientContextText(target));
    if (!context) return false;
    const company = normalizeIdentityText(pending.company || "");
    const hr = normalizeIdentityText(pending.hr || "");
    const title = normalizeIdentityText(pending.jobTitle || "");
    const companyMatches = Boolean(company && context.includes(company));
    const hrMatches = Boolean(hr && context.includes(hr));
    const titleMatches = Boolean(title && context.includes(title));
    const pageMatches = currentPageMatchesPending(pending);
    if (pending.hadVisibleInputBeforeOpen) {
      return Boolean(titleMatches && (hrMatches || companyMatches));
    }
    if (hr) return hrMatches && (companyMatches || titleMatches || pageMatches);
    if (company && title) return companyMatches && (titleMatches || pageMatches);
    return Boolean(titleMatches && pageMatches);
  }

  function recipientContextText(target) {
    const container = target.closest?.(".chat-editor, .input-area, .message-input, [class*='chat'], [class*='dialog'], [class*='message'], [class*='conversation'], [class*='im-']");
    if (!container || state.root.contains(container)) return "";
    return cleanText([
      container.innerText,
      container.textContent,
      container.getAttribute?.("aria-label"),
      container.getAttribute?.("title"),
    ].filter(Boolean).join(" "));
  }

  function targetInsideSelectedJob(target, pending) {
    const selected = getSelectedJob();
    return Boolean(selectedJobExactMatchesPending(selected, pending) && selected.element?.contains?.(target));
  }

  function currentPageMatchesPending(pending) {
    if (!pending?.jobUrl) return false;
    return isSameJobUrl(location.href, pending.jobUrl);
  }

  function selectedJobMatchesPending(selected, pending) {
    if (!selected || !pending) return false;
    if (selectedJobExactMatchesPending(selected, pending)) return true;
    const selectedCompany = normalizeIdentityText(selected.company || "");
    const selectedHr = normalizeIdentityText(selected.hr || "");
    const selectedTitle = normalizeIdentityText(selected.title || "");
    const pendingCompany = normalizeIdentityText(pending.company || "");
    const pendingHr = normalizeIdentityText(pending.hr || "");
    const pendingTitle = normalizeIdentityText(pending.jobTitle || "");
    if (!selectedCompany || !selectedTitle || !pendingCompany || !pendingTitle) return false;
    const companyMatches = selectedCompany.includes(pendingCompany) || pendingCompany.includes(selectedCompany);
    const titleMatches = selectedTitle.includes(pendingTitle) || pendingTitle.includes(selectedTitle);
    const hrMatches = !pendingHr || (selectedHr && (selectedHr.includes(pendingHr) || pendingHr.includes(selectedHr)));
    return Boolean(companyMatches && titleMatches && hrMatches);
  }

  function selectedJobExactMatchesPending(selected, pending) {
    if (!selected || !pending) return false;
    if (pending.jobKey && jobKey(selected) === pending.jobKey) return true;
    return Boolean(selected.url && pending.jobUrl && isSameJobUrl(selected.url, pending.jobUrl));
  }

  function expectedRecipientText(pending) {
    return [pending.hr, pending.company, pending.jobTitle].filter(Boolean).join(" / ") || "缺少可核对的 HR/公司/岗位信息";
  }

  function normalizeIdentityText(value) {
    return cleanText(value).replace(/\s+/g, "").toLowerCase();
  }

  function normalizeUrlForIdentity(url) {
    try {
      const parsed = new URL(url, location.origin);
      return `${parsed.origin}${normalizePath(parsed.pathname)}`;
    } catch {
      return String(url || "").split(/[?#]/)[0].replace(/\/$/, "").toLowerCase();
    }
  }

  function fillTextIntoMessageInput(text, successMessage) {
    const target = findMessageInput();
    if (!target) {
      fallbackCopy(text);
      showToast("未找到聊天输入框，已改为复制");
      return null;
    }

    writeTextToInput(target, text);
    markSelected("drafted", true);
    if (successMessage) showToast(successMessage);
    return target;
  }

  function sendTextMessage(text, successMessage, kind = "greeting") {
    savePendingSend(text, successMessage, kind);
    runPendingSend();
  }

  function handleBossGreetingConfirmation(pending) {
    if (pending?.kind !== "greeting" || pending.confirmationHandled || !pending.chatOpened || !pending.openedContextOk) return false;
    const confirmation = findBossGreetingConfirmation();
    if (!confirmation?.continueButton) return false;
    updatePendingSend({
      ...pending,
      attempts: 0,
      confirmationHandled: true,
      confirmationHandledAt: Date.now(),
    });
    confirmation.continueButton.click();
    showToast("正在进入对应聊天并发送岗位招呼语");
    window.setTimeout(runPendingSend, 1200);
    return true;
  }

  function findBossGreetingConfirmation() {
    const selectors = [
      "[role='dialog']",
      ".dialog-container",
      ".dialog-wrap",
      ".boss-dialog",
      "[class*='dialog']",
      "[class*='modal']",
    ];
    const containers = uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))))
      .filter(isVisibleOutsideHelper)
      .filter((element) => bossGreetingConfirmationTextMatches(element.innerText || element.textContent || ""))
      .sort((a, b) => cleanText(a.innerText || a.textContent || "").length - cleanText(b.innerText || b.textContent || "").length);
    const container = containers[0];
    if (!container) return null;
    const buttons = Array.from(container.querySelectorAll("button, a, [role='button']")).filter(isVisibleOutsideHelper);
    const stayButton = buttons.find((button) => /^留在此页$/.test(cleanText(button.innerText || button.textContent || ""))) || null;
    const continueButton = buttons.find((button) => /^继续沟通$/.test(cleanText(button.innerText || button.textContent || ""))) || null;
    return { container, continueButton, stayButton };
  }

  function bossGreetingConfirmationTextMatches(value) {
    return /已向\s*BOSS\s*发送消息/i.test(cleanText(value));
  }

  function runPendingSend() {
    const pending = readPendingSend();
    if (!pending) return;
    if (handleBossGreetingConfirmation(pending)) return;

    const candidateTarget = findMessageInput();
    const target = candidateTarget && isPendingTargetReady(pending, candidateTarget) ? candidateTarget : null;
    if (target) {
      const enrichedPending = enrichPendingGreeting(pending, findVisibleHrForPending(pending, target));
      if (enrichedPending !== pending) updatePendingSend(enrichedPending);
      const verification = verifyPendingRecipient(enrichedPending, target);
      if (!verification.ok) {
        clearPendingSend();
        if (isBatchPending(enrichedPending)) {
          if (verification.reason === "该岗位已发过打招呼") {
            handleBatchSendFailure(enrichedPending, "该岗位已经发过第二条招呼，已阻止重复发送");
          } else {
            stopBatchSend(`无法确认当前聊天对象匹配该岗位，已停止连续发送：${verification.reason}`);
          }
        } else {
          showToast(`无法确认当前聊天对象匹配该岗位，已阻止发送：${verification.reason}`);
        }
        return;
      }
      writeTextToInput(target, enrichedPending.text);
      markSelected("drafted", true);
      showToast("已填入文案，正在查找发送按钮");
      window.setTimeout(() => clickSendForPending(target), 500);
      return;
    }

    if (pending.attempts >= 20) {
      clearPendingSend();
      const reason = pending.confirmationHandled
        ? "点击继续沟通后未找到聊天框"
        : pending.detailOpened
          ? "已打开详情但未找到可点击的立即沟通"
          : "未能打开目标岗位详情";
      if (!handleBatchSendFailure(pending, reason)) {
        fallbackCopy(pending.text);
        showToast(`${reason}，文案已复制`);
      }
      return;
    }

    let nextPending = { ...pending, attempts: (pending.attempts || 0) + 1 };
    let opened = false;
    let delay = 700;
    let progressMessage = "";

    const chatOpenResult = !pending.chatOpened && (pending.chatOpenAttempts || 0) < 3
      ? tryOpenChatForSelectedJob(pending)
      : null;
    if (chatOpenResult) {
      opened = true;
      delay = 1200;
      progressMessage = "已点击目标岗位的立即沟通，等待 BOSS 弹窗或聊天框";
      nextPending = enrichPendingGreeting({
        ...nextPending,
        chatOpenAttempts: (pending.chatOpenAttempts || 0) + 1,
        chatOpened: true,
        hadVisibleInputBeforeOpen: Boolean(candidateTarget) || Boolean(pending.hadVisibleInputBeforeOpen),
        openedContextOk: Boolean(chatOpenResult.contextOk),
      }, chatOpenResult.hr);
    } else if (!pending.detailOpened && tryOpenSelectedJobDetail(pending)) {
      opened = true;
      delay = 1500;
      progressMessage = "已打开目标岗位详情，正在查找立即沟通";
      nextPending = {
        ...nextPending,
        detailOpened: true,
      };
    }

    updatePendingSend(nextPending);
    showToast(opened ? progressMessage : "正在等待当前岗位聊天框出现");
    window.setTimeout(runPendingSend, delay);
  }

  function isPendingTargetReady(pending, target) {
    if (!pending?.requireTargetOpen) return true;
    if (targetInsideSelectedJob(target, pending)) return true;
    if (!pending.chatOpened || !pending.openedContextOk) return false;
    return verifyPendingRecipient(pending, target).ok;
  }

  function clickSendForPending(target) {
    const pending = readPendingSend();
    if (!pending) return;
    if (handleBossGreetingConfirmation(pending)) return;

    const sendButton = findSendButton(target);
    if (!sendButton) {
      if (pending.attempts < 20) {
        updatePendingSend({ ...pending, attempts: pending.attempts + 1 });
        showToast("已填入文案，等待发送按钮可用");
        window.setTimeout(() => clickSendForPending(target), 500);
        return;
      }
      clearPendingSend();
      if (!handleBatchSendFailure(pending, "已找到聊天框但未找到发送按钮")) {
        showToast("已填入文案，但未找到明确发送按钮。请手动点 BOSS 的发送");
      }
      return;
    }

    if (hasAlreadyGreetedPending(pending)) {
      writeTextToInput(target, "");
      clearPendingSend();
      if (isBatchPending(pending)) {
        handleBatchSendFailure(pending, "该岗位已经发过第二条招呼，已阻止重复发送");
      } else {
        showToast("该岗位已经发过打招呼消息，已阻止重复发送");
      }
      return;
    }

    const verification = verifyPendingRecipient(pending, target);
    if (!verification.ok) {
      clearPendingSend();
      if (isBatchPending(pending)) {
        stopBatchSend(`发送前无法确认聊天对象匹配该岗位，已停止连续发送：${verification.reason}`);
      } else {
        showToast(`发送前无法确认聊天对象匹配该岗位，已阻止发送：${verification.reason}`);
      }
      return;
    }

    if (hasRecentSendGuard(pending)) {
      writeTextToInput(target, "");
      clearPendingSend();
      if (isBatchPending(pending)) {
        handleBatchSendFailure(pending, "检测到该岗位刚刚发送过第二条招呼，已阻止重复发送");
      } else {
        showToast("检测到当前聊天刚刚发送过消息，已阻止重复发送");
      }
      return;
    }

    updatePendingSend({
      ...pending,
      sendClickedAt: Date.now(),
      sendConfirmAttempts: 0,
    });
    sendButton.click();
    showToast("已点击发送，正在确认消息是否发出");
    window.setTimeout(() => confirmPendingMessageSent(target), 600);
  }

  function confirmPendingMessageSent(target) {
    const pending = readPendingSend();
    if (!pending) return;
    if (messageInputWasCleared(target) || hasSentMessageEvidence(pending.text, target)) {
      finalizePendingMessageSend(pending);
      return;
    }
    const attempts = (pending.sendConfirmAttempts || 0) + 1;
    if (attempts < 6) {
      updatePendingSend({ ...pending, sendConfirmAttempts: attempts });
      showToast("等待 BOSS 确认发送");
      window.setTimeout(() => confirmPendingMessageSent(target), 500);
      return;
    }
    clearPendingSend();
    if (!handleBatchSendFailure(pending, "已点击发送但输入框未清空，无法确认消息已发出")) {
      showToast("已点击发送，但无法确认消息已发出");
    }
  }

  function messageInputWasCleared(target) {
    if (!target) return false;
    const tag = target.tagName?.toLowerCase();
    const value = target.isContentEditable
      ? target.innerText || target.textContent || ""
      : tag === "textarea" || tag === "input"
        ? target.value || ""
        : target.textContent || "";
    return cleanText(value) === "";
  }

  function hasSentMessageEvidence(text, inputElement) {
    const expected = normalizeIdentityText(text);
    if (!expected) return false;
    const selectors = [
      ".message-item",
      ".chat-message",
      ".item-myself",
      "[class*='message-item']",
      "[class*='message-content']",
      "[class*='chat-record']",
    ];
    return uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))))
      .filter(isVisibleOutsideHelper)
      .filter((element) => element !== inputElement && !element.contains?.(inputElement))
      .some((element) => normalizeIdentityText(element.innerText || element.textContent || "").includes(expected));
  }

  function finalizePendingMessageSend(pending) {
    const batchSnapshot = readBatchSend();
    recordGreetingSent(pending);
    recordSendGuard(pending);
    clearPendingSend();
    if (pending.jobKey) markJobKey(pending.jobKey, "applied", false);
    render();
    showToast(pending.successMessage);
    handleBatchSendSuccess(pending);
    if (pending.requireTargetOpen) {
      window.setTimeout(() => closeCommunicationViewAfterSend(batchSnapshot), 600);
    }
  }

  function closeCommunicationViewAfterSend(batch) {
    const closeButton = findCommunicationCloseButton();
    if (closeButton) closeButton.click();
    const target = batch?.searchTargets?.[batch.searchIndex || 0];
    window.setTimeout(() => {
      if (target) {
        showToast("招呼语已发送，正在返回职位搜索");
        location.assign(target.url);
        return;
      }
      if (!isBossJobListPage() && isJobDetailPage() && window.history.length > 1) {
        window.history.back();
      }
    }, closeButton ? 500 : 0);
  }

  function findCommunicationCloseButton() {
    const selectors = [
      ".dialog-close",
      ".boss-dialog__close",
      "[class*='dialog-close']",
      "[class*='chat-close']",
      "button[aria-label*='关闭']",
      "[role='button'][aria-label*='关闭']",
      "button[title*='关闭']",
      "[role='button'][title*='关闭']",
    ];
    return uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))))
      .filter(isVisibleOutsideHelper)[0] || null;
  }

  function savePendingSend(text, successMessage, kind) {
    const selected = getSelectedJob();
    const batch = readBatchSend();
    updatePendingSend({
      attempts: 0,
      batchId: batch?.running ? batch.id : "",
      chatOpenAttempts: 0,
      chatOpened: false,
      confirmationHandled: false,
      createdAt: Date.now(),
      detailOpened: false,
      hadVisibleInputBeforeOpen: false,
      jobKey: selected ? jobKey(selected) : "",
      jobTitle: selected?.title || "",
      company: selected?.company || "",
      hr: selected?.hr || "",
      location: selected?.location || "",
      salary: selected?.salary || "",
      aliases: selected ? greetingAliases(selected) : [],
      jobUrl: selected?.url || "",
      kind,
      openedContextOk: false,
      requireTargetOpen: Boolean(batch?.running && kind === "greeting"),
      successMessage,
      template: kind === "greeting" ? state.settings.quickTemplate : "",
      text,
    });
  }

  function readPendingSend() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_PENDING_SEND);
      if (!raw) return null;
      const pending = JSON.parse(raw);
      if (!pending?.text || Date.now() - pending.createdAt > 90000) {
        clearPendingSend();
        return null;
      }
      return pending;
    } catch {
      clearPendingSend();
      return null;
    }
  }

  function updatePendingSend(pending) {
    window.sessionStorage.setItem(SESSION_PENDING_SEND, JSON.stringify(pending));
  }

  function clearPendingSend() {
    window.sessionStorage.removeItem(SESSION_PENDING_SEND);
  }

  function hasRecentSendGuard(pending) {
    if (!pending?.requireTargetOpen) return false;
    const guard = readSendGuard();
    const key = sendGuardKey(pending);
    const entry = guard[key];
    return Boolean(entry && Date.now() - entry.sentAt < 10 * 60 * 1000);
  }

  function recordSendGuard(pending) {
    if (!pending?.requireTargetOpen) return;
    const guard = readSendGuard();
    guard[sendGuardKey(pending)] = {
      jobKey: pending.jobKey || "",
      sentAt: Date.now(),
      url: location.href,
    };
    window.sessionStorage.setItem(SESSION_SEND_GUARD, JSON.stringify(guard));
  }

  function readSendGuard() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_SEND_GUARD);
      const guard = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      Object.keys(guard).forEach((key) => {
        if (!guard[key]?.sentAt || now - guard[key].sentAt > 10 * 60 * 1000) delete guard[key];
      });
      return guard;
    } catch {
      window.sessionStorage.removeItem(SESSION_SEND_GUARD);
      return {};
    }
  }

  function sendGuardKey(pending = {}) {
    const jobIdentity = pending.jobKey
      || (pending.jobUrl ? `url:${normalizeUrlForIdentity(pending.jobUrl)}` : "")
      || [pending.company, pending.hr, pending.jobTitle].map(normalizeIdentityText).filter(Boolean).join("|");
    if (jobIdentity) return `job:${jobIdentity}`;
    try {
      const url = new URL(location.href, location.origin);
      url.hash = "";
      const pageKey = `${url.origin}${url.pathname}${url.search}`;
      return pageKey;
    } catch {
      return location.href.split("#")[0];
    }
  }

  function resumePendingSend() {
    if (!readPendingSend()) return;
    showToast("检测到未完成发送任务，继续尝试发送");
    window.setTimeout(runPendingSend, 800);
  }

  function findMessageInput() {
    const active = document.activeElement;
    if (isSafeInputTarget(active)) return active;

    const selectors = [
      ".chat-editor [contenteditable='true']",
      ".input-area [contenteditable='true']",
      ".message-input [contenteditable='true']",
      "[class*='chat'] [contenteditable='true']",
      "[class*='dialog'] [contenteditable='true']",
      "[class*='message'] [contenteditable='true']",
      "[class*='editor'] [contenteditable='true']",
      "[class*='input'] [contenteditable='true']",
      "[contenteditable='true'][placeholder]",
      "textarea[placeholder*='消息']",
      "textarea[placeholder*='沟通']",
      "textarea[placeholder*='招呼']",
      "textarea[placeholder*='请输入']",
      "textarea[class*='chat']",
      "textarea[class*='message']",
      "input[type='text'][placeholder*='消息']",
      "input[type='text'][placeholder*='沟通']",
      "input[type='text'][placeholder*='招呼']",
    ];
    const candidates = uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))))
      .filter(isSafeInputTarget)
      .sort((a, b) => inputScore(b) - inputScore(a));
    return candidates[0] || null;
  }

  function isSafeInputTarget(element) {
    if (!element || state.root.contains(element)) return false;
    const tag = element.tagName?.toLowerCase();
    const editable = element.isContentEditable || tag === "textarea" || (tag === "input" && element.type === "text");
    if (!editable) return false;
    const hint = cleanText([
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.className,
      element.id,
      element.name,
    ].filter(Boolean).join(" "));
    if (/搜索|查询|职位|公司|城市|关键词|筛选|filter|search/i.test(hint)) return false;
    const rect = element.getBoundingClientRect();
    const visible = rect.width > 80 && rect.height > 18 && rect.bottom > 0 && rect.right > 0;
    const disabled = element.disabled || element.getAttribute("aria-disabled") === "true";
    return visible && !disabled;
  }

  function inputScore(element) {
    const rect = element.getBoundingClientRect();
    let score = 0;
    if (findSendButton(element)) score += 100;
    if (element.isContentEditable) score += 10;
    if (rect.bottom > window.innerHeight / 2) score += 8;
    if (rect.width > 180) score += 4;
    return score;
  }

  function writeTextToInput(target, text) {
    target.focus();
    if (target.isContentEditable) {
      if (!text) {
        target.textContent = "";
        target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward", data: null }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
      const inserted = document.execCommand?.("insertText", false, text);
      if (!inserted) target.textContent = text;
      target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const prototype = target.tagName?.toLowerCase() === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(target, text);
    else target.value = text;
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findSendButton(inputElement) {
    const container = inputElement.closest?.(".chat-editor, .input-area, .message-input, [class*='chat'], [class*='dialog'], [class*='message']") || document;
    const scoped = findSendButtonIn(container, inputElement);
    if (scoped) return scoped;
    return findSendButtonIn(document, inputElement);
  }

  function findSendButtonIn(root, inputElement = null) {
    const nodes = Array.from(root.querySelectorAll("button, a, [role='button'], [onclick], [class*='btn'], [class*='button'], span"))
      .filter(isVisibleOutsideHelper)
      .filter((element) => isMessageSendButtonLabel(
        element.innerText ||
        element.textContent ||
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        "",
      ));
    const candidates = uniqueElements(nodes.map((element) => findClickableChatTarget(element, root)))
      .filter(Boolean)
      .filter(isVisibleOutsideHelper)
      .filter((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true")
      .filter((element) => {
        const label = cleanText(
          element.innerText ||
          element.textContent ||
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.className ||
          "",
        );
        if (/简历|附件|上传|resume|attach/i.test(label)) return false;
        return !/disabled|disable|forbid|forbidden/i.test(label);
      })
      .sort((a, b) => sendButtonProximityScore(b, inputElement) - sendButtonProximityScore(a, inputElement));
    return candidates[0] || null;
  }

  function isMessageSendButtonLabel(value) {
    const label = cleanText(value).replace(/\s+/g, "");
    return /^(发送|发出|send)$/i.test(label);
  }

  function sendButtonProximityScore(button, inputElement) {
    if (!inputElement) return 0;
    const buttonRect = button.getBoundingClientRect();
    const inputRect = inputElement.getBoundingClientRect();
    const horizontalDistance = Math.abs(buttonRect.left - inputRect.right);
    const verticalDistance = Math.abs(buttonRect.top - inputRect.top);
    return 1000 - horizontalDistance - verticalDistance;
  }

  function tryOpenChatForSelectedJob(pending = {}) {
    const selected = getSelectedJob();
    const detailRoot = pending.requireTargetOpen ? findMatchingJobDetailRoot(pending) : null;
    const roots = pending.requireTargetOpen
      ? chatOpenRootsForPending(pending, selected, detailRoot)
      : [selected?.element, document].filter(Boolean).map((root) => ({ root, contextOk: true }));
    if (pending.requireTargetOpen && !currentPageMatchesPending(pending) && !selectedJobMatchesPending(selected, pending) && !detailRoot) {
      return null;
    }
    for (const entry of roots) {
      const button = findChatOpenButton(entry.root, pending);
      if (button) {
        const contextOk = pending.requireTargetOpen
          ? Boolean(entry.trusted || chatButtonContextMatches(button, pending))
          : true;
        if (pending.requireTargetOpen && !contextOk) continue;
        const hr = (entry.trusted || currentPageMatchesPending(pending)) ? readHrFromRoot(entry.root) : "";
        button.scrollIntoView({ behavior: "smooth", block: "center" });
        button.click();
        return { contextOk, hr };
      }
    }
    return null;
  }

  function chatOpenRootsForPending(pending, selected, detailRoot = null) {
    const entries = [];
    if (detailRoot) entries.push({ root: detailRoot, trusted: true });
    if (currentPageMatchesPending(pending)) {
      if (selected?.element) entries.push({ root: selected.element, trusted: true });
      entries.push({ root: document, trusted: false });
    } else if (selectedJobMatchesPending(selected, pending) && selected?.element) {
      entries.push({ root: selected.element, trusted: true });
      if (pending.detailOpened) entries.push({ root: document, trusted: false });
    }
    const seen = new Set();
    return entries.filter((entry) => {
      if (!entry.root || seen.has(entry.root)) return false;
      seen.add(entry.root);
      return true;
    });
  }

  function findMatchingJobDetailRoot(pending) {
    const selectors = [
      ".job-detail-container",
      ".job-detail-content",
      ".job-detail-box",
      ".job-detail",
      "[class*='job-detail-container']",
      "[class*='job-detail-content']",
    ];
    return uniqueElements(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))))
      .filter(isVisibleOutsideHelper)
      .find((element) => jobDetailContextMatchesPendingText(element.innerText || element.textContent || "", pending)) || null;
  }

  function readHrFromRoot(root) {
    if (!root?.querySelector) return "";
    return readText(root, [
      ".boss-name",
      ".recruiter-name",
      ".user-name",
      ".job-boss-info .name",
      ".detail-op .name",
      "[class*='boss-name']",
      "[class*='recruiter-name']",
      "[class*='chat-header'] [class*='name']",
      "[class*='conversation-header'] [class*='name']",
      "[class*='chat-user'] [class*='name']",
    ]);
  }

  function findVisibleHrForPending(pending, target = null) {
    const detailRoot = findMatchingJobDetailRoot(pending);
    const detailHr = safeHrForJob(readHrFromRoot(detailRoot), pending);
    if (detailHr) return detailHr;
    if (currentPageMatchesPending(pending)) {
      const pageHr = safeHrForJob(readHrFromRoot(document), pending);
      if (pageHr) return pageHr;
    }
    let container = target?.parentElement || null;
    for (let depth = 0; container && depth < 6; depth += 1, container = container.parentElement) {
      const candidate = safeHrForJob(readHrFromRoot(container), pending);
      if (!candidate) continue;
      if (recipientContextMatchesPending({ ...pending, hr: candidate }, target)) return candidate;
    }
    return safeHrForJob(pending?.hr, pending);
  }

  function jobDetailContextMatchesPendingText(value, pending) {
    const text = normalizeIdentityText(value);
    const company = normalizeIdentityText(pending?.company || "");
    const hr = normalizeIdentityText(pending?.hr || "");
    const title = normalizeIdentityText(pending?.jobTitle || "");
    if (!text || !title || !text.includes(title)) return false;
    return Boolean((company && text.includes(company)) || (hr && text.includes(hr)));
  }

  function tryOpenSelectedJobDetail(pending = {}) {
    const selected = getSelectedJob();
    const link = selected?.element?.querySelector?.('a[href*="/job_detail/"], a[href*="job_detail"]');
    if (!link) return false;
    const href = normalizeUrl(link.getAttribute("href") || selected.url || "");
    const targetUrl = pending.jobUrl || selected.url || href;
    if (isSameJobUrl(location.href, targetUrl) || isSameJobUrl(location.href, href)) return false;
    link.scrollIntoView({ behavior: "smooth", block: "center" });
    updatePendingSend({ ...pending, attempts: (pending.attempts || 0) + 1, detailOpened: true });
    link.click();
    return true;
  }

  function isSameJobUrl(currentUrl, targetUrl) {
    if (!currentUrl || !targetUrl) return false;
    try {
      const current = new URL(currentUrl, location.origin);
      const target = new URL(targetUrl, location.origin);
      return current.origin === target.origin && normalizePath(current.pathname) === normalizePath(target.pathname);
    } catch {
      return currentUrl === targetUrl;
    }
  }

  function normalizePath(pathname) {
    return String(pathname || "").replace(/\/$/, "").toLowerCase();
  }

  function findChatOpenButton(root, pending = {}) {
    const nodes = Array.from(root.querySelectorAll?.("button, a, [role='button'], [onclick], [class*='btn'], [class*='button'], span") || [])
      .filter(isVisibleOutsideHelper)
      .filter((element) => isChatOpenButtonLabel(
        element.innerText ||
        element.textContent ||
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        "",
      ));
    const candidates = uniqueElements(nodes.map((element) => findClickableChatTarget(element, root)))
      .filter(Boolean)
      .filter(isVisibleOutsideHelper)
      .filter((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true")
      .filter((element) => {
        if (element.matches?.('a[href*="/job_detail/"], a[href*="job_detail"]')) return false;
        const label = cleanText(
          element.innerText ||
          element.textContent ||
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.className ||
          "",
        );
        return !/简历|附件|上传|收藏|举报|分享|resume|attach/i.test(label);
      })
      .sort((a, b) => chatButtonScore(b, pending) - chatButtonScore(a, pending));
    return candidates[0] || null;
  }

  function findClickableChatTarget(element, root) {
    const clickable = element.closest?.("button, a, [role='button'], [onclick], [class*='btn'], [class*='button']");
    if (!clickable) return element;
    return root === document || root.contains?.(clickable) ? clickable : element;
  }

  function isChatOpenButtonLabel(value) {
    const label = cleanText(value).replace(/\s+/g, "");
    return /^(立即沟通|沟通一下|聊一聊|开聊|打招呼)$/.test(label);
  }

  function chatButtonScore(button, pending = {}) {
    let score = 0;
    const text = normalizeIdentityText([
      button.innerText,
      button.textContent,
      button.closest?.("aside, main, section, [class*='detail'], [class*='sider'], [class*='boss'], [class*='card']")?.innerText,
    ].filter(Boolean).join(" "));
    if (pending.company && text.includes(normalizeIdentityText(pending.company))) score += 40;
    if (pending.hr && text.includes(normalizeIdentityText(pending.hr))) score += 50;
    if (pending.jobTitle && text.includes(normalizeIdentityText(pending.jobTitle))) score += 50;
    if (button.closest?.("aside, [class*='sider'], [class*='detail-op'], [class*='job-boss'], [class*='job-banner']")) score += 20;
    if (button.closest?.("[class*='recommend'], [class*='related'], [class*='similar']")) score -= 80;
    return score;
  }

  function chatButtonContextMatches(button, pending = {}) {
    if (!pending?.requireTargetOpen) return true;
    if (currentPageMatchesPending(pending)) return chatButtonScore(button, pending) >= 0;
    return chatButtonScore(button, pending) >= 70;
  }

  function scanReplies(silent) {
    const indicators = findReplyIndicators();
    state.replyCount = indicators.length;
    updateReplyCountView();
    if (!silent) {
      highlightElements(indicators, "bah-reply-highlight", 2200);
      showToast(indicators.length ? `发现 ${indicators.length} 个可能回复/未读提示` : "暂未发现明显回复提示");
    }
  }

  function findReplyIndicators() {
    const selector = [
      "[class*='unread']",
      "[class*='badge']",
      "[class*='notice']",
      "[class*='red-dot']",
      "[class*='new-message']",
      "[class*='message-count']",
      "[aria-label*='未读']",
      "[title*='未读']",
    ].join(",");
    const classMatches = Array.from(document.querySelectorAll(selector)).filter(isVisibleOutsideHelper);
    const textMatches = Array.from(document.querySelectorAll("li, a, div, span"))
      .filter(isVisibleOutsideHelper)
      .filter((element) => {
        const text = cleanText(element.innerText || element.textContent || "");
        if (text.length > 30) return false;
        return /未读|新消息|回复|^\d+$/.test(text);
      });
    return uniqueElements([...classMatches, ...textMatches]).slice(0, 20);
  }

  function highlightResumeControls() {
    const controls = Array.from(document.querySelectorAll("button, a, label, [role='button']"))
      .filter(isVisibleOutsideHelper)
      .filter((element) => /简历|附件|上传|发送简历|resume|attach/i.test(cleanText(element.innerText || element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "")));
    highlightElements(controls, "bah-resume-highlight", 3000);
    if (controls[0]) controls[0].scrollIntoView({ behavior: "smooth", block: "center" });
    showToast(controls.length ? `已高亮 ${controls.length} 个简历/附件相关按钮` : "未找到明显的简历/附件按钮");
  }

  function isVisibleOutsideHelper(element) {
    if (!element || state.root.contains(element)) return false;
    return isVisible(element);
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements));
  }

  function highlightElements(elements, className, timeout) {
    elements.forEach((element) => element.classList.add(className));
    window.setTimeout(() => {
      elements.forEach((element) => element.classList.remove(className));
    }, timeout);
  }

  function openSelectedJob() {
    const selected = getSelectedJob();
    if (!selected) {
      showToast("没有选中的职位");
      return;
    }
    if (selected.element && selected.element !== document.body) {
      const link = selected.element.querySelector?.('a[href*="/job_detail/"]');
      if (link) {
        link.scrollIntoView({ behavior: "smooth", block: "center" });
        link.click();
        return;
      }
    }
    if (selected.url) window.open(selected.url, "_blank", "noopener,noreferrer");
  }

  function selectNext() {
    if (!state.jobs.length) {
      scanJobs();
      return;
    }
    const start = state.selectedIndex;
    for (let offset = 1; offset <= state.jobs.length; offset += 1) {
      const index = (start + offset) % state.jobs.length;
      const status = state.status[jobKey(state.jobs[index])];
      if (status !== "applied" && status !== "skipped" && !hasSentGreeting(state.jobs[index])) {
        state.selectedIndex = index;
        render();
        scrollSelectedIntoView();
        return;
      }
    }
    showToast("本页职位都处理过了");
  }

  function markSelected(status, shouldRender) {
    const selected = getSelectedJob();
    if (!selected) return;
    if (status === "applied") recordGreetingSentForJob(selected);
    markJobKey(jobKey(selected), status, shouldRender);
  }

  function markJobKey(key, status, shouldRender) {
    if (!key) return;
    state.status[key] = status;
    saveStatus();
    if (shouldRender) render();
  }

  function getSelectedJob() {
    return state.jobs[state.selectedIndex] || null;
  }

  function getDraftText() {
    const draft = state.root.querySelector("[data-draft]")?.value.trim();
    if (draft) return draft;
    const selected = getSelectedJob();
    return selected ? buildMessage(selected).trim() : "";
  }

  function buildResumeReply() {
    return renderTemplate(state.settings.resumeReplyTemplate || "", getSelectedJob() || {});
  }

  function updateReplyCountView() {
    const node = state.root?.querySelector("[data-reply-count]");
    if (node) node.textContent = `可能回复 ${state.replyCount} 个`;
    updateStatusLineView();
  }

  function updateStatusLineView() {
    const statusNode = state.root?.querySelector("[data-status-line]");
    if (statusNode) statusNode.textContent = statusLine();
  }

  function scrollSelectedIntoView() {
    const selected = getSelectedJob();
    if (!selected?.element) return;
    selected.element.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightSelected();
  }

  function highlightSelected() {
    document.querySelectorAll(".bah-highlight").forEach((element) => element.classList.remove("bah-highlight"));
    const selected = getSelectedJob();
    if (selected?.element && selected.element !== document.body) {
      selected.element.classList.add("bah-highlight");
      setTimeout(() => selected.element?.classList.remove("bah-highlight"), 1600);
    }
  }

  function statusLine() {
    const applied = Object.values(state.status).filter((value) => value === "applied").length;
    const skipped = Object.values(state.status).filter((value) => value === "skipped").length;
    const total = state.allJobs.length || state.jobs.length;
    const batch = readBatchSend();
    const searchTarget = batch?.searchTargets?.[batch.searchIndex || 0];
    const searchText = searchTarget
      ? ` · ${searchTarget.cityName}/${searchTarget.keyword || searchTarget.query} ${(batch.searchIndex || 0) + 1}/${batch.searchTargets.length}`
      : "";
    const batchText = batch?.running ? ` · 全自动 ${batch.sentCount || 0}/${batchLimitLabel(batch)}${searchText}` : "";
    return `匹配 ${state.jobs.length}/${total} · 已投 ${applied} · 可能回复 ${state.replyCount}${batchText}`;
  }

  function jobKey(job) {
    return [job.url, job.company, job.title].filter(Boolean).join("|").toLowerCase();
  }

  function normalizeUrl(url) {
    try {
      return new URL(url, location.origin).href;
    } catch {
      return url || "";
    }
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function splitList(value) {
    return String(value || "")
      .split(/[,，;；\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function extractKeywords(job) {
    const stopwords = new Set(["职位", "岗位", "负责", "要求", "相关", "工作", "能力", "经验", "熟悉", "优先", "我们", "团队", "公司"]);
    return cleanText([job.title, job.text].filter(Boolean).join(" "))
      .replace(/[，。；、（）()【】[\]{}:：/\\|!?！？]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !stopwords.has(token))
      .slice(0, 12);
  }

  function toBullets(items) {
    return items.filter(Boolean).map((item) => `- ${item}`);
  }

  function joinReadable(items) {
    return items.filter(Boolean).join("、");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function showToast(message) {
    state.lastMessage = message;
    const status = state.root.querySelector("[data-action-status]");
    if (status) status.textContent = message;
    const toast = state.root.querySelector(".bah-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("bah-show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("bah-show"), 1800);
  }
})();
