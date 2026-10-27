
import { NavLink, useNavigate } from "react-router-dom";

function Layout({ title, children }) {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("libraryToken");
    localStorage.removeItem("libraryUser");
    navigate("/login");
  }

  const links = [
    { label: "Dashboard", path: "/dashboard" },
    { label: "Books", path: "/books" },
    { label: "Transactions", path: "/transactions" },
    { label: "User Management", path: "/users" },
  ];

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <h2>LibraCore</h2>
          <p>Library Management System</p>
        </div>

        <nav className="navigation">
          {links.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <button className="logout-button" onClick={logout}>
          Sign Out
        </button>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p>Library Portal / {title}</p>
            <h1>{title}</h1>
          </div>
        </header>

        <section className="page-content">{children}</section>
      </main>
    </div>
  );
}

export default Layout;
