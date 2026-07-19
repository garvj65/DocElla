const appModule = await import("../dist/app.js");

if (typeof appModule.createApp !== "function") {
  throw new TypeError("Expected dist/app.js to export createApp.");
}
