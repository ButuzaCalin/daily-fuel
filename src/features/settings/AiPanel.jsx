import { useState } from 'react';
import { aiModeLabels, exclusiveAiSettings, isAiConfigured } from '../ai/settings.js';
import { SecretInput } from './SecretInput.jsx';

export function AiPanel({ settings, setSettings, notify }) {
  const [draft, setDraft] = useState(settings);
  function update(key, value) { setDraft((current) => ({ ...current, [key]: value })); }
  const activeMode = settings.aiMode === 'proxy' ? 'proxy' : 'manual';
  const draftMode = draft.aiMode === 'proxy' ? 'proxy' : 'manual';
  const willReplace = draftMode !== activeMode && isAiConfigured(settings);
  const changed = Object.keys(draft).some((key) => draft[key] !== settings[key]);
  function saveSettings(event) {
    event.preventDefault();
    if (draft.aiMode === 'proxy') {
      if (!draft.proxyUrl || !draft.proxyUsername || !draft.proxyKey) return notify('Enter the proxy URL, username and access key.');
      if (!/^https?:\/\//.test(draft.proxyUrl)) return notify('The proxy URL must start with https://');
    } else if (!isAiConfigured(draft)) {
      return notify(`Enter your ${draft.provider === 'openai' ? 'OpenAI' : 'Google'} API key.`);
    }
    const next = exclusiveAiSettings(draft);
    const switched = next.aiMode !== settings.aiMode;
    setSettings(next);
    setDraft(next);
    notify(switched ? `Switched to ${aiModeLabels[next.aiMode]}.` : 'Settings saved.', 'success');
  }
  return (
    <form className="settings-form" onSubmit={saveSettings}>
      <div className="settings-section-heading">
        <div>
          <h2>AI config</h2>
          <p className="ai-active">
            <span className={`ai-active-dot${isAiConfigured(settings) ? ' is-on' : ''}`} aria-hidden="true" />
            In use: <strong>{aiModeLabels[activeMode]}</strong>{!isAiConfigured(settings) && ' · not set up'}
          </p>
        </div>
        <div className="period-toggle" role="group" aria-label="AI configuration">
          {Object.entries(aiModeLabels).map(([mode, label]) => <button key={mode} className={draftMode === mode ? 'active' : ''} type="button" onClick={() => update('aiMode', mode)} aria-pressed={draftMode === mode}>{label}</button>)}
        </div>
      </div>
      {willReplace && <p className="settings-warning">Saving switches to {aiModeLabels[draftMode]} and removes your {aiModeLabels[activeMode]} details from this device.</p>}
      {draft.aiMode === 'proxy' ? <>
        <p className="settings-hint">Estimates are sent to your own endpoint, which holds the AI key. Meal details or profile answers for goal suggestions are sent.</p>
        <label>Proxy URL<input type="url" inputMode="url" placeholder="https://…" value={draft.proxyUrl} onChange={(event) => update('proxyUrl', event.target.value.trim())} autoComplete="off" /></label>
        <label>Username<input value={draft.proxyUsername} onChange={(event) => update('proxyUsername', event.target.value)} autoComplete="username" autoCapitalize="none" /></label>
        <SecretInput label="Access key" value={draft.proxyKey} onChange={(value) => update('proxyKey', value)} />
      </> : <>
        <label>Provider<select value={draft.provider} onChange={(event) => update('provider', event.target.value)}><option value="google">Google AI</option><option value="openai">OpenAI</option></select></label>
        {draft.provider === 'google' ? <div className="settings-pair">
          <SecretInput label="API key" value={draft.googleKey} onChange={(value) => update('googleKey', value)} />
          <label>Model<input value={draft.googleModel} onChange={(event) => update('googleModel', event.target.value)} autoCapitalize="none" spellCheck="false" /></label>
        </div> : <div className="settings-pair">
          <SecretInput label="API key" value={draft.openaiKey} onChange={(value) => update('openaiKey', value)} />
          <label>Model<input value={draft.openaiModel} onChange={(event) => update('openaiModel', event.target.value)} autoCapitalize="none" spellCheck="false" /></label>
        </div>}
      </>}
      <div className="settings-actions">
        {changed && <button className="settings-discard" type="button" onClick={() => setDraft(settings)}>Discard</button>}
        <button className="auth-submit" type="submit" disabled={!changed}>{willReplace ? `Switch to ${aiModeLabels[draftMode]}` : changed ? 'Save settings' : 'Saved'}</button>
      </div>
    </form>
  );
}
