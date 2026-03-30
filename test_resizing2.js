const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Test Desktop
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('http://localhost:3001');
    await page.click('#showRegister');
    await page.waitForTimeout(500);

    await page.fill('#regUsername', 'testuser');
    await page.fill('#regPassword', 'testpass');
    await page.fill('#regDisplayName', 'Test User');

    await page.click('#registerBtn');
    await page.waitForTimeout(2000);

    await page.click('#showLogin');
    await page.waitForTimeout(500);

    await page.fill('#loginUsername', 'testuser');
    await page.fill('#loginPassword', 'testpass');
    await page.click('#loginBtn');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'desktop_logged_in.png' });
    console.log('Desktop page loaded');

    // Test Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'mobile_logged_in.png' });
    console.log('Mobile page loaded');

    await browser.close();
    console.log('Test complete');
})();
