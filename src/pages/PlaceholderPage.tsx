type Props = {
  title: string;
};

export function PlaceholderPage({ title }: Props) {
  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">Módulo da V1</p>
          <h1>{title}</h1>
          <p className="muted">Estrutura pronta para implementação funcional.</p>
        </div>
      </header>
      <div className="panel">
        <strong>{title}</strong>
        <p className="muted">Este módulo será implementado nas próximas issues do projeto.</p>
      </div>
    </section>
  );
}
