# Repository Agent Notes

## QQ 农场官方源码位置（macOS）

Mac QQ 会把 QQ 小游戏源码自动展开到：

```text
~/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/temps/miniapp_src/
```

QQ 农场 AppID：

```text
1112386029
```

农场源码版本目录匹配：

```text
1112386029_3_*
```

每次 QQ 农场更新后目录尾部哈希都会变化。不要把某一个哈希目录永久视为最新版；
应按其中 `tsdk/tsdk.wasm` 的修改时间选择最新且完整的目录：

```bash
QQ_MINIAPP_SRC="$HOME/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/temps/miniapp_src"

find "$QQ_MINIAPP_SRC" -path '*/1112386029_3_*/tsdk/tsdk.wasm' \
  -exec stat -f '%m %Sm %z %N' -t '%Y-%m-%d %H:%M:%S' {} \; | sort -nr
```

候选目录至少应包含：

```text
game.js
game.json
tsdk/tsdk.wasm
assets/
```

当前曾确认的 2026-07-29 展开目录为：

```text
~/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/temps/miniapp_src/1112386029_3_67b898be9fed43f96df1108d3f31f25b/
```

该路径仅作为已知样例；开始分析前仍需执行上面的时间排序。

## QQ 农场远程资源缓存（macOS）

活动界面、种子/作物贴图、Prefab、Spine 和其他远程 bundle 通常不全部位于
`miniapp_src`，而是在各 QQ 账号的运行资源缓存中：

```text
~/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/fs/*/1112386029/usr/gamecaches/
```

资源 URL 与本地缓存文件的映射记录在：

```text
~/Library/Containers/com.tencent.qqexminiprogram/Data/Library/Application Support/QQEX/miniapp/fs/*/1112386029/usr/gamecaches/cacheList.json
```

常见 bundle：

```text
mainscene/
extraRes/
plant/
delayRes/
audio/
petdog/
```

分析官方文件时只读源目录，先复制到临时目录再处理，不要直接修改 QQ 容器缓存。
WASM 更新的完整发现、快照、比较、验证和回退流程见：

```text
core/docs/tsdk-update-runbook.md
```

## 活动植物占地大小

向 `core/src/gameConfig/EventPlants.json` 补充活动植物时，不要只填写 ID、名称和
资源映射。必须同时核实作物占地大小；四格（2x2）作物需要显式填写：

```json
{ "id": 1029003, "seed_id": 29003, "fruit_id": 49003, "name": "星语铃花", "size": 2 }
```

省略 `size: 2` 会使活动作物默认按单格作物处理，导致它无法进入 2x2 优先种植与
土地预留流程，甚至被背包单格种植策略选中。新增或更新该字段时还要确认
`core/src/config/gameConfig.js` 将 `size` 透传到植物配置，并用测试断言
`getPlantBySeedId(seedId).size === 2`；必要时同时检查背包接口返回的
`plantSize` 是否为 `2`。

## 活动入口按时间显隐

以后新增活动页面或活动控制开关卡片时，必须配置并使用活动开始时间和结束时间，
根据当前时间自动控制入口显隐：活动未开始或已经结束时隐藏，仅在活动有效期内显示。
不要依赖后续人工修改代码、手动关闭入口或重新发版来下线活动入口；页面路由等直接访问
入口也应复用同一套活动有效期判断，避免入口隐藏后仍可进入过期活动页面。时间边界、时区
以及缺失或无效时间配置时的行为应明确。

活动结束后不能只隐藏卡片或按钮：如果用户此前开启了该活动卡片的任务开关，必须自动将
对应的持久化开关状态关闭，并停止、取消或阻止该活动相关的定时任务、轮询和后台执行逻辑；
应用启动、配置加载和任务调度前也必须校验活动有效期，确保过期任务不会因历史配置再次启动。
应为开始前、进行中、结束后、边界时刻，以及“活动结束时开关仍处于开启状态”的场景补充测试。
