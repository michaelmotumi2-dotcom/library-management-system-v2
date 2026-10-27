
import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import { apiRequest, getToken, getUser } from "../services/api";

function Users() {
  const user = getUser();
  const isAdmin = user?.role === "Admin";

  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Member",
  });

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    try {
      const data = await apiRequest("/users");
      setUsers(Array.isArray(data) ? data : data.users || []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!getToken() || !user) {
      window.location.href = "/login";
      return;
    }

    loadUsers();
  }, [loadUsers, user]);

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function createUser(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const data = await apiRequest("/users", {
        method: "POST",
        body: JSON.stringify(form),
      });

      setMessage(data.message || "User created successfully.");
      setForm({
        name: "",
        email: "",
        password: "",
        role: "Member",
      });

      await loadUsers();
    } catch (err) {
      setError(err.message || "Could not create user.");
    }
  }

  async function deleteUser(selectedUser) {
    if (
      !window.confirm(
        `Are you sure you want to remove ${selectedUser.name}?`
      )
    ) {
      return;
    }

    setError("");
    setMessage("");

    try {
      await apiRequest(`/users/${selectedUser.id}`, {
        method: "DELETE",
      });

      setMessage("User removed successfully.");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Could not remove user.");
    }
  }

  if (!isAdmin) {
    return (
      <Layout title="User Management">
        <section className="panel">
          <h2>Access restricted</h2>
          <p>Only administrators can manage user accounts.</p>
        </section>
      </Layout>
    );
  }

  return (
    <Layout title="User Management">
      <div className="page-intro">
        <div>
          <h2>Manage Library Users</h2>
          <p>Create accounts and manage system access.</p>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}
      {message && <p className="success-message">{message}</p>}

      <section className="panel">
        <h2>Create User Account</h2>

        <form className="book-form" onSubmit={createUser}>
          <label>
            Full name
            <input
              name="name"
              value={form.name}
              onChange={updateField}
              required
            />
          </label>

          <label>
            Email address
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              required
            />
          </label>

          <label>
            Temporary password
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={updateField}
              minLength={8}
              required
            />
          </label>

          <label>
            Role
            <select name="role" value={form.role} onChange={updateField}>
              <option value="Member">Member</option>
              <option value="Librarian">Librarian</option>
              <option value="Admin">Admin</option>
            </select>
          </label>

          <div className="form-actions">
            <button type="submit">Create User</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Registered Users</h2>
            <p>{users.length} accounts</p>
          </div>

          <button className="secondary-button" onClick={loadUsers}>
            Refresh
          </button>
        </div>

        {loading ? (
          <p>Loading users...</p>
        ) : users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Membership ID</th>
                  <th>Role</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {users.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}</td>
                    <td>{account.email}</td>
                    <td>{account.membership_id || "—"}</td>
                    <td>
                      <span className="status-badge">
                        {account.role}
                      </span>
                    </td>
                    <td>
                      <button
                        className="danger-button"
                        onClick={() => deleteUser(account)}
                        disabled={Number(account.id) === Number(user.id)}
                      >
                        {Number(account.id) === Number(user.id)
                          ? "Your Account"
                          : "Remove"}
                      </button>
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

export default Users;
