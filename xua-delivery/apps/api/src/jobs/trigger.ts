async function run() {
  const job = process.argv[2];
  if (!job) {
    console.error("Erro: Nome do job é obrigatório.");
    process.exit(1);
  }

  const apiUrl = process.env.API_URL;
  const secret = process.env.INTERNAL_JOB_SECRET;

  if (!secret) {
    console.error("Erro: INTERNAL_JOB_SECRET não está definido.");
    process.exit(1);
  }

  const url = `${apiUrl}/api/internal/jobs/${job}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Falha no cron ${job}:`, text);
    process.exit(1);
  }

  const json = await response.json();
  console.log(JSON.stringify(json));
}

run().catch((err) => {
  console.error("Erro inesperado ao executar trigger:", err);
  process.exit(1);
});
