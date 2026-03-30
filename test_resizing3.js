const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Inject mock user state to bypass login
    await page.goto('http://localhost:3001');
    await page.evaluate(() => {
        localStorage.setItem('token', 'fake-token');
        localStorage.setItem('mindmap_token', 'fake-token');
        window.currentUser = { id: 1, login_id: 'test' };
    });
    await page.reload();

    // Mock API
    await page.route('**/api/widgets', async route => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    widgets: [
                        { id: 1, widget_type: 'todo', title: 'Test Todo', x: 0, y: 0, width: 400, height: 500, settings: {} }
                    ]
                })
            });
        } else {
            route.continue();
        }
    });
    await page.route('**/api/todos**', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, todos: [ { id: 1, task: 'Test task 1', is_completed: false }, { id: 2, task: 'Test task 2', is_completed: false } ] })
        });
    });

    await page.reload();
    await page.waitForTimeout(1000);

    // Test Desktop
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.screenshot({ path: 'desktop_dashboard.png' });
    console.log('Desktop dashboard loaded');

    // Test Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'mobile_dashboard.png' });
    console.log('Mobile dashboard loaded');

    await browser.close();
    console.log('Test complete');
})();
