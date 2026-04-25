# Comicr / 漫画云读

### PC端：https://github.com/TyrEamon/ImageMaster

一个面向手机端的漫画与轻小说阅读应用。项目使用 Vue 3 + Vite 构建前端，通过 Capacitor 打包 Android，并带有本地导入、WebDAV 云盘阅读、站点下载、EPUB/TXT 小说阅读等能力。

## 功能概览

- 本地书库：管理已导入或已下载的漫画、图片集、EPUB 和 TXT。
- 移动端阅读器：支持翻页模式、连续滚动、亮度调节、页面适配、章节目录、阅读进度保存。
- 小说阅读：支持 EPUB/TXT，提供字体大小、行距、首行缩进、段距、翻页动画等阅读设置。
- 云盘阅读：支持 WebDAV 目录浏览、封面缓存、在线预览和加入下载队列。
- 下载队列：支持暂停/重试/清理记录，并可写入 Android 本地目录。
- 站点解析：支持常见漫画图片页、Telegraph、JM/18Comic、E-Hentai/ExHentai、WNACG、nhentai、Hitomi 等来源。
- Android 原生能力：本地目录选择、下载写入、压缩包读取、沉浸式阅读、设备状态读取等。

## 技术栈

- Vue 3
- Vite 6
- TypeScript
- Pinia
- Vue Router
- Capacitor 7
- JSZip
- Tailwind CSS 4
- lucide-vue-next

## 项目结构

```text
.
├── front/                 # 前端与 Capacitor Android 工程
│   ├── src/
│   │   ├── components/    # 通用组件与移动端框架组件
│   │   ├── router/        # 路由
│   │   ├── services/      # 下载、云盘、书库、阅读器、原生插件封装
│   │   ├── stores/        # Pinia 状态
│   │   └── views/         # 书库、发现、下载、云盘、设置、详情、阅读页
│   ├── android/           # Capacitor Android 原生工程
│   ├── package.json
│   └── capacitor.config.ts
├── docs/                  # 设计与任务文档
└── .github/workflows/     # Android APK 构建流程
```

## 环境要求

- Node.js 22
- pnpm 10
- JDK 21，打 Android 包时需要
- Android Studio / Android SDK，调试 Android 时需要
- Python 3.11，GitHub Actions 中用于 Android 构建环境

## 本地运行

```powershell
pnpm --dir front install
pnpm --dir front dev
```

默认会启动 Vite 开发服务。手机同局域网调试时，使用终端输出的局域网地址访问即可。

## 类型检查与构建

```powershell
pnpm --dir front type-check
pnpm --dir front build
```

构建产物会输出到 `front/dist`。

## Android 调试与打包

首次准备 Android 平台：

```powershell
pnpm --dir front cap:sync
```

构建 Debug APK：

```powershell
pnpm --dir front build
pnpm --dir front cap:sync
cd front/android
.\gradlew.bat assembleDebug
```

产物位置：

```text
front/android/app/build/outputs/apk/debug/
```

如果遇到 `JAVA_HOME is not set and no 'java' command could be found in your PATH`，需要先安装 JDK 21，或把 Android Studio 自带 JBR 配到 `JAVA_HOME`。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm --dir front dev` | 启动 Vite 开发服务 |
| `pnpm --dir front type-check` | TypeScript / Vue 类型检查 |
| `pnpm --dir front build` | 前端生产构建 |
| `pnpm --dir front preview` | 本地预览构建产物 |
| `pnpm --dir front cap:sync` | 同步 Web 产物和 Capacitor Android 工程 |

## 使用说明

### 导入本地内容

在设置页可以导入：

- 图片文件
- 图片文件夹
- ZIP / CBZ 压缩包
- EPUB 小说
- TXT 小说

图片类内容会进入漫画阅读流程；EPUB/TXT 会进入小说阅读流程。

### 配置下载目录

Android 端建议先在设置页选择下载目录。之后下载任务会优先写入该目录，并在书库中建立索引。

### WebDAV 云盘

在云盘页填写 WebDAV 地址、用户名、密码和书库路径后，可以浏览远程目录、在线阅读，也可以加入下载队列缓存到本地。

### ExHentai Cookie

ExHentai 通常需要登录 Cookie。可在设置页填写 `ExHentai Cookie`，保存后下载解析会自动携带。

### 阅读设置

阅读页支持：

- 翻页 / 连续模式
- 从右到左 / 从左到右
- 页面适配宽度或屏幕
- 翻页动画
- 小说字体大小、行距、首行缩进、段距
- 小说插图圆角
- 章节目录与阅读进度

## 数据存储

- 书库索引、阅读进度、偏好设置主要保存在浏览器本地存储和 IndexedDB。
- Android 下载图片可写入用户选择的本地目录。
- WebDAV 封面和页面会按应用逻辑做本地缓存。

## GitHub Actions

仓库包含 `.github/workflows/android-apk.yml`。推送到 `main` 或手动触发后，会：

1. 安装 Node、pnpm、JDK 和 Python。
2. 构建前端。
3. 同步 Capacitor Android。
4. 构建 Debug APK。
5. 上传构建产物。
6. 在 `debug-latest` 标签上发布最新 Debug APK。

如果本地拉取时遇到 `debug-latest` 标签冲突，通常是因为该标签由 CI 强制更新。可以选择替换本地标签，或执行：

```powershell
git fetch origin refs/tags/debug-latest:refs/tags/debug-latest --force
```

## 注意事项

- 下载解析依赖目标站点页面结构和网络状态，站点改版可能导致解析失败。
- 部分来源需要 Cookie、代理或稳定网络。
- EPUB/TXT 的章节名优先读取目录与正文标题；如果原文件只有占位目录名，会尝试从正文标题兜底。
- 请只下载和阅读你有权访问与保存的内容。
