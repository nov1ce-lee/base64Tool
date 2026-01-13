# Save .dat 解析 / 加解密工具（纯前端）

![项目截图](./assets/screenshot.svg)

这是一个纯前端的小工具页，用来做两件事：

- 把一段文本按指定“加密方式 + 编码方式 + key”进行加/解密，方便你快速验证参数是否正确
- 导入某些 `.dat` 二进制存档文件，从里面按 `BinaryFormatter` 的字符串结构提取出编码串，解密后展示 JSON，并支持改完再导出回 `.dat`

项目不依赖后端服务，你开个静态文件服务器就能用。

## 在线 Demo（GitHub Pages）

- `https://nov1ce-lee.github.io/base64Tool`

## 现在支持什么

### 文本加/解密

- AES-ECB / Pkcs7（CryptoJS）
- 不加密（仅做编码转换）
- 编码：Base64 / Base64URL / Hex

### .dat 导入/导出

- 在二进制里查找 `0x06` 开头的字符串对象（按 7-bit length 读取长度）
- 把提取到的“编码串”用当前配置解密成 JSON（可编辑）
- 把编辑后的 JSON 再加密成“编码串”，保持 header/footer 结构不变，生成新的 `.dat`

## 快速开始

### 方式 A：不安装依赖（推荐）

在项目目录执行：

```bash
npx --yes http-server -p 8000 -c-1
```

然后打开：

- http://127.0.0.1:8000/

### 方式 B：安装依赖（有 npm scripts）

```bash
npm install
npm run dev
```

## 发布到 GitHub Pages（推荐）

项目已经内置了 GitHub Actions 工作流：每次 push 到 `main` 分支会自动发布。

1. 把仓库推到 GitHub（默认分支用 `main`）
2. 在 GitHub 仓库里打开：Settings → Pages
3. Source 选择：GitHub Actions
4. 等 Actions 跑完后，就能在上面的在线地址访问

## 使用说明

### 1）纯文本加/解密

1. 选“加密方式”
2. 填 key（如果算法需要）
3. 选“输出编码”
4. 在“明文”里粘贴内容，点“加密 →”
5. 或者在“密文”里粘贴内容，点“← 解密”

### 2）导入 .dat 并导出

1. 在“.dat 导入 / 导出”里选择文件
2. 页面会自动提取编码串并解密，右侧显示 JSON
3. 修改 JSON 后点击“导出 .dat”

## 注意事项

- **AES-ECB 本身不安全**：它适合“复现存档格式/做兼容”，不适合拿去做真正的安全加密。
- **key 的长度要对上**：CryptoJS 会把你输入的 key 当作 UTF-8 字节，最终是否能解出来完全取决于你目标存档用的规则是否一致。
- **导入逻辑是“按结构猜字符串”**：如果你的 `.dat` 里有多个字符串对象，或者结构不是这个格式，可能会提取错。后续可以按你的实际样本把“选哪一个字符串”做成可配置。

## 目录结构

```
.
├─ index.html
├─ assets/
│  └─ screenshot.svg
├─ src/
│  ├─ app.js
│  └─ styles.css
├─ .github/
│  └─ workflows/
│     └─ deploy-pages.yml
├─ package.json
└─ README.md
```
