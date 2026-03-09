# 家庭食材网页（零自建服务器版）

这个项目是一个可部署到静态托管的网页应用，功能：
- 添加/删除食材
- 通过家庭代码共享同一份库存（你和老公都可用）
- 上传冰箱/食材/小票照片，OCR识别后导入

## 为什么不用自己买服务器
- 前端：可放在 GitHub Pages（免费）
- 数据同步：Firebase Firestore Spark（免费额度）
- OCR：Tesseract.js 在浏览器本地跑，不走你自己的服务器

## 本地运行
直接启动静态文件服务：

```bash
cd family-pantry-web
python3 -m http.server 5173
```

打开：`http://localhost:5173`

## Firebase 配置（必须）
1. 去 Firebase 控制台新建项目（Spark 免费套餐）
2. 开启 Firestore Database
3. 获取 Web App 配置，替换 `app.js` 里的 `firebaseConfig`
4. 在 Firestore Rules（开发期）先用：

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /households/{houseId}/items/{itemId} {
      allow read, write: if true;
    }
  }
}
```

注意：上面规则仅适合原型阶段，正式使用建议加登录与权限规则。

## 部署到 GitHub Pages
1. 创建 GitHub 仓库并 push
2. 在仓库 Settings -> Pages 选择 `Deploy from a branch`
3. 选择 `main` 分支的根目录
4. 等待 1-2 分钟后访问分配的网址

## 后续可升级
- 增加登录（Google/邮箱）
- 增加保质期、低库存提醒
- 用条码识别增强识别准确率
