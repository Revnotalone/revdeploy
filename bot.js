const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const express = require('express');

// Konfigurasi Bot - Gunakan Environment Variables
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || 'YOUR_VERCEL_TOKEN';
const PORT = process.env.PORT || 3000;

// Inisialisasi bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Storage untuk session user
const userSessions = new Map();

// Fungsi untuk membuat keyboard menu utama
function getMainKeyboard() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '🌐 Create Website' }],
                [{ text: '📋 My Websites' }, { text: '❓ Help' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
}

// GANTI FUNGSI LAMA DENGAN YANG INI
async function deployToVercel(htmlContent, projectName, userId) {
    try {
        const cleanProjectName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

        const files = [
            {
                file: 'index.html',
                data: htmlContent
            },
            {
                file: 'vercel.json',
                data: JSON.stringify({
                    "rewrites": [
                        { "source": "/(.*)", "destination": "/index.html" }
                    ]
                })
            }
        ];

        const deploymentData = {
            name: cleanProjectName,
            files: files,
            projectSettings: {
                framework: null
            },
            target: 'production'
        };

        const deployResponse = await axios.post('https://api.vercel.com/v13/deployments', deploymentData, {
            headers: {
                'Authorization': `Bearer ${VERCEL_TOKEN}`,
                'Content-Type': 'application/json'
            },
            // Params yang disederhanakan. Cukup forceNew.
            params: {
                forceNew: '1'
            }
        });

        if (!deployResponse.data || !deployResponse.data.url) {
            throw new Error('Deployment failed: No URL returned from Vercel.');
        }

        const finalUrl = `https://${deployResponse.data.url}`;
        const deploymentId = deployResponse.data.uid;

        const userWebsites = userSessions.get(`websites_${userId}`) || [];
        userWebsites.push({
            name: cleanProjectName,
            url: finalUrl,
            deployedAt: new Date().toISOString(),
            deploymentId: deploymentId
        });
        userSessions.set(`websites_${userId}`, userWebsites);

        return {
            success: true,
            url: finalUrl,
            deploymentId: deploymentId,
            isCleanUrl: true
        };

    } catch (error) {
        console.error('Vercel deployment error:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.error?.message || 'Unknown error occurred.';
        if (errorMessage.includes('is a reserved name') || errorMessage.includes('is already owned')) {
            return { success: false, error: `Nama project "${projectName}" sudah digunakan atau terlarang. Silakan pilih nama lain.` };
        }
        return { success: false, error: errorMessage };
    }
}


// Handler untuk command /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `
🎉 *Selamat datang di Vercel Deploy Bot!*

Bot ini membantu Anda deploy file HTML ke Vercel secara GRATIS dan instant!

📋 *Fitur yang tersedia:*
• 🌐 Deploy HTML ke Vercel
• 📱 URL siap pakai
• 🚀 Deploy dalam hitungan detik
• 💰 Gratis selamanya

Pilih menu di bawah untuk memulai:
    `;

    bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// Handler untuk menu Create Website
bot.onText(/🌐 Create Website/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    userSessions.set(`step_${userId}`, 'waiting_name');

    bot.sendMessage(chatId, `
🌐 *Mari buat website baru!*

Langkah 1: Masukkan nama untuk website Anda
(contoh: portofolio-saya, toko-online-keren)

⚠️ *Catatan:* Nama hanya boleh menggunakan huruf, angka, dan tanda hubung (-)
    `, {
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: [
                [{ text: '❌ Cancel' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });
});

// Handler untuk My Websites
bot.onText(/📋 My Websites/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userWebsites = userSessions.get(`websites_${userId}`) || [];

    if (userWebsites.length === 0) {
        bot.sendMessage(chatId, `
📋 *Website Saya*

Anda belum memiliki website yang di-deploy.
Klik "🌐 Create Website" untuk memulai!
        `, {
            parse_mode: 'Markdown',
            ...getMainKeyboard()
        });
        return;
    }

    let message = '📋 *Website Saya*\n\n';
    userWebsites.forEach((site, index) => {
        message += `${index + 1}. *${site.name}*\n`;
        message += `   🔗 ${site.url}\n`;
        message += `   📅 ${new Date(site.deployedAt).toLocaleDateString('id-ID')}\n\n`;
    });

    bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// Handler untuk Help
bot.onText(/❓ Help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
❓ *Bantuan - Cara Menggunakan Bot*

*🚀 Langkah-langkah Deploy:*
1. Klik "🌐 Create Website"
2. Masukkan nama website yang unik
3. Upload file HTML Anda
4. Bot akan otomatis deploy ke Vercel
5. Dapatkan URL website Anda!

*📝 Format File HTML:*
• File harus berformat .html
• Ukuran maksimal 10MB
• Pastikan HTML valid

*🔧 Troubleshooting:*
• Jika gagal, kemungkinan besar nama website sudah dipakai orang lain. Coba nama yang lebih unik.
• Cek kembali format file HTML Anda.

Butuh bantuan lebih lanjut? Hubungi admin!
    `;

    bot.sendMessage(chatId, helpMessage, {
        parse_mode: 'Markdown',
        ...getMainKeyboard()
    });
});

// Handler untuk Cancel
bot.onText(/❌ Cancel/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    userSessions.delete(`step_${userId}`);
    userSessions.delete(`name_${userId}`);

    bot.sendMessage(chatId, '❌ Proses dibatalkan. Silakan pilih menu lain.', getMainKeyboard());
});

// Handler untuk pesan text (untuk nama website)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userStep = userSessions.get(`step_${userId}`);

    if (!msg.text || msg.text.startsWith('/') ||
        ['🌐 Create Website', '📋 My Websites', '❓ Help', '❌ Cancel'].includes(msg.text)) {
        return;
    }

    if (userStep === 'waiting_name') {
        const projectName = msg.text.trim();

        if (!/^[a-zA-Z0-9-]+$/.test(projectName)) {
            bot.sendMessage(chatId, `
❌ *Nama tidak valid!*

Nama website hanya boleh menggunakan:
• Huruf (a-z, A-Z)
• Angka (0-9)
• Tanda hubung (-)

Silakan masukkan nama yang valid:
            `, { parse_mode: 'Markdown' });
            return;
        }

        if (projectName.length < 3 || projectName.length > 50) {
            bot.sendMessage(chatId, `
❌ *Panjang nama tidak valid!*

Nama website harus:
• Minimal 3 karakter
• Maksimal 50 karakter

Silakan masukkan nama yang valid:
            `, { parse_mode: 'Markdown' });
            return;
        }

        userSessions.set(`name_${userId}`, projectName);
        userSessions.set(`step_${userId}`, 'waiting_html');

        bot.sendMessage(chatId, `
✅ Nama website: *${projectName}*

Langkah 2: Upload file HTML Anda
📎 Klik ikon attachment dan pilih file HTML Anda.
        `, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: '❌ Cancel' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    }
});

// Handler untuk file document (HTML)
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userStep = userSessions.get(`step_${userId}`);

    if (userStep !== 'waiting_html') {
        return;
    }

    const document = msg.document;

    if (!document.file_name.endsWith('.html')) {
        bot.sendMessage(chatId, '❌ File harus berformat .html! Silakan upload file HTML yang valid.');
        return;
    }

    if (document.file_size > 10 * 1024 * 1024) { // 10MB
        bot.sendMessage(chatId, '❌ Ukuran file terlalu besar! Maksimal 10MB.');
        return;
    }

    const loadingMsg = await bot.sendMessage(chatId, '⏳ Memproses file dan menyiapkan deployment...');

    try {
        const fileLink = await bot.getFileLink(document.file_id);
        const fileResponse = await axios.get(fileLink, { responseType: 'text' });
        const htmlContent = fileResponse.data;

        await bot.editMessageText('🚀 Melakukan deployment ke Vercel... Ini mungkin butuh beberapa detik.', {
            chat_id: chatId,
            message_id: loadingMsg.message_id
        });

        const projectName = userSessions.get(`name_${userId}`);
        const deployResult = await deployToVercel(htmlContent, projectName, userId);

        await bot.deleteMessage(chatId, loadingMsg.message_id);

        if (deployResult.success) {
            userSessions.delete(`step_${userId}`);
            userSessions.delete(`name_${userId}`);

            let successMessage = `
🎉 *Website berhasil di-deploy!*

📝 *Detail Website:*
• Nama: ${projectName}
• URL: ${deployResult.url}
• Status: ✅ Online

🔗 *Akses website Anda:*
${deployResult.url}

💡 Website Anda sudah bisa diakses oleh siapa saja di internet!
            `;

            bot.sendMessage(chatId, successMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '🌐 Buka Website',
                                url: deployResult.url
                            }
                        ]
                    ]
                }
            });

            setTimeout(() => {
                bot.sendMessage(chatId, 'Apa yang ingin Anda lakukan selanjutnya?', getMainKeyboard());
            }, 1000);

        } else {
            bot.sendMessage(chatId, `
❌ *Deploy gagal!*

*Pesan Error:* ${deployResult.error}

Silakan coba lagi dengan nama project yang berbeda atau periksa file HTML Anda.
            `, {
                parse_mode: 'Markdown',
                ...getMainKeyboard()
            });
        }

    } catch (error) {
        await bot.deleteMessage(chatId, loadingMsg.message_id);
        console.error('Error processing HTML file:', error);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan saat memproses file Anda. Pastikan file HTML valid dan coba lagi.`, getMainKeyboard());
    }
});

// Error handler
bot.on('polling_error', (error) => {
    console.log(`Polling error: ${error.code} - ${error.message}`);
});

// Simple HTTP server untuk hosting (misal: Railway, Heroku)
const app = express();

app.get('/', (req, res) => {
    res.send({
        status: 'Bot is running!',
        message: 'Vercel Deploy Bot is active.'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di port ${PORT}`);
    console.log('🤖 Bot Telegram berhasil dijalankan!');
    console.log('Pastikan BOT_TOKEN dan VERCEL_TOKEN sudah diatur di environment variables.');
});
