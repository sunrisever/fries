[English](./README.md) | 简体中文

# 薯条

薯条（Fries）是一个本地桌面仪表盘，专门用来管理多账号流量额度、订阅到期、快照缓存和 token 统计。它特别适合有多个 OpenAI Team / Business 坑位、或者同时观察 Claude、Gemini、Kimi、Qwen 等 provider 的用户。

## 项目定位

多账号流量额度与订阅运营桌面仪表盘 | Desktop dashboard for multi-account quota and subscription ops

## 核心能力

- 以 OpenAI 主线账号运营盘为核心，自动同步本机 Codex 使用窗口
- 区分 OpenAI、观察类 provider、精确额度 API provider
- 统一快照缓存目录，支持保留天数和自动清理
- 支持日 / 周 / 月 token 分析、热力图和更像行情软件的趋势图
- 设置页统一管理主题、语言、缓存、路径和账号编辑
- 支持 JSON 导入导出，并提供公开可提交的示例数据目录
- 内置自检器，可检查重复 OpenAI 订阅签名、孤儿快照和时间线异常
- 提供 `AGENTS.md` 与 `CLAUDE.md`，方便多种 AI 编码助手直接协作

## 适用场景

- OpenAI Team / Business seat 轮换
- ChatGPT Plus / Codex 本地额度观察
- Claude / Gemini / Kimi / Qwen 等副线观察
- 更偏好本地常驻桌面工具，而不是单独打开网页的人

## 技术栈

- Electron
- React + Vite + TypeScript
- Lightweight Charts
- 本地 JSON 状态文件 + 快照目录

## 目录结构

```text
build/                         构建资源，例如图标
electron/                      Electron 主进程、预加载与同步逻辑
examples/sample-data/          可公开提交的示例数据
local/                         本地私有工作区（默认忽略）
public/                        静态资源
scripts/                       发布、图标与校验脚本
src/                           React 应用
tests/                         基于 Node 的冒烟测试
```

## 数据目录

运行时数据不放在项目目录里，而是放在系统 AppData 下：

- 状态文件：`%APPDATA%\\Fries\\subscriptions.json`
- 快照目录：`%APPDATA%\\Fries\\data\\snapshots`
- 导入目录：`%APPDATA%\\Fries\\data\\imports`
- 时间线日志：`%APPDATA%\\Fries\\data\\timeline-events`

这些路径在设置页里也能直接打开，不需要手动找目录。

## 主题系统

主题拆成三层：

- 外观模式：`跟随系统`、`浅色`、`深色`
- 视觉特效：`透明 / Frosted`、`纯色 / Solid`
- 配色方案：`北欧蓝`、`海盐灰蓝`、`活力橙`、`复古橙`、`玫瑰红`、`柠檬绿`、`火烈鸟`、`紫罗兰`、`薰衣草`、`桃红`、`樱花粉`

这样可以把“亮暗模式”和“配色偏好”分开，比较适合开源软件让不同用户自己挑。

## 示例数据

公开示例放在：

- `examples/sample-data/subscriptions.example.json`
- `examples/sample-data/snapshots/openai-snapshot.example.json`

这些文件已经脱敏，适合放进仓库。真实账号导出、cookies、tokens、私人截图和日志请放到 `local/` 目录，不要提交。

## 开发

```bash
npm install
npm run dev
npm run check
npm run self-check
```

`npm run check` 会依次执行：

- TypeScript 类型检查
- `node:test` 冒烟测试
- 示例数据校验
- 发布文档一致性校验

## 打包

```bash
npm run pack:dir
npm run pack:installer
npm run pack:portable
npm run pack:mac
npm run release:beta
```

当前已经稳定产出的包型：

- Windows 安装包：`Fries-Setup-<version>-x64.exe`
- Windows 便携版：`Fries-Portable-<version>-x64.exe`
- Windows 免安装运行目录：`release/win-unpacked/`
- macOS zip / dmg：`Fries-<version>-arm64.zip` / `Fries-<version>-arm64.dmg`

发布渠道现在分成三层：

- 本地 Windows 打包脚本仍然使用 `--publish never`，所以本机执行时不会误上传。
- GitHub Actions 会在 tag 上跑 `Windows + macOS` release matrix，并把产物上传到 GitHub Releases。
- GitHub Actions 自己的 artifacts 也会保留各平台包，方便先验收再正式下载。

多平台说明：

- Windows 提供安装包、便携版和免安装目录。
- macOS 通过 CI 产出 `dmg` / `zip`；如果配置了 Apple 签名 secrets，workflow 已经预留自动签名与 notarization。若 secrets 缺失，CI 会继续回退到未签名 beta 产物。
- Linux 这轮先不作为正式发布目标。

签名 / notarization 的预留说明见：`docs/publishing/MACOS_SIGNING.md`

## 当前版本

- 当前版本号：`0.4.3-beta`
- 产品名：`Fries / 薯条`
- Windows 安装包文件名：`Fries-Setup-0.4.3-beta-x64.exe`
- Windows 便携版文件名：`Fries-Portable-0.4.3-beta-x64.exe`

## 开源发布建议

- 许可证：MIT
- 建议仓库名：`sunrisever/fries`
- GitHub Actions CI：`.github/workflows/ci.yml`
- GitHub Actions 发布矩阵（Windows + macOS）：`.github/workflows/release.yml`
- 维护者发布文档：`docs/publishing/`
- macOS 签名 / notarization 预留：`docs/publishing/MACOS_SIGNING.md`
- 建议 GitHub topics：
  `codex`, `claude-code`, `opencode`, `openclaw`, `agents-md`, `agent-skill`, `claude-code-skill`

## 隐私说明

- 不要提交真实账号导出、认证材料和私人截图
- `local/` 专门留给本地私有文件
- 所有示例数据都应该先脱敏再发布

## 许可证

MIT © sunrisever
