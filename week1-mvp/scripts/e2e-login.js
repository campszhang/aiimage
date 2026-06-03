const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const username = process.env.E2E_ADMIN_USERNAME || "admin";
const password = process.env.E2E_ADMIN_PASSWORD || "admin123456";
const chromeExecutable =
  process.env.PLAYWRIGHT_CHROME_EXECUTABLE ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function main() {
  const launchOptions = {
    headless: true,
  };

  if (fs.existsSync(chromeExecutable)) {
    launchOptions.executablePath = chromeExecutable;
  }

  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  const staticFailures = [];
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/_next/static/") && res.status() >= 400) {
      staticFailures.push(`${res.status()} ${url}`);
    }
  });

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForSelector('input[name="username"]', { timeout: 10000 });
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await page.waitForFunction(() => {
      const button = document.querySelector('button[type="submit"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, { timeout: 15000 });

    const [loginResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/auth/login") && res.request().method() === "POST",
        { timeout: 15000 },
      ),
      page.click('button[type="submit"]'),
    ]);

    if (!loginResponse.ok()) {
      const body = await loginResponse.text().catch(() => "");
      throw new Error(`login API failed: ${loginResponse.status()} ${body}`);
    }

    await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });
    await page.waitForSelector("body", { timeout: 10000 });

    const bodyText = await page.locator("body").innerText();
    for (const required of ["家居软品AI", "软品批量摄影", "家居场景图"]) {
      if (!bodyText.includes(required)) {
        throw new Error(`dashboard is missing required text: ${required}`);
      }
    }

    const pages = [
      {
        path: "/batch-photo",
        required: ["软品批量摄影", "选择镜头"],
        forbidden: ["旧鞋款设置", "服饰场景图"],
      },
      {
        path: "/scene-tools",
        required: ["家居场景图"],
        forbidden: ["服饰场景图"],
      },
      {
        path: "/tasks",
        required: ["任务管理", "家居场景图"],
        forbidden: ["服饰场景图"],
      },
      {
        path: "/admin/models",
        required: ["参考素材库", "新增参考素材"],
        forbidden: ["模特形象库", "已有模特"],
      },
      {
        path: "/admin/poses",
        required: ["镜头库", "添加镜头"],
        forbidden: ["姿势库", "添加姿势"],
      },
    ];

    for (const smoke of pages) {
      await page.goto(`${baseUrl}${smoke.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      const text = await page.locator("body").innerText();
      for (const required of smoke.required) {
        if (!text.includes(required)) {
          throw new Error(`${smoke.path} is missing required text: ${required}`);
        }
      }
      for (const forbidden of smoke.forbidden) {
        if (text.includes(forbidden)) {
          throw new Error(`${smoke.path} still shows legacy text: ${forbidden}`);
        }
      }
    }

    if (staticFailures.length > 0) {
      throw new Error(`Next static assets failed:\n${staticFailures.join("\n")}`);
    }

    const screenshotPath = path.join("/tmp", "aiimage-e2e-login-success.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`E2E login passed: ${page.url()}`);
    console.log(`Screenshot: ${screenshotPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
