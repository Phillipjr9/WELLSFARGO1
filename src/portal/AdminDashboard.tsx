import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Check,
  CreditCard,
  Database,
  House,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";
import { PageIntro } from "./Chrome";
import { kindNames, money, dateLabel, type Workspace } from "./model";
import { day, mobileDepositUsage, MOBILE_DEPOSIT_LIMITS } from "../../shared/ledger.mjs";
import { runCommand } from "./store";

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="pb-admin-stat">
      <span className="pb-admin-stat-icon">{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {sub && <span className="pb-admin-stat-sub">{sub}</span>}
      </div>
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="pb-admin-usage">
      <div className="pb-admin-usage-head">
        <span>{label}</span>
        <small>
          {money(used)} of {money(limit)}
        </small>
      </div>
      <div className="pb-admin-usage-track">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AdminDashboard({
  state,
  ready,
}: {
  state: Workspace;
  ready: boolean;
}) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);

  // Inline balance editor
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const depositTotal = useMemo(
    () =>
      state.accounts
        .filter((a) => a.type === "checking" || a.type === "savings")
        .reduce((s, a) => s + a.balance, 0),
    [state.accounts],
  );
  const credit = state.accounts.find((a) => a.type === "credit");
  const loan = state.accounts.find((a) => a.type === "loan");
  const usage = mobileDepositUsage(state, day());

  const hide = state.preferences.hideBalances;
  const amt = (cents: number) => (hide ? "Hidden" : money(cents));

  const startEdit = (id: string, balance: number) => {
    setEditing(id);
    setEditValue((balance / 100).toFixed(2));
    setError("");
  };

  const saveBalance = async () => {
    const cents = Math.round(Number(editValue) * 100);
    if (!editing || Number.isNaN(cents) || cents < 0) {
      setError("Enter a balance of $0.00 or more.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await runCommand({ action: "admin-set-balance", payload: { accountId: editing, balance: cents } });
      setEditing(null);
      setNotice("Sample balance updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The change could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const cancelPayment = async (id: string) => {
    setError("");
    setNotice("");
    try {
      await runCommand({ action: "cancel", payload: { id } });
      setNotice("Scheduled payment cancelled.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payment could not be cancelled.");
    }
  };

  const doReset = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    setEditing(null);
    try {
      await runCommand({ action: "admin-reset", payload: {} });
      setResetOpen(false);
      setNotice("Workspace reset to the original sample data.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The workspace could not be reset.");
    } finally {
      setSaving(false);
    }
  };

  const recentTx = state.transactions.slice(0, 10);
  const schedCount = state.payments.filter((p) => p.status === "scheduled").length;

  return (
    <>
      <PageIntro
        eyebrow="Workspace tooling"
        title="Workspace admin"
        description="Manage the sample data behind this demo. Every account, balance, and payment here is fictional sample data."
      />

      <div className="pb-admin-banner">
        <ShieldCheck size={18} />
        <span>
          This admin view only controls <strong>this demo workspace's sample data</strong>. It is not
          connected to any real bank, and no real customers, accounts, or money are involved.
        </span>
      </div>

      {notice && (
        <p role="status" className="pb-admin-notice ok">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="pb-admin-notice err">
          {error}
        </p>
      )}

      <div className="pb-admin-stats">
        <StatTile
          icon={<Wallet size={19} />}
          label="Deposit balances"
          value={amt(depositTotal)}
          sub="Checking + savings"
        />
        <StatTile
          icon={<CreditCard size={19} />}
          label="Credit card"
          value={amt(credit?.balance ?? 0)}
          sub={credit ? `${hide ? "credit hidden" : "credit " + money(Math.max(0, (credit.limit ?? 0) - credit.balance))}` : "none"}
        />
        <StatTile
          icon={<House size={19} />}
          label="Home loan principal"
          value={amt(loan?.balance ?? 0)}
          sub={loan ? loan.name : "none"}
        />
        <StatTile
          icon={<Database size={19} />}
          label="Records"
          value={`${state.transactions.length} tx · ${state.payments.length} pay`}
          sub={`${state.accounts.length} accounts`}
        />
      </div>

      <div className="pb-admin-grid">
        <section className="pb-panel pb-admin-section" aria-labelledby="admin-accounts">
          <h2 id="admin-accounts">
            <Banknote size={18} /> Sample accounts
          </h2>
          <div className="pb-admin-table-wrap">
            <table className="pb-admin-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th className="num">Balance</th>
                  <th className="num">Set balance</th>
                </tr>
              </thead>
              <tbody>
                {state.accounts.map((a) => {
                  const editable = a.type !== "external";
                  const isEditing = editing === a.id;
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.name}</strong> ····{a.last4}
                      </td>
                      <td>
                        <span className="pb-admin-tag">{a.type}</span>
                      </td>
                      <td className="num">{amt(a.balance)}</td>
                      <td className="num">
                        {editable ? (
                          isEditing ? (
                            <span className="pb-admin-edit">
                              <span className="pb-admin-edit-field">
                                <span>$</span>
                                <input
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  inputMode="decimal"
                                  autoFocus
                                />
                              </span>
                              <button
                                type="button"
                                className="pb-admin-edit-btn ok"
                                onClick={saveBalance}
                                disabled={saving}
                                aria-label={`Save balance for ${a.name}`}
                              >
                                <Check size={15} />
                              </button>
                              <button
                                type="button"
                                className="pb-admin-edit-btn"
                                onClick={() => setEditing(null)}
                                aria-label={`Cancel editing ${a.name}`}
                              >
                                <X size={15} />
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="pb-admin-edit-btn wide"
                              onClick={() => startEdit(a.id, a.balance)}
                            >
                              <SlidersHorizontal size={14} /> Set
                            </button>
                          )
                        ) : (
                          <span className="pb-admin-muted">linked bank</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pb-panel pb-admin-section" aria-labelledby="admin-deposit">
          <h2 id="admin-deposit">
            <Wallet size={18} /> Mobile deposit usage
          </h2>
          <div className="pb-admin-usage-list">
            <UsageBar label="Daily limit (today)" used={usage.todayTotal} limit={MOBILE_DEPOSIT_LIMITS.daily} />
            <UsageBar label="30-day limit" used={usage.rollingTotal} limit={MOBILE_DEPOSIT_LIMITS.rolling30} />
          </div>
          <p className="pb-admin-note">
            Usage is computed from posted <em>Mobile deposit</em> transactions in this workspace.
          </p>
        </section>

        <section className="pb-panel pb-admin-section pb-admin-span2" aria-labelledby="admin-payments">
          <h2 id="admin-payments">
            <CreditCard size={18} /> Payments & deposits
            <span className="pb-admin-count">{schedCount} scheduled</span>
          </h2>
          <div className="pb-admin-table-wrap">
            <table className="pb-admin-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>To</th>
                  <th className="num">Amount</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="num">Action</th>
                </tr>
              </thead>
              <tbody>
                {state.payments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="pb-admin-empty">
                      No payments or deposits yet.
                    </td>
                  </tr>
                )}
                {state.payments.slice(0, 12).map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.id}</td>
                    <td>{kindNames[p.kind]}</td>
                    <td>{p.toName}</td>
                    <td className="num">{amt(p.amount)}</td>
                    <td>{dateLabel(p.date)}</td>
                    <td>
                      <span className={`pb-admin-status ${p.status}`}>{p.status}</span>
                    </td>
                    <td className="num">
                      {p.status === "scheduled" ? (
                        <button
                          type="button"
                          className="pb-admin-edit-btn wide"
                          onClick={() => cancelPayment(p.id)}
                        >
                          <X size={14} /> Cancel
                        </button>
                      ) : (
                        <span className="pb-admin-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pb-panel pb-admin-section pb-admin-span2" aria-labelledby="admin-tx">
          <h2 id="admin-tx">
            <Database size={18} /> Recent activity
          </h2>
          <div className="pb-admin-table-wrap">
            <table className="pb-admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTx.map((t) => {
                  const account = state.accounts.find((a) => a.id === t.accountId);
                  return (
                    <tr key={t.id}>
                      <td>{dateLabel(t.date)}</td>
                      <td>{t.description}</td>
                      <td>
                        {account ? `${account.name} ····${account.last4}` : "—"}
                      </td>
                      <td>
                        <span className="pb-admin-tag">{t.category}</span>
                      </td>
                      <td className={`num ${t.amount > 0 ? "pos" : "neg"}`}>
                        {hide ? "Hidden" : `${t.amount > 0 ? "+" : ""}${money(t.amount)}`}
                      </td>
                      <td>
                        <span className={`pb-admin-status ${t.status}`}>{t.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pb-panel pb-admin-danger pb-admin-span2" aria-labelledby="admin-reset">
          <h2 id="admin-reset">
            <AlertTriangle size={18} /> Danger zone
          </h2>
          <p>
            Reset this workspace back to the original sample accounts, balances, and transactions.
            This clears every deposit, payment, and adjustment you have made in the demo.
          </p>
          {resetOpen ? (
            <div className="pb-admin-danger-actions">
              <button type="button" className="pb-button pb-danger" onClick={doReset} disabled={saving || !ready}>
                <RotateCcw size={16} /> {saving ? "Resetting…" : "Yes, reset workspace"}
              </button>
              <button type="button" className="pb-text-btn" onClick={() => setResetOpen(false)}>
                Keep my data
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="pb-button pb-danger-outline"
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw size={16} /> Reset workspace
            </button>
          )}
        </section>
      </div>
    </>
  );
}
