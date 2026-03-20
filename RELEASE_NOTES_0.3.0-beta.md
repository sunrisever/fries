[简体中文](./README_CN.md) | [English](./README.md)

# Fries v0.3.0-beta Release Notes

## Summary

Fries is now ready for a proper public beta. This release focuses on release hygiene, diagnostics, and repository readiness rather than adding another wave of UI complexity.

## Highlights

- Added repository-grade validation via `npm run check`
- Added a built-in self-checker in Settings plus `npm run self-check`
- Added `node:test` smoke tests and example-data validation
- Unified docs and sample data around `subscriptions.json`
- Added CI workflow for GitHub Actions
- Cleaned snapshot-signature drift in local state and trimmed old release artifacts

## Validation

The following passed before this beta release:

- `npm run check`
- `npm run self-check`
- `npm run pack:release`

## Notable Files

- `package.json`
- `electron/self-check.cjs`
- `.github/workflows/ci.yml`
- `CHANGELOG.md`
- `examples/sample-data/subscriptions.example.json`

## 中文简介

`0.3.0-beta` 是第一版更像样的公开 beta。重点不再是继续堆功能，而是把仓库校验、自检器、示例数据、双语文档和发布流程补齐，让这个项目更适合真正开源出去。

本次主要内容：

- 补齐 `npm run check` 仓库级检查链
- 补齐设置页自检器和 `npm run self-check`
- 增加 `node:test` 冒烟测试与示例数据校验
- 统一到 `subscriptions.json` 数据主表
- 增加 GitHub Actions CI
- 清理本地历史快照签名残留与旧 release 产物
