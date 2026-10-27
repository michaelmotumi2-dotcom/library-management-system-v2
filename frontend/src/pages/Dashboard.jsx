
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { apiRequest, getToken, getUser } from "../services/api";

function Dashboard() {
  const navigate = useNavigate();
  const user = getUser();

  const [stats, setStats] = useState(null);
  const [books, setBooks] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken() || !user) {
      navigate("/login");
      return;
    }

    async function loadDashboard() {
      try {
        const [dashboardData, booksData] = await Promise.all([
          apiRequest("/dashboard"),
          apiRequest("/books"),
        ]);

        setStats(dashboardData);
        setBooks(Array.isArray(booksData) ? booksData : booksData.books || []);
      } catch (err) {
        setError(err.message || "Could not load dashboard.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [navigate]);

  return (
    <Layout title="Dashboard">
      <div className="welcome-section">
        <div>
          <p className="eyebrow">LIBRARY OVERVIEW</p>
          <h2>Welcome, {user?.name || "Library User"}</h2>
          <p>Here is an overview of your library system.</p>
        </div>
        <span className="role-badge">{user?.role || "Member"}</span>
      </div>

      {error && <p className="error-message">{error}</p>}

      {loading ? (
        <p>Loading dashboard...</p>
      ) : (
        <>
          <div className="stats-grid">
            <article className="stat-card">
              <p>Total Books</p>
              <h2>{stats?.totalBooks ?? books.length}</h2>
            </article>

            <article className="stat-card">
              <p>Available Copies</p>
              <h2>{stats?.availableBooks ?? books.reduce(
                (total, book) => total + Number(book.available_quantity || 0),
                0
              )}</h2>
            </article>

            <article className="stat-card">
              <p>Active Borrowings</p>
              <h2>{stats?.activeTransactions ?? "—"}</h2>
            </article>

            <article className="stat-card">
              <p>Low Stock Books</p>
              <h2>{stats?.lowStockBooks ?? "—"}</h2>
            </article>
          </div>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Recently Available Books</h2>
                <p>Books currently listed in the system.</p>
              </div>
              <button onClick={() => navigate("/books")}>
                View All Books
              </button>
            </div>

            {books.length === 0 ? (
              <p>No books have been added yet.</p>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Author</th>
                      <th>Genre</th>
                      <th>Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {books.slice(0, 5).map((book) => (
                      <tr key={book.id}>
                        <td>{book.title}</td>
                        <td>{book.author}</td>
                        <td>{book.genre || "—"}</td>
                        <td>{book.available_quantity ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </Layout>
  );
}

export default Dashboard;
