export const defaultSettings = { aiMode: 'manual', proxyUrl: '', proxyUsername: '', proxyKey: '', provider: 'google', googleKey: '', googleModel: 'gemini-3.5-flash-lite', openaiKey: '', openaiModel: 'gpt-4o-mini', mealOrder: 'asc' };

export const aiModeLabels = { proxy: 'Setup code', manual: 'Own API key' };

// Only one AI config may hold credentials at a time: keep the active one, reset the other.
export function exclusiveAiSettings(settings) {
  if (settings.aiMode === 'proxy') {
    return { ...settings, provider: defaultSettings.provider, googleKey: '', googleModel: defaultSettings.googleModel, openaiKey: '', openaiModel: defaultSettings.openaiModel };
  }
  return { ...settings, aiMode: 'manual', proxyUrl: '', proxyUsername: '', proxyKey: '' };
}

export function isAiConfigured(settings) {
  if (settings.aiMode === 'proxy') return Boolean(settings.proxyUrl && settings.proxyUsername && settings.proxyKey);
  return Boolean(settings.provider === 'openai' ? settings.openaiKey : settings.googleKey);
}
