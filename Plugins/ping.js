// ============================================================
// 🐝 STINGER V6 — PING PLUGIN
// ⚡ Fast latency + uptime checker
// ============================================================

"use strict";

module.exports = {
    name: "ping",
    command: "ping",
    description: "Check bot response speed and uptime",
    category: "General",
    usage: ".ping",

    async execute({ sock, msg, from }) {
        const start = Date.now();

        // Send initial response
        const sent = await sock.sendMessage(from, {
            text: "🏓 Checking STINGER V6..."
        });

        const latency = Date.now() - start;

        const uptimeSeconds = process.uptime();

        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = Math.floor(uptimeSeconds % 60);

        const uptime =
            `${days}d ${hours}h ${minutes}m ${seconds}s`;

        const text = `
╭━━━〔 🐝 𝐒𝐓𝐈𝐍𝐆𝐄𝐑 𝐕𝟔 🐝 〕━━━╮
┃
┃  🏓 𝐏𝐎𝐍𝐆!
┃
┃  ⚡ 𝐋𝐚𝐭𝐞𝐧𝐜𝐲 : ${latency}ms
┃  ⏱️ 𝐔𝐩𝐭𝐢𝐦𝐞  : ${uptime}
┃  🟢 𝐒𝐭𝐚𝐭𝐮𝐬  : ONLINE
┃
┃  🧩 𝐌𝐨𝐝𝐞    : PLUGIN
┃  🚀 𝐄𝐧𝐠𝐢𝐧𝐞  : NODE.JS
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯
        `.trim();

        await sock.sendMessage(
            from,
            { text },
            { quoted: sent }
        );
    }
};
