// Adapter: 3D gestures enter the existing board handlers and permission checks.
(function () {
  'use strict';
  const moduleUrl = new URL('board-3d/scene.mjs?v=20261124-outfits-1', document.currentScript.src);
  let active = false, loading = null, engine = null, root = null, status = null;
  let syncFrame = 0, state = null, gesture = null, lastTap = null;
  let savedScroll = null;
  const touchPointers = new Set();
  const api = window.Board3D = {};
  const recentStudioActions=new Map();
  api.playDiceAction=event=>{
    if(!active||!engine||!/^Атака:/i.test(String(event?.kindText||'')))return false;
    const name=String(event.fromName||'').trim(),candidates=(getState()?.players||[]).filter(p=>String(p.name||'').trim()===name);if(candidates.length!==1)return false;
    const actor=candidates[0],role=typeof usersById!=='undefined'&&usersById.get(String(event.fromId))?.role||'Player';
    if(!window.canControlToken?.(actor,String(event.fromId),role))return false;
    const avatar=window.AvatarData?.describe(actor.sheet?.parsed,!!actor.isMonster);if(!avatar?.studio||avatar.twoHanded||!avatar.right&&!avatar.left)return false;
    const key=String(event.id||event.localNonce||'');const now=Date.now();for(const [k,t]of recentStudioActions)if(now-t>5000)recentStudioActions.delete(k);if(key&&recentStudioActions.has(key))return false;if(key)recentStudioActions.set(key,now);
    return engine.playAction(actor.id,'attack_sword');
  };
  api.beforeViewModeChange = mode => {
    const wrapper = document.getElementById('board-wrapper');
    if (mode === '3d' && !active && wrapper) savedScroll = { x:wrapper.scrollLeft, y:wrapper.scrollTop };
  };

  function getState() {
    return (typeof lastState !== 'undefined' && lastState) || state || window.FogWar?._lastState;
  }
  function notify(message) { if (status) { status.textContent = message; status.hidden = !message; } }
  function fallback(error) {
    console.warn('3D board unavailable:', error?.message || error);
    active = false;
    engine?.dispose(); engine = null; loading = null;
    window.applyBoardViewMode?.('topdown');
    const select = document.getElementById('board-view-mode-select');
    if (select) { select.value = 'topdown'; select.dispatchEvent(new Event('change')); }
    let note = document.getElementById('board-3d-fallback');
    if (!note) { note = document.createElement('p'); note.id = 'board-3d-fallback'; select?.after(note); }
    note.textContent = '3D недоступен в этом браузере. Включён 2D. Проверьте аппаратное ускорение и поддержку WebGL 2.';
  }
  function button(text, title, action) {
    const el = document.createElement('button'); el.type = 'button'; el.textContent = text; el.title = title;
    el.addEventListener('click', action); return el;
  }
  function makeRoot() {
    if (root) return;
    root = document.createElement('div'); root.id = 'board-3d-root'; root.hidden = true;
    root.setAttribute('aria-label', 'Трёхмерное игровое поле');
    const toolbar = document.createElement('div'); toolbar.className = 'board-3d-toolbar';
    toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Камера 3D');
    toolbar.append(button('Обзор', 'Показать всю карту', () => engine?.overview()),
      button('Мой токен', 'Приблизиться к выбранному токену или своей основе', () => {
        const id = typeof selectedPlayer !== 'undefined' && selectedPlayer?.id
          || (typeof players !== 'undefined' && players.find(p => p.isBase && String(p.ownerId) === String(myId))?.id);
        if (!engine?.focusToken(id)) notify('Выберите видимый токен или разместите свою основу на карте.');
        else notify('');
      }), button('Сверху', 'Плавно повернуть камеру над полем', () => engine?.top()),
      button('−', 'Отдалить', () => engine?.zoom(1.25)), button('+', 'Приблизить', () => engine?.zoom(.8)));
    const fade = button('Стены', 'Сделать стены полупрозрачными для удобства обзора', () => {
      const pressed = fade.getAttribute('aria-pressed') !== 'true';
      fade.setAttribute('aria-pressed', String(pressed)); engine?.setWallFade(pressed);
    }); fade.setAttribute('aria-pressed', 'false'); toolbar.append(fade);
    const grid = button('Сетка', 'Показать или скрыть клетки в 3D; настройка 2D не меняется', () => {
      const pressed = grid.getAttribute('aria-pressed') !== 'true';
      grid.setAttribute('aria-pressed', String(pressed)); engine?.setGrid(pressed);
    }); grid.setAttribute('aria-pressed', 'true'); toolbar.append(grid);
    toolbar.append(button('Подложка', 'Повторить загрузку изображения карты', () => engine?.reloadBackground()));
    toolbar.append(button('⛶', 'Поле на весь экран / выйти из полного экрана', async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.parentElement.requestFullscreen(); }
      catch { notify('Полноэкранный режим недоступен.'); }
    }));
    const help = document.createElement('details'); help.className = 'board-3d-help';
    help.innerHTML = '<summary title="Управление камерой">?</summary><div><b>Камера</b><br>Правая кнопка — вращение<br>Колесо зажато — перемещение<br>Прокрутка — приближение<br>Левый клик — токен / клетка<br>Двойной клик — карточка токена<br>На экране: один палец — вращение,<br>два — масштаб и перемещение.<br>Стены и туман рисуются левым кликом<br>с включённым инструментом карты.</div>';
    toolbar.append(help);
    status = document.createElement('div'); status.className = 'board-3d-status'; status.setAttribute('role', 'status'); status.hidden = true;
    const caption = document.createElement('div'); caption.className = 'board-3d-caption'; caption.textContent = '3D · ПКМ вращение · колесо масштаб / перемещение';
    const combat=document.createElement('div');combat.className='board-3d-combat';combat.hidden=true;
    const summary=document.createElement('span');summary.className='board-3d-combat__summary';
    const dash=button('Рывок','Включить или отменить режим рывка',()=>{
      if(typeof selectedPlayer==='undefined' || !selectedPlayer)return;
      window.activateCombatDashForPlayer?.(selectedPlayer);
      window.syncSelectedPlayerUi?.();window.renderCombatMoveOverlay?.();api.requestSync();
    });dash.dataset.action='dash';combat.append(summary,dash);
    const legend=document.createElement('div');legend.className='board-3d-fog-legend';legend.hidden=true;
    legend.innerHTML='<span class="fog-visible">Видно</span><span class="fog-explored">Исследовано</span><span class="fog-unknown">Неизвестно</span>';
    root.append(toolbar, status, caption,combat,legend); document.getElementById('board-wrapper')?.append(root);
  }
  api.setActive = async function (value) {
    const wasActive = active;
    active = !!value;
    const wrapper = document.getElementById('board-wrapper');
    if (!active) {
      if (root) root.hidden = true;
      engine?.setActive(false); gesture = null;
      if (savedScroll && wrapper) { wrapper.scrollLeft = savedScroll.x; wrapper.scrollTop = savedScroll.y; savedScroll = null; }
      return;
    }
    if (!wasActive && wrapper) {
      savedScroll ||= { x: wrapper.scrollLeft, y: wrapper.scrollTop };
      wrapper.scrollLeft = 0; wrapper.scrollTop = 0;
    }
    makeRoot(); root.hidden = false;
    document.getElementById('board-3d-fallback')?.remove();
    try {
      if (!loading) {
        notify('Загрузка 3D…');
        loading = import(moduleUrl.href).then(module => {
          engine = module.createBoard3D(root, {
            cameraChanged() { window.dispatchEvent(new Event('board-3d-camera-changed')); if (typeof refreshOpenTokenMini === 'function') refreshOpenTokenMini(); },
            status: notify, failed: fallback,
            rollDeathSave: id => window.InfoModal?.rollDeathSave?.(id)
          });
          bindCanvas(engine.canvas); notify(''); return engine;
        }).catch(error => { loading = null; throw error; });
      }
      await loading;
      engine.setActive(active);
      if (active) api.requestSync();
    } catch (error) { if (active) fallback(error); }
  };
  function snapshot() {
    const st = getState(); if (!st || !window.FogWar) return null;
    const view = window.FogWar.getViewSnapshot();
    const combat=editingWalls() || toolTarget() ? null : window.getCombatMoveOverlaySnapshot?.() || null;
    const tokens = (typeof players !== 'undefined' ? players : []).map(player => {
      const p = window.getLivePlayerView?.(player) || player;
      const el = playerElements.get(p.id);
      return { id: String(p.id), name: String(p.name || 'Токен'), color: p.color || '#c6a35e',
        avatar: el?.dataset.fogGhost === '1' ? null : window.AvatarData?.describe(p.sheet?.parsed,!!p.isMonster) || null,
        hud: el?.dataset.fogGhost === '1' ? null : {
          health: typeof canViewSensitiveInfo === 'function' && !canViewSensitiveInfo(p) ? null : getQuickSheetStats(p),
          life: typeof canViewSensitiveInfo === 'function' && !canViewSensitiveInfo(p) ? null : window.TokenHealth.describe(p.sheet?.parsed),
          canRollDeathSave: canControlToken(p),
          deathSavePending: !!window.InfoModal?.isDeathSavePending?.(p.id),
          conditions: canShowTokenConditionIndicators(p) ? parseTokenConditionsList(p.sheet?.parsed || {}) : []
        },
        // Read the rendered, last-known DOM position, not the hidden live position.
        x: el ? parseFloat(el.style.left) / 50 : NaN, y: el ? parseFloat(el.style.top) / 50 : NaN,
        size: Math.max(1, Number(p.size) || 1), ghost: el?.dataset.fogGhost === '1',
        currentTurn: st.phase==='combat' && String(st.turnOrder?.[st.currentTurnIndex]||'')===String(p.id) && el?.dataset.fogGhost!=='1',
        hidden: !el || p.x == null || p.y == null || el.style.display === 'none' || el.style.visibility === 'hidden',
        enemy: !!p.isEnemy, ally: !!p.isAlly, selected: typeof selectedPlayer !== 'undefined' && String(selectedPlayer?.id) === String(p.id) };
    }).filter(token => window.Board3DData.tokenVisible(token, view));
    // Wall DOM contains optimistic edits/drafts as well as canonical state.
    const walls = [...document.querySelectorAll('#walls-layer .wall-edge, #walls-preview-layer .wall-edge')].map(el => {
      const key = el.dataset.wallKey;
      const [x, y, dir] = (key || '').split(',');
      if (!key) {
        const left = parseFloat(el.style.left), top = parseFloat(el.style.top);
        const direction = [...el.classList].find(c => /^wall-dir-/.test(c))?.slice(9).toUpperCase();
        // Preview nodes have no dataset. Canonical walls are handled below.
        return Number.isFinite(left) && Number.isFinite(top) && direction
          ? { x: Math.round(left / 50), y: Math.round(top / 50), dir: direction, type: 'stone', thickness: 3 } : null;
      }
      return { x: Number(x), y: Number(y), dir,
        type: [...el.classList].find(c => c.startsWith('wall-type-'))?.slice(10) || 'stone',
        thickness: parseFloat(el.style.getPropertyValue('--t')) || 4 };
    }).filter(Boolean);
    const legacy = (st.walls || []).filter(w => !w.dir);
    return { view, tokens, combat, walls: [...walls, ...legacy], marks: window.BoardMarks?.getRenderMarks?.() || [],
      mapKey: `${typeof currentRoomId !== 'undefined' ? currentRoomId : ''}:${st.currentMapId || ''}`,
      background: st.boardBgUrl || st.boardBgDataUrl || '', gridAlpha: st.gridAlpha ?? 1, wallAlpha: st.wallAlpha ?? 1 };
  }
  api.requestSync = function (nextState) {
    if (nextState) state = nextState;
    if (!active || !engine || syncFrame) return;
    syncFrame = requestAnimationFrame(() => {
      syncFrame = 0; if (!active) return;
      const data = snapshot(); if (data) { engine.sync(data);updateCombatUi(data); }
    });
  };
  function updateCombatUi(data) {
    const panel=root.querySelector('.board-3d-combat'),model=data.combat;
    panel.hidden=!model || !data.tokens.some(t=>t.id===model.tokenId && !t.ghost);
    if(model) {
      const name=data.tokens.find(t=>t.id===model.tokenId)?.name || 'Токен';
      panel.querySelector('.board-3d-combat__summary').textContent=`${name} · ${model.mode==='dash'?'Рывок':model.mode==='teleport'?'Телепортация':'Ход'} · ${model.remainingFeet} / ${model.totalFeet} фт`;
      const dash=panel.querySelector('button');dash.hidden=!model.canDash;dash.setAttribute('aria-pressed',String(model.dashActive));
    }
    root.querySelector('.board-3d-fog-legend').hidden=!data.view.showFog;
  }
  api.projectToken = id => active ? engine?.projectToken(String(id)) : null;
  api.projectCell = (x, y, height = 0) => active ? engine?.projectCell(x, y, height) : null;
  api.inspect = () => ({ active, loading: !!loading && !engine, ...(engine?.inspect() || {}) });
  function toolTarget(hit) {
    const st = getState();
    if (typeof myRole !== 'undefined' && myRole === 'GM' && st?.fog?.enabled && st.fog.mode === 'manual'
      && document.getElementById('fog-draw')?.checked) return document.getElementById('fog-layer');
    if (document.getElementById('marks-enabled')?.checked) return hit?.markId
      ? document.querySelector(`#marks-layer .mark-shape[data-id="${CSS.escape(hit.markId)}"]`) || document.querySelector('#marks-layer svg')
      : document.querySelector('#marks-layer svg');
    return null;
  }
  function editingWalls() { return document.getElementById('edit-environment')?.classList.contains('is-on'); }
  function dispatch(target, type, source, point) {
    if (!target || !point) return;
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0,
      buttons: source.buttons || 0, clientX: source.clientX, clientY: source.clientY,
      shiftKey: source.shiftKey, ctrlKey: source.ctrlKey, altKey: source.altKey });
    Object.defineProperty(event, 'boardPoint', { value: point });
    target.dispatchEvent(event);
  }
  function cell(point) { return point ? document.querySelector(`#game-board .cell[data-x="${point.x}"][data-y="${point.y}"]`) : null; }
  function bindCanvas(canvas) {
    canvas.tabIndex = 0; canvas.setAttribute('aria-label', '3D-карта. Правая кнопка вращает, колесо приближает, нажатое колесо перемещает.');
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    // Do not let the old global mark-drag handlers process screen coordinates.
    for (const type of ['mousemove', 'mousedown', 'mouseup', 'dblclick']) canvas.addEventListener(type, e => e.stopPropagation());
    canvas.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') {
        touchPointers.add(event.pointerId);
        if (touchPointers.size > 1) {
          if (gesture?.target) dispatch(gesture.moveTarget, 'mouseup', event, gesture.point);
          gesture = null;
          return;
        }
      }
      if (event.button !== 0) return;
      const hit = engine.pick(event.clientX, event.clientY, document.getElementById('marks-enabled')?.checked);
      const target = toolTarget(hit);
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, target,
        moveTarget: target?.ownerSVGElement || target, isMarks: !!target?.closest('#marks-layer'), point: hit?.point };
      if (target && hit?.point) {
        event.stopImmediatePropagation(); canvas.setPointerCapture(event.pointerId);
        dispatch(target, 'mousedown', event, hit.point);
      }
      if (event.pointerType === 'mouse' || target) event.preventDefault();
    }, true);
    let hoverFrame=0, latestPointer=null;
    function updateHover(event) {
      const hit = engine.pick(event.clientX, event.clientY, document.getElementById('marks-enabled')?.checked);
      const point = hit?.point;
      if (gesture && event.pointerId === gesture.id) {
        gesture.moved ||= Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6;
        if (point) gesture.point = point;
        if (gesture.target) { event.stopImmediatePropagation(); dispatch(gesture.moveTarget, 'mousemove', event, point); }
      } else if (event.buttons === 0 && (toolTarget() || editingWalls())) dispatch(toolTarget() || cell(point), 'mousemove', event, point);
      const tool = toolTarget();
      const editing = tool || editingWalls();
      const brushSize = tool?.id === 'fog-layer' ? Math.max(1, Math.min(20, Number(document.getElementById('fog-square-size')?.value) || 1))
        : !editing && typeof selectedPlayer !== 'undefined' ? Number(selectedPlayer?.size) || 1 : 1;
      engine.hover(point, !!editing, brushSize);
      const moving = !editing && point && typeof selectedPlayer !== 'undefined' && selectedPlayer;
      canvas.dataset.cursor = hit?.tokenId && !editing ? 'select' : editing ? 'crosshair' : event.buttons ? 'grabbing' : moving ? 'move' : 'grab';
      // Only editors mutate preview geometry. Ordinary hover/camera movement
      // must not rescan all tokens, wall DOM and visibility masks.
      if (editing) api.requestSync();
    }
    canvas.addEventListener('pointermove', event => {
      if ((event.buttons & 6) || touchPointers.size>1) return;
      if (gesture && event.pointerId===gesture.id) gesture.moved ||= Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>6;
      if (gesture?.target) { updateHover(event); return; }
      latestPointer=event;
      if (!hoverFrame) hoverFrame=requestAnimationFrame(()=>{hoverFrame=0;if(active && latestPointer && !(latestPointer.buttons&6))updateHover(latestPointer);});
    }, true);
    canvas.addEventListener('pointerup', event => {
      if (event.pointerType === 'touch') touchPointers.delete(event.pointerId);
      if (!gesture || gesture.id !== event.pointerId) return;
      const g = gesture; gesture = null;
      const hit = engine.pick(event.clientX, event.clientY, document.getElementById('marks-enabled')?.checked);
      if (g.target) {
        dispatch(g.moveTarget, 'mouseup', event, hit?.point || g.point); event.stopImmediatePropagation();
        if (g.isMarks && !g.moved) {
          const now = performance.now();
          if (lastTap && now-lastTap.time < 350 && Math.hypot(lastTap.x-event.clientX,lastTap.y-event.clientY)<6) {
            dispatch(document.querySelector('#marks-layer svg'),'dblclick',event,hit?.point || g.point); lastTap=null;
          } else lastTap={time:now,x:event.clientX,y:event.clientY};
        }
      }
      else if (!g.moved && hit?.point) {
        const editing = editingWalls();
        if (editing && typeof selectedPlayer !== 'undefined') {
          selectedPlayer=null; window.syncSelectedPlayerUi?.(); window.hideMovePreview?.(); window.hideCombatMoveOverlay?.();
        }
        const token = hit.tokenId && !editing ? playerElements.get(hit.tokenId) : null;
        const target = token || cell(hit.point);
        dispatch(target, 'mousedown', event, hit.point);
        dispatch(target, 'mouseup', event, hit.point);
        dispatch(token ? null : target, 'click', event, hit.point);
        const now = performance.now();
        if (lastTap && lastTap.target === target && now - lastTap.time < 350) {
          dispatch(target, 'dblclick', event, hit.point); lastTap = null;
        } else lastTap = { target, time: now };
      }
      api.requestSync();
    }, true);
    canvas.addEventListener('pointercancel', event => { touchPointers.delete(event.pointerId); gesture = null; window.dispatchEvent(new MouseEvent('mouseup')); });
    canvas.addEventListener('pointerleave', () => { latestPointer=null; engine.hover(null); });
    canvas.addEventListener('keydown', e => {
      if (e.key.toLowerCase() === 'f') document.querySelector('.board-3d-toolbar button:nth-child(2)')?.click();
      if (e.key === 'Home') engine.overview();
      if (e.key === '+' || e.key === '=') engine.zoom(.8);
      if (e.key === '-') engine.zoom(1.25);
      api.requestSync();
    });
  }
  for (const name of ['int_local_wall_edges', 'int_wall_preview', 'int_wall_preview_clear']) window.addEventListener(name, () => api.requestSync());
  window.addEventListener('keydown', e => { if (e.key === 'Escape') api.requestSync(); });
  document.addEventListener('visibilitychange', () => engine?.setActive(active && !document.hidden));
})();
