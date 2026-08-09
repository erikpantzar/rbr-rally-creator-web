import { test as base, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const SCREENSHOT_DIR = "test-results/screenshots";

async function takeScreenshot(page: Page, name: string) {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const path = `${SCREENSHOT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

type Fixtures = {
  snap: (name: string) => Promise<string>;
};

export const test = base.extend<Fixtures>({
  snap: async ({ page }, use) => {
    await use((name: string) => takeScreenshot(page, name));
  },
});

export { expect } from "@playwright/test";
