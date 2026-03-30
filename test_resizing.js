const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Test Desktop
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('http://localhost:3001');
    console.log('Desktop page loaded');
    await page.waitForTimeout(2000); // let UI settle
    await page.screenshot({ path: 'desktop_before.png' });

    // Test Mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('http://localhost:3001');
    console.log('Mobile page loaded');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'mobile_before.png' });

    await browser.close();
    console.log('Test complete');
})();
