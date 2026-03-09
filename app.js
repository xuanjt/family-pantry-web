import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAxdIYFl9pQkSvYepPgGV0Pi04pznIm2Cs",
  authDomain: "family-pantry-web.firebaseapp.com",
  projectId: "family-pantry-web",
  storageBucket: "family-pantry-web.firebasestorage.app",
  messagingSenderId: "1008692841723",
  appId: "1:1008692841723:web:de1da5d01256cac894345e",
  measurementId: "G-RK2W6TT9W9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const householdIdEl = document.querySelector("#householdId");
const connectBtn = document.querySelector("#connectBtn");
const addForm = document.querySelector("#addForm");
const nameInput = document.querySelector("#nameInput");
const qtyInput = document.querySelector("#qtyInput");
const qtyUnitInput = document.querySelector("#qtyUnitInput");
const itemsList = document.querySelector("#itemsList");
const imageInput = document.querySelector("#imageInput");
const scanBtn = document.querySelector("#scanBtn");
const importBtn = document.querySelector("#importBtn");
const ocrStatus = document.querySelector("#ocrStatus");
const ocrResult = document.querySelector("#ocrResult");

let currentHouseholdId = "";
let unsubscribe = null;
const translationCache = new Map();

const commonIngredients = [
  "鸡蛋", "牛奶", "酸奶", "黄油", "奶酪", "猪肉", "牛肉", "鸡胸肉", "三文鱼", "虾", "豆腐",
  "西红柿", "土豆", "洋葱", "胡萝卜", "黄瓜", "西兰花", "生菜", "菠菜", "蘑菇", "大蒜", "姜", "葱",
  "苹果", "香蕉", "橙子", "柠檬", "草莓", "蓝莓", "米", "面", "面包", "燕麦", "食用油", "酱油", "醋", "盐", "糖"
];
const ingredientAliasMap = {
  egg: "鸡蛋",
  eggs: "鸡蛋",
  eier: "鸡蛋",
  milch: "牛奶",
  milk: "牛奶",
  butter: "黄油",
  kaese: "奶酪",
  kase: "奶酪",
  kaesee: "奶酪",
  kaesescheiben: "奶酪",
  cheese: "奶酪",
  joghurt: "酸奶",
  yoghurt: "酸奶",
  yogurt: "酸奶",
  tomate: "西红柿",
  tomaten: "西红柿",
  tomato: "西红柿",
  tomatoes: "西红柿",
  kartoffel: "土豆",
  kartoffeln: "土豆",
  potato: "土豆",
  potatoes: "土豆",
  zwiebel: "洋葱",
  zwiebeln: "洋葱",
  onion: "洋葱",
  onions: "洋葱",
  gurke: "黄瓜",
  gurken: "黄瓜",
  cucumber: "黄瓜",
  cucumbers: "黄瓜",
  brokkoli: "西兰花",
  broccoli: "西兰花",
  spinat: "菠菜",
  spinach: "菠菜",
  salat: "生菜",
  lettuce: "生菜",
  knoblauch: "大蒜",
  garlic: "大蒜",
  ingwer: "姜",
  ginger: "姜",
  apfel: "苹果",
  apfeln: "苹果",
  apple: "苹果",
  banana: "香蕉",
  bananen: "香蕉",
  orange: "橙子",
  oranges: "橙子",
  zitrone: "柠檬",
  zitronen: "柠檬",
  lemon: "柠檬",
  reis: "米",
  rice: "米",
  nudel: "面",
  nudeln: "面",
  pasta: "面",
  brot: "面包",
  bread: "面包",
  hafer: "燕麦",
  oatmeal: "燕麦",
  oats: "燕麦",
  salz: "盐",
  salt: "盐",
  zucker: "糖",
  sugar: "糖",
  essig: "醋",
  vinegar: "醋",
  sojasauce: "酱油",
  soy: "酱油",
  chicken: "鸡肉",
  huhn: "鸡肉",
  rindfleisch: "牛肉",
  beef: "牛肉",
  schweinefleisch: "猪肉",
  pork: "猪肉",
  lachs: "三文鱼",
  salmon: "三文鱼",
  garnelen: "虾",
  shrimp: "虾",
  tofu: "豆腐",
};
const zhCharRegex = /[\u4e00-\u9fff]/;

function sanitizeHouseholdId(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
}

function normalizeForLookup(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapIngredientToChinese(text) {
  const normalized = normalizeForLookup(text);
  if (!normalized) return "";
  if (ingredientAliasMap[normalized]) return ingredientAliasMap[normalized];
  const tokens = new Set(normalized.split(" "));

  for (const key of Object.keys(ingredientAliasMap)) {
    if (key.includes(" ") ? normalized.includes(key) : tokens.has(key)) {
      return ingredientAliasMap[key];
    }
  }
  return "";
}

function roundQty(value) {
  return Math.round(value * 100) / 100;
}

function formatQty(value) {
  return Number.isInteger(value) ? `${value}` : `${value.toFixed(2).replace(/\.?0+$/, "")}`;
}

function getItemQuantity(data) {
  if (typeof data.qtyValue === "number" && Number.isFinite(data.qtyValue) && data.qtyValue > 0) {
    return { value: data.qtyValue, unit: data.qtyUnit || "个" };
  }
  const raw = typeof data.qty === "string" ? data.qty.trim() : "";
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (match) {
    return { value: Number(match[1]), unit: match[2]?.trim() || "个" };
  }
  return { value: 1, unit: "个" };
}

async function resolveToChinese(text) {
  const value = text.trim();
  if (!value) return null;
  if (translationCache.has(value)) return translationCache.get(value);
  if (zhCharRegex.test(value)) {
    const result = { original: value, chinese: value, byDictionary: false, manual: false };
    translationCache.set(value, result);
    return result;
  }

  const mapped = mapIngredientToChinese(value);
  if (mapped) {
    const result = { original: value, chinese: mapped, byDictionary: true, manual: false };
    translationCache.set(value, result);
    return result;
  }

  while (true) {
    const manualInput = window.prompt(`未识别到“${value}”的中文，请输入中文名称（留空则跳过）`, "");
    if (manualInput === null || !manualInput.trim()) {
      return null;
    }
    const candidate = manualInput.trim();
    if (!zhCharRegex.test(candidate)) {
      window.alert("请输入中文名称后再确认。");
      continue;
    }
    const result = { original: value, chinese: candidate, byDictionary: false, manual: true };
    translationCache.set(value, result);
    return result;
  }
}

function renderItems(docs) {
  itemsList.innerHTML = "";

  if (!docs.length) {
    itemsList.innerHTML = "<li class='tip'>暂无食材，先添加一条吧。</li>";
    return;
  }

  docs.forEach((itemDoc) => {
    const data = itemDoc.data();
    const qty = getItemQuantity(data);
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="item-main">
        <span class="item-name">${data.name}</span>
        <span class="item-meta">库存：${formatQty(qty.value)} ${qty.unit}</span>
      </div>
      <div class="item-actions">
        <input class="reduce-input" type="number" min="0.01" step="0.01" value="1" />
        <button class="reduce" data-id="${itemDoc.id}">减少数量</button>
      </div>
    `;
    itemsList.appendChild(li);
  });
}

function listenItems(householdId) {
  if (unsubscribe) {
    unsubscribe();
  }

  const itemsRef = collection(db, "households", householdId, "items");
  const q = query(itemsRef, orderBy("createdAt", "desc"));

  unsubscribe = onSnapshot(q, (snapshot) => {
    renderItems(snapshot.docs);
  });
}

function connectHousehold(householdId) {
  const value = sanitizeHouseholdId(householdId);
  if (!value) {
    alert("请输入家庭代码");
    return false;
  }
  currentHouseholdId = value;
  householdIdEl.value = value;
  listenItems(value);
  localStorage.setItem("householdId", value);
  ocrStatus.textContent = `已连接家庭仓库：${value}`;
  return true;
}

async function addItem(name, qtyValue = 1, qtyUnit = "个") {
  if (!currentHouseholdId) {
    alert("请先连接家庭仓库");
    return;
  }
  const safeQtyValue = Number.isFinite(qtyValue) && qtyValue > 0 ? roundQty(qtyValue) : 1;
  const safeQtyUnit = qtyUnit.trim() || "个";

  await addDoc(collection(db, "households", currentHouseholdId, "items"), {
    name: name.trim(),
    qtyValue: safeQtyValue,
    qtyUnit: safeQtyUnit,
    qty: `${formatQty(safeQtyValue)} ${safeQtyUnit}`,
    createdAt: serverTimestamp(),
  });
}

async function reduceItemQuantity(itemId, reduceBy) {
  const itemRef = doc(db, "households", currentHouseholdId, "items", itemId);
  let result = { deleted: false, nextValue: 0, unit: "个", name: "" };

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(itemRef);
    if (!snapshot.exists()) {
      return;
    }
    const data = snapshot.data();
    const qty = getItemQuantity(data);
    const nextValue = roundQty(qty.value - reduceBy);
    result = { deleted: false, nextValue, unit: qty.unit, name: data.name || "" };
    if (nextValue <= 0) {
      transaction.delete(itemRef);
      result.deleted = true;
      return;
    }
    transaction.update(itemRef, {
      qtyValue: nextValue,
      qtyUnit: qty.unit,
      qty: `${formatQty(nextValue)} ${qty.unit}`,
    });
  });

  return result;
}

connectBtn.addEventListener("click", () => {
  connectHousehold(householdIdEl.value);
});

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const qtyValue = Number(qtyInput.value);
  const qtyUnit = qtyUnitInput.value.trim() || "个";
  if (!name) return;
  if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
    alert("请输入正确的数量（大于 0）");
    return;
  }
  ocrStatus.textContent = "正在转换为中文...";
  const resolved = await resolveToChinese(name);
  if (!resolved) {
    ocrStatus.textContent = "已取消添加";
    return;
  }
  const detail = resolved.byDictionary ? "（词典自动转换）" : (resolved.manual ? "（手动确认）" : "（已是中文）");
  const ok = window.confirm(`确认添加食材？\n原文：${resolved.original}\n入库中文：${resolved.chinese} ${detail}\n数量：${formatQty(qtyValue)} ${qtyUnit}`);
  if (!ok) {
    ocrStatus.textContent = "已取消添加";
    return;
  }
  await addItem(resolved.chinese, qtyValue, qtyUnit);
  ocrStatus.textContent = `已添加：${resolved.chinese}（${formatQty(qtyValue)} ${qtyUnit}）`;
  nameInput.value = "";
  qtyInput.value = "1";
  qtyUnitInput.value = qtyUnit || "个";
});

itemsList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (!target.classList.contains("reduce")) return;

  const itemId = target.dataset.id;
  if (!itemId || !currentHouseholdId) return;
  const row = target.closest(".item");
  if (!row) return;
  const input = row.querySelector(".reduce-input");
  if (!(input instanceof HTMLInputElement)) return;
  const reduceBy = Number(input.value);
  if (!Number.isFinite(reduceBy) || reduceBy <= 0) {
    alert("请输入正确的扣减数量（大于 0）");
    return;
  }

  const result = await reduceItemQuantity(itemId, reduceBy);
  if (result.deleted) {
    ocrStatus.textContent = `已扣减并移除：${result.name}`;
  } else {
    ocrStatus.textContent = `已扣减 ${formatQty(reduceBy)}，剩余 ${formatQty(result.nextValue)} ${result.unit}`;
  }
});

scanBtn.addEventListener("click", async () => {
  const file = imageInput.files?.[0];
  if (!file) {
    alert("请先选择图片");
    return;
  }

  ocrStatus.textContent = "正在识别图片文字，请稍等...";
  const {
    data: { text },
  } = await Tesseract.recognize(file, "chi_sim+eng+deu+fra+spa+ita", {
    logger: (m) => {
      if (m.status === "recognizing text") {
        ocrStatus.textContent = `识别中：${Math.round(m.progress * 100)}%`;
      }
    },
  });

  const lines = text
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const detected = new Set();
  for (const line of lines) {
    for (const ingredient of commonIngredients) {
      if (line.includes(ingredient)) {
        detected.add(ingredient);
      }
    }
    const mapped = mapIngredientToChinese(line);
    if (mapped) {
      detected.add(mapped);
    }
  }

  const output = [...detected];
  if (!output.length) {
    ocrResult.value = lines.slice(0, 20).join("\n");
    ocrStatus.textContent = "未自动匹配到常见食材，已填入原始识别结果，请手工编辑后导入。";
    return;
  }

  ocrResult.value = output.join("\n");
  ocrStatus.textContent = `识别完成，匹配到 ${output.length} 条候选食材。`;
});

importBtn.addEventListener("click", async () => {
  const lines = ocrResult.value
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (!lines.length) {
    alert("没有可导入内容");
    return;
  }

  ocrStatus.textContent = "正在转换为中文...";
  const resolvedList = [];
  for (const line of lines) {
    const resolved = await resolveToChinese(line);
    if (!resolved) continue;
    resolvedList.push(resolved);
  }

  if (!resolvedList.length) {
    ocrStatus.textContent = "没有可导入的食材";
    return;
  }

  const preview = resolvedList
    .map((item, idx) => `${idx + 1}. ${item.original} -> ${item.chinese}`)
    .join("\n");
  const ok = window.confirm(`请确认导入以下食材（统一中文）：\n\n${preview}`);
  if (!ok) {
    ocrStatus.textContent = "已取消导入";
    return;
  }

  for (const item of resolvedList) {
    await addItem(item.chinese, 1, "个");
  }

  ocrStatus.textContent = `已导入 ${resolvedList.length} 条食材（统一为中文）`;
});

const saved = localStorage.getItem("householdId");
if (saved) {
  connectHousehold(saved);
}
