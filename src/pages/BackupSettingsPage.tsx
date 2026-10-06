import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createBackup, exportBackup, listBackups, type Backup } from '../services/backupService';
export function BackupSettingsPage() {
  const [backups,setBackups]=useState<Backup[]>([]);
  const [busy,setBusy]=useState(false); const started=useRef(false);
  const [error,setError]=useState<string|null>(null);const [feedback,setFeedback]=useState<string|null>(null);
  async function load(){setBackups(await listBackups());}
  useEffect(()=>{void load().catch(error=>setError(String(error)));},[]);
  async function run(action:()=>Promise<string>) {
    if(started.current)return;started.current=true;setBusy(true);setError(null);setFeedback(null);
    try {setFeedback(await action());await load();} catch(error){setError(error instanceof Error ? error.message : String(error));}
    finally {started.current=false;setBusy(false);}
  }
  return <section>
    <header className="page-header"><div><p className="eyebrow">Configurações</p><h1>Backup dos dados</h1>
      <p className="muted">Crie uma cópia das vendas, estoque, caixa, clientes e configurações.</p></div>
      <Link className="secondary-button" to="/settings/printer">Impressão e comprovantes</Link></header>
    {error && <div className="feedback error" role="alert">{error}</div>}
    {feedback && <div className="feedback success" role="status">{feedback}</div>}
    <div className="panel"><h2>Cópia de segurança</h2>
      <p className="muted">O backup é conferido antes de ficar disponível. São mantidas até 7 cópias locais recentes. As cópias salvas em outra pasta ficam com você.</p>
      <button className="primary-button" disabled={busy} onClick={()=>void run(async()=>{const result = await createBackup();return result.warning || 'Backup criado e validado.';})}>{busy ? 'Aguarde...' : 'Criar backup agora'}</button>
    </div>
    <div className="panel"><h2>Backups disponíveis</h2>
      {backups.length===0 ? <p className="muted">Nenhum backup criado ainda.</p> : <div className="data-table-wrapper"><table className="data-table">
        <thead><tr><th>Data</th><th>Tamanho</th><th>Cópia</th></tr></thead>
        <tbody>{backups.map(backup=><tr key={backup.id}><td>{new Date(backup.createdAtMs).toLocaleString('pt-BR')}</td><td>{(backup.sizeBytes/1024).toFixed(1)} KB</td>
          <td><button className="secondary-button" disabled={busy} onClick={()=>void run(async()=>{const path=await exportBackup(backup.id);return path ? `Cópia salva em: ${path}` : 'Salvamento cancelado. O backup local continua disponível.';})}>Salvar em outra pasta</button></td></tr>)}</tbody>
      </table></div>}
    </div>
    <div className="panel"><h2>Próximas etapas</h2><p className="muted">A restauração pelo aplicativo e a rotina automática ainda estão em desenvolvimento. Guarde as cópias em um pendrive ou outra unidade para usar na recuperação dos dados.</p></div>
  </section>;
}
