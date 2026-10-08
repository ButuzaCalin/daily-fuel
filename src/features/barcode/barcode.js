const retailFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export function validBarcode(code) {
  return /^\d{8,14}$/.test(code);
}

// Native BarcodeDetector where available (Android Chrome); ZXing elsewhere (iOS Safari, Firefox).
export async function createDetector() {
  if ('BarcodeDetector' in window) {
    const supported = await window.BarcodeDetector.getSupportedFormats().catch(() => []);
    const formats = retailFormats.filter((format) => supported.includes(format));
    if (formats.length) {
      const detector = new window.BarcodeDetector({ formats });
      return async (video) => (await detector.detect(video))[0]?.rawValue || null;
    }
  }
  const { BrowserMultiFormatOneDReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatOneDReader();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!video.videoWidth) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    try {
      return reader.decodeFromCanvas(canvas).getText();
    } catch {
      return null;
    }
  };
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function per100(nutriments) {
  const kcal = nutriments['energy-kcal_100g'] ?? (nutriments.energy_100g != null ? nutriments.energy_100g / 4.184 : null);
  const values = { calories: kcal, proteins: nutriments.proteins_100g, carbs: nutriments.carbohydrates_100g, fats: nutriments.fat_100g };
  if (Object.values(values).every((value) => value == null || !Number.isFinite(Number(value)))) return null;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number.isFinite(Number(value)) ? round(Number(value)) : 0]));
}

function productName(product) {
  const name = (product.product_name || product.generic_name || '').trim();
  return name || (product.brands || '').split(',')[0].trim();
}

// Returns null when Open Food Facts doesn't know the code.
export async function lookupProduct(code) {
  const fields = 'product_name,generic_name,brands,serving_quantity,nutriments';
  let response;
  try {
    response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`);
  } catch {
    throw new Error('Could not reach Open Food Facts. Check your connection.');
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Open Food Facts is unavailable. Try again in a moment.');
  const { status, product } = await response.json();
  if (status !== 1 || !product) return null;
  const serving = Number(product.serving_quantity);
  return {
    code,
    name: productName(product) || `Product ${code}`,
    per100: per100(product.nutriments || {}),
    servingGrams: serving > 0 ? round(serving) : null,
  };
}
