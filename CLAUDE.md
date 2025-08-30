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
- `popup.js` - Main popup interface logic 
- `popup.html` - Popup UI with translation direction selector and results panels
- `options.js` - Settings page for API configuration and prompts
- `options.html` - Settings UI
- `styles.css` - Shared styling

### Key Components

**Storage Management:**
- Uses Chrome sync storage with keys: `lastDirection`, `settings`
- Default API endpoint: `http://localhost:3001/proxy/gemini`
- Configurable providers: auto-detect, OpenAI, Gemini

**Translation Flow:**
1. Google Translate API for quick translation
2. AI provider (Gemini/OpenAI) for enhanced features:
   - AI Translation
   - Grammar correction 
   - Alternative phrasings
   - Learning tips with exercises

**Context Menu Integration:**
- "翻译为中文" - Translate to Chinese (copied to clipboard)
- "Translate to English" - Translate to English (copied to clipboard)  
- "学习版翻译" - AI learning translation

### Configuration
- API settings stored in Chrome sync storage
- Customizable AI prompts for different features
- Temperature and model selection for AI providers
- Support for custom API headers

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