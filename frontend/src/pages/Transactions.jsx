
import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import { apiRequest, getToken, getUser } from "../services/api";

function Transactions() {
  const user = getUser();
  const canReturn = ["Admin", "Librarian"].includes(user?.role);

  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const loadTransactions = useCallback(async () => {
    try {
      const data = await apiRequest("/transactions");
      setTransactions(
        Array.isArray(data) ? data : data.transactions || []
      );
      setError("");
    } catch (err) {
      setError(err.message || "Could not load transactions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken() || !user) {
      window.location.href = "/login";
      return;
    }

    loadTransactions();
  }, [loadTransactions, user]);

  async function returnBook(transaction) {
    setError("");
    setMessage("");

    try {
      await apiRequest(`/transactions/${transaction.id}/return`, {
        method: "POST",
      });

      setMessage("Book returned successfully.");
      await loadTransactions();
    } catch (err) {
      setError(err.message || "Could not record the return.");
    }
  }

  return (
    <Layout title="Transactions">
      <div className="page-intro">
        <div>
          <h2>Borrowing History</h2>
          <p>Track borrowed books and returned books.</p>
        </div>
        <button className="secondary-button" onClick={loadTransactions}>
          Refresh
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}
      {message && <p className="success-message">{message}</p>}

      <section className="panel">
        {loading ? (
          <p>Loading transactions...</p>
        ) : transactions.length === 0 ? (
          <p>No transactions have been recorded yet.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  {canReturn && <th>Member</th>}
                  <th>Book</th>
                  <th>Borrowed Date</th>
                  <th>Returned Date</th>
                  <th>Status</th>
                  {canReturn && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    {canReturn && (
                      <td>
                        {transaction.member_name ||
                          transaction.user_name ||
                          transaction.name ||
                          "Member"}
                      </td>
                    )}
                    <td>
                      {transaction.book_title ||
                        transaction.title ||
                        `Book #${transaction.book_id}`}
                    </td>
                    <td>
                      {transaction.borrowed_at
                        ? new Date(transaction.borrowed_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      {transaction.returned_at
                        ? new Date(transaction.returned_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={
                          transaction.status === "Returned"
                            ? "status-badge returned"
                            : "status-badge borrowed"
                        }
                      >
                        {transaction.status || "Borrowed"}
                      </span>
                    </td>
                    {canReturn && (
                      <td>
                        {transaction.status === "Borrowed" ? (
                          <button onClick={() => returnBook(transaction)}>
                            Record Return
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Layout>
  );
}

export default Transactions;
