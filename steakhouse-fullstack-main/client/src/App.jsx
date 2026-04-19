import React, { useEffect, useMemo, useState } from "react";

/** ---------- Config & helpers ---------- */
const API = "/api";
const BRANCHES = ["Uptown", "Riverside", "Downtown"];
const currency = (n) => `$${Number(n).toFixed(2)}`;

/* Role/branch normalization so UI and API stay in sync */
const normalizeRole = (r) => {
  if (!r) return "Guest";
  const x = String(r).toLowerCase();
  if (x === "admin") return "Admin";
  if (x === "hq_manager") return "HQManager";
  if (x === "branch_manager" || x === "manager") return "Manager";
  if (x === "chef") return "Chef";
  if (x === "cashier") return "Cashier";
  if (x === "customer") return "Customer";
  return r; // already normalized?
};
const titleBranch = (b) => {
  if (!b) return null;
  const x = String(b);
  const low = x.toLowerCase();
  if (low === "uptown") return "Uptown";
  if (low === "riverside") return "Riverside";
  if (low === "downtown") return "Downtown";
  return x;
};

/* Tiny auth helpers */
const TOK_KEY = "steak.jwt";
const USER_KEY = "steak.user";
const getToken = () => localStorage.getItem(TOK_KEY) || "";
const setToken = (t) => (t ? localStorage.setItem(TOK_KEY, t) : localStorage.removeItem(TOK_KEY));
const saveUser = (u) => (u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY));
const loadUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/* Fetch helpers that automatically include Authorization if we have a JWT */
const authHeaders = () => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};
async function jget(u, fallback = []) {
  try {
    const r = await fetch(u, { headers: { ...authHeaders() } });
    if (!r.ok) throw 0;
    return await r.json();
  } catch {
    return fallback;
  }
}
async function jpost(u, b) {
  const r = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(b),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** simple router helpers */
const getHashPath = () => window.location.hash.replace("#", "") || "/";
const go = (path) => {
  if (!path.startsWith("/")) path = `/${path}`;
  window.location.hash = path;
};

export default function App() {
  /** ---------- State ---------- */
  const [currentUser, setCurrentUser] = useState(null);

  const [menu, setMenu] = useState([]);
  const [orders, setOrders] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [messages, setMessages] = useState([]);
  const [dbUsers, setDbUsers] = useState([]); // Admin/HQ can list real users

  const [route, setRoute] = useState(getHashPath());

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({ name: "", email: "", password: "" });

  const [cart, setCart] = useState([]);
  const [checkoutBranch, setCheckoutBranch] = useState("Uptown");

  const [resForm, setResForm] = useState({
    branch: "Uptown",
    name: "",
    email: "",
    party: 2,
    datetime: "",
  });

  /** ---------- Boot: restore session & load data ---------- */
  useEffect(() => {
    // Restore session if it exists
    const cached = loadUser();
    if (cached) {
      // ensure normalized
      const norm = {
        ...cached,
        role: normalizeRole(cached.role),
        branch: titleBranch(cached.branch),
      };
      setCurrentUser(norm);
    }

    (async () => {
      setMenu(
        await jget(
          `${API}/menu`,
          [
            { id: 1, name: "Stuffed Truffle", category: "Special", price: 42, isAvailable: true },
            { id: 2, name: "Filet Mignon", category: "Steak", price: 56, isAvailable: true },
            { id: 3, name: "Caviar Sushi", category: "Seafood", price: 68, isAvailable: true },
            { id: 4, name: "House Salad", category: "Sides", price: 12, isAvailable: true },
            { id: 5, name: "Ultra Exotic Ribeye", category: "Special", price: 74, isAvailable: true },
          ].map((x, i) => ({ ...x, id: i + 1 }))
        )
      );
      setSuppliers(await jget(`${API}/suppliers`, []));
      setEmployees(await jget(`${API}/employees`, []));
      setCampaigns(await jget(`${API}/campaigns`, []));
      setExpenses(await jget(`${API}/expenses`, []));
      setReservations(
        (await jget(`${API}/reservations`, [])).map((r) => ({ ...r, branch: titleBranch(r.branch) }))
      );
      setOrders(
        (await jget(`${API}/orders`, [])).map((o) => ({ ...o, branch: titleBranch(o.branch) }))
      );
      setMessages(await jget(`${API}/messages`, []));
      setDbUsers(
        (await jget(`${API}/users`, [])).map((u) => ({
          ...u,
          role: normalizeRole(u.role),
          branch: titleBranch(u.branch),
        }))
      );
    })();
  }, []);

  /** ---------- Router wiring ---------- */
  useEffect(() => {
    const onHash = () => setRoute(getHashPath());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Refetch users list after login if Admin/HQ (uses JWT from jget headers)
useEffect(() => {
  if (!currentUser) return;
  if (["Admin", "HQManager"].includes(currentUser.role)) {
    (async () => {
      const users = await jget(`${API}/users`, []);
      setDbUsers(
        users.map(u => ({
          ...u,
          role: normalizeRole(u.role),
          branch: titleBranch(u.branch),
        }))
      );
    })();
  }
}, [currentUser]);

  /** ---------- Derived ---------- */
  const detailedCart = useMemo(
    () =>
      cart.map((c) => {
        const m = menu.find((x) => x.id === c.itemId);
        return { ...c, name: m?.name ?? "?", price: Number(m?.price ?? 0) };
      }),
    [cart, menu]
  );
  const cartTotal = useMemo(() => detailedCart.reduce((s, i) => s + i.price * i.qty, 0), [detailedCart]);
  const userRole = currentUser?.role ?? "Guest";

  /** ---------- Date helpers for reports ---------- */
  const sameYMD = (dt, n = new Date()) => {
    if (!dt) return false;
    const d = new Date(dt);
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  };
  const isThisMonth = (dt) => {
    if (!dt) return false;
    const d = new Date(dt), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
  };
  const touchesToday = (o) => sameYMD(o.created_at) || sameYMD(o.updated_at);
  const touchesThisMonth = (o) => isThisMonth(o.created_at) || isThisMonth(o.updated_at);

  /** Auto-redirect after login and role-guard routes */
  const gotoRoleHome = (role) => {
    if (role === "Chef") go("/chef");
    else if (role === "Manager") go("/manager");
    else if (role === "HQManager") go("/hq");
    else if (role === "Admin") go("/admin");
    else if (role === "Cashier") go("/cashier");
    else go("/"); // Customer/Guest
  };
  useEffect(() => {
    if (!currentUser) {
      if (["/chef", "/manager", "/admin", "/reservations", "/hq", "/cashier"].includes(route)) go("/");
      return;
    }
    if (currentUser.role === "Chef" && route !== "/chef") go("/chef");
    if (currentUser.role === "Manager" && route !== "/manager") go("/manager");
    if (currentUser.role === "HQManager" && route !== "/hq") go("/hq");
    if (currentUser.role === "Cashier" && route !== "/cashier") go("/cashier");
  }, [currentUser]); // eslint-disable-line

  /** ---------- Auth ---------- */
  async function signUp() {
    const name = signupForm.name.trim();
    const email = signupForm.email.trim().toLowerCase();
    const password = signupForm.password;
    if (!name || !email || !password) return alert("All fields required");
    try {
      const r = await fetch(`${API}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!r.ok) throw new Error(await r.text());
      alert("Account created! You can log in now.");
      setSignupForm({ name: "", email: "", password: "" });
      go("/"); // back to header login
    } catch (e) {
      console.error(e);
      alert("Sign up failed (email taken or server down).");
    }
  }

  async function login() {
    const { email, password } = loginForm;
    try {
      const r = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) throw new Error(await r.text());

      // Accept either {token, user:{...}} OR just the user object
      const data = await r.json();
      const token = data?.token;
      const rawUser = data?.user ?? data;
      const normalizedUser = {
        ...rawUser,
        role: normalizeRole(rawUser.role),
        branch: titleBranch(rawUser.branch),
      };

      if (token) setToken(token);
      saveUser(normalizedUser);
      setCurrentUser(normalizedUser);
      setLoginForm({ email: "", password: "" });
      gotoRoleHome(normalizedUser.role);
    } catch (e) {
      console.error(e);
      alert("Invalid email or password.");
    }
  }
  function logout() {
    setCurrentUser(null);
    setToken("");
    saveUser(null);
    go("/");
  }

  /** ---------- Cart ---------- */
  function addToCart(id) {
    setCart((p) => {
      const it = p.find((x) => x.itemId === id);
      return it ? p.map((x) => (x.itemId === id ? { ...x, qty: Math.min(99, x.qty + 1) } : x)) : [...p, { itemId: id, qty: 1 }];
    });
  }
  function changeQty(id, d) {
    setCart((p) => p.map((x) => (x.itemId === id ? { ...x, qty: Math.max(1, x.qty + d) } : x)));
  }
  function removeFromCart(id) {
    setCart((p) => p.filter((x) => x.itemId !== id));
  }

  /** ---------- Orders ---------- */
  async function placeOrder() {
    if (!currentUser) return alert("Login first");
    if (currentUser.role !== "Customer") return alert("Only customers can place orders.");
    if (cart.length === 0) return alert("Empty cart");

    const items = detailedCart.map((d) => ({ itemId: d.itemId, qty: d.qty, price: d.price }));
    const total = cartTotal;
    const userId = currentUser?.id ?? 1;

    try {
      const o = await jpost(`${API}/orders`, {
        userId,
        branch: checkoutBranch,
        items,
        total,
        status: "Placed",
      });
      setOrders((p) => [o, ...p]);
      setCart([]);
      alert("Order placed!");
    } catch (e) {
      console.error(e);
      alert("Backend not running?");
    }
  }

  /** ---------- Reservations ---------- */
  async function submitReservation() {
    if (!currentUser || currentUser.role !== "Customer") {
      return alert("Please log in as a Customer to make reservations.");
    }
    let { branch, name, email, party, datetime } = resForm;
    if (datetime && !/\d{2}:\d{2}/.test(datetime)) datetime = `${datetime}T19:00`; // default time
    if (!branch || !name.trim() || !email.trim() || !datetime) {
      return alert("Please fill branch, name, email, and date & time");
    }
    try {
      const r = await jpost(`${API}/reservations`, {
        branch,
        name,
        email,
        party_size: Number(party),
        datetime,
      });
      setReservations((p) => [r, ...p]);
      setResForm({ branch: "Uptown", name: "", email: "", party: 2, datetime: "" });
      alert("Reservation submitted");
    } catch (e) {
      console.error(e);
      alert("Reservation failed. Is the backend running?");
    }
  }

  /** ---------- UI helpers ---------- */
  function Section({ title, children, actions }) {
    return (
      <div className="bg-white rounded-2xl shadow p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          {actions}
        </div>
        {children}
      </div>
    );
  }
  const Pill = ({ children }) => (
    <span className="inline-block px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs">{children}</span>
  );

  /** NEW: Layout shell to keep pages centered */
  function Shell({ children }) {
    return <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>;
  }

  /** ---------- Screens ---------- */

  function HomeScreen() {
    const showReserveCTA = currentUser?.role === "Customer";
    return (
      <div>
        {/* HERO */}
        <section className="home-hero">
          <div className="text-center text-white px-4">
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">STEAKHOUSE</h1>
            <p className="mt-4 text-lg md:text-2xl">
              A taste of <b>steak</b> and sophistication, served with a side of class.
            </p>
            {showReserveCTA ? (
              <div className="mt-6">
                <button
                  onClick={() => go("/reservations")}
                  className="px-6 py-3 rounded-xl bg-white/90 text-black hover:bg-white"
                >
                  Make a Reservation
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {/* MENU below hero */}
        <Section title="Menu" actions={<span id="menu" />}>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {menu.map((m) => (
              <div key={m.id} className="border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-sm text-gray-500">{m.category}</div>
                  </div>
                  <div className="font-semibold">{currency(m.price)}</div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`text-xs ${m.isAvailable ? "text-green-600" : "text-red-600"}`}>
                    {m.isAvailable ? "Available" : "Unavailable"}
                  </span>
                  <button
                    disabled={!m.isAvailable}
                    onClick={() => addToCart(m.id)}
                    className={`px-3 py-1 rounded-lg text-sm ${
                      m.isAvailable ? "bg-black text-white" : "bg-gray-300 text-gray-600 cursor-not-allowed"
                    }`}
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Cart" actions={<div className="text-sm">Total: <b>{currency(cartTotal)}</b></div>}>
          {detailedCart.length === 0 ? (
            <div className="text-gray-500">Your cart is empty.</div>
          ) : (
            <div>
              {detailedCart.map((it) => (
                <div key={it.itemId} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div>
                    <div className="font-medium">{it.name}</div>
                    <div className="text-sm text-gray-500">
                      {currency(it.price)} × {it.qty}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-2 py-1 border rounded" onClick={() => changeQty(it.itemId, -1)}>
                      -
                    </button>
                    <span className="w-6 text-center">{it.qty}</span>
                    <button className="px-2 py-1 border rounded" onClick={() => changeQty(it.itemId, 1)}>
                      +
                    </button>
                    <button className="px-2 py-1 border rounded" onClick={() => removeFromCart(it.itemId)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <div className="mt-4 flex items-center gap-3">
                <select
                  value={checkoutBranch}
                  onChange={(e) => setCheckoutBranch(e.target.value)}
                  className="border rounded-lg px-3 py-2"
                >
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <button onClick={placeOrder} className="px-4 py-2 rounded-lg bg-black text-white">
                  Confirm Order (Login required)
                </button>
              </div>
            </div>
          )}
        </Section>
      </div>
    );
  }

  /** ---------- Reservations screen (for Customers) ---------- */
  function ReservationsScreen() {
    if (!currentUser || currentUser.role !== "Customer") {
      return <div className="text-gray-500">Please log in as a Customer to make reservations.</div>;
    }
    return (
      <Section title="Make a Reservation">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">Branch</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={resForm.branch}
              onChange={(e) => setResForm({ ...resForm, branch: e.target.value })}
            >
              {BRANCHES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Name</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={resForm.name}
              onChange={(e) => setResForm({ ...resForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={resForm.email}
              onChange={(e) => setResForm({ ...resForm, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Party Size</label>
            <input
              type="number"
              min={1}
              className="w-full border rounded-lg px-3 py-2"
              value={resForm.party}
              onChange={(e) => setResForm({ ...resForm, party: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Date & Time</label>
            <input
              type="datetime-local"
              className="w-full border rounded-lg px-3 py-2"
              value={resForm.datetime}
              onChange={(e) => setResForm({ ...resForm, datetime: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4">
          <button onClick={submitReservation} className="px-4 py-2 rounded-lg bg-black text-white">
            Submit Reservation
          </button>
        </div>
      </Section>
    );
  }

  /** ---------- Manager screen (branch-scoped) ---------- */
  function ManagerScreen() {
    const isManager = userRole === "Manager";
    const isAdminLike = userRole === "Admin" || userRole === "HQManager";
    if (!isManager && !isAdminLike) return <div className="text-gray-500">Login as Manager / HQ / Admin to view.</div>;

    const [viewBranch, setViewBranch] = React.useState(isManager ? currentUser?.branch : BRANCHES[0]);
    const activeBranch = isManager ? currentUser?.branch : viewBranch;

    useEffect(() => {
      if (isAdminLike) {
        const hash = window.location.hash.split("#")[1];
        if (hash && BRANCHES.includes(hash)) setViewBranch(hash);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdminLike]);

    const [revMode, setRevMode] = React.useState("completed");
    const month = new Date().toISOString().slice(0, 7);

    const branchOrdersAll = orders.filter((o) => o.branch === activeBranch);
    const branchOrders =
      revMode === "completed"
        ? branchOrdersAll.filter((o) => o.status === "Completed" && isThisMonth(o.updated_at))
        : branchOrdersAll.filter((o) => touchesThisMonth(o));
    const todayOrders =
      revMode === "completed"
        ? branchOrdersAll.filter((o) => o.status === "Completed" && sameYMD(o.updated_at))
        : branchOrdersAll.filter((o) => touchesToday(o));
    const todayRev = todayOrders.reduce((s, o) => s + Number(o.total), 0);

    const branchMonthExp = expenses.filter((e) => e.month === month && e.branch === activeBranch);
    const expTotal = branchMonthExp.reduce((s, e) => s + Number(e.amount), 0);
    const revTotal = branchOrders.reduce((s, o) => s + Number(o.total), 0);

    const branchReservations = reservations.filter((r) => r.branch === activeBranch);
    const unavailableCount = menu.filter((m) => !m.isAvailable).length;

    const Toggle = (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500">Revenue mode:</span>
        <div className="inline-flex rounded-full border overflow-hidden">
          <button
            onClick={() => setRevMode("completed")}
            className={`px-3 py-1 ${revMode === "completed" ? "bg-black text-white" : "bg-white"}`}
          >
            Completed
          </button>
          <button
            onClick={() => setRevMode("all")}
            className={`px-3 py-1 border-l ${revMode === "all" ? "bg-black text-white" : "bg-white"}`}
          >
            All orders
          </button>
        </div>
      </div>
    );

    const branchSwitcher = isAdminLike ? (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Branch:</span>
        <select
          value={viewBranch}
          onChange={(e) => setViewBranch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {BRANCHES.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>
    ) : null;

    return (
      <div>
        <Section title={`Reports — ${activeBranch}`} actions={<div className="flex items-center gap-4">{Toggle}{branchSwitcher}</div>}>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="border rounded-xl p-4">
              <div className="text-sm text-gray-500">Today Revenue ({revMode === "completed" ? "Completed" : "All"})</div>
              <div className="text-2xl font-bold">{currency(todayRev)}</div>
            </div>
            <div className="border rounded-xl p-4">
              <div className="font-semibold mb-1">This Month (Revenue)</div>
              <div className="text-xl">{currency(revTotal)}</div>
            </div>
            <div className="border rounded-xl p-4">
              <div className="font-semibold mb-1">This Month (Expenses)</div>
              <div className="text-xl">{currency(expTotal)}</div>
            </div>
          </div>
        </Section>

        <Section
          title="Menu Availability (Read-only)"
          actions={
            <span className={`text-xs px-3 py-1 rounded-full ${unavailableCount ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
              {unavailableCount ? `${unavailableCount} items unavailable` : "All items available"}
            </span>
          }
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-2">Item</th>
                <th>Category</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {menu.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-2">{m.name}</td>
                  <td>{m.category}</td>
                  <td>{currency(m.price)}</td>
                  <td>
                    <span className={`px-2 py-1 rounded-full text-xs ${m.isAvailable ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {m.isAvailable ? "Available" : "Unavailable"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Suppliers">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-2">Name</th>
                <th>Category</th>
                <th>Phones</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="py-2">{s.name}</td>
                  <td>{s.category}</td>
                  <td>{s.phones}</td>
                  <td>{s.address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Branch Financial Summary">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="border rounded-xl p-4">
              <div className="font-semibold">{activeBranch}</div>
              <div className="mt-2 text-sm">Revenue: <b>{currency(revTotal)}</b></div>
              <div className="text-sm">Expenses: <b>{currency(expTotal)}</b></div>
              <div className="text-sm">Profit: <b>{currency(revTotal - expTotal)}</b></div>
            </div>
          </div>
        </Section>

        <Section title={`Reservations — ${activeBranch}`}>
          {branchReservations.length === 0 ? (
            <div className="text-gray-500">No reservations yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Branch</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Party</th>
                  <th>Date & Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {branchReservations.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2">{r.branch}</td>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>{r.party_size}</td>
                    <td>{new Date(r.datetime).toLocaleString()}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    );
  }

  /** ---------- HQ Manager screen ---------- */
  function HqManagerScreen() {
    if (userRole !== "HQManager") return <div className="text-gray-500">Login as HQ Manager to view this page.</div>;

    const month = new Date().toISOString().slice(0, 7);

    const isThisMonthLocal = (dt) => {
      if (!dt) return false;
      const d = new Date(dt), n = new Date();
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
    };

    const completedThisMonth = orders.filter((o) => o.status === "Completed" && isThisMonthLocal(o.updated_at));

    const revByBranch = new Map(BRANCHES.map((b) => [b, 0]));
    completedThisMonth.forEach((o) => revByBranch.set(o.branch, (revByBranch.get(o.branch) || 0) + Number(o.total)));

    const expByBranch = new Map(BRANCHES.map((b) => [b, 0]));
    expenses.filter((e) => e.month === month).forEach((e) => {
      expByBranch.set(e.branch, (expByBranch.get(e.branch) || 0) + Number(e.amount));
    });

    const unavailableCount = menu.filter((m) => !m.isAvailable).length;

    return (
      <div>
        <Section
          title="Headquarter — Overview"
          actions={
            <div className="flex gap-2">
              {BRANCHES.map((b) => (
                <button key={b} className="px-3 py-1 rounded-full border text-sm" onClick={() => go("/manager#" + b)}>
                  Go to {b} manager
                </button>
              ))}
            </div>
          }
        >
          <div className="grid md:grid-cols-3 gap-4">
            {BRANCHES.map((b) => {
              const rev = revByBranch.get(b) || 0;
              const exp = expByBranch.get(b) || 0;
              return (
                <div key={b} className="border rounded-xl p-4">
                  <div className="font-semibold">{b}</div>
                  <div className="mt-2 text-sm">Revenue (Completed): <b>{currency(rev)}</b></div>
                  <div className="text-sm">Expenses: <b>{currency(exp)}</b></div>
                  <div className="text-sm">Profit: <b>{currency(rev - exp)}</b></div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          title="Menu Availability (Read-only)"
          actions={
            <span className={`text-xs px-3 py-1 rounded-full ${unavailableCount ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
              {unavailableCount ? `${unavailableCount} items unavailable` : "All items available"}
            </span>
          }
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-2">Item</th>
                <th>Category</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {menu.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-2">{m.name}</td>
                  <td>{m.category}</td>
                  <td>{currency(m.price)}</td>
                  <td>
                    <span className={`px-2 py-1 rounded-full text-xs ${m.isAvailable ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {m.isAvailable ? "Available" : "Unavailable"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Suppliers">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-2">Name</th>
                <th>Category</th>
                <th>Phones</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="py-2">{s.name}</td>
                  <td>{s.category}</td>
                  <td>{s.phones}</td>
                  <td>{s.address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="All Branches — Financial Analysis">
          <div className="grid md:grid-cols-3 gap-4">
            {BRANCHES.map((b) => {
              const rev = revByBranch.get(b) || 0;
              const exp = expByBranch.get(b) || 0;
              return (
                <div key={b} className="border rounded-xl p-4">
                  <div className="font-semibold">{b}</div>
                  <div className="mt-2 text-sm">Revenue: <b>{currency(rev)}</b></div>
                  <div className="text-sm">Expenses: <b>{currency(exp)}</b></div>
                  <div className="text-sm">Profit: <b>{currency(rev - exp)}</b></div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="All Reservations">
          {reservations.length === 0 ? (
            <div className="text-gray-500">No reservations yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Branch</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Party</th>
                  <th>Date & Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2">{r.branch}</td>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>{r.party_size}</td>
                    <td>{new Date(r.datetime).toLocaleString()}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    );
  }

  /** ---------- Chef screen (Admin can view; only Chef can toggle) ---------- */
  function ChefScreen() {
    const isChefLike = userRole === "Chef" || userRole === "Admin";
    if (!isChefLike) return <div className="text-gray-500">Login as a Chef or Admin to view this page.</div>;

    const [viewBranch, setViewBranch] = React.useState(userRole === "Chef" ? currentUser.branch : BRANCHES[0]);
    const activeBranch = userRole === "Chef" ? currentUser.branch : viewBranch;

    const myOrders = orders.filter((o) => o.branch === activeBranch);

    async function updateOrderStatus(orderId, next) {
      try {
        const r = await fetch(`${API}/orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ status: next }),
        });
        if (!r.ok) throw new Error(await r.text());
        const updated = await r.json();
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      } catch (e) {
        console.error(e);
        alert("Failed to update status");
      }
    }

    const canEditAvailability = userRole === "Chef";
    async function setAvailability(itemId, next) {
      try {
        const r = await fetch(`${API}/menu/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ isAvailable: next }),
        });
        if (!r.ok) throw new Error(await r.text());
        const updated = await r.json();
        setMenu((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      } catch (e) {
        console.error(e);
        alert("Failed to update availability");
      }
    }

    const branchSelectorForAdmin =
      userRole === "Admin" ? (
        <select
          value={viewBranch}
          onChange={(e) => setViewBranch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {BRANCHES.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      ) : null;

    return (
      <div>
        <Section title="Menu Availability" actions={!canEditAvailability ? <span className="text-xs text-gray-500">(view only)</span> : null}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-2">Item</th>
                <th>Category</th>
                <th>Price</th>
                <th>Status</th>
                <th className="w-40">Action</th>
              </tr>
            </thead>
            <tbody>
              {menu.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-2">{m.name}</td>
                  <td>{m.category}</td>
                  <td>{currency(m.price)}</td>
                  <td>
                    <span className={`px-2 py-1 rounded-full text-xs ${m.isAvailable ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {m.isAvailable ? "Available" : "Unavailable"}
                    </span>
                  </td>
                  <td>
                    {canEditAvailability ? (
                      m.isAvailable ? (
                        <button className="px-3 py-1 border rounded" onClick={() => setAvailability(m.id, false)}>
                          Set Unavailable
                        </button>
                      ) : (
                        <button className="px-3 py-1 border rounded" onClick={() => setAvailability(m.id, true)}>
                          Set Available
                        </button>
                      )
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title={`Chef Orders — ${activeBranch}`} actions={branchSelectorForAdmin}>
          {myOrders.length === 0 ? (
            <div className="text-gray-500">No orders yet for this branch.</div>
          ) : (
            <div className="space-y-3">
              {myOrders.map((o) => (
                <div key={o.id} className="border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">Order {o.id}</div>
                      <div className="text-sm text-gray-500">
                        {o.created_at ? new Date(o.created_at).toLocaleString() : "—"}
                      </div>
                    </div>
                    <Pill>{o.status}</Pill>
                  </div>

                  <div className="mt-2 text-sm text-gray-600">Items are stored server-side (order_items).</div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="font-semibold">Total: {currency(o.total)}</div>
                    <div className="space-x-2">
                      {o.status === "Placed" && (
                        <button className="px-3 py-1 border rounded" onClick={() => updateOrderStatus(o.id, "Be prepared")}>
                          Mark "Be prepared"
                        </button>
                      )}
                      {o.status === "Be prepared" && (
                        <button className="px-3 py-1 border rounded" onClick={() => updateOrderStatus(o.id, "Ready")}>
                          Mark Ready
                        </button>
                      )}
                      {o.status === "Ready" && (
                        <button className="px-3 py-1 border rounded" onClick={() => updateOrderStatus(o.id, "Completed")}>
                          Complete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    );
  }

  /** ---------- Cashier screen ---------- */
  function CashierScreen() {
    if (userRole !== "Cashier") return <div className="text-gray-500">Login as Cashier to view.</div>;
    const activeBranch = currentUser?.branch;
    const [revMode, setRevMode] = useState("completed");

    const allBranchOrders = orders.filter((o) => o.branch === activeBranch);
    const monthOrdersCompleted = allBranchOrders.filter(
      (o) => o.status === "Completed" && isThisMonth(o.updated_at)
    );
    const monthOrdersAll = allBranchOrders.filter((o) => (isThisMonth(o.updated_at) || isThisMonth(o.created_at)));
    const monthOrders = revMode === "completed" ? monthOrdersCompleted : monthOrdersAll;

    const todayOrdersCompleted = allBranchOrders.filter(
      (o) => o.status === "Completed" && sameYMD(o.updated_at)
    );
    const todayOrdersAll = allBranchOrders.filter((o) => touchesToday(o));
    const todayOrders = revMode === "completed" ? todayOrdersCompleted : todayOrdersAll;

    const todayRevenue = todayOrders.reduce((s, o) => s + Number(o.total), 0);
    const monthRevenue = monthOrders.reduce((s, o) => s + Number(o.total), 0);

    return (
      <div>
        <Section
          title={`Cashier — ${activeBranch}`}
          actions={
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Revenue mode:</span>
              <div className="inline-flex rounded-full border overflow-hidden">
                <button onClick={() => setRevMode("completed")} className={`px-3 py-1 ${revMode === "completed" ? "bg-black text-white" : "bg-white"}`}>Completed</button>
                <button onClick={() => setRevMode("all")} className={`px-3 py-1 border-l ${revMode === "all" ? "bg-black text-white" : "bg-white"}`}>All orders</button>
              </div>
            </div>
          }
        >
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border rounded-xl p-4">
              <div className="text-sm text-gray-500">Today’s revenue ({revMode})</div>
              <div className="text-2xl font-bold">{currency(todayRevenue)}</div>
            </div>
            <div className="border rounded-xl p-4">
              <div className="text-sm text-gray-500">This month ({revMode})</div>
              <div className="text-2xl font-bold">{currency(monthRevenue)}</div>
            </div>
          </div>
        </Section>

        <Section title="Orders today">
          {todayOrders.length === 0 ? (
            <div className="text-gray-500">No orders today.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Order</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {todayOrders.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="py-2">#{o.id}</td>
                    <td>{o.status}</td>
                    <td>{currency(o.total)}</td>
                    <td>{new Date(o.updated_at || o.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    );
  }

  /** ---------- Admin screen ---------- */
  function AdminScreen() {
    if (userRole !== "Admin") return <div className="text-gray-500">Login as Admin to view this page.</div>;
    return (
      <div>
        <Section title="Users & Roles">
          {dbUsers.length === 0 ? (
            <div className="text-gray-500">No users found.</div>
          ) : (
            <ul className="text-sm list-disc list-inside">
              {dbUsers.map((u) => (
                <li key={u.id}>
                  {u.name} — {u.email} — {u.role} {u.branch ? `@ ${u.branch}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Reservations">
          {reservations.length === 0 ? (
            <div className="text-gray-500">No reservations yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Branch</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Party</th>
                  <th>Date & Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2">{r.branch}</td>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>{r.party_size}</td>
                    <td>{new Date(r.datetime).toLocaleString()}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    );
  }

  /** ---------- Signup screen (Customers only) ---------- */
  function SignupScreen() {
    return (
      <Section title="Create your account">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">Full name</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={signupForm.name}
              onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded-lg px-3 py-2"
              value={signupForm.email}
              onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
              placeholder="you@example.com"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Password</label>
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2"
              value={signupForm.password}
              onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
              placeholder="•••••"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={signUp} className="px-4 py-2 rounded-lg bg-black text-white">Sign up</button>
          <button onClick={() => go("/")} className="px-4 py-2 rounded-lg border">Back</button>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Note: only Customers sign up here. Staff (Admin/Managers/Chefs/Cashiers) are created by the Admin.
        </p>
      </Section>
    );
  }

  /** ---------- Render ---------- */
  // Top nav items depend on role
  let navLinks = [];
  if (userRole === "Admin") {
    navLinks = [
      ["/", "Home"],
      ["/chef", "Chef"],
      ["/manager", "Managers"],
      ["/admin", "Admin"],
    ];
  } else if (userRole === "HQManager") {
    navLinks = [
      ["/", "Home"],
      ["/hq", "HQ Manager"],
      ["/manager", "Branch Managers"],
    ];
  } else if (userRole === "Chef") {
    navLinks = [["/chef", "Chef"]];
  } else if (userRole === "Manager") {
    navLinks = [["/manager", "My Branch"]];
  } else if (userRole === "Cashier") {
    navLinks = [["/cashier", "Cashier"]];
  } else {
    // Guest / Customer
    navLinks = [["/", "Home"]];
    if (userRole === "Customer") navLinks.push(["/reservations", "Reservations"]);
  }

  // Route -> Screen
  let Screen = null;
  switch (route.split("#")[0]) {
    case "/":
      Screen = <HomeScreen />;
      break;
    case "/signup":
      Screen = <SignupScreen />;
      break;
    case "/reservations":
      Screen = <ReservationsScreen />;
      break;
    case "/chef":
      Screen = <ChefScreen />;
      break;
    case "/manager":
      Screen = <ManagerScreen />;
      break;
    case "/hq":
      Screen = <HqManagerScreen />;
      break;
    case "/cashier":
      Screen = <CashierScreen />;
      break;
    case "/admin":
      Screen = <AdminScreen />;
      break;
    default:
      Screen = <div className="text-gray-500">Not found.</div>;
  }

  // Show steak background on all pages EXCEPT Home
  const routeBase = route.split("#")[0];
  const showBg = ["/admin", "/manager", "/hq", "/cashier", "/chef", "/reservations"].includes(routeBase);

  return (
    <div className={showBg ? "bg-steak min-h-screen" : "min-h-screen bg-gray-100"}>
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xl font-extrabold tracking-tight">Steakhouse MIS</div>
            <div className="text-xs text-gray-500">(Fullstack)</div>
          </div>

          <div className="flex items-center gap-3">
            {!currentUser ? (
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  placeholder="email"
                  className="border rounded-lg px-3 py-2 text-sm"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                />
                <input
                  type="password"
                  placeholder="password"
                  className="border rounded-lg px-3 py-2 text-sm"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
                <button onClick={login} className="px-3 py-2 rounded-lg bg-black text-white text-sm">
                  Login
                </button>
                <button onClick={() => go("/signup")} className="px-3 py-2 rounded-lg border text-sm">
                  Sign up
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="inline-block px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs mr-2">
                  {currentUser.role}
                  {currentUser.branch ? ` @ ${currentUser.branch}` : ""}
                </span>
                <div className="text-sm">
                  Hi, <b>{currentUser.name}</b>
                </div>
                <button onClick={logout} className="px-3 py-2 rounded-lg border text-sm">
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* role-aware nav */}
        <div className="max-w-6xl mx-auto px-4 pb-3">
          <div className="mb-2 flex flex-wrap items-center">
            {navLinks.map(([path, label]) => (
              <button
                key={path}
                onClick={() => go(path)}
                className={`px-4 py-2 rounded-full text-sm mr-2 mb-2 border ${
                  route.split("#")[0] === path ? "bg-black text-white" : "bg-white hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Centered page wrapper */}
      <Shell>{Screen}</Shell>
    </div>
  );
}
