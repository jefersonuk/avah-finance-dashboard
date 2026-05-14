import express from "express";
import cors from "cors";
import { apiRouter } from "./routes/api.js";
import { initStore } from "./db/store.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", apiRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error && typeof error === "object" && "issues" in error) {
    res.status(400).json({ message: "Erro de validacao", details: (error as any).issues });
    return;
  }

  const message = error instanceof Error ? error.message : "Erro interno";
  res.status(500).json({ message });
});

const port = Number(process.env.PORT ?? 3333);

initStore()
  .then(() => {
    app.listen(port, () => {
      console.log(`AVAH backend iniciado em http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao inicializar estado", error);
    process.exit(1);
  });
