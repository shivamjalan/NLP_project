import { expect, test } from '@playwright/test';

const TATKAL_QUESTION = 'What are the public rules for Tatkal booking?';

test.describe('BharatSeva AI demo experience', () => {
  test('shows demo mode, the independent-service disclaimer and starter prompts', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Namaste. How can I help?' })).toBeVisible();
    await expect(page.getByText('Not a government service.', { exact: false })).toBeVisible();
    await expect(page.getByText('Demo mode', { exact: true })).toBeVisible();
    await expect(page.getByText(/This instance is running in demo mode/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'What is the difference between Tatkal and general booking?' }),
    ).toBeVisible();
  });

  test('answers with clearly labelled synthetic citations', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your question').fill(TATKAL_QUESTION);
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(/SYNTHETIC DEMO FIXTURE, NOT OFFICIAL POLICY/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await expect(page.getByText('Demo fixture — not official').first()).toBeVisible();
    await expect(page.getByText(/Demo fixture - Tatkal booking/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark this answer as helpful' })).toBeVisible();
  });

  test('records helpful feedback', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your question').fill(TATKAL_QUESTION);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/SYNTHETIC DEMO FIXTURE/).first()).toBeVisible();

    await page.getByRole('button', { name: 'Mark this answer as helpful' }).click();
    await expect(page.getByText(/your feedback was recorded as/)).toBeVisible();
  });

  test('refuses a transaction and explains the limitation', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your question').fill('Book a Tatkal ticket for me');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(/cannot book or cancel tickets/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sources' })).toHaveCount(0);
  });

  test('answers in Hindi when the user chooses Hindi', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Language').selectOption('hi');
    await page.getByLabel('Your question').fill('टिकट रिफंड की प्रक्रिया समझाइए।');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(/डेमो मोड/).first()).toBeVisible();
  });

  test('keeps the conversation across a reload and clears it with New chat', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Your question').fill(TATKAL_QUESTION);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/SYNTHETIC DEMO FIXTURE/).first()).toBeVisible();

    await page.reload();
    await expect(page.getByText(TATKAL_QUESTION, { exact: true })).toBeVisible();
    await expect(page.getByText(/SYNTHETIC DEMO FIXTURE/).first()).toBeVisible();

    await page.getByRole('button', { name: 'New chat' }).click();
    await expect(page.getByRole('heading', { name: 'Namaste. How can I help?' })).toBeVisible();
    await expect(page.getByText(TATKAL_QUESTION, { exact: true })).toHaveCount(0);
  });
});
