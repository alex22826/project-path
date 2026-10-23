// Путь проекта — демо. Всё состояние в localStorage, интерфейс каждый раз рисуется из состояния.
// Задачи назначаются в разделе «Следующий шаг и задачи», а в попапе этапа зачёркиваются.
// Когда задачи этапа выполнены, этап сам становится зелёным и открывается следующий.
(function () {
  'use strict';

  const KEY = 'pp-demo-v2';
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
    plus: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>',
    sub: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v10a2 2 0 0 0 2 2h10"></path><path d="m15 13 3 3-3 3"></path></svg>',
    bell: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"></path><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path></svg>',
    feed: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path></svg>'
  };

  // ---------- состояние ----------
  const newTask = (t, o) => Object.assign({ id: nid(), t, done: false, opt: false, key: null, who: '', due: '', subs: [] }, o || {});

  function makeStages(presetId) {
    return clone(PP.presets[presetId].stages).map((s) => Object.assign(s, {
      tasks: s.tasks.map((t) => newTask(t.t, { opt: !!t.opt, key: t.key || null })),
      doneAt: null, result: null, resp: PP.defaultResp[s.phase] || PP.people[0]
    }));
  }

  function makeProject(d) {
    const stages = makeStages('new6');
    stages.forEach((s, i) => {
      if (i < d.cur) { s.tasks.forEach((t) => { t.done = true; }); s.result = { t: 'пройден', at: null }; }
      if (i === d.cur) s.tasks.forEach((t, j) => { t.done = j < d.done; });
    });
    (d.extra || []).forEach((x) => {
      const subs = x.subs.map((t, k) => ({ id: nid(), t, done: k < (x.doneSubs || 0) }));
      stages[x.s].tasks.splice(stages[x.s].tasks.length - 1, 0, newTask(x.t, { due: x.due || '', subs }));
    });
    return {
      id: d.id, name: d.name, client: d.client, sold: d.sold, presetId: 'new6', stages, cur: d.cur,
      status: 'active', pauseUntil: null, outcome: null, next: clone(d.next || { t: '', due: '' }),
      turn: clone(d.turn), meeting: clone(d.meeting), events: clone(d.events), choice: {}, extra: {}
    };
  }

  const fresh = () => ({ v: 2, projects: PP.demoProjects.map(makeProject), curId: 'baraka' });

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      return s && s.v === 2 && Array.isArray(s.projects) ? s : null;
    } catch (e) { return null; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* приватный режим: живём без сохранения */ } }

  let S = load() || fresh();
  // open — какой этап открыт в попапе, justDone — этап, который только что закрылся
  const UI = { open: null, justDone: null, edit: null, subFor: null, filter: 'all', closed: {}, dz: {}, draft: { t: '', si: null, who: '', due: '' } };

  const P = () => S.projects.find((p) => p.id === S.curId) || S.projects[0];
  const dec = (s) => s.decision || PP.genericDecision;
  const phaseOf = (s) => PP.phases[s.phase] || PP.phases.prod;
  const resp = (p) => p.stages[p.cur].resp || PP.people[0];
  const isLast = (p, i) => i === p.stages.length - 1;

  function log(p, t) { p.events.unshift({ at: fmt(TODAY), who: resp(p), t }); }

  // done — пройден, ready — последний этап, задачи выполнены, осталось выбрать исход
  function stStatus(p, i) {
    if (p.outcome && p.outcome.id !== 'lost') return 'done';
    if (i < p.cur) return 'done';
    if (i > p.cur) return 'next';
    return isLast(p, i) && !p.outcome && PP.canMoveNext(p.stages[i]).ok ? 'ready' : 'cur';
  }
  const countDone = (s) => s.tasks.filter((t) => t.done).length;

  // ---------- задачи и автопереход ----------
  function setTask(p, t, v) {
    t.done = v;
    t.subs.forEach((x) => { x.done = v; });
    if (v) log(p, 'Задача выполнена: ' + t.t);
  }
  // задача с подзадачами выполнена, когда выполнены все подзадачи
  function setSub(p, t, sub, v) {
    sub.done = v;
    const was = t.done;
    t.done = t.subs.every((x) => x.done);
    if (v) log(p, 'Подзадача выполнена: ' + sub.t + (t.done && !was ? ', задача «' + t.t + '» закрыта' : ''));
  }

  // Пока задачи текущего этапа выполнены, этап закрывается и открывается следующий
  function autoAdvance(p) {
    let first = null;
    while (!p.outcome && p.cur < p.stages.length - 1 && PP.canMoveNext(p.stages[p.cur]).ok) {
      const from = p.stages[p.cur];
      from.doneAt = TODAY;
      p.cur++;
      log(p, 'Все задачи этапа «' + from.name + '» выполнены, открыт этап «' + p.stages[p.cur].name + '»');
      if (!first) first = { from: from.name, to: p.stages[p.cur].name, toIdx: p.cur };
    }
    if (first) {
      UI.justDone = first;
      toast('Этап «' + first.from + '» завершён, открыт «' + first.to + '»');
    }
    return !!first;
  }

  function moveBack(p) {
    if (p.cur === 0) return;
    p.cur--;
    p.stages[p.cur].doneAt = null;
    UI.open = p.cur; UI.justDone = null;
    log(p, 'Проект возвращён на этап «' + p.stages[p.cur].name + '»');
  }

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

  function preview(p, s, o) {
    const fx = o.fx; const out = [];
    if (s.meeting) out.push('Зачеркнёт задачи встречи по тому, что заполнено выше');
    if (fx.done) {
      const names = s.tasks.filter((t) => fx.done.indexOf(t.key) >= 0).map((t) => '«' + t.t + '»');
      if (names.length) out.push('Зачеркнёт: ' + names.join(', '));
    }
    if (fx.addTask) out.push('Добавит задачу «' + taskText(s, fx) + '»');
    if (fx.turn) out.push('Чей ход: ' + (fx.turn[0] === 'client' ? 'ждём клиента' : 'ждём нас') + ' · ' + fx.turn[1]);
    if (fx.advance) out.push('Если все задачи выполнены, этап станет зелёным и откроется следующий');
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
    if (fx.addTask) s.tasks.push(newTask(taskText(s, fx) + (fx.ask === 'date' && ex.date ? ' · ' + fmt(ex.date) : '')));
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
    if (fx.advance && !autoAdvance(p)) toast(PP.canMoveNext(s).why + '. Этап закроется сам, когда задачи будут выполнены');
    delete p.choice[s.id];
    delete p.extra[s.id];
  }

  // ---------- отрисовка ----------
  function render() {
    const p = P();
    const fk = focusKey(document.activeElement);
    renderSelect(p); renderHead(p); renderBanner(p); renderPath(p); renderNext(p); renderFeed(p);
    if ($('#stage').open) renderStage(p);
    if ($('#settings').open) renderSettings(p);
    restoreFocus(fk);
    if (UI.edit) { const el = $('[data-fld="tedit"]'); if (el) { el.focus(); el.select(); } }
    save();
  }

  // после перерисовки возвращаем фокус на тот же элемент, чтобы не терять место с клавиатуры
  function focusKey(el) {
    if (!el || el === document.body) return null;
    const r = el.closest('[data-tid]');
    return { act: el.dataset.act || '', fld: el.dataset.fld || '', tid: r ? r.dataset.tid : '', sub: r ? r.dataset.sub || '' : '', box: el.closest('dialog') ? el.closest('dialog').id : '' };
  }
  function restoreFocus(k) {
    if (!k || (!k.act && !k.fld)) return;
    const scope = k.box ? $('#' + k.box) : document;
    if (!scope) return;
    const rows = k.tid ? scope.querySelectorAll('[data-tid="' + k.tid + '"]' + (k.sub ? '[data-sub="' + k.sub + '"]' : ':not([data-sub])')) : [scope];
    for (const r of rows) {
      const el = r.querySelector(k.act ? '[data-act="' + k.act + '"]' : '[data-fld="' + k.fld + '"]');
      if (el && el !== document.activeElement) { el.focus(); return; }
    }
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
    $('#pathSub').textContent = 'Нажмите на этап: откроются его задачи. Когда все задачи зачёркнуты, этап станет зелёным и откроется следующий.';
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
    p.stages.forEach((s, k) => {
      const st = stStatus(p, k);
      const done = countDone(s); const total = s.tasks.length;
      const lost = p.outcome && p.outcome.id === 'lost' && k === p.cur;
      let meta = st === 'done' ? 'завершён' + (s.doneAt ? ' ' + fmt(s.doneAt) : '') : st === 'ready' ? 'задачи выполнены · выберите исход' : st === 'cur' ? 'сейчас' : 'впереди';
      if (st === 'cur' && p.status === 'paused') meta += ' · отложен';
      if (lost) meta = 'отказ на этом этапе';
      h += '<button class="st st--' + (st === 'ready' ? 'done st--ready' : st) + (k === UI.open && $('#stage').open ? ' st--sel' : '') + '" data-act="pick" data-i="' + k + '" aria-haspopup="dialog">' +
        '<span class="st__top"><span class="st__n">' + (st === 'done' || st === 'ready' ? IC.check : k + 1) + '</span><span class="st__name">' + esc(s.name) + '</span></span>' +
        '<span class="st__meta">' + meta + '</span>' +
        (st === 'cur' && !p.outcome && p.turn.who === 'client' ? '<span class="badge badge--dot badge--warn st__turn">ждём клиента</span>' : '') +
        '<span class="st__resp">Ответств.: <b>' + esc(s.resp) + '</b></span>' +
        '<span class="st__bar"><i style="width: ' + (total ? Math.round(done / total * 100) : 0) + '%"></i></span>' +
        '<span class="st__cnt">' + done + ' из ' + total + ' задач</span></button>';
    });
    h += '<div class="out">' + ['support', 'handed', 'lost'].map((k) => {
      const o = PP.outcomes[k];
      return '<div class="out__i out__i--' + o.tone + (p.outcome && p.outcome.id === k ? ' out__i--on' : '') + '"><i></i>' + o.t + '</div>';
    }).join('') + '</div>';
    el.innerHTML = h;
    // на узком экране путь листается вбок: держим текущий этап в поле зрения
    const box = el.parentElement; const on = el.querySelector('.st--cur, .st--ready');
    if (on) {
      const dx = on.getBoundingClientRect().left - box.getBoundingClientRect().left;
      if (dx < 0 || dx + on.offsetWidth > box.clientWidth) box.scrollLeft += dx - 12;
    }
  }

  // ----- попап этапа: зачёркиваем задачи -----
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

  function decisionBlock(p, s) {
    const d = dec(s); const ch = p.choice[s.id]; const o = d.options.find((x) => x.id === ch);
    const ex = p.extra[s.id] || {};
    const k = p.id + ':' + s.id;
    const open = UI.dz[k] != null ? UI.dz[k] : !!s.meeting;
    return '<details class="dz" data-dz="' + k + '" data-open="' + (open ? 1 : 0) + '"' + (open ? ' open' : '') + '><summary>' + (s.meeting ? 'Итог встречи: что показали, что говорит клиент, что предлагаем' : 'Итог: ' + esc(d.q)) + '</summary><div class="dz__b">' +
      (s.meeting ? meetingBlock(p) : '') +
      '<div class="field"><span class="lbl">' + esc(d.q) + '</span><div class="opts">' +
      d.options.map((x) => '<button class="opt opt--' + x.tone + '" data-act="choose" data-o="' + x.id + '" aria-pressed="' + (x.id === ch) + '">' + esc(x.t) + '</button>').join('') + '</div></div>' +
      askField(p, s, o) +
      (o ? '<div class="field"><span class="lbl">CRM сделает сама</span><ul class="fx">' + preview(p, s, o).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '') +
      '<input class="input" data-fld="dnote" value="' + esc(ex.note) + '" placeholder="Комментарий к итогу, необязательно" aria-label="Комментарий к итогу">' +
      '<div class="row"><button class="btn btn--primary" data-act="apply"' + (o ? '' : ' disabled') + '>' + IC.check + 'Записать итог</button>' +
      (o ? '' : '<span class="t-small">Выберите вариант итога</span>') + '</div></div></details>';
  }

  function popTask(si, t) {
    const meta = [];
    if (t.who) meta.push(esc(t.who));
    if (t.due) meta.push('до ' + fmt(t.due));
    return '<li class="task' + (t.done ? ' task--done' : '') + '" data-si="' + si + '" data-tid="' + t.id + '">' +
      '<input type="checkbox" class="cb" data-act="tdone"' + (t.done ? ' checked' : '') + ' aria-label="Выполнено: ' + esc(t.t) + '">' +
      '<span class="task__t">' + esc(t.t) + '</span>' +
      (t.opt ? '<span class="badge badge--info">по желанию</span>' : '') +
      (t.key ? '<span class="task__auto" title="Отмечается сама по итогу">авто</span>' : '') +
      (meta.length ? '<span class="task__who">' + meta.join(' · ') + '</span>' : '') + '</li>' +
      (t.subs.length ? '<li><ul class="subs">' + t.subs.map((x) =>
        '<li class="task task--sub' + (x.done ? ' task--done' : '') + '" data-si="' + si + '" data-tid="' + t.id + '" data-sub="' + x.id + '">' +
        '<input type="checkbox" class="cb" data-act="sdone"' + (x.done ? ' checked' : '') + ' aria-label="Выполнено: ' + esc(x.t) + '">' +
        '<span class="task__t">' + esc(x.t) + '</span></li>').join('') + '</ul></li>' : '');
  }

  function renderStage(p) {
    const i = Math.min(UI.open, p.stages.length - 1); const s = p.stages[i];
    const st = stStatus(p, i); const ph = phaseOf(s);
    const done = countDone(s); const total = s.tasks.length;
    const r = PP.canMoveNext(s);
    const badge = st === 'done' || st === 'ready' ? '<span class="badge badge--ok">Завершён</span>' : st === 'cur' ? '<span class="badge badge--acc">Сейчас</span>' : '<span class="badge badge--outline">Впереди</span>';
    const jd = UI.justDone;
    let note = '';
    if (jd && jd.toIdx === p.cur && i === jd.toIdx - 1) {
      note = '<div class="banner banner--ok"><b>Все задачи выполнены</b><span class="grow">Этап «' + esc(jd.from) + '» завершён, открыт этап «' + esc(jd.to) + '»</span><button class="btn btn--sm" data-act="pick" data-i="' + jd.toIdx + '">Открыть «' + esc(jd.to) + '»' + IC.arrow + '</button></div>';
    } else if (st === 'ready') {
      note = '<div class="banner banner--ok"><b>Все задачи выполнены</b><span class="grow">Это последний этап: выберите исход в итоге ниже</span></div>';
    } else if (st === 'next') {
      note = '<div class="banner banner--info"><span class="grow">Этап откроется, когда будут выполнены задачи этапа «' + esc(p.stages[p.cur].name) + '». Задачи можно отметить заранее</span></div>';
    }
    $('#stage').innerHTML =
      '<div class="dlg__head"><span class="st__n' + (st === 'done' || st === 'ready' ? ' st__n--ok' : '') + '">' + (st === 'done' || st === 'ready' ? IC.check : i + 1) + '</span>' +
      '<div class="grow"><h2 class="h-card" id="stTitle">Этап ' + (i + 1) + ' из ' + p.stages.length + ' · ' + esc(s.name) + '</h2>' +
      '<p class="t-small">' + ph.name + ' · ' + esc(s.goal) + '</p></div>' + badge +
      '<button class="icon-btn" data-act="pclose" aria-label="Закрыть">' + IC.x + '</button></div>' +
      '<div class="dlg__body">' + note +
      '<div class="row"><label class="t-small" for="sResp">Ответственный этапа</label><select id="sResp" data-fld="sresp">' +
      PP.people.map((x) => '<option' + (x === s.resp ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>' +
      '<span class="grow"></span><span class="t-small">' + done + ' из ' + total + ' задач</span></div>' +
      '<div class="prog' + (st === 'done' || st === 'ready' ? ' prog--ok' : '') + '"><i style="width: ' + (total ? Math.round(done / total * 100) : 0) + '%"></i></div>' +
      (total ? '<ul class="tasks">' + s.tasks.map((t) => popTask(i, t)).join('') + '</ul>' : '<p class="t-small">Задач пока нет. Назначьте их в разделе «Следующий шаг и задачи».</p>') +
      '<div class="row"><button class="btn btn--sm" data-act="paddtask" data-i="' + i + '">' + IC.plus + 'Назначить задачу этому этапу</button>' +
      '<span class="t-small grow">' + (st === 'cur' ? (r.ok ? 'Все обязательные задачи выполнены' : esc(r.why) + ', после этого откроется следующий этап') : '') + '</span></div>' +
      (st === 'cur' || st === 'ready' ? (p.outcome ? '' : decisionBlock(p, s)) : '') +
      '<p class="t-small">Где обычно ждём клиента: ' + esc(s.wait) + '</p></div>' +
      '<div class="foot">' + (st === 'cur' && i > 0 && !p.outcome ? '<button class="btn btn--ghost btn--sm" data-act="back">Вернуть на предыдущий этап</button>' : '') +
      '<span class="grow"></span><button class="btn btn--sm btn--primary" data-act="pclose">Готово</button></div>';
  }

  // ----- раздел «Следующий шаг и задачи»: здесь задачи назначаются -----
  function stageOptions(p, sel) {
    return p.stages.map((s, k) => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + (k + 1) + ' · ' + esc(s.name) + '</option>').join('');
  }
  function whoOptions(sel, withStage) {
    return (withStage ? '<option value="">Ответственный этапа</option>' : '') + PP.people.map((x) => '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
  }

  function taskRow(p, si, t) {
    const s = p.stages[si];
    let h = '<div class="trow' + (t.done ? ' task--done' : '') + '" data-si="' + si + '" data-tid="' + t.id + '">' +
      '<input type="checkbox" class="cb" data-act="tdone"' + (t.done ? ' checked' : '') + ' aria-label="Выполнено: ' + esc(t.t) + '">' +
      (UI.edit === t.id
        ? '<input class="input task__edit" data-fld="tedit" value="' + esc(t.t) + '" aria-label="Текст задачи">'
        : '<span class="task__t" data-act="tedit" title="Нажмите, чтобы изменить">' + esc(t.t) + (t.subs.length ? ' <span class="t-small">' + t.subs.filter((x) => x.done).length + '/' + t.subs.length + '</span>' : '') + '</span>') +
      (t.key ? '<span class="task__auto" title="Отмечается сама по итогу">авто</span>' : '') +
      '<select class="mini" data-fld="tstage" aria-label="Этап задачи">' + stageOptions(p, si) + '</select>' +
      '<select class="mini" data-fld="twho" aria-label="Ответственный за задачу">' + whoOptions(t.who || s.resp, false) + '</select>' +
      '<input class="input mini" type="date" data-fld="tdue" value="' + esc(t.due) + '" aria-label="Срок задачи">' +
      '<button class="task__opt" data-act="topt" aria-pressed="' + t.opt + '">по желанию</button>' +
      '<button class="icon-btn" data-act="tsub" aria-label="Добавить подзадачу" title="Подзадача">' + IC.sub + '</button>' +
      '<button class="icon-btn" data-act="tdel" aria-label="Удалить задачу">' + IC.x + '</button></div>';
    if (t.subs.length || UI.subFor === t.id) {
      h += '<div class="subs">' + t.subs.map((x) =>
        '<div class="trow trow--sub' + (x.done ? ' task--done' : '') + '" data-si="' + si + '" data-tid="' + t.id + '" data-sub="' + x.id + '">' +
        '<input type="checkbox" class="cb" data-act="sdone"' + (x.done ? ' checked' : '') + ' aria-label="Выполнено: ' + esc(x.t) + '">' +
        '<span class="task__t">' + esc(x.t) + '</span>' +
        '<button class="icon-btn" data-act="subdel" aria-label="Удалить подзадачу">' + IC.x + '</button></div>').join('') +
        (UI.subFor === t.id ? '<div class="trow trow--sub" data-si="' + si + '" data-tid="' + t.id + '"><input class="input mini grow" data-fld="subnew" placeholder="Подзадача — Enter, чтобы добавить" aria-label="Новая подзадача"></div>' : '') +
        '</div>';
    }
    return h;
  }

  function renderNext(p) {
    const t = p.turn; const c = t.who === 'client'; const d = UI.draft;
    const addSi = d.si != null && d.si < p.stages.length ? d.si : p.cur;
    let groups = '';
    p.stages.forEach((s, si) => {
      if (UI.filter === 'cur' && si !== p.cur) return;
      const st = stStatus(p, si);
      const k = p.id + ':' + s.id;
      const open = UI.closed[k] != null ? !UI.closed[k] : st !== 'done';
      groups += '<details class="tg tg--' + (st === 'ready' ? 'done' : st) + '" data-tg="' + k + '" data-open="' + (open ? 1 : 0) + '"' + (open ? ' open' : '') + '><summary>' +
        '<span class="st__n' + (st === 'done' || st === 'ready' ? ' st__n--ok' : '') + '">' + (st === 'done' || st === 'ready' ? IC.check : si + 1) + '</span>' +
        '<b>' + esc(s.name) + '</b>' + (st === 'cur' ? '<span class="badge badge--acc">сейчас</span>' : '') +
        '<span class="grow"></span><span class="t-small">' + countDone(s) + ' из ' + s.tasks.length + '</span></summary>' +
        '<div class="tg__b">' + (s.tasks.length ? s.tasks.map((x) => taskRow(p, si, x)).join('') : '<p class="t-small">Задач нет</p>') + '</div></details>';
    });
    $('#next').innerHTML =
      '<div class="card__head"><span class="ico ico--acc">' + IC.arrow + '</span><div class="grow"><h2 class="h-card">Следующий шаг и задачи</h2>' +
      '<p class="t-small">Задачи назначаются здесь: этап, ответственный, срок, подзадачи. В попапе этапа их зачёркивают</p></div></div>' +
      '<div class="card__body">' +
      '<div class="field"><label for="nextT">Следующий шаг</label><div class="row">' +
      '<input id="nextT" class="input grow" data-fld="nextT" value="' + esc(p.next.t) + '" placeholder="Что делаем дальше по проекту">' +
      '<input class="input" type="date" data-fld="nextDue" value="' + esc(p.next.due) + '" aria-label="Срок шага" style="width: 150px">' +
      '<button class="btn btn--sm" data-act="remind">' + IC.bell + 'Напомнить</button></div></div>' +
      (p.outcome ? '' :
        '<div class="turn' + (c ? ' turn--client' : '') + '"><span class="t-over">Чей ход</span>' +
        '<div class="seg" role="group" aria-label="Чей ход">' +
        '<button data-act="turn" data-who="us" aria-pressed="' + !c + '">Ждём нас</button>' +
        '<button data-act="turn" data-who="client" aria-pressed="' + c + '">Ждём клиента</button></div>' +
        '<input class="input turn__what" data-fld="turnWhat" value="' + esc(t.what) + '" placeholder="' + (c ? 'Что ждём от клиента' : 'Что делаем мы') + '" aria-label="Что ждём">' +
        '<input class="input turn__due" type="date" data-fld="turnDue" value="' + esc(t.due) + '" aria-label="Срок">' +
        '<span class="t-small">' + (t.since ? 'с ' + fmt(t.since) + ' · ' + daysSince(t.since) + ' дн.' : '') + (c ? ' · срок клиента не наша просрочка' : '') + '</span></div>') +
      '<div class="row"><span class="t-over grow">Задачи</span><div class="seg" role="group" aria-label="Показать задачи">' +
      '<button data-act="tfilter" data-v="all" aria-pressed="' + (UI.filter === 'all') + '">Все этапы</button>' +
      '<button data-act="tfilter" data-v="cur" aria-pressed="' + (UI.filter === 'cur') + '">Текущий этап</button></div></div>' +
      '<div class="addf">' +
      '<input class="input" id="newT" data-fld="newT" value="' + esc(d.t) + '" placeholder="Новая задача — Enter, чтобы добавить" aria-label="Новая задача">' +
      '<select class="mini" data-fld="newStage" aria-label="Этап новой задачи">' + stageOptions(p, addSi) + '</select>' +
      '<select class="mini" data-fld="newWho" aria-label="Ответственный за новую задачу">' + whoOptions(d.who, true) + '</select>' +
      '<input class="input mini" type="date" data-fld="newDue" value="' + esc(d.due) + '" aria-label="Срок новой задачи">' +
      '<button class="btn btn--sm btn--primary" data-act="tadd">' + IC.plus + 'Добавить</button></div>' +
      groups + '</div>';
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
      '<p class="t-small">Этапы одни для любой задачи. Здесь их можно переименовать, переставить, добавить свой или заменить весь набор. Задачи назначаются в разделе «Следующий шаг и задачи».</p>' +
      '<div class="row"><select data-fld="preset" aria-label="Набор этапов">' + opts + '</select><button class="btn btn--sm" data-act="spreset">Заменить этапы проекта на этот набор</button></div>' +
      '<div style="display: grid; gap: 8px">' + p.stages.map((s, i) =>
        '<div class="srow" data-i="' + i + '"><span class="st__n">' + (i + 1) + '</span>' +
        '<input class="input" data-fld="sname" value="' + esc(s.name) + '" aria-label="Название этапа ' + (i + 1) + '">' +
        '<select data-fld="sphase" aria-label="Фаза этапа ' + (i + 1) + '"><option value="sale"' + (s.phase === 'sale' ? ' selected' : '') + '>Продажа</option><option value="prod"' + (s.phase === 'prod' ? ' selected' : '') + '>Производство</option></select>' +
        '<div class="row" style="gap: 2px"><button class="icon-btn" data-act="sup" aria-label="Выше"' + (i === 0 ? ' disabled' : '') + '>' + IC.up + '</button>' +
        '<button class="icon-btn" data-act="sdown" aria-label="Ниже"' + (i === p.stages.length - 1 ? ' disabled' : '') + '>' + IC.down + '</button>' +
        '<button class="icon-btn" data-act="sdel" aria-label="Удалить этап">' + IC.x + '</button></div></div>').join('') + '</div>' +
      '<div class="row"><button class="btn btn--sm" data-act="sadd">' + IC.plus + 'Добавить этап</button><span class="grow"></span><button class="btn btn--sm btn--primary" data-act="sclose">Готово</button></div></div>';
  }

  let tmr;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('toast--on');
    clearTimeout(tmr); tmr = setTimeout(() => el.classList.remove('toast--on'), 3000);
  }

  // ---------- события ----------
  function ctx(p, el) {
    const r = el.closest('[data-tid]'); if (!r) return null;
    const si = +r.dataset.si; const s = p.stages[si];
    const t = s && s.tasks.find((x) => x.id === r.dataset.tid);
    if (!t) return null;
    return { si, s, t, sub: r.dataset.sub ? t.subs.find((x) => x.id === r.dataset.sub) : null };
  }

  function addTask(p) {
    const d = UI.draft; const v = d.t.trim();
    if (!v) { toast('Напишите текст задачи'); const n = $('#newT'); if (n) n.focus(); return false; }
    const si = d.si != null && d.si < p.stages.length ? d.si : p.cur;
    const s = p.stages[si];
    s.tasks.push(newTask(v, { who: d.who, due: d.due }));
    log(p, 'Назначена задача на этап «' + s.name + '»: ' + v + (d.who ? ' · ' + d.who : '') + (d.due ? ' · до ' + fmt(d.due) : ''));
    UI.draft = { t: '', si: d.si, who: d.who, due: '' };
    return true;
  }

  function openStage(i) {
    UI.open = i; UI.justDone = null;
    renderStage(P());
    if (!$('#stage').open) $('#stage').showModal();
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
    const p = P(); const act = a.dataset.act;
    const ps = UI.open != null ? p.stages[UI.open] : null; // этап в попапе
    if (act === 'pick') { openStage(+a.dataset.i); }
    else if (act === 'pclose') { $('#stage').close(); }
    else if (act === 'tdone') { const c = ctx(p, a); setTask(p, c.t, a.checked); autoAdvance(p); }
    else if (act === 'sdone') { const c = ctx(p, a); setSub(p, c.t, c.sub, a.checked); autoAdvance(p); }
    else if (act === 'tedit') { UI.edit = ctx(p, a).t.id; }
    else if (act === 'topt') { const c = ctx(p, a); c.t.opt = !c.t.opt; autoAdvance(p); }
    else if (act === 'tdel') { const c = ctx(p, a); c.s.tasks = c.s.tasks.filter((x) => x !== c.t); autoAdvance(p); }
    else if (act === 'tsub') { const c = ctx(p, a); UI.subFor = UI.subFor === c.t.id ? null : c.t.id; render(); const n = $('[data-fld="subnew"]'); if (n) n.focus(); return; }
    else if (act === 'subdel') { const c = ctx(p, a); c.t.subs = c.t.subs.filter((x) => x !== c.sub); if (c.t.subs.length) c.t.done = c.t.subs.every((x) => x.done); autoAdvance(p); }
    else if (act === 'tadd') { if (!addTask(p)) return; render(); $('#newT').focus(); return; }
    else if (act === 'tfilter') { UI.filter = a.dataset.v; }
    else if (act === 'paddtask') {
      UI.draft.si = +a.dataset.i; $('#stage').close(); render();
      const n = $('#newT'); n.scrollIntoView({ block: 'center' }); n.focus(); return;
    }
    else if (act === 'remind') { toast(p.next.due ? 'Напоминание придёт ' + fmt(p.next.due) + ' в 10:00' : 'Укажите срок шага'); return; }
    else if (act === 'turn') {
      if (p.turn.who === a.dataset.who) return;
      p.turn.who = a.dataset.who; p.turn.since = TODAY;
      log(p, 'Чей ход: ' + (p.turn.who === 'client' ? 'ждём клиента' : 'ждём нас'));
    }
    else if (act === 'mchip') {
      const list = p.meeting[a.dataset.k]; const v = a.dataset.v; const k = list.indexOf(v);
      if (k >= 0) list.splice(k, 1); else list.push(v);
      syncMeeting(p);
    }
    else if (act === 'phrase') {
      const c = p.meeting.client.trim(); const v = a.dataset.v;
      p.meeting.client = c ? c.replace(/[.,;]?$/, ', ') + v.charAt(0).toLowerCase() + v.slice(1) : v;
      syncMeeting(p);
    }
    else if (act === 'choose') { p.choice[ps.id] = a.dataset.o; }
    else if (act === 'apply') { const o = dec(ps).options.find((x) => x.id === p.choice[ps.id]); if (o) applyDecision(p, ps, o); }
    else if (act === 'back') { moveBack(p); }
    else if (act === 'resume') { p.status = 'active'; p.pauseUntil = null; log(p, 'Проект возвращён в работу'); }
    else if (act === 'reopen') { p.outcome = null; log(p, 'Проект открыт снова'); }
    else if (act === 'reset') { if (!confirm('Вернуть все демо-проекты к началу?')) return; S = fresh(); UI.draft = { t: '', si: null, who: '', due: '' }; toast('Демо сброшено'); }
    else if (act === 'settings') { renderSettings(p); $('#settings').showModal(); return; }
    else if (act === 'sclose') { $('#settings').close(); }
    else if (act === 'sadd') { p.stages.push({ id: nid(), name: 'Новый этап', phase: 'prod', goal: 'Опишите цель этапа', wait: '-', tasks: [], decision: null, doneAt: null, result: null, resp: PP.defaultResp.prod }); p.presetId = 'custom'; }
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
      p.presetId = 'custom';
    }
    else if (act === 'spreset') {
      const id = $('[data-fld="preset"]').value;
      if (!confirm('Этапы и задачи проекта будут заменены набором «' + PP.presets[id].name + '». Продолжить?')) return;
      p.stages = makeStages(id); p.presetId = id; p.cur = 0; p.outcome = null; p.status = 'active';
      log(p, 'Набор этапов заменён: ' + PP.presets[id].name);
    }
    else return;
    render();
  });

  document.addEventListener('change', (e) => {
    const f = e.target.dataset.fld; if (!f) return;
    const p = P(); const v = e.target.value;
    const ps = UI.open != null ? p.stages[UI.open] : null;
    const ex = ps ? (p.extra[ps.id] = p.extra[ps.id] || {}) : {};
    if (f === 'turnDue') p.turn.due = v;
    else if (f === 'nextDue') p.next.due = v;
    else if (f === 'xdue') ex.due = v;
    else if (f === 'xdate') ex.date = v;
    else if (f === 'xreason') ex.reason = v;
    else if (f === 'sresp') { ps.resp = v; log(p, 'Ответственный этапа «' + ps.name + '»: ' + v); }
    else if (f === 'tstage') {
      const c = ctx(p, e.target); const to = p.stages[+v];
      c.s.tasks = c.s.tasks.filter((x) => x !== c.t); to.tasks.push(c.t);
      log(p, 'Задача «' + c.t.t + '» перенесена на этап «' + to.name + '»');
      autoAdvance(p);
    }
    else if (f === 'twho') { ctx(p, e.target).t.who = v; }
    else if (f === 'tdue') { ctx(p, e.target).t.due = v; }
    else if (f === 'newStage') { UI.draft.si = +v; return save(); }
    else if (f === 'newWho') { UI.draft.who = v; return save(); }
    else if (f === 'newDue') { UI.draft.due = v; return save(); }
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
    else if (f === 'nextT') p.next.t = e.target.value;
    else if (f === 'newT') UI.draft.t = e.target.value;
    else if (f === 'dnote' && UI.open != null) { const s = p.stages[UI.open]; (p.extra[s.id] = p.extra[s.id] || {}).note = e.target.value; }
    else return;
    save();
  });

  document.addEventListener('keydown', (e) => {
    const f = e.target.dataset && e.target.dataset.fld; if (!f) return;
    const p = P(); const v = e.target.value.trim();
    if (f === 'tedit') {
      if (e.key === 'Escape') { e.preventDefault(); UI.edit = null; render(); }
      if (e.key === 'Enter') { const c = ctx(p, e.target); if (c && v) c.t.t = v; UI.edit = null; render(); }
    } else if (e.key === 'Enter' && f === 'newT') {
      UI.draft.t = e.target.value;
      if (addTask(p)) { render(); $('#newT').focus(); }
    } else if (e.key === 'Enter' && f === 'subnew' && v) {
      const c = ctx(p, e.target);
      c.t.subs.push({ id: nid(), t: v, done: false }); c.t.done = false;
      log(p, 'Подзадача к «' + c.t.t + '»: ' + v);
      render(); const n = $('[data-fld="subnew"]'); if (n) n.focus();
    } else if (e.key === 'Escape' && f === 'subnew') {
      UI.subFor = null; render();
    } else if (e.key === 'Enter' && f === 'comment' && v) {
      log(p, v); render(); const n = $('[data-fld="comment"]'); if (n) n.focus();
    }
  });

  // уход из поля редактирования задачи сохраняет текст
  document.addEventListener('focusout', (e) => {
    if (e.target.dataset && e.target.dataset.fld === 'tedit' && UI.edit) {
      const p = P(); const c = ctx(p, e.target); const v = e.target.value.trim();
      if (c && v) c.t.t = v;
      UI.edit = null; setTimeout(render, 0);
    }
  });

  // открыта ли группа задач и блок итога: запоминаем, чтобы перерисовка не сворачивала их.
  // toggle приходит и при самой отрисовке с open — такие события совпадают с data-open и пропускаются
  document.addEventListener('toggle', (e) => {
    const el = e.target;
    if (!el.dataset || String(+el.open) === el.dataset.open) return;
    el.dataset.open = String(+el.open);
    if (el.dataset.tg) UI.closed[el.dataset.tg] = !el.open;
    if (el.dataset && el.dataset.dz) UI.dz[el.dataset.dz] = el.open;
  }, true);

  $('#stage').addEventListener('close', () => { UI.open = null; UI.justDone = null; renderPath(P()); });
  $('#proj').addEventListener('change', (e) => { S.curId = e.target.value; UI.edit = null; UI.subFor = null; UI.draft.si = null; render(); });

  render();
})();
