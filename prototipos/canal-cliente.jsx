import { useState, useRef, useEffect, useMemo } from "react";
import {
  ShieldCheck, MessageSquare, Clock, TrendingDown, ArrowRight, Check,
  Send, Users, Mail, Phone, Building2, Trash2, Download, Lock, Sparkles, Menu, X,
} from "lucide-react";

/**
 * PharmaAssist AI — MVP COMERCIAL (mobile-first)
 *
 * Todos os layouts partem de coluna única e só expandem em >=880px.
 * Alvos de toque >=44px, tipografia fluida, sem scroll horizontal.
 */

// ─── Tokens ───────────────────────────────────────────────────────────────────
const C = {
  ink: "#0d1b2a", body: "#33465c", mut: "#6b7d92", line: "#e2e8f0",
  bg: "#ffffff", soft: "#f6f9f8", acc: "#0f6b56", accS: "#e7f4ef",
  dark: "#0b2a22", warn: "#b76e00", warnS: "#fff6e8", dang: "#b42318", dangS: "#fdecea",
};
const F = "'Segoe UI', system-ui, -apple-system, sans-serif";
const BP = 880;

function useResponsive() {
  const [w, setW] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return { w, isMobile: w < BP, isNarrow: w < 520 };
}

// ─── Demo engine ──────────────────────────────────────────────────────────────
const CATALOG = [
  { id: "paracetamol", name: "Paracetamol 500mg", price: 2.9, qty: 18 },
  { id: "ibuprofeno", name: "Ibuprofeno 400mg", price: 4.2, qty: 4 },
  { id: "vitaminad", name: "Vitamina D 1000 UI", price: 8.9, qty: 22 },
  { id: "soro", name: "Soro fisiológico", price: 3.5, qty: 0 },
  { id: "amoxicilina", name: "Amoxicilina 500mg", price: null, qty: 7, rx: true },
];
const SAFETY = [
  { cat: "Gravidez / amamentação", w: ["grávida", "gravida", "amament"] },
  { cat: "Criança / bebé", w: ["bebé", "bebe", "criança", "crianca", "filho"] },
  { cat: "Receita / antibiótico", w: ["antibiót", "antibiot", "receita", "amoxicilina"] },
  { cat: "Sintoma grave", w: ["falta de ar", "peito", "sangue", "febre alta", "alerg", "alérg"] },
  { cat: "Dose / interação", w: ["dose", "dosagem", "misturar", "interaç"] },
  // Queixa clínica: o cliente descreve um sintoma ou pede algo "para" um sintoma.
  // Tolerante a erros de escrita (cabeça/cabeca/cabexa) porque é assim que se escreve no telemóvel.
  {
    cat: "Queixa clínica",
    w: [
      "dor", "dores", "doi", "dói", "cabeç", "cabec", "cabex", "enxaqueca",
      "febre", "tosse", "gripe", "constipa", "garganta", "barriga", "estômago",
      "estomago", "náusea", "nausea", "enjoo", "diarre", "azia", "sintoma",
      "doente", "mal-estar", "mal estar", "infeç", "infec",
    ],
  },
  // Pedido de recomendação de medicamento sem produto identificado.
  { cat: "Pedido de recomendação", w: ["remédio", "remedio", "o que tomo", "que tomar", "posso tomar", "recomenda", "aconselha", "indica algo", "algo para"] },
];
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[m][n];
}
function matchProduct(text) {
  const toks = text.toLowerCase().replace(/[?.,!]/g, "").split(/\s+/);
  let best = null, bs = 0;
  for (const p of CATALOG) {
    const key = p.name.toLowerCase().split(" ")[0];
    for (const t of toks) {
      if (t.length < 4) continue;
      const s = 1 - lev(t, key) / Math.max(t.length, key.length);
      if (s > bs) { bs = s; best = p; }
    }
  }
  return bs >= 0.6 ? { p: best, conf: +bs.toFixed(2) } : { p: null, conf: 0 };
}
function safetyGate(text) {
  const t = text.toLowerCase();
  for (const r of SAFETY) if (r.w.some((w) => t.includes(w))) return r.cat;
  return null;
}
function reply(text, stock, setStock, bump) {
  const gate = safetyGate(text);
  if (gate) {
    bump("esc");
    const clinical = gate === "Queixa clínica" || gate === "Pedido de recomendação";
    return {
      text: clinical
        ? "Como está a descrever um sintoma, não posso sugerir qualquer medicamento — isso é decisão do farmacêutico. Já avisei a equipa e um farmacêutico responde-lhe em minutos. Entretanto posso confirmar preços, stock ou horários."
        : `Por segurança, vou encaminhar esta conversa para um farmacêutico (motivo: ${gate}). Não posso indicar tratamento nem dose.`,
      tag: gate, kind: "esc",
    };
  }
  const t = text.toLowerCase();
  if (/hor[áa]rio|aberto|fecha/.test(t)) return { text: "Estamos abertos Seg–Sáb 09:00–20:00 e Dom 10:00–13:00.", kind: "ok" };
  if (/morada|onde|telefone/.test(t)) return { text: "Av. da Liberdade 120, Lisboa · +351 210 000 000.", kind: "ok" };
  const { p, conf } = matchProduct(text);
  if (!p) return { text: "Posso ajudar com disponibilidade, preços, reservas, horários e morada.", kind: "ok" };
  if (/reserv/.test(t)) {
    if (p.rx) return { text: `${p.name} exige receita médica. Encaminho para validação do farmacêutico.`, kind: "esc", tag: "Receita obrigatória" };
    const cur = stock.find((x) => x.id === p.id);
    if (cur.qty <= 0) return { text: `${p.name} está sem stock. Registo o seu interesse.`, kind: "ok" };
    setStock((s) => s.map((x) => (x.id === p.id ? { ...x, qty: x.qty - 1 } : x)));
    bump("res");
    return { text: `Reserva criada para ${p.name}. A equipa confirma antes da recolha.`, kind: "res", tag: "Reserva" };
  }
  const cur = stock.find((x) => x.id === p.id);
  bump("q");
  return {
    text: `${p.name}: ${cur.qty > 0 ? "disponível" : "sem stock"} · ${p.price == null ? "preço sob confirmação" : "€" + p.price.toFixed(2)}. Quer que eu reserve?`,
    kind: "ok", tag: `reconhecido (${conf})`,
  };
}

// ─── Atoms ────────────────────────────────────────────────────────────────────
function Sec({ children, bg, id, m }) {
  return (
    <section id={id} style={{ background: bg || C.bg, padding: m ? "44px 18px" : "72px 24px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>{children}</div>
    </section>
  );
}
const Eyebrow = ({ children }) => (
  <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".13em", textTransform: "uppercase", color: C.acc, marginBottom: 10 }}>{children}</div>
);
function H2({ children, m }) {
  return <h2 style={{ fontSize: m ? 26 : 34, fontWeight: 800, color: C.ink, margin: "0 0 12px", lineHeight: 1.22, letterSpacing: "-0.02em" }}>{children}</h2>;
}
function Lead({ children, m }) {
  return <p style={{ fontSize: m ? 15.5 : 17, color: C.body, lineHeight: 1.6, margin: "0 0 24px", maxWidth: 680 }}>{children}</p>;
}
const Card = ({ children, style }) => (
  <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, ...style }}>{children}</div>
);
function Field({ label, icon: Icon, value, onChange, placeholder, type = "text", error, inputMode }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.body, marginBottom: 6 }}>{label}</span>
      <div style={{ position: "relative" }}>
        {Icon && <Icon size={15} color={C.mut} style={{ position: "absolute", left: 12, top: 15 }} />}
        <input
          type={type} value={value} placeholder={placeholder} inputMode={inputMode}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: Icon ? "13px 12px 13px 34px" : "13px 12px",
            border: `1px solid ${error ? C.dang : C.line}`, borderRadius: 9,
            fontSize: 16, /* 16px evita zoom automático no iOS */
            outline: "none", fontFamily: F, color: C.ink, background: "#fff",
          }}
        />
      </div>
      {error && <span style={{ fontSize: 11.5, color: C.dang, marginTop: 4, display: "block" }}>{error}</span>}
    </label>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [route, setRoute] = useState("site");
  return (
    <div style={{ fontFamily: F, color: C.ink, background: "#fff", minHeight: "100vh", overflowX: "hidden" }}>
      {route === "site" ? <Site go={setRoute} /> : <LeadsPanel go={setRoute} />}
    </div>
  );
}

// ─── SITE ─────────────────────────────────────────────────────────────────────
function Site({ go }) {
  const { isMobile, isNarrow } = useResponsive();
  const formRef = useRef(null);
  const [menu, setMenu] = useState(false);
  const toForm = () => { setMenu(false); formRef.current?.scrollIntoView({ behavior: "smooth" }); };
  const m = isMobile;

  const col2 = { display: "grid", gridTemplateColumns: m ? "1fr" : "1.05fr .95fr", gap: m ? 28 : 48, alignItems: "center" };

  return (
    <>
      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(255,255,255,.95)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: m ? "11px 18px" : "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: C.acc, display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 14 }}>P</div>
            <strong style={{ fontSize: 15 }}>PharmaAssist AI</strong>
          </div>
          {m ? (
            <button onClick={() => setMenu(!menu)} aria-label="Menu"
              style={{ background: "none", border: "none", padding: 8, cursor: "pointer", display: "grid", placeItems: "center", minWidth: 44, minHeight: 44 }}>
              {menu ? <X size={22} color={C.ink} /> : <Menu size={22} color={C.ink} />}
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <a href="#demo" style={{ fontSize: 13.5, color: C.body, textDecoration: "none", fontWeight: 600 }}>Demo</a>
              <a href="#roi" style={{ fontSize: 13.5, color: C.body, textDecoration: "none", fontWeight: 600 }}>Retorno</a>
              <button onClick={toForm} style={{ background: C.acc, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: F }}>
                Pedir demonstração
              </button>
            </div>
          )}
        </div>
        {m && menu && (
          <div style={{ borderTop: `1px solid ${C.line}`, background: "#fff", padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            <a href="#demo" onClick={() => setMenu(false)} style={{ padding: "13px 8px", fontSize: 15, color: C.ink, textDecoration: "none", fontWeight: 600 }}>Ver a demo</a>
            <a href="#roi" onClick={() => setMenu(false)} style={{ padding: "13px 8px", fontSize: 15, color: C.ink, textDecoration: "none", fontWeight: 600 }}>Calcular retorno</a>
            <button onClick={toForm} style={{ marginTop: 6, background: C.acc, color: "#fff", border: "none", borderRadius: 9, padding: "14px", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: F }}>
              Pedir demonstração
            </button>
          </div>
        )}
      </nav>

      {/* HERO */}
      <Sec bg={C.soft} m={m}>
        <div style={col2}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: C.accS, color: C.acc, borderRadius: 999, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, marginBottom: 16 }}>
              <Sparkles size={13} /> Para farmácias em Portugal
            </div>
            <h1 style={{ fontSize: m ? (isNarrow ? 30 : 34) : 46, lineHeight: 1.14, fontWeight: 800, margin: "0 0 16px", letterSpacing: "-0.03em" }}>
              A sua farmácia responde a <span style={{ color: C.acc }}>todas</span> as chamadas. Sem contratar ninguém.
            </h1>
            <p style={{ fontSize: m ? 15.5 : 17.5, color: C.body, lineHeight: 1.6, margin: "0 0 22px" }}>
              Um assistente que atende no WhatsApp e no site: verifica stock, dá preços, cria reservas e informa horários — 24 h por dia. Quando o caso é clínico, passa <strong>sempre</strong> para o farmacêutico.
            </p>
            <div style={{ display: "flex", flexDirection: m ? "column" : "row", gap: 10, marginBottom: 20 }}>
              <button onClick={toForm} style={{ background: C.acc, color: "#fff", border: "none", borderRadius: 10, padding: "15px 24px", fontWeight: 700, fontSize: 15.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: F }}>
                Quero uma demonstração <ArrowRight size={16} />
              </button>
              <a href="#demo" style={{ background: "#fff", color: C.ink, border: `1px solid ${C.line}`, borderRadius: 10, padding: "15px 24px", fontWeight: 700, fontSize: 15.5, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                Testar agora
              </a>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: m ? "8px 16px" : 20, fontSize: 12.5, color: C.mut }}>
              {["Sem diagnóstico clínico", "Dados em Portugal", "RGPD"].map((t) => (
                <span key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}><Check size={14} color={C.acc} /> {t}</span>
              ))}
            </div>
          </div>
          <HeroMock m={m} />
        </div>
      </Sec>

      {/* DOR */}
      <Sec m={m}>
        <Eyebrow>O problema</Eyebrow>
        <H2 m={m}>Cada chamada não atendida é uma venda que foi à concorrência</H2>
        <Lead m={m}>As perguntas que consomem o dia da sua equipa são quase sempre as mesmas cinco. Nenhuma precisa de um farmacêutico.</Lead>
        <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "repeat(3,1fr)", gap: 14 }}>
          {[
            { i: Clock, t: "Balcão parado ao telefone", d: "Um cliente presencial espera enquanto a equipa responde “tem paracetamol?” pela décima vez." },
            { i: TrendingDown, t: "Vendas perdidas fora de horas", d: "Quem liga depois das 20h não volta a ligar. Procura noutro sítio e compra lá." },
            { i: MessageSquare, t: "Reservas por WhatsApp caóticas", d: "Pedidos espalhados por conversas, sem registo e sem dedução de stock." },
          ].map((x) => (
            <Card key={x.t}>
              <x.i size={20} color={C.acc} />
              <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: "10px 0 6px" }}>{x.t}</h3>
              <p style={{ fontSize: 13.5, color: C.body, lineHeight: 1.55, margin: 0 }}>{x.d}</p>
            </Card>
          ))}
        </div>
      </Sec>

      {/* DEMO */}
      <Sec bg={C.soft} id="demo" m={m}>
        <div style={{ textAlign: m ? "left" : "center", marginBottom: 22 }}>
          <Eyebrow>Prove você mesmo</Eyebrow>
          <H2 m={m}>Fale com o assistente. Agora.</H2>
          <p style={{ fontSize: m ? 15 : 16.5, color: C.body, maxWidth: 640, margin: m ? 0 : "0 auto" }}>
            Não é vídeo. É o assistente a funcionar. Tente escrever com erros — ele percebe à mesma.
          </p>
        </div>
        <LiveDemo m={m} />
      </Sec>

      {/* SEGURANÇA */}
      <Sec m={m}>
        <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : ".95fr 1.05fr", gap: m ? 26 : 48, alignItems: "center" }}>
          <div>
            <Eyebrow>A parte que interessa ao farmacêutico</Eyebrow>
            <H2 m={m}>A IA nunca decide um caso clínico</H2>
            <Lead m={m}>
              Gravidez, crianças, antibióticos, sintomas graves, dúvidas de dose. Nestes casos o sistema <strong>bloqueia a automação</strong> antes sequer de consultar a inteligência artificial.
            </Lead>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["Regras fixas no sistema, não “instruções” dadas a um modelo", "Cada caso encaminhado fica registado e auditável", "Nunca sugere medicação, dose ou tratamento"].map((t) => (
                <div key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <ShieldCheck size={17} color={C.acc} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 14.5, color: C.body }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: C.dark, borderRadius: 16, padding: m ? 20 : 28 }}>
            <div style={{ color: "rgba(255,255,255,.5)", fontSize: 11, fontWeight: 700, letterSpacing: ".1em", marginBottom: 14 }}>EXEMPLO REAL</div>
            <div style={{ background: "rgba(255,255,255,.1)", borderRadius: 12, padding: "12px 14px", marginBottom: 12, color: "#fff", fontSize: 13.5, lineHeight: 1.5 }}>
              “estou grávida e tenho muitas dores de cabeça, posso tomar ibuprofeno?”
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0", color: "#ff9b8f", fontSize: 12, fontWeight: 700 }}>
              <Lock size={13} /> AUTOMAÇÃO BLOQUEADA — Gravidez
            </div>
            <div style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: "12px 14px", color: "rgba(255,255,255,.9)", fontSize: 13.5, lineHeight: 1.55 }}>
              “Por segurança, vou encaminhar esta conversa para um farmacêutico. Não posso indicar tratamento nem dose.”
            </div>
            <div style={{ marginTop: 12, fontSize: 11.5, color: "rgba(255,255,255,.45)", fontStyle: "italic" }}>
              → Pedido criado e enviado para a equipa.
            </div>
          </div>
        </div>
      </Sec>

      {/* ROI */}
      <Sec bg={C.soft} id="roi" m={m}><RoiCalc onCta={toForm} m={m} /></Sec>

      {/* FORM */}
      <div ref={formRef}><LeadForm m={m} /></div>

      <footer style={{ background: C.dark, color: "rgba(255,255,255,.6)", padding: m ? "26px 18px" : "32px 24px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: m ? "column" : "row", gap: 14, justifyContent: "space-between", alignItems: m ? "flex-start" : "center", fontSize: 13 }}>
          <span>PharmaAssist AI · Assistente operacional para farmácias</span>
          <button onClick={() => go("leads")} style={{ background: "none", border: "1px solid rgba(255,255,255,.2)", color: "rgba(255,255,255,.6)", borderRadius: 7, padding: "10px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: F }}>
            Área interna
          </button>
        </div>
      </footer>

      {/* CTA fixo no mobile */}
      {m && (
        <div style={{ position: "sticky", bottom: 0, zIndex: 25, background: "rgba(255,255,255,.96)", backdropFilter: "blur(8px)", borderTop: `1px solid ${C.line}`, padding: "10px 18px calc(10px + env(safe-area-inset-bottom))" }}>
          <button onClick={toForm} style={{ width: "100%", background: C.acc, color: "#fff", border: "none", borderRadius: 10, padding: "15px", fontWeight: 800, fontSize: 15.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: F }}>
            Pedir demonstração <ArrowRight size={16} />
          </button>
        </div>
      )}
    </>
  );
}

// ─── Hero mock ────────────────────────────────────────────────────────────────
function HeroMock({ m }) {
  const rows = [
    { who: "u", t: "boa noite, tem parasetamol?" },
    { who: "b", t: "Paracetamol 500mg: disponível · €2.90. Quer que reserve?" },
    { who: "u", t: "sim, reserve 1" },
    { who: "b", t: "Reserva criada. Levanta amanhã a partir das 09:00." },
  ];
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: "0 14px 40px rgba(13,27,42,.10)", overflow: "hidden" }}>
      <div style={{ background: C.acc, padding: "12px 16px", color: "#fff", display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 26, height: 26, borderRadius: 999, background: "rgba(255,255,255,.25)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800 }}>F</div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Farmácia Central</div>
          <div style={{ fontSize: 11, opacity: .8 }}>online · responde em segundos</div>
        </div>
      </div>
      <div style={{ padding: 16, background: "#f7f9fb", display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ alignSelf: r.who === "u" ? "flex-end" : "flex-start", maxWidth: "86%", background: r.who === "u" ? C.acc : "#fff", color: r.who === "u" ? "#fff" : C.ink, border: r.who === "u" ? "none" : `1px solid ${C.line}`, borderRadius: 13, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.45 }}>
            {r.t}
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.line}`, fontSize: 11.5, color: C.mut, textAlign: "center" }}>
        23:47 — a farmácia está fechada. O assistente não.
      </div>
    </div>
  );
}

// ─── Live demo ────────────────────────────────────────────────────────────────
function LiveDemo({ m }) {
  const [stock, setStock] = useState(CATALOG.map((x) => ({ ...x })));
  const [msgs, setMsgs] = useState([{ id: 1, who: "b", t: "Olá! Sou o assistente da Farmácia Central. Pergunte por um produto, horários, ou peça uma reserva." }]);
  const [input, setInput] = useState("");
  const [kpi, setKpi] = useState({ q: 0, res: 0, esc: 0 });
  const idc = useRef(1);
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs]);
  const bump = (k) => setKpi((s) => ({ ...s, [k]: s[k] + 1 }));

  function send(text) {
    const v = (text ?? input).trim();
    if (!v) return;
    setMsgs((x) => [...x, { id: ++idc.current, who: "u", t: v }]);
    setInput("");
    setTimeout(() => {
      const r = reply(v, stock, setStock, bump);
      setMsgs((x) => [...x, { id: ++idc.current, who: "b", t: r.text, tag: r.tag, kind: r.kind }]);
    }, 300);
  }

  const chips = ["tem parasetamol?", "reservar vitamina D", "qual o horário?", "estou grávida e tenho dor"];

  const kpis = (
    <div style={{ display: "grid", gridTemplateColumns: m ? "repeat(3,1fr)" : "1fr", gap: m ? 10 : 0 }}>
      {[
        { k: "q", l: m ? "Resolvidas" : "Perguntas resolvidas", c: C.acc },
        { k: "res", l: m ? "Reservas" : "Reservas criadas", c: C.warn },
        { k: "esc", l: m ? "Ao farmac." : "Casos ao farmacêutico", c: C.dang },
      ].map((x) => (
        <div key={x.k} style={{ marginBottom: m ? 0 : 14, background: m ? "#fff" : "none", border: m ? `1px solid ${C.line}` : "none", borderRadius: m ? 11 : 0, padding: m ? "12px 10px" : 0 }}>
          <div style={{ fontSize: m ? 22 : 27, fontWeight: 800, color: x.c, lineHeight: 1 }}>{kpi[x.k]}</div>
          <div style={{ fontSize: 11.5, color: C.mut, marginTop: 3 }}>{x.l}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "1fr 260px", gap: 14 }}>
      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, display: "flex", flexDirection: "column", height: m ? 420 : 460, overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
          {msgs.map((x) => (
            <div key={x.id} style={{ alignSelf: x.who === "u" ? "flex-end" : "flex-start", maxWidth: "86%" }}>
              <div style={{ background: x.who === "u" ? C.acc : "#f1f5f9", color: x.who === "u" ? "#fff" : C.ink, borderRadius: 14, padding: "11px 13px", fontSize: 14, lineHeight: 1.5 }}>{x.t}</div>
              {x.tag && (
                <div style={{ marginTop: 5, display: "inline-block", background: x.kind === "esc" ? C.dangS : x.kind === "res" ? C.warnS : C.accS, color: x.kind === "esc" ? C.dang : x.kind === "res" ? C.warn : C.acc, borderRadius: 999, padding: "3px 9px", fontSize: 10.5, fontWeight: 700 }}>
                  {x.kind === "esc" ? "⚠ Encaminhado — " : ""}{x.tag}
                </div>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
        <div style={{ padding: "9px 12px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 7, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {chips.map((c) => (
            <button key={c} onClick={() => send(c)} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 999, padding: "9px 13px", fontSize: 12.5, color: C.body, cursor: "pointer", fontFamily: F, whiteSpace: "nowrap", flexShrink: 0 }}>{c}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${C.line}` }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Escreva como um cliente..."
            style={{ flex: 1, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px", fontSize: 16, outline: "none", fontFamily: F }} />
          <button onClick={() => send()} aria-label="Enviar"
            style={{ background: C.acc, color: "#fff", border: "none", borderRadius: 10, padding: m ? "0 16px" : "0 16px", minWidth: 48, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontWeight: 700, fontSize: 13.5, fontFamily: F }}>
            <Send size={16} />{!m && " Enviar"}
          </button>
        </div>
      </div>

      {m ? kpis : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.mut, letterSpacing: ".08em", marginBottom: 14 }}>NESTA SESSÃO</div>
            {kpis}
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, fontSize: 11.5, color: C.mut, lineHeight: 1.5 }}>
              Cada pergunta resolvida aqui é uma chamada que a sua equipa não teve de atender.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── ROI ──────────────────────────────────────────────────────────────────────
function RoiCalc({ onCta, m }) {
  const [calls, setCalls] = useState(40);
  const [mins, setMins] = useState(3);
  const [rate, setRate] = useState(12);
  const [ticket, setTicket] = useState(14);

  const r = useMemo(() => {
    const autom = 0.7;
    const hrsMonth = (calls * mins * autom * 26) / 60;
    const saved = hrsMonth * rate;
    const lostRecovered = calls * 0.12 * 26 * ticket * 0.35;
    return { hrsMonth, saved, lostRecovered, total: saved + lostRecovered };
  }, [calls, mins, rate, ticket]);

  const Slider = ({ label, value, set, min, max, step, suffix }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, color: C.body, fontWeight: 600 }}>{label}</span>
        <strong style={{ fontSize: 14, color: C.acc }}>{value}{suffix}</strong>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => set(+e.target.value)}
        style={{ width: "100%", accentColor: C.acc, cursor: "pointer", height: 28 }} />
    </div>
  );
  const eur = (v) => "€" + Math.round(v).toLocaleString("pt-PT");

  return (
    <>
      <div style={{ textAlign: m ? "left" : "center", marginBottom: 24 }}>
        <Eyebrow>Quanto isto vale para si</Eyebrow>
        <H2 m={m}>Calcule o retorno na sua farmácia</H2>
        <p style={{ fontSize: m ? 15 : 16.5, color: C.body, maxWidth: 620, margin: m ? 0 : "0 auto" }}>
          Ajuste aos seus números. O cálculo assume que apenas 70% das chamadas são automatizáveis.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "1fr 1fr", gap: 16 }}>
        <Card>
          <Slider label="Chamadas por dia" value={calls} set={setCalls} min={10} max={150} step={5} suffix="" />
          <Slider label="Minutos por atendimento" value={mins} set={setMins} min={1} max={8} step={1} suffix=" min" />
          <Slider label="Custo/hora da equipa" value={rate} set={setRate} min={8} max={25} step={1} suffix=" €" />
          <Slider label="Venda média" value={ticket} set={setTicket} min={5} max={40} step={1} suffix=" €" />
        </Card>
        <div style={{ background: C.dark, borderRadius: 14, padding: m ? 20 : 26, color: "#fff", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".1em", color: "rgba(255,255,255,.5)", marginBottom: 14 }}>ESTIMATIVA MENSAL</div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: m ? 38 : 44, fontWeight: 800, lineHeight: 1, color: "#7fd4b8" }}>{eur(r.total)}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 6 }}>valor recuperado por mês</div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,.15)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 11, marginBottom: 18 }}>
            {[
              ["Horas libertadas", `${r.hrsMonth.toFixed(0)} h`],
              ["Poupança em tempo", eur(r.saved)],
              ["Vendas fora de horas", eur(r.lostRecovered)],
            ].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, gap: 12 }}>
                <span style={{ color: "rgba(255,255,255,.65)" }}>{l}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <button onClick={onCta} style={{ marginTop: "auto", background: "#7fd4b8", color: C.dark, border: "none", borderRadius: 10, padding: "14px 18px", fontWeight: 800, fontSize: 14.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: F }}>
            Ver na minha farmácia <ArrowRight size={16} />
          </button>
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: C.mut, marginTop: 14, textAlign: "center", fontStyle: "italic" }}>
        Estimativa indicativa. Não constitui garantia de resultado.
      </p>
    </>
  );
}

// ─── Lead capture ─────────────────────────────────────────────────────────────
const KEY = "pharma-leads";

/**
 * Camada de persistência resiliente.
 * window.storage pode falhar ou não existir; nesse caso mantemos os leads em
 * memória para a sessão não se perder. O utilizador é informado do modo degradado.
 */
let MEM_LEADS = [];
let MEM_ONLY = false;

async function loadLeads() {
  if (MEM_ONLY || typeof window === "undefined" || !window.storage) return MEM_LEADS;
  try {
    const r = await window.storage.get(KEY);
    const list = r?.value ? JSON.parse(r.value) : [];
    MEM_LEADS = Array.isArray(list) ? list : [];
    return MEM_LEADS;
  } catch {
    // Chave inexistente é o caso normal na primeira utilização.
    return MEM_LEADS;
  }
}

async function saveLeads(list) {
  MEM_LEADS = list;
  if (typeof window === "undefined" || !window.storage) { MEM_ONLY = true; return false; }
  try {
    await window.storage.set(KEY, JSON.stringify(list));
    return true;
  } catch {
    MEM_ONLY = true;
    return false;
  }
}

function LeadForm({ m }) {
  const [f, setF] = useState({ pharmacy: "", name: "", email: "", phone: "", size: "1 balcão", pain: "" });
  const [err, setErr] = useState({});
  const [state, setState] = useState("idle");
  const [degraded, setDegraded] = useState(false);
  const set = (k) => (v) => { setF((s) => ({ ...s, [k]: v })); setErr((e) => ({ ...e, [k]: null })); };

  function validate() {
    const e = {};
    if (!f.pharmacy.trim()) e.pharmacy = "Indique o nome da farmácia";
    if (!f.name.trim()) e.name = "Indique o seu nome";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "Email inválido";
    if (f.phone && !/^[\d\s+()-]{9,}$/.test(f.phone)) e.phone = "Telefone inválido";
    setErr(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setState("saving");
    const lead = { ...f, id: `L-${Date.now()}`, at: new Date().toISOString() };
    // O lead é sempre aceite: se a persistência falhar, fica em memória e
    // sinalizamos o modo degradado em vez de bloquear a captação.
    const list = [lead, ...(await loadLeads())];
    const ok = await saveLeads(list);
    setDegraded(!ok);
    setState("done");
  }

  if (state === "done") {
    return (
      <Sec m={m}>
        <div style={{ maxWidth: 540, margin: "0 auto", textAlign: "center" }}>
          <div style={{ width: 54, height: 54, borderRadius: 999, background: C.accS, display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
            <Check size={26} color={C.acc} />
          </div>
          <H2 m={m}>Pedido recebido</H2>
          <p style={{ fontSize: 15.5, color: C.body, lineHeight: 1.6 }}>
            Obrigado, {f.name.split(" ")[0]}. Entramos em contacto com a <strong>{f.pharmacy}</strong> em 24 horas úteis.
          </p>
          {degraded && (
            <p style={{ fontSize: 12.5, color: C.warn, background: C.warnS, borderRadius: 9, padding: "10px 13px", marginTop: 14, lineHeight: 1.5 }}>
              Nota interna: registado apenas nesta sessão (armazenamento indisponível). Exporte o CSV antes de fechar.
            </p>
          )}
          <button onClick={() => { setF({ pharmacy: "", name: "", email: "", phone: "", size: "1 balcão", pain: "" }); setState("idle"); }}
            style={{ marginTop: 16, background: "none", border: `1px solid ${C.line}`, borderRadius: 9, padding: "13px 18px", fontSize: 14, color: C.body, cursor: "pointer", fontFamily: F }}>
            Registar outra farmácia
          </button>
        </div>
      </Sec>
    );
  }

  return (
    <Sec m={m}>
      <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "1fr 1.1fr", gap: m ? 24 : 48, alignItems: "start" }}>
        <div>
          <Eyebrow>Próximo passo</Eyebrow>
          <H2 m={m}>Veja a funcionar com o stock da sua farmácia</H2>
          <Lead m={m}>Marcamos 20 minutos, carregamos uma amostra do seu catálogo e mostramos o assistente a responder aos casos reais do seu balcão.</Lead>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {["Demonstração de 20 minutos, sem compromisso", "Configuração com produtos reais da sua farmácia", "Resposta em 24 horas úteis"].map((t) => (
              <div key={t} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 20, height: 20, borderRadius: 999, background: C.accS, display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Check size={12} color={C.acc} />
                </div>
                <span style={{ fontSize: 14.5, color: C.body }}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        <Card style={{ padding: m ? 20 : 28 }}>
          <Field label="Nome da farmácia *" icon={Building2} value={f.pharmacy} onChange={set("pharmacy")} placeholder="Farmácia Central" error={err.pharmacy} />
          <Field label="O seu nome *" icon={Users} value={f.name} onChange={set("name")} placeholder="Maria Santos" error={err.name} />
          <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "1fr 1fr", gap: m ? 0 : 12 }}>
            <Field label="Email *" icon={Mail} value={f.email} onChange={set("email")} placeholder="maria@farmacia.pt" error={err.email} type="email" inputMode="email" />
            <Field label="Telefone" icon={Phone} value={f.phone} onChange={set("phone")} placeholder="912 345 678" error={err.phone} inputMode="tel" />
          </div>
          <label style={{ display: "block", marginBottom: 14 }}>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.body, marginBottom: 6 }}>Dimensão</span>
            <select value={f.size} onChange={(e) => set("size")(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 12px", border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 16, fontFamily: F, color: C.ink, background: "#fff", outline: "none" }}>
              {["1 balcão", "2–3 balcões", "4+ balcões", "Grupo / cadeia"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
          <label style={{ display: "block", marginBottom: 18 }}>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.body, marginBottom: 6 }}>Qual é hoje a maior dor no atendimento?</span>
            <textarea value={f.pain} onChange={(e) => set("pain")(e.target.value)} rows={3}
              placeholder="Ex.: passamos o dia ao telefone a confirmar stock..."
              style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 16, fontFamily: F, color: C.ink, outline: "none", resize: "vertical" }} />
          </label>

          {state === "error" && (
            <div style={{ background: C.dangS, color: C.dang, borderRadius: 9, padding: "10px 13px", fontSize: 13, marginBottom: 14 }}>
              Não foi possível guardar. Tente novamente.
            </div>
          )}

          <button onClick={submit} disabled={state === "saving"}
            style={{ width: "100%", background: state === "saving" ? C.mut : C.acc, color: "#fff", border: "none", borderRadius: 10, padding: "15px", fontWeight: 800, fontSize: 15.5, cursor: state === "saving" ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: F }}>
            {state === "saving" ? "A enviar..." : <>Pedir demonstração <ArrowRight size={16} /></>}
          </button>
          <p style={{ fontSize: 11.5, color: C.mut, marginTop: 11, textAlign: "center", lineHeight: 1.5 }}>
            Ao enviar, autoriza o contacto para agendamento. Dados tratados segundo o RGPD.
          </p>
        </Card>
      </div>
    </Sec>
  );
}

// ─── Leads panel ──────────────────────────────────────────────────────────────
function LeadsPanel({ go }) {
  const { isMobile: m } = useResponsive();
  const [leads, setLeads] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => { (async () => setLeads(await loadLeads()))(); }, []);

  async function clearAll() {
    const ok = await saveLeads([]);
    setLeads([]);
    setErr(!ok);
  }
  function exportCsv() {
    if (!leads?.length) return;
    const head = ["Data", "Farmácia", "Nome", "Email", "Telefone", "Dimensão", "Dor"];
    const rows = leads.map((l) => [new Date(l.at).toLocaleString("pt-PT"), l.pharmacy, l.name, l.email, l.phone, l.size, (l.pain || "").replace(/[\n;]/g, " ")]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4f6f9" }}>
      <div style={{ background: "#fff", borderBottom: `1px solid ${C.line}`, padding: m ? "13px 18px" : "14px 24px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: m ? "column" : "row", gap: m ? 12 : 0, justifyContent: "space-between", alignItems: m ? "stretch" : "center" }}>
          <div>
            <strong style={{ fontSize: 16 }}>Leads captados</strong>
            <div style={{ fontSize: 12.5, color: C.mut, marginTop: 2 }}>Pedidos de demonstração recebidos</div>
          </div>
          <div style={{ display: "flex", gap: 9 }}>
            <button onClick={exportCsv} disabled={!leads?.length}
              style={{ flex: m ? 1 : "none", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, padding: "11px 14px", fontSize: 13, cursor: leads?.length ? "pointer" : "default", opacity: leads?.length ? 1 : .5, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: F, color: C.ink }}>
              <Download size={14} /> CSV
            </button>
            <button onClick={() => go("site")} style={{ flex: m ? 1 : "none", background: C.acc, color: "#fff", border: "none", borderRadius: 8, padding: "11px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
              Voltar ao site
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: m ? 16 : 24 }}>
        {leads === null && <Card><p style={{ color: C.mut, margin: 0, fontSize: 14 }}>A carregar…</p></Card>}

        {leads?.length === 0 && (
          <Card style={{ textAlign: "center", padding: m ? 32 : 48 }}>
            <Users size={30} color={C.mut} />
            <h3 style={{ fontSize: 17, margin: "14px 0 7px" }}>Ainda sem leads</h3>
            <p style={{ fontSize: 14, color: C.body, margin: "0 0 18px" }}>Volte ao site, submeta o formulário e o lead aparece aqui.</p>
            <button onClick={() => go("site")} style={{ background: C.acc, color: "#fff", border: "none", borderRadius: 9, padding: "13px 20px", fontWeight: 700, fontSize: 14.5, cursor: "pointer", fontFamily: F }}>
              Ir para o site
            </button>
          </Card>
        )}

        {leads?.length > 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: m ? 9 : 14, marginBottom: 16 }}>
              {[
                ["Leads", leads.length],
                ["C/ telefone", leads.filter((l) => l.phone).length],
                ["Multi-balcão", leads.filter((l) => l.size !== "1 balcão").length],
              ].map(([l, v]) => (
                <Card key={l} style={{ padding: m ? 13 : 18 }}>
                  <div style={{ fontSize: m ? 22 : 28, fontWeight: 800, color: C.acc, lineHeight: 1 }}>{v}</div>
                  <div style={{ fontSize: 11.5, color: C.mut, marginTop: 5 }}>{l}</div>
                </Card>
              ))}
            </div>

            <Card style={{ padding: 0, overflow: "hidden" }}>
              {leads.map((l, i) => (
                <div key={l.id} style={{ padding: 16, borderTop: i ? `1px solid ${C.line}` : "none" }}>
                  <div style={{ display: "flex", flexDirection: m ? "column" : "row", justifyContent: "space-between", alignItems: m ? "flex-start" : "flex-start", gap: m ? 6 : 16 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                        <strong style={{ fontSize: 15 }}>{l.pharmacy}</strong>
                        <span style={{ background: C.accS, color: C.acc, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>{l.size}</span>
                      </div>
                      <div style={{ fontSize: 13.5, color: C.body, marginTop: 5, wordBreak: "break-word" }}>
                        {l.name} · {l.email}{l.phone ? ` · ${l.phone}` : ""}
                      </div>
                      {l.pain && <div style={{ fontSize: 13, color: C.mut, marginTop: 7, fontStyle: "italic" }}>“{l.pain}”</div>}
                    </div>
                    <span style={{ fontSize: 12, color: C.mut, whiteSpace: "nowrap" }}>
                      {new Date(l.at).toLocaleDateString("pt-PT")}
                    </span>
                  </div>
                </div>
              ))}
            </Card>

            <button onClick={clearAll} style={{ marginTop: 16, background: "none", border: `1px solid ${C.line}`, color: C.dang, borderRadius: 8, padding: "11px 14px", fontSize: 12.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, fontFamily: F }}>
              <Trash2 size={13} /> Limpar todos os leads
            </button>
            {err && <p style={{ color: C.warn, fontSize: 12.5, marginTop: 8 }}>Limpo apenas nesta sessão (armazenamento indisponível).</p>}
          </>
        )}
      </div>
    </div>
  );
}
