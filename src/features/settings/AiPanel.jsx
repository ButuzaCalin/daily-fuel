import { useState } from 'react';
import { fetchProxyQuota } from '../ai/proxy.js';
import { SetupCodePaste } from '../ai/SetupCodePaste.jsx';
import { aiModeLabels, exclusiveAiSettings, isAiConfigured } from '../ai/settings.js';
import { SecretInput } from './SecretInput.jsx';

export function AiPanel({ settings, setSettings, notify }) {
  const [draft, setDraft] = useState(settings);
  const [checking, setChecking] = useState(false);
  function update(key, value) { setDraft((current) => ({ ...current, [key]: value })); }
  const activeMode = settings.aiMode === 'proxy' ? 'proxy' : 'manual';
  const draftMode = draft.aiMode === 'proxy' ? 'proxy' : 'manual';
  const willReplace = draftMode !== activeMode && isAiConfigured(settings);
  const changed = Object.keys(draft).some((key) => draft[key] !== settings[key]);
  async function save(candidate) {
    let quota = null;
    if (candidate.aiMode === 'proxy') {
      if (!candidate.proxyUrl || !candidate.proxyUsername || !candidate.proxyKey) return notify('Paste your setup code, or enter the proxy URL, username and access key.');
      if (!/^https?:\/\//.test(candidate.proxyUrl)) return notify('The proxy URL must start with https://');
      // Check the details before saving, so a typo shows up here rather than on the first estimate.
      setChecking(true);
      try {
        quota = await fetchProxyQuota(candidate);
      } catch (error) {
        return notify(`Couldn't connect: ${error.message}`);
      } finally {
        setChecking(false);
      }
    } else if (!isAiConfigured(candidate)) {
      return notify(`Enter your ${candidate.provider === 'openai' ? 'OpenAI' : 'Google'} API key.`);
    }
    const next = exclusiveAiSettings(candidate);
    const switched = next.aiMode !== settings.aiMode;
    setSettings(next);
    setDraft(next);
    if (quota) notify(`Connected. ${quota.remaining} of ${quota.limit} AI requests left today.`, 'success');
    else notify(switched ? `Switched to ${aiModeLabels[next.aiMode]}.` : 'Settings saved.', 'success');
  }
  function saveSettings(event) {
    event.preventDefault();
    save(draft);
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
        <p className="settings-hint">Paste the setup code you received, or open your setup link on this device. Meal details or profile answers for goal suggestions are sent to the AI server.</p>
        <SetupCodePaste onCode={(proxySettings) => save({ ...draft, ...proxySettings })} busy={checking} notify={notify} />
        <details className="setup-details" open={Boolean(settings.aiMode === 'proxy' && settings.proxyUrl) || undefined}>
          <summary>Enter details manually</summary>
          <label>Proxy URL<input type="url" inputMode="url" placeholder="https://…" value={draft.proxyUrl} onChange={(event) => update('proxyUrl', event.target.value.trim())} autoComplete="off" /></label>
          <label>Username<input value={draft.proxyUsername} onChange={(event) => update('proxyUsername', event.target.value)} autoComplete="username" autoCapitalize="none" /></label>
          <SecretInput label="Access key" value={draft.proxyKey} onChange={(value) => update('proxyKey', value)} />
        </details>
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
        <button className="auth-submit" type="submit" disabled={!changed || checking}>{checking ? 'Checking…' : willReplace ? `Switch to ${aiModeLabels[draftMode]}` : changed ? 'Save settings' : 'Saved'}</button>
      </div>
    </form>
  );
}
