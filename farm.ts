import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { GatewayDispatchEvents } from 'discord-api-types/v10';
import { HieuTool, TaskType } from './src/engine';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// ==================== BRAND ====================
const BOT_NAME = 'Mducdz';

// ==================== CONFIG ====================
const CONFIG_PATH = path.join(__dirname, 'config.json');

interface UserRecord {
  id: number; // Telegram user ID
  name: string;
  discordToken: string;
}

interface Config {
  telegramBotToken: string;
  users: UserRecord[];
}

function loadConfig(): Config {
  if (fs.existsSync(CONFIG_PATH)) {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    // Migrate format cũ
    if (!Array.isArray(raw.users)) {
      const users: UserRecord[] = [];
      if (raw.discordToken) {
        users.push({
          id: Array.isArray(raw.allowedUsers) && raw.allowedUsers[0] ? raw.allowedUsers[0] : 0,
          name: 'legacy',
          discordToken: raw.discordToken,
        });
      }
      return {
        telegramBotToken: raw.telegramBotToken || '',
        users,
      };
    }
    return {
      telegramBotToken: raw.telegramBotToken || '',
      users: raw.users,
    };
  }
  return {
    telegramBotToken: '',
    users: [],
  };
}

function saveConfig(cfg: Config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

let config = loadConfig();

function getDisplayName(ctx: Context): string {
  const first = ctx.from?.first_name || '';
  const last = ctx.from?.last_name || '';
  const username = ctx.from?.username ? `@${ctx.from.username}` : '';
  return [first, last].filter(Boolean).join(' ') || username || String(ctx.from?.id || '');
}

function getUserRecord(telegramId: number): UserRecord | undefined {
  return config.users.find((u) => u.id === telegramId);
}

function upsertUser(telegramId: number, name: string, discordToken?: string) {
  const existing = getUserRecord(telegramId);
  if (existing) {
    existing.name = name;
    if (discordToken !== undefined) existing.discordToken = discordToken;
  } else {
    config.users.push({
      id: telegramId,
      name,
      discordToken: discordToken || '',
    });
  }
  saveConfig(config);

  console.log('--- User ---');
  console.log(`Id user (Telegram): ${telegramId}`);
  console.log(`Tên: ${name}`);
  const rec = getUserRecord(telegramId);
  console.log(`Token discord: ${rec?.discordToken ? rec.discordToken.slice(0, 12) + '...' : '(trống)'}`);
}

function getDiscordTokenFor(ctx: Context): string {
  const id = ctx.from?.id;
  if (!id) return '';
  return getUserRecord(id)?.discordToken || '';
}

// ==================== STATE ====================
let isRunningByUser = new Map<number, boolean>();

type RunState = 'working' | 'done' | 'claimed' | 'skipped' | 'failed';

interface LiveQuest {
  id: string;
  label: string;
  reward: string;
  countdown: number;
  taskIcon: string;
  state: RunState;
}

function taskIcon(t: TaskType | null): string {
  switch (t) {
    case TaskType.WATCH_VIDEO:
    case TaskType.WATCH_VIDEO_ON_MOBILE:
      return '🎬';
    case TaskType.WATCH_STREAM:
      return '📹';
    case TaskType.PLAY_ON_DESKTOP:
      return '🎮';
    case TaskType.STREAM_ON_DESKTOP:
      return '📡';
    case TaskType.PLAY_ON_XBOX:
      return '🎯';
    case TaskType.PLAY_ON_PLAYSTATION:
      return '🎪';
    case TaskType.PLAY_ON_NINTENDO:
      return '🔴';
    case TaskType.PLAY_ON_MOBILE:
      return '📱';
    case TaskType.PLAY_ACTIVITY:
    case TaskType.PLAY_SOCIAL_GAME:
      return '🕹️';
    case TaskType.FOLLOW_SOCIAL:
      return '👥';
    case TaskType.SHARE_CONTENT:
      return '📤';
    case TaskType.JOIN_COMMUNITY:
      return '🏘️';
    case TaskType.COMPLETE_SURVEY:
      return '📋';
    case TaskType.MAKE_PURCHASE:
      return '💳';
    case TaskType.REDEEM_CODE:
      return '🎁';
    default:
      return '❓';
  }
}

function clock(sec: number): string {
  if (sec <= 0) return '● DONE';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function stateLabel(s: RunState): string {
  switch (s) {
    case 'working': return '⟳ RUNNING';
    case 'done': return '✔ DONE';
    case 'claimed': return '★ CLAIMED';
    case 'skipped': return '⊘ SKIP';
    case 'failed': return '✖ FAIL';
  }
}

// ==================== HTTP (Render + UptimeRobot) ====================
function startHttpServer() {
  const port = Number(process.env.PORT) || 3000;

  const server = http.createServer((req, res) => {
    const url = req.url || '/';

    // Health / keep-alive endpoints cho UptimeRobot
    if (url === '/' || url === '/health' || url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          bot: BOT_NAME,
          uptime: Math.floor(process.uptime()),
          users: config.users.length,
          time: new Date().toISOString(),
        }),
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`🌐 HTTP server: http://0.0.0.0:${port}  (/, /health, /ping)`);
  });

  return server;
}

// ==================== TELEGRAM BOT ====================
async function main() {
  // Ưu tiên env (Render) → rồi config.json → rồi hỏi terminal
  if (process.env.TELEGRAM_BOT_TOKEN) {
    config.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    saveConfig(config);
  }

  if (!config.telegramBotToken) {
    // Trên Render không có stdin → thoát rõ ràng
    if (process.env.RENDER || process.env.PORT) {
      console.error('❌ Thiếu TELEGRAM_BOT_TOKEN. Thêm Environment Variable trên Render.');
      process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════');
    console.log(`  🔮 ${BOT_NAME} Telegram — Setup lần đầu`);
    console.log('═══════════════════════════════════════════════════');
    console.log('');
    console.log('1. Tạo bot mới tại @BotFather trên Telegram');
    console.log('2. Copy Bot Token rồi dán vào đây:');
    console.log('');

    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const token = await new Promise<string>((resolve) => {
      rl.question('Telegram Bot Token: ', (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });

    if (!token) {
      console.error('❌ Token không hợp lệ. Thoát.');
      process.exit(1);
    }

    config.telegramBotToken = token;
    saveConfig(config);
    console.log('✅ Đã lưu Telegram Bot Token vào config.json\n');
  }

  // HTTP server cho Render free tier + UptimeRobot ping
  startHttpServer();

  const bot = new Telegraf(config.telegramBotToken, {
    handlerTimeout: 600_000,
  });

  bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply(`❌ Lỗi: ${(err as any)?.message || err}`).catch(() => {});
  });

  // ---------- /start ----------
  bot.start(async (ctx) => {
    if (ctx.from?.id) {
      upsertUser(ctx.from.id, getDisplayName(ctx));
    }

    const discordToken = getDiscordTokenFor(ctx);
    const hasDiscordToken = Boolean(discordToken);

    const text = [
      `🔮 *${BOT_NAME} — Discord Quest Auto*`,
      '',
      hasDiscordToken
        ? '✅ Discord Token của bạn đã được lưu.'
        : '⚠️ Bạn chưa có Discord Token. Gửi: /token <token>',
      '',
      '*Các lệnh:*',
      '/token `<discord_token>` — Lưu Discord User Token (riêng từng người)',
      '/run — Chạy auto farm quests',
      '/status — Xem trạng thái hiện tại',
      '/orbs — Kiểm tra số Orbs',
      '/clear — Xóa Discord Token của bạn',
      '/help — Hướng dẫn',
    ].join('\n');

    await ctx.replyWithMarkdown(text);
  });

  // ---------- /help ----------
  bot.command('help', async (ctx) => {
    await ctx.replyWithMarkdown([
      '📖 *Hướng dẫn sử dụng*',
      '',
      '1. Lấy Discord User Token (DevTools → Network → Authorization)',
      '2. Gửi: `/token your_token_here`',
      '3. Gửi: `/run` để bắt đầu auto farm',
      '',
      'Mỗi người dùng Telegram có Discord Token riêng — không dùng nhầm token của người khác.',
      '',
      '⚠️ *Cảnh báo*: Dùng user token có rủi ro bị ban theo ToS Discord.',
    ].join('\n'));
  });

  // ---------- /token ----------
  bot.command('token', async (ctx) => {
    const args = ctx.message.text.split(/\s+/).slice(1);
    const token = args.join(' ').trim();

    if (!token) {
      await ctx.reply('Cú pháp: `/token <discord_user_token>`\n\nVí dụ:\n`/token MTIzNDU2Nzg5...`', {
        parse_mode: 'Markdown',
      });
      return;
    }

    try {
      await ctx.deleteMessage();
    } catch {}

    if (ctx.from?.id) {
      upsertUser(ctx.from.id, getDisplayName(ctx), token);
    }

    await ctx.reply('✅ Đã lưu Discord Token của bạn!\n\nGửi /run để bắt đầu farm quests.');
  });

  // ---------- /clear ----------
  bot.command('clear', async (ctx) => {
    if (ctx.from?.id) {
      const rec = getUserRecord(ctx.from.id);
      if (rec) {
        rec.discordToken = '';
        saveConfig(config);
      }
    }
    await ctx.reply('🗑️ Đã xóa Discord Token của bạn.');
  });

  // ---------- /orbs ----------
  bot.command('orbs', async (ctx) => {
    const discordToken = getDiscordTokenFor(ctx);
    if (!discordToken) {
      await ctx.reply('⚠️ Bạn chưa có Discord Token. Dùng /token trước.');
      return;
    }

    const msg = await ctx.reply('⏳ Đang lấy số Orbs...');
    try {
      const app = new HieuTool(discordToken);
      const bal = await app.getBalance();
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        msg.message_id,
        undefined,
        `🔮 *Số Orbs hiện tại:* \`${bal.balance}\``,
        { parse_mode: 'Markdown' },
      );
    } catch (e: any) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        msg.message_id,
        undefined,
        `❌ Lỗi: ${e?.message || 'Không lấy được balance'}`,
      );
    }
  });

  // ---------- /status ----------
  bot.command('status', async (ctx) => {
    const uid = ctx.from?.id;
    if (uid && isRunningByUser.get(uid)) {
      await ctx.reply('🟢 Bạn đang chạy farm quests...');
    } else {
      await ctx.reply('⚪ Bạn đang rảnh. Gửi /run để bắt đầu.');
    }
  });

  // ---------- /run ----------
  bot.command('run', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;

    const discordToken = getDiscordTokenFor(ctx);
    if (!discordToken) {
      await ctx.reply('⚠️ Bạn chưa có Discord Token.\nGửi: `/token <your_discord_token>`', {
        parse_mode: 'Markdown',
      });
      return;
    }

    if (isRunningByUser.get(uid)) {
      await ctx.reply('⚠️ Bạn đang có phiên farm chạy. Vui lòng đợi kết thúc.');
      return;
    }

    const statusMsg = await ctx.reply('🚀 Đang kết nối Discord & tải quests...');
    isRunningByUser.set(uid, true);

    runFarm(ctx, statusMsg.message_id, discordToken)
      .catch(async (e: any) => {
        console.error('Farm error:', e);
        try {
          await ctx.telegram.editMessageText(
            ctx.chat!.id,
            statusMsg.message_id,
            undefined,
            `❌ Lỗi: ${e?.message || e}`,
          );
        } catch {}
      })
      .finally(() => {
        isRunningByUser.set(uid, false);
      });
  });

  // ---------- text fallback ----------
  bot.on(message('text'), async (ctx) => {
    const text = ctx.message.text.trim();
    if (!getDiscordTokenFor(ctx) && text.length > 50 && !text.startsWith('/')) {
      try {
        await ctx.deleteMessage();
      } catch {}
      if (ctx.from?.id) {
        upsertUser(ctx.from.id, getDisplayName(ctx), text);
      }
      await ctx.reply('✅ Đã nhận và lưu Discord Token của bạn!\nGửi /run để bắt đầu.');
    }
  });

  console.log(`🤖 ${BOT_NAME} đang khởi động...`);
  await bot.launch();
  console.log('✅ Bot đã sẵn sàng! Mở Telegram và gửi /start');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// ==================== FARM LOGIC ====================
async function runFarm(ctx: Context, statusMsgId: number, discordToken: string) {
  const chatId = ctx.chat!.id;
  const edit = async (text: string) => {
    try {
      await ctx.telegram.editMessageText(chatId, statusMsgId, undefined, text, {
        parse_mode: 'Markdown',
      });
    } catch {}
  };

  const app = new HieuTool(discordToken);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout kết nối Discord Gateway (60s).\nThử lại /run hoặc đổi mạng/VPN.'));
    }, 60_000);

    app.once(GatewayDispatchEvents.Ready, async ({ data }: { data: { user: { username: string; id: string } } }) => {
      clearTimeout(timeout);

      try {
        const user = data.user;
        let orbs: number | null = null;

        try {
          const bal = await app.getBalance();
          orbs = bal.balance;
        } catch {}

        await edit(
          `✅ Đã kết nối\n` +
            `👤 *${user.username}* (\`${user.id}\`)\n` +
            `🔮 Orbs: *${orbs ?? '?'}*\n\n` +
            `📦 Đang tải danh sách quests...`,
        );

        const store = await app.loadQuests();
        const pending = store.pending();
        const unclaimed = store.claimable();

        if (unclaimed.length > 0) {
          await edit(`🎁 Đang claim ${unclaimed.length} phần thưởng cũ...`);
          await store.grabAllRewards();
        }

        if (pending.length === 0) {
          let summary = `✨ *Không có quest nào đang chờ*\n\n👤 ${user.username}\n🔮 Orbs: ${orbs ?? '?'}\n\n`;
          const all = store.all();
          if (all.length > 0) {
            summary += '*Tất cả quests:*\n';
            all.forEach((q, i) => {
              let st = '❓';
              if (q.isClaimed()) st = '★ Claimed';
              else if (q.isCompleted()) st = '✔ Done';
              else if (q.isExpired()) st = '⏰ Expired';
              else st = '⏳ Active';
              summary += `${i + 1}. ${taskIcon(q.detectTaskType())} ${q.name.slice(0, 25)} — ${st}\n`;
            });
          }
          await edit(summary);
          try {
            await app.ws.destroy();
          } catch {}
          resolve();
          return;
        }

        const live: LiveQuest[] = pending.map((q) => ({
          id: q.id,
          label: q.name,
          reward: q.getRewardLabel(),
          countdown: q.getRemaining(),
          taskIcon: taskIcon(q.detectTaskType()),
          state: 'working' as RunState,
        }));

        const renderProgress = () => {
          let text = `🔮 *Farming...* | ${user.username} | 🔮 ${orbs ?? '?'}\n\n`;
          live.forEach((q, i) => {
            text += `${i + 1}. ${q.taskIcon} *${q.label.slice(0, 22)}*\n`;
            text += `   ${q.reward} | ${clock(q.countdown)} | ${stateLabel(q.state)}\n`;
          });
          const working = live.filter((q) => q.state === 'working').length;
          const finished = live.filter((q) => q.state === 'done' || q.state === 'claimed').length;
          text += `\n📊 Progress: ${finished}/${live.length} (${working} active)`;
          return text;
        };

        await edit(renderProgress());

        const ticker = setInterval(async () => {
          live.forEach((q) => {
            if (q.state === 'working' && q.countdown > 0) {
              q.countdown = Math.max(0, q.countdown - 15);
            } else if (q.state === 'working' && q.countdown <= 0) {
              q.state = 'done';
            }
          });
          await edit(renderProgress());
        }, 15_000);

        const results = await Promise.allSettled(pending.map((q) => store.execute(q)));

        clearInterval(ticker);

        results.forEach((r, i) => {
          if (!live[i]) return;
          live[i].state = r.status === 'fulfilled' ? 'claimed' : 'failed';
          live[i].countdown = 0;
        });

        let gained = 0;
        try {
          const bal = await app.getBalance();
          gained = orbs !== null ? bal.balance - orbs : 0;
          orbs = bal.balance;
        } catch {}

        let report = `🏁 *HOÀN THÀNH*\n\n`;
        report += `👤 ${user.username}\n`;
        report += `🔮 Orbs: *${orbs ?? '?'}*`;
        if (gained > 0) report += ` (+${gained})`;
        report += `\n\n`;

        results.forEach((r, i) => {
          const q = live[i];
          if (!q) return;
          if (r.status === 'fulfilled') {
            report += `✅ ${q.taskIcon} ${q.label.slice(0, 25)} — ${q.reward}\n`;
          } else {
            const msg = (r.reason as any)?.message?.slice(0, 30) || 'Error';
            report += `❌ ${q.taskIcon} ${q.label.slice(0, 25)} — ${msg}\n`;
          }
        });

        await edit(report);

        try {
          await app.ws.destroy();
        } catch {}
        resolve();
      } catch (e) {
        reject(e);
      }
    });

    app.start().catch(reject);
  });
}

// ==================== START ====================
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
