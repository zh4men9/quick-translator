# 图标文件说明

## 图标设计
- **主色调**: 现代化蓝色渐变 (#74b9ff 到 #0984e3)
- **设计元素**: 
  - 双向翻译箭头
  - 中英文标识 (中/EN)
  - AI学习图标
  - 装饰性光点

## 所需尺寸
- `icon-16.png`: 16x16px (Chrome扩展列表)
- `icon-32.png`: 32x32px (Windows任务栏)  
- `icon-48.png`: 48x48px (扩展管理页面)
- `icon-128.png`: 128x128px (Chrome Web Store)

## 生成方法
1. 使用在线SVG转PNG工具转换 `icon.svg`
2. 或使用设计软件 (Figma, Sketch, Photoshop)
3. 或使用命令行工具如 Inkscape:
   ```bash
   # 需要安装 inkscape
   inkscape icon.svg -w 16 -h 16 -o icons/icon-16.png
   inkscape icon.svg -w 32 -h 32 -o icons/icon-32.png
   inkscape icon.svg -w 48 -h 48 -o icons/icon-48.png
   inkscape icon.svg -w 128 -h 128 -o icons/icon-128.png
   ```

## 图标特点
✅ 清晰识别的翻译主题
✅ 现代化设计风格
✅ 与界面配色统一
✅ 多尺寸适配良好