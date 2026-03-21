[English](./MACOS_SIGNING.md) | 简体中文

# macOS 签名 / notarization 配置指南

这份指南是给维护者的。目标是让 `Fries` 的 GitHub Actions 在发布 `macOS zip / dmg` 时，能够自动完成：

- `Developer ID Application` 签名
- Apple notarization（公证）

如果这些材料还没准备好，CI 也仍然会退回到“未签名 beta 包”，不会把整条发布链路炸掉。

## 你现在到底缺什么

真正缺的是 Apple 开发者体系里的 5 项材料：

1. `Developer ID Application` 证书导出的 `.p12`
2. 这个 `.p12` 的密码
3. `AuthKey_XXXXXX.p8`
4. `APPLE_API_KEY_ID`
5. `APPLE_API_ISSUER`

## 前置条件

你需要先有：

- Apple Developer 付费账号
- 一台能登录该账号的 Mac

没有 Apple Developer 账号的话，只能继续发布未签名的 macOS beta，不能做“普通 Mac 用户双击就顺滑安装”的正式签名版。

## 第一步：拿到 Developer ID Application 证书

1. 打开 Apple Developer 后台  
   [Apple Developer Account](https://developer.apple.com/account/)
2. 进入 `Certificates, IDs & Profiles`
3. 创建或下载 `Developer ID Application` 证书
4. 在你的 Mac 上把这个证书导入“钥匙串访问”
5. 在“钥匙串访问”里找到对应证书和私钥，导出成 `.p12`
6. 导出时设置一个密码，这个密码后面要作为 `CSC_KEY_PASSWORD`

最后你会得到：

- 一个 `.p12` 文件
- 一个 `.p12` 密码

## 第二步：拿到 App Store Connect API Key

1. 打开  
   [App Store Connect](https://appstoreconnect.apple.com/)
2. 进入 `Users and Access`
3. 再进入 `Integrations`
4. 再进入 `App Store Connect API`
5. 新建一个 API Key
6. 下载后会得到 `AuthKey_XXXXXX.p8`
7. 页面上同时会显示：
   - `Key ID`
   - `Issuer ID`

最后你会得到：

- `AuthKey_XXXXXX.p8`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

## 第三步：这 5 项要分别写到哪里

GitHub Actions secrets 对应关系如下：

- `CSC_LINK`
  - `.p12` 文件的 Base64
- `CSC_KEY_PASSWORD`
  - `.p12` 密码
- `APPLE_API_KEY_P8_BASE64`
  - `AuthKey_XXXXXX.p8` 的 Base64
- `APPLE_API_KEY_ID`
  - Apple 页面显示的 Key ID
- `APPLE_API_ISSUER`
  - Apple 页面显示的 Issuer ID

## 第四步：最省事的写法

仓库已经带了上传脚本，你只要准备好本机文件路径，就可以直接执行：

```powershell
npm run setup:macos-secrets -- `
  -Repo sunrisever/fries `
  -P12Path C:\path\DeveloperID.p12 `
  -P12Password "your-p12-password" `
  -AppleApiKeyId ABC123DEFG `
  -AppleApiIssuer 00000000-0000-0000-0000-000000000000 `
  -AppleApiKeyP8Path C:\path\AuthKey_ABC123DEFG.p8
```

脚本位置：

- `scripts/setup-macos-secrets.ps1`

## 第五步：配完之后会发生什么

当下面这些 secrets 都存在时：

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `APPLE_API_KEY_P8_BASE64`

GitHub Release workflow 就会在 macOS runner 上自动尝试：

- 签名
- notarization
- 上传签名后的 `zip / dmg`

如果这些 secrets 缺失，workflow 仍然会继续，只是回退成：

- `unsigned zip`
- `unsigned dmg`

## 备用方案：Apple ID

如果你暂时没有 API Key，也可以走 Apple ID 兜底：

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

不过现在仓库默认更推荐 App Store Connect API Key 方案，因为更适合 CI 自动化。

## 你现在最实际该做什么

按顺序就是：

1. 确认你有没有 Apple Developer 付费账号
2. 在一台 Mac 上导出 `Developer ID Application .p12`
3. 在 App Store Connect 里创建 API Key，拿到 `.p8 / Key ID / Issuer ID`
4. 用仓库自带脚本写入 GitHub secrets
5. 重新发一个新 beta 验证签名 / notarization

## 官方入口

- [Apple Developer Account](https://developer.apple.com/account/)
- [App Store Connect](https://appstoreconnect.apple.com/)
