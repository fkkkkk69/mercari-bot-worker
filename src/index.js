// Cloudflare Worker: команды бота для настройки брендов/цены + API для парсера

const ALL_BRANDS = [
  "undercover", "number nine", "hysteric glamour", "rick owens", "raf simons",
  "jeremy scott", "walter van beirendonck", "424", "gucci", "prada",
  "helmut lang", "moschino", "junya watanabe", "diesel", "balmain", "ppfm",
  "tornado mart", "vivienne westwood", "c2h4", "john galliano",
  "maison margiela", "jean paul gaultier", "amiri", "issey miyake",
  "carol christian poell", "stone island", "yohji yamamoto", "y-3",
  "boris bidjan saberi", "bernhard willhelm", "hussein chalayan",
  "ann demeulemeester", "dries van noten", "dirk bikkembergs", "marina yee",
  "craig green", "kiko kostadinov", "post archive faction", "kanghyuk",
  "andersson bell", "hyein seo", "jil sander", "lemaire", "carpe diem",
  "m.a+", "label under construction", "layer-0", "julius", "devoa",
  "ziggy chen", "uma wang", "inaisce", "guidi", "a1923",
  "individual sentiments", "obscur", "leon emanuel blanck", "thom krom",
  "off-white", "balenciaga", "vetements", "chrome hearts", "gallery dept",
  "palm angels", "casablanca", "rhude", "givenchy", "dior homme",
  "louis vuitton", "heron preston", "fear of god", "yeezy", "sp5der",
  "denim tears", "hellstar", "corteiz", "c.p. company", "nike", "arcteryx",
  "moncler", "canada goose", "trapstar", "syna world", "benjart", "hoodrich",
  "burberry", "lacoste", "the north face", "oakley", "salomon", "asics",
  "saint laurent", "ysl", "dior", "the kooples", "allsaints",
  "zadig & voltaire", "american apparel", "urban outfitters", "cheap monday",
  "unif", "marc jacobs", "tripp nyc", "lip service", "dr. martens",
  "converse", "juicy couture", "von dutch", "ed hardy", "kmiri", "lgb",
  "20471120", "chanel", "if six was nine", "undercoverism",
];

const SUPPORT_LINE = "Предложения/вопросы: @YKS41";

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

function emptySub() {
  return { brands: [], brand_prices: {}, global_price: null, active: true, pending: false };
}

function formatStatus(sub) {
  const lines = [`Статус: ${sub.active ? "активна" : "выключена"}`];
  if (!sub.brands || sub.brands.length === 0) {
    lines.push("Бренды: не выбраны — добавь через «добавить бренд»");
  } else {
    lines.push("Бренды:");
    for (const b of sub.brands) {
      const p = sub.brand_prices && sub.brand_prices[b];
      if (p) {
        lines.push(`  ${b}: ¥${p.min} — ¥${p.max}`);
      } else if (sub.global_price) {
        lines.push(`  ${b}: ¥${sub.global_price.min} — ¥${sub.global_price.max} (общая цена)`);
      } else {
        lines.push(`  ${b}: любая цена`);
      }
    }
  }
  if (sub.global_price) {
    lines.push(`Общая цена по умолчанию: ¥${sub.global_price.min} — ¥${sub.global_price.max}`);
  }
  return lines.join("\n");
}

async function handleCommand(env, chatId, text, fromUsername) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(" ");

  if (cmd === "/start") {
    let sub = await getSub(env, chatId);
    if (!sub) {
      sub = emptySub();
      sub.active = false;
      sub.pending = true;
      await setSub(env, chatId, sub);
      const username = fromUsername ? `@${fromUsername}` : "(без username)";
      await tgApi(env, "sendMessage", {
        chat_id: env.ADMIN_CHAT_ID,
        text: `Новый запрос доступа: ${username}, chat_id: ${chatId}\nОдобрить: /approve ${chatId}`,
      });
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Заявка отправлена. Жди подтверждения от администратора." });
      return;
    }
    if (sub.pending && !sub.active) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Заявка ещё на рассмотрении." });
      return;
    }
    await tgApi(env, "sendMessage", {
      chat_id: chatId,
      text:
        "Привет! Команды:\n\n" +
        "`добавить бренд <название>`\nдобавить бренд в отслеживание\n\n" +
        "`убрать бренд <название>`\nубрать бренд\n\n" +
        "`добавить цену <бренд> <мин> <макс>`\nзадать цену конкретному бренду\n\n" +
        "`убрать цену <бренд>`\nубрать индивидуальную цену бренда\n\n" +
        "`добавить цену всем <мин> <макс>`\nзадать общую цену для брендов без своей цены\n\n" +
        "`убрать цену всем`\nубрать общую цену\n\n" +
        "`статус`\nтвои текущие настройки\n\n" +
        "`все бренды`\nсписок всех доступных брендов\n\n" +
        "`очистить`\nполностью сбросить все настройки\n\n" +
        "`стоп`\nотписаться\n\n" +
        "`старт`\nвключить подписку снова\n\n" +
        SUPPORT_LINE,
      parse_mode: "Markdown",
    });
    return;
  }

  if (cmd === "все" && rest[0] === "бренды") {
    await tgApi(env, "sendMessage", { chat_id: chatId, text: ALL_BRANDS.join(", ") });
    return;
  }

  if (cmd === "статус") {
    const sub = await getSub(env, chatId);
    if (!sub) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Ты ещё не подписан. Напиши /start" });
      return;
    }
    await tgApi(env, "sendMessage", { chat_id: chatId, text: formatStatus(sub) });
    return;
  }

  if (cmd === "очистить") {
    await setSub(env, chatId, emptySub());
    await tgApi(env, "sendMessage", { chat_id: chatId, text: "Всё очищено: бренды и цены сброшены." });
    return;
  }

  if (cmd === "стоп") {
    let sub = await getSub(env, chatId);
    if (sub) {
      sub.active = false;
      await setSub(env, chatId, sub);
    }
    await tgApi(env, "sendMessage", { chat_id: chatId, text: "Подписка выключена. Напиши «старт» — включить снова." });
    return;
  }

  if (cmd === "старт") {
    let sub = (await getSub(env, chatId)) || emptySub();
    sub.active = true;
    sub.pending = false;
    await setSub(env, chatId, sub);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: "Подписка включена." });
    return;
  }

  if (cmd === "добавить" && rest[0] === "бренд") {
    const brand = rest.slice(1).join(" ").toLowerCase().trim();
    if (!brand) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Формат: добавить бренд <название>" });
      return;
    }
    let sub = (await getSub(env, chatId)) || emptySub();
    if (!sub.brands) sub.brands = [];
    if (!sub.brands.includes(brand)) sub.brands.push(brand);
    await setSub(env, chatId, sub);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: `Добавлен бренд: ${brand}` });
    return;
  }

  if (cmd === "убрать" && rest[0] === "бренд") {
    const brand = rest.slice(1).join(" ").toLowerCase().trim();
    let sub = await getSub(env, chatId);
    if (!sub || !sub.brands || !sub.brands.includes(brand)) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Такого бренда нет в списке." });
      return;
    }
    sub.brands = sub.brands.filter((b) => b !== brand);
    if (sub.brand_prices) delete sub.brand_prices[brand];
    await setSub(env, chatId, sub);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: `Убран бренд: ${brand}` });
    return;
  }

  if (cmd === "добавить" && rest[0] === "цену" && rest[1] === "всем") {
    const nums = rest.slice(2).map(Number);
    if (nums.length !== 2 || nums.some(isNaN)) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Формат: добавить цену всем <мин> <макс>" });
      return;
    }
    let sub = (await getSub(env, chatId)) || emptySub();
    sub.global_price = { min: nums[0], max: nums[1] };
    await setSub(env, chatId, sub);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: `Общая цена: ¥${nums[0]} — ¥${nums[1]}` });
    return;
  }

  if (cmd === "убрать" && rest[0] === "цену" && rest[1] === "всем") {
    let sub = await getSub(env, chatId);
    if (!sub) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Ты ещё не подписан." });
      return;
    }
    sub.global_price = null;
    await setSub(env, chatId, sub);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: "Общая цена убрана." });
    return;
  }

  if (cmd === "добавить" && rest[0] === "цену") {
    const parts = rest.slice(1);
    if (parts.length < 3) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Формат: добавить цену <бренд> <мин> <макс>" });
      return;
    }
    const min = Number(parts[parts.length - 2]);
    const max = Number(parts[parts.length - 1]);
    if (isNaN(min) || isNaN(max)) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "Мин и макс должны быть числами." });
      return;
    }
    const brand = parts.slice(0, parts.length - 2).join(" ").toLowerCase();
    let sub = (await getSub(env, chatId)) || emptySub();
    if (!sub.brands) sub.brands = [];
    if (!sub.brands.includes(brand)) sub.brands.push(brand);
    if (!sub.brand_prices) sub.brand_prices = {};
    sub.brand_prices[brand] = { min, max };
    await setSub(env, chatId, sub);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: `Цена для ${brand}: ¥${min} — ¥${max}` });
    return;
  }

  if (cmd === "убрать" && rest[0] === "цену") {
    const brand = rest.slice(1).join(" ").toLowerCase().trim();
    let sub = await getSub(env, chatId);
    if (!sub || !sub.brand_prices || !sub.brand_prices[brand]) {
      await tgApi(env, "sendMessage", { chat_id: chatId, text: "У этого бренда нет индивидуальной цены." });
      return;
    }
    delete sub.brand_prices[brand];
    await setSub(env, chatId, sub);
    await tgApi(env, "sendMessage", { chat_id: chatId, text: `Индивидуальная цена для ${brand} убрана.` });
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
          await tgApi(env, "sendMessage", { chat_id: targetId, text: "Доступ одобрен! Напиши /start ещё раз, чтобы увидеть команды." });
          return new Response("ok");
        }
        await handleCommand(env, msg.chat.id, msg.text, msg.from && msg.from.username);
      }
      return new Response("ok");
    }

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
