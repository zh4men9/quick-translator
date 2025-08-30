const STORAGE_KEYS = {
  LAST_DIR: "lastDirection",
  SETTINGS: "settings"
};

const DEFAULTS = {
  lastDirection: "auto->zh-CN"
};

const $ = (s) => document.querySelector(s);
const dirEl = $("#dir"), srcEl = $("#src"), statusEl = $("#status");

$("#swap").addEventListener("click", () => {
  const map = {
    "auto->zh-CN": "auto->en",
    "auto->en": "auto->zh-CN",
    "zh-CN->en": "en->zh-CN",
    "en->zh-CN": "zh-CN->en"
  };
  dirEl.value = map[dirEl.value] || "auto->zh-CN";
  saveDirection(dirEl.value);
});

$("#openSettings").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

$("#runAll").addEventListener("click", runAll);
$("#copyAll").addEventListener("click", copyAll);
Array.from(document.querySelectorAll(".copy")).forEach(btn => {
  btn.addEventListener("click", () => copyById(btn.dataset.copy));
});

srcEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runAll();
});

(async function init() {
  const st = await chrome.storage.sync.get(STORAGE_KEYS.LAST_DIR);
  dirEl.value = st[STORAGE_KEYS.LAST_DIR] || DEFAULTS.lastDirection;
})();

async function saveDirection(val) {
  await chrome.storage.sync.set({ [STORAGE_KEYS.LAST_DIR]: val });
}

function splitDir(val) {
  const [sl, tl] = val.split("->");
  return { sl, tl };
}

function setStatus(txt) { statusEl.textContent = txt || ""; }

function setPre(id, text) { const el = document.getElementById(id); if (el) el.textContent = text || ""; }

async function runAll() {
  const text = srcEl.value.trim();
  if (!text) { setStatus("请输入文本"); return; }

  await saveDirection(dirEl.value);
  const { sl, tl } = splitDir(dirEl.value);
  const targetLang = (tl === "zh-CN") ? "Chinese" : "English";

  setStatus("处理中…");
  setPre("gBase", ""); setPre("aiTrans", ""); setPre("grammar", ""); setPre("suggest", ""); setPre("tips", "");

  // 并发执行：Google + Gemini 四项
  try {
    const gPromise = googleTranslate(text, sl, tl);
    const aiPromise = runGeminiTasks(text, targetLang);

    const [gBase, ai] = await Promise.all([gPromise, aiPromise]);

    setPre("gBase", gBase || "");
    setPre("aiTrans", ai.aiTranslate || "");
    setPre("grammar", ai.grammarFix || "");
    setPre("suggest", ai.aiSuggestions || "");
    setPre("tips", ai.learningTips || "");

    setStatus("完成");
  } catch (e) {
    console.error(e);
    setStatus("部分任务失败，请检查设置或稍后再试");
  }
}

// Google 直译
async function googleTranslate(text, sl, tl) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  const data = await res.json();
  return (data[0] || []).map(x => x[0]).join("");
}

// Gemini 四任务
async function runGeminiTasks(text, targetLang) {
  const st = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  let cfg = st[STORAGE_KEYS.SETTINGS];
  
  // TODO(human): 实现默认配置处理和详细错误检查
  // 如果配置为空，使用默认值并保存
  if (!cfg) {
    cfg = await loadDefaultSettings();
  }
  
  // 验证必要配置
  if (!cfg?.apiBase) throw new Error("API 地址未配置，请点击'设置'进行配置");
  if (!cfg?.apiKey) throw new Error("API 密钥未配置，请点击'设置'进行配置");

  const { apiBase, apiKey, model, provider, authHeaderName, temperature, prompts } = cfg;

  // 构造四个用户提示
  const tasks = {
    aiTranslate: prompts.aiTranslate.replaceAll("{{TARGET_LANG}}", targetLang),
    grammarFix: prompts.grammarFix.replaceAll("{{TARGET_LANG}}", targetLang),
    aiSuggestions: prompts.aiSuggestions.replaceAll("{{TARGET_LANG}}", targetLang),
    learningTips: prompts.learningTips.replaceAll("{{TARGET_LANG}}", targetLang)
  };

  const entries = Object.entries(tasks).map(async ([k, p]) => {
    const out = await callLLM({
      apiBase, apiKey, model, provider, authHeaderName, temperature,
      systemPrompt: null,
      userPrompt: `${p}\n\n---\nINPUT:\n${text}`
    });
    return [k, out];
  });

  const resPairs = await Promise.all(entries);
  return Object.fromEntries(resPairs);
}

// 统一 LLM 调用（与背景脚本一致）
async function callLLM({ apiBase, apiKey, model, provider = "auto", authHeaderName = "Authorization", temperature = 0.4, systemPrompt, userPrompt }) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey && authHeaderName) headers[authHeaderName] = `Bearer ${apiKey}`;

  const candidates = [];
  if (provider === "openai" || provider === "auto") {
    candidates.push({
      url: joinUrl(apiBase, "/v1/chat/completions"),
      body: {
        model,
        temperature,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: userPrompt }
        ]
      },
      extract: async (res) => (await res.json()).choices?.[0]?.message?.content?.trim()
    });
  }
  if (provider === "gemini" || provider === "auto") {
    candidates.push({
      url: guessGeminiUrl(apiBase, model),
      body: {
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { temperature }
      },
      extract: async (res) => {
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts;
        return Array.isArray(parts) ? parts.map(p => p.text || "").join("").trim() : (data.output_text || "").trim();
      }
    });
  }

  let lastErr;
  for (const c of candidates) {
    try {
      const r = await fetch(c.url, { method: "POST", headers, body: JSON.stringify(c.body) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await c.extract(r);
      if (text) return text;
      lastErr = new Error("Empty response");
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("LLM call failed");
}

function joinUrl(base, path) {
  if (!base) return path;
  if (base.endsWith("/") && path.startsWith("/")) return base + path.slice(1);
  if (!base.endsWith("/") && !path.startsWith("/")) return base + "/" + path;
  return base + path;
}
function guessGeminiUrl(base, model) {
  return joinUrl(base, `/v1beta/models/${encodeURIComponent(model)}:generateContent`);
}

// 复制
async function copyById(id) {
  const el = document.getElementById(id);
  const text = el?.textContent || "";
  try { await navigator.clipboard.writeText(text); setStatus("已复制"); }
  catch { setStatus("复制失败"); }
}
async function copyAll() {
  const ids = ["gBase","aiTrans","grammar","suggest","tips"];
  const merged = ids.map(id => {
    const t = document.getElementById(id)?.textContent || "";
    const title = {
      gBase: "【Google直译】",
      aiTrans: "【AI翻译】",
      grammar: "【语法纠正】",
      suggest: "【AI建议】",
      tips: "【学习建议】"
    }[id];
    return `${title}\n${t}`;
  }).join("\n\n");
  try { await navigator.clipboard.writeText(merged); setStatus("已复制全部"); }
  catch { setStatus("复制失败"); }
}
