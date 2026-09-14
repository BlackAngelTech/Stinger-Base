// ============================================================
// 🐝 STINGER V6 — MAIN ENTRY POINT
// ============================================================
// Developer : Alpha
// Country   : Zimbabwe 🇿🇼
// Version   : 6.0.0
// ============================================================

"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const ROOT_DIR = __dirname;

const DATABASE_DIR = path.join(ROOT_DIR, "database");
const SESSIONS_DIR = path.join(ROOT_DIR, "sessions");
const TEMP_DIR = path.join(ROOT_DIR, "temp");
const PLUGINS_DIR = path.join(ROOT_DIR, "Plugins");

// ============================================================
// 📁 DIRECTORY INITIALIZER
// ============================================================

function ensureDirectory(directory) {
    try {
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, {
                recursive: true
            });

            console.log(`✓ Created directory: ${path.basename(directory)}`);
        }
    } catch (error) {
        console.error(
            `✗ Failed to create ${directory}:`,
            error.message
        );

        process.exit(1);
    }
}

// ============================================================
// 🗄️ DATABASE INITIALIZER
// ============================================================

const DATABASE_FILES = {
    "users.json": [],
    "settings.json": {
        botName: "STINGER VERSION 6",
        version: "6.0.0",
        developer: "Alpha",
        country: "Zimbabwe 🇿🇼",
        prefix: ".",
        maintenance: false,
        autoRead: false,
        autoTyping: false
    },
    "broadcasts.json": [],
    "logs.json": [],
    "admins.json": []
};

function ensureDatabase() {
    ensureDirectory(DATABASE_DIR);

    for (const [fileName, defaultData] of Object.entries(DATABASE_FILES)) {
        const filePath = path.join(DATABASE_DIR, fileName);

        try {
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(
                    filePath,
                    JSON.stringify(defaultData, null, 2),
                    "utf8"
                );

                console.log(`✓ Created database: ${fileName}`);
                continue;
            }

            // Make sure an existing file contains valid JSON.
            const content = fs.readFileSync(filePath, "utf8").trim();

            if (!content) {
                fs.writeFileSync(
                    filePath,
                    JSON.stringify(defaultData, null, 2),
                    "utf8"
                );

                console.log(`✓ Reinitialized empty database: ${fileName}`);
                continue;
            }

            JSON.parse(content);
            console.log(`✓ Loaded database: ${fileName}`);

        } catch (error) {
            console.error(
                `✗ Database error (${fileName}):`,
                error.message
            );

            process.exit(1);
        }
    }
}

// ============================================================
// 🧩 PLUGIN DIRECTORY
// ============================================================

function ensurePluginDirectory() {
    ensureDirectory(PLUGINS_DIR);
}

// ============================================================
// 📦 REQUIRED DIRECTORIES
// ============================================================

function initializeFileSystem() {
    console.log("\n🐝 STINGER V6 INITIALIZING...\n");

    ensureDirectory(DATABASE_DIR);
    ensureDirectory(SESSIONS_DIR);
    ensureDirectory(TEMP_DIR);
    ensurePluginDirectory();

    ensureDatabase();

    console.log("\n✓ File system ready");
}

// ============================================================
// 📝 SYSTEM LOGGER
// ============================================================

function writeLog(type, message, extra = {}) {
    const filePath = path.join(DATABASE_DIR, "logs.json");

    try {
        let logs = [];

        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, "utf8");
            logs = raw ? JSON.parse(raw) : [];
        }

        logs.push({
            type,
            message,
            timestamp: new Date().toISOString(),
            ...extra
        });

        // Keep the database from growing forever.
        if (logs.length > 5000) {
            logs = logs.slice(-5000);
        }

        fs.writeFileSync(
            filePath,
            JSON.stringify(logs, null, 2),
            "utf8"
        );

    } catch (error) {
        console.error("Logger error:", error.message);
    }
}

// ============================================================
// 🌐 EXPRESS SERVER
// ============================================================

const app = express();

app.disable("x-powered-by");

app.use(express.json({
    limit: "2mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "2mb"
}));

// Static files
app.use(express.static(ROOT_DIR));

// ============================================================
// ❤️ HEALTH CHECK
// ============================================================

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        bot: "STINGER VERSION 6",
        version: "6.0.0",
        developer: "Alpha",
        country: "Zimbabwe 🇿🇼",
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// 🏠 HOME
// ============================================================

app.get("/", (req, res) => {
    const pairPage = path.join(ROOT_DIR, "Pair.html");

    if (fs.existsSync(pairPage)) {
        return res.sendFile(pairPage);
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>STINGER V6</title>
            <meta name="viewport"
                content="width=device-width, initial-scale=1">
        </head>
        <body>
            <h1>🐝 STINGER V6</h1>
            <p>Pairing interface is not installed.</p>
        </body>
        </html>
    `);
});

// ============================================================
// 🔐 ADMIN PAGE
// ============================================================

app.get("/admin", (req, res) => {
    const adminPage = path.join(ROOT_DIR, "Admin.html");

    if (!fs.existsSync(adminPage)) {
        return res.status(404).send("Admin panel not found.");
    }

    res.sendFile(adminPage);
});

// ============================================================
// 📡 SERVER
// ============================================================

const server = http.createServer(app);

// ============================================================
// 🐝 START STINGER
// ============================================================

async function startStinger() {
    try {
        initializeFileSystem();

        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🐝 STINGER VERSION 6");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("👑 Developer : Alpha");
        console.log("🇿🇼 Country   : Zimbabwe");
        console.log(`🌐 Port      : ${PORT}`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        // ----------------------------------------------------
        // Load the core bot.
        // Stinger.js should export:
        //
        // module.exports = {
        //     start,
        //     stop
        // };
        // ----------------------------------------------------

        const Stinger = require("./Stinger");

        if (!Stinger || typeof Stinger.start !== "function") {
            throw new Error(
                "Stinger.js must export a start() function."
            );
        }

        await Stinger.start({
            rootDir: ROOT_DIR,
            databaseDir: DATABASE_DIR,
            sessionsDir: SESSIONS_DIR,
            tempDir: TEMP_DIR,
            pluginsDir: PLUGINS_DIR
        });

        writeLog(
            "SYSTEM",
            "Stinger V6 started successfully."
        );

        server.listen(PORT, HOST, () => {
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log("🟢 STINGER V6 ONLINE");
            console.log(`🌐 Port: ${PORT}`);
            console.log(`🔗 Pair: /`);
            console.log(`🔐 Admin: /admin`);
            console.log(`❤️ Health: /health`);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        });

    } catch (error) {
        console.error("\n❌ STINGER V6 STARTUP ERROR");
        console.error(error);

        writeLog(
            "CRITICAL",
            "Stinger V6 failed to start.",
            {
                error: error.message
            }
        );

        process.exit(1);
    }
}

// ============================================================
// 🛑 GRACEFUL SHUTDOWN
// ============================================================

let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) return;

    shuttingDown = true;

    console.log(`\n🛑 ${signal} received.`);
    console.log("🐝 Shutting down Stinger V6...");

    try {
        const Stinger = require("./Stinger");

        if (
            Stinger &&
            typeof Stinger.stop === "function"
        ) {
            await Stinger.stop();
        }
    } catch (error) {
        console.error(
            "Shutdown error:",
            error.message
        );
    }

    server.close(() => {
        writeLog(
            "SYSTEM",
            `Stinger V6 stopped (${signal}).`
        );

        console.log("✓ Server closed.");
        console.log("✓ Stinger V6 stopped.");

        process.exit(0);
    });

    // Prevent hanging forever.
    setTimeout(() => {
        process.exit(0);
    }, 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ============================================================
// 🚨 UNHANDLED ERRORS
// ============================================================

process.on("uncaughtException", (error) => {
    console.error("🚨 Uncaught Exception:", error);

    writeLog(
        "CRITICAL",
        "Unhandled exception.",
        {
            error: error.message,
            stack: error.stack
        }
    );
});

process.on("unhandledRejection", (reason) => {
    console.error("🚨 Unhandled Rejection:", reason);

    writeLog(
        "CRITICAL",
        "Unhandled promise rejection.",
        {
            error: String(reason)
        }
    );
});

// ============================================================
// 🚀 BOOT
// ============================================================

startStinger();
