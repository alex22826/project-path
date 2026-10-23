// Путь проекта — демо. Всё состояние в localStorage, интерфейс каждый раз рисуется из состояния.
(function () {
  'use strict';

  const KEY = 'pp-demo-v1';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let uid = Date.now();
  const nid = () => 'x' + (uid++).toString(36);

  // даты: храним ГГГГ-ММ-ДД, показываем дд.мм
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const TODAY = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  const fmt = (d) => (d ? d.slice(8, 10) + '.' + d.slice(5, 7) : '');
  const daysSince = (d) => (d ? Math.max(0, Math.round((new Date(TODAY) - new Date(d)) / 864e5)) : 0);

  const IC = {
    check: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>',
    x: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
    up: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"></path></svg>',
    down: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>',
    arrow: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>',
    feed: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path></svg>'
  };

  // ---------- состояние ----------
  function makeStages(presetId) {
    return clone(PP.presets[presetId].stages).map((s) => Object.assign(s, {
      tasks: s.tasks.map((t) => ({ id: nid(), t: t.t, opt: !!t.opt, key: t.key || null, done: false })),
      doneAt: null, result: null
    }));
  }

  function makeProject(d) {
    const stages = makeStages('new6');
    stages.forEach((s, i) => {
      if (i < d.cur) { s.tasks.forEach((t) => { t.done = true; }); s.result = { t: 'пройден', at: null }; }
      if (i === d.cur) s.tasks.forEach((t, j) => { t.done = j < d.done; });
    });
    return {
      id: d.id, name: d.name, client: d.client, sold: d.sold, presetId: 'new6', stages, cur: d.cur,
      status: 'active', pauseUntil: null, outcome: null,
      turn: clone(d.turn), meeting: clone(d.meeting), events: clone(d.events), choice: {}, extra: {}
    };
  }

  function fresh() {
    return { v: 1, projects: PP.demoProjects.map(makeProject), curId: 'baraka', sel: {} };
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      return s && s.v === 1 && Array.isArray(s.projects) ? s : null;
    } catch (e) { return null; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* приватный режим: живём без сохранения */ } }

  let S = load() || fresh();
  const UI = { edit: null };

  const P = () => S.projects.find((p) => p.id === S.curId) || S.projects[0];
  const selIdx = (p) => Math.min(S.sel[p.id] != null ? S.sel[p.id] : p.cur, p.stages.length - 1);
  const dec = (s) => s.decision || PP.genericDecision;
  const phaseOf = (s) => PP.phases[s.phase] || PP.phases.prod;
  const who = (p) => (phaseOf(p.stages[p.cur]).who === 'МПП' ? 'Шельняков А.' : 'Тест admin');

  function log(p, t) { p.events.unshift({ at: fmt(TODAY), who: who(p), t }); }

  function stStatus(p, i) {
    if (p.outcome && p.outcome.id !== 'lost') return 'done';
    return i < p.cur ? 'done' : i === p.cur ? 'cur' : 'next';
  }

  // ---------- вспомогательная логика ----------
  function taskText(s, fx) {
    const prefix = fx.addTask.split('{n}')[0];
    const n = s.tasks.filter((t) => t.t.indexOf(prefix) === 0).length + (fx.from || 1);
    return fx.addTask.replace('{n}', n);
  }

  // Встреча: задачи с ключами отмечаются сами по заполненным полям (снимать не снимаем)
  function syncMeeting(p) {
    const s = p.stages.find((x) => x.meeting);
    if (!s) return;
    const m = p.meeting;
    const cond = {
      demo: m.shown.some((x) => PP.meetingDemo.indexOf(x) >= 0),
      terms: m.shown.indexOf('Условия и ресурсы') >= 0,
      client: m.client.trim().length > 0,
      offer: m.offer.length > 0
    };
    s.tasks.forEach((t) => { if (t.key && cond[t.key]) t.done = true; });
  }

  function meetingSummary(p) {
    const m = p.meeting; const parts = [];
    if (m.shown.length) parts.push('показали: ' + m.shown.join(', ').toLowerCase());
    if (m.client.trim()) parts.push('клиент: «' + m.client.trim() + '»');
    if (m.offer.length) parts.push('предлагаем: ' + m.offer.join(', '));
    return parts.length ? ' · ' + parts.join('; ') : '';
  }

  function moveNext(p) {
    const s = p.stages[p.cur];
    s.doneAt = TODAY;
    if (p.cur < p.stages.length - 1) {
      p.cur++;
      S.sel[p.id] = p.cur;
      log(p, 'Проект переведён в «' + p.stages[p.cur].name + '»');
      toast('Проект на этапе «' + p.stages[p.cur].name + '»');
    }
  }

  function moveBack(p) {
    if (p.cur === 0) return;
    p.cur--;
    p.stages[p.cur].doneAt = null;
    S.sel[p.id] = p.cur;
    log(p, 'Проект возвращён на этап «' + p.stages[p.cur].name + '»');
  }

  function preview(p, s, o) {
    const fx = o.fx; const out = [];
    const next = p.stages[p.cur + 1];
    if (s.meeting) out.push('Отметит задачи встречи по тому, что заполнено выше');
    if (fx.done) {
      const names = s.tasks.filter((t) => fx.done.indexOf(t.key) >= 0).map((t) => '«' + t.t + '»');
      if (names.length) out.push('Отметит: ' + names.join(', '));
    }
    if (fx.addTask) out.push('Добавит задачу «' + taskText(s, fx) + '»');
    if (fx.turn) out.push('Чей ход: ' + (fx.turn[0] === 'client' ? 'ждём клиента' : 'ждём нас') + ' · ' + fx.turn[1]);
    if (fx.advance) out.push(next ? 'Переведёт в «' + next.name + '», если задачи этапа выполнены' : 'Последний этап: переход не нужен');
    if (fx.pause) out.push('Отложит проект до даты и напомнит в этот день');
    if (fx.outcome === 'lost') out.push('Закроет проект отказом, причина попадёт в отчёт');
    else if (fx.outcome) out.push('Закроет проект исходом «' + PP.outcomes[fx.outcome].t + '», если задачи выполнены');
    out.push('Запишет итог в ленту проекта');
    return out;
  }

  function applyDecision(p, s, o) {
    const ex = p.extra[s.id] || {};
    const fx = o.fx;
    if (fx.ask === 'due' && !ex.due) return toast('Укажите срок для клиента');
    if (fx.ask === 'date' && !ex.date) return toast('Укажите дату');
    if (fx.ask === 'reason' && !ex.reason) return toast('Выберите причину отказа');

    if (s.meeting) syncMeeting(p);
    (fx.done || []).forEach((k) => s.tasks.forEach((t) => { if (t.key === k) t.done = true; }));
    if (fx.addTask) {
      const t = taskText(s, fx) + (fx.ask === 'date' && ex.date ? ' · ' + fmt(ex.date) : '');
      s.tasks.push({ id: nid(), t, opt: false, key: null, done: false });
    }
    if (fx.turn) p.turn = { who: fx.turn[0], what: fx.turn[1], due: ex.due || '', since: TODAY };
    s.result = { t: o.t, at: TODAY };

    log(p, 'Итог «' + dec(s).q + '»: ' + o.t + (ex.note ? ' · ' + ex.note : '') + (s.meeting ? meetingSummary(p) : ''));

    if (fx.pause) { p.status = 'paused'; p.pauseUntil = ex.date; log(p, 'Проект отложен до ' + fmt(ex.date)); }
    if (fx.outcome === 'lost') {
      p.outcome = { id: 'lost', reason: ex.reason, at: TODAY };
      log(p, 'Отказ, причина: ' + ex.reason);
    } else if (fx.outcome) {
      const r = PP.canMoveNext(s);
      if (r.ok) { s.doneAt = TODAY; p.outcome = { id: fx.outcome, at: TODAY }; log(p, 'Проект сдан, исход: ' + PP.outcomes[fx.outcome].t); }
      else toast(r.why + '. Проект пока не закрыт');
    }
    if (fx.advance) {
      const r = PP.canMoveNext(s);
      if (r.ok) moveNext(p); else toast(r.why + '. Переход не выполнен, отметьте задачи');
    }
    delete p.choice[s.id];
    delete p.extra[s.id];
  }

  // ---------- отрисовка ----------
  function render() {
    const p = P();
    renderSelect(p); renderHead(p); renderBanner(p); renderTurn(p); renderPath(p); renderDetail(p); renderFeed(p);
    if ($('#settings').open) renderSettings(p);
    save();
  }

  function renderSelect(p) {
    $('#proj').innerHTML = S.projects.map((x) => '<option value="' + x.id + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.name) + ' · ' + esc(x.outcome ? PP.outcomes[x.outcome.id].t : x.stages[x.cur].name) + '</option>').join('');
  }

  function turnBadge(p) {
    if (p.turn.who === 'client') return '<span class="badge badge--dot badge--warn">Ждём клиента' + (p.turn.due ? ' · до ' + fmt(p.turn.due) : '') + '</span>';
    return '<span class="badge badge--dot badge--info">Ждём нас</span>';
  }

  function renderHead(p) {
    const s = p.stages[p.cur];
    const stageChip = p.outcome
      ? '<span class="badge badge--' + PP.outcomes[p.outcome.id].tone + '">Исход: ' + PP.outcomes[p.outcome.id].t + '</span>'
      : '<span class="badge badge--outline">Этап ' + (p.cur + 1) + ' из ' + p.stages.length + ' · ' + esc(s.name) + '</span>';
    const sold = p.meeting.offer.length ? p.meeting.offer.join(', ') : p.sold;
    $('#head').innerHTML =
      '<div class="ph"><div class="grow"><h1 class="ph__name">' + esc(p.name) + '</h1>' +
      '<div class="ph__meta"><span>' + esc(p.client) + '</span><span>Что продаём: ' + esc(sold) + '</span><span>Набор этапов: ' + esc(PP.presets[p.presetId] ? PP.presets[p.presetId].name : 'свой') + '</span></div></div>' +
      '<div class="row">' + stageChip + (p.outcome ? '' : turnBadge(p)) + (p.status === 'paused' ? '<span class="badge badge--warn">Отложен до ' + fmt(p.pauseUntil) + '</span>' : '') + '</div></div>';
    $('#pathSub').textContent = 'Продажа ведёт МПП, производство разработчик. Нажмите на этап, чтобы открыть его задачи и итог.';
  }

  function renderBanner(p) {
    let h = '';
    if (p.outcome) {
      const o = PP.outcomes[p.outcome.id];
      h = '<div class="banner banner--' + o.tone + '"><b>Исход: ' + o.t + '</b><span class="grow">' + esc(p.outcome.reason || o.s) + ' · ' + fmt(p.outcome.at) + '</span><button class="btn btn--sm" data-act="reopen">Открыть снова</button></div>';
    } else if (p.status === 'paused') {
      h = '<div class="banner banner--warn"><b>Отложен до ' + fmt(p.pauseUntil) + '</b><span class="grow">Это не отказ: в этот день придёт напоминание вернуть проект в работу</span><button class="btn btn--sm" data-act="resume">Вернуть в работу</button></div>';
    }
    $('#banner').innerHTML = h;
    $('#banner').hidden = !h;
  }

  function renderTurn(p) {
    const t = p.turn; const c = t.who === 'client';
    $('#turn').innerHTML = p.outcome ? '' :
      '<div class="turn' + (c ? ' turn--client' : '') + '">' +
      '<span class="t-over">Чей ход</span>' +
      '<div class="seg" role="group" aria-label="Чей ход">' +
      '<button data-act="turn" data-who="us" aria-pressed="' + !c + '">Ждём нас</button>' +
      '<button data-act="turn" data-who="client" aria-pressed="' + c + '">Ждём клиента</button></div>' +
      '<input class="input turn__what" data-fld="turnWhat" value="' + esc(t.what) + '" placeholder="' + (c ? 'Что ждём от клиента' : 'Что делаем мы') + '" aria-label="Что ждём">' +
      '<input class="input turn__due" type="date" data-fld="turnDue" value="' + esc(t.due) + '" aria-label="Срок">' +
      '<span class="t-small">' + (t.since ? 'с ' + fmt(t.since) + ' · ' + daysSince(t.since) + ' дн.' : '') + (c ? ' · на любом этапе, срок клиента не наша просрочка' : '') + '</span></div>';
  }

  function renderPath(p) {
    const n = p.stages.length;
    const el = $('#path');
    el.style.gridTemplateColumns = 'repeat(' + n + ', minmax(140px, 1fr)) minmax(170px, 1.1fr)';
    let h = '';
    // фазы: подряд идущие этапы одной фазы под одной подписью
    let i = 0; let first = true;
    while (i < n) {
      let j = i; while (j < n && p.stages[j].phase === p.stages[i].phase) j++;
      const ph = phaseOf(p.stages[i]);
      h += '<div class="ph-lbl" style="grid-column: span ' + (j - i) + '">' + ph.name + ' · ведёт ' + ph.who + '<small>' + (first ? 'до денег' : 'после предоплаты') + '</small></div>';
      first = false; i = j;
    }
    h += '<div class="ph-lbl ph-lbl--out">Исход</div>';
    const sel = selIdx(p);
    p.stages.forEach((s, k) => {
      const st = stStatus(p, k);
      const done = s.tasks.filter((t) => t.done).length;
      const total = s.tasks.length;
      const lost = p.outcome && p.outcome.id === 'lost' && k === p.cur;
      let meta = st === 'done' ? 'пройден' + (s.doneAt ? ' ' + fmt(s.doneAt) : '') : st === 'cur' ? 'сейчас' : 'впереди';
      if (st === 'cur' && p.status === 'paused') meta += ' · отложен';
      if (lost) meta = 'отказ на этом этапе';
      h += '<button class="st st--' + st + (k === sel ? ' st--sel' : '') + '" data-act="pick" data-i="' + k + '" aria-pressed="' + (k === sel) + '">' +
        '<span class="st__top"><span class="st__n">' + (st === 'done' ? IC.check : k + 1) + '</span><span class="st__name">' + esc(s.name) + '</span></span>' +
        '<span class="st__meta">' + meta + '</span>' +
        (st === 'cur' && !p.outcome && p.turn.who === 'client' ? '<span class="badge badge--dot badge--warn st__turn">ждём клиента</span>' : '') +
        '<span class="st__bar"><i style="width: ' + (total ? Math.round(done / total * 100) : 0) + '%"></i></span>' +
        '<span class="st__cnt">' + done + ' из ' + total + ' задач</span></button>';
    });
    h += '<div class="out">' + ['support', 'handed', 'lost'].map((k) => {
      const o = PP.outcomes[k];
      return '<div class="out__i out__i--' + o.tone + (p.outcome && p.outcome.id === k ? ' out__i--on' : '') + '"><i></i>' + o.t + '</div>';
    }).join('') + '</div>';
    el.innerHTML = h;
    // на узком экране путь листается вбок: держим выбранный этап в поле зрения
    const box = el.parentElement; const on = el.querySelector('.st--sel');
    if (on) {
      const dx = on.getBoundingClientRect().left - box.getBoundingClientRect().left;
      if (dx < 0 || dx + on.offsetWidth > box.clientWidth) box.scrollLeft += dx - 12;
    }
  }

  function chip(kind, v, on) {
    return '<button class="chip" data-act="mchip" data-k="' + kind + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + (on ? IC.check : '') + esc(v) + '</button>';
  }

  function meetingBlock(p) {
    const m = p.meeting;
    return '<div class="field"><span class="lbl">Что показали</span><div class="chips">' + PP.meetingShown.map((x) => chip('shown', x, m.shown.indexOf(x) >= 0)).join('') + '</div></div>' +
      '<div class="field"><label for="mClient">Что говорит клиент</label>' +
      '<textarea id="mClient" data-fld="mclient" placeholder="Например: всё ведём в бумажках, заявки теряются, нужен учёт склада">' + esc(m.client) + '</textarea>' +
      '<div class="chips">' + PP.meetingPhrases.map((x) => '<button class="chip chip--add" data-act="phrase" data-v="' + esc(x) + '">+ ' + esc(x) + '</button>').join('') + '</div></div>' +
      '<div class="field"><span class="lbl">Что предлагаем</span><div class="chips">' + PP.meetingOffer.map((x) => chip('offer', x, m.offer.indexOf(x) >= 0)).join('') + '</div></div>';
  }

  function askField(p, s, o) {
    if (!o || !o.fx.ask) return '';
    const ex = p.extra[s.id] || {};
    if (o.fx.ask === 'reason') {
      return '<div class="field"><label for="xReason">Причина отказа</label><select id="xReason" data-fld="xreason"><option value="">Выберите</option>' +
        PP.lostReasons.map((r) => '<option' + (ex.reason === r ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></div>';
    }
    const isDue = o.fx.ask === 'due';
    const label = isDue ? 'Срок для клиента' : o.id === 'again' ? 'Дата следующей встречи' : o.id === 'later' ? 'Вернуться к дате' : 'Дата';
    return '<div class="field"><label for="xDate">' + label + '</label><input id="xDate" class="input" type="date" data-fld="' + (isDue ? 'xdue' : 'xdate') + '" value="' + esc(isDue ? ex.due : ex.date) + '" style="max-width: 200px"></div>';
  }

  function renderDetail(p) {
    const i = selIdx(p); const s = p.stages[i]; const st = stStatus(p, i);
    const ph = phaseOf(s); const d = dec(s);
    const done = s.tasks.filter((t) => t.done).length;
    const badge = st === 'done' ? '<span class="badge badge--ok">Пройден</span>' : st === 'cur' ? '<span class="badge badge--acc">Сейчас</span>' : '<span class="badge badge--outline">Впереди</span>';

    let tasks = '<div class="row"><span class="t-over grow">Задачи этапа</span><span class="t-small">' + done + ' из ' + s.tasks.length + '</span></div><ul class="tasks">';
    s.tasks.forEach((t) => {
      tasks += '<li class="task' + (t.done ? ' task--done' : '') + '" data-tid="' + t.id + '">' +
        '<input type="checkbox" class="cb" data-act="tdone"' + (t.done ? ' checked' : '') + ' aria-label="Выполнено: ' + esc(t.t) + '">' +
        (UI.edit === t.id
          ? '<input class="input task__edit" data-fld="tedit" value="' + esc(t.t) + '" aria-label="Текст задачи">'
          : '<span class="task__t" data-act="tedit" title="Нажмите, чтобы изменить">' + esc(t.t) + '</span>') +
        (t.key ? '<span class="task__auto" title="CRM отметит сама по итогу">авто</span>' : '') +
        '<button class="task__opt" data-act="topt" aria-pressed="' + t.opt + '">по желанию</button>' +
        '<button class="icon-btn" data-act="tdel" aria-label="Удалить задачу">' + IC.x + '</button></li>';
    });
    tasks += '</ul><input class="input add" data-fld="tnew" placeholder="Новая задача — Enter, чтобы добавить" aria-label="Новая задача">' +
      '<p class="t-small">Где обычно ждём клиента: ' + esc(s.wait) + '</p>';

    let right;
    if (st === 'cur' && !p.outcome) {
      const ch = p.choice[s.id]; const o = d.options.find((x) => x.id === ch);
      const ex = p.extra[s.id] || {};
      right = (s.meeting ? meetingBlock(p) : '') +
        '<div class="field"><span class="lbl">' + esc(d.q) + '</span><div class="opts">' +
        d.options.map((x) => '<button class="opt opt--' + x.tone + '" data-act="choose" data-o="' + x.id + '" aria-pressed="' + (x.id === ch) + '">' + esc(x.t) + '</button>').join('') + '</div></div>' +
        askField(p, s, o) +
        (o ? '<div class="field"><span class="lbl">CRM сделает сама</span><ul class="fx">' + preview(p, s, o).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '') +
        '<input class="input" data-fld="dnote" value="' + esc(ex.note) + '" placeholder="Комментарий к итогу, необязательно" aria-label="Комментарий к итогу">' +
        '<div class="row"><button class="btn btn--primary" data-act="apply"' + (o ? '' : ' disabled') + '>' + IC.check + 'Записать итог</button>' +
        (o ? '' : '<span class="t-small">Выберите вариант итога</span>') + '</div>';
    } else {
      right = (s.meeting && (p.meeting.shown.length || p.meeting.client || p.meeting.offer.length) ? meetingBlock(p) : '') +
        '<div class="field"><span class="lbl">' + esc(d.q) + '</span>' +
        (s.result && s.result.at ? '<p>' + esc(s.result.t) + ' · ' + fmt(s.result.at) + '</p>' :
          '<p class="t-small">' + (st === 'next' ? 'Итог записывается, когда проект дойдёт до этого этапа. Варианты: ' + d.options.map((x) => x.t).join(', ') : 'Этап пройден') + '</p>') + '</div>';
    }

    let foot = '';
    if (st === 'cur' && !p.outcome) {
      const r = PP.canMoveNext(s); const next = p.stages[i + 1];
      foot = '<div class="foot"><span class="t-small grow">' + (r.ok ? 'Все обязательные задачи выполнены' : esc(r.why)) + '</span>' +
        (i > 0 ? '<button class="btn btn--ghost" data-act="back">Вернуть назад</button>' : '') +
        (next ? '<button class="btn btn--primary" data-act="next"' + (r.ok ? '' : ' disabled') + '>Перевести в «' + esc(next.name) + '»' + IC.arrow + '</button>'
          : '<span class="t-small">Последний этап: исход выбирается в итоге</span>') + '</div>';
    } else if (st === 'next') {
      foot = '<div class="foot"><span class="t-small">Откроется после этапа «' + esc(p.stages[p.cur].name) + '». Задачи можно подготовить заранее</span></div>';
    }

    $('#detail').innerHTML =
      '<div class="card__head"><span class="ico ' + (st === 'done' ? 'ico--ok' : st === 'cur' ? 'ico--acc' : '') + '">' + (st === 'done' ? IC.check : '<b>' + (i + 1) + '</b>') + '</span>' +
      '<div class="grow"><h2 class="h-card">Этап ' + (i + 1) + ' из ' + p.stages.length + ' · ' + esc(s.name) + '</h2>' +
      '<p class="t-small">' + ph.name + ' · ведёт ' + ph.who + ' · ' + esc(s.goal) + '</p></div>' + badge + '</div>' +
      '<div class="card__body"><div class="dt"><div class="box">' + tasks + '</div><div class="box">' + right + '</div></div></div>' + foot;

    if (UI.edit) { const e = $('[data-fld="tedit"]'); if (e) { e.focus(); e.select(); } }
  }

  function renderFeed(p) {
    $('#feed').innerHTML =
      '<div class="card__head"><span class="ico">' + IC.feed + '</span><h2 class="h-card grow">Лента проекта</h2><span class="t-small">' + p.events.length + '</span></div>' +
      '<div class="card__body"><input class="input" data-fld="comment" placeholder="Комментарий по проекту — Enter" aria-label="Комментарий по проекту">' +
      '<ul class="feed">' + p.events.map((e) => '<li><b>' + esc(e.at) + ' · ' + esc(e.who) + '</b><span>' + esc(e.t) + '</span></li>').join('') + '</ul></div>';
  }

  function renderSettings(p) {
    const opts = Object.keys(PP.presets).map((k) => '<option value="' + k + '">' + esc(PP.presets[k].name) + '</option>').join('');
    $('#settings').innerHTML =
      '<div class="dlg__head"><h2 class="h-card grow" id="setTitle">Этапы проекта «' + esc(p.name) + '»</h2><button class="icon-btn" data-act="sclose" aria-label="Закрыть">' + IC.x + '</button></div>' +
      '<div class="dlg__body">' +
      '<p class="t-small">Этапы одни для любой задачи. Здесь их можно переименовать, переставить, добавить свой или заменить весь набор. Задачи этапа меняются прямо в панели этапа.</p>' +
      '<div class="row"><select data-fld="preset" aria-label="Набор этапов">' + opts + '</select><button class="btn btn--sm" data-act="spreset">Заменить этапы проекта на этот набор</button></div>' +
      '<div style="display: grid; gap: 8px">' + p.stages.map((s, i) =>
        '<div class="srow" data-i="' + i + '"><span class="st__n">' + (i + 1) + '</span>' +
        '<input class="input" data-fld="sname" value="' + esc(s.name) + '" aria-label="Название этапа ' + (i + 1) + '">' +
        '<select data-fld="sphase" aria-label="Фаза этапа ' + (i + 1) + '"><option value="sale"' + (s.phase === 'sale' ? ' selected' : '') + '>Продажа</option><option value="prod"' + (s.phase === 'prod' ? ' selected' : '') + '>Производство</option></select>' +
        '<div class="row" style="gap: 2px"><button class="icon-btn" data-act="sup" aria-label="Выше"' + (i === 0 ? ' disabled' : '') + '>' + IC.up + '</button>' +
        '<button class="icon-btn" data-act="sdown" aria-label="Ниже"' + (i === p.stages.length - 1 ? ' disabled' : '') + '>' + IC.down + '</button>' +
        '<button class="icon-btn" data-act="sdel" aria-label="Удалить этап">' + IC.x + '</button></div></div>').join('') + '</div>' +
      '<div class="row"><button class="btn btn--sm" data-act="sadd">+ Добавить этап</button><span class="grow"></span><button class="btn btn--sm btn--primary" data-act="sclose">Готово</button></div></div>';
  }

  let tmr;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('toast--on');
    clearTimeout(tmr); tmr = setTimeout(() => el.classList.remove('toast--on'), 2600);
  }

  // ---------- события ----------
  const curStage = (p) => p.stages[selIdx(p)];
  const taskOf = (p, el) => { const li = el.closest('[data-tid]'); return li && curStage(p).tasks.find((t) => t.id === li.dataset.tid); };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
    const p = P(); const s = curStage(p); const act = a.dataset.act;
    if (act === 'pick') { S.sel[p.id] = +a.dataset.i; UI.edit = null; }
    else if (act === 'turn') {
      if (p.turn.who === a.dataset.who) return;
      p.turn.who = a.dataset.who; p.turn.since = TODAY;
      log(p, 'Чей ход: ' + (p.turn.who === 'client' ? 'ждём клиента' : 'ждём нас'));
    }
    else if (act === 'tdone') { const t = taskOf(p, a); t.done = a.checked; if (t.done) log(p, 'Задача выполнена: ' + t.t); }
    else if (act === 'tedit') { UI.edit = taskOf(p, a).id; }
    else if (act === 'topt') { const t = taskOf(p, a); t.opt = !t.opt; }
    else if (act === 'tdel') { const t = taskOf(p, a); s.tasks = s.tasks.filter((x) => x !== t); }
    else if (act === 'mchip') {
      const list = p.meeting[a.dataset.k]; const v = a.dataset.v; const k = list.indexOf(v);
      if (k >= 0) list.splice(k, 1); else list.push(v);
      syncMeeting(p);
    }
    else if (act === 'phrase') {
      const c = p.meeting.client.trim();
      const v = a.dataset.v;
      p.meeting.client = c ? c.replace(/[.,;]?$/, ', ') + v.charAt(0).toLowerCase() + v.slice(1) : v;
      syncMeeting(p);
    }
    else if (act === 'choose') { p.choice[s.id] = a.dataset.o; }
    else if (act === 'apply') { const o = dec(s).options.find((x) => x.id === p.choice[s.id]); if (o) applyDecision(p, s, o); }
    else if (act === 'next') { moveNext(p); }
    else if (act === 'back') { moveBack(p); }
    else if (act === 'resume') { p.status = 'active'; p.pauseUntil = null; log(p, 'Проект возвращён в работу'); }
    else if (act === 'reopen') { p.outcome = null; log(p, 'Проект открыт снова'); }
    else if (act === 'reset') { if (!confirm('Вернуть все демо-проекты к началу?')) return; S = fresh(); toast('Демо сброшено'); }
    else if (act === 'settings') { renderSettings(p); $('#settings').showModal(); return; }
    else if (act === 'sclose') { $('#settings').close(); }
    else if (act === 'sadd') { p.stages.push({ id: nid(), name: 'Новый этап', phase: 'prod', goal: 'Опишите цель этапа', wait: '-', tasks: [], decision: null, doneAt: null, result: null }); p.presetId = 'custom'; }
    else if (act === 'sup' || act === 'sdown' || act === 'sdel') {
      const i = +a.closest('[data-i]').dataset.i; const cur = p.stages[p.cur];
      if (act === 'sdel') {
        if (p.stages.length < 2) return toast('Нужен хотя бы один этап');
        if (!confirm('Удалить этап «' + p.stages[i].name + '» вместе с задачами?')) return;
        p.stages.splice(i, 1);
        p.cur = p.stages.indexOf(cur) >= 0 ? p.stages.indexOf(cur) : Math.min(i, p.stages.length - 1);
      } else {
        const j = act === 'sup' ? i - 1 : i + 1;
        const tmp = p.stages[i]; p.stages[i] = p.stages[j]; p.stages[j] = tmp;
        p.cur = p.stages.indexOf(cur);
      }
      S.sel[p.id] = p.cur; p.presetId = 'custom';
    }
    else if (act === 'spreset') {
      const id = $('[data-fld="preset"]').value;
      if (!confirm('Этапы и задачи проекта будут заменены набором «' + PP.presets[id].name + '». Продолжить?')) return;
      p.stages = makeStages(id); p.presetId = id; p.cur = 0; p.outcome = null; p.status = 'active'; S.sel[p.id] = 0;
      log(p, 'Набор этапов заменён: ' + PP.presets[id].name);
    }
    else return;
    render();
  });

  document.addEventListener('change', (e) => {
    const f = e.target.dataset.fld; if (!f) return;
    const p = P(); const s = curStage(p); const v = e.target.value;
    const ex = p.extra[s.id] = p.extra[s.id] || {};
    if (f === 'turnDue') p.turn.due = v;
    else if (f === 'xdue') ex.due = v;
    else if (f === 'xdate') ex.date = v;
    else if (f === 'xreason') ex.reason = v;
    else if (f === 'sname') { p.stages[+e.target.closest('[data-i]').dataset.i].name = v.trim() || 'Без названия'; }
    else if (f === 'sphase') { p.stages[+e.target.closest('[data-i]').dataset.i].phase = v; p.presetId = 'custom'; }
    else if (f === 'mclient') { syncMeeting(p); }
    else return;
    render();
  });

  // ввод без перерисовки, чтобы не сбивать курсор
  document.addEventListener('input', (e) => {
    const f = e.target.dataset.fld; if (!f) return;
    const p = P();
    if (f === 'mclient') p.meeting.client = e.target.value;
    else if (f === 'turnWhat') p.turn.what = e.target.value;
    else if (f === 'dnote') { const s = curStage(p); (p.extra[s.id] = p.extra[s.id] || {}).note = e.target.value; }
    else return;
    save();
  });

  document.addEventListener('keydown', (e) => {
    const f = e.target.dataset && e.target.dataset.fld; if (!f) return;
    const p = P(); const s = curStage(p); const v = e.target.value.trim();
    if (f === 'tedit') {
      if (e.key === 'Escape') { UI.edit = null; render(); }
      if (e.key === 'Enter') { const t = s.tasks.find((x) => x.id === UI.edit); if (t && v) t.t = v; UI.edit = null; render(); }
    } else if (e.key === 'Enter' && f === 'tnew' && v) {
      s.tasks.push({ id: nid(), t: v, opt: false, key: null, done: false });
      log(p, 'Добавлена задача на этапе «' + s.name + '»: ' + v);
      render(); const n = $('[data-fld="tnew"]'); if (n) n.focus();
    } else if (e.key === 'Enter' && f === 'comment' && v) {
      log(p, v); render(); const n = $('[data-fld="comment"]'); if (n) n.focus();
    }
  });

  // уход из поля редактирования задачи сохраняет текст
  document.addEventListener('focusout', (e) => {
    if (e.target.dataset && e.target.dataset.fld === 'tedit' && UI.edit) {
      const p = P(); const t = curStage(p).tasks.find((x) => x.id === UI.edit); const v = e.target.value.trim();
      if (t && v) t.t = v;
      UI.edit = null; setTimeout(render, 0);
    }
  });

  $('#proj').addEventListener('change', (e) => { S.curId = e.target.value; UI.edit = null; render(); });

  render();
})();
