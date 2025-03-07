const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const {checkFileSize,isValidUrl} = require('./functions/check');
const { writeData,writeUsersInfo,getExistingVideo } = require('./functions/db');
require('dotenv').config();
const path = require('path')
const fs = require('fs')
const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });
const MAX_SIZE = 50 * 1024 * 1024;
const datetime = new Date().toISOString();


bot.onText(/\/start/, async(msg) => {
    const chatId = msg.chat.id;
    const chatInfo = await bot.getChat(chatId);
    const {
        username = null,
        first_name: firstname = null,
        last_name: lastname = null,
        bio = null,
        birthdate,
    } = chatInfo || {};
    
    try {
        const birthdateNumber = birthdate ? 
            parseInt(`${birthdate.year}${String(birthdate.month).padStart(2, '0')}${String(birthdate.day).padStart(2, '0')}`) : 
            null;
            //save new user info to database    
        const isNewUser = await writeUsersInfo(
            datetime,
            chatId,
            username,
            firstname,
            lastname,
            birthdateNumber,
            bio
        );
        bot.sendMessage(chatId, isNewUser ? `Welcome ${username}`  : `Welcome back ${username}`);
    } catch (error) {
        console.error('Error handling user:', error);
        bot.sendMessage(chatId, 'Welcome! (I can\'t remember you)');
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    if (messageText?.startsWith('/')) return;

    if (messageText && isValidUrl(messageText)) {
        try {
            const existingFileId = await getExistingVideo(messageText);
            if (existingFileId) {
                await bot.sendVideo(chatId, existingFileId, {
                    caption: '✅Downloaded via @HummerDownloaderBot'
                });
                return;
            }

            const { filesize, fileId } = await checkFileSize(messageText);
            
            if (filesize > MAX_SIZE) {
                bot.sendMessage(chatId, 'Video is too large (over 50MiB). Cannot download.');
                return;
            }

            const process = await bot.sendMessage(chatId, '⌛️');

            const downloadPath = `downloads/${fileId}`;

            exec(`yt-dlp -o "${downloadPath}.%(ext)s" ${messageText}`, async (err, stdout, stderr) => {
                if (err) {
                    bot.sendMessage(chatId, 'Error downloading video');
                    return;
                }

                try {
                    const files = fs.readdirSync('downloads');
                    const videoFile = files.find(file => file.startsWith(fileId));
                    
                    if (!videoFile) {
                        bot.sendMessage(chatId, 'Error: Downloaded file not found');
                        return;
                    }

                    const fullPath = path.join(__dirname, 'downloads', videoFile);
                    const sendV = await bot.sendVideo(chatId, fullPath, {
                        caption: '✅Downloaded via @HummerDownloaderBot'
                    });
                    const file_id = sendV.video?.file_id || sendV.document?.file_id;
                    // Write data to database
                    await writeData(
                        datetime,
                        filesize,
                        fullPath,
                        file_id,
                        chatId,
                        messageText
                    );
                    fs.unlinkSync(fullPath);
                    bot.deleteMessage(chatId, process.message_id);
                } catch (error) {
                    bot.sendMessage(chatId, 'Error sending video');
                    console.error('Send video error:', error);
                }
            });
        } catch (error) {
            bot.sendMessage(chatId, 'Error processing your request');
            console.error('Processing error:', error);
        }
    }
});