// Server entry: imports the configured Express app and starts listening.
// Kept separate from app.ts so tests can import `app` without opening a port.
import { app } from "./app.ts";

const PORT = Number(process.env.PORT) || 3100;
app.listen(PORT, () => {
	console.log(`Archery backend listening on http://localhost:${PORT}`);
});
