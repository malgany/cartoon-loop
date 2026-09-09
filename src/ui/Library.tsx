import { useEffect, useRef, useState } from 'react';
import {
  Columns2,
  ImagePlus,
  LayoutGrid,
  Layers,
  MessageCircle,
  Type,
  ArrowDownUp,
  Plus,
  Eye,
  EyeOff,
  LockKeyhole,
  UnlockKeyhole,
  ChevronDown,
  ChevronRight,
  Image,
  PanelTop,
  FilePlus2,
  Trash2,
} from 'lucide-react';
import {
  BALLOONS,
  PANEL_PRESETS,
  type Balloon,
  type Panel,
  type SceneNode,
  pagePositions,
} from '../core/model';
import { moveLayer } from '../core/layers';
import { useEditor } from '../core/store';
import { imageBlob } from '../core/storage';
import { IconButton, Modal } from './primitives';

export function BalloonIcon({ kind }: { kind: Balloon['kind'] }) {
  return (
    <svg width="78" height="58" viewBox="0 0 100 70" fill="none" aria-hidden="true">
      {kind === 'caption' ? (
        <rect x="13" y="12" width="74" height="44" rx="1" />
      ) : kind === 'shout' || kind === 'electronic' ? (
        <path d="M50 6 60 15 76 8 76 23 94 27 81 38 87 53 67 52 59 65 46 55 27 61 29 47 9 43 21 31 12 17 34 19Z" />
      ) : kind === 'rounded' ? (
        <path d="M25 10h52q12 0 12 12v22q0 12-12 12H49L29 67l4-11h-8q-12 0-12-12V22q0-12 12-12Z" />
      ) : kind === 'thought' ? (
        <>
          <path d="M24 48C4 46 7 28 18 26 8 11 35 4 41 14 53-1 74 7 74 15 92 8 100 30 86 36 93 54 65 61 59 51 43 63 27 60 24 48Z" />
          <circle cx="27" cy="63" r="4" />
          <circle cx="17" cy="68" r="2" />
        </>
      ) : (
        <path
          strokeDasharray={kind === 'whisper' ? '5 4' : undefined}
          d={
            kind === 'wavy'
              ? 'M16 25Q9 9 29 13Q40 3 52 12Q66 3 78 15Q97 16 88 33Q99 50 75 50Q61 61 48 52L25 66 30 53Q8 53 15 41Q5 33 16 25Z'
              : 'M88 32c0 15-17 25-37 25h-7L24 66l5-15C17 47 11 41 11 32 11 18 28 8 50 8s38 10 38 24Z'
          }
        />
      )}
      <path d="M34 27h33M34 35h23" opacity=".32" />
    </svg>
  );
}
const tabs = [
  { id: 'frames', label: 'Quadros', icon: LayoutGrid },
  { id: 'balloons', label: 'Balões', icon: MessageCircle },
  { id: 'text', label: 'Textos', icon: Type },
  { id: 'transitions', label: 'Transições', icon: ArrowDownUp },
  { id: 'images', label: 'Imagens', icon: ImagePlus },
  { id: 'layers', label: 'Páginas e camadas', icon: Layers },
];
function AssetThumb({ id, onAdd }: { id: string; onAdd: () => void }) {
  const p = useEditor((s) => s.project)!,
    readonly = useEditor((s) => s.readonly);
  const [url, setUrl] = useState('');
  const thumbRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true,
      url = '',
      generation = 0,
      visible = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const next = entries.some((e) => e.isIntersecting);
        if (next === visible) return;
        visible = next;
        const current = ++generation;
        if (!next) {
          URL.revokeObjectURL(url);
          url = '';
          setUrl('');
          return;
        }
        void imageBlob(p.id, id)
          .then((blob) => {
            if (active && current === generation) {
              url = URL.createObjectURL(blob);
              setUrl(url);
            }
          })
          .catch(() => {});
      },
      { rootMargin: '200px' },
    );
    if (thumbRef.current) observer.observe(thumbRef.current);
    return () => {
      active = false;
      observer.disconnect();
      URL.revokeObjectURL(url);
    };
  }, [p.id, id]);
  const asset = p.assets.find((a) => a.id === id)!;
  return (
    <button
      ref={thumbRef}
      className="asset-thumb"
      onClick={onAdd}
      disabled={readonly}
      draggable={!readonly}
      onDragStart={(e) =>
        e.dataTransfer.setData('application/cartoonloop', JSON.stringify({ type: 'asset', id }))
      }
    >
      <div className="checker">{url && <img src={url} alt="" />}</div>
      <span>{asset.name}</span>
    </button>
  );
}
export default function Library({
  collapsed,
  onToggle,
  onImport,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onImport: () => void;
}) {
  const [tab, setTab] = useState('frames'),
    [confirmPage, setConfirmPage] = useState<string | null>(null),
    [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const p = useEditor((s) => s.project)!,
    selection = useEditor((s) => s.selection),
    readonly = useEditor((s) => s.readonly),
    activePage = useEditor((s) => s.activePage);
  const notify = useEditor((s) => s.notify);
  const [layerHover, setLayerHover] = useState<{ id: string; above: boolean } | null>(null);
  const layerDrag = (n: SceneNode) => ({
    draggable: !readonly && !n.locked,
    'data-layer-id': n.id,
    style:
      layerHover?.id === n.id
        ? { boxShadow: layerHover.above ? 'inset 0 2px var(--text)' : 'inset 0 -2px var(--text)' }
        : undefined,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.setData('application/cartoonloop-layer', n.id);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (e: React.DragEvent) => {
      if (readonly || !e.dataTransfer.types.includes('application/cartoonloop-layer')) return;
      e.preventDefault();
      e.stopPropagation();
      const bounds = e.currentTarget.getBoundingClientRect();
      setLayerHover({ id: n.id, above: e.clientY < bounds.top + bounds.height / 2 });
    },
    onDragLeave: () => setLayerHover(null),
    onDragEnd: () => setLayerHover(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const source = e.dataTransfer.getData('application/cartoonloop-layer');
      const bounds = e.currentTarget.getBoundingClientRect();
      if (source)
        useEditor
          .getState()
          .run('Reordenar camada', (draft) =>
            moveLayer(draft, source, n.id, e.clientY < bounds.top + bounds.height / 2),
          );
      setLayerHover(null);
    },
  });
  const presetDrag = (type: string, id: string) => ({
    draggable: !readonly,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('application/cartoonloop', JSON.stringify({ type, id }));
      if (type === 'balloon') e.dataTransfer.setData('application/cartoonloop-balloon', id);
    },
  });
  return (
    <aside className={`library ${collapsed ? 'collapsed' : ''}`}>
      <nav className="tool-rail" aria-label="Ferramentas de criação">
        {tabs.map((t) => (
          <IconButton
            key={t.id}
            label={t.label}
            active={tab === t.id && !collapsed}
            onClick={() => {
              setTab(t.id);
              if (collapsed) onToggle();
            }}
          >
            <t.icon size={19} />
          </IconButton>
        ))}
        <span className="rail-spacer" />
        <IconButton label={collapsed ? 'Abrir biblioteca' : 'Recolher biblioteca'} onClick={onToggle}>
          <Columns2 size={18} />
        </IconButton>
      </nav>
      {!collapsed && (
        <div className="library-content">
          <div className="sidebar-heading">
            <h2>{tabs.find((t) => t.id === tab)?.label}</h2>
            <span className="eyebrow">BIBLIOTECA</span>
          </div>
          <div className="sidebar-scroll">
            {tab === 'frames' && (
              <>
                <p className="sidebar-intro">Cada quadro, um novo momento.</p>
                <div className="preset-grid">
                  {PANEL_PRESETS.map((pr) => (
                    <button
                      key={pr.id}
                      className="preset-card"
                      disabled={readonly}
                      onClick={() => useEditor.getState().addPanel(pr.id)}
                      {...presetDrag('panel', pr.id)}
                    >
                      <div className={`frame-preview ${pr.id}`}>
                        <i />
                      </div>
                      <strong>{pr.name}</strong>
                      <small>
                        {pr.id === 'bleed'
                          ? 'Sem margens laterais'
                          : pr.ratio === 1
                            ? '1:1'
                            : pr.ratio === 16 / 9
                              ? '16:9'
                              : pr.ratio === 2 / 3
                                ? '2:3'
                                : pr.ratio === 4
                                  ? '4:1'
                                  : '1:3'}
                      </small>
                    </button>
                  ))}
                </div>
                <div className="sidebar-note">
                  <span className="note-icon">
                    <Plus size={14} />
                  </span>
                  <p>Clique para inserir ou arraste até a página. Ajuste forma e bordas nas propriedades.</p>
                </div>
                <div className="mini-heading">Um pouco mais de liberdade</div>
                <button
                  className="wide-option"
                  disabled={readonly}
                  onClick={() => useEditor.getState().addPanel('borderless')}
                >
                  <span className="dashed-square" />
                  <span>
                    Quadro sem borda<small>A moldura só aparece na edição</small>
                  </span>
                </button>
                <button
                  className="wide-option"
                  disabled={readonly}
                  onClick={() => useEditor.getState().addPanel('overflow')}
                >
                  <span className="breakout-preview" />
                  <span>
                    Com transbordamento<small>Deixe a arte sair do quadro</small>
                  </span>
                </button>
              </>
            )}
            {tab === 'balloons' && (
              <>
                <p className="sidebar-intro">Dê voz à sua história.</p>
                <div className="preset-grid balloons">
                  {BALLOONS.map((b) => (
                    <button
                      className="preset-card"
                      key={b.id}
                      disabled={readonly}
                      onClick={() => useEditor.getState().addText(b.id)}
                      {...presetDrag('balloon', b.id)}
                    >
                      <BalloonIcon kind={b.id} />
                      <strong>{b.name}</strong>
                    </button>
                  ))}
                </div>
                <div className="sidebar-note">
                  <p>Duplo clique para escrever. Arraste o ponto do ponteiro para indicar quem fala.</p>
                </div>
              </>
            )}
            {tab === 'text' && (
              <>
                <p className="sidebar-intro">Palavras que também desenham.</p>
                <button
                  className="add-text-card"
                  disabled={readonly}
                  onClick={() => useEditor.getState().addText()}
                  {...presetDrag('text', 'text')}
                >
                  <span>Aa</span>
                  <strong>Adicionar texto</strong>
                  <small>Legenda ou onomatopeia</small>
                </button>
                <div className="font-sample">
                  <span className="eyebrow">COMIC NEUE</span>
                  <p>
                    Um novo capítulo
                    <br />
                    começa aqui.
                  </p>
                  <small>
                    Regular · Negrito · Itálico
                    <br />
                    Fonte incluída no projeto.
                  </small>
                </div>
              </>
            )}
            {tab === 'transitions' && (
              <>
                <p className="sidebar-intro">O espaço também conta a história.</p>
                {[
                  { name: 'Pausa curta', height: 80, desc: 'Ação e conversa contínua' },
                  { name: 'Pausa média', height: 200, desc: 'Respiração entre momentos' },
                  { name: 'Pausa longa', height: 600, desc: 'Suspense ou mudança de cena' },
                ].map((t) => (
                  <button
                    className="transition-card"
                    key={t.height}
                    disabled={readonly}
                    onClick={() => useEditor.getState().addPanel('horizontal', 'spacer', t.height)}
                    {...presetDrag('spacer', String(t.height))}
                  >
                    <span className="space-preview" style={{ height: Math.min(65, t.height / 10 + 16) }} />
                    <span>
                      <strong>{t.name}</strong>
                      <small>{t.desc}</small>
                    </span>
                    <b>{t.height}</b>
                  </button>
                ))}
                <div className="mini-heading">Transição visual</div>
                <button
                  className="transition-gradient"
                  disabled={readonly}
                  onClick={() => useEditor.getState().addPanel('horizontal', 'transition', 500)}
                  {...presetDrag('transition', 'gradient')}
                />
                <p className="help-text">Faixa com cor ou degradê. Ajuste a duração visual pela altura.</p>
              </>
            )}
            {tab === 'images' && (
              <>
                <button className="upload-card" onClick={onImport} disabled={readonly}>
                  <ImagePlus size={28} />
                  <strong>Adicionar imagens</strong>
                  <span>ou arraste arquivos para o canvas</span>
                  <small>PNG, JPG, WebP · até 20 MiB cada</small>
                </button>
                {p.assets.length > 0 ? (
                  <>
                    <div className="mini-heading">
                      Neste projeto <span>{p.assets.length}</span>
                    </div>
                    <div className="asset-grid">
                      {p.assets.map((a) => (
                        <AssetThumb key={a.id} id={a.id} onAdd={() => useEditor.getState().addImage(a)} />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="help-text">
                    Suas imagens ficam neste navegador e acompanham o arquivo de projeto.
                  </p>
                )}
              </>
            )}
            {tab === 'layers' && (
              <>
                <button
                  className="button secondary full"
                  onClick={() => useEditor.getState().addPage()}
                  disabled={readonly}
                >
                  <FilePlus2 size={16} />
                  Adicionar página
                </button>
                <div className="page-tree">
                  <p className="help-text">Camadas de cima aparecem na frente. Arraste para reordenar.</p>
                  {p.pages.map((page) => (
                    <div className="tree-page" key={page.id}>
                      <div className={`tree-row page-row ${page.id === activePage ? 'selected' : ''}`}>
                        <button
                          onClick={() => {
                            useEditor.setState({ activePage: page.id, selection: [] });
                            const pos = pagePositions(p).get(page.id)!;
                            const zoom = useEditor.getState().view.zoom;
                            useEditor.getState().setView({ x: 32 - pos.x * zoom, y: 56 });
                          }}
                        >
                          <PanelTop size={14} />
                          <span>
                            {page.name}
                            <small>{page.automatic ? 'Continuação' : `${page.width} × ${page.height}`}</small>
                          </span>
                        </button>
                        {!readonly && !page.automatic && p.pages.filter((pg) => !pg.automatic).length > 1 && (
                          <button aria-label={`Excluir ${page.name}`} onClick={() => setConfirmPage(page.id)}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      {p.nodes
                        .filter((n) => (n.type === 'panel' || n.type === 'balloon') && n.pageId === page.id)
                        .reverse()
                        .map((panel) =>
                          panel.type !== 'panel' ? (
                            <div
                              key={panel.id}
                              className={`tree-row ${selection.includes(panel.id) ? 'selected' : ''}`}
                              {...layerDrag(panel)}
                            >
                              <button onClick={() => useEditor.getState().select([panel.id])}>
                                <MessageCircle size={13} />
                                <span>{panel.name}</span>
                              </button>
                              <button
                                aria-label={panel.hidden ? 'Mostrar balão' : 'Ocultar balão'}
                                disabled={readonly}
                                onClick={() =>
                                  useEditor.getState().patch([panel.id], { hidden: !panel.hidden })
                                }
                              >
                                {panel.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                              <button
                                aria-label={panel.locked ? 'Desbloquear balão' : 'Bloquear balão'}
                                disabled={readonly}
                                onClick={() =>
                                  useEditor.getState().patch([panel.id], { locked: !panel.locked })
                                }
                              >
                                {panel.locked ? <LockKeyhole size={12} /> : <UnlockKeyhole size={12} />}
                              </button>
                            </div>
                          ) : (
                            <div key={panel.id}>
                              <div
                                className={`tree-row ${selection.includes(panel.id) ? 'selected' : ''}`}
                                {...layerDrag(panel)}
                              >
                                <button
                                  className="tree-expand"
                                  aria-label="Expandir quadro"
                                  onClick={() =>
                                    setExpanded({ ...expanded, [panel.id]: !(expanded[panel.id] ?? true) })
                                  }
                                >
                                  {expanded[panel.id] === false ? (
                                    <ChevronRight size={12} />
                                  ) : (
                                    <ChevronDown size={12} />
                                  )}
                                </button>
                                <button onClick={() => useEditor.getState().select([panel.id])}>
                                  <LayoutGrid size={13} />
                                  <span>{panel.name}</span>
                                </button>
                                <button
                                  aria-label={panel.hidden ? 'Mostrar quadro' : 'Ocultar quadro'}
                                  disabled={readonly}
                                  onClick={() =>
                                    useEditor.getState().patch([panel.id], { hidden: !panel.hidden })
                                  }
                                >
                                  {panel.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                                </button>
                                <button
                                  aria-label={panel.locked ? 'Desbloquear quadro' : 'Bloquear quadro'}
                                  disabled={readonly}
                                  onClick={() =>
                                    useEditor.getState().patch([panel.id], { locked: !panel.locked })
                                  }
                                >
                                  {panel.locked ? <LockKeyhole size={12} /> : <UnlockKeyhole size={12} />}
                                </button>
                              </div>
                              {expanded[panel.id] !== false &&
                                p.nodes
                                  .filter((n) => n.type !== 'panel' && n.panelId === panel.id)
                                  .reverse()
                                  .map((n) => (
                                    <button
                                      key={n.id}
                                      {...layerDrag(n)}
                                      className={`tree-child ${selection.includes(n.id) ? 'selected' : ''}`}
                                      onClick={() => useEditor.getState().select([n.id])}
                                    >
                                      {n.type === 'image' ? (
                                        <Image size={13} />
                                      ) : n.type === 'balloon' ? (
                                        <MessageCircle size={13} />
                                      ) : (
                                        <Type size={13} />
                                      )}
                                      <span>{n.name}</span>
                                      {n.hidden && <EyeOff size={12} />}
                                    </button>
                                  ))}
                            </div>
                          ),
                        )}
                    </div>
                  ))}
                </div>
                <div className="mini-heading">Objetos soltos</div>
                <p className="help-text">Guardados no projeto. Não serão exportados.</p>
                {p.nodes
                  .filter((n) => n.type !== 'panel' && !n.panelId && !(n.type === 'balloon' && n.pageId))
                  .reverse()
                  .map((n) => (
                    <button
                      className={`tree-child ${selection.includes(n.id) ? 'selected' : ''}`}
                      key={n.id}
                      {...layerDrag(n)}
                      onClick={() => {
                        useEditor.getState().select([n.id]);
                        const s = useEditor.getState();
                        s.setView({
                          x: s.view.width / 2 - (n.x + n.width / 2) * s.view.zoom,
                          y: s.view.height / 2 - (n.y + n.height / 2) * s.view.zoom,
                        });
                      }}
                    >
                      {n.type === 'image' ? <Image size={13} /> : <Type size={13} />}
                      <span>{n.name}</span>
                    </button>
                  ))}
              </>
            )}
          </div>
          <div className="sidebar-foot">
            <span className="status-dot" />
            Seu estúdio, no navegador
          </div>
        </div>
      )}
      <Modal
        open={!!confirmPage}
        onOpenChange={() => setConfirmPage(null)}
        title="Excluir página e continuação?"
        description="Os quadros e objetos dessa sequência serão removidos. Você poderá desfazer esta ação."
      >
        <div className="modal-actions">
          <button className="button secondary" onClick={() => setConfirmPage(null)}>
            Cancelar
          </button>
          <button
            className="button primary"
            onClick={() => {
              const ids = p.pages.filter((pg) => pg.sequenceId === confirmPage).map((pg) => pg.id);
              const panels = p.nodes
                .filter((n): n is Panel => n.type === 'panel' && ids.includes(n.pageId))
                .map((n) => n.id);
              useEditor.getState().run('Excluir sequência', (draft) => {
                draft.pages = draft.pages.filter((pg) => !ids.includes(pg.id));
                draft.nodes = draft.nodes.filter((n) =>
                  n.type === 'panel'
                    ? !panels.includes(n.id)
                    : n.type === 'balloon' && n.pageId
                      ? !ids.includes(n.pageId)
                      : !n.panelId || !panels.includes(n.panelId),
                );
              });
              useEditor.setState({ activePage: useEditor.getState().project!.pages[0].id, selection: [] });
              setConfirmPage(null);
              notify('Sequência removida. Use desfazer para recuperar.');
            }}
          >
            Excluir sequência
          </button>
        </div>
      </Modal>
    </aside>
  );
}
