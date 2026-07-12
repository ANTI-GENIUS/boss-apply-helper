const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const contentPath = path.join(__dirname, "..", "content.js");
let source = fs.readFileSync(contentPath, "utf8");
source = source.replace("  init();", "  // Initialization is disabled in this logic-only test.");
source = source.replace(
  /\n\}\)\(\);\s*$/,
  `
  globalThis.__bahTest = {
    bossGreetingConfirmationTextMatches,
    batchHasReachedLimit,
    buildHrSalutation,
    buildBossSearchUrl,
    chatButtonContextMatches,
    collectCityEntries,
    enrichPendingGreeting,
    expandBossSearchTargets,
    extractJobs,
    findClickableChatTarget,
    state,
    greetingAliases,
    hasRecentSendGuard,
    hasSentGreeting,
    isActiveRecruitingJob,
    isBatchCandidate,
    isBossJobListPage,
    isChatOpenButtonLabel,
    isJobDetailPage,
    isMessageSendButtonLabel,
    isPrimarySearchJobLink,
    jobDetailContextMatchesPendingText,
    jobKey,
    keywordGroupMatches,
    matchesKeywordAutoTarget,
    messageInputWasCleared,
    normalizeCityName,
    readBatchLimit,
    recordSendGuard,
    renderTemplate,
    safeHrDisplayName,
    safeHrForJob,
    selectedJobExactMatchesPending,
    selectedJobMatchesPending,
    searchTargetMatchesLocation,
    sendGuardKey,
    shouldOpenNextPageForBatch,
    shouldReturnForBatch,
    splitList,
    verifyPendingRecipient,
  };
})();
`,
);

const sessionStorageData = new Map();
const context = {
  URL,
  chrome: {
    runtime: { onMessage: { addListener() {} } },
    storage: { local: { get() {}, set() {} } },
  },
  clearTimeout,
  console,
  document: {
    querySelectorAll() { return []; },
  },
  location: {
    href: "https://www.zhipin.com/web/geek/job",
    origin: "https://www.zhipin.com",
  },
  setTimeout,
  window: {
    history: { length: 1 },
    sessionStorage: {
      getItem(key) { return sessionStorageData.has(key) ? sessionStorageData.get(key) : null; },
      removeItem(key) { sessionStorageData.delete(key); },
      setItem(key, value) { sessionStorageData.set(key, String(value)); },
    },
  },
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: contentPath });

const {
  bossGreetingConfirmationTextMatches,
  batchHasReachedLimit,
  buildHrSalutation,
  buildBossSearchUrl,
  chatButtonContextMatches,
  collectCityEntries,
  enrichPendingGreeting,
  expandBossSearchTargets,
  extractJobs,
  findClickableChatTarget,
  state,
  greetingAliases,
  hasRecentSendGuard,
  hasSentGreeting,
  isActiveRecruitingJob,
  isBatchCandidate,
  isBossJobListPage,
  isChatOpenButtonLabel,
  isJobDetailPage,
  isMessageSendButtonLabel,
  isPrimarySearchJobLink,
  jobDetailContextMatchesPendingText,
  jobKey,
  keywordGroupMatches,
  matchesKeywordAutoTarget,
  messageInputWasCleared,
  normalizeCityName,
  readBatchLimit,
  recordSendGuard,
  renderTemplate,
  safeHrDisplayName,
  safeHrForJob,
  selectedJobExactMatchesPending,
  selectedJobMatchesPending,
  searchTargetMatchesLocation,
  sendGuardKey,
  shouldOpenNextPageForBatch,
  shouldReturnForBatch,
  splitList,
  verifyPendingRecipient,
} = context.__bahTest;

const matchingJob = {
  company: "示例智能",
  hr: "王 HR",
  location: "上海",
  salary: "200-250/天",
  text: "大模型算法实习生，正在招聘",
  title: "AI 算法实习生",
  url: "https://www.zhipin.com/job_detail/ai-intern.html",
};

assert.equal(
  state.settings.quickTemplate,
  "{salutation}，我对贵公司的{title}岗位很感兴趣，经验和岗位要求比较匹配，保证出勤率和实习时间。希望贵公司可以给我一个机会！",
  "默认第二条招呼语应使用用户指定文案",
);
assert.equal(buildHrSalutation("杨女士 刚刚活跃"), "您好，杨女士", "页面明确显示女士时应保留称谓");
assert.equal(buildHrSalutation("王 HR"), "您好，王HR", "页面明确显示 HR 时应保留 HR 称谓");
assert.equal(buildHrSalutation("张先生"), "您好，张先生", "页面明确显示先生时应保留称谓");
assert.equal(buildHrSalutation("孙众毅"), "您好，孙众毅老师", "只有姓名时不得猜测性别");
assert.equal(buildHrSalutation(""), "您好，招聘负责人", "没有可靠姓名时应使用中性称呼");
assert.equal(safeHrDisplayName("孙众毅 学堂在线 AI课程经理"), "孙众毅", "姓名后混有公司职位时只保留姓名");
assert.equal(safeHrDisplayName("AI课程经理"), "", "岗位名称不能被误认为 HR 姓名");
assert.equal(safeHrForJob("学堂在线", { company: "学堂在线", title: "AI 实习生" }), "", "公司名不能被误认为 HR 姓名");
assert.equal(
  renderTemplate(state.settings.quickTemplate, matchingJob),
  "您好，王HR，我对贵公司的AI 算法实习生岗位很感兴趣，经验和岗位要求比较匹配，保证出勤率和实习时间。希望贵公司可以给我一个机会！",
  "岗位消息应同时填入安全称呼和岗位标题",
);
const enrichedPending = enrichPendingGreeting({
  company: matchingJob.company,
  hr: "",
  jobTitle: matchingJob.title,
  kind: "greeting",
  template: state.settings.quickTemplate,
  text: "您好，招聘负责人，旧文案",
}, "杨女士");
assert.equal(enrichedPending.hr, "杨女士", "打开目标详情后应补充页面明确显示的 HR 姓名");
assert.equal(
  enrichedPending.text,
  "您好，杨女士，我对贵公司的AI 算法实习生岗位很感兴趣，经验和岗位要求比较匹配，保证出勤率和实习时间。希望贵公司可以给我一个机会！",
  "发现目标 HR 后应在发送前重新生成第二条消息",
);

assert.equal(matchesKeywordAutoTarget(matchingJob), true, "上海 AI/算法实习岗位应匹配");
assert.equal(matchesKeywordAutoTarget({ ...matchingJob, location: "北京", text: "北京 大模型算法实习生" }), false, "非上海岗位应跳过");
assert.equal(
  matchesKeywordAutoTarget({ ...matchingJob, title: "前端实习生", text: "React 前端实习" }, { keyword: "AI", cityName: "上海" }),
  false,
  "执行 AI 搜索组合时应跳过非 AI 岗位",
);
assert.equal(
  matchesKeywordAutoTarget({ ...matchingJob, title: "前端实习生", text: "React 前端实习" }),
  true,
  "未指定当前搜索组合时，逗号关键词按任一匹配处理",
);
assert.equal(matchesKeywordAutoTarget({ ...matchingJob, text: "大模型算法实习生，暂停招聘" }), false, "停招岗位应跳过");
assert.equal(isActiveRecruitingJob({ ...matchingJob, text: "职位已关闭" }), false, "关闭岗位不应进入队列");
assert.equal(keywordGroupMatches("AI", "paidinternship"), false, "单词内部的 ai 不应误判为 AI 岗位");
assert.equal(readBatchLimit(2, true), 0, "发送上限为 0 时，跨页模式应处理全部结果");
assert.equal(readBatchLimit(2, false), 2, "单页模式仍应受当前队列长度限制");
const originalBatchLimit = state.settings.autoBatchLimit;
state.settings.autoBatchLimit = "100";
assert.equal(readBatchLimit(2, true), 100, "填写的发送上限不应再被硬截到 30");
assert.equal(batchHasReachedLimit({ limit: 100, sentCount: 99, unlimited: false }), false, "未达到指定上限时应继续");
assert.equal(batchHasReachedLimit({ limit: 100, sentCount: 100, unlimited: false }), true, "达到指定上限时应停止");
assert.equal(batchHasReachedLimit({ limit: 0, sentCount: 100000, unlimited: true }), false, "全部模式不应因发送计数停止");
state.settings.autoBatchLimit = originalBatchLimit;
assert.deepEqual(
  Array.from(splitList("AI,算法，实习生")),
  ["AI", "算法", "实习生"],
  "关键词和城市应同时兼容英文逗号与中文逗号",
);
const cityEntries = [];
collectCityEntries({ cityGroup: [{ cityList: [{ code: 101020100, name: "上海" }, { code: 101190400, name: "苏州" }] }] }, cityEntries);
assert.deepEqual(
  cityEntries.map((city) => `${city.name}:${city.code}`),
  ["上海:101020100", "苏州:101190400"],
  "应能解析 BOSS 官方城市数据",
);
assert.equal(normalizeCityName("上海市"), "上海", "城市名应兼容市后缀");
const cityMap = new Map([
  ["上海", { code: 101020100, name: "上海" }],
  ["苏州", { code: 101190400, name: "苏州" }],
]);
const expandedTargets = expandBossSearchTargets(["AI", "算法"], ["上海", "苏州"], cityMap);
assert.deepEqual(
  Array.from(expandedTargets, (target) => `${target.cityName}:${target.keyword}`),
  ["上海:AI", "上海:算法", "苏州:AI", "苏州:算法"],
  "应执行所有关键词和城市的交叉搜索组合",
);
const bossSearchUrl = buildBossSearchUrl("AI 算法 实习生", 101020100);
const parsedBossSearchUrl = new URL(bossSearchUrl);
assert.equal(parsedBossSearchUrl.pathname, "/web/geek/jobs", "应使用 BOSS 当前职位搜索路由");
assert.equal(parsedBossSearchUrl.searchParams.get("query"), "AI 算法 实习生", "搜索 URL 应保留当前组合的查询词");
assert.equal(parsedBossSearchUrl.searchParams.get("city"), "101020100", "BOSS 搜索应带城市代码");
assert.equal(bossGreetingConfirmationTextMatches("已向BOSS发送消息 留在此页 继续沟通"), true, "应识别 BOSS 已发送招呼弹窗");
assert.equal(bossGreetingConfirmationTextMatches("确认投递简历"), false, "不能把其他弹窗误判为已发送招呼");
assert.equal(isChatOpenButtonLabel("立即沟通"), true, "应识别明确的立即沟通按钮");
assert.equal(isChatOpenButtonLabel("职位要求：沟通能力强"), false, "不能把包含沟通文字的职位详情链接当成沟通按钮");
assert.equal(isChatOpenButtonLabel("继续沟通"), false, "已沟通过的入口不能再次作为首次沟通按钮");
assert.equal(isMessageSendButtonLabel("发送"), true, "应识别聊天框发送按钮");
assert.equal(isMessageSendButtonLabel("发送简历"), false, "不能把发送简历当成普通消息发送按钮");
assert.equal(messageInputWasCleared({ isContentEditable: true, innerText: "" }), true, "发送后输入框清空应视为发送成功证据");
assert.equal(messageInputWasCleared({ isContentEditable: true, innerText: "仍在输入框" }), false, "文案仍在输入框时不能记录发送成功");
const clickableParent = { id: "chat-button" };
assert.equal(
  findClickableChatTarget({ closest() { return clickableParent; } }, { contains() { return true; } }),
  clickableParent,
  "文字在 span 内时应向上找到真实可点击父元素",
);
assert.equal(
  isPrimarySearchJobLink({
    closest(selector) {
      if (selector.includes("recommend")) return null;
      return selector.includes("job-card") ? {} : null;
    },
  }),
  true,
  "主搜索结果卡片应被识别",
);
assert.equal(
  isPrimarySearchJobLink({
    closest(selector) {
      if (selector.includes("recommend")) return null;
      return selector.includes("job-card") ? {} : null;
    },
  }, { contains() { return false; } }),
  true,
  "主列表根节点识别不完整时仍应通过职位卡片结构识别岗位",
);
assert.equal(
  isPrimarySearchJobLink({
    closest(selector) {
      if (selector.includes("job-list-container") || selector.includes("rec-job-list")) return null;
      if (selector.includes("recommend") || selector.includes("related") || selector.includes("similar")) return {};
      return selector.includes("job-card") ? {} : null;
    },
  }),
  false,
  "相似职位或推荐区域中的岗位链接必须排除",
);
const mockJobCard = {
  innerText: "AI 研发实习生\n上海\n示例智能\n大模型算法研发",
  querySelector(selector) {
    if (selector.includes("job-name") || selector.includes("job-title")) return { innerText: "AI 研发实习生" };
    if (selector.includes("company")) return { innerText: "示例智能" };
    if (selector.includes("job-area") || selector.includes("location") || selector.includes("address")) return { innerText: "上海" };
    if (selector.includes("job_detail")) return mockJobLink;
    return null;
  },
};
const mockJobLink = {
  closest(selector) {
    if (selector.includes("recommend") || selector.includes("related") || selector.includes("similar")) return null;
    return selector.includes("job-card") ? mockJobCard : null;
  },
  getAttribute() { return "/job_detail/scanned-card.html"; },
  innerText: "AI 研发实习生",
};
const wrongListRoot = {
  closest() { return null; },
  contains() { return false; },
  querySelectorAll() { return [mockJobLink]; },
};
const originalQuerySelectorAll = context.document.querySelectorAll;
context.document.querySelectorAll = (selector) => (
  selector.includes("job_detail") ? [mockJobLink] : [wrongListRoot]
);
context.location.href = "https://www.zhipin.com/web/geek/jobs?query=AI&city=101020100";
assert.equal(extractJobs().length, 1, "列表根节点误识别时仍必须提取真实职位卡片");

const currentBossCard = {
  innerText: "AI 算法实习生\n上海·浦东新区\n示例科技",
  querySelector(selector) {
    if (selector.includes("job-name") || selector.includes("job-title")) return { innerText: "AI 算法实习生" };
    if (selector.includes("company")) return { innerText: "示例科技" };
    if (selector.includes("job-area") || selector.includes("location") || selector.includes("address")) return { innerText: "上海·浦东新区" };
    if (selector.includes("job_detail")) return currentBossLink;
    return null;
  },
};
const currentBossRecommendRoot = {};
const currentBossListRoot = {
  closest(selector) {
    return selector.includes("recommend") ? currentBossRecommendRoot : null;
  },
  contains(element) { return element === currentBossLink; },
  querySelectorAll() { return [currentBossLink]; },
};
const currentBossLink = {
  closest(selector) {
    if (selector.includes("job-list-container") || selector.includes("rec-job-list")) return currentBossListRoot;
    if (selector.includes("recommend")) return currentBossRecommendRoot;
    return selector.includes("job-card") ? currentBossCard : null;
  },
  getAttribute() { return "/job_detail/current-boss-card.html"; },
  innerText: "AI 算法实习生",
};
context.document.querySelectorAll = (selector) => (
  selector.includes("job_detail") ? [currentBossLink] : [currentBossListRoot]
);
assert.equal(
  extractJobs().length,
  1,
  "BOSS 主列表位于 recommend-result 容器内时不能被误判为相关推荐",
);
context.document.querySelectorAll = originalQuerySelectorAll;
context.location.href = "https://www.zhipin.com/web/geek/job";

const originalKeywords = state.settings.filterInclude;
const originalCities = state.settings.filterCity;
state.settings.filterInclude = "实习";
state.settings.filterCity = "上海, 南通, 北京, 苏州";
assert.equal(
  matchesKeywordAutoTarget({
    company: "浙江某科技有限公司",
    hr: "杨女士",
    location: "上海",
    text: "图像处理 OpenCV 算法研究，正在招聘",
    title: "图像处理工程师（实习生）",
    url: "https://www.zhipin.com/job_detail/image-intern.html",
  }),
  true,
  "截图中的上海图像处理实习岗位应进入队列",
);
state.settings.filterInclude = originalKeywords;
state.settings.filterCity = originalCities;

const contactedJob = { ...matchingJob, text: `${matchingJob.text} 继续沟通` };
assert.equal(hasSentGreeting(contactedJob), true, "页面显示继续沟通时应视为已联系");

state.greetingLog = {};
state.greetingLog[greetingAliases(matchingJob)[0]] = { sentAt: Date.now() };
assert.equal(hasSentGreeting(matchingJob), true, "本地发送记录应阻止重复联系");

state.greetingLog = {};
state.status = {};
state.jobs = [matchingJob];
state.selectedIndex = 0;
state.root = { contains() { return false; } };

state.status[jobKey(matchingJob)] = "skipped";
assert.equal(isBatchCandidate(matchingJob, { preset: "keywordAuto" }), true, "旧的临时跳过状态不应永久阻止重试");
state.status = {};

context.location.href = matchingJob.url;
context.window.history.length = 2;
assert.equal(isJobDetailPage(), true, "职位详情 URL 应被识别并先返回列表");
assert.equal(isBossJobListPage(), false, "职位详情页不能直接建立岗位队列");
assert.equal(
  shouldReturnForBatch({ autoNextPage: true, failedKeys: [], queue: [], returnAttempts: 0, running: true }),
  true,
  "详情页队列耗尽时仍应返回列表以继续翻页",
);
context.location.href = "https://www.zhipin.com/web/geek/jobs";
context.window.history.length = 1;
assert.equal(isJobDetailPage(), false, "BOSS 职位列表 URL 不应被识别为详情页");
assert.equal(isBossJobListPage(), true, "只有 BOSS 职位列表页才能建立岗位队列");
state.root = { contains() { return false; } };
assert.equal(
  shouldOpenNextPageForBatch({ autoNextPage: true, maxPages: 0, pageTurns: 500, queue: [], running: true, stagnantLoads: 0 }),
  true,
  "maxPages 为 0 时不应因加载次数停止搜索",
);
assert.equal(
  shouldOpenNextPageForBatch({ autoNextPage: true, maxPages: 0, pageTurns: 500, queue: [], running: true, stagnantLoads: 3 }),
  false,
  "连续三次没有新岗位时应结束当前搜索组合",
);
context.location.href = bossSearchUrl;
assert.equal(
  searchTargetMatchesLocation({ cityCode: "101020100", query: "AI 算法 实习生", url: bossSearchUrl }),
  true,
  "到达对应 BOSS 关键词和城市搜索页后才能启动队列",
);
const suzhouAiUrl = buildBossSearchUrl("AI", 101190400);
const suzhouAiTarget = {
  cityCode: "101190400",
  cityName: "苏州",
  keyword: "AI",
  query: "AI",
  url: suzhouAiUrl,
};
const suzhouDistrictJob = {
  ...matchingJob,
  fromPrimarySearchList: true,
  location: "吴中区·独墅湖",
  text: "吴中区 独墅湖 大模型研发 实习岗位",
  title: "AI 研发实习生",
  url: "https://www.zhipin.com/job_detail/suzhou-district.html",
};
context.location.href = suzhouAiUrl;
assert.equal(
  matchesKeywordAutoTarget(suzhouDistrictJob, suzhouAiTarget),
  true,
  "BOSS 官方苏州搜索范围内的区县岗位不应要求卡片再次出现苏州文字",
);
context.location.href = "https://www.zhipin.com/web/geek/jobs";
assert.equal(
  matchesKeywordAutoTarget(suzhouDistrictJob, suzhouAiTarget),
  false,
  "未处于对应官方城市搜索时不能仅凭区县名称放宽城市校验",
);
assert.notEqual(
  sendGuardKey({ jobKey: "job-a" }),
  sendGuardKey({ jobKey: "job-b" }),
  "同一搜索页的不同岗位必须使用不同发送保护键",
);
const guardedJobA = { jobKey: "job-a", requireTargetOpen: true };
recordSendGuard(guardedJobA);
context.location.href = "https://www.zhipin.com/web/geek/chat";
assert.equal(hasRecentSendGuard(guardedJobA), true, "同一岗位切换到聊天页后仍应识别刚发送记录");
assert.equal(
  hasRecentSendGuard({ jobKey: "job-b", requireTargetOpen: true }),
  false,
  "共用同一个聊天路由的不同岗位不能互相触发防重复",
);
context.location.href = "https://www.zhipin.com/web/geek/jobs";

const pending = {
  aliases: greetingAliases(matchingJob),
  company: matchingJob.company,
  hr: matchingJob.hr,
  jobKey: `${matchingJob.url}|${matchingJob.company}|${matchingJob.title}`.toLowerCase(),
  jobTitle: matchingJob.title,
  jobUrl: matchingJob.url,
  kind: "greeting",
};
assert.equal(
  jobDetailContextMatchesPendingText("AI 算法实习生 示例智能 王 HR 立即沟通", pending),
  true,
  "列表右侧详情同时匹配岗位和公司/HR 时应允许查找沟通按钮",
);
assert.equal(
  jobDetailContextMatchesPendingText("前端实习生 另一家公司 李 HR 立即沟通", pending),
  false,
  "列表右侧显示其他岗位时不得查找沟通按钮",
);
assert.equal(selectedJobMatchesPending(matchingJob, pending), true, "同一岗位应通过目标岗位校验");
assert.equal(selectedJobExactMatchesPending(matchingJob, pending), true, "同一岗位 URL 应通过精确校验");
assert.equal(
  selectedJobMatchesPending({ ...matchingJob, company: "另一家公司", url: "https://www.zhipin.com/job_detail/other.html" }, pending),
  false,
  "不同 URL 且公司不匹配的岗位应被拦截",
);
assert.equal(
  selectedJobMatchesPending({ ...matchingJob, hr: "李 HR", url: "https://www.zhipin.com/job_detail/redirected.html" }, pending),
  false,
  "URL 不同且 HR 不同的相似岗位应被拦截",
);

const matchingChatButton = {
  closest(selector) {
    if (selector.includes("recommend")) return null;
    return { innerText: "示例智能 王 HR AI 算法实习生" };
  },
  innerText: "立即沟通",
  textContent: "立即沟通",
};
const wrongChatButton = {
  closest(selector) {
    if (selector.includes("recommend")) return { innerText: "相似职位" };
    return { innerText: "另一家公司 李 HR 前端实习生" };
  },
  innerText: "立即沟通",
  textContent: "立即沟通",
};
const strictPending = { ...pending, requireTargetOpen: true };
assert.equal(chatButtonContextMatches(matchingChatButton, strictPending), true, "目标岗位的沟通按钮应通过校验");
assert.equal(
  chatButtonContextMatches(matchingChatButton, { ...strictPending, company: "", hr: "" }),
  true,
  "公司或 HR 未提取到时，标题匹配的详情按钮仍应允许点击",
);
assert.equal(chatButtonContextMatches(wrongChatButton, strictPending), false, "相似职位的沟通按钮应被拦截");
const matchingTarget = {
  closest() {
    return {
      getAttribute() { return ""; },
      innerText: "示例智能 王 HR",
      textContent: "示例智能 王 HR",
    };
  },
};
const wrongTarget = {
  closest() {
    return {
      getAttribute() { return ""; },
      innerText: "另一家公司 李 HR",
      textContent: "另一家公司 李 HR",
    };
  },
};
const matchingJobTarget = {
  closest() {
    return {
      getAttribute() { return ""; },
      innerText: "示例智能 王 HR AI 算法实习生",
      textContent: "示例智能 王 HR AI 算法实习生",
    };
  },
};

assert.equal(verifyPendingRecipient(pending, matchingTarget).ok, true, "公司/HR 匹配时应允许发送");
assert.equal(verifyPendingRecipient(pending, wrongTarget).ok, false, "公司/HR 错配时应阻止发送");
assert.equal(
  verifyPendingRecipient({ ...pending, hadVisibleInputBeforeOpen: true }, matchingTarget).ok,
  false,
  "打开目标岗位前已经存在的同公司/HR 旧聊天框应被拦截",
);
assert.equal(
  verifyPendingRecipient({ ...pending, hadVisibleInputBeforeOpen: true }, matchingJobTarget).ok,
  true,
  "旧聊天框切换后显示目标岗位标题时才允许发送",
);

console.log("BOSS helper logic tests passed");
