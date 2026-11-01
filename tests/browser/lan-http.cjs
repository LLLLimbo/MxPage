const assert = require('node:assert/strict');

module.exports = async function checkLanHttp(browser, baseUrl, db, png) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const errors = [], briefs = [], starts = [];
    let creates = 0, uploads = 0, projectId;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.method() !== 'POST') return;
      const pathname = new URL(request.url()).pathname;
      if (pathname === '/api/projects') creates++;
      if (pathname.endsWith('/assets/upload')) uploads++;
    });
    const brief = { name: '局域网测试商品', description: '模拟商品识别结果', category: 'home', visualDirection: '自然光与简洁背景', uncertainties: [] };
    await page.route('**/api/projects/*/brief', async route => {
      briefs.push(route.request().postDataJSON());
      projectId = new URL(route.request().url()).pathname.split('/')[3];
      await db.project.update({ where: { id: projectId }, data: { modelSnapshot: { creationBrief: brief } } });
      await route.fulfill({ status: 200, json: { success: true, data: brief } });
    });
    await page.route('**/api/projects/*/detail-runs', async route => {
      starts.push(route.request().postDataJSON());
      await route.fulfill({ status: 409, json: { success: false, error: { code: 'TEST_FAILURE', message: '模拟启动失败，配置已保留' } } });
    });
    await page.goto(baseUrl);
    assert.deepEqual(await page.evaluate(() => ({ secure: window.isSecureContext, randomUUID: typeof crypto.randomUUID, getRandomValues: typeof crypto.getRandomValues })), { secure: false, randomUUID: 'undefined', getRandomValues: 'function' });
    await page.locator('input[aria-label="上传商品图片"]').setInputFiles(Array.from({ length: 3 }, (_, index) => ({ name: `lan-${index + 1}.png`, mimeType: 'image/png', buffer: png })));
    await page.getByRole('button', { name: '下一步 · AI 分析商品', exact: true }).click();
    await page.waitForURL(/\/projects\/[^/]+\/configure$/);
    await page.getByRole('heading', { name: '确认创作方向', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: '商品名称', exact: true }).inputValue(), brief.name);
    assert.equal(creates, 1);
    assert.equal(uploads, 3);
    assert.deepEqual(briefs, [{ initialOnly: true, retryUncertain: false }]);
    assert.equal(await db.productAsset.count({ where: { projectId } }), 3);
    const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('mxpage:request-queue:v1')));
    assert.equal(entries[0].status, 'SUCCESS');
    assert.match(entries[0].id, /^request:[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    for (let attempt = 0; attempt < 2; attempt++) {
      const failed = page.waitForResponse(response => response.url().endsWith('/detail-runs') && response.status() === 409);
      await page.getByRole('button', { name: '确认并生成 10 张图片', exact: true }).click();
      await failed;
      await page.getByRole('button', { name: '确认并生成 10 张图片', exact: true }).waitFor();
    }
    assert.equal(starts.length, 2);
    assert.equal(starts[0].idempotencyKey, starts[1].idempotencyKey);
    assert.match(starts[0].idempotencyKey, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    assert.equal(await db.detailRun.count({ where: { projectId } }), 0);
    assert.deepEqual(errors, []);
    console.log('PASS LAN HTTP: real insecure context, three uploads, one brief, configuration navigation, stable generation retry identity, no model dispatch');
  } finally { await context.close(); }
};
