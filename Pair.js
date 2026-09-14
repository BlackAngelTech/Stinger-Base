// ============================================================
// 🐝 STINGER V6 — WEBPAIR CONTROLLER
// ============================================================
// Developer : Alpha
// Country   : Zimbabwe 🇿🇼
// Version   : 6.0.0
// ============================================================

"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const ROOT_DIR = __dirname;

const SESSIONS_DIR =
    path.join(ROOT_DIR, "sessions");

const DATABASE_DIR =
    path.join(ROOT_DIR, "database");

const PAIR_TIMEOUT = 120000;

const logger = pino({
    level: process.env.LOG_LEVEL || "silent"
});

// ============================================================
// 📁 INITIALIZE DIRECTORIES
// ============================================================

function ensureDirectory(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }
}

ensureDirectory(SESSIONS_DIR);
ensureDirectory(DATABASE_DIR);

// ============================================================
// 📊 PAIRING STATE
// ============================================================

const pairingRequests = new Map();

// ============================================================
// 🔢 PHONE NUMBER NORMALIZER
// ============================================================

function normalizeNumber(number) {
    return String(number || "")
        .replace(/[^\d]/g, "")
        .replace(/^00/, "");
}

// ============================================================
// 🛡️ BASIC VALIDATION
// ============================================================

function validNumber(number) {
    return (
        /^\d{8,15}$/.test(number)
    );
}

// ============================================================
// 📂 SESSION PATH
// ============================================================

function getSessionPath(number) {
    return path.join(
        SESSIONS_DIR,
        `pair_${number}`
    );
}

// ============================================================
// 🧹 REMOVE SESSION
// ============================================================

function removeSession(number) {
    const sessionPath =
        getSessionPath(number);

    if (!fs.existsSync(sessionPath)) {
        return;
    }

    try {
        fs.rmSync(sessionPath, {
            recursive: true,
            force: true
        });

    } catch (error) {
        console.error(
            "Session cleanup error:",
            error.message
        );
    }
}

// ============================================================
// 🔐 GENERATE PAIRING CODE
// ============================================================

async function generatePairingCode(number) {
    number = normalizeNumber(number);

    if (!validNumber(number)) {
        throw new Error(
            "Enter a valid international phone number."
        );
    }

    if (
        pairingRequests.has(number)
    ) {
        throw new Error(
            "A pairing request is already active for this number."
        );
    }

    const sessionPath =
        getSessionPath(number);

    ensureDirectory(sessionPath);

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(
        sessionPath
    );

    let version;

    try {
        const latest =
            await fetchLatestBaileysVersion();

        version = latest.version;

    } catch {
        version = undefined;
    }

    const socket =
        makeWASocket({
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
            ]
        });

    const request = {
        number,
        socket,
        createdAt: Date.now(),
        status: "initializing",
        code: null
    };

    pairingRequests.set(
        number,
        request
    );

    socket.ev.on(
        "creds.update",
        saveCreds
    );

    // --------------------------------------------------------
    // 🔢 REQUEST PAIRING CODE
    // --------------------------------------------------------

    try {
        if (
            !state.creds.registered
        ) {
            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        1500
                    )
            );

            const code =
                await socket.requestPairingCode(
                    number
                );

            request.code = code;
            request.status = "waiting";
        } else {
            request.status =
                "already_registered";
        }

    } catch (error) {
        pairingRequests.delete(number);

        try {
            socket.end(
                new Error(
                    "Pairing failed"
                )
            );
        } catch {}

        throw error;
    }

    // --------------------------------------------------------
    // 📡 CONNECTION EVENTS
    // --------------------------------------------------------

    socket.ev.on(
        "connection.update",
        update => {
            const {
                connection,
                lastDisconnect
            } = update;

            const current =
                pairingRequests.get(
                    number
                );

            if (!current) {
                return;
            }

            if (connection === "open") {
                current.status =
                    "connected";

                current.connectedAt =
                    Date.now();

                console.log(
                    `🟢 Paired: ${number}`
                );

                // Keep the authenticated
                // session on disk.
                setTimeout(() => {
                    pairingRequests.delete(
                        number
                    );
                }, 5000);
            }

            if (
                connection === "close"
            ) {
                const code =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode;

                if (
                    code ===
                    DisconnectReason.loggedOut
                ) {
                    current.status =
                        "logged_out";
                } else {
                    current.status =
                        "disconnected";
                }
            }
        }
    );

    // --------------------------------------------------------
    // ⏱️ AUTOMATIC REQUEST EXPIRATION
    // --------------------------------------------------------

    setTimeout(() => {
        const current =
            pairingRequests.get(
                number
            );

        if (
            current &&
            current.status !==
                "connected"
        ) {
            pairingRequests.delete(
                number
            );

            try {
                socket.end(
                    new Error(
                        "Pairing request expired"
                    )
                );
            } catch {}

            removeSession(number);

            console.log(
                `⌛ Pairing expired: ${number}`
            );
        }
    }, PAIR_TIMEOUT);

    return {
        number,
        code: request.code,
        status: request.status
    };
}

// ============================================================
// 📊 REQUEST STATUS
// ============================================================

function getPairingStatus(number) {
    number = normalizeNumber(number);

    const request =
        pairingRequests.get(number);

    if (!request) {
        return {
            exists: false,
            number,
            status: "not_found"
        };
    }

    return {
        exists: true,
        number,
        status: request.status,
        code: request.code,
        createdAt: request.createdAt,
        connectedAt:
            request.connectedAt || null
    };
}

// ============================================================
// 🧹 CANCEL PAIRING
// ============================================================

function cancelPairing(number) {
    number = normalizeNumber(number);

    const request =
        pairingRequests.get(number);

    if (!request) {
        return false;
    }

    try {
        request.socket.end(
            new Error(
                "Pairing cancelled"
            )
        );
    } catch {}

    pairingRequests.delete(
        number
    );

    removeSession(number);

    return true;
}

// ============================================================
// 🌐 EXPRESS ROUTES
// ============================================================

function createPairRouter() {
    const router =
        express.Router();

    // --------------------------------------------------------
    // 🔢 GENERATE CODE
    // --------------------------------------------------------

    router.post(
        "/pair",
        async (req, res) => {
            try {
                const number =
                    normalizeNumber(
                        req.body?.number
                    );

                if (
                    !validNumber(number)
                ) {
                    return res.status(400)
                        .json({
                            success: false,
                            error:
                                "Invalid phone number."
                        });
                }

                const result =
                    await generatePairingCode(
                        number
                    );

                return res.json({
                    success: true,
                    ...result
                });

            } catch (error) {
                console.error(
                    "Pair API error:",
                    error.message
                );

                return res.status(500)
                    .json({
                        success: false,
                        error:
                            error.message
                    });
            }
        }
    );

    // --------------------------------------------------------
    // 📊 STATUS
    // --------------------------------------------------------

    router.get(
        "/pair/status/:number",
        (req, res) => {
            const status =
                getPairingStatus(
                    req.params.number
                );

            res.json(status);
        }
    );

    // --------------------------------------------------------
    // ❌ CANCEL
    // --------------------------------------------------------

    router.post(
        "/pair/cancel",
        (req, res) => {
            const number =
                normalizeNumber(
                    req.body?.number
                );

            const cancelled =
                cancelPairing(number);

            res.json({
                success: cancelled
            });
        }
    );

    // --------------------------------------------------------
    // ❤️ HEALTH
    // --------------------------------------------------------

    router.get(
        "/pair/health",
        (req, res) => {
            res.json({
                status: "online",
                service: "STINGER V6 WEBPAIR",
                activeRequests:
                    pairingRequests.size,
                timestamp:
                    new Date().toISOString()
            });
        }
    );

    return router;
}

// ============================================================
// 📡 PUBLIC API
// ============================================================

module.exports = {
    generatePairingCode,
    getPairingStatus,
    cancelPairing,
    createPairRouter,

    getActivePairings: () =>
        Array.from(
            pairingRequests.values()
        ).map(request => ({
            number: request.number,
            status: request.status,
            createdAt: request.createdAt,
            connectedAt:
                request.connectedAt || null
        }))
};
