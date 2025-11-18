import express from "express";
import mysql from "mysql2";
import cors from "cors";
import dotenv from "dotenv";

// Cargar variables de entorno (.env)
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Conexión MySQL (Railway)
const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
});

db.connect(err => {
  if (err) {
    console.error("❌ Error conectando a MySQL:", err);
    return;
  }
  console.log("✅ Conectado a MySQL");
});

// ---------- RUTAS ---------- //

// Ruta inicial
app.get("/", (req, res) => {
  res.send("API Vocacional funcionando ✅");
});

// Obtener departamentos
app.get("/departamentos", (req, res) => {
  db.query("SELECT * FROM departamentos", (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result);
  });
});

// Obtener provincias por departamento
app.get("/provincias/:id_departamento", (req, res) => {
  const { id_departamento } = req.params;
  db.query(
    "SELECT * FROM provincias WHERE id_departamento = ?",
    [id_departamento],
    (err, result) => {
      if (err) return res.status(500).json(err);
      res.json(result);
    }
  );
});

// Obtener instituciones por provincia
app.get("/instituciones/:id_provincia", (req, res) => {
  const { id_provincia } = req.params;
  const query = `
    SELECT DISTINCT i.*
    FROM instituciones i
    JOIN sedes s ON i.id_institucion = s.id_institucion
    WHERE s.id_provincia = ?
      AND i.tipo IN ('Universidad', 'Instituto', 'Escuela Policial')
  `;
  db.query(query, [id_provincia], (err, data) => {
    if (err) return res.status(500).json({ error: err });
    res.json(data);
  });
});

// Obtener carreras por institución
app.get("/carreras/:id_institucion", (req, res) => {
  const { id_institucion } = req.params;
  const query = `
    SELECT c.id_carrera, c.nombre, c.riasec
    FROM carreras c
    JOIN institucion_carrera ic ON c.id_carrera = ic.id_carrera
    WHERE ic.id_institucion = ?
  `;
  db.query(query, [id_institucion], (err, result) => {
    if (err) return res.status(500).json({ error: err });
    res.json(result);
  });
});

// Match de carreras según dimensiones RIASEC (varias letras)
app.get("/match_riasec", (req, res) => {
  const { code } = req.query;

  if (!code || code.length < 1)
    return res.status(400).json({ error: "Código RIASEC inválido" });

  const letras = code.toUpperCase().split("");

  const query = `
    (
      SELECT c.nombre AS nombre_carrera, c.riasec, i.nombre AS nombre_institucion, i.tipo
      FROM carreras c
      JOIN institucion_carrera ic ON c.id_carrera = ic.id_carrera
      JOIN instituciones i ON ic.id_institucion = i.id_institucion
      WHERE i.tipo = 'Universidad'
      ORDER BY
        (
          (c.riasec LIKE CONCAT('%', ?, '%')) +
          (c.riasec LIKE CONCAT('%', ?, '%')) +
          (c.riasec LIKE CONCAT('%', ?, '%'))
        ) DESC,
        c.nombre
      LIMIT 5
    )
    UNION
    (
      SELECT c.nombre AS nombre_carrera, c.riasec, i.nombre AS nombre_institucion, i.tipo
      FROM carreras c
      JOIN institucion_carrera ic ON c.id_carrera = ic.id_carrera
      JOIN instituciones i ON ic.id_institucion = i.id_institucion
      WHERE i.tipo = 'Instituto'
      ORDER BY
        (
          (c.riasec LIKE CONCAT('%', ?, '%')) +
          (c.riasec LIKE CONCAT('%', ?, '%')) +
          (c.riasec LIKE CONCAT('%', ?, '%'))
        ) DESC,
        c.nombre
      LIMIT 5
    );
  `;

  const params = [...letras, ...letras];

  db.query(query, params, (err, data) => {
    if (err) return res.status(500).json({ error: err });
    res.json(data);
  });
});

// Match por dimensión dominante
app.get("/match/:dimension", async (req, res) => {
  const dimension = req.params.dimension.toUpperCase();

  const dimensionesValidas = ["R", "I", "A", "S", "E", "C"];
  if (!dimensionesValidas.includes(dimension))
    return res.status(400).json({ error: "Dimensión RIASEC inválida" });

  try {
    const sugerencias = await obtenerSugerenciasPorDimension(dimension);
    res.json(sugerencias);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Función que obtiene sugerencias según dimensión
function obtenerSugerenciasPorDimension(dimension) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT c.nombre AS nombre_carrera, i.nombre AS nombre_institucion
      FROM carreras c
      JOIN institucion_carrera ic ON c.id_carrera = ic.id_carrera
      JOIN instituciones i ON ic.id_institucion = i.id_institucion
      WHERE c.riasec = ?
      ORDER BY c.nombre
    `;
    db.query(query, [dimension], (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

// Iniciar servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor activo en http://0.0.0.0:${PORT}`);
});
