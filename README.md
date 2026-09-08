<div align="center">

<img src="web/public/icon.png" width="96" alt="QQ Farm Bot 圖示">

# QQ Farm Bot

🌱 一位會自己澆水、除草、收菜的 QQ 露天小幫手

[能做什麼](#-能做什麼) · [微信掃碼](#-微信掃碼登入) · [QQ 掃碼](#-qq-掃碼登入) · [開始種田](#-開始種田) · [Docker 部署](#-docker-部署) · [更新紀錄](docs/CHANGELOG.md) · [使用文件](#-使用文件) · [賽博義父](#-賽博義父)

</div>

> [!WARNING]
> 快樂種田，謹慎使用。本項目僅供學習和研究，自動化操作可能違反遊戲服務條款，帳號及其他相關風險由使用者自行承擔。

## 🌾 能做什麼

- 👨‍🌾 **照看多座農場**：多個帳號統一管理，也可以單獨控制
- 💧 **打理日常農活**：農場、好友、任務、商城和活動自動化
- 🖥️ **隨時看看田裡**：Web 控制面板、即時日誌和數據統計
- 🌻 **認識每株作物**：作物圖鑑、土地狀態和變異效果展示
- 🎉 **趕上限時活動**：活動功能持續更新，還有活動分析
- 📱 **輕鬆新增帳號**：支援微信掃碼、QQ 掃碼、手機抓包登入和 QQ 好友同步
- 📦 **多種方式開工**：支援原始碼、Docker 和桌面二進位構建

> 🌱 想看看這片農場是怎麼一步步長大的嗎？前往[農場成長紀錄](docs/CHANGELOG.md)查看最新更新和完整歷史。

## <th><img src="https://cdn.simpleicons.org/wechat/07C160" height="20" alt="微信" /></th> 微信掃碼登入

微信玩家可直接在「新增帳號 → 微信掃碼」中完成登入。掃碼鏈路已內建到 Bot 進程，透過應用寶 OAuth 取得微信會話，並使用內建 MMTLS 協議換取農場短時效 Code，無需額外部署 YYB-GO、第三方登入 API 或代理容器。

掃碼新增成功後會：

- 儲存 `loginBuffer` 及滾動重新整理憑證，並避免將敏感憑證回傳瀏覽器。
- 預設啟動帳號，並自動開啟「自動重新整理取得 Code」，預設間隔為 60 分鐘。
- 每 30 分鐘主動滾動保活微信憑證；手動啟動、程式啟動及定時重新整理前都會取得新 Code。
- 微信帳號的 WebSocket 回傳 400 時，由主進程呼叫同一套內建應用寶協議重新整理憑證和 Code，成功後自動重啟帳號；同帳號的併發重新整理會合併為一次，避免滾動 Token 被舊值覆蓋。
- Worker 每 30 秒回應一次主進程存活探測；超過 90 秒無回應會自動重啟，一小時內已自動重啟 3 次仍未恢復則停止帳號，等待人工檢查。
- 自動恢復按帳號限制為每日最多 8 次；連續重新整理失敗 3 次後熔斷，避免網路異常、憑證失效或手機端佔線時無限重登。
- 管理介面禁止直接提交 `loginBuffer`、Refresh Token 和 Access Token；更換 `wxid` 會清除舊憑證，必須透過當前面板使用者的有效掃描會話重新寫入。
- 掉線後按帳號的自動重新整理間隔延遲重登，避免舊 Code 反覆重連。

舊版外部 API 設定仍作為缺少內建憑證的相容回退；新掃描帳號始終優先使用進程內協議。正常情況下不需要代理池。如確需使用代理，應優先採用帳號固定出口，避免隨機切換 IP 導致微信會話環境變化。

> 這輪自癒只處理登入憑證重新整理、Worker 無回應和重登熔斷；尚未引入業務請求合併、心跳請求容量預留或資源包完整性校驗。

## 🐧 QQ 掃碼登入

QQ 玩家可透過 NapCat 容器實現掃碼登入，無需手動抓包或填寫 Code。在「新增帳號 → QQ 掃碼」中掃描二維碼即可完成。

### 部署 NapCat

啟動時需額外啟用 `napcat` Profile：

```bash
# 複製環境變數範本並編輯
cp .env.compose.example .env
# 取消註釋以下兩行
# COMPOSE_PROFILES=napcat
# NAPCAT_LOGIN_ENABLED=true

# 使用 compose 腳本啟動（自動偵測主機名稱）
./compose.sh up -d --build
```

或手動使用 docker compose：

```bash
NAPCAT_LOGIN_ENABLED=true COMPOSE_PROFILES=napcat docker compose up -d --build
```

首次啟動時，NapCat 容器會自動：

1. 生成隨機 Token 並寫入 `data/napcat/auth/token`
2. 解壓並配置 NapCat Shell
3. 安裝 `qq-miniapp-openauth` 插件（用於獲取農場小程序授權 Code）
4. 啟動 QQ 機器人服務（WebUI 於埠 `6099`）

### 掃碼流程

1. 確保 NapCat 容器正常運行（`./compose.sh ps`）。
2. 進入「新增帳號 → QQ 掃碼」，點擊「取得二維碼」。
3. 使用手機 QQ 掃描二維碼，並在 QQ 中確認授權。
4. 確認後 Bot 自動獲取農場 Code、新增帳號並清理 QQ 會話。
5. 帳號新增後，QQ 好友 GID 將在後台自動同步（約 15 秒）。

### 配置項

| 環境變數 | 預設值 | 說明 |
| --- | --- | --- |
| `NAPCAT_LOGIN_ENABLED` | `false` | 是否啟用 QQ 掃碼登入 |
| `NAPCAT_IMAGE` | `mlikiowa/napcat-docker:v4.18.19` | NapCat Docker 鏡像版本 |
| `NAPCAT_DEVICE_NAME` | 自動偵測 | NapCat 容器主機名稱 |
| `NAPCAT_UID` / `NAPCAT_GID` | `1000` | NapCat 容器運行用戶 ID |

### 注意事項

- NapCat 容器僅綁定 `127.0.0.1:6099`，不對外暴露。
- 每次掃碼完成後會自動登出 QQ 並重啟會話，避免殘留。
- 若掃碼失敗，可嘗試重新取得二維碼（自動清除 stale 會話）。
- 需要 Linux Docker 環境；macOS 和 Windows 請使用 Docker Desktop。

## 🧺 小推車裡裝了什麼

| 模組 | 技術 |
| --- | --- |
| 後端 | Node.js、Express、Socket.IO、CommonJS |
| 前端 | Vue 3、Vite、TypeScript、Pinia、UnoCSS |
| 工程 | pnpm workspace、Docker |

管理面板預設住在 `3007` 埠。

## 🚜 開始種田

### 準備工具

- Node.js 20+
- pnpm 10+
- Git

### 把農場跑起來

```bash
git clone https://github.com/muyuewang/qq-farm-bot.git
cd qq-farm-bot

corepack enable
pnpm install
pnpm build:web
pnpm dev:core
```

看到服務啟動後，開啟 <http://localhost:3007>，你的農場控制室就準備好了。

首次登入使用以下預設憑證：

```text
使用者名稱：admin
密碼：admin
```

> [!IMPORTANT]
> 第一次進門記得馬上換掉預設密碼，也不要把管理面板直接暴露到公網。

想繼續裝修控制室？可以另外啟動前端開發伺服器：

```bash
pnpm dev:web
```

## 🐳 Docker 部署

### 基礎部署（不含 QQ 掃碼）

```bash
git clone https://github.com/muyuewang/qq-farm-bot.git
cd qq-farm-bot
docker compose up -d --build
```

### 完整部署（含 QQ 掃碼）

```bash
git clone https://github.com/muyuewang/qq-farm-bot.git
cd qq-farm-bot

# 複製並編輯環境變數
cp .env.compose.example .env
# 編輯 .env 啟用 NapCat

./compose.sh up -d --build
```

查看運行狀態和日誌：

```bash
docker compose ps
docker compose logs -f
```

更新程式碼後重新構建：

```bash
git pull
docker compose up -d --build
```

預設對應：

| 用途 | 埠或目錄 |
| --- | --- |
| Web 管理面板 | `3007` |
| 抓包代理埠 | `18000` |
| NapCat WebUI | `127.0.0.1:6099` |
| 持久化資料 | 倉庫上層目錄的 `data/` |

原始碼運行、Docker 和二進位發布版的抓包服務均預設關閉；只有在
「系統設定 → Code/GID 抓取服務」中開啟後才會啟動，並且只使用代理埠 `18000`。

如需指定抓包服務對外地址，可在倉庫根目錄建立 `.env`：

```dotenv
CAPTURE_ADVERTISE_IPS=192.168.1.100,100.64.0.2
```

## 🔑 登入方式

專案支援微信掃碼、QQ 掃碼、手動填碼和手機抓包四種帳號新增方式。

### 微信掃碼

1. 進入「新增帳號 → 微信掃碼」。
2. 頁面會自動產生 QR Code；也可以點擊 QR Code 空態或「取得/重新整理 QR Code」。
3. 使用手機微信掃碼，並在應用寶授權頁確認。
4. 授權成功後帳號會自動新增、開啟 Code 重新整理並啟動。

微信掃描會話與當前面板使用者繫結。若憑證已被微信撤銷、長時間停機後過期或手機重新授權導致舊會話失效，需要重新掃描。

帳號建立 WebSocket 連線後，Bot 會讀取登入回包和心跳回包中的 `version_force` 或 `version_recommend`。偵測到符合格式的完整版本（例如 `1.13.1.6_20260723`）時，會自動更新「系統設定 → 客戶端版本」，後續連線直接使用該值。強制版本優先於推薦版本，日期部分來自服務端原始版本，不會按本機當天日期產生。

### QQ 掃碼

1. 確保 NapCat 容器已啟動（Docker 部署）。
2. 進入「新增帳號 → QQ 掃碼」，點擊「取得二維碼」。
3. 使用手機 QQ 掃描二維碼並確認授權。
4. 確認後帳號自動新增，QQ 好友 GID 後台同步。

詳細部署和配置請查看 [QQ 掃碼登入](#-qq-掃碼登入) 章節。

### 手機抓包

iPhone 及 Android 使用者也可使用內建抓包登入服務自動取得登入 Code，並同步 QQ 平台好友。

抓包基本流程：

1. 在「系統設定 → Code/GID 抓取服務」中開啟抓包登入。
2. 進入「新增帳號 → 抓包登入」，點擊「開始抓取」。
3. 按頁面提示安裝並信任 CA 憑證，設定手機 Wi-Fi 代理。
4. 完全關閉並重新開啟 QQ 露天，等待面板取得 Code。
5. 完成後關閉手機 Wi-Fi 代理。

憑證安裝、區域網路和 Tailscale 設定請查看[抓包登入服務手冊](core/docs/capture-service.md)。

## 🛠️ 常用指令

| 指令 | 用途 |
| --- | --- |
| `pnpm dev:core` | 啟動後端和已構建的管理面板 |
| `pnpm dev:web` | 啟動前端開發伺服器 |
| `pnpm build:web` | 構建前端 |
| `pnpm lint` | 檢查前後端程式碼 |
| `pnpm -C core test` | 執行後端測試 |
| `pnpm package:release` | 構建各平台二進位檔案 |

二進位構建產物位於 `core/dist/`。首次執行時，程式會在資料目錄中產生帳號、日誌和快取等檔案。

## 🗺️ 農場地圖

```text
qq-farm-bot/
├── core/                 # 後端、自動化引擎及協議實作
│   ├── docs/             # 登入、活動與 TSDK 維護文件
│   ├── src/              # 設定、介面、模型和業務服務
│   └── test/             # 後端測試
├── web/                  # Vue 管理面板
├── napcat/               # NapCat Docker 配置（QQ 掃碼登入）
├── docs/images/          # README 圖片資源
├── docker-compose.yml
├── compose.sh            # Docker Compose 啟動腳本
├── .env.compose.example  # 環境變數範本
└── package.json
```

## 📖 使用文件

- [iPhone 抓包登入服務](core/docs/capture-service.md)
- [限時活動適配手冊](core/docs/activity-update-runbook.md)
- [TSDK/WASM 更新手冊](core/docs/tsdk-update-runbook.md)
- [TSDK/ACE 運行機制](core/docs/tsdk-ace-runtime.md)

## 🔒 資料與安全

`core/data/` 及 Docker 持久化目錄可能包含帳號、使用者、登入日誌、好友快取和統計資料。請妥善備份，並避免提交到公開倉庫。

以下內容不應提交：

- 運行時資料與帳號資訊
- `.env` 及其他密鑰檔案
- 日誌、快取和臨時檔案
- `node_modules/` 與構建產物

## 📌 免責聲明
本項目僅供學習與研究用途。使用本工具可能違反遊戲服務條款，由此產生的一切後果由使用者自行承擔。

**盈利聲明**
-  本項目為開源學習專案，任何形式的付費倒賣、原始碼販售、付費代部署、授權收費、付費二開等行為均與作者無關。
- 作者本人以及從未授權任何第三方以任何形式向他人收費或牟利。若你透過付費管道取得本項目，請知悉該費用與作者無關。
- 因倒賣、二次轉售造成的損失、帳號風險或糾紛，均與作者無關，請自行聯繫販售者。

**風險說明**：
- 部署、使用本項目產生的任何封號、資料遺失、法律或其他後果，均由使用者自行承擔，作者不作任何擔保。
