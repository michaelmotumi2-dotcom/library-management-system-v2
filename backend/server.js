
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "library_management_v2",
  waitForConnections: true,
  connectionLimit: 10,
});

const ROLES = ["Admin", "Member", "Librarian"];

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Please log in first." });
  }

  try {
    req.user = jwt.verify(
      header.split(" ")[1],
      process.env.JWT_SECRET
    );
    next();
  } catch {
    return res.status(401).json({
      message: "Your session has expired. Please log in again.",
    });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action.",
      });
    }

    next();
  };
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    membership_id: user.membership_id,
    role: user.role,
    created_at: user.created_at,
    last_login: user.last_login,
  };
}

app.get("/", (req, res) => {
  res.json({ message: "Library Management API is running." });
});

/* AUTHENTICATION */

// Register a new account.
// Members can register without a staff code.
// Admins and Librarians require private codes configured in backend/.env.
app.post(
  "/api/auth/register",
  asyncRoute(async (req, res) => {
    const { name, email, password, role, accessCode } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        message: "Name, email, password and role are required.",
      });
    }

    if (!ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid account role." });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        message: "Password must contain at least 6 characters.",
      });
    }

    if (role === "Admin" &&
        (!process.env.ADMIN_REGISTRATION_CODE ||
         accessCode !== process.env.ADMIN_REGISTRATION_CODE)) {
      return res.status(403).json({
        message: "The Admin registration code is incorrect.",
      });
    }

    if (role === "Librarian" &&
        (!process.env.LIBRARIAN_REGISTRATION_CODE ||
         accessCode !== process.env.LIBRARIAN_REGISTRATION_CODE)) {
      return res.status(403).json({
        message: "The Librarian registration code is incorrect.",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const [existing] = await pool.execute(
      "SELECT id FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const membershipId =
      "LIB" + Date.now().toString().slice(-8);

    const [result] = await pool.execute(
      `INSERT INTO users
       (name, email, membership_id, password, role)
       VALUES (?, ?, ?, ?, ?)`,
      [String(name).trim(), normalizedEmail, membershipId, hashedPassword, role]
    );

    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE id = ?",
      [result.insertId]
    );

    const user = rows[0];

    res.status(201).json({
      message: "Account created successfully.",
      token: createToken(user),
      user: publicUser(user),
    });
  })
);

// Log in.
app.post(
  "/api/auth/login",
  asyncRoute(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE email = ?",
      [String(email).trim().toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        message: "Incorrect email or password.",
      });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.status(401).json({
        message: "Incorrect email or password.",
      });
    }

    await pool.execute(
      "UPDATE users SET last_login = NOW() WHERE id = ?",
      [user.id]
    );

    user.last_login = new Date();

    res.json({
      message: "Login successful.",
      token: createToken(user),
      user: publicUser(user),
    });
  })
);

// Restore the logged-in session.
app.get(
  "/api/auth/me",
  authenticate,
  asyncRoute(async (req, res) => {
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE id = ?",
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Account not found." });
    }

    res.json({ user: publicUser(rows[0]) });
  })
);

/* BOOKS */

// All logged-in users can browse books.
app.get(
  "/api/books",
  authenticate,
  asyncRoute(async (req, res) => {
    const [books] = await pool.execute(
      "SELECT * FROM books ORDER BY title ASC"
    );

    res.json({ books });
  })
);

// Add a book.
app.post(
  "/api/books",
  authenticate,
  allowRoles("Admin", "Librarian"),
  asyncRoute(async (req, res) => {
    const { title, author, isbn, genre, quantity } = req.body;
    const qty = Number(quantity);

    if (!title || !author || !Number.isInteger(qty) || qty < 0) {
      return res.status(400).json({
        message: "Enter a title, author and valid quantity.",
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO books
       (title, author, isbn, genre, quantity, available_quantity)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        String(title).trim(),
        String(author).trim(),
        isbn || null,
        genre || null,
        qty,
        qty,
      ]
    );

    res.status(201).json({
      message: "Book added successfully.",
      id: result.insertId,
    });
  })
);

// Edit a book.
app.put(
  "/api/books/:id",
  authenticate,
  allowRoles("Admin", "Librarian"),
  asyncRoute(async (req, res) => {
    const { title, author, isbn, genre, quantity } = req.body;
    const id = Number(req.params.id);
    const qty = Number(quantity);

    if (!title || !author || !Number.isInteger(qty) || qty < 0) {
      return res.status(400).json({
        message: "Enter a title, author and valid quantity.",
      });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM books WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Book not found." });
    }

    const book = rows[0];
    const borrowed = Number(book.quantity) -
      Number(book.available_quantity);

    if (qty < borrowed) {
      return res.status(400).json({
        message: `At least ${borrowed} copies are currently borrowed.`,
      });
    }

    const available = qty - borrowed;

    await pool.execute(
      `UPDATE books
       SET title = ?, author = ?, isbn = ?, genre = ?,
           quantity = ?, available_quantity = ?
       WHERE id = ?`,
      [
        String(title).trim(),
        String(author).trim(),
        isbn || null,
        genre || null,
        qty,
        available,
        id,
      ]
    );

    res.json({ message: "Book updated successfully." });
  })
);

// Delete a book only if no active loans exist.
app.delete(
  "/api/books/:id",
  authenticate,
  allowRoles("Admin", "Librarian"),
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);

    const [activeLoans] = await pool.execute(
      `SELECT id FROM transactions
       WHERE book_id = ? AND status = 'Borrowed'`,
      [id]
    );

    if (activeLoans.length > 0) {
      return res.status(409).json({
        message: "This book cannot be deleted while copies are borrowed.",
      });
    }

    const [result] = await pool.execute(
      "DELETE FROM books WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Book not found." });
    }

    res.json({ message: "Book deleted successfully." });
  })
);

/* BORROWING AND RETURNS */

// Borrow a book. Members may have up to five active loans.
app.post(
  "/api/transactions/borrow",
  authenticate,
  allowRoles("Member"),
  asyncRoute(async (req, res) => {
    const bookId = Number(req.body.book_id);

    if (!Number.isInteger(bookId) || bookId <= 0) {
      return res.status(400).json({ message: "Invalid book ID." });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [activeLoans] = await connection.execute(
        `SELECT id FROM transactions
         WHERE user_id = ? AND status = 'Borrowed'`,
        [req.user.id]
      );

      if (activeLoans.length >= 5) {
        await connection.rollback();
        return res.status(400).json({
          message: "You can borrow a maximum of five books at a time.",
        });
      }

      const [books] = await connection.execute(
        "SELECT * FROM books WHERE id = ? FOR UPDATE",
        [bookId]
      );

      if (books.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Book not found." });
      }

      if (Number(books[0].available_quantity) < 1) {
        await connection.rollback();
        return res.status(400).json({
          message: "This book is currently unavailable.",
        });
      }

      const [existingLoan] = await connection.execute(
        `SELECT id FROM transactions
         WHERE user_id = ? AND book_id = ? AND status = 'Borrowed'`,
        [req.user.id, bookId]
      );

      if (existingLoan.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          message: "You have already borrowed a copy of this book.",
        });
      }

      await connection.execute(
        `INSERT INTO transactions
         (user_id, book_id, borrowed_at, due_date, status)
         VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 14 DAY), 'Borrowed')`,
        [req.user.id, bookId]
      );

      await connection.execute(
        `UPDATE books
         SET available_quantity = available_quantity - 1
         WHERE id = ?`,
        [bookId]
      );

      await connection.commit();

      res.status(201).json({
        message: "Book borrowed successfully. It is due in 14 days.",
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

// List transactions. Members see their own; staff see all.
app.get(
  "/api/transactions",
  authenticate,
  asyncRoute(async (req, res) => {
    let sql = `
      SELECT
        t.id, t.user_id, t.book_id, t.borrowed_at,
        t.due_date, t.returned_at, t.status,
        u.name AS member_name,
        u.email AS member_email,
        b.title AS book_title,
        b.author AS book_author
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      JOIN books b ON t.book_id = b.id
    `;

    const params = [];

    if (req.user.role === "Member") {
      sql += " WHERE t.user_id = ?";
      params.push(req.user.id);
    } else if (!["Admin", "Librarian"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied." });
    }

    sql += " ORDER BY t.borrowed_at DESC";

    const [transactions] = await pool.execute(sql, params);

    res.json({ transactions });
  })
);

// Return a borrowed book.
app.post(
  "/api/transactions/:id/return",
  authenticate,
  allowRoles("Member", "Admin", "Librarian"),
  asyncRoute(async (req, res) => {
    const transactionId = Number(req.params.id);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.execute(
        "SELECT * FROM transactions WHERE id = ? FOR UPDATE",
        [transactionId]
      );

      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          message: "Transaction not found.",
        });
      }

      const transaction = rows[0];

      if (
        req.user.role === "Member" &&
        Number(transaction.user_id) !== Number(req.user.id)
      ) {
        await connection.rollback();
        return res.status(403).json({
          message: "You can only return books you borrowed.",
        });
      }

      if (transaction.status !== "Borrowed") {
        await connection.rollback();
        return res.status(400).json({
          message: "This book has already been returned.",
        });
      }

      await connection.execute(
        `UPDATE transactions
         SET status = 'Returned', returned_at = NOW()
         WHERE id = ?`,
        [transactionId]
      );

      await connection.execute(
        `UPDATE books
         SET available_quantity = available_quantity + 1
         WHERE id = ?`,
        [transaction.book_id]
      );

      await connection.commit();

      res.json({ message: "Book returned successfully." });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

/* ADMIN USER MANAGEMENT */

// Admin views all accounts.
app.get(
  "/api/admin/users",
  authenticate,
  allowRoles("Admin"),
  asyncRoute(async (req, res) => {
    const [users] = await pool.execute(
      `SELECT id, name, email, membership_id, role,
              created_at, last_login
       FROM users
       ORDER BY created_at DESC`
    );

    res.json({ users });
  })
);

// Admin changes a user's role.
app.put(
  "/api/admin/users/:id/role",
  authenticate,
  allowRoles("Admin"),
  asyncRoute(async (req, res) => {
    const userId = Number(req.params.id);
    const { role } = req.body;

    if (!ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid role." });
    }

    if (userId === Number(req.user.id)) {
      return res.status(400).json({
        message: "You cannot change your own role.",
      });
    }

    const [result] = await pool.execute(
      "UPDATE users SET role = ? WHERE id = ?",
      [role, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({ message: "User role updated successfully." });
  })
);

// Admin deletes an account only if it has no transaction history.
app.delete(
  "/api/admin/users/:id",
  authenticate,
  allowRoles("Admin"),
  asyncRoute(async (req, res) => {
    const userId = Number(req.params.id);

    if (userId === Number(req.user.id)) {
      return res.status(400).json({
        message: "You cannot delete your own account.",
      });
    }

    const [transactions] = await pool.execute(
      "SELECT id FROM transactions WHERE user_id = ? LIMIT 1",
      [userId]
    );

    if (transactions.length > 0) {
      return res.status(409).json({
        message: "This user has borrowing history and cannot be deleted.",
      });
    }

    const [result] = await pool.execute(
      "DELETE FROM users WHERE id = ?",
      [userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({ message: "User deleted successfully." });
  })
);

/* DASHBOARD SUMMARY */

app.get(
  "/api/dashboard",
  authenticate,
  asyncRoute(async (req, res) => {
    const [bookCount] = await pool.execute(
      "SELECT COUNT(*) AS total FROM books"
    );

    const [availableCount] = await pool.execute(
      "SELECT COALESCE(SUM(available_quantity), 0) AS total FROM books"
    );

    const [loanCount] = await pool.execute(
      "SELECT COUNT(*) AS total FROM transactions WHERE status = 'Borrowed'"
    );

    const result = {
      totalBooks: bookCount[0].total,
      availableCopies: availableCount[0].total,
      activeLoans: loanCount[0].total,
    };

    if (req.user.role === "Admin") {
      const [userCount] = await pool.execute(
        "SELECT COUNT(*) AS total FROM users"
      );
      result.totalUsers = userCount[0].total;
    }

    res.json({ dashboard: result });
  })
);

/* ERROR HANDLING */

app.use((err, req, res, next) => {
  console.error(err);

  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      message: "That email or ISBN is already registered.",
    });
  }

  res.status(500).json({
    message: "A server error occurred. Check the backend terminal.",
  });
});

async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log("Connected to MySQL successfully.");

    app.listen(PORT, () => {
      console.log(`Backend running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Could not connect to MySQL:", error.message);
    process.exit(1);
  }
}

startServer();

