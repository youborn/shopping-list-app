// @ts-check
const path = require("path");
const { pathToFileURL } = require("url");
const { test, expect } = require("@playwright/test");

const APP_URL = pathToFileURL(path.join(__dirname, "..", "index.html")).href;
const STORAGE_KEY = "shopping-list-items";

// 실제 항목 행만 (빈 상태 안내 li.empty 제외)
const itemRows = (page) => page.locator("#list li:not(.empty)");
const rowByText = (page, text) =>
  itemRows(page).filter({ has: page.locator(".item-text", { hasText: text }) });

async function addItem(page, text) {
  await page.fill("#item-input", text);
  await page.click("#add-form button[type=submit]");
}

test.beforeEach(async ({ page }) => {
  await page.goto(APP_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.describe("초기 상태", () => {
  test("빈 리스트 안내 문구가 보이고 카운트는 비어 있다", async ({ page }) => {
    await expect(page.locator("#list li.empty")).toHaveText(
      "담긴 항목이 없어요. 위에서 추가해보세요."
    );
    await expect(itemRows(page)).toHaveCount(0);
    await expect(page.locator("#count-label")).toHaveText("");
  });
});

test.describe("아이템 추가", () => {
  test("버튼 클릭으로 추가된다", async ({ page }) => {
    await addItem(page, "우유");
    await expect(itemRows(page)).toHaveCount(1);
    await expect(itemRows(page).first().locator(".item-text")).toHaveText("우유");
    await expect(page.locator("#list li.empty")).toHaveCount(0);
    await expect(page.locator("#count-label")).toHaveText("전체 1개 · 완료 0개");
  });

  test("Enter 키로 추가되고 입력창이 비워지며 포커스가 유지된다", async ({ page }) => {
    await page.fill("#item-input", "계란");
    await page.press("#item-input", "Enter");
    await expect(itemRows(page)).toHaveCount(1);
    await expect(page.locator("#item-input")).toHaveValue("");
    await expect(page.locator("#item-input")).toBeFocused();
  });

  test("여러 개를 추가하면 입력 순서대로 표시된다", async ({ page }) => {
    for (const t of ["사과", "바나나", "당근"]) await addItem(page, t);
    await expect(itemRows(page).locator(".item-text")).toHaveText(["사과", "바나나", "당근"]);
    await expect(page.locator("#count-label")).toHaveText("전체 3개 · 완료 0개");
  });

  test("빈 문자열/공백만 입력하면 추가되지 않는다", async ({ page }) => {
    await addItem(page, "");
    await addItem(page, "    ");
    await expect(itemRows(page)).toHaveCount(0);
    await expect(page.locator("#list li.empty")).toBeVisible();
  });

  test("앞뒤 공백은 제거되어 저장된다", async ({ page }) => {
    await addItem(page, "   두부   ");
    await expect(itemRows(page).first().locator(".item-text")).toHaveText("두부");
  });

  test("HTML 태그는 텍스트로 표시된다 (XSS 방지)", async ({ page }) => {
    await addItem(page, "<img src=x onerror=window.__xss=1>");
    await expect(itemRows(page).first().locator(".item-text")).toHaveText(
      "<img src=x onerror=window.__xss=1>"
    );
    await expect(page.locator("#list img")).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test("같은 이름의 항목도 별개로 추가된다", async ({ page }) => {
    await addItem(page, "물");
    await addItem(page, "물");
    await expect(itemRows(page)).toHaveCount(2);
  });
});

test.describe("체크 기능", () => {
  test("체크하면 취소선 스타일과 완료 카운트가 반영된다", async ({ page }) => {
    await addItem(page, "우유");
    await addItem(page, "빵");
    const row = rowByText(page, "우유");
    await row.locator("input[type=checkbox]").check();

    await expect(row).toHaveClass(/checked/);
    await expect(row.locator("input[type=checkbox]")).toBeChecked();
    await expect(row.locator(".item-text")).toHaveCSS("text-decoration-line", "line-through");
    await expect(rowByText(page, "빵")).not.toHaveClass(/checked/);
    await expect(page.locator("#count-label")).toHaveText("전체 2개 · 완료 1개");
  });

  test("체크를 해제하면 원래 상태로 돌아온다", async ({ page }) => {
    await addItem(page, "우유");
    const cb = rowByText(page, "우유").locator("input[type=checkbox]");
    await cb.check();
    await cb.uncheck();
    await expect(rowByText(page, "우유")).not.toHaveClass(/checked/);
    await expect(cb).not.toBeChecked();
    await expect(page.locator("#count-label")).toHaveText("전체 1개 · 완료 0개");
  });
});

test.describe("삭제 기능", () => {
  test("✕ 버튼으로 해당 항목만 삭제된다", async ({ page }) => {
    for (const t of ["사과", "바나나", "당근"]) await addItem(page, t);
    await rowByText(page, "바나나").getByRole("button", { name: "삭제" }).click();
    await expect(itemRows(page).locator(".item-text")).toHaveText(["사과", "당근"]);
    await expect(page.locator("#count-label")).toHaveText("전체 2개 · 완료 0개");
  });

  test("같은 이름 항목 중 클릭한 것 하나만 삭제된다", async ({ page }) => {
    await addItem(page, "물");
    await addItem(page, "물");
    await itemRows(page).first().getByRole("button", { name: "삭제" }).click();
    await expect(itemRows(page)).toHaveCount(1);
  });

  test("마지막 항목을 삭제하면 빈 상태 안내가 다시 보인다", async ({ page }) => {
    await addItem(page, "우유");
    await rowByText(page, "우유").getByRole("button", { name: "삭제" }).click();
    await expect(itemRows(page)).toHaveCount(0);
    await expect(page.locator("#list li.empty")).toBeVisible();
    await expect(page.locator("#count-label")).toHaveText("");
  });

  test("'체크된 항목 삭제'는 체크된 항목만 지운다", async ({ page }) => {
    for (const t of ["사과", "바나나", "당근", "우유"]) await addItem(page, t);
    await rowByText(page, "사과").locator("input[type=checkbox]").check();
    await rowByText(page, "당근").locator("input[type=checkbox]").check();
    await page.click("#clear-checked");
    await expect(itemRows(page).locator(".item-text")).toHaveText(["바나나", "우유"]);
    await expect(page.locator("#count-label")).toHaveText("전체 2개 · 완료 0개");
  });

  test("체크된 항목이 없을 때 '체크된 항목 삭제'는 아무것도 지우지 않는다", async ({ page }) => {
    await addItem(page, "사과");
    await page.click("#clear-checked");
    await expect(itemRows(page)).toHaveCount(1);
  });
});

test.describe("저장(localStorage) 유지", () => {
  test("추가/체크/삭제 상태가 새로고침 후에도 유지된다", async ({ page }) => {
    for (const t of ["사과", "바나나", "당근"]) await addItem(page, t);
    await rowByText(page, "바나나").locator("input[type=checkbox]").check();
    await rowByText(page, "당근").getByRole("button", { name: "삭제" }).click();

    await page.reload();

    await expect(itemRows(page).locator(".item-text")).toHaveText(["사과", "바나나"]);
    await expect(rowByText(page, "바나나")).toHaveClass(/checked/);
    await expect(rowByText(page, "바나나").locator("input[type=checkbox]")).toBeChecked();
    await expect(page.locator("#count-label")).toHaveText("전체 2개 · 완료 1개");

    const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORAGE_KEY);
    expect(stored.map((i) => [i.text, i.checked])).toEqual([
      ["사과", false],
      ["바나나", true],
    ]);
  });

  test("손상된 저장 데이터가 있어도 빈 리스트로 정상 시작한다", async ({ page }) => {
    await page.evaluate((k) => localStorage.setItem(k, "{not json"), STORAGE_KEY);
    await page.reload();
    await expect(page.locator("#list li.empty")).toBeVisible();
    await addItem(page, "우유");
    await expect(itemRows(page)).toHaveCount(1);
  });
});

test("페이지에 콘솔 에러가 없다", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.reload();
  await addItem(page, "우유");
  await rowByText(page, "우유").locator("input[type=checkbox]").check();
  await page.click("#clear-checked");
  expect(errors).toEqual([]);
});
