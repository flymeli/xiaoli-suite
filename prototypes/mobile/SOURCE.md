# 原型来源

这是用户自己的 OpenDesign 项目 `6de335a6-f9e2-42a5-b799-5409948a2f2e`，不是墙墙旧 HTML。导入时保留了可运行底稿：

- `index.html`（2026-11-06 的学生端单页原型）
- `DESIGN.md`（健康管理类 App 的风格提示词。用户刻意用它做简洁的移动端方向，只借鉴设计语言，不继承该产品的业务、结构和文案）
- `assets/stock`、`assets/video`（页面实际引用的本地图片和视频）
- `index.html.artifact.json`

相对路径没有改。校园图和视频都在 `assets/` 里，打开页面时不请求图床。上游出处写在 `assets/stock/credits.json` 和 `assets/video/credits.json`，正式使用前仍要自行核对许可。视频文件是本地的 20 秒片段，详情页继续用原来的控件条，没有改成上下滑。

没有带入的内容：OpenDesign 的 `.file-versions` 历史稿、`.od-frames` 设备框、`.od-skills`，以及项目根目录里那些不参与页面渲染的参考截图和批注图。它们不影响这个目录直接打开。主题色仍是底稿里的 `#4B6CB7` 和描边按钮，没有改回资料包里的 token 蓝 `#2457E7`。

`auth-batch.js` 和 `auth-batch.css` 是 2026-11-17 第一批加上的认证 / 学校状态。范围见仓库 `docs/06-原型完善第一批说明.md`。

本地查看：在本目录起一个静态服务后打开 `index.html`。不要用带外部认证的环境变量，这里也没有任何密钥。
