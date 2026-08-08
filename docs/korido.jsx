import { useState, useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { Bell, Share2, Zap, Check, ArrowRight, Clock, Send, Smartphone, Phone } from "lucide-react";

// ————————————————————————————————————————————————
// Korido — v1.1 prototype. All rates are DEMO data.
// New in this pass: Send · Top-up · Call verticals.
// Verticals and corridors are data, not code — the
// production schema mirrors these structures.
// ————————————————————————————————————————————————

const BRAND = "Korido";

const INK = "#0A3B2E";
const INK_SOFT = "#11503F";
const PAPER = "#FBFAF7";
const MANGO = "#F5B301";
const LEAF = "#1E7A5A";
const LINE = "#E5E1D8";

const CORRIDORS = {
  NG: {
    country: "Nigeria", flag: "🇳🇬", code: "NGN", symbol: "₦", mid: 1528.4,
    history: [1502.1, 1511.6, 1498.9, 1519.3, 1524.8, 1531.2, 1528.4],
    networks: ["MTN", "Airtel", "Glo", "9mobile"],
    callRates: { mobile: 6.9, landline: 5.5 },
  },
  GH: {
    country: "Ghana", flag: "🇬🇭", code: "GHS", symbol: "GH₵", mid: 15.62,
    history: [15.31, 15.4, 15.36, 15.51, 15.58, 15.66, 15.62],
    networks: ["MTN", "Telecel", "AirtelTigo"],
    callRates: { mobile: 9.5, landline: 8.0 },
  },
  KE: {
    country: "Kenya", flag: "🇰🇪", code: "KES", symbol: "KSh", mid: 129.85,
    history: [128.4, 128.9, 129.6, 129.2, 129.9, 130.1, 129.85],
    networks: ["Safaricom", "Airtel"],
    callRates: { mobile: 8.2, landline: 7.1 },
  },
};

const SEND_PROVIDERS = [
  { id: "lemfi", name: "LemFi", speed: "Minutes", flat: 0, pct: 0, margin: 0.0015 },
  { id: "taptap", name: "Taptap Send", speed: "Minutes", flat: 0, pct: 0, margin: 0.006 },
  { id: "sendwave", name: "Sendwave", speed: "Minutes", flat: 0, pct: 0, margin: 0.009 },
  { id: "wise", name: "Wise", speed: "Minutes–hrs", flat: 0.3, pct: 0.0085, margin: 0 },
  { id: "remitly", name: "Remitly", speed: "Minutes", flat: 1.99, pct: 0, margin: 0.012 },
  { id: "worldremit", name: "WorldRemit", speed: "Minutes", flat: 2.99, pct: 0, margin: 0.014 },
  { id: "xe", name: "Xe", speed: "Hours", flat: 3.0, pct: 0, margin: 0.01 },
];

// Top-up: fee you pay + bonus airtime the recipient gets (demo promos)
const TOPUP_PROVIDERS = [
  { id: "rebtel-t", name: "Rebtel Top-up", fee: 0, bonus: 0.10, note: "+10% extra airtime" },
  { id: "ding", name: "Ding", fee: 0.99, bonus: 0.05, note: "+5% bonus this week" },
  { id: "wr-air", name: "WorldRemit Airtime", fee: 0, bonus: 0, note: "No fee" },
  { id: "recharge", name: "Recharge.com", fee: 1.49, bonus: 0.08, note: "+8% on MTN" },
];

const CALL_PROVIDERS = [
  { id: "rebtel-c", name: "Rebtel", unlimited: 14.99, rateAdj: 1.0, note: "Unlimited plan · works without internet" },
  { id: "boss", name: "Boss Revolution", unlimited: 16.99, rateAdj: 1.08, note: "PIN-less dialing" },
  { id: "talk360", name: "Talk360", unlimited: null, rateAdj: 1.15, note: "Pay-as-you-go only" },
];

const TABS = [
  { id: "send", label: "Send", icon: Send },
  { id: "topup", label: "Top-up", icon: Smartphone },
  { id: "call", label: "Call", icon: Phone },
];

const TOPUP_AMOUNTS = [5, 10, 20, 50];

const fmt = (n, max = 0) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: max, minimumFractionDigits: 0 }).format(n);

export default function Korido() {
  const [tab, setTab] = useState("send");
  const [corridor, setCorridor] = useState("NG");
  const [amount, setAmount] = useState(200);
  const [topupAmt, setTopupAmt] = useState(20);
  const [network, setNetwork] = useState(0);
  const [target, setTarget] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [shared, setShared] = useState(false);

  const c = CORRIDORS[corridor];

  const sendQuotes = useMemo(() => {
    const amt = Number(amount) || 0;
    return SEND_PROVIDERS.map((p) => {
      const fee = p.flat + p.pct * amt;
      const rate = c.mid * (1 - p.margin);
      return { ...p, fee, rate, receive: Math.max(0, (amt - fee) * rate) };
    }).sort((a, b) => b.receive - a.receive);
  }, [corridor, amount, c.mid]);

  const topupQuotes = useMemo(
    () =>
      TOPUP_PROVIDERS.map((p) => ({
        ...p,
        youPay: topupAmt + p.fee,
        theyGet: topupAmt * c.mid * (1 + p.bonus),
      })).sort((a, b) => b.theyGet / b.youPay - a.theyGet / a.youPay),
    [topupAmt, c.mid]
  );

  const callQuotes = useMemo(
    () =>
      CALL_PROVIDERS.map((p) => ({
        ...p,
        perMin: (c.callRates.mobile * p.rateAdj) / 100,
      })).sort((a, b) => a.perMin - b.perMin),
    [c]
  );

  const spark = c.history.map((v, i) => ({ i, v }));
  const weekAgo = c.history[0];
  const delta = ((c.mid - weekAgo) / weekAgo) * 100;

  const addAlert = () => {
    const t = parseFloat(target);
    if (!t || t <= 0) return;
    setAlerts((a) => [...a, { corridor, target: t, id: Date.now() }]);
    setTarget("");
  };

  const shareText = () => {
    const lines = sendQuotes
      .slice(0, 3)
      .map((q, i) => `${i + 1}. ${q.name} — ${c.symbol}${fmt(q.receive)} for $${fmt(amount)}`);
    return encodeURIComponent(
      `${BRAND} · Best USD → ${c.code} today\n$1 = ${c.symbol}${fmt(c.mid, 2)} mid-market\n\n${lines.join(
        "\n"
      )}\n\nCompare live: korido.app (demo)`
    );
  };

  const ProviderCTA = ({ name, primary }) => (
    <a
      href="#affiliate-link"
      onClick={(e) => e.preventDefault()}
      className="mt-3 flex items-center justify-center gap-1 rounded-xl py-2.5 text-sm font-bold"
      style={
        primary
          ? { background: LEAF, color: "#fff" }
          : { background: PAPER, color: INK, border: `1px solid ${LINE}` }
      }
    >
      Continue with {name} <ArrowRight size={16} aria-hidden="true" />
    </a>
  );

  return (
    <div style={{ background: PAPER, minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", color: INK }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Inter:wght@400;500;600;700&display=swap');
        .display { font-family: 'Bricolage Grotesque', 'Inter', system-ui, sans-serif; }
        .tnum { font-variant-numeric: tabular-nums; }
        input:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid ${MANGO}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      {/* ————— Header ————— */}
      <header style={{ background: INK, color: PAPER }} className="px-5 pt-6 pb-6">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between">
            <div className="display text-2xl font-extrabold tracking-tight">
              {BRAND}<span style={{ color: MANGO }}>.</span>
            </div>
            <span
              className="text-xs font-semibold px-2 py-1 rounded-full"
              style={{ background: INK_SOFT, color: MANGO, letterSpacing: "0.08em" }}
            >
              DEMO DATA
            </span>
          </div>
          <p className="mt-1 text-sm" style={{ color: "#BFD8CC" }}>
            Every way to send, top up, and call home — compared.
          </p>

          {/* vertical tabs */}
          <div className="mt-4 flex rounded-2xl p-1" style={{ background: INK_SOFT }} role="tablist" aria-label="Service">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition-colors"
                  style={active ? { background: MANGO, color: INK } : { color: "#BFD8CC" }}
                >
                  <Icon size={15} aria-hidden="true" /> {t.label}
                </button>
              );
            })}
          </div>

          {/* corridor picker (shared across verticals) */}
          <div className="mt-3 flex gap-2" role="tablist" aria-label="Destination country">
            {Object.entries(CORRIDORS).map(([k, v]) => (
              <button
                key={k}
                role="tab"
                aria-selected={corridor === k}
                onClick={() => { setCorridor(k); setNetwork(0); }}
                className="flex-1 rounded-xl px-2 py-2 text-sm font-semibold transition-colors"
                style={
                  corridor === k
                    ? { background: "rgba(245,179,1,0.15)", color: MANGO, border: `1px solid ${MANGO}` }
                    : { background: "rgba(255,255,255,0.06)", color: PAPER, border: "1px solid transparent" }
                }
              >
                {v.flag} {v.country}
              </button>
            ))}
          </div>

          {/* SEND: amount + mid-market strip */}
          {tab === "send" && (
            <>
              <div className="mt-3 rounded-2xl p-4" style={{ background: INK_SOFT }}>
                <label className="text-xs font-semibold" style={{ color: "#BFD8CC", letterSpacing: "0.08em" }}>
                  YOU SEND (USD) · 🇺🇸 UNITED STATES
                </label>
                <div className="flex items-center gap-2 mt-2">
                  <span className="display text-3xl font-bold">$</span>
                  <input
                    aria-label="Amount to send in US dollars"
                    type="number" min="1" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="display w-full bg-transparent text-3xl font-bold tnum"
                    style={{ color: PAPER, border: "none" }}
                  />
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs" style={{ color: "#BFD8CC" }}>Mid-market rate · updated 4 min ago</div>
                  <div className="display text-xl font-bold tnum">$1 = {c.symbol}{fmt(c.mid, 2)}</div>
                  <div className="text-xs tnum" style={{ color: delta >= 0 ? MANGO : "#F0A8A0" }}>
                    {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs last week
                  </div>
                </div>
                <div className="w-28 h-12" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={spark}>
                      <YAxis hide domain={["dataMin", "dataMax"]} />
                      <Line type="monotone" dataKey="v" stroke={MANGO} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* TOP-UP: network + quick amounts */}
          {tab === "topup" && (
            <div className="mt-3 rounded-2xl p-4" style={{ background: INK_SOFT }}>
              <label className="text-xs font-semibold" style={{ color: "#BFD8CC", letterSpacing: "0.08em" }}>
                RECIPIENT'S NETWORK
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.networks.map((n, i) => (
                  <button
                    key={n}
                    onClick={() => setNetwork(i)}
                    aria-pressed={network === i}
                    className="rounded-xl px-3 py-1.5 text-sm font-semibold"
                    style={network === i ? { background: MANGO, color: INK } : { background: "rgba(255,255,255,0.08)", color: PAPER }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <label className="block mt-4 text-xs font-semibold" style={{ color: "#BFD8CC", letterSpacing: "0.08em" }}>
                TOP-UP AMOUNT (USD)
              </label>
              <div className="mt-2 flex gap-2">
                {TOPUP_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setTopupAmt(a)}
                    aria-pressed={topupAmt === a}
                    className="flex-1 rounded-xl py-2 display font-bold tnum"
                    style={topupAmt === a ? { background: MANGO, color: INK } : { background: "rgba(255,255,255,0.08)", color: PAPER }}
                  >
                    ${a}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CALL: context line */}
          {tab === "call" && (
            <div className="mt-3 rounded-2xl p-4" style={{ background: INK_SOFT }}>
              <div className="text-sm" style={{ color: "#BFD8CC" }}>
                Cheapest ways to call {c.flag} {c.country} — mobiles and landlines, no internet needed on their side.
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 pb-14">
        {/* ————— SEND board ————— */}
        {tab === "send" && (
          <>
            <section aria-label="Money transfer comparison" className="-mt-2 pt-2">
              {sendQuotes.map((q, i) => (
                <div key={q.id} className="rounded-2xl mb-3 p-4 bg-white"
                  style={{ border: `1px solid ${i === 0 ? MANGO : LINE}`, boxShadow: i === 0 ? "0 4px 16px rgba(245,179,1,0.18)" : "0 1px 3px rgba(10,59,46,0.05)" }}>
                  {i === 0 && (
                    <div className="inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-2"
                      style={{ background: MANGO, color: INK, letterSpacing: "0.06em" }}>
                      BEST RATE
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="display font-bold text-lg leading-tight">{q.name}</div>
                      <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "#6B7A73" }}>
                        <Clock size={12} aria-hidden="true" /> {q.speed} · fee ${q.fee.toFixed(2)} · {c.symbol}{fmt(q.rate, 2)}/$
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs" style={{ color: "#6B7A73" }}>They receive</div>
                      <div className="display text-xl font-extrabold tnum" style={{ color: i === 0 ? LEAF : INK }}>
                        {c.symbol}{fmt(q.receive)}
                      </div>
                    </div>
                  </div>
                  <ProviderCTA name={q.name} primary={i === 0} />
                </div>
              ))}
            </section>

            <section aria-label="Rate alerts" className="mt-8 rounded-2xl p-4 bg-white" style={{ border: `1px solid ${LINE}` }}>
              <div className="flex items-center gap-2">
                <Bell size={18} style={{ color: LEAF }} aria-hidden="true" />
                <h2 className="display font-bold text-lg">Catch the rate you want</h2>
              </div>
              <p className="text-sm mt-1" style={{ color: "#6B7A73" }}>
                We'll message you when $1 crosses your target for {c.flag} {c.country}.
              </p>
              <div className="mt-3 flex gap-2">
                <div className="flex items-center gap-1 rounded-xl px-3 flex-1" style={{ background: PAPER, border: `1px solid ${LINE}` }}>
                  <span className="text-sm font-semibold tnum">{c.symbol}</span>
                  <input
                    aria-label={`Target rate in ${c.code} per dollar`}
                    type="number" placeholder={fmt(c.mid * 1.02, 0)} value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="w-full py-2.5 bg-transparent text-sm tnum" style={{ border: "none" }}
                  />
                </div>
                <button onClick={addAlert} className="rounded-xl px-4 text-sm font-bold" style={{ background: INK, color: PAPER }}>
                  Set alert
                </button>
              </div>
              {alerts.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {alerts.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm" style={{ color: LEAF }}>
                      <Check size={14} aria-hidden="true" />
                      Watching {CORRIDORS[a.corridor].flag} for $1 = {CORRIDORS[a.corridor].symbol}{fmt(a.target)}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Share today's rates" className="mt-8">
              <h2 className="display font-bold text-lg mb-3">Send today's rates to the group chat</h2>
              <div className="relative rounded-2xl overflow-hidden bg-white" style={{ border: `1.5px dashed ${INK}` }}>
                <div className="absolute w-5 h-5 rounded-full -left-2.5 top-1/2 -translate-y-1/2" style={{ background: PAPER, border: `1.5px dashed ${INK}` }} aria-hidden="true" />
                <div className="absolute w-5 h-5 rounded-full -right-2.5 top-1/2 -translate-y-1/2" style={{ background: PAPER, border: `1.5px dashed ${INK}` }} aria-hidden="true" />
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: INK, color: PAPER }}>
                  <span className="display font-extrabold">{BRAND}<span style={{ color: MANGO }}>.</span> rate ticket</span>
                  <span className="text-xs tnum" style={{ color: "#BFD8CC" }}>USD → {c.code} · today</span>
                </div>
                <div className="p-4">
                  {sendQuotes.slice(0, 3).map((q, i) => (
                    <div key={q.id} className="flex items-center justify-between py-2 text-sm"
                      style={{ borderBottom: i < 2 ? `1px solid ${LINE}` : "none" }}>
                      <span className="font-semibold">
                        {i + 1}. {q.name}
                        {i === 0 && <Zap size={13} className="inline ml-1" style={{ color: MANGO }} aria-hidden="true" />}
                      </span>
                      <span className="display font-bold tnum">{c.symbol}{fmt(q.receive)}</span>
                    </div>
                  ))}
                  <div className="text-xs mt-2 tnum" style={{ color: "#8A968F" }}>
                    for ${fmt(amount)} · $1 = {c.symbol}{fmt(c.mid, 2)} mid-market
                  </div>
                </div>
              </div>
              <a href={`https://wa.me/?text=${shareText()}`} target="_blank" rel="noreferrer"
                onClick={() => { setShared(true); setTimeout(() => setShared(false), 2500); }}
                className="mt-3 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold"
                style={{ background: "#25D366", color: "#083b23" }}>
                <Share2 size={16} aria-hidden="true" /> {shared ? "Opening WhatsApp…" : "Share to WhatsApp"}
              </a>
            </section>
          </>
        )}

        {/* ————— TOP-UP board ————— */}
        {tab === "topup" && (
          <section aria-label="Airtime top-up comparison" className="-mt-2 pt-2">
            {topupQuotes.map((q, i) => (
              <div key={q.id} className="rounded-2xl mb-3 p-4 bg-white"
                style={{ border: `1px solid ${i === 0 ? MANGO : LINE}`, boxShadow: i === 0 ? "0 4px 16px rgba(245,179,1,0.18)" : "0 1px 3px rgba(10,59,46,0.05)" }}>
                {i === 0 && (
                  <div className="inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-2"
                    style={{ background: MANGO, color: INK, letterSpacing: "0.06em" }}>
                    BEST VALUE
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="display font-bold text-lg leading-tight">{q.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "#6B7A73" }}>
                      {c.networks[network]} · you pay ${q.youPay.toFixed(2)} · {q.note}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs" style={{ color: "#6B7A73" }}>Airtime delivered</div>
                    <div className="display text-xl font-extrabold tnum" style={{ color: i === 0 ? LEAF : INK }}>
                      {c.symbol}{fmt(q.theyGet)}
                    </div>
                  </div>
                </div>
                <ProviderCTA name={q.name} primary={i === 0} />
              </div>
            ))}
            <p className="text-xs mt-1" style={{ color: "#8A968F" }}>
              Bonus promos change weekly — production tracks each network's live offers per provider.
            </p>
          </section>
        )}

        {/* ————— CALL board ————— */}
        {tab === "call" && (
          <section aria-label="International calling comparison" className="-mt-2 pt-2">
            {callQuotes.map((q, i) => (
              <div key={q.id} className="rounded-2xl mb-3 p-4 bg-white"
                style={{ border: `1px solid ${i === 0 ? MANGO : LINE}`, boxShadow: i === 0 ? "0 4px 16px rgba(245,179,1,0.18)" : "0 1px 3px rgba(10,59,46,0.05)" }}>
                {i === 0 && (
                  <div className="inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-2"
                    style={{ background: MANGO, color: INK, letterSpacing: "0.06em" }}>
                    CHEAPEST PER MINUTE
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="display font-bold text-lg leading-tight">{q.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "#6B7A73" }}>{q.note}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs" style={{ color: "#6B7A73" }}>Mobile rate</div>
                    <div className="display text-xl font-extrabold tnum" style={{ color: i === 0 ? LEAF : INK }}>
                      {(q.perMin * 100).toFixed(1)}¢<span className="text-sm font-semibold">/min</span>
                    </div>
                    {q.unlimited && (
                      <div className="text-xs tnum" style={{ color: "#6B7A73" }}>
                        or ${q.unlimited}/mo unlimited
                      </div>
                    )}
                  </div>
                </div>
                <ProviderCTA name={q.name} primary={i === 0} />
              </div>
            ))}
            <p className="text-xs mt-1" style={{ color: "#8A968F" }}>
              Rates shown for calls to {c.country} mobiles — landline rates run lower.
            </p>
          </section>
        )}

        <footer className="mt-10 text-xs leading-relaxed" style={{ color: "#8A968F" }}>
          <p>
            {BRAND} is free for you, always. When you continue to a partner through our links, they may pay us a
            commission — it never changes your rate, fee, or bonus.
          </p>
          <p className="mt-2">All figures are demo values for product review, not live quotes.</p>
        </footer>
      </main>
    </div>
  );
}
