
import { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:5000/api";
const roles = ["Admin", "Member", "Librarian"];

async function api(path, options = {}, token = "") {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

export default function App() {
  const [page, setPage] = useState("portals");
  const [portal, setPortal] = useState("");
  const [mode, setMode] = useState("login");

  const [token, setToken] = useState(
    () => localStorage.getItem("bookbridge_token") || ""
  );

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("bookbridge_user") || "null");
    } catch {
      return null;
    }
  });

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [auth, setAuth] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });

  const [books, setBooks] = useState([]);
  const [loans, setLoans] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");

  const [editId, setEditId] = useState(null);
  const [book, setBook] = useState({
    title: "",
    author: "",
    isbn: "",
    genre: "",
    quantity: 1,
  });

  const loggedIn = Boolean(token && user);
  const role = user?.role || "";

  function clear() {
    setError("");
    setNotice("");
  }

  function go(nextPage) {
    clear();
    setPage(nextPage);
  }

  function choose(nextPortal) {
    setPortal(nextPortal);
    setMode("login");

    setAuth({
      name: "",
      email: "",
      password: "",
      confirm: "",
    });

    go("auth");
  }

  function acceptLogin(data) {
    if (!data.token || !data.user) {
      throw new Error("The server did not return a valid login session.");
    }

    if (data.user.role !== portal) {
      throw new Error(
        `This account is registered as ${data.user.role}. Choose that portal instead.`
      );
    }

    localStorage.setItem("bookbridge_token", data.token);
    localStorage.setItem("bookbridge_user", JSON.stringify(data.user));

    setToken(data.token);
    setUser(data.user);
    setPage("dashboard");
    setNotice(`Welcome, ${data.user.name}.`);
  }

  async function register(event) {
    event.preventDefault();
    clear();

    if (auth.password !== auth.confirm) {
      setError("Passwords do not match.");
      return;
    }

    if (auth.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);

    try {
      const body = {
        name: auth.name.trim(),
        email: auth.email.trim().toLowerCase(),
        password: auth.password,
        role: portal,
      };

      await api("/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      });

      setNotice("Account created. Log in to continue.");
      setMode("login");

      setAuth({
        name: "",
        email: auth.email.trim().toLowerCase(),
        password: "",
        confirm: "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function login(event) {
    event.preventDefault();
    clear();
    setBusy(true);

    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: auth.email.trim().toLowerCase(),
          password: auth.password,
        }),
      });

      acceptLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("bookbridge_token");
    localStorage.removeItem("bookbridge_user");

    setToken("");
    setUser(null);
    setPortal("");
    setBooks([]);
    setLoans([]);
    setUsers([]);
    resetBook();
    go("portals");
  }

  async function loadBooks() {
    const data = await api(
      `/books?search=${encodeURIComponent(search)}`,
      {},
      token
    );

    let result = data.books || [];
    const term = search.trim().toLowerCase();

    if (term) {
      result = result.filter((item) =>
        [item.title, item.author, item.isbn, item.genre]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      );
    }

    setBooks(result);
  }

  async function loadLoans() {
    const data = await api("/transactions", {}, token);
    setLoans(data.transactions || []);
  }

  async function loadUsers() {
    if (role !== "Admin") return;

    const data = await api("/admin/users", {}, token);
    setUsers(data.users || []);
  }

  async function refresh() {
    if (!loggedIn) return;

    setBusy(true);
    clear();

    try {
      await Promise.all([
        loadBooks(),
        loadLoans(),
        ...(role === "Admin" ? [loadUsers()] : []),
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Restore the saved login session when the page is reopened.
  useEffect(() => {
    if (!token) return;

    api("/auth/me", {}, token)
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        setPortal(currentUser.role);

        localStorage.setItem(
          "bookbridge_user",
          JSON.stringify(currentUser)
        );

        setPage("dashboard");
      })
      .catch(() => {
        localStorage.removeItem("bookbridge_token");
        localStorage.removeItem("bookbridge_user");

        setToken("");
        setUser(null);
        setPage("portals");
      });
  }, []);

  useEffect(() => {
    if (loggedIn && page === "dashboard") {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, page]);

  async function borrow(id) {
    setBusy(true);
    clear();

    try {
      const data = await api(
        "/transactions/borrow",
        {
          method: "POST",
          body: JSON.stringify({ book_id: id }),
        },
        token
      );

      setNotice(data.message);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function returnLoan(id) {
    setBusy(true);
    clear();

    try {
      const data = await api(
        `/transactions/${id}/return`,
        { method: "POST" },
        token
      );

      setNotice(data.message);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function editBook(item) {
    setEditId(item.id);

    setBook({
      title: item.title || "",
      author: item.author || "",
      isbn: item.isbn || "",
      genre: item.genre || "",
      quantity: Number(item.quantity || 0),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetBook() {
    setEditId(null);

    setBook({
      title: "",
      author: "",
      isbn: "",
      genre: "",
      quantity: 1,
    });
  }

  async function saveBook(event) {
    event.preventDefault();
    setBusy(true);
    clear();

    try {
      const data = await api(
        editId ? `/books/${editId}` : "/books",
        {
          method: editId ? "PUT" : "POST",
          body: JSON.stringify({
            ...book,
            quantity: Number(book.quantity),
          }),
        },
        token
      );

      setNotice(data.message);
      resetBook();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteBook(id) {
    if (!window.confirm("Delete this book?")) return;

    setBusy(true);
    clear();

    try {
      const data = await api(
        `/books/${id}`,
        { method: "DELETE" },
        token
      );

      setNotice(data.message);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(account, nextRole) {
    if (Number(account.id) === Number(user.id)) {
      setError("You cannot change your own role.");
      return;
    }

    setBusy(true);
    clear();

    try {
      const data = await api(
        `/admin/users/${account.id}/role`,
        {
          method: "PUT",
          body: JSON.stringify({ role: nextRole }),
        },
        token
      );

      setNotice(data.message);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(account) {
    if (Number(account.id) === Number(user.id)) {
      setError("You cannot remove your own account.");
      return;
    }

    if (!window.confirm(`Remove ${account.name}'s account?`)) return;

    setBusy(true);
    clear();

    try {
      const data = await api(
        `/admin/users/${account.id}`,
        { method: "DELETE" },
        token
      );

      setNotice(data.message);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const alerts = (
    <>
      {error && (
        <div className="alert error">
          <span>{error}</span>
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      {notice && (
        <div className="alert success">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>Dismiss</button>
        </div>
      )}
    </>
  );

  function portals() {
    const items = [
      {
        role: "Admin",
        mark: "A",
        text: "Manage accounts, roles and library activity.",
      },
      {
        role: "Member",
        mark: "M",
        text: "Browse books, borrow available copies and return books.",
      },
      {
        role: "Librarian",
        mark: "L",
        text: "Add, edit and manage the book catalogue.",
      },
    ];

    return (
      <main className="portal-page">
        <section className="welcome">
          <p className="eyebrow">BOOKBRIDGE LIBRARY</p>
          <h1>Welcome to your library</h1>
          <p>Choose your portal to continue.</p>
        </section>

        <section className="portal-grid">
          {items.map((item) => (
            <article className="portal-card" key={item.role}>
              <div className="portal-mark">{item.mark}</div>
              <h2>{item.role} Portal</h2>
              <p>{item.text}</p>

              <button
                className="primary full"
                onClick={() => choose(item.role)}
              >
                Enter {item.role} Portal
              </button>
            </article>
          ))}
        </section>
      </main>
    );
  }

  function authPage() {
    const registering = mode === "register";

    return (
      <main className="auth-page">
        <section className="auth-card">
          <button className="back-link" onClick={() => go("portals")}>
            Back to portals
          </button>

          <p className="eyebrow">{portal} PORTAL</p>
          <h1>{registering ? "Create your account" : "Log in"}</h1>

          <p className="muted">
            {registering
              ? `Create a ${portal} account.`
              : `Log in to your ${portal} account.`}
          </p>

          <div className="tabs">
            <button
              className={!registering ? "tab active" : "tab"}
              onClick={() => {
                clear();
                setMode("login");
              }}
            >
              Log In
            </button>

            <button
              className={registering ? "tab active" : "tab"}
              onClick={() => {
                clear();
                setMode("register");
              }}
            >
              Create Account
            </button>
          </div>

          <form className="form" onSubmit={registering ? register : login}>
            {registering && (
              <>
                <label htmlFor="register-name">Full name</label>
                <input
                  id="register-name"
                  required
                  value={auth.name}
                  onChange={(event) =>
                    setAuth({ ...auth, name: event.target.value })
                  }
                  placeholder="Full name"
                />
              </>
            )}

            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={auth.email}
              onChange={(event) =>
                setAuth({ ...auth, email: event.target.value })
              }
              placeholder="you@example.com"
            />

            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={registering ? 8 : undefined}
              autoComplete={registering ? "new-password" : "current-password"}
              value={auth.password}
              onChange={(event) =>
                setAuth({ ...auth, password: event.target.value })
              }
              placeholder={
                registering ? "At least 8 characters" : "Password"
              }
            />

            {registering && (
              <>
                <label htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={auth.confirm}
                  onChange={(event) =>
                    setAuth({ ...auth, confirm: event.target.value })
                  }
                  placeholder="Repeat password"
                />
              </>
            )}

            <button className="primary full" disabled={busy}>
              {busy
                ? "Please wait..."
                : registering
                  ? "Create account"
                  : `Log in to ${portal}`}
            </button>
          </form>
        </section>
      </main>
    );
  }

  function catalogue() {
    return (
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BOOK COLLECTION</p>
            <h2>{role === "Member" ? "Browse books" : "Library catalogue"}</h2>
          </div>

          <form
            className="search"
            onSubmit={(event) => {
              event.preventDefault();
              loadBooks().catch((err) => setError(err.message));
            }}
          >
            <input
              aria-label="Search books"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, author, ISBN..."
            />
            <button className="secondary">Search</button>
          </form>
        </div>

        {!books.length ? (
          <p className="empty">No books found.</p>
        ) : (
          <div className="book-grid">
            {books.map((item) => (
              <article className="book-card" key={item.id}>
                <p className="eyebrow">{item.genre || "LIBRARY BOOK"}</p>
                <h3>{item.title}</h3>
                <p className="muted">
                  By {item.author || "Unknown author"}
                </p>
                <p className="book-meta">
                  ISBN: {item.isbn || "Not provided"}
                </p>
                <p className="book-meta">
                  Available: <strong>{item.available_quantity ?? 0}</strong> /{" "}
                  {item.quantity ?? 0}
                </p>

                <div className="button-row">
                  {role === "Member" && (
                    <button
                      className="primary"
                      disabled={busy || Number(item.available_quantity) < 1}
                      onClick={() => borrow(item.id)}
                    >
                      Borrow
                    </button>
                  )}

                  {role === "Librarian" && (
                    <>
                      <button
                        className="secondary"
                        onClick={() => editBook(item)}
                      >
                        Edit
                      </button>

                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => deleteBook(item.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}

                  {role === "Admin" && (
                    <span className="readonly">Catalogue view</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  function editor() {
    return (
      <section className="panel">
        <p className="eyebrow">CATALOGUE MANAGEMENT</p>
        <h2>{editId ? "Edit book" : "Add a book"}</h2>

        <form className="book-form" onSubmit={saveBook}>
          <div>
            <label htmlFor="book-title">Title</label>
            <input
              id="book-title"
              required
              value={book.title}
              onChange={(event) =>
                setBook({ ...book, title: event.target.value })
              }
            />
          </div>

          <div>
            <label htmlFor="book-author">Author</label>
            <input
              id="book-author"
              required
              value={book.author}
              onChange={(event) =>
                setBook({ ...book, author: event.target.value })
              }
            />
          </div>

          <div>
            <label htmlFor="book-isbn">ISBN</label>
            <input
              id="book-isbn"
              value={book.isbn}
              onChange={(event) =>
                setBook({ ...book, isbn: event.target.value })
              }
            />
          </div>

          <div>
            <label htmlFor="book-genre">Genre</label>
            <input
              id="book-genre"
              value={book.genre}
              onChange={(event) =>
                setBook({ ...book, genre: event.target.value })
              }
            />
          </div>

          <div>
            <label htmlFor="book-quantity">Total copies</label>
            <input
              id="book-quantity"
              type="number"
              min="0"
              step="1"
              required
              value={book.quantity}
              onChange={(event) =>
                setBook({ ...book, quantity: event.target.value })
              }
            />
          </div>

          <div className="form-actions button-row">
            <button className="primary" disabled={busy}>
              {editId ? "Save changes" : "Add book"}
            </button>

            {editId && (
              <button
                type="button"
                className="secondary"
                onClick={resetBook}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
    );
  }

  function transactions() {
    return (
      <section className="panel">
        <p className="eyebrow">BORROWING RECORDS</p>
        <h2>
          {role === "Member"
            ? "My borrowed books"
            : "Library borrowing activity"}
        </h2>

        {!loans.length ? (
          <p className="empty">No borrowing records yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {role !== "Member" && <th>Member</th>}
                  <th>Book</th>
                  <th>Borrowed</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.id}>
                    {role !== "Member" && (
                      <td>{loan.member_name || loan.member_email}</td>
                    )}

                    <td>{loan.book_title || `Book #${loan.book_id}`}</td>
                    <td>
                      {loan.borrowed_at
                        ? String(loan.borrowed_at).slice(0, 10)
                        : "—"}
                    </td>
                    <td>
                      {loan.due_date
                        ? String(loan.due_date).slice(0, 10)
                        : "—"}
                    </td>
                    <td>{loan.status}</td>
                    <td>
                      {String(loan.status).toLowerCase() !== "returned" && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => returnLoan(loan.id)}
                        >
                          Return
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  function adminPanel() {
    return (
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">REGISTERED USERS</p>
            <h2>Manage accounts</h2>
          </div>

          <button
            className="secondary"
            disabled={busy}
            onClick={() => loadUsers().catch((err) => setError(err.message))}
          >
            Refresh
          </button>
        </div>

        {!users.length ? (
          <p className="empty">No users found.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Membership ID</th>
                  <th>Role</th>
                  <th>Last login</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {users.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td>{account.email}</td>
                    <td>{account.membership_id}</td>
                    <td>
                      <select
                        value={account.role}
                        disabled={
                          busy || Number(account.id) === Number(user.id)
                        }
                        onChange={(event) =>
                          changeRole(account, event.target.value)
                        }
                      >
                        {roles.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {account.last_login
                        ? String(account.last_login)
                            .slice(0, 16)
                            .replace("T", " ")
                        : "—"}
                    </td>
                    <td>
                      {Number(account.id) === Number(user.id) ? (
                        "Current account"
                      ) : (
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => removeUser(account)}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  function dashboard() {
    const activeLoans = loans.filter(
      (loan) => String(loan.status).toLowerCase() !== "returned"
    );

    return (
      <main className="dashboard">
        <section className="dashboard-heading">
          <div>
            <p className="eyebrow">{role.toUpperCase()} PORTAL</p>
            <h1>Hello, {user.name}</h1>
            <p className="muted">You are signed in as {role}.</p>
          </div>

          <div className="button-row">
            <button
              className="secondary"
              disabled={busy}
              onClick={refresh}
            >
              Refresh
            </button>

            <button className="danger" onClick={logout}>
              Log out
            </button>
          </div>
        </section>

        <section className="stats">
          <article>
            <span>Catalogue titles</span>
            <strong>{books.length}</strong>
          </article>

          <article>
            <span>
              {role === "Member" ? "My active loans" : "Borrowing records"}
            </span>
            <strong>
              {role === "Member" ? activeLoans.length : loans.length}
            </strong>
          </article>

          {role === "Admin" && (
            <article>
              <span>User accounts</span>
              <strong>{users.length}</strong>
            </article>
          )}
        </section>

        {role === "Librarian" && editor()}
        {catalogue()}
        {transactions()}
        {role === "Admin" && adminPanel()}
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="header">
        <button
          className="brand"
          onClick={() => go(loggedIn ? "dashboard" : "portals")}
        >
          <span className="brand-icon">B</span>
          BookBridge
        </button>

        <div className="header-right">
          {loggedIn ? (
            <>
              <span className="user-chip">
                {user.name}
                <small>{role}</small>
              </span>

              <button className="secondary" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <span className="muted">Library Management System</span>
          )}
        </div>
      </header>

      {alerts}

      {!loggedIn && page === "portals" && portals()}
      {!loggedIn && page === "auth" && authPage()}
      {loggedIn && page === "dashboard" && dashboard()}

      <footer className="footer">
        <span>BookBridge Library Management System</span>
        <span>Read. Borrow. Return.</span>
      </footer>
    </div>
  );
}
