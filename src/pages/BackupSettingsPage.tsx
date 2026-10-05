import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkBackupSchedule, createBackup, exportBackup, getBackupPolicy, listBackups, restoreBackup, setBackupPolicy, type Backup, type BackupPolicy } from '../services/backupService';
export function BackupSettingsPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [policy, setPolicy] = useState<BackupPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const started = useRef(false);
  const recoveryDialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  async function load() {
    const [copies, savedPolicy] = await Promise.all([listBackups(), getBackupPolicy()]);
    setBackups(copies); setPolicy(savedPolicy);
  }
  useEffect(() => { void load().catch(error => setError(String(error))); }, []);
  useEffect(() => {
    if (restoring) recoveryDialog.current?.showModal();
    else recoveryDialog.current?.close();
  }, [restoring]);
  async function run(action: () => Promise<string>) {
    if (started.current) return;
    started.current = true; setBusy(true); setError(null); setFeedback(null);
    try { setFeedback(await action()); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { started.current = false; setBusy(false); }
  }
  async function restore(id: string | null) {
    await run(async () => {
      setRestoring(true);
      try {
        const restarting = await restoreBackup(id);
        if (!restarting) { setRestoring(false); return 'Restauração cancelada. Os dados atuais foram mantidos.'; }
        return 'Reiniciando para concluir a restauração...';
      } catch (error) { setRestoring(false); throw error; }
    });
  }
  return <section>
    <header className="page-header"><div><p className="eyebrow">Configurações</p><h1>Backup dos dados</h1>
      <p className="muted">Proteja vendas, estoque, caixa, clientes e configurações.</p></div>
      <Link className="secondary-button" to="/settings/printer">Impressão e comprovantes</Link></header>
    {error && <div className="feedback error" role="alert">{error}</div>}
    {feedback && <div className="feedback success" role="status">{feedback}</div>}
    <div className="panel"><h2>Cópia de segurança</h2>
      <p className="muted">Cada cópia é conferida antes de ficar disponível. Salve também em um pendrive ou outra unidade para se proteger de falhas no computador.</p>
      <button className="primary-button" disabled={busy} onClick={() => void run(async () => { const result = await createBackup(); return result.warning || 'Backup criado e validado.'; })}>Criar backup agora</button>
    </div>
    <div className="panel"><h2>Rotina automática</h2>
      <p className="muted">Funciona enquanto o aplicativo está aberto. Ao abrir novamente, cria a cópia se o intervalo já tiver passado.</p>
      {policy ? <form onSubmit={event => { event.preventDefault(); void run(async () => { await setBackupPolicy(policy); await checkBackupSchedule(); return 'Rotina de backup salva.'; }); }}>
        <div className="form-grid">
          <label className="field"><span>Backup automático</span><select disabled={busy} value={policy.enabled ? 'on' : 'off'} onChange={event => setPolicy({ ...policy, enabled: event.target.value === 'on' })}><option value="on">Ativado</option><option value="off">Desativado</option></select></label>
          <label className="field"><span>Intervalo entre cópias</span><select disabled={busy} value={policy.intervalHours} onChange={event => setPolicy({ ...policy, intervalHours: Number(event.target.value) })}>{[1, 6, 12, 24].map(hours => <option key={hours} value={hours}>{hours} {hours === 1 ? 'hora' : 'horas'}</option>)}</select></label>
          <label className="field"><span>Cópias locais a manter</span><input type="number" min="3" max="30" step="1" required disabled={busy} value={policy.retention} onChange={event => setPolicy({ ...policy, retention: Number(event.target.value) })} /></label>
        </div>
        <button className="primary-button" disabled={busy}>Salvar rotina</button>
      </form> : <p className="muted">Carregando rotina...</p>}
    </div>
    <div className="panel"><h2>Backups disponíveis</h2>
      {backups.length === 0 ? <p className="muted">Nenhum backup criado ainda.</p> : <div className="data-table-wrapper"><table className="data-table">
        <thead><tr><th>Data</th><th>Tamanho</th><th>Ações</th></tr></thead>
        <tbody>{backups.map(backup => <tr key={backup.id}><td>{new Date(backup.createdAtMs).toLocaleString('pt-BR')}</td><td>{(backup.sizeBytes / 1024).toFixed(1)} KB</td>
          <td><div className="action-buttons"><button className="secondary-button" disabled={busy} onClick={() => void run(async () => { const path = await exportBackup(backup.id); return path ? `Cópia salva em: ${path}` : 'Salvamento cancelado. O backup local continua disponível.'; })}>Salvar em outra pasta</button>
            <button className="secondary-button" disabled={busy} onClick={() => void restore(backup.id)}>Restaurar esta cópia</button></div></td></tr>)}</tbody>
      </table></div>}
    </div>
    <div className="panel"><h2>Restaurar de outro arquivo</h2>
      <p className="muted">A restauração substitui os dados atuais pelos dados do backup escolhido. Você confirma o arquivo antes da troca. O aplicativo guarda uma cópia preventiva e reinicia para concluir.</p>
      <button className="secondary-button" disabled={busy} onClick={() => void restore(null)}>Escolher arquivo para restaurar</button>
    </div>
    <dialog ref={recoveryDialog} className="backup-recovery-dialog" aria-label="Restauração dos dados" onCancel={event => event.preventDefault()}><div><h2>Recuperação dos dados</h2><p>Aguarde a seleção e a confirmação do arquivo. Após confirmar, o aplicativo vai reiniciar. Se cancelar, você volta para esta tela.</p></div></dialog>
  </section>;
}
