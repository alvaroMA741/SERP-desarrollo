// content.js - SERP Tracker Pro
if (!window.__hundredranks_injected__) {
  window.__hundredranks_injected__ = true;

  (function () {
    const TARGET = 100;
    const PER_PAGE = 10;
    const MAX_PAGE_LIMIT = 50;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const trim = s => (s || '').replace(/\s+/g, ' ').trim();

    function sendProgress(percent, text) {
      try { chrome.runtime.sendMessage({ type: 'progress', percent, text }); } catch (e) {}
    }
    function sendDone(count, text) {
      try { chrome.runtime.sendMessage({ type: 'done', count, text }); } catch (e) {}
    }
    function sendError(text) {
      try { chrome.runtime.sendMessage({ type: 'error', text }); } catch (e) {}
    }

    function getDomainFromUrl(href) {
      try { return (new URL(href)).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
    }

    function getDomainFromCite(node) {
      const cite = node.querySelector('cite.tjvcx, cite.qLRx3b, cite');
      if (!cite) return '';
      return trim(cite.textContent)
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]
        .split(' ')[0]
        .toLowerCase();
    }

    const WORKER_URL = 'https://empty-sea-9c66.alvmartinanton.workers.dev';

    async function resolveGoogleUrl(href, fallback) {
      try {
        const res = await fetch(`${WORKER_URL}/?url=${encodeURIComponent(href)}`);
        const data = await res.json();
        if (data.url && !data.url.includes('google.com')) return data.url;
        return fallback;
      } catch(e) {
        return fallback;
      }
    }

    function normalizeForDedupe(href) {
      try {
        const u = new URL(href);
        const remove = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','yclid','mc_cid','mc_eid'];
        remove.forEach(k => u.searchParams.delete(k));
        u.hash = '';
        return u.toString();
      } catch (e) {
        return href;
      }
    }

    function parseCiteToUrl(citeText) {
      try {
        const parts = citeText.split('›').map(s => s.trim());
        const base = parts[0].trim();
        const url = new URL(base.startsWith('http') ? base : 'https://' + base);
        if (parts.length > 1) {
          const path = parts.slice(1).join('/');
          // Si el path está truncado no lo añadimos
          if (!path.includes('...') && !path.includes('…')) {
            url.pathname = '/' + path;
          }
        }
        return url.toString();
      } catch(e) {
        return citeText;
      }
    }

    function parseDocForResults(doc) {
      const out = [];
      const seen = new Set();
      const anchors = Array.from(doc.querySelectorAll('a[jsname="UWckNb"]'));

      for (const a of anchors) {
        const cite = a.querySelector('cite');
        const h3 = a.querySelector('h3');
        if (!cite || !h3) continue;

        const citeText = trim(cite.textContent);
        if (!citeText) continue;

        // Extraer dominio limpio del cite
        const rawDomain = citeText
          .split('›')[0]          // quedarse con la parte antes del primer ›
          .split('·')[0]          // eliminar parte de fecha (· 21 oct 2025)
          .trim()
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .split('/')[0]
          .split(' ')[0]
          .toLowerCase();

        // Filtrar si no parece un dominio válido
        if (!rawDomain || !rawDomain.includes('.') || seen.has(rawDomain)) continue;
        const domain = rawDomain;
        seen.add(domain);

        const title = trim(h3.textContent);
        if (!title) continue;

        const url = parseCiteToUrl(citeText);
        const href = a.getAttribute('href') || '';

        let description = '';
        const parent = a.closest('[data-ved]') || a.parentElement;
        const snippetSelectors = ['.VwiC3b', '.s3v9rd', '.st', '[data-sncf]', '.IsZvec'];
        for (const sel of snippetSelectors) {
          const el = parent?.querySelector(sel);
          if (el) { description = trim(el.textContent); break; }
        }

        out.push({ title, url, href, domain, description });
      }

      return out;
    }

    function getSearchQuery() {
      try {
        const u = new URL(location.href);
        const q = u.searchParams.get('q');
        if (q) return q;
        const input = document.querySelector('input[name="q"]');
        if (input) return input.value;
        return document.title || '';
      } catch (e) {
        return document.title || '';
      }
    }

    async function fetchAndParsePage(start) {
      const u = new URL(location.href);
      u.searchParams.set('num', String(PER_PAGE));
      u.searchParams.set('start', String(start));
      const pageUrl = u.toString();
      const res = await fetch(pageUrl, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Fetch failed: ' + res.status);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return { doc, pageUrl };
    }

    async function doExport() {
      try {
        const results = [];
        const seen = new Set();
        let pageIndex = 0;
        let consecutiveNoNew = 0;

        while (results.length < TARGET && pageIndex < MAX_PAGE_LIMIT && consecutiveNoNew < 4) {
          sendProgress(Math.round((results.length / TARGET) * 100), `Fetching page ${pageIndex + 1}...`);
          try {
            const { doc } = await fetchAndParsePage(pageIndex * PER_PAGE);
            const pageResults = parseDocForResults(doc);

            let addedThisPage = 0;
            for (const r of pageResults) {
              const norm = r.domain;
              if (seen.has(norm)) continue;
              seen.add(norm);
              results.push(r);
              addedThisPage++;
              if (results.length >= TARGET) break;
            }

            if (addedThisPage === 0) consecutiveNoNew++;
            else consecutiveNoNew = 0;
          } catch (err) {
            consecutiveNoNew++;
          }
          pageIndex++;
          await sleep(600);
        }

        const final = results.slice(0, TARGET);
        const rows = final.map((r, i) => `${i + 1},"${String(r.title).replace(/"/g, '""')}","${r.domain}","${r.description || ''}"`);
        const csv = ['Position,Title,Domain,Description', ...rows].join('\r\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const urlBlob = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlBlob;
        a.download = 'SERPTrackerPro_Top100.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(urlBlob); a.remove(); }, 2000);

        sendDone(final.length, `Export complete — ${final.length} rows downloaded.`);
      } catch (e) {
        sendError('Export failed: ' + (e && e.message));
      }
    }

    async function doCheckDomain(domainInput) {
      try {
        const domainToCheck = (domainInput || '').toLowerCase()
          .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
        if (!domainToCheck) { sendError('Invalid domain'); return; }

        const keyword = getSearchQuery() || '(current query)';
        const seen = new Set();
        let pageIndex = 0;
        let position = 0;
        let consecutiveNoNew = 0;

        while (pageIndex < MAX_PAGE_LIMIT && position < TARGET && consecutiveNoNew < 4) {
          sendProgress(Math.round((position / TARGET) * 100), `Scanning page ${pageIndex + 1}...`);
          try {
            const { doc } = await fetchAndParsePage(pageIndex * PER_PAGE);
            const pageResults = parseDocForResults(doc);

            let addedThisPage = 0;
            for (const r of pageResults) {
              const norm = r.domain;
              if (seen.has(norm)) continue;
              seen.add(norm);
              position++;
              addedThisPage++;

              if (r.domain === domainToCheck || r.domain.endsWith('.' + domainToCheck) || r.domain.includes(domainToCheck)) {
                let finalUrl = r.url;
                if (r.href) {
                  finalUrl = await resolveGoogleUrl(r.href, r.url);
                }
                chrome.runtime.sendMessage({
                  type: 'result',
                  position,
                  keyword,
                  url: finalUrl,
                  title: r.title,
                  description: r.description || ''
                });
                return;
              }

              if (position >= TARGET) break;
            }

            if (addedThisPage === 0) consecutiveNoNew++;
            else consecutiveNoNew = 0;
          } catch (err) {
            consecutiveNoNew++;
          }
          pageIndex++;
          await sleep(600);
        }

        if (position === 0) {
          chrome.runtime.sendMessage({ type: 'result', text: `No organic results found for '${keyword}'.` });
        } else {
          chrome.runtime.sendMessage({ type: 'result', text: `Domain not found in top ${position} results for '${keyword}'.` });
        }
      } catch (e) {
        sendError('Domain check failed: ' + (e && e.message));
      }
    }

    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || !msg.action) return;
      if (msg.action === 'export') doExport();
      else if (msg.action === 'checkDomain') doCheckDomain(msg.domain);
    });
  })();
}
