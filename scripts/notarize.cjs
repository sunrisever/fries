const path = require("path");
const { notarize } = require("@electron/notarize");

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

module.exports = async function notarizeMacApp(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  const keyPath = process.env.APPLE_API_KEY_PATH;
  const keyId = process.env.APPLE_API_KEY_ID;
  const issuer = process.env.APPLE_API_ISSUER;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (hasValue(keyPath) && hasValue(keyId) && hasValue(issuer)) {
    console.log("[notarize] Using App Store Connect API key notarization.");
    await notarize({
      appPath,
      appleApiKey: keyPath,
      appleApiKeyId: keyId,
      appleApiIssuer: issuer,
      tool: "notarytool",
    });
    return;
  }

  if (hasValue(appleId) && hasValue(appleIdPassword) && hasValue(teamId)) {
    console.log("[notarize] Using Apple ID notarization.");
    await notarize({
      appPath,
      appleId,
      appleIdPassword,
      teamId,
      tool: "notarytool",
    });
    return;
  }

  console.log("[notarize] No Apple notarization credentials detected. Skipping notarization.");
};
