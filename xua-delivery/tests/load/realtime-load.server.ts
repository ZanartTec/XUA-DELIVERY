/**
 * Uma "instância da API" do teste de carga: só o servidor HTTP + o gateway
 * Socket.IO REAL (mesma autenticação, mesmas salas, adapter Redis). Roda num
 * processo filho para que a CPU medida seja só a do servidor.
 *
 * Fala com o processo pai por IPC:
 *  - envia { type: "ready", port }
 *  - recebe { type: "publish", room, event, payload } → publica pelo
 *    realtimePublisher (caminho de um serviço da API)
 *  - recebe { type: "stats" } → responde { type: "stats", cpuMs, wallMs, sockets }
 *  - recebe { type: "close" } → encerra
 */
import http from "node:http";

/* eslint-disable @typescript-eslint/no-require-imports */
const { createSocketGateway, closeSocketGateway } =
  require("../../apps/api/src/infra/socket/gateway") as typeof import("../../apps/api/src/infra/socket/gateway");
const { realtimePublisher } =
  require("../../apps/api/src/infra/realtime/publisher") as typeof import("../../apps/api/src/infra/realtime/publisher");
/* eslint-enable @typescript-eslint/no-require-imports */

const server = http.createServer();
const io = createSocketGateway(server);

let cpuStart = process.cpuUsage();
let wallStart = Date.now();

server.listen(0, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  process.send?.({ type: "ready", port });
});

process.on("message", async (msg: { type: string; room?: string; event?: string; payload?: unknown }) => {
  if (msg.type === "publish" && msg.room && msg.event) {
    realtimePublisher.publish(msg.room, msg.event as never, msg.payload as never);
  } else if (msg.type === "reset-stats") {
    cpuStart = process.cpuUsage();
    wallStart = Date.now();
  } else if (msg.type === "stats") {
    const cpu = process.cpuUsage(cpuStart);
    process.send?.({
      type: "stats",
      cpuMs: (cpu.user + cpu.system) / 1000,
      wallMs: Date.now() - wallStart,
      sockets: io.engine.clientsCount,
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  } else if (msg.type === "close") {
    await closeSocketGateway(io);
    server.close();
    process.exit(0);
  }
});
