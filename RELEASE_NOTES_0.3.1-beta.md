[简体中文](./README_CN.md) | [English](./README.md)

# Fries v0.3.1-beta Release Notes

## Summary

This beta aligns the published identity of the app with the renamed project: `Fries / 薯条`. It focuses on polish after the initial public beta by making repository naming, release artifacts, runtime defaults, and Windows packaging all point to the same product name.

## Highlights

- Renamed the repository from `token-chowhound` to `fries`
- Updated GitHub About metadata, homepage, and topics
- Renamed Windows artifacts to the `Fries-*` pattern
- Updated app titles, release docs, and package metadata to `Fries / 薯条`
- Added runtime compatibility so existing `%APPDATA%\\Token Chowhound` data can still migrate into `%APPDATA%\\Fries`

## Validation

The following passed before this beta release:

- `npm run check`
- `npm run pack:release`

## Notable Files

- `package.json`
- `electron/main.cjs`
- `README.md`
- `README_CN.md`
- `CHANGELOG.md`

## 中文简介

`0.3.1-beta` 主要是把项目正式统一改名为 `Fries / 薯条`，并把仓库、发布包、运行目录默认值、文档和 GitHub 展示信息全部对齐，避免出现“仓库叫一个名字、安装包又是另一个名字”的割裂感。

本次主要内容：

- 仓库从 `token-chowhound` 重命名为 `fries`
- GitHub About 描述、主页和 topics 全部同步
- Windows 安装包和便携版统一改成 `Fries-*`
- 应用标题、说明文档、发布说明统一改为 `Fries / 薯条`
- 运行时默认目录切到 `%APPDATA%\\Fries`，同时保留旧目录自动迁移兼容
