const STORAGE_KEYS = {
  LAST_DIR: "lastDirection",
  SETTINGS: "settings",
  HISTORY: "translationHistory",
  LAST_RESULT: "lastTranslationResult"
};

const DEFAULTS = {
  lastDirection: "auto->zh-CN",
  settings: {
    apiBase: "http://localhost:3001/proxy/gemini",
    apiKey: "zh4men9",
    model: "gemini-2.5-flash",
    provider: "auto",
    authHeaderName: "Authorization",
    temperature: 0.4,
    prompts: {
      aiTranslate: "You are an expert Chinese<>English translator. Translate the user input to {{TARGET_LANG}} with natural, accurate, concise phrasing. Output ONLY the translation.",
      grammarFix: "You are an English writing corrector. Fix grammar/spelling/style of the English text. Provide both English and Chinese versions:\n\n**English Version:**\n1) Corrected text\n2) Brief reasons (bullet points)\n\n**中文版本：**\n1) 纠正后的文本\n2) 简要原因（要点形式）",
      aiSuggestions: "Provide 3 alternative phrasings for the text in {{TARGET_LANG}}. Give both English and Chinese versions:\n\n**English Version:**\n1. [formal] ...\n2. [casual] ...\n3. [concise] ...\n\n**中文版本：**\n1. [正式] ...\n2. [随意] ...\n3. [简洁] ...",
      learningTips: "From the text (assume target language is {{TARGET_LANG}}), extract learning materials. Provide both English and Chinese versions:\n\n**English Version:**\n- 5 useful collocations/phrases\n- 2 key grammar notes\n- 2 mini exercises (fill-in-the-blank or paraphrase)\nAnswers at the end.\n\n**中文版本：**\n- 5个有用的搭配/短语\n- 2个关键语法要点\n- 2个小练习（填空或改写）\n答案在末尾。"
    }
  }
};

const $ = (s) => document.querySelector(s);
const dirEl = $("#dir"), srcEl = $("#src"), statusEl = $("#status");
let isPinned = false;

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
  console.log('=== 设置按钮点击事件触发 ===');
  e.preventDefault();
  
  // 显示点击反馈
  setStatus('正在打开设置...');
  
  try {
    console.log('Chrome runtime available:', !!chrome.runtime);
    console.log('openOptionsPage function available:', !!chrome.runtime.openOptionsPage);
    
    if (chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage().then(() => {
        console.log('Options page opened successfully');
        setStatus('设置页面已打开');
      }).catch((error) => {
        console.error('Failed to open options page:', error);
        setStatus('打开设置失败: ' + error.message);
      });
    } else {
      console.error('chrome.runtime.openOptionsPage is not available');
      alert('设置功能不可用，请检查扩展是否正确加载');
      setStatus('设置功能不可用');
    }
  } catch (error) {
    console.error('Exception in settings button handler:', error);
    alert('设置按钮错误: ' + error.message);
    setStatus('设置按钮错误: ' + error.message);
  }
});

$("#runAll").addEventListener("click", runAll);
$("#copyAll").addEventListener("click", copyAll);
$("#pinToggle").addEventListener("click", togglePin);
$("#toggleHistory").addEventListener("click", toggleHistoryPanel);
$("#clearHistory").addEventListener("click", async (e) => {
  e.preventDefault();
  if (confirm("确定要清除所有历史记录吗？")) {
    await clearHistory();
  }
});
Array.from(document.querySelectorAll(".copy")).forEach(btn => {
  btn.addEventListener("click", () => copyById(btn.dataset.copy));
});

srcEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runAll();
});

(async function init() {
  console.log('=== 扩展初始化开始 ===');
  console.log('Chrome扩展API可用:', !!chrome);
  console.log('Chrome Runtime可用:', !!chrome.runtime);
  console.log('Chrome Storage可用:', !!chrome.storage);
  
  try {
    const st = await chrome.storage.sync.get(STORAGE_KEYS.LAST_DIR);
    dirEl.value = st[STORAGE_KEYS.LAST_DIR] || DEFAULTS.lastDirection;
    console.log('翻译方向设置加载:', dirEl.value);
    
    // 检查是否已有固定窗口
    const local = await chrome.storage.local.get('pinnedWindowId');
    if (local.pinnedWindowId) {
      try {
        await chrome.windows.get(local.pinnedWindowId);
        isPinned = true;
        $("#pinToggle").classList.add("pinned");
        $("#pinToggle").title = "取消固定";
        console.log('检测到已固定窗口:', local.pinnedWindowId);
      } catch {
        // 窗口已关闭，清理状态
        await chrome.storage.local.remove('pinnedWindowId');
        console.log('清理已关闭的固定窗口');
      }
    }
    
    // 测试设置按钮
    const settingsBtn = $("#openSettings");
    console.log('设置按钮元素:', settingsBtn);
    console.log('设置按钮事件监听器已添加');
    
  } catch (error) {
    console.error('初始化失败:', error);
    setStatus('初始化失败: ' + error.message);
  }
  
  console.log('=== 扩展初始化完成 ===');
  
  // 自动加载上次翻译结果
  await loadLastResult();
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

  setStatus("正在翻译...");
  clearResults();

  // 先启动Google翻译（通常最快）
  const gPromise = googleTranslate(text, sl, tl).then(result => {
    setPre("gBase", result || "");
    setStatus("Google翻译完成，AI处理中...");
    return result;
  }).catch(e => {
    console.error('Google translate error:', e);
    setPre("gBase", "Google翻译失败");
    return null;
  });

  // 并行启动AI任务
  const aiPromise = runGeminiTasks(text, targetLang);
  
  // 不等待，立即处理Google结果
  gPromise;
  
  // 处理AI结果
  try {
    const ai = await aiPromise;
    setPre("aiTrans", ai.aiTranslate || "");
    setPre("grammar", ai.grammarFix || "");
    setPre("suggest", ai.aiSuggestions || "");
    setPre("tips", ai.learningTips || "");
    setStatus("全部完成");
    
    // 保存翻译结果到历史记录
    await saveTranslationResult({
      text,
      direction: dirEl.value,
      timestamp: Date.now(),
      results: {
        gBase: document.getElementById("gBase").textContent,
        aiTrans: ai.aiTranslate || "",
        grammar: ai.grammarFix || "",
        suggest: ai.aiSuggestions || "",
        tips: ai.learningTips || ""
      }
    });
  } catch (e) {
    console.error('AI tasks error:', e);
    setStatus("AI处理失败: " + (e.message || e));
  }
}

function clearResults() {
  setPre("gBase", ""); 
  setPre("aiTrans", ""); 
  setPre("grammar", ""); 
  setPre("suggest", ""); 
  setPre("tips", "");
}

function togglePin() {
  isPinned = !isPinned;
  const pinBtn = $("#pinToggle");
  
  if (isPinned) {
    pinBtn.classList.add("pinned");
    pinBtn.title = "取消固定";
    openPinnedWindow();
  } else {
    pinBtn.classList.remove("pinned");
    pinBtn.title = "固定窗口";
    closePinnedWindow();
  }
}

async function openPinnedWindow() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    const window = await chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 500,
      height: 700,
      left: currentWindow.left + 50,
      top: currentWindow.top + 50,
      focused: true
    });
    
    // 存储窗口ID以便后续关闭
    chrome.storage.local.set({ pinnedWindowId: window.id });
    setStatus("已固定窗口");
  } catch (e) {
    console.error('Failed to create pinned window:', e);
    setStatus("固定窗口失败: " + e.message);
    isPinned = false;
    $("#pinToggle").classList.remove("pinned");
  }
}

async function closePinnedWindow() {
  try {
    const result = await chrome.storage.local.get('pinnedWindowId');
    if (result.pinnedWindowId) {
      await chrome.windows.remove(result.pinnedWindowId);
      await chrome.storage.local.remove('pinnedWindowId');
    }
    setStatus("已取消固定");
  } catch (e) {
    console.error('Failed to close pinned window:', e);
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

async function runGeminiTasks(text, targetLang) {
  const st = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  let cfg = st[STORAGE_KEYS.SETTINGS];
  
  if (!cfg) {
    cfg = DEFAULTS.settings;
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: cfg });
  }
  
  if (!cfg?.apiBase) throw new Error("API地址未配置，请点击设置");
  if (!cfg?.apiKey) throw new Error("API密钥未配置，请点击设置");

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

// 历史记录管理
async function saveTranslationResult(result) {
  try {
    // 保存当前结果
    await chrome.storage.local.set({ [STORAGE_KEYS.LAST_RESULT]: result });
    
    // 获取历史记录
    const data = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    let history = data[STORAGE_KEYS.HISTORY] || [];
    
    // 添加到历史记录（最多保存10条）
    history.unshift(result);
    if (history.length > 10) {
      history = history.slice(0, 10);
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
    console.log('翻译结果已保存到历史记录');
  } catch (e) {
    console.error('保存历史记录失败:', e);
  }
}

async function loadLastResult() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.LAST_RESULT);
    const lastResult = data[STORAGE_KEYS.LAST_RESULT];
    
    if (lastResult && lastResult.results) {
      // 恢复输入文本和方向
      srcEl.value = lastResult.text || "";
      dirEl.value = lastResult.direction || DEFAULTS.lastDirection;
      
      // 恢复翻译结果
      setPre("gBase", lastResult.results.gBase || "");
      setPre("aiTrans", lastResult.results.aiTrans || "");
      setPre("grammar", lastResult.results.grammar || "");
      setPre("suggest", lastResult.results.suggest || "");
      setPre("tips", lastResult.results.tips || "");
      
      setStatus("已恢复上次翻译结果");
      console.log('已恢复上次翻译结果');
    }
  } catch (e) {
    console.error('加载上次结果失败:', e);
  }
}

function toggleHistoryPanel() {
  const panel = $("#historyPanel");
  if (panel.classList.contains("hidden")) {
    panel.classList.remove("hidden");
    loadHistoryList();
  } else {
    panel.classList.add("hidden");
  }
}

async function loadHistoryList() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    const history = data[STORAGE_KEYS.HISTORY] || [];
    const listEl = $("#historyList");
    
    if (history.length === 0) {
      listEl.innerHTML = '<div style="text-align: center; color: #6c757d; padding: 20px;">暂无历史记录</div>';
      return;
    }
    
    listEl.innerHTML = history.map((item, index) => {
      const date = new Date(item.timestamp);
      const timeStr = date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit', 
        hour: '2-digit',
        minute: '2-digit'
      });
      
      return `
        <div class="history-item" data-index="${index}">
          <div class="history-item-header">
            <div class="history-item-text" title="${item.text}">${item.text}</div>
            <div>
              <span class="history-item-direction">${item.direction}</span>
              <span class="history-item-time">${timeStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    // 为每个历史记录项添加点击事件
    listEl.querySelectorAll('.history-item').forEach((item, index) => {
      item.addEventListener('click', () => loadHistoryItem(index));
    });
    
  } catch (e) {
    console.error('加载历史记录失败:', e);
  }
}

async function loadHistoryItem(index) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    const history = data[STORAGE_KEYS.HISTORY] || [];
    const item = history[index];
    
    if (item) {
      // 加载历史记录的内容
      srcEl.value = item.text;
      dirEl.value = item.direction;
      
      setPre("gBase", item.results.gBase || "");
      setPre("aiTrans", item.results.aiTrans || "");
      setPre("grammar", item.results.grammar || "");
      setPre("suggest", item.results.suggest || "");
      setPre("tips", item.results.tips || "");
      
      // 隐藏历史面板
      $("#historyPanel").classList.add("hidden");
      
      setStatus("已加载历史记录");
    }
  } catch (e) {
    console.error('加载历史记录项失败:', e);
  }
}

// 全局函数，供 HTML onclick 使用
window.loadHistoryItem = loadHistoryItem;

async function clearHistory() {
  try {
    await chrome.storage.local.remove([STORAGE_KEYS.HISTORY, STORAGE_KEYS.LAST_RESULT]);
    clearResults();
    srcEl.value = "";
    // 清空历史列表
    $("#historyList").innerHTML = '<div style="text-align: center; color: #6c757d; padding: 20px;">暂无历史记录</div>';
    setStatus("历史记录已清除");
    console.log('历史记录已清除');
  } catch (e) {
    console.error('清除历史记录失败:', e);
    setStatus("清除历史记录失败");
  }
}
