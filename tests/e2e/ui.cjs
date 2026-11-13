// 실제 크롬으로 사용자처럼 써보기: 입력 → 판 추가 → 결과·비교·차트 확인, 모바일/데스크톱/다크 스크린샷
const puppeteer = require(process.env.PUPPETEER_MODULE || "puppeteer");
const OUT = "C:/twochoice-lab/tests/e2e/";
(async () => {
  const b = await puppeteer.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const page = await b.newPage(); const errs = [];
  page.on("pageerror", e => errs.push(e.message)); page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: "networkidle0" });
  const type = async (sel, v) => { const el = await page.$(sel); await el.click({ clickCount: 3 }); await el.type(v); };
  const inputs = await page.$$("main input[inputmode=numeric]");
  await inputs[0].click({ clickCount: 3 }); await inputs[0].type("230000");
  await inputs[1].click({ clickCount: 3 }); await inputs[1].type("253000");
  // 직접 입력 탭 → 예시 배당표 붙여넣기
  await page.evaluate(() => [...document.querySelectorAll("button")].find(x => x.textContent === "직접 입력").click());
  await page.evaluate(() => document.querySelector("details summary").click());
  await page.evaluate(() => [...document.querySelectorAll("button")].find(x => x.textContent === "예시 배당표 채우기").click());
  await page.evaluate(() => [...document.querySelectorAll("button")].find(x => x.textContent === "붙여넣은 줄 추가").click());
  // 수동 한 줄 추가도 시험
  const t0 = Date.now();
  await page.waitForFunction(() => document.body.innerText.includes("지금 누를 판"), { timeout: 20000 });
  console.log("결과 표시까지", Date.now() - t0, "ms");
  await page.waitForFunction(() => document.body.innerText.includes("평균 판수") && !document.body.innerText.includes("시뮬레이션 중"), { timeout: 60000 });
  console.log("기법 비교까지", Date.now() - t0, "ms");
  const r = await page.evaluate(() => {
    const t = document.body.innerText;
    const pick = (re) => (t.match(re) || [])[0];
    return { chips: pick(/모아둔 판 \d+개/), best: pick(/지금 누를 판[\s\S]{0,40}/)?.replace(/\s+/g, " "), fail: pick(/실패하면 \(\d+%\)\s*약 −[\d,]+/)?.replace(/\s+/g, " "), avg: pick(/평균으로 보면\s*[−+][\d,]+/)?.replace(/\s+/g, " "),
      tiers: [...document.querySelectorAll("main li")].slice(-21,-15).map(li => li.innerText.replace(/\s+/g, " ")), rows: [...document.querySelectorAll("tbody tr")].map(tr => tr.innerText.replace(/\s+/g, " ").slice(0, 90)),
      overflow: document.documentElement.scrollWidth - innerWidth, wide: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.overflow-x-auto')).slice(0,5).map(e => e.tagName + '.' + String(e.className).slice(0,60) + ' r=' + Math.round(e.getBoundingClientRect().right)), svgLines: document.querySelectorAll(".recharts-line").length };
  });
  console.log(JSON.stringify(r, null, 1));
  await page.screenshot({ path: OUT + "m390.png", fullPage: true });
  // 입력 반응 속도: 목표 바꾼 뒤 결과 갱신까지
  const t1 = Date.now(); await inputs[1].click({ clickCount: 3 }); await inputs[1].type("241500");
  await page.waitForFunction(() => /\+11,500/.test(document.body.innerText), { timeout: 5000 });
  await page.waitForFunction(() => !document.body.innerText.includes("계산 중…"), { timeout: 10000 });
  console.log("목표 변경 → 결과 갱신", Date.now() - t1, "ms");
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await page.setViewport({ width: 1280, height: 900 }); await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: OUT + "desk_dark.png", fullPage: true });
  console.log("오류", errs);
  await b.close();
})();
