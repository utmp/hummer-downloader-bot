const { Telegraf, Input } = require("telegraf");
const { exec } = require("child_process");
const { checkFileSize, isValidUrl, getTitle } = require("./functions/check");
const {
  writeData,
  writeUsersInfo,
  getExistingVideo,
  adminPanel,
} = require("./functions/db");
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { message } = require("telegraf/filters");
const { TOKEN,URL,ADMIN } = process.env;
const startText = `
*🎥 Hummer Video Downloader*
Send me any video link from supported platforms and I'll download it for you!

*Supported Platforms:*
• YouTube
• Instagram
• TikTok
• Twitter
• Facebook
... and [more](https://raw.githubusercontent.com/yt-dlp/yt-dlp/refs/heads/master/supportedsites.md)

*Commands:*
/start - Start the bot
/help - Show this help message

*Usage:*
1. Just send me a video link
2. Wait for the download
3. Get your video!

*Note:* Maximum file size is 2GB
`;
const bot = new Telegraf(TOKEN, {
  telegram: {
    apiRoot: URL,
  },
});
const MAX_SIZE = 2000 * 1024 * 1024; // replace 2000 (2GiB) <-> 50(MiB) if bot works with polling;
const datetime = new Date().toISOString();

bot.start(async (ctx) => {
  const chatId = ctx.from.id;
  const chatInfo = await ctx.telegram.getChat(chatId);
  const {
    username = null,
    first_name: firstname = null,
    last_name: lastname = null,
    bio = null,
    birthdate,
  } = chatInfo || {};

  try {
    const birthdateNumber = birthdate
      ? parseInt(
          `${birthdate.year}${String(birthdate.month).padStart(2, "0")}${String(
            birthdate.day
          ).padStart(2, "0")}`
        )
      : null;
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
    ctx.reply(startText,{
      parse_mode:'Markdown'
    });
  } catch (err) {
    console.error("Error handling user:", err);
  }
});

bot.help((ctx) => {
  ctx.reply(startText, {
    parse_mode:'Markdown',
    reply_to_message_id: ctx.message.message_id,
  });
});
bot.command("admin", async (ctx) => {
  const chatId = ctx.from.id;

  if (chatId.toString() !== ADMIN) {
    return ctx.reply("You are not authorized to use this command.");
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📊 Send me statistics",
            callback_data: "get_stats",
          },
          {
            text: "🗄 Send me database file",
            callback_data: "send_dbFile",
          },
        ],
      ],
    },
  };

  await ctx.reply("Welcome admin, what do you want?", keyboard);
});

// Handle callback queries
bot.on("callback_query", async (ctx) => {
  const chatId = ctx.from.id;
  const data = ctx.callbackQuery.data;

  if (chatId.toString() !== ADMIN) {
    return ctx.reply("🚫Not authorized");
  }

  if (data === "get_stats") {
    try {
      const stats = await adminPanel();
      await ctx.reply(
        `📊 *Admin Statistics*\n\n` +
          `👥 Total Users: *${stats.totalUsers}*\n` +
          `📥 Total Size: *${(stats.totalFileSize / 1048576).toFixed(
            2
          )} MiB*\n` +
          `✅ Total Downloads: *${stats.totalFileNumber}*`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Admin stats error:", error);
      await ctx.reply("Error fetching statistics");
      await ctx.answerCallbackQuery("Error");
    }
  }
  if (data === "send_dbFile") {
    // telegram can't send .db files I will touch it later
    // ctx.replyWithDocument(
    //     Input.fromReadableStream(fs.createReadStream("./functions/data.db"))
    // )
  }
});

bot.on(message, async (ctx) => {
  const chatId = ctx.from.id;
  const msgText = ctx.message.text;
  if (msgText?.startsWith("/")) return;
  if (!isValidUrl(msgText)) {
    ctx.reply("send me a link", {});
  }
  if (msgText && isValidUrl(msgText)) {
    try {
      const existingFile = await getExistingVideo(msgText);
      if (existingFile) {
        await ctx.replyWithVideo(existingFile.fileid, {
          caption: `${existingFile.title}\n✅Downloaded via @HummerDownloaderBot`,
          reply_to_message_id: ctx.message.message_id,
        });
        return;
      }
      const { filesize, fileId } = await checkFileSize(msgText);

      if (filesize > MAX_SIZE) {
        ctx.reply("Video is too large (over 2GiB). Cannot download.");
        return;
      }
      const process = await ctx.reply("⌛️");
      const downloadPath = `downloads/${fileId}`;
      //yt-dlp process execution
      exec(
        `yt-dlp -o "${downloadPath}.%(ext)s" ${msgText}`,
        async (err, stdout, stderr) => {
          if (err) {
            ctx.reply("Error downloading video");
            return;
          }

          try {
            const files = fs.readdirSync("downloads");
            const videoFile = files.find((file) => file.startsWith(fileId));

            if (!videoFile) {
              ctx.reply("Error: Downloaded file not found");
              return;
            }

            const fullPath = path.join(__dirname, "downloads", videoFile);
            let title = "";
            await getTitle(msgText).then((res, rej) => {
              if (rej) {
                console.log(rej);
              }
              title = res;
            });
            const videoInput = Input.fromLocalFile(fullPath);
            const sendV = await ctx.replyWithVideo(videoInput, {
              caption: `${title}\n✅Downloaded via @HummerDownloaderBot`,
              reply_to_message_id: ctx.message.message_id,
            });
            const file_id = sendV.video?.file_id || sendV.document?.file_id;
            const file_size =  sendV.video?.file_size || sendV.document?.file_size;

            // Write data to database
            await writeData(
              datetime,
              file_size,
              fullPath,
              file_id,
              chatId,
              msgText,
              title
            );
            fs.unlinkSync(fullPath);
            await ctx.deleteMessage(process.message_id);
          } catch (error) {
            ctx.reply("Error sending video");
            console.error("Send video error:", error);
          }
        }
      );
    } catch (error) {
      ctx.reply("Error processing your request. Try later", {
        reply_to_message_id: ctx.message.message_id,
      });
    }
  }
});

bot.launch({
  dropPendingUpdates:true,
});
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
