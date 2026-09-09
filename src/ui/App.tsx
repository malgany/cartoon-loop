import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { liveQuery } from 'dexie';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  Ellipsis,
  FilePlus2,
  FolderOpen,
  HardDrive,
  ImagePlus,
  LoaderCircle,
  Maximize,
  Minus,
  Moon,
  Plus,
  Redo2,
  Save,
  Sun,
  Undo2,
  Upload,
  X,
  LockKeyhole,
  TriangleAlert,
  Copy,
  Pencil,
  Trash2,
  MousePointer2,
} from 'lucide-react';
import {
  newProject,
  placeBalloon,
  newPage,
  pagePositions,
  LIMITS,
  type Point,
  type Project,
  type Balloon,
} from '../core/model';
import { useEditor, visibleWorld } from '../core/store';
import {
  acquireProjectLock,
  clearPending,
  db,
  deleteProject,
  download,
  duplicateProject,
  importProject,
  prepareAsset,
  projectArchive,
  saveProject,
  type ProjectRecord,
} from '../core/storage';
import { clearImageCache, thumbnail } from '../core/render';
const Canvas = lazy(() => import('./Canvas'));
import Library from './Library';
import Inspector from './Inspector';
import { Choice, IconButton, Modal, NumberField } from './primitives';
import { ExportDialog, Reader, safeName } from './ExportDialog';

const errorMessage = (e: unknown) =>
  e instanceof Error
    ? e.name === 'ZodError'
      ? 'Este projeto contém dados ou limites inválidos. Verifique o arquivo importado.'
      : e.name === 'QuotaExceededError'
        ? 'O armazenamento do navegador está cheio. Seu trabalho continua aberto: baixe o arquivo de projeto para guardá-lo.'
        : e.message
    : 'Não foi possível concluir a operação.';
const formatBytes = (n: number) =>
  n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 ** 2).toFixed(1)} MiB`;
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest('input,textarea,[contenteditable="true"],[role="dialog"],[role="menu"],[role="listbox"]');
function Logo() {
  return (
    <span className="brand">
      <span className="brand-symbol">
        <i />
        <i />
      </span>
      <span>
        cartoon<span className="brand-loop">loop</span>
      </span>
    </span>
  );
}
function Thumb({ blob }: { blob?: Blob }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url ? (
    <img src={url} alt="Miniatura do projeto" />
  ) : (
    <div className="blank-thumbnail">
      <span />
      <span />
      <span />
    </div>
  );
}

// Serialize snapshots: an older slow save must never overwrite a newer revision.
let saving: Promise<void> = Promise.resolve();
let lastThumbnail = 0;
async function flushSave() {
  const state = useEditor.getState();
  if (!state.project || state.readonly || state.revision === state.savedRevision) return;
  const p = state.project,
    revision = state.revision;
  useEditor.setState({ saveState: 'saving' });
  const operation = saving
    .catch(() => {})
    .then(async () => {
      await saveProject(p);
      if (useEditor.getState().project?.id === p.id)
        useEditor.setState((s) => ({
          savedRevision: Math.max(s.savedRevision, revision),
          saveState: s.revision === revision ? 'saved' : 'saving',
        }));
      if (Date.now() - lastThumbnail > 5000) {
        lastThumbnail = Date.now();
        try {
          await db.projects.update(p.id, { thumbnail: await thumbnail(p) });
        } catch {
          /* Thumbnail failure must not turn a successful save into an error. */
        }
      }
    });
  saving = operation;
  try {
    await operation;
  } catch (e) {
    if (useEditor.getState().project?.id === p.id) useEditor.setState({ saveState: 'error' });
    throw e;
  }
}

export default function App() {
  const [route, setRoute] = useState(location.hash),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState('');
  const [records, setRecords] = useState<ProjectRecord[]>([]),
    [theme, setTheme] = useState(() => {
      try {
        return localStorage.getItem('cartoon-loop-theme') || 'light';
      } catch {
        return 'light';
      }
    });
  const [create, setCreate] = useState(false),
    [name, setName] = useState(''),
    [width, setWidth] = useState(800),
    [height, setHeight] = useState(10000);
  const [rename, setRename] = useState<ProjectRecord | null>(null),
    [deleteRecord, setDeleteRecord] = useState<ProjectRecord | null>(null);
  const [working, setWorking] = useState(''),
    [storage, setStorage] = useState(''),
    [leftCollapsed, setLeftCollapsed] = useState(false),
    [rightCollapsed, setRightCollapsed] = useState(false);
  const [exportOpen, setExportOpen] = useState(false),
    [readerOpen, setReaderOpen] = useState(false),
    [shortcuts, setShortcuts] = useState(false);
  const project = useEditor((s) => s.project),
    revision = useEditor((s) => s.revision),
    saveState = useEditor((s) => s.saveState),
    readonly = useEditor((s) => s.readonly),
    zoom = useEditor((s) => s.view.zoom),
    notices = useEditor((s) => s.notices);
  const past = useEditor((s) => s.past),
    future = useEditor((s) => s.future),
    activePage = useEditor((s) => s.activePage);
  const archiveInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    importQueue = useRef(Promise.resolve()),
    busyCount = useRef(0);
  const isEditor = route.startsWith('#/project/');
  const notifyError = useCallback((e: unknown) => useEditor.getState().notify(errorMessage(e), true), []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('cartoon-loop-theme', theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    const update = () => {
      const hash = location.hash;
      void flushSave()
        .then(() => setRoute(hash))
        .catch(notifyError);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    const sub = liveQuery(() => db.projects.toArray()).subscribe({
      next: (list) => setRecords(list.sort((a, b) => b.document.updatedAt - a.document.updatedAt)),
      error: notifyError,
    });
    void navigator.storage
      ?.estimate()
      .then((s) => setStorage(`${formatBytes(s.usage || 0)} neste navegador`))
      .catch(() => {});
    return () => sub.unsubscribe();
  }, [notifyError]);
  useEffect(() => {
    if (!isEditor) {
      clearImageCache();
      return;
    }
    let active = true,
      release = () => {};
    setLoading(true);
    setLoadError('');
    const id = route.slice('#/project/'.length);
    void (async () => {
      try {
        await Promise.resolve();
        if (!active) return;
        const lock = await acquireProjectLock(id);
        if (!active) {
          lock.release();
          return;
        }
        release = lock.release;
        const row = await db.projects.get(id);
        if (!row)
          throw new Error(
            'Este projeto não está neste navegador. Importe seu arquivo .cartoonloop para continuar.',
          );
        if (active) {
          clearImageCache();
          clearPending();
          useEditor.getState().load(row.document, !lock.writable);
        }
      } catch (e) {
        if (active) setLoadError(errorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      const unlock = release;
      void saving.finally(unlock).catch(() => {});
    };
  }, [route, isEditor]);
  useEffect(() => {
    if (!isEditor || !project || readonly || revision === useEditor.getState().savedRevision) return;
    const timer = setTimeout(() => void flushSave().catch(notifyError), 750);
    return () => clearTimeout(timer);
  }, [revision, project?.id, isEditor, readonly, notifyError]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState();
      if ((s.revision !== s.savedRevision || busyCount.current > 0) && !s.readonly) {
        e.preventDefault();
        void flushSave().catch(() => {});
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') void flushSave().catch(notifyError);
    };
    window.addEventListener('beforeunload', before);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('beforeunload', before);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [notifyError]);
  const backup = useCallback(async () => {
    await importQueue.current;
    const p = useEditor.getState().project;
    if (!p) return;
    setWorking('Preparando arquivo de projeto…');
    try {
      setWorking('Preparando arquivo de projeto…');
      download(await projectArchive(p), `${safeName(p.name)}.cartoonloop`);
      useEditor.getState().notify('Arquivo editável baixado. Você pode guardá-lo no Google Drive.');
    } catch (e) {
      notifyError(e);
    } finally {
      setWorking('');
    }
  }, [notifyError]);
  const importImages = useCallback(
    (files: File[], point?: Point) => {
      const s = useEditor.getState();
      if (s.readonly || !s.project) return;
      const id = s.project.id;
      busyCount.current += files.length;
      importQueue.current = importQueue.current.then(async () => {
        for (let i = 0; i < files.length; i++) {
          const current = useEditor.getState();
          if (current.project?.id !== id) {
            busyCount.current -= files.length - i;
            break;
          }
          setWorking(`Preparando imagem ${i + 1} de ${files.length} · ${files[i].name}`);
          try {
            if (current.project.nodes.length >= LIMITS.nodes)
              throw new Error('Limite de 2.000 objetos atingido. Remova objetos antes de importar.');
            const asset = await prepareAsset(files[i], current.project);
            if (useEditor.getState().project?.id === id)
              useEditor
                .getState()
                .addImage(asset, point ? { x: point.x + i * 16, y: point.y + i * 16 } : undefined);
          } catch (e) {
            notifyError(e);
          } finally {
            busyCount.current--;
          }
        }
        if (busyCount.current === 0) setWorking('');
      });
    },
    [notifyError],
  );
  useEffect(() => {
    if (!isEditor) return;
    const key = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const s = useEditor.getState(),
        mod = e.ctrlKey || e.metaKey,
        k = e.key.toLowerCase();
      if (mod && ['s', 'z', 'y', 'c', 'v', 'd', 'a'].includes(k)) {
        if (k === 'v') return;
        e.preventDefault();
        if (k === 's') {
          if (e.shiftKey) void backup();
          else void flushSave().catch(notifyError);
        }
        if (k === 'z') e.shiftKey ? s.redo() : s.undo();
        if (k === 'y') s.redo();
        if (k === 'c') s.copy();
        if (k === 'd') s.duplicate();
        if (k === 'a' && s.project)
          s.select(
            s.project.nodes
              .filter((n) => !n.hidden && !n.locked && (n.type === 'panel' || !n.panelId))
              .map((n) => n.id),
          );
      } else if (['Delete', 'Backspace'].includes(e.key)) {
        e.preventDefault();
        s.remove();
      } else if (e.key === 'Escape') s.select([]);
      else if (e.key === '?') setShortcuts(true);
      else if (e.key.startsWith('Arrow') && s.selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        s.run('Mover objetos', (p) => {
          for (const n of p.nodes)
            if (s.selection.includes(n.id) && !n.locked && (n.type !== 'panel' || n.mode === 'free')) {
              if (e.key === 'ArrowLeft') n.x -= step;
              if (e.key === 'ArrowRight') n.x += step;
              if (e.key === 'ArrowUp') n.y -= step;
              if (e.key === 'ArrowDown') n.y += step;
            }
        });
      }
    };
    const paste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length) {
        e.preventDefault();
        importImages(files);
      } else if (useEditor.getState().clipboard.length) {
        e.preventDefault();
        useEditor.getState().paste();
      }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('paste', paste);
    };
  }, [isEditor, backup, importImages, notifyError]);
  async function newDocument() {
    try {
      const p = newProject(name.trim() || 'História sem título');
      p.pages = [newPage(width, height)];
      await saveProject(p);
      setCreate(false);
      location.hash = `/project/${p.id}`;
      void navigator.storage?.persist?.().catch(() => {});
    } catch (e) {
      notifyError(e);
    }
  }
  async function importArchive(file?: File) {
    if (!file) return;
    setWorking('Verificando e importando projeto…');
    try {
      const p = await importProject(file);
      location.hash = `/project/${p.id}`;
      useEditor.getState().notify('Projeto importado como uma nova cópia.');
    } catch (e) {
      notifyError(e);
    } finally {
      setWorking('');
    }
  }
  async function home() {
    try {
      await importQueue.current;
      await flushSave();
      const p = useEditor.getState().project;
      if (p && !readonly) await db.projects.update(p.id, { thumbnail: await thumbnail(p) });
      await flushSave();
      location.hash = '/';
    } catch (e) {
      notifyError(e);
    }
  }
  function zoomBy(factor: number) {
    const v = useEditor.getState().view,
      z = Math.min(4, Math.max(0.05, v.zoom * factor));
    useEditor.getState().setView({
      zoom: z,
      x: v.width / 2 - ((v.width / 2 - v.x) / v.zoom) * z,
      y: v.height / 2 - ((v.height / 2 - v.y) / v.zoom) * z,
    });
  }
  function focusPage(id: string, full = false) {
    const s = useEditor.getState();
    if (!s.project) return;
    const pg = s.project.pages.find((p) => p.id === id) || s.project.pages[0],
      pos = pagePositions(s.project).get(pg.id)!;
    const zoom = Math.min(
      1.2,
      Math.max(
        0.05,
        full
          ? Math.min((s.view.width - 96) / pg.width, (s.view.height - 100) / pg.height)
          : (s.view.width - 160) / pg.width,
      ),
    );
    s.setView({ zoom, x: (s.view.width - pg.width * zoom) / 2 - pos.x * zoom, y: 60 });
    useEditor.setState({ activePage: pg.id, selection: [] });
  }
  function dropPreset(data: string, point: Point) {
    try {
      const { type, id } = JSON.parse(data);
      const s = useEditor.getState(),
        p = s.project;
      if (!p || s.readonly) return;
      const pg = p.pages.find((pg) => {
        const pos = pagePositions(p).get(pg.id)!;
        return point.x >= pos.x && point.x <= pos.x + pg.width;
      });
      if (pg) useEditor.setState({ activePage: pg.id });
      if (type === 'asset') {
        const asset = p.assets.find((a) => a.id === id);
        if (asset) s.addImage(asset, point);
        return;
      }
      if (type === 'panel' || type === 'spacer' || type === 'transition') {
        s.addPanel(
          type === 'panel' ? id : 'horizontal',
          type === 'spacer' ? 'spacer' : type === 'transition' ? 'transition' : 'frame',
          type === 'spacer' ? Number(id) : type === 'transition' ? 500 : undefined,
          point,
        );
        if (type === 'transition') s.patch(useEditor.getState().selection, { gradient: '#ffffff' });
      } else if (type === 'balloon' || type === 'text') {
        s.addText(type === 'balloon' ? (id as Balloon['kind']) : undefined);
        const node = useEditor
          .getState()
          .project!.nodes.find((n) => n.id === useEditor.getState().selection[0]);
        if (node && node.type !== 'panel') {
          if (node.type === 'balloon') {
            s.run('Posicionar balão', (draft) =>
              placeBalloon(
                draft,
                draft.nodes.find((n) => n.id === node.id) as Balloon,
                { x: point.x - node.width / 2, y: point.y - node.height / 2 },
                point,
              ),
            );
            return;
          }
          const target = [...p.nodes].reverse().find(
            (n) =>
              n.type === 'panel' &&
              !n.hidden &&
              !n.locked &&
              n.role !== 'spacer' &&
              (() => {
                const o = pagePositions(p).get(n.pageId)!;
                return (
                  point.x >= o.x + n.x &&
                  point.x <= o.x + n.x + n.width &&
                  point.y >= n.y &&
                  point.y <= n.y + n.height
                );
              })(),
          );
          const pos = target?.type === 'panel' ? pagePositions(p).get(target.pageId)! : { x: 0, y: 0 };
          s.patch([node.id], {
            panelId: target?.id || null,
            x: point.x - pos.x - (target?.x || 0) - node.width / 2,
            y: point.y - (target?.y || 0) - node.height / 2,
          });
        }
      }
    } catch (e) {
      notifyError(e);
    }
  }
  const themeButton = (
    <IconButton
      label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
    >
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
    </IconButton>
  );
  return (
    <Tooltip.Provider delayDuration={400}>
      <input
        ref={archiveInput}
        type="file"
        accept=".cartoonloop"
        className="sr-only"
        aria-label="Importar arquivo de projeto"
        onChange={(e) => {
          void importArchive(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="sr-only"
        aria-label="Selecionar imagens"
        onChange={(e) => {
          importImages(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
      {!isEditor ? (
        <div className="gallery">
          <header className="gallery-header">
            <Logo />
            <div className="header-actions">
              <span className="local-badge">
                <span className="status-dot" />
                LOCAL, POR NATUREZA
              </span>
              {themeButton}
            </div>
          </header>
          <main className="gallery-main">
            <div className="gallery-title">
              <div>
                <div className="eyebrow">SEU ESPAÇO DE CRIAÇÃO</div>
                <h1>
                  Suas histórias começam aqui<span>.</span>
                </h1>
                <p>Quadros, palavras e um pouco de espaço para imaginar.</p>
              </div>
              <button className="button secondary" onClick={() => archiveInput.current?.click()}>
                <Upload size={16} />
                Importar projeto
              </button>
            </div>
            <div className="section-heading">
              <h2>
                Seus projetos <span>{records.length.toString().padStart(2, '0')}</span>
              </h2>
              <small>Mais recentes primeiro</small>
            </div>
            <div className="project-grid">
              <button
                className="new-project-card"
                onClick={() => {
                  setName('');
                  setCreate(true);
                }}
              >
                <span className="new-plus">
                  <Plus size={28} />
                </span>
                <strong>Uma nova história</strong>
                <span>Comece com uma página em branco</span>
                <span className="new-project-link">
                  Criar projeto <ArrowUpRight size={15} />
                </span>
              </button>
              {records.map((record) => (
                <article className="project-card" key={record.id}>
                  <button
                    className="project-cover"
                    onClick={() => {
                      location.hash = `/project/${record.id}`;
                    }}
                    aria-label={`Abrir ${record.document.name}`}
                  >
                    <Thumb blob={record.thumbnail} />
                    <span className="cover-badge">
                      {record.document.pages.length}{' '}
                      {record.document.pages.length === 1 ? 'página' : 'páginas'}
                    </span>
                  </button>
                  <div className="project-card-info">
                    <button
                      className="project-name"
                      onClick={() => {
                        location.hash = `/project/${record.id}`;
                      }}
                    >
                      {record.document.name}
                    </button>
                    <Dropdown.Root>
                      <Dropdown.Trigger asChild>
                        <button className="icon-button" aria-label={`Opções de ${record.document.name}`}>
                          <Ellipsis size={19} />
                        </button>
                      </Dropdown.Trigger>
                      <Dropdown.Portal>
                        <Dropdown.Content className="dropdown" align="end" sideOffset={6}>
                          <Dropdown.Item
                            onSelect={() => {
                              setName(record.document.name);
                              setRename(record);
                            }}
                          >
                            <Pencil size={14} />
                            Renomear
                          </Dropdown.Item>
                          <Dropdown.Item onSelect={() => void duplicateProject(record).catch(notifyError)}>
                            <Copy size={14} />
                            Duplicar projeto
                          </Dropdown.Item>
                          <Dropdown.Separator />
                          <Dropdown.Item onSelect={() => setDeleteRecord(record)}>
                            <Trash2 size={14} />
                            Excluir projeto
                          </Dropdown.Item>
                        </Dropdown.Content>
                      </Dropdown.Portal>
                    </Dropdown.Root>
                    <p>
                      Editado{' '}
                      {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(
                        record.document.updatedAt,
                      )}
                      <span>·</span>
                      {formatBytes(
                        record.bytes ??
                          record.document.assets.reduce((s, a) => s + a.bytes, 0) +
                            JSON.stringify(record.document).length,
                      )}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <div className="gallery-bottom">
              <div className="privacy-note">
                <HardDrive size={21} />
                <p>
                  <strong>Suas ideias ficam com você.</strong>
                  <span>
                    Projetos salvos neste navegador. Baixe uma cópia para levar a outro computador ou guardar
                    no Drive.
                  </span>
                </p>
              </div>
              <span>{storage || 'Sem conta. Sem servidor.'}</span>
            </div>
          </main>
          <footer className="gallery-footer">
            <Logo />
            <span>FEITO PARA HISTÓRIAS QUE CONTINUAM ↓</span>
            <span>Editor de webtoons · v1.0</span>
          </footer>
        </div>
      ) : loading ? (
        <div className="loading-screen">
          <Logo />
          <LoaderCircle className="spin" />
          <p>Abrindo seu estúdio…</p>
        </div>
      ) : loadError ? (
        <div className="loading-screen">
          <TriangleAlert />
          <h2>Não foi possível abrir</h2>
          <p>{loadError}</p>
          <button
            className="button primary"
            onClick={() => {
              location.hash = '/';
            }}
          >
            Voltar aos projetos
          </button>
        </div>
      ) : project ? (
        <div className="editor">
          <header className="editor-header">
            <div className="editor-identity">
              <IconButton label="Voltar aos projetos" onClick={() => void home()}>
                <ArrowLeft size={18} />
              </IconButton>
              <a
                href="#/"
                className="editor-mark"
                aria-label="Cartoon Loop"
                onClick={(e) => {
                  e.preventDefault();
                  void home();
                }}
              >
                <Logo />
              </a>
              <span className="header-divider" />
              <div className="project-heading">
                <button
                  disabled={readonly}
                  onClick={() => {
                    setName(project.name);
                    setRename({ id: project.id, document: project });
                  }}
                >
                  {project.name}
                  <ChevronDown size={13} />
                </button>
                <span className={`save-status ${saveState}`}>
                  {readonly ? (
                    <>
                      <LockKeyhole size={10} />
                      Somente leitura
                    </>
                  ) : saveState === 'saved' ? (
                    <>
                      <Check size={11} />
                      Salvo neste navegador
                    </>
                  ) : saveState === 'saving' ? (
                    <>
                      <LoaderCircle size={11} className="spin" />
                      Salvando…
                    </>
                  ) : (
                    <>
                      <TriangleAlert size={11} />
                      Falha ao salvar · baixe um backup
                    </>
                  )}
                </span>
              </div>
            </div>
            <div className="header-actions">
              <div className="history-controls">
                <IconButton
                  label="Desfazer (Ctrl+Z)"
                  onClick={() => useEditor.getState().undo()}
                  disabled={!past.length || readonly}
                >
                  <Undo2 size={17} />
                </IconButton>
                <IconButton
                  label="Refazer (Ctrl+Shift+Z)"
                  onClick={() => useEditor.getState().redo()}
                  disabled={!future.length || readonly}
                >
                  <Redo2 size={17} />
                </IconButton>
              </div>
              <span className="header-divider" />
              {themeButton}
              <IconButton
                label="Salvar (Ctrl+S)"
                disabled={readonly}
                onClick={() =>
                  void flushSave()
                    .then(() => useEditor.getState().notify('Projeto salvo neste navegador.'))
                    .catch(notifyError)
                }
              >
                <Save size={17} />
              </IconButton>
              <button className="button secondary backup-button" onClick={() => void backup()}>
                <Download size={15} />
                <span>Baixar projeto</span>
              </button>
              <button className="button primary export-button" onClick={() => setExportOpen(true)}>
                <ArrowUpRight size={16} />
                Exportar
              </button>
            </div>
          </header>
          {readonly && (
            <div className="readonly-banner">
              <LockKeyhole size={14} />
              Este projeto está aberto em outra aba. Esta cópia está em modo de leitura.
            </div>
          )}
          {saveState === 'error' && (
            <div className="readonly-banner">
              <TriangleAlert size={14} />
              Não foi possível salvar. Mantenha esta aba aberta e{' '}
              <button className="text-button" onClick={() => void backup()}>
                baixe seu projeto
              </button>
              .
            </div>
          )}
          <div className="editor-body">
            <Library
              collapsed={leftCollapsed}
              onToggle={() => setLeftCollapsed(!leftCollapsed)}
              onImport={() => imageInput.current?.click()}
            />
            <div className="canvas-column">
              <div className="canvas-topbar">
                <div>
                  <MousePointer2 size={14} />
                  <span>Selecionar</span>
                  <kbd>V</kbd>
                </div>
                <div>
                  <button onClick={() => imageInput.current?.click()} disabled={readonly}>
                    <ImagePlus size={14} />
                    Imagem
                  </button>
                  <button onClick={() => useEditor.getState().addPage()} disabled={readonly}>
                    <FilePlus2 size={14} />
                    Página
                  </button>
                </div>
              </div>
              <Suspense fallback={<div className="canvas-area" />}>
                <Canvas onImport={importImages} dropPreset={dropPreset} />
              </Suspense>
              <footer className="canvas-footer">
                <div className="page-control">
                  <Choice
                    label="Página ativa"
                    value={project.pages.some((p) => p.id === activePage) ? activePage : project.pages[0].id}
                    options={project.pages.map((pg) => ({ value: pg.id, label: pg.name }))}
                    onChange={(id) => focusPage(id)}
                  />
                  <span>
                    {project.pages.length} {project.pages.length === 1 ? 'página' : 'páginas'}
                  </span>
                </div>
                <button className="shortcut-hint" onClick={() => setShortcuts(true)}>
                  Espaço + arrastar <span>para navegar</span>
                </button>
                <div className="zoom-controls">
                  <IconButton label="Diminuir zoom" onClick={() => zoomBy(1 / 1.2)}>
                    <Minus size={14} />
                  </IconButton>
                  <button className="zoom-value" onClick={() => focusPage(activePage)}>
                    {Math.round(zoom * 100)}%
                  </button>
                  <IconButton label="Aumentar zoom" onClick={() => zoomBy(1.2)}>
                    <Plus size={14} />
                  </IconButton>
                  <IconButton label="Ajustar página inteira" onClick={() => focusPage(activePage, true)}>
                    <Maximize size={15} />
                  </IconButton>
                  <span className="header-divider" />
                  <IconButton label="Prévia de leitura" onClick={() => setReaderOpen(true)}>
                    <BookOpen size={17} />
                  </IconButton>
                </div>
              </footer>
            </div>
            <Inspector collapsed={rightCollapsed} onToggle={() => setRightCollapsed(!rightCollapsed)} />
          </div>
          <div className="mobile-editor">
            <BookOpen size={38} />
            <h2>Uma história na palma da mão.</h2>
            <p>
              A edição completa precisa de uma tela maior. Aqui você pode ler sua história ou baixar o
              projeto.
            </p>
            <button className="button primary" onClick={() => setReaderOpen(true)}>
              Abrir prévia de leitura
            </button>
            <button className="button secondary" onClick={() => void backup()}>
              Baixar projeto
            </button>
            <button className="text-button" onClick={() => void home()}>
              Voltar aos projetos
            </button>
          </div>
          <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} project={project} />
          <Reader open={readerOpen} onClose={() => setReaderOpen(false)} project={project} />
        </div>
      ) : null}
      <Modal
        open={create}
        onOpenChange={setCreate}
        title="Uma página, muitas possibilidades"
        description="Escolha seu ponto de partida. Você pode adicionar páginas e ajustar as dimensões depois."
      >
        <label className="field">
          <span>Nome do projeto</span>
          <input
            autoFocus
            placeholder="Minha próxima história"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void newDocument();
            }}
          />
        </label>
        <Choice
          label="Formato inicial"
          value={String(width)}
          onChange={(v) => setWidth(Number(v))}
          options={[
            { value: '800', label: 'Webtoon · 800 px · recomendado' },
            { value: '940', label: 'Tapas · 940 px' },
            { value: '1600', label: 'Alta resolução · 1.600 px' },
            ...(![800, 940, 1600].includes(width) ? [{ value: String(width), label: 'Personalizado' }] : []),
          ]}
        />
        <div className="field-pair">
          <NumberField label="Largura" value={width} onChange={setWidth} min={320} max={1600} suffix="px" />
          <NumberField
            label="Altura"
            value={height}
            onChange={setHeight}
            min={1000}
            max={16000}
            suffix="px"
          />
        </div>
        <div className="dimension-presets">
          {[5000, 10000, 16000].map((h) => (
            <button className={height === h ? 'active' : ''} key={h} onClick={() => setHeight(h)}>
              {h.toLocaleString('pt-BR')} px {h === 10000 && <small>recomendado</small>}
            </button>
          ))}
        </div>
        <div className="modal-note">
          <HardDrive size={17} />
          <p>
            Salvo localmente, sem precisar de conta.
            <br />
            Lembre-se de baixar cópias de segurança.
          </p>
        </div>
        <div className="modal-actions">
          <button className="button secondary" onClick={() => setCreate(false)}>
            Cancelar
          </button>
          <button className="button primary" onClick={() => void newDocument()}>
            <Plus size={16} />
            Criar projeto
          </button>
        </div>
      </Modal>
      <Modal open={!!rename} onOpenChange={() => setRename(null)} title="Renomear projeto">
        <label className="field">
          <span>Nome do projeto</span>
          <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button className="button secondary" onClick={() => setRename(null)}>
            Cancelar
          </button>
          <button
            className="button primary"
            disabled={!name.trim()}
            onClick={() => {
              if (!rename) return;
              if (isEditor && project?.id === rename.id) {
                useEditor.getState().run('Renomear projeto', (p) => {
                  p.name = name.trim();
                });
                setRename(null);
              } else
                void (async () => {
                  const lock = await acquireProjectLock(rename.id);
                  if (!lock.writable)
                    throw new Error('Feche a aba que está editando este projeto antes de renomear.');
                  try {
                    const current = await db.projects.get(rename.id);
                    if (current)
                      await saveProject({ ...current.document, name: name.trim(), updatedAt: Date.now() });
                    setRename(null);
                  } finally {
                    lock.release();
                  }
                })().catch(notifyError);
            }}
          >
            Salvar nome
          </button>
        </div>
      </Modal>
      <Modal
        open={!!deleteRecord}
        onOpenChange={() => setDeleteRecord(null)}
        title="Excluir este projeto?"
        description={`“${deleteRecord?.document.name}” será removido deste navegador, incluindo as imagens. Só será possível recuperá-lo importando uma cópia baixada anteriormente.`}
      >
        <div className="modal-actions">
          <button className="button secondary" onClick={() => setDeleteRecord(null)}>
            Manter projeto
          </button>
          <button
            className="button primary"
            onClick={() => {
              if (deleteRecord)
                void (async () => {
                  const lock = await acquireProjectLock(deleteRecord.id);
                  if (!lock.writable) {
                    useEditor
                      .getState()
                      .notify('Feche a aba que está editando este projeto antes de excluí-lo.', true);
                    return;
                  }
                  try {
                    await deleteProject(deleteRecord.id);
                    setDeleteRecord(null);
                    useEditor
                      .getState()
                      .notify(
                        'Projeto e imagens removidos deste navegador. A recuperação requer seu arquivo de backup.',
                      );
                  } finally {
                    lock.release();
                  }
                })().catch(notifyError);
            }}
          >
            Excluir projeto
          </button>
        </div>
      </Modal>
      <Modal open={shortcuts} onOpenChange={setShortcuts} title="Um ritmo mais rápido">
        <div className="shortcut-list">
          {[
            ['Espaço + arrastar', 'Navegar no canvas'],
            ['Botão central', 'Arrastar a área de trabalho'],
            ['Ctrl + rolar / pinça', 'Zoom no ponteiro'],
            ['Shift + clique', 'Selecionar vários objetos'],
            ['Arrastar no fundo', 'Selecionar por área'],
            ['Alt + arrastar', 'Desativar magnetismo'],
            ['Ctrl + C / V / D', 'Copiar / colar / duplicar'],
            ['Ctrl + Z / Shift + Z', 'Desfazer / refazer'],
            ['Ctrl + S / Shift + S', 'Salvar / baixar projeto'],
            ['Delete', 'Excluir seleção'],
            ['Setas / Shift + setas', 'Mover 1 / 10 pixels'],
            ['Duplo clique', 'Editar o texto'],
          ].map(([key, desc]) => (
            <div key={key}>
              <span>{desc}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
      </Modal>
      {working && (
        <div className="working-toast" role="status">
          <LoaderCircle className="spin" size={16} />
          <span>{working}</span>
        </div>
      )}
      <div className="toast-stack" aria-live="polite">
        {notices.map((n) => (
          <div className={`toast ${n.error ? 'error' : ''}`} key={n.id}>
            {n.error ? <TriangleAlert size={17} /> : <Check size={17} />}
            <span>{n.message}</span>
            <button
              className="icon-button"
              aria-label="Dispensar notificação"
              onClick={() => useEditor.setState((s) => ({ notices: s.notices.filter((v) => v.id !== n.id) }))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Tooltip.Provider>
  );
}
