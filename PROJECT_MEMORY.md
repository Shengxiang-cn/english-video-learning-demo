# 英文长视频学习助手项目记忆

更新时间：2026-06-03

## 项目定位

这个项目是一个面向英文长视频学习的 Web MVP，参考 Readwise Reader 和 Longcut 的学习体验，但目标不是复刻完整阅读器，而是做出一条闭环：

`添加 YouTube URL -> 解析视频与字幕 -> 生成视频卡片 -> 进入视频学习页 -> 播放视频 -> 同步字幕 -> 划选字幕 -> Ask AI / Save to Notebook -> 结构化笔记 -> Markdown 导出`

产品核心不是普通视频播放器，而是“把长视频变成可学习、可提问、可沉淀、可复习的知识工作台”。

## 真实仓库与线上信息

真实 Git 仓库路径：

```text
/Users/shishengxiang/codex/英文播客学习助手
```

主要 Web 代码目录：

```text
/Users/shishengxiang/codex/英文播客学习助手/desktop-web-demo
```

线上地址：

```text
https://english-video-learning-demo.onrender.com/
```

GitHub 仓库：

```text
Shengxiang-cn/english-video-learning-demo
```

当前线上 `main` 最新提交：

```text
9889ffe Remove reader menu button
```

Render 健康检查接口：

```text
https://english-video-learning-demo.onrender.com/api/health
```

最近一次验证结果：

```json
{"ok":true,"captions":{"supadataConfigured":true},"ai":{"kimiConfigured":true}}
```

## 重要目录说明

```text
desktop-web-demo/
```

当前 Web MVP 主体，包含 React 前端、Node 服务端、YouTube 字幕解析、Kimi AI 问答和翻译能力。

```text
desktop-web-demo/src/App.tsx
desktop-web-demo/src/App.css
desktop-web-demo/src/mockData.ts
```

当前主要 UI 与交互都集中在这些文件。`App.tsx` 仍然偏大，后续如果继续产品化，建议拆分组件。

```text
desktop-web-demo/server.mjs
desktop-web-demo/youtube-transcript-provider.mjs
```

服务端能力，包括 YouTube URL 解析、字幕获取、AI 问答和翻译相关接口。

```text
docs/mvp-demo-plan.md
```

早期 MVP 规划文档。

```text
mobile-app-design/
```

移动端设计资料目录，目前在 Git 状态里是未跟踪目录。之前 Web 改动过程中一直避免触碰它。后续接手时不要误删或误提交，除非用户明确要求处理移动端。

## 当前功能状态

### 已具备的真实能力

- 可以通过 YouTube URL 导入视频。
- 可以生成视频卡片。
- 可以进入视频学习页观看 YouTube 嵌入播放器。
- 可以通过 Supadata 获取 YouTube 字幕。
- 可以通过 Kimi API 进行视频内容提问。
- 可以对字幕做批量翻译。
- 翻译有进度显示。
- 翻译失败后会停止推进进度，并支持 retry failed。
- 可以划选字幕。
- 划选字幕后可以 Ask AI。
- 划选字幕后可以 Save to Notebook。
- AI 回答可以选择保存类型后写入笔记。
- 笔记支持 Markdown 导出。

### 当前页面结构

首页已经从单纯 Reader 仿制，调整为 Deep YouTube Learning Workspace：

- Home 首页
- Library 视频库
- Video Study 视频学习页
- Notes 全局笔记
- Topics 主题页
- Discover 学习发现
- Search 全局搜索
- Settings 设置

这些页面是根据用户提供的 12 张 wireframe 进行初步扩展的，部分内容仍是 mock，用于表达产品信息架构和交互流。

### 当前 Video Study 页面

Video Study 是近期重点修改区域，现在结构是：

- 左侧：深色视频学习播放器卡片。
- 左侧下方：当前学习目标卡片。
- 右侧：学习面板，包含 `INFO / NOTE / CHAT / SUBTITLE` 四个标签。
- `SUBTITLE`：字幕列表、当前字幕高亮、翻译语言选择、翻译进度、失败 retry。
- `CHAT`：建议问题、划选字幕上下文、输入框、AI 回答、保存到 Notebook、保存类型选择。
- `NOTE`：当前视频保存过的笔记。
- `INFO`：视频信息、summary、metadata、suggested topics。

用户最近明确要求删除视频页左上角三条杠折叠菜单按钮，已完成并上线。

## 关键交互原则

用户反复强调：不要只做页面壳子，必须做“真实能用”的闭环。

当前产品重点交互是：

1. 用户添加 YouTube URL。
2. 系统解析 metadata 与字幕。
3. 首页/Library 中出现视频卡片。
4. 用户进入视频学习页观看视频。
5. 字幕在右侧面板中展示。
6. 用户划选一段字幕。
7. 选择 Ask AI 时，只把划选原文放进 Chat 输入框，不要自动塞复杂结构化 prompt。
8. 用户可以继续输入自己的问题。
9. AI 回答后可以 Save to Notebook。
10. 保存时选择类型，例如 Explanation、Key Idea、Review Question。
11. 保存后进入 Notebook，并清空临时 Chat 上下文。

## 用户偏好与设计要求

- 用户希望执行式协作，不喜欢只讲方案。
- 如果要改 UI，应该直接改代码、构建、推送、验证。
- 用户非常在意“是不是改到了他看到的页面本体”，不要只改外围页面。
- 用户希望 Web 端是桌面端信息架构，不是手机界面。
- 用户希望视频页接近 Longcut/Readwise 的学习工作台体验。
- 用户希望左侧和右侧控制栏不要太占空间。
- 用户希望划词 Ask AI 的浮层不要挤掉字幕，应浮在字幕上。
- 用户希望字幕滚动平滑，不要频闪。
- 用户希望字幕和视频不同步时的 jump prompt 不要过度打扰，暂停后人工翻找字幕不应马上提示。
- 用户希望翻译是全局字幕翻译，不只是当前可见字幕。
- 用户希望翻译进度真实，失败后不要继续假装推进。
- 用户希望 UI 使用他提供的真实截图图片，不只是参考风格。

## 最近重要提交记录

```text
9889ffe Remove reader menu button
f7c00c4 Refine video study reader layout
eed1143 Add deep learning workspace IA
ab0973f Remove sidebar brand action icons
041f2a2 Remove inline URL import bar
1c568d1 Smooth subtitle follow behavior
3b2b251 Shrink subtitle translation toolbar
5f1a6f4 Compact translation toolbar into one row
6e49164 Stack translation controls below reader tabs
dc1ac3a Move subtitles into reader side panel
c15d8ff Pause translation on failed batch
0a26f11 Add translation progress and retry controls
```

## 部署与运行

本地主要命令：

```bash
cd /Users/shishengxiang/codex/英文播客学习助手/desktop-web-demo
npm run lint
npm run build
```

本地稳定预览相关脚本：

```bash
npm run preview:stable
npm run serve:stable
npm run stop:stable
npm run status:stable
```

线上部署由 Render 接管。通常提交并推送到 GitHub `main` 后，Render 会自动部署。

推送方式通常是：

```bash
git push origin HEAD:main
```

Render 免费服务会冷启动。用户看到 `Service waking up` 是因为 Render Free Web Service 闲置后会休眠，不是每次都重新 build。第一次访问会唤醒服务，可能要等几十秒。要避免冷启动，需要升级 Render 付费实例，或迁移到不休眠的部署方式。

## API 与环境变量

线上 Render 配置过：

- Kimi API key，用于 AI 问答和翻译。
- Supadata API key，用于 YouTube 字幕获取。

不要把真实 API key 写入仓库。

`.env.example` 只应保留变量名示例。

## 已知问题与后续建议

- `App.tsx` 已经很大，后续建议拆为 `HomePage`、`LibraryPage`、`ReaderPage`、`RightPanel`、`TranscriptPanel`、`ChatPanel`、`NotesPanel` 等组件。
- 目前 Notes/Topics/Discover/Search/Settings 主要是 wireframe 级别的 mock 页面，后续需要接真实数据模型。
- 目前字幕 speaker 识别不作为标准发言人逻辑，已经按用户要求弱化为基于断句分行。
- YouTube 字幕来源依赖公开视频字幕可用性和 Supadata 返回情况，某些视频可能没有可用字幕。
- Kimi 偶尔会返回 overloaded，前端需要继续保持失败提示和 retry。
- Render 免费实例会冷启动，演示给老板前建议提前打开网站预热。
- 用户之前希望做 PPT/社交网络分屏页截图，已有过本地分屏页产物方向，但不是当前最新重点。

## Worktree 注意事项

当前旧聊天环境曾绑定到：

```text
/Users/shishengxiang/Documents/New project 2
```

这个目录不是 Git 仓库，所以 Codex UI 的“派生到新工作树”会失败，报：

```text
Not a git repository
```

正确项目根目录是：

```text
/Users/shishengxiang/codex/英文播客学习助手
```

已经手动派生过一个新 worktree：

```text
/Users/shishengxiang/codex/英文播客学习助手-web-reader-next
```

分支：

```text
web-reader-next
```

它基于 `origin/main` 最新提交 `9889ffe`。

如果新聊天要继续接手，优先把 Codex 工作目录绑定到真实仓库根目录：

```text
/Users/shishengxiang/codex/英文播客学习助手
```

不要绑定到 `/Users/shishengxiang/Documents/New project 2`。

## 接手建议

新接手时先做这几步：

```bash
cd /Users/shishengxiang/codex/英文播客学习助手
git status --short
git worktree list
git log --oneline --decorate -5
```

如果要改 Web：

```bash
cd /Users/shishengxiang/codex/英文播客学习助手/desktop-web-demo
npm run lint
npm run build
```

修改完成后：

```bash
git add desktop-web-demo/src/App.tsx desktop-web-demo/src/App.css
git commit -m "..."
git push origin HEAD:main
```

然后验证线上资源 hash 是否切换，以及：

```bash
curl -sS https://english-video-learning-demo.onrender.com/api/health
```

## 当前产品一句话

这是一个把英文 YouTube 长视频变成“可播放、可读字幕、可划选、可问 AI、可保存成结构化笔记、可导出 Markdown”的深度学习工作台 MVP。
