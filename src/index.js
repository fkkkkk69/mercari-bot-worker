// Cloudflare Worker: команды бота для настройки брендов/цены + API для парсера

const ALL_BRANDS = [
  "undercover",
  "number nine",
  "hysteric glamour",
  "rick owens",
  "raf simons",
  "jeremy scott",
  "walter van beirendonck",
  "424",
  "gucci",
  "prada",
  "helmut lang",
  "moschino",
  "junya watanabe",
  "diesel",
  "balmain",
  "ppfm",
  "tornado mart",
  "vivienne westwood",
  "c2h4",
  "john galliano",
  "maison margiela",
  "jean paul gaultier",
  "amiri",
  "issey miyake",
  "carol christian poell",
  "stone island",
  "yohji yamamoto",
  "y-3",
  "boris bidjan saberi",
  "bernhard willhelm",
  "hussein chalayan",
  "ann demeulemeester",
  "dries van noten",
  "dirk bikkembergs",
  "marina yee",
  "craig green",
  "kiko kostadinov",
  "post archive faction",
  "kanghyuk",
  "andersson bell",
  "hyein seo",
  "jil sander",
  "lemaire",
  "carpe diem",
  "m.a+",
  "label under construction",
  "layer-0",
  "julius",
  "devoa",
  "ziggy chen",
  "uma wang",
  "inaisce",
  "guidi",
  "a1923",
  "individual sentiments",
  "obscur",
  "leon emanuel blanck",
  "thom krom",
  "off-white",
  "balenciaga",
  "vetements",
  "chrome hearts",
  "gallery dept",
  "palm angels",
  "casablanca",
  "rhude",
  "givenchy",
  "dior homme",
  "louis vuitton",
  "heron preston",
  "fear of god",
  "yeezy",
  "sp5der",
  "denim tears",
  "hellstar",
  "corteiz",
  "c.p. company",
  "nike",
  "arcteryx",
  "moncler",
  "canada goose",
  "trapstar",
  "syna world",
  "benjart",
  "hoodrich",
  "burberry",
  "lacoste",
  "the north face",
  "oakley",
  "salomon",
  "asics",
  "saint laurent",
  "ysl",
  "dior",
  "the kooples",
  "allsaints",
  "zadig & voltaire",
  "american apparel",
  "urban outfitters",
  "cheap monday",
  "unif",
  "marc jacobs",
  "tripp nyc",
  "lip service",
  "dr. martens",
  "converse",
  "juicy couture",
  "von dutch",
  "ed hardy",
  "kmiri",
  "lgb",
  "20471120",
  "chanel",
  "if six was nine",
  "undercoverism",
];

function tgApi(env, method, params) {
  return fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

async function getSub(env, chatId) {
  const raw = await env.SUBSCRIBERS.get(`sub:${chatId}`);
  return raw ? JSON.parse(raw) : null;
}

async function setSub(env, chatId, data) {
  await env.SUBSCRIBERS.put(`sub:${chatId}`, JSON.stringify(data));
}

async function handleCommand(env, chatId, text, fromUsername) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(" ");

  if (cmd === "/start") {
    let sub = await getSub(env, chatId);
    if (!sub) {
      sub = { brands: ALL_BRANDS, price_min: 0, price_max: 9999999, active: false, pending: true };
      await setSub(env, chatId, sub);
      const username = fromUsername ? `@${fromUsername}` : "(без username)";
      await tgApi(env, "sendMessage", {
        chat_id: env.ADMIN_CHAT_ID,
        text: `Новый запрос доступа: ${username}, chat_id: ${chatId}\nОдобрить: /approve ${chatId}`,
      });
      await tgApi(env, "sendMessage", {
        chat_id: chatId,
        text: "Заявка отправлена. Жди подтверждения от администратора.",
      });
      return;
    }
    if (sub.pending && !sub.active) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Заявка ещё на рассмотрении." });
      return;
    }
    await tgApi(env, "sendMessage", {
      chat_id: chatId,
      text:
        "Привет! Ты подписан на все бренды по умолчанию.\n\n" +
        "Команды:\n" +
        "/addbrand название мин макс — добавить свою цену под конкретный бренд (не сбрасывает остальные)\n" +
        "  Пример: /addbrand undercover 5000 12000\n" +
        "/removebrand название — убрать бренд из индивидуальных фильтров\n" +
        "/mybrands — список твоих брендов с ценами\n" +
        "/brands undercover, rick owens, gucci — выбрать бренды через запятую (общий фильтр без цены под каждый)\n" +
        "/price 1000 20000 — диапазон цены в йенах (мин макс)\n" +
        "/status — текущие настройки\n" +
        "/allbrands — список всех доступных брендов\n" +
        "/reset — сбросить фильтры (все бренды, любая цена)\n" +
        "/stop — отписаться\n" +
        "/start — включить подписку снова\n\n" +
        "Предложения/техподдержка: @YKS41",
    });
    return;
  }

  if (cmd === "/allbrands") {
    await tgApi(env, "sendMessage", { chat_id: chatId, text: ALL_BRANDS.join(", ") });
    return;
  }

  if (cmd === "/addbrand") {
    const parts = arg.trim().split(/\s+/);
    if (parts.length < 3) {
      await tgApi(env, "sendMessage", {
        chat_id: chatId,
        text: "Формат: /addbrand название мин макс\nПример: /addbrand undercover 5000 12000\nДля бренда из двух слов: /addbrand number nine 3000 10000",
      });
      return;
    }
    const min = Number(parts[parts.length - 2]);
    const max = Number(parts[parts.length - 1]);
    if (isNaN(min) || isNaN(max)) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Последние два значения должны быть числами (цена мин макс)." });
      return;
    }
    const brand = parts.slice(0, parts.length - 2).join(" ").toLowerCase();
    if (!brand) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Не указан бренд." });
      return;
    }
    let sub = (await getSub(env, chatId)) || { brands: [], price_min: 0, price_max: 9999999, active: true };
    if (!sub.brand_filters) sub.brand_filters = {};
    sub.brand_filters[brand] = { min, max };
    await setSub(env, chatId, sub);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: `Добавлено: ${brand} — ¥${min} — ¥${max}` });
    return;
  }

  if (cmd === "/removebrand") {
    const brand = arg.trim().toLowerCase();
    let sub = await getSub(env, chatId);
    if (!sub || !sub.brand_filters || !sub.brand_filters[brand]) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Такого бренда нет в твоих фильтрах." });
      return;
    }
    delete sub.brand_filters[brand];
    await setSub(env, chatId, sub);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: `Убрано: ${brand}` });
    return;
  }

  if (cmd === "/mybrands") {
    const sub = await getSub(env, chatId);
    if (!sub || !sub.brand_filters || Object.keys(sub.brand_filters).length === 0) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "У тебя пока нет индивидуальных фильтров по брендам. Добавь: /addbrand название мин макс" });
      return;
    }
    const lines = Object.entries(sub.brand_filters).map(([b, r]) => `${b}: ¥${r.min} — ¥${r.max}`);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: lines.join("\n") });
    return;
  }

  if (cmd === "/brands") {
    if (!arg) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Укажи бренды через запятую, например:\n/brands undercover, rick owens" });
      return;
    }
    const brands = arg.split(",").map((b) => b.trim().toLowerCase()).filter(Boolean);
    let sub = (await getSub(env, chatId)) || { price_min: 0, price_max: 9999999, active: true };
    sub.brands = brands;
    await setSub(env, chatId, sub);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: `Ок, бренды обновлены:\n${brands.join(", ")}` });
    return;
  }

  if (cmd === "/price") {
    const parts = arg.split(/\s+/).map(Number);
    if (parts.length !== 2 || parts.some(isNaN)) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Формат: /price мин макс, например /price 1000 20000" });
      return;
    }
    let sub = (await getSub(env, chatId)) || { brands: ALL_BRANDS, active: true };
    sub.price_min = parts[0];
    sub.price_max = parts[1];
    await setSub(env, chatId, sub);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: `Ок, диапазон цены: ¥${parts[0]} — ¥${parts[1]}` });
    return;
  }

  if (cmd === "/status") {
    const sub = await getSub(env, chatId);
    if (!sub) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Ты ещё не подписан. Напиши /start" });
      return;
    }
    await tgApi(env, "sendMessage", {
      chat_id: chatId,
      text:
        `Статус: ${sub.active ? "активна" : "выключена"}\n` +
        `Бренды: ${sub.brands.join(", ")}\n` +
        `Цена: ¥${sub.price_min} — ¥${sub.price_max}`,
    });
    return;
  }

  if (cmd === "/reset") {
    let sub = await getSub(env, chatId);
    if (!sub) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Ты ещё не подписан. Напиши /start" });
      return;
    }
    sub.brands = ALL_BRANDS;
    sub.price_min = 0;
    sub.price_max = 9999999;
    await setSub(env, chatId, sub);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: "Сброшено: все бренды, любая цена." });
    return;
  }

  if (cmd === "/stop") {
    let sub = await getSub(env, chatId);
    if (sub) {
      sub.active = false;
      await setSub(env, chatId, sub);
    }
    await tgApi(env, "sendMessage", { chat_id: chatId, text: "Подписка выключена. /start — включить снова." });
    return;
  }

  await tgApi(env, "sendMessage", { chat_id: chatId, text: "Не понял команду. /start — список команд." });
}

export default {
  async scheduled(event, env, ctx) {
    // GitHub Actions cron перестал срабатывать сам — дёргаем workflow_dispatch вручную
    const resp = await fetch(
      `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/${env.GH_WORKFLOW_ID}/dispatches`,
      {
        method: "POST",
        headers: {
          "Authorization": `token ${env.GH_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "User-Agent": "mercari-bot-worker",
        },
        body: JSON.stringify({ ref: "master" }),
      }
    );
    console.log("dispatch status:", resp.status);
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // Webhook для Telegram
    if (url.pathname === "/webhook" && request.method === "POST") {
      const update = await request.json();
      const msg = update.message;
      if (msg && msg.text) {
        if (msg.text.startsWith("/approve")) {
          if (String(msg.chat.id) !== String(env.ADMIN_CHAT_ID)) {
            await tgApi(env, "sendMessage", { chat_id: msg.chat.id, text: "Команда только для администратора." });
            return new Response("ok");
          }
          const targetId = msg.text.trim().split(/\s+/)[1];
          const sub = await getSub(env, targetId);
          if (!sub) {
            await tgApi(env, "sendMessage", { chat_id: msg.chat.id, text: "Заявка не найдена." });
            return new Response("ok");
          }
          sub.active = true;
          sub.pending = false;
          await setSub(env, targetId, sub);
          await tgApi(env, "sendMessage", { chat_id: msg.chat.id, text: `Одобрено: ${targetId}` });
          await tgApi(env, "sendMessage", { chat_id: targetId, text: "Доступ одобрен! Настрой фильтры: /brands ..., /price ..." });
          return new Response("ok");
        }
        await handleCommand(env, msg.chat.id, msg.text, msg.from && msg.from.username);
      }
      return new Response("ok");
    }

    // API для parser.py — отдаёт список активных подписчиков
    if (url.pathname === "/subscribers" && request.method === "GET") {
      const key = request.headers.get("X-API-Key");
      if (key !== env.API_SECRET) {
        return new Response("unauthorized", { status: 401 });
      }
      const list = await env.SUBSCRIBERS.list({ prefix: "sub:" });
      const subs = [];
      for (const k of list.keys) {
        const raw = await env.SUBSCRIBERS.get(k.name);
        const data = JSON.parse(raw);
        if (data.active) {
          subs.push({ chat_id: k.name.replace("sub:", ""), ...data });
        }
      }
      return new Response(JSON.stringify(subs), { headers: { "Content-Type": "application/json" } });
    }

    return new Response("mercari-bot-worker running");
  },
};
