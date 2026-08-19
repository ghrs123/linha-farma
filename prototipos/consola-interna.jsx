import { useState, useEffect, useMemo, useRef } from "react";
import {
  AlertTriangle, Package, ClipboardList, Activity, Play, Clock, User,
  Check, X, ArrowRight, Bell, RotateCcw, ChevronDown, ChevronUp, Zap,
} from "lucide-react";

/**
 * PharmaAssist AI — CONSOLA INTERNA (backoffice da farmácia)
 *
 * Modela o que acontece dentro da farmácia quando as funcionalidades do canal
 * do cliente disparam. Três máquinas de estado + trilha de auditoria.
 *
 * ESCALATION:  NOVO -> ATRIBUIDO -> EM_ATENDIMENTO -> RESOLVIDO
 *              (flag ATRASADO quando SLA em NOVO é excedido)
 * RESERVATION: PENDENTE -> CONFIRMADA -> PRONTA -> LEVANTADA
 *              saídas laterais: CANCELADA | EXPIRADA  (ambas devolvem stock)
 * STOCK:       cada movimento gera InventoryHistory com motivo e origem
 *
 * REGRA CRÍTICA: stock é deduzido ao criar a reserva (PENDENTE) e devolvido
 * em CANCELADA/EXPIRADA. Nunca deduzir duas vezes, nunca esquecer a devolução.
 */

const C = {
  ink: "#0d1b2a", body: "#33465c", mut: "#6b7d92", line: "#e2e8f0",
  bg: "#f4f6f9", surf: "#ffffff", acc: "#0f6b56", accS: "#e7f4ef",
  warn: "#b76e00", warnS: "#fff6e8", dang: "#b42318", dangS: "#fdecea",
  info: "#1d4ed8", infoS: "#eef2ff", dark: "#0b2a22",
};
const F = "'Segoe UI', system-ui, -apple-system, sans-serif";
const SLA_MIN = 5; // minutos até um escalonamento NOVO ser marcado ATRASADO

function useMobile() {
  const [w, setW] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w < 900;
}

// ─── Estado inicial ───────────────────────────────────────────────────────────
const PRODUCTS = [
  { id: "paracetamol", name: "Paracetamol 500mg", qty: 18, min: 5 },
  { id: "ibuprofeno", name: "Ibuprofeno 400mg", qty: 4, min: 5 },
  { id: "vitaminad", name: "Vitamina D 1000 UI", qty: 22, min: 5 },
  { id: "soro", name: "Soro fisiológico", qty: 0, min: 3 },
  { id: "loratadina", name: "Loratadina 10mg", qty: 11, min: 5 },
];

const ESC_FLOW = ["NOVO", "ATRIBUIDO", "EM_ATENDIMENTO", "RESOLVIDO"];
const RES_FLOW = ["PENDENTE", "CONFIRMADA", "PRONTA", "LEVANTADA"];

const ESC_STYLE = {
  NOVO: [C.dangS, C.dang], ATRIBUIDO: [C.warnS, C.warn],
  EM_ATENDIMENTO: [C.infoS, C.info], RESOLVIDO: [C.accS, C.acc],
};
const RES_STYLE = {
  PENDENTE: [C.warnS, C.warn], CONFIRMADA: [C.infoS, C.info],
  PRONTA: [C.accS, C.acc], LEVANTADA: ["#eef1f6", C.mut],
  CANCELADA: [C.dangS, C.dang], EXPIRADA: [C.dangS, C.dang],
};

const STAFF = ["Ana R. (farmacêutica)", "Bruno M. (farmacêutico)"];

// ─── Atoms ────────────────────────────────────────────────────────────────────
const Tag = ({ children, bg, fg }) => (
  <span style={{ background: bg, color: fg, borderRadius: 999, padding: "3px 9px", fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap", letterSpacing: ".02em" }}>{children}</span>
);
const Card = ({ children, style }) => (
  <div style={{ background: C.surf, border: `1px solid ${C.line}`, borderRadius: 13, ...style }}>{children}</div>
);
const Btn = ({ children, onClick, tone = "acc", disabled, full, small }) => {
  const map = { acc: [C.acc, "#fff"], ghost: ["#fff", C.ink], dang: [C.dangS, C.dang] };
  const [bg, fg] = map[tone];
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        background: disabled ? "#eef1f6" : bg, color: disabled ? C.mut : fg,
        border: tone === "ghost" ? `1px solid ${C.line}` : "none", borderRadius: 9,
        padding: small ? "8px 12px" : "11px 15px", fontSize: small ? 12.5 : 13.5,
        fontWeight: 700, cursor: disabled ? "default" : "pointer", fontFamily: F,
        width: full ? "100%" : undefined, display: "inline-flex", alignItems: "center",
        justifyContent: "center", gap: 7, minHeight: small ? 36 : 44,
      }}>
      {children}
    </button>
  );
};

// ─── App ──────────────────────────────────────────────────────────────────────
export default function Console() {
  const m = useMobile();
  const [tab, setTab] = useState("fila");
  const [now, setNow] = useState(Date.now());
  const [stock, setStock] = useState(PRODUCTS.map((p) => ({ ...p })));
  const [escs, setEscs] = useState([]);
  const [rezs, setRezs] = useState([]);
  const [log, setLog] = useState([]);
  const seq = useRef({ e: 1000, r: 2000, l: 0 });

  // Relógio para SLA
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Auditoria: toda a transição passa por aqui ──
  function audit(actor, action, entity, detail, kind = "info") {
    setLog((l) => [{ id: ++seq.current.l, at: Date.now(), actor, action, entity, detail, kind }, ...l].slice(0, 60));
  }

  // ── Movimento de stock com histórico (fonte única) ──
  function moveStock(productId, delta, reason) {
    setStock((s) => s.map((p) => (p.id === productId ? { ...p, qty: Math.max(0, p.qty + delta) } : p)));
    const p = stock.find((x) => x.id === productId);
    audit("Sistema", delta < 0 ? "Stock deduzido" : "Stock devolvido",
      p?.name ?? productId, `${delta > 0 ? "+" : ""}${delta} · ${reason}`, delta < 0 ? "warn" : "ok");
  }

  // ── Eventos vindos do canal do cliente ──
  function evtQuestion() {
    audit("Assistente IA", "Pergunta resolvida", "Canal cliente", "Consulta de stock respondida sem intervenção humana", "ok");
  }

  function evtReservation(productId) {
    const p = stock.find((x) => x.id === productId);
    if (!p) return;
    if (p.qty <= 0) {
      audit("Assistente IA", "Reserva recusada", p.name, "Sem stock — registado interesse do cliente", "warn");
      return;
    }
    const r = {
      id: `RES-${++seq.current.r}`, product: p.name, productId: p.id,
      customer: ["M. Silva", "J. Costa", "P. Nunes", "R. Lima"][Math.floor(Math.random() * 4)],
      status: "PENDENTE", at: Date.now(), qty: 1,
    };
    setRezs((x) => [r, ...x]);
    moveStock(p.id, -1, `Reserva ${r.id}`);
    audit("Assistente IA", "Reserva criada", r.id, `${p.name} · ${r.customer} · aguarda confirmação`, "warn");
  }

  function evtEscalation(reason) {
    const e = {
      id: `ESC-${++seq.current.e}`, reason,
      customer: ["M. Silva", "J. Costa", "P. Nunes"][Math.floor(Math.random() * 3)],
      snippet: {
        "Queixa clínica": "tenho tido dores de cabeça, o que posso tomar?",
        "Gravidez": "estou grávida e tenho dor",
        "Receita obrigatória": "preciso de amoxicilina",
        "Criança": "o meu filho de 3 anos tem febre",
      }[reason],
      status: "NOVO", at: Date.now(), assignee: null,
    };
    setEscs((x) => [e, ...x]);
    audit("Motor de segurança", "Automação bloqueada", e.id, `${reason} — encaminhado para farmacêutico`, "danger");
  }

  // ── Transições: escalonamento ──
  function assign(id) {
    const who = STAFF[Math.floor(Math.random() * STAFF.length)];
    setEscs((x) => x.map((e) => (e.id === id ? { ...e, status: "ATRIBUIDO", assignee: who } : e)));
    audit(who, "Ticket atribuído", id, "Farmacêutico assumiu o caso", "info");
  }
  function advanceEsc(id) {
    setEscs((x) => x.map((e) => {
      if (e.id !== id) return e;
      const next = ESC_FLOW[ESC_FLOW.indexOf(e.status) + 1];
      if (!next) return e;
      audit(e.assignee ?? "Farmacêutico", `Estado → ${next}`, id, next === "RESOLVIDO" ? "Cliente aconselhado pelo profissional" : "Atendimento iniciado", next === "RESOLVIDO" ? "ok" : "info");
      return { ...e, status: next };
    }));
  }

  // ── Transições: reserva ──
  function advanceRes(id) {
    setRezs((x) => x.map((r) => {
      if (r.id !== id) return r;
      const next = RES_FLOW[RES_FLOW.indexOf(r.status) + 1];
      if (!next) return r;
      const detail = {
        CONFIRMADA: "Disponibilidade confirmada pela equipa",
        PRONTA: "Separada e à espera do cliente",
        LEVANTADA: "Entregue ao cliente — stock consumido definitivamente",
      }[next];
      audit("Equipa balcão", `Estado → ${next}`, id, detail, next === "LEVANTADA" ? "ok" : "info");
      return { ...r, status: next };
    }));
  }
  function killRes(id, mode) {
    const r = rezs.find((x) => x.id === id);
    if (!r || ["LEVANTADA", "CANCELADA", "EXPIRADA"].includes(r.status)) return;
    setRezs((x) => x.map((y) => (y.id === id ? { ...y, status: mode } : y)));
    // REGRA CRÍTICA: devolver o stock que foi deduzido na criação.
    moveStock(r.productId, +r.qty, `${mode} ${r.id}`);
    audit("Equipa balcão", `Estado → ${mode}`, id, "Stock devolvido ao inventário", "danger");
  }

  function reset() {
    setStock(PRODUCTS.map((p) => ({ ...p })));
    setEscs([]); setRezs([]); setLog([]);
    seq.current = { e: 1000, r: 2000, l: 0 };
  }

  // ── Derivados ──
  const slaBreach = (e) => e.status === "NOVO" && (now - e.at) / 60000 > SLA_MIN;
  const openEsc = escs.filter((e) => e.status !== "RESOLVIDO");
  const lateEsc = openEsc.filter(slaBreach);
  const activeRes = rezs.filter((r) => ["PENDENTE", "CONFIRMADA", "PRONTA"].includes(r.status));
  const alerts = stock.filter((p) => p.qty <= p.min);

  const tabs = [
    { id: "fila", label: "Fila", icon: AlertTriangle, badge: openEsc.length },
    { id: "reservas", label: "Reservas", icon: ClipboardList, badge: activeRes.length },
    { id: "stock", label: "Stock", icon: Package, badge: alerts.length },
    { id: "registo", label: "Registo", icon: Activity, badge: 0 },
  ];

  return (
    <div style={{ fontFamily: F, background: C.bg, minHeight: "100vh", color: C.ink, overflowX: "hidden" }}>
      {/* Topo */}
      <div style={{ background: C.surf, borderBottom: `1px solid ${C.line}`, padding: m ? "12px 16px" : "14px 24px", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <strong style={{ fontSize: 15.5 }}>Consola da farmácia</strong>
            <div style={{ fontSize: 11.5, color: C.mut, marginTop: 1 }}>Farmácia Central · operação interna</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lateEsc.length > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 5, background: C.dangS, color: C.dang, borderRadius: 999, padding: "5px 10px", fontSize: 11.5, fontWeight: 800 }}>
                <Bell size={12} /> {lateEsc.length} fora de SLA
              </span>
            )}
            <button onClick={reset} aria-label="Repor"
              style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, minWidth: 40, minHeight: 40, display: "grid", placeItems: "center", cursor: "pointer" }}>
              <RotateCcw size={15} color={C.body} />
            </button>
          </div>
        </div>
      </div>

      {/* Simulador de eventos do canal */}
      <div style={{ background: C.dark, padding: m ? "14px 16px" : "16px 24px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: "rgba(255,255,255,.55)", fontSize: 11, fontWeight: 800, letterSpacing: ".1em", marginBottom: 10 }}>
            <Zap size={12} /> SIMULAR MENSAGEM DO CLIENTE
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            {[
              ["Pergunta simples", () => evtQuestion()],
              ["Reserva Paracetamol", () => evtReservation("paracetamol")],
              ["Reserva Ibuprofeno", () => evtReservation("ibuprofeno")],
              ["Caso: queixa clínica", () => evtEscalation("Queixa clínica")],
              ["Caso: gravidez", () => evtEscalation("Gravidez")],
              ["Caso: receita", () => evtEscalation("Receita obrigatória")],
            ].map(([label, fn]) => (
              <button key={label} onClick={fn}
                style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, fontFamily: F, minHeight: 40 }}>
                {label}
              </button>
            ))}
          </div>
          <p style={{ color: "rgba(255,255,255,.45)", fontSize: 11.5, margin: "10px 0 0", lineHeight: 1.5 }}>
            Cada clique representa uma mensagem real a chegar. Veja o efeito nas filas, no stock e no registo.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: m ? "14px 16px 0" : "18px 24px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: m ? 8 : 14 }}>
          {[
            ["Na fila", openEsc.length, openEsc.length ? C.dang : C.mut],
            ["Fora SLA", lateEsc.length, lateEsc.length ? C.dang : C.mut],
            ["Reservas", activeRes.length, activeRes.length ? C.warn : C.mut],
            ["Alertas", alerts.length, alerts.length ? C.warn : C.mut],
          ].map(([l, v, col]) => (
            <Card key={l} style={{ padding: m ? "11px 9px" : "15px 16px" }}>
              <div style={{ fontSize: m ? 21 : 26, fontWeight: 800, color: col, lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 10.5, color: C.mut, marginTop: 4 }}>{l}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: m ? "14px 16px 0" : "18px 24px 0" }}>
        <div style={{ display: "flex", gap: 5, borderBottom: `1px solid ${C.line}`, overflowX: "auto" }}>
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ background: "none", border: "none", borderBottom: `2px solid ${on ? C.acc : "transparent"}`,
                  color: on ? C.ink : C.mut, fontWeight: on ? 800 : 600, fontSize: 13.5, padding: "12px 11px",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: F, whiteSpace: "nowrap", minHeight: 44 }}>
                <t.icon size={14} /> {t.label}
                {t.badge > 0 && (
                  <span style={{ background: C.dang, color: "#fff", borderRadius: 999, fontSize: 9.5, fontWeight: 800, padding: "1px 5px" }}>{t.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: m ? 16 : 24 }}>
        {tab === "fila" && <FilaTab escs={escs} now={now} slaBreach={slaBreach} assign={assign} advance={advanceEsc} m={m} />}
        {tab === "reservas" && <ReservasTab rezs={rezs} advance={advanceRes} kill={killRes} m={m} />}
        {tab === "stock" && <StockTab stock={stock} rezs={rezs} m={m} />}
        {tab === "registo" && <RegistoTab log={log} m={m} />}
      </div>
    </div>
  );
}

// ─── Fila de escalonamentos ───────────────────────────────────────────────────
function FilaTab({ escs, now, slaBreach, assign, advance, m }) {
  const [showDone, setShowDone] = useState(false);
  const open = escs.filter((e) => e.status !== "RESOLVIDO");
  const done = escs.filter((e) => e.status === "RESOLVIDO");

  if (!escs.length) return <Empty icon={AlertTriangle} title="Fila vazia" text="Simule um caso sensível acima para ver o ticket entrar aqui." />;

  const mins = (e) => Math.floor((now - e.at) / 60000);
  const secs = (e) => Math.floor((now - e.at) / 1000) % 60;

  return (
    <>
      <FlowStrip flow={ESC_FLOW} style={ESC_STYLE} label="Ciclo de vida do escalonamento" m={m} />
      {open.map((e) => {
        const late = slaBreach(e);
        const [bg, fg] = ESC_STYLE[e.status];
        const next = ESC_FLOW[ESC_FLOW.indexOf(e.status) + 1];
        return (
          <Card key={e.id} style={{ padding: 16, marginBottom: 10, borderLeft: `3px solid ${late ? C.dang : fg}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>{e.id}</strong>
                <Tag bg={bg} fg={fg}>{e.status}</Tag>
                {late && <Tag bg={C.dangS} fg={C.dang}>⚠ FORA DE SLA</Tag>}
              </div>
              <span style={{ fontSize: 11.5, color: late ? C.dang : C.mut, display: "flex", alignItems: "center", gap: 4, fontWeight: late ? 700 : 400 }}>
                <Clock size={12} /> {mins(e)}m {String(secs(e)).padStart(2, "0")}s
              </span>
            </div>
            <div style={{ fontSize: 13, color: C.body, marginTop: 8 }}>
              <strong>{e.reason}</strong> · {e.customer}
            </div>
            <div style={{ fontSize: 13, color: C.mut, fontStyle: "italic", marginTop: 5, background: "#f8fafc", borderRadius: 8, padding: "9px 11px" }}>
              “{e.snippet}”
            </div>
            {e.assignee && (
              <div style={{ fontSize: 12, color: C.body, marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <User size={12} color={C.mut} /> {e.assignee}
              </div>
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {e.status === "NOVO" ? (
                <Btn onClick={() => assign(e.id)} full={m}>Assumir caso</Btn>
              ) : (
                <Btn onClick={() => advance(e.id)} full={m}>
                  {next === "RESOLVIDO" ? "Marcar resolvido" : "Iniciar atendimento"} <ArrowRight size={14} />
                </Btn>
              )}
            </div>
          </Card>
        );
      })}

      {done.length > 0 && (
        <>
          <button onClick={() => setShowDone(!showDone)}
            style={{ background: "none", border: "none", color: C.mut, fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "10px 0", fontFamily: F }}>
            {showDone ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Resolvidos ({done.length})
          </button>
          {showDone && done.map((e) => (
            <Card key={e.id} style={{ padding: 13, marginBottom: 8, opacity: .75 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13 }}><strong>{e.id}</strong> · {e.reason}</span>
                <Tag bg={C.accS} fg={C.acc}>RESOLVIDO</Tag>
              </div>
            </Card>
          ))}
        </>
      )}
    </>
  );
}

// ─── Reservas ─────────────────────────────────────────────────────────────────
function ReservasTab({ rezs, advance, kill, m }) {
  if (!rezs.length) return <Empty icon={ClipboardList} title="Sem reservas" text="Simule uma reserva acima. O stock é deduzido no momento da criação." />;
  const dead = ["LEVANTADA", "CANCELADA", "EXPIRADA"];
  return (
    <>
      <FlowStrip flow={RES_FLOW} style={RES_STYLE} label="Ciclo de vida da reserva" m={m}
        note="Saídas laterais: CANCELADA · EXPIRADA — ambas devolvem stock" />
      {rezs.map((r) => {
        const [bg, fg] = RES_STYLE[r.status];
        const closed = dead.includes(r.status);
        const next = RES_FLOW[RES_FLOW.indexOf(r.status) + 1];
        return (
          <Card key={r.id} style={{ padding: 16, marginBottom: 10, opacity: closed ? .72 : 1, borderLeft: `3px solid ${fg}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>{r.id}</strong>
                <Tag bg={bg} fg={fg}>{r.status}</Tag>
              </div>
              <span style={{ fontSize: 11.5, color: C.mut }}>{new Date(r.at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div style={{ fontSize: 13.5, color: C.body, marginTop: 7 }}>
              <strong>{r.product}</strong> · {r.qty} un · {r.customer}
            </div>
            {!closed && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {next && (
                  <Btn onClick={() => advance(r.id)} small>
                    {{ CONFIRMADA: "Confirmar", PRONTA: "Marcar pronta", LEVANTADA: "Cliente levantou" }[next]} <ArrowRight size={13} />
                  </Btn>
                )}
                <Btn onClick={() => kill(r.id, "CANCELADA")} tone="dang" small><X size={13} /> Cancelar</Btn>
                <Btn onClick={() => kill(r.id, "EXPIRADA")} tone="ghost" small><Clock size={13} /> Expirar</Btn>
              </div>
            )}
            {closed && r.status !== "LEVANTADA" && (
              <div style={{ marginTop: 9, fontSize: 12, color: C.acc, display: "flex", alignItems: "center", gap: 5 }}>
                <Check size={12} /> Stock devolvido ao inventário
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

// ─── Stock ────────────────────────────────────────────────────────────────────
function StockTab({ stock, rezs, m }) {
  const held = (id) => rezs.filter((r) => r.productId === id && ["PENDENTE", "CONFIRMADA", "PRONTA"].includes(r.status)).length;
  return (
    <>
      <p style={{ fontSize: 12.5, color: C.mut, margin: "0 0 12px", lineHeight: 1.55 }}>
        “Disponível” é o que resta após dedução das reservas ativas. “Retido” são unidades já comprometidas mas ainda não levantadas.
      </p>
      {stock.map((p) => {
        const tone = p.qty <= 0 ? "dang" : p.qty <= p.min ? "warn" : "acc";
        const [bg, fg] = { dang: [C.dangS, C.dang], warn: [C.warnS, C.warn], acc: [C.accS, C.acc] }[tone];
        const label = p.qty <= 0 ? "RUTURA" : p.qty <= p.min ? "BAIXO" : "OK";
        const h = held(p.id);
        return (
          <Card key={p.id} style={{ padding: 14, marginBottom: 9, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 13.5 }}>{p.name}</strong>
              <div style={{ fontSize: 11.5, color: C.mut, marginTop: 3 }}>
                mínimo {p.min}{h > 0 && ` · ${h} retido${h > 1 ? "s" : ""} em reserva`}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 19, fontWeight: 800, color: fg }}>{p.qty}</span>
              <Tag bg={bg} fg={fg}>{label}</Tag>
            </div>
          </Card>
        );
      })}
    </>
  );
}

// ─── Registo / auditoria ──────────────────────────────────────────────────────
function RegistoTab({ log, m }) {
  if (!log.length) return <Empty icon={Activity} title="Registo vazio" text="Cada ação gera uma entrada aqui: quem fez, o quê, sobre que entidade e quando." />;
  const col = { ok: C.acc, warn: C.warn, danger: C.dang, info: C.info };
  return (
    <>
      <p style={{ fontSize: 12.5, color: C.mut, margin: "0 0 14px", lineHeight: 1.55 }}>
        Trilha de auditoria imutável — é isto que permite explicar, meses depois, porque é que um caso foi encaminhado ou um stock mudou.
      </p>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {log.map((l, i) => (
          <div key={l.id} style={{ padding: "13px 15px", borderTop: i ? `1px solid ${C.line}` : "none", display: "flex", gap: 11 }}>
            <div style={{ width: 7, height: 7, borderRadius: 999, background: col[l.kind], marginTop: 6, flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13 }}>{l.action}</strong>
                <span style={{ fontSize: 11, color: C.mut, whiteSpace: "nowrap" }}>
                  {new Date(l.at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
              <div style={{ fontSize: 12, color: C.body, marginTop: 3 }}>
                <span style={{ color: C.mut }}>{l.actor}</span> → <strong>{l.entity}</strong>
              </div>
              <div style={{ fontSize: 12, color: C.mut, marginTop: 3, lineHeight: 1.45 }}>{l.detail}</div>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────
function FlowStrip({ flow, style, label, note, m }) {
  return (
    <Card style={{ padding: 14, marginBottom: 14, background: "#fbfcfe" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: C.mut, letterSpacing: ".09em", marginBottom: 10 }}>{label.toUpperCase()}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {flow.map((s, i) => {
          const [bg, fg] = style[s];
          return (
            <span key={s} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <Tag bg={bg} fg={fg}>{s}</Tag>
              {i < flow.length - 1 && <ArrowRight size={12} color={C.mut} />}
            </span>
          );
        })}
      </div>
      {note && <div style={{ fontSize: 11.5, color: C.mut, marginTop: 9, fontStyle: "italic" }}>{note}</div>}
    </Card>
  );
}

function Empty({ icon: Icon, title, text }) {
  return (
    <Card style={{ padding: 40, textAlign: "center" }}>
      <Icon size={26} color={C.mut} />
      <h3 style={{ fontSize: 16, margin: "12px 0 6px" }}>{title}</h3>
      <p style={{ fontSize: 13.5, color: C.body, margin: 0, lineHeight: 1.55 }}>{text}</p>
    </Card>
  );
}
