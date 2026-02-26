# video-studio-web

网页版视频生产工作台（MVP）。

## 功能
- 配置 BaseURL + API Key + Model
- 剧本生成 9 镜头分镜提示词
- 九宫格 Prompt 组装
- 九宫格图片切成 9 张（浏览器本地 Canvas）
- 将 9 镜头拼成连续视频 Prompt 并调用 `/videos/generations`
- 服务台 ID/Token 转 curl 模板

## 启动
```bash
npm install
npm run dev
# 打开 http://localhost:8787
```

## 注意
- 不要把真实 API Key 提交到 git。
- 不同平台（Sora2/即梦）的接口字段可能不同，可在 `server.js` 的 `/api/video/generate` 内按平台微调。
