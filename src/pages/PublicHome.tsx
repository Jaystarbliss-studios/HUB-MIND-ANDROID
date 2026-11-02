import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ArrowRight, ArrowUpRight, Bell, Check, Download, FileText, FolderKanban, Layers, LockKeyhole, Menu, MessageCircle, X } from 'lucide-react';

const FEATURES = [
  { icon: FolderKanban, title: 'Your work, in one place', text: 'Projects, tasks, documents, meetings and follow-ups in one calm workspace.' },
  { icon: MessageCircle, title: 'Meet Jess', text: 'A thoughtful AI assistant designed to help you research, plan, write and keep moving.' },
  { icon: Bell, title: 'A more useful inbox', text: 'Keep messages, notifications, drafts and important captures organised together.' },
  { icon: LockKeyhole, title: 'Private by design', text: 'Your workspace stays invitation-based, with access controls and clear ownership.' },
];

export function PublicHome() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteValue, setInviteValue] = useState('');
  const [error, setError] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [release, setRelease] = useState<{ url: string; name: string; version: string; extensionUrl?: string } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);

  useEffect(() => {
    const root = document.querySelector('.hm-public');
    if (!root) return;
    root.classList.add('hm-motion-ready');
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('.hm-reveal'));
    if (!('IntersectionObserver' in window)) { nodes.forEach(node => node.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    fetch('https://api.github.com/repos/Jaystarbliss-studios/HUB-MIND/releases/latest')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('No public release yet')))
      .then(data => {
        const asset = (data.assets || []).find((item: any) => /\.exe$/i.test(item.name));
        const extension = (data.assets || []).find((item: any) => /Jess-Chrome-Extension\.zip$/i.test(item.name));
        if (active && asset) setRelease({ url: asset.browser_download_url, name: asset.name, version: data.tag_name || 'Latest', extensionUrl: extension?.browser_download_url });
      })
      .catch(() => { if (active) setRelease(null); });
    return () => { active = false; };
  }, []);


  useEffect(() => {
    const capture = (event: Event) => { setInstallPrompt(event); };
    window.addEventListener('beforeinstallprompt', capture);
    return () => window.removeEventListener('beforeinstallprompt', capture);
  }, []);

  const installWebApp = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      setInstallPrompt(null);
      return;
    }
    setInstallHelpOpen(true);
  };

  const openWorkspace = () => {
    if (loading) return;
    if (user && profile?.status === 'active') navigate('/workspace');
    else navigate('/login');
  };

  const submitInvite = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const raw = inviteValue.trim();
    if (!raw) { setError('Paste your invitation link or enter the invitation code.'); return; }
    let id = raw;
    try {
      if (/^https?:\/\//i.test(raw)) {
        const url = new URL(raw);
        id = url.searchParams.get('invite') || '';
      } else if (raw.includes('?') || raw.includes('/')) {
        const url = new URL(raw, window.location.origin);
        id = url.searchParams.get('invite') || '';
      }
    } catch { /* handled by validation below */ }
    id = id.trim();
    if (!/^[A-Za-z0-9_-]{8,160}$/.test(id)) {
      setError('That does not look like a valid Hub-Mind invitation. Use the full invitation link or its invitation ID.');
      return;
    }
    navigate('/login?invite=' + encodeURIComponent(id));
  };

  return (
    <div className="hm-public min-h-screen overflow-hidden">
      <header className="hm-nav">
        <a href="/" className="hm-brand" aria-label="Hub-Mind home">
          <span className="hm-brand-mark"><img src="/hub-mind%20logo.png" alt="" /></span>
          <span>Hub<span className="hm-brand-dash">-</span>Mind</span>
        </a>
        <nav className={mobileMenu ? 'hm-nav-links is-open' : 'hm-nav-links'}>
          <a href="#features" onClick={() => setMobileMenu(false)}>Workspace</a>
          <a href="#jess" onClick={() => setMobileMenu(false)}>Meet Jess</a>
          <a href="#desktop" onClick={() => setMobileMenu(false)}>Windows app</a>
        </nav>
        <div className="hm-nav-actions">
          <button className="hm-button hm-button-quiet hm-nav-invite" onClick={() => setInviteOpen(true)}>Get Invite</button>
          <button className="hm-button hm-button-primary hm-nav-open" onClick={openWorkspace}>Open workspace <ArrowUpRight size={16}/></button>
        </div>
        <button className="hm-mobile-toggle" aria-label="Toggle navigation" onClick={() => setMobileMenu(v => !v)}>{mobileMenu ? <X/> : <Menu/>}</button>
      </header>

      <main>
        <section className="hm-hero">
          <div className="hm-hero-glow hm-glow-one" /><div className="hm-hero-glow hm-glow-two" />
          <div className="hm-hero-copy">
            <h1>Welcome to<br/><span>Hub-Mind.</span></h1>
            <p className="hm-hero-description">A quieter place to bring your work together. Plan the day, move projects forward, keep your knowledge close — and let Jess help with the busywork.</p>
            <div className="hm-hero-actions">
              <button className="hm-button hm-button-primary hm-button-large" onClick={openWorkspace}>Open Workspace <ArrowRight size={17}/></button>
              <button className="hm-button hm-button-outline hm-button-large" onClick={() => setInviteOpen(true)}>Get Invite</button>
            </div>
            <div className="hm-trust-line"><LockKeyhole size={14}/> Private, invitation-based access <span>·</span> Built for focused work</div>
          </div>
          <div className="hm-hero-art" aria-label="Hub-Mind workspace preview">
            <div className="hm-hero-window-wrapper">
              <div className="hm-hero-window-glow" />
              <div className="hm-hero-window-card">
                <img
                  src="/assets/hubmind-workspace-window.webp"
                  alt="Hub-Mind Operations Hub Workspace"
                  className="hm-hero-window-img"
                  loading="eager"
                />
              </div>
            </div>
          </div>
          <div className="hm-scroll-cue"><span/> A calmer way to work</div>
        </section>

        <section className="hm-signal-strip hm-reveal" aria-label="Hub-Mind principles"><div><span>01</span><strong>One connected workspace</strong><small>Projects, tasks, knowledge and follow-through</small></div><div><span>02</span><strong>One thought partner</strong><small>Jess for writing, research and planning</small></div><div><span>03</span><strong>Your work stays yours</strong><small>Invitation-based access and role-aware controls</small></div></section>

        <section id="features" className="hm-features section-shell hm-reveal">
          <div className="hm-section-heading"><div className="hm-eyebrow">THE WORKSPACE</div><h2>Less scattered.<br/><span>More in sync.</span></h2><p>Everything you need to organise your work, without another noisy place to manage.</p></div>
          <div className="hm-feature-grid">{FEATURES.map((feature, i) => <article className="hm-feature hm-reveal" key={feature.title}><div className={'hm-feature-icon tone-' + i}><feature.icon size={20}/></div><span className="hm-feature-index">0{i+1}</span><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</div>
        </section>

        <section id="jess" className="hm-jess-section hm-reveal">
          <div className="hm-jess-visual">
            <div className="hm-jess-ring ring-a"/>
            <div className="hm-jess-ring ring-b"/>
            <div className="hm-jess-core">
              <div className="hm-jess-core-inner">
                <img src="/assets/jess-avatar.png" alt="Jess" className="hm-jess-core-avatar" />
              </div>
            </div>
            <div className="hm-jess-caption">YOUR THOUGHT PARTNER</div>
          </div>
          <div className="hm-jess-copy"><div className="hm-eyebrow">MEET JESS</div><h2>A little help.<br/><span>Right when you need it.</span></h2><p>Jess is Hub-Mind's AI assistant, designed to help you think things through, find information, draft and refine ideas, and turn conversations into clear next steps — while keeping you in control.</p><ul><li><Check size={16}/> Research with source-aware answers</li><li><Check size={16}/> Help with writing, planning and follow-through</li><li><Check size={16}/> Voice interaction and a floating assistant</li></ul><button className="hm-text-link" onClick={openWorkspace}>Meet Jess in your workspace <ArrowRight size={16}/></button><p className="hm-credit">Jess was designed and programmed by Jaystarbliss, founder of Jaystarbliss Studios. Her underlying AI model is provided by Google.</p></div>
        </section>

        <section id="desktop" className="hm-desktop-section hm-reveal">
          <div className="hm-desktop-copy"><div className="hm-eyebrow">TAKE IT WITH YOU</div><h2>Your workspace.<br/><span>At home on Windows.</span></h2><p>{release ? 'The Hub-Mind Windows desktop installer is available now, with a dedicated window and a persistent Jess companion.' : 'A dedicated Windows desktop experience is being prepared. The installer will appear here as soon as a release is published and verified.'}</p>
          <div className="hm-desktop-points"><span><Check size={15}/> Dedicated desktop window</span><span><Check size={15}/> Floating Jess companion</span><span><Check size={15}/> Controlled system integrations</span></div>
          {release ? <a className="hm-button hm-button-primary hm-button-large" href={release.url}><Download size={17}/> Download for Windows <span className="hm-version">{release.version}</span></a> : <button className="hm-button hm-button-disabled hm-button-large" disabled title="A verified Windows installer has not been published yet"><Download size={17}/> Windows app coming soon</button>}
          <div className="hm-install-actions">
            <button className="hm-button hm-button-outline hm-button-large" onClick={installWebApp}><Download size={16}/> Install Chrome app</button>
            <button type="button" className="hm-button hm-button-outline hm-button-large" onClick={() => window.dispatchEvent(new CustomEvent('hubmind:open-updates-panel'))}><Layers size={16}/> View Version History</button>
            <a className="hm-text-link" href={release?.extensionUrl || "https://github.com/Jaystarbliss-studios/HUB-MIND/tree/main/chrome-extension"} target="_blank" rel="noreferrer">Get Jess Chrome extension <ArrowUpRight size={15}/></a>
          </div>
          {release && <small className="hm-release-name">{release.name}</small>}
          </div>
          <div className="hm-desktop-art">
            <div className="hm-monitor">
              <div className="hm-monitor-top"><span/><span/><span/><small>HUB-MIND / WORKSPACE</small></div>
              <div className="hm-monitor-content">
                <img
                  src="/assets/hubmind-real-workspace.webp"
                  alt="Hub-Mind Application Window"
                  className="hm-monitor-window-preview"
                />
              </div>
            </div>
            <div className="hm-monitor-stand"/>
            <div className="hm-monitor-base"/>
            <div className="hm-desktop-orb" aria-label="Jess companion">
              <img src="/assets/jess-avatar.png" alt="Jess" className="hm-desktop-orb-img" />
            </div>
          </div>
        </section>

        <section id="getting-started" className="hm-desktop-section hm-getting-started hm-reveal">
          <div className="hm-desktop-copy">
            <div className="hm-eyebrow">GETTING STARTED</div>
            <h2>Set up Hub-Mind.<br/><span>Make it yours.</span></h2>
            <p>Use Hub-Mind on the web, install it as a Chrome app, or use the Windows desktop client. Sign in with the account invited to your workspace to keep your work and Jess preferences connected.</p>
            <div className="hm-desktop-points">
              <span><Check size={15}/> <strong>Web:</strong> Open Hub-Mind and sign in with your invited account.</span>
              <span><Check size={15}/> <strong>Chrome app:</strong> Use the browser's Install Hub-Mind option, then launch it from your apps.</span>
              <span><Check size={15}/> <strong>Chrome extension:</strong> Download the ZIP, extract it, open Chrome → Extensions → Manage extensions, enable Developer mode, then choose Load unpacked and select the extracted folder. Review its permissions before enabling it.</span>
              {release?.extensionUrl && <a className="hm-button hm-button-quiet" href={release.extensionUrl}><Download size={15}/> Download Jess Chrome extension</a>}
              <span><Check size={15}/> <strong>Windows:</strong> Download the installer, run it, then open Hub-Mind from the Start menu. Windows may show a publisher warning if the release is unsigned.</span>
              <span><Check size={15}/> <strong>Jess:</strong> Allow microphone access for voice use. Configure memory, personalization, web research, and desktop permissions in Jess settings.</span>
            </div>
            <button className="hm-button hm-button-primary hm-button-large" onClick={openWorkspace}>Sign in and get started <ArrowRight size={16}/></button>
          </div>
        </section>
      </main>

      <footer className="hm-footer"><div className="hm-footer-top"><a href="/" className="hm-brand"><span className="hm-brand-mark"><img src="/hub-mind%20logo.png" alt=""/></span><span>Hub<span className="hm-brand-dash">-</span>Mind</span></a><p>Make room for meaningful work.</p><button className="hm-button hm-button-outline" onClick={openWorkspace}>Open workspace <ArrowRight size={15}/></button></div><div className="hm-footer-bottom"><span>© {new Date().getFullYear()} Hub-Mind</span><span>Designed and built by <a href="https://jaystarbliss-studios.name.ng" target="_blank" rel="noreferrer">Jaystarbliss Studios</a> (JSW)</span><a href="mailto:hello@jaystarbliss-studios.name.ng">Contact</a></div></footer>

      {installHelpOpen && <div className="hm-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setInstallHelpOpen(false); }}><section className="hm-invite-modal" role="dialog" aria-modal="true" aria-labelledby="hm-install-title"><button className="hm-modal-close" onClick={() => setInstallHelpOpen(false)} aria-label="Close"><X size={18}/></button><div className="hm-modal-icon"><Download size={22}/></div><div className="hm-eyebrow">INSTALL HUB-MIND</div><h2 id="hm-install-title">Keep Hub-Mind close.</h2><p>In Chrome or Microsoft Edge, open the browser menu and choose <strong>Install Hub-Mind</strong> or <strong>Apps → Install this site as an app</strong>, if that option is available. You can also continue using Hub-Mind in this browser.</p><button className="hm-button hm-button-primary hm-button-large" onClick={() => { setInstallHelpOpen(false); openWorkspace(); }}>Continue to Hub-Mind <ArrowRight size={16}/></button></section></div>}
      {inviteOpen && <div className="hm-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setInviteOpen(false); }}><section className="hm-invite-modal" role="dialog" aria-modal="true" aria-labelledby="hm-invite-title"><button className="hm-modal-close" onClick={() => setInviteOpen(false)} aria-label="Close"><X size={18}/></button><div className="hm-modal-icon"><LockKeyhole size={22}/></div><div className="hm-eyebrow">WORKSPACE ACCESS</div><h2 id="hm-invite-title">Your invitation is the key.</h2><p>Paste the full Hub-Mind invitation link or enter the invitation ID shared by your workspace administrator.</p><form onSubmit={submitInvite}><label htmlFor="hm-invite-code">Invitation link or code</label><input id="hm-invite-code" autoFocus value={inviteValue} onChange={event => setInviteValue(event.target.value)} placeholder="Paste link or invitation ID" autoComplete="off"/>{error && <p className="hm-form-error" role="alert">{error}</p>}<button className="hm-button hm-button-primary hm-button-large" type="submit">Continue to sign in <ArrowRight size={16}/></button></form><p className="hm-modal-footnote">Invitations expire after seven days and are tied to the invited Google account.</p></section></div>}
    </div>
  );
}
