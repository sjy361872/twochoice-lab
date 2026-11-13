const puppeteer = require(process.env.PUPPETEER_MODULE || "puppeteer");
(async () => {
  const b = await puppeteer.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const page = await b.newPage(); const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "networkidle0" });
  const n = await page.evaluate(() => document.querySelectorAll("main li").length);
  const card = await page.$$("main section"); await card[1].screenshot({ path: "C:/twochoice-lab/tests/e2e/auto_light.png" });
  console.log("자동 목록 항목", n, "오류", errs, "가로 넘침", await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await b.close();
})();
