
import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import { apiRequest, getToken, getUser } from "../services/api";

function Books() {
  const user = getUser();
  const canManage = ["Admin", "Librarian"].includes(user?.role);

  const [books, setBooks] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    author: "",
    genre: "",
    isbn: "",
    quantity: "1",
  });

  const loadBooks = useCallback(async () => {
    try {
      const data = await apiRequest("/books");
      setBooks(Array.isArray(data) ? data : data.books || []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load books.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken() || !user) {
      window.location.href = "/login";
      return;
    }

    loadBooks();
  }, [loadBooks, user]);

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function resetForm() {
    setForm({
      title: "",
      author: "",
      genre: "",
      isbn: "",
      quantity: "1",
    });
    setEditingId(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity),
      };

      if (editingId !== null) {
        await apiRequest(`/books/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setMessage("Book updated successfully.");
      } else {
        await apiRequest("/books", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("Book added successfully.");
      }

      resetForm();
      await loadBooks();
    } catch (err) {
      setError(err.message || "Could not save the book.");
    }
  }

  function startEditing(book) {
    setEditingId(book.id);
    setForm({
      title: book.title || "",
      author: book.author || "",
      genre: book.genre || "",
      isbn: book.isbn || "",
      quantity: String(book.quantity ?? 1),
    });
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteBook(book) {
    if (!window.confirm(`Remove "${book.title}" from the library?`)) return;

    setError("");
    setMessage("");

    try {
      await apiRequest(`/books/${book.id}`, { method: "DELETE" });
      setMessage("Book removed successfully.");
      await loadBooks();
    } catch (err) {
      setError(err.message || "Could not remove the book.");
    }
  }

  async function borrowBook(book) {
    setError("");
    setMessage("");

    try {
      await apiRequest("/transactions/borrow", {
        method: "POST",
        body: JSON.stringify({ book_id: book.id }),
      });
      setMessage(`You borrowed "${book.title}" successfully.`);
      await loadBooks();
    } catch (err) {
      setError(err.message || "Could not borrow the book.");
    }
  }

  return (
    <Layout title="Book Management">
      <div className="page-intro">
        <div>
          <h2>Library Collection</h2>
          <p>Browse books and manage the library collection.</p>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}
      {message && <p className="success-message">{message}</p>}

      {canManage && (
        <section className="panel">
          <h2>{editingId !== null ? "Edit Book" : "Add New Book"}</h2>

          <form className="book-form" onSubmit={handleSubmit}>
            <label>
              Book title
              <input
                name="title"
                value={form.title}
                onChange={updateField}
                required
              />
            </label>

            <label>
              Author
              <input
                name="author"
                value={form.author}
                onChange={updateField}
                required
              />
            </label>

            <label>
              Genre
              <input
                name="genre"
                value={form.genre}
                onChange={updateField}
              />
            </label>

            <label>
              ISBN
              <input
                name="isbn"
                value={form.isbn}
                onChange={updateField}
              />
            </label>

            <label>
              Total quantity
              <input
                name="quantity"
                type="number"
                min="0"
                value={form.quantity}
                onChange={updateField}
                required
              />
            </label>

            <div className="form-actions">
              <button type="submit">
                {editingId !== null ? "Save Changes" : "Add Book"}
              </button>

              {editingId !== null && (
                <button type="button" className="secondary-button" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>All Books</h2>
            <p>{books.length} book titles in the collection</p>
          </div>
          <button className="secondary-button" onClick={loadBooks}>
            Refresh
          </button>
        </div>

        {loading ? (
          <p>Loading books...</p>
        ) : books.length === 0 ? (
          <p>No books found. An administrator or librarian can add books.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Genre</th>
                  <th>Available</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {books.map((book) => (
                  <tr key={book.id}>
                    <td>{book.title}</td>
                    <td>{book.author}</td>
                    <td>{book.genre || "—"}</td>
                    <td>{book.available_quantity ?? 0}</td>
                    <td>
                      <div className="table-actions">
                        {canManage ? (
                          <>
                            <button
                              className="secondary-button"
                              onClick={() => startEditing(book)}
                            >
                              Edit
                            </button>
                            <button
                              className="danger-button"
                              onClick={() => deleteBook(book)}
                            >
                              Remove
                            </button>
                          </>
                        ) : (
                          <button
                            disabled={Number(book.available_quantity) < 1}
                            onClick={() => borrowBook(book)}
                          >
                            {Number(book.available_quantity) < 1
                              ? "Unavailable"
                              : "Borrow"}
                          </button>
                        )}
                      </div>
                    </td>
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

export default Books;
