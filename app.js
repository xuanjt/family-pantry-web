import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const householdIdEl = document.querySelector("#householdId");
const connectBtn = document.querySelector("#connectBtn");
const addForm = document.querySelector("#addForm");
const nameInput = document.querySelector("#nameInput");
const qtyInput = document.querySelector("#qtyInput");
const itemsList = document.querySelector("#itemsList");
const imageInput = document.querySelector("#imageInput");
const scanBtn = document.querySelector("#scanBtn");
const importBtn = document.querySelector("#importBtn");
const ocrStatus = document.querySelector("#ocrStatus");
const ocrResult = document.querySelector("#ocrResult");

let currentHouseholdId = "";
let unsubscribe = null;

const commonIngredients = [
  "鸡蛋", "牛奶", "酸奶", "黄油", "奶酪", "猪肉", "牛肉", "鸡胸肉", "三文鱼", "虾", "豆腐",
  "西红柿", "土豆", "洋葱", "胡萝卜", "黄瓜", "西兰花", "生菜", "菠菜", "蘑菇", "大蒜", "姜", "葱",
  "苹果", "香蕉", "橙子", "柠檬", "草莓", "蓝莓", "米", "面", "面包", "燕麦", "食用油", "酱油", "醋", "盐", "糖"
];

function sanitizeHouseholdId(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
}

function renderItems(docs) {
  itemsList.innerHTML = "";

  if (!docs.length) {
    itemsList.innerHTML = "<li class='tip'>暂无食材，先添加一条吧。</li>";
    return;
  }

  docs.forEach((itemDoc) => {
    const data = itemDoc.data();
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="item-main">
        <span class="item-name">${data.name}</span>
        <span class="item-meta">${data.qty || "未填数量"}</span>
      </div>
      <button class="del" data-id="${itemDoc.id}">删除</button>
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

async function addItem(name, qty = "") {
  if (!currentHouseholdId) {
    alert("请先连接家庭仓库");
    return;
  }

  await addDoc(collection(db, "households", currentHouseholdId, "items"), {
    name: name.trim(),
    qty: qty.trim(),
    createdAt: serverTimestamp(),
  });
}

connectBtn.addEventListener("click", () => {
  const value = sanitizeHouseholdId(householdIdEl.value);
  if (!value) {
    alert("请输入家庭代码");
    return;
  }
  currentHouseholdId = value;
  listenItems(value);
  localStorage.setItem("householdId", value);
  ocrStatus.textContent = `已连接家庭仓库：${value}`;
});

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const qty = qtyInput.value.trim();
  if (!name) return;
  await addItem(name, qty);
  nameInput.value = "";
  qtyInput.value = "";
});

itemsList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  const itemId = target.dataset.id;
  if (!itemId || !currentHouseholdId) return;

  await deleteDoc(doc(db, "households", currentHouseholdId, "items", itemId));
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
  } = await Tesseract.recognize(file, "chi_sim+eng", {
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

  for (const line of lines) {
    await addItem(line);
  }

  ocrStatus.textContent = `已导入 ${lines.length} 条食材`;
});

const saved = localStorage.getItem("householdId");
if (saved) {
  householdIdEl.value = saved;
}
