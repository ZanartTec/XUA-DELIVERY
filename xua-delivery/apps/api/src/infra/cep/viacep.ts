interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

export interface CepResult {
  zip_code: string;
  street: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

/**
 * Consulta a API ViaCEP para autocompletar dados de endereço.
 */
export async function fetchCep(cep: string): Promise<CepResult | null> {
  const cleanCep = cep.replace(/\D/g, "");

  if (cleanCep.length !== 8) {
    return null;
  }

  const response = await fetch(
    `https://viacep.com.br/ws/${encodeURIComponent(cleanCep)}/json/`
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as ViaCepResponse;

  if (data.erro) {
    return null;
  }

  return {
    zip_code: data.cep,
    street: data.logradouro,
    complement: data.complemento,
    neighborhood: data.bairro,
    city: data.localidade,
    state: data.uf,
  };
}
