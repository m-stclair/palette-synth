import { expect, test } from "@playwright/test";

test("Palette Synth starts without browser errors", async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", message => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", error => {
    pageErrors.push(error.message);
  });

  await page.goto("/");

  await expect(page).toHaveTitle("Palette Synth");

  await expect(page.locator("#canvas")).toBeVisible();
  await expect(page.locator("#toolPane")).toBeVisible();
  await expect(page.locator("#palettePreview")).toBeVisible();

  await expect(page.locator("#error")).toBeHidden();

  // Proves async startup finished:
  // app.js loaded, shaders fetched, WebGL2 context created, demo image loaded.
  await expect(page.locator("#status")).toContainText("demo image:");

  // Proves the demo image produced an extracted/rendered palette.
  await expect(page.locator("#paletteCount")).not.toHaveText("0 colors");

  expect(pageErrors, "uncaught page errors").toEqual([]);
  expect(consoleErrors, "console errors").toEqual([]);
});

