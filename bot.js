const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Konfigurasi Bot - Menggunakan Environment Variables untuk Railway
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

// Fungsi untuk deploy ke Vercel
async function deployToVercel(htmlContent, projectName, userId) {
    try {
        // Buat struktur file untuk Vercel
        const files = [
            {
                file: 'index.html',
                data: htmlContent
            },
            {
                file: 'vercel.json',
                data: JSON.stringify({
                    "builds": [
                        {
                            "src": "index.html",
                            "use": "@vercel/static"
                        }
                    ],
                    "routes": [
                        {
                            "src": "/(.*)",
                            "dest": "/index.html"
                        }
                    ]
                }, null, 2)
            }
        ];

        // Deploy ke Vercel menggunakan API
        const deploymentData = {
            name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            files: files,
            projectSettings: {
                framework: null
            }
        };

        const response = await axios.post('https://api.vercel.com/v13/deployments', deploymentData, {
            headers: {
                'Authorization': `Bearer ${VERCEL_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.url) {
            // Coba dapatkan URL yang lebih bersih jika tersedia
            let finalUrl = `https://${response.data.url}`;
            
            // Jika ada alias URL yang lebih bersih, gunakan itu
            if (response.data.alias && response.data.alias.length > 0) {
                finalUrl = `https://${response.data.alias[0]}`;
            }
            
            // Simpan info website user
            const userWebsites = userSessions.get(`websites_${userId}`) || [];
            userWebsites.push({
                name: cleanProjectName,
                url: finalUrl,
                deployedAt: new Date().toISOString(),
                deploymentId: response.data.uid
            });
            userSessions.set(`websites_${userId}`, userWebsites);

            return {
                success: true,
                url: finalUrl,
                deploymentId: response.data.uid
            };
        } else {
            throw new Error('Deployment failed: No URL returned');
        }
    } catch (error) {
        console.error('Vercel deployment error:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.error?.message || error.message
        };
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

    // Set session untuk user
    userSessions.set(`step_${userId}`, 'waiting_name');

    bot.sendMessage(chatId, `
🌐 *Mari buat website baru!*

Langkah 1: Masukkan nama untuk website Anda
(contoh: my-portfolio, company-landing, etc.)

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
2. Masukkan nama website
3. Upload file HTML Anda
4. Bot akan otomatis deploy ke Vercel
5. Dapatkan URL website Anda!

*📝 Format File HTML:*
• File harus berformat .html
• Ukuran maksimal 10MB
• Pastikan HTML valid

*🔧 Troubleshooting:*
• Jika gagal deploy, cek format HTML
• Nama website harus unik
• Koneksi internet harus stabil

*💡 Tips:*
• Gunakan nama yang mudah diingat
• Test HTML di browser dulu sebelum upload
• Simpan URL website untuk akses nanti

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

    // Clear session
    userSessions.delete(`step_${userId}`);
    userSessions.delete(`name_${userId}`);

    bot.sendMessage(chatId, '❌ Proses dibatalkan. Silakan pilih menu lain.', getMainKeyboard());
});

// Handler untuk pesan text (untuk nama website)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userStep = userSessions.get(`step_${userId}`);

    // Skip jika bukan text atau sudah dihandle command lain
    if (!msg.text || msg.text.startsWith('/') || 
        ['🌐 Create Website', '📋 My Websites', '❓ Help', '❌ Cancel'].includes(msg.text)) {
        return;
    }

    if (userStep === 'waiting_name') {
        const projectName = msg.text.trim();
        
        // Validasi nama project
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

        // Simpan nama dan lanjut ke step berikutnya
        userSessions.set(`name_${userId}`, projectName);
        userSessions.set(`step_${userId}`, 'waiting_html');

        bot.sendMessage(chatId, `
✅ Nama website: *${projectName}*

Langkah 2: Upload file HTML Anda
📎 Klik attachment dan pilih file HTML

⚠️ *Persyaratan file:*
• Format: .html
• Ukuran max: 10MB
• HTML harus valid
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
    
    // Validasi file
    if (!document.file_name.endsWith('.html')) {
        bot.sendMessage(chatId, '❌ File harus berformat .html! Silakan upload file HTML yang valid.');
        return;
    }

    if (document.file_size > 10 * 1024 * 1024) { // 10MB
        bot.sendMessage(chatId, '❌ Ukuran file terlalu besar! Maksimal 10MB.');
        return;
    }

    try {
        // Kirim pesan loading
        const loadingMsg = await bot.sendMessage(chatId, '⏳ Sedang memproses file HTML...');

        // Download file dari Telegram
        const fileInfo = await bot.getFile(document.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;
        
        const fileResponse = await axios.get(fileUrl, { responseType: 'text' });
        const htmlContent = fileResponse.data;

        // Update loading message
        await bot.editMessageText('🚀 Sedang deploy ke Vercel...', {
            chat_id: chatId,
            message_id: loadingMsg.message_id
        });

        // Deploy ke Vercel
        const projectName = userSessions.get(`name_${userId}`);
        const deployResult = await deployToVercel(htmlContent, projectName, userId);

        // Delete loading message
        await bot.deleteMessage(chatId, loadingMsg.message_id);

        if (deployResult.success) {
            // Clear session
            userSessions.delete(`step_${userId}`);
            userSessions.delete(`name_${userId}`);

            // Kirim hasil sukses
            const successMessage = `
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

            // Kirim menu utama
            setTimeout(() => {
                bot.sendMessage(chatId, 'Pilih menu untuk aksi selanjutnya:', getMainKeyboard());
            }, 2000);

        } else {
            bot.sendMessage(chatId, `
❌ *Deploy gagal!*

Error: ${deployResult.error}

Silakan coba lagi atau hubungi admin jika masalah berlanjut.
            `, {
                parse_mode: 'Markdown',
                ...getMainKeyboard()
            });
        }

    } catch (error) {
        console.error('Error processing HTML file:', error);
        bot.sendMessage(chatId, `
❌ *Terjadi kesalahan saat memproses file!*

Kemungkinan penyebab:
• File HTML tidak valid
• Koneksi bermasalah
• Server sedang sibuk

Silakan coba lagi dalam beberapa menit.
        `, {
            parse_mode: 'Markdown',
            ...getMainKeyboard()
        });
    }
});

// Error handler
bot.on('polling_error', (error) => {
    console.log('Polling error:', error);
});

console.log('🤖 Telegram Vercel Deploy Bot started successfully!');
console.log('📝 Make sure to set your BOT_TOKEN and VERCEL_TOKEN in the configuration.');

// Simple HTTP server untuk Railway (untuk keep-alive)
const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.json({
        status: 'Bot is running!',
        bot_username: bot.options?.username || 'Unknown',
        uptime: process.uptime()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// Export untuk testing atau modular usage
module.exports = { bot, deployToVercel };
