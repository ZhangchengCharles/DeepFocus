# DeepFocus

An AI-powered Chrome extension that helps you stay focused by intelligently blocking distracting content during work sessions.

## Features

- **Smart Timer**: Customizable focus sessions with automatic break reminders
- **AI-Powered Filtering**: Uses on-device machine learning to block distracting content based on semantic similarity to your keywords
- **Two-Tier Blocking**:
  - Site-level blocking (blacklist/whitelist entire domains)
  - Content-level filtering (ML-based semantic analysis on specific sites)
- **Zero Server Dependency**: All AI processing runs locally in your browser
- **Customizable Themes**: Forest, Sunset, and Purple color schemes
- **Desktop Notifications**: Get notified when focus sessions and breaks complete

## Installation

### From Chrome Web Store (Easiest)

Install directly from the Chrome Web Store: [bit.ly/DeepFocus-AI](https://bit.ly/DeepFocus-AI)

### From Release

1. Download the latest release from [Releases](https://github.com/ZhangchengCharles/DeepFocus/releases)
2. Extract the `DeepFocus-vX.X.X.zip` file
3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the extracted `dist` folder

### From Source

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project root directory

## Usage

1. Click the extension icon to start a focus session
2. Configure blocking rules in the Dashboard:
   - **Blocking tab**: Block or whitelist entire websites
   - **Filtering tab**: Set up AI-based content filtering with custom keywords
3. The extension will block distracting sites and content while your timer is active

### AI Content Filtering

1. Add sites to your **Filter List** (e.g., youtube.com, reddit.com)
2. Add **Blocked Keywords** (e.g., gaming, sports, celebrity)
3. Add **Allowed Keywords** (e.g., work, study, programming)
4. The AI analyzes page content and blocks pages similar to blocked keywords

## Development

```bash
npm run dev           # Development mode with auto-reload
npm run build         # Production build
npm test              # Run tests
npm run test:watch    # Watch mode for tests
```

## Technology Stack

- **Chrome Extension Manifest V3**
- **React** + TypeScript
- **Tailwind CSS**
- **HuggingFace Transformers.js** (gte-base-en-v1.5 embedding model)
- **ONNX Runtime** (WebAssembly)
- **Webpack**

## How It Works

DeepFocus uses a semantic similarity approach to filter content:

1. Page text is split into sliding windows
2. Each window is embedded using a transformer model
3. Similarity is computed against your blocked/allowed keywords
4. All processing happens locally in your browser - no data is sent to servers

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the LICENSE file for details.
