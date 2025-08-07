import { test, expect } from '@playwright/test';

test.describe('Project Title Generation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:3000');
  });

  test('should generate concise title from user prompt', async ({ page }) => {
    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Look for the main input or textarea for project description
    const promptInput = page.locator('textarea').first();
    await expect(promptInput).toBeVisible({ timeout: 10000 });

    // Enter a test prompt
    const testPrompt = 'Create a social media app for photographers to share their work and get feedback from other photographers';
    await promptInput.fill(testPrompt);

    // Look for and click the submit/create button
    const createButton = page.locator('button').filter({ hasText: /create|start|build|generate/i }).first();
    await expect(createButton).toBeVisible();
    await createButton.click();

    // Wait for navigation or project creation
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Check if we're on a project page or if the project was created
    // Look for project title in various possible locations
    const possibleTitleSelectors = [
      'h1', 
      '[data-testid="project-title"]',
      '.project-title',
      'input[type="text"]',
      'title'
    ];

    let projectTitle = null;
    for (const selector of possibleTitleSelectors) {
      try {
        const titleElement = page.locator(selector).first();
        if (await titleElement.isVisible({ timeout: 2000 })) {
          projectTitle = await titleElement.textContent() || await titleElement.inputValue();
          if (projectTitle && projectTitle.trim() !== '') {
            break;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    console.log('Original prompt:', testPrompt);
    console.log('Generated title:', projectTitle);

    // Assertions about the generated title
    expect(projectTitle).toBeTruthy();
    expect(projectTitle.length).toBeLessThanOrEqual(50); // Max 50 characters
    expect(projectTitle.split(' ').length).toBeLessThanOrEqual(5); // Max 5 words
    expect(projectTitle.toLowerCase()).not.toContain('create'); // Should not contain generic words
    expect(projectTitle.toLowerCase()).not.toContain('simple');
    expect(projectTitle.toLowerCase()).not.toContain('basic');

    // Title should be more concise than original prompt
    expect(projectTitle.length).toBeLessThan(testPrompt.length);
  });

  test('should handle various prompt types', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    const testCases = [
      {
        prompt: 'expense tracker for small business owners',
        expectedPattern: /expense|business|tracker/i
      },
      {
        prompt: 'fitness app with workout routines and meal planning',
        expectedPattern: /fitness|workout|meal/i
      },
      {
        prompt: 'simple todo list app',
        expectedPattern: /todo|task/i
      }
    ];

    for (const testCase of testCases) {
      // Refresh page for new test
      await page.reload();
      await page.waitForLoadState('networkidle');

      const promptInput = page.locator('textarea').first();
      await expect(promptInput).toBeVisible({ timeout: 10000 });
      
      await promptInput.fill(testCase.prompt);
      
      const createButton = page.locator('button').filter({ hasText: /create|start|build|generate/i }).first();
      await createButton.click();
      
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      
      // Try to find project title
      let projectTitle = null;
      const possibleTitleSelectors = ['h1', '[data-testid="project-title"]', '.project-title', 'input[type="text"]'];
      
      for (const selector of possibleTitleSelectors) {
        try {
          const titleElement = page.locator(selector).first();
          if (await titleElement.isVisible({ timeout: 2000 })) {
            projectTitle = await titleElement.textContent() || await titleElement.inputValue();
            if (projectTitle && projectTitle.trim() !== '') {
              break;
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      console.log(`Test case - Prompt: "${testCase.prompt}" → Title: "${projectTitle}"`);

      if (projectTitle) {
        expect(projectTitle).toMatch(testCase.expectedPattern);
        expect(projectTitle.split(' ').length).toBeLessThanOrEqual(5);
        expect(projectTitle.length).toBeLessThanOrEqual(50);
      }
    }
  });

  test('should fallback gracefully when AI fails', async ({ page }) => {
    // This test checks that the system still works even if AI generation fails
    await page.waitForLoadState('networkidle');

    const promptInput = page.locator('textarea').first();
    await expect(promptInput).toBeVisible({ timeout: 10000 });

    // Use a very long or unusual prompt that might cause AI to fail
    const testPrompt = 'a'.repeat(1000); // Very long prompt
    await promptInput.fill(testPrompt);

    const createButton = page.locator('button').filter({ hasText: /create|start|build|generate/i }).first();
    await createButton.click();

    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Should still create a project with some kind of title (fallback)
    const possibleTitleSelectors = ['h1', '[data-testid="project-title"]', '.project-title', 'input[type="text"]'];
    
    let projectTitle = null;
    for (const selector of possibleTitleSelectors) {
      try {
        const titleElement = page.locator(selector).first();
        if (await titleElement.isVisible({ timeout: 2000 })) {
          projectTitle = await titleElement.textContent() || await titleElement.inputValue();
          if (projectTitle && projectTitle.trim() !== '') {
            break;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Should have some title, even if it's the fallback
    expect(projectTitle).toBeTruthy();
    console.log('Fallback title:', projectTitle);
  });
});