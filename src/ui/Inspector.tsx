import { useState } from 'react';
import {
  SlidersHorizontal,
  FlipHorizontal2,
  FlipVertical2,
  Copy,
  Trash2,
  ArrowUpToLine,
  ArrowDownToLine,
  Unlink,
  Maximize2,
  Scaling,
  AlignLeft,
  AlignCenter,
  AlignRight,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useEditor } from '../core/store';
import { BALLOONS, worldOrigin, isNodeLocked, type Balloon, type Panel } from '../core/model';
import { textHeight } from '../core/drawing';
import { Choice, NumberField, ColorField, Toggle, IconButton, Modal } from './primitives';

export default function Inspector({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const project = useEditor((s) => s.project)!,
    selection = useEditor((s) => s.selection),
    readonly = useEditor((s) => s.readonly),
    activePage = useEditor((s) => s.activePage);
  const selected = project.nodes.find((n) => n.id === selection[0]),
    page = project.pages.find((pg) => pg.id === activePage) || project.pages[0];
  const [scaleDialog, setScaleDialog] = useState(false),
    [factor, setFactor] = useState(100);
  const patch = (values: Record<string, unknown>) => useEditor.getState().patch(selection, values);
  const patchPage = (values: Record<string, unknown>) =>
    useEditor.getState().run('Alterar página', (p) => {
      for (const pg of p.pages) if (pg.sequenceId === page.sequenceId) Object.assign(pg, values);
    });
  const text = selected && (selected.type === 'balloon' || selected.type === 'text') ? selected : null;
  const panel = selected?.type === 'panel' ? selected : null;
  const textOverflow = (() => {
    if (!text) return false;
    const c = document.createElement('canvas').getContext('2d');
    return c ? textHeight(c, text) > text.height : false;
  })();
  return (
    <aside className={`inspector ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-heading">
        <h2>{collapsed ? '' : selected ? 'Propriedades' : 'Página'}</h2>
        <IconButton label={collapsed ? 'Abrir propriedades' : 'Recolher propriedades'} onClick={onToggle}>
          {collapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
        </IconButton>
      </div>
      {!collapsed && (
        <div className="sidebar-scroll">
          <fieldset disabled={readonly}>
            {!selected ? (
              <>
                <div className="inspector-page-preview">
                  <span>{String(project.pages.indexOf(page) + 1).padStart(2, '0')}</span>
                  <i />
                  <small>
                    {page.width} × {page.height}
                  </small>
                </div>
                <h3>{page.name}</h3>
                <p className="help-text">
                  {page.automatic
                    ? 'As dimensões seguem a página que iniciou esta sequência.'
                    : 'Dimensões em pixels. O zoom não altera a exportação.'}
                </p>
                <Choice
                  label="Formato"
                  value={[800, 940, 1600].includes(page.width) ? String(page.width) : 'custom'}
                  onChange={(v) => {
                    if (v !== 'custom')
                      patchPage({
                        width: +v,
                        margin: Math.round((24 * +v) / 800),
                        gapX: Math.round((16 * +v) / 800),
                      });
                  }}
                  options={[
                    { value: '800', label: 'Webtoon · 800 px' },
                    { value: '940', label: 'Tapas · 940 px' },
                    { value: '1600', label: 'Alta resolução · 1600 px' },
                    { value: 'custom', label: 'Personalizado' },
                  ]}
                />
                <div className="field-pair">
                  <NumberField
                    label="Largura"
                    value={page.width}
                    min={320}
                    max={1600}
                    onChange={(width) => patchPage({ width })}
                  />
                  <NumberField
                    label="Altura"
                    value={page.height}
                    min={1000}
                    max={16000}
                    onChange={(height) => patchPage({ height })}
                  />
                </div>
                <div className="segmented">
                  {[5000, 10000, 16000].map((height) => (
                    <button
                      key={height}
                      className={height === page.height ? 'active' : ''}
                      onClick={() => patchPage({ height })}
                    >
                      {height / 1000} mil
                    </button>
                  ))}
                </div>
                <ColorField
                  label="Fundo da página"
                  value={page.fill}
                  onChange={(fill) => patchPage({ fill })}
                />
                <div className="section-divider" />
                <h3>Organização automática</h3>
                <NumberField
                  label="Margens"
                  value={page.margin}
                  min={0}
                  max={150}
                  onChange={(margin) => patchPage({ margin })}
                  suffix="px"
                />
                <div className="field-pair">
                  <NumberField
                    label="Entre colunas"
                    value={page.gapX}
                    min={0}
                    max={100}
                    onChange={(gapX) => patchPage({ gapX })}
                  />
                  <NumberField
                    label="Entre linhas"
                    value={page.gapY}
                    min={0}
                    max={2000}
                    onChange={(gapY) => patchPage({ gapY })}
                  />
                </div>
                <div className="inspector-tip">
                  <SlidersHorizontal size={17} />
                  <p>Selecione um quadro, imagem ou balão para ajustar seus detalhes.</p>
                </div>
              </>
            ) : (
              <>
                <div className="selection-heading">
                  <span className="eyebrow">
                    {selection.length > 1
                      ? `${selection.length} OBJETOS`
                      : selected.type === 'panel'
                        ? 'QUADRO'
                        : selected.type === 'image'
                          ? 'IMAGEM'
                          : selected.type === 'balloon'
                            ? 'BALÃO'
                            : 'TEXTO'}
                  </span>
                  <div>
                    <IconButton label="Duplicar objeto" onClick={() => useEditor.getState().duplicate()}>
                      <Copy size={15} />
                    </IconButton>
                    <IconButton
                      label="Excluir objeto"
                      disabled={selected.locked}
                      onClick={() => useEditor.getState().remove()}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </div>
                {selection.length === 1 && (
                  <label className="field">
                    <span>Nome</span>
                    <input
                      aria-label="Nome do objeto"
                      key={selected.id + selected.name}
                      defaultValue={selected.name}
                      onBlur={(e) => {
                        if (e.target.value !== selected.name) patch({ name: e.target.value });
                      }}
                    />
                  </label>
                )}
                <Toggle
                  label="Bloqueado"
                  checked={selected.locked}
                  onChange={(locked) => patch({ locked })}
                />
                <Toggle
                  label="Visível"
                  checked={!selected.hidden}
                  onChange={(visible) => patch({ hidden: !visible })}
                />
                <div className="section-divider" />
                <fieldset disabled={isNodeLocked(project, selected)}>
                  {panel && (
                    <>
                      <div className="segmented" aria-label="Alinhamento do quadro na página">
                        {[
                          { label: 'Quadro à esquerda', x: page.margin, icon: AlignLeft },
                          {
                            label: 'Quadro centralizado',
                            x: (page.width - panel.width) / 2,
                            icon: AlignCenter,
                          },
                          {
                            label: 'Quadro à direita',
                            x: page.width - page.margin - panel.width,
                            icon: AlignRight,
                          },
                        ].map(({ label, x, icon: Icon }) => (
                          <button
                            key={label}
                            aria-label={label}
                            title={label}
                            onClick={() => patch({ mode: 'free', x })}
                          >
                            <Icon size={16} />
                          </button>
                        ))}
                      </div>
                      <p className="help-text">
                        Arraste para posicionar livremente. As guias alinham margens, centros e quadros. Alt
                        desativa o encaixe.
                      </p>
                      <Choice
                        label="Posicionamento"
                        value={panel.mode}
                        onChange={(mode) => patch({ mode })}
                        options={[
                          { value: 'flow', label: 'Automático · encaixar' },
                          { value: 'free', label: 'Livre · posicionar' },
                        ]}
                      />
                      {panel.mode === 'flow' && (
                        <>
                          <label className="field">
                            <span>Largura na linha</span>
                            <div className="segmented">
                              {[
                                { s: 12, t: 'Inteira' },
                                { s: 6, t: '½' },
                                { s: 4, t: '⅓' },
                                { s: 8, t: '⅔' },
                              ].map(({ s, t }) => (
                                <button
                                  key={s}
                                  className={panel.span === s ? 'active' : ''}
                                  onClick={() => patch({ span: s, edgeToEdge: false })}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </label>
                          <NumberField
                            label="Colunas ocupadas"
                            value={panel.span}
                            min={1}
                            max={12}
                            onChange={(span) => patch({ span: Math.round(span) })}
                          />
                        </>
                      )}
                    </>
                  )}
                  {(!panel || panel.mode === 'free') && (
                    <div className="field-pair">
                      <NumberField label="Posição X" value={selected.x} onChange={(x) => patch({ x })} />
                      <NumberField label="Posição Y" value={selected.y} onChange={(y) => patch({ y })} />
                    </div>
                  )}
                  <div className="field-pair">
                    {panel?.mode === 'flow' ? (
                      <label className="field">
                        <span>Largura</span>
                        <div className="readonly-value">{Math.round(panel.width)} px</div>
                      </label>
                    ) : (
                      <NumberField
                        label="Largura do objeto"
                        value={selected.width}
                        min={8}
                        onChange={(width) =>
                          patch({
                            width,
                            ...(selected.type === 'image' && selected.aspectLocked !== false
                              ? { height: (selected.height * width) / selected.width }
                              : {}),
                          })
                        }
                      />
                    )}
                    <NumberField
                      label="Altura do objeto"
                      value={selected.height}
                      min={8}
                      onChange={(height) =>
                        patch({
                          height,
                          ...(selected.type === 'image' && selected.aspectLocked !== false
                            ? { width: (selected.width * height) / selected.height }
                            : {}),
                        })
                      }
                    />
                  </div>
                  {!panel && (
                    <>
                      <div className="field-pair">
                        <NumberField
                          label="Rotação"
                          value={selected.rotation}
                          onChange={(rotation) => patch({ rotation })}
                          suffix="°"
                        />
                        <NumberField
                          label="Opacidade"
                          value={selected.opacity * 100}
                          min={0}
                          max={100}
                          onChange={(opacity) => patch({ opacity: opacity / 100 })}
                          suffix="%"
                        />
                      </div>
                      <div className="segmented">
                        <button
                          aria-label="Inverter horizontalmente"
                          onClick={() => patch({ flipX: !selected.flipX })}
                        >
                          <FlipHorizontal2 size={17} />
                        </button>
                        <button
                          aria-label="Inverter verticalmente"
                          onClick={() => patch({ flipY: !selected.flipY })}
                        >
                          <FlipVertical2 size={17} />
                        </button>
                        <button onClick={() => patch({ rotation: selected.rotation + 90 })}>+90°</button>
                        <button onClick={() => patch({ rotation: 0, flipX: false, flipY: false })}>
                          Reset
                        </button>
                      </div>
                    </>
                  )}
                  {panel && (
                    <>
                      <div className="section-divider" />
                      <h3>Aparência</h3>
                      <Choice
                        label="Forma"
                        value={panel.shape}
                        onChange={(shape) => patch({ shape })}
                        options={[
                          { value: 'rect', label: 'Retangular' },
                          { value: 'rounded', label: 'Arredondada' },
                          { value: 'oval', label: 'Oval' },
                          { value: 'diagonal', label: 'Diagonal' },
                        ]}
                      />
                      <ColorField
                        label="Fundo do quadro"
                        value={panel.fill}
                        onChange={(fill) => patch({ fill })}
                      />
                      {panel.role === 'transition' && (
                        <>
                          <Toggle
                            label="Degradê"
                            checked={!!panel.gradient}
                            onChange={(v) => patch({ gradient: v ? '#ffffff' : null })}
                          />
                          {panel.gradient && (
                            <ColorField
                              label="Cor final"
                              value={panel.gradient}
                              onChange={(gradient) => patch({ gradient })}
                            />
                          )}
                        </>
                      )}
                      <div className="field-pair">
                        <ColorField
                          label="Borda"
                          value={panel.stroke}
                          onChange={(stroke) => patch({ stroke })}
                        />
                        <NumberField
                          label="Espessura"
                          value={panel.strokeWidth}
                          min={0}
                          max={40}
                          onChange={(strokeWidth) => patch({ strokeWidth })}
                        />
                      </div>
                      <Toggle
                        label="Recortar conteúdo"
                        checked={panel.clip}
                        onChange={(clip) => patch({ clip })}
                      />
                      <Toggle
                        label="Sem margens laterais"
                        checked={panel.edgeToEdge}
                        onChange={(edgeToEdge) => patch({ edgeToEdge, span: 12 })}
                      />
                      <p className="help-text">
                        Espessura zero deixa o quadro sem borda. Desative o recorte para permitir
                        transbordamento.
                      </p>
                      <button
                        className="button secondary full"
                        onClick={() => {
                          setFactor(100);
                          setScaleDialog(true);
                        }}
                      >
                        <Scaling size={15} />
                        Escalar quadro e conteúdo
                      </button>
                    </>
                  )}
                  {selected.type === 'image' && (
                    <>
                      <div className="section-divider" />
                      <h3>Enquadramento</h3>
                      <Toggle
                        label="Manter proporção"
                        checked={selected.aspectLocked !== false}
                        onChange={(aspectLocked) => patch({ aspectLocked })}
                      />
                      <div className="button-pair">
                        {[
                          { fill: false, label: 'Ajustar inteira' },
                          { fill: true, label: 'Preencher' },
                        ].map(({ fill, label }) => (
                          <button
                            key={label}
                            className="button secondary"
                            disabled={!selected.panelId}
                            onClick={() => {
                              const parent = project.nodes.find((n) => n.id === selected.panelId) as Panel;
                              const a = project.assets.find((a) => a.id === selected.assetId)!;
                              const scale = fill
                                ? Math.max(parent.width / a.width, parent.height / a.height)
                                : Math.min(parent.width / a.width, parent.height / a.height);
                              patch({
                                width: a.width * scale,
                                height: a.height * scale,
                                x: (parent.width - a.width * scale) / 2,
                                y: (parent.height - a.height * scale) / 2,
                              });
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <small className="help-text">Transformações preservam o arquivo original.</small>
                    </>
                  )}
                  {text && (
                    <>
                      <div className="section-divider" />
                      <h3>{text.type === 'balloon' ? 'Fala e lettering' : 'Texto'}</h3>
                      {text.type === 'balloon' && (
                        <>
                          <Choice
                            label="Tipo de balão"
                            value={text.kind}
                            onChange={(kind) => patch({ kind })}
                            options={BALLOONS.map((b) => ({ value: b.id, label: b.name }))}
                          />
                          {text.kind === 'caption' && (
                            <Choice
                              label="Forma da narração"
                              value={text.shape}
                              onChange={(shape) => patch({ shape })}
                              options={[
                                { value: 'rect', label: 'Quadrada' },
                                { value: 'rounded', label: 'Arredondada' },
                              ]}
                            />
                          )}
                        </>
                      )}
                      <label className="field">
                        <span>Conteúdo</span>
                        <textarea
                          aria-label="Conteúdo do texto"
                          key={text.id + text.text}
                          defaultValue={text.text}
                          rows={4}
                          onBlur={(e) => {
                            if (e.target.value !== text.text) patch({ text: e.target.value });
                          }}
                        />
                      </label>
                      <div className="readonly-value font-name">
                        Comic Neue <span>Aa</span>
                      </div>
                      <div className="field-pair">
                        <NumberField
                          label="Tamanho da fonte"
                          value={text.fontSize}
                          min={6}
                          max={500}
                          onChange={(fontSize) => patch({ fontSize })}
                        />
                        <NumberField
                          label="Entrelinha"
                          value={text.lineHeight}
                          min={0.8}
                          max={3}
                          step={0.05}
                          onChange={(lineHeight) => patch({ lineHeight })}
                        />
                      </div>
                      <div className="segmented">
                        <button
                          className={text.bold ? 'active' : ''}
                          onClick={() => patch({ bold: !text.bold })}
                        >
                          <b>B</b>
                        </button>
                        <button
                          className={text.italic ? 'active' : ''}
                          onClick={() => patch({ italic: !text.italic })}
                        >
                          <i>I</i>
                        </button>
                        {[
                          { v: 'left', icon: AlignLeft },
                          { v: 'center', icon: AlignCenter },
                          { v: 'right', icon: AlignRight },
                        ].map(({ v, icon: Icon }) => (
                          <button
                            key={v}
                            className={text.align === v ? 'active' : ''}
                            aria-label={`Alinhar ${v}`}
                            onClick={() => patch({ align: v })}
                          >
                            <Icon size={16} />
                          </button>
                        ))}
                      </div>
                      <ColorField
                        label="Cor do texto"
                        value={text.textColor}
                        onChange={(textColor) => patch({ textColor })}
                      />
                      <NumberField
                        label="Margem interna"
                        value={text.padding}
                        min={0}
                        max={200}
                        onChange={(padding) => patch({ padding })}
                      />
                      {textOverflow && (
                        <div className="inline-warning">O texto ultrapassa a altura disponível.</div>
                      )}
                      <button
                        className="button secondary full"
                        onClick={() => {
                          const c = document.createElement('canvas').getContext('2d')!;
                          patch({ height: Math.ceil(textHeight(c, text)) });
                        }}
                      >
                        <Maximize2 size={14} />
                        Ajustar altura ao texto
                      </button>
                      {text.type === 'balloon' && (
                        <>
                          <div className="field-pair">
                            <ColorField
                              label="Cor do balão"
                              value={text.fill}
                              onChange={(fill) => patch({ fill })}
                            />
                            <ColorField
                              label="Contorno"
                              value={text.stroke}
                              onChange={(stroke) => patch({ stroke })}
                            />
                          </div>
                          <NumberField
                            label="Espessura do contorno"
                            value={text.strokeWidth}
                            min={0}
                            max={30}
                            onChange={(strokeWidth) => patch({ strokeWidth })}
                          />
                          {text.kind !== 'caption' && (
                            <div className="field-pair">
                              <NumberField
                                label="Ponteiro X"
                                value={text.tailX}
                                onChange={(tailX) => patch({ tailX })}
                              />
                              <NumberField
                                label="Ponteiro Y"
                                value={text.tailY}
                                onChange={(tailY) => patch({ tailY })}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {selected.type === 'balloon' && (
                    <p className="help-text">
                      {selected.pageId
                        ? 'Balão independente da página. Será exportado e não altera os quadros. Organize a sobreposição em Páginas e camadas.'
                        : 'Balão na área de trabalho. Arraste até uma página para incluí-lo na exportação.'}
                    </p>
                  )}
                  {selected.type !== 'panel' && selected.type !== 'balloon' && (
                    <>
                      <div className="section-divider" />
                      <h3>Vínculo e transbordamento</h3>
                      <Choice
                        label="Pertence ao quadro"
                        value={selected.panelId || 'loose'}
                        onChange={(id) => {
                          if (id === 'loose') useEditor.getState().detach(selected.id);
                          else {
                            const w = worldOrigin(project, selected),
                              parent = project.nodes.find((n) => n.id === id)!;
                            const o = worldOrigin(project, parent);
                            patch({ panelId: id, x: w.x - o.x, y: w.y - o.y });
                          }
                        }}
                        options={[
                          { value: 'loose', label: 'Solto · não exporta' },
                          ...project.nodes
                            .filter((n): n is Panel => n.type === 'panel' && n.role !== 'spacer')
                            .map((n) => ({
                              value: n.id,
                              label: `${project.pages.find((p) => p.id === n.pageId)?.name} · ${n.name}`,
                            })),
                        ]}
                      />
                      <Toggle
                        label="Pode sair da moldura"
                        checked={selected.overflow}
                        onChange={(overflow) => patch({ overflow })}
                      />
                      {selected.panelId ? (
                        <button
                          className="button secondary full"
                          onClick={() => useEditor.getState().detach(selected.id)}
                        >
                          <Unlink size={14} />
                          Desvincular do quadro
                        </button>
                      ) : (
                        <p className="help-text">
                          Este objeto fica no projeto, mas não aparece na exportação. Vincule-o a um quadro
                          para exportar.
                        </p>
                      )}
                    </>
                  )}
                  <div className="section-divider" />
                  <div className="button-pair">
                    <button
                      className="button secondary"
                      onClick={() =>
                        useEditor.getState().run('Trazer à frente', (p) => {
                          const nodes = p.nodes.filter((n) => selection.includes(n.id));
                          p.nodes = p.nodes.filter((n) => !selection.includes(n.id)).concat(nodes);
                        })
                      }
                    >
                      <ArrowUpToLine size={14} />
                      Frente
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        useEditor.getState().run('Enviar para trás', (p) => {
                          const nodes = p.nodes.filter((n) => selection.includes(n.id));
                          p.nodes = nodes.concat(p.nodes.filter((n) => !selection.includes(n.id)));
                        })
                      }
                    >
                      <ArrowDownToLine size={14} />
                      Trás
                    </button>
                  </div>
                </fieldset>
              </>
            )}
          </fieldset>
        </div>
      )}
      <Modal
        open={scaleDialog}
        onOpenChange={setScaleDialog}
        title="Escalar quadro e conteúdo"
        description="O quadro, suas imagens e seus textos serão escalados juntos. Balões são independentes."
      >
        <NumberField label="Escala" value={factor} min={10} max={400} onChange={setFactor} suffix="%" />
        <div className="modal-actions">
          <button className="button secondary" onClick={() => setScaleDialog(false)}>
            Cancelar
          </button>
          <button
            className="button primary"
            onClick={() => {
              if (!panel) return;
              const k = factor / 100;
              const ok = useEditor.getState().run('Escalar conjunto', (p) => {
                for (const n of p.nodes) {
                  if (n.id === panel.id) {
                    Object.assign(n, { mode: 'free', width: n.width * k, height: n.height * k });
                  } else if (n.type !== 'panel' && n.panelId === panel.id) {
                    n.x *= k;
                    n.y *= k;
                    n.width *= k;
                    n.height *= k;
                    if (n.type !== 'image') {
                      n.fontSize *= k;
                      n.padding *= k;
                      if (n.type === 'balloon') {
                        n.tailX *= k;
                        n.tailY *= k;
                        n.strokeWidth *= k;
                      }
                    }
                  }
                }
              });
              if (ok) setScaleDialog(false);
            }}
          >
            Aplicar escala
          </button>
        </div>
      </Modal>
    </aside>
  );
}
