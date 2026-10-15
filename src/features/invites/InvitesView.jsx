import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Menu as MenuIcon, UserPlus } from 'lucide-react';
import { HeaderQuota } from '../../components/HeaderQuota.jsx';
import { Menu } from '../../components/Menu.jsx';
import { Toast } from '../../components/Toast.jsx';
import { useEscape } from '../../hooks/useEscape.js';
import { usePresence } from '../../hooks/usePresence.js';
import { cancelInvite, createInvite, fetchInvites, inviteLink, setCanInvite } from './invites.js';

const statusLabels = { pending: 'Not used yet', active: 'Active', cancelled: 'Cancelled' };

function InviteLink({ link }) {
  const [copied, setCopied] = useState(false);
  const input = useRef(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      input.current?.select(); // Clipboard blocked: leave the link selected for a manual copy.
    }
  }
  return <div className="invite-link">
    <input className="setup-code-input" value={link} readOnly onFocus={(event) => event.target.select()} ref={input} aria-label="Invite link" />
    <button className="setup-code-paste" type="button" onClick={copy}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}</button>
  </div>;
}

// Asked before an invite is removed or a user loses access; neither can be undone from the app.
function RemoveDialog({ invite, onConfirm, onClose }) {
  const [shown, closing] = usePresence(invite, 150);
  const id = useId();
  useEscape(Boolean(invite), onClose);
  if (!shown) return null;
  const active = shown.status === 'active';
  return (
    <div className="dialog-layer" data-closing={closing || undefined} role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="add-meal-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`}>
        <h2 id={`${id}-title`}>{active ? `Cancel ${shown.name}'s access?` : `Remove the invite for ${shown.name}?`}</h2>
        <p id={`${id}-text`}>{active ? 'They can no longer use AI estimates. Their slot becomes free for a new invite.' : 'The link stops working and the slot becomes free.'}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose} autoFocus>Keep</button>
          <button className="confirm-danger" type="button" onClick={() => onConfirm(shown)}>{active ? 'Cancel access' : 'Remove invite'}</button>
        </div>
      </section>
    </div>
  );
}

export function InvitesView({ settings, goal, quota, onNavigate, menuOpen, setMenuOpen, username, onLogout, toast, notify }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(null);
  const [removing, setRemoving] = useState(null);
  const invites = data?.invites || [];
  const available = data?.available || 0;

  function show(result) {
    setData(result);
    setCanInvite(Boolean(result.inviter));
  }

  useEffect(() => {
    fetchInvites(settings).then(show).catch((error) => setLoadError(error.message));
  }, [settings.proxyUrl, settings.proxyUsername, settings.proxyKey]);

  async function run(key, action, success) {
    setBusy(key);
    try {
      show(await action());
      if (success) notify(success, 'success');
      return true;
    } catch (error) {
      notify(error.message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function submit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (await run('create', () => createInvite(settings, trimmed), `Invite for ${trimmed} is ready. Copy the link and send it.`)) setName('');
  }

  function remove(invite) {
    setRemoving(null);
    run(invite.name, () => cancelInvite(settings, invite.name), invite.status === 'active' ? `${invite.name}'s access was cancelled.` : 'Invite removed.');
  }

  let content;
  if (settings.aiMode !== 'proxy' || !settings.proxyKey) {
    content = <p className="help-intro">Invites are available with a setup code. Add yours in Settings → AI.</p>;
  } else if (loadError && !data) {
    content = <p className="settings-warning">{loadError}</p>;
  } else if (!data) {
    content = <p className="help-intro">Loading invites…</p>;
  } else if (!data.inviter) {
    content = <p className="help-intro">This account can't send invites.</p>;
  } else {
    content = <>
      <p className="help-intro">Create a link for someone you trust and send it to them. It sets up AI on the device that opens it, until you cancel their access.</p>
      <form className="chart-card invite-form" onSubmit={submit}>
        <div className="card-heading"><h2>New invite</h2><span>{available} of {data.maxInvites} left</span></div>
        <div className="invite-form-row">
          <input className="setup-code-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Their name" maxLength={32} aria-label="Name" disabled={!available} />
          <button className="auth-submit" type="submit" disabled={!available || name.trim().length < 2 || busy === 'create'}><UserPlus aria-hidden="true" />{busy === 'create' ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
      <section className="chart-card">
        <div className="card-heading"><h2>Invited</h2><span>{invites.length}</span></div>
        {invites.length === 0 ? <p className="usage-empty">No invites yet.</p> : <div className="invite-list">
          {invites.map((invite) => (
            <div className="invite-row" key={invite.name}>
              <div className="invite-row-heading">
                <strong>{invite.name}</strong>
                <span className={`invite-status is-${invite.status}`}>{statusLabels[invite.status]}</span>
              </div>
              {invite.status === 'pending' && invite.accessKey && <InviteLink link={inviteLink(settings, invite)} />}
              {invite.status !== 'cancelled' && <div className="invite-actions">
                <button className="settings-discard" type="button" disabled={Boolean(busy)} onClick={() => setRemoving(invite)}>{invite.status === 'active' ? 'Cancel access' : 'Remove'}</button>
              </div>}
            </div>
          ))}
        </div>}
      </section>
    </>;
  }

  return (
    <main className="app-shell invites-page">
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><MenuIcon /></button>
        <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="Daily Fuel home"><span>Daily Fuel</span></button>
        <HeaderQuota quota={quota} />
      </header>
      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} onLogout={onLogout} username={username} goal={goal} />
      <Toast toast={toast} />
      <div className="reports-heading"><div><p className="eyebrow">Invite friends</p><h1>My invites</h1></div></div>
      {content}
      <RemoveDialog invite={removing} onConfirm={remove} onClose={() => setRemoving(null)} />
    </main>
  );
}
