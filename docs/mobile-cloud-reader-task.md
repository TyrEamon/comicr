# 漫画云读手机端任务

## 一句话目标

在 `C:\Users\Tyr.Eamon\Desktop\Comics-app` 新建一个手机端漫画阅读 App。  
手机端视觉使用 `C:\Users\Tyr.Eamon\Desktop\stitch_manga_cloud_reader`。  
`C:\Users\Tyr.Eamon\Desktop\ImageMaster-main` 是现有 PC 端项目，只作为逻辑参考和能力来源，不在里面落手机端代码。

## 关键结论

这基本等于一个新项目，但不是从零想功能：

- UI 是新的：按手机端设计稿做。
- App 壳是新的：用移动端技术栈。
- 业务能力参考 PC 端：本地书库、在线源、链接下载、阅读器、任务队列。
- PC 端项目保留，不改成手机端。

你不想在电脑上装 APK 打包软件，这没有问题。打 APK 放到 GitHub Actions 里做，本机只写代码、跑前端预览即可。

## 讨论后的实现办法

最终采用“手机端自包含 App”路线：

1. `Comics-app` 是新项目，不是 `ImageMaster-main` 的移动端皮肤。
2. UI 使用手机端设计稿，技术实现用 Vue + Capacitor。
3. APK 构建由 GitHub Actions 完成，本机不要求 Android Studio、Gradle、Android SDK。
4. MVP 不把 PC 端 Go/Wails 后端直接放进 APK。
5. Go/Python 逻辑可以参考，但第一版核心业务用 TypeScript service 层实现。
6. 如果后续某些解析逻辑太重，再考虑远程 Go/Python server 或 gomobile，不放进 MVP。

这条路线的目标是先把“能装到手机、能看、能下载、能导入资源”跑通。复杂的源解析、OAuth 云盘、Go/Python 原生嵌入都放到后面。

## 架构决策记录

### D-001：这是新移动端项目

`Comics-app` 是独立手机端 App。`ImageMaster-main` 保持 PC 端项目定位，只读参考，不在里面实现手机端 UI。

### D-002：APK 打包交给 GitHub Actions

本机不安装 Android 打包软件。仓库中保留 Capacitor Android 工程，GitHub Actions 使用 Linux runner + Temurin JDK 21 + Gradle 构建 debug APK，并上传 artifact。

### D-003：MVP 不直接运行 Go/Wails

Wails 是桌面应用壳，不是 Android APK 方案。PC 端的 Go/Wails 后端不能原样运行在 Android App 内。MVP 只复用它的业务结构、数据设计、下载和阅读思路。

### D-004：MVP 不嵌入 Python

Android APK 可以通过特殊方案运行 Python，但包体、依赖、调试复杂度都偏高。第一版不嵌入 Python。

### D-005：业务逻辑先写在 TypeScript services

手机端第一版的核心能力放在：

```text
src/services/
  libraryService.ts
  readerService.ts
  downloadService.ts
  cloudService.ts
  sourceService.ts
```

这些 service 模拟 PC 端 API 的形状，方便以后替换为远程 Go/Python server。

### D-006：本地导入放设置页，云盘后接 WebDAV

Google Drive、OneDrive OAuth 不进 MVP。先在设置页做“漫画库 / 漫画导入”验证本地导入链路，再做 WebDAV。OAuth 类云盘放后续版本。

### D-007：先让空壳 APK 跑起来

第一个可交付物不是完整功能，而是 GitHub Actions 能产出一个可安装 APK。只要 APK 构建闭环先通，后续功能迭代风险会小很多。

## 技术路线

### 选定路线：Vue + Capacitor + GitHub Actions

推荐用：

- 前端：Vue 3 + TypeScript + Pinia + Tailwind + lucide-vue-next
- 移动端壳：Capacitor
- Android APK 构建：GitHub Actions
- 本地存储：Capacitor Preferences / SQLite 可选
- 文件读写：Capacitor Filesystem
- 网络请求：浏览器 fetch 或 Capacitor HTTP 插件
- 云盘 MVP：先保留 provider 外壳，WebDAV 放第二步

### 为什么不用 Wails 做手机端

Wails 适合桌面应用，不是 Android APK 路线。  
所以 `ImageMaster-main` 的 Go/Wails 结构不能原样塞进手机 App。

### PC 端 Go 内核怎么复用

现实可行的复用方式有三种：

1. 复用业务设计和数据结构：最推荐，MVP 用 TypeScript 实现同样的 service/API 形状。
2. 拆 Go server：手机 App 调远程 API，适合以后有服务器/NAS 的情况。
3. gomobile 把 Go 编成 Android library：理论可行，但复杂，不适合 MVP。

MVP 建议选第 1 种：手机 App 自包含，先把阅读、下载、设置页本地导入跑通。PC 端代码作为参考，不直接运行在 APK 里。

## 推荐目录

```text
Comics-app/
  .github/
    workflows/
      android-apk.yml
  docs/
    mobile-cloud-reader-task.md
  front/
    package.json
    index.html
    vite.config.ts
    capacitor.config.ts
    android/
    src/
      assets/
      components/
      services/
      stores/
      views/
      router/
```

如果后续决定加 Go server，再新增：

```text
Comics-app/
  server/
    go.mod
    cmd/
    internal/
```

## MVP 功能范围

### 必须实现

- 手机端底部导航和顶部栏。
- 本地书库页：显示本机/导入的漫画。
- 漫画详情页：封面、标题、进度、阅读入口。
- 阅读器页：沉浸阅读、进度保存。
- 下载页：粘贴链接下载漫画/本子。
- 设置页：漫画库管理、阅读偏好、存储管理、构建信息。
- 云盘页 MVP：保留 provider 外壳，后续接 WebDAV。
- GitHub Actions 自动构建 APK，并上传 artifact。

### 暂不实现

- 不做 PC 端改造。
- 不做 Google Drive/OneDrive OAuth。
- 不做复杂账号系统。
- 不做多设备同步。
- 不做远程云盘压缩包自动解压。
- 不追求一开始支持 PC 项目所有在线源。

## 前端任务

### FE-1 初始化项目

目标目录：

- `Comics-app/front`

任务：

- 初始化 Vite + Vue 3 + TypeScript。
- 安装 Pinia、Vue Router、Tailwind、lucide-vue-next。
- 初始化 Capacitor：
  - appId：`com.tyr.comicsapp`
  - appName：`漫画云读`
  - webDir：`dist`
- 添加 Android 平台目录。
- 不需要本机安装 Android Studio；Android 构建交给 GitHub Actions。

验收：

- `pnpm build` 能产出 `dist`。
- Capacitor 配置文件存在。
- 本机可用浏览器预览前端。

### FE-2 设计系统

参考：

- `stitch_manga_cloud_reader/zenith_manga/DESIGN.md`

任务：

- 建立全局主题变量：
  - `--color-bg: #0f0f0f`
  - `--color-surface: #1c1b1b`
  - `--color-surface-high: #2a2a2a`
  - `--color-text: #e5e2e1`
  - `--color-muted: #998f83`
  - `--color-accent: #b89b72`
  - `--color-accent-bright: #e1c296`
- 使用 Manrope 或系统 fallback，不依赖 Google Fonts CDN。
- 所有图标使用 lucide，不使用 Material Symbols CDN。
- 所有可点元素触控区域不小于 44px。

验收：

- 375px 宽度无横向滚动。
- 无 CDN 字体和 Material Symbols。

### FE-3 移动端 App 壳

页面组件：

- `src/components/mobile/MobileShell.vue`
- `src/components/mobile/MobileTopBar.vue`
- `src/components/mobile/MobileBottomNav.vue`
- `src/components/mobile/IconButton.vue`

路由：

- `/`：书库
- `/online`：发现
- `/download`：下载
- `/cloud`：云盘
- `/setting`：设置
- `/manga/:id`：详情
- `/reader/:id`：阅读器

任务：

- 底部导航：书库、发现、下载、云盘、设置。
- 详情页和阅读器隐藏底部导航。
- 顶部栏提供菜单、标题、搜索。
- 顶部栏中间只显示当前页面标题，不显示品牌名。
- 菜单按钮打开快捷入口抽屉：书库、发现、下载、云盘、设置。
- 设置入口：
  - 三杠菜单 -> 设置。
  - 底部导航在云盘右侧显示设置图标。
- 搜索按钮不跳转页面，点击后在顶部栏下方弹出下拉搜索框。
- 书库页接收下拉搜索关键词并筛选漫画标题。
- 页面顶部不放大段解释性副标题，功能说明写在文档里，App 界面只保留标题和操作。

验收：

- 底部导航不遮挡内容。
- 底部五栏在手机宽度下不挤压文字。
- 顶部栏避开 Android 状态栏，不遮挡品牌、菜单、搜索按钮。
- 全局禁止网页级双指缩放，避免 App 像浏览器页面一样被整体放大。
- 当前路由用暖金色高亮。

### FE-4 本地书库页

参考设计稿：

- `library_with_bookmarks`

页面：

- `src/views/Library/index.vue`
- `src/views/Library/components/MangaGrid.vue`
- `src/views/Library/components/MangaCard.vue`

任务：

- 两列封面网格，封面比例 3:4。
- 横向 Tabs：
  - 书库：全部
  - 收藏：收藏
  - 稍后看：稍后阅读列表
  - 下载：只看通过下载进入本地书库的漫画
- 支持按标题搜索、排序、空状态。
- 置顶是单本漫画的状态按钮，只影响书库排序，不作为顶部分类。
- 数据来自 `libraryService`。

验收：

- 能显示导入或下载到本地的漫画。
- 点击卡片进入详情。
- 收藏/稍后看状态刷新后不丢。

### FE-5 漫画详情页

参考设计稿：

- `manga_details_with_bookmarks`

页面：

- `src/views/MangaDetail/index.vue`

任务：

- 大封面头图 + 暗色渐变。
- 主按钮：`开始阅读`。
- 图标按钮：收藏、稍后看、更多。
- 显示标题、作者/来源、图片数量、阅读进度。

验收：

- 从书库进入详情可正常返回。
- `开始阅读` 进入阅读器。

### FE-6 阅读器

参考设计稿：

- `reader_minimalist`

页面：

- `src/views/Reader/index.vue`

任务：

- 顶部半透明栏。
- 底部渐变控制层。
- 当前页/总页数进度条。
- 底部控制层采用紧凑布局：上一页 / 进度条 / 下一页一行，小功能按钮一行。
- 不显示 `PAGE PROGRESS` 这类占空间的说明文字。
- 底部小功能按钮：亮度、收藏、页面列表、阅读页设置。
- 亮度按钮展开亮度滑条；阅读页设置先提供页面适配选项。
- 点击屏幕切换控制层显示/隐藏。
- 保存阅读进度。
- 支持本地图片列表和在线图片列表。

验收：

- 本地漫画能阅读。
- 退出再进入能恢复进度。
- 控制层可隐藏，不长期遮挡内容。
- 如需放大漫画图，后续只在阅读器图片层做内部缩放，不允许缩放整个 App 页面。

### FE-7 下载页

参考设计稿：

- `downloads_minimalist`

页面：

- `src/views/Download/index.vue`
- `src/views/Download/stores/downloadStore.ts`

任务：

- 输入框粘贴链接。
- `downloadService.start(url)` 创建任务。
- 任务卡片展示名称、URL、状态、进度、当前/总数。
- 支持取消任务。
- `进行中 / 已完成` 两个标签页。

验收：

- 粘贴链接后创建下载任务。
- 任务进度刷新。
- 完成后出现在 `已完成`。

### FE-8 云盘页 MVP

参考设计稿：

- `cloud_minimalist`

页面：

- `src/views/Cloud/index.vue`

任务：

- 显示总容量、provider 列表、连接状态。
- 点击 provider 进入文件列表。
- 第一阶段 provider：
  - 本地导入：提示去设置页管理漫画库。
  - WebDAV：可作为第二步。

验收：

- 能浏览 provider 文件。
- 本地导入 provider 不再重复放导入控件。
- WebDAV 未连接时有明确状态。

### FE-9 设置页

页面：

- `src/views/Setting/index.vue`

入口：

- 顶部三杠菜单 -> 设置。
- 底部导航：云盘右侧的设置图标。

任务：

- 设置页分区：
  - 漫画库：导入和命名。
  - 阅读偏好：后续放阅读方向、翻页方式、亮度、缓存策略。
  - 存储管理：后续放缓存清理、目录重扫、本地库统计。
  - 构建信息：说明 GitHub Actions / APK 构建状态。
- 漫画库导入支持：
  - 压缩包：ZIP / CBZ。
  - 文件夹：已解压漫画目录，递归读取图片。
  - 图片：系统不支持选择目录时，手动多选图片作为一本漫画。
- 导入名称可选填：
  - 填写时使用用户输入。
  - 留空时压缩包用文件名。
  - 留空时文件夹用所选文件夹名。
  - 留空且只选择图片时用第一张图片名。
- 手机上漫画分散在多个目录时，MVP 先多次导入；后续 Android SAF 版本再做“授权并记住多个目录”。

验收：

- 三杠菜单和底部导航都能进入设置页。
- 能从设置页导入 ZIP/CBZ、图片目录和图片组。
- 导入后书库出现新漫画。
- 手动填写导入名称时，书库显示该名称。
- 未实现的设置项不提供假开关，只显示清晰状态。

## Service 层任务

MVP 不直接跑 Go 后端，而是在前端/Capacitor 内实现 service 层：

```text
src/services/
  libraryService.ts
  readerService.ts
  downloadService.ts
  cloudService.ts
  sourceService.ts
```

### SVC-1 libraryService

职责：

- 管理本地漫画元数据。
- 扫描 App 文件目录中的漫画。
- 返回漫画列表。
- 返回漫画图片列表。
- 删除漫画。

数据建议：

```ts
interface MangaItem {
  id: string
  title: string
  author?: string
  cover?: string
  localPath: string
  imageCount: number
  addedAt: number
}
```

### SVC-2 readerService

职责：

- 读取漫画图片。
- 保存阅读进度。
- 恢复阅读进度。

### SVC-3 downloadService

职责：

- 粘贴 URL 后创建下载任务。
- 解析页面图片。
- 下载图片到 App 本地目录。
- 更新任务状态。

MVP 可以先支持一个或两个稳定站点，不要求一次覆盖 PC 端全部 crawler。

### SVC-4 cloudService

职责：

- provider 列表。
- 文件浏览。
- WebDAV 接入后负责远程资源浏览和导入。

Provider 接口：

```ts
interface CloudProvider {
  summary(): Promise<ProviderSummary>
  connect(): Promise<void>
  disconnect(): Promise<void>
  list(path: string): Promise<CloudFile[]>
  importToLibrary(remotePath: string): Promise<ImportResult>
}
```

### SVC-5 sourceService

职责：

- 在线源搜索。
- 在线详情。
- 在线章节图片。

MVP 可后置。先跑通本地书库、阅读、下载、设置页本地导入。

## GitHub Actions APK 构建

新增文件：

- `.github/workflows/android-apk.yml`

目标：

- push 或手动触发后自动构建 APK。
- APK 作为 GitHub Actions artifact 下载。
- 本机不安装 Android Studio、Gradle、Android SDK。

建议 workflow：

```yaml
name: Android APK

on:
  workflow_dispatch:
  push:
    branches:
      - main

jobs:
  build-android:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21

      - name: Install dependencies
        working-directory: front
        run: pnpm install --frozen-lockfile

      - name: Build web
        working-directory: front
        run: pnpm build

      - name: Sync Capacitor
        working-directory: front
        run: pnpm cap sync android

      - name: Build debug APK
        working-directory: front/android
        run: ./gradlew assembleDebug

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: comics-app-debug-apk
          path: front/android/app/build/outputs/apk/debug/*.apk
```

签名发布版以后再做。MVP 先产 debug APK，手机允许安装未知来源即可测试。

## 实施顺序

1. 初始化 `Comics-app/front`：Vue + Capacitor。
2. 添加 GitHub Actions，先让空壳 APK 能构建出来。
3. 实现设计系统和移动端壳。
4. 实现本地书库数据模型和书库页面。
5. 实现详情页和阅读器。
6. 实现下载页和最小下载 service。
7. 实现设置页的漫画库管理和本地导入。
8. 保留 cloudService/provider 外壳，后续接 WebDAV。
9. 再补发现页/在线源。

## 继续讨论清单

这些问题会影响实现成本，开工前最好逐个定下来：

1. Android 目录体验：MVP 使用系统文件选择器导入压缩包、文件夹或图片组；后续是否做 SAF 原生插件来记住多个分散目录。
2. 下载来源优先级：第一版要支持哪些站点或链接格式，是否只先支持 PC 项目里最稳定的 1-2 个。
3. 云盘 MVP：第一版保留外壳，后续直接加 WebDAV。
4. 在线源：发现页是 MVP 必须有，还是先把本地书库、下载、设置页本地导入跑通后再做。
5. 漫画文件格式：第一版已支持 ZIP/CBZ、图片目录、图片组；后续是否增加 RAR/7z。
6. 数据持久化：第一版用 Preferences + JSON，还是直接引入 SQLite。
7. APK 分发：只要 debug APK artifact，还是需要后续做签名 release APK。

## 测试与验收

本地前端：

```powershell
cd C:\Users\Tyr.Eamon\Desktop\Comics-app\front
pnpm build
```

GitHub：

- 手动运行 `Android APK` workflow。
- 下载 artifact 中的 APK。
- 安装到 Android 手机测试。

手工视口：

- 375 x 812
- 390 x 844
- 768 x 1024

完整 MVP 验收路径：

1. 打开 APK 进入书库。
2. 从设置页的漫画库入口导入一个图片目录、图片组或压缩包。
3. 书库出现新漫画。
4. 进入详情页。
5. 点击 `开始阅读` 阅读。
6. 退出后再次进入能恢复进度。
7. 进入下载页，粘贴链接下载。
8. `进行中` 标签页能看到进度。
9. 完成后进入 `已完成`。

## 风险点

- GitHub Actions 能解决 APK 构建环境，但不能让 Wails/Go 后端自动变成 Android 后端。
- Android 文件权限比 PC 更严格，必须通过 Capacitor Filesystem 或系统文件选择器处理。
- Android WebView 对“选择文件夹”的支持可能不稳定；如果系统文件选择器不能选目录，先用多选图片兜底，后续做 SAF 原生目录授权。
- 下载站点反爬会影响成功率，MVP 先支持少量稳定来源。
- 云盘 OAuth 很容易扩大范围，第一阶段不要从 Google Drive 开始。
- 设计稿里的 CDN、远程图片、Material Symbols 不能原样搬进项目。

## 不能做的事

- 不要在 `ImageMaster-main` 里实现手机端 UI。
- 不要把 Wails 当作 Android APK 方案。
- 不要要求本机安装 Android Studio 才能打包。
- 不要一开始就做 Google/OneDrive OAuth。

## 完成定义

- 所有实现代码位于 `C:\Users\Tyr.Eamon\Desktop\Comics-app`。
- `ImageMaster-main` 保持 PC 端项目定位。
- GitHub Actions 能构建 APK。
- APK 里能跑通：设置页本地导入 -> 书库 -> 详情 -> 阅读 -> 进度保存 -> 链接下载。
