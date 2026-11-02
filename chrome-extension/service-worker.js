const HOST = 'com.jaystarbliss.hubmind';
let nativePort = null;
let reconnectTimer = null;
function connect() {
  if (nativePort) return;
  try {
    nativePort = chrome.runtime.connectNative(HOST);
    nativePort.onMessage.addListener(message => {
      void dispatch(message).then(result => nativePort?.postMessage({ id: message.id, result }))
        .catch(error => nativePort?.postMessage({ id: message.id, result: { ok: false, verified: false, error: String(error?.message || error) } }));
    });
    nativePort.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message;
      console.warn('[Jess Chrome Bridge] Native host disconnected:', error || 'disconnected');
      nativePort = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 2500);
    });
  } catch (error) {
    console.warn('[Jess Chrome Bridge] Could not connect to native host:', error);
    nativePort = null;
    reconnectTimer = setTimeout(connect, 5000);
  }
}
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('No active Chrome tab is available.');
  return tab;
}
async function tabById(id) {
  const tab = id ? await chrome.tabs.get(Number(id)) : await activeTab();
  if (!tab?.id) throw new Error('Chrome tab not found.');
  return tab;
}
async function dispatch(message) {
  const a = message?.args && typeof message.args === 'object' ? message.args : {};
  switch (message?.method) {
    case 'chrome_list_tabs': {
      const tabs = await chrome.tabs.query({});
      return { ok: true, verified: true, evidence: tabs.slice(0, 100).map(t => ({ id: t.id, windowId: t.windowId, title: t.title || '', url: t.url || '', active: !!t.active, index: t.index, status: t.status })) };
    }
    case 'chrome_open_tab': {
      const url = normalizeUrl(a.url);
      const tab = await chrome.tabs.create({ url, active: a.active !== false });
      return { ok: true, verified: !!tab.id, evidence: { id: tab.id, url: tab.url || url, windowId: tab.windowId, active: tab.active } };
    }
    case 'chrome_close_tab': {
      if (!Number.isInteger(Number(a.tabId)) || Number(a.tabId) < 1) throw new Error('A specific tabId is required to close a tab.');
      const tab = await tabById(a.tabId);
      await chrome.tabs.remove(tab.id);
      let stillExists = true; try { await chrome.tabs.get(tab.id); } catch { stillExists = false; }
      return { ok: !stillExists, verified: !stillExists, evidence: { tabId: tab.id, closed: !stillExists } };
    }
    case 'chrome_activate_tab': {
      const tab = await tabById(a.tabId);
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      const current = await chrome.tabs.get(tab.id);
      return { ok: current.active === true, verified: current.active === true, evidence: { id: current.id, title: current.title, url: current.url, active: current.active, windowId: current.windowId } };
    }
    case 'chrome_navigate_tab': {
      const tab = await tabById(a.tabId);
      const url = normalizeUrl(a.url);
      await chrome.tabs.update(tab.id, { url, active: a.active !== false });
      await new Promise(resolve => setTimeout(resolve, 700));
      const current = await chrome.tabs.get(tab.id);
      return { ok: current.url === url || current.url?.startsWith(url), verified: current.url === url || current.url?.startsWith(url), evidence: { id: current.id, title: current.title, url: current.url, status: current.status, requestedUrl: url } };
    }
    case 'chrome_reload_tab': {
      const tab = await tabById(a.tabId);
      await chrome.tabs.reload(tab.id);
      return { ok: true, verified: false, evidence: { tabId: tab.id, note: 'Reload requested; page completion must be checked with chrome_read_page.' } };
    }
    case 'chrome_scroll': {
      const tab = await tabById(a.tabId);
      const delta = Number.isFinite(Number(a.delta)) ? Math.max(-10000, Math.min(10000, Number(a.delta))) : 600;
      const axis = a.axis === 'x' ? 'x' : 'y';
      const target = String(a.target || '').slice(0, 300);
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: ({ delta, axis, target }) => {
          const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
          const candidates = Array.from(document.querySelectorAll('html, body, main, aside, section, article, div, [role="main"], [role="dialog"], [data-scrollable]')).filter(el => {
            if (!(el instanceof HTMLElement) || !visible(el)) return false;
            const style = getComputedStyle(el);
            const overflow = axis === 'x' ? style.overflowX : style.overflowY;
            const extent = axis === 'x' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
            return extent > 8 && (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay' || el === document.body || el === document.documentElement);
          }).map(el => {
            const label = [el.getAttribute('aria-label'), el.getAttribute('title'), el.id, typeof el.className === 'string' ? el.className : '', (el.innerText || '').slice(0, 120)].join(' ').toLowerCase();
            const r = el.getBoundingClientRect();
            const extent = axis === 'x' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
            return { el, label, extent, area: r.width * r.height, tag: el.tagName, id: el.id || '', className: typeof el.className === 'string' ? el.className.slice(0, 160) : '', before: (el === document.documentElement || el === document.body) ? (axis === 'x' ? window.scrollX : window.scrollY) : (axis === 'x' ? el.scrollLeft : el.scrollTop), max: extent };
          });
          const needle = target.toLowerCase().trim();
          candidates.sort((a,b) => {
            const am = needle && a.label.includes(needle) ? 1 : 0, bm = needle && b.label.includes(needle) ? 1 : 0;
            return bm-am || b.area-a.area;
          });
          const chosen = candidates.find(c => !needle || c.label.includes(needle)) || (!needle ? candidates[0] : null);
          if (!chosen) return { changed: false, error: needle ? 'No scrollable container matched that target. Omit target to scroll the largest visible container.' : 'No scrollable container was found.', candidates: candidates.slice(0, 8).map(c => ({ tag:c.tag,id:c.id,className:c.className,max:c.max })) };
          if (chosen.el === document.documentElement || chosen.el === document.body) window.scrollBy({ left: axis === 'x' ? delta : 0, top: axis === 'y' ? delta : 0, behavior: 'instant' });
          else if (axis === 'x') chosen.el.scrollBy({ left: delta, behavior: 'instant' }); else chosen.el.scrollBy({ top: delta, behavior: 'instant' });
          const after = (chosen.el === document.documentElement || chosen.el === document.body) ? (axis === 'x' ? window.scrollX : window.scrollY) : (axis === 'x' ? chosen.el.scrollLeft : chosen.el.scrollTop);
          return { changed: chosen.before !== after, before: chosen.before, after, max: chosen.max, axis, delta, target: target || null, container: { tag: chosen.tag, id: chosen.id, className: chosen.className }, title: document.title, url: location.href };
        },
        args: [{ delta, axis, target }],
      });
      return { ok: !!result?.result && !result.result.error, verified: result?.result?.changed === true, evidence: { tabId: tab.id, ...result?.result } };
    }
    case 'chrome_capture_screenshot': {
      const tab = await tabById(a.tabId);
      if (!tab.active) return { ok: false, verified: false, error: 'Activate the target Chrome tab first; screenshots are captured only from the visible tab.' };
      const raw = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 45 });
      const response = await fetch(raw);
      const bitmap = await createImageBitmap(await response.blob());
      try {
        const scale = Math.min(1, 320 / bitmap.width, 180 / bitmap.height);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not create a screenshot compression canvas.');
        context.drawImage(bitmap, 0, 0, width, height);
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.5 });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        const dataUrl = 'data:image/jpeg;base64,' + btoa(binary);
        return { ok: true, verified: true, evidence: { dataUrl, title: tab.title || '', url: tab.url || '', tabId: tab.id, width, height, capturedAt: new Date().toISOString(), note: 'Compressed screenshot preview captured; the assistant receives metadata and a preview URL, not direct visual pixels for analysis.' } };
      } finally { bitmap.close(); }
    }
    case 'chrome_read_page': {
      const tab = await tabById(a.tabId);
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ title: document.title, url: location.href, text: (document.body?.innerText || '').slice(0, 20000), readyState: document.readyState }) });
      return { ok: true, verified: !!result?.result?.text, evidence: { tabId: tab.id, ...result?.result } };
    }
    case 'chrome_find_element': {
      const tab = await tabById(a.tabId);
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: ({ selector, text }) => {
        const nodes = selector ? Array.from(document.querySelectorAll(selector)).slice(0, 20) : Array.from(document.querySelectorAll('button,a,input,textarea,select,[role="button"],[role="link"]')).slice(0, 2000);
        const needle = String(text || '').toLowerCase();
        const node = nodes.find(el => !needle || ((el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '').toLowerCase().includes(needle)));
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { tag: node.tagName, text: (node.innerText || node.getAttribute('aria-label') || node.getAttribute('placeholder') || '').slice(0, 500), selector: selector || '', rect: { x: r.x, y: r.y, width: r.width, height: r.height }, disabled: !!node.disabled };
      }, args: [{ selector: String(a.selector || '').slice(0, 500), text: String(a.text || '').slice(0, 500) }] });
      return { ok: !!result?.result, verified: !!result?.result, evidence: { tabId: tab.id, element: result?.result || null } };
    }
    case 'chrome_click_element': {
      const tab = await tabById(a.tabId);
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: ({ selector, text }) => {
        const nodes = selector ? Array.from(document.querySelectorAll(selector)).slice(0, 20) : Array.from(document.querySelectorAll('button,a,[role="button"],[role="link"]')).slice(0, 2000);
        const needle = String(text || '').toLowerCase();
        const node = nodes.find(el => !needle || ((el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase().includes(needle)));
        if (!node || node.disabled) return { clicked: false };
        node.click(); return { clicked: true, text: (node.innerText || node.getAttribute('aria-label') || '').slice(0, 300), href: node.href || null };
      }, args: [{ selector: String(a.selector || '').slice(0, 500), text: String(a.text || '').slice(0, 500) }] });
      return { ok: !!result?.result?.clicked, verified: false, evidence: { tabId: tab.id, ...result?.result, note: 'Click dispatched; use chrome_read_page to verify the resulting state.' } };
    }
    case 'chrome_fill_field': {
      const tab = await tabById(a.tabId);
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: ({ selector, value }) => {
        const el = document.querySelector(selector);
        if (!el || !('value' in el) || el.disabled) return { filled: false, error: 'Field was not found or is disabled.' };
        const type = String(el.type || '').toLowerCase();
        const label = [el.getAttribute('aria-label'), el.getAttribute('autocomplete'), el.getAttribute('name'), el.getAttribute('id'), el.getAttribute('placeholder')].filter(Boolean).join(' ').toLowerCase();
        if (type === 'password' || /password|credit.?card|card.?number|cvv|cvc|security.?code|one.?time.?code|otp|payment/.test(label)) {
          return { filled: false, error: 'Jess is blocked from filling password, payment, card, security-code or one-time-code fields.' };
        }
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        return { filled: el.value === value, value: String(el.value).slice(0, 500), tag: el.tagName };
      }, args: [{ selector: String(a.selector || '').slice(0, 500), value: String(a.value || '').slice(0, 10000) }] });
      return { ok: !!result?.result?.filled, verified: !!result?.result?.filled, evidence: { tabId: tab.id, ...result?.result } };
    }
    default: throw new Error('Unsupported Chrome action: ' + message?.method);
  }
}
function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2048) throw new Error('Provide a valid URL.');
  const url = /^[a-z]+:\/\//i.test(raw) ? raw : 'https://' + raw;
  const parsed = new URL(url);
  if (!['http:','https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS pages can be controlled.');
  return parsed.href;
}
connect();
