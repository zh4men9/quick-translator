# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension for Chinese-English translation with AI learning features. It provides:
- Quick translation via Google Translate
- AI-powered translation, grammar correction, and learning suggestions via Gemini/OpenAI
- Context menu integration for right-click translation
- Popup interface for batch translation and learning

## Architecture

### Core Files
- `manifest.json` - Chrome extension configuration (v3)
- `background.js` - Service worker handling context menus, storage, and API calls
- `popup.js` - Main popup interface logic with history management
- `popup.html` - Popup UI with translation direction selector, results panels, and history
- `options.js` - Settings page for API configuration and prompts
- `options.html` - Settings UI
- `styles.css` - Shared styling with modern blue gradient theme
- `icons/` - PNG icon files (16, 32, 48, 128px) with blue gradient translation design

### Key Components

**Storage Management:**
- Uses Chrome sync storage with keys: `lastDirection`, `settings`
- Uses Chrome local storage for `translationHistory`
- Default API endpoint: `http://localhost:3001/proxy/gemini` (gptload multi-key proxy)
- Configurable providers: auto-detect, OpenAI, Gemini

**Translation Flow:**
1. Google Translate API for quick translation (immediate display)
2. AI provider (Gemini/OpenAI) for enhanced features (parallel processing):
   - AI Translation (bilingual: English/Chinese)
   - Grammar correction (bilingual: English/Chinese)
   - Alternative phrasings (bilingual: English/Chinese)
   - Learning tips with exercises (bilingual: English/Chinese)
3. Results saved to history with timestamp and direction

**Context Menu Integration:**
- "翻译为中文" - Translate to Chinese (copied to clipboard)
- "Translate to English" - Translate to English (copied to clipboard)  
- "学习版翻译" - AI learning translation with overlay display (CSP-compliant)

**Additional Features:**
- History panel with clickable past translations
- Pin functionality for independent windows
- Modern UI with blue gradient theme (#74b9ff → #0984e3)
- Keyboard shortcuts (Ctrl+Enter for translation)
- Copy to clipboard functionality
- CSP-compliant code (no eval usage)
- Simple translate button for quick Google-only translation (configurable with optional Gemini)

### Configuration
- API settings stored in Chrome sync storage
- Customizable AI prompts for different features (bilingual support)
- Temperature and model selection for AI providers
- Support for custom API headers
- gptload integration for multi-key Gemini proxy

## Development Commands

Since this is a vanilla JavaScript Chrome extension with no build system:

**Loading for Development:**
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory

**Testing:**
- Test popup interface by clicking extension icon
- Test context menus by right-clicking selected text
- Test settings page via popup "设置" link
- Check Chrome DevTools > Console for errors

**API Testing:**
- Ensure local proxy server is running on `localhost:3001` if using default settings
- Check network requests in DevTools for API call debugging

## language
thinking in english, response in chinese