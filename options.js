// options.js — 完整版

// 存储键
const STORAGE_KEYS = { SETTINGS: "settings" };

// 预设 Gemini 模型（按需增删）
const GEMINI_MODELS = [
  "gemini-2.0-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemma-3-27b-it"
];

// 默认配置（与 background.js 中的 DEFAULTS.settings 对齐）
const DEFAULTS = {
  apiBase: "http://localhost:3001/proxy/gemini",
  apiKey: "zh4men9",
  model: "gemini-2.0-flash",
  provider: "auto", // auto | openai | gemini
  authHeaderName: "Authorization",
  temperature: 0.4,
  prompts: {
    aiTranslate:
      "You are an expert Chinese<>English translator. Translate the user input to {{TARGET_LANG}} with natural, accurate, concise phrasing. Output ONLY the translation.",
    grammarFix:
      "You are an English writing corrector. Fix grammar/spelling/style of the English text. Provide both English and Chinese versions:\n\n**English Version:**\n1) Corrected text\n2) Brief reasons (bullet points)\n\n**中文版本：**\n1) 纠正后的文本\n2) 简要原因（要点形式）",
    aiSuggestions:
      "Provide 3 alternative phrasings for the text in {{TARGET_LANG}}. Give both English and Chinese versions:\n\n**English Version:**\n1. [formal] ...\n2. [casual] ...\n3. [concise] ...\n\n**中文版本：**\n1. [正式] ...\n2. [随意] ...\n3. [简洁] ...",
    learningTips:
      "From the text (assume target language is {{TARGET_LANG}}), extract learning materials. Provide both English and Chinese versions:\n\n**English Version:**\n- 5 useful collocations/phrases\n- 2 key grammar notes\n- 2 mini exercises (fill-in-the-blank or paraphrase)\nAnswers at the end.\n\n**中文版本：**\n- 5个有用的搭配/短语\n- 2个关键语法要点\n- 2个小练习（填空或改写）\n答案在末尾。"
  }
};

// 简便选择器
const $ = (s) => document.querySelector(s);
const stat = $("#stat");

// 初始化：读取已存设置 → 填充表单 → 设置交互
(async function init() {
  console.log('=== Options页面初始化开始 ===');
  
  try {
    console.log('Chrome存储API可用:', !!chrome.storage);
    const st = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    console.log('读取到的设置:', st);
    const cfg = normalizeSettings(st[STORAGE_KEYS.SETTINGS] || DEFAULTS);
    console.log('标准化后的配置:', cfg);

    // ---- 填充“模型（Gemini）”下拉 + 自定义框 ----
    const presetEl = $("#modelPreset");
    const customEl = $("#modelCustom");
    fillModelPreset(presetEl);

    // 还原当前模型为预设或自定义
    const savedModel = cfg.model || DEFAULTS.model;
    const isPreset = GEMINI_MODELS.includes(savedModel);

    if (isPreset) {
      presetEl.value = savedModel;
      customEl.style.display = "none";
      customEl.value = "";
    } else {
      presetEl.value = "__custom__";
      customEl.style.display = "block";
      customEl.value = savedModel;
    }

    // ---- 其余字段还原 ----
    $("#apiBase").value = cfg.apiBase || DEFAULTS.apiBase;
    $("#apiKey").value = cfg.apiKey || "";
    $("#provider").value = cfg.provider || "auto";
    $("#authHeaderName").value = cfg.authHeaderName || "Authorization";
    $("#temperature").value = cfg.temperature ?? 0.4;

    $("#p_aiTranslate").value = cfg.prompts?.aiTranslate || DEFAULTS.prompts.aiTranslate;
    $("#p_grammarFix").value = cfg.prompts?.grammarFix || DEFAULTS.prompts.grammarFix;
    $("#p_aiSuggestions").value = cfg.prompts?.aiSuggestions || DEFAULTS.prompts.aiSuggestions;
    $("#p_learningTips").value = cfg.prompts?.learningTips || DEFAULTS.prompts.learningTips;

    // 下拉切换：控制“自定义模型”输入框显隐
    presetEl.addEventListener("change", () => {
      const v = presetEl.value;
      if (v === "__custom__") {
        customEl.style.display = "block";
        if (!customEl.value) customEl.placeholder = "例如：gemini-1.5-pro";
      } else {
        customEl.style.display = "none";
      }
    });
  } catch (e) {
    console.error("Init options failed:", e);
    stat.textContent = "初始化失败，请刷新重试";
  }
})();

// 保存
$("#save").addEventListener("click", async () => {
  try {
    const presetEl = $("#modelPreset");
    const customEl = $("#modelCustom");

    // 选中模型：预设或自定义
    let model = presetEl.value;
    if (model === "__custom__") {
      model = (customEl.value || "").trim();
      if (!model) {
        stat.textContent = "请填写自定义模型名称";
        return;
      }
    }

    const cfg = {
      apiBase: $("#apiBase").value.trim() || DEFAULTS.apiBase,
      apiKey: $("#apiKey").value.trim(), // 允许为空
      model,
      provider: $("#provider").value || "auto",
      authHeaderName: $("#authHeaderName").value.trim() || "Authorization",
      temperature: clampNumber(parseFloat($("#temperature").value), 0, 2, 0.4),
      prompts: {
        aiTranslate: $("#p_aiTranslate").value || DEFAULTS.prompts.aiTranslate,
        grammarFix: $("#p_grammarFix").value || DEFAULTS.prompts.grammarFix,
        aiSuggestions: $("#p_aiSuggestions").value || DEFAULTS.prompts.aiSuggestions,
        learningTips: $("#p_learningTips").value || DEFAULTS.prompts.learningTips
      }
    };

    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: cfg });
    stat.textContent = "已保存（模型与设置已记住）";
    setTimeout(() => (stat.textContent = ""), 1500);
  } catch (e) {
    console.error("Save options failed:", e);
    stat.textContent = "保存失败，请检查表单或稍后再试";
  }
});

/* ---------- 工具函数 ---------- */

// 规范化读取到的配置，确保字段存在（兼容旧版本）
function normalizeSettings(cfg) {
  const out = { ...DEFAULTS, ...(cfg || {}) };
  out.prompts = { ...DEFAULTS.prompts, ...(cfg?.prompts || {}) };
  // provider 合法性
  if (!["auto", "openai", "gemini"].includes(out.provider)) out.provider = "auto";
  // 温度范围
  out.temperature = clampNumber(Number(out.temperature), 0, 2, 0.4);
  // 字段兜底
  if (!out.apiBase) out.apiBase = DEFAULTS.apiBase;
  if (!out.model) out.model = DEFAULTS.model;
  if (!out.authHeaderName) out.authHeaderName = "Authorization";
  return out;
}

function clampNumber(n, min, max, fallback) {
  if (Number.isFinite(n)) return Math.min(Math.max(n, min), max);
  return fallback;
}

function fillModelPreset(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  GEMINI_MODELS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    selectEl.appendChild(opt);
  });
  const optCustom = document.createElement("option");
  optCustom.value = "__custom__";
  optCustom.textContent = "自定义…";
  selectEl.appendChild(optCustom);
}
