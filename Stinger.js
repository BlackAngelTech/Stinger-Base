// ============================================================
// 🐝 STINGER V6 — CORE ENGINE
// ============================================================
// Developer : Alpha
// Country   : Zimbabwe 🇿🇼
// Version   : 6.0.0
// ============================================================

"use strict";

const fs = require("fs");
const path = require("path");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const pino = require("pino");

// ============================================================
// ⚙️ STATE
// ============================================================

let sock = null;
let started = false;
let stopping = false;

let config = {
    rootDir: __dirname,
    databaseDir: path.join(__dirname, "database"),
    sessionsDir: path.join(__dirname, "sessions"),
    tempDir: path.join(__dirname, "temp"),
    pluginsDir: path.join(__dirname, "Plugins")
};

const startTime = Date.now();

const pluginRegistry = new Map();

// ============================================================
// 📝 LOGGER
// ============================================================

const logger = pino({
    level: process.env.LOG_LEVEL || "silent"
});

// ============================================================
// 📁 HELPERS
// ============================================================

function ensureDirectory(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }
}

function readJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(
                file,
                JSON.stringify(fallback, null, 2)
            );

            return fallback;
        }

        const data = fs.readFileSync(file, "utf8").trim();

        if (!data) {
            return fallback;
        }

        return JSON.parse(data);

    } catch (error) {
        console.error(
            `JSON read error: ${file}`,
            error.message
        );

        return fallback;
    }
}

function writeJSON(file, data) {
    try {
        fs.writeFileSync(
            file,
            JSON.stringify(data, null, 2),
            "utf8"
        );

        return true;

    } catch (error) {
        console.error(
            `JSON write error: ${file}`,
            error.message
        );

        return false;
    }
}

// ============================================================
// 🗄️ DATABASE
// ============================================================

function databaseFile(name) {
    return path.join(
        config.databaseDir,
        name
    );
}

function getUsers() {
    return readJSON(
        databaseFile("users.json"),
        []
    );
}

function saveUsers(users) {
    return writeJSON(
        databaseFile("users.json"),
        users
    );
}

function getSettings() {
    return readJSON(
        databaseFile("settings.json"),
        {
            botName: "STINGER VERSION 6",
            version: "6.0.0",
            developer: "Alpha",
            country: "Zimbabwe 🇿🇼",
            prefix: ".",
            maintenance: false,
            autoRead: false,
            autoTyping: false
        }
    );
}

// ============================================================
// 👥 SESSION TRACKING
// ============================================================

function updateSession(status = "online") {
    const users = getUsers();

    const botNumber =
        sock?.user?.id?.split(":")[0] || "unknown";

    const index = users.findIndex(
        user => user.id === botNumber
    );

    const record = {
        id: botNumber,
        status,
        lastSeen: new Date().toISOString(),
        connectedAt:
            index >= 0
                ? users[index].connectedAt
                : new Date().toISOString()
    };

    if (index >= 0) {
        users[index] = {
            ...users[index],
            ...record
        };
    } else {
        users.push(record);
    }

    saveUsers(users);
}

// ============================================================
// 🔌 PLUGIN LOADER
// ============================================================

function loadPlugins() {
    ensureDirectory(config.pluginsDir);

    pluginRegistry.clear();

    const files = fs
        .readdirSync(config.pluginsDir)
        .filter(file =>
            file.endsWith(".js")
        );

    for (const file of files) {
        const filePath =
            path.join(config.pluginsDir, file);

        try {
            delete require.cache[
                require.resolve(filePath)
            ];

            const plugin = require(filePath);

            if (
                !plugin ||
                typeof plugin !== "object"
            ) {
                console.warn(
                    `⚠️ Invalid plugin: ${file}`
                );

                continue;
            }

            const name =
                plugin.name ||
                path.basename(file, ".js");

            pluginRegistry.set(
                name,
                {
                    ...plugin,
                    file
                }
            );

            console.log(
                `✓ Plugin loaded: ${name}`
            );

        } catch (error) {
            console.error(
                `❌ Plugin error: ${file}`,
                error.message
            );
        }
    }

    console.log(
        `🧩 ${pluginRegistry.size} plugin(s) loaded.`
    );

    return pluginRegistry;
}

// ============================================================
// 🔄 RELOAD PLUGINS
// ============================================================

function reloadPlugins() {
    console.log("🔄 Reloading plugins...");

    loadPlugins();

    return {
        success: true,
        count: pluginRegistry.size
    };
}

// ============================================================
// 📊 BOT INFORMATION
// ============================================================

function getUptime() {
    const seconds =
        Math.floor(
            (Date.now() - startTime) / 1000
        );

    const days =
        Math.floor(seconds / 86400);

    const hours =
        Math.floor(
            (seconds % 86400) / 3600
        );

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    const secs =
        seconds % 60;

    return {
        seconds,
        formatted:
            `${days}d ${hours}h ${minutes}m ${secs}s`
    };
}

function getBotInfo() {
    const settings = getSettings();

    return {
        name:
            settings.botName ||
            "STINGER VERSION 6",

        version:
            settings.version ||
            "6.0.0",

        developer:
            settings.developer ||
            "Alpha",

        country:
            settings.country ||
            "Zimbabwe 🇿🇼",

        uptime:
            getUptime(),

        memory: process.memoryUsage(),

        cpu: process.cpuUsage(),

        node:
            process.version,

        platform:
            process.platform,

        plugins:
            pluginRegistry.size,

        connected:
            Boolean(sock?.user)
    };
}

// ============================================================
// 💬 MESSAGE HANDLER
// ============================================================

async function handleMessage(message) {
    try {
        if (!message?.message) {
            return;
        }

        const remoteJid =
            message.key?.remoteJid;

        if (!remoteJid) {
            return;
        }

        const content =
            message.message.conversation ||
            message.message.extendedTextMessage
                ?.text ||
            message.message.imageMessage
                ?.caption ||
            message.message.videoMessage
                ?.caption ||
            "";

        if (!content) {
            return;
        }

        const settings = getSettings();

        const prefix =
            settings.prefix || ".";

        if (!content.startsWith(prefix)) {
            return;
        }

        const commandBody =
            content.slice(prefix.length).trim();

        if (!commandBody) {
            return;
        }

        const parts =
            commandBody.split(/\s+/);

        const command =
            parts.shift().toLowerCase();

        const args = parts;

        const plugin =
            [...pluginRegistry.values()]
                .find(item => {
                    const commands =
                        Array.isArray(item.command)
                            ? item.command
                            : [item.command || item.name];

                    return commands
                        .map(String)
                        .map(x => x.toLowerCase())
                        .includes(command);
                });

        if (!plugin) {
            return;
        }

        if (
            typeof plugin.execute !==
            "function"
        ) {
            return;
        }

        await plugin.execute({
            sock,
            message,
            jid: remoteJid,
            command,
            args,
            text: args.join(" "),
            config,
            bot: getBotInfo()
        });

    } catch (error) {
        console.error(
            "❌ Message handler error:",
            error.message
        );
    }
}

// ============================================================
// 🐝 CREATE WHATSAPP CONNECTION
// ============================================================

async function connect() {
    if (stopping) {
        return;
    }

    ensureDirectory(config.sessionsDir);

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(
        config.sessionsDir
    );

    let version;

    try {
        const latest =
            await fetchLatestBaileysVersion();

        version = latest.version;

    } catch {
        version = undefined;
    }

    sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(
                state.keys,
                logger
            )
        },

        version,

        logger,

        printQRInTerminal: false,

        browser: [
            "STINGER V6",
            "Chrome",
            "6.0.0"
        ],

        generateHighQualityLinkPreview: true,

        syncFullHistory: false
    });

    // --------------------------------------------------------
    // 🔐 SAVE AUTH
    // --------------------------------------------------------

    sock.ev.on(
        "creds.update",
        saveCreds
    );

    // --------------------------------------------------------
    // 📡 CONNECTION EVENTS
    // --------------------------------------------------------

    sock.ev.on(
        "connection.update",
        async update => {
            const {
                connection,
                lastDisconnect
            } = update;

            if (connection === "open") {
                console.log(
                    "\n🟢 STINGER V6 CONNECTED"
                );

                started = true;

                updateSession("online");
            }

            if (connection === "close") {
                started = false;

                updateSession(
                    "disconnected"
                );

                const statusCode =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode;

                const shouldReconnect =
                    statusCode !==
                    DisconnectReason.loggedOut &&
                    !stopping;

                console.log(
                    "🔴 Connection closed."
                );

                if (shouldReconnect) {
                    console.log(
                        "🔄 Reconnecting..."
                    );

                    setTimeout(
                        connect,
                        3000
                    );
                } else {
                    console.log(
                        "⚠️ Session logged out."
                    );
                }
            }
        }
    );

    // --------------------------------------------------------
    // 💬 MESSAGE EVENTS
    // --------------------------------------------------------

    sock.ev.on(
        "messages.upsert",
        async ({ messages }) => {
            for (const message of messages) {
                await handleMessage(
                    message
                );
            }
        }
    );

    return sock;
}

// ============================================================
// 🚀 START
// ============================================================

async function start(options = {}) {
    if (started) {
        console.log(
            "⚠️ Stinger V6 is already running."
        );

        return sock;
    }

    config = {
        ...config,
        ...options
    };

    ensureDirectory(config.databaseDir);
    ensureDirectory(config.sessionsDir);
    ensureDirectory(config.tempDir);
    ensureDirectory(config.pluginsDir);

    loadPlugins();

    return connect();
}

// ============================================================
// 🛑 STOP
// ============================================================

async function stop() {
    stopping = true;

    try {
        if (sock) {
            updateSession(
                "stopping"
            );

            sock.end(
                new Error(
                    "Stinger V6 shutdown"
                )
            );

            sock = null;
        }

        started = false;

        console.log(
            "✓ Stinger V6 stopped."
        );

    } catch (error) {
        console.error(
            "Shutdown error:",
            error.message
        );
    }
}

// ============================================================
// 📡 PUBLIC API
// ============================================================

module.exports = {
    start,
    stop,
    connect,

    getSocket: () => sock,

    getBotInfo,

    getUptime,

    getUsers,

    saveUsers,

    getSettings,

    loadPlugins,

    reloadPlugins,

    getPlugins: () =>
        Object.fromEntries(
            pluginRegistry
        ),

    isConnected: () =>
        Boolean(sock?.user)
};
