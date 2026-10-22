/* Chef de Poche — pont Joybuy
 * Lancé par le favori « Chef Joybuy » sur www.joybuy.fr, dans TON navigateur.
 * Il lit la mission envoyée par l'appli (dans l'adresse, après #cdp=), puis :
 *  - "prices" : cherche les produits sur Joybuy (prix, note, ventes, nombre d'avis) ;
 *  - "cart"   : ajoute les produits validés à ton panier en cliquant sur les vrais boutons du site.
 * Il renvoie ensuite les résultats à Chef de Poche. Rien n'est envoyé ailleurs.
 */
(() => {
  'use strict';
  if (window.__cdpBridge) { window.__cdpBridge.show(); return; }
  const VERSION = 1;
  const $h = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const b64e = obj => { const bytes = new TextEncoder().encode(JSON.stringify(obj)); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const b64d = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); const bytes = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i); return JSON.parse(new TextDecoder().decode(bytes)); };
  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };

  // ---------- panneau ----------
  const ui = (() => {
    const wrap = $h('div', 'position:fixed;inset:auto 12px 12px 12px;z-index:2147483647;max-width:460px;margin-left:auto;background:#fff;color:#17211A;border:2px solid #2C6A3D;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.25);font:15px/1.45 system-ui,-apple-system,sans-serif;padding:14px 16px;display:flex;flex-direction:column;gap:10px');
    const head = $h('div', 'display:flex;align-items:center;gap:8px');
    head.append($h('strong', 'font-size:16px;flex:1', 'Chef de Poche · Joybuy'));
    const close = $h('button', 'border:0;background:none;font-size:20px;cursor:pointer;color:#5A6A5E', '×'); close.onclick = () => wrap.remove(); head.append(close);
    const msg = $h('div', 'white-space:pre-wrap');
    const bar = $h('div', 'height:6px;border-radius:9px;background:#DAE2D7;overflow:hidden'); const fill = $h('i', 'display:block;height:100%;width:0;background:#2C6A3D;transition:width .3s'); bar.append(fill);
    const btns = $h('div', 'display:flex;flex-wrap:wrap;gap:8px');
    wrap.append(head, msg, bar, btns); document.body.append(wrap);
    return {
      wrap,
      say(t){ msg.textContent = t; },
      progress(p){ bar.hidden = p == null; fill.style.width = Math.round((p || 0) * 100) + '%'; },
      buttons(list){ btns.replaceChildren(...list.map(([label, fn, primary]) => { const b = $h('button', `border:1px solid #2C6A3D;border-radius:10px;padding:9px 14px;font:600 14px system-ui;cursor:pointer;${primary ? 'background:#2C6A3D;color:#fff' : 'background:#fff;color:#2C6A3D'}`, label); b.onclick = fn; return b; })); }
    };
  })();
  window.__cdpBridge = { show(){ if (!ui.wrap.isConnected) document.body.append(ui.wrap); } };

  if (!/(^|\.)joybuy\.fr$/.test(location.hostname)) { ui.progress(null); ui.say("Ce favori marche seulement sur www.joybuy.fr. Ouvre Joybuy depuis Chef de Poche, puis touche le favori."); return; }

  // ---------- mission ----------
  let mission = null;
  const m = location.hash.match(/cdp=([A-Za-z0-9_-]+)/);
  try {
    if (m) { mission = b64d(m[1]); sessionStorage.setItem('cdp-mission', m[1]); }
    else if (sessionStorage.getItem('cdp-mission')) mission = b64d(sessionStorage.getItem('cdp-mission'));
  } catch { mission = null; }
  if (!mission || !mission.type) { ui.progress(null); ui.say("Pas de mission trouvée. Dans Chef de Poche, touche « Chercher sur Joybuy » ou « Remplir mon panier Joybuy », puis touche ce favori sur la page Joybuy qui s'ouvre."); return; }

  // ---------- renvoi des résultats ----------
  function sendBack(result){
    result.v = VERSION; result.at = new Date().toISOString(); result.missionId = mission.id;
    const code = b64e(result);
    window.__cdpLast = result;
    try { sessionStorage.removeItem('cdp-mission'); } catch {}
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
    let sent = false;
    try { if (window.opener && mission.back) { window.opener.postMessage({cdp: 'joybuy', code}, new URL(mission.back).origin); sent = true; } } catch {}
    const backUrl = mission.back ? mission.back.split('#')[0] + '#jb=' + code : null;
    const copy = async () => { try { await navigator.clipboard.writeText('CDPJB:' + code); ui.say('Copié. Dans Chef de Poche, touche « Coller les résultats Joybuy ».'); } catch { ui.say("Copie impossible ici. Utilise le bouton « Revenir à Chef de Poche »."); } };
    const list = [];
    if (backUrl) list.push(['Revenir à Chef de Poche', () => { location.href = backUrl; }, true]);
    list.push(['Copier les résultats', copy]);
    if (result.type === 'cart') list.push(['Voir mon panier', () => { location.href = '/cart'; }]);
    ui.buttons(list);
    return sent;
  }

  // ---------- lecture des résultats de recherche (format React Server Components) ----------
  const salesNum = t => { const mm = String(t || '').replace(',', '.').match(/([\d.]+)\s*(k|m)?\+?/i); if (!mm) return null; let n = parseFloat(mm[1]); if (/k/i.test(mm[2] || '')) n *= 1000; if (/m/i.test(mm[2] || '')) n *= 1e6; return Math.round(n); };
  function unitFromText(t){
    // "2,99 € par kg", "0,72 € par 100 g", "0,04 € par g", "1,20 € par l", "3,10 € par 100 ml"
    const mm = String(t || '').replace(/\s/g, ' ').match(/([\d.,]+)\s*€\s*par\s*([\d.,]*)\s*(kg|g|l|ml|cl|pièce|unité)/i);
    if (!mm) return null;
    const p = num(mm[1]); let q = num(mm[2]) || 1; const u = mm[3].toLowerCase();
    if (u === 'g') return {up: +(p / q * 1000).toFixed(2), base: 'kg'};
    if (u === 'kg') return {up: +(p / q).toFixed(2), base: 'kg'};
    if (u === 'ml') return {up: +(p / q * 1000).toFixed(2), base: 'l'};
    if (u === 'cl') return {up: +(p / q * 100).toFixed(2), base: 'l'};
    if (u === 'l') return {up: +(p / q).toFixed(2), base: 'l'};
    return {up: +(p / q).toFixed(2), base: 'pièce'};
  }
  function parseSearch(txt){
    const out = []; let cur = null;
    const done = () => { if (cur && cur.sku && cur.price) out.push(cur); cur = null; };
    for (const line of txt.split('\n')){
      const c = line.indexOf(':'); if (c < 0) continue;
      const body = line.slice(c + 1);
      if (body[0] !== '{') continue;
      if (body.includes('"voIdentifier":"itemCommonView"')){
        done();
        try { const o = JSON.parse(body); cur = {sku: o.skuId, inStock: o.inStock !== false && o.isAvailable !== false, addable: !o.addToCartDisabled}; } catch { cur = null; }
        continue;
      }
      if (!cur) continue;
      if (body.includes('"itemCompleteView"') || body.includes('"itemCommonView":"$')) { done(); continue; }
      if (!/mainPrice|starRating|brandName|itemTitleView|itemImageView|"priceText"/.test(body)) continue;
      let o; try { o = JSON.parse(body); } catch { continue; }
      if (o.mainPrice != null && cur.price == null){ cur.price = num(o.mainPrice); if (o.crossOffPrice) cur.was = num(o.crossOffPrice); }
      else if (o.voIdentifier === 'itemCommentSaleView'){ cur.rating = num(o.starRating); cur.sold = salesNum(o.saleCountText); }
      else if (o.voIdentifier === 'itemBrandView') cur.brand = o.brandName || '';
      else if (o.voIdentifier === 'itemTitleView') cur.name = o.title || '';
      else if (o.voIdentifier === 'itemImageView' && o.imageUrl) cur.img = o.imageUrl;
      else if (o.priceText && !cur.unit){ const u = unitFromText(o.priceText); if (u){ cur.up = u.up; cur.base = u.base; } cur.unit = o.priceText; }
    }
    done();
    return out.filter(p => p.name);
  }
  const rsc = url => fetch(url + (url.includes('?') ? '&' : '?') + '_rsc=' + Math.random().toString(36).slice(2, 7), {headers: {'RSC': '1'}, credentials: 'include'})
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
  async function reviewsFor(sku){
    const t = await rsc('/dp/x/' + encodeURIComponent(sku));
    const mm = t.match(/"commentCount":(\d+),"goodCount":\d+,"generalCount":\d+,"poorCount":\d+,"goodRate":([\d.]+)/);
    return mm ? {reviews: +mm[1], goodRate: +mm[2]} : {reviews: 0, goodRate: null};
  }
  async function pool(items, n, fn){ let i = 0; const run = async () => { while (i < items.length){ const k = i++; await fn(items[k], k); } }; await Promise.all(Array.from({length: Math.min(n, items.length)}, run)); }

  async function doPrices(){
    const queries = (mission.queries || []).slice(0, 40);
    const known = new Set(mission.knownReviews || []);
    const found = new Map(); let ok = 0, fail = 0;
    ui.say(`Recherche de ${queries.length} produits sur Joybuy…`); ui.progress(0);
    let k = 0;
    await pool(queries, 2, async (q) => {
      try {
        const res = parseSearch(await rsc('/s?k=' + encodeURIComponent(q))).filter(p => p.inStock).slice(0, 10);
        for (const p of res){ const prev = found.get(p.sku); if (prev) prev.q.push(q); else found.set(p.sku, {...p, q: [q]}); }
        // avis : seulement pour les 2 meilleurs candidats de chaque recherche, s'ils ne sont pas déjà connus
        const best = res.filter(p => !known.has(p.sku) && (p.rating || 0) >= 4).sort((a, b) => (b.rating || 0) * Math.log10(10 + (b.sold || 0)) - (a.rating || 0) * Math.log10(10 + (a.sold || 0))).slice(0, 2);
        for (const p of best){ try { Object.assign(found.get(p.sku), await reviewsFor(p.sku)); known.add(p.sku); } catch {} await sleep(150); }
        ok++;
      } catch { fail++; }
      ui.progress(++k / queries.length); ui.say(`Recherche sur Joybuy… ${k}/${queries.length}`);
      await sleep(250);
    });
    const items = [...found.values()];
    ui.progress(1);
    ui.say(`${items.length} produits trouvés pour ${ok} recherches` + (fail ? ` (${fail} en échec)` : '') + '.');
    sendBack({type: 'prices', items, ok, fail});
  }

  // ---------- panier : on clique sur le vrai bouton « Ajouter au panier » de chaque fiche produit ----------
  // Ouvre la fiche produit dans un cadre invisible, règle la quantité avec le bouton « + » du site,
  // puis clique une seule fois sur « Ajouter au panier » (un second clic sur la même page est ignoré par le site).
  // Renvoie le nombre d'unités ajoutées.
  async function addOnce(sku, qty){
    const f = $h('iframe', 'position:fixed;left:-3000px;top:0;width:420px;height:900px;border:0;opacity:0'); f.src = '/dp/x/' + encodeURIComponent(sku);
    document.body.append(f);
    try {
      await new Promise((res, rej) => { f.onload = res; setTimeout(() => rej(new Error('page trop lente')), 20000); });
      const d = f.contentDocument, w = f.contentWindow;
      let btn = null;
      for (let i = 0; i < 60 && !btn; i++){ await sleep(250); btn = [...d.querySelectorAll('button')].find(b => /ajouter au panier/i.test(b.textContent) && !b.disabled); }
      if (!btn) throw new Error('bouton introuvable (produit indisponible ?)');
      let units = 1;
      const inp = d.querySelector('input[aria-label*="quantit" i]');
      if (qty > 1 && inp){
        const plus = [...inp.parentElement.querySelectorAll('[role=button]')].find(e => /ajouter un article/i.test((e.getAttribute('aria-label') || '') + ' ' + (e.nextElementSibling?.getAttribute('aria-label') || '')));
        for (let i = 1; i < qty && plus; i++){ plus.click(); await sleep(250); }
        units = Math.max(1, parseInt(inp.value, 10) || 1);
      }
      const adds = () => w.performance.getEntriesByType('resource').filter(e => /functionId=trade_cart_addItem/.test(e.name)).length;
      const before = adds(); btn.click();
      for (let i = 0; i < 40 && adds() === before; i++) await sleep(200);
      await sleep(600);
      return adds() > before ? units : 0;
    } finally { f.remove(); }
  }
  async function addOne(sku, qty){
    let added = await addOnce(sku, qty);
    // si le « + » n'a pas marché, on complète avec une nouvelle page par unité restante
    for (let tries = 0; added > 0 && added < qty && tries < qty; tries++){ const n = await addOnce(sku, 1); if (!n) break; added += n; }
    return added;
  }
  async function doCart(){
    const items = (mission.items || []).filter(it => it.sku).slice(0, 40);
    const results = []; ui.progress(0);
    for (let i = 0; i < items.length; i++){
      const it = items[i], qty = Math.max(1, Math.min(10, Math.round(it.qty || 1)));
      ui.say(`Ajout au panier ${i + 1}/${items.length} : ${it.name || it.sku}${qty > 1 ? ' ×' + qty : ''}`);
      try { const n = await addOne(it.sku, qty); results.push({sku: it.sku, name: it.name, wanted: qty, added: n}); }
      catch (e) { results.push({sku: it.sku, name: it.name, wanted: qty, added: 0, error: e.message}); }
      ui.progress((i + 1) / items.length);
    }
    const ok = results.filter(r => r.added >= r.wanted).length;
    const bad = results.filter(r => r.added < r.wanted);
    ui.say(`${ok} produit${ok > 1 ? 's' : ''} sur ${results.length} ajouté${ok > 1 ? 's' : ''} à ton panier.` + (bad.length ? `\nÀ vérifier : ${bad.map(r => (r.name || r.sku) + (r.error ? ' (' + r.error + ')' : ` (${r.added}/${r.wanted})`)).join(', ')}` : '') + '\nTu valides et paies toi-même dans ton panier.');
    sendBack({type: 'cart', results});
  }

  ui.buttons([]);
  (mission.type === 'cart' ? doCart() : doPrices()).catch(e => { ui.progress(null); ui.say('Erreur : ' + (e && e.message || e)); });
})();
