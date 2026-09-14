<div align="center">

<!-- ╔══════════════════════════════════════════════════════════════╗ -->
<!--                    STINGER V6 HEADER                         -->
<!-- ╚══════════════════════════════════════════════════════════════╝ -->

<img src="./menu.png" width="100%" alt="STINGER V6">

<br><br>

<img
  src="https://readme-typing-svg.demolab.com?font=Orbitron&weight=700&size=28&duration=2500&pause=700&color=00F7FF&center=true&vCenter=true&width=700&lines=%F0%9F%90%9D+STINGER+VERSION+6;%E2%9A%A1+NEXT+GENERATION+WHATSAPP+BOT;%F0%9F%8C%90+WEBPAIR+%2B+ADMIN+DASHBOARD;%F0%9F%A7%A9+MODULAR+PLUGIN+SYSTEM;%F0%9F%94%A5+BUILT+BY+CALLMΕ_ALPHA"
  alt="Typing animation"
>

<br>

<img src="https://img.shields.io/badge/STINGER-V6-00f7ff?style=for-the-badge&logo=whatsapp&logoColor=white">
<img src="https://img.shields.io/badge/NODE.JS-20%2B-00ff88?style=for-the-badge&logo=node.js&logoColor=white">
<img src="https://img.shields.io/badge/BAILEYS-WHATSAPP-ff0055?style=for-the-badge">
<img src="https://img.shields.io/badge/LICENSE-MIT-a855f7?style=for-the-badge">

<br><br>

> 🐝 **STINGER V6** — A powerful modular WhatsApp WebPair bot with a cyber-style admin command center.

</div>

---

# 🐝 STINGER V6

**STINGER V6** is a modular WhatsApp bot platform built with **Node.js, Baileys and Express**.

It combines:

- ⚡ WhatsApp automation
- 🌐 WebPair system
- 🛡️ Admin dashboard
- 🧩 Dynamic plugins
- 📊 Live system monitoring
- 👥 User management
- 📢 Broadcast system
- 📝 Logging
- 🔐 Authentication
- 🗄️ Automatic JSON database
- 🚀 Multiple deployment configurations

Designed by **CALLME_ALPHA** 🇿🇼

---

<div align="center">

## ⚡ STINGER V6

<img src="https://capsule-render.vercel.app/api?type=waving&color=00f7ff&height=120&section=header&text=STINGER%20V6&fontSize=40&fontColor=ffffff&animation=fadeIn&fontAlignY=35">

</div>

---

# ✨ FEATURES

<table>
<tr>
<td width="50%">

### 🌐 WebPair

- Beautiful pairing interface
- Phone number validation
- Pairing-code generation
- Pairing status monitor
- Session management
- Connection health checks

</td>

<td width="50%">

### 🛡️ Admin Center

- Secure administrator login
- Live dashboard
- User monitoring
- Connection monitoring
- Plugin management
- System controls

</td>
</tr>

<tr>
<td>

### 📢 Broadcast

- Broadcast messages
- Online-user targeting
- Delivery tracking
- Broadcast history
- Failed delivery tracking
- Scheduled broadcasts

</td>

<td>

### 🧩 Plugin System

- Dynamic plugin loading
- Plugin reload
- Enable/disable support
- Plugin statistics
- Error tracking
- Modular commands

</td>
</tr>

<tr>
<td>

### 📊 Monitoring

- CPU usage
- RAM usage
- Storage
- Uptime
- Node version
- System health

</td>

<td>

### 🔐 Security

- Admin sessions
- Password hashing
- Rate limiting
- Security logs
- Audit trail
- Protected runtime files

</td>
</tr>
</table>

---

# 🧬 PROJECT STRUCTURE

```text
🐝 STINGER-V6/
│
├── 📄 index.js
├── 📄 Stinger.js
├── 📄 Pair.js
│
├── 🌐 Pair.html
├── 🔐 Admin.html
├── ⚡ Admin.js
├── 🎨 Admin.css
├── 🖼️ menu.png
│
├── 📦 package.json
├── 🔒 .env.example
├── 🚫 .gitignore
│
├── 📂 Plugins/
│   ├── menu.js
│   ├── help.js
│   ├── ping.js
│   ├── alive.js
│   ├── owner.js
│   ├── info.js
│   └── settings.js
│
├── 📂 database/
│   ├── users.json
│   ├── settings.json
│   ├── broadcasts.json
│   ├── logs.json
│   └── admins.json
│
├── 📂 sessions/
│   └── Auto-created sessions
│
├── 📂 temp/
│   └── Auto-created files
│
├── 🚀 render.yaml
├── ▲ vercel.yaml
└── 🟣 heroku.yaml

---

🚀 QUICK START

1️⃣ Clone

git clone YOUR_GITHUB_REPOSITORY
cd STINGER-V6

2️⃣ Install dependencies

npm install

3️⃣ Create environment file

cp .env.example .env

Then configure your private environment variables.

4️⃣ Start STINGER

npm start

Development mode:

npm run dev

---

🌐 WEBPPAIR

After starting the server, open:

/pair

The STINGER WebPair interface provides:

┌──────────────────────────────┐
│        🐝 STINGER V6         │
│                              │
│     ENTER PHONE NUMBER       │
│                              │
│       [ +263 XXXXXXXX ]      │
│                              │
│       ⚡ GET PAIR CODE       │
│                              │
│       CONNECTION STATUS      │
└──────────────────────────────┘

---

🛡️ ADMIN DASHBOARD

Open:

/admin

The dashboard contains:

🏠 Dashboard
📊 Analytics
👥 Users
📡 Connections
📢 Broadcast
📅 Scheduler
🧩 Plugins
📝 Logs
🔔 Alerts
🌐 WebPair
🗄️ Database
⚙️ Bot Settings
🛠️ System
🛡️ Security
🖥️ Console

The admin panel is designed to provide a complete command center for STINGER V6.

---

🧩 PLUGINS

Plugins are stored inside:

Plugins/

A plugin can contain:

module.exports = {
    name: "example",
    command: "example",

    async execute({
        sock,
        msg,
        args,
        from,
        sender
    }) {

        await sock.sendMessage(from, {
            text: "🐝 STINGER V6"
        });

    }
};

Plugins can be added without modifying the main bot architecture.

---

⚙️ CONFIGURATION

Main configuration is stored in:

database/settings.json

Example:

{
  "botName": "STINGER VERSION 6",
  "version": "6.0.0",
  "developer": "Alpha",
  "country": "Zimbabwe 🇿🇼",
  "prefix": ".",
  "maintenance": false,
  "autoRead": false,
  "autoTyping": false
}

---

🗄️ DATABASE

STINGER automatically creates its runtime directories.

database/
sessions/
temp/

Database files include:

👥 users.json
⚙️ settings.json
📢 broadcasts.json
📝 logs.json
🔐 admins.json

Runtime session credentials are intentionally excluded from Git.

---

☁️ DEPLOYMENT

🟢 Render

Recommended for the complete STINGER V6 server because the bot requires a persistent Node.js process.

Build Command:

npm install

Start Command:

npm start

Health endpoint:

/health

---

▲ Vercel

The project includes:

vercel.yaml

Vercel can be used for the web/API portion, but a persistent WhatsApp bot session is better suited to a long-running server.

---

🟣 Heroku

The project also contains:

heroku.yaml

A Dockerfile is required when deploying through the included Heroku configuration.

---

🔐 SECURITY

NEVER commit your ".env" file.

Use:

.env

for private configuration.

Commit:

.env.example

instead.

Protected directories include:

sessions/
temp/
database runtime files
.env

Admin passwords should be stored as secure hashes rather than plaintext.

---

🧠 ARCHITECTURE

                    ┌───────────────────┐
                    │    🌐 WEBPAIR     │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │    ⚡ EXPRESS     │
                    │      SERVER       │
                    └─────────┬─────────┘
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
      ┌────────────┐   ┌────────────┐   ┌────────────┐
      │  STINGER   │   │   ADMIN    │   │ DATABASE   │
      │    CORE    │   │  CENTER    │   │   SYSTEM   │
      └─────┬──────┘   └────────────┘   └────────────┘
            │
            ▼
      ┌────────────┐
      │  BAILEYS   │
      │  WHATSAPP  │
      └─────┬──────┘
            │
            ▼
      ┌────────────┐
      │  PLUGINS   │
      │   SYSTEM   │
      └────────────┘

---

🐝 BOT INFORMATION

╭──────────────────────────────╮
│       🐝 STINGER V6          │
├──────────────────────────────┤
│ Bot       : STINGER V6       │
│ Version   : 6.0.0            │
│ Developer : CALLME_ALPHA     │
│ Country   : Zimbabwe 🇿🇼      │
│ Runtime   : Node.js          │
│ Engine    : Baileys          │
│ Prefix    : .                │
╰──────────────────────────────╯

---

📡 DEVELOPER & SUPPORT

<div align="center">👑 CALLME_ALPHA

Developer • STINGER V6

🇿🇼 Zimbabwe

<br><a href="YOUR_DEVELOPER_CHANNEL_URL">
<img src="https://img.shields.io/badge/📢%20DEVELOPER%20CHANNEL-00F7FF?style=for-the-badge">
</a><a href="YOUR_SUPPORT_URL">
<img src="https://img.shields.io/badge/💬%20SUPPORT-FF0055?style=for-the-badge">
</a></div>---

📜 COMMAND EXAMPLE

.menu
.help
.ping
.alive
.owner
.info
.settings
.stingerfull

---

⚠️ DISCLAIMER

STINGER V6 is provided for legitimate automation, development and educational purposes.

Users are responsible for how they configure and use the software.

Do not use the project for spam, harassment, unauthorized access, impersonation, or other abusive activity.

---

❤️ CREDITS

<div align="center">STINGER V6

Made with ❤️ + ☕ + JavaScript

🐝 STING HARD. CODE SMART.

<img src="https://capsule-render.vercel.app/api?type=waving&color=ff0055&height=100&section=footer"></div>
```This gives the repository a much more premium/cyber GitHub identity, including animated typing, SVG-style header effects, deployment documentation, architecture, plugin documentation, developer/support buttons, and the STINGER branding.

I left "YOUR_DEVELOPER_CHANNEL_URL" and "YOUR_SUPPORT_URL" as placeholders so the README doesn't accidentally point to the wrong channel.
