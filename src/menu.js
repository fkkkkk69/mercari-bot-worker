// Общий модуль меню, типов одежды и подписки (одинаков для goofish и mercari воркеров)

export const MAX_BRANDS = 5;

export const TYPES = [
  "шапка", "кепка", "шляпа", "куртка", "пальто", "ветровка", "жилетка", "зипка", "худи",
  "свитшот", "лонгслив", "футболка", "майка", "браслет", "кольцо", "сумка", "рюкзак",
  "штаны", "джинсы", "шорты", "носки", "кроссовки", "ботинки", "казаки", "кеды", "высокие кеды",
];

export function isPaidActive(sub) {
  return !!(sub && sub.paid_until && new Date(sub.paid_until) > new Date());
}

// Бренды по алфавиту: "N: number nine, nike"
export function groupAlphabet(brands) {
  const groups = {};
  const sorted = [...new Set(brands)].sort((a, b) => a.localeCompare(b));
  for (const b of sorted) {
    const ch = b[0].toUpperCase();
    const key = /[A-Z]/.test(ch) ? ch : "#";
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  }
  const keys = Object.keys(groups).sort((a, b) => (a === "#" ? -1 : b === "#" ? 1 : a.localeCompare(b)));
  return keys.map((k) => `${k}: ${groups[k].join(", ")}`).join("\n");
}

const BACK = [{ text: "⬅️ Меню", callback_data: "m" }];
const stKey = (id) => `state:${id}`;

function priceLabel(sub, brand) {
  const p = sub.brand_prices && sub.brand_prices[brand];
  if (p) return `¥${p.min}–¥${p.max}`;
  if (sub.global_price) return `¥${sub.global_price.min}–¥${sub.global_price.max} (общая)`;
  return "любая";
}

// d = { tgApi, getSub, setSub, emptySub, ALL_BRANDS, SUPPORT, SERVICE }
export function createMenu(d) {
  async function render(env, chatId, mid, text, rows) {
    const params = { chat_id: chatId, text, reply_markup: { inline_keyboard: rows } };
    if (mid) {
      const r = await d.tgApi(env, "editMessageText", { ...params, message_id: mid });
      const j = await r.json().catch(() => ({}));
      if (j.ok || /not modified/i.test(j.description || "")) return;
    }
    await d.tgApi(env, "sendMessage", params);
  }

  async function setState(env, id, obj) {
    await env.SUBSCRIBERS.put(stKey(id), JSON.stringify(obj), { expirationTtl: 600 });
  }

  function menuRows(sub) {
    return [
      [{ text: "🏷 Бренды", callback_data: "b" }, { text: "👕 Типы одежды", callback_data: "t" }],
      [{ text: "💴 Цены", callback_data: "p" }, { text: "📋 Статус", callback_data: "s" }],
      [{ text: "📖 Список брендов", callback_data: "l" }, { text: "💳 Подписка", callback_data: "u" }],
      [{ text: sub.active ? "⏸ Пауза" : "▶️ Включить", callback_data: "tg" }],
    ];
  }

  async function showMenu(env, chatId, mid) {
    const sub = (await d.getSub(env, chatId)) || d.emptySub();
    const types = sub.types && sub.types.length ? `${sub.types.length} выбрано` : "любые";
    const text =
      `Меню ${d.SERVICE}\n\n` +
      `Бренды: ${(sub.brands || []).length}/${MAX_BRANDS}\n` +
      `Типы одежды: ${types}\n` +
      `Уведомления: ${sub.active ? "включены" : "на паузе"}\n\n` +
      d.SUPPORT;
    await render(env, chatId, mid, text, menuRows(sub));
  }

  async function brandsScreen(env, chatId, mid, sub) {
    const brands = sub.brands || [];
    const rows = brands.map((b, i) => [{ text: `❌ ${b}`, callback_data: `bd:${i}` }]);
    if (brands.length < MAX_BRANDS) rows.push([{ text: "➕ Добавить бренд", callback_data: "ba" }]);
    rows.push(BACK);
    const text =
      `Твои бренды (${brands.length}/${MAX_BRANDS}). Нажми на бренд, чтобы убрать.\n` +
      (brands.length ? "" : "Пока пусто. ") +
      "Можно добавить любой бренд своим названием (латиницей).";
    await render(env, chatId, mid, text, rows);
  }

  async function typesScreen(env, chatId, mid, sub) {
    const chosen = new Set(sub.types || []);
    const rows = [];
    for (let i = 0; i < TYPES.length; i += 2) {
      rows.push(
        TYPES.slice(i, i + 2).map((t, j) => ({
          text: `${chosen.has(t) ? "✅" : "▫️"} ${t}`,
          callback_data: `ty:${i + j}`,
        }))
      );
    }
    rows.push([{ text: "🧹 Любые вещи (сбросить)", callback_data: "tc" }]);
    rows.push(BACK);
    await render(
      env, chatId, mid,
      "Какие вещи присылать? Отметь нужные. Если ничего не отмечено, придут любые.\n" +
      "Тип определяется по названию лота, поэтому лоты с нестандартным названием могут не попасть.",
      rows
    );
  }

  async function pricesScreen(env, chatId, mid, sub) {
    const rows = (sub.brands || []).map((b, i) => [{ text: `💴 ${b}: ${priceLabel(sub, b)}`, callback_data: `pb:${i}` }]);
    rows.push([{ text: `🌐 Общая цена: ${sub.global_price ? `¥${sub.global_price.min}–¥${sub.global_price.max}` : "нет"}`, callback_data: "pg" }]);
    rows.push([{ text: "🧹 Сбросить все цены", callback_data: "pc" }]);
    rows.push(BACK);
    await render(env, chatId, mid, "Цены в йенах. Нажми на бренд, чтобы задать диапазон, или на «Общая цена» для всех брендов без своей цены.", rows);
  }

  async function subScreen(env, chatId, mid, sub) {
    let line;
    if (isPaidActive(sub)) line = `Подписка активна до ${sub.paid_until.slice(0, 10)}.`;
    else if (sub.paid_until) line = `Подписка истекла ${sub.paid_until.slice(0, 10)}.`;
    else line = "Сейчас у тебя бесплатный доступ.";
    const rows = [];
    if (env.STARS_PRICE_30) {
      rows.push([{ text: `⭐ Оплатить 30 дней (${env.STARS_PRICE_30} Stars)`, callback_data: "pay" }]);
    } else {
      line += `\nДля оплаты и продления напиши: ${d.SUPPORT.replace(/^.*?:\s*/, "")}`;
    }
    rows.push(BACK);
    await render(env, chatId, mid, line, rows);
  }

  async function sendInvoice(env, chatId) {
    const amount = Number(env.STARS_PRICE_30);
    if (!amount) return;
    await d.tgApi(env, "sendInvoice", {
      chat_id: chatId,
      title: `${d.SERVICE}: подписка 30 дней`,
      description: "Уведомления о новых лотах по твоим брендам на 30 дней",
      payload: "sub30",
      provider_token: "",
      currency: "XTR",
      prices: [{ label: "30 дней", amount }],
    });
  }

  async function guard(env, chatId, answerId) {
    const sub = await d.getSub(env, chatId);
    if (!sub || sub.pending) {
      await d.tgApi(env, "answerCallbackQuery", { callback_query_id: answerId, text: "Нет доступа. Напиши /start" });
      return null;
    }
    return sub;
  }

  async function onCallback(env, cb) {
    const chatId = cb.message.chat.id;
    const mid = cb.message.message_id;
    const data = cb.data || "";
    const sub = await guard(env, chatId, cb.id);
    if (!sub) return;
    let toast;
    const [cmd, arg] = data.split(":");
    const idx = Number(arg);

    if (cmd === "m") await showMenu(env, chatId, mid);
    else if (cmd === "b") await brandsScreen(env, chatId, mid, sub);
    else if (cmd === "ba") {
      await setState(env, chatId, { mode: "add_brand" });
      await d.tgApi(env, "sendMessage", { chat_id: chatId, text: "Напиши название бренда одним сообщением (например: rick owens)." });
    } else if (cmd === "bd") {
      const b = (sub.brands || [])[idx];
      if (b) {
        sub.brands = sub.brands.filter((x) => x !== b);
        if (sub.brand_prices) delete sub.brand_prices[b];
        await d.setSub(env, chatId, sub);
        toast = `Убран: ${b}`;
      }
      await brandsScreen(env, chatId, mid, sub);
    } else if (cmd === "t") await typesScreen(env, chatId, mid, sub);
    else if (cmd === "ty") {
      const t = TYPES[idx];
      if (t) {
        const set = new Set(sub.types || []);
        if (set.has(t)) set.delete(t); else set.add(t);
        sub.types = TYPES.filter((x) => set.has(x));
        await d.setSub(env, chatId, sub);
      }
      await typesScreen(env, chatId, mid, sub);
    } else if (cmd === "tc") {
      sub.types = [];
      await d.setSub(env, chatId, sub);
      await typesScreen(env, chatId, mid, sub);
    } else if (cmd === "p") await pricesScreen(env, chatId, mid, sub);
    else if (cmd === "pb") {
      const b = (sub.brands || [])[idx];
      if (b) {
        await setState(env, chatId, { mode: "price", brand: b });
        await d.tgApi(env, "sendMessage", { chat_id: chatId, text: `Цена для «${b}» в йенах: напиши мин и макс, например: 3000 20000\nЧтобы убрать цену, напиши: убрать` });
      }
    } else if (cmd === "pg") {
      await setState(env, chatId, { mode: "price_all" });
      await d.tgApi(env, "sendMessage", { chat_id: chatId, text: "Общая цена в йенах: напиши мин и макс, например: 3000 20000\nЧтобы убрать, напиши: убрать" });
    } else if (cmd === "pc") {
      sub.brand_prices = {};
      sub.global_price = null;
      await d.setSub(env, chatId, sub);
      await pricesScreen(env, chatId, mid, sub);
    } else if (cmd === "s") {
      await render(env, chatId, mid, d.formatStatus(sub), [BACK]);
    } else if (cmd === "l") {
      await render(env, chatId, mid, "Популярные бренды (можно добавить и любой свой):\n\n" + groupAlphabet(d.ALL_BRANDS), [BACK]);
    } else if (cmd === "u") await subScreen(env, chatId, mid, sub);
    else if (cmd === "pay") await sendInvoice(env, chatId);
    else if (cmd === "tg") {
      sub.active = !sub.active;
      await d.setSub(env, chatId, sub);
      toast = sub.active ? "Уведомления включены" : "Пауза";
      await showMenu(env, chatId, mid);
    }

    await d.tgApi(env, "answerCallbackQuery", { callback_query_id: cb.id, ...(toast ? { text: toast } : {}) });
  }

  // Ответ пользователя после «➕ Добавить бренд» / «цена». true = сообщение обработано
  async function onPendingText(env, chatId, text) {
    const raw = await env.SUBSCRIBERS.get(stKey(chatId));
    if (!raw) return false;
    const st = JSON.parse(raw);
    await env.SUBSCRIBERS.delete(stKey(chatId));
    const sub = await d.getSub(env, chatId);
    if (!sub || sub.pending) return false;
    const say = (t) => d.tgApi(env, "sendMessage", { chat_id: chatId, text: t });

    if (st.mode === "add_brand") {
      const brand = text.toLowerCase().trim().replace(/\s+/g, " ");
      if (brand.length < 2 || brand.length > 40) { await say("Название должно быть от 2 до 40 символов."); return true; }
      if (!sub.brands) sub.brands = [];
      if (!sub.brands.includes(brand) && sub.brands.length >= MAX_BRANDS) {
        await say(`Лимит ${MAX_BRANDS} брендов. Убери один в разделе «Бренды».`);
        return true;
      }
      if (!sub.brands.includes(brand)) sub.brands.push(brand);
      await d.setSub(env, chatId, sub);
      await brandsScreen(env, chatId, null, sub);
      return true;
    }

    if (st.mode === "price" || st.mode === "price_all") {
      const clear = /^(убрать|сброс|-)$/i.test(text.trim());
      let range = null;
      if (!clear) {
        const nums = text.replace(/[¥,]/g, " ").trim().split(/\s+/).map(Number);
        if (nums.length !== 2 || nums.some((n) => isNaN(n) || n < 0) || nums[0] > nums[1]) {
          await say("Не понял. Напиши два числа: мин и макс, например: 3000 20000");
          return true;
        }
        range = { min: nums[0], max: nums[1] };
      }
      if (st.mode === "price") {
        if (!sub.brand_prices) sub.brand_prices = {};
        if (range) sub.brand_prices[st.brand] = range; else delete sub.brand_prices[st.brand];
      } else {
        sub.global_price = range;
      }
      await d.setSub(env, chatId, sub);
      await pricesScreen(env, chatId, null, sub);
      return true;
    }
    return false;
  }

  async function grant(env, targetId, days) {
    const sub = (await d.getSub(env, targetId)) || d.emptySub();
    const base = isPaidActive(sub) ? new Date(sub.paid_until) : new Date();
    base.setDate(base.getDate() + days);
    sub.paid_until = base.toISOString();
    sub.active = true;
    sub.pending = false;
    await d.setSub(env, targetId, sub);
    return sub.paid_until;
  }

  async function onPayment(env, msg) {
    const chatId = msg.chat.id;
    const until = await grant(env, chatId, 30);
    await d.tgApi(env, "sendMessage", { chat_id: chatId, text: `Оплата получена. Подписка активна до ${until.slice(0, 10)}.` });
    if (env.ADMIN_CHAT_ID) {
      await d.tgApi(env, "sendMessage", { chat_id: env.ADMIN_CHAT_ID, text: `Оплата (${d.SERVICE}): chat_id ${chatId}, до ${until.slice(0, 10)}` });
    }
  }

  return { showMenu, onCallback, onPendingText, onPayment, grant };
}
