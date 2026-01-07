# ⚡ Zync: The Modern SSH Client

![Zync Banner](https://github.com/user-attachments/assets/12522cea-7972-4adc-b26f-fe0cc5fff081)

**Zync** is a next-generation SSH client built for the modern web era. It combines the power of a professional terminal with the beauty and ease of use of a modern design system. Built with Electron, React, and TypeScript, Zync offers a premium experience for DevOps engineers, developers, and sysadmins.

## 🌟 Key Features

### 🖥️ Beautiful Terminal Experience
- **GPU-Accelerated**: Powered by `xterm.js` with WebGL support for high-performance rendering.
- **Smart Features**: 
  - Clickable links.
  - Search (`Ctrl+F`).
  - Zoom Support (`Ctrl +/-`).
  - Copy/Paste with context menus.
- **Theming**: Per-connection theme overrides (Pro Red, Dev Blue, etc.) to visually distinguish production from staging.

### 📂 Integrated File Manager (SFTP)
- **Drag & Drop**: Upload and download files effortlessly between your local machine and remote servers.
- **Server-to-Server**: Drag files directly between two open remote connection tabs to transfer data without touching your local disk.
- **Rich Interface**: Grid and List views with file icons, sorting, and breadcrumb navigation.
- **Editor**: Built-in code editor for quick config changes on the fly.

### 📊 Vital Dashboard
- **Real-time Metrics**: View CPU, RAM, Disk, and Network usage at a glance upon connection.
- **Quick Actions**: Execute custom scripts (e.g., `docker ps`, `logs`) with a single click.
- **Uptime & OS Info**: Instant visibility into server health.

### 🔌 Tunnels & Port Forwarding
- **Visual Management**: Create and manage SSH tunnels (Local/Remote) via a clean UI.
- **Auto-Start**: Configure tunnels to automatically open when you connect.
- ** Active Monitoring**: See real-time status of active forwardings.

### ⚡ Power User Workflow
- **Global Shortcuts**: `Ctrl/Cmd + K` Command Palette (coming soon), `Ctrl+B` Toggle Sidebar.
- **Smart Sidebar**:
  - Folders for organizing connections (Prod, Staging, Personal).
  - Searchable connection list.
  - Compact mode for maximum screen real estate.
- **Local Terminal**: One-click access to your local shell alongside remote sessions.

### 🎨 Customization
- **Vibrancy**: Toggle glassmorphism/blur effects for a futuristic look.
- **Themes**: Multiple app-wide themes (Dark, Light Warm, High Contrast).
- **Fonts**: Customize terminal font family and size.

### 🪟 Windows Integration
- **Native Shell Support**: First-class integration for **WSL (Windows Subsystem for Linux)**, **PowerShell**, **Git Bash**, and **CMD**.
- **Smart Detection**: Automatically detects installed distributions and shells for the Local Terminal.
- **Optimized UI**: Tailored window controls and acrylic effects for a native Windows 11 feel.

### 🔄 Auto-Update
- **Seamless Upgrades**: Zync now keeps itself up-to-date automatically in the background.
- **Platform Support**: Full auto-update support for **Windows** (NSIS) and **Linux** (AppImage).
- **Smart Notification**: Get notified when a new version is available and install it with a single click.

---

## 📥 Installation

### Linux
Download the `.AppImage`, `.deb`, or `.rpm` from the [Releases](https://github.com/FDgajju/zync/releases) page.
```bash
# Or use the universal installer
curl -fsSL https://zync.thesudoer.in/install.sh | sh
```

### Windows
Download the `.exe` installer from the [Releases](https://github.com/FDgajju/zync/releases) page.

### macOS
Download the `.dmg` or `.app.zip` (Universal Binary).

---

## 💻 Development

### Prerequisites
- Node.js 20+
- NPM

### Build
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for distribution
npm run build:linux
npm run build:win
npm run build:mac
```

---

## 🛠️ Built With
- **Electron**: Cross-platform desktop runtime.
- **React 19**: Responsive, component-based UI.
- **TailwindCSS**: Utility-first styling for a polished design system.
- **Node-PTY & SSH2**: Robust backend for terminal and protocol handling.

---

**Happy Hacking!** 🚀
