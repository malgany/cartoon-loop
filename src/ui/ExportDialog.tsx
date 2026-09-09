import { useEffect, useRef, useState } from 'react';
import { Download, BookOpen, Check, X } from 'lucide-react';
import { type Page, type Project } from '../core/model';
import { exportProject, exportSlices, renderPage, type ExportOptions } from '../core/render';
import { download } from '../core/storage';
import { useEditor } from '../core/store';
import { Choice, Modal, NumberField } from './primitives';

export const safeName = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .slice(0, 80) || 'cartoon-loop';
export function ExportDialog({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
}) {
  const [options, setOptions] = useState<ExportOptions>({
    mime: 'image/png',
    quality: 0.9,
    pages: project.pages.map((p) => p.id),
    preset: 'whole',
    sliceHeight: 1280,
    width: 800,
  });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null),
    [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (open) {
      setOptions((o) => ({ ...o, pages: project.pages.map((p) => p.id) }));
      setError('');
    }
    return () => controller.current?.abort();
  }, [open]);
  const update = (v: Partial<ExportOptions>) => setOptions({ ...options, ...v });
  const total = project.pages
    .filter((p) => options.pages.includes(p.id))
    .reduce((s, p) => s + exportSlices(p, options).length, 0);
  async function start() {
    const abort = new AbortController();
    controller.current = abort;
    setError('');
    setProgress({ done: 0, total });
    try {
      const result = await exportProject(structuredClone(project), options, abort.signal, (done, total) =>
        setProgress({ done, total }),
      );
      download(result.blob, `${safeName(project.name)}.${result.extension}`);
      useEditor.getState().notify('Exportação concluída. Seu download está pronto.');
      onClose();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      else useEditor.getState().notify('Exportação cancelada. O projeto não foi alterado.');
    } finally {
      setProgress(null);
      controller.current = null;
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={() => {
        controller.current?.abort();
        onClose();
      }}
      title="Exportar sua história"
      description="Somente as páginas e seus conteúdos vinculados. Objetos soltos, guias e seleções ficam de fora."
    >
      <fieldset disabled={!!progress} className="export-fields">
        <div className="field-pair">
          <Choice
            label="Formato"
            value={options.mime}
            onChange={(mime) => update({ mime: mime as ExportOptions['mime'] })}
            options={[
              { value: 'image/png', label: 'PNG · máxima fidelidade' },
              { value: 'image/jpeg', label: 'JPEG · arquivo menor' },
              { value: 'image/webp', label: 'WebP · com transparência' },
            ]}
          />
          <NumberField
            label="Qualidade"
            value={options.quality * 100}
            onChange={(v) => update({ quality: v / 100 })}
            min={10}
            max={100}
            suffix="%"
          />
        </div>
        {options.mime === 'image/png' && (
          <p className="help-text">PNG não usa o ajuste de qualidade: a compressão é sem perdas.</p>
        )}
        <Choice
          label="Organização dos arquivos"
          value={options.preset}
          onChange={(preset) => update({ preset: preset as ExportOptions['preset'] })}
          options={[
            { value: 'whole', label: 'Uma imagem por página · tamanho original' },
            { value: 'webtoon', label: 'Fatias WEBTOON · 800 × 1.280' },
            { value: 'tapas', label: 'Fatias Tapas · largura 940' },
            { value: 'custom', label: 'Fatias personalizadas' },
          ]}
        />
        {(options.preset === 'custom' || options.preset === 'tapas') && (
          <div className="field-pair">
            {options.preset === 'custom' && (
              <NumberField
                label="Largura da fatia"
                value={options.width}
                onChange={(width) => update({ width })}
                min={320}
                max={1600}
              />
            )}
            <NumberField
              label="Altura da fatia"
              value={options.sliceHeight}
              onChange={(sliceHeight) => update({ sliceHeight })}
              min={128}
              max={16000}
            />
          </div>
        )}
        {options.preset !== 'whole' && (
          <p className="help-text">
            A arte será escalada proporcionalmente à largura escolhida. A última fatia pode ser menor.
          </p>
        )}
        <div className="mini-heading">
          Páginas{' '}
          <button
            className="text-button"
            onClick={() =>
              update({
                pages: options.pages.length === project.pages.length ? [] : project.pages.map((p) => p.id),
              })
            }
          >
            Selecionar todas
          </button>
        </div>
        <div className="export-pages">
          {project.pages.map((p) => (
            <button
              key={p.id}
              className={`export-page ${options.pages.includes(p.id) ? 'selected' : ''}`}
              onClick={() =>
                update({
                  pages: options.pages.includes(p.id)
                    ? options.pages.filter((id) => id !== p.id)
                    : [...options.pages, p.id],
                })
              }
            >
              <span className="checkbox">{options.pages.includes(p.id) && <Check size={12} />}</span>
              <span>{p.name}</span>
              <small>
                {p.width} × {p.height} px
              </small>
            </button>
          ))}
        </div>
      </fieldset>
      {error && (
        <div role="alert" className="error-banner">
          {error}
          <button
            className="text-button"
            onClick={() => {
              setError('');
              update({ preset: 'webtoon' });
            }}
          >
            Usar fatias menores
          </button>
        </div>
      )}
      {progress && (
        <div className="progress-block" role="status">
          <span>
            {progress.done === progress.total
              ? 'Preparando download…'
              : `Renderizando ${Math.min(progress.done + 1, progress.total)} de ${progress.total}…`}
          </span>
          <progress value={progress.done} max={progress.total} />
        </div>
      )}
      <div className="export-summary">
        <BookOpen size={17} />
        <span>
          {total} {total === 1 ? 'imagem' : 'imagens em um ZIP'}
          <small>Processamento local, uma imagem por vez.</small>
        </span>
      </div>
      <div className="modal-actions">
        <button
          className="button secondary"
          onClick={() => {
            if (progress) controller.current?.abort();
            else onClose();
          }}
        >
          {progress ? 'Cancelar exportação' : 'Voltar'}
        </button>
        <button className="button primary" onClick={start} disabled={!!progress || !total}>
          <Download size={16} />
          Exportar {total === 1 ? 'imagem' : 'imagens'}
        </button>
      </div>
    </Modal>
  );
}

function ReaderTile({
  project,
  page,
  offset,
  height,
}: {
  project: Project;
  page: Page;
  offset: number;
  height: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true,
      resource = '';
    const abort = new AbortController();
    let started = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !started) {
          started = true;
          void renderPage(project, page, {
            width: 400,
            height,
            offset,
            original: false,
            signal: abort.signal,
          })
            .then((blob) => {
              if (active) {
                resource = URL.createObjectURL(blob);
                setUrl(resource);
              }
            })
            .catch((e) => {
              if (active && e.name !== 'AbortError') setError(e.message);
            });
        }
      },
      { rootMargin: '300px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      active = false;
      observer.disconnect();
      abort.abort();
      if (resource) URL.revokeObjectURL(resource);
    };
  }, [project, page, offset, height]);
  return (
    <div ref={ref} className="reader-tile" style={{ aspectRatio: `400 / ${height}` }}>
      {url ? <img src={url} alt="Trecho da página" /> : error ? <p>{error}</p> : <span />}
    </div>
  );
}
export function Reader({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  return (
    <Modal
      open={open}
      onOpenChange={onClose}
      title="Prévia de leitura"
      description="Apenas o conteúdo exportável. Role para ler, como em um webtoon."
      wide
    >
      <div className="reader-scroll">
        {project.pages.map((page) => (
          <section key={page.id} className="reader-page">
            <div className="reader-label">{page.name}</div>
            {Array.from(
              { length: Math.ceil(Math.round((page.height * 400) / page.width) / 1000) },
              (_, i) => (
                <ReaderTile
                  key={i}
                  project={project}
                  page={page}
                  offset={i * 1000}
                  height={Math.min(1000, Math.round((page.height * 400) / page.width) - i * 1000)}
                />
              ),
            )}
          </section>
        ))}
      </div>
    </Modal>
  );
}
