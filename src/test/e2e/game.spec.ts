// End-to-end: a full game against the maximum number of bots, played through
// the real UI on an iPhone-sized viewport, to a declared winner. Also checks
// offline launch (service worker) and resume-from-localStorage.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const errors: string[] = [];

function watchErrors(page: Page): void {
  errors.length = 0;
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
}

/** Take one human UI step; returns false when the game is over. */
async function humanStep(page: Page): Promise<boolean> {
  if (await page.getByTestId('gameover').isVisible()) return false;
  if (await page.getByTestId('waiting').isVisible().catch(() => false)) {
    await page.waitForTimeout(120);
    return true;
  }
  // Priority-ordered controls; every branch drives the game forward.
  const comboPicker = page.getByTestId('combo-picker');
  if (await comboPicker.isVisible().catch(() => false)) {
    await page.getByTestId('combo-0').click();
    return true;
  }
  const keepPower = page.getByRole('button', { name: 'Keep my power' });
  if (await keepPower.isVisible().catch(() => false)) {
    await keepPower.click();
    return true;
  }
  const begin = page.getByTestId('begin-conquest');
  if (await begin.isVisible().catch(() => false)) {
    await begin.click();
    return true;
  }
  const endConquest = page.getByTestId('end-conquest');
  if (await endConquest.isVisible().catch(() => false)) {
    // Conquer one highlighted region per turn when possible, then stop.
    const highlighted = page.locator('g[data-hl="1"] .tap').first();
    if (await highlighted.isVisible().catch(() => false)) {
      await highlighted.click();
      // A variant sheet may open: take the first option.
      const sheet = page.locator('.sheet button.big').first();
      if (await sheet.isVisible().catch(() => false)) {
        await sheet.click();
      }
      // Whether the tap conquered or just explained an illegal move, stop now.
      const still = await endConquest.isVisible().catch(() => false);
      if (still) await endConquest.click();
      return true;
    }
    await endConquest.click();
    return true;
  }
  const endTurn = page.getByTestId('end-turn');
  if (await endTurn.isVisible().catch(() => false)) {
    if (await endTurn.isEnabled()) {
      await endTurn.click();
      return true;
    }
  }
  // Redeploy: prefer the garrison editor's + buttons when present.
  const plus = page.locator('[data-testid^="plus-"]:enabled').first();
  if (await plus.isVisible().catch(() => false)) {
    await plus.click();
    return true;
  }
  // Defender retreat / balrog / volcano: tap a highlighted region.
  const highlighted = page.locator('g[data-hl="1"] .tap').first();
  if (await highlighted.isVisible().catch(() => false)) {
    await highlighted.click();
    return true;
  }
  const finish = page.getByTestId('finish-turn');
  if (await finish.isVisible().catch(() => false)) {
    await finish.click();
    return true;
  }
  await page.waitForTimeout(120);
  return true;
}

test('full 5-player game to a declared winner, offline-capable, resumable', async ({
  page,
  context,
}) => {
  test.setTimeout(280_000);
  watchErrors(page);
  await page.goto('/');

  // No horizontal scroll on the menu.
  const overflowMenu = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowMenu).toBeLessThanOrEqual(0);

  // Start vs the maximum number of bots, seeded for reproducibility.
  await page.getByTestId('bots-4').click();
  await page.getByTestId('seed-input').fill('777');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // All buttons meet the 44px tap-target bar.
  const small = await page.evaluate(() => {
    const bad: string[] = [];
    for (const b of document.querySelectorAll('button')) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && (r.width < 44 || r.height < 44)) {
        bad.push(`${b.textContent ?? '?'}: ${r.width}x${r.height}`);
      }
    }
    return bad;
  });
  expect(small).toEqual([]);

  // No horizontal scroll in-game.
  const overflowGame = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowGame).toBeLessThanOrEqual(0);

  // Map legend: the info button opens the color/icon reference and closes.
  await page.getByTestId('open-legend').click();
  await expect(page.getByTestId('legend')).toBeVisible();
  await page.getByTestId('close-help').click();
  await expect(page.getByTestId('legend')).not.toBeVisible();

  // Resume check early in the game: reload and confirm the game continues.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByTestId('board')).toBeVisible();

  // Drive the whole game.
  for (let step = 0; step < 4000; step++) {
    const going = await humanStep(page);
    if (!going) break;
  }
  await expect(page.getByTestId('gameover')).toBeVisible();
  await expect(page.getByTestId('gameover')).toContainText('win');

  // The log recorded the game and shows bot reasoning.
  await page.getByTestId('tab-log').click();
  const count = Number(await page.getByTestId('log-count').textContent());
  expect(count).toBeGreaterThan(50);

  // Zero console errors over the entire game.
  expect(errors).toEqual([]);

  // Offline: the service worker serves the shell with the network cut.
  await page.waitForTimeout(800); // let the SW finish installing
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('board').or(page.getByTestId('start-game'))).toBeVisible({
    timeout: 10_000,
  });
  await context.setOffline(false);
});
