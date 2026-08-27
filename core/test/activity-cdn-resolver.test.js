const assert = require('node:assert/strict');
const test = require('node:test');
const { ACTIVITY_CARD_ASSET_RULES, collectImageObjects, findSourceAsset, pickActivityCardImage } = require('../src/services/activity-cdn-resolver');

test('活动 CDN 图片收集器递归发现 payload 中的 Cocos 图片配置', () => {
  const image = { img: 'gui/texture/activity/example/spriteFrame', height: 490 };
  const payload = { tips: { txt: [image, '活动说明'] }, children: [{ payload: { icon: 'ignored' } }] };
  assert.deepEqual(collectImageObjects(payload), [image]);
});

test('活动卡片优先选择横向背景而不是物品图标', () => {
  const payload = {
    rewardIcon: { img: 'activity/reward/icon', imageUrl: 'https://cdn.example/icon.png', width: 80, height: 80 },
    banner: { img: 'activity/event/main_bg', imageUrl: 'https://cdn.example/background.png', width: 1280, height: 640 },
  };
  assert.equal(pickActivityCardImage(payload), 'https://cdn.example/background.png');
});

test('活动卡片不会把规则说明图当作背景', () => {
  const payload = {
    bigImg: { img: 'activity/weather/bigImg/rule', imageUrl: 'https://cdn.example/rule.png', height: 490 },
  };
  assert.equal(pickActivityCardImage(payload), '');
});

test('源码图片路由拒绝目录穿越和非法文件名', () => {
  assert.equal(findSourceAsset('../delayRes', 'banner.png'), '');
  assert.equal(findSourceAsset('delayRes', '../../banner.png'), '');
});

test('活动卡片资源按已核验活动 ID 映射且不使用装饰条', () => {
  const starSeason = ACTIVITY_CARD_ASSET_RULES.find(rule => rule.ids.includes(2026072700));
  assert.deepEqual(starSeason.paths, ['gui/texture/Season/S2/S2Open/BigImg/img_S2Open_share']);
  assert.ok(!starSeason.paths.some(assetPath => assetPath.includes('img_bgStar')));
  assert.equal(ACTIVITY_CARD_ASSET_RULES.some(rule => rule.ids.includes(2026052100)), false);
});
