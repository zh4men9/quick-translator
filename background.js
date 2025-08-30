// 存储键
const STORAGE_KEYS = {
  LAST_DIR: "lastDirection", // e.g. "en->zh-CN"
  SETTINGS: "settings"       // { apiBase, apiKey, model, provider, authHeaderName, prompts, temperature }
};

const DEFAULTS = {
  lastDirection: "auto->zh-CN",
  settings: {
    apiBase: "http://localhost:3001/proxy/gemini",
    apiKey: "zh4men9",
    model: "gemini-2.5-flash",
    provider: "auto", // auto | openai | gemini
    authHeaderName: "Authorization", // 常见是 Authorization: Bearer xxx
    temperature: 0.4,
    prompts: {
      aiTranslate: "You are an expert Chinese<>English translator. Translate the user input to {{TARGET_LANG}} with natural, accurate, concise phrasing. Output ONLY the translation.",
      grammarFix: "You are an English writing corrector. Fix grammar/spelling/style of the English text. Provide both English and Chinese versions:\n\n**English Version:**\n1) Corrected text\n2) Brief reasons (bullet points)\n\n**中文版本：**\n1) 纠正后的文本\n2) 简要原因（要点形式）",
      aiSuggestions: "Provide 3 alternative phrasings for the text in {{TARGET_LANG}}. Give both English and Chinese versions:\n\n**English Version:**\n1. [formal] ...\n2. [casual] ...\n3. [concise] ...\n\n**中文版本：**\n1. [正式] ...\n2. [随意] ...\n3. [简洁] ...",
      learningTips: "From the text (assume target language is {{TARGET_LANG}}), extract learning materials. Provide both English and Chinese versions:\n\n**English Version:**\n- 5 useful collocations/phrases\n- 2 key grammar notes\n- 2 mini exercises (fill-in-the-blank or paraphrase)\nAnswers at the end.\n\n**中文版本：**\n- 5个有用的搭配/短语\n- 2个关键语法要点\n- 2个小练习（填空或改写）\n答案在末尾。"
    }
  }
};

// 初始化右键菜单
chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  chrome.contextMenus.create({
    id: "toZh",
    title: "翻译为中文（复制到剪贴板）",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "toEn",
    title: "Translate to English (copied to clipboard)",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "learnAI",
    title: "学习版翻译（Gemini）",
    contexts: ["selection"]
  });
});

// 监听窗口关闭事件，清理pin状态
chrome.windows.onRemoved.addListener(async (windowId) => {
  const result = await chrome.storage.local.get('pinnedWindowId');
  if (result.pinnedWindowId === windowId) {
    await chrome.storage.local.remove('pinnedWindowId');
  }
});

async function ensureDefaults() {
  const st = await chrome.storage.sync.get([STORAGE_KEYS.LAST_DIR, STORAGE_KEYS.SETTINGS]);
  if (!st[STORAGE_KEYS.LAST_DIR]) {
    await chrome.storage.sync.set({ [STORAGE_KEYS.LAST_DIR]: DEFAULTS.lastDirection });
  }
  if (!st[STORAGE_KEYS.SETTINGS]) {
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: DEFAULTS.settings });
  }
}

// Google 直译
async function googleTranslate(text, sl, tl) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data[0] || []).map(x => x[0]).join("");
}

// 学习版浮层（页面内注入）
function injectLearningOverlay(toRender) {
  const css = `
  .qt-overlay {
    position: fixed; z-index: 2147483647; right: 16px; bottom: 16px;
    width: min(520px, 90vw); max-height: 70vh; overflow: auto;
    background: #111; color: #fff; padding: 14px 16px; border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,.5); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  .qt-overlay h4 { margin: 0 0 8px; font-size: 16px; }
  .qt-overlay pre { white-space: pre-wrap; word-wrap: break-word; background:#181818; padding:10px; border-radius:8px }
  .qt-overlay .qt-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px }
  .qt-overlay button { background:#2b2b2b; color:#fff; border:1px solid #333; padding:6px 10px; border-radius:8px; cursor:pointer }
  .qt-overlay .qt-row { margin-top:8px }
  `;
  const js = (text) => {
    const el = document.createElement('div');
    el.className = 'qt-overlay';
    el.innerHTML = `
      <div class="qt-top">
        <h4>学习版翻译（Gemini）</h4>
        <div>
          <button id="qt-copy">复制</button>
          <button id="qt-close">关闭</button>
        </div>
      </div>
      <div class="qt-row"><strong>AI 翻译：</strong><pre id="qt-translate"></pre></div>
      <div class="qt-row"><strong>学习建议：</strong><pre id="qt-tips"></pre></div>
    `;
    document.body.appendChild(el);
    const data = JSON.parse(text);
    el.querySelector('#qt-translate').textContent = data.aiTranslate || "";
    el.querySelector('#qt-tips').textContent = data.learningTips || "";
    el.querySelector('#qt-close').onclick = () => el.remove();
    el.querySelector('#qt-copy').onclick = () => navigator.clipboard.writeText(
      `AI翻译：\n${data.aiTranslate || ""}\n\n学习建议：\n${data.learningTips || ""}`
    );
  };
  return { css, js: `(${js})(\`${JSON.stringify(toRender).replace(/`/g,"\\`")}\`)` };
}

// Gemini 多任务调用（在 popup 用完全体，这里右键只用两项）
async function runGeminiMiniTasks({ text, targetLang }) {
  const st = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  const cfg = st[STORAGE_KEYS.SETTINGS] || DEFAULTS.settings;
  const { apiBase, apiKey, model, provider, authHeaderName, temperature, prompts } = cfg;

  const tasks = {
    aiTranslate: prompts.aiTranslate.replaceAll("{{TARGET_LANG}}", targetLang),
    learningTips: prompts.learningTips.replaceAll("{{TARGET_LANG}}", targetLang)
  };

  const results = {};
  for (const [key, prompt] of Object.entries(tasks)) {
    const content = await callLLM({
      apiBase, apiKey, model, provider, authHeaderName, temperature,
      systemPrompt: null,
      userPrompt: `${prompt}\n\n---\nINPUT:\n${text}`
    });
    results[key] = content;
  }
  return results;
}

// 调用 LLM（兼容多协议，按序尝试）
async function callLLM({ apiBase, apiKey, model, provider = "auto", authHeaderName = "Authorization", temperature = 0.4, systemPrompt, userPrompt }) {
  const headers = {
    "Content-Type": "application/json",
  };
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
      // Gemini 原生可能用 x-goog-api-key，也可能透传 Authorization，前者常见：这里继续用 Authorization 以兼容你的路由
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
    } catch (e) {
      lastErr = e;
    }
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
  // 常见 Gemini 原生路由：/v1beta/models/{model}:generateContent
  return joinUrl(base, `/v1beta/models/${encodeURIComponent(model)}:generateContent`);
}

// 右键逻辑
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText || !tab?.id) return;

  // 获取/更新上次方向
  let { [STORAGE_KEYS.LAST_DIR]: lastDirection } = await chrome.storage.sync.get(STORAGE_KEYS.LAST_DIR);
  if (!lastDirection) lastDirection = DEFAULTS.lastDirection;

  if (info.menuItemId === "toZh") lastDirection = "auto->zh-CN";
  if (info.menuItemId === "toEn") lastDirection = "auto->en";
  await chrome.storage.sync.set({ [STORAGE_KEYS.LAST_DIR]: lastDirection });

  const tl = lastDirection.split("->")[1];

  try {
    if (info.menuItemId === "learnAI") {
      const ai = await runGeminiMiniTasks({ text: info.selectionText, targetLang: tl === "zh-CN" ? "Chinese" : "English" });
      const overlay = injectLearningOverlay(ai);
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, css: overlay.css });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: new Function(overlay.js) });
      // 同时复制
      const copyText = `AI翻译：\n${ai.aiTranslate || ""}\n\n学习建议：\n${ai.learningTips || ""}`;
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [copyText],
        func: (t) => navigator.clipboard.writeText(t).catch(()=>{})
      });
    } else {
      const out = await googleTranslate(info.selectionText, "auto", tl);
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [out],
        func: (text) => { navigator.clipboard.writeText(text).catch(()=>{}); alert(`翻译结果：\n\n${text}`); }
      });
    }
  } catch (e) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [String(e)],
      func: (msg) => alert("翻译失败：" + msg)
    });
  }
});
