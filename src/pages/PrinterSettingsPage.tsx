import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { defaultReceiptSettings } from "../lib/receipt";
import { getReceiptSettings, saveReceiptSettings } from "../services/receiptSettingsService";
import type { ReceiptSettings } from "../types/receipt";

export function PrinterSettingsPage() {
  const [settings, setSettings] = useState<ReceiptSettings>({ ...defaultReceiptSettings });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getReceiptSettings().then((value) => { if (active) setSettings(value); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Erro ao carregar configurações."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(null); setFeedback(null);
    try { await saveReceiptSettings(settings); setFeedback("Configurações salvas neste computador."); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }

  return <section>
    <header className="page-header"><div><p className="eyebrow">Configurações</p><h1>Impressão e comprovantes</h1>
      <p className="muted">Defina os dados do depósito e o comportamento após cada venda.</p></div>
      <Link to="/sales" className="secondary-button">Histórico de vendas</Link>
    </header>
    {error && <div role="alert" className="feedback error">{error}</div>}
    {feedback && <div role="status" className="feedback success">{feedback}</div>}
    <form onSubmit={save} className="panel receipt-settings-form">
      <fieldset disabled={loading || saving}>
        <legend>Dados no comprovante</legend>
        <div className="form-grid">
          {([
            ["businessName", "Nome do depósito", 120], ["document", "CPF/CNPJ (opcional)", 30],
            ["address", "Endereço (opcional)", 240], ["phone", "Telefone (opcional)", 40],
            ["footer", "Mensagem no rodapé", 240],
          ] as const).map(([key, label, maxLength]) => <label className="field" key={key}><span>{label}</span>
            <input value={settings[key]} maxLength={maxLength} required={key === "businessName"}
              onChange={(e) => setSettings((current) => ({ ...current, [key]: e.target.value }))} /></label>)}
        </div>
      </fieldset>
      <fieldset disabled={loading || saving}>
        <legend>Preferências</legend>
        <div className="form-grid">
          <label className="field"><span>Papel padrão</span><select value={settings.paperFormat}
            onChange={(e) => setSettings((current) => ({ ...current, paperFormat: e.target.value as ReceiptSettings["paperFormat"] }))}>
            <option value="58mm">Térmica 58 mm</option><option value="80mm">Térmica 80 mm</option><option value="A4">A4</option>
          </select></label>
          <label className="field"><span>Ao finalizar uma venda</span><select value={settings.printMode}
            onChange={(e) => setSettings((current) => ({ ...current, printMode: e.target.value as ReceiptSettings["printMode"] }))}>
            <option value="ASK">Perguntar sempre</option><option value="AUTO_ONE">Abrir impressão automaticamente: 1 via</option>
            <option value="AUTO_TWO">Abrir impressão automaticamente: 2 vias</option><option value="NEVER">Não abrir automaticamente</option>
          </select></label>
        </div>
        <p className="muted">A impressão usa as impressoras instaladas no Windows. Selecione o driver e configure a bobina de 58 ou 80 mm na janela de impressão. Para duas vias, mantenha “cópias” em 1 no Windows: o documento já contém as duas vias.</p>
        <p className="muted">A abertura automática ainda exige confirmação na janela do Windows. O botão Salvar PDF gera o arquivo diretamente, sem impressora e sem internet.</p>
      </fieldset>
      <button className="primary-button" disabled={loading || saving} type="submit">{saving ? "Salvando..." : "Salvar configurações"}</button>
    </form>
  </section>;
}
