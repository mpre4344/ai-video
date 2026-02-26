# ai-video (GitHub Pages)

纯前端 AI 视频生产台，直接部署到 GitHub Pages。  
你只要填 `BaseURL + API Key + 模型` 就能用。

## 在线部署
仓库推送到 `main` 后会自动通过 GitHub Actions 发布到 Pages（`docs/` 目录）。

## 功能
- 剧本 -> 9镜头分镜（调用 `/chat/completions`）
- 9镜头 -> 九宫格 Prompt
- 九宫格图切 9 张（浏览器本地 Canvas）
- 9镜头组装连续视频 Prompt 并调用 `/videos/generations`
- 服务台 ID/Token 生成 curl 模板

## 本地预览
直接打开 `docs/index.html` 即可（或用任意静态服务器）。

## 安全提醒
这是纯前端方案：API Key 会在浏览器中使用并保存在 localStorage。仅用于你自己受控环境。
