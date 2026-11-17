import { useState } from 'preact/hooks';
import { Back } from '../common';
import type { Controller } from '../lifecycle';

/** Export and import of the save, as a text code or a downloaded file. */
export function SaveScreen(props: { c: Controller; onBack: () => void; embedded?: boolean }) {
  const { c } = props;
  const [code, setCode] = useState('');
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);

  const copy = async () => {
    const text = code || c.exportCode();
    setCode(text);
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ ok: true, text: 'Copied. Paste it into a note, email or message you can find again.' });
    } catch {
      setMsg({ ok: true, text: 'Select the code below and copy it manually.' });
    }
  };

  const doImport = () => {
    try {
      c.importText(input);
      setMsg({ ok: true, text: 'Imported.' });
      setInput('');
      setConfirm(false);
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message ?? e) });
      setConfirm(false);
    }
  };

  const onFile = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    setInput(await f.text());
  };

  return (
    <div class="screen scroll" data-testid="save-screen">
      <div class="page col">
        {!props.embedded && <Back onClick={props.onBack} />}
        <h2>Save backup</h2>
        <p class="dim">Your progress lives in this browser. If the tablet’s browser data is ever cleared, a backup brings back your story, Lab Notes and stats.</p>
        <div class="card col">
          <h3>Export</h3>
          <div class="row">
            <button class="btn primary" onClick={copy} data-testid="export-code">Copy save code</button>
            <button class="btn" onClick={() => c.exportFile()}>Download .json file</button>
          </div>
          {code && <textarea readOnly value={code} data-testid="code-out" onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />}
        </div>
        <div class="card col">
          <h3>Import</h3>
          <p class="warnc" style={{ margin: 0 }}>Importing restores your progress, but the lab always comes back <b>sealed</b>, with no banked break, until you complete a study block. That way an old save can’t be used to skip studying.</p>
          <textarea placeholder="Paste a save code (MLAB1…) or the contents of a .json backup" value={input} onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)} data-testid="code-in" />
          <div class="row">
            <label class="btn">Choose file…<input type="file" accept=".json,application/json,text/plain" style={{ display: 'none' }} onChange={onFile} /></label>
            {!confirm ? (
              <button class="btn warn" disabled={!input.trim()} onClick={() => setConfirm(true)} data-testid="import">Import</button>
            ) : (
              <>
                <button class="btn danger" onClick={doImport} data-testid="import-confirm">Replace progress and lock</button>
                <button class="btn ghost" onClick={() => setConfirm(false)}>Cancel</button>
              </>
            )}
          </div>
        </div>
        {msg && <p class={msg.ok ? 'ok' : 'bad'} data-testid="save-msg">{msg.text}</p>}
      </div>
    </div>
  );
}
