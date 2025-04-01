const { Telegraf, Input } = require("telegraf");
const { exec } = require("child_process");
const { 
  checkFileSize,
  isValidUrl,
  getTitle,
  selectFormat } = require("./functions/check");
const {
  writeData,
  writeUsersInfo,
  getExistingVideo,
  adminPanel,
} = require("./functions/db");
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");
const { message } = require("telegraf/filters");
const { TOKEN,URL,ADMIN } = process.env;
const lang_keyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        {
          text: "🇺🇸 English",
          callback_data: "set_lang_en",
        },
        {
          text: "🇹🇷 Turkçe",
          callback_data: "set_lang_tr",
        },
        {
          text: "🇷🇺 Russian",
          callback_data: "set_lang_ru"
        }
      ],
    ],
  },
};
const translations = {
  en: yaml.load(fs.readFileSync("./locales/en.yaml", "utf8")),
  tr: yaml.load(fs.readFileSync("./locales/tr.yaml", "utf8")),
  ru: yaml.load(fs.readFileSync("./locales/ru.yaml", "utf8")),
};
// default lang
let userLanguage = "en";
const t = (key) => translations[userLanguage][key] || key;

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
    ctx.reply(t("startText"),lang_keyboard);
  } catch (err) {
    console.error("Error handling user:", err);
  }
});

bot.help((ctx) => {
  ctx.reply(t("helpText"));
});
bot.command("admin", async (ctx) => {
  const chatId = ctx.from.id;

  if (chatId.toString() !== ADMIN) {
    return ctx.reply(t("notAuthorized"));
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

  await ctx.reply(t("adminWelcome"), keyboard);
});
let formatUrl;
bot.command("format", async (ctx) => {
    const msgText = ctx.message.text.split(" ")[1]; 
    formatUrl = msgText;
    if (!msgText || !isValidUrl(msgText)) {
        return ctx.reply(t("notAValidUrl")); 
    }

    try {
        const formats = await selectFormat(msgText); 

        if (!formats || formats.length === 0) {
            return ctx.reply(t("noFormatsAvailable"));
        }

        const inlineKeyboard = formats.map((format) => [
            {
                text: `${format.resolution} (${format.filesize || t("unknownSize")},${format.fps}fps)`,
                callback_data: `format_${format.id}`,
            },
        ]);

        await ctx.reply(t("chooseFormat"), {
            reply_markup: {
                inline_keyboard: inlineKeyboard,
            },
        });
    } catch (error) {
        console.error("Error fetching formats:", error);
        ctx.reply(t("errorFetchingFormats"));
    }
});

bot.on("callback_query",async(ctx)=>{
  const data = ctx.callbackQuery.data;
  
  //handle lang selection
  if(data.startsWith("set_lang_")){
    const lang = data.split("_")[2];
    userLanguage = lang;
    await ctx.reply(`${t("languageSetTo")}`);
    return;
  }

  //handle admin actions
  const chatId = ctx.from.id;
  if (chatId.toString() !== ADMIN) {
    return ctx.reply(t("notAuthorized"));
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
    return;
  }


  //handle format selection
  if(data.startsWith("format_")){
    const formatId = data.split("_")[1];
    const chatId = ctx.from.id;
    try {
      const process = await ctx.reply("⌛️");
      const downloadPath = `downloads/${chatId}_${formatId}`;

      exec(
        `yt-dlp -f ${formatId}+ba -o "${downloadPath}.%(ext)s" ${formatUrl}`,
        async (err, stdout, stderr) => {
          if (err) {
            console.error("Error downloading video:", err);
            ctx.reply(t("errorDownloading"));
            return;
          }

          try {
            const files = fs.readdirSync("downloads");
            const videoFile = files.find((file) => file.startsWith(`${chatId}_${formatId}`));

            if (!videoFile) {
              ctx.reply(t("errFileNotFound"));
              return;
            }

            const fullPath = path.join(__dirname, "downloads", videoFile);
            const videoInput = Input.fromLocalFile(fullPath);
            const sendV = await ctx.replyWithVideo(videoInput, {
              caption: t("videoSent"),
              reply_to_message_id: ctx.callbackQuery.message.message_id,
            });

            fs.unlinkSync(fullPath);
            await ctx.deleteMessage(process.message_id);
          } catch (error) {
            console.error("Error sending video:", error);
            ctx.reply(t("errorSending"));
          }
        }
      );
    } catch (error) {
      console.error("Error processing format selection:", error);
      ctx.reply(t("errorProcessing"));
    }
    return;

  }
})

bot.on(message, async (ctx) => {
  const chatId = ctx.from.id;
  const msgText = ctx.message.text;
  if (msgText?.startsWith("/")) return;
  if (!isValidUrl(msgText)) {
    ctx.reply(t("sendLink"), {});
  }
  if (msgText && isValidUrl(msgText)) {
    try {
      const existingFile = await getExistingVideo(msgText);
      if (existingFile) {
        await ctx.replyWithVideo(existingFile.fileid, {
          caption: `${existingFile.title}\n${t("captionMsg")}`,
          reply_to_message_id: ctx.message.message_id,
        });
        return;
      }
      const { filesize, fileId } = await checkFileSize(msgText);
      console.log(`filesize: ${filesize},id:${fileId}`);
      if (filesize > MAX_SIZE) {
        ctx.reply(t("videoTooLarge"));
        return;
      }
      const process = await ctx.reply("⌛️");
      const downloadPath = `downloads/${fileId}`;
      //yt-dlp process execution
      exec(
        `yt-dlp -o "${downloadPath}.%(ext)s" ${msgText}`,
        async (err, stdout, stderr) => {
          if (err) {
            ctx.reply(t("errorDownloading"));
            return;
          }

          try {
            const files = fs.readdirSync("downloads");
            const videoFile = files.find((file) => file.startsWith(fileId));

            if (!videoFile) {
              ctx.reply(t("errFileNotFound"));
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
              caption: `${title}\n${t("captionMsg")}`,
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
            ctx.reply(t("errorSending"));
            console.error("Send video error:", error);
          }
        }
      );
    } catch (error) {
      ctx.reply(t("errorProcessing"), {
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
