import type { Prisma } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";
import { consumerRepository } from "../repository/consumers.repository.js";
import { fetchCep } from "../../../infra/cep/viacep.js";
import { formatZipCode } from "../../../utils/format.js";
import { createLogger } from "../../../infra/logger";

const log = createLogger("consumers");

type TxClient = Prisma.TransactionClient;

export const consumersService = {
  async getProfile(id: string) {
    return consumerRepository.findById(id);
  },

  async updateProfile(
    id: string,
    data: Parameters<typeof consumerRepository.update>[1]
  ) {
    log.info({ consumerId: id }, "Profile updated");
    return consumerRepository.update(id, data);
  },

  async listAddresses(consumerId: string) {
    return consumerRepository.findAddresses(consumerId);
  },

  async createAddress(
    consumerId: string,
    data: {
      label?: string;
      zip_code: string;
      street: string;
      number: string;
      complement?: string;
      neighborhood: string;
      city: string;
      state: string;
      is_default: boolean;
    }
  ) {
    const cleanZipCode = data.zip_code.replace(/\D/g, "");
    const formattedZipCode = formatZipCode(cleanZipCode);

    const prisma = getPrisma();
    return prisma.$transaction(async (tx: TxClient) => {
      const coverage = await consumerRepository.findZoneCoverage(
        [cleanZipCode, formattedZipCode],
        tx
      );

      if (!coverage) {
        return { code: "NO_COVERAGE" as const };
      }

      // O primeiro endereço já nasce como principal; senão o app abre sem
      // endereço selecionado logo depois do cadastro (C-01).
      const isFirst = (await consumerRepository.countActiveAddresses(consumerId, tx)) === 0;
      const isDefault = data.is_default || isFirst;

      if (isDefault) {
        await consumerRepository.clearDefaultAddresses(consumerId, tx);
      }

      const address = await consumerRepository.createAddress(
        {
          consumer_id: consumerId,
          label: data.label?.trim() || null,
          zip_code: formattedZipCode,
          street: data.street,
          number: data.number,
          complement: data.complement || null,
          neighborhood: data.neighborhood,
          city: data.city,
          state: data.state,
          zone_id: coverage.zone_id,
          is_default: isDefault,
        },
        tx
      );

      log.info({ consumerId, addressId: address.id, zipCode: formattedZipCode }, "Address created");
      return { address };
    });
  },

  /**
   * Edita apelido, número, complemento ou marca como principal. Rua e CEP não
   * mudam aqui: pedidos antigos apontam para este endereço, então trocar de
   * local é cadastrar outro e excluir este.
   */
  async updateAddress(
    consumerId: string,
    addressId: string,
    data: { label?: string | null; number?: string; complement?: string | null; is_default?: true }
  ) {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx: TxClient) => {
      const current = await consumerRepository.findAddressOwnedBy(addressId, consumerId, tx);
      if (!current) return null;

      if (data.is_default === true) {
        await consumerRepository.clearDefaultAddresses(consumerId, tx);
      }

      const patch: Parameters<typeof consumerRepository.updateAddress>[1] = {};
      if (data.label !== undefined) patch.label = data.label?.trim() || null;
      if (data.number !== undefined) patch.number = data.number.trim();
      if (data.complement !== undefined) patch.complement = data.complement?.trim() || null;
      // Só dá para marcar como principal; sempre existe um principal.
      if (data.is_default === true) patch.is_default = true;

      const address = await consumerRepository.updateAddress(addressId, patch, tx);
      log.info({ consumerId, addressId }, "Address updated");
      return address;
    });
  },

  /** Exclusão lógica: pedidos e assinaturas antigos continuam apontando para o endereço. */
  async archiveAddress(consumerId: string, addressId: string) {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx: TxClient) => {
      const current = await consumerRepository.findAddressOwnedBy(addressId, consumerId, tx);
      if (!current) return false;

      await consumerRepository.archiveAddress(addressId, tx);

      if (current.is_default) {
        const next = await consumerRepository.findLatestActiveAddress(consumerId, tx);
        if (next) await consumerRepository.updateAddress(next.id, { is_default: true }, tx);
      }

      log.info({ consumerId, addressId }, "Address archived");
      return true;
    });
  },

  async lookupCep(cep: string) {
    return fetchCep(cep);
  },
};
