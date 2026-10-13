require("dotenv").config();

const fs = require("fs");

const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    ca: fs.readFileSync(
  process.env.DATABASE_SSL_CA || path.join(__dirname, "prod-ca-2021.crt"),
  "utf8"
),
    rejectUnauthorized: true
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "healthy",
      application: "FleetCloud",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);
    res.status(503).json({
      status: "unhealthy",
      application: "FleetCloud",
      database: "disconnected"
    });
  }
});

app.get("/api/deliveries", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, customer, pickup, destination, driver, status
       FROM public.deliveries
       ORDER BY id`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Could not fetch deliveries:", error.message);
    res.status(500).json({ error: "Could not fetch deliveries." });
  }
});

app.post("/api/deliveries", async (req, res) => {
  const { customer, pickup, destination, driver } = req.body;

  if (![customer, pickup, destination, driver].every(
    value => typeof value === "string" && value.trim()
  )) {
    return res.status(400).json({
      error: "Customer, pickup, destination and driver are required."
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO public.deliveries
         (customer, pickup, destination, driver, status)
       VALUES ($1, $2, $3, $4, 'Pending')
       RETURNING id, customer, pickup, destination, driver, status`,
      [customer.trim(), pickup.trim(), destination.trim(), driver.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Could not create delivery:", error.message);
    res.status(500).json({ error: "Could not create delivery." });
  }
});

app.patch("/api/deliveries/:id/status", async (req, res) => {
  const allowedStatuses = [
    "Pending", "Assigned", "In Transit", "Delivered"
  ];
  const id = Number(req.params.id);
  const { status } = req.body;

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid delivery ID." });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid delivery status." });
  }

  try {
    const result = await pool.query(
      `UPDATE public.deliveries
       SET status = $1
       WHERE id = $2
       RETURNING id, customer, pickup, destination, driver, status`,
      [status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Delivery not found." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Could not update delivery:", error.message);
    res.status(500).json({ error: "Could not update delivery." });
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'Assigned')::int AS assigned,
        COUNT(*) FILTER (WHERE status = 'In Transit')::int AS "inTransit",
        COUNT(*) FILTER (WHERE status = 'Delivered')::int AS delivered
      FROM public.deliveries
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Could not fetch dashboard:", error.message);
    res.status(500).json({ error: "Could not fetch dashboard." });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FleetCloud running on port ${PORT}`);
});