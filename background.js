// background.js - SERP Tracker Pro
const PRODUCT_SECRET  = 'prod_sk_VvA5J_e8b7f500d75b1ce72d8620c27526366f61ce2ffb';
const SUPABASE_URL    = 'https://kpiyhxpukotnykyorsss.supabase.co';
const SUPABASE_KEY    = 'sb_publishable_Ypcv9YFkMLFq8HUHjatYLg_NsR_Od7v';
const MAX_ACTIVATIONS = 2;

// Genera un ID único y persistente para este dispositivo
async function getDeviceId() {
  const stored = await chrome.storage.local.get('device_id');
  if (stored.device_id) return stored.device_id;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ device_id: id });
  return id;
}

// Headers para Supabase
function supabaseHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

// Contar activaciones de una key
async function countActivations(licenseKey) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/activations?license_key=eq.${encodeURIComponent(licenseKey)}&select=id`,
    { headers: supabaseHeaders() }
  );
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

// Comprobar si este dispositivo ya está activado
async function isDeviceActivated(licenseKey, deviceId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/activations?license_key=eq.${encodeURIComponent(licenseKey)}&device_id=eq.${encodeURIComponent(deviceId)}&select=id`,
    { headers: supabaseHeaders() }
  );
  const data = await res.json();
  return Array.isArray(data) && data.length > 0;
}

// Registrar activación
async function registerActivation(licenseKey, deviceId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/activations`, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify({ license_key: licenseKey, device_id: deviceId })
  });
  return res.ok;
}

// Eliminar activación
async function removeActivation(licenseKey, deviceId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/activations?license_key=eq.${encodeURIComponent(licenseKey)}&device_id=eq.${encodeURIComponent(deviceId)}`,
    { method: 'DELETE', headers: supabaseHeaders() }
  );
  return res.ok;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.action === 'resolveUrl') {
    (async () => {
      try {
        const res = await fetch(msg.href, { redirect: 'follow' });
        sendResponse({ ok: true, url: res.url });
      } catch (e) {
        sendResponse({ ok: false, url: msg.href });
      }
    })();
    return true;
  }

  if (msg.action === 'verifyLicense') {
    (async () => {
      try {
        // 1. Verificar key en Payhip
        const payhipRes = await fetch(
          `https://payhip.com/api/v2/license/verify?license_key=${encodeURIComponent(msg.key)}`,
          { method: 'GET', headers: { 'product-secret-key': PRODUCT_SECRET, 'Accept': 'application/json' } }
        );
        const payhipData = await payhipRes.json();
        if (!payhipData.data || !payhipData.data.enabled) {
          sendResponse({ ok: false, error: 'Invalid or disabled license key.' });
          return;
        }

        // 2. Obtener device ID
        const deviceId = await getDeviceId();

        // 3. Comprobar si este dispositivo ya está activado
        const alreadyActivated = await isDeviceActivated(msg.key, deviceId);
        if (alreadyActivated) {
          sendResponse({ ok: true }); // ya activado en este dispositivo
          return;
        }

        // 4. Contar activaciones totales
        const count = await countActivations(msg.key);
        if (count >= MAX_ACTIVATIONS) {
          sendResponse({ ok: false, error: `License already used on ${MAX_ACTIVATIONS} devices. Deactivate one first.` });
          return;
        }

        // 5. Registrar activación
        const registered = await registerActivation(msg.key, deviceId);
        if (registered) {
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'Could not register activation. Please try again.' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: 'Connection error. Please try again.' });
      }
    })();
    return true;
  }

  if (msg.action === 'deactivateLicense') {
    (async () => {
      try {
        const deviceId = await getDeviceId();
        await removeActivation(msg.key, deviceId);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }
});
